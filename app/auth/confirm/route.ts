import { NextResponse, type NextRequest } from "next/server";
import { confirmReviewerInvite } from "@/lib/auth/confirm-reviewer-invite";
import { REVIEWER_INVITE_CONTEXT_COOKIE, reviewerInviteCookieOptions } from "@/lib/auth/reviewer-invite-context";
import { createClient } from "@/lib/supabase/server";

const INVITE_PATH = "/auth/invite";
const INVALID_PATH = "/auth/invite?error=invalid_or_expired";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const result = await confirmReviewerInvite(request.nextUrl.searchParams, {
    async getCurrentUser() {
      const { data } = await supabase.auth.getUser();
      return data.user ? { id: data.user.id } : null;
    },
    async verifyInvite(tokenHash) {
      const { data, error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: "invite" });
      return error || !data.user ? null : { userId: data.user.id };
    },
  });
  const response = NextResponse.redirect(new URL(result.success ? INVITE_PATH : INVALID_PATH, request.url));
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  if (result.success) response.cookies.set(REVIEWER_INVITE_CONTEXT_COOKIE, result.userId, reviewerInviteCookieOptions);
  return response;
}
