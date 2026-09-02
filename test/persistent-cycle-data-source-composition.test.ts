import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CustomerMessageCycleAuthority, PersistentCycleDataSource } from "@/lib/actions/persistent-conversation-cycle-service";
import { processPersistentCustomerMessage } from "@/lib/actions/persistent-conversation-cycle-service";
import { createInterpretationIdempotencyKey, createSyntheticConversationCycleContext, createSyntheticInterpretationContext } from "@/lib/domain/conversation-intelligence";

const adapters = vi.hoisted(() => ({
  load: vi.fn(), commit: vi.fn(), fail: vi.fn(), review: vi.fn(),
}));
vi.mock("@/lib/actions/persistent-cycle-context-read", async importOriginal => ({
  ...await importOriginal<typeof import("@/lib/actions/persistent-cycle-context-read")>(),
  loadCustomerMessageCycleAuthority: adapters.load,
}));
vi.mock("@/lib/server/conversation/persistent-cycle-commit", async importOriginal => ({
  ...await importOriginal<typeof import("@/lib/server/conversation/persistent-cycle-commit")>(),
  commitCustomerMessageCycle: adapters.commit,
  failCustomerMessage: adapters.fail,
  completeCustomerMessageWithHumanReview: adapters.review,
}));

import { createPersistentCycleDataSource } from "@/lib/server/conversation/persistent-cycle-data-source";

const commandId = "91000000-0000-4000-8000-000000000001";
const success = { success:true as const, kind:"completed_with_next_interaction" as const, command_id:commandId,
  runtime_revision:2, knowledge_version:2, outbound_message_id:null, pending_interaction_id:null };

function authority(messageText = "25 m²", review = false): CustomerMessageCycleAuthority {
  let context = createSyntheticConversationCycleContext("exact");
  if (review) {
    const interpretation = createSyntheticInterpretationContext("roomArea", "exact", {
      value:30, value_type:"number", epistemic_status:"confirmed",
      evidence:[{ evidence_id:"83000000-0000-4000-8000-000000000008", source_type:"reviewer_correction", source_id:"83000000-0000-4000-8000-000000000009", actor_class:"reviewer", observed_at:"2026-08-06T16:00:00.000Z", evidence_status:"manually_corrected" }],
    });
    const { knowledge_state, normalized_answer: _normalized, current_state_version: _version, project_id: _project, conversation_id: _conversation, ...interpretation_inputs } = interpretation;
    context = createSyntheticConversationCycleContext("exact", { knowledge_state, interpretation_inputs });
  }
  const messageId = context.normalized_answer.answer_id;
  context = { ...context, interpretation_inputs:{ ...context.interpretation_inputs, source_message_id:messageId,
    idempotency_key:createInterpretationIdempotencyKey(context.conversation_id, context.interpretation_inputs.selected_action.decision_id, messageId) } };
  const { normalized_answer: _answer, execution_status: _status, ...cycle_context } = context;
  return { command_id:commandId, conversation_id:context.conversation_id, project_id:context.project_id,
    message_id:messageId, message_sequence:2, message_text:messageText, message_occurred_at:context.occurred_at,
    direction:"inbound", actor_class:"customer", message_kind:"text", prompt_sequence:1,
    pending_interaction_id:"91000000-0000-4000-8000-000000000020", expected_runtime_revision:1,
    expected_knowledge_version:1, rendered_interaction:context.interpretation_inputs.rendered_interaction, cycle_context };
}

function setup(value = authority()) {
  const claim = { rpc:vi.fn().mockResolvedValue({ data:{ success:true, replay:false, command_id:commandId }, error:null }) };
  const read = { rpc:vi.fn() };
  const commit = { rpc:vi.fn() };
  adapters.load.mockResolvedValue({ success:true, authority:value });
  adapters.commit.mockResolvedValue(success);
  adapters.fail.mockResolvedValue(undefined);
  adapters.review.mockResolvedValue({ ...success, kind:"human_review" });
  return { source:createPersistentCycleDataSource({ claim, read, commit }), claim, read, commit };
}

describe("AP-16-06-01F PersistentCycleDataSource composition", () => {
  beforeEach(() => vi.clearAllMocks());

  it("satisfies the service contract and delegates load exclusively to the C authority", async () => {
    const value = authority();
    const composed: PersistentCycleDataSource = setup(value).source;
    const result = await composed.claimCustomerMessage(value.message_id);
    expect(result).toEqual({ authority:value });
    expect(adapters.load).toHaveBeenCalledOnce();
    expect(adapters.load).toHaveBeenCalledWith(expect.anything(), commandId);
  });

  it("fails closed and sanitizes claim and read errors", async () => {
    const raw = setup();
    raw.claim.rpc.mockResolvedValueOnce({ data:null, error:new Error("secret SQL detail") });
    await expect(raw.source.claimCustomerMessage(authority().message_id)).resolves.toEqual({ error:"persistence_failed" });
    expect(adapters.load).not.toHaveBeenCalled();
    const stale = setup();
    adapters.load.mockResolvedValueOnce({ success:false, error:"runtime_stale" });
    await expect(stale.source.claimCustomerMessage(authority().message_id)).resolves.toEqual({ error:"stale_runtime_revision" });
    expect(JSON.stringify(await stale.source.claimCustomerMessage("invalid"))).not.toContain("SQL");
  });

  it("delegates failure exactly once to the E adapter", async () => {
    const { source } = setup();
    await source.failCustomerMessage(commandId, "persistence_failed");
    expect(adapters.fail).toHaveBeenCalledOnce(); expect(adapters.fail.mock.calls[0].slice(1)).toEqual([commandId,"persistence_failed"]);
  });

  it("runs a deterministic service cycle through the composed success boundary", async () => {
    const value = authority(); const { source } = setup(value);
    await expect(processPersistentCustomerMessage(source,{ message_id:value.message_id })).resolves.toEqual(success);
    expect(adapters.commit).toHaveBeenCalledOnce(); expect(adapters.fail).not.toHaveBeenCalled(); expect(adapters.review).not.toHaveBeenCalled();
  });

  it("routes human review only through the established E review authority", async () => {
    const value=authority("25 m²",true); const {source}=setup(value);
    await processPersistentCustomerMessage(source,{message_id:value.message_id});
    expect(adapters.review).toHaveBeenCalledOnce(); expect(adapters.commit).not.toHaveBeenCalled(); expect(adapters.fail).not.toHaveBeenCalled();
  });

  it.each([["", "normalization_failed"], ["20 bis 30 m²", "cycle_failed"]] as const)(
    "routes a controlled %s failure without a success commit", async (message, code) => {
      const value=authority(message); const { source }=setup(value);
      await expect(processPersistentCustomerMessage(source,{message_id:value.message_id})).resolves.toMatchObject({success:false,code});
      expect(adapters.fail).toHaveBeenCalledWith(expect.anything(),commandId,code); expect(adapters.commit).not.toHaveBeenCalled();
    });

  it("does not add partial persistence or recomputation dependencies", async () => {
    const { readFile } = await import("node:fs/promises");
    const implementation = await readFile("lib/server/conversation/persistent-cycle-data-source.ts","utf8");
    expect(implementation).not.toMatch(/normalizeCustomerAnswer|applyStateTransitionProposal|planNextAction|renderQuestionTemplate|randomUUID|crypto\.randomUUID/);
    expect(implementation).not.toMatch(/knowledge.*apply|runtime.*commit|snapshot.*commit|outbound.*commit/iu);
    expect(implementation).not.toMatch(/whatsapp|openai|worker|cron|recovery/iu);
  });
});
