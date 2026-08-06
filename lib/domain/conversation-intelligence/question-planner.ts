import { findContradictions, getEffectiveClaims } from "./knowledge-state";
import { deriveReadiness } from "./readiness";
import { plannerContextSchema, questionCandidateSchema, type CandidateFeatureClasses, type PlanNextActionResult, type PlannerContext, type QuestionCandidate, type ScoreBreakdown } from "./question-planner-schemas";
import { FEATURE_CLASSES, PLANNER_TARGET, PRIORITY_BANDS, type FeatureClass, type IneligibilityCode, type PlannerResult } from "./question-planner-types";
import type { KnowledgeClaim } from "./schemas";
import type { PropertyKey } from "./types";

const CLASS_VALUE: Record<FeatureClass, number> = { none: 0, low: 1, medium: 2, high: 3, critical: 4 };
const ASK_ACTIONS = ["ask_text", "ask_yes_no", "ask_approximate_number"] as const;
const SITE_CHECK_KEYS: readonly PropertyKey[] = ["electrical_supply_known", "line_route_known", "condensate_route_known", "accessibility_known", "outdoor_unit_position_known"];
const ASSUMPTIONS: Partial<Record<PropertyKey, "rough_room_area_for_level_2" | "typical_room_height" | "single_room_mvp">> = { room_area_sqm: "rough_room_area_for_level_2", room_height_m: "typical_room_height", requested_room_count: "single_room_mvp" };
const RULES = {
  room_type: ["ask_text", "text", "ask_room_type"], room_area_sqm: ["ask_approximate_number", "approximate_number", "ask_room_area_approximate"], building_type: ["ask_text", "text", "ask_building_type"], indoor_unit_position_known: ["ask_yes_no", "boolean", "ask_indoor_position_known"], outdoor_unit_position_known: ["ask_yes_no", "boolean", "ask_outdoor_position_known"], line_route_known: ["ask_yes_no", "boolean", "ask_line_route_known"], electrical_supply_known: ["ask_yes_no", "boolean", "ask_electrical_supply_known"], accessibility_known: ["ask_yes_no", "boolean", "ask_accessibility_known"],
} as const;
type RuleKey = keyof typeof RULES;

const idFor = (key: PropertyKey, action: string): string => {
  const index = (Object.keys(RULES) as RuleKey[]).indexOf(key as RuleKey) + 1;
  const suffix = action === "offer_assumption" ? 90 : action === "mark_requires_site_check" ? 80 : action === "request_human_review" ? 70 : 10;
  return `50000000-0000-4000-8000-${String(index * 100 + suffix).padStart(12, "0")}`;
};
const retryFor = (context: PlannerContext, key: PropertyKey, entityId: string) => context.retry_state.find((retry) => retry.information_key === key && retry.entity_id === entityId);
const currentClaim = (context: PlannerContext, candidate: QuestionCandidate): KnowledgeClaim | undefined => getEffectiveClaims(context.knowledge_state).find((claim) => claim.property_key === candidate.information_key && claim.entity_id === candidate.entity_id);
const baseFeatures = (key: PropertyKey, attempts: number, contradiction: boolean): CandidateFeatureClasses => {
  const installation = ["indoor_unit_position_known", "outdoor_unit_position_known", "line_route_known", "electrical_supply_known", "accessibility_known"].includes(key);
  const sizing = key === "room_area_sqm" || key === "room_type" || key === "building_type";
  const safety = key === "electrical_supply_known" ? "critical" : SITE_CHECK_KEYS.includes(key) ? "high" : "none";
  return { safety_relevance: safety, feasibility_impact: installation ? "high" : sizing ? "medium" : "low", sizing_impact: sizing ? "high" : "none", installation_impact: installation ? "high" : "low", price_risk_impact: installation ? "medium" : "low", readiness_impact: "high", expected_information_gain: contradiction ? "critical" : "high", answerability: key === "electrical_supply_known" || key === "line_route_known" ? "medium" : "high", customer_effort: key === "room_area_sqm" ? "medium" : "low", repetition_penalty: attempts === 0 ? "none" : attempts === 1 ? "medium" : "critical", contradiction_bonus: contradiction ? "critical" : "none", dependency_bonus: "low", assumption_availability_penalty: ASSUMPTIONS[key] ? "medium" : "none", site_check_availability_penalty: SITE_CHECK_KEYS.includes(key) ? "low" : "none" };
};
const bandFor = (key: PropertyKey, contradiction: boolean) => contradiction ? "feasibility" as const : key === "electrical_supply_known" ? "safety" as const : ["indoor_unit_position_known", "outdoor_unit_position_known", "line_route_known"].includes(key) ? "feasibility" as const : "readiness_blocker" as const;

