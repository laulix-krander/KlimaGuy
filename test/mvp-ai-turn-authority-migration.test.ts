import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("supabase/migrations/202609140001_mvp_ai_turn_authority.sql", "utf8");
describe("MVP AI turn authority migration", () => {
  it("claims one turn per inbound and bounds context to its Conversation", () => {
    expect(sql).toContain("unique (inbound_message_id)"); expect(sql).toContain("history.conversation_id=c.id"); expect(sql).toContain("limit 40");
    expect(sql).toContain("c.engine_owner<>'mvp'");
  });
  it("atomically applies Step-6 facts and schedules the existing delivery command", () => {
    expect(sql).toContain("perform public.apply_mvp_project_fact_patch");
    expect(sql).toContain("insert into public.transport_delivery_commands");
    expect(sql).toContain("c.revision<>turn_row.expected_conversation_revision");
  });
});
