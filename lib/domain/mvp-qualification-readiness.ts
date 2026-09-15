import type { MvpProjectFact, MvpProjectFactKey } from "./mvp-project-facts";
import { evaluateMvpPhotoReadiness, type MvpPhotoCoverageMedia } from "./mvp-photo-policy";

export const MVP_OFFER_REQUIRED_FACT_GROUPS = [
  ["installation_address"],
  ["postal_code"],
  ["city"],
  ["building_type"],
  ["requested_room_count"],
  ["room_type"],
  ["room_area_sqm"],
  ["indoor_unit_count"],
  ["indoor_unit_position"],
  ["outdoor_unit_position"],
  ["line_route"],
  ["estimated_line_length_m"],
  ["condensate_drainage"],
  ["electrical_supply"],
  ["installation_access"],
] as const satisfies readonly (readonly MvpProjectFactKey[])[];

export type MvpQualificationReadiness = Readonly<{
  ready: boolean;
  missingFacts: readonly MvpProjectFactKey[];
  requiresSiteCheck: boolean;
  missingPhotos: readonly string[];
}>;

/** Small deterministic handoff policy. It establishes reviewability, not technical certainty. */
export function evaluateMvpQualificationReadiness(facts: readonly MvpProjectFact[], projectId = "", media: readonly MvpPhotoCoverageMedia[] = []): MvpQualificationReadiness {
  const byKey = new Map(facts.map((fact) => [fact.key, fact.value]));
  const missingFacts = MVP_OFFER_REQUIRED_FACT_GROUPS
    .filter((group) => !group.some((key) => byKey.has(key)))
    .map(([key]) => key);
  const requiresSiteCheck = ["condensate_drainage", "electrical_supply"]
    .some((key) => byKey.get(key as MvpProjectFactKey) === "requires_site_check")
    || byKey.get("installation_access") === "special_access_required";
  const hasUnknownTechnicalFact = ["condensate_drainage", "electrical_supply", "installation_access"]
    .some((key) => byKey.get(key as MvpProjectFactKey) === "unknown");
  const photos = evaluateMvpPhotoReadiness(projectId, facts, media);
  return { ready: missingFacts.length === 0 && photos.coreReady && !requiresSiteCheck && !hasUnknownTechnicalFact, missingFacts, missingPhotos: photos.missingCore, requiresSiteCheck };
}
