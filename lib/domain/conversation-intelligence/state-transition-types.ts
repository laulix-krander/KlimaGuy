import type { StateTransitionProposal } from "./answer-interpretation-types";
import type { KnowledgeState } from "./schemas";

export const STATE_TRANSITION_IDEMPOTENCY_STATUSES = ["not_applied", "already_applied"] as const;
export const STATE_TRANSITION_APPLY_ERROR_CODES = ["invalid_apply_context", "project_mismatch", "conversation_mismatch", "state_version_mismatch", "proposed_state_version_mismatch", "invalid_transition_proposal", "invalid_transition_type", "claim_proposal_invalid", "evidence_proposal_invalid", "claim_id_conflict", "evidence_id_conflict", "claim_not_found", "superseded_claim_not_found", "supersession_mismatch", "duplicate_transition", "transition_already_applied", "reviewer_correction_protected", "contradiction_application_invalid", "unexpected_state_change", "transition_apply_failed"] as const;

export type StateTransitionApplyErrorCode = typeof STATE_TRANSITION_APPLY_ERROR_CODES[number];
export type StateTransitionIdempotencyStatus = typeof STATE_TRANSITION_IDEMPOTENCY_STATUSES[number];
export type StateTransitionApplyContext = Readonly<{ project_id: string; conversation_id: string; current_state: KnowledgeState; proposal: StateTransitionProposal; applied_at: string; apply_id: string; idempotency_status?: StateTransitionIdempotencyStatus }>;
type ApplyMetadata = Readonly<{ apply_id: string; transition_id: string; interpretation_id: string; idempotency_key: string; previous_state_version: number; new_state_version: number; applied_transition_type: StateTransitionProposal["transition_type"]; applied_claim_ids: readonly string[]; superseded_claim_ids: readonly string[] }>;
export type StateTransitionApplySuccess = ApplyMetadata & Readonly<{ success: true; changed: true; code: "transition_applied"; knowledge_state: KnowledgeState }> | ApplyMetadata & Readonly<{ success: true; changed: false; code: "transition_no_change" | "transition_already_applied"; knowledge_state: KnowledgeState; applied_claim_ids: readonly []; superseded_claim_ids: readonly [] }>;
export type StateTransitionApplyFailure = Readonly<{ success: false; code: StateTransitionApplyErrorCode; retryable: boolean; requires_replanning: boolean; requires_human_review: boolean }>;
export type StateTransitionApplyResult = StateTransitionApplySuccess | StateTransitionApplyFailure;
