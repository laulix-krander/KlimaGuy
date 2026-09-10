import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const path="supabase/migrations/202609100001_interpretation_idempotency_contract_repair.sql";
const sql=readFileSync(path,"utf8");

describe("AP-16-06-06D-16 interpretation idempotency contract repair",()=>{
  it("constructs the productive key from conversation, selected decision and answer identity",()=>{
    expect(sql).toContain("cmd.conversation_id::text||':'||(s.selected_action->>'decision_id')||':'||m.id::text");
    expect(sql).not.toContain("'idempotency_key','answer:'||m.id");
  });
  it("remains a service-only read authority without incident DML or identifiers",()=>{
    expect(sql).toContain("security definer set search_path=public,pg_temp");
    expect(sql).toContain("grant execute on function public.get_customer_message_cycle_context(uuid) to service_role");
    expect(sql).not.toMatch(/insert into|update public\.|delete from|ed8e842d|9afad389|bbd0df13/iu);
  });
});
