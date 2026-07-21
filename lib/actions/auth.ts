import { createClient } from "@/lib/supabase/server";
import { roleSchema } from "@/lib/domain/schemas";
import type { CurrentUser } from "./types";

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data } = await supabase
    .from("profiles")
    .select("id,role,display_name")
    .eq("id", user.id)
    .single();

  const parsedRole = roleSchema.safeParse(data?.role);
  if (!data || !parsedRole.success) return null;

  return {
    id: user.id,
    role: parsedRole.data,
    displayName: typeof data.display_name === "string" ? data.display_name : null,
  };
}

export async function requireCurrentUser(): Promise<CurrentUser> {
  const currentUser = await getCurrentUser();
  if (!currentUser) throw new Error("AUTH_REQUIRED");
  return currentUser;
}
