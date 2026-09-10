import "server-only";

import { z } from "zod";
import {
  loadCustomerMessageCycleAuthority,
  type CycleAuthorityReadError,
  type PersistentCycleContextReadSource,
} from "@/lib/actions/persistent-cycle-context-read";
import type {
  PersistentCycleDataSource,
} from "@/lib/actions/persistent-conversation-cycle-service";
import {
  commitCustomerMessageCycle,
  completeCustomerMessageWithHumanReview,
  completeCustomerMessageWithTechnicalHumanReview, commitCustomerMessageCycleWithoutClaim,
  deferCustomerMessageAiRetry, reserveCustomerAnswerAiInferenceAttempt,
  loadCustomerAnswerAiInferenceResult,persistCustomerAnswerAiInferenceResult,
  failCustomerMessage,
  type PersistentCycleCommitRpc,
} from "@/lib/server/conversation/persistent-cycle-commit";
import type { CycleFailureCode, PersistentCycleResult } from "@/lib/domain/conversation-cycle-orchestration";
import { classifyAcquisitionRpcError } from "@/lib/server/conversation/acquisition-rpc-diagnostics";

const uuid = z.string().uuid();
const version = z.number().int().positive();
const claimErrorCode = z.enum([
  "message_not_found", "conversation_not_processable", "message_not_inbound_customer_text",
  "pending_interaction_not_found", "stale_runtime_revision", "stale_knowledge_version",
  "message_precedes_interaction", "interaction_not_current",
]);
const claimResult = z.object({
  success: z.literal(true), replay: z.literal(false), command_id: uuid,
  technical_rehabilitated: z.boolean().optional(),
  technical_rehabilitation_count: z.number().int().min(0).max(1).optional(),
  previous_execution_attempt_count: z.number().int().nonnegative().nullable().optional(),
  technical_epoch_attempt_limit: z.number().int().positive().optional(),
  legacy_human_review_rehabilitation_attempted: z.boolean().optional(),
  legacy_human_review_rehabilitation_succeeded: z.boolean().optional(),
  legacy_human_review_rehabilitation_result_code: z.string().max(64).optional(),
}).passthrough();
const replayResult = z.object({
  success: z.literal(true), replay: z.literal(true), command_id: uuid,
  status: z.enum(["completed", "stale", "human_review_required"]),
  result_code: z.string().nullable(), result_runtime_revision: version.nullable(),
  result_knowledge_version: version.nullable(), outbound_message_id: uuid.nullable(),
}).passthrough();
const failedClaim = z.object({ success: z.literal(false), code: claimErrorCode }).passthrough();
const busyClaim = z.object({ success:z.literal(false), code:z.literal("busy"), command_id:uuid }).passthrough();

export type PersistentCycleClaimSource = {
  rpc(name: "claim_customer_message_cycle" | "acquire_customer_message_cycle_execution", args: Record<string, unknown>): Promise<{ data: unknown; error: unknown }>;
};

export type CycleExecutionContext = Readonly<{
  ownerId: string;
  leaseSeconds: number;
  onOwnershipLost?: () => void;
  onTechnicalRehabilitated?: (details: Readonly<{ rehabilitationCount:number; previousExecutionAttemptCount:number; freshEpochBudget:number }>) => void;
  onLegacyHumanReviewRehabilitation?: (details: Readonly<{ attempted:boolean; succeeded:boolean; resultCode:string }>) => void;
}>;

export type PersistentCycleDataSourceDependencies = {
  claim: PersistentCycleClaimSource;
  read: PersistentCycleContextReadSource;
  commit: PersistentCycleCommitRpc;
};

const READ_ERROR_MAP: Record<CycleAuthorityReadError, CycleFailureCode> = {
  invalid_input: "invalid_input",
  command_not_found: "message_not_found",
  command_not_claimed: "interaction_not_current",
  source_message_invalid: "message_conversation_mismatch",
  conversation_mismatch: "message_conversation_mismatch",
  project_mismatch: "message_conversation_mismatch",
  runtime_stale: "stale_runtime_revision",
  knowledge_stale: "stale_knowledge_version",
  pending_interaction_missing: "pending_interaction_not_found",
  pending_interaction_stale: "interaction_not_current",
  snapshot_missing: "interaction_not_current",
  snapshot_invalid: "interaction_not_current",
  prompt_message_mismatch: "interaction_not_current",
  authority_incomplete: "persistence_failed",
};

function replay(data: z.infer<typeof replayResult>): Extract<PersistentCycleResult, { success: true }> | undefined {
  if (data.status === "stale" || data.result_runtime_revision === null || data.result_knowledge_version === null) return undefined;
  const kind = data.status === "human_review_required" ? "human_review" : z.enum([
    "completed_with_next_interaction", "intermediate_break", "evidence_request", "collection_stopped",
  ]).catch("collection_stopped").parse(data.result_code);
  return { success: true, kind, command_id: data.command_id, runtime_revision: data.result_runtime_revision,
    knowledge_version: data.result_knowledge_version, outbound_message_id: data.outbound_message_id,
    pending_interaction_id: null };
}

