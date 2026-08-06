import { knowledgeClaimSchema, knowledgeStateSchema, type KnowledgeClaim, type KnowledgeState } from "./schemas";
import type { DomainResult, PropertyKey } from "./types";

const inactiveEvidence = new Set(["superseded", "invalidated"]);
const isEvidenceActive = (claim: KnowledgeClaim) => claim.evidence.some((item) => !inactiveEvidence.has(item.evidence_status));

export function getEffectiveClaims(state: KnowledgeState): readonly KnowledgeClaim[] {
  const supersededIds = new Set(state.claims.map((claim) => claim.supersedes_claim_id).filter((id): id is string => Boolean(id)));
  return state.claims.filter((claim) => !supersededIds.has(claim.claim_id) && isEvidenceActive(claim));
}

export function getEffectiveClaim(state: KnowledgeState, entityId: string, propertyKey: PropertyKey): KnowledgeClaim | undefined {
  return getEffectiveClaims(state).filter((claim) => claim.entity_id === entityId && claim.property_key === propertyKey).sort((a, b) => b.state_version - a.state_version)[0];
}

export function addClaim(stateInput: unknown, claimInput: unknown, updatedAt: string): DomainResult<KnowledgeState> {
  const state = knowledgeStateSchema.safeParse(stateInput);
  if (!state.success) return { success: false, code: "invalid_state_version" };
  if (!claimInput || typeof claimInput !== "object" || !("evidence" in claimInput) || !Array.isArray(claimInput.evidence) || claimInput.evidence.length === 0) return { success: false, code: "invalid_evidence" };
  const claim = knowledgeClaimSchema.safeParse(claimInput);
  if (!claim.success) return { success: false, code: "invalid_claim" };
  if (claim.data.project_id !== state.data.project_id) return { success: false, code: "project_mismatch" };
  if (state.data.claims.some((item) => item.claim_id === claim.data.claim_id)) return { success: false, code: "duplicate_claim_id" };
  if (claim.data.state_version !== state.data.state_version + 1) return { success: false, code: "invalid_state_version" };
  if (!claim.data.evidence.length) return { success: false, code: "invalid_evidence" };
  const next = knowledgeStateSchema.safeParse({ ...state.data, state_version: state.data.state_version + 1, claims: [...state.data.claims, claim.data], updated_at: updatedAt });
  return next.success ? { success: true, data: next.data } : { success: false, code: "invalid_state_version" };
}

export function supersedeClaim(stateInput: unknown, replacedClaimId: string, claimInput: unknown, updatedAt: string): DomainResult<KnowledgeState> {
  const state = knowledgeStateSchema.safeParse(stateInput);
  if (!state.success) return { success: false, code: "invalid_state_version" };
  const original = state.data.claims.find((claim) => claim.claim_id === replacedClaimId);
  if (!original) return { success: false, code: "claim_not_found" };
  const claim = knowledgeClaimSchema.safeParse(claimInput);
  if (!claim.success) return { success: false, code: "invalid_claim" };
  if (claim.data.project_id !== state.data.project_id) return { success: false, code: "project_mismatch" };
  if (claim.data.supersedes_claim_id !== original.claim_id || claim.data.entity_type !== original.entity_type || claim.data.entity_id !== original.entity_id || claim.data.property_key !== original.property_key) return { success: false, code: "invalid_supersession" };
  return addClaim(state.data, claim.data, updatedAt);
}

export function findContradictions(state: KnowledgeState) {
  const groups = new Map<string, KnowledgeClaim[]>();
  for (const claim of getEffectiveClaims(state)) {
    const key = `${claim.entity_type}:${claim.entity_id}:${claim.property_key}`;
    groups.set(key, [...(groups.get(key) ?? []), claim]);
  }
  return [...groups.values()].flatMap((claims) => {
    const meaningful = claims.filter((claim) => claim.epistemic_status !== "unknown" && claim.epistemic_status !== "not_applicable");
    if (meaningful.length < 2) return [];
    const values = new Set(meaningful.map((claim) => JSON.stringify(claim.value)));
    const statuses = new Set(meaningful.map((claim) => claim.epistemic_status));
    if (values.size < 2 && !statuses.has("contradicted")) return [];
    const first = meaningful[0];
    return [{ entity_type: first.entity_type, entity_id: first.entity_id, property_key: first.property_key, claim_ids: meaningful.map((claim) => claim.claim_id), diagnostic_code: meaningful.every((claim) => claim.value_type === "number") ? "conflicting_numeric_values" as const : values.size > 1 ? "conflicting_effective_claims" as const : "conflicting_statuses" as const }];
  });
}
