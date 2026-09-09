import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migrationPath = "supabase/migrations/202609090008_rehabilitated_technical_epoch_retry_authority_repair.sql";
const acquisitionPath = "supabase/migrations/202609090005_exhausted_technical_recovery_rehabilitation.sql";
const sql = readFileSync(migrationPath, "utf8");
const acquisitionSql = readFileSync(acquisitionPath, "utf8");
const discovery = sql.slice(sql.indexOf("create function public.discover_recoverable_conversation_cycles"));
const claim = sql.slice(0, sql.indexOf("drop function if exists public.discover_recoverable_conversation_cycles"));

type Status = "processing" | "failed" | "completed" | "human_review_required" | "stale";
type Candidate = {
  id: string;
  clock: number;
  status: Status;
  resultCode?: string;
  attempts: number;
  rehabilitationCount: number;
  leaseExpired?: boolean;
  authorityCurrent?: boolean;
  answered?: boolean;
  newerInbound?: boolean;
};

function epochAttempts(row: Candidate): number {
  return row.attempts - row.rehabilitationCount * 10;
}

function discover(rows: Candidate[], limit = 100) {
  return rows
    .filter((row) => row.authorityCurrent !== false && !row.answered && !row.newerInbound)
    .filter((row) =>
      (row.status === "processing" && row.leaseExpired && epochAttempts(row) >= 0 && epochAttempts(row) < 10) ||
      (row.status === "failed" && row.resultCode === "persistence_failed" &&
        ((epochAttempts(row) >= 0 && epochAttempts(row) < 10) ||
          (row.rehabilitationCount === 0 && row.attempts === 10))),
    )
    .sort((left, right) => left.clock - right.clock || left.id.localeCompare(right.id))
    .slice(0, Math.min(Math.max(limit, 1), 100))
    .map((row) => ({
      id: row.id,
      requiresTechnicalRehabilitation:
        row.status === "failed" && row.rehabilitationCount === 0 && row.attempts === 10,
    }));
}

function claimFailed(row: Candidate) {
  if (row.status !== "failed" || row.resultCode !== "persistence_failed" || row.authorityCurrent === false) {
    return { accepted: false, rehabilitationCount: row.rehabilitationCount, rehabilitated: false };
  }
  if (epochAttempts(row) >= 0 && epochAttempts(row) < 10) {
    return { accepted: true, rehabilitationCount: row.rehabilitationCount, rehabilitated: false };
  }
  if (row.rehabilitationCount === 0 && row.attempts === 10) {
    return { accepted: true, rehabilitationCount: 1, rehabilitated: true };
  }
  return { accepted: false, rehabilitationCount: row.rehabilitationCount, rehabilitated: false };
}

const failed = (attempts: number, rehabilitationCount: number): Candidate => ({
  id: `attempt-${attempts}`,
  clock: attempts,
  status: "failed",
  resultCode: "persistence_failed",
  attempts,
  rehabilitationCount,
});

