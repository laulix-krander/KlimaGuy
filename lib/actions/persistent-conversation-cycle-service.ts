import "server-only";
import { normalizeCustomerAnswer } from "@/lib/domain/conversation-intelligence/answer-normalization";
import { getAnswerInterpretationRule } from "@/lib/domain/conversation-intelligence/answer-interpretation-registry";
import { runConversationCycle, runConversationCycleWithoutClaim } from "@/lib/domain/conversation-intelligence/conversation-cycle";
import type { ProductiveCustomerAnswerInterpreter } from "@/lib/server/ai/customer-answer-interpreter";
import { isCustomerAnswerAiEligible } from "@/lib/server/ai/customer-answer-interpreter";
import type { ConversationCycleContext, ConversationCycleFailure, ConversationCycleSuccess } from "@/lib/domain/conversation-intelligence/conversation-cycle-types";
import type { RenderedCustomerInteraction } from "@/lib/domain/conversation-intelligence/question-template-types";
import { classifyCycleFailure, processCustomerMessageCommandSchema, type CycleFailureCode, type PersistentCycleResult } from "@/lib/domain/conversation-cycle-orchestration";

type TerminalReplay = Extract<PersistentCycleResult, { success: true }>;
export type CustomerMessageCycleAuthority = {
  command_id: string; conversation_id: string; project_id: string; message_id: string; message_sequence: number;
  message_text: string; message_occurred_at: string; direction: "inbound"; actor_class: "customer"; message_kind: "text";
  prompt_sequence: number; pending_interaction_id: string; expected_runtime_revision: number; expected_knowledge_version: number;
  rendered_interaction: RenderedCustomerInteraction; cycle_context: Omit<ConversationCycleContext, "normalized_answer" | "execution_status">;
};
export type PersistentCycleCommit = {
  command_id: string; source_message_id: string; pending_interaction_id: string; expected_runtime_revision: number; expected_knowledge_version: number;
  cycle: ConversationCycleSuccess;
};
export type ClaimlessConversationCycleSuccess = Omit<ConversationCycleSuccess,
  "normalized_answer" | "interpretation" | "state_transition_proposal" | "state_transition_apply_result"
>;
export type PersistentCycleClaimlessCommit = Omit<PersistentCycleCommit, "cycle"> & {
  outcome: "no_match" | "ambiguous";
  cycle: ClaimlessConversationCycleSuccess;
};
export type AiInferenceAttemptReservation = Omit<PersistentCycleCommit, "cycle">;
export type AiInferenceAttemptReservationResult =
  | { success: true; code: "reserved"; command_id: string; attempt_number: 1 | 2 | 3 }
  | { success: false; code: "invalid_input" | "command_not_found" | "command_not_claimed" | "ownership_lost" | "stale_runtime_revision" | "stale_knowledge_version" | "interaction_not_current" | "attempts_exhausted" };
export type AiRetryDeferral = Pick<PersistentCycleCommit, "command_id" | "source_message_id"> & { failure: "timeout" | "transient_provider_failure" };
export type AiRetryDeferralResult =
  | { success: true; code: "deferred"; retry_at: string; attempt_count: 1 | 2 }
  | { success: false; code: "invalid_input" | "command_not_found" | "command_not_claimed" | "ownership_lost" | "attempts_exhausted" };
export type TechnicalHumanReviewReason = "ai_configuration_failure" | "ai_attempts_exhausted" | "ai_non_transient_failure";
export type PersistentCycleTechnicalHumanReview = Omit<PersistentCycleCommit, "cycle"> & { reason: TechnicalHumanReviewReason };
export type PersistentCycleHumanReview = {
  command_id: string; source_message_id: string; pending_interaction_id: string;
  cycle_result: (ConversationCycleFailure & Readonly<{ requires_human_review: true }>) | (ConversationCycleSuccess & Readonly<{ cycle_status: "human_review_required" }>);
};
export type PersistentCycleDataSource = {
  /** The RPC performs authorization and locks Conversation, Runtime, Pending, Knowledge, then Command. */
  claimCustomerMessage(messageId: string): Promise<{ authority?: CustomerMessageCycleAuthority; replay?: TerminalReplay; error?: CycleFailureCode }>;
  /** One database transaction applies Knowledge transition and the complete runtime/outbound generation. */
  commitCustomerMessageCycle(payload: PersistentCycleCommit): Promise<PersistentCycleResult>;
  reserveCustomerAnswerAiInferenceAttempt(payload: AiInferenceAttemptReservation): Promise<AiInferenceAttemptReservationResult>;
  deferCustomerMessageAiRetry(payload: AiRetryDeferral): Promise<AiRetryDeferralResult>;
  commitCustomerMessageCycleWithoutClaim(payload: PersistentCycleClaimlessCommit): Promise<PersistentCycleResult>;
  completeCustomerMessageWithTechnicalHumanReview(payload: PersistentCycleTechnicalHumanReview): Promise<PersistentCycleResult>;
  /** A controlled domain outcome; it creates neither a review actor nor an approval. */
  completeCustomerMessageWithHumanReview(payload: PersistentCycleHumanReview): Promise<PersistentCycleResult>;
  failCustomerMessage(commandId: string, code: "normalization_failed" | "cycle_failed" | "persistence_failed"): Promise<void>;
};
const failed = (code: CycleFailureCode, command_id?: string): PersistentCycleResult => ({ success:false, kind:"failed", code, retry_class:classifyCycleFailure(code), ...(command_id ? { command_id } : {}) });

