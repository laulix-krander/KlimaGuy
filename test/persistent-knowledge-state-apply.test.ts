import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { applyReviewedClaimInputSchema, KNOWLEDGE_STATE_INITIAL_VERSION, KNOWLEDGE_STATE_SCHEMA_VERSION, materializePersistentKnowledgeState, toProjectKnowledgeStateDto } from "@/lib/domain/conversation-intelligence/persistent-knowledge-state";
import { derivePlannerEvidenceContext } from "@/lib/domain/conversation-intelligence/planner-evidence-context";

const sql = readFileSync("supabase/migrations/202608210006_persistent_knowledge_state_apply.sql", "utf8");
const ids = Array.from({ length: 12 }, (_, index) => `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`);
const properties = ["room_overview_context_observed", "indoor_installation_area_observed", "outdoor_installation_area_observed", "line_route_context_observed", "wall_penetration_context_observed"] as const;

describe("persistent knowledge migration", () => {
  it("creates project-scoped header, append-only claims/evidence and application authority", () => {
    for (const table of ["project_knowledge_states", "project_knowledge_claims", "project_knowledge_claim_evidence", "project_knowledge_state_transitions"]) expect(sql).toContain(`create table public.${table}`);
    expect(sql).toContain("project_id uuid not null unique"); expect(sql).toContain("current_version integer not null default 1"); expect(sql).toContain("schema_version integer not null default 1");
    expect(sql).toContain("knowledge_history_append_only"); expect(sql.match(/enable row level security/g)).toHaveLength(4);
    expect(sql).not.toMatch(/grant (insert|update|delete|all) on public\.project_knowledge/i);
  });
  it("uses relational project-evidence and lossless typed value constraints without locator or conversation fields", () => {
    expect(sql).toContain("value_text text, value_number numeric, value_boolean boolean"); expect(sql).toContain("knowledge_claim_typed_value_check");
    expect(sql).toContain("foreign key(project_id,evidence_id)"); expect(sql).toContain("source_type text not null check(source_type='project_evidence')");
    expect(sql).not.toMatch(/conversation_id|storage_path|storage_bucket|signed_url|filename|provider_id|image_metadata/i);
  });
  it("provides narrow admin-only CAS, replay and atomic apply", () => {
    expect(sql).toContain("apply_reviewed_descriptive_claim(target_proposal_id uuid,expected_proposal_revision integer,expected_state_version integer)");
    expect(sql).toContain("p.status<>'approved_apply_pending'"); expect(sql).toContain("s.current_version<>expected_state_version"); expect(sql).toContain("proposal_id uuid not null unique"); expect(sql).toContain("idempotency_key text not null unique");
    expect(sql).toContain("if found then return jsonb_build_object"); expect(sql).toContain("then 'no_change' else 'applied'"); expect(sql).toContain("knowledge_claim_no_change");
    expect(sql).toContain("reviewed_claim_apply_failed"); expect(sql).toContain("get stacked diagnostics");
    expect((sql.match(/for update/g) ?? []).length).toBeGreaterThanOrEqual(7);
  });
  it("revalidates review, observation, evidence, media and tombstone under lock", () => {
    for (const gate of ["approval_review_missing", "observation_invalidated", "evidence_invalid", "source_media_unavailable", "project_evidence_tombstones", "deletion_execution_state<>'idle'"]) expect(sql).toContain(gate);
    for (const property of properties) expect(sql).toContain(property);
    expect(sql).toContain("value_boolean is distinct from true"); expect(sql).toContain("knowledge_strength<>'descriptive_fact'");
  });
  it("contains no forbidden integrations or direct browser mutation", () => {
    expect(sql).not.toMatch(/service.role|storage\.from|https?:|openai|anthropic|whatsapp|\bvision\b|\bocr\b/i);
  });
});

describe("persistent knowledge domain adapter", () => {
  it("keeps apply input narrow and explicit versions separate", () => {
    expect(KNOWLEDGE_STATE_INITIAL_VERSION).toBe(1); expect(KNOWLEDGE_STATE_SCHEMA_VERSION).toBe(1);
    const input = { proposal_id: ids[0], expected_proposal_revision: 2, expected_state_version: 1 };
    expect(applyReviewedClaimInputSchema.safeParse(input).success).toBe(true);
    expect(applyReviewedClaimInputSchema.safeParse({ ...input, property_key: properties[0] }).success).toBe(false);
  });
  it("reconstructs all five effective claims and existing planner evidence context without exposing provenance", () => {
    const rows = properties.map((property_key, index) => ({ claim_id: ids[index + 1], project_id: ids[0], entity_id: ids[0], entity_type: index < 2 ? "room" : "installation", property_key, value_type: "boolean", value_text: null, value_number: null, value_boolean: true, epistemic_status: "observed", knowledge_strength: "descriptive_fact", supersedes_claim_id: null, claim_state_version: index + 2, created_at: "2026-08-21T12:00:00.000Z", evidence: [{ id: ids[index + 7], evidence_id: ids[index + 1], actor_class: "admin", evidence_status: "active", observed_at: "2026-08-21T11:00:00.000Z" }] }));
    const state = materializePersistentKnowledgeState({ id: ids[6], project_id: ids[0], current_version: 6, schema_version: 1, updated_at: "2026-08-21T12:00:00.000Z" }, rows, ids[11]);
    const dto = toProjectKnowledgeStateDto(state); expect(dto.effective_claims).toHaveLength(5); expect(derivePlannerEvidenceContext(state).map(item => item.property_key)).toEqual(properties);
    expect(JSON.stringify(dto)).not.toMatch(/evidence|conversation|storage|url/i);
  });
});
