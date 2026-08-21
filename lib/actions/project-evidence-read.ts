import { createClient } from "@/lib/supabase/server";
import { getProjectEvidenceWithDataSource } from "./project-evidence-read-service";
import type { ProjectEvidenceRow } from "./project-evidence-binding-service";

const columns = "id,project_id,project_media_id,evidence_target,purpose,source_channel,source_actor_class,binding_status,created_at";

export async function getProjectEvidence(projectId: string) {
  const supabase = await createClient();
  return getProjectEvidenceWithDataSource({
    auth: supabase.auth,
    getProfile: async (userId) => supabase.from("profiles").select("role").eq("id", userId).single(),
    getActiveProject: async (id) => supabase.from("projects").select("id").eq("id", id).is("deleted_at", null).single(),
    listEvidence: async (id) => supabase.from("project_evidence").select(columns).eq("project_id", id).order("created_at", { ascending: true }) as unknown as Promise<{ data: ProjectEvidenceRow[] | null; error: unknown }>,
  }, projectId);
}
