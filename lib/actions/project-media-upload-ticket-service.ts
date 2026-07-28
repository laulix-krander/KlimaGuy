import { canReserveProjectMediaUpload } from "@/lib/domain/permissions";
import { PROJECT_MEDIA_MIME_TYPES, finalizeProjectMediaUploadSchema, roleSchema } from "@/lib/domain/schemas";
import { PROJECT_MEDIA_STORAGE_BUCKET } from "./project-media-upload-reservation-service";

type Mime = (typeof PROJECT_MEDIA_MIME_TYPES)[number];
type Query<T> = Promise<{ data: T | null; error: unknown }>;
export type UploadTicketReservation = { id: string; project_id: string; storage_bucket: string; storage_path: string; stored_filename: string; mime_type: string; file_size_bytes: number; uploaded_by: string; upload_status: string; deleted_at: string | null };
export type UploadTicketDataSource = {
  auth: { getUser(): Promise<{ data: { user: { id: string } | null } }> };
  getProfile(id: string): Query<{ role: string | null }>;
  getActiveProject(id: string): Query<{ id: string }>;
  getReservation(mediaId: string, projectId: string): Query<UploadTicketReservation>;
  createSignedUploadTicket(bucket: string, path: string): Promise<{ data: { path: string; token: string } | null; error: unknown }>;
};
export type ProjectMediaUploadTicketResult =
  | { success: true; data: { media_id: string; project_id: string; path: string; token: string; expected_mime: Mime; expected_size: number } }
  | { success: false; code: "not_authenticated" | "not_authorized" | "invalid_reservation" | "ticket_failed"; error: string };

const fail = (code: Extract<ProjectMediaUploadTicketResult, { success: false }>["code"], error: string): ProjectMediaUploadTicketResult => ({ success: false, code, error });
const isMime = (value: string): value is Mime => PROJECT_MEDIA_MIME_TYPES.some((mime) => mime === value);
export function isCanonicalProjectMediaPath(row: UploadTicketReservation) {
  return row.storage_path === `projects/${row.project_id}/originals/${row.id}/${row.stored_filename}`;
}

export async function createProjectMediaUploadTicketWithDataSource(dataSource: UploadTicketDataSource, input: unknown): Promise<ProjectMediaUploadTicketResult> {
  const { data: auth } = await dataSource.auth.getUser();
  if (!auth.user) return fail("not_authenticated", "Sie müssen angemeldet sein.");
  const { data: profile } = await dataSource.getProfile(auth.user.id);
  const role = roleSchema.safeParse(profile?.role);
  if (!profile || !role.success || !canReserveProjectMediaUpload(role.data)) return fail("not_authorized", "Sie sind nicht berechtigt, ein Uploadticket zu erstellen.");
  const parsed = finalizeProjectMediaUploadSchema.safeParse(input);
  if (!parsed.success) return fail("invalid_reservation", "Die Upload-Reservierung ist ungültig.");
  const { media_id: mediaId, project_id: projectId } = parsed.data;
  const [{ data: project }, { data: row }] = await Promise.all([dataSource.getActiveProject(projectId), dataSource.getReservation(mediaId, projectId)]);
  if (!project || project.id !== projectId || !row || row.id !== mediaId || row.project_id !== projectId || row.uploaded_by !== auth.user.id
    || row.deleted_at !== null || row.upload_status !== "pending" || row.storage_bucket !== PROJECT_MEDIA_STORAGE_BUCKET
    || !isMime(row.mime_type) || !isCanonicalProjectMediaPath(row)) return fail("invalid_reservation", "Die Upload-Reservierung ist ungültig.");
  const ticket = await dataSource.createSignedUploadTicket(row.storage_bucket, row.storage_path);
  if (ticket.error || !ticket.data || ticket.data.path !== row.storage_path || !ticket.data.token) return fail("ticket_failed", "Das Uploadticket konnte nicht erstellt werden.");
  return { success: true, data: { media_id: mediaId, project_id: projectId, path: ticket.data.path, token: ticket.data.token, expected_mime: row.mime_type, expected_size: row.file_size_bytes } };
}
