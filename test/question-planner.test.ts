import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ASSUMPTION_KEYS, FEATURE_CLASS_VALUES, PLANNER_ACTION_TYPES, PLANNER_ANSWER_TYPES, SYNTHETIC_IDS, SYNTHETIC_PLANNER_CONTEXTS, SYNTHETIC_PLANNER_IDS, SYNTHETIC_SINGLE_ROOM_STATES, canOfferAssumption, createSyntheticPlannerContext, customerEffortStateSchema, evaluateCandidateEligibility, generateQuestionCandidates, planNextAction, plannerActionTypeSchema, plannerAnswerTypeSchema, plannerContextSchema, plannerStopResultSchema, questionCandidateSchema, rankCandidates, retryStateSchema, scoreCandidate, selectedNextActionSchema, syntheticRetry } from "@/lib/domain/conversation-intelligence";

const clone = <T>(value: T): T => structuredClone(value);
const output = { decision_id: SYNTHETIC_PLANNER_IDS.decision, created_at: SYNTHETIC_PLANNER_IDS.created_at };
const generated = () => { const result = generateQuestionCandidates(SYNTHETIC_PLANNER_CONTEXTS.roomAreaMissing); if (!result.success) throw new Error(result.code); return result.data; };

describe("Question Planner Schemas", () => {
  it("hält Actions und Answers geschlossen und ohne Fotoverträge", () => {
    expect(PLANNER_ACTION_TYPES).toHaveLength(8); expect(PLANNER_ANSWER_TYPES).toHaveLength(5);
    expect(plannerActionTypeSchema.safeParse("request_photo").success).toBe(false); expect(plannerActionTypeSchema.safeParse("ask_choice").success).toBe(false);
    expect(plannerAnswerTypeSchema.safeParse("document").success).toBe(false);
  });
  it("validiert Context, Retry und Effort strikt", () => {
    const context = SYNTHETIC_PLANNER_CONTEXTS.roomAreaMissing;
    expect(plannerContextSchema.safeParse(context).success).toBe(true);
    expect(plannerContextSchema.safeParse({ ...context, target_readiness_level: "level_4_offer_draft_ready" }).success).toBe(false);
    expect(plannerContextSchema.safeParse({ ...context, state_version: 0 }).success).toBe(false);
    expect(plannerContextSchema.safeParse({ ...context, created_at: "heute" }).success).toBe(false);
    expect(plannerContextSchema.safeParse({ ...context, phone: "x" }).success).toBe(false);
    expect(retryStateSchema.safeParse({ information_key: "room_area_sqm", entity_type: "room", entity_id: SYNTHETIC_IDS.room, attempts: 3, last_outcome: "unknown" }).success).toBe(false);
    expect(customerEffortStateSchema.safeParse({ consecutive_technical_questions: -1, unanswered_questions: 0, repeated_questions: 0 }).success).toBe(false);
  });
  it("validiert Candidate, Selected Action und Stop Result", () => {
    const candidate = generated()[0]; expect(questionCandidateSchema.safeParse(candidate).success).toBe(true); expect(questionCandidateSchema.safeParse({ ...candidate, question: "frei" }).success).toBe(false);
    const result = planNextAction(SYNTHETIC_PLANNER_CONTEXTS.roomAreaMissing, output); expect(result.success && result.data.kind).toBe("selected_action");
    if (result.success && result.data.kind === "selected_action") { expect(selectedNextActionSchema.safeParse(result.data.action).success).toBe(true); expect(selectedNextActionSchema.safeParse({ ...result.data.action, decision_id: "x" }).success).toBe(false); }
    const stop = planNextAction(SYNTHETIC_PLANNER_CONTEXTS.targetReached, output); if (stop.success && stop.data.kind === "stop_result") expect(plannerStopResultSchema.safeParse(stop.data.stop).success).toBe(true);
  });
});

