import { z } from "zod";
import { knowledgeClaimProposalSchema, stateTransitionProposalSchema } from "./answer-interpretation-schemas";
import type { KnowledgeClaimProposal, StateTransitionProposal } from "./answer-interpretation-types";
import { getEffectiveClaims } from "./knowledge-state";
import { knowledgeStateSchema, type KnowledgeState } from "./schemas";
import { applyStateTransitionProposal } from "./state-transition";
import { validateClaimStrengthForProperty } from "./property-strength-registry";

export const DESCRIPTIVE_REVIEW_PROPERTIES = [
  "room_overview_context_observed",
  "indoor_installation_area_observed",
  "outdoor_installation_area_observed",
  "line_route_context_observed",
  "wall_penetration_context_observed",
] as const;
export const DESCRIPTIVE_REVIEW_ACTIONS = ["approve", "reject", "mark_evidence_insufficient"] as const;
export const DESCRIPTIVE_REVIEW_RESULTS = ["approved", "rejected", "insufficient_evidence", "no_change", "already_applied", "conflict_detected", "stale_state", "invalid_review_context", "review_not_allowed", "apply_failed"] as const;

const uuid = z.string().uuid();
const timestamp = z.string().datetime({ offset: true });
export const descriptiveClaimReviewCommandSchema = z.object({
  project_id: uuid,
  conversation_id: uuid,
  proposal_id: uuid,
  expected_knowledge_state_version: z.number().int().positive(),
  review_action: z.enum(DESCRIPTIVE_REVIEW_ACTIONS),
  review_actor_class: z.literal("admin"),
  review_actor_id: uuid,
  reviewed_at: timestamp,
}).strict();
export const descriptiveClaimReviewEntrySchema = z.object({
  proposal_id: uuid,
  proposal_fingerprint: z.string().regex(/^descriptive-v1:[0-9a-f]{8}$/),
  property_key: z.enum(DESCRIPTIVE_REVIEW_PROPERTIES),
  review_action: z.enum(DESCRIPTIVE_REVIEW_ACTIONS),
  review_actor_class: z.literal("admin"),
  review_actor_id: uuid,
  reviewed_at: timestamp,
  result_code: z.enum(DESCRIPTIVE_REVIEW_RESULTS),
}).strict();
export const descriptiveClaimReviewStateSchema = z.object({
  project_id: uuid,
  conversation_id: uuid,
  revision: z.number().int().nonnegative(),
  entries: z.array(descriptiveClaimReviewEntrySchema).readonly(),
}).strict();

export type DescriptiveClaimReviewCommand = Readonly<z.infer<typeof descriptiveClaimReviewCommandSchema>>;
export type DescriptiveClaimReviewAction = typeof DESCRIPTIVE_REVIEW_ACTIONS[number];
export type DescriptiveClaimReviewEntry = Readonly<z.infer<typeof descriptiveClaimReviewEntrySchema>>;
export type DescriptiveClaimReviewState = Readonly<z.infer<typeof descriptiveClaimReviewStateSchema>>;
export type DescriptiveClaimReviewResultCode = typeof DESCRIPTIVE_REVIEW_RESULTS[number];
export type DescriptiveClaimReviewResult = Readonly<{
  code: DescriptiveClaimReviewResultCode;
  changed: boolean;
  knowledge_state: KnowledgeState;
  review_state: DescriptiveClaimReviewState;
  transition_proposal?: StateTransitionProposal;
}>;

export function createDescriptiveClaimReviewState(projectId: string, conversationId: string): DescriptiveClaimReviewState {
  return descriptiveClaimReviewStateSchema.parse({ project_id: projectId, conversation_id: conversationId, revision: 0, entries: [] });
}

