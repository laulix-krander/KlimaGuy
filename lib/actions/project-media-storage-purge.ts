"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { purgeProjectMediaOrphanWithDataSource, removeReservedProjectMediaObject, type ProjectMediaStoragePurgeResult } from "./project-media-storage-purge-service";

export async function purgeProjectMediaOrphanAction(_state: ProjectMediaStoragePurgeResult | null, formData: FormData): Promise<ProjectMediaStoragePurgeResult> {
  const supabase = await createClient();
  const result = await purgeProjectMediaOrphanWithDataSource({
    auth: { getUser: () => supabase.auth.getUser() },
    getProfile: async (id) => supabase.from("profiles").select("role").eq("id", id).single(),
    claim: async (mediaId, projectId) => supabase.rpc("claim_project_media_storage_purge", { target_media_id: mediaId, target_project_id: projectId }),
    complete: async (value) => supabase.rpc("complete_project_media_storage_purge", { target_cleanup_item_id: value.cleanupItemId, target_media_id: value.mediaId, target_project_id: value.projectId, target_purge_claim_token: value.token, target_result: value.result, target_error_code: value.errorCode }),
    remove: removeReservedProjectMediaObject,
  }, { media_id: formData.get("media_id"), project_id: formData.get("project_id") });
  if (result.success) revalidatePath("/admin/project-media/orphans");
  return result;
}
