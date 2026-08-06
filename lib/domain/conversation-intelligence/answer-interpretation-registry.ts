import type { MappingRule } from "./answer-interpretation-types";

const freeze = <T extends object>(value: T): Readonly<T> => { for (const child of Object.values(value)) if (child && typeof child === "object") freeze(child); return Object.freeze(value); };
const rule = (information_key: MappingRule["information_key"], entity_type: MappingRule["entity_type"], supported_normalized_kind: MappingRule["supported_normalized_kind"], supports_assumption = false, status: MappingRule["status"] = "active"): MappingRule => freeze({ information_key, entity_type, property_key: information_key, supported_normalized_kind, epistemic_status: "reported", unknown_strategy: "null_claim", skip_strategy: "no_property_claim", contradiction_strategy: "parallel_claim", supersession_strategy: "controlled", evidence_source_type: "customer_message", supports_assumption, status });
export const ANSWER_INTERPRETATION_REGISTRY: readonly MappingRule[] = freeze([
  rule("room_area_sqm", "room", "number", true), rule("indoor_unit_position_known", "room", "boolean"),
  rule("outdoor_unit_position_known", "installation", "boolean"), rule("line_route_known", "installation", "boolean"),
  rule("electrical_supply_known", "installation", "boolean"), rule("accessibility_known", "installation", "boolean"),
  rule("room_type", "room", "text", false, "deferred"), rule("building_type", "project", "text", false, "deferred"),
]);
export const ASSUMPTION_VALUE_REGISTRY = freeze({ rough_room_area_for_level_2: { information_key: "room_area_sqm", value: 25, value_type: "number", approximation: "approximate" } } as const);
export const getAnswerInterpretationRule = (key: string) => ANSWER_INTERPRETATION_REGISTRY.find((item) => item.information_key === key);
export const validateAnswerInterpretationRegistry = (registry: readonly MappingRule[]) => new Set(registry.map((item) => item.information_key)).size === registry.length;

