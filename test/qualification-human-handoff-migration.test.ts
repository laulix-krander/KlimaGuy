import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const sql = readFileSync("supabase/migrations/202609170001_qualification_human_handoff.sql", "utf8");
describe("qualification human handoff migration", () => {
  it("projects canonical handoff state without changing RPC signatures", () => {
    expect(sql).toContain("'status',project_row.status,'requires_human_review',project_row.requires_human_review");
    expect(sql).toContain("acquire_mvp_ai_turn(target_conversation_id uuid,target_inbound_message_id uuid)");
    expect(sql).toContain("commit_mvp_ai_turn(target_turn_id uuid, target_facts_patch jsonb");
  });
  it("advances only pre-offer projects and gives escalation priority", () => {
    expect(sql).toContain("p.status in ('new','collecting_information')");
    expect(sql).toContain("set status='human_review',requires_human_review=true");
    for (const status of ["quote_draft", "quote_sent", "accepted", "rejected", "closed"])
      expect(sql).not.toContain(`p.status='${status}' then`);
    expect(sql.indexOf("set status='human_review'")).toBeLessThan(sql.indexOf("set status='technical_review'"));
    expect(sql).toContain("return jsonb_build_object('status','stale')");
  });
});
