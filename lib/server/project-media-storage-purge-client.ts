import "server-only";

import { createClient } from "@supabase/supabase-js";

export type ProjectMediaStorageRemoveClient = {
  storage: { from(bucket: string): { remove(paths: string[]): Promise<{ data: { name: string }[] | null; error: { statusCode?: string; error?: string } | null }> } };
};

export function createProjectMediaStorageRemoveClient(): ProjectMediaStorageRemoveClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) return null;
  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
}
