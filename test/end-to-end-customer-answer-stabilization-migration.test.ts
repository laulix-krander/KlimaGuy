import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql=readFileSync("supabase/migrations/202609090009_end_to_end_customer_answer_stabilization.sql","utf8").toLowerCase().replace(/\s+/gu," ");
describe("AP-16-06-06D-15 retry authority",()=>{
  it("recovers current technical failures without a lifetime execution ceiling",()=>{
    expect(sql).toContain("cmd.result_code not in ('persistence_failed','cycle_failed')");
    expect(sql).toContain("cmd.result_code in ('persistence_failed','cycle_failed')");
    expect(sql).not.toMatch(/epoch_attempts\s*:=/u);
    expect(sql).not.toMatch(/execution_attempt_count\s*[<>=]+\s*(10|20)/u);
  });
  it("retains fencing and adds bounded time backoff",()=>{
    expect(sql).toContain("cmd.execution_owner_id is distinct from execution_owner_id");
    expect(sql).toContain("least(3600,greatest(30,30*(2^least(cmd.execution_attempt_count,7))))");
    expect(sql).toContain("execution_lease_expires_at<=statement_timestamp()");
  });
  it("remains generic, service-only, and incident-free",()=>{
    expect(sql).toContain("auth.role() is distinct from 'service_role'");
    expect(sql).toContain("revoke all on function");
    expect(sql).not.toContain("bbd0df13-47f1-4b68-a4ab-9d372611465f");
  });
});
