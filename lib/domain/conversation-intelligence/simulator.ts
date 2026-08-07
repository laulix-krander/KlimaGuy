import { createSyntheticInterpretationContext } from "./answer-interpretation-fixtures";
import { normalizeCustomerAnswer } from "./answer-normalization";
import type { RawCustomerAnswer } from "./answer-normalization-types";
import { runConversationCycle } from "./conversation-cycle";
import { createSyntheticConversationCycleContext } from "./conversation-cycle-fixtures";
import type { ConversationCycleContext, ConversationCycleResult } from "./conversation-cycle-types";
import { createInterpretationIdempotencyKey } from "./answer-interpretation";
import { continueConversationAfterIntermediateResult } from "./conversation-continuation";

export const SIMULATOR_SCENARIOS = [
  ["minimal_room", "Minimaler Ein-Raum-Fall"], ["unknown_room_area", "Raumgröße unbekannt"],
  ["contradictory_room_area", "Widersprüchliche Raumgröße"], ["assumption_required", "Annahme erforderlich"],
  ["human_review_required", "Human Review"], ["retry_limit", "Retry-Limit"],
  ["level_3_reached", "Level 3 erreicht"], ["empty_synthetic_project", "Leeres Testprojekt"],
] as const;
export type SimulatorScenarioId = typeof SIMULATOR_SCENARIOS[number][0];

const outcomes: Record<SimulatorScenarioId, Parameters<typeof createSyntheticInterpretationContext>[1]> = {
  minimal_room: "exact", unknown_room_area: "unknown", contradictory_room_area: "exact",
  assumption_required: "assumption_confirmed", human_review_required: "exact", retry_limit: "unknown",
  level_3_reached: "exact", empty_synthetic_project: "exact",
};

export function createSimulatorStart(scenario: SimulatorScenarioId): ConversationCycleContext {
  const existing = scenario === "contradictory_room_area"
    ? { value: 30, value_type: "number" as const, epistemic_status: "reported" as const }
    : scenario === "human_review_required"
      ? { value: 30, value_type: "number" as const, epistemic_status: "confirmed" as const,
          evidence: [{ evidence_id: "83000000-0000-4000-8000-000000000008", source_type: "reviewer_correction" as const, source_id: "83000000-0000-4000-8000-000000000009", actor_class: "reviewer" as const, observed_at: "2026-08-06T16:00:00.000Z", evidence_status: "manually_corrected" as const }] }
      : undefined;
  const interpretation = createSyntheticInterpretationContext(scenario === "assumption_required" ? "assumption" : "roomArea", outcomes[scenario], existing);
  return createSyntheticConversationCycleContext(outcomes[scenario], {
    knowledge_state: interpretation.knowledge_state,
    normalized_answer: interpretation.normalized_answer,
    interpretation_inputs: Object.fromEntries(Object.entries(interpretation).filter(([key]) => !["knowledge_state", "normalized_answer", "current_state_version", "project_id", "conversation_id"].includes(key))) as ConversationCycleContext["interpretation_inputs"],
    expected_state_version: interpretation.current_state_version,
    retry_state: { project_id: interpretation.project_id, conversation_id: interpretation.conversation_id, items: scenario === "retry_limit" ? [{ information_key: "room_area_sqm", entity_type: "room", entity_id: interpretation.selected_action.entity_id, attempts: 1, last_outcome: "unknown", last_attempt_at: interpretation.interpreted_at }] : [], updated_at: interpretation.interpreted_at },
  });
}

const id = (cycle: number, suffix: number) => `92000000-0000-4000-8${String(cycle).padStart(3, "0")}-${String(suffix).padStart(12, "0")}`;
const time = (cycle: number) => `2026-08-07T${String(10 + Math.floor(cycle / 60)).padStart(2, "0")}:${String(cycle % 60).padStart(2, "0")}:00.000Z`;

export function executeSimulatorAnswer(context: ConversationCycleContext, rawValue: RawCustomerAnswer["raw_value"], cycle: number): { raw: RawCustomerAnswer; normalized: ReturnType<typeof normalizeCustomerAnswer>; result?: ConversationCycleResult; next?: ConversationCycleContext } {
  const interaction = context.interpretation_inputs.rendered_interaction;
  const raw: RawCustomerAnswer = { answer_id: id(cycle, 1), project_id: context.project_id, conversation_id: context.conversation_id, decision_id: interaction.decision_id, template_key: interaction.template_key, template_version: interaction.template_version, locale: "de", submitted_at: time(cycle), raw_value: rawValue };
  const normalized = normalizeCustomerAnswer({ raw_answer: raw, rendered_interaction: interaction, attempt_number: 1 });
  if (!normalized.success) return { raw, normalized };
  const runContext: ConversationCycleContext = { ...context, cycle_id: id(cycle, 2), correlation_id: id(cycle, 3), normalized_answer: normalized.normalized_answer, occurred_at: time(cycle), next_state_ids: { apply_id: id(cycle, 4) }, assessment_id: id(cycle, 5), planner_decision_id: id(cycle, 6), event_ids: Array.from({ length: 10 }, (_, index) => id(cycle, 100 + index)), event_sequence_start: cycle * 20 + 1,
    interpretation_inputs: { ...context.interpretation_inputs, interpretation_id: id(cycle, 7), source_message_id: id(cycle, 8), interpreted_at: time(cycle), idempotency_key: createInterpretationIdempotencyKey(context.conversation_id, interaction.decision_id, raw.answer_id), proposal_ids: { transition_id: id(cycle, 9), claim_id: id(cycle, 10), customer_evidence_id: id(cycle, 11), system_evidence_id: id(cycle, 12) } } };
  const result = runConversationCycle(runContext);
  if (!result.success || !result.rendered_interaction || result.planner_result.kind !== "selected_action") return { raw, normalized, result };
  return { raw, normalized, result, next: { ...runContext, knowledge_state: result.knowledge_state, retry_state: result.retry_state, customer_effort_state: result.customer_effort_state, expected_state_version: result.current_state_version, previous_events: result.events,
    interpretation_inputs: { ...runContext.interpretation_inputs, selected_action: result.planner_result.action, rendered_interaction: result.rendered_interaction } } };
}

export function executeSimulatorContinuation(context: ConversationCycleContext, previous: Extract<ConversationCycleResult, { success: true }>, cycle: number) {
  const result = continueConversationAfterIntermediateResult({ project_id: previous.knowledge_state.project_id, conversation_id: previous.knowledge_state.conversation_id, knowledge_state: previous.knowledge_state, retry_state: previous.retry_state, customer_effort_state: previous.customer_effort_state, previous_planner_result: previous.planner_result, expected_state_version: previous.current_state_version, assessment_id: id(cycle, 205), planner_decision_id: id(cycle, 206), planner_candidate_ids: [], occurred_at: time(cycle), template_version: context.template_version, locale: context.locale });
  if (!result.success || result.status !== "next_action_selected" || result.planner_result.kind !== "selected_action" || !result.rendered_interaction) return { result };
  const next: ConversationCycleContext = { ...context, knowledge_state: result.knowledge_state, retry_state: result.retry_state, customer_effort_state: result.customer_effort_state, expected_state_version: result.knowledge_state.state_version, assessment_id: id(cycle, 205), planner_decision_id: id(cycle, 206), occurred_at: time(cycle), interpretation_inputs: { ...context.interpretation_inputs, selected_action: result.planner_result.action, rendered_interaction: result.rendered_interaction } };
  return { result, next };
}
