import "server-only";

import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { initializeFirstContactPrompt } from "./first-contact-initial-prompt";

/** Productive server-only entry point. It accepts only the persisted conversation identity. */
export async function runFirstContactInitialPrompt(conversationId: string) {
  const url = z.string().url().safeParse(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const key = z.string().min(1).safeParse(process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (!url.success || !key.success) return { status: "persistence_failed" } as const;
  const client = createClient(url.data, key.data, { auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } });
  return initializeFirstContactPrompt({
    async rpc(name, args) {
      const { data, error } = await client.rpc(name, args);
      return { data, error };
    },
  }, conversationId);
}
