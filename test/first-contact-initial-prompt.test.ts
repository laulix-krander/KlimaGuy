import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { initializeFirstContactPrompt, type InitialPromptRpc } from "@/lib/server/conversation/first-contact-initial-prompt";

const CONVERSATION = "10000000-0000-4000-8000-000000000001";
const PROJECT = "10000000-0000-4000-8000-000000000002";
const IDS = ["10000000-0000-4000-8000-000000000011", "10000000-0000-4000-8000-000000000012", "10000000-0000-4000-8000-000000000013", "10000000-0000-4000-8000-000000000014"];

describe("deterministic first-contact initial prompt", () => {
  it("plans building_type with ask_building_type and hands off the exact outbound identity", async () => {
    let commitArgs: Record<string, unknown> | undefined;
    const source: InitialPromptRpc = { rpc: vi.fn(async (name, args) => {
      if (name === "get_first_contact_initial_prompt_context") return { data: { status: "eligible", conversation_id: CONVERSATION, project_id: PROJECT, runtime_revision: 1, knowledge_state_version: 1 }, error: null };
      commitArgs = args;
      return { data: { status: "initialized", conversation_id: CONVERSATION, project_id: PROJECT, runtime_revision: 2, knowledge_state_version: 1,
        interaction_id: args.target_interaction_id, planner_snapshot_id: args.target_snapshot_id, outbound_message_id: args.target_outbound_message_id, delivery_command_id: args.target_delivery_command_id }, error: null };
    }) };
    const result = await initializeFirstContactPrompt(source, CONVERSATION, new Date("2026-09-04T10:00:00.000Z"));
    expect(result.status).toBe("initialized");
    expect(result).toMatchObject({ runtime_revision: 2, knowledge_state_version: 1, outbound_message_id: commitArgs?.target_outbound_message_id });
    expect(commitArgs?.target_snapshot).toMatchObject({ selected_action: { information_key: "building_type", template_key: "ask_building_type", based_on_state_version: 1 }, rendered_interaction: { primary_text: "Um welche Gebäudeart handelt es sich?", template_key: "ask_building_type" } });
    expect(commitArgs?.target_outbound_text).toBe("Um welche Gebäudeart handelt es sich?");
    expect(commitArgs).not.toHaveProperty("phone"); expect(commitArgs).not.toHaveProperty("destination"); expect(commitArgs).not.toHaveProperty("actor_id");
  });

  it("returns persisted identities on replay without planning or commit", async () => {
    const persisted = { status: "already_initialized" as const, conversation_id: CONVERSATION, project_id: PROJECT, runtime_revision: 2, knowledge_state_version: 1,
      interaction_id: IDS[0], planner_snapshot_id: IDS[1], outbound_message_id: IDS[2], delivery_command_id: IDS[3] };
    const rpc = vi.fn(async () => ({ data: persisted, error: null }));
    expect(await initializeFirstContactPrompt({ rpc }, CONVERSATION)).toEqual(persisted);
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it.each(["already_advanced", "not_applicable"] as const)("preserves controlled %s state without diagnostics", async status => {
    const rpc = vi.fn(async () => ({ data: { status }, error: null }));
    expect(await initializeFirstContactPrompt({ rpc }, CONVERSATION)).toEqual({ status });
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("classifies a rejected context without exposing its payload", async () => {
    const rpc = vi.fn(async () => ({ data: { status: "invalid_state", private_value: "SECRET_CUSTOMER_MESSAGE" }, error: null }));
    expect(await initializeFirstContactPrompt({ rpc }, CONVERSATION)).toEqual({
      status: "invalid_state",
      diagnostic: { diagnostic_code: "initial_context_result_rejected", stage: "initial_context", result_code: "invalid_state" },
    });
  });

  it.each([
    ["returned RPC error", vi.fn(async () => ({ data: null, error: { message: "SECRET_DB_ERROR_MESSAGE", details: "SECRET_DB_DETAIL", hint: "SECRET_DB_HINT", code: "SECRET_CODE" } }))],
    ["thrown RPC error", vi.fn(async () => { throw new Error("SECRET_DB_ERROR_MESSAGE"); })],
  ])("classifies context %s only by its boundary", async (_label, rpc) => {
    expect(await initializeFirstContactPrompt({ rpc }, CONVERSATION)).toEqual({ status: "persistence_failed", diagnostic: { diagnostic_code: "initial_context_rpc_failed", stage: "initial_context" } });
  });

  it("classifies invalid context results", async () => {
    expect(await initializeFirstContactPrompt({ rpc: vi.fn(async () => ({ data: { status: "eligible", conversation_id: "not-a-uuid" }, error: null })) }, CONVERSATION))
      .toEqual({ status: "persistence_failed", diagnostic: { diagnostic_code: "initial_context_result_invalid", stage: "initial_context" } });
  });

  it.each([
    ["assessment_failed", { assess: vi.fn(() => { throw new Error("assessment"); }) }],
    ["planning_failed", { plan: vi.fn(() => { throw new Error("planning"); }) }],
    ["rendering_failed", { render: vi.fn(() => { throw new Error("rendering"); }) }],
    ["snapshot_validation_failed", { validateSnapshot: vi.fn(() => ({ success: false })) }],
  ] as const)("classifies %s at the deepest safe domain boundary", async (diagnosticCode, dependencies) => {
    const rpc = vi.fn(async () => ({ data: { status: "eligible", conversation_id: CONVERSATION, project_id: PROJECT, runtime_revision: 1, knowledge_state_version: 1 }, error: null }));
    const result = await initializeFirstContactPrompt({ rpc }, CONVERSATION, new Date("2026-09-04T10:00:00.000Z"), dependencies as never);
    expect(result).toMatchObject({ status: "planning_failed", diagnostic: { diagnostic_code: diagnosticCode } });
  });

  it.each([
    ["commit_rpc_failed", { data: null, error: { message: "SECRET_DB_ERROR_MESSAGE" } }],
    ["commit_result_invalid", { data: { unexpected: true }, error: null }],
    ["commit_result_rejected", { data: { status: "invalid_state" }, error: null }],
  ] as const)("classifies %s independently", async (diagnosticCode, commitResult) => {
    const rpc: InitialPromptRpc["rpc"] = vi.fn(async name => name === "get_first_contact_initial_prompt_context"
      ? { data: { status: "eligible", conversation_id: CONVERSATION, project_id: PROJECT, runtime_revision: 1, knowledge_state_version: 1 }, error: null }
      : commitResult);
    const result = await initializeFirstContactPrompt({ rpc }, CONVERSATION, new Date("2026-09-04T10:00:00.000Z"));
    expect(result).toMatchObject({ diagnostic: { diagnostic_code: diagnosticCode, stage: "commit" } });
  });
});

describe("atomic initial-prompt migration contract", () => {
  const sql = readFileSync("supabase/migrations/202609040002_deterministic_initial_prompt_commit.sql", "utf8");
  it("locks, allocates sequence, persists the complete unit, and keeps knowledge immutable", () => {
    expect(sql).toMatch(/conversations where id=target_conversation_id for update/i);
    expect(sql).toMatch(/max\(sequence\).*\+1/i);
    expect(sql).toContain("conversation_interaction_snapshots"); expect(sql).toContain("conversation_pending_interactions");
    expect(sql).toContain("conversation_messages"); expect(sql).toContain("transport_delivery_commands");
    expect(sql).toMatch(/runtime_status='awaiting_customer_answer'/);
    expect(sql).not.toMatch(/insert into public\.project_knowledge_(claims|state_transitions)/i);
    expect(sql).not.toMatch(/update public\.project_knowledge_states/i);
  });
  it("is service-only, fixed-search-path and does not dispatch", () => {
    expect(sql.match(/security definer set search_path=public,pg_temp/g)).toHaveLength(2);
    expect(sql).toMatch(/revoke execute[\s\S]*from public,anon,authenticated/i);
    expect(sql).toMatch(/grant execute[\s\S]*to service_role/i);
    expect(sql).not.toMatch(/public\.authorize_whatsapp_outbound_dispatch\s*\(|public\.send_whatsapp|net\.http_post\s*\(/i);
  });
});
