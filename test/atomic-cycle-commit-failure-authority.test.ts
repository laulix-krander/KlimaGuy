import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { commitCustomerMessageCycle, failCustomerMessage } from "@/lib/server/conversation/persistent-cycle-commit";
import { createSyntheticConversationCycleContext, runConversationCycle } from "@/lib/domain/conversation-intelligence";

const migrationPath = "supabase/migrations/202609020002_atomic_cycle_commit_failure_authority.sql";
const sql = readFileSync(migrationPath, "utf8");
const successRpc = sql.slice(sql.indexOf("create function public.commit_customer_message_cycle"), sql.indexOf("create function public.fail_customer_message_cycle"));
const failureRpc = sql.slice(sql.indexOf("create function public.fail_customer_message_cycle"), sql.indexOf("create function public.complete_customer_message_human_review"));

function commitFixture() {
  const context = createSyntheticConversationCycleContext("exact");
  const cycle = runConversationCycle(context);
  if (!cycle.success) throw new Error("invalid synthetic cycle");
  return {
    command_id: context.cycle_id,
    source_message_id: context.normalized_answer.answer_id,
    pending_interaction_id: "91000000-0000-4000-8000-000000000020",
    expected_runtime_revision: 1,
    expected_knowledge_version: context.expected_state_version,
    cycle,
  };
}

