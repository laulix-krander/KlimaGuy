import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { SYSTEM_ACTOR_KEY, type SystemActorProvisioningBoundary } from "./system-actor-provisioning.ts";

export function createSystemActorSupabaseBoundary(): SystemActorProvisioningBoundary {
  const url = z.string().url().parse(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const serviceRoleKey = z.string().min(1).parse(process.env.SUPABASE_SERVICE_ROLE_KEY);
  const client = createClient(url, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } });
  return {
    async verify() { const { data, error } = await client.rpc("verify_system_actor", { stable_actor_key: SYSTEM_ACTOR_KEY }); if (error) throw error; return data; },
    async findRecoverableAuthUser(email) {
      const perPage = 50;
      for (let page = 1; page <= 200; page += 1) {
        const { data, error } = await client.auth.admin.listUsers({ page, perPage });
        if (error) throw error;
        const user = data.users.find((candidate) => candidate.email === email);
        if (user) return { id: user.id, systemActorKey: typeof user.app_metadata?.system_actor_key === "string" ? user.app_metadata.system_actor_key : null };
        if (data.users.length < perPage || page * perPage >= data.total) return null;
      }
      throw new Error("bounded_auth_lookup_exhausted");
    },
    async createAuthUser({ email, password, systemActorKey }) {
      const { data, error } = await client.auth.admin.createUser({ email, password, email_confirm: true, app_metadata: { system_actor_key: systemActorKey } });
      if (error || !data.user) throw error ?? new Error("auth_user_missing");
      return { id: data.user.id };
    },
    async register(authUserId) { const { data, error } = await client.rpc("register_system_actor", { stable_actor_key: SYSTEM_ACTOR_KEY, target_auth_user_id: authUserId }); if (error) throw error; return data; },
    randomPassword() { return randomBytes(48).toString("base64url"); },
  };
}
