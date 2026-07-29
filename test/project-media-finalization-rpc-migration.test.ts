import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const path = "supabase/migrations/202607290001_project_media_finalize_rpc.sql";
const migration = readFileSync(path, "utf8");
const normalized = migration.replace(/\s+/g, " ").toLowerCase();
const body = migration.match(/as \$\$([\s\S]*?)\$\$;/i)?.[1] ?? "";

describe("AP-12-02-HF-03 atomic project media finalization RPC", () => {
  it("defines the exact boolean SECURITY DEFINER signature and fixed search_path", () => {
    expect(normalized).toContain("create function public.finalize_project_media_upload( target_media_id uuid, target_project_id uuid ) returns boolean");
    expect(normalized).toContain("language plpgsql security definer set search_path = public, storage, pg_temp");
  });

  it("requires authentication and the central admin role", () => {
    expect(migration).toContain("actor_id uuid := auth.uid()");
    expect(normalized).toContain("if actor_id is null or target_media_id is null or target_project_id is null then return false");
    expect(normalized).toContain("public.current_app_role() is distinct from 'admin'");
  });

  it("binds active pending media to project, uploader and the active parent", () => {
    for (const condition of [
      "pm.id = target_media_id",
      "pm.project_id = target_project_id",
      "pm.uploaded_by = actor_id",
      "pm.deleted_at is null",
      "pm.upload_status = 'pending'",
      "pm.storage_bucket = 'project-media'",
      "p.id = pm.project_id",
      "p.deleted_at is null",
    ]) expect(normalized).toContain(condition);
  });

  it("matches the exact Storage object using the production metadata keys", () => {
    expect(normalized).toContain("from public.projects as p, storage.objects as so");
    expect(normalized).toContain("so.bucket_id = pm.storage_bucket");
    expect(normalized).toContain("so.name = pm.storage_path");
    expect(normalized).toContain("(so.metadata ->> 'size')::bigint = pm.file_size_bytes");
    expect(normalized).toContain("so.metadata ->> 'mimetype' = pm.mime_type");
  });

  it("performs only the pending-to-ready update and derives boolean from row count", () => {
    const setClause = migration.match(/update\s+public\.project_media\s+as\s+pm\s+set\s+([\s\S]*?)\s+from/i)?.[1] ?? "";
    expect(setClause.trim()).toBe("upload_status = 'ready'");
    expect(normalized).toContain("get diagnostics affected_rows = row_count; return affected_rows = 1");
    expect(body.match(/\bupdate\b/gi)).toHaveLength(1);
  });

  it("revokes default execution and grants it only to authenticated", () => {
    expect(normalized).toContain("revoke execute on function public.finalize_project_media_upload(uuid, uuid) from public, anon, authenticated");
    expect(normalized).toContain("grant execute on function public.finalize_project_media_upload(uuid, uuid) to authenticated");
    expect(migration).not.toMatch(/grant\s+execute[^;]*\bto\s+(?:anon|public)\b/i);
  });

  it("adds no dynamic or destructive SQL, policy, table grant, or open access", () => {
    expect(body).not.toMatch(/\bexecute\s+(?:format|immediate)\b/i);
    expect(migration).not.toMatch(/delete\s+from\s+(?:public\.project_media|storage\.objects)/i);
    expect(migration).not.toMatch(/update\s+storage\.objects/i);
    expect(migration).not.toMatch(/\b(?:create|alter)\s+policy\b/i);
    expect(migration).not.toMatch(/using\s*\(\s*true\s*\)|with check\s*\(\s*true\s*\)/i);
    expect(migration).not.toMatch(/grant\s+(?:all|select|insert|update|delete|truncate)\b/i);
    expect(migration).not.toMatch(/\b(?:alter|create)\s+table\b|\bfor\s+delete\b/i);
  });
});
