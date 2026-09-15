import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const sql = readFileSync("supabase/migrations/202609150002_photo_request_vision_readiness_v2.sql", "utf8");
describe("Photo/Vision SQL authority", () => {
  it("never promotes other to room overview", () => { expect(sql).not.toMatch(/else\s+'room_overview'/); expect(sql).toContain("else 'other'"); });
  it("counts only usable canonical project media", () => { for (const token of ["pm.project_id=turn_row.project_id", "pm.upload_status='ready'", "pm.deleted_at is null", "pm.media_type='image'", "pm.mime_type in", "pm.category=required_category"]) expect(sql).toContain(token); });
  it("only classifies media bound to this current turn and conversation", () => { for (const token of ["mvp_ai_turn_media", "tm.turn_id=turn_row.id", "pm.source_conversation_id=turn_row.conversation_id", "pm.source_message_id=turn_row.inbound_message_id", "media_not_bound_to_turn"]) expect(sql).toContain(token); });
  it("changes the exact commit signature", () => expect(sql).toContain("commit_mvp_ai_turn(uuid,jsonb,jsonb,jsonb,text,text,boolean,text)"));
});
