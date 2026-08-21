import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { canCorrectEvidenceObservation, canCorrectProjectKnowledgeClaim, canInvalidateProjectEvidence, canOverrideReviewerProtectedKnowledgeClaim } from "@/lib/domain/permissions";
import { applyClaimRetraction, CORRECTION_ACTIONS, CORRECTION_REASON_CODES, CORRECTION_STATUSES, CORRECTION_TYPES, correctionRetryClass, knowledgeCorrectionDtoSchema } from "@/lib/domain/conversation-intelligence/persistent-correction";
import { getEffectiveClaims } from "@/lib/domain/conversation-intelligence/knowledge-state";
import type { KnowledgeState } from "@/lib/domain/conversation-intelligence/schemas";
import { DESCRIPTIVE_PROPERTY_KEYS } from "@/lib/domain/conversation-intelligence/property-strength-registry";

const ids = { project: "11000000-0000-4000-8000-000000000001", conversation: "11000000-0000-4000-8000-000000000002", entity: "11000000-0000-4000-8000-000000000003", claim: "11000000-0000-4000-8000-000000000004", evidence: "11000000-0000-4000-8000-000000000005", source: "11000000-0000-4000-8000-000000000006" };
const state = (property: typeof DESCRIPTIVE_PROPERTY_KEYS[number], actor: "admin" | "reviewer" = "admin"): KnowledgeState => ({ project_id: ids.project, conversation_id: ids.conversation, state_version: 2, updated_at: "2026-08-21T10:00:00.000Z", claims: [{ claim_id: ids.claim, project_id: ids.project, entity_type: ["room_overview_context_observed", "indoor_installation_area_observed"].includes(property) ? "room" : "installation", entity_id: ids.entity, property_key: property, value: true, value_type: "boolean", epistemic_status: "observed", knowledge_strength: "descriptive_fact", state_version: 2, created_at: "2026-08-21T10:00:00.000Z", evidence: [{ evidence_id: ids.evidence, source_id: ids.source, source_type: actor === "reviewer" ? "reviewer_correction" : "project_media", actor_class: actor, evidence_status: actor === "reviewer" ? "manually_corrected" : "active", observed_at: "2026-08-21T10:00:00.000Z" }] }] });

describe("persistent correction authority", () => {
  it("keeps all correction vocabularies closed and DTO narrow", () => {
    expect(CORRECTION_TYPES).toHaveLength(6); expect(CORRECTION_ACTIONS).toEqual(["invalidate", "supersede", "retract", "replace"]); expect(CORRECTION_STATUSES).toContain("no_change"); expect(CORRECTION_REASON_CODES).toContain("provenance_invalidated");
    expect(knowledgeCorrectionDtoSchema.safeParse({ correction_id: ids.source, correction_type: "claim_retraction", status: "applied", reason: "reviewer_correction", target_type: "claim", target_id: ids.claim, resulting_state_version: 3, actor_class: "admin", created_at: "2026-08-21T10:00:00.000Z", applied_at: "2026-08-21T10:01:00.000Z", updated_at: "2026-08-21T10:01:00.000Z", value: false }).success).toBe(false);
    expect(correctionRetryClass("stale_state")).toBe("requires_recheck"); expect(correctionRetryClass("reviewer_protected")).toBe("requires_review");
  });
  it("has separate admin-only capabilities without a silent reviewer override", () => {
    expect(canInvalidateProjectEvidence("admin")).toBe(true); expect(canCorrectEvidenceObservation("admin")).toBe(true); expect(canCorrectProjectKnowledgeClaim("admin")).toBe(true); expect(canOverrideReviewerProtectedKnowledgeClaim("admin")).toBe(false);
    for (const role of ["reviewer", null] as const) { expect(canInvalidateProjectEvidence(role)).toBe(false); expect(canCorrectEvidenceObservation(role)).toBe(false); expect(canCorrectProjectKnowledgeClaim(role)).toBe(false); }
  });
  it.each(DESCRIPTIVE_PROPERTY_KEYS)("retracts positive-only %s without a false or unknown replacement", property => {
    const before = state(property); const result = applyClaimRetraction({ state: before, claim_id: ids.claim, expected_state_version: 2, actor_class: "admin", applied_at: "2026-08-21T10:02:00.000Z" });
    expect(result).toMatchObject({ success: true, changed: true, state: { state_version: 3, claims: before.claims, retracted_claim_ids: [ids.claim] } });
    if (result.success) { expect(getEffectiveClaims(result.state)).toEqual([]); expect(result.state.claims).toHaveLength(1); expect(result.state.claims.some(c => c.value === false || c.value_type === "unknown")).toBe(false); }
  });
  it("returns no-change without a version increment and protects reviewer corrections", () => {
    const first = applyClaimRetraction({ state: state(DESCRIPTIVE_PROPERTY_KEYS[0]), claim_id: ids.claim, expected_state_version: 2, actor_class: "admin", applied_at: "2026-08-21T10:02:00.000Z" }); if (!first.success) throw new Error("setup");
    expect(applyClaimRetraction({ state: first.state, claim_id: ids.claim, expected_state_version: 3, actor_class: "admin", applied_at: "2026-08-21T10:03:00.000Z" })).toMatchObject({ success: true, changed: false, state: { state_version: 3 } });
    expect(applyClaimRetraction({ state: state(DESCRIPTIVE_PROPERTY_KEYS[0], "reviewer"), claim_id: ids.claim, expected_state_version: 2, actor_class: "admin", applied_at: "2026-08-21T10:02:00.000Z" })).toMatchObject({ success: false, code: "reviewer_protected" });
    expect(applyClaimRetraction({ state: state(DESCRIPTIVE_PROPERTY_KEYS[0]), claim_id: ids.claim, expected_state_version: 1, actor_class: "admin", applied_at: "2026-08-21T10:02:00.000Z" })).toMatchObject({ success: false, code: "stale_state" });
  });
  it("migration hardens targets, CAS, idempotency, RLS and browser grants", async () => {
    const sql = await readFile("supabase/migrations/202608210008_persistent_correction_invalidation.sql", "utf8");
    expect(sql).toMatch(/create table public\.project_knowledge_corrections/i); expect(sql).toMatch(/correction_target_shape/); expect(sql).toMatch(/unique\(project_id,idempotency_key\)/); expect(sql).toMatch(/enable row level security/g); expect(sql).toMatch(/revoke all on public\.project_knowledge_corrections/); expect(sql).not.toMatch(/grant (insert|update|delete)/i); expect(sql).not.toMatch(/storage_path|signed_url|service_role/i);
    expect(sql).toMatch(/status='superseded'[\s\S]*pending_review','approved_apply_pending'/); expect(sql).toMatch(/claim_retraction_proposed/); expect(sql).not.toMatch(/value_boolean\s*=\s*false/i); expect(sql).toMatch(/missing_authority_types[\s\S]*offer[\s\S]*execution/);
  });
});
