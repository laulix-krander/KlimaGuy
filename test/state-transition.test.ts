import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { STATE_TRANSITION_APPLY_ERROR_CODES, SYNTHETIC_STATE_TRANSITION_APPLY_FIXTURES as F, applyStateTransitionProposal, findContradictions, stateTransitionApplyContextSchema, stateTransitionApplyResultSchema } from "@/lib/domain/conversation-intelligence";

describe("AP-15-02-03-02 schemas and bindings", () => {
  it("validates strict context, result, UUID, timestamp and idempotency", () => {
    expect(stateTransitionApplyContextSchema.safeParse(F.A).success).toBe(true);
    expect(stateTransitionApplyContextSchema.safeParse({ ...F.A, extra: true }).success).toBe(false);
    expect(stateTransitionApplyContextSchema.safeParse({ ...F.A, apply_id: "bad" }).success).toBe(false);
    expect(stateTransitionApplyContextSchema.safeParse({ ...F.A, applied_at: "today" }).success).toBe(false);
    expect(stateTransitionApplyContextSchema.safeParse({ ...F.A, idempotency_status: "maybe" }).success).toBe(false);
    expect(stateTransitionApplyResultSchema.safeParse(applyStateTransitionProposal(F.A)).success).toBe(true);
    expect(new Set(STATE_TRANSITION_APPLY_ERROR_CODES).size).toBe(STATE_TRANSITION_APPLY_ERROR_CODES.length);
  });
  it("rejects project, conversation and exact CAS mismatches deterministically", () => {
    expect(applyStateTransitionProposal({ ...F.A, project_id: "86000000-0000-4000-8000-000000000001" })).toMatchObject({ success: false, code: "project_mismatch" });
    expect(applyStateTransitionProposal({ ...F.A, conversation_id: "86000000-0000-4000-8000-000000000002" })).toMatchObject({ success: false, code: "conversation_mismatch" });
    expect(applyStateTransitionProposal(F.P)).toEqual({ success: false, code: "state_version_mismatch", retryable: false, requires_replanning: true, requires_human_review: false });
    expect(applyStateTransitionProposal(F.Q)).toMatchObject({ success: false, code: "proposed_state_version_mismatch" });
  });
});

describe("state-changing application", () => {
  it("applies exact, approximate, boolean and unknown proposals without inventing data", () => {
    for (const fixture of [F.A, F.B, F.C]) { const result = applyStateTransitionProposal(fixture); expect(result).toMatchObject({ success: true, changed: true, code: "transition_applied", previous_state_version: 1, new_state_version: 2 }); if (result.success && result.changed) { const proposal = fixture.proposal.claim_proposals[0]; const applied = result.knowledge_state.claims.at(-1)!; expect(applied).toMatchObject({ claim_id: proposal.claim_id, property_key: proposal.property_key, value: proposal.value, epistemic_status: proposal.epistemic_status, evidence: proposal.evidence }); } }
    const unknown = applyStateTransitionProposal(F.C); if (unknown.success && unknown.changed) expect(unknown.knowledge_state.claims.at(-1)).toMatchObject({ value: null, value_type: "unknown", epistemic_status: "unknown" });
  });
  it("applies the confirmed assumption with both evidence references atomically", () => {
    const result = applyStateTransitionProposal(F.F); expect(result).toMatchObject({ success: true, changed: true, knowledge_state: { state_version: 2, claims: [expect.objectContaining({ epistemic_status: "assumed", evidence: expect.arrayContaining([expect.objectContaining({ source_type: "system_rule" }), expect.objectContaining({ source_type: "customer_message" })]) })] } });
    const invalid = structuredClone(F.F) as Record<string, unknown>; const proposal = invalid.proposal as { evidence_proposals: unknown[] }; proposal.evidence_proposals[0] = { ...(proposal.evidence_proposals[0] as object), evidence_id: "bad" };
    expect(applyStateTransitionProposal(invalid)).toMatchObject({ success: false, code: "evidence_proposal_invalid" }); expect(F.F.current_state.claims).toHaveLength(0);
  });
  it("keeps superseded originals, validates targets and protects reviewer corrections", () => {
    for (const fixture of [F.K, F.L, F.M]) { const result = applyStateTransitionProposal(fixture); expect(result).toMatchObject({ success: true, changed: true, superseded_claim_ids: [fixture.current_state.claims[0].claim_id] }); if (result.success) { expect(result.knowledge_state.claims).toHaveLength(2); expect(result.knowledge_state.claims[1].supersedes_claim_id).toBe(result.knowledge_state.claims[0].claim_id); } }
    expect(applyStateTransitionProposal(F.S)).toMatchObject({ success: false, code: "superseded_claim_not_found", requires_replanning: true });
    expect(applyStateTransitionProposal(F.O)).toEqual({ success: false, code: "reviewer_correction_protected", retryable: false, requires_replanning: false, requires_human_review: true });
  });
  it("preserves a real contradiction as parallel reported claims", () => {
    const result = applyStateTransitionProposal(F.N); expect(result).toMatchObject({ success: true, changed: true, superseded_claim_ids: [] }); if (!result.success) return;
    expect(result.knowledge_state.claims).toHaveLength(2); expect(result.knowledge_state.claims[1]).not.toHaveProperty("supersedes_claim_id"); expect(result.knowledge_state.claims[1].epistemic_status).toBe("reported"); expect(findContradictions(result.knowledge_state)).toHaveLength(1);
  });
});

describe("no-change, idempotency and immutability", () => {
  it("does not increment skip, rejected/deferred assumptions, duplicate or human review", () => {
    const humanReview = { ...F.G, proposal: { ...F.G.proposal, transition_type: "human_review_required" as const } };
    for (const fixture of [F.D, F.E, F.G, F.H, F.I, F.J, humanReview]) expect(applyStateTransitionProposal(fixture)).toMatchObject({ success: true, changed: false, code: "transition_no_change", previous_state_version: 1, new_state_version: 1, applied_claim_ids: [], superseded_claim_ids: [] });
  });
  it("returns already applied without a second claim or version", () => { expect(applyStateTransitionProposal(F.T)).toMatchObject({ success: true, changed: false, code: "transition_already_applied", knowledge_state: { state_version: 1, claims: [] } }); });
  it("rejects ID conflicts and leaves deeply frozen inputs unchanged", () => {
    expect(applyStateTransitionProposal(F.R)).toMatchObject({ success: false, code: "claim_id_conflict" });
    const input = structuredClone(F.A); const before = structuredClone(input); Object.freeze(input.current_state.claims); Object.freeze(input.current_state); Object.freeze(input.proposal.evidence_proposals); Object.freeze(input.proposal.claim_proposals); Object.freeze(input.proposal); Object.freeze(input);
    expect(applyStateTransitionProposal(input)).toMatchObject({ success: true, changed: true }); expect(input).toEqual(before);
  });
});

describe("architecture boundary", () => {
  it("contains only pure deterministic state application", () => {
    const directory = "lib/domain/conversation-intelligence"; const files = readdirSync(directory).filter((file) => file.startsWith("state-transition") && file.endsWith(".ts")); const source = files.map((file) => readFileSync(`${directory}/${file}`, "utf8")).join("\n");
    expect(source).not.toMatch(/from ["'](?:@supabase|openai|anthropic)|fetch\(|axios|process\.env|Date\.now|Math\.random|["']use (?:client|server)["']|revalidatePath|localStorage|sessionStorage|deriveMissingInformation|planNextAction|buildIntermediateAssessment|retry_state|conversation_event/u);
    expect(files.every((file) => !/route|action|service|component|\.sql$/u.test(file))).toBe(true);
  });
});
