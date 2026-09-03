import "server-only";

import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { sendWhatsAppText, type WhatsAppSendResult } from "./outbound-adapter";
import { runRecoverableWhatsAppDelivery, type RecoverableWhatsAppDeliveryDependencies } from "./recoverable-delivery-runner";

export const WHATSAPP_DELIVERY_LEASE_SECONDS = 60 as const;
export const WHATSAPP_DELIVERY_RECOVERY_LIMIT = 5 as const;

const uuid = z.string().uuid();
const acquiredSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("acquired"), delivery_command_id: uuid, outbound_message_id: uuid, execution_owner_id: uuid, execution_lease_expires_at: z.string().datetime({ offset: true }), destination: z.string().min(1), text: z.string().min(1), sender_scope: z.string().min(1) }).strict(),
  z.object({ status: z.enum(["busy", "already_terminal", "not_due", "retry_not_allowed", "ambiguous", "attempts_exhausted"]), delivery_command_id: uuid }).strict(),
  z.object({ status: z.enum(["not_sendable", "not_authorized", "invalid_request"]) }).strict(),
]);
const revalidationSchema = z.object({ status: z.enum(["valid", "blocked", "ownership_lost", "not_authorized"]) }).strict();
const dispatchSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("authorized"), delivery_command_id: uuid, attempt_number: z.number().int().min(1).max(3), dispatch_token: uuid, dispatch_started_at: z.string().datetime({ offset: true }) }).strict(),
  z.object({ status: z.enum(["already_authorized", "attempts_exhausted", "ownership_lost", "not_authorized"]) }).strict(),
]);
const completionSchema = z.object({ status: z.enum(["completed", "ownership_lost", "stale_attempt", "invalid_result", "binding_conflict", "not_authorized"]) }).strict();
const preDispatchSchema = z.object({ status: z.enum(["completed", "ownership_lost", "dispatch_possible", "invalid_result", "not_authorized"]) }).strict();
const recoverySchema = z.object({ status: z.enum(["finalized", "safe_to_run", "busy", "already_terminal", "provider_binding_exists", "not_eligible", "inconsistent_attempt", "not_authorized"]) }).strict();
const discoverySchema = z.array(z.object({ delivery_command_id: uuid, outbound_message_id: uuid, recovery_action: z.enum(["SAFE_TO_RUN", "FINALIZE_AMBIGUOUS"]) }).strict()).max(WHATSAPP_DELIVERY_RECOVERY_LIMIT);

type AuthorizedDispatch = Extract<z.infer<typeof dispatchSchema>, { status: "authorized" }>;
export type DeliveryAcquireResult = z.infer<typeof acquiredSchema>;
export type DeliveryRecoveryResult = z.infer<typeof recoverySchema>;
export type RecoverableDelivery = z.infer<typeof discoverySchema>[number];

export type DeliveryPersistence = {
  acquire(messageId: string, ownerId: string): Promise<DeliveryAcquireResult>;
  revalidate(commandId: string, ownerId: string): Promise<z.infer<typeof revalidationSchema>>;
  authorize(commandId: string, ownerId: string, dispatchToken: string): Promise<z.infer<typeof dispatchSchema>>;
  failPreDispatch(commandId: string, ownerId: string): Promise<z.infer<typeof preDispatchSchema>>;
  complete(commandId: string, ownerId: string, dispatch: AuthorizedDispatch, result: WhatsAppSendResult): Promise<z.infer<typeof completionSchema>>;
};

function client() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("delivery_configuration_error");
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } });
}

async function rpc(name: string, parameters: Record<string, unknown>, errorCode: string): Promise<unknown> {
  const { data, error } = await client().rpc(name, parameters);
  if (error) throw new Error(errorCode);
  return data;
}

