import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { processPersistentCustomerMessage, type CustomerMessageCycleAuthority } from "@/lib/actions/persistent-conversation-cycle-service";
import { createInterpretationIdempotencyKey, createSyntheticConversationCycleContext, createSyntheticInterpretationContext } from "@/lib/domain/conversation-intelligence";

const successResult = { success:true as const, kind:"completed_with_next_interaction" as const, command_id:"91000000-0000-4000-8000-000000000001", runtime_revision:2, knowledge_version:2, outbound_message_id:null, pending_interaction_id:null };

function authority(messageText = "25 m²", review = false): CustomerMessageCycleAuthority {
  let context = createSyntheticConversationCycleContext("exact");
  if (review) {
    const interpretation = createSyntheticInterpretationContext("roomArea", "exact", {
      value:30, value_type:"number", epistemic_status:"confirmed",
      evidence:[{ evidence_id:"83000000-0000-4000-8000-000000000008", source_type:"reviewer_correction", source_id:"83000000-0000-4000-8000-000000000009", actor_class:"reviewer", observed_at:"2026-08-06T16:00:00.000Z", evidence_status:"manually_corrected" }],
    });
    const { knowledge_state, normalized_answer: _answer, current_state_version: _version, project_id: _project, conversation_id: _conversation, ...interpretation_inputs } = interpretation;
    context = createSyntheticConversationCycleContext("exact", { knowledge_state, interpretation_inputs });
  }
  const messageId = context.normalized_answer.answer_id;
  context = {
    ...context,
    interpretation_inputs:{
      ...context.interpretation_inputs,
      source_message_id:messageId,
      idempotency_key:createInterpretationIdempotencyKey(context.conversation_id, context.interpretation_inputs.selected_action.decision_id, messageId),
    },
  };
  const { normalized_answer: _normalized, execution_status: _execution, ...cycle_context } = context;
  return {
    command_id:"91000000-0000-4000-8000-000000000001", conversation_id:context.conversation_id, project_id:context.project_id,
    message_id:messageId, message_sequence:2, message_text:messageText, message_occurred_at:context.occurred_at,
    direction:"inbound", actor_class:"customer", message_kind:"text", prompt_sequence:1,
    pending_interaction_id:"91000000-0000-4000-8000-000000000020", expected_runtime_revision:1, expected_knowledge_version:1,
    rendered_interaction:context.interpretation_inputs.rendered_interaction, cycle_context,
  };
}

function source(value: CustomerMessageCycleAuthority) {
  return {
    claimCustomerMessage:vi.fn().mockResolvedValue({ authority:value }),
    commitCustomerMessageCycle:vi.fn().mockResolvedValue(successResult),
    completeCustomerMessageWithHumanReview:vi.fn().mockResolvedValue({ ...successResult, kind:"human_review", outbound_message_id:null, pending_interaction_id:value.pending_interaction_id }),
    failCustomerMessage:vi.fn().mockResolvedValue(undefined),
  };
}

describe("AP-16-06-01DE persistent cycle authority", () => {
  it("passes normalized answer, proposal, apply result and stable IDs directly to commit", async () => {
    const data = source(authority());
    const messageId = authority().message_id;
    await expect(processPersistentCustomerMessage(data, { message_id:messageId })).resolves.toEqual(successResult);
    expect(data.commitCustomerMessageCycle).toHaveBeenCalledOnce();
    const payload = data.commitCustomerMessageCycle.mock.calls[0][0];
    expect(payload.cycle.normalized_answer.answer_id).toBe(payload.source_message_id);
    expect(payload.cycle.interpretation.proposal).toBe(payload.cycle.state_transition_proposal);
    expect(payload.cycle.state_transition_apply_result).toMatchObject({ changed:true, transition_id:payload.cycle.state_transition_proposal.transition_id, interpretation_id:payload.cycle.state_transition_proposal.interpretation_id });
    expect(payload.cycle.state_transition_apply_result.applied_claim_ids).toEqual(payload.cycle.state_transition_proposal.claim_proposals.map((claim: { claim_id:string })=>claim.claim_id));
    expect(payload).not.toHaveProperty("provider_message_id"); expect(payload).not.toHaveProperty("openai");
  });

  it("keeps no-change explicit through the commit input", async () => {
    const value = authority("überspringen");
    const data = source(value);
    await processPersistentCustomerMessage(data, { message_id:value.message_id });
    expect(data.commitCustomerMessageCycle.mock.calls[0][0].cycle.state_transition_apply_result).toMatchObject({ changed:false, code:"transition_no_change" });
  });

  it("maps human review to its controlled terminal boundary without failure or success commit", async () => {
    const value = authority("25 m²", true); const data = source(value);
    await processPersistentCustomerMessage(data, { message_id:value.message_id });
    expect(data.completeCustomerMessageWithHumanReview).toHaveBeenCalledWith({ command_id:value.command_id, source_message_id:value.message_id, pending_interaction_id:value.pending_interaction_id, cycle_result:expect.objectContaining({ success:false, requires_human_review:true }) });
    expect(data.commitCustomerMessageCycle).not.toHaveBeenCalled(); expect(data.failCustomerMessage).not.toHaveBeenCalled();
    const reviewPayload = data.completeCustomerMessageWithHumanReview.mock.calls[0][0];
    expect(reviewPayload).not.toHaveProperty("review_actor"); expect(reviewPayload).not.toHaveProperty("approval");
  });

  it("keeps normalization and domain failures allow-listed and separate from human review", async () => {
    const invalid = authority(""); const normalization = source(invalid);
    await expect(processPersistentCustomerMessage(normalization, { message_id:invalid.message_id })).resolves.toMatchObject({ success:false, code:"normalization_failed" });
    expect(normalization.failCustomerMessage).toHaveBeenCalledWith(invalid.command_id, "normalization_failed");
    const range = authority("20 bis 30 m²"); const domain = source(range);
    await expect(processPersistentCustomerMessage(domain, { message_id:range.message_id })).resolves.toMatchObject({ success:false, code:"cycle_failed" });
    expect(domain.failCustomerMessage).toHaveBeenCalledWith(range.command_id, "cycle_failed");
  });

  it("does not recompute domain authority while preparing persistence", () => {
    const service = readFileSync("lib/actions/persistent-conversation-cycle-service.ts", "utf8");
    expect(service).not.toContain("applyStateTransitionProposal");
    expect(service.match(/normalizeCustomerAnswer\(/gu)).toHaveLength(1);
    expect(service.match(/runConversationCycle\(/gu)).toHaveLength(1);
    expect(service).not.toMatch(/planNextAction|renderQuestionTemplate|randomUUID|crypto\.randomUUID|openai|whatsapp/iu);
  });
});
