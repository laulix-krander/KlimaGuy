import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  ACTOR_CLASSES, EPISTEMIC_STATUSES, EVENT_TYPES, READINESS_LEVELS, SYNTHETIC_IDS, SYNTHETIC_SINGLE_ROOM_STATES,
  actorClassSchema, addClaim, buildIntermediateAssessment, conversationEventSchema, deriveMissingInformation, deriveReadiness,
  evidenceReferenceSchema, findContradictions, getEffectiveClaims, intermediateAssessmentSchema, knowledgeClaimSchema,
  knowledgeStateSchema, readinessLevelSchema, supersedeClaim,
} from "@/lib/domain/conversation-intelligence";

const AT = "2026-08-06T12:00:00.000Z";
const clone = <T>(value: T): T => structuredClone(value);
const makeClaim = (overrides: Record<string, unknown> = {}) => ({
  ...clone(SYNTHETIC_SINGLE_ROOM_STATES.B.claims[3]),
  claim_id: "20000000-0000-4000-8000-000000000001",
  state_version: 2,
  evidence: [{ ...clone(SYNTHETIC_SINGLE_ROOM_STATES.B.claims[3].evidence[0]), evidence_id: "20000000-0000-4000-8000-000000000002" }],
  ...overrides,
});

describe("Conversation-Domain-Schemas", () => {
  it("hält Actors, Events, epistemische Status und Readiness geschlossen", () => {
    expect(ACTOR_CLASSES).toEqual(["customer", "admin", "reviewer", "system", "ai"]);
    expect(EVENT_TYPES).toHaveLength(6);
    expect(EPISTEMIC_STATUSES).toContain("requires_site_check");
    expect(READINESS_LEVELS).toHaveLength(6);
    expect(actorClassSchema.safeParse("human_user").success).toBe(false);
    expect(readinessLevelSchema.safeParse("level_6").success).toBe(false);
  });

  it("validiert schmale Evidence ohne Inhalte und weist Zusatzfelder, IDs und Zeiten ab", () => {
    const evidence = SYNTHETIC_SINGLE_ROOM_STATES.A.claims[0].evidence[0];
    expect(evidenceReferenceSchema.parse(evidence)).toEqual(evidence);
    expect(evidenceReferenceSchema.safeParse({ ...evidence, message_text: "nicht erlaubt" }).success).toBe(false);
    expect(evidenceReferenceSchema.safeParse({ ...evidence, evidence_id: "x" }).success).toBe(false);
    expect(evidenceReferenceSchema.safeParse({ ...evidence, observed_at: "gestern" }).success).toBe(false);
  });

  it("bindet Property, Entity und Werttyp streng", () => {
    expect(knowledgeClaimSchema.safeParse(makeClaim()).success).toBe(true);
    expect(knowledgeClaimSchema.safeParse(makeClaim({ value: "28", value_type: "string" })).success).toBe(false);
    expect(knowledgeClaimSchema.safeParse(makeClaim({ entity_type: "project" })).success).toBe(false);
    expect(knowledgeClaimSchema.safeParse(makeClaim({ extra: true })).success).toBe(false);
    expect(knowledgeClaimSchema.safeParse(makeClaim({ value: null, value_type: "unknown", epistemic_status: "unknown" })).success).toBe(true);
    expect(knowledgeClaimSchema.safeParse(makeClaim({ value: null, value_type: "unknown", epistemic_status: "not_applicable" })).success).toBe(true);
  });

  it.each(EVENT_TYPES)("validiert die enge Event-Payload für %s", (eventType) => {
    const payloads = {
      customer_message_received: { message_id: SYNTHETIC_IDS.room }, internal_note_added: { note_id: SYNTHETIC_IDS.room },
      knowledge_claim_recorded: { claim_id: SYNTHETIC_IDS.room, state_version: 1 }, knowledge_claim_superseded: { claim_id: SYNTHETIC_IDS.room, superseded_claim_id: SYNTHETIC_IDS.installation, state_version: 2 },
      assessment_created: { assessment_id: SYNTHETIC_IDS.room, based_on_state_version: 1 }, reviewer_correction_recorded: { correction_claim_id: SYNTHETIC_IDS.room, corrected_claim_id: SYNTHETIC_IDS.installation },
    } as const;
    const event = { event_id: SYNTHETIC_IDS.project, conversation_id: SYNTHETIC_IDS.conversation, project_id: SYNTHETIC_IDS.project, sequence: 1, occurred_at: AT, actor_class: eventType === "customer_message_received" ? "customer" : "system", event_type: eventType, payload: payloads[eventType] };
    expect(conversationEventSchema.safeParse(event).success).toBe(true);
    expect(conversationEventSchema.safeParse({ ...event, payload: { ...payloads[eventType], text: "frei" } }).success).toBe(false);
  });
});

