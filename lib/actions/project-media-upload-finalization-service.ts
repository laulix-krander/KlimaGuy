import { canReserveProjectMediaUpload } from "@/lib/domain/permissions";
import { finalizeProjectMediaUploadSchema, roleSchema } from "@/lib/domain/schemas";

import { PROJECT_MEDIA_STORAGE_BUCKET } from "./project-media-upload-reservation-service";

type UploadStatus = "pending" | "ready" | "failed";

export type ProjectMediaForFinalization = {
  id: string;
  project_id: string;
  storage_bucket: string;
  storage_path: string;
  mime_type: string;
  file_size_bytes: number;
  uploaded_by: string;
  upload_status: UploadStatus;
  deleted_at: string | null;
};

type QueryResult<T> = Promise<{ data: T | null; error: unknown }>;

export type ProjectMediaUploadFinalizationDataSource = {
  auth: { getUser(): Promise<{ data: { user: { id: string } | null } }> };
  getProfile(userId: string): QueryResult<{ role: string | null }>;
  getActiveProject(projectId: string): QueryResult<{ id: string }>;
  getMedia(mediaId: string, projectId: string): QueryResult<ProjectMediaForFinalization>;
  getStorageObjectMetadata(mediaId: string, projectId: string): QueryResult<{ bucket_id: string; name: string; size: number; mime_type: string }>;
  markReadyIfPending(mediaId: string, projectId: string, userId: string): QueryResult<{
    id: string;
    project_id: string;
    upload_status: string;
  }>;
};

export type ProjectMediaUploadFinalizationErrorCode =
  | "not_authenticated" | "profile_unavailable" | "not_authorized" | "invalid_input"
  | "project_unavailable" | "media_missing" | "media_deleted" | "media_owner_mismatch"
  | "media_already_ready" | "media_failed" | "media_invalid" | "storage_object_missing"
  | "storage_check_failed" | "storage_metadata_mismatch" | "finalization_conflict";

export type ProjectMediaUploadFinalizationResult =
  | { success: true; data: { media_id: string; project_id: string; upload_status: "ready"; finalized: true } }
  | { success: false; code: ProjectMediaUploadFinalizationErrorCode; error: string; fieldErrors?: Record<string, string[]> };

const errorMessages: Record<ProjectMediaUploadFinalizationErrorCode, string> = {
  not_authenticated: "Sie müssen angemeldet sein.",
  profile_unavailable: "Ihr Benutzerprofil konnte nicht überprüft werden.",
  not_authorized: "Sie sind nicht berechtigt, Medienuploads zu finalisieren.",
  invalid_input: "Bitte prüfen Sie die Finalisierungsdaten.",
  project_unavailable: "Das Projekt wurde nicht gefunden oder ist nicht mehr verfügbar.",
  media_missing: "Das Medium wurde nicht gefunden.",
  media_deleted: "Das Medium ist nicht mehr verfügbar.",
  media_owner_mismatch: "Das Medium kann nicht finalisiert werden.",
  media_already_ready: "Das Medium ist bereits finalisiert.",
  media_failed: "Der fehlgeschlagene Upload kann nicht finalisiert werden.",
  media_invalid: "Die Upload-Reservierung ist ungültig.",
  storage_object_missing: "Das hochgeladene Objekt wurde nicht gefunden.",
  storage_check_failed: "Das hochgeladene Objekt konnte nicht überprüft werden.",
  storage_metadata_mismatch: "Das hochgeladene Objekt entspricht nicht der Reservierung.",
  finalization_conflict: "Der Upload konnte nicht finalisiert werden.",
};

function failure(code: ProjectMediaUploadFinalizationErrorCode): Extract<ProjectMediaUploadFinalizationResult, { success: false }> {
  return { success: false, code, error: errorMessages[code] };
}

export async function finalizeProjectMediaUploadWithDataSource(
  dataSource: ProjectMediaUploadFinalizationDataSource,
  input: unknown,
): Promise<ProjectMediaUploadFinalizationResult> {
  const { data: authData } = await dataSource.auth.getUser();
  if (!authData.user) return failure("not_authenticated");

  const { data: profile } = await dataSource.getProfile(authData.user.id);
  const role = roleSchema.safeParse(profile?.role);
  if (!profile || !role.success) return failure("profile_unavailable");
  if (!canReserveProjectMediaUpload(role.data)) return failure("not_authorized");

  const parsed = finalizeProjectMediaUploadSchema.safeParse(input);
  if (!parsed.success) return { ...failure("invalid_input"), fieldErrors: parsed.error.flatten().fieldErrors };
  const { media_id: mediaId, project_id: projectId } = parsed.data;

  const { data: project } = await dataSource.getActiveProject(projectId);
  if (!project || project.id !== projectId) return failure("project_unavailable");

  const { data: media } = await dataSource.getMedia(mediaId, projectId);
  if (!media || media.id !== mediaId || media.project_id !== projectId) return failure("media_missing");
  if (media.deleted_at !== null) return failure("media_deleted");
  if (media.uploaded_by !== authData.user.id) return failure("media_owner_mismatch");
  if (media.upload_status === "ready") return failure("media_already_ready");
  if (media.upload_status === "failed") return failure("media_failed");
  if (media.upload_status !== "pending" || media.storage_bucket !== PROJECT_MEDIA_STORAGE_BUCKET) return failure("media_invalid");

  const object = await dataSource.getStorageObjectMetadata(mediaId, projectId);
  if (object.error) return failure("storage_check_failed");
  if (!object.data) return failure("storage_object_missing");
  if (object.data.bucket_id !== media.storage_bucket || object.data.name !== media.storage_path
    || object.data.size !== media.file_size_bytes || object.data.mime_type !== media.mime_type) return failure("storage_metadata_mismatch");

  const { data: finalized, error } = await dataSource.markReadyIfPending(mediaId, projectId, authData.user.id);
  if (error || finalized?.id !== mediaId || finalized.project_id !== projectId || finalized.upload_status !== "ready") {
    return failure("finalization_conflict");
  }
  return { success: true, data: { media_id: mediaId, project_id: projectId, upload_status: "ready", finalized: true } };
}
