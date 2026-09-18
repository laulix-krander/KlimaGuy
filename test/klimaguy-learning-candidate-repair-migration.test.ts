import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = path.join(
  process.cwd(),
  "supabase/migrations/202609180003_fix_learning_candidate_json_validation.sql",
);
const sql = fs.readFileSync(migrationPath, "utf8");

describe("Learning Candidate JSON validation repair migration", () => {
  it("replaces the deployed function without changing its public signature", () => {
    expect(sql).toMatch(
      /create or replace function public\.record_klimaguy_learning_candidates\(target_turn_id uuid,target_candidates jsonb\)/i,
    );
    expect(sql).toContain("grant execute on function public.record_klimaguy_learning_candidates(uuid,jsonb) to service_role");
  });

  it("requires all four allowed keys and rejects every additional key", () => {
    expect(sql).toContain("item ?& array['category','title','proposed_guidance','rationale']=false");
    expect(sql).toContain("(item-array['category','title','proposed_guidance','rationale']::text[])<>'{}'::jsonb");
  });

  it("never calls the nonexistent jsonb_object_length function", () => {
    expect(sql.toLowerCase()).not.toContain("jsonb_object_length(");
  });
});