export function canOfferAssumption(key: PropertyKey, context: PlannerContext): boolean {
  if (!ASSUMPTIONS[key]) return false;
  if (key === "room_area_sqm") return deriveReadiness(context.knowledge_state).readiness_level === "level_1_rough_need";
  if (key === "room_height_m") return !getEffectiveClaims(context.knowledge_state).some((claim) => claim.property_key === "roof_floor" && claim.value === true);
  return getEffectiveClaims(context.knowledge_state).some((claim) => claim.property_key === "requested_room_count" && claim.value === 1);
}

export function generateQuestionCandidates(contextInput: unknown): PlannerResult<readonly QuestionCandidate[]> {
  if (typeof contextInput === "object" && contextInput !== null && "state_version" in contextInput && "knowledge_state" in contextInput && typeof contextInput.knowledge_state === "object" && contextInput.knowledge_state !== null && "state_version" in contextInput.knowledge_state && contextInput.state_version !== contextInput.knowledge_state.state_version) return { success: false, code: "stale_planner_context" };
  const parsed = plannerContextSchema.safeParse(contextInput);
  if (!parsed.success) return { success: false, code: "invalid_planner_context" };
  const context = parsed.data;
  if (context.state_version !== context.knowledge_state.state_version) return { success: false, code: "stale_planner_context" };
  const contradictions = new Set(findContradictions(context.knowledge_state).map((item) => item.property_key));
  const candidates = context.missing_information.flatMap((need) => {
    const rule = RULES[need.information_key as RuleKey];
    if (!rule) return [];
    const retry = retryFor(context, need.information_key, need.entity_id);
    if (retry?.last_outcome === "answered") return [];
    const attempts = retry?.attempts ?? 0;
    const contradiction = contradictions.has(need.information_key);
    let action: typeof rule[0] | "offer_assumption" | "mark_requires_site_check" = rule[0];
    let assumptionKey: typeof ASSUMPTIONS[PropertyKey] | undefined;
    if (attempts >= 2 && canOfferAssumption(need.information_key, context)) { action = "offer_assumption"; assumptionKey = ASSUMPTIONS[need.information_key]; }
    else if (attempts >= 2 && SITE_CHECK_KEYS.includes(need.information_key)) action = "mark_requires_site_check";
    const asks = (ASK_ACTIONS as readonly string[]).includes(action);
    const raw = { candidate_id: idFor(need.information_key, action), project_id: context.project_id, conversation_id: context.conversation_id, based_on_state_version: context.state_version, information_key: need.information_key, entity_type: need.entity_type, entity_id: need.entity_id, action_type: action, answer_type: asks ? rule[1] : undefined, template_key: asks ? rule[2] : undefined, assumption_key: assumptionKey, priority_band: bandFor(need.information_key, contradiction), feature_classes: baseFeatures(need.information_key, attempts, contradiction), retry_count: attempts, max_retries: 2, dependency_keys: [], fallback_paths: need.can_use_assumption ? ["offer_assumption", "present_intermediate_result"] : need.can_require_site_check ? ["mark_requires_site_check", "request_human_review"] : ["present_intermediate_result", "end_collection"], reason_codes: [contradiction ? "contradiction_requires_clarification" : attempts >= 2 ? "retry_limit_fallback" : attempts === 1 ? "retry_simplified" : "missing_for_target"], status: "eligible" };
    const candidate = questionCandidateSchema.safeParse(raw);
    return candidate.success ? [candidate.data] : [];
  });
  return { success: true, data: candidates };
}

