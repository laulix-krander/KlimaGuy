import { interpretNormalizedAnswer } from "./answer-interpretation";
import { createSyntheticInterpretationContext, SYNTHETIC_INTERPRETATION_FIXTURES } from "./answer-interpretation-fixtures";
import type { StateTransitionProposal } from "./answer-interpretation-types";
import type { StateTransitionApplyContext } from "./state-transition-types";

const APPLIED_AT = "2026-08-06T16:05:00.000Z"; const APPLY_ID = "84000000-0000-4000-8000-000000000001";
const proposalFor = (context: ReturnType<typeof createSyntheticInterpretationContext>): StateTransitionProposal => { const result = interpretNormalizedAnswer(context); if (!result.success) throw new Error("synthetic_proposal_failed"); return result.proposal; };
const applyContext = (source: ReturnType<typeof createSyntheticInterpretationContext>, proposal = proposalFor(source)): StateTransitionApplyContext => ({ project_id: source.project_id, conversation_id: source.conversation_id, current_state: source.knowledge_state, proposal, applied_at: APPLIED_AT, apply_id: APPLY_ID, idempotency_status: "not_applied" });

const A = applyContext(SYNTHETIC_INTERPRETATION_FIXTURES.A); const B = applyContext(SYNTHETIC_INTERPRETATION_FIXTURES.B); const C = applyContext(SYNTHETIC_INTERPRETATION_FIXTURES.G);
const D = applyContext(SYNTHETIC_INTERPRETATION_FIXTURES.D); const E = applyContext(SYNTHETIC_INTERPRETATION_FIXTURES.E); const F = applyContext(SYNTHETIC_INTERPRETATION_FIXTURES.I);
const G = applyContext(SYNTHETIC_INTERPRETATION_FIXTURES.H); const H = applyContext(SYNTHETIC_INTERPRETATION_FIXTURES.J); const I = applyContext(SYNTHETIC_INTERPRETATION_FIXTURES.K);
const duplicateSource = SYNTHETIC_INTERPRETATION_FIXTURES.N; const J = applyContext(duplicateSource); const K = applyContext(SYNTHETIC_INTERPRETATION_FIXTURES.L); const L = applyContext(SYNTHETIC_INTERPRETATION_FIXTURES.M);
const correctionSource = SYNTHETIC_INTERPRETATION_FIXTURES.P; const M = applyContext(correctionSource); const N = applyContext(SYNTHETIC_INTERPRETATION_FIXTURES.O);
const reviewerState = createSyntheticInterpretationContext("roomArea", "exact", { value: 30, value_type: "number", epistemic_status: "confirmed", evidence: [{ evidence_id: "83000000-0000-4000-8000-000000000008", source_type: "reviewer_correction", source_id: "83000000-0000-4000-8000-000000000009", actor_class: "reviewer", observed_at: "2026-08-06T16:00:00.000Z", evidence_status: "manually_corrected" }] });
const O = applyContext(reviewerState, { ...M.proposal, project_id: reviewerState.project_id, conversation_id: reviewerState.conversation_id });
const P = { ...A, current_state: { ...A.current_state, state_version: 2 } }; const Q = { ...A, proposal: { ...A.proposal, proposed_state_version: 3 } };
const conflict = A.proposal.claim_proposals[0]; const R = { ...A, current_state: { ...A.current_state, claims: [{ claim_id: conflict.claim_id, project_id: conflict.project_id, entity_type: conflict.entity_type, entity_id: conflict.entity_id, property_key: conflict.property_key, value: conflict.value, value_type: conflict.value_type, epistemic_status: conflict.epistemic_status, evidence: conflict.evidence, created_at: APPLIED_AT, state_version: 1 }] } };
const S = { ...K, proposal: { ...K.proposal, superseded_claim_ids: ["85000000-0000-4000-8000-000000000001"], claim_proposals: K.proposal.claim_proposals.map((claim) => ({ ...claim, supersedes_claim_id: "85000000-0000-4000-8000-000000000001" })) } };
const T = { ...A, idempotency_status: "already_applied" as const }; const U = { ...A, proposal: { ...A.proposal, evidence_proposals: [{ ...A.proposal.evidence_proposals[0], evidence_id: "invalid" }] } };
const V = F;
export const SYNTHETIC_STATE_TRANSITION_APPLY_FIXTURES = Object.freeze({ A, B, C, D, E, F, G, H, I, J, K, L, M, N, O, P, Q, R, S, T, U, V });
