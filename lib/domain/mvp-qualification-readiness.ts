import type { MvpProjectFact, MvpProjectFactKey } from "./mvp-project-facts";

export const MVP_OFFER_REQUIRED_FACT_GROUPS = [
  ["installation_address"],
  ["requested_room_count"],
  ["indoor_unit_count"],
  ["indoor_unit_position"],
  ["outdoor_unit_position"],
  ["line_route"],
] as const satisfies readonly (readonly MvpProjectFactKey[])[];

export type MvpQualificationReadiness = Readonly<{
  ready: boolean;
  missingFacts: readonly MvpProjectFactKey[];
  requiresSiteCheck: boolean;
}>;

/** Small deterministic handoff policy. It establishes reviewability, not technical certainty. */
export function evaluateMvpQualificationReadiness(facts: readonly MvpProjectFact[]): MvpQualificationReadiness {
  const byKey = new Map(facts.map((fact) => [fact.key, fact.value]));
  const missingFacts = MVP_OFFER_REQUIRED_FACT_GROUPS
    .filter((group) => !group.some((key) => byKey.has(key)))
    .map(([key]) => key);
  const requiresSiteCheck = ["condensate_drainage", "electrical_supply"]
    .some((key) => byKey.get(key as MvpProjectFactKey) === "requires_site_check");
  return { ready: missingFacts.length === 0 && !requiresSiteCheck, missingFacts, requiresSiteCheck };
}
