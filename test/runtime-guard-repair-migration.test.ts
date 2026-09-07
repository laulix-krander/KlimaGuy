import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migrationPath = "supabase/migrations/202609070001_isolate_pending_interaction_runtime_guard.sql";
const sql = readFileSync(migrationPath, "utf8");
const pendingBranch = sql.match(
  /if tg_table_name = 'conversation_pending_interactions' then([\s\S]*?)\n  end if;/,
)?.[1];

describe("runtime guard repair migration", () => {
  it("isolates every pending-interaction identity field in an explicit table branch", () => {
    expect(pendingBranch).toBeDefined();

    for (const field of [
      "conversation_id",
      "project_id",
      "decision_id",
      "selected_action_type",
      "information_key",
      "entity_type",
      "entity_id",
      "template_key",
      "template_version",
      "answer_type",
      "expected_knowledge_state_version",
      "runtime_revision",
    ]) {
      expect(pendingBranch).toContain(`new.${field} <> old.${field}`);
    }

    expect(pendingBranch).toContain("raise exception 'pending_interaction_identity_immutable'");
  });

  it("never reads decision_id for a runtime-state row", () => {
    expect(sql.match(/new\.decision_id/g)).toHaveLength(1);
    expect(pendingBranch).toContain("new.decision_id");
    expect(sql.replace(pendingBranch ?? "", "")).not.toMatch(/(?:new|old)\.decision_id/);
  });

  it("retains the shared authority requirement and successful UPDATE return", () => {
    expect(sql).toMatch(
      /coalesce\(\s*current_setting\('app\.runtime_authority_mutation', true\),\s*''\s*\) <> 'allowed'/,
    );
    expect(sql).toContain("raise exception 'runtime_mutation_requires_authority'");
    expect(sql).toMatch(/return new;\s*end\s*\$\$;/);
  });

  it("replaces only the guard function and leaves first-contact and trigger contracts untouched", () => {
    expect(sql).toMatch(/create or replace function public\.guard_runtime_identity\(\)/);
    expect(sql).not.toContain("commit_first_contact_initial_prompt");
    expect(sql).not.toMatch(/create (?:constraint )?trigger|drop trigger|alter table/i);
  });
});
