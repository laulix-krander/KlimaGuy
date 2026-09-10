import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const d18 = readFileSync(
  "supabase/migrations/202609100003_legacy_ai_exhaustion_human_review_rehabilitation.sql",
  "utf8",
);
const d19 = readFileSync(
  "supabase/migrations/202609100004_legacy_rehabilitation_acquisition_diagnostics.sql",
  "utf8",
);
const d20 = readFileSync(
  "supabase/migrations/202609100005_production_runtime_update_undefined_column_repair.sql",
  "utf8",
);

const runtimeColumns = new Set([
  "conversation_id", "project_id", "revision", "knowledge_state_version", "runtime_status",
  "active_pending_interaction_id", "active_evidence_request_id", "created_at", "updated_at",
]);

const triggerRecordFields = (expression: string) =>
  [...expression.matchAll(/\b(?:new|old)\.([a-z_]+)/g)].map((match) => match[1]);

describe("AP-16-06-06D-20 production runtime UPDATE repair", () => {
  it("reproduces the production 42703 at the first pending-only field in the D-18 guard", () => {
    const defectiveGuard = d18.match(
      /create or replace function public\.guard_runtime_identity\(\)[\s\S]*?end \$\$;/,
    )?.[0];
    expect(defectiveGuard).toBeDefined();

    const invalidRuntimeFields = triggerRecordFields(defectiveGuard ?? "")
      .filter((field) => !runtimeColumns.has(field));

    // PostgreSQL prepares the row-field expression for the runtime trigger record before
    // the SQL AND predicate can protect it. The first unresolved attribute is decision_id.
    expect(invalidRuntimeFields[0]).toBe("decision_id");
    expect(runtimeColumns.has("decision_id")).toBe(false);
  });

  it("resolves pending-only NEW/OLD fields solely inside the explicit pending table branch", () => {
    const pendingBranch = d20.match(
      /if tg_table_name = 'conversation_pending_interactions' then([\s\S]*?)\n  end if;/,
    )?.[1];
    expect(pendingBranch).toBeDefined();
    expect(pendingBranch).toContain("new.decision_id <> old.decision_id");
    expect(pendingBranch).toContain(
      "new.recovery_of_pending_interaction_id is distinct from old.recovery_of_pending_interaction_id",
    );
    expect(d20.replace(pendingBranch ?? "", "")).not.toMatch(
      /(?:new|old)\.(?:decision_id|recovery_of_pending_interaction_id)/,
    );
  });

  it("keeps every Runtime UPDATE column valid and retains authority and planner guards", () => {
    const update = d19.match(
      /update public\.conversation_runtime_states set ([^;]+);/,
    )?.[0];
    expect(update).toBeDefined();
    for (const column of [
      "revision", "runtime_status", "active_pending_interaction_id", "updated_at", "conversation_id",
    ]) expect(runtimeColumns.has(column)).toBe(true);
    expect(update).toContain("revision=next_revision");
    expect(update).toContain("runtime_status='awaiting_customer_answer'");
    expect(update).toContain("active_pending_interaction_id=recovery_pending_id");
    expect(d20).toContain("current_setting('app.runtime_authority_mutation', true)");
    expect(d20).toContain("raise exception 'runtime_mutation_requires_authority'");
    expect(d20).not.toMatch(/create (?:constraint )?trigger|drop trigger|alter table/i);
  });

  it("preserves the production-like D-18 to D-17 rehabilitation contract", () => {
    const rehabilitation = d19.slice(
      d19.indexOf("create or replace function public.rehabilitate_legacy_ai_exhaustion_human_review"),
      d19.indexOf("create or replace function public.acquire_customer_message_cycle_execution"),
    );
    for (const contract of [
      "cmd.status<>'human_review_required'", "cmd.result_code<>'ai_attempts_exhausted'",
      "cmd.inference_semantics_version<>1", "p.status<>'answered'",
      "p.answered_by_message_id is distinct from cmd.source_message_id", "'newer_customer_inbound'",
      "'human_review_provenance_missing'", "d19_db_stage:='recovery_pending_insert'",
      "d19_db_stage:='recovery_snapshot_insert'", "d19_db_stage:='effort_state_update'",
      "d19_db_stage:='runtime_update'", "runtime_status='awaiting_customer_answer'",
      "active_pending_interaction_id=recovery_pending_id", "expected_runtime_revision=next_revision",
      "inference_semantics_version=2", "d19_db_stage:='downstream_acquisition'",
    ]) expect(rehabilitation).toContain(contract);
    expect(rehabilitation).toContain("p.expected_knowledge_state_version,next_revision");
    expect(rehabilitation).toContain("s.knowledge_state_version");
    expect(rehabilitation).not.toMatch(/ai_inference_attempt_count\s*=/);
    expect(rehabilitation).not.toMatch(/insert into public\.conversation_messages/);
    expect(d19).toContain(
      "public.acquire_customer_message_cycle_execution_d17(target_message_id,execution_owner,lease_seconds)",
    );
  });

  it("keeps D-19 privacy-safe diagnostics unchanged", () => {
    expect(d19).toContain("raise exception using errcode=sqlstate,message='d19_db_stage:'||d19_db_stage");
    expect(d20).not.toContain("d19_db_stage");
  });
});
