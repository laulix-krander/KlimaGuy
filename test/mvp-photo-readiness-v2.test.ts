import { describe, expect, it } from "vitest";
import { deriveSituationalPhotoCategories, evaluateMvpPhotoReadiness } from "@/lib/domain/mvp-photo-policy";
import { mvpAiTurnResultSchema, mvpVisionObservationSchema } from "@/lib/domain/mvp-ai-turn";
import type { MvpProjectFact } from "@/lib/domain/mvp-project-facts";

const project = "00000000-0000-4000-8000-000000000001";
const image = (category: string, change = {}) => ({ project_id: project, category, media_type: "image", mime_type: "image/jpeg", upload_status: "ready", deleted_at: null, ...change });
const facts = (values: Record<string, unknown>) => Object.entries(values).map(([key, value]) => ({ key, value })) as MvpProjectFact[];

describe("Photo Readiness V2", () => {
  it("requires the core photos plus pipe route when no canonical facts exist", () => {
    expect(evaluateMvpPhotoReadiness(project, [], [])).toMatchObject({
      missingCore: ["room_overview", "indoor_unit_location", "outdoor_unit_location"],
      missingSituational: ["pipe_route"],
      ready: false,
    });
  });

  it.each([
    ["ordinary prose", "durch den Flur"],
    ["prose containing offen", "Der Verlauf ist offen entlang der Wand"],
  ])("uses presence of line_route, not %s semantics", (_case, value) => {
    expect(deriveSituationalPhotoCategories(facts({ line_route: value }))).not.toContain("pipe_route");
  });

  it.each([
    [{}, ["pipe_route"]],
    [{ line_route: "Außenwand" }, []],
    [{ electrical_supply: "available" }, ["pipe_route", "electrical_connection"]],
    [{ electrical_supply: "not_available" }, ["pipe_route"]],
    [{ electrical_supply: "unknown" }, ["pipe_route", "electrical_connection"]],
    [{ electrical_supply: "requires_site_check" }, ["pipe_route", "electrical_connection"]],
    [{ condensate_drainage: "available" }, ["pipe_route"]],
    [{ condensate_drainage: "not_available" }, ["pipe_route"]],
    [{ condensate_drainage: "unknown" }, ["pipe_route", "condensate_route"]],
    [{ condensate_drainage: "requires_site_check" }, ["pipe_route", "condensate_route"]],
  ])("keeps canonical fact/photo policy parity for %j", (state, expected) => {
    expect(deriveSituationalPhotoCategories(facts(state))).toEqual(expected);
  });

  it("requires applicable situational coverage for combined readiness", () => {
    const media = [image("room_overview"), image("indoor_unit_location"), image("outdoor_unit_location")];
    expect(evaluateMvpPhotoReadiness(project, facts({ line_route: "Außenwand", electrical_supply: "available" }), media)).toMatchObject({
      coreReady: true, missingSituational: ["electrical_connection"], ready: false,
    });
    expect(evaluateMvpPhotoReadiness(project, facts({ line_route: "Außenwand", electrical_supply: "available" }), [...media, image("electrical_connection")]).ready).toBe(true);
  });

  it.each([
    ["other", image("other")],
    ["deleted", image("room_overview", { deleted_at: "2026-09-15T00:00:00Z" })],
    ["pending", image("room_overview", { upload_status: "pending" })],
    ["wrong project", image("room_overview", { project_id: crypto.randomUUID() })],
    ["document", image("room_overview", { media_type: "document", mime_type: "application/pdf" })],
    ["unsupported image", image("room_overview", { mime_type: "image/gif" })],
  ])("does not count %s media", (_name, item) => expect(evaluateMvpPhotoReadiness(project, [], [item]).missingCore).toContain("room_overview"));
});

describe("safe Vision output", () => {
  it("allows an ambiguous current image to remain unclassified", () => expect(mvpAiTurnResultSchema.safeParse({ reply_text: "Was zeigt das Bild?", facts_patch: [], qualification_status: "in_progress", needs_human: false, human_reason: null, customer_name_patch: null, media_classifications: [{ media_id: crypto.randomUUID(), category: null, observation: null }] }).success).toBe(true));
  it.each(["Wand technisch geeignet", "Stromkreis ausreichend", "Kernbohrung sicher", "Vor Ort besichtigt", "Abstand 120 cm"])("rejects technical certainty: %s", (claim) => expect(mvpVisionObservationSchema.safeParse(claim).success).toBe(false));
});
