import "server-only";

import { createProjectMediaStorageRemoveClient, type ProjectMediaStorageRemoveClient } from "./project-media-storage-purge-client";

export type StoragePurgeResult =
  | { result: "deleted" }
  | { result: "retry_required"; errorCode: "storage_configuration_missing" | "storage_delete_transient" }
  | { result: "failed"; errorCode: "storage_delete_unauthorized" | "storage_delete_failed" | "storage_response_invalid" };

export async function removeReservedProjectMediaObject(
  target: { bucket: string; path: string },
  client: ProjectMediaStorageRemoveClient | null = createProjectMediaStorageRemoveClient(),
): Promise<StoragePurgeResult> {
  if (target.bucket !== "project-media" || !/^projects\/[0-9a-f-]{36}\/originals\/[0-9a-f-]{36}\/[0-9a-f-]+\.[a-z0-9]+$/i.test(target.path)) {
    return { result: "failed", errorCode: "storage_response_invalid" };
  }
  if (!client) return { result: "retry_required", errorCode: "storage_configuration_missing" };
  const { error } = await client.storage.from("project-media").remove([target.path]);
  if (!error) return { result: "deleted" };
  if (error.statusCode === "401" || error.statusCode === "403") return { result: "failed", errorCode: "storage_delete_unauthorized" };
  if (error.statusCode === "408" || error.statusCode === "429" || (error.statusCode?.startsWith("5") ?? false)) {
    return { result: "retry_required", errorCode: "storage_delete_transient" };
  }
  return { result: "failed", errorCode: "storage_delete_failed" };
}
