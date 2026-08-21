import { canExecuteProjectMediaDeletion } from "@/lib/domain/permissions";
import { readyMediaDeletionInputSchema } from "@/lib/domain/project-media-lifecycle";
import { roleSchema } from "@/lib/domain/schemas";
import type { ReadyMediaStorageDeleteResult } from "@/lib/server/ready-project-media-delete-adapter";

type QueryResult<T> = Promise<{ data: T | null; error: { code?: string } | null }>;
type ClaimRow = { attempt_id: string; project_media_id: string; project_id: string; claim_token: string; status: string; storage_bucket: "project-media"; storage_path: string; lease_expires_at: string };
type CompletionRow = { attempt_id: string; status: string; completion_result: string; lifecycle_revision: number };
export type ReadyProjectMediaDeletionDataSource = {
  auth: { getUser(): Promise<{ data: { user: { id: string } | null } }> };
  getProfile(userId: string): QueryResult<{ role: string | null }>;
  claim(input: { mediaId: string; projectId: string; expectedRevision: number; reason: string }): QueryResult<ClaimRow[]>;
  remove(target: { projectId: string; mediaId: string; bucket: "project-media"; path: string }): Promise<ReadyMediaStorageDeleteResult>;
  markStorageDeleted(input: { attemptId: string; mediaId: string; projectId: string; token: string; storageResult: "deleted" | "already_missing" }): QueryResult<boolean>;
  complete(input: { attemptId: string; mediaId: string; projectId: string; token: string; storageResult: "deleted" | "already_missing" }): QueryResult<CompletionRow[]>;
  fail(input: { attemptId: string; mediaId: string; projectId: string; token: string; retryable: boolean }): QueryResult<boolean>;
};
export type ReadyProjectMediaDeletionResult = { success: boolean; code: "deletion_completed" | "deletion_already_completed" | "deletion_forbidden" | "deletion_invalid_input" | "deletion_not_eligible" | "deletion_retry_required" | "deletion_failed"; attempt_id?: string; lifecycle_revision?: number };

const result = (success: boolean, code: ReadyProjectMediaDeletionResult["code"], extra: Partial<ReadyProjectMediaDeletionResult> = {}): ReadyProjectMediaDeletionResult => ({ success, code, ...extra });

/** Explicit execution boundary. The client cannot supply actor, claim token, bucket or path. */
export async function deleteReadyProjectMediaWithDataSource(source: ReadyProjectMediaDeletionDataSource, input: unknown): Promise<ReadyProjectMediaDeletionResult> {
  const auth = await source.auth.getUser();
  if (!auth.data.user) return result(false, "deletion_forbidden");
  const profile = await source.getProfile(auth.data.user.id);
  const role = roleSchema.safeParse(profile.data?.role);
  if (!role.success || !canExecuteProjectMediaDeletion(role.data)) return result(false, "deletion_forbidden");
  const parsed = readyMediaDeletionInputSchema.safeParse(input);
  if (!parsed.success) return result(false, "deletion_invalid_input");
  const claim = await source.claim({ mediaId: parsed.data.project_media_id, projectId: parsed.data.project_id, expectedRevision: parsed.data.expected_lifecycle_revision, reason: parsed.data.deletion_reason });
  const row = claim.data?.[0];
  if (claim.error || !row) return result(false, "deletion_not_eligible");
  if (row.project_id !== parsed.data.project_id || row.project_media_id !== parsed.data.project_media_id || !row.claim_token) return result(false, "deletion_failed");
  if (row.status === "completed") return result(true, "deletion_already_completed", { attempt_id: row.attempt_id });
  if (row.status !== "storage_delete_pending") return result(false, "deletion_retry_required", { attempt_id: row.attempt_id });
  const storage = await source.remove({ projectId: row.project_id, mediaId: row.project_media_id, bucket: row.storage_bucket, path: row.storage_path });
  if (storage.result === "retryable_failure" || storage.result === "permanent_failure") {
    await source.fail({ attemptId: row.attempt_id, mediaId: row.project_media_id, projectId: row.project_id, token: row.claim_token, retryable: storage.result === "retryable_failure" });
    return result(false, storage.result === "retryable_failure" ? "deletion_retry_required" : "deletion_failed", { attempt_id: row.attempt_id });
  }
  const marked = await source.markStorageDeleted({ attemptId: row.attempt_id, mediaId: row.project_media_id, projectId: row.project_id, token: row.claim_token, storageResult: storage.result });
  if (marked.error || marked.data !== true) return result(false, "deletion_retry_required", { attempt_id: row.attempt_id });
  const completion = await source.complete({ attemptId: row.attempt_id, mediaId: row.project_media_id, projectId: row.project_id, token: row.claim_token, storageResult: storage.result });
  const completed = completion.data?.[0];
  if (completion.error || !completed) return result(false, "deletion_retry_required", { attempt_id: row.attempt_id });
  return result(true, completed.completion_result === "already_completed" ? "deletion_already_completed" : "deletion_completed", { attempt_id: completed.attempt_id, lifecycle_revision: completed.lifecycle_revision });
}
