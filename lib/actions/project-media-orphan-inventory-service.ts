import { canViewProjectMediaOrphanInventory } from "@/lib/domain/permissions";
import { projectMediaOrphanInventoryQuerySchema, roleSchema } from "@/lib/domain/schemas";

export const PROJECT_MEDIA_ORPHAN_INVENTORY_PAGE_SIZE = 50;
export const PROJECT_MEDIA_ORPHAN_MINIMUM_AGE_HOURS = 24;

export type ProjectMediaOrphanFilter = "all" | "pending" | "failed";
export type ProjectMediaOrphanClassification =
  | "pending_orphan_candidate"
  | "failed_orphan_candidate";

export type ProjectMediaOrphanInventoryItem = {
  media_id: string;
  project_id: string;
  project_title: string;
  upload_status: "pending" | "failed";
  created_at: string;
  age_hours: number;
  mime_type: string;
  file_size_bytes: number;
  classification: ProjectMediaOrphanClassification;
  diagnostic_code: ProjectMediaOrphanClassification;
};

export type ProjectMediaOrphanInventoryRow = {
  media_id: string;
  project_id: string;
  project_title: string;
  upload_status: string;
  created_at: string;
  age_hours: number;
  mime_type: string;
  file_size_bytes: number;
  total_count: number;
};

type QueryResult<T> = Promise<{ data: T | null; error: unknown }>;
export type ProjectMediaOrphanInventoryDataSource = {
  auth: { getUser(): Promise<{ data: { user: { id: string } | null } }> };
  getProfile(userId: string): QueryResult<{ role: string | null }>;
  listCandidates(filter: ProjectMediaOrphanFilter, page: number): QueryResult<ProjectMediaOrphanInventoryRow[]>;
};

export type ProjectMediaOrphanInventoryResult =
  | { success: true; data: { items: ProjectMediaOrphanInventoryItem[]; page: number; page_size: 50; total_count: number; total_pages: number; filter: ProjectMediaOrphanFilter } }
  | { success: false; code: "not_authenticated" | "profile_unavailable" | "not_authorized" | "invalid_filter" | "invalid_page" | "load_failed"; error: string };

const failure = (code: Extract<ProjectMediaOrphanInventoryResult, { success: false }>['code'], error: string): ProjectMediaOrphanInventoryResult => ({ success: false, code, error });

export async function getProjectMediaOrphanInventoryWithDataSource(
  dataSource: ProjectMediaOrphanInventoryDataSource,
  input: unknown,
  now: Date = new Date(),
): Promise<ProjectMediaOrphanInventoryResult> {
  const { data: authData } = await dataSource.auth.getUser();
  if (!authData.user) return failure("not_authenticated", "Zugriff nicht erlaubt.");

  const { data: profile } = await dataSource.getProfile(authData.user.id);
  const parsedRole = roleSchema.safeParse(profile?.role);
  if (!profile || !parsedRole.success) return failure("profile_unavailable", "Zugriff nicht erlaubt.");
  if (!canViewProjectMediaOrphanInventory(parsedRole.data)) return failure("not_authorized", "Zugriff nicht erlaubt.");

  const parsed = projectMediaOrphanInventoryQuerySchema.safeParse(input);
  if (!parsed.success) {
    const pageInvalid = parsed.error.issues.some((issue) => issue.path[0] === "page");
    return failure(pageInvalid ? "invalid_page" : "invalid_filter", pageInvalid ? "Ungültige Seite." : "Ungültiger Filter.");
  }

  const { status, page } = parsed.data;
  const { data: rows, error } = await dataSource.listCandidates(status, page);
  if (error || !rows) return failure("load_failed", "Inventur konnte nicht geladen werden.");

  const items: ProjectMediaOrphanInventoryItem[] = [];
  for (const row of rows) {
    if (row.upload_status !== "pending" && row.upload_status !== "failed") return failure("load_failed", "Inventur konnte nicht geladen werden.");
    const createdAt = new Date(row.created_at);
    if (!Number.isFinite(createdAt.getTime()) || createdAt.getTime() > now.getTime() - PROJECT_MEDIA_ORPHAN_MINIMUM_AGE_HOURS * 60 * 60 * 1000) {
      return failure("load_failed", "Inventur konnte nicht geladen werden.");
    }
    const classification: ProjectMediaOrphanClassification = row.upload_status === "pending"
      ? "pending_orphan_candidate"
      : "failed_orphan_candidate";
    items.push({
      media_id: row.media_id,
      project_id: row.project_id,
      project_title: row.project_title,
      upload_status: row.upload_status,
      created_at: row.created_at,
      age_hours: Math.max(PROJECT_MEDIA_ORPHAN_MINIMUM_AGE_HOURS, Math.floor(row.age_hours)),
      mime_type: row.mime_type,
      file_size_bytes: row.file_size_bytes,
      classification,
      diagnostic_code: classification,
    });
  }

  const totalCount = rows[0]?.total_count ?? 0;
  return { success: true, data: { items, page, page_size: PROJECT_MEDIA_ORPHAN_INVENTORY_PAGE_SIZE, total_count: totalCount, total_pages: Math.ceil(totalCount / PROJECT_MEDIA_ORPHAN_INVENTORY_PAGE_SIZE), filter: status } };
}
