import { canReserveProjectMediaUpload } from "@/lib/domain/permissions";
import { roleSchema, uploadReservationSchema } from "@/lib/domain/schemas";

export const PROJECT_MEDIA_STORAGE_BUCKET = "project-media" as const;
const EXTENSIONS = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "application/pdf": "pdf" } as const;

export type UploadReservationResult =
  | { success: true; data: UploadReservationResponse }
  | { success: false; error: string; fieldErrors?: Record<string, string[]> };
export type UploadReservationResponse = { media_id: string; storage_bucket: typeof PROJECT_MEDIA_STORAGE_BUCKET; storage_path: string; stored_filename: string; max_file_size: number; expected_mime: keyof typeof EXTENSIONS };
export type ProjectMediaInsert = { id: string; project_id: string; storage_bucket: typeof PROJECT_MEDIA_STORAGE_BUCKET; storage_path: string; original_filename: string; stored_filename: string; mime_type: keyof typeof EXTENSIONS; file_size_bytes: number; media_type: "image" | "document"; category: string; source: "manual_upload"; upload_status: "pending"; uploaded_by: string; created_at: string };
type QueryResult<T> = Promise<{ data: T | null; error: unknown }>;
export type ReservationDataSource = {
  auth: { getUser(): Promise<{ data: { user: { id: string } | null } }> };
  getProfile(userId: string): QueryResult<{ role: string | null }>;
  getActiveProject(projectId: string): QueryResult<{ id: string }>;
  insertProjectMedia(payload: ProjectMediaInsert): QueryResult<{ id: string }>;
};
export type ReservationGenerators = { uuid(): string; now(): string };

export async function reserveProjectMediaUploadWithDataSource(dataSource: ReservationDataSource, input: unknown, generators: ReservationGenerators = { uuid: () => crypto.randomUUID(), now: () => new Date().toISOString() }): Promise<UploadReservationResult> {
  const { data: authData } = await dataSource.auth.getUser();
  if (!authData.user) return { success: false, error: "Sie müssen angemeldet sein." };
  const { data: profile } = await dataSource.getProfile(authData.user.id);
  const role = roleSchema.safeParse(profile?.role);
  if (!profile || !role.success) return { success: false, error: "Ihr Benutzerprofil konnte nicht überprüft werden." };
  if (!canReserveProjectMediaUpload(role.data)) return { success: false, error: "Sie sind nicht berechtigt, Medienuploads zu reservieren." };

  const parsed = uploadReservationSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "Bitte prüfen Sie die Upload-Daten.", fieldErrors: parsed.error.flatten().fieldErrors };
  const { data: project } = await dataSource.getActiveProject(parsed.data.project_id);
  if (!project || project.id !== parsed.data.project_id) return { success: false, error: "Das Projekt wurde nicht gefunden oder ist nicht mehr verfügbar." };

  const mediaId = generators.uuid();
  const filenameId = generators.uuid();
  const extension = EXTENSIONS[parsed.data.mime_type];
  const storedFilename = `${filenameId}.${extension}`;
  const storagePath = `projects/${parsed.data.project_id}/originals/${mediaId}/${storedFilename}`;
  const payload: ProjectMediaInsert = {
    id: mediaId, project_id: parsed.data.project_id, storage_bucket: PROJECT_MEDIA_STORAGE_BUCKET,
    storage_path: storagePath, original_filename: parsed.data.original_filename, stored_filename: storedFilename,
    mime_type: parsed.data.mime_type, file_size_bytes: parsed.data.file_size_bytes,
    media_type: parsed.data.mime_type === "application/pdf" ? "document" : "image",
    category: parsed.data.category, source: "manual_upload", upload_status: "pending",
    uploaded_by: authData.user.id, created_at: generators.now(),
  };
  const { data: inserted, error } = await dataSource.insertProjectMedia(payload);
  if (error || inserted?.id !== mediaId) return { success: false, error: "Der Upload konnte nicht reserviert werden. Bitte versuchen Sie es erneut." };
  const maxFileSize = parsed.data.mime_type === "application/pdf" ? 25_000_000 : 15_000_000;
  return { success: true, data: { media_id: mediaId, storage_bucket: PROJECT_MEDIA_STORAGE_BUCKET, storage_path: storagePath, stored_filename: storedFilename, max_file_size: maxFileSize, expected_mime: parsed.data.mime_type } };
}