describe("AP-16-06-01E success adapter", () => {
  it("passes original knowledge, runtime, interaction and event authorities to exactly one RPC", async () => {
    const input = commitFixture();
    const rpc = vi.fn().mockResolvedValue({ data: { success:true, code:"committed", command_id:input.command_id, runtime_revision:2, knowledge_version:input.cycle.current_state_version, outbound_message_id:null, pending_interaction_id:null, result_kind:"collection_stopped" }, error:null });
    await commitCustomerMessageCycle({ rpc }, input);
    expect(rpc).toHaveBeenCalledOnce();
    const [, args] = rpc.mock.calls[0];
    expect(rpc.mock.calls[0][0]).toBe("commit_customer_message_cycle");
    expect(args.commit_payload).toMatchObject({ proposal:input.cycle.state_transition_proposal, apply_result:input.cycle.state_transition_apply_result, normalized_answer:input.cycle.normalized_answer, information_collection_state:input.cycle.information_collection_state, retry_state:input.cycle.retry_state, customer_effort_state:input.cycle.customer_effort_state, evidence_request_state:input.cycle.evidence_request_state, events:input.cycle.events });
  });

  it("fails closed before RPC for altered proposal/apply and excessive event authority", async () => {
    const input = commitFixture(); const rpc = vi.fn();
    await expect(commitCustomerMessageCycle({ rpc }, { ...input, cycle:{ ...input.cycle, state_transition_apply_result:{ ...input.cycle.state_transition_apply_result, transition_id:"91000000-0000-4000-8000-000000000099" } } })).resolves.toMatchObject({ success:false, code:"invalid_input" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("maps database errors without leaking their content", async () => {
    const input=commitFixture();
    const result=await commitCustomerMessageCycle({ rpc:vi.fn().mockResolvedValue({ data:null,error:new Error("secret sql") }) },input);
    expect(result).toMatchObject({success:false,code:"persistence_failed"});
    expect(JSON.stringify(result)).not.toContain("secret sql");
  });
});

describe("AP-16-06-01E atomic SQL authority", () => {
  it("locks every CAS authority in stable order and validates exact bindings", () => {
    const positions=["from public.conversations", "from public.conversation_runtime_states", "from public.project_knowledge_states", "from public.conversation_pending_interactions", "from public.conversation_cycle_commands where id=target_command_id for update"].map(token=>successRpc.indexOf(token));
    expect(positions).toEqual([...positions].sort((a,b)=>a-b));
    for (const token of ["cmd.source_message_id", "cmd.pending_interaction_id", "cmd.prompt_message_id", "cmd.expected_runtime_revision", "cmd.expected_knowledge_version", "p.snapshot_id"]) expect(successRpc).toContain(token);
  });

  it("uses the original changed authority and composes knowledge inside the transaction", () => {
    expect(successRpc).toContain("commit_payload#>>'{apply_result,changed}'");
    expect(successRpc).toContain("public.apply_customer_answer_knowledge_transition");
    expect(successRpc).not.toMatch(/normalizeCustomerAnswer|interpretNormalizedAnswer|applyStateTransitionProposal|planNextAction|renderQuestionTemplate/);
  });

  it("persists runtime components, exact pending lifecycle, snapshot, outbound text, events, then command", () => {
    for (const token of ["conversation_information_collection", "conversation_retry_states", "conversation_effort_states", "conversation_evidence_request_states", "status='answered'", "conversation_interaction_snapshots", "conversation_messages", "conversation_message_text", "conversation_cycle_events"]) expect(successRpc).toContain(token);
    expect(successRpc.indexOf("insert into public.conversation_cycle_events")).toBeLessThan(successRpc.indexOf("set status='completed'"));
    expect(successRpc).toContain("cmd.next_pending_interaction_id");
    expect(successRpc).toContain("cmd.next_snapshot_id");
    expect(successRpc).toContain("cmd.next_outbound_message_id");
  });

  it("provides deterministic replay, payload conflict, bounded stable event slots and one revision", () => {
    expect(successRpc).toContain("cmd.commit_payload_hash is distinct from payload_hash");
    expect(successRpc).toContain("'code','replayed'");
    expect(successRpc).toContain("jsonb_array_length(commit_payload->'events')>cardinality(cmd.event_ids)");
    expect(successRpc).toContain("next_revision:=r.revision+1");
    expect(successRpc.match(/next_revision:=r\.revision\+1/g)).toHaveLength(1);
  });

  it("makes constraint failures abort rather than preserving partial success", () => {
    expect(successRpc).toContain("raise exception 'atomic_cycle_commit_rejected'");
    expect(successRpc).not.toMatch(/exception[\s\S]*return jsonb_build_object\('success',false,'code','persistence_failed'/);
  });
});

describe("AP-16-06-01E failure, review, and security boundaries", () => {
  it.each(["normalization_failed","cycle_failed","persistence_failed"] as const)("persists allow-listed %s without content", async code => {
    const rpc=vi.fn().mockResolvedValue({data:{success:true,code:"failed"},error:null});
    await failCustomerMessage({rpc},"91000000-0000-4000-8000-000000000001",code);
    expect(rpc).toHaveBeenCalledWith("fail_customer_message_cycle",{target_command_id:"91000000-0000-4000-8000-000000000001",failure_code:code});
  });

  it("is idempotent and cannot overwrite successful or review-terminal commands", () => {
    expect(failureRpc).toContain("cmd.status in ('completed','human_review_required','stale')");
    expect(failureRpc).toContain("if cmd.status='failed'");
    expect(failureRpc).not.toMatch(/exception|stack|message_text|payload|whatsapp|openai/i);
  });

  it("uses service-only fixed-search-path RPCs and content-minimal events", () => {
    expect(sql.match(/security definer set search_path=public,pg_temp/g)?.length).toBeGreaterThanOrEqual(3);
    expect(sql).toContain("revoke all on function public.commit_customer_message_cycle(uuid,jsonb),public.fail_customer_message_cycle(uuid,text),public.complete_customer_message_human_review(uuid,jsonb) from public,anon,authenticated");
    expect(sql).toContain("grant execute on function public.commit_customer_message_cycle(uuid,jsonb),public.fail_customer_message_cycle(uuid,text),public.complete_customer_message_human_review(uuid,jsonb) to service_role");
    expect(sql).not.toMatch(/provider_message_id|phone_number|raw_payload|audit_log|review_actor|reviewed_at|approval|openai/i);
  });

  it("contains no runner, delivery, provider, replanning, or rerendering boundary", () => {
    const adapter=readFileSync("lib/server/conversation/persistent-cycle-commit.ts","utf8");
    expect(adapter).not.toMatch(/runConversationCycle|normalizeCustomerAnswer|applyStateTransitionProposal|planNextAction|renderQuestionTemplate|deliverPendingWhatsAppMessage|sendWhatsAppText|OpenAI/);
    expect(sql).not.toMatch(/whatsapp|graph api|provider_message_id|openai/i);
  });
});
