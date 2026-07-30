import { createClient } from "@/lib/supabase/server";
import { getProjectMediaGalleryWithDataSource, PROJECT_MEDIA_GALLERY_LIMIT, type ProjectMediaGalleryRow } from "./project-media-gallery-service";

export async function getProjectMediaGallery(projectId: string) {
  const supabase = await createClient();
  return getProjectMediaGalleryWithDataSource({
    auth: supabase.auth,
    getProfile: async (userId) => supabase.from("profiles").select("role").eq("id", userId).single(),
    getActiveProject: async (id) => supabase.from("projects").select("id").eq("id", id).is("deleted_at", null).single(),
    listMedia: async (id) => supabase.from("project_media")
      .select("id,project_id,category,media_type,mime_type,file_size_bytes,caption,created_at,storage_bucket,storage_path")
      .eq("project_id", id).eq("upload_status", "ready").is("deleted_at", null)
      .order("created_at", { ascending: false }).order("id", { ascending: false }).limit(PROJECT_MEDIA_GALLERY_LIMIT) as unknown as Promise<{ data: ProjectMediaGalleryRow[] | null; error: unknown }>,
    createSignedUrls: async (bucket, paths, expiresIn) => supabase.storage.from(bucket).createSignedUrls(paths, expiresIn) as unknown as Promise<{ data: Array<{ path: string; signedUrl: string | null; error?: unknown }> | null; error: unknown }>,
  }, projectId);
}
