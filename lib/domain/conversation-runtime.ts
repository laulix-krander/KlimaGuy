import { z } from "zod";
import { conversationRetryStateSchema } from "./conversation-intelligence/conversation-cycle-schemas";
import { evidenceRequestStateSchema } from "./conversation-intelligence/evidence-request";
import { informationCollectionItemSchema, informationCollectionStateSchema } from "./conversation-intelligence/information-collection";
import { customerEffortStateSchema, plannerActionTypeSchema, plannerAnswerTypeSchema, retryStateSchema } from "./conversation-intelligence/question-planner-schemas";
import { getQuestionTemplate, QUESTION_TEMPLATE_REGISTRY } from "./conversation-intelligence/question-template-registry";
import { ALL_PROPERTY_KEYS, ENTITY_TYPES } from "./conversation-intelligence/types";

const uuid = z.string().uuid();
const timestamp = z.string().datetime({ offset: true });
const revision = z.number().int().positive();

export const CONVERSATION_RUNTIME_STATUSES = ["idle", "awaiting_customer_answer", "awaiting_evidence", "intermediate_break", "human_review", "collection_stopped"] as const;
export const PENDING_INTERACTION_STATUSES = ["pending", "answered", "superseded", "cancelled"] as const;

export const conversationRuntimeHeaderSchema = z.object({
  conversation_id: uuid, project_id: uuid, revision, knowledge_state_version: revision,
  runtime_status: z.enum(CONVERSATION_RUNTIME_STATUSES), active_pending_interaction_id: uuid.nullable(),
  active_evidence_request_id: uuid.nullable(), created_at: timestamp, updated_at: timestamp,
}).strict().superRefine((value, context) => {
  const pending = value.active_pending_interaction_id !== null;
  const evidence = value.active_evidence_request_id !== null;
  if (pending && evidence) context.addIssue({ code: "custom", message: "competing_customer_actions" });
  if (pending !== (value.runtime_status === "awaiting_customer_answer")) context.addIssue({ code: "custom", message: "pending_status_mismatch" });
  if (evidence !== (value.runtime_status === "awaiting_evidence")) context.addIssue({ code: "custom", message: "evidence_status_mismatch" });
  if (["intermediate_break", "human_review", "collection_stopped"].includes(value.runtime_status) && (pending || evidence)) context.addIssue({ code: "custom", message: "inactive_boundary_has_action" });
});

export const pendingInteractionSchema = z.object({
  id: uuid, conversation_id: uuid, project_id: uuid, decision_id: uuid,
  selected_action_type: plannerActionTypeSchema, information_key: z.enum(ALL_PROPERTY_KEYS).nullable(),
  entity_type: z.enum(ENTITY_TYPES), entity_id: uuid, template_key: z.string().min(1).max(100),
  template_version: revision, locale: z.literal("de"), answer_type: plannerAnswerTypeSchema,
  expected_knowledge_state_version: revision, runtime_revision: revision,
  status: z.enum(PENDING_INTERACTION_STATUSES), answered_by_message_id: uuid.nullable(),
  created_at: timestamp, answered_at: timestamp.nullable(), superseded_at: timestamp.nullable(), cancelled_at: timestamp.nullable(),
}).strict().superRefine((value, context) => {
  const terminalTimes = [value.answered_at, value.superseded_at, value.cancelled_at].filter(Boolean).length;
  if (value.status === "pending" && (terminalTimes || value.answered_by_message_id)) context.addIssue({ code: "custom", message: "pending_has_terminal_binding" });
  if (value.status === "answered" && (!value.answered_at || !value.answered_by_message_id)) context.addIssue({ code: "custom", message: "answered_binding_required" });
  if (value.status === "superseded" && !value.superseded_at) context.addIssue({ code: "custom", message: "superseded_at_required" });
  if (value.status === "cancelled" && !value.cancelled_at) context.addIssue({ code: "custom", message: "cancelled_at_required" });
});

export type ConversationRuntimeHeader = z.infer<typeof conversationRuntimeHeaderSchema>;
export type PendingInteraction = z.infer<typeof pendingInteractionSchema>;
export type PendingInteractionCurrentResult = "current" | "not_pending" | "conversation_mismatch" | "project_mismatch" | "inactive_interaction" | "runtime_revision_mismatch" | "stale_knowledge_version" | "future_knowledge_version";

export function validatePendingTemplateBinding(interaction: PendingInteraction): boolean {
  const parsed = pendingInteractionSchema.safeParse(interaction);
  if (!parsed.success) return false;
  const template = getQuestionTemplate(QUESTION_TEMPLATE_REGISTRY, parsed.data.template_key, parsed.data.locale, parsed.data.template_version);
  return Boolean(template?.answer_contract && template.supported_action_type === parsed.data.selected_action_type && template.answer_contract.answer_type === parsed.data.answer_type && (!template.information_key || template.information_key === parsed.data.information_key));
}

