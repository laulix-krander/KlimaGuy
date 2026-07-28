"use server";
import { createClient } from "@/lib/supabase/server";
import { createProjectMediaUploadTicketWithDataSource, type ProjectMediaUploadTicketResult, type UploadTicketReservation } from "./project-media-upload-ticket-service";

export async function createProjectMediaUploadTicketAction(input: unknown): Promise<ProjectMediaUploadTicketResult> {
  const supabase = await createClient();
  return createProjectMediaUploadTicketWithDataSource({
    auth: { getUser: () => supabase.auth.getUser() },
    getProfile: async (id) => supabase.from("profiles").select("role").eq("id", id).single(),
    getActiveProject: async (id) => supabase.from("projects").select("id").eq("id", id).is("deleted_at", null).single(),
    getReservation: async (mediaId, projectId) => supabase.rpc("get_pending_project_media_upload", { target_media_id: mediaId, target_project_id: projectId }).maybeSingle() as unknown as Promise<{ data: UploadTicketReservation | null; error: unknown }>,
    createSignedUploadTicket: async (bucket, path) => supabase.storage.from(bucket).createSignedUploadUrl(path),
  }, input);
}
