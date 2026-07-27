"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getProjectMediaUploadRevalidationPaths } from "./project-revalidation";

import {
  finalizeProjectMediaUploadWithDataSource,
  type ProjectMediaForFinalization,
  type ProjectMediaUploadFinalizationResult,
} from "./project-media-upload-finalization-service";

export async function finalizeProjectMediaUploadAction(input: unknown): Promise<ProjectMediaUploadFinalizationResult> {
  const supabase = await createClient();
  const result = await finalizeProjectMediaUploadWithDataSource({
    auth: { getUser: () => supabase.auth.getUser() },
    getProfile: async (userId) => supabase.from("profiles").select("role").eq("id", userId).single(),
    getActiveProject: async (projectId) => supabase.from("projects").select("id").eq("id", projectId).is("deleted_at", null).single(),
    getMedia: async (mediaId, projectId) => supabase.from("project_media")
      .select("id, project_id, storage_bucket, storage_path, uploaded_by, upload_status, deleted_at")
      .eq("id", mediaId).eq("project_id", projectId).single() as unknown as Promise<{ data: ProjectMediaForFinalization | null; error: unknown }>,
    storageObjectExists: async (bucket, path) => {
      const result = await supabase.storage.from(bucket).exists(path);
      return { exists: result.data, error: result.error };
    },
    markReadyIfPending: async (mediaId, projectId, userId) => supabase.from("project_media")
      .update({ upload_status: "ready" })
      .eq("id", mediaId).eq("project_id", projectId).eq("uploaded_by", userId)
      .eq("upload_status", "pending").is("deleted_at", null)
      .select("id, project_id, upload_status").maybeSingle(),
  }, input);

  if (result.success) {
    for (const path of getProjectMediaUploadRevalidationPaths(result.data.project_id)) {
      revalidatePath(path);
    }
  }

  return result;
}
