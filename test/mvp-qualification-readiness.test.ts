import { describe, expect, it } from "vitest";
import { evaluateMvpQualificationReadiness } from "@/lib/domain/mvp-qualification-readiness";
import type { MvpProjectFact } from "@/lib/domain/mvp-project-facts";

const complete: MvpProjectFact[] = [
  { key: "installation_address", value: "Musterstraße 1, 12345 Musterstadt" },
  { key: "requested_room_count", value: 1 }, { key: "indoor_unit_count", value: 1 },
  { key: "indoor_unit_position", value: "Wohnzimmer Außenwand" },
  { key: "outdoor_unit_position", value: "Balkon" }, { key: "line_route", value: "Direkt durch die Außenwand" },
];

describe("deterministische MVP-Angebotsbereitschaft", () => {
  it("accepts the smallest reviewable fact set", () => expect(evaluateMvpQualificationReadiness(complete)).toEqual({ ready: true, missingFacts: [], requiresSiteCheck: false }));
  it("keeps a model readiness proposal in qualification when a required fact is absent", () => {
    expect(evaluateMvpQualificationReadiness(complete.filter((fact) => fact.key !== "line_route"))).toMatchObject({ ready: false, missingFacts: ["line_route"] });
  });
  it("never treats a required site check as offer-ready", () => {
    expect(evaluateMvpQualificationReadiness([...complete, { key: "electrical_supply", value: "requires_site_check" }])).toMatchObject({ ready: false, requiresSiteCheck: true });
  });
});
