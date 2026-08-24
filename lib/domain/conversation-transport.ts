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
export const transportDirectionSchema = z.enum(["inbound", "outbound"]);
const timestampSchema = z.string().datetime({ offset: true });

export const transportDeliveryStatusSchema = z.enum([
  "pending", "sending", "accepted_by_provider", "delivered", "read",
  "failed", "delivery_ambiguous", "blocked",
]);
export const transportDeliveryFailureCodeSchema = z.enum([
  "provider_auth_error", "rate_limited", "provider_rejected",
  "transient_provider_error", "network_error", "ambiguous_send_result",
  "destination_invalid", "conversation_not_sendable", "binding_missing",
  "stale_interaction", "human_takeover_blocked", "configuration_error",
]);
export const transportDeliveryRetryClassificationSchema = z.enum([
  "retryable", "requires_reconciliation", "terminal", "configuration",
  "human_review_required",
]);

export const transportDeliveryCommandDtoSchema = z.object({
  deliveryCommandId: z.string().uuid(), internalMessageId: z.string().uuid(),
  provider: transportProviderSchema, status: transportDeliveryStatusSchema,
  attemptCount: z.number().int().min(0).max(3), acceptedAt: timestampSchema.nullable(),
  deliveredAt: timestampSchema.nullable(), readAt: timestampSchema.nullable(),
  failedAt: timestampSchema.nullable(), createdAt: timestampSchema,
  updatedAt: timestampSchema,
}).strict();

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
