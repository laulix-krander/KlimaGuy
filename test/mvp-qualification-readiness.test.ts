import { describe, expect, it } from "vitest";
import { deriveMissingMvpRequiredFacts, evaluateMvpQualificationReadiness, MVP_OFFER_REQUIRED_FACT_GROUPS } from "@/lib/domain/mvp-qualification-readiness";
import type { MvpProjectFact } from "@/lib/domain/mvp-project-facts";

const PROJECT = "00000000-0000-4000-8000-000000000001";
const corePhotos = ["room_overview", "indoor_unit_location", "outdoor_unit_location"].map((category) => ({ project_id: PROJECT, category, media_type: "image", mime_type: "image/jpeg", upload_status: "ready", deleted_at: null }));
const complete: MvpProjectFact[] = [
  { key: "installation_address", value: "Musterstraße 1, 12345 Musterstadt" },
  { key: "postal_code", value: "12345" }, { key: "city", value: "Musterstadt" },
  { key: "building_type", value: "single_family_house" },
  { key: "requested_room_count", value: 1 }, { key: "indoor_unit_count", value: 1 },
  { key: "room_type", value: "living_room" }, { key: "room_area_sqm", value: 24 },
  { key: "indoor_unit_position", value: "Wohnzimmer Außenwand" },
  { key: "outdoor_unit_position", value: "Balkon" }, { key: "line_route", value: "Direkt durch die Außenwand" },
  { key: "estimated_line_length_m", value: 4 }, { key: "condensate_drainage", value: "not_available" },
  { key: "electrical_supply", value: "available" }, { key: "installation_access", value: "standard_ladder" },
];

const photos = [...corePhotos, { ...corePhotos[0], category: "electrical_connection" }];

describe("deterministische MVP-Angebotsbereitschaft", () => {
  it("projects the production gaps in canonical policy order", () => {
    const productionFacts: MvpProjectFact[] = [
      { key: "installation_address", value: "Glashütterweg 14" }, { key: "postal_code", value: "22889" },
      { key: "city", value: "tangstedt" }, { key: "floor_level", value: 1 }, { key: "requested_room_count", value: 1 },
      { key: "room_type", value: "living_room" }, { key: "indoor_unit_position", value: "Unter dem Fenster" },
      { key: "outdoor_unit_position", value: "Terrasse" },
    ];
    expect(MVP_OFFER_REQUIRED_FACT_GROUPS).toHaveLength(15);
    expect(deriveMissingMvpRequiredFacts(productionFacts)).toEqual([
      "building_type", "room_area_sqm", "indoor_unit_count", "line_route", "estimated_line_length_m",
      "condensate_drainage", "electrical_supply", "installation_access",
    ]);
  });
  it("accepts the smallest reviewable fact set", () => expect(evaluateMvpQualificationReadiness(complete, PROJECT, photos)).toEqual({ ready: true, missingFacts: [], missingPhotos: [], requiresSiteCheck: false }));
  it("blocks readiness when core photos are complete but an applicable situational photo is missing", () => {
    expect(evaluateMvpQualificationReadiness(complete, PROJECT, corePhotos)).toMatchObject({ ready: false, missingPhotos: ["electrical_connection"] });
  });
  it("keeps a model readiness proposal in qualification when a required fact is absent", () => {
    expect(evaluateMvpQualificationReadiness(complete.filter((fact) => fact.key !== "line_route"), PROJECT, photos)).toMatchObject({ ready: false, missingFacts: ["line_route"] });
  });
  it("never lets an electrical photo override a required site check", () => {
    expect(evaluateMvpQualificationReadiness(complete.map((fact) => fact.key === "electrical_supply" ? { key: "electrical_supply", value: "requires_site_check" } : fact), PROJECT, photos)).toMatchObject({ ready: false, missingPhotos: [], requiresSiteCheck: true });
  });
  it("never lets a condensate photo override a required site check", () => {
    const siteCheckFacts: MvpProjectFact[] = complete.map((fact) => fact.key === "condensate_drainage" ? { key: "condensate_drainage", value: "requires_site_check" } : fact);
    expect(evaluateMvpQualificationReadiness(siteCheckFacts, PROJECT, [...photos, { ...photos[0], category: "condensate_route" }])).toMatchObject({ ready: false, missingPhotos: [], requiresSiteCheck: true });
  });
  it.each(["condensate_drainage", "electrical_supply"] as const)("blocks unknown %s", (key) => {
    expect(evaluateMvpQualificationReadiness(complete.map((fact) => fact.key === key ? { key, value: "unknown" } : fact)).ready).toBe(false);
  });
  it("routes special access away from normal readiness", () => {
    expect(evaluateMvpQualificationReadiness(complete.map((fact) => fact.key === "installation_access" ? { key: "installation_access", value: "special_access_required" } : fact), PROJECT, photos)).toMatchObject({ ready: false, requiresSiteCheck: true });
  });
});
