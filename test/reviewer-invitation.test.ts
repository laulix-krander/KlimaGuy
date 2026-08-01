import { readFile } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";
import { canInviteReviewer } from "@/lib/domain/permissions";
import { inviteReviewerSchema } from "@/lib/domain/schemas";
import { inviteReviewer, type ReviewerInvitationDataSource } from "@/lib/actions/reviewer-invitation-service";

const actorId = "11111111-1111-4111-8111-111111111111";
const targetId = "22222222-2222-4222-8222-222222222222";

function source(overrides: Partial<ReviewerInvitationDataSource> = {}): ReviewerInvitationDataSource {
  return {
    getUser: vi.fn(async () => ({ id: actorId })),
    getProfile: vi.fn(async () => ({ role: "admin" })),
    findExistingAuthUserId: vi.fn(async () => null),
    invite: vi.fn(async () => ({ success: true as const, targetUserId: targetId })),
    getTargetProfile: vi.fn(async () => ({ role: "reviewer" })),
    recordAudit: vi.fn(async () => true),
    ...overrides,
  };
}

describe("Reviewer invitation schema and permission", () => {
  it("trims a valid address and accepts only email", () => {
    expect(inviteReviewerSchema.parse({ email: "  reviewer@example.com " })).toEqual({ email: "reviewer@example.com" });
    for (const key of ["role", "redirect_url", "actor_id", "metadata", "password"]) {
      expect(inviteReviewerSchema.safeParse({ email: "reviewer@example.com", [key]: "x" }).success).toBe(false);
    }
  });
  it("rejects empty, missing, invalid and overlong addresses", () => {
    for (const value of [{}, { email: "" }, { email: "invalid" }, { email: `${"a".repeat(250)}@x.de` }]) {
      expect(inviteReviewerSchema.safeParse(value).success).toBe(false);
    }
  });
  it("allows only admin and fails closed", () => {
    expect(canInviteReviewer("admin")).toBe(true);
    expect(canInviteReviewer("reviewer")).toBe(false);
    expect(canInviteReviewer(null)).toBe(false);
    expect(canInviteReviewer("owner" as never)).toBe(false);
  });
});

describe("Reviewer invitation service", () => {
  it("invites once, verifies reviewer profile and audits", async () => {
    const data = source();
    const result = await inviteReviewer({ email: "reviewer@example.com" }, data);
    expect(result).toEqual({ success: true, code: "reviewer_invited", target_user_id: targetId });
    expect(data.invite).toHaveBeenCalledTimes(1);
    expect(data.getTargetProfile).toHaveBeenCalledWith(targetId);
    expect(JSON.stringify(result)).not.toContain("reviewer@example.com");
  });
  it("rejects sessions, profiles and roles fail closed", async () => {
    expect((await inviteReviewer({ email: "a@b.de" }, source({ getUser: async () => null }))).code).toBe("reviewer_invitation_forbidden");
    expect((await inviteReviewer({ email: "a@b.de" }, source({ getProfile: async () => null }))).code).toBe("reviewer_invitation_forbidden");
    expect((await inviteReviewer({ email: "a@b.de" }, source({ getProfile: async () => ({ role: "reviewer" }) }))).code).toBe("reviewer_invitation_forbidden");
    expect((await inviteReviewer({ email: "a@b.de" }, source({ getProfile: async () => ({ role: "owner" }) }))).code).toBe("reviewer_invitation_forbidden");
  });
  it("does not invite an existing account or retry a provider conflict", async () => {
    const existing = source({ findExistingAuthUserId: async () => targetId });
    expect((await inviteReviewer({ email: "a@b.de" }, existing)).code).toBe("reviewer_already_exists");
    expect(existing.invite).not.toHaveBeenCalled();
    const conflict = source({ invite: vi.fn(async () => ({ success: false as const, reason: "provider" as const })) });
    expect((await inviteReviewer({ email: "a@b.de" }, conflict)).code).toBe("reviewer_invitation_conflict");
    expect(conflict.invite).toHaveBeenCalledTimes(1);
  });
  it("maps configuration and profile inconsistency without exposing details", async () => {
    expect((await inviteReviewer({ email: "a@b.de" }, source({ invite: async () => ({ success: false, reason: "configuration" }) }))).code).toBe("reviewer_invitation_configuration_error");
    expect((await inviteReviewer({ email: "a@b.de" }, source({ getTargetProfile: async () => null }))).code).toBe("reviewer_profile_inconsistent");
    expect((await inviteReviewer({ email: "a@b.de" }, source({ getTargetProfile: async () => ({ role: "admin" }) }))).code).toBe("reviewer_profile_inconsistent");
  });
});

describe("Reviewer invitation architecture", () => {
  it("uses a hardened unconditional reviewer trigger", async () => {
    const sql = await readFile("supabase/migrations/202607310002_reviewer_invitation_profile_trigger.sql", "utf8");
    expect(sql).toMatch(/after insert on auth\.users/i);
    expect(sql).toMatch(/security definer/i);
    expect(sql).toMatch(/set search_path = public, pg_temp/i);
    expect(sql).toMatch(/values \(new\.id, 'reviewer'::public\.app_role\)/i);
    expect(sql).toMatch(/revoke execute.*public, anon, authenticated/i);
    expect(sql).not.toMatch(/raw_user_meta_data|raw_app_meta_data|on conflict|update public\.profiles|create policy|grant (insert|update|delete)/i);
  });
  it("keeps the invite adapter narrow and the action revalidation conditional", async () => {
    const adapter = await readFile("lib/server/user-administration-auth-invite-adapter.ts", "utf8");
    expect(adapter).toContain('import "server-only"');
    expect(adapter).toContain("inviteUserByEmail(email, { redirectTo })");
    expect(adapter).toContain("REVIEWER_INVITE_REDIRECT_URL");
    expect(adapter).toContain('url.pathname !== "/auth/confirm"');
    expect(adapter).not.toMatch(/createUser\(|updateUserById\(|deleteUser\(|listUsers\(|\.storage/);
    const action = await readFile("lib/actions/reviewer-invitation.ts", "utf8");
    expect(action).toContain('revalidatePath("/admin/users")');
    expect(action).not.toMatch(/auth\.admin|redirect\(/);
  });
});
