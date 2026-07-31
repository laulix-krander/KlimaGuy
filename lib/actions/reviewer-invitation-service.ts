import { canInviteReviewer } from "@/lib/domain/permissions";
import { inviteReviewerSchema, roleSchema } from "@/lib/domain/schemas";

export const REVIEWER_INVITATION_MESSAGES = {
  reviewer_invited: "Die Reviewer-Einladung wurde versendet.",
  reviewer_already_exists: "Für diese E-Mail-Adresse besteht bereits ein Benutzerkonto.",
  reviewer_invitation_pending: "Für diese E-Mail-Adresse besteht bereits eine offene Einladung.",
  reviewer_invitation_forbidden: "Der Zugriff ist nicht erlaubt.",
  reviewer_invitation_invalid_email: "Bitte gib eine gültige E-Mail-Adresse ein.",
  reviewer_invitation_conflict: "Die Einladung konnte wegen eines zwischenzeitlichen Konflikts nicht erstellt werden.",
  reviewer_invitation_configuration_error: "Die Einladungsfunktion ist derzeit nicht korrekt konfiguriert.",
  reviewer_profile_inconsistent: "Die Einladung wurde erstellt, das Reviewer-Profil konnte jedoch nicht bestätigt werden.",
  reviewer_invitation_failed: "Die Reviewer-Einladung konnte nicht versendet werden.",
} as const;

export type ReviewerInvitationCode = keyof typeof REVIEWER_INVITATION_MESSAGES;
export type ReviewerInvitationResult =
  | { success: true; code: "reviewer_invited"; target_user_id: string }
  | { success: false; code: Exclude<ReviewerInvitationCode, "reviewer_invited">; message: string };

export type ReviewerInvitationDataSource = {
  getUser(): Promise<{ id: string } | null>;
  getProfile(id: string): Promise<{ role: unknown } | null>;
  findExistingAuthUserId(email: string): Promise<string | null>;
  invite(email: string): Promise<{ success: true; targetUserId: string } | { success: false; reason: "configuration" | "provider" }>;
  getTargetProfile(id: string): Promise<{ role: unknown } | null>;
  recordAudit(actorId: string, targetUserId: string): Promise<boolean>;
};

function failure(code: Exclude<ReviewerInvitationCode, "reviewer_invited">): ReviewerInvitationResult {
  return { success: false, code, message: REVIEWER_INVITATION_MESSAGES[code] };
}

export async function inviteReviewer(raw: unknown, source: ReviewerInvitationDataSource): Promise<ReviewerInvitationResult> {
  const parsed = inviteReviewerSchema.safeParse(raw);
  if (!parsed.success) return failure("reviewer_invitation_invalid_email");
  try {
    const actor = await source.getUser();
    if (!actor) return failure("reviewer_invitation_forbidden");
    const actorProfile = await source.getProfile(actor.id);
    const actorRole = roleSchema.safeParse(actorProfile?.role);
    if (!actorProfile || !actorRole.success || !canInviteReviewer(actorRole.data)) return failure("reviewer_invitation_forbidden");
    if (await source.findExistingAuthUserId(parsed.data.email)) return failure("reviewer_already_exists");
    const invited = await source.invite(parsed.data.email);
    if (!invited.success) return failure(invited.reason === "configuration" ? "reviewer_invitation_configuration_error" : "reviewer_invitation_conflict");
    const targetProfile = await source.getTargetProfile(invited.targetUserId);
    const targetRole = roleSchema.safeParse(targetProfile?.role);
    if (!targetRole.success || targetRole.data !== "reviewer") return failure("reviewer_profile_inconsistent");
    if (!await source.recordAudit(actor.id, invited.targetUserId)) return failure("reviewer_invitation_failed");
    return { success: true, code: "reviewer_invited", target_user_id: invited.targetUserId };
  } catch {
    return failure("reviewer_invitation_failed");
  }
}
