import { roleSchema } from "@/lib/domain/schemas";
import type { Role } from "@/lib/domain/types";

export type InviteAccessCode = "ready" | "session_missing" | "session_invalid" | "profile_missing" | "profile_invalid";
export type InviteAccessResult =
  | { allowed: true; role: Role }
  | { allowed: false; code: Exclude<InviteAccessCode, "ready"> };

export async function getReviewerInviteAccess(source: {
  getUser(): Promise<{ id: string } | null>;
  getProfile(id: string): Promise<{ role: unknown } | null>;
}, inviteUserId: string | null): Promise<InviteAccessResult> {
  if (!inviteUserId) return { allowed: false, code: "session_missing" };
  try {
    const user = await source.getUser();
    if (!user) return { allowed: false, code: "session_missing" };
    if (user.id !== inviteUserId) return { allowed: false, code: "session_invalid" };
    const profile = await source.getProfile(user.id);
    if (!profile) return { allowed: false, code: "profile_missing" };
    const role = roleSchema.safeParse(profile.role);
    return role.success ? { allowed: true, role: role.data } : { allowed: false, code: "profile_invalid" };
  } catch {
    return { allowed: false, code: "session_invalid" };
  }
}
