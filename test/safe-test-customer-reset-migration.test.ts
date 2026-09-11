import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migrationName = "202609110003_remove_missing_cycle_events_from_test_reset.sql";
const migrationDirectory = `${process.cwd()}/supabase/migrations`;
const sql = readFileSync(`${migrationDirectory}/${migrationName}`, "utf8");

const publicRelations = [...sql.matchAll(/public\.([a-z][a-z0-9_]*)/g)]
  .map((match) => match[1])
  .filter((name) => !["reset_test_transport_customer"].includes(name));
const directlyReferencedTables = [...new Set(publicRelations)].sort();
const triggerReferences = [...sql.matchAll(
  /alter table public\.([a-z0-9_]+) (?:disable|enable) trigger ([a-z0-9_]+)/g,
)].map((match) => ({ table: match[1], trigger: match[2] }));

describe("D-23B safe test customer reset migration", () => {
  it("excludes the missing production relation and preserves every other direct relation reference", () => {
    expect(sql).not.toContain("conversation_cycle_events");
    expect(directlyReferencedTables).toEqual([
      "conversation_cycle_commands", "conversation_effort_states", "conversation_evidence_request_states",
      "conversation_information_collection", "conversation_interaction_snapshots", "conversation_message_references",
      "conversation_message_text", "conversation_messages", "conversation_pending_interactions",
      "conversation_project_assignments", "conversation_retry_states", "conversation_runtime_commands",
      "conversation_runtime_states", "conversation_state_commands", "conversation_transport_bindings",
      "conversation_transport_identities", "conversations", "customer_answer_ai_inference_results",
      "customer_answer_execution_contexts", "customers", "project_evidence", "project_executions",
      "project_knowledge_claim_evidence", "project_knowledge_claim_retractions", "project_knowledge_claims",
      "project_knowledge_corrections", "project_knowledge_state_transitions", "project_knowledge_states",
      "project_media", "project_notes", "project_offers", "projects", "transport_delivery_commands",
      "transport_delivery_events", "transport_media_ingestion_commands", "transport_message_attachments",
      "transport_message_bindings", "transport_send_attempts", "transport_webhook_receipts",
    ]);
  });

  it("preserves all 15 production-verified trigger references", () => {
    const uniqueTriggerReferences = new Map(
      triggerReferences.map(({ table, trigger }) => [`${table}.${trigger}`, { table, trigger }]),
    );
    expect(triggerReferences).toHaveLength(uniqueTriggerReferences.size * 2);
    expect([...uniqueTriggerReferences.keys()]).toEqual([
      "customer_answer_execution_contexts.customer_answer_execution_contexts_immutable",
      "conversation_cycle_commands.cycle_command_history_guard",
      "conversation_runtime_states.runtime_header_guard",
      "conversation_interaction_snapshots.planner_snapshot_immutable",
      "conversation_pending_interactions.pending_interaction_guard",
      "conversation_runtime_commands.runtime_commands_append_only",
      "transport_delivery_events.transport_delivery_events_append_only",
      "conversation_message_text.conversation_message_text_append_only",
      "conversation_message_references.conversation_message_references_append_only",
      "conversation_messages.conversation_messages_append_only",
      "conversation_project_assignments.conversation_assignments_append_only",
      "conversation_state_commands.conversation_state_commands_append_only",
      "project_knowledge_claim_evidence.project_knowledge_claim_evidence_append_only",
      "project_knowledge_claims.project_knowledge_claims_append_only",
      "project_knowledge_state_transitions.project_knowledge_transitions_append_only",
    ]);
  });

  it("removes every stale isolated customer-answer knowledge reference", () => {
    expect(sql).not.toMatch(/customer_answer_claim_evidence/);
    expect(sql).not.toMatch(/customer_answer_knowledge_(?:claims|transitions)/);
  });

  it("keeps dry-run free of persistent mutations", () => {
    const previewPath = sql.slice(sql.indexOf("begin"), sql.indexOf("if dry_run then return result; end if;"));
    expect(previewPath).not.toMatch(/(?:delete from|update|alter table) public\./i);
  });

  it("cleans the current fresh-state dependency set on commit", () => {
    for (const table of [
      "customer_answer_execution_contexts", "customer_answer_ai_inference_results",
      "conversation_cycle_commands", "conversation_runtime_states",
      "conversation_interaction_snapshots", "conversation_pending_interactions",
      "conversation_information_collection", "conversation_retry_states",
      "conversation_effort_states", "conversation_evidence_request_states",
      "conversation_messages", "conversation_transport_bindings",
      "conversation_transport_identities", "project_knowledge_claim_evidence",
      "project_knowledge_claims", "project_knowledge_states", "projects", "customers",
    ]) expect(sql).toContain(`delete from public.${table}`);
    expect(sql).toContain("set constraints all deferred");
    expect(sql).toContain("update public.transport_webhook_receipts r set internal_message_id=null");
    expect(sql).not.toContain("delete from public.transport_webhook_receipts");
  });

  it("preserves the RPC signature and service-role contract", () => {
    expect(sql).toMatch(/create or replace function public\.reset_test_transport_customer\([\s\S]*?target_provider text,[\s\S]*?target_sender_scope text,[\s\S]*?target_external_identity text,[\s\S]*?target_confirmation text,[\s\S]*?dry_run boolean default true\s*\)/);
    expect(sql).toContain("target_confirmation is distinct from 'RESET TEST CUSTOMER'");
    expect(sql).toContain("if auth.role() is distinct from 'service_role'");
    expect(sql).toContain("revoke all on function public.reset_test_transport_customer");
    expect(sql).toContain("grant execute on function public.reset_test_transport_customer(text,text,text,text,boolean) to service_role");
  });
});
