import { readFile } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";
import { confirmReviewerInvite, type InviteConfirmationSource } from "@/lib/auth/confirm-reviewer-invite";

const invitedId = "11111111-1111-4111-8111-111111111111";
function source(overrides: Partial<InviteConfirmationSource> = {}): InviteConfirmationSource {
  return {
    getCurrentUser: vi.fn(async () => ({ id: invitedId })),
    verifyInvite: vi.fn(async () => ({ userId: invitedId })),
    ...overrides,
  };
}

describe("Invite confirmation", () => {
  it("verifiziert ausschließlich token_hash mit type invite", async () => {
    const data = source();
    expect(await confirmReviewerInvite(new URLSearchParams({ token_hash: "synthetic-hash", type: "invite" }), data)).toEqual({ success: true, userId: invitedId });
    expect(data.verifyInvite).toHaveBeenCalledOnce();
    expect(data.verifyInvite).toHaveBeenCalledWith("synthetic-hash");
    expect(data.getCurrentUser).toHaveBeenCalledTimes(2);
  });

  it.each([
    [{ type: "invite" }],
    [{ token_hash: "hash", type: "recovery" }],
    [{ token_hash: "hash", type: "signup" }],
    [{ token_hash: "hash", type: "invite", next: "https://evil.example" }],
    [{ token_hash: "hash", type: "invite", next: "/projects" }],
    [{ token_hash: "hash", type: "invite", access_token: "secret" }],
  ])("lehnt fehlende, falsche und freie Parameter ab: %o", async (params) => {
    const data = source();
    expect(await confirmReviewerInvite(new URLSearchParams(params), data)).toEqual({ success: false });
    expect(data.verifyInvite).not.toHaveBeenCalled();
  });

  it("erlaubt nur das feste interne next-Ziel", async () => {
    expect((await confirmReviewerInvite(new URLSearchParams({ token_hash: "hash", type: "invite", next: "/auth/invite" }), source())).success).toBe(true);
  });

  it("behandelt ungültige, abgelaufene und Providerfehler neutral", async () => {
    expect(await confirmReviewerInvite(new URLSearchParams({ token_hash: "expired", type: "invite" }), source({ verifyInvite: async () => null }))).toEqual({ success: false });
    expect(await confirmReviewerInvite(new URLSearchParams({ token_hash: "error", type: "invite" }), source({ verifyInvite: async () => { throw new Error("provider detail"); } }))).toEqual({ success: false });
  });

  it("lehnt eine nach Verifikation abweichende fremde Session ab", async () => {
    const getCurrentUser = vi.fn().mockResolvedValueOnce({ id: "22222222-2222-4222-8222-222222222222" }).mockResolvedValueOnce({ id: "33333333-3333-4333-8333-333333333333" });
    expect(await confirmReviewerInvite(new URLSearchParams({ token_hash: "hash", type: "invite" }), source({ getCurrentUser }))).toEqual({ success: false });
  });
});

describe("Confirm route architecture", () => {
  it("verwendet verifyOtp, feste Redirects und tokenfreie Fehler", async () => {
    const route = await readFile("app/auth/confirm/route.ts", "utf8");
    expect(route).toContain('verifyOtp({ token_hash: tokenHash, type: "invite" })');
    expect(route).toContain('const INVITE_PATH = "/auth/invite"');
    expect(route).toContain('const INVALID_PATH = "/auth/invite?error=invalid_or_expired"');
    expect(route).not.toMatch(/exchangeCodeForSession|setSession|auth\.admin|access_token|refresh_token|console\./);
  });
});
