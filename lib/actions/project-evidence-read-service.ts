import { canBindProjectMediaAsEvidence } from "@/lib/domain/permissions";
import { projectEvidenceDtoSchema, type ProjectEvidenceDto } from "@/lib/domain/conversation-intelligence/project-evidence";
import { projectIdSchema, roleSchema } from "@/lib/domain/schemas";
import type { ProjectEvidenceRow } from "./project-evidence-binding-service";

type QueryResult<T> = Promise<{ data: T | null; error: unknown }>;
export type ProjectEvidenceReadDataSource = {
  auth: { getUser(): Promise<{ data: { user: { id: string } | null } }> };
  getProfile(userId: string): QueryResult<{ role: string | null }>;
  getActiveProject(projectId: string): QueryResult<{ id: string }>;
  listEvidence(projectId: string): QueryResult<ProjectEvidenceRow[]>;
};
export type ProjectEvidenceReadResult =
  | { success: true; data: { bindings: ProjectEvidenceDto[]; by_media_id: Record<string, ProjectEvidenceDto[]> } }
  | { success: false; code: "invalid_project" | "not_authenticated" | "not_authorized" | "project_unavailable" | "load_failed"; error: string };

export async function getProjectEvidenceWithDataSource(source: ProjectEvidenceReadDataSource, projectId: unknown): Promise<ProjectEvidenceReadResult> {
  const parsedProjectId = projectIdSchema.safeParse(projectId);
  if (!parsedProjectId.success) return { success: false, code: "invalid_project", error: "Evidence konnte nicht geladen werden." };
  const { data: authData } = await source.auth.getUser();
  if (!authData.user) return { success: false, code: "not_authenticated", error: "Zugriff nicht erlaubt." };
  const { data: profile } = await source.getProfile(authData.user.id);
  const role = roleSchema.safeParse(profile?.role);
  if (!role.success || !canBindProjectMediaAsEvidence(role.data)) return { success: false, code: "not_authorized", error: "Zugriff nicht erlaubt." };
  const { data: project, error: projectError } = await source.getActiveProject(parsedProjectId.data);
  if (projectError || !project) return { success: false, code: "project_unavailable", error: "Zugriff nicht erlaubt." };
  const { data: rows, error } = await source.listEvidence(project.id);
  if (error || !rows) return { success: false, code: "load_failed", error: "Evidence konnte nicht geladen werden." };
  const parsed = rows.map((row) => projectEvidenceDtoSchema.safeParse({ evidence_id: row.id, project_id: row.project_id, project_media_id: row.project_media_id, target: row.evidence_target, purpose: row.purpose, source_channel: row.source_channel, source_actor_class: row.source_actor_class, binding_status: row.binding_status, created_at: row.created_at }));
  if (parsed.some((item) => !item.success)) return { success: false, code: "load_failed", error: "Evidence konnte nicht geladen werden." };
  const bindings = parsed.flatMap((item) => item.success ? [item.data] : []);
  const by_media_id = Object.fromEntries(Array.from(new Set(bindings.map((item) => item.project_media_id))).map((mediaId) => [mediaId, bindings.filter((item) => item.project_media_id === mediaId)]));
  return { success: true, data: { bindings, by_media_id } };
}
