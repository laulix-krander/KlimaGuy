import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = "supabase/migrations/202609160001_persist_current_turn_photo_classification.sql";
const sql = readFileSync(migration, "utf8");

describe("current-turn photo classification persistence migration", () => {
  it("keeps the public RPC signature and accepts and persists explicit other", () => {
    expect(sql).toContain("create or replace function public.commit_mvp_ai_turn(target_turn_id uuid, target_facts_patch jsonb,");
    expect(sql).toContain("commit_mvp_ai_turn(uuid,jsonb,jsonb,jsonb,text,text,boolean,text)");
    expect(sql).toContain("'condensate_route','other'");
    expect(sql).toContain("update public.project_media set category=classification->>'category'");
    expect(sql).toContain("or classification->>'category' is null");
  });

  it("retains strict current-turn, conversation, project, ready-image binding", () => {
    expect(sql).toContain("tm.turn_id=turn_row.id");
    expect(sql).toContain("pm.project_id=turn_row.project_id");
    expect(sql).toContain("pm.source_conversation_id=turn_row.conversation_id");
    expect(sql).toContain("pm.source_message_id=turn_row.inbound_message_id");
    expect(sql).toContain("pm.upload_status='ready'");
    expect(sql).toContain("pm.deleted_at is null");
    expect(sql).toContain("pm.media_type='image'");
    expect(sql).toContain("raise exception 'media_not_bound_to_turn'");
  });

  it("does not count other toward canonical readiness coverage", () => {
    expect(sql).toContain("pm.category=required_category");
    expect(sql).not.toContain("required_photos:=array['other']");
  });
});
