"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { findAuthUserIdByExactEmail } from "@/lib/server/user-administration-auth-read-adapter";
import { inviteReviewerByEmail } from "@/lib/server/user-administration-auth-invite-adapter";
import { inviteReviewer, type ReviewerInvitationResult } from "./reviewer-invitation-service";

export async function inviteReviewerAction(input: { email: string }): Promise<ReviewerInvitationResult> {
  const supabase = await createClient();
  const result = await inviteReviewer(input, {
    async getUser() { const { data, error } = await supabase.auth.getUser(); if (error) throw error; return data.user ? { id: data.user.id } : null; },
    async getProfile(id) { const { data, error } = await supabase.from("profiles").select("role").eq("id", id).maybeSingle(); if (error) throw error; return data; },
    findExistingAuthUserId: findAuthUserIdByExactEmail,
    invite: inviteReviewerByEmail,
    async getTargetProfile(id) { const { data, error } = await supabase.from("profiles").select("role").eq("id", id).maybeSingle(); if (error) throw error; return data; },
    async recordAudit(_actorId, targetUserId) { const { data, error } = await supabase.rpc("record_reviewer_invitation_audit", { target_user_id: targetUserId }); return !error && data === true; },
  });
  if (result.success && result.code === "reviewer_invited") revalidatePath("/admin/users");
  return result;
}
