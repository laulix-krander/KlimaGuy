import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migrationPath = "supabase/migrations/202609090006_existing_recovery_discovery_undefined_column_repair.sql";
const sql = readFileSync(migrationPath, "utf8");
const discovery = sql.slice(sql.indexOf("create function public.discover_recoverable_conversation_cycles"));

const tableByAlias = {
  cmd: "conversation_cycle_commands",
  c: "conversations",
  r: "conversation_runtime_states",
  k: "project_knowledge_states",
  p: "conversation_pending_interactions",
  s: "conversation_interaction_snapshots",
  source: "conversation_messages",
  prompt: "conversation_messages",
  mt: "conversation_message_text",
  newer: "conversation_messages",
} as const;

function authoritativeColumns(table: string): Set<string> {
  const migrations = readdirSync("supabase/migrations")
    .filter((name) => name.endsWith(".sql") && name <= "202609090006_existing_recovery_discovery_undefined_column_repair.sql")
    .sort()
    .map((name) => readFileSync(`supabase/migrations/${name}`, "utf8"))
    .join("\n");
  const columns = new Set<string>();
  const create = new RegExp(`create table(?: if not exists)? public\\.${table}\\s*\\(([\\s\\S]*?)\\n\\);`, "ig").exec(migrations)?.[1] ?? "";
  for (const line of create.split(",")) {
    const name = /^\s*([a-z_][a-z0-9_]*)\s+/i.exec(line)?.[1]?.toLowerCase();
    if (name && !["constraint", "check", "primary", "unique", "foreign"].includes(name)) columns.add(name);
  }
  const additions = new RegExp(`alter table public\\.${table}\\s+add column(?: if not exists)?\\s+([a-z_][a-z0-9_]*)`, "ig");
  for (const match of migrations.matchAll(additions)) columns.add(match[1].toLowerCase());
  return columns;
}

type Candidate = {
  id: string; clock: number; status: "processing" | "failed" | "completed" | "human_review_required";
  resultCode?: string; attempts: number; rehabilitationCount: number; leaseExpired: boolean;
  answered?: boolean; runtimeCurrent?: boolean; knowledgeCurrent?: boolean; newerInbound?: boolean;
};

function discover(rows: Candidate[], limit: number) {
  return rows.filter((row) =>
    !row.answered && row.runtimeCurrent !== false && row.knowledgeCurrent !== false && !row.newerInbound &&
    ((row.status === "processing" && row.leaseExpired && row.attempts - row.rehabilitationCount * 10 < 10) ||
      (row.status === "failed" && row.resultCode === "persistence_failed" && row.rehabilitationCount === 0 && row.attempts <= 10)),
  ).sort((a, b) => a.clock - b.clock || a.id.localeCompare(b.id)).slice(0, Math.min(Math.max(limit, 1), 100))
    .map((row) => ({ id: row.id, requiresTechnicalRehabilitation: row.status === "failed" && row.attempts >= 10 }));
}

const base: Candidate = { id: "b", clock: 2, status: "processing", attempts: 1, rehabilitationCount: 0, leaseExpired: true };

 describe("AP-16-06-06D-10 existing recovery discovery repair", () => {
  it("validates every qualified discovery reference against migration-established schema", () => {
    for (const [alias, table] of Object.entries(tableByAlias)) {
      const columns = authoritativeColumns(table);
      expect(columns.size, `schema authority for ${table}`).toBeGreaterThan(0);
      for (const match of discovery.matchAll(new RegExp(`\\b${alias}\\.([a-z_][a-z0-9_]*)`, "gi"))) {
        expect(columns, `${alias}.${match[1]} must exist on public.${table}`).toContain(match[1].toLowerCase());
      }
    }
    expect(authoritativeColumns("conversation_interaction_snapshots")).not.toContain("outbound_text");
    expect(discovery).not.toContain("s.outbound_text");
    expect(discovery).toContain("s.rendered_interaction->>'primary_text'");
  });

  it("preserves ordinary, bounded failed, and one exhausted rehabilitation discovery", () => {
    expect(discover([base], 10)).toEqual([{ id: "b", requiresTechnicalRehabilitation: false }]);
    expect(discover([{ ...base, id: "failed", status: "failed", resultCode: "persistence_failed", attempts: 9 }], 10)[0]).toEqual({ id: "failed", requiresTechnicalRehabilitation: false });
    expect(discover([{ ...base, id: "ten", status: "failed", resultCode: "persistence_failed", attempts: 10 }], 10)[0]).toEqual({ id: "ten", requiresTechnicalRehabilitation: true });
    expect(discover([{ ...base, status: "failed", resultCode: "persistence_failed", attempts: 20, rehabilitationCount: 1 }], 10)).toEqual([]);
  });

  it("excludes terminal, review, answered, stale, and superseded work", () => {
    for (const patch of [
      { status: "completed" as const }, { status: "human_review_required" as const }, { answered: true },
      { runtimeCurrent: false }, { knowledgeCurrent: false }, { newerInbound: true },
    ]) expect(discover([{ ...base, ...patch }], 10)).toEqual([]);
  });

  it("retains deterministic ordering and one globally clamped limit", () => {
    const rows = [{ ...base, id: "z", clock: 1 }, { ...base, id: "a", clock: 1 }, { ...base, id: "later", clock: 3 }];
    expect(discover(rows, 2).map(({ id }) => id)).toEqual(["a", "z"]);
    expect(discovery).toContain("order by coalesce(cmd.execution_lease_expires_at,cmd.last_execution_started_at,cmd.created_at),cmd.id");
    expect(discovery).toContain("limit least(greatest(result_limit,1),100)");
  });

  it("remains side-effect-free, fixed-path, and executable only by service_role", () => {
    expect(discovery).toContain("language plpgsql security definer set search_path=public,pg_temp");
    expect(discovery).toContain("auth.role() is distinct from 'service_role'");
    expect(discovery).not.toMatch(/\b(update|delete|insert)\b/i);
    expect(sql).toContain("revoke all on function public.claim_customer_message_cycle(uuid),public.discover_recoverable_conversation_cycles(integer) from public,anon,authenticated");
    expect(sql).toContain("grant execute on function public.claim_customer_message_cycle(uuid),public.discover_recoverable_conversation_cycles(integer) to service_role");
  });

  it("repairs claim as well so an emitted rehabilitation candidate can be acquired", () => {
    const claim = sql.slice(0, sql.indexOf("drop function if exists public.discover_recoverable_conversation_cycles"));
    expect(claim).not.toContain("s.outbound_text");
    expect(claim).toContain("cmd.execution_attempt_count=10 and cmd.technical_rehabilitation_count=0");
    expect(claim).toContain("technical_rehabilitation_count=1");
  });
});
