import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { applyCustomerAnswerKnowledgeTransition } from "@/lib/server/conversation/customer-answer-knowledge-apply";
import { applyStateTransitionProposal, SYNTHETIC_STATE_TRANSITION_APPLY_FIXTURES as F } from "@/lib/domain/conversation-intelligence";

const commandId = "96000000-0000-4000-8000-000000000001";
const applied = applyStateTransitionProposal(F.A);
if (!applied.success) throw new Error("invalid fixture");
const success = { success: true, code: "applied", replayed: false, project_id: F.A.project_id,
  command_id: commandId, previous_knowledge_version: applied.previous_state_version,
  resulting_knowledge_version: applied.new_state_version, transition_id: applied.transition_id,
  applied_claim_ids: [...applied.applied_claim_ids] };

describe("AP-16-06-01D TypeScript apply contract", () => {
  it("passes only a validated domain transition with stable IDs and validates the RPC result", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: success, error: null });
    await expect(applyCustomerAnswerKnowledgeTransition({ rpc }, { command_id: commandId, proposal: F.A.proposal, apply_result: applied })).resolves.toEqual(success);
    expect(rpc).toHaveBeenCalledWith("apply_customer_answer_knowledge_transition", expect.objectContaining({
      target_command_id: commandId, transition_payload: expect.objectContaining({ proposal: expect.objectContaining({
        transition_id: F.A.proposal.transition_id, interpretation_id: F.A.proposal.interpretation_id,
        claim_proposals: [expect.objectContaining({ claim_id: F.A.proposal.claim_proposals[0].claim_id })],
      }) }),
    }));
  });

  it("fails closed for mismatched apply/proposal authority and uncontrolled database output", async () => {
    const rpc = vi.fn();
    const mismatch = { ...applied, transition_id: "96000000-0000-4000-8000-000000000009" };
    await expect(applyCustomerAnswerKnowledgeTransition({ rpc }, { command_id: commandId, proposal: F.A.proposal, apply_result: mismatch })).resolves.toEqual({ success: false, code: "transition_invalid" });
    expect(rpc).not.toHaveBeenCalled();
    await expect(applyCustomerAnswerKnowledgeTransition({ rpc: vi.fn().mockResolvedValue({ data: { success: true, code: "surprise" }, error: null }) }, { command_id: commandId, proposal: F.A.proposal, apply_result: applied })).resolves.toEqual({ success: false, code: "persistence_failed" });
  });

  it("maps transport failures without exposing free SQL errors", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: new Error("secret database detail") });
    await expect(applyCustomerAnswerKnowledgeTransition({ rpc }, { command_id: commandId, proposal: F.A.proposal, apply_result: applied })).resolves.toEqual({ success: false, code: "persistence_failed" });
  });
});

describe("AP-16-06-01D migration authority", () => {
  const sql = readFileSync("supabase/migrations/202609020001_customer_answer_knowledge_apply.sql", "utf8");
  const rpc = sql.slice(sql.indexOf("create function public.apply_customer_answer_knowledge_transition"));

  it("keeps customer-answer claims separate from reviewed descriptive claims and preserves provenance", () => {
    expect(sql).toContain("create table public.customer_answer_knowledge_claims");
    expect(sql).toContain("source_class text not null check(source_class='customer_answer')");
    expect(sql).toContain("source_message_id uuid not null");
    expect(sql).toContain("cycle_command_id uuid not null");
    expect(rpc).not.toMatch(/evidence_claim_proposals|evidence_claim_reviews|review_actor|reviewed_at/);
  });

  it("uses command-bound IDs, exact knowledge CAS and stable replay before incrementing once", () => {
    expect(rpc).toContain("p->>'transition_id'<>cmd.transition_id::text");
    expect(rpc).toContain("ks.current_version<>cmd.expected_knowledge_version");
    expect(rpc).toContain("old_t.payload<>transition_payload");
    expect(rpc).toContain("'code','replayed'");
    expect(rpc.match(/update public\.project_knowledge_states/g)).toHaveLength(1);
  });

  it("protects evidence/review boundaries, supersession history and service-only access", () => {
    expect(sql).toContain("source_type text not null check(source_type in ('customer_message','system_rule'))");
    expect(sql).toContain("supersedes_claim_id uuid references public.customer_answer_knowledge_claims");
    expect(sql).toContain("before update or delete");
    expect(rpc).toContain("p->>'transition_type'='human_review_required'");
    expect(sql).toContain("security definer set search_path=public,pg_temp");
    expect(sql).toContain("revoke all on function public.apply_customer_answer_knowledge_transition(uuid,jsonb) from public,anon,authenticated");
    expect(sql).toContain("grant execute on function public.apply_customer_answer_knowledge_transition(uuid,jsonb) to service_role");
  });

  it("does not commit any AP-16-06-01E runtime, pending, outbound, command completion or provider concern", () => {
    expect(rpc).not.toMatch(/conversation_runtime_states|conversation_pending_interactions|conversation_message_text|insert into public\.conversation_messages|status='completed'|audit_log|whatsapp|openai/i);
    expect(sql).not.toMatch(/provider_message_id|phone_number/i);
  });
});
