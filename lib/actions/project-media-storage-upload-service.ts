import { canReserveProjectMediaUpload } from "@/lib/domain/permissions";
import {
  PROJECT_MEDIA_MIME_TYPES,
  roleSchema,
  uploadReservedProjectMediaSchema,
} from "@/lib/domain/schemas";

import { PROJECT_MEDIA_STORAGE_BUCKET } from "./project-media-upload-reservation-service";

type ProjectMediaMimeType = (typeof PROJECT_MEDIA_MIME_TYPES)[number];
type UploadStatus = "pending" | "ready" | "failed";

export type ReservedProjectMedia = {
  id: string;
  project_id: string;
  storage_bucket: string;
  storage_path: string;
  stored_filename: string;
  mime_type: string;
  file_size_bytes: number;
  uploaded_by: string;
  upload_status: UploadStatus;
  deleted_at: string | null;
};

type QueryResult<T> = Promise<{ data: T | null; error: unknown }>;

export type ProjectMediaUploadFile = {
  name: string;
  type: string;
  size: number;
  slice(start?: number, end?: number): { arrayBuffer(): Promise<ArrayBuffer> };
};

export type StorageUploadError = { statusCode?: string | number; status?: number } | null;

export type ProjectMediaStorageUploadDataSource = {
  auth: { getUser(): Promise<{ data: { user: { id: string } | null } }> };
  getProfile(userId: string): QueryResult<{ role: string | null }>;
  getActiveProject(projectId: string): QueryResult<{ id: string }>;
  getReservation(mediaId: string, projectId: string): QueryResult<ReservedProjectMedia>;
  upload(bucket: string, path: string, file: ProjectMediaUploadFile, options: {
    contentType: ProjectMediaMimeType;
    upsert: false;
  }): Promise<{ error: StorageUploadError }>;
};

export type ProjectMediaStorageUploadErrorCode =
  | "not_authenticated" | "profile_unavailable" | "not_authorized"
  | "invalid_input" | "project_unavailable" | "reservation_missing"
  | "reservation_deleted" | "reservation_owner_mismatch" | "reservation_not_pending"
  | "reservation_invalid" | "file_missing" | "file_empty" | "file_too_large"
  | "file_size_mismatch" | "browser_mime_mismatch" | "file_signature_mismatch"
  | "storage_conflict" | "storage_upload_failed";

export type ProjectMediaStorageUploadResult =
  | { success: true; data: { media_id: string; project_id: string; uploaded: true; upload_status: "pending" } }
  | { success: false; code: ProjectMediaStorageUploadErrorCode; error: string; fieldErrors?: Record<string, string[]> };

const errorMessages: Record<ProjectMediaStorageUploadErrorCode, string> = {
  not_authenticated: "Sie müssen angemeldet sein.",
  profile_unavailable: "Ihr Benutzerprofil konnte nicht überprüft werden.",
  not_authorized: "Sie sind nicht berechtigt, Medien hochzuladen.",
  invalid_input: "Bitte prüfen Sie die Upload-Daten.",
  project_unavailable: "Das Projekt wurde nicht gefunden oder ist nicht mehr verfügbar.",
  reservation_missing: "Die Upload-Reservierung wurde nicht gefunden.",
  reservation_deleted: "Die Upload-Reservierung ist nicht mehr verfügbar.",
  reservation_owner_mismatch: "Die Upload-Reservierung kann nicht verwendet werden.",
  reservation_not_pending: "Die Upload-Reservierung ist nicht mehr offen.",
  reservation_invalid: "Die Upload-Reservierung ist ungültig.",
  file_missing: "Bitte wählen Sie eine Datei aus.",
  file_empty: "Die Datei darf nicht leer sein.",
  file_too_large: "Die Datei überschreitet die zulässige Größe.",
  file_size_mismatch: "Die Dateigröße stimmt nicht mit der Reservierung überein.",
  browser_mime_mismatch: "Der Dateityp stimmt nicht mit der Reservierung überein.",
  file_signature_mismatch: "Der Dateiinhalt entspricht nicht dem erwarteten Dateityp.",
  storage_conflict: "Für diese Reservierung wurde bereits eine Datei hochgeladen.",
  storage_upload_failed: "Die Datei konnte nicht hochgeladen werden. Bitte versuchen Sie es erneut.",
};

