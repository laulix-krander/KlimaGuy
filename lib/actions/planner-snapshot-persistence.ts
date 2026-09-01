import { z } from "zod";
import { selectedNextActionSchema } from "@/lib/domain/conversation-intelligence/question-planner-schemas";
import { renderedCustomerInteractionSchema } from "@/lib/domain/conversation-intelligence/question-template-schemas";
import type { RenderedCustomerInteraction } from "@/lib/domain/conversation-intelligence/question-template-types";

export const PLANNER_SNAPSHOT_SCHEMA_VERSION = 1 as const;

const uuid = z.string().uuid();
const version = z.number().int().positive();

export const plannerInteractionSnapshotSchema = z.object({
  snapshot_schema_version: z.literal(PLANNER_SNAPSHOT_SCHEMA_VERSION),
  selected_action: selectedNextActionSchema,
  rendered_interaction: renderedCustomerInteractionSchema,
}).strict().superRefine((snapshot, context) => {
  const action = snapshot.selected_action;
  const rendered = snapshot.rendered_interaction;
  if (action.project_id !== rendered.project_id || action.conversation_id !== rendered.conversation_id || action.decision_id !== rendered.decision_id) {
    context.addIssue({ code: "custom", message: "snapshot_identity_mismatch" });
  }
  if (action.template_key !== rendered.template_key || action.template_version !== rendered.template_version) {
    context.addIssue({ code: "custom", message: "snapshot_template_mismatch" });
  }
  if (action.answer_contract?.answer_type !== rendered.answer_contract?.answer_type) {
    context.addIssue({ code: "custom", message: "snapshot_answer_contract_mismatch" });
  }
  if (!rendered.customer_visible || !["question", "confirmation"].includes(rendered.message_kind)) {
    context.addIssue({ code: "custom", message: "snapshot_not_customer_answerable" });
  }
});

export type PlannerInteractionSnapshot = Readonly<z.infer<typeof plannerInteractionSnapshotSchema>>;

export const plannerSnapshotRowSchema = z.object({
  id: uuid,
  pending_interaction_id: uuid,
  conversation_id: uuid,
  project_id: uuid,
  runtime_revision: version,
  knowledge_state_version: version,
  outbound_message_id: uuid,
  outbound_message_sequence: version,
  snapshot_schema_version: z.literal(PLANNER_SNAPSHOT_SCHEMA_VERSION),
  selected_action: selectedNextActionSchema,
  rendered_interaction: renderedCustomerInteractionSchema,
  outbound_text: z.string().min(1).max(20000),
  created_at: z.string().datetime({ offset: true }),
}).strict();

export type PlannerSnapshotRow = Readonly<z.infer<typeof plannerSnapshotRowSchema>>;

export type PlannerSnapshotDataSource = {
  rpc(name: "activate_planner_interaction_snapshot" | "get_planner_interaction_snapshot", args: Record<string, unknown>): Promise<{ data: unknown; error: unknown }>;
};

export function composeRenderedCustomerText(interaction: Pick<RenderedCustomerInteraction, "primary_text" | "supporting_text" | "help_text">): string {
  return [interaction.primary_text, interaction.supporting_text, interaction.help_text].filter((part): part is string => Boolean(part)).join("\n\n");
}

export type ActivatePlannerSnapshotInput = Readonly<{
  snapshot_id: string;
  pending_interaction_id: string;
  outbound_message_id: string;
  expected_runtime_revision: number;
  idempotency_key: string;
  occurred_at: string;
  snapshot: unknown;
}>;

function validateSnapshotRow(value: unknown, expectedPendingId: string): PlannerSnapshotRow | undefined {
  const row = plannerSnapshotRowSchema.safeParse(value);
  if (!row.success || row.data.pending_interaction_id !== expectedPendingId) return undefined;
  const snapshot = plannerInteractionSnapshotSchema.safeParse({ snapshot_schema_version: row.data.snapshot_schema_version, selected_action: row.data.selected_action, rendered_interaction: row.data.rendered_interaction });
  if (!snapshot.success
    || row.data.conversation_id !== snapshot.data.selected_action.conversation_id
    || row.data.project_id !== snapshot.data.selected_action.project_id
    || row.data.knowledge_state_version !== snapshot.data.selected_action.based_on_state_version
    || composeRenderedCustomerText(snapshot.data.rendered_interaction) !== row.data.outbound_text) return undefined;
  return row.data;
}

/** Validates both domain generations before crossing the machine-only atomic RPC boundary. */
export async function activatePlannerInteractionSnapshot(source: PlannerSnapshotDataSource, input: ActivatePlannerSnapshotInput) {
  const ids = z.object({ snapshot_id: uuid, pending_interaction_id: uuid, outbound_message_id: uuid, expected_runtime_revision: version, idempotency_key: z.string().min(8).max(128), occurred_at: z.string().datetime({ offset: true }) }).strict().safeParse({ snapshot_id: input.snapshot_id, pending_interaction_id: input.pending_interaction_id, outbound_message_id: input.outbound_message_id, expected_runtime_revision: input.expected_runtime_revision, idempotency_key: input.idempotency_key, occurred_at: input.occurred_at });
  const snapshot = plannerInteractionSnapshotSchema.safeParse(input.snapshot);
  if (!ids.success || !snapshot.success) return { success: false as const, error: "invalid_input" as const };
  const rendered = snapshot.data.rendered_interaction;
  const result = await source.rpc("activate_planner_interaction_snapshot", {
    target_snapshot_id: ids.data.snapshot_id,
    target_pending_interaction_id: ids.data.pending_interaction_id,
    target_outbound_message_id: ids.data.outbound_message_id,
    target_conversation_id: rendered.conversation_id,
    expected_runtime_revision: ids.data.expected_runtime_revision,
    target_idempotency_key: ids.data.idempotency_key,
    target_occurred_at: ids.data.occurred_at,
    target_snapshot: snapshot.data,
    target_outbound_text: composeRenderedCustomerText(rendered),
  });
  if (result.error) return { success: false as const, error: "persistence_failed" as const };
  const row = validateSnapshotRow(result.data, ids.data.pending_interaction_id);
  if (!row || row.id !== ids.data.snapshot_id || row.outbound_message_id !== ids.data.outbound_message_id
    || row.selected_action.decision_id !== snapshot.data.selected_action.decision_id) return { success: false as const, error: "invalid_persistence" as const };
  return { success: true as const, snapshot: row };
}

/** Closed read boundary: no registry lookup, planner invocation, rendering, or defaults. */
export async function loadPlannerInteractionSnapshot(source: PlannerSnapshotDataSource, pendingInteractionId: string) {
  if (!uuid.safeParse(pendingInteractionId).success) return { success: false as const, error: "invalid_input" as const };
  const result = await source.rpc("get_planner_interaction_snapshot", { target_pending_interaction_id: pendingInteractionId });
  if (result.error || result.data === null) return { success: false as const, error: "snapshot_missing" as const };
  const row = validateSnapshotRow(result.data, pendingInteractionId);
  return row ? { success: true as const, snapshot: row } : { success: false as const, error: "invalid_persistence" as const };
}
