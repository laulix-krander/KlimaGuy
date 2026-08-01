import { describe, expect, it } from "vitest";
import { getReviewerInviteAccess } from "@/lib/auth/reviewer-invite-access";

const id = "11111111-1111-4111-8111-111111111111";
const source = (user: { id: string } | null = { id }, profile: { role: unknown } | null = { role: "reviewer" }) => ({ getUser: async () => user, getProfile: async () => profile });

describe("Invite page access", () => {
  it("erlaubt Reviewer und andere gültige Anwendungsrollen nur im gebundenen Invitekontext", async () => {
    expect(await getReviewerInviteAccess(source(), id)).toEqual({ allowed: true, role: "reviewer" });
    expect(await getReviewerInviteAccess(source({ id }, { role: "admin" }), id)).toEqual({ allowed: true, role: "admin" });
  });
  it("schließt direkten Aufruf, fehlenden User, fremde Session und Profile", async () => {
    expect(await getReviewerInviteAccess(source(), null)).toEqual({ allowed: false, code: "session_missing" });
    expect(await getReviewerInviteAccess(source(null), id)).toEqual({ allowed: false, code: "session_missing" });
    expect(await getReviewerInviteAccess(source({ id: "22222222-2222-4222-8222-222222222222" }), id)).toEqual({ allowed: false, code: "session_invalid" });
    expect(await getReviewerInviteAccess(source({ id }, null), id)).toEqual({ allowed: false, code: "profile_missing" });
    expect(await getReviewerInviteAccess(source({ id }, { role: "owner" }), id)).toEqual({ allowed: false, code: "profile_invalid" });
  });
});