// Stable, deliberately non-cryptographic identity for synthetic replay. Production needs a server-side digest.
export function fingerprintDescriptiveClaimProposal(proposal: KnowledgeClaimProposal): string {
  const canonical = JSON.stringify({
    proposal_id: proposal.claim_id, project_id: proposal.project_id, entity_type: proposal.entity_type,
    entity_id: proposal.entity_id, property_key: proposal.property_key, value: proposal.value,
    value_type: proposal.value_type, epistemic_status: proposal.epistemic_status,
    knowledge_strength: proposal.knowledge_strength, based_on_state_version: proposal.based_on_state_version,
    proposed_state_version: proposal.proposed_state_version,
    evidence: [...proposal.evidence].sort((a, b) => a.evidence_id.localeCompare(b.evidence_id)),
  });
  let hash = 2166136261;
  for (let index = 0; index < canonical.length; index += 1) hash = Math.imul(hash ^ canonical.charCodeAt(index), 16777619);
  return `descriptive-v1:${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

type ReviewContext = Readonly<{
  command: unknown;
  current_state: unknown;
  review_state: unknown;
  proposals: readonly unknown[];
  transition_id: string;
  apply_id: string;
}>;

const unchanged = (code: DescriptiveClaimReviewResultCode, state: KnowledgeState, reviewState: DescriptiveClaimReviewState): DescriptiveClaimReviewResult => ({ code, changed: false, knowledge_state: state, review_state: reviewState });
const appendReview = (state: DescriptiveClaimReviewState, command: DescriptiveClaimReviewCommand, proposal: KnowledgeClaimProposal, code: DescriptiveClaimReviewResultCode): DescriptiveClaimReviewState => descriptiveClaimReviewStateSchema.parse({
  ...state, revision: state.revision + 1, entries: [...state.entries, {
    proposal_id: proposal.claim_id, proposal_fingerprint: fingerprintDescriptiveClaimProposal(proposal),
    property_key: proposal.property_key, review_action: command.review_action,
    review_actor_class: command.review_actor_class, review_actor_id: command.review_actor_id,
    reviewed_at: command.reviewed_at, result_code: code,
  }],
});

/** Pure admin-only reconstruction and apply boundary. The caller supplies an authoritative local proposal repository. */
export function reviewDescriptiveClaimProposal(input: ReviewContext): DescriptiveClaimReviewResult {
  const commandParsed = descriptiveClaimReviewCommandSchema.safeParse(input.command);
  const stateParsed = knowledgeStateSchema.safeParse(input.current_state);
  const reviewParsed = descriptiveClaimReviewStateSchema.safeParse(input.review_state);
  if (!stateParsed.success || !reviewParsed.success) throw new Error("Invalid synthetic review aggregate");
  const state = stateParsed.data;
  const reviewState = reviewParsed.data;
  if (!commandParsed.success) return unchanged("invalid_review_context", state, reviewState);
  const command = commandParsed.data;
  if (command.project_id !== state.project_id || command.conversation_id !== state.conversation_id || reviewState.project_id !== state.project_id || reviewState.conversation_id !== state.conversation_id) return unchanged("invalid_review_context", state, reviewState);
  const proposalRaw = input.proposals.find((candidate) => Boolean(candidate && typeof candidate === "object" && "claim_id" in candidate && candidate.claim_id === command.proposal_id));
  const proposalParsed = knowledgeClaimProposalSchema.safeParse(proposalRaw);
  if (!proposalParsed.success) return unchanged("invalid_review_context", state, reviewState);
  const proposal = proposalParsed.data;
  const fingerprint = fingerprintDescriptiveClaimProposal(proposal);
  const replay = reviewState.entries.find((entry) => entry.proposal_id === proposal.claim_id && entry.proposal_fingerprint === fingerprint && entry.review_action === command.review_action);
  if (replay) return unchanged(command.review_action === "approve" && replay.result_code === "approved" ? "already_applied" : replay.result_code, state, reviewState);
  if (command.expected_knowledge_state_version !== state.state_version || proposal.based_on_state_version !== state.state_version) return unchanged("stale_state", state, reviewState);
  if (proposal.project_id !== command.project_id || !DESCRIPTIVE_REVIEW_PROPERTIES.includes(proposal.property_key as typeof DESCRIPTIVE_REVIEW_PROPERTIES[number])) return unchanged("invalid_review_context", state, reviewState);
  if (command.review_action === "reject") return { ...unchanged("rejected", state, appendReview(reviewState, command, proposal, "rejected")) };
  if (command.review_action === "mark_evidence_insufficient") return { ...unchanged("insufficient_evidence", state, appendReview(reviewState, command, proposal, "insufficient_evidence")) };
  if (proposal.knowledge_strength !== "descriptive_fact") return unchanged("invalid_review_context", state, reviewState);
  const validStrength = validateClaimStrengthForProperty({ property_key: proposal.property_key, strength: proposal.knowledge_strength, epistemic_status: proposal.epistemic_status, actor_class: proposal.evidence[0]?.actor_class ?? "system" });
  if (!validStrength.success || proposal.epistemic_status !== "observed" || proposal.value_type !== "boolean" || proposal.value !== true || proposal.evidence.length === 0 || proposal.proposed_state_version !== state.state_version + 1 || proposal.evidence.some((evidence) => evidence.evidence_status !== "active")) return unchanged("invalid_review_context", state, reviewState);
  const effective = getEffectiveClaims(state).filter((claim) => claim.entity_type === proposal.entity_type && claim.entity_id === proposal.entity_id && claim.property_key === proposal.property_key);
  if (effective.some((claim) => claim.value === true && claim.value_type === "boolean" && claim.knowledge_strength === "descriptive_fact" && claim.epistemic_status === "observed")) return { ...unchanged("no_change", state, appendReview(reviewState, command, proposal, "no_change")) };
  if (effective.length) return { ...unchanged("conflict_detected", state, appendReview(reviewState, command, proposal, "conflict_detected")) };
  const transition = stateTransitionProposalSchema.parse({
    transition_id: input.transition_id, interpretation_id: proposal.claim_id,
    idempotency_key: `descriptive-review:${proposal.claim_id}:${fingerprint}`,
    project_id: command.project_id, conversation_id: command.conversation_id,
    based_on_state_version: state.state_version, proposed_state_version: state.state_version + 1,
    transition_origin: "descriptive_claim_review", information_key: proposal.property_key,
    evidence_proposals: proposal.evidence, claim_proposals: [proposal], superseded_claim_ids: [],
    explanation_codes: [], created_at: command.reviewed_at,
    semantic_result_type: "descriptive_transition", transition_type: "claim_created",
  }) as StateTransitionProposal;
  const applied = applyStateTransitionProposal({ project_id: command.project_id, conversation_id: command.conversation_id, current_state: state, proposal: transition, applied_at: command.reviewed_at, apply_id: input.apply_id });
  if (!applied.success || !applied.changed) return unchanged("apply_failed", state, reviewState);
  return { code: "approved", changed: true, knowledge_state: applied.knowledge_state, review_state: appendReview(reviewState, command, proposal, "approved"), transition_proposal: transition };
}
