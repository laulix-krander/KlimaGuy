import { evidenceProposalSchema, knowledgeClaimProposalSchema, stateTransitionProposalSchema } from "./answer-interpretation-schemas";
import { TRANSITION_TYPES, type StateTransitionProposal } from "./answer-interpretation-types";
import { addClaim, findContradictions, supersedeClaim } from "./knowledge-state";
import { knowledgeStateSchema, type KnowledgeClaim, type KnowledgeState } from "./schemas";
import { stateTransitionApplyContextSchema, stateTransitionApplyResultSchema } from "./state-transition-schemas";
import type { StateTransitionApplyContext, StateTransitionApplyErrorCode, StateTransitionApplyFailure, StateTransitionApplyResult } from "./state-transition-types";

const NO_CHANGE = new Set<StateTransitionProposal["transition_type"]>(["skip_recorded", "assumption_rejected", "assumption_deferred", "duplicate_no_change", "human_review_required"]);
const FAILURE_FLAGS: Readonly<Record<StateTransitionApplyErrorCode, readonly [boolean, boolean, boolean]>> = {
  invalid_apply_context: [false, false, false], project_mismatch: [false, false, false], conversation_mismatch: [false, false, false], state_version_mismatch: [false, true, false], proposed_state_version_mismatch: [false, true, false], invalid_transition_proposal: [false, false, true], invalid_transition_type: [false, false, true], claim_proposal_invalid: [false, false, true], evidence_proposal_invalid: [false, false, true], claim_id_conflict: [false, false, true], evidence_id_conflict: [false, false, true], claim_not_found: [false, true, false], superseded_claim_not_found: [false, true, false], supersession_mismatch: [false, false, true], duplicate_transition: [false, false, true], transition_already_applied: [false, false, false], reviewer_correction_protected: [false, false, true], contradiction_application_invalid: [false, false, true], unexpected_state_change: [false, true, true], transition_apply_failed: [true, false, true],
};
const failure = (code: StateTransitionApplyErrorCode): StateTransitionApplyFailure => { const [retryable, requires_replanning, requires_human_review] = FAILURE_FLAGS[code]; return { success: false, code, retryable, requires_replanning, requires_human_review }; };
const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);

function invalidInput(input: unknown): StateTransitionApplyFailure {
  if (!isRecord(input) || !isRecord(input.proposal)) return failure("invalid_apply_context");
  const proposal = input.proposal;
  if (typeof proposal.transition_type !== "string" || !(TRANSITION_TYPES as readonly string[]).includes(proposal.transition_type)) return failure("invalid_transition_type");
  if (Array.isArray(proposal.evidence_proposals) && proposal.evidence_proposals.some((item) => !evidenceProposalSchema.safeParse(item).success)) return failure("evidence_proposal_invalid");
  if (Array.isArray(proposal.claim_proposals)) {
    for (const item of proposal.claim_proposals) {
      if (isRecord(item) && Array.isArray(item.evidence) && item.evidence.some((evidence) => !evidenceProposalSchema.safeParse(evidence).success)) return failure("evidence_proposal_invalid");
      if (!knowledgeClaimProposalSchema.safeParse(item).success) return failure("claim_proposal_invalid");
    }
  }
  if (!stateTransitionProposalSchema.safeParse(proposal).success) return failure("invalid_transition_proposal");
  return failure("invalid_apply_context");
}

const sameEvidence = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right);
const toClaim = (proposal: StateTransitionProposal["claim_proposals"][number], createdAt: string): KnowledgeClaim => ({ claim_id: proposal.claim_id, project_id: proposal.project_id, entity_type: proposal.entity_type, entity_id: proposal.entity_id, property_key: proposal.property_key, value: proposal.value, value_type: proposal.value_type, epistemic_status: proposal.epistemic_status, evidence: proposal.evidence.map((item) => ({ ...item })), created_at: createdAt, state_version: proposal.proposed_state_version, ...(proposal.supersedes_claim_id ? { supersedes_claim_id: proposal.supersedes_claim_id } : {}) } as KnowledgeClaim);

