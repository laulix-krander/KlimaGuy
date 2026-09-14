import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("supabase/migrations/202609140003_mvp_current_project_vision.sql", "utf8");

describe("MVP current-project Vision authority", () => {
  it("selects only ready, supported, non-deleted media with current Project and Conversation provenance", () => {
    expect(sql).toContain("pm.project_id=c.current_project_id and pm.source_conversation_id=c.id");
    expect(sql).toContain("pm.source_message_id=m.id");
    expect(sql).toContain("pm.upload_status='ready' and pm.deleted_at is null");
    expect(sql).toContain("pm.mime_type in ('image/jpeg','image/png','image/webp')");
  });

  it("consumes an image once and fences the lifecycle before inference", () => {
    expect(sql).toContain("unique (project_media_id)");
    expect(sql).toContain("c.current_project_id=t.project_id");
    expect(sql).toContain("c.revision=t.expected_conversation_revision");
    expect(sql).toContain("b.status='active' and b.revision=t.binding_revision");
  });

  it("keeps private storage locators behind a service-role-only authority", () => {
    expect(sql).toContain("'storage_bucket',pm.storage_bucket,'storage_path',pm.storage_path");
    expect(sql).toContain("grant execute on function public.revalidate_mvp_ai_turn(uuid) to service_role");
    expect(sql).not.toMatch(/update\s+storage\.buckets\s+set\s+public\s*=\s*true/i);
  });
});
