import { z } from "zod";

export const CONVERSATION_CYCLE_COMMAND_STATUSES = ["pending", "processing", "completed", "failed", "stale", "human_review_required"] as const;
export const CONVERSATION_CYCLE_RESULT_KINDS = ["completed_with_next_interaction", "intermediate_break", "evidence_request", "human_review", "collection_stopped", "stale", "retry_required", "already_processed", "failed"] as const;
export const CONVERSATION_CYCLE_FAILURE_CODES = ["invalid_input", "unauthorized", "message_not_found", "conversation_not_found", "runtime_not_found", "pending_interaction_not_found", "message_conversation_mismatch", "message_not_inbound_customer_text", "interaction_not_current", "stale_runtime_revision", "stale_knowledge_version", "message_precedes_interaction", "message_already_processed", "normalization_failed", "cycle_failed", "persistence_failed", "outbound_creation_failed", "runtime_invariant_failed", "conversation_not_processable"] as const;
export const TECHNICAL_RETRY_CLASSES = ["retryable", "requires_recheck", "human_review", "terminal"] as const;

const uuid = z.string().uuid();
export const processCustomerMessageCommandSchema = z.object({ message_id: uuid }).strict();
export const continueConversationCommandSchema = z.object({ conversation_id: uuid, idempotency_key: z.string().min(8).max(128) }).strict();
export type CycleFailureCode = typeof CONVERSATION_CYCLE_FAILURE_CODES[number];
export type TechnicalRetryClass = typeof TECHNICAL_RETRY_CLASSES[number];

/** Request-local, privacy-safe execution progress. It is never domain persistence payload. */
export type CustomerAnswerCycleExecutionTrace = Readonly<{
  answer_context_lookup_attempted: boolean;
  answer_context_reused: boolean;
  answer_context_bootstrap_attempted: boolean;
  answer_context_bootstrap_succeeded: boolean | null;
  answer_context_source: "direct_current_binding" | "legacy_original_binding" | "rehabilitated_original_lineage" | null;
  interpreter_present: boolean;
  normalization_reached: boolean;
  normalization_succeeded: boolean;
  ai_eligibility_evaluated: boolean;
  ai_eligible: boolean | null;
  ai_result_lookup_attempted: boolean;
  ai_result_reused: boolean;
  ai_result_persist_attempted: boolean;
  ai_result_persist_succeeded: boolean | null;
  ai_reservation_attempted: boolean;
  ai_reservation_succeeded: boolean | null;
  ai_reservation_result_code: string | null;
  ai_reservation_attempt_number: 1 | 2 | 3 | null;
  ai_interpreter_invoked: boolean;
  ai_interpreter_succeeded: boolean | null;
  ai_interpreter_outcome: "matched" | "no_match" | "ambiguous" | null;
  ai_interpreter_failure_class: "transient_provider_failure" | "timeout" | "invalid_structured_output" | "refused" | "unsupported" | "configuration_failure" | "permanent_provider_failure" | null;
  deterministic_cycle_branch: "with_claim" | "without_claim" | null;
  deterministic_cycle_invoked: boolean;
  deterministic_cycle_succeeded: boolean | null;
  deterministic_cycle_failure_code: import("./conversation-intelligence/conversation-cycle-types").CycleErrorCode | null;
  interpretation_failure_code: import("./conversation-intelligence/answer-interpretation-types").InterpretationErrorCode | null;
  failure_persistence_attempted: boolean;
  failure_persistence_succeeded: boolean | null;
}>;

export type PersistentCycleResult =
  | { success: true; kind: Exclude<typeof CONVERSATION_CYCLE_RESULT_KINDS[number], "failed">; command_id: string; runtime_revision: number; knowledge_version: number; outbound_message_id: string | null; pending_interaction_id: string | null; execution_trace?: CustomerAnswerCycleExecutionTrace }
  | { success: false; kind: "failed"; code: CycleFailureCode; retry_class: TechnicalRetryClass; command_id?: string; execution_trace?: CustomerAnswerCycleExecutionTrace; diagnostic?: { stage: "acquisition" | "context_read"; failure_category: "rpc_error" | "response_validation_error" | "authority_rejected"; safe_rpc_code?: string; safe_rpc_summary?: string; safe_db_stage?: string } };

const CLASSIFICATION: Record<CycleFailureCode, TechnicalRetryClass> = {
  invalid_input:"terminal", unauthorized:"terminal", message_not_found:"requires_recheck", conversation_not_found:"requires_recheck", runtime_not_found:"requires_recheck", pending_interaction_not_found:"requires_recheck", message_conversation_mismatch:"terminal", message_not_inbound_customer_text:"terminal", interaction_not_current:"requires_recheck", stale_runtime_revision:"requires_recheck", stale_knowledge_version:"requires_recheck", message_precedes_interaction:"terminal", message_already_processed:"terminal", normalization_failed:"retryable", cycle_failed:"retryable", persistence_failed:"retryable", outbound_creation_failed:"retryable", runtime_invariant_failed:"human_review", conversation_not_processable:"terminal",
};
export const classifyCycleFailure = (code: CycleFailureCode): TechnicalRetryClass => CLASSIFICATION[code];
