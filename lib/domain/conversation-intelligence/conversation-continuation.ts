import { z } from "zod";
import { conversationRetryStateSchema } from "./conversation-cycle-schemas";
import { buildIntermediateAssessment } from "./intermediate-assessment";
import { planNextAction } from "./question-planner";
import { customerEffortStateSchema, plannerStopResultSchema, selectedNextActionSchema, type CustomerEffortState, type PlanNextActionResult } from "./question-planner-schemas";
import { renderQuestionTemplate } from "./question-template-renderer";
import type { RenderedCustomerInteraction } from "./question-template-types";
import { deriveMissingInformation, deriveReadiness } from "./readiness";
import { knowledgeStateSchema, type IntermediateAssessment, type KnowledgeState } from "./schemas";
import type { ConversationRetryState } from "./conversation-cycle-types";
import { informationCollectionStateSchema, type InformationCollectionState } from "./information-collection";

export const CONTINUATION_ERROR_CODES = [
  "invalid_continuation_context", "continuation_not_allowed", "previous_result_not_intermediate",
  "state_version_mismatch", "effort_reset_failed", "assessment_failed", "planner_failed",
  "template_render_failed", "continuation_version_invariant_failed", "continuation_failed",
] as const;
export type ContinuationErrorCode = typeof CONTINUATION_ERROR_CODES[number];

export type ConversationContinuationContext = Readonly<{
  project_id: string;
  conversation_id: string;
  knowledge_state: KnowledgeState;
  information_collection_state: InformationCollectionState;
  retry_state: ConversationRetryState;
  customer_effort_state: CustomerEffortState;
  previous_planner_result: PlanNextActionResult;
  expected_state_version: number;
  assessment_id: string;
  planner_decision_id: string;
  planner_candidate_ids: readonly string[];
  occurred_at: string;
  template_version: number;
  locale: "de";
}>;

type ContinuationData = Readonly<{
  knowledge_state: KnowledgeState;
  information_collection_state: InformationCollectionState;
  retry_state: ConversationRetryState;
  customer_effort_state: CustomerEffortState;
  missing_information: ReturnType<typeof deriveMissingInformation>;
  readiness: ReturnType<typeof deriveReadiness>;
  assessment: IntermediateAssessment;
  planner_result: PlanNextActionResult;
  rendered_interaction?: RenderedCustomerInteraction;
}>;
export type ConversationContinuationResult =
  | (ContinuationData & Readonly<{ success: true; status: "next_action_selected" | "stopped" | "human_review_required" }>)
  | Readonly<{ success: false; code: ContinuationErrorCode; retryable: boolean; requires_replanning: boolean; requires_human_review: boolean }>;

const uuid = z.string().uuid();
const contextSchema = z.object({
  project_id: uuid, conversation_id: uuid, knowledge_state: knowledgeStateSchema, information_collection_state: informationCollectionStateSchema,
  retry_state: conversationRetryStateSchema, customer_effort_state: customerEffortStateSchema,
  previous_planner_result: z.union([z.object({ kind: z.literal("stop_result"), stop: plannerStopResultSchema }).strict(), z.object({ kind: z.literal("selected_action"), action: selectedNextActionSchema }).strict()]), expected_state_version: z.number().int().positive(),
  assessment_id: uuid, planner_decision_id: uuid, planner_candidate_ids: z.array(uuid).readonly(),
  occurred_at: z.string().datetime({ offset: true }), template_version: z.number().int().positive(), locale: z.literal("de"),
}).strict();
const failure = (code: ContinuationErrorCode): ConversationContinuationResult => ({
  success: false, code, retryable: code === "continuation_failed", requires_replanning: ["state_version_mismatch", "planner_failed", "continuation_version_invariant_failed"].includes(code), requires_human_review: code === "continuation_version_invariant_failed",
});

