import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { loadCustomerMessageCycleAuthority } from "@/lib/actions/persistent-cycle-context-read";
import { composeRenderedCustomerText, PLANNER_SNAPSHOT_SCHEMA_VERSION } from "@/lib/actions/planner-snapshot-persistence";
import { createSyntheticConversationCycleContext } from "@/lib/domain/conversation-intelligence/conversation-cycle-fixtures";

const ids = Array.from({ length: 30 }, (_, index) => `91000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`);
const fixture = createSyntheticConversationCycleContext();
const { normalized_answer: _normalized, execution_status: _status, ...baseContext } = fixture;
const action = fixture.interpretation_inputs.selected_action;
const rendered = fixture.interpretation_inputs.rendered_interaction;
const pendingId = ids[1], messageId = ids[2], promptId = ids[3], commandId = fixture.cycle_id;
const command = {
  id: commandId, conversation_id: fixture.conversation_id, project_id: fixture.project_id,
  source_message_id: messageId, pending_interaction_id: pendingId, expected_runtime_revision: 2,
  expected_knowledge_version: fixture.expected_state_version, execution_at: fixture.occurred_at,
  correlation_id: fixture.correlation_id, interpretation_id: fixture.interpretation_inputs.interpretation_id,
  transition_id: fixture.interpretation_inputs.proposal_ids.transition_id,
  claim_id: fixture.interpretation_inputs.proposal_ids.claim_id,
  customer_evidence_id: fixture.interpretation_inputs.proposal_ids.customer_evidence_id,
  system_evidence_id: fixture.interpretation_inputs.proposal_ids.system_evidence_id!,
  apply_id: fixture.next_state_ids.apply_id, assessment_id: fixture.assessment_id,
  planner_decision_id: fixture.planner_decision_id, event_ids: [...fixture.event_ids].slice(0, 5),
  next_evidence_request_id: fixture.next_evidence_request_id, next_pending_interaction_id: ids[20],
  next_snapshot_id: ids[21], next_outbound_message_id: ids[22], event_sequence_start: fixture.event_sequence_start,
};
const snapshot = {
  id: ids[0], pending_interaction_id: pendingId, conversation_id: command.conversation_id, project_id: command.project_id,
  runtime_revision: 2, knowledge_state_version: command.expected_knowledge_version, outbound_message_id: promptId,
  outbound_message_sequence: 4, snapshot_schema_version: PLANNER_SNAPSHOT_SCHEMA_VERSION, selected_action: action,
  rendered_interaction: rendered, outbound_text: composeRenderedCustomerText(rendered), created_at: fixture.occurred_at,
};
const row = {
  success: true as const, command,
  source_message: { id: messageId, conversation_id: command.conversation_id, sequence: 5, direction: "inbound" as const,
    actor_class: "customer" as const, message_kind: "text" as const, occurred_at: fixture.occurred_at, text: "Etwa 24 Quadratmeter" },
  pending_interaction: { id: pendingId, conversation_id: command.conversation_id, project_id: command.project_id,
    status: "pending" as const, runtime_revision: 2, expected_knowledge_state_version: command.expected_knowledge_version,
    prompt_message_id: promptId, snapshot_id: snapshot.id },
  snapshot,
  cycle_context: { ...baseContext, cycle_id: command.id, correlation_id: command.correlation_id,
    occurred_at: command.execution_at, event_ids: command.event_ids, next_evidence_request_id: command.next_evidence_request_id,
    interpretation_inputs: { ...baseContext.interpretation_inputs, selected_action: action, rendered_interaction: rendered } },
};

