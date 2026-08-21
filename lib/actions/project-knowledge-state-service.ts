import { applyStateTransitionProposal } from "@/lib/domain/conversation-intelligence/state-transition";
import { getEffectiveClaims } from "@/lib/domain/conversation-intelligence/knowledge-state";
import { stateTransitionProposalSchema } from "@/lib/domain/conversation-intelligence/answer-interpretation-schemas";
import { roleSchema } from "@/lib/domain/schemas";
import { canApplyReviewedEvidenceClaim } from "@/lib/domain/permissions";
import { applyReviewedClaimInputSchema, isDescriptiveApplyProperty, knowledgeApplyResultDtoSchema, knowledgeStateHeaderRowSchema, materializePersistentKnowledgeState, persistentClaimRowSchema, toProjectKnowledgeStateDto, type ProjectKnowledgeStateDto } from "@/lib/domain/conversation-intelligence/persistent-knowledge-state";

type Result<T> = Promise<{ data: T | null; error: unknown }>;
type ApplyAuthority = { project_id: string; proposal: { id: string; revision: number; status: string; entity_id: string; entity_type: "room" | "installation"; property_key: string; value_boolean: boolean; value_type: string; epistemic_status: string; knowledge_strength: string }; review: { id: string; action: string; actor_class: string }; evidence: { reference_id: string; evidence_id: string; actor_class: "admin" | "reviewer" | "ai"; observed_at: string; status: string } };
export type ProjectKnowledgeDataSource = {
  auth: { getUser(): Promise<{ data: { user: { id: string } | null } }> };
  getProfile(id: string): Result<{ role: string | null }>;
  getHeader(projectId: string): Result<unknown>;
  getClaimHistory(projectId: string): Result<unknown[]>;
  getApplyAuthority(proposalId: string): Result<ApplyAuthority>;
  apply(input: { proposal_id: string; expected_proposal_revision: number; expected_state_version: number }): Result<unknown>;
};
type FailureCode = "invalid_input" | "not_authenticated" | "unauthorized" | "proposal_not_applyable" | "stale_state" | "reviewer_protection" | "persistence_failed";
type Failure = { success: false; code: FailureCode; retryable: boolean; requires_replan: boolean; requires_review: boolean };
const failure = (code: FailureCode): Failure => ({ success: false, code, retryable: code === "persistence_failed", requires_replan: code === "stale_state", requires_review: code === "reviewer_protection" });
async function authorize(source: ProjectKnowledgeDataSource) { const user = (await source.auth.getUser()).data.user; if (!user) return { user: null, denied: failure("not_authenticated") }; const role = roleSchema.safeParse((await source.getProfile(user.id)).data?.role); return { user, denied: role.success && canApplyReviewedEvidenceClaim(role.data) ? null : failure("unauthorized") }; }

export async function readCurrentProjectKnowledgeState(source: ProjectKnowledgeDataSource, projectId: string): Promise<{ success: true; data: ProjectKnowledgeStateDto | null } | Failure> {
  if (!applyReviewedClaimInputSchema.shape.proposal_id.safeParse(projectId).success) return failure("invalid_input");
  const auth = await authorize(source); if (auth.denied) return auth.denied;
  const [header, history] = await Promise.all([source.getHeader(projectId), source.getClaimHistory(projectId)]);
  if (header.error || history.error) return failure("persistence_failed"); if (!header.data) return { success: true, data: null };
  const parsedHeader = knowledgeStateHeaderRowSchema.safeParse(header.data); const parsedRows = history.data?.map(row => persistentClaimRowSchema.safeParse(row));
  if (!parsedHeader.success || !parsedRows || parsedRows.some(row => !row.success)) return failure("persistence_failed");
  const state = materializePersistentKnowledgeState(parsedHeader.data, parsedRows.flatMap(row => row.success ? [row.data] : []), projectId);
  return { success: true, data: toProjectKnowledgeStateDto(state, parsedHeader.data.schema_version) };
}

