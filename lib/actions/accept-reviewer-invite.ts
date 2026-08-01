"use server";

import { cookies } from "next/headers";
import { REVIEWER_INVITE_CONTEXT_COOKIE, reviewerInviteCookieOptions } from "@/lib/auth/reviewer-invite-context";
import { createClient } from "@/lib/supabase/server";
import { acceptReviewerInvite, type InvitePasswordResult } from "./accept-reviewer-invite-service";

export async function acceptReviewerInviteAction(input: {
  password: string;
  password_confirmation: string;
}): Promise<InvitePasswordResult> {
  const cookieStore = await cookies();
  const inviteUserId = cookieStore.get(REVIEWER_INVITE_CONTEXT_COOKIE)?.value ?? null;
  const supabase = await createClient();
  const result = await acceptReviewerInvite(input, inviteUserId, {
    async getUser() {
      const { data, error } = await supabase.auth.getUser();
      if (error) throw error;
      return data.user ? { id: data.user.id } : null;
    },
    async getProfile(id) {
      const { data, error } = await supabase.from("profiles").select("role").eq("id", id).maybeSingle();
      if (error) throw error;
      return data;
    },
    async updatePassword(password) {
      const { error } = await supabase.auth.updateUser({ password });
      return !error;
    },
  });
  if (result.success) cookieStore.set(REVIEWER_INVITE_CONTEXT_COOKIE, "", { ...reviewerInviteCookieOptions, maxAge: 0 });
  return result;
}
