import { z } from "zod";

export const TRANSPORT_MEDIA_IMAGE_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const TRANSPORT_MEDIA_MAX_IMAGE_BYTES = 15_000_000;
export const TRANSPORT_MEDIA_MAX_ATTEMPTS = 3;
export const TRANSPORT_MEDIA_STAGING_BUCKET = "transport-media-staging" as const;

export const transportMediaIngestionStatusSchema = z.enum([
  "pending", "resolving", "downloading", "staged", "failed", "blocked",
]);
export const transportMediaFailureCodeSchema = z.enum([
  "provider_contract_unavailable", "provider_auth_error", "provider_media_not_found",
  "provider_media_expired", "provider_metadata_transient", "provider_download_transient",
  "provider_download_ambiguous", "unsupported_media_type", "media_too_large",
  "media_integrity_mismatch", "download_timeout", "staging_storage_failed",
  "staging_finalize_failed", "conversation_not_found", "source_message_invalid",
  "provider_binding_invalid", "ingestion_already_completed", "configuration_error",
]);
export const transportMediaRetryClassificationSchema = z.enum([
  "retryable", "requires_reresolution", "terminal", "configuration", "requires_recheck",
]);
export const transportMediaStorageStateSchema = z.enum([
  "reserved", "object_stored", "staged", "failed", "tombstoned",
]);

/** Safe projection: provider identities, caption, token, URL and storage locator are excluded. */
export const transportMediaIngestionCommandDtoSchema = z.object({
  commandId: z.string().uuid(),
  sourceMessageId: z.string().uuid(),
  conversationId: z.string().uuid(),
  status: transportMediaIngestionStatusSchema,
  attemptCount: z.number().int().min(0).max(TRANSPORT_MEDIA_MAX_ATTEMPTS),
  stagingAssetId: z.string().uuid().nullable(),
  failureCode: transportMediaFailureCodeSchema.nullable(),
  completedAt: z.string().datetime({ offset: true }).nullable(),
}).strict();

export type TransportMediaImageMimeType = (typeof TRANSPORT_MEDIA_IMAGE_MIME_TYPES)[number];

export function detectTransportImageMime(header: Uint8Array): TransportMediaImageMimeType | null {
  if (header.length >= 3 && header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff) return "image/jpeg";
  if (header.length >= 8 && [0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a].every((byte, i) => header[i] === byte)) return "image/png";
  if (header.length >= 12 && new TextDecoder().decode(header.slice(0, 4)) === "RIFF"
    && new TextDecoder().decode(header.slice(8, 12)) === "WEBP") return "image/webp";
  return null;
}

export type TransportImageValidation =
  | { success: true; mimeType: TransportMediaImageMimeType }
  | { success: false; failureCode: "unsupported_media_type" | "media_too_large" | "media_integrity_mismatch" };

export function validateTransportImage(input: {
  bytes: Uint8Array;
  declaredMimeType: string;
  httpContentType: string;
}): TransportImageValidation {
  if (input.bytes.byteLength > TRANSPORT_MEDIA_MAX_IMAGE_BYTES) return { success: false, failureCode: "media_too_large" };
  const allowed = new Set<string>(TRANSPORT_MEDIA_IMAGE_MIME_TYPES);
  if (!allowed.has(input.declaredMimeType) || !allowed.has(input.httpContentType)) {
    return { success: false, failureCode: "unsupported_media_type" };
  }
  const magicMime = detectTransportImageMime(input.bytes.subarray(0, 12));
  if (!magicMime || magicMime !== input.declaredMimeType || magicMime !== input.httpContentType) {
    return { success: false, failureCode: "media_integrity_mismatch" };
  }
  return { success: true, mimeType: magicMime };
}
