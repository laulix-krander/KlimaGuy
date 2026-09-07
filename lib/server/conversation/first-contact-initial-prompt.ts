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
  | { status: "already_advanced" | "not_applicable" | "stale" }
  | { status: "invalid_state" | "planning_failed" | "persistence_failed"; diagnostic: FirstContactDiagnostic };
export type InitialPromptRpc = { rpc(name: "get_first_contact_initial_prompt_context" | "commit_first_contact_initial_prompt", args: Record<string, unknown>): Promise<{ data: unknown; error: unknown }> };

export type FirstContactDiagnostic =
  | { diagnostic_code: "initial_prompt_adapter_unavailable"; stage: "initial_prompt_adapter" }
  | { diagnostic_code: "initial_context_rpc_failed" | "initial_context_result_invalid"; stage: "initial_context" }
  | { diagnostic_code: "initial_context_result_rejected"; stage: "initial_context"; result_code: "invalid_state" }
  | { diagnostic_code: "assessment_failed"; stage: "assessment" }
  | { diagnostic_code: "planning_failed"; stage: "planning" }
  | { diagnostic_code: "rendering_failed"; stage: "rendering" }
  | { diagnostic_code: "snapshot_validation_failed"; stage: "snapshot_validation" }
  | { diagnostic_code: "commit_rpc_failed" | "commit_result_invalid"; stage: "commit" }
  | { diagnostic_code: "commit_result_rejected"; stage: "commit"; result_code: "invalid_state" };

type InitialPromptDependencies = Readonly<{
  assess?: typeof buildIntermediateAssessment;
  plan?: typeof planNextAction;
  render?: typeof renderQuestionTemplate;
  validateSnapshot?: typeof plannerInteractionSnapshotSchema.safeParse;
}>;

const failure = (status: "invalid_state" | "planning_failed" | "persistence_failed", diagnostic: FirstContactDiagnostic): InitialPromptResult => ({ status, diagnostic });

