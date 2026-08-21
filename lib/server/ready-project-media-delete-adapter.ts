import "server-only";

import { createProjectMediaStorageRemoveClient, type ProjectMediaStorageRemoveClient } from "./project-media-storage-purge-client";

export type ReadyMediaStorageDeleteResult =
  | { result: "deleted" | "already_missing" }
  | { result: "retryable_failure"; errorCode: "storage_configuration_missing" | "storage_delete_transient" }
  | { result: "permanent_failure"; errorCode: "storage_delete_unauthorized" | "storage_delete_failed" | "invalid_storage_locator" };

/** Narrow capability: it can remove only the canonical object returned by the Ready-Media claim RPC. */
export async function deleteClaimedReadyProjectMediaObject(
  target: { projectId: string; mediaId: string; bucket: "project-media"; path: string },
  client: ProjectMediaStorageRemoveClient | null = createProjectMediaStorageRemoveClient(),
): Promise<ReadyMediaStorageDeleteResult> {
  const uuid = "[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";
  const canonical = new RegExp(`^projects/${target.projectId}/originals/${target.mediaId}/${uuid}\\.(jpg|png|webp|pdf)$`, "i");
  if (target.bucket !== "project-media" || !canonical.test(target.path)) return { result: "permanent_failure", errorCode: "invalid_storage_locator" };
  if (!client) return { result: "retryable_failure", errorCode: "storage_configuration_missing" };
  const { error } = await client.storage.from("project-media").remove([target.path]);
  if (!error) return { result: "deleted" };
  if (error.statusCode === "401" || error.statusCode === "403") return { result: "permanent_failure", errorCode: "storage_delete_unauthorized" };
  if (error.statusCode === "408" || error.statusCode === "429" || error.statusCode?.startsWith("5")) return { result: "retryable_failure", errorCode: "storage_delete_transient" };
  return { result: "permanent_failure", errorCode: "storage_delete_failed" };
}
