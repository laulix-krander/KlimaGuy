import "server-only";
import { normalizeCustomerAnswer } from "@/lib/domain/conversation-intelligence/answer-normalization";
import { getAnswerInterpretationRule } from "@/lib/domain/conversation-intelligence/answer-interpretation-registry";
import { runConversationCycle, runConversationCycleWithoutClaim } from "@/lib/domain/conversation-intelligence/conversation-cycle";
import type { ProductiveCustomerAnswerInterpreter } from "@/lib/server/ai/customer-answer-interpreter";
import { isCustomerAnswerAiEligible } from "@/lib/server/ai/customer-answer-interpreter";
import type { ConversationCycleContext, ConversationCycleFailure, ConversationCycleSuccess } from "@/lib/domain/conversation-intelligence/conversation-cycle-types";
import type { RenderedCustomerInteraction } from "@/lib/domain/conversation-intelligence/question-template-types";
import { classifyCycleFailure, processCustomerMessageCommandSchema, type CustomerAnswerCycleExecutionTrace, type CycleFailureCode, type PersistentCycleResult } from "@/lib/domain/conversation-cycle-orchestration";

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
export type DurableAiInferenceResult = Readonly<{ outcome:"matched"|"no_match"|"ambiguous"; canonical_value:string|null; attempt_number:1|2|3; semantics_version:2; schema_version:1 }>;
export type DurableAiInferenceAuthority = AiInferenceAttemptReservation & Readonly<{ conversation_id:string; project_id:string; decision_id:string; information_key:string }>;
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
  claimCustomerMessage(messageId: string): Promise<{ authority?: CustomerMessageCycleAuthority; replay?: TerminalReplay; error?: CycleFailureCode; command_id?: string; failure_stage?: "acquisition" | "context_read"; failure_category?: "rpc_error" | "response_validation_error" | "authority_rejected"; safe_rpc_code?: string; safe_rpc_summary?: string; safe_db_stage?: string }>;
  /** One database transaction applies Knowledge transition and the complete runtime/outbound generation. */
  commitCustomerMessageCycle(payload: PersistentCycleCommit): Promise<PersistentCycleResult>;
  reserveCustomerAnswerAiInferenceAttempt(payload: AiInferenceAttemptReservation): Promise<AiInferenceAttemptReservationResult>;
  loadCustomerAnswerAiInferenceResult?(payload: DurableAiInferenceAuthority): Promise<DurableAiInferenceResult|null>;
  persistCustomerAnswerAiInferenceResult?(payload: DurableAiInferenceAuthority & DurableAiInferenceResult): Promise<boolean>;
  deferCustomerMessageAiRetry(payload: AiRetryDeferral): Promise<AiRetryDeferralResult>;
  commitCustomerMessageCycleWithoutClaim(payload: PersistentCycleClaimlessCommit): Promise<PersistentCycleResult>;
  completeCustomerMessageWithTechnicalHumanReview(payload: PersistentCycleTechnicalHumanReview): Promise<PersistentCycleResult>;
  /** A controlled domain outcome; it creates neither a review actor nor an approval. */
  completeCustomerMessageWithHumanReview(payload: PersistentCycleHumanReview): Promise<PersistentCycleResult>;
  failCustomerMessage(commandId: string, code: "normalization_failed" | "cycle_failed" | "persistence_failed"): Promise<boolean>;
};
const failed = (code: CycleFailureCode, command_id?: string): PersistentCycleResult => ({ success:false, kind:"failed", code, retry_class:classifyCycleFailure(code), ...(command_id ? { command_id } : {}) });

