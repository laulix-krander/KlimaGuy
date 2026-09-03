import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { WHATSAPP_DELIVERY_LEASE_SECONDS, WHATSAPP_DELIVERY_RECOVERY_LIMIT } from "@/lib/server/whatsapp/outbound-delivery";

const migrationPath = "supabase/migrations/202609030001_whatsapp_delivery_lease_recovery_authority.sql";
const sql = readFileSync(migrationPath, "utf8");
const normalized = sql.replace(/\s+/g, " ").toLowerCase();

describe("AP-16-06-04C delivery lease and recovery authority", () => {
  it("defines a single 60-second execution lease independently of provider attempts", () => {
    expect(WHATSAPP_DELIVERY_LEASE_SECONDS).toBe(60);
    expect(normalized).toContain("add column execution_owner_id uuid");
    expect(normalized).toContain("add column execution_lease_expires_at timestamptz");
    expect(normalized).toContain("add column execution_attempt_count integer not null default 0");
    expect(normalized).toContain("lease_duration constant interval:=interval '60 seconds'");
    const acquire = normalized.slice(normalized.indexOf("create function public.acquire_whatsapp"), normalized.indexOf("create function public.revalidate_whatsapp"));
    expect(acquire).toContain("execution_attempt_count=execution_attempt_count+1");
    expect(acquire).not.toContain("attempt_count=attempt_count+1");
  });

  it("returns closed eligibility and busy results without dispatch mutation", () => {
    for (const status of ["busy", "already_terminal", "not_due", "retry_not_allowed", "ambiguous", "attempts_exhausted", "acquired"]) expect(normalized).toContain(`'status','${status}'`);
    expect(normalized).toContain("d.retry_classification<>'retryable'");
    expect(normalized).toContain("d.next_attempt_at>now_at");
    expect(normalized).toContain("d.attempt_count>=3");
    expect(normalized).toContain("d.execution_lease_expires_at>now_at");
  });

  it("reclaims only expired, persistently proven pre-dispatch work", () => {
    expect(normalized).toContain("where a.delivery_command_id=d.id and a.finished_at is null");
    expect(normalized).toContain("execution_owner_id=target_execution_owner_id");
    expect(normalized).toContain("execution_lease_expires_at=now_at+lease_duration");
    expect(normalized).not.toMatch(/update public\.transport_delivery_commands set attempt_count=attempt_count\+1/);
  });

  it("fences every post-acquire mutation inside its transaction", () => {
    expect(sql.match(/d\.execution_owner_id<>target_execution_owner_id or d\.execution_lease_expires_at<=now_at/g)).toHaveLength(4);
    expect(sql.match(/'status','ownership_lost'/g)).toHaveLength(4);
    expect(normalized).toContain("d.dispatch_token<>target_dispatch_token");
    expect(normalized).toContain("d.dispatch_attempt_number<>target_attempt_number");
    expect(normalized).toContain("d.attempt_count<>target_attempt_number");
  });

  it("finalizes expired post-dispatch and legacy sending work fail closed", () => {
    expect(normalized).toContain("create function public.finalize_expired_whatsapp_delivery_ambiguous");
    expect(normalized).toContain("status='delivery_ambiguous'");
    expect(normalized).toContain("retry_classification='requires_reconciliation'");
    expect(normalized).toContain("next_attempt_at=null");
    expect(normalized).toContain("result_class='ambiguous'");
    expect(normalized).toContain("if d.execution_owner_id is null then return jsonb_build_object('status','ambiguous'");
  });

  it("lets authoritative provider bindings and accepted terminal states win", () => {
    expect(normalized).toContain("d.provider_message_binding_id is not null or exists");
    expect(normalized).toContain("return jsonb_build_object('status','provider_binding_exists')");
    expect(normalized).toContain("d.status in ('accepted_by_provider','delivered','read','blocked','delivery_ambiguous')");
  });

  it("discovers only bounded content-free work with a DB-selected action", () => {
    expect(WHATSAPP_DELIVERY_RECOVERY_LIMIT).toBe(5);
    expect(normalized).toContain("returns table(delivery_command_id uuid,outbound_message_id uuid,recovery_action text)");
    expect(normalized).toContain("then 'finalize_ambiguous' else 'safe_to_run'");
    expect(normalized).toContain("limit least(greatest(coalesce(target_limit,5),0),5)");
    expect(normalized).toContain("order by coalesce(");
    const discovery = normalized.slice(normalized.indexOf("create function public.discover_recoverable"));
    expect(discovery).not.toMatch(/body|destination|external_identity|provider_payload|phone/);
  });

  it("makes every new authority service-role-only with fixed search paths", () => {
    expect(sql.match(/security definer set search_path=public,pg_temp/g)).toHaveLength(7);
    expect(sql.match(/auth\.role\(\)<>'service_role'/g)).toHaveLength(7);
    expect(normalized).toContain("from public,anon,authenticated");
    expect(normalized).toContain("to service_role");
  });

  it("stays inside the 04C boundary", () => {
    expect(normalized).not.toMatch(/pg_cron|pg_net|vault|graph\.facebook|sendwhatsapptext|openai|replanning|re-rendering/);
  });
});
