import { createClient } from "@/lib/supabase/server";
import { getProjectMediaLifecycleWithDataSource, type ProjectMediaLifecycleRow } from "./project-media-lifecycle-read-service";

const columns = "project_media_id,retention_state,eligibility_status,eligibility_reason_codes,hold_status,policy_version,revision,updated_at";

export async function getProjectMediaLifecycle(projectId: string) {
  const supabase = await createClient();
  return getProjectMediaLifecycleWithDataSource({
    auth: supabase.auth,
    getProfile: async (userId) => supabase.from("profiles").select("role").eq("id", userId).single(),
    getActiveProject: async (id) => supabase.from("projects").select("id").eq("id", id).is("deleted_at", null).single(),
    listLifecycle: async (id) => supabase.from("project_media_lifecycle").select(columns).eq("project_id", id).order("project_media_id") as unknown as Promise<{ data: ProjectMediaLifecycleRow[] | null; error: unknown }>,
  }, projectId);
}
