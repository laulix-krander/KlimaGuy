import "server-only";

import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

const paramsSchema = z.object({
  page: z.number().int().min(1).max(10_000).default(1),
  perPage: z.number().int().min(1).max(50).default(25),
}).strict();

const authUserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email().nullable(),
  created_at: z.string().datetime({ offset: true }),
}).strict();

export type AdministrationAuthUser = z.infer<typeof authUserSchema>;
export type AdministrationAuthUsersPage = {
  users: AdministrationAuthUser[];
  page: number;
  per_page: number;
  total?: number;
  has_next_page: boolean;
};

export async function listAuthUsersForAdministration(
  input: { page?: number; perPage?: number } = {},
): Promise<AdministrationAuthUsersPage> {
  const params = paramsSchema.parse(input);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) throw new Error("user_administration_failed");

  try {
    const supabase = createClient(url, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    });
    const { data, error } = await supabase.auth.admin.listUsers({ page: params.page, perPage: params.perPage });
    if (error) throw error;
    const users = data.users.map((user) => authUserSchema.parse({
      id: user.id,
      email: user.email ?? null,
      created_at: user.created_at,
    }));
    const total = Number.isInteger(data.total) && data.total >= 0 ? data.total : undefined;
    return {
      users,
      page: params.page,
      per_page: params.perPage,
      ...(total === undefined ? {} : { total }),
      has_next_page: total === undefined
        ? users.length === params.perPage
        : params.page * params.perPage < total,
    };
  } catch {
    throw new Error("user_administration_failed");
  }
}
