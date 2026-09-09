import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const originalPath = "supabase/migrations/202609090001_production_cycle_schema_reconciliation.sql";
const repairPath = "supabase/migrations/202609090002_production_reconciliation_type_compatibility_fix.sql";

const requiredTypes = new Map([
  ["project_id", "uuid"],
  ["execution_at", "timestamp with time zone"],
  ["event_ids", "uuid[]"],
  ["event_sequence_start", "integer"],
  ["commit_payload_hash", "bytea"],
]);

describe("AP-16-06-06D-3A catalog type compatibility repair", () => {
  it("uses exact PostgreSQL type OIDs, including the distinct uuid[] OID", async () => {
    const sql = await readFile(repairPath, "utf8");

    expect(sql).toContain("a.atttypid<>pg_catalog.to_regtype(e.type_name)::oid");
    expect(sql).toContain("('event_ids','uuid[]',false)");
    expect(sql).not.toContain("c.data_type<>e.type_name");
    expect(sql).not.toContain("information_schema.columns");

    // PostgreSQL resolves uuid and uuid[] to different type OIDs. The validator
    // therefore accepts the declared array identity and rejects scalar uuid.
    expect(requiredTypes.get("event_ids")).toBe("uuid[]");
    expect(requiredTypes.get("event_ids")).not.toBe("uuid");
  });

  it("retains exact checks for every required type family and counter nullability", async () => {
    const sql = await readFile(repairPath, "utf8");

    for (const [column, type] of requiredTypes) {
      expect(sql).toContain(`('${column}','${type}',false)`);
    }
    expect(sql).toContain("('execution_attempt_count','integer',true)");
    expect(sql).toContain("('ai_inference_attempt_count','integer',true)");
    expect(sql).toContain("not a.attnotnull");
    expect(sql).toContain("ai_inference_attempt_count between 0 and 3");
  });

  it("reinstalls the same productive authority without changing recovery behavior", async () => {
    const [original, repair] = await Promise.all([
      readFile(originalPath, "utf8"),
      readFile(repairPath, "utf8"),
    ]);
    const unchangedAuthorityMarker =
      "alter table public.conversation_cycle_commands alter column execution_attempt_count set default 0;";

    expect(repair.slice(repair.indexOf(unchangedAuthorityMarker))).toBe(
      original.slice(original.indexOf(unchangedAuthorityMarker)),
    );
    for (const fn of [
      "claim_customer_message_cycle",
      "get_customer_message_cycle_context",
      "acquire_customer_message_cycle_execution",
      "discover_recoverable_conversation_cycles",
      "fail_customer_message_cycle",
      "commit_customer_message_cycle",
      "complete_customer_message_human_review",
      "reserve_customer_answer_ai_inference_attempt",
      "defer_customer_message_ai_retry",
      "discover_missing_customer_answer_cycles",
    ]) {
      expect(repair).toMatch(new RegExp(`create or replace function public\\.${fn}\\(`));
    }
    expect(repair).toContain(
      "revoke all on function public.discover_missing_customer_answer_cycles(integer) from public,anon,authenticated",
    );
    expect(repair).toContain(
      "grant execute on function public.discover_missing_customer_answer_cycles(integer) to service_role",
    );
    expect(repair).not.toMatch(
      /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i,
    );
  });
});
