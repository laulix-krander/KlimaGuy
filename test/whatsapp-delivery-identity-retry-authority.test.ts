import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migrationPath="supabase/migrations/202609020005_whatsapp_delivery_identity_retry_authority.sql";
const sql=readFileSync(migrationPath,"utf8");
const normalized=sql.replace(/\s+/g," ").toLowerCase();

describe("AP-16-06-04B identity and retry authority",()=>{
  it("binds one WhatsApp command to the internal outbound identity",()=>{
    expect(normalized).toContain("unique index transport_delivery_one_whatsapp_command_per_message");
    expect(normalized).toContain("(internal_message_id) where provider='whatsapp'");
    expect(normalized).toContain("on conflict do nothing");
  });

  it("contains no identity heuristic",()=>{
    expect(normalized).not.toMatch(/latest.message|order by[^;]*sequence|body\s*=|conversation-last/);
  });

  it("persists a closed due-time authority",()=>{
    expect(normalized).toContain("add column next_attempt_at timestamptz");
    expect(normalized).toContain("d.retry_classification='retryable'");
    expect(normalized).toContain("d.next_attempt_at<=now_at");
    expect(normalized).toContain("d.attempt_count<3");
    expect(normalized).toContain("then interval '5 minutes' else interval '1 minute'");
  });

  it.each([
    ["rate_limited","retryable"],
    ["transient_provider_error","retryable"],
    ["ambiguous_send_result","requires_reconciliation"],
    ["provider_auth_error","configuration"],
    ["provider_rejected","terminal"],
    ["destination_invalid","terminal"],
  ])("closes failure classification %s as %s",(failure,classification)=>{
    expect(normalized).toContain(failure);
    expect(normalized).toContain(`target_retry_classification='${classification}'`);
  });

  it("keeps ambiguous and exhausted attempts terminal for automation",()=>{
    expect(normalized).toContain("then 'delivery_ambiguous'");
    expect(normalized).toContain("target_attempt_number>=3 then 'terminal'");
    expect(normalized).toContain("next_attempt_at=retry_at");
    expect(normalized).toContain("next_attempt_at=null");
  });

  it("does not count claim, revalidation, or pre-dispatch failure as attempts",()=>{
    const claim=normalized.slice(normalized.indexOf("create or replace function public.claim_whatsapp"),normalized.indexOf("create or replace function public.revalidate_whatsapp"));
    const revalidate=normalized.slice(normalized.indexOf("create or replace function public.revalidate_whatsapp"),normalized.indexOf("create function public.authorize_whatsapp"));
    const preDispatch=normalized.slice(normalized.indexOf("create function public.fail_whatsapp"),normalized.indexOf("drop function public.complete_whatsapp"));
    expect(claim).not.toContain("attempt_count=attempt_count+1");
    expect(revalidate).not.toContain("attempt_count");
    expect(preDispatch).not.toContain("attempt_count");
  });

  it("atomically creates the dispatch marker and increment",()=>{
    expect(normalized).toContain("set attempt_count=next_number,dispatch_started_at=now_at,dispatch_attempt_number=next_number,dispatch_token=target_dispatch_token,next_attempt_at=null");
    expect(normalized).toContain("insert into public.transport_send_attempts(delivery_command_id,attempt_number,started_at)");
  });

  it("rejects dispatch replay and attempt four with closed results",()=>{
    expect(normalized).toContain("'status','already_authorized'");
    expect(normalized).toContain("if d.attempt_count>=3");
    expect(normalized).toContain("'status','attempts_exhausted'");
  });

  it("fences completion to the exact current attempt",()=>{
    expect(normalized).toContain("d.dispatch_token<>target_dispatch_token");
    expect(normalized).toContain("d.dispatch_attempt_number<>target_attempt_number");
    expect(normalized).toContain("d.attempt_count<>target_attempt_number");
    expect(normalized).toContain("'status','stale_attempt'");
  });

  it("binds provider success once and clears retry timing without deleting history",()=>{
    expect(normalized).toContain("insert into public.transport_message_bindings");
    expect(normalized).toContain("provider_message_binding_id=mb.id");
    expect(normalized).not.toMatch(/dispatch_started_at\s*=\s*null/);
    expect(normalized).not.toMatch(/dispatch_token\s*=\s*null/);
  });

  it("uses service-only fixed-search-path authorities",()=>{
    expect(sql.match(/security definer set search_path=public,pg_temp/g)).toHaveLength(5);
    expect(sql.match(/auth\.role\(\)<>'service_role'/g)).toHaveLength(5);
    expect(normalized).toContain("from public,anon,authenticated");
    expect(normalized).toContain("to service_role");
  });

  it("does not introduce recovery or provider runtime scope",()=>{
    expect(normalized).not.toMatch(/execution_owner|lease_expires|reclaim|discover_recoverable|pg_cron|scheduler|openai|graph\.facebook|sendwhatsapptext/);
  });
});
