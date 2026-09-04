import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("supabase/migrations/202609040003_productive_first_contact_recovery.sql", "utf8");
describe("first-contact recovery database authority", () => {
  it("is service-only, bounded and deterministically ordered", () => {
    expect(sql).toContain("auth.role() is distinct from 'service_role'");
    expect(sql).toContain("least(greatest(coalesce(target_limit,10),0),10)");
    expect(sql).toContain("order by c.created_at asc,c.id asc");
    expect(sql).toContain("revoke execute on function public.discover_recoverable_first_contacts(integer) from public,anon,authenticated");
  });
  it("discovers only inbound, open, active-transport, pre-prompt states", () => {
    expect(sql).toContain("c.status='open'"); expect(sql).toContain("m.direction='inbound'");
    expect(sql).toContain("i.status='active'"); expect(sql).toContain("x.idempotency_key='first-contact-initial-prompt:v1'");
    expect(sql).toContain("r.runtime_status='idle'"); expect(sql).toContain("p.status='pending'");
  });
  it("schedules the exact Vault-backed pg_net route once per minute", () => {
    expect(sql).toContain("'first-contact-recovery','* * * * *'"); expect(sql).toContain("net.http_post(");
    expect(sql).toContain("'/api/internal/first-contact/recovery'"); expect(sql).toContain("'Authorization','Bearer '");
    expect(sql).toContain("url_secret.name='KLIMAGUY_PRODUCTION_BASE_URL'"); expect(sql).toContain("auth_secret.name='FIRST_CONTACT_RECOVERY_SECRET'");
    expect(sql).not.toMatch(/customer lookup|planner logic|provider_message_id/i);
  });
});