describe("AP-16-06-01C cycle context read authority", () => {
  it("loads the complete authority, historical planner/render/answer contract, message and runtime components", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: row, error: null });
    const result = await loadCustomerMessageCycleAuthority({ rpc }, commandId);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.authority.message_text).toBe(row.source_message.text);
    expect(result.authority.rendered_interaction).toEqual(rendered);
    expect(result.authority.rendered_interaction.answer_contract).toEqual(rendered.answer_contract);
    expect(result.authority.cycle_context.interpretation_inputs.selected_action).toEqual(action);
    expect(result.authority.cycle_context).toMatchObject({ knowledge_state: baseContext.knowledge_state,
      information_collection_state: baseContext.information_collection_state, retry_state: baseContext.retry_state,
      customer_effort_state: baseContext.customer_effort_state, evidence_request_state: baseContext.evidence_request_state });
    expect(rpc).toHaveBeenCalledOnce();
  });

  it("returns stable persisted reservations and never generates logical IDs", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: row, error: null });
    const first = await loadCustomerMessageCycleAuthority({ rpc }, commandId);
    const second = await loadCustomerMessageCycleAuthority({ rpc }, commandId);
    expect(first).toEqual(second);
    expect(first.success && first.authority.cycle_context.event_ids).toEqual(command.event_ids);
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  it.each([
    ["cross conversation", { source_message: { ...row.source_message, conversation_id: ids[24] } }, "conversation_mismatch"],
    ["cross project", { pending_interaction: { ...row.pending_interaction, project_id: ids[24] } }, "project_mismatch"],
    ["runtime stale", { pending_interaction: { ...row.pending_interaction, runtime_revision: 3 } }, "runtime_stale"],
    ["knowledge stale", { pending_interaction: { ...row.pending_interaction, expected_knowledge_state_version: 2 } }, "knowledge_stale"],
    ["prompt mismatch", { pending_interaction: { ...row.pending_interaction, prompt_message_id: ids[24] } }, "prompt_message_mismatch"],
    ["source before prompt", { source_message: { ...row.source_message, sequence: 4 } }, "prompt_message_mismatch"],
    ["invalid actor", { source_message: { ...row.source_message, actor_class: "system" } }, "authority_incomplete"],
  ])("fails closed for %s", async (_name, override, error) => {
    const result = await loadCustomerMessageCycleAuthority({ rpc: vi.fn().mockResolvedValue({ data: { ...row, ...override }, error: null }) }, commandId);
    expect(result).toEqual({ success: false, error });
  });

  it("fails closed without a snapshot or Answer Contract and never replans or re-renders", async () => {
    await expect(loadCustomerMessageCycleAuthority({ rpc: vi.fn().mockResolvedValue({ data: { success: false, code: "snapshot_missing" }, error: null }) }, commandId)).resolves.toEqual({ success: false, error: "snapshot_missing" });
    const invalidSnapshot = { ...snapshot, rendered_interaction: { ...rendered, answer_contract: undefined } };
    await expect(loadCustomerMessageCycleAuthority({ rpc: vi.fn().mockResolvedValue({ data: { ...row, snapshot: invalidSnapshot }, error: null }) }, commandId)).resolves.toEqual({ success: false, error: "snapshot_invalid" });
  });
});

describe("AP-16-06-01C migration", () => {
  const sql = readFileSync("supabase/migrations/202609010002_cycle_context_read_authority.sql", "utf8");
  it("reserves stable IDs at claim and exposes a service-only read RPC", () => {
    expect(sql).toContain("create function public.get_customer_message_cycle_context");
    expect(sql).toContain("array[gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid()]");
    expect(sql).toContain("grant execute on function public.get_customer_message_cycle_context(uuid) to service_role");
    expect(sql).toContain("revoke all on function public.get_customer_message_cycle_context(uuid) from public,anon,authenticated");
    expect(sql).toContain("security definer set search_path=public,pg_temp");
  });
  it("is read-only, rejects stale/cross-bound/legacy state, and never audits contents", () => {
    const readBody = sql.slice(sql.indexOf("create function public.get_customer_message_cycle_context"));
    expect(readBody).toContain("'code','runtime_stale'");
    expect(readBody).toContain("'code','knowledge_stale'");
    expect(readBody).toContain("'code','snapshot_missing'");
    expect(readBody).toContain("'code','project_mismatch'");
    expect(readBody).not.toMatch(/insert into public\.audit_log|update public\.|delete from public\./i);
    expect(sql).not.toMatch(/whatsapp|graph api|openai/i);
  });
});
