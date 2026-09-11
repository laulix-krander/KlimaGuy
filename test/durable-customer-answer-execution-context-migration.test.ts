import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/202609100007_durable_customer_answer_execution_context.sql", "utf8");

describe("AP-16-06-06D-22 durable customer answer context", () => {
  it("stores one small immutable authority record per command without customer text", () => {
    expect(migration).toContain("create table public.customer_answer_execution_contexts");
    expect(migration).toContain("command_id uuid primary key");
    expect(migration).toContain("customer_answer_execution_contexts_immutable");
    expect(migration).not.toMatch(/customer_answer_execution_contexts[\s\S]{0,1200}(message_text|raw_provider|provider_payload)/);
  });

  it("bootstraps direct and rehabilitated original lineage idempotently", () => {
    expect(migration).toContain("bootstrap_customer_answer_execution_context");
    expect(migration).toContain("direct_current_binding");
    expect(migration).toContain("legacy_original_binding");
    expect(migration).toContain("rehabilitated_original_lineage");
    expect(migration).toContain("recovery_of_pending_interaction_id");
    expect(migration).toContain("recovery_of_snapshot_id=original_snapshot.id");
    expect(migration).toContain("'code','reused'");
  });

  it("loads durable input separately from current mutation authority", () => {
    expect(migration).toContain("get_customer_answer_execution_context");
    expect(migration).toContain("c.current_project_id is distinct from cmd.project_id");
    expect(migration).toContain("r.knowledge_state_version<>cmd.expected_knowledge_version");
    expect(migration).toContain("aec.selected_action");
    expect(migration).toContain("aec.rendered_interaction");
    expect(migration).not.toContain("r.revision<>cmd.expected_runtime_revision");
  });

  it("does not resend, copy messages, create recovery rows, or reset counters", () => {
    const afterBootstrap = migration.slice(migration.indexOf("create function public.bootstrap_customer_answer_execution_context"));
    expect(afterBootstrap).not.toMatch(/insert into public\.conversation_messages/);
    expect(afterBootstrap).not.toMatch(/insert into public\.conversation_pending_interactions/);
    expect(afterBootstrap).not.toMatch(/insert into public\.conversation_interaction_snapshots/);
    expect(afterBootstrap).not.toMatch(/update public\.conversation_cycle_commands/);
    expect(afterBootstrap).not.toMatch(/ai_inference_attempt_count\s*=\s*0/);
  });

  it("retains conversation + decision + answer interpretation idempotency", () => {
    expect(migration).toContain("cmd.conversation_id::text||':'||(aec.selected_action->>'decision_id')||':'||m.id::text");
    expect(migration).not.toContain("'answer:'||m.id");
  });
});
