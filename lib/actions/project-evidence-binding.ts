"use server";

import { createClient } from "@/lib/supabase/server";
import { bindProjectMediaAsEvidenceWithDataSource, type ProjectEvidenceRow } from "./project-evidence-binding-service";
import { bindProjectMediaEvidenceClientInputSchema } from "@/lib/domain/conversation-intelligence/project-evidence";
import { projectIdSchema } from "@/lib/domain/schemas";

const evidenceColumns = "id, project_id, project_media_id, evidence_target, purpose, source_channel, source_actor_class, binding_status, created_at";

export async function bindProjectMediaAsEvidenceAction(input: unknown) {
  const supabase = await createClient();
  return bindProjectMediaAsEvidenceWithDataSource({
    auth: { getUser: () => supabase.auth.getUser() },
    getProfile: async (userId) => supabase.from("profiles").select("role").eq("id", userId).single(),
    getActiveProject: async (projectId) => supabase.from("projects").select("id").eq("id", projectId).is("deleted_at", null).single(),
    getProjectMedia: async (mediaId) => supabase.from("project_media").select("id, project_id, upload_status, media_type, deleted_at").eq("id", mediaId).eq("physical_state", "present").single(),
    findSemanticBinding: async (value) => supabase.from("project_evidence").select(evidenceColumns).eq("project_id", value.project_id).eq("project_media_id", value.project_media_id).eq("evidence_target", value.evidence_target).eq("purpose", value.purpose).maybeSingle() as unknown as Promise<{ data: ProjectEvidenceRow | null; error: unknown }>,
    insertEvidence: async (payload) => supabase.from("project_evidence").insert(payload).select(evidenceColumns).single() as unknown as Promise<{ data: ProjectEvidenceRow | null; error: unknown }>,
  }, input);
}

export async function bindProjectMediaEvidenceForProjectAction(projectId: unknown, input: unknown): Promise<import("./project-evidence-binding-service").ProjectEvidenceBindingResult> {
  const parsedProjectId = projectIdSchema.safeParse(projectId);
  const parsedInput = bindProjectMediaEvidenceClientInputSchema.safeParse(input);
  if (!parsedProjectId.success || !parsedInput.success) {
    return { success: false as const, code: "invalid_input" as const, error: "Bitte prüfen Sie Evidence Target und Purpose." };
  }
  return bindProjectMediaAsEvidenceAction({ project_id: parsedProjectId.data, ...parsedInput.data });
}
