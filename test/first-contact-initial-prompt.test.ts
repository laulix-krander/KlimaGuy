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

  it.each(["already_advanced", "not_applicable", "invalid_state"] as const)("preserves closed %s state", async status => {
    const rpc = vi.fn(async () => ({ data: { status }, error: null }));
    expect(await initializeFirstContactPrompt({ rpc }, CONVERSATION)).toEqual({ status });
    expect(rpc).toHaveBeenCalledTimes(1);
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
