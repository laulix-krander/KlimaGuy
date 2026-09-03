import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { canChangeUserRole, canCreateCustomer, canCreateProjectNote, canViewProjectMedia } from "@/lib/domain/permissions";
import { changeUserRoleSchema, roleSchema } from "@/lib/domain/schemas";
import { provisionSystemActor, SYSTEM_ACTOR_KEY, type SystemActorProvisioningBoundary } from "@/lib/server/system-actor-provisioning";

const USER_ID = "10000000-0000-4000-8000-000000000001";
const migration = readFileSync("supabase/migrations/202609030003_system_actor_identity_authority.sql", "utf8");

function boundary(overrides: Partial<SystemActorProvisioningBoundary> = {}): SystemActorProvisioningBoundary {
  return {
    verify: vi.fn().mockResolvedValue({ status: "not_provisioned" }),
    findRecoverableAuthUser: vi.fn().mockResolvedValue(null),
    createAuthUser: vi.fn().mockResolvedValue({ id: USER_ID }),
    register: vi.fn().mockResolvedValue({ status: "provisioned", auth_user_id: USER_ID }),
    randomPassword: vi.fn().mockReturnValue("x".repeat(64)),
    ...overrides,
  };
}

describe("system actor role", () => {
  it("parses system explicitly but excludes it from human role changes and permissions", () => {
    expect(roleSchema.parse("system")).toBe("system");
    expect(changeUserRoleSchema.safeParse({ target_user_id: USER_ID, target_role: "admin", expected_current_role: "system" }).success).toBe(false);
    expect(canChangeUserRole("system")).toBe(false);
    expect(canCreateCustomer("system")).toBe(false);
    expect(canCreateProjectNote("system")).toBe(false);
    expect(canViewProjectMedia("system")).toBe(false);
    expect(canChangeUserRole("admin")).toBe(true);
    expect(canViewProjectMedia("reviewer")).toBe(true);
  });
});

describe("system actor provisioning", () => {
  it("creates exactly one supported Admin API identity and registers it", async () => {
    const source = boundary();
    await expect(provisionSystemActor("system@deployment.invalid", source)).resolves.toEqual({ status: "provisioned", auth_user_id: USER_ID });
    expect(source.createAuthUser).toHaveBeenCalledTimes(1);
    expect(source.createAuthUser).toHaveBeenCalledWith(expect.objectContaining({ systemActorKey: SYSTEM_ACTOR_KEY }));
    expect(source.register).toHaveBeenCalledWith(USER_ID);
  });

  it("does not create on a verified replay", async () => {
    const source = boundary({ verify: vi.fn().mockResolvedValue({ status: "verified", auth_user_id: USER_ID }) });
    await expect(provisionSystemActor("system@deployment.invalid", source)).resolves.toEqual({ status: "already_provisioned", auth_user_id: USER_ID });
    expect(source.createAuthUser).not.toHaveBeenCalled();
  });

  it("recovers the Auth-created/registry-missing crash state without another create", async () => {
    const source = boundary({ findRecoverableAuthUser: vi.fn().mockResolvedValue({ id: USER_ID, systemActorKey: SYSTEM_ACTOR_KEY }) });
    await expect(provisionSystemActor("system@deployment.invalid", source)).resolves.toEqual({ status: "provisioned", auth_user_id: USER_ID });
    expect(source.createAuthUser).not.toHaveBeenCalled();
    expect(source.register).toHaveBeenCalledWith(USER_ID);
  });

  it("fails closed for conflicting recovery metadata, malformed results and weak generated secrets", async () => {
    await expect(provisionSystemActor("system@deployment.invalid", boundary({ findRecoverableAuthUser: vi.fn().mockResolvedValue({ id: USER_ID, systemActorKey: "other" }) }))).resolves.toEqual({ status: "conflict" });
    await expect(provisionSystemActor("system@deployment.invalid", boundary({ verify: vi.fn().mockResolvedValue({ status: "surprise", token: "secret" }) }))).resolves.toEqual({ status: "provisioning_failed" });
    await expect(provisionSystemActor("system@deployment.invalid", boundary({ randomPassword: vi.fn().mockReturnValue("short") }))).resolves.toEqual({ status: "provisioning_failed" });
  });

  it("returns no password, token, email or provider error", async () => {
    const result = await provisionSystemActor("system@deployment.invalid", boundary());
    const output = JSON.stringify(result);
    expect(output).not.toMatch(/password|token|email|secret/i);
  });
});

describe("system actor migration contract", () => {
  it("binds unique stable key and unique auth user with RLS and no Auth SQL insert", () => {
    expect(migration).toMatch(/system_actor_key text primary key/);
    expect(migration).toMatch(/auth_user_id uuid not null unique references auth\.users\(id\) on delete restrict/);
    expect(migration).toMatch(/enable row level security/);
    expect(migration).not.toMatch(/insert\s+into\s+auth\.users/i);
  });

  it("implements serialized CAS, idempotent replay and fail-closed resolution", () => {
    expect(migration).toMatch(/pg_advisory_xact_lock/);
    expect(migration).toMatch(/existing_id <> target_auth_user_id/);
    expect(migration).toMatch(/'status','conflict'/);
    expect(migration).toMatch(/'status','not_provisioned'/);
    expect(migration).toMatch(/create function public\.resolve_system_actor\(\)/);
    expect(migration).not.toMatch(/resolve_system_actor\([^)]*uuid/);
  });

  it("keeps all authorities service-only with fixed search paths", () => {
    for (const name of ["register_system_actor", "verify_system_actor", "resolve_system_actor"]) {
      expect(migration).toMatch(new RegExp(`create function public\\.${name}[^]*?security definer set search_path = public, pg_temp`));
    }
    expect(migration).toMatch(/revoke execute[^]*from public, anon, authenticated/);
    expect(migration).toMatch(/grant execute[^]*to service_role/);
    expect(migration.match(/auth\.role\(\) is distinct from 'service_role'/g)).toHaveLength(3);
  });

  it("protects the technical profile from normal update and deletion", () => {
    expect(migration).toMatch(/before update or delete on public\.profiles/);
    expect(migration).toMatch(/system_actor_profile_protected/);
    expect(migration).toMatch(/raw_app_meta_data ->> 'system_actor_key'/);
  });
});
