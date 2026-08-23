import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const sql = readFileSync("supabase/migrations/202608230002_minimal_persistent_execution_authority.sql", "utf8");
describe("execution authority migration", () => {
  it("defines the minimal constrained accepted-offer aggregate", () => {
    expect(sql).toContain("create table public.project_executions"); expect(sql).toContain("project_executions_offer_project_fk"); expect(sql).toContain("project_executions_one_per_accepted_offer");
    expect(sql).toContain("('not_started','active','completed','cancelled')"); expect(sql).toContain("revision > 0"); expect(sql).toContain("project_executions_lifecycle_timestamps"); expect(sql).toContain("execution_requires_current_accepted_offer");
    for (const forbidden of ["customer_name", "customer_email", "appointment_at", "employee_id", "material_id", "invoice_id", "price numeric", "work_order"]) expect(sql).not.toContain(forbidden);
  });
  it("creates on acceptance and supplies CAS, replay, atomic project coordination and audit", () => {
    expect(sql).toContain("create_execution_after_offer_acceptance"); expect(sql).toContain("old.status='sent'"); expect(sql).toContain("on conflict(accepted_offer_id) do nothing");
    expect(sql).toContain("expected_revision integer"); expect(sql).toContain("stale_execution_revision"); expect(sql).toContain("unique(project_id,idempotency_key)"); expect(sql).toContain("set status='closed'"); expect(sql).toContain("mark_project_offer_projection_dirty");
    for (const event of ["project_execution_created", "project_execution_started", "project_execution_completed", "project_execution_cancelled"]) expect(sql).toContain(`'${event}'`);
  });
  it("uses typed projection sources, RLS and RPC-only mutation without unlocking deletion", () => {
    expect(sql).toContain("project_execution_id uuid references public.project_executions"); expect(sql).toContain("source_record_kind='project_execution'"); expect(sql).toContain("array[]::text[]");
    expect(sql).toContain("enable row level security"); expect(sql).toContain("current_app_role()<>'admin'"); expect(sql).toContain("revoke all on public.project_executions"); expect(sql).not.toContain("grant update on public.project_executions"); expect(sql).not.toContain("grant delete on public.project_executions");
    expect(sql).not.toMatch(/create or replace function public\.claim_ready_project_media_deletion/);
  });
});