describe("Candidate Generation und Retry", () => {
  it("erzeugt kontrollierte Kandidaten für alle MVP-Keys", () => {
    const keys = generated().map((item) => item.information_key);
    expect(keys).toEqual(expect.arrayContaining(["room_area_sqm", "building_type", "indoor_unit_position_known", "outdoor_unit_position_known", "line_route_known", "electrical_supply_known", "accessibility_known"]));
    const roomArea = generated().find((item) => item.information_key === "room_area_sqm"); expect(roomArea).toMatchObject({ action_type: "ask_approximate_number", answer_type: "approximate_number", template_key: "ask_room_area_approximate" });
    expect(JSON.stringify(generated())).not.toMatch(/request_photo|question_text|customer_text/u);
  });
  it("unterscheidet ersten und zweiten Unknown und verhindert dritte Frage", () => {
    const base = SYNTHETIC_PLANNER_CONTEXTS.roomAreaMissing; const need = base.missing_information.find((item) => item.information_key === "room_area_sqm")!;
    const once = createSyntheticPlannerContext(undefined, { retry_state: [syntheticRetry(need.information_key, need.entity_type, need.entity_id, 1, "unknown")] });
    expect(generateQuestionCandidates(once)).toMatchObject({ success: true, data: expect.arrayContaining([expect.objectContaining({ information_key: "room_area_sqm", action_type: "ask_approximate_number", retry_count: 1 })]) });
    const twice = createSyntheticPlannerContext(undefined, { retry_state: [syntheticRetry(need.information_key, need.entity_type, need.entity_id, 2, "unknown")] });
    expect(generateQuestionCandidates(twice)).toMatchObject({ success: true, data: expect.arrayContaining([expect.objectContaining({ information_key: "room_area_sqm", action_type: "offer_assumption", assumption_key: ASSUMPTION_KEYS[0] })]) });
  });
  it.each(["line_route_known", "electrical_supply_known"] as const)("führt %s nach zwei Unknown zum Site Check", (key) => {
    const base = SYNTHETIC_PLANNER_CONTEXTS.roomAreaMissing; const need = base.missing_information.find((item) => item.information_key === key)!;
    const context = createSyntheticPlannerContext(undefined, { retry_state: [syntheticRetry(key, need.entity_type, need.entity_id, 2, "unknown")] });
    expect(generateQuestionCandidates(context)).toMatchObject({ success: true, data: expect.arrayContaining([expect.objectContaining({ information_key: key, action_type: "mark_requires_site_check" })]) });
  });
  it("erzeugt nach answered keinen gleichen Kandidaten und behandelt skip separat", () => {
    const need = SYNTHETIC_PLANNER_CONTEXTS.roomAreaMissing.missing_information.find((item) => item.information_key === "room_area_sqm")!;
    for (const outcome of ["answered", "skipped"] as const) { const context = createSyntheticPlannerContext(undefined, { retry_state: [syntheticRetry(need.information_key, need.entity_type, need.entity_id, 1, outcome)] }); const result = generateQuestionCandidates(context); expect(result.success).toBe(true); if (result.success) expect(result.data.some((item) => item.information_key === need.information_key)).toBe(outcome === "skipped"); }
  });
});

