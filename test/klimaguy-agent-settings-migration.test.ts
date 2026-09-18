import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const sql = readFileSync("supabase/migrations/202609180001_klimaguy_agent_settings.sql", "utf8");
describe("KlimaGuy settings migration", () => {
  it("creates one constrained singleton without domain relations or secret fields", () => {
    expect(sql).toContain("create table public.klimaguy_agent_settings"); expect(sql).toContain("klimaguy_agent_settings_singleton");
    for (const forbidden of ["customer_id", "project_id", "conversation_id", "api_key", "phone_number", "prompt text"]) expect(sql).not.toContain(forbidden);
    expect(sql).toContain("enable row level security"); expect(sql).toContain("('admin','reviewer')");
  });
  it("uses admin-only serialized CAS, revision increment, and sanitized audit", () => {
    expect(sql).toContain("current_app_role() <> 'admin'"); expect(sql).toContain("target_expected_revision <> 0"); expect(sql).toContain("old.revision <> target_expected_revision"); expect(sql).toContain("revision=old.revision+1");
    expect(sql).toContain("pg_advisory_xact_lock"); expect(sql).toContain("changed_fields"); expect(sql).toContain("klimaguy_agent_settings_updated");
    expect(sql).toContain("revoke all on table"); expect(sql).toContain("grant execute on function");
  });
});
