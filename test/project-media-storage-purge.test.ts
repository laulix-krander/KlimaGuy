import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { canPurgeProjectMediaOrphan } from "@/lib/domain/permissions";
import { projectMediaStoragePurgeSchema } from "@/lib/domain/schemas";

const migration = readFileSync("supabase/migrations/202607300001_project_media_storage_purge.sql", "utf8").toLowerCase();
const client = readFileSync("lib/server/project-media-storage-purge-client.ts", "utf8");
const adapter = readFileSync("lib/server/project-media-storage-purge-adapter.ts", "utf8");
const action = readFileSync("lib/actions/project-media-storage-purge.ts", "utf8");

describe("single controlled project media storage purge", () => {
  it("bindet Permission und strikte Eingabe ausschließlich an Admin und zwei IDs", () => {
    expect(canPurgeProjectMediaOrphan("admin")).toBe(true);
    expect(canPurgeProjectMediaOrphan("reviewer")).toBe(false);
    const valid = { media_id: "11111111-1111-4111-8111-111111111111", project_id: "22222222-2222-4222-8222-222222222222" };
    expect(projectMediaStoragePurgeSchema.safeParse(valid).success).toBe(true);
    expect(projectMediaStoragePurgeSchema.safeParse({ ...valid, path: "client/path" }).success).toBe(false);
  });

  it("ergänzt geschlossene Purgefelder und konsistente Constraints ohne technische Zielspalten", () => {
    for (const value of ["purge_status", "purge_claimed_at", "purge_completed_at", "purge_attempt_count", "last_purge_error_code", "purge_claim_token", "purge_claimed_by"]) expect(migration).toContain(value);
    expect(migration).toContain("purge_status in ('not_started','in_progress','retry_required','purged','failed')");
    expect(migration).toContain("purge_attempt_count >= 0");
    expect(migration).not.toMatch(/add column (storage_path|storage_bucket)/);
  });

  it("schützt Claim, Abschluss und Read-RPC mit Admin, Row Locks, CAS und engen Grants", () => {
    expect(migration).toContain("create function public.claim_project_media_storage_purge(target_media_id uuid, target_project_id uuid)");
    expect(migration).toContain("create function public.complete_project_media_storage_purge(");
    expect(migration).toContain("security definer set search_path = public, pg_temp");
    expect(migration).toContain("public.current_app_role() is distinct from 'admin'");
    expect(migration).toContain("pm.deleted_at is not null");
    expect(migration).toContain("pm.upload_status <> 'ready'");
    expect(migration).toContain("for update");
    expect(migration).toContain("purge_claim_token=gen_random_uuid()");
    expect(migration).toContain("revoke execute on function public.claim_project_media_storage_purge(uuid,uuid) from public,anon,authenticated");
    expect(migration).not.toContain("delete from storage.objects");
    expect(migration).not.toContain("for delete");
  });

  it("hält Service Role server-only und den Adapter auf genau remove([path]) begrenzt", () => {
    expect(client).toContain('import "server-only"');
    expect(client).toContain("process.env.SUPABASE_SERVICE_ROLE_KEY");
    expect(client).not.toContain("NEXT_PUBLIC_SUPABASE_SERVICE");
    expect(adapter).toContain('.from("project-media").remove([target.path])');
    for (const forbidden of [".upload(", ".move(", ".copy(", ".list(", "createSignedUrl", "getPublicUrl"]) expect(adapter).not.toContain(forbidden);
    expect(action).toContain('if (result.success) revalidatePath("/admin/project-media/orphans")');
  });
});
