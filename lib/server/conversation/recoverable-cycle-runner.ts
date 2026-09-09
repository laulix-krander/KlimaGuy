import "server-only";

import { randomUUID } from "node:crypto";
import { z } from "zod";
import { processPersistentCustomerMessage } from "@/lib/actions/persistent-conversation-cycle-service";
import { createPersistentCycleDataSource, type PersistentCycleDataSourceDependencies } from "@/lib/server/conversation/persistent-cycle-data-source";
import type { ProductiveCustomerAnswerInterpreter } from "@/lib/server/ai/customer-answer-interpreter";

/** The deterministic cycle has no network inference; five minutes bounds crash ownership without requiring heartbeats. */
export const CONVERSATION_CYCLE_LEASE_SECONDS = 5 * 60;
export const RECOVERABLE_CYCLE_DISCOVERY_LIMIT = 100;

export type RecoverableCycleRunnerResult =
  | Readonly<{ kind:"completed"; command_id?:string; outbound_message_id?:string }>
  | Readonly<{ kind:"human_review" | "already_terminal" | "failed" | "stale" | "busy" | "ownership_lost"; command_id?:string }>;

export type RecoverableCycleDependencies = PersistentCycleDataSourceDependencies & Readonly<{
  createOwnerId?: () => string;
  customerAnswerInterpreter?: ProductiveCustomerAnswerInterpreter;
}>;

/** Executes one internal message identity. Contents stay behind the C read authority. */
export async function runPersistentCustomerMessageCycle(
  dependencies: RecoverableCycleDependencies,
  input: Readonly<{ message_id:string }>,
): Promise<RecoverableCycleRunnerResult> {
  if (!z.string().uuid().safeParse(input.message_id).success) return { kind:"failed" };
  let ownershipLost = false;
  const source = createPersistentCycleDataSource(dependencies, {
    ownerId:(dependencies.createOwnerId ?? randomUUID)(),
    leaseSeconds:CONVERSATION_CYCLE_LEASE_SECONDS,
    onOwnershipLost:() => { ownershipLost = true; },
  });
  try {
    const result = await processPersistentCustomerMessage(source, input, dependencies.customerAnswerInterpreter);
    if (ownershipLost) return { kind:"ownership_lost", ...(result.command_id ? {command_id:result.command_id} : {}) };
    if (result.success) {
      if (result.kind === "already_processed") return { kind:"already_terminal", command_id:result.command_id };
      if (result.kind === "human_review") return { kind:"human_review", command_id:result.command_id };
      return { kind:"completed", command_id:result.command_id, ...(result.outbound_message_id ? {outbound_message_id:result.outbound_message_id} : {}) };
    }
    if (result.code === "interaction_not_current") return { kind:"busy", ...(result.command_id ? {command_id:result.command_id} : {}) };
    if (result.code === "stale_runtime_revision" || result.code === "stale_knowledge_version") return { kind:"stale", ...(result.command_id ? {command_id:result.command_id} : {}) };
    if (result.code === "persistence_failed" && result.command_id && !ownershipLost) {
      await source.failCustomerMessage(result.command_id, "persistence_failed");
      if (ownershipLost) return { kind:"ownership_lost", command_id:result.command_id };
    }
    return { kind:"failed", ...(result.command_id ? {command_id:result.command_id} : {}) };
  } catch {
    return ownershipLost ? { kind:"ownership_lost" } : { kind:"failed" };
  }
}

const recoverableRow = z.object({ command_id:z.string().uuid(), source_message_id:z.string().uuid(), lease_expired_at:z.string().datetime() }).strict();
const missingCommandRow = z.object({ source_message_id:z.string().uuid(), discovered_at:z.string().datetime() }).strict();
export type RecoverableCycleCandidate = Readonly<{ source_message_id:string; discovery_kind:"existing_command" | "missing_command" }>;
export type RecoveryDiscoverySource = {
  rpc(name:"discover_recoverable_conversation_cycles" | "discover_missing_customer_answer_cycles", args:{ result_limit:number }):Promise<{data:unknown;error:unknown}>;
};

export async function discoverRecoverableConversationCycles(source:RecoveryDiscoverySource, limit=RECOVERABLE_CYCLE_DISCOVERY_LIMIT) {
  const bounded = z.number().int().min(1).max(RECOVERABLE_CYCLE_DISCOVERY_LIMIT).catch(RECOVERABLE_CYCLE_DISCOVERY_LIMIT).parse(limit);
  const existingResponse = await source.rpc("discover_recoverable_conversation_cycles", {result_limit:bounded});
  const missingResponse = await source.rpc("discover_missing_customer_answer_cycles", {result_limit:bounded});
  const existing = existingResponse.error ? [] : z.array(recoverableRow).max(bounded).safeParse(existingResponse.data);
  const missing = missingResponse.error ? [] : z.array(missingCommandRow).max(bounded).safeParse(missingResponse.data);
  const candidates: RecoverableCycleCandidate[] = [];
  if (!Array.isArray(existing) && existing.success) candidates.push(...existing.data.map((row) => ({source_message_id:row.source_message_id, discovery_kind:"existing_command" as const})));
  const seen = new Set(candidates.map((candidate) => candidate.source_message_id));
  if (!Array.isArray(missing) && missing.success) {
    for (const row of missing.data) if (!seen.has(row.source_message_id) && candidates.length < bounded) candidates.push({source_message_id:row.source_message_id, discovery_kind:"missing_command"});
  }
  return candidates.slice(0, bounded);
}
