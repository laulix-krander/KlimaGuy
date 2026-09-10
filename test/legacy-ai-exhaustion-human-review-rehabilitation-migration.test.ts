import {readFileSync} from "node:fs";
import {describe,expect,it} from "vitest";

const sql=readFileSync("supabase/migrations/202609100003_legacy_ai_exhaustion_human_review_rehabilitation.sql","utf8");
const rehabilitation=sql.slice(sql.indexOf("create function public.rehabilitate_legacy_ai_exhaustion_human_review"),sql.indexOf("-- D-17 acquisition"));
const discovery=sql.slice(sql.indexOf("create function public.discover_recoverable_conversation_cycles"));

describe("AP-16-06-06D-18 terminalized legacy false-exhaustion rehabilitation",()=>{
  it("defines one service-only transactional authority with locked, idempotent acquisition",()=>{
    expect(sql).toContain("create function public.rehabilitate_legacy_ai_exhaustion_human_review(target_message_id uuid) returns jsonb");
    expect(rehabilitation).toContain("security definer set search_path=public,pg_temp");
    expect(rehabilitation).toContain("where source_message_id=target_message_id for update");
    expect(rehabilitation).toContain("'already_rehabilitated'");
    expect(sql).toMatch(/revoke all on function public\.rehabilitate_legacy_ai_exhaustion_human_review\(uuid\)[\s\S]*from public,anon,authenticated/);
    expect(sql).toMatch(/grant execute on function public\.rehabilitate_legacy_ai_exhaustion_human_review\(uuid\)[\s\S]*to service_role/);
  });

  it("matches the exact production shape and excludes unrelated Human Review",()=>{
    for(const predicate of ["cmd.command_type<>'customer_answer'","cmd.status<>'human_review_required'","cmd.result_code<>'ai_attempts_exhausted'","cmd.inference_semantics_version<>1","cmd.legacy_ai_exhaustion_rehabilitated_at is not null","c.status<>'open'","c.current_project_id is distinct from cmd.project_id","r.runtime_status<>'human_review'","r.revision<>cmd.expected_runtime_revision+1","p.status<>'answered'","p.answered_by_message_id is distinct from cmd.source_message_id","p.prompt_message_id is distinct from cmd.prompt_message_id","'newer_customer_inbound'","'newer_pending_interaction'","'human_review_provenance_missing'"]) expect(rehabilitation).toContain(predicate);
    expect(rehabilitation).toContain("a.action='conversation_cycle_technical_human_review_requested'");
    expect(rehabilitation).toContain("a.metadata->>'reason'='ai_attempts_exhausted'");
  });

  it("preserves answered history and reconstructs monotonic pending/snapshot/runtime authority",()=>{
    expect(sql).toContain("recovery_of_pending_interaction_id uuid");
    expect(sql).toContain("recovery_of_snapshot_id uuid");
    expect(rehabilitation).toContain("next_revision:=r.revision+1");
    expect(rehabilitation).toContain("insert into public.conversation_pending_interactions");
    expect(rehabilitation).toContain("insert into public.conversation_interaction_snapshots");
    expect(rehabilitation).not.toMatch(/update public\.conversation_pending_interactions set status='pending'/);
    expect(rehabilitation).not.toMatch(/delete from/);
    expect(rehabilitation).toContain("runtime_status='awaiting_customer_answer'");
    expect(rehabilitation).toContain("active_pending_interaction_id=recovery_pending_id");
  });

  it("continues the existing command under D-17 without resetting historical attempts",()=>{
    expect(rehabilitation).toContain("inference_semantics_version=2");
    expect(rehabilitation).toContain("legacy_ai_exhaustion_rehabilitated_at=now_at");
    expect(rehabilitation).not.toMatch(/ai_inference_attempt_count\s*=/);
    expect(rehabilitation).not.toMatch(/current_semantics_ai_attempt_count\s*=/);
    expect(sql).toContain("public.acquire_customer_message_cycle_execution_d17(target_message_id,execution_owner,lease_seconds)");
    expect(sql).not.toMatch(/insert into public\.conversation_messages/);
  });

  it("discovers both unchanged D-17 authority and the terminalized D-18 signature",()=>{
    expect(discovery).toContain("legacy_human_review_rehabilitation_candidate boolean");
    expect(discovery).toContain("r.runtime_status='awaiting_customer_answer'");
    expect(discovery).toContain("r.runtime_status='human_review'");
    expect(discovery).toContain("p.status='answered'");
    expect(discovery).toContain("p.answered_by_message_id=cmd.source_message_id");
    expect(discovery).toContain("cmd.inference_semantics_version=1");
    expect(discovery).toContain("cmd.legacy_ai_exhaustion_rehabilitated_at is null");
  });

  it("records immutable resolution evidence without customer content or incident-specific IDs",()=>{
    expect(rehabilitation).toContain("'legacy_ai_exhaustion_human_review_rehabilitated'");
    expect(rehabilitation).toContain("'historical_ai_attempt_count',cmd.ai_inference_attempt_count");
    for(const forbidden of ["bbd0df13","9732fe6a","c3ee55ca","9afad389","Das ist ein freistehendes"]) expect(sql).not.toContain(forbidden);
  });
});
