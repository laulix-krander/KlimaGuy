import { z } from "zod";

export const transportProviderSchema = z.literal("whatsapp");
export const transportIdentityStatusSchema = z.enum(["active", "blocked"]);
export const transportBindingStatusSchema = z.enum(["active", "superseded"]);
export const transportReceiptStatusSchema = z.enum([
  "received",
  "processing",
  "processed",
  "unsupported",
  "failed",
]);
export const transportDirectionSchema = z.literal("inbound");

export const transportFailureCodeSchema = z.enum([
  "invalid_webhook_verification",
  "missing_signature",
  "invalid_signature",
  "payload_too_large",
  "malformed_payload",
  "unsupported_event",
  "unsupported_message_type",
  "duplicate_event",
  "duplicate_provider_message",
  "transport_identity_failed",
  "conversation_resolution_failed",
  "message_persistence_failed",
  "provider_binding_failed",
  "cycle_trigger_failed",
  "configuration_error",
]);

export const transportRetryClassificationSchema = z.enum([
  "retryable",
  "requires_recheck",
  "terminal",
  "configuration",
]);

const timestampSchema = z.string().datetime({ offset: true });

/** Provider-independent, server-bound persistence DTO. It intentionally has no payload or message text. */
export const transportReceiptSchema = z
  .object({
    id: z.string().uuid(),
    provider: transportProviderSchema,
    eventKind: z.string().min(1).max(64),
    status: transportReceiptStatusSchema,
    internalMessageId: z.string().uuid().nullable(),
    failureCode: transportFailureCodeSchema.nullable(),
    receivedAt: timestampSchema,
  })
  .strict();

/** Narrow admin projection; the external identity remains redacted at the persistence boundary. */
export const transportBindingAdminDtoSchema = z
  .object({
    transportIdentityId: z.string().uuid(),
    provider: transportProviderSchema,
    redactedIdentity: z.string().min(1).max(64),
    bindingStatus: transportBindingStatusSchema,
    conversationId: z.string().uuid(),
  })
  .strict();

export type TransportFailureCode = z.infer<typeof transportFailureCodeSchema>;
export type TransportRetryClassification = z.infer<
  typeof transportRetryClassificationSchema
>;
