import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { activatePlannerInteractionSnapshot, composeRenderedCustomerText, loadPlannerInteractionSnapshot, PLANNER_SNAPSHOT_SCHEMA_VERSION, type PlannerSnapshotDataSource } from "@/lib/actions/planner-snapshot-persistence";
import { syntheticTemplateAction } from "@/lib/domain/conversation-intelligence/question-template-fixtures";
import { renderQuestionTemplate } from "@/lib/domain/conversation-intelligence/question-template-renderer";

const IDS = {
  snapshot: "91000000-0000-4000-8000-000000000001",
  pending: "91000000-0000-4000-8000-000000000002",
  message: "91000000-0000-4000-8000-000000000003",
};
const occurredAt = "2026-09-01T10:00:00.000Z";
const action = syntheticTemplateAction("ask_room_area_approximate", "ask_approximate_number", "room_area_sqm", "approximate_number");
const renderedResult = renderQuestionTemplate({ selected_action: action, locale: "de", template_version: 1, render_parameters: {} });
if (!renderedResult.success) throw new Error("fixture_render_failed");
const rendered = renderedResult.interaction;
const snapshot = { snapshot_schema_version: PLANNER_SNAPSHOT_SCHEMA_VERSION, selected_action: action, rendered_interaction: rendered } as const;
const row = { id: IDS.snapshot, pending_interaction_id: IDS.pending, conversation_id: action.conversation_id, project_id: action.project_id, runtime_revision: 2, knowledge_state_version: action.based_on_state_version, outbound_message_id: IDS.message, outbound_message_sequence: 4, ...snapshot, outbound_text: composeRenderedCustomerText(rendered), created_at: occurredAt };

describe("planner snapshot persistence boundary", () => {
  it("round-trips the complete selected action, render, Answer Contract, and planner decisions unchanged", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: row, error: null });
    const source = { rpc } satisfies PlannerSnapshotDataSource;
    const activated = await activatePlannerInteractionSnapshot(source, { snapshot_id: IDS.snapshot, pending_interaction_id: IDS.pending, outbound_message_id: IDS.message, expected_runtime_revision: 1, idempotency_key: "planner:decision:1", occurred_at: occurredAt, snapshot });
    expect(activated).toEqual({ success: true, snapshot: row });
    if (!activated.success) throw new Error("activation_failed");
    expect(activated.snapshot.selected_action).toEqual(action);
    expect(activated.snapshot.rendered_interaction).toEqual(rendered);
    expect(activated.snapshot.rendered_interaction.answer_contract).toEqual(rendered.answer_contract);
    expect(activated.snapshot.selected_action).toMatchObject({
      selected_candidate_id: action.selected_candidate_id,
      fallback_paths: action.fallback_paths,
      reason_codes: action.reason_codes,
      priority_band: action.priority_band,
      progression_band: action.progression_band,
      dependency_status: action.dependency_status,
      collection_eligibility: action.collection_eligibility,
      revisit_status: action.revisit_status,
      information_gain_status: action.information_gain_status,
      collection_path: action.collection_path,
      gain_reason_codes: action.gain_reason_codes,
      score_breakdown: action.score_breakdown,
    });
    expect(rpc).toHaveBeenCalledWith("activate_planner_interaction_snapshot", expect.objectContaining({ target_outbound_text: row.outbound_text, target_snapshot: snapshot }));
  });

  it("loads the immutable snapshot directly without invoking planner, registry, or renderer", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: row, error: null });
    const loaded = await loadPlannerInteractionSnapshot({ rpc }, IDS.pending);
    expect(loaded).toEqual({ success: true, snapshot: row });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("get_planner_interaction_snapshot", { target_pending_interaction_id: IDS.pending });
  });

  it("fails closed for malformed, cross-bound, unsupported-version, or legacy missing snapshots", async () => {
    const invalid = { ...row, conversation_id: IDS.snapshot };
    await expect(loadPlannerInteractionSnapshot({ rpc: vi.fn().mockResolvedValue({ data: invalid, error: null }) }, IDS.pending)).resolves.toEqual({ success: false, error: "invalid_persistence" });
    await expect(loadPlannerInteractionSnapshot({ rpc: vi.fn().mockResolvedValue({ data: { ...row, snapshot_schema_version: 2 }, error: null }) }, IDS.pending)).resolves.toEqual({ success: false, error: "invalid_persistence" });
    await expect(loadPlannerInteractionSnapshot({ rpc: vi.fn().mockResolvedValue({ data: null, error: null }) }, IDS.pending)).resolves.toEqual({ success: false, error: "snapshot_missing" });
    const crossRender = { ...snapshot, rendered_interaction: { ...rendered, conversation_id: IDS.snapshot } };
    await expect(activatePlannerInteractionSnapshot({ rpc: vi.fn() }, { snapshot_id: IDS.snapshot, pending_interaction_id: IDS.pending, outbound_message_id: IDS.message, expected_runtime_revision: 1, idempotency_key: "planner:decision:1", occurred_at: occurredAt, snapshot: crossRender })).resolves.toEqual({ success: false, error: "invalid_input" });
  });
});

describe("AP-16-06-01B migration", () => {
  const sql = readFileSync("supabase/migrations/202609010001_planner_snapshot_persistence.sql", "utf8");

  it("creates an immutable RLS snapshot table and nullable-only-for-legacy Pending binding", () => {
    expect(sql).toContain("create table public.conversation_interaction_snapshots");
    expect(sql).toContain("snapshot_schema_version integer not null check(snapshot_schema_version = 1)");
    expect(sql).toContain("create trigger planner_snapshot_immutable");
    expect(sql).toContain("alter table public.conversation_interaction_snapshots enable row level security");
    expect(sql).toContain("add column snapshot_id uuid");
    expect(sql).not.toMatch(/update public\.conversation_pending_interactions set snapshot_id/);
  });

  it("atomically binds snapshot, provider-independent message text, Pending row, and runtime CAS", () => {
    const ordered = ["insert into public.conversation_interaction_snapshots", "insert into public.conversation_messages", "insert into public.conversation_message_text", "insert into public.conversation_pending_interactions", "update public.conversation_runtime_states"];
    ordered.reduce((previous, needle) => { const current = sql.indexOf(needle, previous + 1); expect(current).toBeGreaterThan(previous); return current; }, -1);
    expect(sql).toContain("raise exception 'stale_runtime_revision'");
    expect(sql).toContain("raise exception 'stale_knowledge_version'");
    expect(sql).toContain("raise exception 'snapshot_binding_mismatch'");
    expect(sql).toContain("raise exception 'outbound_text_mismatch'");
    expect(sql).toContain("raise exception 'snapshot_replay_conflict'");
    expect(sql).toContain("active_planner_snapshot_required");
  });

  it("is machine-only, idempotent by reserved IDs, and does not leak message content into audit_log", () => {
    expect(sql).toContain("auth.role()<>'service_role'");
    expect(sql).toContain("grant execute on function public.activate_planner_interaction_snapshot");
    expect(sql).toContain("to service_role");
    expect(sql).toContain("where id=target_snapshot_id or pending_interaction_id=target_pending_interaction_id or outbound_message_id=target_outbound_message_id");
    expect(sql).not.toContain("insert into public.audit_log");
    expect(sql).not.toMatch(/whatsapp|graph api|openai/i);
  });
});
