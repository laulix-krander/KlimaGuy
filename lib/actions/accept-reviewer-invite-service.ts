import { acceptReviewerInviteSchema, roleSchema } from "@/lib/domain/schemas";

export const INVITE_PASSWORD_MESSAGES = {
  invite_password_updated: "Dein Passwort wurde gespeichert. Du kannst KlimaGuy jetzt verwenden.",
  invite_session_missing: "Die Einladung ist nicht mehr gültig. Bitte fordere eine neue Einladung an.",
  invite_session_invalid: "Die Einladung ist nicht mehr gültig. Bitte fordere eine neue Einladung an.",
  invite_profile_missing: "Das Benutzerprofil konnte nicht bestätigt werden.",
  invite_profile_invalid: "Das Benutzerprofil ist nicht für diesen Zugriff freigegeben.",
  invite_password_invalid: "Das Passwort erfüllt die Anforderungen nicht.",
  invite_password_mismatch: "Die Passwörter stimmen nicht überein.",
  invite_link_invalid_or_expired: "Der Einladungslink ist ungültig oder abgelaufen.",
  invite_password_update_failed: "Das Passwort konnte nicht gespeichert werden.",
  invite_already_completed: "Das Passwort wurde bereits gespeichert.",
} as const;

export type InvitePasswordCode = keyof typeof INVITE_PASSWORD_MESSAGES;
export type InvitePasswordResult =
  | { success: true; code: "invite_password_updated"; message: string }
  | { success: false; code: Exclude<InvitePasswordCode, "invite_password_updated">; message: string };

export type InvitePasswordDataSource = {
  getUser(): Promise<{ id: string } | null>;
  getProfile(id: string): Promise<{ role: unknown } | null>;
  updatePassword(password: string): Promise<boolean>;
};

function failure(code: Exclude<InvitePasswordCode, "invite_password_updated">): InvitePasswordResult {
  return { success: false, code, message: INVITE_PASSWORD_MESSAGES[code] };
}

export async function acceptReviewerInvite(
  raw: unknown,
  inviteUserId: string | null,
  source: InvitePasswordDataSource,
): Promise<InvitePasswordResult> {
  const parsed = acceptReviewerInviteSchema.safeParse(raw);
  if (!parsed.success) {
    const mismatch = parsed.error.issues.some((issue) => issue.path[0] === "password_confirmation" && issue.code === "custom");
    return failure(mismatch ? "invite_password_mismatch" : "invite_password_invalid");
  }
  if (!inviteUserId) return failure("invite_session_missing");

  try {
    const user = await source.getUser();
    if (!user) return failure("invite_session_missing");
    if (user.id !== inviteUserId) return failure("invite_session_invalid");
    const profile = await source.getProfile(user.id);
    if (!profile) return failure("invite_profile_missing");
    if (!roleSchema.safeParse(profile.role).success) return failure("invite_profile_invalid");
    if (!await source.updatePassword(parsed.data.password)) return failure("invite_password_update_failed");
    return { success: true, code: "invite_password_updated", message: INVITE_PASSWORD_MESSAGES.invite_password_updated };
  } catch {
    return failure("invite_password_update_failed");
  }
}
