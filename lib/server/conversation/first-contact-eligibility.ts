import "server-only";

import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

const resultSchema = z.object({
  status: z.enum(["healable", "already_initialized", "not_applicable", "invalid_state"]),
}).strict();

export type FirstContactEligibilityResult = z.infer<typeof resultSchema>;
export type FirstContactEligibilitySource = {
  rpc(name: "get_first_contact_eligibility", args: { target_conversation_id: string }): Promise<{ data: unknown; error: unknown }>;
};

/** Content-free, persisted-state-only routing authority. */
export async function getFirstContactEligibility(
  source: FirstContactEligibilitySource,
  conversationId: string,
): Promise<FirstContactEligibilityResult> {
  if (!z.string().uuid().safeParse(conversationId).success) return { status: "invalid_state" };
  const response = await source.rpc("get_first_contact_eligibility", { target_conversation_id: conversationId });
  if (response.error) return { status: "invalid_state" };
  const parsed = resultSchema.safeParse(response.data);
  return parsed.success ? parsed.data : { status: "invalid_state" };
}

export async function readProductiveFirstContactEligibility(conversationId: string): Promise<FirstContactEligibilityResult> {
  const url = z.string().url().safeParse(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const key = z.string().min(1).safeParse(process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (!url.success || !key.success) return { status: "invalid_state" };
  const client = createClient(url.data, key.data, { auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } });
  return getFirstContactEligibility({
    async rpc(_name, args) {
      const { data, error } = await client.rpc("get_first_contact_eligibility", args);
      return { data, error };
    },
  }, conversationId);
}
