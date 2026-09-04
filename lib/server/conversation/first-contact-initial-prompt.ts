import "server-only";

import { randomUUID } from "node:crypto";
import { z } from "zod";
import { deriveMissingInformation } from "@/lib/domain/conversation-intelligence/readiness";
import { buildIntermediateAssessment } from "@/lib/domain/conversation-intelligence/intermediate-assessment";
import { planNextAction } from "@/lib/domain/conversation-intelligence/question-planner";
import { renderQuestionTemplate } from "@/lib/domain/conversation-intelligence/question-template-renderer";
import { plannerInteractionSnapshotSchema, composeRenderedCustomerText } from "@/lib/actions/planner-snapshot-persistence";

const uuid = z.string().uuid();
const version = z.number().int().positive();
const identityResult = z.object({
  status: z.enum(["initialized", "already_initialized"]), conversation_id: uuid, project_id: uuid,
  runtime_revision: version, knowledge_state_version: version, interaction_id: uuid,
  planner_snapshot_id: uuid, outbound_message_id: uuid, delivery_command_id: uuid,
}).strict();
const replayResult = identityResult.extend({ status: z.literal("already_initialized") });
const contextResult = z.union([
  z.object({ status: z.literal("eligible"), conversation_id: uuid, project_id: uuid, runtime_revision: version, knowledge_state_version: version }).strict(),
  replayResult,
  z.object({ status: z.enum(["already_advanced", "not_applicable", "invalid_state"]) }).passthrough(),
]);

export type InitialPromptResult =
  | z.infer<typeof identityResult>
  | { status: "already_advanced" | "not_applicable" | "stale" | "invalid_state" | "planning_failed" | "persistence_failed" };
export type InitialPromptRpc = { rpc(name: "get_first_contact_initial_prompt_context" | "commit_first_contact_initial_prompt", args: Record<string, unknown>): Promise<{ data: unknown; error: unknown }> };

/** Pure planner/renderer composition around two narrow service-only database authorities. */
export async function initializeFirstContactPrompt(source: InitialPromptRpc, conversationId: string, now = new Date()): Promise<InitialPromptResult> {
  if (!uuid.safeParse(conversationId).success) return { status: "invalid_state" };
  const loaded = await source.rpc("get_first_contact_initial_prompt_context", { target_conversation_id: conversationId });
  if (loaded.error) return { status: "persistence_failed" };
  const parsed = contextResult.safeParse(loaded.data);
  if (!parsed.success) return { status: "persistence_failed" };
  if (parsed.data.status !== "eligible") return parsed.data.status === "already_initialized" ? parsed.data : { status: parsed.data.status };
  const context = parsed.data;
  const occurredAt = now.toISOString();
  const knowledgeState = { project_id: context.project_id, conversation_id: context.conversation_id, state_version: context.knowledge_state_version, claims: [], updated_at: occurredAt };
  const assessment = buildIntermediateAssessment(knowledgeState, { assessment_id: randomUUID(), project_id: context.project_id, conversation_id: context.conversation_id, based_on_state_version: context.knowledge_state_version, created_at: occurredAt, created_by_actor_class: "system" });
  if (!assessment.success) return { status: "planning_failed" };
  const planned = planNextAction({ project_id: context.project_id, conversation_id: context.conversation_id, state_version: context.knowledge_state_version, knowledge_state: knowledgeState,
    information_collection_state: { project_id: context.project_id, conversation_id: context.conversation_id, version: 0, items: [], updated_at: occurredAt }, intermediate_assessment: assessment.data,
    missing_information: deriveMissingInformation(knowledgeState), target_readiness_level: "level_3_preliminary_installation", retry_state: [], revisit_triggers: [],
    customer_effort_state: { consecutive_technical_questions: 0, unanswered_questions: 0, repeated_questions: 0 }, created_at: occurredAt,
  }, { decision_id: randomUUID(), created_at: occurredAt });
  if (!planned.success || planned.data.kind !== "selected_action") return { status: "planning_failed" };
  const rendered = renderQuestionTemplate({ selected_action: planned.data.action, locale: "de", template_version: 1, render_parameters: {} });
  if (!rendered.success) return { status: "planning_failed" };
  const snapshot = plannerInteractionSnapshotSchema.safeParse({ snapshot_schema_version: 1, selected_action: planned.data.action, rendered_interaction: rendered.interaction });
  if (!snapshot.success) return { status: "planning_failed" };
  const ids = { interaction: randomUUID(), snapshot: randomUUID(), outbound: randomUUID(), delivery: randomUUID() };
  const committed = await source.rpc("commit_first_contact_initial_prompt", { target_conversation_id: context.conversation_id, expected_project_id: context.project_id,
    expected_knowledge_version: context.knowledge_state_version, expected_runtime_revision: context.runtime_revision, target_interaction_id: ids.interaction,
    target_snapshot_id: ids.snapshot, target_outbound_message_id: ids.outbound, target_delivery_command_id: ids.delivery, target_occurred_at: occurredAt,
    target_snapshot: snapshot.data, target_outbound_text: composeRenderedCustomerText(rendered.interaction) });
  if (committed.error) return { status: "persistence_failed" };
  const success = identityResult.safeParse(committed.data);
  if (success.success) return success.data;
  const closed = z.object({ status: z.enum(["already_advanced", "not_applicable", "stale", "invalid_state"]) }).passthrough().safeParse(committed.data);
  return closed.success ? { status: closed.data.status } : { status: "persistence_failed" };
}