export function applyStateTransitionProposal(input: unknown): StateTransitionApplyResult {
  const parsed = stateTransitionApplyContextSchema.safeParse(input);
  if (!parsed.success) {
    if (isRecord(input) && isRecord(input.current_state) && isRecord(input.proposal)) {
      const state = knowledgeStateSchema.safeParse(input.current_state); const proposal = input.proposal;
      if (state.success) {
        if (typeof input.project_id === "string" && (input.project_id !== state.data.project_id || proposal.project_id !== input.project_id)) return failure("project_mismatch");
        if (typeof input.conversation_id === "string" && (input.conversation_id !== state.data.conversation_id || proposal.conversation_id !== input.conversation_id)) return failure("conversation_mismatch");
        if (typeof proposal.based_on_state_version === "number" && proposal.based_on_state_version !== state.data.state_version) return failure("state_version_mismatch");
        if (typeof proposal.transition_type === "string" && (TRANSITION_TYPES as readonly string[]).includes(proposal.transition_type) && typeof proposal.proposed_state_version === "number") {
          const changes = Array.isArray(proposal.claim_proposals) ? proposal.claim_proposals.length > 0 : !NO_CHANGE.has(proposal.transition_type as StateTransitionProposal["transition_type"]);
          if (proposal.proposed_state_version !== state.data.state_version + (changes ? 1 : 0)) return failure("proposed_state_version_mismatch");
        }
      }
    }
    return invalidInput(input);
  }
  const context = parsed.data as StateTransitionApplyContext; const { current_state: state, proposal } = context;
  if (context.project_id !== state.project_id || proposal.project_id !== context.project_id || proposal.claim_proposals.some((claim) => claim.project_id !== context.project_id)) return failure("project_mismatch");
  if (context.conversation_id !== state.conversation_id || proposal.conversation_id !== context.conversation_id) return failure("conversation_mismatch");
  const metadata = { apply_id: context.apply_id, transition_id: proposal.transition_id, interpretation_id: proposal.interpretation_id, idempotency_key: proposal.idempotency_key, previous_state_version: state.state_version, applied_transition_type: proposal.transition_type } as const;
  if (context.idempotency_status === "already_applied") return stateTransitionApplyResultSchema.parse({ success: true, changed: false, code: "transition_already_applied", ...metadata, new_state_version: state.state_version, knowledge_state: state, applied_claim_ids: [], superseded_claim_ids: [] }) as StateTransitionApplyResult;
  if (proposal.based_on_state_version !== state.state_version) return failure("state_version_mismatch");
  const changes = proposal.claim_proposals.length > 0;
  if (proposal.proposed_state_version !== state.state_version + (changes ? 1 : 0)) return failure("proposed_state_version_mismatch");
  if (!changes) {
    if (proposal.claim_proposals.length || proposal.evidence_proposals.length || proposal.superseded_claim_ids.length) return failure("unexpected_state_change");
    return stateTransitionApplyResultSchema.parse({ success: true, changed: false, code: "transition_no_change", ...metadata, new_state_version: state.state_version, knowledge_state: state, applied_claim_ids: [], superseded_claim_ids: [] }) as StateTransitionApplyResult;
  }
  if (!proposal.claim_proposals.length) return failure("invalid_transition_proposal");
  const claimIds = proposal.claim_proposals.map((claim) => claim.claim_id); if (new Set(claimIds).size !== claimIds.length) return failure("duplicate_transition");
  if (claimIds.some((id) => state.claims.some((claim) => claim.claim_id === id))) return failure("claim_id_conflict");
  const evidence = proposal.claim_proposals.flatMap((claim) => [...claim.evidence]); const evidenceIds = evidence.map((item) => item.evidence_id);
  if (new Set(evidenceIds).size !== evidenceIds.length || evidenceIds.some((id) => state.claims.some((claim) => claim.evidence.some((item) => item.evidence_id === id)))) return failure("evidence_id_conflict");
  if (!sameEvidence(evidence, proposal.evidence_proposals)) return failure("evidence_proposal_invalid");
  if (proposal.claim_proposals.some((claim) => claim.based_on_state_version !== state.state_version || claim.proposed_state_version !== proposal.proposed_state_version)) return failure("claim_proposal_invalid");
  if (proposal.transition_type === "unknown_recorded" && proposal.claim_proposals.some((claim) => claim.value !== null || claim.value_type !== "unknown" || claim.epistemic_status !== "unknown" || claim.evidence.some((item) => item.actor_class !== "customer"))) return failure("claim_proposal_invalid");
  if (proposal.transition_type === "assumption_confirmed" && proposal.claim_proposals.some((claim) => claim.epistemic_status !== "assumed")) return failure("claim_proposal_invalid");
  const supersession = proposal.transition_type === "claim_supersession_proposed";
  if (supersession && (proposal.superseded_claim_ids.length !== proposal.claim_proposals.length || proposal.claim_proposals.some((claim) => !claim.supersedes_claim_id || !proposal.superseded_claim_ids.includes(claim.supersedes_claim_id)))) return failure("supersession_mismatch");
  if (!supersession && (proposal.superseded_claim_ids.length || proposal.claim_proposals.some((claim) => claim.supersedes_claim_id))) return failure("supersession_mismatch");
  for (const id of proposal.superseded_claim_ids) {
    const original = state.claims.find((claim) => claim.claim_id === id); if (!original) return failure("superseded_claim_not_found");
    if (original.evidence.some((item) => item.actor_class === "reviewer" || item.evidence_status === "manually_corrected")) return failure("reviewer_correction_protected");
  }
  let next: KnowledgeState;
  if (proposal.claim_proposals.length === 1) {
    const claimProposal = proposal.claim_proposals[0]; const claim = toClaim(claimProposal, context.applied_at);
    const result = claimProposal.supersedes_claim_id ? supersedeClaim(state, claimProposal.supersedes_claim_id, claim, context.applied_at) : addClaim(state, claim, context.applied_at);
    if (!result.success) return failure(result.code === "claim_not_found" ? "claim_not_found" : result.code === "invalid_supersession" ? "supersession_mismatch" : "transition_apply_failed");
    next = result.data;
  } else {
    const atomic = knowledgeStateSchema.safeParse({ ...state, state_version: proposal.proposed_state_version, claims: [...state.claims, ...proposal.claim_proposals.map((claim) => toClaim(claim, context.applied_at))], updated_at: context.applied_at });
    if (!atomic.success) return failure("transition_apply_failed"); next = atomic.data;
  }
  if (next.state_version !== proposal.proposed_state_version) return failure("unexpected_state_change");
  const validated = knowledgeStateSchema.safeParse(next); if (!validated.success) return failure("unexpected_state_change");
  if (proposal.transition_type === "contradiction_recorded" && !findContradictions(validated.data).some((item) => claimIds.some((id) => item.claim_ids.includes(id)))) return failure("contradiction_application_invalid");
  return stateTransitionApplyResultSchema.parse({ success: true, changed: true, code: "transition_applied", ...metadata, new_state_version: validated.data.state_version, knowledge_state: validated.data, applied_claim_ids: claimIds, superseded_claim_ids: proposal.superseded_claim_ids }) as StateTransitionApplyResult;
}
