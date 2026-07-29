import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const path = "supabase/migrations/202607290003_project_media_cleanup_claim.sql";
const migration = readFileSync(path, "utf8");
const normalized = migration.replace(/\s+/g, " ").toLowerCase();
const body = migration.match(/create function public\.claim_and_soft_delete_project_media_orphan[\s\S]*?as \$\$([\s\S]*?)\$\$;/i)?.[1] ?? "";

describe("AP-12-02-11-01 Cleanup-Tabelle", () => {
  it("enthält exakt die freigegebenen schmalen Spalten", () => {
    const table = migration.match(/create table public\.project_media_cleanup_items \(([\s\S]*?)\n\);/i)?.[1] ?? "";
    const columns = [...table.matchAll(/^\s{2}([a-z_]+)\s+(?:uuid|text|timestamptz)/gm)].map((match) => match[1]);
    expect(columns).toEqual(["id", "media_id", "project_id", "cleanup_status", "source_upload_status", "claimed_by", "claimed_at", "completed_at", "last_error_code", "created_at", "updated_at"]);
    expect(table).not.toMatch(/storage|bucket|filename|customer|token|url|content/i);
  });
  it("erzwingt PK, sichere gebundene FKs, Statusregeln, Zeitregeln und genau ein Item je Medium", () => {
    expect(normalized).toContain("id uuid primary key default gen_random_uuid()");
    expect(normalized).toContain("constraint project_media_cleanup_items_media_unique unique (media_id)");
    expect(normalized).toContain("foreign key (project_id, media_id) references public.project_media(project_id, id) on delete restrict");
    expect(normalized).toContain("foreign key (project_id) references public.projects(id) on delete restrict");
    expect(normalized).toContain("foreign key (claimed_by) references auth.users(id) on delete restrict");
    expect(normalized).toContain("cleanup_status in ('claimed', 'soft_deleted', 'claim_failed')");
    expect(normalized).toContain("source_upload_status in ('pending', 'failed')");
    expect(normalized).toContain("(cleanup_status = 'soft_deleted') = (completed_at is not null)");
    expect(normalized).toContain("(cleanup_status = 'claim_failed') = (last_error_code is not null)");
  });
  it("aktiviert RLS ohne Browserrechte, offene Policy oder DELETE-Policy", () => {
    expect(normalized).toContain("alter table public.project_media_cleanup_items enable row level security");
    expect(normalized).toContain("revoke all on table public.project_media_cleanup_items from public, anon, authenticated");
    expect(normalized).not.toMatch(/create policy|grant (?:select|insert|update|delete)|for delete|using \(true\)|with check \(true\)/);
  });
});

describe("AP-12-02-11-01 atomare RPC", () => {
  it("hat nur die exakte Signatur, SECURITY DEFINER und den festen search_path", () => {
    expect(normalized).toContain("create function public.claim_and_soft_delete_project_media_orphan( target_media_id uuid, target_project_id uuid )");
    expect(normalized).toContain("language plpgsql security definer set search_path = public, pg_temp");
    expect(normalized).toContain("auth.uid()");
    expect(normalized).toContain("public.current_app_role() is distinct from 'admin'");
  });
  it("bindet und sperrt genau einen alten aktiven pending/failed-Kandidaten und schließt ready aus", () => {
    expect(normalized).toContain("pm.id = target_media_id and pm.project_id = target_project_id");
    expect(normalized).toContain("pm.deleted_at is null");
    expect(normalized).toContain("pm.upload_status in ('pending', 'failed')");
    expect(normalized).toContain("pm.created_at <= operation_time - interval '24 hours'");
    expect(normalized).toContain("for update of pm");
    expect(body).not.toMatch(/upload_status\s*=\s*'ready'/i);
  });
  it("claimt aus DB-Werten, setzt ausschließlich deleted_at und schließt atomar samt Audit ab", () => {
    expect(normalized).toContain("'claimed', source_status, actor_id, operation_time");
    expect(normalized).toContain("update public.project_media pm set deleted_at = operation_time");
    const mediaSet = body.match(/update public\.project_media pm\s+set([\s\S]*?)where/i)?.[1] ?? "";
    expect(mediaSet).not.toMatch(/storage_|upload_status|project_id|\bid\b/i);
    expect(normalized).toContain("set cleanup_status = 'soft_deleted', completed_at = operation_time");
    expect(normalized).toContain("'orphan_soft_delete'");
    expect(normalized).toContain("'cleanup_item_id', claimed_item_id");
  });
  it("enthält keine Storage-Mutation, dynamische SQL oder physische Ablaufmechanik", () => {
    expect(migration).not.toMatch(/storage\.objects|storage\.remove|execute\s+format|service_role|SUPABASE_SERVICE_ROLE|createSignedUrl|getPublicUrl|cron|schedule/i);
  });
  it("gewährt EXECUTE ausschließlich authenticated", () => {
    expect(normalized).toContain("revoke execute on function public.claim_and_soft_delete_project_media_orphan(uuid, uuid) from public, anon, authenticated");
    expect(normalized).toContain("grant execute on function public.claim_and_soft_delete_project_media_orphan(uuid, uuid) to authenticated");
  });
});
