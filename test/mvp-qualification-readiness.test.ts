import { describe, expect, it } from "vitest";
import { evaluateMvpQualificationReadiness } from "@/lib/domain/mvp-qualification-readiness";
import type { MvpProjectFact } from "@/lib/domain/mvp-project-facts";

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

describe("deterministische MVP-Angebotsbereitschaft", () => {
  it("accepts the smallest reviewable fact set", () => expect(evaluateMvpQualificationReadiness(complete)).toEqual({ ready: true, missingFacts: [], requiresSiteCheck: false }));
  it("keeps a model readiness proposal in qualification when a required fact is absent", () => {
    expect(evaluateMvpQualificationReadiness(complete.filter((fact) => fact.key !== "line_route"))).toMatchObject({ ready: false, missingFacts: ["line_route"] });
  });
  it("never treats a required site check as offer-ready", () => {
    expect(evaluateMvpQualificationReadiness(complete.map((fact) => fact.key === "electrical_supply" ? { key: "electrical_supply", value: "requires_site_check" } : fact))).toMatchObject({ ready: false, requiresSiteCheck: true });
  });
  it.each(["condensate_drainage", "electrical_supply"] as const)("blocks unknown %s", (key) => {
    expect(evaluateMvpQualificationReadiness(complete.map((fact) => fact.key === key ? { key, value: "unknown" } : fact)).ready).toBe(false);
  });
  it("routes special access away from normal readiness", () => {
    expect(evaluateMvpQualificationReadiness(complete.map((fact) => fact.key === "installation_access" ? { key: "installation_access", value: "special_access_required" } : fact))).toMatchObject({ ready: false, requiresSiteCheck: true });
  });
});
