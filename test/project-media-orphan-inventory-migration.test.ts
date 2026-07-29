import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/202607290002_project_media_orphan_inventory_rpc.sql", "utf8");
const normalized = migration.replace(/\s+/g, " ").toLowerCase();
const body = migration.match(/as \$\$([\s\S]*?)\$\$;/i)?.[1] ?? "";

describe("AP-12-02-09 read-only orphan inventory RPC", () => {
  it("ist eng, stabil, SECURITY DEFINER und admin-only", () => {
    expect(normalized).toContain("create function public.list_project_media_orphan_candidates( target_status text, target_page integer )");
    expect(normalized).toContain("language plpgsql stable security definer set search_path = public, pg_temp");
    expect(normalized).toContain("auth.uid() is null or public.current_app_role() is distinct from 'admin'");
  });
  it("erzwingt Statusallowlist, 24 Stunden, aktive Kandidaten und stabile Pagination", () => {
    expect(normalized).toContain("target_status not in ('all', 'pending', 'failed')");
    expect(normalized).toContain("pm.deleted_at is null");
    expect(normalized).toContain("pm.upload_status in ('pending', 'failed')");
    expect(normalized).toContain("pm.created_at <= statement_timestamp() - interval '24 hours'");
    expect(normalized).toContain("order by pm.created_at asc, pm.id asc limit 50 offset ((target_page - 1) * 50)");
  });
  it("gibt weder Pfad, Originaldateiname noch Kundendaten aus", () => {
    const returns = normalized.match(/returns table \((.*?)\) language/)?.[1] ?? "";
    expect(returns).not.toMatch(/storage_(?:path|bucket)|filename|customer|address|token|url/);
  });
  it("führt keine Mutation, Storageauflistung, URL oder Service Role ein", () => {
    expect(body).not.toMatch(/\b(insert|update|delete|remove|truncate|drop|alter)\b/i);
    expect(migration).not.toMatch(/storage\.(?:objects|buckets)|createSignedUrl|getPublicUrl|service_role|SUPABASE_SERVICE_ROLE|cron|schedule/i);
  });
  it("beschränkt EXECUTE auf authenticated", () => {
    expect(normalized).toContain("revoke execute on function public.list_project_media_orphan_candidates(text, integer) from public, anon, authenticated");
    expect(normalized).toContain("grant execute on function public.list_project_media_orphan_candidates(text, integer) to authenticated");
  });
});
