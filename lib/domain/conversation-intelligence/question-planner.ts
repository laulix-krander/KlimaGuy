import { findContradictions, getEffectiveClaims } from "./knowledge-state";
import { deriveReadiness } from "./readiness";
import { plannerContextSchema, questionCandidateSchema, type CandidateFeatureClasses, type PlanNextActionResult, type PlannerContext, type QuestionCandidate, type ScoreBreakdown } from "./question-planner-schemas";
import { FEATURE_CLASSES, PLANNER_TARGET, PROGRESSION_BANDS, type FeatureClass, type IneligibilityCode, type PlannerResult, type ProgressionBand } from "./question-planner-types";
import type { KnowledgeClaim } from "./schemas";
import type { PropertyKey } from "./types";
import { assessInformationGain } from "./information-gain";

const CLASS_VALUE: Record<FeatureClass, number> = { none: 0, low: 1, medium: 2, high: 3, critical: 4 };
const ASK_ACTIONS = ["ask_text", "ask_yes_no", "ask_approximate_number"] as const;
const SITE_CHECK_KEYS: readonly PropertyKey[] = ["electrical_supply_known", "line_route_known", "condensate_route_known", "accessibility_known", "outdoor_unit_position_known"];
const ASSUMPTIONS: Partial<Record<PropertyKey, "rough_room_area_for_level_2" | "typical_room_height" | "single_room_mvp">> = { room_area_sqm: "rough_room_area_for_level_2", room_height_m: "typical_room_height", requested_room_count: "single_room_mvp" };
const RULES = {
  room_type: ["ask_text", "text", "ask_room_type"], room_area_sqm: ["ask_approximate_number", "approximate_number", "ask_room_area_approximate"], building_type: ["ask_text", "text", "ask_building_type"], indoor_unit_position_known: ["ask_yes_no", "boolean", "ask_indoor_position_known"], outdoor_unit_position_known: ["ask_yes_no", "boolean", "ask_outdoor_position_known"], line_route_known: ["ask_yes_no", "boolean", "ask_line_route_known"], electrical_supply_known: ["ask_yes_no", "boolean", "ask_electrical_supply_known"], accessibility_known: ["ask_yes_no", "boolean", "ask_accessibility_known"],
} as const;
type RuleKey = keyof typeof RULES;
const BAND_BY_KEY:Record<RuleKey,ProgressionBand>={room_type:"room_context",room_area_sqm:"room_context",building_type:"room_context",indoor_unit_position_known:"placement_context",outdoor_unit_position_known:"placement_context",line_route_known:"installation_context",accessibility_known:"installation_context",electrical_supply_known:"technical_clarification"};
const DEPENDENCIES:Partial<Record<RuleKey,readonly {information_key:PropertyKey;type:"hard"|"progression"|"contextual"}[]>>={
 indoor_unit_position_known:[{information_key:"room_type",type:"progression"},{information_key:"room_area_sqm",type:"contextual"}],
 outdoor_unit_position_known:[{information_key:"building_type",type:"progression"},{information_key:"room_type",type:"contextual"}],
 line_route_known:[{information_key:"indoor_unit_position_known",type:"hard"},{information_key:"outdoor_unit_position_known",type:"hard"}],
 accessibility_known:[{information_key:"indoor_unit_position_known",type:"hard"},{information_key:"outdoor_unit_position_known",type:"contextual"}],
 electrical_supply_known:[{information_key:"line_route_known",type:"progression"}],
};
const hasContext=(context:PlannerContext,key:PropertyKey,_entityId:string):boolean=>getEffectiveClaims(context.knowledge_state).some(c=>c.property_key===key&&!['unknown','contradicted'].includes(c.epistemic_status))||context.information_collection_state.items.some(i=>i.information_key===key&&['answered','resolved'].includes(i.collection_status));
export const progressionBandFor=(key:PropertyKey):ProgressionBand=>BAND_BY_KEY[key as RuleKey]??"technical_clarification";

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
    const dependencies=DEPENDENCIES[need.information_key as RuleKey]??[];
    const hardSatisfied=dependencies.filter(d=>d.type==='hard').every(d=>hasContext(context,d.information_key,need.entity_id));
    const collection=context.information_collection_state.items.find(i=>i.information_key===need.information_key&&i.entity_id===need.entity_id);
    const trigger=context.revisit_triggers.find(t=>t.information_key===need.information_key&&t.entity_id===need.entity_id);
    const exhausted=Boolean(collection&&['customer_does_not_know','customer_cannot_provide','skipped','deferred','requires_additional_evidence'].includes(collection.collection_status));
    const dependencySignature=Object.fromEntries(dependencies.map(dependency=>[dependency.information_key,hasContext(context,dependency.information_key,need.entity_id)?"available":"unavailable"]));
    const gain=assessInformationGain({project_id:context.project_id,conversation_id:context.conversation_id,information_key:need.information_key,entity_type:need.entity_type,entity_id:need.entity_id,knowledge_state_version:context.state_version,collection_state_version:context.information_collection_state.version,attempts,collection_status:collection?.collection_status??"not_asked",last_answer_meaning:collection?.last_answer_meaning,dependency_signature:dependencySignature,last_dependency_signature:collection?.last_dependency_signature,revisit_trigger:trigger?.trigger,available_evidence_channels:{customer_question:true,customer_clarification:need.information_key==="room_area_sqm"||Boolean(trigger),existing_evidence:false,future_photo_request:["indoor_unit_position_known","outdoor_unit_position_known","line_route_known","electrical_supply_known","accessibility_known"].includes(need.information_key),future_document_request:false,assumption:need.can_use_assumption,site_check:need.can_require_site_check,human_review:false}});
    const raw = { candidate_id: idFor(need.information_key, action), project_id: context.project_id, conversation_id: context.conversation_id, based_on_state_version: context.state_version, information_key: need.information_key, entity_type: need.entity_type, entity_id: need.entity_id, action_type: action, answer_type: asks ? rule[1] : undefined, template_key: asks ? rule[2] : undefined, assumption_key: assumptionKey, priority_band: bandFor(need.information_key, contradiction), progression_band:progressionBandFor(need.information_key), feature_classes: baseFeatures(need.information_key, attempts, contradiction), retry_count: attempts, max_retries: 2, dependency_keys: dependencies.filter(d=>d.type==='hard').map(d=>d.information_key),dependencies,dependency_status:hardSatisfied?'satisfied':'not_satisfied',collection_eligibility:exhausted?(gain.revisit_allowed?'revisit_allowed':'blocked'):'eligible',revisit_status:exhausted?(gain.revisit_allowed?'trigger_present':'not_allowed'):'not_required',information_gain_status:gain.gain_status,collection_path:gain.preferred_collection_path,gain_reason_codes:gain.reason_codes,rejection_reasons:[], fallback_paths: need.can_use_assumption ? ["offer_assumption", "present_intermediate_result"] : need.can_require_site_check ? ["mark_requires_site_check", "request_human_review"] : ["present_intermediate_result", "end_collection"], reason_codes: [trigger?'revisit_trigger_present':contradiction ? "contradiction_requires_clarification" : attempts >= 2 ? "retry_limit_fallback" : attempts === 1 ? "retry_simplified" : "missing_for_target"], status: "eligible" };
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
  if ((ASK_ACTIONS as readonly string[]).includes(c.action_type) && !["customer_question","customer_clarification"].includes(c.collection_path)) codes.push("revisit_not_allowed");
  if(c.dependency_status==='not_satisfied'||c.dependency_keys.some(key=>!hasContext(ctx,key,c.entity_id)))codes.push("missing_dependency");
  if(c.dependency_status==='not_satisfied')codes.push('dependency_not_satisfied');
  const collection=ctx.information_collection_state.items.find(i=>i.information_key===c.information_key&&i.entity_id===c.entity_id);
  if(c.collection_eligibility==='blocked'){
    if(collection?.collection_status==='customer_does_not_know')codes.push('customer_does_not_know');
    if(collection?.collection_status==='requires_additional_evidence')codes.push('additional_evidence_required');
    if(collection?.collection_status==='customer_cannot_provide')codes.push('customer_cannot_answer');
    codes.push('revisit_not_allowed');
  }
  const candidateBand=PROGRESSION_BANDS.indexOf(c.progression_band);
  const earlierOpen=ctx.missing_information.some(need=>{
    const band=progressionBandFor(need.information_key);
    if(PROGRESSION_BANDS.indexOf(band)>=candidateBand)return false;
    const item=ctx.information_collection_state.items.find(i=>i.information_key===need.information_key&&i.entity_id===need.entity_id);
    return !item||!['answered','resolved','customer_does_not_know','customer_cannot_provide','skipped','deferred','requires_additional_evidence'].includes(item.collection_status);
  });
  if(earlierOpen)codes.push('earlier_progression_band_open');
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
  return [...candidates].sort((a, b) => PROGRESSION_BANDS.indexOf(a.progression_band)-PROGRESSION_BANDS.indexOf(b.progression_band) || scoreCandidate(b).total - scoreCandidate(a).total || CLASS_VALUE[a.feature_classes.customer_effort] - CLASS_VALUE[b.feature_classes.customer_effort] || CLASS_VALUE[b.feature_classes.answerability] - CLASS_VALUE[a.feature_classes.answerability] || CLASS_VALUE[b.feature_classes.readiness_impact] - CLASS_VALUE[a.feature_classes.readiness_impact] || a.information_key.localeCompare(b.information_key) || a.entity_id.localeCompare(b.entity_id) || a.candidate_id.localeCompare(b.candidate_id));
}

