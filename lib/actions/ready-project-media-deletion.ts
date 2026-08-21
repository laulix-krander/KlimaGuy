"use server";

import { createClient } from "@/lib/supabase/server";
import { deleteClaimedReadyProjectMediaObject } from "@/lib/server/ready-project-media-delete-adapter";
import { deleteReadyProjectMediaWithDataSource } from "./ready-project-media-deletion-service";

export async function deleteReadyProjectMediaAction(input: unknown) {
  const supabase = await createClient();
  return deleteReadyProjectMediaWithDataSource({
    auth: { getUser: () => supabase.auth.getUser() },
    getProfile: async (id) => supabase.from("profiles").select("role").eq("id", id).single(),
    claim: async (value) => supabase.rpc("claim_ready_project_media_deletion", { target_media_id: value.mediaId, target_project_id: value.projectId, target_expected_revision: value.expectedRevision, target_deletion_reason: value.reason }),
    remove: deleteClaimedReadyProjectMediaObject,
    markStorageDeleted: async (value) => supabase.rpc("mark_ready_project_media_storage_deleted", { target_attempt_id: value.attemptId, target_media_id: value.mediaId, target_project_id: value.projectId, target_claim_token: value.token, target_storage_result: value.storageResult }),
    complete: async (value) => supabase.rpc("complete_ready_project_media_deletion", { target_attempt_id: value.attemptId, target_media_id: value.mediaId, target_project_id: value.projectId, target_claim_token: value.token, target_storage_result: value.storageResult }),
    fail: async (value) => supabase.rpc("fail_ready_project_media_deletion", { target_attempt_id: value.attemptId, target_media_id: value.mediaId, target_project_id: value.projectId, target_claim_token: value.token, target_failure_code: "storage_delete_failed", target_retryable: value.retryable }),
  }, input);
}
