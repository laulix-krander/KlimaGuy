import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ANSWER_INTERPRETATION_REGISTRY, ASSUMPTION_VALUE_REGISTRY, SYNTHETIC_INTERPRETATION_FIXTURES as F, createInterpretationIdempotencyKey, createSyntheticInterpretationContext, deriveMissingInformation, evidenceProposalSchema, interpretationContextSchema, interpretationResultSchema, interpretNormalizedAnswer, knowledgeClaimProposalSchema, mappingRuleSchema, stateTransitionProposalSchema, validateAnswerInterpretationRegistry } from "@/lib/domain/conversation-intelligence";

const run = (context: unknown) => interpretNormalizedAnswer(context);
const claim = (result: ReturnType<typeof run>) => result.success ? result.proposal.claim_proposals[0] : undefined;
describe("AP-15-02-03-01 schemas and registry", () => {
  it("validates strict proposal contracts and closed fields", () => {
    expect(interpretationContextSchema.safeParse(F.A).success).toBe(true); expect(mappingRuleSchema.safeParse(ANSWER_INTERPRETATION_REGISTRY[0]).success).toBe(true);
    const result = run(F.A); expect(interpretationResultSchema.safeParse(result).success).toBe(true); if (!result.success) return;
    expect(stateTransitionProposalSchema.safeParse(result.proposal).success).toBe(true); expect(evidenceProposalSchema.safeParse(result.proposal.evidence_proposals[0]).success).toBe(true); expect(knowledgeClaimProposalSchema.safeParse(result.proposal.claim_proposals[0]).success).toBe(true);
    expect(interpretationContextSchema.safeParse({ ...F.A, extra: true }).success).toBe(false); expect(interpretationContextSchema.safeParse({ ...F.A, source_message_id: "bad" }).success).toBe(false); expect(interpretationContextSchema.safeParse({ ...F.A, correction_context: "reviewer" }).success).toBe(false);
  });
  it("is unique, explicit and deeply immutable with explicit semantic rules", () => {
    expect(validateAnswerInterpretationRegistry(ANSWER_INTERPRETATION_REGISTRY)).toBe(true); expect(Object.isFrozen(ANSWER_INTERPRETATION_REGISTRY)).toBe(true); expect(Object.isFrozen(ANSWER_INTERPRETATION_REGISTRY[0])).toBe(true);
    expect(ANSWER_INTERPRETATION_REGISTRY).toEqual(expect.arrayContaining([expect.objectContaining({ information_key: "room_area_sqm", entity_type: "room", property_key: "room_area_sqm" }), expect.objectContaining({ information_key: "outdoor_unit_position_known", entity_type: "installation" }), expect.objectContaining({ information_key: "room_type", status: "active", semantic_mode: "technical_property" })]));
    expect(ASSUMPTION_VALUE_REGISTRY.rough_room_area_for_level_2.value).toBe(25);
  });
});

describe("answer interpretation mapping", () => {
  it("preserves exact and approximate numbers without range averaging", () => {
    expect(claim(run(F.A))).toMatchObject({ value: 25, value_type: "number", epistemic_status: "reported", approximation: "exact" });
    expect(claim(run(F.B))).toMatchObject({ value: 25, epistemic_status: "reported", approximation: "approximate" });
    expect(run(F.C)).toEqual({ success: false, code: "numeric_range_not_supported", retryable: false, requires_replanning: true, requires_human_review: false, causes_state_change: false });
  });
  it("does not generically map customer-knowledge booleans", () => {
    expect(run(F.D)).toMatchObject({success:true,proposal:{semantic_result_type:"collection_update_only",claim_proposals:[],collection_outcome:{answer_meaning:"customer_can_provide"}}}); expect(run(F.E)).toMatchObject({success:true,proposal:{semantic_result_type:"collection_update_only",claim_proposals:[],collection_outcome:{answer_meaning:"customer_does_not_know"}}});
  });
  it("defers text, records unknown and skips without a property claim", () => {
    expect(run(F.F)).toMatchObject({ success: false, code: "unsupported_text_mapping", requires_human_review: false, requires_replanning: true });
    expect(claim(run(F.G))).toMatchObject({ value: null, value_type: "unknown", epistemic_status: "unknown", evidence: [expect.objectContaining({ source_type: "customer_message", actor_class: "customer" })] });
    const missing = deriveMissingInformation({ ...F.G.knowledge_state, claims: [claim(run(F.G)) as never] }); expect(missing.some((item) => item.information_key === "room_area_sqm")).toBe(true);
    expect(run(F.H)).toMatchObject({ success: true, proposal: { transition_type: "skip_recorded", retry_outcome: "skipped", claim_proposals: [], evidence_proposals: [], explanation_codes: ["mapping_rule_applied", "skip_without_property_claim"] } });
  });
  it("uses only the server assumption and adds system plus customer evidence", () => {
    expect(run(F.I)).toMatchObject({ success: true, proposal: { transition_type: "assumption_confirmed", retry_outcome: "answered", evidence_proposals: [{ source_type: "system_rule" }, { source_type: "customer_message" }], claim_proposals: [{ value: 25, epistemic_status: "assumed" }] } });
    expect(run(F.J)).toMatchObject({ success: true, proposal: { transition_type: "assumption_rejected", claim_proposals: [] } }); expect(run(F.K)).toMatchObject({ success: true, proposal: { transition_type: "assumption_deferred", retry_outcome: "skipped", claim_proposals: [] } });
  });
});

