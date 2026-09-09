import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const path = "supabase/migrations/202609090005_exhausted_technical_recovery_rehabilitation.sql";
const sql = readFileSync(path, "utf8");
const discovery = sql.slice(sql.indexOf("create function public.discover_recoverable_conversation_cycles"));

describe("AP-16-06-06D-9 exhausted technical recovery authority", () => {
  it("preserves total attempts and permits exactly one ten-attempt rehabilitation epoch", () => {
    expect(sql).toContain("technical_rehabilitation_count integer not null default 0");
    expect(sql).toContain("technical_rehabilitation_count between 0 and 1");
    expect(sql).toContain("cmd.execution_attempt_count=10 and cmd.technical_rehabilitation_count=0");
    expect(sql).toContain("execution_attempt_count=execution_attempt_count+1");
    expect(sql).not.toMatch(/execution_attempt_count\s*=\s*0/);
    expect(sql).toContain("epoch_attempts:=cmd.execution_attempt_count-(cmd.technical_rehabilitation_count*10)");
    expect(sql).toContain("epoch_attempts>=10");
  });

  it("discovers without mutation and marks exhausted candidates explicitly", () => {
    expect(discovery).toContain("requires_technical_rehabilitation boolean");
    expect(discovery).toContain("cmd.status='failed' and cmd.result_code='persistence_failed'");
    expect(discovery).toContain("cmd.execution_attempt_count<=10");
    expect(discovery).not.toMatch(/\b(update|delete|insert)\b/i);
    expect(discovery).toContain("limit least(greatest(result_limit,1),100)");
  });

  it("revalidates current business authority atomically before rehabilitation", () => {
    for (const guard of ["c.status<>'open'", "p.answered_by_message_id is not null", "cmd.project_id<>r.project_id", "cmd.pending_interaction_id<>p.id", "cmd.expected_runtime_revision<>r.revision", "cmd.expected_knowledge_version<>k", "newer.sequence>m.sequence", "mt.body=s.outbound_text"]) expect(sql).toContain(guard);
    expect(sql).toContain("select * into cmd from public.conversation_cycle_commands where source_message_id=m.id for update");
    expect(sql).toContain("technical_rehabilitation_count=1");
  });

  it("keeps service-role authority, ownership fencing, AI accounting, and incident independence", () => {
    expect(sql).toContain("security definer set search_path=public,pg_temp");
    expect(sql).toContain("cmd.execution_owner_id<>execution_owner");
    expect(sql).toContain("grant execute on function public.claim_customer_message_cycle(uuid),public.acquire_customer_message_cycle_execution(uuid,uuid,integer),public.discover_recoverable_conversation_cycles(integer) to service_role");
    expect(sql).not.toContain("ai_inference_attempt_count=");
    expect(sql).not.toMatch(/bbd0df13|9afad389|ed8e842d|75de4d21|9732fe6a/);
  });
});
