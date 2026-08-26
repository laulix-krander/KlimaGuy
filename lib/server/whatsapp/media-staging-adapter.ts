import "server-only";

import { createClient } from "@supabase/supabase-js";
import {
  TRANSPORT_MEDIA_STAGING_BUCKET,
  validateTransportImage,
  type TransportMediaImageMimeType,
} from "@/lib/domain/transport-media";

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";
const extension: Record<TransportMediaImageMimeType, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

export type StagedImagePutClient = {
  storage: { from(bucket: string): { upload(path: string, body: Uint8Array, options: { contentType: string; upsert: false }): Promise<{ error: unknown }> } };
};

function serviceStorageClient(): StagedImagePutClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } });
}

/** Narrow server-only write. Callers cannot supply bucket, URL, filename or arbitrary path. */
export async function putStagedWhatsAppImage(input: {
  stagingAssetId: string;
  bytes: Uint8Array;
  declaredMimeType: string;
  httpContentType: string;
}, client: StagedImagePutClient | null = serviceStorageClient()) {
  if (!new RegExp(`^${UUID}$`, "i").test(input.stagingAssetId)) return { success: false as const, failureCode: "staging_storage_failed" as const };
  const validated = validateTransportImage(input);
  if (!validated.success) return validated;
  if (!client) return { success: false as const, failureCode: "configuration_error" as const };
  const path = `assets/${input.stagingAssetId}/original.${extension[validated.mimeType]}`;
  if (!new RegExp(`^assets/${UUID}/original\\.(jpg|png|webp)$`, "i").test(path)) return { success: false as const, failureCode: "staging_storage_failed" as const };
  const { error } = await client.storage.from(TRANSPORT_MEDIA_STAGING_BUCKET).upload(path, input.bytes, {
    contentType: validated.mimeType, upsert: false,
  });
  return error
    ? { success: false as const, failureCode: "staging_storage_failed" as const }
    : { success: true as const, mimeType: validated.mimeType, byteSize: input.bytes.byteLength };
}
