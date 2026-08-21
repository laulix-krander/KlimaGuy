import { canManageProjectMediaLifecycle } from "@/lib/domain/permissions";
import { mediaDependencyProjectionDtoSchema, type MediaDependencyProjectionDto } from "@/lib/domain/project-media-dependency-projection";
import { projectIdSchema, roleSchema } from "@/lib/domain/schemas";

type Result<T> = Promise<{ data: T | null; error: unknown }>;
export type MediaDependencyProjectionReadSource = {
  auth: { getUser(): Promise<{ data: { user: { id: string } | null } }> };
  getProfile(userId: string): Result<{ role: string | null }>;
  getActiveProject(projectId: string): Result<{ id: string }>;
  listProjection(projectId: string): Result<unknown[]>;
};
type Failure = { success: false; code: "invalid_project" | "not_authenticated" | "not_authorized" | "project_unavailable" | "load_failed"; error: string };

/** Narrow inspector boundary: deliberately excludes source payloads and media locators. */
export async function readProjectMediaDependencyProjection(source: MediaDependencyProjectionReadSource, projectId: unknown): Promise<{ success: true; data: MediaDependencyProjectionDto[] } | Failure> {
  const id = projectIdSchema.safeParse(projectId);
  if (!id.success) return { success: false, code: "invalid_project", error: "Dependency-Projektion konnte nicht geladen werden." };
  const user = (await source.auth.getUser()).data.user;
  if (!user) return { success: false, code: "not_authenticated", error: "Zugriff nicht erlaubt." };
  const role = roleSchema.safeParse((await source.getProfile(user.id)).data?.role);
  if (!role.success || !canManageProjectMediaLifecycle(role.data)) return { success: false, code: "not_authorized", error: "Zugriff nicht erlaubt." };
  const project = await source.getActiveProject(id.data);
  if (project.error || !project.data) return { success: false, code: "project_unavailable", error: "Zugriff nicht erlaubt." };
  const rows = await source.listProjection(project.data.id);
  const parsed = rows.data?.map((row) => mediaDependencyProjectionDtoSchema.safeParse(row));
  if (rows.error || !parsed || parsed.some((row) => !row.success)) return { success: false, code: "load_failed", error: "Dependency-Projektion konnte nicht geladen werden." };
  return { success: true, data: parsed.flatMap((row) => row.success ? [row.data] : []) };
}
