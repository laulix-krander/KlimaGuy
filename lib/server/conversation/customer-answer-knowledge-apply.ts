import "server-only";

import { z } from "zod";
import { stateTransitionProposalSchema } from "@/lib/domain/conversation-intelligence/answer-interpretation-schemas";
import { stateTransitionApplyResultSchema } from "@/lib/domain/conversation-intelligence/state-transition-schemas";
import type { KnowledgeClaimProposal } from "@/lib/domain/conversation-intelligence/answer-interpretation-types";

const uuid = z.string().uuid();

export const CUSTOMER_ANSWER_KNOWLEDGE_APPLY_CODES = [
  "applied", "no_change", "replayed", "command_not_found", "command_not_claimed",
  "project_mismatch", "conversation_mismatch", "source_message_mismatch", "knowledge_stale",
  "transition_invalid", "claim_invalid", "provenance_invalid", "duplicate_conflict",
  "human_review_required", "persistence_failed",
] as const;

const inputSchema = z.object({
  command_id: uuid,
  proposal: stateTransitionProposalSchema,
  apply_result: stateTransitionApplyResultSchema,
}).strict().superRefine(({ proposal, apply_result }, context) => {
  if (!apply_result.success) {
    context.addIssue({ code: "custom", path: ["apply_result"], message: "apply_result_not_authoritative" });
    return;
  }
  if (apply_result.transition_id !== proposal.transition_id || apply_result.interpretation_id !== proposal.interpretation_id ||
      apply_result.previous_state_version !== proposal.based_on_state_version || apply_result.new_state_version !== proposal.proposed_state_version ||
      apply_result.apply_id.length === 0 || apply_result.idempotency_key !== proposal.idempotency_key ||
      JSON.stringify([...apply_result.applied_claim_ids]) !== JSON.stringify(proposal.claim_proposals.map((claim: KnowledgeClaimProposal) => claim.claim_id)) ||
      JSON.stringify([...apply_result.superseded_claim_ids]) !== JSON.stringify([...proposal.superseded_claim_ids])) {
    context.addIssue({ code: "custom", path: ["apply_result"], message: "apply_result_proposal_mismatch" });
  }
});

const successSchema = z.object({
  success: z.literal(true), code: z.enum(["applied", "no_change", "replayed"]), replayed: z.boolean(),
  project_id: uuid, command_id: uuid, previous_knowledge_version: z.number().int().positive(),
  resulting_knowledge_version: z.number().int().positive(), transition_id: uuid,
  applied_claim_ids: z.array(uuid),
}).strict();
const failureSchema = z.object({ success: z.literal(false), code: z.enum(CUSTOMER_ANSWER_KNOWLEDGE_APPLY_CODES) }).strict();

export type CustomerAnswerKnowledgeApplyInput = z.input<typeof inputSchema>;
export type CustomerAnswerKnowledgeApplyResult = z.infer<typeof successSchema> | z.infer<typeof failureSchema>;
export type CustomerAnswerKnowledgeApplySource = {
  rpc(name: "apply_customer_answer_knowledge_transition", args: { target_command_id: string; transition_payload: unknown }): Promise<{ data: unknown; error: unknown }>;
};

/** Isolated service-only building block. AP-16-06-01E, not a runner, owns production-cycle composition. */
export async function applyCustomerAnswerKnowledgeTransition(
  source: CustomerAnswerKnowledgeApplySource,
  input: CustomerAnswerKnowledgeApplyInput,
): Promise<CustomerAnswerKnowledgeApplyResult> {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return { success: false, code: "transition_invalid" };
  const { command_id, proposal, apply_result } = parsed.data;
  if (!apply_result.success) return { success: false, code: "transition_invalid" };
  const result = await source.rpc("apply_customer_answer_knowledge_transition", {
    target_command_id: command_id,
    transition_payload: { proposal, apply_id: apply_result.apply_id, changed: apply_result.changed },
  });
  if (result.error) return { success: false, code: "persistence_failed" };
  const failure = failureSchema.safeParse(result.data);
  if (failure.success) return failure.data;
  const success = successSchema.safeParse(result.data);
  return success.success ? success.data : { success: false, code: "persistence_failed" };
}
