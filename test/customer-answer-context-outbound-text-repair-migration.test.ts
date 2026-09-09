import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migrationName = "202609090007_customer_answer_context_outbound_text_repair.sql";
const sql = readFileSync(`supabase/migrations/${migrationName}`, "utf8");
const tableByAlias = {
  cmd: "conversation_cycle_commands",
  c: "conversations",
  r: "conversation_runtime_states",
  p: "conversation_pending_interactions",
  m: "conversation_messages",
  pm: "conversation_messages",
  s: "conversation_interaction_snapshots",
  mt: "conversation_message_text",
  ks: "project_knowledge_states",
  kc: "project_knowledge_claims",
  ke: "project_knowledge_claim_evidence",
} as const;

function authoritativeColumns(table: string): Set<string> {
  const migrations = readdirSync("supabase/migrations")
    .filter((name) => name.endsWith(".sql") && name <= migrationName)
    .sort()
    .map((name) => readFileSync(`supabase/migrations/${name}`, "utf8"))
    .join("\n");
  const columns = new Set<string>();
  const create = new RegExp(`create table(?: if not exists)? public\\.${table}\\s*\\(([\\s\\S]*?)\\n\\);`, "ig").exec(migrations)?.[1] ?? "";
  for (const line of create.split(",")) {
    const name = /^\s*([a-z_][a-z0-9_]*)\s+/i.exec(line)?.[1]?.toLowerCase();
    if (name && !["constraint", "check", "primary", "unique", "foreign"].includes(name)) columns.add(name);
  }
  for (const match of migrations.matchAll(new RegExp(`alter table public\\.${table}\\s+add column(?: if not exists)?\\s+([a-z_][a-z0-9_]*)`, "ig"))) {
    columns.add(match[1].toLowerCase());
  }
  return columns;
}

function reconstruct(rendered: { primary_text?: string; supporting_text?: string; help_text?: string }): string {
  return [rendered.primary_text, rendered.supporting_text, rendered.help_text].filter((part) => part !== undefined && part !== null).join("\n\n");
}

describe("AP-16-06-06D-11 customer-answer context outbound text repair", () => {
  it("maps every alias-qualified context reference to a migration-established physical column", () => {
    for (const [alias, table] of Object.entries(tableByAlias)) {
      const columns = authoritativeColumns(table);
      expect(columns.size, `schema authority for public.${table}`).toBeGreaterThan(0);
      for (const match of sql.matchAll(new RegExp(`\\b${alias}\\.([a-z_][a-z0-9_]*)`, "gi"))) {
        expect(columns, `${alias}.${match[1]} must exist on public.${table}`).toContain(match[1].toLowerCase());
      }
    }
    expect(authoritativeColumns("conversation_interaction_snapshots")).not.toContain("outbound_text");
    expect(sql).not.toContain("s.outbound_text");
  });

  it("reconstructs immutable outbound text once and uses it for prompt identity and the DTO", () => {
    expect(sql).toContain("rendered_outbound_text:=concat_ws(E'\\n\\n',s.rendered_interaction->>'primary_text',s.rendered_interaction->>'supporting_text',s.rendered_interaction->>'help_text')");
    expect(sql).toContain("prompt_body<>rendered_outbound_text");
    expect(sql).toContain("'outbound_text',rendered_outbound_text");
    const rendered = { primary_text: "Frage", supporting_text: "Hinweis", help_text: "Hilfe" };
    const renderedOutboundText = reconstruct(rendered);
    expect(renderedOutboundText).toBe("Frage\n\nHinweis\n\nHilfe");
    expect({ snapshot: { outbound_text: renderedOutboundText } }).toEqual({ snapshot: { outbound_text: reconstruct(rendered) } });
  });

  it("preserves signature, fixed-path definer security, explicit rejection, and service-only grants", () => {
    expect(sql).toContain("get_customer_message_cycle_context(target_command_id uuid) returns jsonb");
    expect(sql).toContain("language plpgsql security definer set search_path=public,pg_temp");
    expect(sql).toContain("auth.role() is distinct from 'service_role'");
    expect(sql).toContain("raise insufficient_privilege");
    expect(sql).toContain("revoke all on function public.get_customer_message_cycle_context(uuid) from public,anon,authenticated");
    expect(sql).toContain("grant execute on function public.get_customer_message_cycle_context(uuid) to service_role");
  });

  it("keeps processing-command context authority and returned snapshot contract intact", () => {
    expect(sql).toContain("cmd.command_type<>'customer_answer' or cmd.status<>'processing'");
    for (const key of ["'id',s.id", "'pending_interaction_id',s.pending_interaction_id", "'rendered_interaction',s.rendered_interaction", "'outbound_text',rendered_outbound_text", "'created_at',s.created_at"]) {
      expect(sql).toContain(key);
    }
    expect(sql).toContain("'success',true");
    expect(sql).toContain("'cycle_context',context");
  });

  it("contains no incident-specific mutation or identity", () => {
    expect(sql).not.toMatch(/\b(insert|update|delete|truncate)\b/i);
    expect(sql).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i);
  });
});
