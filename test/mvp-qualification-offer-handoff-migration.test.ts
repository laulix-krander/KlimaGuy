import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("supabase/migrations/202609140004_mvp_qualification_offer_handoff.sql", "utf8");

describe("MVP qualification-to-offer handoff authority", () => {
  it("runs inside the existing lifecycle-fenced idempotent turn commit", () => {
    expect(sql).toContain("turn_row.status='completed'");
    expect(sql).toContain("c.current_project_id<>turn_row.project_id");
    expect(sql).toContain("c.revision<>turn_row.expected_conversation_revision");
    expect(sql).toContain("b.revision<>turn_row.binding_revision");
  });
  it("uses canonical facts and downgrades an unsupported ready proposal", () => {
    for (const key of ["installation_address", "requested_room_count", "indoor_unit_count", "indoor_unit_position", "outdoor_unit_position", "line_route"]) expect(sql).toContain(key);
    expect(sql).toContain("target_qualification_status='ready_for_offer' and not server_ready then 'in_progress'");
    expect(sql).toContain("requires_site_check");
  });
  it("maps only validated readiness to technical review and never clears human review", () => {
    expect(sql).toContain("set status='technical_review',requires_human_review=true");
    expect(sql).toContain("target_qualification_status='needs_human' and target_needs_human");
    expect(sql).not.toContain("requires_human_review=false");
  });
  it("does not create, price, approve, or send an offer", () => {
    expect(sql).not.toMatch(/insert into public\.project_offers/i);
    expect(sql).not.toMatch(/target_price|mark_project_offer_created|mark_project_offer_sent|accept_project_offer/i);
  });
});
