import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { EVIDENCE_INTERPRETATION_RESULT_CODES, EVIDENCE_INTERPRETATION_RUN_STATUSES, EVIDENCE_INTERPRETATION_VERSIONS, evidenceInterpretationRunDtoSchema, isObservationAllowedForEvidenceTarget, recordPersistentObservationInputSchema } from "@/lib/domain/conversation-intelligence/persistent-evidence-interpretation";

const migration = readFileSync("supabase/migrations/202608210004_persistent_evidence_interpretations.sql", "utf8");
describe("persistent evidence interpretation contract", () => {
  it("keeps statuses, results and version closed", () => {
    expect(EVIDENCE_INTERPRETATION_RUN_STATUSES).toEqual(["pending","in_progress","completed","insufficient_evidence","failed","invalidated"]);
    expect(EVIDENCE_INTERPRETATION_RESULT_CODES).toContain("source_media_unavailable"); expect(EVIDENCE_INTERPRETATION_VERSIONS).toEqual(["synthetic_observation_v1"]);
    expect(evidenceInterpretationRunDtoSchema.safeParse({}).success).toBe(false);
    expect(recordPersistentObservationInputSchema.safeParse({ interpretation_run_id:crypto.randomUUID(),observation_id:crypto.randomUUID(),observation_type:"window_visible",observation_value:{kind:"visibility",value:"visible"},evidence_quality:"certain",interpretation_status:"observed" }).success).toBe(false);
  });
  it("uses canonical target compatibility", () => { expect(isObservationAllowedForEvidenceTarget("room_overview","window_visible")).toBe(true); expect(isObservationAllowedForEvidenceTarget("electrical_area","window_visible")).toBe(false); });
});
describe("persistent interpretation migration", () => {
  it("creates scoped typed authorities", () => { expect(migration).toContain("create table public.evidence_interpretation_runs"); expect(migration).toContain("create table public.evidence_observations"); expect(migration).toContain("foreign key (project_id,evidence_id)"); expect(migration).toContain("foreign key (project_id,evidence_id,interpretation_run_id)"); expect(migration).toContain("evidence_interpretation_one_active_idx"); expect(migration).toContain("evidence_observation_active_semantics_idx"); });
  it("enforces physical/tombstone race gates under locks", () => { expect(migration).toContain("for update"); expect(migration).toContain("m.physical_state<>'present'"); expect(migration).toContain("lc.deletion_execution_state<>'idle'"); expect(migration).toContain("project_evidence_tombstones"); });
  it("has RLS, narrow grants, fixed paths and audit actions", () => { expect(migration.match(/enable row level security/g)).toHaveLength(2); expect(migration).not.toMatch(/grant all/i); expect(migration).toContain("security definer set search_path=public,pg_temp"); for(const action of ["interpretation_started","observation_recorded","interpretation_completed","interpretation_insufficient","interpretation_failed"]) expect(migration).toContain(action); });
  it("contains no locator, provider, storage or network boundary", () => { expect(migration).not.toMatch(/storage\.from|signed_url|signed url|service.role|https?:|provider|prompt|customer_text/i); });
});
