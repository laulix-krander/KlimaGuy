import "server-only";

import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

export type ReviewerAuthInviteResult =
  | { success: true; targetUserId: string }
  | { success: false; reason: "configuration" | "provider" };

function getRedirectUrl(): string | null {
  const raw = process.env.REVIEWER_INVITE_REDIRECT_URL;
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.username || url.password || url.hash) return null;
    if (process.env.NODE_ENV === "production") return url.protocol === "https:" ? url.toString() : null;
    const local = url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]";
    return url.protocol === "https:" || (url.protocol === "http:" && local) ? url.toString() : null;
  } catch {
    return null;
  }
}

export async function inviteReviewerByEmail(email: string): Promise<ReviewerAuthInviteResult> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const redirectTo = getRedirectUrl();
  if (!url || !serviceRoleKey || !redirectTo) return { success: false, reason: "configuration" };
  try {
    const supabase = createClient(url, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    });
    const { data, error } = await supabase.auth.admin.inviteUserByEmail(email, { redirectTo });
    if (error || !data.user) return { success: false, reason: "provider" };
    const id = z.string().uuid().safeParse(data.user.id);
    return id.success ? { success: true, targetUserId: id.data } : { success: false, reason: "provider" };
  } catch {
    return { success: false, reason: "provider" };
  }
}