export function isPendingInteractionCurrent(input: { interaction: unknown; runtime: unknown; conversation_id: string; project_id: string; current_knowledge_state_version: number }): PendingInteractionCurrentResult {
  const interaction = pendingInteractionSchema.safeParse(input.interaction);
  const runtime = conversationRuntimeHeaderSchema.safeParse(input.runtime);
  if (!interaction.success || !runtime.success || interaction.data.status !== "pending") return "not_pending";
  if (interaction.data.conversation_id !== input.conversation_id || runtime.data.conversation_id !== input.conversation_id) return "conversation_mismatch";
  if (interaction.data.project_id !== input.project_id || runtime.data.project_id !== input.project_id) return "project_mismatch";
  if (runtime.data.active_pending_interaction_id !== interaction.data.id) return "inactive_interaction";
  if (interaction.data.runtime_revision !== runtime.data.revision) return "runtime_revision_mismatch";
  if (interaction.data.expected_knowledge_state_version > runtime.data.knowledge_state_version || interaction.data.expected_knowledge_state_version > input.current_knowledge_state_version) return "future_knowledge_version";
  if (interaction.data.expected_knowledge_state_version !== runtime.data.knowledge_state_version || interaction.data.expected_knowledge_state_version !== input.current_knowledge_state_version) return "stale_knowledge_version";
  return "current";
}

export const runtimeCollectionRowSchema = z.object({ conversation_id: uuid, project_id: uuid, runtime_revision: revision, collection_version: z.number().int().nonnegative(), item: informationCollectionItemSchema }).strict();
export const runtimeRetryRowSchema = z.object({ conversation_id: uuid, project_id: uuid, runtime_revision: revision, item: retryStateSchema }).strict();
export const runtimeEffortRowSchema = customerEffortStateSchema.extend({ conversation_id: uuid, project_id: uuid, runtime_revision: revision }).strict();
export const runtimeEvidenceStateSchema = z.object({ state: evidenceRequestStateSchema, runtime_revision: revision }).strict();
export const runtimeEvidenceRequestRowSchema = z.object({ request_id: uuid, conversation_id: uuid, project_id: uuid, target_key: z.string().min(1), bundle_key: z.string().nullable(), status: z.enum(["planned", "requested", "provided", "skipped", "declined", "superseded", "cancelled"]), requested_information_keys: z.array(z.enum(ALL_PROPERTY_KEYS)).min(1), purpose_codes: z.array(z.string().min(1)).min(1), required_views: z.array(z.string().min(1)).min(1), minimum_count: revision, maximum_count: revision, attempts: z.number().int().min(1).max(2), requested_at: timestamp, resolved_at: timestamp.nullable(), resolved_by_message_id: uuid.nullable(), evidence_revision: z.number().int().nonnegative(), runtime_revision: revision, created_at: timestamp, updated_at: timestamp }).strict().refine(value => value.maximum_count >= value.minimum_count);

export function materializeCollectionState(projectId: string, conversationId: string, rows: unknown[], updatedAt: string) {
  const parsed = z.array(runtimeCollectionRowSchema).parse(rows);
  if (parsed.some(row => row.project_id !== projectId || row.conversation_id !== conversationId) || new Set(parsed.map(row => row.runtime_revision)).size > 1) throw new Error("runtime_binding_mismatch");
  const version = parsed[0]?.collection_version ?? 0;
  if (parsed.some(row => row.collection_version !== version)) throw new Error("collection_version_mismatch");
  return informationCollectionStateSchema.parse({ project_id: projectId, conversation_id: conversationId, version, items: parsed.map(row => row.item), updated_at: updatedAt });
}

export function materializeRetryState(projectId: string, conversationId: string, rows: unknown[], updatedAt: string) {
  const parsed = z.array(runtimeRetryRowSchema).parse(rows);
  if (parsed.some(row => row.project_id !== projectId || row.conversation_id !== conversationId) || new Set(parsed.map(row => row.runtime_revision)).size > 1) throw new Error("runtime_binding_mismatch");
  return conversationRetryStateSchema.parse({ project_id: projectId, conversation_id: conversationId, items: parsed.map(row => row.item), updated_at: updatedAt });
}

export function materializeEffortState(row: unknown) {
  const parsed = runtimeEffortRowSchema.parse(row);
  return customerEffortStateSchema.parse({ consecutive_technical_questions: parsed.consecutive_technical_questions, unanswered_questions: parsed.unanswered_questions, repeated_questions: parsed.repeated_questions, ...(parsed.last_break_at ? { last_break_at: parsed.last_break_at } : {}) });
}

export function materializeEvidenceRequestState(row: unknown) {
  const parsed = runtimeEvidenceStateSchema.parse(row);
  return evidenceRequestStateSchema.parse(parsed.state);
}
