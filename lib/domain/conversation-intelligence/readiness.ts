import { findContradictions, getEffectiveClaims } from "./knowledge-state";
import type { KnowledgeClaim, KnowledgeState } from "./schemas";
import { ALL_PROPERTY_KEYS, PROPERTY_KEYS, READINESS_DIMENSIONS, type PropertyKey, type ReadinessLevel, type UncertaintyClass } from "./types";

const safetyKeys: readonly PropertyKey[] = ["electrical_supply_known", "outdoor_unit_position_known", "line_route_known", "condensate_route_known", "accessibility_known"];
const requirements: Record<PropertyKey, { importance: "critical" | "high" | "medium" | "low"; reason: "required_for_rough_need" | "required_for_sizing" | "required_for_installation_path" | "required_for_offer_draft" | "safety_relevant"; level: ReadinessLevel; assumption: boolean; site: boolean }> = Object.fromEntries(ALL_PROPERTY_KEYS.map((key) => [key, { importance: "low", reason: "required_for_offer_draft", level: "level_4_offer_draft_ready", assumption: true, site: false }])) as never;
Object.assign(requirements, {
  desired_installation_scope: { importance: "high", reason: "required_for_rough_need", level: "level_1_rough_need", assumption: false, site: false }, requested_room_count: { importance: "high", reason: "required_for_rough_need", level: "level_1_rough_need", assumption: false, site: false }, room_type: { importance: "high", reason: "required_for_rough_need", level: "level_1_rough_need", assumption: false, site: false },
  room_area_sqm: { importance: "high", reason: "required_for_sizing", level: "level_2_preliminary_system", assumption: true, site: false }, building_type: { importance: "medium", reason: "required_for_sizing", level: "level_2_preliminary_system", assumption: true, site: false },
  indoor_unit_position_known: { importance: "high", reason: "required_for_installation_path", level: "level_3_preliminary_installation", assumption: true, site: true }, estimated_line_length_m: { importance: "high", reason: "required_for_offer_draft", level: "level_4_offer_draft_ready", assumption: true, site: true }, core_drilling_count: { importance: "high", reason: "required_for_offer_draft", level: "level_4_offer_draft_ready", assumption: true, site: true },
  ...Object.fromEntries(safetyKeys.map((key) => [key, { importance: "critical", reason: "safety_relevant", level: "level_4_offer_draft_ready", assumption: false, site: true }])),
});

const currentByKey = (state: KnowledgeState) => new Map(getEffectiveClaims(state).map((claim) => [claim.property_key, claim]));
const usable = (claim?: KnowledgeClaim) => Boolean(claim && !["unknown", "contradicted"].includes(claim.epistemic_status));
const classified = (claim?: KnowledgeClaim) => Boolean(claim);

export function deriveMissingInformation(state: KnowledgeState) {
  const current = currentByKey(state);
  const contradictions = new Set(findContradictions(state).map((item) => item.property_key));
  const relevant: PropertyKey[] = ["desired_installation_scope", "requested_room_count", "room_type", "room_area_sqm", "building_type", "indoor_unit_position_known", "outdoor_unit_position_known", "line_route_known", "estimated_line_length_m", "core_drilling_count", "condensate_route_known", "electrical_supply_known", "accessibility_known"];
  return relevant.flatMap((key) => {
    const claim = current.get(key);
    if (claim && !contradictions.has(key)) return [];
    const entity_type = (Object.entries(PROPERTY_KEYS).find(([, keys]) => (keys as readonly string[]).includes(key))?.[0] ?? "project") as "project" | "room" | "installation";
    const entity_id = getEffectiveClaims(state).find((item) => item.entity_type === entity_type)?.entity_id ?? state.project_id;
    const rule = requirements[key];
    return [{ information_key: key, entity_type, entity_id, importance: rule.importance, reason_code: contradictions.has(key) ? "contradictory_evidence" as const : rule.reason, blocks_level: rule.level, can_use_assumption: rule.assumption, can_require_site_check: rule.site }];
  });
}

export function deriveReadiness(state: KnowledgeState) {
  const current = currentByKey(state);
  const contradictions = findContradictions(state);
  const has = (key: PropertyKey) => usable(current.get(key));
  const hasClass = (key: PropertyKey) => classified(current.get(key));
  let level: ReadinessLevel = "level_0_no_technical_scope";
  if (has("desired_installation_scope") && has("requested_room_count") && (has("room_type") || has("usage_type"))) level = "level_1_rough_need";
  if (level === "level_1_rough_need" && has("room_area_sqm") && has("building_type")) level = "level_2_preliminary_system";
  if (level === "level_2_preliminary_system" && hasClass("indoor_unit_position_known") && hasClass("outdoor_unit_position_known") && hasClass("line_route_known")) level = "level_3_preliminary_installation";
  const level4Keys: PropertyKey[] = ["indoor_unit_position_known", "outdoor_unit_position_known", "line_route_known", "estimated_line_length_m", "core_drilling_count", "condensate_route_known", "electrical_supply_known", "accessibility_known"];
  if (level === "level_3_preliminary_installation" && level4Keys.every(hasClass) && safetyKeys.every((key) => has(key) || current.get(key)?.epistemic_status === "requires_site_check") && contradictions.length === 0) level = "level_4_offer_draft_ready";
  if (contradictions.length && level !== "level_0_no_technical_scope") level = "level_1_rough_need";
  const missing = deriveMissingInformation(state);
  const dimensions = Object.fromEntries(READINESS_DIMENSIONS.map((dimension) => {
    const key = dimension === "need" ? "desired_installation_scope" : dimension === "sizing" ? "room_area_sqm" : dimension === "indoor_position" ? "indoor_unit_position_known" : dimension === "outdoor_position" ? "outdoor_unit_position_known" : dimension === "line_route" ? "line_route_known" : dimension === "core_drilling" ? "core_drilling_count" : dimension === "condensate" ? "condensate_route_known" : dimension === "electrical" ? "electrical_supply_known" : dimension === "accessibility" ? "accessibility_known" : undefined;
    const claim = key ? current.get(key) : undefined;
    const blockers = key ? missing.filter((item) => item.information_key === key && item.importance !== "low").map((item) => item.information_key) : missing.filter((item) => item.importance === "critical").map((item) => item.information_key);
    const site_check_items = key && claim?.epistemic_status === "requires_site_check" ? [key] : dimension === "overall" ? getEffectiveClaims(state).filter((item) => item.epistemic_status === "requires_site_check").map((item) => item.property_key) : [];
    const assumptions = key && claim?.epistemic_status === "assumed" ? [claim.claim_id] : dimension === "overall" ? getEffectiveClaims(state).filter((item) => item.epistemic_status === "assumed").map((item) => item.claim_id) : [];
    const status: UncertaintyClass = blockers.length ? "blocked" : site_check_items.length ? "requires_site_check" : assumptions.length ? "sufficient_with_assumption" : claim && usable(claim) ? "confirmed" : "uncertain";
    return [dimension, { status, blockers, warnings: [], assumptions, site_check_items }];
  }));
  return { readiness_level: level, readiness_dimensions: dimensions };
}
