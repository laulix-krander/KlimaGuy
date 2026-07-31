import { describe, expect, it, vi } from "vitest";
import { canChangeUserRole } from "@/lib/domain/permissions";
import { changeUserRoleSchema } from "@/lib/domain/schemas";
import { changeUserRole, type UserRoleChangeDataSource } from "@/lib/actions/user-role-change-service";

const ACTOR_ID = "10000000-0000-4000-8000-000000000001";
const TARGET_ID = "20000000-0000-4000-8000-000000000002";

function source(overrides: Partial<UserRoleChangeDataSource> = {}): UserRoleChangeDataSource {
  return {
    getUser: vi.fn().mockResolvedValue({ id: ACTOR_ID }),
    getProfile: vi.fn().mockResolvedValue({ role: "admin" }),
    changeRoleAtomically: vi.fn().mockResolvedValue({
      result_target_user_id: TARGET_ID, old_role: "reviewer", new_role: "admin", changed: true, result_code: "role_changed",
    }),
    ...overrides,
  };
}

const input = { target_user_id: TARGET_ID, target_role: "admin" as const, expected_current_role: "reviewer" as const };

describe("changeUserRoleSchema", () => {
  it("accepts both closed role transitions", () => {
    expect(changeUserRoleSchema.parse(input)).toEqual(input);
    expect(changeUserRoleSchema.safeParse({ ...input, target_role: "reviewer", expected_current_role: "admin" }).success).toBe(true);
  });

  it.each([
    [{ ...input, target_user_id: "not-a-uuid" }],
    [{ ...input, target_role: "owner" }],
    [{ ...input, expected_current_role: "owner" }],
    [{ target_user_id: TARGET_ID }],
    [{ ...input, actor_id: ACTOR_ID }],
    [{ ...input, email: "person@example.invalid" }],
    [{ ...input, patch: { role: "admin" } }],
    [{ ...input, updated_at: "2026-07-31T00:00:00Z" }],
  ])("rejects invalid or expanded payload %#", (value) => {
    expect(changeUserRoleSchema.safeParse(value).success).toBe(false);
  });
});

describe("canChangeUserRole", () => {
  it("allows only admin", () => {
    expect(canChangeUserRole("admin")).toBe(true);
    expect(canChangeUserRole("reviewer")).toBe(false);
    expect(canChangeUserRole(null)).toBe(false);
    expect(canChangeUserRole(undefined as never)).toBe(false);
    expect(canChangeUserRole("owner" as never)).toBe(false);
  });
});

describe("changeUserRole service", () => {
  it("calls only the atomic boundary with the narrow payload", async () => {
    const dataSource = source();
    await expect(changeUserRole(input, dataSource)).resolves.toEqual({ success: true, target_user_id: TARGET_ID, old_role: "reviewer", new_role: "admin", changed: true, code: "role_changed" });
    expect(dataSource.changeRoleAtomically).toHaveBeenCalledWith(input);
  });

  it("maps no-change without widening the result", async () => {
    const dataSource = source({ changeRoleAtomically: vi.fn().mockResolvedValue({ result_target_user_id: TARGET_ID, old_role: "admin", new_role: "admin", changed: false, result_code: "no_change" }) });
    await expect(changeUserRole({ ...input, expected_current_role: "admin" }, dataSource)).resolves.toEqual({ success: true, target_user_id: TARGET_ID, old_role: "admin", new_role: "admin", changed: false, code: "no_change" });
  });

  it.each([
    ["role_conflict", "user_role_conflict"],
    ["last_admin_protected", "last_admin_protected"],
    ["target_not_found", "user_not_found"],
    ["forbidden", "user_role_forbidden"],
  ])("maps RPC %s", async (result_code, code) => {
    const dataSource = source({ changeRoleAtomically: vi.fn().mockResolvedValue({ result_target_user_id: TARGET_ID, old_role: "reviewer", new_role: "admin", changed: false, result_code }) });
    const result = await changeUserRole(input, dataSource);
    expect(result).toMatchObject({ success: false, code });
  });

  it("blocks reviewer, missing/invalid profile, unauthenticated and self-change before RPC", async () => {
    for (const dataSource of [
      source({ getProfile: vi.fn().mockResolvedValue({ role: "reviewer" }) }),
      source({ getProfile: vi.fn().mockResolvedValue(null) }),
      source({ getProfile: vi.fn().mockResolvedValue({ role: "owner" }) }),
      source({ getUser: vi.fn().mockResolvedValue(null) }),
      source({ getUser: vi.fn().mockResolvedValue({ id: TARGET_ID }) }),
    ]) {
      const result = await changeUserRole(input, dataSource);
      expect(result.success).toBe(false);
      expect(dataSource.changeRoleAtomically).not.toHaveBeenCalled();
    }
  });

  it("normalizes RPC errors and malformed rows", async () => {
    await expect(changeUserRole(input, source({ changeRoleAtomically: vi.fn().mockRejectedValue(new Error("private SQL detail")) }))).resolves.toEqual({ success: false, code: "user_role_change_failed", error: "Die Benutzerrolle konnte nicht aktualisiert werden." });
    await expect(changeUserRole(input, source({ changeRoleAtomically: vi.fn().mockResolvedValue({ result_target_user_id: TARGET_ID, old_role: "owner", new_role: "admin", changed: true, result_code: "role_changed" }) }))).resolves.toMatchObject({ success: false, code: "user_role_change_failed" });
  });
});
