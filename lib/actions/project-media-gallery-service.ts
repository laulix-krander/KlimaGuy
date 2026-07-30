import { canViewProjectMedia } from "@/lib/domain/permissions";
import { PROJECT_MEDIA_CATEGORY_LABELS, type ProjectMediaCategory } from "@/lib/domain/mappers";
import { projectIdSchema, projectMediaGalleryRowSchema, roleSchema } from "@/lib/domain/schemas";

export const PROJECT_MEDIA_GALLERY_LIMIT = 50;
export const PROJECT_MEDIA_SIGNED_URL_TTL_SECONDS = 120;

export type ProjectMediaGalleryRow = {
  id: string; project_id: string; category: string; media_type: string; mime_type: string;
  file_size_bytes: number; caption: string | null; created_at: string;
  storage_bucket: string; storage_path: string;
};

export type ProjectMediaGalleryItem = {
  media_id: string; project_id: string; category: ProjectMediaCategory; category_label: string;
  media_type: "image" | "document"; mime_type: "image/jpeg" | "image/png" | "image/webp" | "application/pdf";
  file_size_bytes: number; caption: string | null; created_at: string;
  display_kind: "image" | "pdf"; signed_view_url: string | null;
};

type QueryResult<T> = Promise<{ data: T | null; error: unknown }>;
export type ProjectMediaGalleryDataSource = {
  auth: { getUser(): Promise<{ data: { user: { id: string } | null } }> };
  getProfile(userId: string): QueryResult<{ role: string | null }>;
  getActiveProject(projectId: string): QueryResult<{ id: string }>;
  listMedia(projectId: string): QueryResult<ProjectMediaGalleryRow[]>;
  createSignedUrls(bucket: string, paths: string[], expiresIn: number): QueryResult<Array<{ path: string; signedUrl: string | null; error?: unknown }>>;
};

export type ProjectMediaGalleryResult =
  | { success: true; data: { items: ProjectMediaGalleryItem[]; is_limited: boolean } }
  | { success: false; code: "invalid_project" | "not_authenticated" | "not_authorized" | "project_unavailable" | "load_failed"; error: string };

const failure = (code: Extract<ProjectMediaGalleryResult, { success: false }>["code"], error: string): ProjectMediaGalleryResult => ({ success: false, code, error });

export async function getProjectMediaGalleryWithDataSource(dataSource: ProjectMediaGalleryDataSource, projectId: unknown): Promise<ProjectMediaGalleryResult> {
  const parsedProjectId = projectIdSchema.safeParse(projectId);
  if (!parsedProjectId.success) return failure("invalid_project", "Medien konnten nicht geladen werden.");
  const { data: authData } = await dataSource.auth.getUser();
  if (!authData.user) return failure("not_authenticated", "Zugriff nicht erlaubt.");
  const { data: profile } = await dataSource.getProfile(authData.user.id);
  const parsedRole = roleSchema.safeParse(profile?.role);
  if (!parsedRole.success || !canViewProjectMedia(parsedRole.data)) return failure("not_authorized", "Zugriff nicht erlaubt.");
  const { data: project, error: projectError } = await dataSource.getActiveProject(parsedProjectId.data);
  if (projectError || !project) return failure("project_unavailable", "Zugriff nicht erlaubt.");
  const { data: rows, error } = await dataSource.listMedia(parsedProjectId.data);
  if (error || !rows) return failure("load_failed", "Medien konnten nicht geladen werden.");

  const parsedRows = rows.map((row) => projectMediaGalleryRowSchema.safeParse(row));
  if (parsedRows.some((row) => !row.success)) return failure("load_failed", "Medien konnten nicht geladen werden.");
  const validRows = parsedRows.flatMap((row) => row.success ? [row.data] : []);
  const signedUrlByPath = new Map<string, string>();
  if (validRows.length > 0) {
    const { data: signed } = await dataSource.createSignedUrls("project-media", validRows.map((row) => row.storage_path), PROJECT_MEDIA_SIGNED_URL_TTL_SECONDS);
    for (const result of signed ?? []) if (!result.error && result.signedUrl) signedUrlByPath.set(result.path, result.signedUrl);
  }
  return {
    success: true,
    data: {
      is_limited: validRows.length === PROJECT_MEDIA_GALLERY_LIMIT,
      items: validRows.map((row) => ({
        media_id: row.id, project_id: row.project_id, category: row.category,
        category_label: PROJECT_MEDIA_CATEGORY_LABELS[row.category], media_type: row.media_type,
        mime_type: row.mime_type, file_size_bytes: row.file_size_bytes, caption: row.caption,
        created_at: row.created_at, display_kind: row.mime_type === "application/pdf" ? "pdf" : "image",
        signed_view_url: signedUrlByPath.get(row.storage_path) ?? null,
      })),
    },
  };
}
