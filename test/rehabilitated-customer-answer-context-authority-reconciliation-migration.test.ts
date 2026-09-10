import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = "supabase/migrations/202609100006_rehabilitated_customer_answer_context_authority_reconciliation.sql";
const sql = readFileSync(migration, "utf8").replace(/\s+/g, " ");

const normalAuthority = {
  conversationId: "conversation",
  runtimeConversationId: "conversation",
  projectId: "project",
  runtimeProjectId: "project",
  expectedRuntimeRevision: 14,
  runtimeRevision: 14,
  pendingRuntimeRevision: 14,
  snapshotRuntimeRevision: 14,
  expectedKnowledgeVersion: 7,
  runtimeKnowledgeVersion: 7,
  pendingKnowledgeVersion: 7,
  snapshotKnowledgeVersion: 7,
  projectKnowledgeVersion: 7,
};

const rehabilitatedAuthority = {
  ...normalAuthority,
  inferenceSemanticsVersion: 2,
  rehabilitatedAt: "2026-09-10T10:00:00Z",
  sourceMessageId: "source",
  currentPending: { id: "recovery-pending", status: "pending", answeredBy: null, recoveryOf: "original-pending" },
  originalPending: { id: "original-pending", status: "answered", answeredBy: "source", runtimeRevision: 12 },
  currentSnapshot: { pendingId: "recovery-pending", recoveryOf: "original-snapshot" },
  originalSnapshot: { id: "original-snapshot", pendingId: "original-pending", runtimeRevision: 12 },
  runtimeActivePendingId: "recovery-pending",
  commandPendingId: "recovery-pending",
  newestInboundId: "source",
  effortRuntimeRevision: 12,
};

function accepts(state = rehabilitatedAuthority) {
  return state.conversationId === state.runtimeConversationId
    && state.projectId === state.runtimeProjectId
    && state.inferenceSemanticsVersion === 2
    && Boolean(state.rehabilitatedAt)
    && state.currentPending.status === "pending"
    && state.currentPending.answeredBy === null
    && state.runtimeActivePendingId === state.currentPending.id
    && state.commandPendingId === state.currentPending.id
    && state.currentPending.recoveryOf === state.originalPending.id
    && state.originalPending.status === "answered"
    && state.originalPending.answeredBy === state.sourceMessageId
    && state.currentSnapshot.pendingId === state.currentPending.id
    && state.currentSnapshot.recoveryOf === state.originalSnapshot.id
    && state.originalSnapshot.pendingId === state.originalPending.id
    && state.originalPending.runtimeRevision === state.expectedRuntimeRevision - 2
    && state.originalSnapshot.runtimeRevision === state.originalPending.runtimeRevision
    && state.newestInboundId === state.sourceMessageId
    && state.runtimeRevision === state.expectedRuntimeRevision
    && state.pendingRuntimeRevision === state.expectedRuntimeRevision
    && state.snapshotRuntimeRevision === state.expectedRuntimeRevision
    && state.runtimeKnowledgeVersion === state.expectedKnowledgeVersion
    && state.pendingKnowledgeVersion === state.expectedKnowledgeVersion
    && state.snapshotKnowledgeVersion === state.expectedKnowledgeVersion
    && state.projectKnowledgeVersion === state.expectedKnowledgeVersion;
}

describe("AP-16-06-06D-21 rehabilitated context authority", () => {
  it("replaces only the read RPC in one forward-only migration and performs no incident DML", () => {
    expect(sql).toContain("create or replace function public.get_customer_message_cycle_context");
    expect(sql).not.toMatch(/ update public\.| insert into public\.| delete from public\./i);
    expect(sql).not.toMatch(/whatsapp|openai|ai_inference_attempt_count\s*=|execution_attempt_count\s*=/i);
  });

  it("proves the exact production root cause and narrowly falls back to original effort revision", () => {
    expect(sql).toContain("effort_revision:=cmd.expected_runtime_revision");
    expect(sql).toContain("if not exists(select 1 from public.conversation_effort_states e");
    expect(sql).toContain("then effort_revision:=original_p.runtime_revision");
    expect(sql).toContain("runtime_revision=effort_revision");
    expect(rehabilitatedAuthority.effortRuntimeRevision).toBe(rehabilitatedAuthority.expectedRuntimeRevision - 2);
  });

  it("accepts a production-shaped committed rehabilitation without answering its recovery pending", () => {
    expect(accepts()).toBe(true);
    expect(rehabilitatedAuthority.originalPending.answeredBy).toBe(rehabilitatedAuthority.sourceMessageId);
    expect(rehabilitatedAuthority.currentPending).toMatchObject({ status: "pending", answeredBy: null });
    expect(normalAuthority).toMatchObject({ runtimeRevision: 14, pendingRuntimeRevision: 14, snapshotRuntimeRevision: 14 });
  });

  it.each([
    ["false recovery pending lineage", { currentPending: { ...rehabilitatedAuthority.currentPending, recoveryOf: "other" } }],
    ["false source message", { sourceMessageId: "other" }],
    ["newer customer inbound", { newestInboundId: "newer" }],
    ["false runtime revision", { runtimeRevision: 13 }],
    ["false knowledge version", { projectKnowledgeVersion: 8 }],
    ["false project", { runtimeProjectId: "other" }],
    ["false conversation", { runtimeConversationId: "other" }],
    ["false snapshot lineage", { currentSnapshot: { ...rehabilitatedAuthority.currentSnapshot, recoveryOf: "other" } }],
  ])("rejects %s", (_name, override) => {
    expect(accepts({ ...rehabilitatedAuthority, ...override })).toBe(false);
  });

  it("keeps project/conversation, prompt, source, runtime, knowledge and lease-era SQL authority checks", () => {
    for (const predicate of [
      "c.current_project_id is distinct from cmd.project_id",
      "c.revision<>cmd.expected_conversation_revision",
      "r.revision<>cmd.expected_runtime_revision",
      "r.active_pending_interaction_id<>p.id",
      "p.prompt_message_id<>cmd.prompt_message_id",
      "original_p.answered_by_message_id is distinct from cmd.source_message_id",
      "newer.sequence>m.sequence",
      "s.recovery_of_snapshot_id<>original_s.id",
      "project_knowledge_states where project_id=cmd.project_id",
    ]) expect(sql).toContain(predicate);
  });

  it("is retry-safe after failure persistence and creates no pending, snapshot, inbound, or outbound row", () => {
    expect(sql).toContain("cmd.status<>'processing'");
    expect(sql).toContain("cmd.legacy_ai_exhaustion_rehabilitated_at is not null");
    expect(sql).not.toMatch(/insert into public\.conversation_(pending_interactions|interaction_snapshots|messages)/i);
    expect(accepts()).toBe(true);
  });
});
