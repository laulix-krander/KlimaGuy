import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("supabase/migrations/202608210007_authoritative_media_dependency_projection.sql", "utf8");
describe("authoritative media dependency projection migration", () => {
  it("creates projection and completeness authorities with closed contracts", () => {
    expect(sql).toContain("create table public.project_media_dependencies");
    expect(sql).toContain("create table public.project_media_dependency_projection_state");
    expect(sql).toContain("media_dependency_projection_v1");
    expect(sql).toContain("('complete','incomplete','drifted','rebuild_required')");
    expect(sql).toContain("array['correction','offer','execution']");
  });
  it("uses typed source, project, evidence and media foreign keys", () => {
    expect(sql).toContain("project_media_dependency_typed_source");
    expect(sql).toContain("references public.project_evidence(project_id,id,project_media_id)");
    expect(sql).toContain("references public.evidence_interpretation_runs(project_id,evidence_id,id)");
    expect(sql).toContain("references public.evidence_observations(project_id,evidence_id,id)");
    expect(sql).toContain("references public.evidence_claim_proposals(project_id,evidence_id,id)");
    expect(sql).toContain("unique(project_media_id,dependency_type,source_record_kind,source_record_id,projection_version)");
  });
  it("has server-only idempotent rebuild, dirty markers and drift detection", () => {
    expect(sql).toContain("function public.rebuild_project_media_dependencies");
    expect(sql).toContain("delete from public.project_media_dependencies");
    expect(sql).toContain("completeness_status='rebuild_required'");
    expect(sql).toContain("function public.detect_project_media_dependency_drift");
    expect(sql).toContain("completeness_status='drifted'");
    expect(sql).toContain("media_dependency_projection_drift_detected");
  });
  it("enables RLS, removes direct DML grants and stores no locator columns", () => {
    expect(sql).toContain("alter table public.project_media_dependencies enable row level security");
    expect(sql).toContain("revoke all on public.project_media_dependencies");
    expect(sql).toContain("grant select on public.project_media_dependencies");
    expect(sql).not.toMatch(/\b(storage_path|bucket_name|signed_url|locator|file_name)\s+(text|jsonb)/);
  });
});