/** Trusted server-only orchestration. The caller supplies only an immutable internal Message identity. */
export async function processPersistentCustomerMessage(source: PersistentCycleDataSource, input: unknown, customerAnswerInterpreter?: ProductiveCustomerAnswerInterpreter): Promise<PersistentCycleResult> {
  const parsed = processCustomerMessageCommandSchema.safeParse(input); if (!parsed.success) return failed("invalid_input");
  const claimed = await source.claimCustomerMessage(parsed.data.message_id);
  if (claimed.replay) return { ...claimed.replay, kind: "already_processed" };
  if (claimed.error || !claimed.authority) return failed(claimed.error ?? "persistence_failed");
  const a = claimed.authority;
  if (a.direction !== "inbound" || a.actor_class !== "customer" || a.message_kind !== "text") return failed("message_not_inbound_customer_text", a.command_id);
  if (a.message_sequence <= a.prompt_sequence) return failed("message_precedes_interaction", a.command_id);
  const raw = { answer_id:a.message_id, project_id:a.project_id, conversation_id:a.conversation_id, decision_id:a.rendered_interaction.decision_id, template_key:a.rendered_interaction.template_key, template_version:a.rendered_interaction.template_version, locale:a.rendered_interaction.locale, submitted_at:a.message_occurred_at, raw_value:{ kind:"text" as const, value:a.message_text } };
  const normalized = normalizeCustomerAnswer({ raw_answer:raw, rendered_interaction:a.rendered_interaction, attempt_number:1 });
  if (!normalized.success) { await source.failCustomerMessage(a.command_id, "normalization_failed"); return failed("normalization_failed", a.command_id); }
  let canonical_value_override: string | undefined;
  if (customerAnswerInterpreter && isCustomerAnswerAiEligible(a, normalized.normalized_answer)) {
    const reservation = await source.reserveCustomerAnswerAiInferenceAttempt({ command_id:a.command_id, source_message_id:a.message_id, pending_interaction_id:a.pending_interaction_id, expected_runtime_revision:a.expected_runtime_revision, expected_knowledge_version:a.expected_knowledge_version });
    const review = (reason: TechnicalHumanReviewReason) => source.completeCustomerMessageWithTechnicalHumanReview({ command_id:a.command_id, source_message_id:a.message_id, pending_interaction_id:a.pending_interaction_id, expected_runtime_revision:a.expected_runtime_revision, expected_knowledge_version:a.expected_knowledge_version, reason });
    if (!reservation.success) return reservation.code === "attempts_exhausted" ? review("ai_attempts_exhausted") : failed(reservation.code === "ownership_lost" ? "interaction_not_current" : "persistence_failed", a.command_id);
    const interpreted = await customerAnswerInterpreter({ authority:a, normalizedAnswer:normalized.normalized_answer, attempt:reservation.attempt_number });
    if (!interpreted.success) {
      const failureClass = interpreted.failure.failureClass;
      if (failureClass === "configuration_failure") return review("ai_configuration_failure");
      if (failureClass === "timeout" || failureClass === "transient_provider_failure") {
        if (reservation.attempt_number === 3) return review("ai_attempts_exhausted");
        const deferred = await source.deferCustomerMessageAiRetry({ command_id:a.command_id, source_message_id:a.message_id, failure:failureClass });
        return failed(deferred.success || deferred.code === "ownership_lost" ? "interaction_not_current" : "persistence_failed", a.command_id);
      }
      return review("ai_non_transient_failure");
    }
    if (interpreted.proposal.result !== "matched") {
      const cycle = runConversationCycleWithoutClaim({ ...a.cycle_context, normalized_answer:normalized.normalized_answer, execution_status:"not_processed" });
      if (!cycle.success) { await source.failCustomerMessage(a.command_id,"cycle_failed"); return failed("cycle_failed",a.command_id); }
      return source.commitCustomerMessageCycleWithoutClaim({ command_id:a.command_id, source_message_id:a.message_id, pending_interaction_id:a.pending_interaction_id, expected_runtime_revision:a.expected_runtime_revision, expected_knowledge_version:a.expected_knowledge_version, outcome:interpreted.proposal.result, cycle });
    }
    const allowed = new Set(Object.values(getAnswerInterpretationRule(a.cycle_context.interpretation_inputs.selected_action.information_key)?.canonical_values ?? {}));
    if (!allowed.has(interpreted.proposal.canonicalValue)) return review("ai_non_transient_failure");
    canonical_value_override = interpreted.proposal.canonicalValue;
  }
  const cycle = runConversationCycle({ ...a.cycle_context, interpretation_inputs:{...a.cycle_context.interpretation_inputs,...(canonical_value_override ? {canonical_value_override}: {})}, normalized_answer:normalized.normalized_answer, execution_status:"not_processed" });
  if (!cycle.success && cycle.requires_human_review) {
    return source.completeCustomerMessageWithHumanReview({ command_id:a.command_id, source_message_id:a.message_id, pending_interaction_id:a.pending_interaction_id, cycle_result:{ ...cycle, requires_human_review:true } });
  }
  if (!cycle.success) { await source.failCustomerMessage(a.command_id, "cycle_failed"); return failed("cycle_failed", a.command_id); }
  if (cycle.cycle_status === "human_review_required") {
    return source.completeCustomerMessageWithHumanReview({ command_id:a.command_id, source_message_id:a.message_id, pending_interaction_id:a.pending_interaction_id, cycle_result:{ ...cycle, cycle_status:"human_review_required" } });
  }
  return source.commitCustomerMessageCycle({ command_id:a.command_id, source_message_id:a.message_id, pending_interaction_id:a.pending_interaction_id, expected_runtime_revision:a.expected_runtime_revision, expected_knowledge_version:a.expected_knowledge_version, cycle });
}
