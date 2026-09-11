import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migrationName = "202609110002_fix_safe_test_customer_reset_current_schema.sql";
const migrationDirectory = `${process.cwd()}/supabase/migrations`;
const sql = readFileSync(`${migrationDirectory}/${migrationName}`, "utf8");
const migrationHistory = readdirSync(migrationDirectory)
  .filter((name) => name.endsWith(".sql") && name <= migrationName)
  .sort()
  .map((name) => ({ name, sql: readFileSync(`${migrationDirectory}/${name}`, "utf8") }));

const publicRelations = [...sql.matchAll(/public\.([a-z][a-z0-9_]*)/g)]
  .map((match) => match[1])
  .filter((name) => !["reset_test_transport_customer"].includes(name));
const directlyReferencedTables = [...new Set(publicRelations)].sort();
const triggerReferences = [...sql.matchAll(
  /alter table public\.([a-z0-9_]+) (?:disable|enable) trigger ([a-z0-9_]+)/g,
)].map((match) => ({ table: match[1], trigger: match[2] }));

describe("D-23B safe test customer reset migration", () => {
  it("only references relations created by the migration history and never subsequently dropped or renamed", () => {
    for (const table of directlyReferencedTables) {
      const createdAt = migrationHistory.findIndex(({ sql: historySql }) =>
        new RegExp(`create table(?: if not exists)? (?:public\\.)?${table}\\b`, "i").test(historySql),
      );
      expect(createdAt, `${table} has no create-table migration`).toBeGreaterThanOrEqual(0);
      const laterHistory = migrationHistory.slice(createdAt + 1).map(({ sql: historySql }) => historySql).join("\n");
      expect(laterHistory, `${table} is dropped after its creation`).not.toMatch(
        new RegExp(`drop table(?: if exists)? public\\.${table}\\b`, "i"),
      );
      expect(laterHistory, `${table} is renamed after its creation`).not.toMatch(
        new RegExp(`alter table public\\.${table} rename to`, "i"),
      );
    }
  });

  it("only suspends triggers proven on the referenced tables", () => {
    const uniqueTriggerReferences = new Map(
      triggerReferences.map(({ table, trigger }) => [`${table}.${trigger}`, { table, trigger }]),
    );
    expect(triggerReferences).toHaveLength(uniqueTriggerReferences.size * 2);
    for (const { table, trigger } of uniqueTriggerReferences.values()) {
      const history = migrationHistory.map(({ sql: historySql }) => historySql).join("\n");
      expect(history, `${trigger} is not created on ${table}`).toMatch(
        new RegExp(`create trigger ${trigger}[^;]* on public\\.${table}\\b`, "is"),
      );
    }
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
      "conversation_cycle_events", "conversation_cycle_commands", "conversation_runtime_states",
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
