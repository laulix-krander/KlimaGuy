import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("supabase/migrations/202609080001_ai_cycle_attempt_claimless_technical_escalation_authority.sql", "utf8");

describe("AP-16-06-06D-1B migration authority", () => {
  it("defines a separate bounded inference-attempt authority", () => {
    expect(sql).toContain("add column ai_inference_attempt_count integer not null default 0");
    expect(sql).toContain("conversation_cycle_commands_ai_inference_attempt_count_check");
    expect(sql).toContain("check (ai_inference_attempt_count between 0 and 3)");
    expect(sql).toContain("new.ai_inference_attempt_count > old.ai_inference_attempt_count + 1");
    expect(sql).not.toContain("execution_attempt_count=execution_attempt_count+1");
  });

  it("serializes reservations and refuses a fourth local request", () => {
    expect(sql).toMatch(/reserve_customer_answer_ai_inference_attempt[\s\S]*conversation_cycle_commands where id=target_command_id for update/);
    expect(sql).toContain("if cmd.ai_inference_attempt_count>=3 then return jsonb_build_object('success',false,'code','attempts_exhausted')");
    expect(sql).toContain("set ai_inference_attempt_count=next_attempt");
    expect(sql).toContain("auth.role()<>'service_role'");
  });

  it("defers only recoverable failures through the existing lease", () => {
    expect(sql).toContain("failure_code not in ('ai_timeout','ai_transient_provider_failure')");
    expect(sql).toContain("statement_timestamp()+interval '1 minute'");
    expect(sql).toContain("set result_code=failure_code,execution_lease_expires_at=retry_at");
    expect(sql).not.toContain("create queue");
  });

  it("extends the one atomic commit with a mutation-free no-claim branch", () => {
    expect(sql).toContain("('transition_applied','no_claim')");
    expect(sql).toContain("else resulting_version:=cmd.expected_knowledge_version");
    expect(sql).toContain("set status='answered',answered_by_message_id=cmd.source_message_id");
    expect(sql).toContain("set status='completed'");
  });

  it("uses the existing review state machine and content-free reason allowlist", () => {
    for (const reason of ["ai_configuration_failure", "ai_attempts_exhausted", "ai_non_transient_failure"]) expect(sql).toContain(reason);
    expect(sql).toContain("conversation_cycle_technical_human_review_requested");
    expect(sql).toContain("status='human_review_required'");
    expect(sql).not.toMatch(/openai|provider_error|customer_text/i);
  });
});
