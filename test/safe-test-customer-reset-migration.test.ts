import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migrationName = "202609110005_fix_reset_snapshot_pending_cycle.sql";
const sql = readFileSync(`${process.cwd()}/supabase/migrations/${migrationName}`, "utf8");
const mutationSql = sql.slice(sql.indexOf("set constraints all deferred"));

const sqlPosition = (statement: string) => {
  const result = sql.indexOf(statement);
  expect(result, `missing statement: ${statement}`).toBeGreaterThanOrEqual(0);
  return result;
};

const position = (statement: string) => {
  const result = mutationSql.indexOf(statement);
  expect(result, `missing statement: ${statement}`).toBeGreaterThanOrEqual(0);
  return result;
};

const expectBefore = (child: string, parent: string) => {
  expect(position(`delete from public.${child}`), `${child} must precede ${parent}`)
    .toBeLessThan(position(`delete from public.${parent}`));
};

describe("production-FK-aware test customer reset migration", () => {
  it("breaks the nullable side and recovery self-references in dependency order", () => {
    const dryRunReturn = sqlPosition("if dry_run then return result; end if;");
    const pendingDetachment = position("update public.conversation_pending_interactions");
    const snapshotDetachment = position("update public.conversation_interaction_snapshots");
    const snapshotDelete = position("delete from public.conversation_interaction_snapshots");
    const pendingDelete = position("delete from public.conversation_pending_interactions");

    expect(dryRunReturn).toBeLessThan(sql.indexOf("update public.conversation_pending_interactions"));
    expect(pendingDetachment).toBeLessThan(snapshotDelete);
    expect(snapshotDetachment).toBeLessThan(snapshotDelete);
    expect(pendingDetachment).toBeLessThan(pendingDelete);
    expect(snapshotDelete).toBeLessThan(pendingDelete);
    expect(sql).toContain("set snapshot_id=null, recovery_of_pending_interaction_id=null");
    expect(sql).toContain("set recovery_of_snapshot_id=null");
    expect(sql).not.toMatch(/set\s+pending_interaction_id\s*=\s*null/i);
    expect(sql).not.toMatch(/alter\s+(?:table[\s\S]*?)?column\s+pending_interaction_id\s+drop\s+not\s+null/i);
  });

  it("deletes external children before detaching the cycle", () => {
    const pendingDetachment = position("update public.conversation_pending_interactions");
    for (const child of [
      "customer_answer_execution_contexts",
      "customer_answer_ai_inference_results",
      "conversation_runtime_states",
      "conversation_cycle_commands",
    ]) {
      expect(position(`delete from public.${child}`), `${child} must precede cycle detachment`)
        .toBeLessThan(pendingDetachment);
    }
  });

  it("removes AI leaves and cycle commands before all referenced runtime parents", () => {
    for (const leaf of ["customer_answer_execution_contexts", "customer_answer_ai_inference_results"]) {
      for (const parent of ["conversation_cycle_commands", "conversation_interaction_snapshots", "conversation_pending_interactions", "conversation_messages"]) {
        if (parent === "conversation_interaction_snapshots" && leaf === "customer_answer_ai_inference_results") continue;
        expectBefore(leaf, parent);
      }
    }
    for (const parent of ["conversation_messages", "conversation_pending_interactions", "projects"]) {
      expectBefore("conversation_cycle_commands", parent);
    }
    for (const parent of ["conversation_evidence_request_states", "conversation_pending_interactions", "projects"]) {
      expectBefore("conversation_runtime_states", parent);
    }
  });

  it("removes transport delivery and media leaves before message/binding/identity parents", () => {
    for (const child of ["transport_send_attempts", "transport_delivery_events"]) {
      expectBefore(child, "transport_delivery_commands");
    }
    for (const child of ["transport_delivery_commands", "transport_media_ingestion_commands", "transport_message_attachments"]) {
      expectBefore(child, "transport_message_bindings");
      expectBefore(child, "conversation_messages");
    }
    expectBefore("transport_message_bindings", "conversation_transport_identities");
    expectBefore("conversation_transport_bindings", "conversation_transport_identities");
    expectBefore("conversations", "conversation_transport_identities");
  });

  it("deletes the complete production project knowledge graph in constraint-safe phases", () => {
    for (const child of ["project_knowledge_claim_retractions", "project_media_dependencies"]) {
      expectBefore(child, "project_knowledge_corrections");
    }
    expect(position("update public.project_knowledge_state_transitions set correction_id=null, target_claim_id=null"))
      .toBeLessThan(position("delete from public.project_knowledge_corrections"));
    expectBefore("project_knowledge_claim_evidence", "project_knowledge_claims");
    expectBefore("project_knowledge_corrections", "project_knowledge_claims");
    expectBefore("project_knowledge_claims", "project_knowledge_state_transitions");
    expectBefore("project_knowledge_state_transitions", "evidence_claim_reviews");
    expectBefore("evidence_claim_reviews", "evidence_claim_proposals");
    expectBefore("evidence_claim_proposals", "evidence_observations");
    expectBefore("evidence_observations", "evidence_interpretation_runs");
    expectBefore("evidence_interpretation_runs", "project_evidence");
  });

  it("accounts for every newly reported project child before project deletion", () => {
    const projectChildren = [
      "project_evidence_tombstones", "project_execution_commands", "project_media_cleanup_items",
      "project_media_deletion_attempts", "project_media_dependencies", "project_media_lifecycle",
      "project_offer_commands", "evidence_claim_proposals", "evidence_observations", "evidence_claim_reviews",
      "project_evidence", "project_executions", "project_media", "project_offers",
      "project_knowledge_claims", "project_knowledge_states", "project_knowledge_state_transitions",
    ];
    for (const table of projectChildren) expectBefore(table, "projects");
    expectBefore("projects", "customers");
    expectBefore("conversations", "customers");
    expectBefore("conversation_transport_identities", "customers");
  });

  it("keeps dry-run mutation-free and returns useful graph counts", () => {
    const preview = sql.slice(sql.indexOf("begin"), sql.indexOf("if dry_run then return result; end if;"));
    expect(preview).not.toMatch(/(?:delete from|update|alter table) public\./i);
    for (const count of ["pending_interactions", "snapshots", "runtime_states", "cycle_commands", "ai_results", "answer_contexts", "project_evidence", "project_media", "project_knowledge_claims", "transport_bindings", "provider_receipts_retained"]) {
      expect(sql).toContain(`'${count}'`);
    }
  });

  it("preserves and detaches webhook receipt tombstones", () => {
    expect(sql).toContain("update public.transport_webhook_receipts set internal_message_id=null");
    expect(sql).not.toContain("delete from public.transport_webhook_receipts");
    expectBefore("transport_delivery_commands", "conversation_messages");
  });

  it("deletes snapshots and pending interactions before messages", () => {
    expectBefore("conversation_interaction_snapshots", "conversation_messages");
    expectBefore("conversation_pending_interactions", "conversation_messages");
  });

  it("does not reference missing or stale production relations", () => {
    expect(sql).not.toContain("conversation_cycle_events");
    expect(sql).not.toContain("customer_answer_claim_evidence");
    expect(sql).not.toContain("customer_answer_knowledge_claims");
    expect(sql).not.toContain("customer_answer_knowledge_transitions");
  });

  it("preserves the RPC signature, confirmation, and grants", () => {
    expect(sql).toMatch(/create or replace function public\.reset_test_transport_customer\([\s\S]*target_provider text,[\s\S]*target_sender_scope text,[\s\S]*target_external_identity text,[\s\S]*target_confirmation text,[\s\S]*dry_run boolean default true/);
    expect(sql).toContain("target_confirmation is distinct from 'RESET TEST CUSTOMER'");
    expect(sql).toContain("if auth.role() is distinct from 'service_role'");
    expect(sql).toContain("grant execute on function public.reset_test_transport_customer(text,text,text,text,boolean) to service_role");
  });
});
