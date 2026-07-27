"use server";

import { createClient } from "@/lib/supabase/server";

import {
  type ProjectMediaStorageUploadResult,
  type ReservedProjectMedia,
  uploadReservedProjectMediaWithDataSource,
} from "./project-media-storage-upload-service";

export async function uploadReservedProjectMediaAction(formData: FormData): Promise<ProjectMediaStorageUploadResult> {
  const supabase = await createClient();
  return uploadReservedProjectMediaWithDataSource({
    auth: { getUser: () => supabase.auth.getUser() },
    getProfile: async (userId) => supabase.from("profiles").select("role").eq("id", userId).single(),
    getActiveProject: async (projectId) => supabase.from("projects").select("id").eq("id", projectId).is("deleted_at", null).single(),
    getReservation: async (mediaId, projectId) => supabase.from("project_media")
      .select("id, project_id, storage_bucket, storage_path, stored_filename, mime_type, file_size_bytes, uploaded_by, upload_status, deleted_at")
      .eq("id", mediaId).eq("project_id", projectId).single() as unknown as Promise<{ data: ReservedProjectMedia | null; error: unknown }>,
    upload: async (bucket, path, file, options) => {
      const result = await supabase.storage.from(bucket).upload(path, file as File, options);
      return { error: result.error };
    },
  }, Object.fromEntries(formData.entries()));
}
