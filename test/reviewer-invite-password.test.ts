import { readFile } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";
import { acceptReviewerInviteSchema, INVITE_PASSWORD_MAX_LENGTH, INVITE_PASSWORD_MIN_LENGTH } from "@/lib/domain/schemas";
import { acceptReviewerInvite, type InvitePasswordDataSource } from "@/lib/actions/accept-reviewer-invite-service";

const userId = "11111111-1111-4111-8111-111111111111";
const valid = { password: "sicher-passwort", password_confirmation: "sicher-passwort" };
function source(overrides: Partial<InvitePasswordDataSource> = {}): InvitePasswordDataSource {
  return {
    getUser: vi.fn(async () => ({ id: userId })),
    getProfile: vi.fn(async () => ({ role: "reviewer" })),
    updatePassword: vi.fn(async () => true),
    ...overrides,
  };
}

describe("Invite password schema", () => {
  it("akzeptiert exakt zwei passende Passwortfelder", () => expect(acceptReviewerInviteSchema.parse(valid)).toEqual(valid));
  it("lehnt Grenzen, Mismatch und Zusatzfelder strikt ab", () => {
    expect(acceptReviewerInviteSchema.safeParse({ ...valid, password: "x".repeat(INVITE_PASSWORD_MIN_LENGTH - 1) }).success).toBe(false);
    expect(acceptReviewerInviteSchema.safeParse({ password: "x".repeat(INVITE_PASSWORD_MAX_LENGTH + 1), password_confirmation: "x".repeat(INVITE_PASSWORD_MAX_LENGTH + 1) }).success).toBe(false);
    expect(acceptReviewerInviteSchema.safeParse({ ...valid, password_confirmation: "anders123" }).success).toBe(false);
    for (const key of ["user_id", "email", "role", "token", "token_hash", "redirect", "next"]) {
      expect(acceptReviewerInviteSchema.safeParse({ ...valid, [key]: "manipuliert" }).success).toBe(false);
    }
  });
});

describe("Invite password service", () => {
  it("prüft aktuelle Identität und Profil und aktualisiert genau einmal", async () => {
    const data = source();
    expect(await acceptReviewerInvite(valid, userId, data)).toEqual({ success: true, code: "invite_password_updated", message: "Dein Passwort wurde gespeichert. Du kannst KlimaGuy jetzt verwenden." });
    expect(data.getProfile).toHaveBeenCalledWith(userId);
    expect(data.updatePassword).toHaveBeenCalledOnce();
    expect(data.updatePassword).toHaveBeenCalledWith(valid.password);
  });
  it("schließt fehlende oder fremde Sessions vor der Mutation", async () => {
    for (const [context, data, code] of [
      [null, source(), "invite_session_missing"],
      [userId, source({ getUser: async () => null }), "invite_session_missing"],
      ["22222222-2222-4222-8222-222222222222", source(), "invite_session_invalid"],
    ] as const) {
      expect((await acceptReviewerInvite(valid, context, data)).code).toBe(code);
      expect(data.updatePassword).not.toHaveBeenCalled();
    }
  });
  it("mappt Profil- und Providerzustände neutral und ohne Secrets", async () => {
    const cases: [InvitePasswordDataSource, string][] = [
      [source({ getProfile: async () => null }), "invite_profile_missing"],
      [source({ getProfile: async () => ({ role: "owner" }) }), "invite_profile_invalid"],
      [source({ updatePassword: async () => false }), "invite_password_update_failed"],
      [source({ updatePassword: async () => { throw new Error("provider secret"); } }), "invite_password_update_failed"],
    ];
    for (const [data, code] of cases) {
      const result = await acceptReviewerInvite(valid, userId, data);
      expect(result.code).toBe(code);
      expect(JSON.stringify(result)).not.toMatch(/sicher-passwort|provider secret|11111111/);
    }
  });
});

describe("Invite password architecture", () => {
  it("mutiert nur das Passwort der authentifizierten Session", async () => {
    const action = await readFile("lib/actions/accept-reviewer-invite.ts", "utf8");
    expect(action).toContain("supabase.auth.updateUser({ password })");
    expect(action).not.toMatch(/auth\.admin|updateUserById|SUPABASE_SERVICE_ROLE|from\("profiles"\)\.update|console\./);
  });
});
