import {
  EVIDENCE_TARGET_REGISTRY,
  type EvidencePurposeCode,
  type EvidenceTargetKey,
} from "./evidence-request";

export const EVIDENCE_TARGET_LABELS: Readonly<Record<EvidenceTargetKey, string>> = {
  room_overview: "Raumübersicht",
  indoor_area_overview: "Innenbereich",
  outdoor_area_overview: "Außenbereich",
  indoor_unit_wall: "Wandbereich Innengerät",
  outdoor_unit_location: "Standort Außengerät",
  line_route_context: "Leitungsweg",
  electrical_area: "Elektrobereich",
  accessibility_context: "Zugänglichkeit",
  room_dimensions_context: "Raummaße",
  building_exterior_context: "Gebäudeaußenbereich",
  condensate_context: "Kondensatführung",
  core_drilling_context: "Kernbohrungsbereich",
};

export const EVIDENCE_PURPOSE_LABELS: Readonly<Record<EvidencePurposeCode, string>> = {
  evaluate_indoor_position_context: "Kontext der Innenposition dokumentieren",
  evaluate_outdoor_position_context: "Kontext der Außenposition dokumentieren",
  evaluate_line_route_context: "Kontext des Leitungswegs dokumentieren",
  evaluate_room_dimension_context: "Kontext der Raummaße dokumentieren",
  evaluate_electrical_context: "Kontext des Elektrobereichs dokumentieren",
  evaluate_accessibility_context: "Kontext der Zugänglichkeit dokumentieren",
  evaluate_condensate_context: "Kontext der Kondensatführung dokumentieren",
  evaluate_core_drilling_context: "Kontext der Kernbohrung dokumentieren",
  evaluate_building_context: "Gebäudekontext dokumentieren",
};

export const ACTIVE_IMAGE_EVIDENCE_TARGETS = Object.freeze(
  EVIDENCE_TARGET_REGISTRY.filter((target) => target.status === "active").map((target) => Object.freeze({
    target_key: target.target_key,
    label: EVIDENCE_TARGET_LABELS[target.target_key],
    purposes: Object.freeze(target.purpose_codes.map((purpose) => Object.freeze({ code: purpose, label: EVIDENCE_PURPOSE_LABELS[purpose] }))),
  })),
);