/** Starts a new question block without applying an answer or changing conversation knowledge. */
export function continueConversationAfterIntermediateResult(input: unknown): ConversationContinuationResult {
  const parsed = contextSchema.safeParse(input);
  if (!parsed.success) return failure("invalid_continuation_context");
  const ctx = parsed.data as ConversationContinuationContext;
  const previous = ctx.previous_planner_result;
  if (previous.kind !== "stop_result") return failure("previous_result_not_intermediate");
  if (previous.stop.next_action_type !== "present_intermediate_result") return failure("previous_result_not_intermediate");
  if (previous.stop.stop_reason !== "maximum_customer_effort_reached" || !previous.stop.reason_codes.includes("customer_effort_break")) return failure("continuation_not_allowed");
  if (ctx.project_id !== ctx.knowledge_state.project_id || ctx.conversation_id !== ctx.knowledge_state.conversation_id || ctx.retry_state.project_id !== ctx.project_id || ctx.retry_state.conversation_id !== ctx.conversation_id) return failure("invalid_continuation_context");
  if (ctx.expected_state_version !== ctx.knowledge_state.state_version || previous.stop.based_on_state_version !== ctx.knowledge_state.state_version) return failure("state_version_mismatch");
  try {
    const effortResult = customerEffortStateSchema.safeParse({ ...ctx.customer_effort_state, consecutive_technical_questions: 0, last_break_at: ctx.occurred_at });
    if (!effortResult.success) return failure("effort_reset_failed");
    const missing = deriveMissingInformation(ctx.knowledge_state);
    const readiness = deriveReadiness(ctx.knowledge_state);
    const assessmentResult = buildIntermediateAssessment(ctx.knowledge_state, { assessment_id: ctx.assessment_id, project_id: ctx.project_id, conversation_id: ctx.conversation_id, based_on_state_version: ctx.knowledge_state.state_version, created_at: ctx.occurred_at, created_by_actor_class: "system" });
    if (!assessmentResult.success) return failure("assessment_failed");
    const planned = planNextAction({ project_id: ctx.project_id, conversation_id: ctx.conversation_id, state_version: ctx.knowledge_state.state_version, knowledge_state: ctx.knowledge_state,information_collection_state:ctx.information_collection_state, intermediate_assessment: assessmentResult.data, missing_information: missing, target_readiness_level: "level_3_preliminary_installation", retry_state: ctx.retry_state.items,revisit_triggers:[], customer_effort_state: effortResult.data, created_at: ctx.occurred_at }, { decision_id: ctx.planner_decision_id, created_at: ctx.occurred_at });
    if (!planned.success) return failure("planner_failed");
    const plannerResult = planned.data;
    const plannerVersion = plannerResult.kind === "selected_action" ? plannerResult.action.based_on_state_version : plannerResult.stop.based_on_state_version;
    if (assessmentResult.data.based_on_state_version !== ctx.knowledge_state.state_version || plannerVersion !== ctx.knowledge_state.state_version) return failure("continuation_version_invariant_failed");
    let rendered: RenderedCustomerInteraction | undefined;
    if (plannerResult.kind === "selected_action" && plannerResult.action.action_type !== "request_human_review" && plannerResult.action.template_key) {
      const renderResult = renderQuestionTemplate({ selected_action: plannerResult.action, locale: ctx.locale, template_version: ctx.template_version, render_parameters: plannerResult.action.action_type === "offer_assumption" ? { approximate_example: "25 m²" } : {} });
      if (!renderResult.success) return failure("template_render_failed");
      rendered = renderResult.interaction;
      if (plannerResult.action.based_on_state_version !== ctx.knowledge_state.state_version) return failure("continuation_version_invariant_failed");
    }
    const data: ContinuationData = { knowledge_state: ctx.knowledge_state, information_collection_state:ctx.information_collection_state, retry_state: ctx.retry_state, customer_effort_state: effortResult.data, missing_information: missing, readiness, assessment: assessmentResult.data, planner_result: plannerResult, ...(rendered ? { rendered_interaction: rendered } : {}) };
    const status = plannerResult.kind === "selected_action" ? (plannerResult.action.action_type === "request_human_review" ? "human_review_required" : "next_action_selected") : plannerResult.stop.next_action_type === "request_human_review" ? "human_review_required" : "stopped";
    return { success: true, status, ...data };
  } catch {
    return failure("continuation_failed");
  }
}