export function evaluateCandidateEligibility(candidateInput: unknown, contextInput: unknown): PlannerResult<Readonly<{ eligible: boolean; codes: readonly IneligibilityCode[] }>> {
  const candidate = questionCandidateSchema.safeParse(candidateInput);
  if (!candidate.success) return { success: false, code: "invalid_candidate" };
  const context = plannerContextSchema.safeParse(contextInput);
  if (!context.success) return { success: false, code: "invalid_planner_context" };
  const codes: IneligibilityCode[] = [];
  const c = candidate.data; const ctx = context.data;
  if (c.based_on_state_version !== ctx.knowledge_state.state_version || ctx.state_version !== ctx.knowledge_state.state_version) codes.push("stale_state_version");
  const entityExists = c.entity_id === ctx.project_id || ctx.knowledge_state.claims.some((claim) => claim.entity_id === c.entity_id);
  if (!entityExists) codes.push("entity_not_found");
  const claim = currentClaim(ctx, c);
  if (claim && !["unknown", "not_applicable", "contradicted", "requires_site_check"].includes(claim.epistemic_status)) codes.push(claim.epistemic_status === "assumed" ? "assumption_already_active" : "information_already_sufficient");
  if (claim?.epistemic_status === "not_applicable") codes.push("not_applicable");
  if (claim?.epistemic_status === "requires_site_check") codes.push("already_requires_site_check");
  if (c.retry_count >= c.max_retries && (ASK_ACTIONS as readonly string[]).includes(c.action_type)) codes.push("retry_limit_reached");
  const effectiveKeys = new Set(getEffectiveClaims(ctx.knowledge_state).filter((item) => !["unknown", "contradicted"].includes(item.epistemic_status)).map((item) => item.property_key));
  if (c.dependency_keys.some((key) => !effectiveKeys.has(key))) codes.push("missing_dependency");
  if (c.feature_classes.answerability === "none") codes.push("customer_cannot_answer");
  if (ctx.target_readiness_level !== PLANNER_TARGET || !ctx.missing_information.some((need) => need.information_key === c.information_key && need.entity_id === c.entity_id)) codes.push("not_relevant_for_target");
  const contradiction = findContradictions(ctx.knowledge_state).some((item) => item.property_key === c.information_key);
  if (contradiction && !c.reason_codes.includes("contradiction_requires_clarification")) codes.push("contradiction_requires_resolution");
  if (ctx.human_takeover_reason) codes.push("human_takeover_required");
  if (ctx.customer_effort_state.consecutive_technical_questions >= 4 && (ASK_ACTIONS as readonly string[]).includes(c.action_type)) codes.push("customer_effort_limit_reached");
  if (ctx.active_question?.status === "selected") codes.push("active_question_pending");
  return { success: true, data: { eligible: codes.length === 0, codes } };
}

export function scoreCandidate(candidate: QuestionCandidate): ScoreBreakdown {
  const f = candidate.feature_classes;
  const positive = ["safety_relevance", "feasibility_impact", "sizing_impact", "installation_impact", "price_risk_impact", "readiness_impact", "expected_information_gain", "answerability", "contradiction_bonus", "dependency_bonus"] as const;
  const negative = ["customer_effort", "repetition_penalty", "assumption_availability_penalty", "site_check_availability_penalty"] as const;
  const result = Object.fromEntries([...positive.map((key) => [key, CLASS_VALUE[f[key]]]), ...negative.map((key) => [key, -CLASS_VALUE[f[key]]])]) as Omit<ScoreBreakdown, "total">;
  return { ...result, total: Object.values(result).reduce((sum, value) => sum + value, 0) };
}

