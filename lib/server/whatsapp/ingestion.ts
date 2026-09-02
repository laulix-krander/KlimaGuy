import "server-only";

import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { createProductiveCycleRuntime } from "@/lib/server/conversation/productive-cycle-runtime";
import { runPersistentCustomerMessageCycle } from "@/lib/server/conversation/recoverable-cycle-runner";
import type { WhatsAppInboundText } from "./contracts";

const resultSchema = z.object({
  status: z.enum(["recorded", "duplicate"]),
  receipt_id: z.string().uuid(),
  transport_identity_id: z.string().uuid(),
  conversation_id: z.string().uuid(),
  internal_message_id: z.string().uuid(),
  cycle_eligible: z.boolean(),
}).strict();
export type WhatsAppIngestionResult = z.infer<typeof resultSchema>;
export type WhatsAppInboundPersistence = (event: WhatsAppInboundText) => Promise<WhatsAppIngestionResult>;
export type MessageCycleTrigger = (input: { message_id: string }) => Promise<void>;

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("configuration_error");
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } });
}

/** Narrow machine boundary: the service client never leaves this adapter. */
export const persistWhatsAppInboundText: WhatsAppInboundPersistence = async (event) => {
  const { data, error } = await serviceClient().rpc("ingest_whatsapp_inbound_text", {
    target_sender_scope: event.sender_scope,
    target_external_identity: event.external_sender_identity,
    target_provider_message_id: event.provider_message_id,
    target_occurred_at: event.provider_occurred_at,
    target_text: event.text,
  });
  if (error) throw new Error("message_persistence_failed");
  const parsed = resultSchema.safeParse(data);
  if (!parsed.success) throw new Error("message_persistence_failed");
  return parsed.data;
};

/** Runs the recoverable cycle with only the provider-independent internal UUID. */
export const triggerPersistentMessageCycle: MessageCycleTrigger = async ({ message_id }) => {
  const runtime = createProductiveCycleRuntime();
  await runPersistentCustomerMessageCycle(runtime.runner, { message_id });
};
