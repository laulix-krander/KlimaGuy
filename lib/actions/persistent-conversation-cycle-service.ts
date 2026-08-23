import "server-only";
import { normalizeCustomerAnswer } from "@/lib/domain/conversation-intelligence/answer-normalization";
import { runConversationCycle } from "@/lib/domain/conversation-intelligence/conversation-cycle";
import type { ConversationCycleContext, ConversationCycleSuccess } from "@/lib/domain/conversation-intelligence/conversation-cycle-types";
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
export type PersistentCycleDataSource = {
  /** The RPC performs authorization and locks Conversation, Runtime, Pending, Knowledge, then Command. */
  claimCustomerMessage(messageId: string): Promise<{ authority?: CustomerMessageCycleAuthority; replay?: TerminalReplay; error?: CycleFailureCode }>;
  /** One database transaction applies Knowledge transition and the complete runtime/outbound generation. */
  commitCustomerMessageCycle(payload: PersistentCycleCommit): Promise<PersistentCycleResult>;
  failCustomerMessage(commandId: string, code: "normalization_failed" | "cycle_failed"): Promise<void>;
};
const failed = (code: CycleFailureCode, command_id?: string): PersistentCycleResult => ({ success:false, kind:"failed", code, retry_class:classifyCycleFailure(code), ...(command_id ? { command_id } : {}) });

/** Trusted server-only orchestration. The caller supplies only an immutable internal Message identity. */
export async function processPersistentCustomerMessage(source: PersistentCycleDataSource, input: unknown): Promise<PersistentCycleResult> {
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
  const cycle = runConversationCycle({ ...a.cycle_context, normalized_answer:normalized.normalized_answer, execution_status:"not_processed" });
  if (!cycle.success) { await source.failCustomerMessage(a.command_id, "cycle_failed"); return failed("cycle_failed", a.command_id); }
  return source.commitCustomerMessageCycle({ command_id:a.command_id, source_message_id:a.message_id, pending_interaction_id:a.pending_interaction_id, expected_runtime_revision:a.expected_runtime_revision, expected_knowledge_version:a.expected_knowledge_version, cycle });
}
