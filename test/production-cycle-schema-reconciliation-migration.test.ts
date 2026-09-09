import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const migrationPath = "supabase/migrations/202609090001_production_cycle_schema_reconciliation.sql";

describe("AP-16-06-06D-3 production cycle reconciliation", () => {
  it("reconciles the partial Production shape and latest productive RPC surface", async () => {
    const sql = await readFile(migrationPath, "utf8");
    for (const column of ["project_id", "prompt_message_id", "execution_at", "correlation_id", "interpretation_id", "transition_id", "claim_id", "customer_evidence_id", "system_evidence_id", "apply_id", "assessment_id", "planner_decision_id", "event_ids", "next_evidence_request_id", "next_pending_interaction_id", "next_snapshot_id", "next_outbound_message_id", "event_sequence_start", "commit_payload_hash", "execution_owner_id", "execution_lease_expires_at", "execution_attempt_count", "last_execution_started_at", "ai_inference_attempt_count"]) {
      expect(sql).toContain(`add column if not exists ${column}`);
    }
    for (const fn of ["claim_customer_message_cycle", "get_customer_message_cycle_context", "acquire_customer_message_cycle_execution", "discover_recoverable_conversation_cycles", "fail_customer_message_cycle", "commit_customer_message_cycle", "complete_customer_message_human_review", "reserve_customer_answer_ai_inference_attempt", "defer_customer_message_ai_retry"]) {
      expect(sql).toMatch(new RegExp(`create or replace function public\\.${fn}\\(`));
    }
    expect(sql).toContain("incompatible conversation_cycle_commands columns");
    expect(sql).toContain("ai_inference_attempt_count between 0 and 3");
    expect(sql).toContain("execution_attempt_count>=0");
  });

  it("discovers only bounded currently eligible unconsumed messages without creating commands", async () => {
    const sql = await readFile(migrationPath, "utf8");
    const discovery = sql.slice(sql.indexOf("create or replace function public.discover_missing_customer_answer_cycles"));
    for (const invariant of ["m.direction='inbound'", "m.actor_class='customer'", "m.message_kind='text'", "c.status='open'", "r.runtime_status='awaiting_customer_answer'", "p.status='pending'", "p.runtime_revision=r.revision", "p.expected_knowledge_state_version=r.knowledge_state_version", "k.current_version=r.knowledge_state_version", "m.sequence>prompt.sequence", "p.answered_by_message_id is null", "not exists(select 1 from public.conversation_cycle_commands"]) expect(discovery).toContain(invariant);
    expect(discovery).toContain("limit least(greatest(result_limit,1),100)");
    expect(discovery).not.toMatch(/insert into public\.conversation_cycle_commands|update public\.conversation_cycle_commands/);
  });
});