describe("Knowledge State Regeln", () => {
  it("fügt unveränderlich hinzu, erhöht exakt und prüft Bindungen", () => {
    const before = clone(SYNTHETIC_SINGLE_ROOM_STATES.B);
    const result = addClaim(before, makeClaim(), AT);
    expect(result.success && result.data.state_version).toBe(2);
    expect(result.success && result.data.claims).toHaveLength(before.claims.length + 1);
    expect(before).toEqual(SYNTHETIC_SINGLE_ROOM_STATES.B);
    expect(addClaim(before, makeClaim({ claim_id: before.claims[0].claim_id }), AT)).toMatchObject({ success: false, code: "duplicate_claim_id" });
    expect(addClaim(before, makeClaim({ project_id: SYNTHETIC_IDS.conversation }), AT)).toMatchObject({ success: false, code: "project_mismatch" });
    expect(addClaim(before, makeClaim({ evidence: [] }), AT)).toMatchObject({ success: false, code: "invalid_evidence" });
  });

  it("supersediert append-only und lehnt falsche Bindung ab", () => {
    const state = SYNTHETIC_SINGLE_ROOM_STATES.B;
    const original = state.claims[3];
    const replacement = makeClaim({ supersedes_claim_id: original.claim_id, entity_type: original.entity_type, entity_id: original.entity_id, property_key: original.property_key, value: 30 });
    const result = supersedeClaim(state, original.claim_id, replacement, AT);
    expect(result.success && result.data.claims).toContainEqual(original);
    expect(result.success && getEffectiveClaims(result.data).some((item) => item.claim_id === original.claim_id)).toBe(false);
    expect(supersedeClaim(state, original.claim_id, { ...replacement, property_key: "room_height_m" }, AT)).toMatchObject({ success: false, code: "invalid_supersession" });
    expect(supersedeClaim(state, SYNTHETIC_IDS.installation, replacement, AT)).toMatchObject({ success: false, code: "claim_not_found" });
  });

  it("ignoriert invalidierte Evidenz, erhält manuelle Korrektur und erkennt Widersprüche", () => {
    const invalid = { ...makeClaim(), evidence: makeClaim().evidence.map((item: Record<string, unknown>) => ({ ...item, evidence_status: "invalidated" })) };
    const state = knowledgeStateSchema.parse({ ...SYNTHETIC_SINGLE_ROOM_STATES.B, claims: [...SYNTHETIC_SINGLE_ROOM_STATES.B.claims, invalid] });
    expect(getEffectiveClaims(state).some((item) => item.claim_id === invalid.claim_id)).toBe(false);
    expect(findContradictions(SYNTHETIC_SINGLE_ROOM_STATES.E)[0]).toMatchObject({ property_key: "room_area_sqm", diagnostic_code: "conflicting_numeric_values" });
    expect(findContradictions(SYNTHETIC_SINGLE_ROOM_STATES.B)).toEqual([]);
  });
});

