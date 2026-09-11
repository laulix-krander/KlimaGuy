import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  `${process.cwd()}/supabase/migrations/202609110001_safe_test_customer_reset.sql`,
  "utf8",
);

describe("D-23 safe test customer reset migration", () => {
  it("is service-role-only, identity-based, confirmed, and supports dry-run", () => {
    expect(sql).toContain("target_external_identity text");
    expect(sql).toContain("target_confirmation is distinct from 'RESET TEST CUSTOMER'");
    expect(sql).toContain("if auth.role() is distinct from 'service_role'");
    expect(sql).toContain("if dry_run then return result; end if;");
    expect(sql).toContain("revoke all on function public.reset_test_transport_customer");
  });

  it("fails closed for shared or independently owned data", () => {
    expect(sql).toContain("test_reset_customer_shared");
    expect(sql).toContain("test_reset_conversation_ownership_conflict");
    expect(sql).toContain("test_reset_project_ownership_conflict");
    expect(sql).toContain("test_reset_independent_project_data_present");
  });

  it("cleans the complete conversational dependency set in one transaction", () => {
    for (const table of [
      "customer_answer_execution_contexts", "customer_answer_ai_inference_results",
      "customer_answer_knowledge_transitions", "conversation_cycle_events",
      "conversation_cycle_commands", "conversation_runtime_states",
      "conversation_interaction_snapshots", "conversation_pending_interactions",
      "conversation_information_collection", "conversation_retry_states",
      "conversation_effort_states", "conversation_evidence_request_states",
      "conversation_messages", "conversation_transport_bindings",
      "conversation_transport_identities", "customers",
    ]) expect(sql).toContain(`delete from public.${table}`);
    expect(sql).toContain("set constraints all deferred");
  });

  it("retains provider receipt deduplication while detaching deleted messages", () => {
    expect(sql).toContain("update public.transport_webhook_receipts r set internal_message_id=null");
    expect(sql).not.toContain("delete from public.transport_webhook_receipts");
  });
});