/** Trusted server-only orchestration. The caller supplies only an immutable internal Message identity. */
export async function processPersistentCustomerMessage(source: PersistentCycleDataSource, input: unknown, customerAnswerInterpreter?: ProductiveCustomerAnswerInterpreter): Promise<PersistentCycleResult> {
  const trace: {-readonly [K in keyof CustomerAnswerCycleExecutionTrace]:CustomerAnswerCycleExecutionTrace[K]} = {
    interpreter_present:Boolean(customerAnswerInterpreter), normalization_reached:false, normalization_succeeded:false,
    ai_eligibility_evaluated:false, ai_eligible:null, ai_result_lookup_attempted:false, ai_result_reused:false,
    ai_result_persist_attempted:false, ai_result_persist_succeeded:null, ai_reservation_attempted:false, ai_reservation_succeeded:null,
    ai_reservation_result_code:null, ai_reservation_attempt_number:null, ai_interpreter_invoked:false,
    ai_interpreter_succeeded:null, ai_interpreter_outcome:null, ai_interpreter_failure_class:null,
    deterministic_cycle_branch:null, deterministic_cycle_invoked:false, deterministic_cycle_succeeded:null,
    deterministic_cycle_failure_code:null, interpretation_failure_code:null, failure_persistence_attempted:false, failure_persistence_succeeded:null,
  };
  const observed = <T extends PersistentCycleResult>(result:T):T => ({...result,execution_trace:{...trace}});
  const persistFailure = async (commandId:string, code:"normalization_failed"|"cycle_failed") => {
    trace.failure_persistence_attempted = true;
    trace.failure_persistence_succeeded = await source.failCustomerMessage(commandId,code);
  };
  const parsed = processCustomerMessageCommandSchema.safeParse(input); if (!parsed.success) return failed("invalid_input");
  const claimed = await source.claimCustomerMessage(parsed.data.message_id);
  if (claimed.replay) return { ...claimed.replay, kind: "already_processed" };
  if (claimed.error || !claimed.authority) return {
    ...failed(claimed.error ?? "persistence_failed", claimed.command_id),
    ...(claimed.failure_stage ? { diagnostic: { stage: claimed.failure_stage, failure_category: claimed.failure_category ?? "authority_rejected", ...(claimed.safe_rpc_code ? { safe_rpc_code: claimed.safe_rpc_code } : {}), ...(claimed.safe_rpc_summary ? { safe_rpc_summary: claimed.safe_rpc_summary } : {}), ...(claimed.safe_db_stage ? { safe_db_stage: claimed.safe_db_stage } : {}) } } : {}),
  };
  const a = claimed.authority;
  if (a.direction !== "inbound" || a.actor_class !== "customer" || a.message_kind !== "text") return failed("message_not_inbound_customer_text", a.command_id);
  if (a.message_sequence <= a.prompt_sequence) return failed("message_precedes_interaction", a.command_id);
  const raw = { answer_id:a.message_id, project_id:a.project_id, conversation_id:a.conversation_id, decision_id:a.rendered_interaction.decision_id, template_key:a.rendered_interaction.template_key, template_version:a.rendered_interaction.template_version, locale:a.rendered_interaction.locale, submitted_at:a.message_occurred_at, raw_value:{ kind:"text" as const, value:a.message_text } };
  trace.normalization_reached = true;
  const normalized = normalizeCustomerAnswer({ raw_answer:raw, rendered_interaction:a.rendered_interaction, attempt_number:1 });
  trace.normalization_succeeded = normalized.success;
  if (!normalized.success) { await persistFailure(a.command_id,"normalization_failed"); return observed(failed("normalization_failed", a.command_id)); }
  let canonical_value_override: string | undefined;
  let aiEligible: boolean | null = null;
  if (customerAnswerInterpreter) {
    trace.ai_eligibility_evaluated = true;
    aiEligible = isCustomerAnswerAiEligible(a, normalized.normalized_answer);
    trace.ai_eligible = aiEligible;
  }
  if (customerAnswerInterpreter && aiEligible) {
    const selectedAction=a.cycle_context.interpretation_inputs.selected_action;
    const inferenceAuthority={command_id:a.command_id,source_message_id:a.message_id,pending_interaction_id:a.pending_interaction_id,expected_runtime_revision:a.expected_runtime_revision,expected_knowledge_version:a.expected_knowledge_version,conversation_id:a.conversation_id,project_id:a.project_id,decision_id:selectedAction.decision_id,information_key:selectedAction.information_key};
    trace.ai_result_lookup_attempted=true;
    let durable=source.loadCustomerAnswerAiInferenceResult ? await source.loadCustomerAnswerAiInferenceResult(inferenceAuthority) : null;
    if (durable?.outcome === "matched") {
      const allowed=new Set(Object.values(getAnswerInterpretationRule(selectedAction.information_key)?.canonical_values ?? {}));
      if (!durable.canonical_value || !allowed.has(durable.canonical_value)) durable=null;
    }
    trace.ai_result_reused=durable!==null;
    let outcome:DurableAiInferenceResult["outcome"];
    if (durable) {
      outcome=durable.outcome;
      trace.ai_interpreter_outcome=outcome;
      if (outcome === "matched") canonical_value_override=durable.canonical_value!;
    } else {
    trace.ai_reservation_attempted = true;
    const reservation = await source.reserveCustomerAnswerAiInferenceAttempt({ command_id:a.command_id, source_message_id:a.message_id, pending_interaction_id:a.pending_interaction_id, expected_runtime_revision:a.expected_runtime_revision, expected_knowledge_version:a.expected_knowledge_version });
    trace.ai_reservation_succeeded = reservation.success;
    trace.ai_reservation_result_code = reservation.code;
    if (reservation.success) trace.ai_reservation_attempt_number = reservation.attempt_number;
    const review = (reason: TechnicalHumanReviewReason) => source.completeCustomerMessageWithTechnicalHumanReview({ command_id:a.command_id, source_message_id:a.message_id, pending_interaction_id:a.pending_interaction_id, expected_runtime_revision:a.expected_runtime_revision, expected_knowledge_version:a.expected_knowledge_version, reason });
    if (!reservation.success) return observed(await (reservation.code === "attempts_exhausted" ? review("ai_attempts_exhausted") : Promise.resolve(failed(reservation.code === "ownership_lost" ? "interaction_not_current" : "persistence_failed", a.command_id))));
    trace.ai_interpreter_invoked = true;
    const interpreted = await customerAnswerInterpreter({ authority:a, normalizedAnswer:normalized.normalized_answer, attempt:reservation.attempt_number });
    trace.ai_interpreter_succeeded = interpreted.success;
    if (!interpreted.success) {
      const failureClass = interpreted.failure.failureClass;
      trace.ai_interpreter_failure_class = failureClass;
      if (failureClass === "configuration_failure") return observed(await review("ai_configuration_failure"));
      if (failureClass === "timeout" || failureClass === "transient_provider_failure") {
        if (reservation.attempt_number === 3) return observed(await review("ai_attempts_exhausted"));
        const deferred = await source.deferCustomerMessageAiRetry({ command_id:a.command_id, source_message_id:a.message_id, failure:failureClass });
        return observed(failed(deferred.success || deferred.code === "ownership_lost" ? "interaction_not_current" : "persistence_failed", a.command_id));
      }
      return observed(await review("ai_non_transient_failure"));
    }
    trace.ai_interpreter_outcome = interpreted.proposal.result;
    outcome=interpreted.proposal.result;
    let canonicalValue:string|null=null;
    if (interpreted.proposal.result === "matched") {
      const allowed = new Set(Object.values(getAnswerInterpretationRule(selectedAction.information_key)?.canonical_values ?? {}));
      if (!allowed.has(interpreted.proposal.canonicalValue)) return observed(await review("ai_non_transient_failure"));
      canonicalValue=interpreted.proposal.canonicalValue;
    }
    trace.ai_result_persist_attempted=true;
    trace.ai_result_persist_succeeded=source.persistCustomerAnswerAiInferenceResult ? await source.persistCustomerAnswerAiInferenceResult({...inferenceAuthority,outcome,canonical_value:canonicalValue,attempt_number:reservation.attempt_number,semantics_version:2,schema_version:1}) : true;
    if (!trace.ai_result_persist_succeeded) return observed(failed("persistence_failed",a.command_id));
    canonical_value_override=canonicalValue ?? undefined;
    }
    if (outcome !== "matched") {
      trace.deterministic_cycle_branch = "without_claim"; trace.deterministic_cycle_invoked = true;
      const cycle = runConversationCycleWithoutClaim({ ...a.cycle_context, normalized_answer:normalized.normalized_answer, execution_status:"not_processed" });
      trace.deterministic_cycle_succeeded = cycle.success;
      if (!cycle.success) { trace.deterministic_cycle_failure_code=cycle.code; trace.interpretation_failure_code=cycle.interpretation_failure_code ?? null; await persistFailure(a.command_id,"cycle_failed"); return observed(failed("cycle_failed",a.command_id)); }
      return observed(await source.commitCustomerMessageCycleWithoutClaim({ command_id:a.command_id, source_message_id:a.message_id, pending_interaction_id:a.pending_interaction_id, expected_runtime_revision:a.expected_runtime_revision, expected_knowledge_version:a.expected_knowledge_version, outcome, cycle }));
    }
  }
  trace.deterministic_cycle_branch = "with_claim"; trace.deterministic_cycle_invoked = true;
  const cycle = runConversationCycle({ ...a.cycle_context, interpretation_inputs:{...a.cycle_context.interpretation_inputs,...(canonical_value_override ? {canonical_value_override}: {})}, normalized_answer:normalized.normalized_answer, execution_status:"not_processed" });
  trace.deterministic_cycle_succeeded = cycle.success;
  if (!cycle.success) { trace.deterministic_cycle_failure_code = cycle.code; trace.interpretation_failure_code = cycle.interpretation_failure_code ?? null; }
  if (!cycle.success && cycle.requires_human_review) {
    return observed(await source.completeCustomerMessageWithHumanReview({ command_id:a.command_id, source_message_id:a.message_id, pending_interaction_id:a.pending_interaction_id, cycle_result:{ ...cycle, requires_human_review:true } }));
  }
  if (!cycle.success) { await persistFailure(a.command_id,"cycle_failed"); return observed(failed("cycle_failed", a.command_id)); }
  if (cycle.cycle_status === "human_review_required") {
    return observed(await source.completeCustomerMessageWithHumanReview({ command_id:a.command_id, source_message_id:a.message_id, pending_interaction_id:a.pending_interaction_id, cycle_result:{ ...cycle, cycle_status:"human_review_required" } }));
  }
  return observed(await source.commitCustomerMessageCycle({ command_id:a.command_id, source_message_id:a.message_id, pending_interaction_id:a.pending_interaction_id, expected_runtime_revision:a.expected_runtime_revision, expected_knowledge_version:a.expected_knowledge_version, cycle }));
}