/** Explicit apply boundary: the client supplies only identities/CAS; all claim authority is loaded server-side. */
export async function applyReviewedDescriptiveClaim(source: ProjectKnowledgeDataSource, input: unknown) {
  const parsed = applyReviewedClaimInputSchema.safeParse(input); if (!parsed.success) return failure("invalid_input");
  const auth = await authorize(source); if (auth.denied) return auth.denied;
  const authorityResult = await source.getApplyAuthority(parsed.data.proposal_id); const authority = authorityResult.data;
  if (authorityResult.error || !authority || authority.proposal.status !== "approved_apply_pending" || authority.proposal.revision !== parsed.data.expected_proposal_revision || authority.review.action !== "approve" || authority.review.actor_class !== "admin" || !isDescriptiveApplyProperty(authority.proposal.property_key)) return failure("proposal_not_applyable");
  const [headerResult, rowsResult] = await Promise.all([source.getHeader(authority.project_id), source.getClaimHistory(authority.project_id)]);
  if (headerResult.error || rowsResult.error) return failure("persistence_failed");
  const now = new Date().toISOString(); const transientConversationId = authority.project_id;
  const header = headerResult.data ?? { id: crypto.randomUUID(), project_id: authority.project_id, current_version: 1, schema_version: 1, updated_at: now };
  let state; try { state = materializePersistentKnowledgeState(header, rowsResult.data ?? [], transientConversationId); } catch { return failure("persistence_failed"); }
  if (state.state_version !== parsed.data.expected_state_version) return failure("stale_state");
  const existing = getEffectiveClaims(state).filter(item => item.entity_type === authority.proposal.entity_type && item.entity_id === authority.proposal.entity_id && item.property_key === authority.proposal.property_key);
  if (existing.some(item => !(item.value_type === "boolean" && item.value === true && item.epistemic_status === "observed" && item.knowledge_strength === "descriptive_fact"))) return failure("reviewer_protection");
  const claimId = crypto.randomUUID(), evidenceReferenceId = crypto.randomUUID(), transitionId = crypto.randomUUID();
  const evidence = { evidence_id: evidenceReferenceId, source_type: "project_media", source_id: authority.evidence.evidence_id, actor_class: authority.evidence.actor_class, observed_at: authority.evidence.observed_at, evidence_status: "active" } as const;
  const claim = { claim_id: claimId, project_id: authority.project_id, entity_type: authority.proposal.entity_type, entity_id: authority.proposal.entity_id, property_key: authority.proposal.property_key, value: true, value_type: "boolean", epistemic_status: "observed", knowledge_strength: "descriptive_fact", evidence: [evidence], based_on_state_version: state.state_version, proposed_state_version: state.state_version + 1, proposal_reason_codes: [] };
  const proposal = stateTransitionProposalSchema.safeParse({ transition_id: transitionId, interpretation_id: authority.proposal.id, idempotency_key: `server-preflight:${authority.proposal.id}:${authority.proposal.revision}:${authority.review.id}:${state.state_version}`, project_id: authority.project_id, conversation_id: transientConversationId, based_on_state_version: state.state_version, proposed_state_version: state.state_version + 1, answer_id: authority.proposal.id, transition_origin: "descriptive_claim_review", information_key: authority.proposal.property_key, evidence_proposals: [evidence], claim_proposals: [claim], superseded_claim_ids: [], retry_outcome: "answered", explanation_codes: [], created_at: now, semantic_result_type: "descriptive_transition", transition_type: "claim_created" });
  if (!proposal.success) return failure("proposal_not_applyable");
  const engine = applyStateTransitionProposal({ project_id: authority.project_id, conversation_id: transientConversationId, current_state: state, proposal: proposal.data, applied_at: now, apply_id: crypto.randomUUID() });
  if (!engine.success) return failure(engine.code === "reviewer_correction_protected" ? "reviewer_protection" : "proposal_not_applyable");
  const persisted = await source.apply(parsed.data); if (persisted.error) return failure("persistence_failed");
  if (persisted.data && typeof persisted.data === "object" && "success" in persisted.data && persisted.data.success === false && "code" in persisted.data) {
    const code = persisted.data.code;
    return failure(code === "stale_state" ? "stale_state" : code === "reviewer_protection" || code === "contradiction_requires_review" ? "reviewer_protection" : code === "unauthorized" ? "unauthorized" : code === "proposal_not_applyable" ? "proposal_not_applyable" : "persistence_failed");
  }
  const dto = knowledgeApplyResultDtoSchema.safeParse(persisted.data);
  return dto.success ? { success: true as const, data: dto.data } : failure("persistence_failed");
}
