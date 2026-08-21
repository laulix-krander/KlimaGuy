import { canManageProjectMediaLifecycle } from "@/lib/domain/permissions";
import { projectMediaLifecycleDtoSchema, type ProjectMediaLifecycleDto } from "@/lib/domain/project-media-lifecycle";
import { projectIdSchema, roleSchema } from "@/lib/domain/schemas";

type QueryResult<T> = Promise<{ data: T | null; error: unknown }>;
export type ProjectMediaLifecycleRow = {
  project_media_id: string;
  retention_state: string;
  eligibility_status: string;
  eligibility_reason_codes: string[];
  hold_status: string;
  policy_version: string | null;
  revision: number;
  updated_at: string;
};
export type ProjectMediaLifecycleReadDataSource = {
  auth: { getUser(): Promise<{ data: { user: { id: string } | null } }> };
  getProfile(userId: string): QueryResult<{ role: string | null }>;
  getActiveProject(projectId: string): QueryResult<{ id: string }>;
  listLifecycle(projectId: string): QueryResult<ProjectMediaLifecycleRow[]>;
};
export type ProjectMediaLifecycleReadResult =
  | { success: true; data: ProjectMediaLifecycleDto[] }
  | { success: false; code: "invalid_project" | "not_authenticated" | "not_authorized" | "project_unavailable" | "load_failed"; error: string };

export async function getProjectMediaLifecycleWithDataSource(source: ProjectMediaLifecycleReadDataSource, projectId: unknown): Promise<ProjectMediaLifecycleReadResult> {
  const id = projectIdSchema.safeParse(projectId);
  if (!id.success) return { success: false, code: "invalid_project", error: "Medien-Lifecycle konnte nicht geladen werden." };
  const { data: auth } = await source.auth.getUser();
  if (!auth.user) return { success: false, code: "not_authenticated", error: "Zugriff nicht erlaubt." };
  const { data: profile } = await source.getProfile(auth.user.id);
  const role = roleSchema.safeParse(profile?.role);
  if (!role.success || !canManageProjectMediaLifecycle(role.data)) return { success: false, code: "not_authorized", error: "Zugriff nicht erlaubt." };
  const { data: project, error: projectError } = await source.getActiveProject(id.data);
  if (projectError || !project) return { success: false, code: "project_unavailable", error: "Zugriff nicht erlaubt." };
  const { data: rows, error } = await source.listLifecycle(project.id);
  if (error || !rows) return { success: false, code: "load_failed", error: "Medien-Lifecycle konnte nicht geladen werden." };
  const parsed = rows.map((row) => projectMediaLifecycleDtoSchema.safeParse({
    project_media_id: row.project_media_id, retention_state: row.retention_state,
    eligibility_status: row.eligibility_status, reason_codes: row.eligibility_reason_codes,
    hold_status: row.hold_status, policy_version: row.policy_version, revision: row.revision, updated_at: row.updated_at,
  }));
  if (parsed.some((item) => !item.success)) return { success: false, code: "load_failed", error: "Medien-Lifecycle konnte nicht geladen werden." };
  return { success: true, data: parsed.flatMap((item) => item.success ? [item.data] : []) };
}
