"use server";

import { createClient } from "@/lib/supabase/server";
import { bindProjectMediaAsEvidenceWithDataSource, type ProjectEvidenceRow } from "./project-evidence-binding-service";

const evidenceColumns = "id, project_id, project_media_id, evidence_target, purpose, source_channel, source_actor_class, binding_status, created_at";

export async function bindProjectMediaAsEvidenceAction(input: unknown) {
  const supabase = await createClient();
  return bindProjectMediaAsEvidenceWithDataSource({
    auth: { getUser: () => supabase.auth.getUser() },
    getProfile: async (userId) => supabase.from("profiles").select("role").eq("id", userId).single(),
    getActiveProject: async (projectId) => supabase.from("projects").select("id").eq("id", projectId).is("deleted_at", null).single(),
    getProjectMedia: async (mediaId) => supabase.from("project_media").select("id, project_id, upload_status, media_type, deleted_at").eq("id", mediaId).single(),
    findSemanticBinding: async (value) => supabase.from("project_evidence").select(evidenceColumns).eq("project_id", value.project_id).eq("project_media_id", value.project_media_id).eq("evidence_target", value.evidence_target).eq("purpose", value.purpose).maybeSingle() as unknown as Promise<{ data: ProjectEvidenceRow | null; error: unknown }>,
    insertEvidence: async (payload) => supabase.from("project_evidence").insert(payload).select(evidenceColumns).single() as unknown as Promise<{ data: ProjectEvidenceRow | null; error: unknown }>,
  }, input);
}
