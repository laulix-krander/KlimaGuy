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
  failCustomerMessage,
  type PersistentCycleCommitRpc,
} from "@/lib/server/conversation/persistent-cycle-commit";
import type { CycleFailureCode, PersistentCycleResult } from "@/lib/domain/conversation-cycle-orchestration";

const uuid = z.string().uuid();
const version = z.number().int().positive();
const claimErrorCode = z.enum([
  "message_not_found", "conversation_not_processable", "message_not_inbound_customer_text",
  "pending_interaction_not_found", "stale_runtime_revision", "stale_knowledge_version",
  "message_precedes_interaction",
]);
const claimResult = z.object({
  success: z.literal(true), replay: z.literal(false), command_id: uuid,
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
      if (claimed.error) return { error: "persistence_failed" };
      if (busyClaim.safeParse(claimed.data).success) return { error: "interaction_not_current" };
      const failure = failedClaim.safeParse(claimed.data);
      if (failure.success) return { error: failure.data.code };
      const terminal = replayResult.safeParse(claimed.data);
      if (terminal.success) {
        const terminalReplay = replay(terminal.data);
        return terminalReplay ? { replay: terminalReplay } : { error: "interaction_not_current" };
      }
      const command = claimResult.safeParse(claimed.data);
      if (!command.success) return { error: "persistence_failed" };
      const loaded = await loadCustomerMessageCycleAuthority(dependencies.read, command.data.command_id);
      return loaded.success ? { authority: loaded.authority } : { error: READ_ERROR_MAP[loaded.error] };
    },
    commitCustomerMessageCycle: payload => execution ? commitCustomerMessageCycle(dependencies.commit, payload, execution) : commitCustomerMessageCycle(dependencies.commit, payload),
    completeCustomerMessageWithHumanReview: payload => execution ? completeCustomerMessageWithHumanReview(dependencies.commit, payload, execution) : completeCustomerMessageWithHumanReview(dependencies.commit, payload),
    failCustomerMessage: (commandId, code) => execution ? failCustomerMessage(dependencies.commit, commandId, code, execution) : failCustomerMessage(dependencies.commit, commandId, code),
  };
}
