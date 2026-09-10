import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migrationDir = join(process.cwd(), "supabase/migrations");
const migrations = readdirSync(migrationDir).filter((name) => name.endsWith(".sql")).sort();
const allSql = migrations.map((name) => readFileSync(join(migrationDir, name), "utf8")).join("\n").toLowerCase();

function physicalColumns(table: string): Set<string> {
  const columns = new Set<string>();
  const create = new RegExp(`create\\s+table(?:\\s+if\\s+not\\s+exists)?\\s+public\\.${table}\\s*\\(([\\s\\S]*?)\\);`, "giu");
  for (const match of allSql.matchAll(create)) {
    for (const definition of match[1].split(/,\s*(?![^()]*\))/u)) {
      const column = definition.trim().match(/^([a-z_][a-z0-9_]*)\s+/u)?.[1];
      if (column && !["constraint", "primary", "foreign", "unique", "check"].includes(column)) columns.add(column);
    }
  }
  const alter = new RegExp(`alter\\s+table\\s+public\\.${table}([\\s\\S]*?);`, "giu");
  for (const statement of allSql.matchAll(alter)) {
    for (const match of statement[1].matchAll(/add\s+column(?:\s+if\s+not\s+exists)?\s+([a-z_][a-z0-9_]*)/gu)) columns.add(match[1]);
  }
  return columns;
}

const authorities = [
  { file:"202609090009_end_to_end_customer_answer_stabilization.sql", aliases:{cmd:"conversation_cycle_commands",c:"conversations",r:"conversation_runtime_states",p:"conversation_pending_interactions",s:"conversation_interaction_snapshots",m:"conversation_messages",pm:"conversation_messages",source:"conversation_messages",prompt:"conversation_messages",newer:"conversation_messages",mt:"conversation_message_text",k:"project_knowledge_states"}},
  { file:"202609090007_customer_answer_context_outbound_text_repair.sql", aliases:{cmd:"conversation_cycle_commands",c:"conversations",r:"conversation_runtime_states",p:"conversation_pending_interactions",s:"conversation_interaction_snapshots",m:"conversation_messages",pm:"conversation_messages",mt:"conversation_message_text",ks:"project_knowledge_states",kc:"project_knowledge_claims",ke:"project_knowledge_claim_evidence"}},
  { file:"202609080001_ai_cycle_attempt_claimless_technical_escalation_authority.sql", aliases:{cmd:"conversation_cycle_commands",c:"conversations",r:"conversation_runtime_states",p:"conversation_pending_interactions",k:"project_knowledge_states"}},
  { file:"202609090003_recovery_discovery_authorization_failure.sql", aliases:{cmd:"conversation_cycle_commands",r:"conversation_runtime_states",p:"conversation_pending_interactions",s:"conversation_interaction_snapshots",m:"conversation_messages",prompt:"conversation_messages",k:"project_knowledge_states"}},
  { file:"202609020005_whatsapp_delivery_identity_retry_authority.sql", aliases:{d:"transport_delivery_commands",m:"conversation_messages",c:"conversations",p:"conversation_pending_interactions",b:"conversation_transport_bindings",i:"conversation_transport_identities",a:"transport_send_attempts"}},
] as const;

describe("productive customer-answer SQL physical-schema contract", () => {
  for (const authority of authorities) it(`validates alias-qualified columns in ${authority.file}`, () => {
    const sql = readFileSync(join(migrationDir, authority.file), "utf8").toLowerCase();
    for (const [alias, table] of Object.entries(authority.aliases)) {
      const refs = [...sql.matchAll(new RegExp(`\\b${alias}\\.([a-z_][a-z0-9_]*)`, "gu"))].map((match) => match[1]);
      const columns = physicalColumns(table);
      expect(columns.size, `schema for ${table}`).toBeGreaterThan(0);
      for (const column of new Set(refs)) expect(columns.has(column), `${alias}.${column} must exist on public.${table}`).toBe(true);
    }
  });

  it("keeps outbound_text derived instead of treating it as a snapshot column", () => {
    expect(physicalColumns("conversation_interaction_snapshots").has("outbound_text")).toBe(false);
    expect(readFileSync(join(migrationDir, "202609090007_customer_answer_context_outbound_text_repair.sql"), "utf8")).toContain("rendered_outbound_text:=concat_ws");
  });
});
