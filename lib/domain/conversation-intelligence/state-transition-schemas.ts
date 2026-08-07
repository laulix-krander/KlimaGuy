import { z } from "zod";
import { stateTransitionProposalSchema } from "./answer-interpretation-schemas";
import { TRANSITION_TYPES } from "./answer-interpretation-types";
import { knowledgeStateSchema } from "./schemas";
import { STATE_TRANSITION_APPLY_ERROR_CODES, STATE_TRANSITION_IDEMPOTENCY_STATUSES } from "./state-transition-types";

const uuid = z.string().uuid();
const version = z.number().int().positive();
export const stateTransitionIdempotencyStatusSchema = z.enum(STATE_TRANSITION_IDEMPOTENCY_STATUSES);
export const stateTransitionApplyContextSchema = z.object({ project_id: uuid, conversation_id: uuid, current_state: knowledgeStateSchema, proposal: stateTransitionProposalSchema, applied_at: z.string().datetime({ offset: true }), apply_id: uuid, idempotency_status: stateTransitionIdempotencyStatusSchema.optional() }).strict();
const metadata = { apply_id: uuid, transition_id: uuid, interpretation_id: uuid, idempotency_key: z.string().min(1), previous_state_version: version, new_state_version: version, applied_transition_type: z.enum(TRANSITION_TYPES) };
export const stateTransitionApplyResultSchema = z.union([
  z.object({ success: z.literal(true), changed: z.literal(true), code: z.literal("transition_applied"), ...metadata, knowledge_state: knowledgeStateSchema, applied_claim_ids: z.array(uuid).min(1).readonly(), superseded_claim_ids: z.array(uuid).readonly() }).strict(),
  z.object({ success: z.literal(true), changed: z.literal(false), code: z.enum(["transition_no_change", "transition_already_applied"]), ...metadata, knowledge_state: knowledgeStateSchema, applied_claim_ids: z.tuple([]).readonly(), superseded_claim_ids: z.tuple([]).readonly() }).strict(),
  z.object({ success: z.literal(false), code: z.enum(STATE_TRANSITION_APPLY_ERROR_CODES), retryable: z.boolean(), requires_replanning: z.boolean(), requires_human_review: z.boolean() }).strict(),
]);
