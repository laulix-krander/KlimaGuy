"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { changeUserRole, type ChangeUserRoleInput, type UserRoleChangeDataSource, type UserRoleChangeResult } from "./user-role-change-service";

export async function changeUserRoleAction(input: ChangeUserRoleInput): Promise<UserRoleChangeResult> {
  const supabase = await createClient();
  const source: UserRoleChangeDataSource = {
    async getUser() {
      const { data, error } = await supabase.auth.getUser();
      if (error) throw error;
      return data.user ? { id: data.user.id } : null;
    },
    async getProfile(userId) {
      const { data, error } = await supabase.from("profiles").select("role").eq("id", userId).maybeSingle();
      if (error) throw error;
      return data;
    },
    async changeRoleAtomically(args) {
      const { data, error } = await supabase.rpc("change_user_profile_role", args);
      if (error) throw error;
      return data?.[0] ?? null;
    },
  };

  const result = await changeUserRole(input, source);
  if (result.success && result.changed) revalidatePath("/admin/users");
  return result;
}
