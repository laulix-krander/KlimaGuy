"use server";

import { createClient } from "@/lib/supabase/server";
import { type ProjectMediaInsert, reserveProjectMediaUploadWithDataSource, type UploadReservationResult } from "./project-media-upload-reservation-service";

export async function reserveProjectMediaUploadAction(input: unknown): Promise<UploadReservationResult> {
  const supabase = await createClient();
  return reserveProjectMediaUploadWithDataSource({
    auth: { getUser: () => supabase.auth.getUser() },
    getProfile: async (userId) => supabase.from("profiles").select("role").eq("id", userId).single(),
    getActiveProject: async (projectId) => supabase.from("projects").select("id").eq("id", projectId).is("deleted_at", null).single(),
    insertProjectMedia: async (payload: ProjectMediaInsert) => {
      const { error } = await supabase.from("project_media").insert(payload);
      return { data: error ? null : { id: payload.id }, error };
    },
  }, input);
}
