import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("supabase/migrations/202609130002_mvp_conversation_engine_routing.sql", "utf8");

describe("Conversation engine ownership migration", () => {
  it("backfills legacy, serializes first ownership and fences later mutation", () => {
    expect(sql).toContain("update public.conversations set engine_owner='legacy'");
    expect(sql).toContain("where id=target_conversation_id for update");
    expect(sql).toContain("if c.engine_owner is null then");
    expect(sql).toContain("conversation_engine_owner_immutable");
  });

  it("binds resolution to the active identity and excludes MVP from legacy recovery", () => {
    expect(sql).toContain("b.status='active'");
    expect(sql).toContain("i.external_identity=target_external_identity");
    expect(sql).toContain("c.engine_owner<>'legacy'");
    expect(sql).toContain("c.engine_owner='legacy'");
  });
});
