export type InviteConfirmationSource = {
  getCurrentUser(): Promise<{ id: string } | null>;
  verifyInvite(tokenHash: string): Promise<{ userId: string } | null>;
};

export type InviteConfirmationResult =
  | { success: true; userId: string }
  | { success: false };

export async function confirmReviewerInvite(
  searchParams: URLSearchParams,
  source: InviteConfirmationSource,
): Promise<InviteConfirmationResult> {
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");
  const next = searchParams.get("next");
  const keys = [...new Set(searchParams.keys())];
  if (keys.some((key) => !["token_hash", "type", "next"].includes(key))) return { success: false };
  if (!tokenHash || type !== "invite" || (next !== null && next !== "/auth/invite")) return { success: false };

  try {
    await source.getCurrentUser();
    const verified = await source.verifyInvite(tokenHash);
    if (!verified) return { success: false };
    const current = await source.getCurrentUser();
    if (!current || current.id !== verified.userId) return { success: false };
    return { success: true, userId: current.id };
  } catch {
    return { success: false };
  }
}
