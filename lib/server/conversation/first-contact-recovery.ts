import "server-only";

import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

export const FIRST_CONTACT_RECOVERY_BATCH_SIZE = 10;
const itemSchema = z.object({
  conversation_id: z.string().uuid(),
  recovery_action: z.enum(["FOUNDATION_REQUIRED", "INITIAL_PROMPT_REQUIRED"]),
}).strict();
const discoverySchema = z.array(itemSchema).max(FIRST_CONTACT_RECOVERY_BATCH_SIZE);
export type FirstContactRecoveryItem = z.infer<typeof itemSchema>;

function client() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("first_contact_recovery_configuration_error");
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } });
}

/** Exactly one bounded, content-free service-role discovery call. */
export async function discoverRecoverableFirstContacts(limit = FIRST_CONTACT_RECOVERY_BATCH_SIZE): Promise<FirstContactRecoveryItem[]> {
  const bounded = Math.min(Math.max(Math.trunc(limit), 0), FIRST_CONTACT_RECOVERY_BATCH_SIZE);
  const { data, error } = await client().rpc("discover_recoverable_first_contacts", { target_limit: bounded });
  if (error) throw new Error("first_contact_recovery_discovery_failed");
  return discoverySchema.parse(data);
}
