export const ACTOR_CLASSES = ["customer", "admin", "reviewer", "system", "ai"] as const;
export const EVENT_TYPES = ["customer_message_received", "internal_note_added", "knowledge_claim_recorded", "knowledge_claim_superseded", "assessment_created", "reviewer_correction_recorded"] as const;
export const EVIDENCE_SOURCE_TYPES = ["customer_message", "internal_note", "project_media", "manual_entry", "system_rule", "ai_analysis", "reviewer_correction"] as const;
export const EVIDENCE_STATUSES = ["active", "superseded", "invalidated", "manually_confirmed", "manually_corrected"] as const;
export const EPISTEMIC_STATUSES = ["confirmed", "reported", "observed", "estimated", "assumed", "unknown", "not_applicable", "contradicted", "requires_site_check"] as const;
export const ENTITY_TYPES = ["project", "room", "installation"] as const;

export const PROPERTY_KEYS = {
  project: ["building_type", "ownership_status", "requested_room_count", "desired_installation_scope"],
  room: ["room_type", "room_area_sqm", "room_height_m", "floor_level", "roof_floor", "usage_type", "sun_exposure", "indoor_unit_position_known"],
  installation: ["outdoor_unit_position_known", "line_route_known", "estimated_line_length_m", "core_drilling_count", "condensate_route_known", "electrical_supply_known", "accessibility_known"],
} as const;
export const ALL_PROPERTY_KEYS = [...PROPERTY_KEYS.project, ...PROPERTY_KEYS.room, ...PROPERTY_KEYS.installation] as const;
export const UNCERTAINTY_CLASSES = ["confirmed", "sufficient_with_assumption", "uncertain", "blocked", "requires_site_check"] as const;
export const READINESS_LEVELS = ["level_0_no_technical_scope", "level_1_rough_need", "level_2_preliminary_system", "level_3_preliminary_installation", "level_4_offer_draft_ready", "level_5_human_approved"] as const;
export const READINESS_DIMENSIONS = ["need", "sizing", "indoor_position", "outdoor_position", "line_route", "core_drilling", "condensate", "electrical", "accessibility", "overall"] as const;
export const DIAGNOSTIC_CODES = ["conflicting_effective_claims", "conflicting_numeric_values", "conflicting_statuses"] as const;
export const ERROR_CODES = ["invalid_claim", "duplicate_claim_id", "project_mismatch", "conversation_mismatch", "invalid_state_version", "claim_not_found", "invalid_supersession", "invalid_evidence", "contradictory_claims", "assessment_version_mismatch"] as const;
export const MISSING_REASON_CODES = ["required_for_rough_need", "required_for_sizing", "required_for_installation_path", "required_for_offer_draft", "safety_relevant", "missing_evidence", "contradictory_evidence"] as const;
export const ALLOWED_OUTPUTS = ["collect_more_information", "rough_need_available", "preliminary_system_scope_available", "preliminary_installation_scope_available", "offer_draft_structure_available", "site_visit_recommended"] as const;
export const PROHIBITED_OUTPUTS = ["fixed_price", "final_offer", "final_technical_approval", "confirmed_installation_position", "confirmed_electrical_scope", "human_approval"] as const;

export type ActorClass = typeof ACTOR_CLASSES[number];
export type EntityType = typeof ENTITY_TYPES[number];
export type PropertyKey = typeof ALL_PROPERTY_KEYS[number];
export type EpistemicStatus = typeof EPISTEMIC_STATUSES[number];
export type ReadinessLevel = typeof READINESS_LEVELS[number];
export type UncertaintyClass = typeof UNCERTAINTY_CLASSES[number];
export type DomainErrorCode = typeof ERROR_CODES[number];
export type DomainResult<T> = { success: true; data: T } | { success: false; code: DomainErrorCode };
