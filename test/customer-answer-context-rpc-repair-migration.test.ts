import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const path = "supabase/migrations/202609090004_customer_answer_context_rpc_repair.sql";
const sql = readFileSync(path, "utf8");
const context = sql.slice(sql.indexOf("create or replace function public.get_customer_message_cycle_context"), sql.indexOf("create or replace function public.discover_recoverable_conversation_cycles"));

describe("AP-16-06-06D-7 context RPC and technical resume authority", () => {
  it("keeps the exact PostgREST signature and explicit service-role authority", () => {
    expect(sql).toContain("get_customer_message_cycle_context(target_command_id uuid) returns jsonb");
    expect(context).toContain("language plpgsql security definer set search_path=public,pg_temp");
    expect(context).toContain("raise insufficient_privilege");
    expect(sql).toContain("grant execute on function public.claim_customer_message_cycle(uuid),public.get_customer_message_cycle_context(uuid),public.discover_recoverable_conversation_cycles(integer) to service_role");
    expect(sql).toContain("revoke all on function public.claim_customer_message_cycle(uuid),public.get_customer_message_cycle_context(uuid),public.discover_recoverable_conversation_cycles(integer) from public,anon,authenticated");
  });

  it("qualifies both text reads and removes the proven PL/pgSQL ambiguity", () => {
    expect(context).toContain("select mt.body into body from public.conversation_message_text mt where mt.message_id=m.id");
    expect(context).toContain("select mt.body into prompt_body from public.conversation_message_text mt where mt.message_id=pm.id");
    expect(context).not.toMatch(/select body into (body|prompt_body)/);
  });

  it("references current reconciled authority tables and fields", () => {
    for (const table of ["conversation_cycle_commands", "conversations", "conversation_runtime_states", "conversation_pending_interactions", "conversation_interaction_snapshots", "conversation_messages", "conversation_message_text", "project_knowledge_states"]) expect(context).toContain(`public.${table}`);
    for (const field of ["execution_at", "event_sequence_start", "event_ids", "snapshot_id", "prompt_message_id", "knowledge_state_version", "rendered_interaction"]) expect(context).toContain(field);
  });

  it("reopens only bounded persistence failures and leaves terminal/review/business failures closed", () => {
    expect(sql).toContain("cmd.status='failed' and cmd.result_code='persistence_failed' and cmd.execution_attempt_count<10");
    expect(sql).toContain("elsif cmd.status='failed' then");
    expect(sql).toContain("return jsonb_build_object('success',false,'code','conversation_not_processable')");
    expect(sql).toContain("if found and cmd.status in ('completed','stale','human_review_required') then");
    expect(sql).not.toMatch(/9afad389|bbd0df13|9732fe6a|ed8e842d|75de4d21/);
  });

  it("discovers retryable terminal failures without weakening ownership fencing", () => {
    const discovery = sql.slice(sql.indexOf("create or replace function public.discover_recoverable_conversation_cycles"));
    expect(sql).toContain("c.status='failed' and c.result_code='persistence_failed' and c.execution_attempt_count<10");
    expect(sql).toContain("c.status='processing' and (c.execution_lease_expires_at<=statement_timestamp() or c.execution_lease_expires_at is null)");
    expect(discovery).not.toMatch(/\b(update|delete|insert)\b/i);
  });
});
