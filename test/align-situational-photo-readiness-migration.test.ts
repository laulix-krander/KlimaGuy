import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = "supabase/migrations/202609150003_align_situational_photo_readiness.sql";
const sql = readFileSync(migration, "utf8");

describe("situational photo readiness SQL alignment", () => {
  it("keeps the exact public RPC signature and only replaces its body", () => {
    expect(sql).toContain("create or replace function public.commit_mvp_ai_turn(target_turn_id uuid, target_facts_patch jsonb,\n target_customer_name_patch jsonb, target_media_classifications jsonb, target_reply_text text, target_qualification_status text, target_needs_human boolean, target_human_reason text)");
    expect(sql).toContain("commit_mvp_ai_turn(uuid,jsonb,jsonb,jsonb,text,text,boolean,text)");
    expect(sql).not.toMatch(/create\s+table/i);
    expect(sql).not.toContain("qualification_runs");
  });

  it("builds one ordered required-photo array from the canonical policy", () => {
    expect(sql).toContain("required_photos:=array['room_overview','indoor_unit_location','outdoor_unit_location']::text[]");
    expect(sql).toMatch(/not exists\(select 1 from public\.mvp_project_facts where project_id=turn_row\.project_id and fact_key='line_route'\)[\s\S]*array\['pipe_route'\]/);
    expect(sql).toMatch(/fact_key='electrical_supply' and fact_value in \('\"available\"'::jsonb,'\"unknown\"'::jsonb,'\"requires_site_check\"'::jsonb\)[\s\S]*array\['electrical_connection'\]/);
    expect(sql).toMatch(/fact_key='condensate_drainage' and fact_value in \('\"unknown\"'::jsonb,'\"requires_site_check\"'::jsonb\)[\s\S]*array\['condensate_route'\]/);
  });

  it("reuses the same array for projection and complete missing-photo authority", () => {
    expect(sql).toContain("values(turn_row.project_id,'required_photo_categories',to_jsonb(required_photos))");
    expect(sql).toContain("from unnest(required_photos) with ordinality");
    for (const filter of ["pm.project_id=turn_row.project_id", "pm.upload_status='ready'", "pm.deleted_at is null", "pm.media_type='image'", "pm.mime_type in ('image/jpeg','image/png','image/webp')", "pm.category=required_category"]) expect(sql).toContain(filter);
    expect(sql).toContain("server_ready:=cardinality(missing_keys)=0 and cardinality(missing_photos)=0 and not requires_site_check");
  });

  it("preserves unknown and site-check blockers independently of photos", () => {
    expect(sql).toContain("f.fact_key in ('condensate_drainage','electrical_supply') and f.fact_value in ('\"unknown\"'::jsonb,'\"requires_site_check\"'::jsonb)");
    expect(sql).toContain("f.fact_key='installation_access' and f.fact_value in ('\"unknown\"'::jsonb,'\"special_access_required\"'::jsonb)");
  });
});
