"use server";

import { createClient } from "@/lib/supabase/server";
import {
  createProjectMediaSignedViewUrlWithDataSource,
  type ProjectMediaSignedViewUrlResult,
  type ReadyProjectMediaForSignedViewUrl,
} from "./project-media-signed-view-url-service";

export async function createProjectMediaSignedViewUrlAction(input: unknown): Promise<ProjectMediaSignedViewUrlResult> {
  const supabase = await createClient();

  return createProjectMediaSignedViewUrlWithDataSource({
    getUser: () => supabase.auth.getUser(),
    getProfile: async (userId) => supabase.from("profiles").select("role").eq("id", userId).single(),
    getActiveProject: async (projectId) => supabase.from("projects")
      .select("id,deleted_at").eq("id", projectId).is("deleted_at", null).maybeSingle() as unknown as Promise<{
        data: { id: string; deleted_at: null } | null;
        error: unknown;
      }>,
    getReadyProjectMedia: async (mediaId, projectId) => supabase.from("project_media")
      .select("id,project_id,storage_bucket,storage_path,mime_type,media_type,upload_status,deleted_at")
      .eq("id", mediaId).eq("project_id", projectId).eq("upload_status", "ready").is("deleted_at", null)
      .maybeSingle() as unknown as Promise<{ data: ReadyProjectMediaForSignedViewUrl | null; error: unknown }>,
    createSignedUrl: async (bucket, path, expiresIn) => supabase.storage.from(bucket)
      .createSignedUrl(path, expiresIn) as unknown as Promise<{
        data: { signedUrl: string } | null;
        error: unknown;
      }>,
  }, input);
}