/** Pure planner/renderer composition around two narrow service-only database authorities. */
export async function initializeFirstContactPrompt(source: InitialPromptRpc, conversationId: string, now = new Date(), dependencies: InitialPromptDependencies = {}): Promise<InitialPromptResult> {
  if (!uuid.safeParse(conversationId).success) return failure("invalid_state", { diagnostic_code: "initial_context_result_rejected", stage: "initial_context", result_code: "invalid_state" });
  let loaded: Awaited<ReturnType<InitialPromptRpc["rpc"]>>;
  try { loaded = await source.rpc("get_first_contact_initial_prompt_context", { target_conversation_id: conversationId }); }
  catch { return failure("persistence_failed", { diagnostic_code: "initial_context_rpc_failed", stage: "initial_context" }); }
  if (loaded.error) return failure("persistence_failed", { diagnostic_code: "initial_context_rpc_failed", stage: "initial_context" });
  const parsed = contextResult.safeParse(loaded.data);
  if (!parsed.success) return failure("persistence_failed", { diagnostic_code: "initial_context_result_invalid", stage: "initial_context" });
  if (parsed.data.status !== "eligible") {
    if (parsed.data.status === "already_initialized") return parsed.data;
    if (parsed.data.status === "invalid_state") return failure("invalid_state", { diagnostic_code: "initial_context_result_rejected", stage: "initial_context", result_code: "invalid_state" });
    return { status: parsed.data.status };
  }
  const context = parsed.data;
  const occurredAt = now.toISOString();
  const knowledgeState = { project_id: context.project_id, conversation_id: context.conversation_id, state_version: context.knowledge_state_version, claims: [], updated_at: occurredAt };
  let assessment: ReturnType<typeof buildIntermediateAssessment>;
  try { assessment = (dependencies.assess ?? buildIntermediateAssessment)(knowledgeState, { assessment_id: randomUUID(), project_id: context.project_id, conversation_id: context.conversation_id, based_on_state_version: context.knowledge_state_version, created_at: occurredAt, created_by_actor_class: "system" }); }
  catch { return failure("planning_failed", { diagnostic_code: "assessment_failed", stage: "assessment" }); }
  if (!assessment.success) return failure("planning_failed", { diagnostic_code: "assessment_failed", stage: "assessment" });
  let planned: ReturnType<typeof planNextAction>;
  try { planned = (dependencies.plan ?? planNextAction)({ project_id: context.project_id, conversation_id: context.conversation_id, state_version: context.knowledge_state_version, knowledge_state: knowledgeState,
    information_collection_state: { project_id: context.project_id, conversation_id: context.conversation_id, version: 0, items: [], updated_at: occurredAt }, intermediate_assessment: assessment.data,
    missing_information: deriveMissingInformation(knowledgeState), target_readiness_level: "level_3_preliminary_installation", retry_state: [], revisit_triggers: [],
    customer_effort_state: { consecutive_technical_questions: 0, unanswered_questions: 0, repeated_questions: 0 }, created_at: occurredAt,
  }, { decision_id: randomUUID(), created_at: occurredAt }); }
  catch { return failure("planning_failed", { diagnostic_code: "planning_failed", stage: "planning" }); }
  if (!planned.success || planned.data.kind !== "selected_action") return failure("planning_failed", { diagnostic_code: "planning_failed", stage: "planning" });
  let rendered: ReturnType<typeof renderQuestionTemplate>;
  try { rendered = (dependencies.render ?? renderQuestionTemplate)({ selected_action: planned.data.action, locale: "de", template_version: 1, render_parameters: {} }); }
  catch { return failure("planning_failed", { diagnostic_code: "rendering_failed", stage: "rendering" }); }
  if (!rendered.success) return failure("planning_failed", { diagnostic_code: "rendering_failed", stage: "rendering" });
  const snapshot = (dependencies.validateSnapshot ?? plannerInteractionSnapshotSchema.safeParse.bind(plannerInteractionSnapshotSchema))({ snapshot_schema_version: 1, selected_action: planned.data.action, rendered_interaction: rendered.interaction });
  if (!snapshot.success) return failure("planning_failed", { diagnostic_code: "snapshot_validation_failed", stage: "snapshot_validation" });
  const ids = { interaction: randomUUID(), snapshot: randomUUID(), outbound: randomUUID(), delivery: randomUUID() };
  let committed: Awaited<ReturnType<InitialPromptRpc["rpc"]>>;
  try { committed = await source.rpc("commit_first_contact_initial_prompt", { target_conversation_id: context.conversation_id, expected_project_id: context.project_id,
    expected_knowledge_version: context.knowledge_state_version, expected_runtime_revision: context.runtime_revision, target_interaction_id: ids.interaction,
    target_snapshot_id: ids.snapshot, target_outbound_message_id: ids.outbound, target_delivery_command_id: ids.delivery, target_occurred_at: occurredAt,
    target_snapshot: snapshot.data, target_outbound_text: composeRenderedCustomerText(rendered.interaction) }); }
  catch { return failure("persistence_failed", { diagnostic_code: "commit_rpc_failed", stage: "commit" }); }
  if (committed.error) return failure("persistence_failed", { diagnostic_code: "commit_rpc_failed", stage: "commit" });
  const success = identityResult.safeParse(committed.data);
  if (success.success) return success.data;
  const closed = z.object({ status: z.enum(["already_advanced", "not_applicable", "stale", "invalid_state"]) }).passthrough().safeParse(committed.data);
  if (!closed.success) return failure("persistence_failed", { diagnostic_code: "commit_result_invalid", stage: "commit" });
  if (closed.data.status === "invalid_state") return failure("invalid_state", { diagnostic_code: "commit_result_rejected", stage: "commit", result_code: "invalid_state" });
  return { status: closed.data.status };
}
