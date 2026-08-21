import { canBindProjectMediaAsEvidence } from "@/lib/domain/permissions";
import { roleSchema } from "@/lib/domain/schemas";
import {
  bindProjectMediaEvidenceInputSchema,
  projectEvidenceDtoSchema,
  type BindProjectMediaEvidenceInput,
  type ProjectEvidenceDto,
} from "@/lib/domain/conversation-intelligence/project-evidence";

type QueryResult<T> = Promise<{ data: T | null; error: unknown }>;
export type ProjectEvidenceRow = {
  id: string; project_id: string; project_media_id: string; evidence_target: string; purpose: string;
  source_channel: string; source_actor_class: string; binding_status: string; created_at: string;
};
export type ProjectEvidenceBindingDataSource = {
  auth: { getUser(): Promise<{ data: { user: { id: string } | null } }> };
  getProfile(userId: string): QueryResult<{ role: string | null }>;
  getActiveProject(projectId: string): QueryResult<{ id: string }>;
  getProjectMedia(mediaId: string): QueryResult<{ id: string; project_id: string; upload_status: string; media_type: string; deleted_at: string | null }>;
  findSemanticBinding(input: BindProjectMediaEvidenceInput): QueryResult<ProjectEvidenceRow>;
  insertEvidence(payload: Omit<ProjectEvidenceRow, "created_at">): QueryResult<ProjectEvidenceRow>;
};
export type ProjectEvidenceBindingResult =
  | { success: true; result: "bound" | "already_bound"; data: ProjectEvidenceDto }
  | { success: false; code: "unauthenticated" | "invalid_profile" | "forbidden" | "invalid_input" | "project_not_found" | "media_not_found" | "project_mismatch" | "media_not_eligible" | "persistence_failed"; error: string };

function dto(row: ProjectEvidenceRow): ProjectEvidenceDto {
  return projectEvidenceDtoSchema.parse({ evidence_id: row.id, project_id: row.project_id, project_media_id: row.project_media_id, target: row.evidence_target, purpose: row.purpose, source_channel: row.source_channel, source_actor_class: row.source_actor_class, binding_status: row.binding_status, created_at: row.created_at });
}

export async function bindProjectMediaAsEvidenceWithDataSource(
  source: ProjectEvidenceBindingDataSource,
  input: unknown,
  uuid: () => string = () => crypto.randomUUID(),
): Promise<ProjectEvidenceBindingResult> {
  const { data: authData } = await source.auth.getUser();
  if (!authData.user) return { success: false, code: "unauthenticated", error: "Sie müssen angemeldet sein." };
  const { data: profile } = await source.getProfile(authData.user.id);
  const role = roleSchema.safeParse(profile?.role);
  if (!profile || !role.success) return { success: false, code: "invalid_profile", error: "Ihr Benutzerprofil konnte nicht überprüft werden." };
  if (!canBindProjectMediaAsEvidence(role.data)) return { success: false, code: "forbidden", error: "Sie sind nicht berechtigt, Projektmedien als Evidence zu binden." };
  const parsed = bindProjectMediaEvidenceInputSchema.safeParse(input);
  if (!parsed.success) return { success: false, code: "invalid_input", error: "Bitte prüfen Sie die Evidence-Daten." };

  const { data: project } = await source.getActiveProject(parsed.data.project_id);
  if (!project) return { success: false, code: "project_not_found", error: "Das Projekt wurde nicht gefunden oder ist nicht mehr verfügbar." };
  const { data: media } = await source.getProjectMedia(parsed.data.project_media_id);
  if (!media) return { success: false, code: "media_not_found", error: "Das Projektmedium wurde nicht gefunden." };
  if (media.project_id !== project.id) return { success: false, code: "project_mismatch", error: "Das Projektmedium gehört nicht zu diesem Projekt." };
  if (media.upload_status !== "ready" || media.deleted_at !== null || media.media_type !== "image") return { success: false, code: "media_not_eligible", error: "Nur aktive, fertige Bilder können als Evidence gebunden werden." };

  const existing = await source.findSemanticBinding(parsed.data);
  if (existing.data) return { success: true, result: "already_bound", data: dto(existing.data) };
  const payload = { id: uuid(), project_id: parsed.data.project_id, project_media_id: parsed.data.project_media_id, evidence_target: parsed.data.evidence_target, purpose: parsed.data.purpose, source_channel: "internal_upload", source_actor_class: "admin", binding_status: "bound" } as const;
  const inserted = await source.insertEvidence(payload);
  if (inserted.data) return { success: true, result: "bound", data: dto(inserted.data) };
  // A concurrent request may have won the semantic unique constraint.
  const replay = await source.findSemanticBinding(parsed.data);
  if (replay.data) return { success: true, result: "already_bound", data: dto(replay.data) };
  return { success: false, code: "persistence_failed", error: "Die Evidence-Bindung konnte nicht gespeichert werden. Bitte versuchen Sie es erneut." };
}