export const whatsAppDeliveryPersistence: DeliveryPersistence = {
  async acquire(messageId, ownerId) { return acquiredSchema.parse(await rpc("acquire_whatsapp_delivery_execution", { target_internal_message_id: messageId, target_execution_owner_id: ownerId }, "delivery_acquire_failed")); },
  async revalidate(commandId, ownerId) { return revalidationSchema.parse(await rpc("revalidate_whatsapp_outbound_delivery", { target_delivery_command_id: commandId, target_execution_owner_id: ownerId }, "delivery_revalidation_failed")); },
  async authorize(commandId, ownerId, dispatchToken) { return dispatchSchema.parse(await rpc("authorize_whatsapp_outbound_dispatch", { target_delivery_command_id: commandId, target_execution_owner_id: ownerId, target_dispatch_token: dispatchToken }, "delivery_dispatch_authorization_failed")); },
  async failPreDispatch(commandId, ownerId) { return preDispatchSchema.parse(await rpc("fail_whatsapp_outbound_pre_dispatch", { target_delivery_command_id: commandId, target_execution_owner_id: ownerId, target_failure_code: "provider_auth_error", target_retry_classification: "configuration" }, "delivery_pre_dispatch_completion_failed")); },
  async complete(commandId, ownerId, dispatch, result) { return completionSchema.parse(await rpc("complete_whatsapp_outbound_delivery", { target_delivery_command_id: commandId, target_execution_owner_id: ownerId, target_dispatch_token: dispatch.dispatch_token, target_attempt_number: dispatch.attempt_number, target_success: result.success, target_provider_message_id: result.success ? result.providerMessageId : null, target_failure_code: result.success ? null : result.failureCode, target_retry_classification: result.success ? null : result.retryClassification, target_provider_accepted_at: result.success ? result.acceptedAt : null }, "delivery_completion_failed")); },
};

export async function acquireWhatsAppDeliveryExecution(messageId: string, ownerId: string, store: Pick<DeliveryPersistence, "acquire"> = whatsAppDeliveryPersistence) {
  return store.acquire(uuid.parse(messageId), uuid.parse(ownerId));
}

export async function finalizeExpiredWhatsAppDeliveryAmbiguous(commandId: string): Promise<DeliveryRecoveryResult> {
  return recoverySchema.parse(await rpc("finalize_expired_whatsapp_delivery_ambiguous", { target_delivery_command_id: uuid.parse(commandId) }, "delivery_recovery_failed"));
}

export async function discoverRecoverableWhatsAppDeliveries(limit = WHATSAPP_DELIVERY_RECOVERY_LIMIT): Promise<RecoverableDelivery[]> {
  return discoverySchema.parse(await rpc("discover_recoverable_whatsapp_deliveries", { target_limit: Math.min(Math.max(Math.trunc(limit), 0), WHATSAPP_DELIVERY_RECOVERY_LIMIT) }, "delivery_discovery_failed"));
}

export function createProductiveRecoverableWhatsAppDeliveryDependencies(): RecoverableWhatsAppDeliveryDependencies {
  return {
    ...whatsAppDeliveryPersistence,
    readConfiguration: () => ({ accessToken: process.env.WHATSAPP_ACCESS_TOKEN, phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID, graphApiVersion: process.env.WHATSAPP_GRAPH_API_VERSION }),
    send: sendWhatsAppText,
    finalizeAmbiguous: finalizeExpiredWhatsAppDeliveryAmbiguous,
  };
}

/** Compatibility adapter; the recoverable runner is the sole orchestration path. */
export async function deliverPendingWhatsAppMessage(input: { internal_message_id: string }, deps: { store?: DeliveryPersistence; send?: typeof sendWhatsAppText; env?: Partial<NodeJS.ProcessEnv>; createExecutionOwner?: () => string; createDispatchToken?: () => string } = {}): Promise<{ deliveryCommandId?: string; status: string }> {
  const store = deps.store ?? whatsAppDeliveryPersistence;
  const env = deps.env ?? process.env;
  let deliveryCommandId: string | undefined;
  const result = await runRecoverableWhatsAppDelivery({ outbound_message_id: input.internal_message_id }, {
    ...store,
    acquire: async (messageId, ownerId) => {
      const acquired = await store.acquire(messageId, ownerId);
      if ("delivery_command_id" in acquired) deliveryCommandId = acquired.delivery_command_id;
      return acquired;
    },
    readConfiguration: () => ({ accessToken: env.WHATSAPP_ACCESS_TOKEN, phoneNumberId: env.WHATSAPP_PHONE_NUMBER_ID, graphApiVersion: env.WHATSAPP_GRAPH_API_VERSION }),
    send: deps.send ?? sendWhatsAppText,
    finalizeAmbiguous: finalizeExpiredWhatsAppDeliveryAmbiguous,
    createExecutionOwner: deps.createExecutionOwner,
    createDispatchToken: deps.createDispatchToken,
  });
  const legacyStatus = result.status === "sent" ? "accepted_by_provider" : result.status === "ambiguous" ? "delivery_ambiguous" : result.status === "terminal_failed" ? "blocked" : result.status;
  return { deliveryCommandId, status: legacyStatus };
}