export function rankCandidates(candidates: readonly QuestionCandidate[]): readonly QuestionCandidate[] {
  return [...candidates].sort((a, b) => PRIORITY_BANDS.indexOf(a.priority_band) - PRIORITY_BANDS.indexOf(b.priority_band) || scoreCandidate(b).total - scoreCandidate(a).total || CLASS_VALUE[a.feature_classes.customer_effort] - CLASS_VALUE[b.feature_classes.customer_effort] || CLASS_VALUE[b.feature_classes.answerability] - CLASS_VALUE[a.feature_classes.answerability] || CLASS_VALUE[b.feature_classes.readiness_impact] - CLASS_VALUE[a.feature_classes.readiness_impact] || a.information_key.localeCompare(b.information_key) || a.entity_id.localeCompare(b.entity_id) || a.candidate_id.localeCompare(b.candidate_id));
}

export function planNextAction(contextInput: unknown, output: Readonly<{ decision_id: string; created_at: string }>): PlannerResult<PlanNextActionResult> {
  if (typeof contextInput === "object" && contextInput !== null && "state_version" in contextInput && "knowledge_state" in contextInput && typeof contextInput.knowledge_state === "object" && contextInput.knowledge_state !== null && "state_version" in contextInput.knowledge_state && contextInput.state_version !== contextInput.knowledge_state.state_version) return { success: false, code: "stale_planner_context" };
  const parsed = plannerContextSchema.safeParse(contextInput);
  if (!parsed.success) return { success: false, code: "invalid_planner_context" };
  const context = parsed.data;
  if (context.state_version !== context.knowledge_state.state_version) return { success: false, code: "stale_planner_context" };
  const stop = (stop_reason: "target_readiness_reached" | "no_eligible_candidate" | "requires_human_review" | "maximum_customer_effort_reached", next_action_type: "present_intermediate_result" | "request_human_review" | "end_collection", reason_codes: readonly ("target_reached" | "customer_effort_break" | "critical_contradiction" | "safety_conflict" | "customer_requests_binding_price" | "customer_requests_human" | "outside_mvp_domain" | "possible_hazard" | "no_safe_customer_action")[]): PlannerResult<PlanNextActionResult> => ({ success: true, data: { kind: "stop_result", stop: { project_id: context.project_id, conversation_id: context.conversation_id, based_on_state_version: context.state_version, stop_reason, next_action_type, assessment_id: next_action_type === "present_intermediate_result" ? context.intermediate_assessment?.assessment_id : undefined, reason_codes, created_at: output.created_at } } });
  if (context.human_takeover_reason) return stop("requires_human_review", "request_human_review", [context.human_takeover_reason]);
  if (deriveReadiness(context.knowledge_state).readiness_level === PLANNER_TARGET || deriveReadiness(context.knowledge_state).readiness_level === "level_4_offer_draft_ready") return stop("target_readiness_reached", "present_intermediate_result", ["target_reached"]);
  if (context.customer_effort_state.consecutive_technical_questions >= 4) return stop("maximum_customer_effort_reached", context.intermediate_assessment ? "present_intermediate_result" : "end_collection", ["customer_effort_break"]);
  const generated = generateQuestionCandidates(context);
  if (!generated.success) return generated;
  const eligible = generated.data.filter((candidate) => { const result = evaluateCandidateEligibility(candidate, context); return result.success && result.data.eligible; });
  const selected = rankCandidates(eligible)[0];
  if (!selected) return stop("no_eligible_candidate", "end_collection", ["customer_effort_break"]);
  const action = { decision_id: output.decision_id, project_id: context.project_id, conversation_id: context.conversation_id, based_on_state_version: context.state_version, selected_candidate_id: selected.candidate_id, action_type: selected.action_type, information_key: selected.information_key, entity_type: selected.entity_type, entity_id: selected.entity_id, answer_contract: selected.answer_type ? { answer_type: selected.answer_type } : undefined, template_key: selected.template_key, assumption_key: selected.assumption_key, fallback_paths: selected.fallback_paths, reason_codes: selected.reason_codes, priority_band: selected.priority_band, score_breakdown: scoreCandidate(selected), created_at: output.created_at, created_by_actor_class: "system" as const };
  return { success: true, data: { kind: "selected_action", action } };
}

export const FEATURE_CLASS_VALUES: Readonly<Record<(typeof FEATURE_CLASSES)[number], number>> = CLASS_VALUE;