describe("AP-16-06-06D-12 rehabilitated technical epoch retry authority", () => {
  it("discovers original failures and marks only the one rehabilitation transition", () => {
    for (let attempts = 1; attempts <= 9; attempts += 1) {
      expect(discover([failed(attempts, 0)])).toEqual([
        { id: `attempt-${attempts}`, requiresTechnicalRehabilitation: false },
      ]);
    }
    expect(discover([failed(10, 0)])).toEqual([
      { id: "attempt-10", requiresTechnicalRehabilitation: true },
    ]);
  });

  it("discovers every remaining fresh-epoch retry without marking another rehabilitation", () => {
    for (let attempts = 11; attempts <= 19; attempts += 1) {
      expect(discover([failed(attempts, 1)])).toEqual([
        { id: `attempt-${attempts}`, requiresTechnicalRehabilitation: false },
      ]);
    }
    expect(discover([failed(20, 1)])).toEqual([]);
  });

  it("claims the transition once and reopens fresh-epoch failures without a second transition", () => {
    expect(claimFailed(failed(9, 0))).toEqual({ accepted: true, rehabilitationCount: 0, rehabilitated: false });
    expect(claimFailed(failed(10, 0))).toEqual({ accepted: true, rehabilitationCount: 1, rehabilitated: true });
    expect(claimFailed(failed(11, 1))).toEqual({ accepted: true, rehabilitationCount: 1, rehabilitated: false });
    expect(claimFailed(failed(19, 1))).toEqual({ accepted: true, rehabilitationCount: 1, rehabilitated: false });
    expect(claimFailed(failed(20, 1))).toEqual({ accepted: false, rehabilitationCount: 1, rehabilitated: false });
  });

  it("preserves terminal, non-persistence, stale-authority, answered, and superseded exclusions", () => {
    const patches: Partial<Candidate>[] = [
      { status: "completed" },
      { status: "human_review_required" },
      { status: "stale" },
      { resultCode: "invalid_input" },
      { resultCode: "normalization_failed" },
      { resultCode: "cycle_failed" },
      { authorityCurrent: false },
      { answered: true },
      { newerInbound: true },
    ];
    for (const patch of patches) expect(discover([{ ...failed(11, 1), ...patch }])).toEqual([]);
  });

  it("preserves deterministic ordering and the global bounded limit", () => {
    const rows = [
      { ...failed(11, 1), id: "z", clock: 1 },
      { ...failed(12, 1), id: "a", clock: 1 },
      { ...failed(13, 1), id: "later", clock: 2 },
    ];
    expect(discover(rows, 2).map(({ id }) => id)).toEqual(["a", "z"]);
    expect(discovery).toContain("order by coalesce(cmd.execution_lease_expires_at,cmd.last_execution_started_at,cmd.created_at),cmd.id");
    expect(discovery).toContain("limit least(greatest(result_limit,1),100)");
  });

  it("uses the derived epoch consistently in discovery and claim", () => {
    expect(discovery).toContain("cmd.execution_attempt_count-(cmd.technical_rehabilitation_count*10) between 0 and 9");
    expect(claim).toContain("epoch_attempts:=cmd.execution_attempt_count-(cmd.technical_rehabilitation_count*10)");
    expect(claim).toContain("if epoch_attempts between 0 and 9 then");
    expect(claim).toContain("elsif cmd.execution_attempt_count=10 and cmd.technical_rehabilitation_count=0 then");
    expect(claim).toContain("rehabilitated boolean:=false");
    expect(claim).toContain("'technical_rehabilitated',rehabilitated");
    expect(sql).not.toMatch(/technical_rehabilitation_count\s*=\s*technical_rehabilitation_count\s*\+\s*1/);
  });

  it("leaves acquisition authoritative, monotonic, and exactly-once", () => {
    expect(sql).not.toContain("create or replace function public.acquire_customer_message_cycle_execution");
    expect(acquisitionSql).toContain("epoch_attempts:=cmd.execution_attempt_count-(cmd.technical_rehabilitation_count*10)");
    expect(acquisitionSql).toContain("if epoch_attempts<0 or epoch_attempts>=10");
    expect(acquisitionSql.match(/execution_attempt_count=execution_attempt_count\+1/g)).toHaveLength(1);
    expect(acquisitionSql).toContain("'execution_attempt_count',cmd.execution_attempt_count+1");
    expect(acquisitionSql).toContain("'technical_recovery_epoch_attempt_count',epoch_attempts+1");
  });

  it("retains business guards, schema repairs, service-only security, and AI accounting", () => {
    for (const guard of [
      "c.status<>'open'", "r.runtime_status<>'awaiting_customer_answer'", "p.status<>'pending'",
      "p.answered_by_message_id is not null", "p.runtime_revision<>r.revision",
      "p.expected_knowledge_state_version<>k", "s.pending_interaction_id<>p.id",
      "pm.sequence<>s.outbound_message_sequence", "newer.sequence>m.sequence",
      "cmd.expected_runtime_revision<>r.revision", "cmd.expected_knowledge_version<>k",
    ]) expect(sql).toContain(guard);
    expect(sql).toContain("s.rendered_interaction->>'primary_text'");
    expect(sql).not.toContain("s.outbound_text");
    expect(sql).toContain("security definer set search_path=public,pg_temp");
    expect(sql.match(/auth\.role\(\) is distinct from 'service_role'/g)).toHaveLength(2);
    expect(sql).toContain("revoke all on function public.claim_customer_message_cycle(uuid),public.discover_recoverable_conversation_cycles(integer) from public,anon,authenticated");
    expect(sql).toContain("grant execute on function public.claim_customer_message_cycle(uuid),public.discover_recoverable_conversation_cycles(integer) to service_role");
    expect(sql).not.toContain("ai_inference_attempt_count");
    expect(sql).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  });
});