export function planNextAction(contextInput: unknown, output: Readonly<{ decision_id: string; created_at: string }>): PlannerResult<PlanNextActionResult> {
  if (typeof contextInput === "object" && contextInput !== null && "state_version" in contextInput && "knowledge_state" in contextInput && typeof contextInput.knowledge_state === "object" && contextInput.knowledge_state !== null && "state_version" in contextInput.knowledge_state && contextInput.state_version !== contextInput.knowledge_state.state_version) return { success: false, code: "stale_planner_context" };
  const parsed = plannerContextSchema.safeParse(contextInput);
  if (!parsed.success) return { success: false, code: "invalid_planner_context" };
  const context = parsed.data;
  if (context.state_version !== context.knowledge_state.state_version) return { success: false, code: "stale_planner_context" };
  const stop = (stop_reason: "target_readiness_reached" | "no_eligible_customer_action" | "requires_human_review" | "maximum_customer_effort_reached", next_action_type: "present_intermediate_result" | "request_human_review" | "end_collection", reason_codes: readonly ("target_reached" | "customer_effort_break" | "no_eligible_customer_action" | "critical_contradiction" | "safety_conflict" | "customer_requests_binding_price" | "customer_requests_human" | "outside_mvp_domain" | "possible_hazard" | "no_safe_customer_action")[]): PlannerResult<PlanNextActionResult> => ({ success: true, data: { kind: "stop_result", stop: { project_id: context.project_id, conversation_id: context.conversation_id, based_on_state_version: context.state_version, stop_reason, next_action_type, assessment_id: next_action_type === "present_intermediate_result" ? context.intermediate_assessment?.assessment_id : undefined, reason_codes, created_at: output.created_at } } });
  if (context.human_takeover_reason) return stop("requires_human_review", "request_human_review", [context.human_takeover_reason]);
  if (deriveReadiness(context.knowledge_state).readiness_level === PLANNER_TARGET || deriveReadiness(context.knowledge_state).readiness_level === "level_4_offer_draft_ready") return stop("target_readiness_reached", "present_intermediate_result", ["target_reached"]);
  if (context.customer_effort_state.consecutive_technical_questions >= 4) return stop("maximum_customer_effort_reached", context.intermediate_assessment ? "present_intermediate_result" : "end_collection", ["customer_effort_break"]);
  const generated = generateQuestionCandidates(context);
  if (!generated.success) return generated;
  const eligible = generated.data.filter((candidate) => { const result = evaluateCandidateEligibility(candidate, context); return result.success && result.data.eligible; });
  const selected = rankCandidates(eligible)[0];
  if (!selected) return stop("no_eligible_customer_action", "end_collection", ["no_eligible_customer_action"]);
  const templateKey = selected.template_key === "ask_room_area_approximate" && selected.retry_count === 1 ? "ask_room_area_approximate_retry" : selected.template_key;
  const action = { decision_id: output.decision_id, project_id: context.project_id, conversation_id: context.conversation_id, based_on_state_version: context.state_version, selected_candidate_id: selected.candidate_id, action_type: selected.action_type, information_key: selected.information_key, entity_type: selected.entity_type, entity_id: selected.entity_id, answer_contract: selected.answer_type ? { answer_type: selected.answer_type } : undefined, template_key: templateKey, template_version: 1, assumption_key: selected.assumption_key, fallback_paths: selected.fallback_paths, reason_codes: selected.reason_codes, priority_band: selected.priority_band,progression_band:selected.progression_band,dependency_status:selected.dependency_status,collection_eligibility:selected.collection_eligibility,revisit_status:selected.revisit_status,information_gain_status:selected.information_gain_status,collection_path:selected.collection_path,gain_reason_codes:selected.gain_reason_codes, score_breakdown: scoreCandidate(selected), created_at: output.created_at, created_by_actor_class: "system" as const };
  return { success: true, data: { kind: "selected_action", action } };
}

export const FEATURE_CLASS_VALUES: Readonly<Record<(typeof FEATURE_CLASSES)[number], number>> = CLASS_VALUE;
