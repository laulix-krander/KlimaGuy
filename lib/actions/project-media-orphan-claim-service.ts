import { canClaimProjectMediaOrphan } from "@/lib/domain/permissions";
import { projectMediaOrphanClaimSchema, roleSchema } from "@/lib/domain/schemas";

export type ProjectMediaOrphanClaimCode =
  | "cleanup_soft_deleted"
  | "cleanup_not_eligible"
  | "cleanup_conflict"
  | "cleanup_forbidden"
  | "cleanup_failed";

export type ProjectMediaOrphanClaimResult = {
  success: boolean;
  code: ProjectMediaOrphanClaimCode;
};

type RpcRow = { cleanup_item_id: string; media_id: string; project_id: string; cleanup_status: string };
type QueryResult<T> = Promise<{ data: T | null; error: { code?: string } | null }>;

export type ProjectMediaOrphanClaimDataSource = {
  auth: { getUser(): Promise<{ data: { user: { id: string } | null } }> };
  getProfile(userId: string): QueryResult<{ role: string | null }>;
  claim(mediaId: string, projectId: string): QueryResult<RpcRow[]>;
};

const result = (success: boolean, code: ProjectMediaOrphanClaimCode): ProjectMediaOrphanClaimResult => ({ success, code });

export async function claimProjectMediaOrphanWithDataSource(
  dataSource: ProjectMediaOrphanClaimDataSource,
  input: unknown,
): Promise<ProjectMediaOrphanClaimResult> {
  const { data: authData } = await dataSource.auth.getUser();
  if (!authData.user) return result(false, "cleanup_forbidden");

  const { data: profile } = await dataSource.getProfile(authData.user.id);
  const role = roleSchema.safeParse(profile?.role);
  if (!profile || !role.success || !canClaimProjectMediaOrphan(role.data)) {
    return result(false, "cleanup_forbidden");
  }

  const parsed = projectMediaOrphanClaimSchema.safeParse(input);
  if (!parsed.success) return result(false, "cleanup_not_eligible");

  const { data, error } = await dataSource.claim(parsed.data.media_id, parsed.data.project_id);
  if (error) return result(false, error.code === "23505" ? "cleanup_conflict" : "cleanup_failed");
  const row = data?.[0];
  if (!row) return result(false, "cleanup_not_eligible");
  if (row.cleanup_status !== "soft_deleted"
    || row.media_id !== parsed.data.media_id
    || row.project_id !== parsed.data.project_id) return result(false, "cleanup_failed");
  return result(true, "cleanup_soft_deleted");
}
