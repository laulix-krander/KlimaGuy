import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("supabase/migrations/202607310001_user_role_change_rpc.sql", "utf8");

describe("controlled role change migration", () => {
  it("defines the exact enum-typed hardened RPC and closed codes", () => {
    expect(sql).toMatch(/change_user_profile_role\([\s\S]*target_user_id uuid,[\s\S]*target_role public\.app_role,[\s\S]*expected_current_role public\.app_role/);
    expect(sql).toMatch(/security definer\s*set search_path = public, pg_temp/i);
    for (const code of ["role_changed", "no_change", "role_conflict", "self_change_blocked", "last_admin_protected", "target_not_found", "forbidden"]) expect(sql).toContain(`'${code}'`);
  });

  it("authenticates and serializes actor and target checks", () => {
    expect(sql).toContain("auth.uid()");
    expect(sql).toMatch(/pg_advisory_xact_lock\(14020120260731::bigint\)/);
    expect(sql).toMatch(/from public\.profiles p[\s\S]*where p\.id = actor_id[\s\S]*for update/);
    expect(sql).toContain("actor_role is distinct from 'admin'::public.app_role");
    expect(sql).toContain("actor_id = target_user_id");
    expect(sql).toMatch(/where p\.id = target_user_id\s*for update/);
  });

  it("uses CAS, idempotency and atomically protects the last admin", () => {
    expect(sql).toContain("current_role is distinct from expected_current_role");
    expect(sql).toContain("current_role = target_role");
    expect(sql).toMatch(/not exists \([\s\S]*p\.role = 'admin'[\s\S]*p\.id <> target_user_id/);
    expect(sql).toMatch(/update public\.profiles p\s*set role = target_role\s*where p\.id = target_user_id and p\.role = expected_current_role/);
    expect(sql).toMatch(/update public\.profiles[\s\S]*insert into public\.audit_log[\s\S]*'user_role_changed'/);
  });

  it("closes browser updates and exposes execute only to authenticated", () => {
    expect(sql).toContain("revoke update on table public.profiles from anon, authenticated");
    expect(sql).toMatch(/revoke execute on function[\s\S]*from public, anon, authenticated/);
    expect(sql).toMatch(/grant execute on function[\s\S]*to authenticated/);
    expect(sql).not.toMatch(/grant\s+(insert|update|delete|all)\s+on\s+table/i);
  });

  it("does not introduce forbidden mutation capabilities", () => {
    expect(sql).not.toMatch(/execute\s+(format|immediate)|auth\.users|service_role/i);
    expect(sql).not.toMatch(/delete\s+from|insert\s+into\s+public\.profiles/i);
    expect(sql).not.toMatch(/update public\.profiles[\s\S]*set\s+(display_name|created_at|updated_at)/i);
  });
});