/**
 * Composes the existing claim, AP-16-06-01C read, and AP-16-06-01E write authorities.
 * The caller retains ownership of the central server/service-role client.
 */
export function createPersistentCycleDataSource(
  dependencies: PersistentCycleDataSourceDependencies,
  execution?: CycleExecutionContext,
): PersistentCycleDataSource {
  return {
    async claimCustomerMessage(messageId) {
      if (!uuid.safeParse(messageId).success) return { error: "invalid_input" };
      const claimed = execution
        ? await dependencies.claim.rpc("acquire_customer_message_cycle_execution", {
            target_message_id: messageId,
            execution_owner: execution.ownerId,
            lease_seconds: execution.leaseSeconds,
          })
        : await dependencies.claim.rpc("claim_customer_message_cycle", { target_message_id: messageId });
      if (claimed.error) return { error: "persistence_failed", failure_stage: "acquisition" as const, failure_category: "rpc_error" as const, ...classifyAcquisitionRpcError(claimed.error) };
      if (busyClaim.safeParse(claimed.data).success) return { error: "interaction_not_current" };
      const failure = failedClaim.safeParse(claimed.data);
      if (failure.success) return { error: failure.data.code };
      const terminal = replayResult.safeParse(claimed.data);
      if (terminal.success) {
        const terminalReplay = replay(terminal.data);
        return terminalReplay ? { replay: terminalReplay } : { error: "interaction_not_current" };
      }
      const command = claimResult.safeParse(claimed.data);
      if (!command.success) return { error: "persistence_failed", failure_stage: "acquisition" as const, failure_category: "response_validation_error" as const };
      if (command.data.technical_rehabilitated === true && command.data.technical_rehabilitation_count !== undefined && command.data.previous_execution_attempt_count != null && command.data.technical_epoch_attempt_limit !== undefined) {
        execution?.onTechnicalRehabilitated?.({ rehabilitationCount:command.data.technical_rehabilitation_count, previousExecutionAttemptCount:command.data.previous_execution_attempt_count, freshEpochBudget:command.data.technical_epoch_attempt_limit });
      }
      if (command.data.legacy_human_review_rehabilitation_attempted === true) {
        execution?.onLegacyHumanReviewRehabilitation?.({
          attempted:true,
          succeeded:command.data.legacy_human_review_rehabilitation_succeeded === true,
          resultCode:command.data.legacy_human_review_rehabilitation_result_code ?? "unknown",
        });
      }
      const loaded = await loadCustomerMessageCycleAuthority(dependencies.read, command.data.command_id);
      return loaded.success ? { authority: loaded.authority } : {
        error: READ_ERROR_MAP[loaded.error], command_id: command.data.command_id,
        failure_stage: "context_read" as const,
        failure_category: loaded.failure_category ?? "authority_rejected" as const,
        ...(loaded.rpc_diagnostic?.safe_rpc_code ? { safe_rpc_code: loaded.rpc_diagnostic.safe_rpc_code } : {}),
        ...(loaded.rpc_diagnostic?.safe_rpc_summary ? { safe_rpc_summary: loaded.rpc_diagnostic.safe_rpc_summary } : {}),
      };
    },
    commitCustomerMessageCycle: payload => execution ? commitCustomerMessageCycle(dependencies.commit, payload, execution) : commitCustomerMessageCycle(dependencies.commit, payload),
    reserveCustomerAnswerAiInferenceAttempt: payload => execution ? reserveCustomerAnswerAiInferenceAttempt(dependencies.commit, payload, execution) : reserveCustomerAnswerAiInferenceAttempt(dependencies.commit, payload),
    loadCustomerAnswerAiInferenceResult: payload => execution ? loadCustomerAnswerAiInferenceResult(dependencies.commit,payload,execution) : loadCustomerAnswerAiInferenceResult(dependencies.commit,payload),
    persistCustomerAnswerAiInferenceResult: payload => execution ? persistCustomerAnswerAiInferenceResult(dependencies.commit,payload,execution) : persistCustomerAnswerAiInferenceResult(dependencies.commit,payload),
    deferCustomerMessageAiRetry: payload => execution ? deferCustomerMessageAiRetry(dependencies.commit, payload, execution) : deferCustomerMessageAiRetry(dependencies.commit, payload),
    commitCustomerMessageCycleWithoutClaim: payload => execution ? commitCustomerMessageCycleWithoutClaim(dependencies.commit, payload, execution) : commitCustomerMessageCycleWithoutClaim(dependencies.commit, payload),
    completeCustomerMessageWithTechnicalHumanReview: payload => execution ? completeCustomerMessageWithTechnicalHumanReview(dependencies.commit, payload, execution) : completeCustomerMessageWithTechnicalHumanReview(dependencies.commit, payload),
    completeCustomerMessageWithHumanReview: payload => execution ? completeCustomerMessageWithHumanReview(dependencies.commit, payload, execution) : completeCustomerMessageWithHumanReview(dependencies.commit, payload),
    failCustomerMessage: (commandId, code) => execution ? failCustomerMessage(dependencies.commit, commandId, code, execution) : failCustomerMessage(dependencies.commit, commandId, code),
  };
}
