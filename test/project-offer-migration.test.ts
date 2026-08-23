import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const sql = readFileSync("supabase/migrations/202608230001_minimal_persistent_offer_authority.sql", "utf8");
describe("offer authority migration", () => {
  it("defines constrained history without prices, PII, artifacts, execution, or deletes", () => {
    expect(sql).toContain("create table public.project_offers"); expect(sql).toContain("references public.projects(id) on delete restrict");
    expect(sql).toContain("project_offers_project_version_unique"); expect(sql).toContain("project_offers_one_current"); expect(sql).toContain("project_offers_not_self_superseding"); expect(sql).toContain("offer_supersession_cycle");
    expect(sql).not.toMatch(/create table public\.project_executions/); expect(sql).not.toMatch(/\bprice\s+(numeric|integer|bigint)/); expect(sql).not.toMatch(/customer_(name|email|phone)/); expect(sql).not.toMatch(/artifact_reference/);
  });
  it("uses fixed-path admin RPCs, RLS, CAS, replay and no direct writes", () => {
    expect(sql).toContain("enable row level security"); expect(sql).toContain("current_app_role()<>'admin'"); expect(sql).toContain("expected_revision integer"); expect(sql).toContain("unique(project_id,idempotency_key)");
    expect(sql).toContain("security definer set search_path=public,pg_temp"); expect(sql).toContain("revoke all on public.project_offers"); expect(sql).not.toContain("grant update on public.project_offers"); expect(sql).not.toContain("grant delete on public.project_offers");
  });
  it("coordinates status, projection and sanitized audit atomically", () => {
    for (const event of ["offer_draft_created","offer_created","offer_sent","offer_accepted","offer_rejected","offer_superseded"]) expect(sql).toContain(`'${event}'`);
    expect(sql).toContain("app.offer_authority_transition"); expect(sql).toContain("mark_project_offer_projection_dirty"); expect(sql).toContain("project_offer_id uuid references public.project_offers");
    expect(sql).toContain("array['execution']"); expect(sql).toContain("array['offer','execution']");
  });
});
