import { canPurgeProjectMediaOrphan } from "@/lib/domain/permissions";
import { projectMediaStoragePurgeSchema, roleSchema } from "@/lib/domain/schemas";
import { removeReservedProjectMediaObject, type StoragePurgeResult } from "@/lib/server/project-media-storage-purge-adapter";

export type ProjectMediaStoragePurgeCode = "purge_completed" | "purge_already_completed" | "purge_not_eligible" | "purge_conflict" | "purge_forbidden" | "purge_retry_required" | "purge_configuration_missing" | "purge_failed";
export type ProjectMediaStoragePurgeResult = { success: boolean; code: ProjectMediaStoragePurgeCode };
type ClaimRow = { cleanup_item_id: string; media_id: string; project_id: string; purge_claim_token: string | null; storage_bucket: string; storage_path: string; purge_status: string };
type CompleteRow = { purge_status: string; completion_result: string };
type QueryResult<T> = Promise<{ data: T | null; error: { code?: string } | null }>;
export type ProjectMediaStoragePurgeDataSource = {
  auth: { getUser(): Promise<{ data: { user: { id: string } | null } }> };
  getProfile(userId: string): QueryResult<{ role: string | null }>;
  claim(mediaId: string, projectId: string): QueryResult<ClaimRow[]>;
  complete(input: { cleanupItemId: string; mediaId: string; projectId: string; token: string; result: StoragePurgeResult["result"]; errorCode: string | null }): QueryResult<CompleteRow[]>;
  remove(target: { bucket: string; path: string }): Promise<StoragePurgeResult>;
};
const response = (success: boolean, code: ProjectMediaStoragePurgeCode): ProjectMediaStoragePurgeResult => ({ success, code });

export async function purgeProjectMediaOrphanWithDataSource(source: ProjectMediaStoragePurgeDataSource, input: unknown): Promise<ProjectMediaStoragePurgeResult> {
  const { data: authData } = await source.auth.getUser();
  if (!authData.user) return response(false, "purge_forbidden");
  const { data: profile } = await source.getProfile(authData.user.id);
  const role = roleSchema.safeParse(profile?.role);
  if (!profile || !role.success || !canPurgeProjectMediaOrphan(role.data)) return response(false, "purge_forbidden");
  const parsed = projectMediaStoragePurgeSchema.safeParse(input);
  if (!parsed.success) return response(false, "purge_not_eligible");
  const claim = await source.claim(parsed.data.media_id, parsed.data.project_id);
  if (claim.error) return response(false, claim.error.code === "40001" ? "purge_conflict" : "purge_failed");
  const row = claim.data?.[0];
  if (!row) return response(false, "purge_not_eligible");
  if (row.media_id !== parsed.data.media_id || row.project_id !== parsed.data.project_id) return response(false, "purge_failed");
  if (row.purge_status === "purged") return response(true, "purge_already_completed");
  if (row.purge_status !== "in_progress" || !row.purge_claim_token) return response(false, "purge_failed");
  const storage = await source.remove({ bucket: row.storage_bucket, path: row.storage_path });
  const completion = await source.complete({ cleanupItemId: row.cleanup_item_id, mediaId: row.media_id, projectId: row.project_id, token: row.purge_claim_token, result: storage.result, errorCode: "errorCode" in storage ? storage.errorCode : null });
  if (completion.error || !completion.data?.[0]) return response(false, "purge_retry_required");
  if (completion.data[0].purge_status === "purged") return response(true, completion.data[0].completion_result === "already_missing" ? "purge_already_completed" : "purge_completed");
  if (storage.result === "retry_required") return response(false, storage.errorCode === "storage_configuration_missing" ? "purge_configuration_missing" : "purge_retry_required");
  return response(false, "purge_failed");
}

export { removeReservedProjectMediaObject };
