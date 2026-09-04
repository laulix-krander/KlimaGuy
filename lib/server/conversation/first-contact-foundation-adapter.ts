import "server-only";

import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { bootstrapFirstContactFoundation } from "./first-contact-foundation";

export async function runFirstContactFoundation(conversationId: string) {
  const url = z.string().url().safeParse(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const key = z.string().min(1).safeParse(process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (!url.success || !key.success) return { status: "persistence_failure" } as const;
  const client = createClient(url.data, key.data, { auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } });
  return bootstrapFirstContactFoundation({
    async rpc(_name, args) {
      return client.rpc("bootstrap_first_contact_foundation", args);
    },
  }, conversationId);
}
