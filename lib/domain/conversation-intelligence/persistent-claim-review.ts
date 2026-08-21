import { z } from "zod";
import { DESCRIPTIVE_REVIEW_ACTIONS, DESCRIPTIVE_REVIEW_PROPERTIES } from "./descriptive-claim-review";

export const EVIDENCE_CLAIM_PROPOSAL_STATUSES = ["pending_review", "approved_apply_pending", "applied", "rejected", "insufficient_evidence", "conflict", "stale", "superseded"] as const;
export const EVIDENCE_CLAIM_PROPOSAL_RESULTS = ["created", "already_exists", "observation_not_claimable", "observation_invalidated", "source_media_unavailable", "mapping_failed", "stale_observation", "persistence_failed"] as const;
export const EVIDENCE_CLAIM_REVIEW_RESULTS = ["approved", "rejected", "insufficient_evidence", "stale_proposal", "already_reviewed", "no_change", "conflict_detected", "review_not_allowed", "apply_pending", "apply_failed"] as const;

const uuid = z.string().uuid();
const timestamp = z.string().datetime({ offset: true });
export const createEvidenceClaimProposalInputSchema = z.object({ observation_id: uuid }).strict();
export const reviewEvidenceClaimProposalInputSchema = z.object({ proposal_id: uuid, expected_proposal_revision: z.number().int().positive(), review_action: z.enum(DESCRIPTIVE_REVIEW_ACTIONS) }).strict();
export const evidenceClaimProposalDtoSchema = z.object({
  proposal_id: uuid, evidence_id: uuid, observation_id: uuid,
  property: z.enum(DESCRIPTIVE_REVIEW_PROPERTIES), value: z.literal(true), value_type: z.literal("boolean"),
  epistemic: z.literal("observed"), strength: z.literal("descriptive_fact"),
  status: z.enum(EVIDENCE_CLAIM_PROPOSAL_STATUSES), revision: z.number().int().positive(),
  created_at: timestamp, updated_at: timestamp,
}).strict();
export const evidenceClaimReviewDtoSchema = z.object({
  review_id: uuid, proposal_id: uuid, action: z.enum(DESCRIPTIVE_REVIEW_ACTIONS),
  result: z.enum(EVIDENCE_CLAIM_REVIEW_RESULTS), actor_class: z.literal("admin"), reviewed_at: timestamp,
}).strict();

export type EvidenceClaimProposalDto = Readonly<z.infer<typeof evidenceClaimProposalDtoSchema>>;
export type EvidenceClaimReviewDto = Readonly<z.infer<typeof evidenceClaimReviewDtoSchema>>;
