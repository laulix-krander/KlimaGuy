import "server-only";
import { z } from "zod";
import { conversationCycleContextSchema } from "@/lib/domain/conversation-intelligence/conversation-cycle-schemas";
import { validatePlannerSnapshotRow } from "@/lib/actions/planner-snapshot-persistence";
import type { CustomerMessageCycleAuthority } from "@/lib/actions/persistent-conversation-cycle-service";

const uuid = z.string().uuid();
const version = z.number().int().positive();

export const CYCLE_AUTHORITY_READ_ERRORS = [
  "invalid_input", "command_not_found", "command_not_claimed", "source_message_invalid",
  "conversation_mismatch", "project_mismatch", "runtime_stale", "knowledge_stale",
  "pending_interaction_missing", "pending_interaction_stale", "snapshot_missing",
  "snapshot_invalid", "prompt_message_mismatch", "authority_incomplete",
] as const;
export type CycleAuthorityReadError = typeof CYCLE_AUTHORITY_READ_ERRORS[number];

const errorSchema = z.object({ success: z.literal(false), code: z.enum(CYCLE_AUTHORITY_READ_ERRORS) }).strict();
const authorityRowSchema = z.object({
  success: z.literal(true),
  command: z.object({ id: uuid, conversation_id: uuid, project_id: uuid, source_message_id: uuid,
    pending_interaction_id: uuid, expected_runtime_revision: version, expected_knowledge_version: version,
    execution_at: z.string().datetime({ offset: true }), correlation_id: uuid, interpretation_id: uuid,
    transition_id: uuid, claim_id: uuid, customer_evidence_id: uuid, system_evidence_id: uuid,
    apply_id: uuid, assessment_id: uuid, planner_decision_id: uuid, event_ids: z.array(uuid).length(5),
    next_evidence_request_id: uuid, next_pending_interaction_id: uuid, next_snapshot_id: uuid,
    next_outbound_message_id: uuid, event_sequence_start: version,
  }).strict(),
  source_message: z.object({ id: uuid, conversation_id: uuid, sequence: version, direction: z.literal("inbound"),
    actor_class: z.literal("customer"), message_kind: z.literal("text"), occurred_at: z.string().datetime({ offset: true }), text: z.string().min(1).max(20000) }).strict(),
  pending_interaction: z.object({ id: uuid, conversation_id: uuid, project_id: uuid, status: z.literal("pending"),
    runtime_revision: version, expected_knowledge_state_version: version, prompt_message_id: uuid, snapshot_id: uuid }).passthrough(),
  snapshot: z.unknown(),
  cycle_context: conversationCycleContextSchema.omit({ normalized_answer: true, execution_status: true }),
}).strict();

export type PersistentCycleContextReadSource = {
  rpc(name: "get_customer_message_cycle_context", args: { target_command_id: string }): Promise<{ data: unknown; error: unknown }>;
};

/** Machine-only, side-effect-free reconstruction of the exact claimed-cycle authority. */
export async function loadCustomerMessageCycleAuthority(source: PersistentCycleContextReadSource, commandId: string): Promise<
  { success: true; authority: CustomerMessageCycleAuthority } | { success: false; error: CycleAuthorityReadError }
> {
  if (!uuid.safeParse(commandId).success) return { success: false, error: "invalid_input" };
  const result = await source.rpc("get_customer_message_cycle_context", { target_command_id: commandId });
  if (result.error) return { success: false, error: "authority_incomplete" };
  const controlledError = errorSchema.safeParse(result.data);
  if (controlledError.success) return { success: false, error: controlledError.data.code };
  const parsed = authorityRowSchema.safeParse(result.data);
  if (!parsed.success) return { success: false, error: "authority_incomplete" };
  const row = parsed.data;
  const snapshot = validatePlannerSnapshotRow(row.snapshot, row.pending_interaction.id);
  if (!snapshot) return { success: false, error: "snapshot_invalid" };
  const { command, source_message: message, pending_interaction: pending, cycle_context: context } = row;
  if (command.id !== commandId || command.source_message_id !== message.id) return { success: false, error: "source_message_invalid" };
  if (command.conversation_id !== message.conversation_id || command.conversation_id !== pending.conversation_id || command.conversation_id !== context.conversation_id || command.conversation_id !== snapshot.conversation_id) return { success: false, error: "conversation_mismatch" };
  if (command.project_id !== pending.project_id || command.project_id !== context.project_id || command.project_id !== context.knowledge_state.project_id || command.project_id !== snapshot.project_id) return { success: false, error: "project_mismatch" };
  if (command.pending_interaction_id !== pending.id || pending.id !== snapshot.pending_interaction_id) return { success: false, error: "pending_interaction_stale" };
  if (command.expected_runtime_revision !== pending.runtime_revision || command.expected_runtime_revision !== snapshot.runtime_revision) return { success: false, error: "runtime_stale" };
  if (command.expected_knowledge_version !== pending.expected_knowledge_state_version || command.expected_knowledge_version !== context.expected_state_version || command.expected_knowledge_version !== context.knowledge_state.state_version || command.expected_knowledge_version !== snapshot.knowledge_state_version) return { success: false, error: "knowledge_stale" };
  if (pending.prompt_message_id !== snapshot.outbound_message_id || message.sequence <= snapshot.outbound_message_sequence) return { success: false, error: "prompt_message_mismatch" };
  if (context.cycle_id !== command.id || context.correlation_id !== command.correlation_id || context.occurred_at !== command.execution_at
    || context.interpretation_inputs.interpretation_id !== command.interpretation_id
    || context.interpretation_inputs.proposal_ids.transition_id !== command.transition_id
    || context.interpretation_inputs.proposal_ids.claim_id !== command.claim_id
    || context.interpretation_inputs.proposal_ids.customer_evidence_id !== command.customer_evidence_id
    || context.next_state_ids.apply_id !== command.apply_id || context.assessment_id !== command.assessment_id
    || context.planner_decision_id !== command.planner_decision_id || context.next_evidence_request_id !== command.next_evidence_request_id
    || context.event_sequence_start !== command.event_sequence_start || JSON.stringify(context.event_ids) !== JSON.stringify(command.event_ids)
    || context.interpretation_inputs.selected_action.decision_id !== snapshot.selected_action.decision_id
    || context.interpretation_inputs.rendered_interaction.decision_id !== snapshot.rendered_interaction.decision_id) return { success: false, error: "authority_incomplete" };
  return { success: true, authority: {
    command_id: command.id, conversation_id: command.conversation_id, project_id: command.project_id,
    message_id: message.id, message_sequence: message.sequence, message_text: message.text,
    message_occurred_at: message.occurred_at, direction: message.direction, actor_class: message.actor_class,
    message_kind: message.message_kind, prompt_sequence: snapshot.outbound_message_sequence,
    pending_interaction_id: pending.id, expected_runtime_revision: command.expected_runtime_revision,
    expected_knowledge_version: command.expected_knowledge_version, rendered_interaction: snapshot.rendered_interaction,
    cycle_context: context,
  } };
}
