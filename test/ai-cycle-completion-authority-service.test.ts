import { describe, expect, it, vi } from "vitest";
import { createSyntheticConversationCycleContext, runConversationCycle } from "@/lib/domain/conversation-intelligence";
import {
  commitCustomerMessageCycleWithoutClaim,
  completeCustomerMessageWithTechnicalHumanReview,
  deferCustomerMessageAiRetry,
  reserveCustomerAnswerAiInferenceAttempt,
} from "@/lib/server/conversation/persistent-cycle-commit";

const id = (suffix: string) => `91000000-0000-4000-8000-${suffix.padStart(12, "0")}`;
const authority = { command_id:id("1"), source_message_id:id("2"), pending_interaction_id:id("3"), expected_runtime_revision:1, expected_knowledge_version:1 };
const execution = { ownerId:id("9"), leaseSeconds:300 };

describe("AP-16-06-06D-1B provider-neutral service authority", () => {
  it.each([1, 2, 3] as const)("maps reservation %s without changing execution acquisition", async attempt => {
    const rpc = vi.fn().mockResolvedValue({ data:{ success:true, code:"reserved", command_id:authority.command_id, attempt_number:attempt }, error:null });
    await expect(reserveCustomerAnswerAiInferenceAttempt({ rpc }, authority, execution)).resolves.toEqual(expect.objectContaining({ success:true, attempt_number:attempt }));
    expect(rpc).toHaveBeenCalledWith("reserve_customer_answer_ai_inference_attempt", expect.objectContaining({ execution_owner_id:id("9") }));
    expect(rpc.mock.calls[0][1]).not.toHaveProperty("execution_attempt_count");
  });

  it("returns exhaustion and never invents a fourth attempt", async () => {
    const rpc = vi.fn().mockResolvedValue({ data:{ success:false, code:"attempts_exhausted" }, error:null });
    await expect(reserveCustomerAnswerAiInferenceAttempt({ rpc }, authority, execution)).resolves.toEqual({ success:false, code:"attempts_exhausted" });
  });

  it.each(["timeout", "transient_provider_failure"] as const)("maps recoverable %s to the closed DB reason", async failure => {
    const rpc = vi.fn().mockResolvedValue({ data:{ success:true, code:"deferred", retry_at:"2026-09-08T12:01:00.000Z", attempt_count:1 }, error:null });
    await expect(deferCustomerMessageAiRetry({ rpc }, { command_id:authority.command_id, source_message_id:authority.source_message_id, failure }, execution)).resolves.toMatchObject({ success:true, attempt_count:1 });
    expect(rpc).toHaveBeenCalledWith("defer_customer_message_ai_retry", expect.objectContaining({ failure_code:`ai_${failure}` }));
  });

  it.each(["ai_configuration_failure", "ai_attempts_exhausted", "ai_non_transient_failure"] as const)("escalates %s through existing human review", async reason => {
    const rpc = vi.fn().mockResolvedValue({ data:{ success:true, command_id:authority.command_id, runtime_revision:2, knowledge_version:1, pending_interaction_id:null }, error:null });
    await expect(completeCustomerMessageWithTechnicalHumanReview({ rpc }, { ...authority, reason }, execution)).resolves.toMatchObject({ success:true, kind:"human_review" });
    expect(rpc).toHaveBeenCalledWith("complete_customer_message_human_review", expect.objectContaining({ review_payload:expect.objectContaining({ technical_reason:reason }) }));
  });

  it.each(["no_match", "ambiguous"] as const)("commits %s through one no-claim branch", async outcome => {
    const full = runConversationCycle(createSyntheticConversationCycleContext("exact"));
    expect(full.success).toBe(true); if (!full.success) return;
    const { normalized_answer: _n, interpretation: _i, state_transition_proposal: _p, state_transition_apply_result: _a, ...cycle } = full;
    const rpc = vi.fn().mockResolvedValue({ data:{ success:true, code:"committed", command_id:authority.command_id, runtime_revision:2, knowledge_version:1, outbound_message_id:null, pending_interaction_id:null, result_kind:"collection_stopped" }, error:null });
    await commitCustomerMessageCycleWithoutClaim({ rpc }, { ...authority, outcome, cycle:{ ...cycle, previous_state_version:1, current_state_version:1, knowledge_state:{ ...cycle.knowledge_state, state_version:1 } } }, execution);
    const payload = rpc.mock.calls[0][1].commit_payload;
    expect(payload).toMatchObject({ knowledge_outcome:"no_claim", expected_knowledge_version:1 });
    expect(payload).not.toHaveProperty("interpretation"); expect(payload).not.toHaveProperty("proposal"); expect(payload).not.toHaveProperty("apply_result");
  });
});