function failure(code: ProjectMediaStorageUploadErrorCode): Extract<ProjectMediaStorageUploadResult, { success: false }> {
  return { success: false, code, error: errorMessages[code] };
}

function isUploadFile(value: unknown): value is ProjectMediaUploadFile {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<ProjectMediaUploadFile>;
  return typeof candidate.name === "string" && typeof candidate.type === "string"
    && typeof candidate.size === "number" && Number.isSafeInteger(candidate.size)
    && typeof candidate.slice === "function";
}

function isAllowedMime(value: string): value is ProjectMediaMimeType {
  return PROJECT_MEDIA_MIME_TYPES.some((mime) => mime === value);
}

export function detectProjectMediaMimeType(bytes: Uint8Array): ProjectMediaMimeType | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((byte, index) => bytes[index] === byte)) return "image/png";
  if (bytes.length >= 12
    && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46
    && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return "image/webp";
  if (bytes.length >= 5 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46 && bytes[4] === 0x2d) return "application/pdf";
  return null;
}

function isConflict(error: StorageUploadError): boolean {
  if (!error) return false;
  return Number(error.statusCode ?? error.status) === 409;
}

export async function uploadReservedProjectMediaWithDataSource(
  dataSource: ProjectMediaStorageUploadDataSource,
  input: unknown,
): Promise<ProjectMediaStorageUploadResult> {
  const { data: authData } = await dataSource.auth.getUser();
  if (!authData.user) return failure("not_authenticated");

  const { data: profile } = await dataSource.getProfile(authData.user.id);
  const role = roleSchema.safeParse(profile?.role);
  if (!profile || !role.success) return failure("profile_unavailable");
  if (!canReserveProjectMediaUpload(role.data)) return failure("not_authorized");

  if (input && typeof input === "object" && !("file" in input)) return failure("file_missing");
  const parsed = uploadReservedProjectMediaSchema.safeParse(input);
  if (!parsed.success) {
    return { ...failure("invalid_input"), fieldErrors: parsed.error.flatten().fieldErrors };
  }
  if (!isUploadFile(parsed.data.file)) return failure("file_missing");

  const { media_id: mediaId, project_id: projectId, file } = parsed.data;
  const { data: project } = await dataSource.getActiveProject(projectId);
  if (!project || project.id !== projectId) return failure("project_unavailable");

  const { data: reservation } = await dataSource.getReservation(mediaId, projectId);
  if (!reservation || reservation.id !== mediaId || reservation.project_id !== projectId) return failure("reservation_missing");
  if (reservation.deleted_at !== null) return failure("reservation_deleted");
  if (reservation.uploaded_by !== authData.user.id) return failure("reservation_owner_mismatch");
  if (reservation.upload_status !== "pending") return failure("reservation_not_pending");
  if (reservation.storage_bucket !== PROJECT_MEDIA_STORAGE_BUCKET || !isAllowedMime(reservation.mime_type)) return failure("reservation_invalid");

  if (file.size <= 0) return failure("file_empty");
  const maxSize = reservation.mime_type === "application/pdf" ? 25_000_000 : 15_000_000;
  if (file.size > maxSize) return failure("file_too_large");
  if (file.size !== reservation.file_size_bytes) return failure("file_size_mismatch");
  if (file.type !== reservation.mime_type) return failure("browser_mime_mismatch");

  const header = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  if (detectProjectMediaMimeType(header) !== reservation.mime_type) return failure("file_signature_mismatch");

  const { error } = await dataSource.upload(reservation.storage_bucket, reservation.storage_path, file, {
    contentType: reservation.mime_type,
    upsert: false,
  });
  if (isConflict(error)) return failure("storage_conflict");
  if (error) return failure("storage_upload_failed");

  return { success: true, data: { media_id: mediaId, project_id: projectId, uploaded: true, upload_status: "pending" } };
}
