import { describe, expect, it } from "vitest";
import { deriveSituationalPhotoCategories, evaluateMvpPhotoReadiness } from "@/lib/domain/mvp-photo-policy";
import { mvpAiTurnResultSchema, mvpVisionObservationSchema } from "@/lib/domain/mvp-ai-turn";
import type { MvpProjectFact } from "@/lib/domain/mvp-project-facts";

const project = "00000000-0000-4000-8000-000000000001";
const image = (category: string, change = {}) => ({ project_id: project, category, media_type: "image", mime_type: "image/jpeg", upload_status: "ready", deleted_at: null, ...change });

describe("Photo Readiness V2", () => {
  it("requires all three core categories and never maps other to a room overview", () => {
    expect(evaluateMvpPhotoReadiness(project, [], []).coreReady).toBe(false);
    expect(evaluateMvpPhotoReadiness(project, [], [image("other")]).missingCore).toContain("room_overview");
    expect(evaluateMvpPhotoReadiness(project, [], [image("room_overview")]).coreReady).toBe(false);
    expect(evaluateMvpPhotoReadiness(project, [], [image("room_overview"), image("indoor_unit_location"), image("outdoor_unit_location")]).coreReady).toBe(true);
  });
  it.each([
    ["deleted", image("room_overview", { deleted_at: "2026-09-15T00:00:00Z" })], ["pending", image("room_overview", { upload_status: "pending" })],
    ["wrong project", image("room_overview", { project_id: crypto.randomUUID() })], ["document", image("room_overview", { media_type: "document", mime_type: "application/pdf" })],
  ])("does not count %s media", (_name, item) => expect(evaluateMvpPhotoReadiness(project, [], [item]).missingCore).toContain("room_overview"));
  it("derives situational needs from canonical facts", () => {
    expect(deriveSituationalPhotoCategories([])).toEqual(["pipe_route"]);
    expect(deriveSituationalPhotoCategories([{ key: "line_route", value: "durch den Flur" }, { key: "electrical_supply", value: "available" }, { key: "condensate_drainage", value: "requires_site_check" }] as MvpProjectFact[])).toEqual(["electrical_connection", "condensate_route"]);
  });
});

describe("safe Vision output", () => {
  it("allows an ambiguous current image to remain unclassified", () => expect(mvpAiTurnResultSchema.safeParse({ reply_text: "Was zeigt das Bild?", facts_patch: [], qualification_status: "in_progress", needs_human: false, human_reason: null, customer_name_patch: null, media_classifications: [{ media_id: crypto.randomUUID(), category: null, observation: null }] }).success).toBe(true));
  it.each(["Wand technisch geeignet", "Stromkreis ausreichend", "Kernbohrung sicher", "Vor Ort besichtigt", "Abstand 120 cm"])("rejects technical certainty: %s", (claim) => expect(mvpVisionObservationSchema.safeParse(claim).success).toBe(false));
});