describe("Eligibility, Ranking und Auswahl", () => {
  it("wendet harte Eligibility vor Score an", () => {
    const candidate = generated().find((item) => item.information_key === "room_area_sqm")!; const context = SYNTHETIC_PLANNER_CONTEXTS.roomAreaMissing;
    expect(evaluateCandidateEligibility(candidate, context)).toMatchObject({ success: true, data: { eligible: true, codes: [] } });
    expect(evaluateCandidateEligibility({ ...candidate, retry_count: 2 }, context)).toMatchObject({ success: true, data: { eligible: false, codes: expect.arrayContaining(["retry_limit_reached"]) } });
    expect(evaluateCandidateEligibility({ ...candidate, dependency_keys: ["room_height_m"] }, context)).toMatchObject({ success: true, data: { codes: expect.arrayContaining(["missing_dependency"]) } });
    expect(evaluateCandidateEligibility(candidate, { ...context, active_question: { candidate_id: candidate.candidate_id, based_on_state_version: 1, status: "selected" } })).toMatchObject({ success: true, data: { codes: expect.arrayContaining(["active_question_pending"]) } });
    expect(evaluateCandidateEligibility(candidate, SYNTHETIC_PLANNER_CONTEXTS.safetyTakeover)).toMatchObject({ success: true, data: { codes: expect.arrayContaining(["human_takeover_required"]) } });
  });
  it("nutzt Ganzzahlscore, Bänder und stabilen Tie-Break", () => {
    const candidates = generated(); const area = candidates.find((item) => item.information_key === "room_area_sqm")!; const electrical = candidates.find((item) => item.information_key === "electrical_supply_known")!;
    expect(Number.isInteger(scoreCandidate(area).total)).toBe(true); expect(FEATURE_CLASS_VALUES).toEqual({ none: 0, low: 1, medium: 2, high: 3, critical: 4 });
    expect(rankCandidates([area, electrical])[0].progression_band).toBe("room_context"); expect(rankCandidates(candidates)).toEqual(rankCandidates(clone(candidates)));
    const tied = [{ ...area, information_key: "room_type" as const, candidate_id: "70000000-0000-4000-8000-000000000002" }, { ...area, candidate_id: "70000000-0000-4000-8000-000000000001" }]; expect(rankCandidates(tied)[0].information_key).toBe("room_area_sqm");
  });
  it("wählt genau eine Action sowie kontrollierte Stops", () => {
    const selected = planNextAction(SYNTHETIC_PLANNER_CONTEXTS.roomAreaMissing, output); expect(selected).toMatchObject({ success: true, data: { kind: "selected_action" } });
    const target = planNextAction(SYNTHETIC_PLANNER_CONTEXTS.targetReached, output); expect(target).toMatchObject({ success: true, data: { kind: "stop_result", stop: { stop_reason: "target_readiness_reached", next_action_type: "present_intermediate_result" } } });
    expect(planNextAction(SYNTHETIC_PLANNER_CONTEXTS.effortLimit, output)).toMatchObject({ success: true, data: { kind: "stop_result", stop: { stop_reason: "maximum_customer_effort_reached" } } });
    expect(planNextAction(SYNTHETIC_PLANNER_CONTEXTS.safetyTakeover, output)).toMatchObject({ success: true, data: { kind: "stop_result", stop: { next_action_type: "request_human_review" } } });
    expect(planNextAction({ ...SYNTHETIC_PLANNER_CONTEXTS.roomAreaMissing, state_version: 2 }, output)).toMatchObject({ success: false, code: "stale_planner_context" });
  });
  it("allowlistet nur ungefährliche Annahmen und mutiert keinen State", () => {
    const context = SYNTHETIC_PLANNER_CONTEXTS.roomAreaMissing; const before = clone(context.knowledge_state);
    expect(canOfferAssumption("room_area_sqm", context)).toBe(true); expect(canOfferAssumption("electrical_supply_known", context)).toBe(false); expect(canOfferAssumption("outdoor_unit_position_known", context)).toBe(false);
    planNextAction(context, output); expect(context.knowledge_state).toEqual(before);
  });
  it("priorisiert Raumgrößenklärung und Safety-Konflikt den Menschen", () => {
    const conflict = createSyntheticPlannerContext(SYNTHETIC_SINGLE_ROOM_STATES.E); const candidates = generateQuestionCandidates(conflict);
    expect(candidates.success && candidates.data.find((item) => item.information_key === "room_area_sqm")).toMatchObject({ priority_band: "feasibility", reason_codes: ["contradiction_requires_clarification"] });
    expect(planNextAction({ ...conflict, human_takeover_reason: "critical_contradiction" }, output)).toMatchObject({ success: true, data: { kind: "stop_result", stop: { next_action_type: "request_human_review" } } });
  });
});

describe("AP-15-02-01 Architekturgrenze", () => {
  it("bleibt pure Domain ohne verbotene Kopplungen", () => {
    const directory = "lib/domain/conversation-intelligence"; const files = readdirSync(directory).filter((file) => file.startsWith("question-planner") && file.endsWith(".ts")); const source = files.map((file) => readFileSync(`${directory}/${file}`, "utf8")).join("\n");
    expect(source).not.toMatch(/from ["'](?:@supabase|openai|anthropic)|fetch\(|axios|process\.env|Date\.now|Math\.random|["']use (?:client|server)["']|request_photo|request_multiple_photos/u);
    expect(source).not.toMatch(/customer_(?:message|text)|question_text/u); expect(files.every((file) => !/route|action|service|component|\.sql$/u.test(file))).toBe(true);
  });
});