describe("Missing Information, Readiness und Assessment", () => {
  it("bildet die synthetischen Stufen A bis D und niemals Level 5 ab", () => {
    const empty = knowledgeStateSchema.parse({ project_id: SYNTHETIC_IDS.project, conversation_id: SYNTHETIC_IDS.conversation, state_version: 1, claims: [], updated_at: AT });
    expect(deriveReadiness(empty).readiness_level).toBe("level_0_no_technical_scope");
    expect(deriveReadiness(SYNTHETIC_SINGLE_ROOM_STATES.A).readiness_level).toBe("level_1_rough_need");
    expect(deriveReadiness(SYNTHETIC_SINGLE_ROOM_STATES.B).readiness_level).toBe("level_2_preliminary_system");
    expect(deriveReadiness(SYNTHETIC_SINGLE_ROOM_STATES.C).readiness_level).toBe("level_3_preliminary_installation");
    expect(deriveReadiness(SYNTHETIC_SINGLE_ROOM_STATES.D).readiness_level).toBe("level_4_offer_draft_ready");
    expect(deriveReadiness(SYNTHETIC_SINGLE_ROOM_STATES.E).readiness_level).toBe("level_1_rough_need");
    expect(Object.values(SYNTHETIC_SINGLE_ROOM_STATES).map((state) => deriveReadiness(state).readiness_level)).not.toContain("level_5_human_approved");
  });

  it("liefert strukturierte Bedarfe statt Kundenfragen", () => {
    const missing = deriveMissingInformation(SYNTHETIC_SINGLE_ROOM_STATES.A);
    expect(missing.some((item) => item.reason_code === "required_for_sizing" && item.can_use_assumption)).toBe(true);
    expect(missing.some((item) => item.reason_code === "safety_relevant" && item.can_require_site_check)).toBe(true);
    expect(JSON.stringify(missing)).not.toMatch(/question|frage|text/iu);
  });

  it("trennt Angaben, Annahmen, Unknowns, Konflikte und Vor-Ort-Punkte", () => {
    const result = buildIntermediateAssessment(SYNTHETIC_SINGLE_ROOM_STATES.F, { assessment_id: "30000000-0000-4000-8000-000000000001", project_id: SYNTHETIC_IDS.project, conversation_id: SYNTHETIC_IDS.conversation, based_on_state_version: 1, created_at: AT, created_by_actor_class: "system" });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(intermediateAssessmentSchema.safeParse(result.data).success).toBe(true);
    expect(result.data.site_check_items).toContain("electrical_supply_known");
    expect(result.data.assumptions.length).toBeGreaterThan(0);
    expect(result.data.allowed_outputs).toContain("site_visit_recommended");
    expect(result.data.prohibited_outputs).toEqual(expect.arrayContaining(["fixed_price", "final_offer", "human_approval"]));
    expect(JSON.stringify(result.data)).not.toMatch(/hersteller|kilowatt|euro/iu);
  });

  it("bindet Assessments an Projekt, Conversation und State-Version", () => {
    const base = { assessment_id: SYNTHETIC_IDS.room, project_id: SYNTHETIC_IDS.project, conversation_id: SYNTHETIC_IDS.conversation, based_on_state_version: 2, created_at: AT, created_by_actor_class: "system" as const };
    expect(buildIntermediateAssessment(SYNTHETIC_SINGLE_ROOM_STATES.B, base)).toMatchObject({ success: false, code: "assessment_version_mismatch" });
  });
});

describe("AP-15-01 Architekturgrenze", () => {
  it("enthält ausschließlich pure Domainmodule ohne verbotene Laufzeitkopplung", () => {
    const directory = "lib/domain/conversation-intelligence";
    const files = readdirSync(directory).filter((file) => file.endsWith(".ts"));
    const source = files.map((file) => readFileSync(`${directory}/${file}`, "utf8")).join("\n");
    expect(source).not.toMatch(/from ["'](?:@supabase|openai|anthropic)|fetch\(|axios|process\.env|Date\.now|Math\.random|["']use (?:client|server)["']/u);
    expect(files.every((file) => !/route|action|service|component|\.sql$/u.test(file))).toBe(true);
  });
});
