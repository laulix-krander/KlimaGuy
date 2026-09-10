import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { classifyAcquisitionRpcError } from "@/lib/server/conversation/acquisition-rpc-diagnostics";

describe("D-19 acquisition diagnostics", () => {
  it.each([
    ["23502", "not_null_violation"], ["23503", "foreign_key_violation"],
    ["23505", "unique_violation"], ["23514", "check_violation"],
    ["P0001", "raised_exception"], ["ZZZZZ", "database_error"],
  ])("maps SQLSTATE %s without forwarding details", (code, summary) => {
    expect(classifyAcquisitionRpcError({ code, message: "customer secret" }))
      .toEqual({ safe_rpc_code: code, safe_rpc_summary: summary });
  });

  it("accepts only a static D-19 phase and never returns the raw message", () => {
    const diagnostic = classifyAcquisitionRpcError({
      code: "23514", message: "d19_db_stage:runtime_update customer secret",
      details: "private row", hint: "private hint",
    });
    expect(diagnostic).toEqual({ safe_rpc_code: "23514", safe_rpc_summary: "check_violation", safe_db_stage: "runtime_update" });
    expect(JSON.stringify(diagnostic)).not.toContain("secret");
    expect(classifyAcquisitionRpcError({ code: "23514", message: "d19_db_stage:not_allowed" })).not.toHaveProperty("safe_db_stage");
  });

  it("keeps rollback semantics and labels every D-18 write phase", () => {
    const sql = readFileSync("supabase/migrations/202609100004_legacy_rehabilitation_acquisition_diagnostics.sql", "utf8");
    for (const stage of ["eligibility", "recovery_pending_insert", "recovery_snapshot_insert", "effort_state_update", "runtime_update", "command_rehabilitation_update", "audit_insert", "downstream_acquisition"]) {
      expect(sql).toContain(`d19_db_stage${stage === "eligibility" ? " text:=" : ":="}'${stage}'`);
    }
    expect(sql).toContain("raise exception using errcode=sqlstate,message='d19_db_stage:'||d19_db_stage");
    expect(sql).not.toContain("return jsonb_build_object('success',false,'code','database_error'");
  });
});