describe("contradiction, supersession and idempotency", () => {
  it("supersedes unknown and assumed, leaving the input unchanged", () => {
    for (const epistemic_status of ["unknown", "assumed"] as const) { const existing = epistemic_status === "unknown" ? { value: null, value_type: "unknown" as const, epistemic_status } : { value: 20, value_type: "number" as const, epistemic_status }; const context = createSyntheticInterpretationContext("roomArea", "exact", existing); const before = structuredClone(context); expect(run(context)).toMatchObject({ success: true, proposal: { transition_type: "claim_supersession_proposed", superseded_claim_ids: ["83000000-0000-4000-8000-000000000007"] } }); expect(context).toEqual(before); }
  });
  it("returns no change for duplicates, preserves normal contradictions and applies explicit corrections", () => {
    expect(run(createSyntheticInterpretationContext("roomArea", "exact", { value: 25, value_type: "number", epistemic_status: "reported" }))).toMatchObject({ success: true, code: "idempotent_success", proposal: { transition_type: "duplicate_no_change", proposed_state_version: 1, claim_proposals: [] } });
    expect(run(createSyntheticInterpretationContext("roomArea", "exact", { value: 30, value_type: "number", epistemic_status: "reported" }))).toMatchObject({ success: true, proposal: { transition_type: "contradiction_recorded", superseded_claim_ids: [], explanation_codes: expect.arrayContaining(["contradiction_preserved"]) } });
    expect(run(createSyntheticInterpretationContext("roomArea", "exact", { value: 30, value_type: "number", epistemic_status: "reported" }, "explicit_customer_correction"))).toMatchObject({ success: true, proposal: { transition_type: "claim_supersession_proposed", explanation_codes: expect.arrayContaining(["explicit_correction_applied"]) } });
  });
  it("protects reviewer corrections and fails closed on stale state and applied answers", () => {
    const reviewer = createSyntheticInterpretationContext("roomArea", "exact", { value: 30, value_type: "number", epistemic_status: "confirmed", evidence: [{ evidence_id: "83000000-0000-4000-8000-000000000008", source_type: "reviewer_correction", source_id: "83000000-0000-4000-8000-000000000009", actor_class: "reviewer", observed_at: "2026-08-06T16:00:00.000Z", evidence_status: "manually_corrected" }] }); expect(run(reviewer)).toMatchObject({ success: false, code: "reviewer_correction_protected", requires_human_review: true });
    expect(run({ ...F.A, current_state_version: 2 })).toMatchObject({ success: false, code: "state_version_mismatch", requires_replanning: true });
    expect(run({ ...F.A, application_status: "mapping_already_applied" })).toMatchObject({ success: false, code: "mapping_already_applied" });
    expect(createInterpretationIdempotencyKey(F.A.conversation_id, F.A.selected_action.decision_id, F.A.normalized_answer.answer_id)).toBe(F.A.idempotency_key);
  });
});

describe("architecture boundary", () => {
  it("contains only deterministic proposal logic", () => {
    const files = readdirSync("lib/domain/conversation-intelligence").filter((file) => file.startsWith("answer-interpretation") && file.endsWith(".ts")); const source = files.map((file) => readFileSync(`lib/domain/conversation-intelligence/${file}`, "utf8")).join("\n");
    expect(source).not.toMatch(/from ["'](?:@supabase|openai|anthropic)|fetch\(|axios|process\.env|Date\.now|Math\.random|["']use (?:client|server)["']|revalidatePath|localStorage|sessionStorage|addClaim\(|supersedeClaim\(/u); expect(files.every((file) => !/route|action|service|component|\.sql$/u.test(file))).toBe(true);
  });
});
