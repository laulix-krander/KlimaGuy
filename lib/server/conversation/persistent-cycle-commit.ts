import "server-only";

import { z } from "zod";
import type {
  PersistentCycleCommit,
  PersistentCycleHumanReview,
} from "@/lib/actions/persistent-conversation-cycle-service";
import { normalizedCustomerAnswerSchema } from "@/lib/domain/conversation-intelligence/answer-normalization-schemas";
import { interpretationResultSchema, stateTransitionProposalSchema } from "@/lib/domain/conversation-intelligence/answer-interpretation-schemas";
import { conversationCycleEventSchema, conversationRetryStateSchema } from "@/lib/domain/conversation-intelligence/conversation-cycle-schemas";
import { evidenceRequestStateSchema, selectedEvidenceRequestSchema } from "@/lib/domain/conversation-intelligence/evidence-request";
import { informationCollectionStateSchema } from "@/lib/domain/conversation-intelligence/information-collection";
import { customerEffortStateSchema, selectedNextActionSchema } from "@/lib/domain/conversation-intelligence/question-planner-schemas";
import { renderedCustomerInteractionSchema } from "@/lib/domain/conversation-intelligence/question-template-schemas";
import { stateTransitionApplyResultSchema } from "@/lib/domain/conversation-intelligence/state-transition-schemas";
import { classifyCycleFailure, type PersistentCycleResult } from "@/lib/domain/conversation-cycle-orchestration";
import { composeRenderedCustomerText } from "@/lib/actions/planner-snapshot-persistence";
import type { CycleExecutionContext } from "@/lib/server/conversation/persistent-cycle-data-source";

const uuid = z.string().uuid();
const version = z.number().int().positive();
const failureCode = z.enum(["normalization_failed", "cycle_failed", "persistence_failed"]);
const successKind = z.enum(["completed_with_next_interaction", "intermediate_break", "evidence_request", "collection_stopped"]);

const rpcSuccessSchema = z.object({
  success: z.literal(true),
  code: z.enum(["committed", "replayed"]),
  command_id: uuid,
  runtime_revision: version,
  knowledge_version: version,
  outbound_message_id: uuid.nullable(),
  pending_interaction_id: uuid.nullable(),
  result_kind: successKind,
}).strict();
const rpcFailureSchema = z.object({
  success: z.literal(false),
  code: z.enum(["invalid_input", "command_not_found", "command_not_claimed", "ownership_lost", "stale_runtime_revision", "stale_knowledge_version", "interaction_not_current", "message_conversation_mismatch", "duplicate_conflict", "runtime_invariant_failed", "persistence_failed"]),
}).strict();

export type PersistentCycleCommitRpc = {
  rpc(name: "commit_customer_message_cycle" | "fail_customer_message_cycle" | "complete_customer_message_human_review", args: Record<string, unknown>): Promise<{ data: unknown; error: unknown }>;
};

function failed(code: z.infer<typeof rpcFailureSchema>["code"], commandId: string): PersistentCycleResult {
  const mapped = code === "ownership_lost" ? "interaction_not_current"
    : code === "command_not_found" ? "message_not_found"
    : code === "command_not_claimed" || code === "interaction_not_current" ? "interaction_not_current"
      : code === "message_conversation_mismatch" || code === "duplicate_conflict" ? "message_conversation_mismatch"
        : code;
  return { success: false, kind: "failed", code: mapped, retry_class: classifyCycleFailure(mapped), command_id: commandId };
}

