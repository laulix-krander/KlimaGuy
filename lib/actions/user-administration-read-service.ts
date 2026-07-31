import { canViewUserAdministration } from "@/lib/domain/permissions";
import { roleSchema, userAdministrationQuerySchema } from "@/lib/domain/schemas";
import type { Role } from "@/lib/domain/types";
import { listAuthUsersForAdministration, type AdministrationAuthUsersPage } from "@/lib/server/user-administration-auth-read-adapter";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";

const profileSchema = z.object({ id: z.string().uuid(), role: z.unknown() }).strip();

export type AdminUserDto = {
  user_id: string;
  email: string | null;
  role: Role | null;
  profile_status: "active" | "missing" | "invalid_role";
  auth_status: "unknown";
  created_at: string;
  is_current_user: boolean;
};

export type UserAdministrationResult =
  | { success: true; data: { users: AdminUserDto[]; page: number; per_page: number; has_next_page: boolean } }
  | { success: false; error: "Die Benutzerverwaltung konnte nicht geladen werden." };

type UserAdministrationDataSource = {
  getUser(): Promise<{ id: string } | null>;
  getProfile(id: string): Promise<{ role: unknown } | null>;
  listAuthUsers(input: { page: number; perPage: number }): Promise<AdministrationAuthUsersPage>;
  listProfilesByIds(ids: string[]): Promise<unknown[]>;
};

export async function readUserAdministration(
  query: unknown,
  source: UserAdministrationDataSource,
): Promise<UserAdministrationResult> {
  try {
    const user = await source.getUser();
    if (!user) throw new Error("forbidden");
    const ownProfile = await source.getProfile(user.id);
    const ownRole = roleSchema.safeParse(ownProfile?.role);
    if (!ownRole.success || !canViewUserAdministration(ownRole.data)) throw new Error("forbidden");
    const params = userAdministrationQuerySchema.parse(query);
    const authPage = await source.listAuthUsers({ page: params.page, perPage: params.per_page });
    const profiles = authPage.users.length === 0 ? [] : await source.listProfilesByIds(authPage.users.map(({ id }) => id));
    const profileById = new Map<string, unknown>();
    for (const rawProfile of profiles) {
      const profile = profileSchema.safeParse(rawProfile);
      if (profile.success) profileById.set(profile.data.id, profile.data.role);
    }

    // listUsers besitzt keinen Sortierparameter; sortiert wird nur die geladene Seite,
    // ohne eine global snapshotstabile Pagination bei parallelen Anlagen zu behaupten.
    const users = authPage.users.map((authUser): AdminUserDto => {
      if (!profileById.has(authUser.id)) return { user_id: authUser.id, email: authUser.email, role: null, profile_status: "missing", auth_status: "unknown", created_at: authUser.created_at, is_current_user: authUser.id === user.id };
      const role = roleSchema.safeParse(profileById.get(authUser.id));
      return { user_id: authUser.id, email: authUser.email, role: role.success ? role.data : null, profile_status: role.success ? "active" : "invalid_role", auth_status: "unknown", created_at: authUser.created_at, is_current_user: authUser.id === user.id };
    }).sort((left, right) => right.created_at.localeCompare(left.created_at) || right.user_id.localeCompare(left.user_id));
    return { success: true, data: { users, page: authPage.page, per_page: authPage.per_page, has_next_page: authPage.has_next_page } };
  } catch {
    return { success: false, error: "Die Benutzerverwaltung konnte nicht geladen werden." };
  }
}

export async function getUserAdministration(query: unknown): Promise<UserAdministrationResult> {
  const supabase = await createClient();
  return readUserAdministration(query, {
    async getUser() { const { data, error } = await supabase.auth.getUser(); if (error) throw error; return data.user ? { id: data.user.id } : null; },
    async getProfile(id) { const { data, error } = await supabase.from("profiles").select("role").eq("id", id).maybeSingle(); if (error) throw error; return data; },
    listAuthUsers: listAuthUsersForAdministration,
    async listProfilesByIds(ids) { const { data, error } = await supabase.from("profiles").select("id, role").in("id", ids); if (error) throw error; return data ?? []; },
  });
}