/** Persists the already calculated cycle generation. It never invokes a Domain calculator. */
export async function commitCustomerMessageCycle(source: PersistentCycleCommitRpc, input: PersistentCycleCommit, execution?: CycleExecutionContext): Promise<PersistentCycleResult> {
  const identities = z.object({ command_id: uuid, source_message_id: uuid, pending_interaction_id: uuid, expected_runtime_revision: version, expected_knowledge_version: version }).strict().safeParse({
    command_id: input.command_id, source_message_id: input.source_message_id, pending_interaction_id: input.pending_interaction_id,
    expected_runtime_revision: input.expected_runtime_revision, expected_knowledge_version: input.expected_knowledge_version,
  });
  const cycle = input.cycle;
  const normalized = normalizedCustomerAnswerSchema.safeParse(cycle.normalized_answer);
  const interpretation = interpretationResultSchema.safeParse(cycle.interpretation);
  const proposal = stateTransitionProposalSchema.safeParse(cycle.state_transition_proposal);
  const apply = stateTransitionApplyResultSchema.safeParse(cycle.state_transition_apply_result);
  const collection = informationCollectionStateSchema.safeParse(cycle.information_collection_state);
  const retry = conversationRetryStateSchema.safeParse(cycle.retry_state);
  const effort = customerEffortStateSchema.safeParse(cycle.customer_effort_state);
  const evidence = evidenceRequestStateSchema.safeParse(cycle.evidence_request_state);
  const selectedEvidence = cycle.selected_evidence_request ? selectedEvidenceRequestSchema.safeParse(cycle.selected_evidence_request) : undefined;
  const events = z.array(conversationCycleEventSchema).max(5).safeParse(cycle.events);
  const nextAction = cycle.planner_result.kind === "selected_action" ? selectedNextActionSchema.safeParse(cycle.planner_result.action) : undefined;
  const rendered = cycle.rendered_interaction ? renderedCustomerInteractionSchema.safeParse(cycle.rendered_interaction) : undefined;
  if (!identities.success || !normalized.success || !interpretation.success || !interpretation.data.success || !proposal.success || !apply.success || !apply.data.success
    || !collection.success || !retry.success || !effort.success || !evidence.success || !events.success || (selectedEvidence && !selectedEvidence.success)
    || (nextAction && !nextAction.success) || (rendered && !rendered.success)) return failed("invalid_input", input.command_id);
  const proposalProjectId = cycle.state_transition_proposal.project_id;
  const proposalConversationId = cycle.state_transition_proposal.conversation_id;
  if (normalized.data.answer_id !== input.source_message_id || proposal.data.answer_id !== input.source_message_id
    || cycle.interpretation.proposal !== cycle.state_transition_proposal
    || apply.data.transition_id !== proposal.data.transition_id || apply.data.interpretation_id !== proposal.data.interpretation_id
    || apply.data.previous_state_version !== input.expected_knowledge_version || apply.data.new_state_version !== cycle.current_state_version
    || cycle.previous_state_version !== input.expected_knowledge_version || cycle.knowledge_state.state_version !== cycle.current_state_version
    || collection.data.project_id !== proposalProjectId || retry.data.conversation_id !== proposalConversationId
    || evidence.data.project_id !== proposalProjectId || cycle.events.some(event => event.project_id !== proposalProjectId || event.conversation_id !== proposalConversationId)
    || (nextAction?.success && (!rendered?.success || nextAction.data.decision_id !== rendered.data.decision_id || nextAction.data.based_on_state_version !== cycle.current_state_version))) {
    return failed("invalid_input", input.command_id);
  }
  const payload = {
    source_message_id: identities.data.source_message_id,
    pending_interaction_id: identities.data.pending_interaction_id,
    expected_runtime_revision: identities.data.expected_runtime_revision,
    expected_knowledge_version: identities.data.expected_knowledge_version,
    normalized_answer: normalized.data,
    interpretation: interpretation.data,
    proposal: proposal.data,
    apply_result: apply.data,
    cycle_status: cycle.cycle_status,
    current_state_version: cycle.current_state_version,
    information_collection_state: collection.data,
    retry_state: retry.data,
    customer_effort_state: effort.data,
    evidence_request_state: evidence.data,
    selected_evidence_request: selectedEvidence?.success ? selectedEvidence.data : null,
    rendered_evidence_request: cycle.rendered_evidence_request ?? null,
    events: events.data,
    next_interaction: nextAction?.success && rendered?.success ? {
      selected_action: nextAction.data,
      rendered_interaction: rendered.data,
      outbound_text: composeRenderedCustomerText(rendered.data),
    } : null,
    execution_owner_id: execution?.ownerId ?? null,
  };
  const result = await source.rpc("commit_customer_message_cycle", { target_command_id: identities.data.command_id, commit_payload: payload });
  if (result.error) return failed("persistence_failed", identities.data.command_id);
  const controlled = rpcFailureSchema.safeParse(result.data);
  if (controlled.success) {
    if (controlled.data.code === "ownership_lost") execution?.onOwnershipLost?.();
    return failed(controlled.data.code === "ownership_lost" ? "interaction_not_current" : controlled.data.code, identities.data.command_id);
  }
  const success = rpcSuccessSchema.safeParse(result.data);
  if (!success.success || success.data.command_id !== identities.data.command_id) return failed("persistence_failed", identities.data.command_id);
  return { success: true, kind: success.data.result_kind, command_id: success.data.command_id, runtime_revision: success.data.runtime_revision, knowledge_version: success.data.knowledge_version, outbound_message_id: success.data.outbound_message_id, pending_interaction_id: success.data.pending_interaction_id };
}

export async function failCustomerMessage(source: PersistentCycleCommitRpc, commandId: string, code: z.infer<typeof failureCode>, execution?: CycleExecutionContext): Promise<void> {
  const input = z.object({ commandId: uuid, code: failureCode }).strict().safeParse({ commandId, code });
  if (!input.success) return;
  const result = await source.rpc("fail_customer_message_cycle", { target_command_id: input.data.commandId, failure_code: input.data.code, execution_owner_id: execution?.ownerId });
  if (z.object({ success:z.literal(false), code:z.literal("ownership_lost") }).passthrough().safeParse(result.data).success) execution?.onOwnershipLost?.();
}

/** Separate controlled terminal boundary; no reviewer, approval, or descriptive claim is supplied. */
export async function completeCustomerMessageWithHumanReview(source: PersistentCycleCommitRpc, input: PersistentCycleHumanReview, execution?: CycleExecutionContext): Promise<PersistentCycleResult> {
  const parsed = z.object({ command_id: uuid, source_message_id: uuid, pending_interaction_id: uuid }).strict().safeParse({ command_id: input.command_id, source_message_id: input.source_message_id, pending_interaction_id: input.pending_interaction_id });
  const isReview = input.cycle_result.success
    ? input.cycle_result.cycle_status === "human_review_required"
    : input.cycle_result.requires_human_review;
  if (!parsed.success || !isReview) return failed("invalid_input", input.command_id);
  const result = await source.rpc("complete_customer_message_human_review", { target_command_id: parsed.data.command_id, review_payload: { ...parsed.data, execution_owner_id: execution?.ownerId ?? null } });
  if (result.error) return failed("persistence_failed", input.command_id);
  const success = z.object({ success:z.literal(true), command_id:uuid, runtime_revision:version, knowledge_version:version, pending_interaction_id:uuid.nullable() }).strict().safeParse(result.data);
  const lost = z.object({ success:z.literal(false), code:z.literal("ownership_lost") }).passthrough().safeParse(result.data);
  if (lost.success) execution?.onOwnershipLost?.();
  return success.success ? { success:true, kind:"human_review", command_id:success.data.command_id, runtime_revision:success.data.runtime_revision, knowledge_version:success.data.knowledge_version, outbound_message_id:null, pending_interaction_id:success.data.pending_interaction_id } : failed(lost.success ? "interaction_not_current" : "persistence_failed", input.command_id);
}
