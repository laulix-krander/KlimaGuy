import type { EntityType, PropertyKey } from "./types";

export const PLANNER_ACTION_TYPES = ["ask_text", "ask_yes_no", "ask_approximate_number", "offer_assumption", "mark_requires_site_check", "request_human_review", "present_intermediate_result", "end_collection"] as const;
export const PLANNER_ANSWER_TYPES = ["text", "boolean", "approximate_number", "unknown", "skip"] as const;
export const PLANNER_TARGET = "level_3_preliminary_installation" as const;
export const CANDIDATE_STATUSES = ["eligible", "ineligible", "selected", "superseded"] as const;
export const PRIORITY_BANDS = ["safety", "feasibility", "readiness_blocker", "price_risk", "technical_accuracy", "optional"] as const;
export const PROGRESSION_BANDS = ["basic_need", "room_context", "placement_context", "installation_context", "technical_clarification"] as const;
export const DEPENDENCY_TYPES = ["hard", "progression", "contextual"] as const;
export const REVISIT_TRIGGERS = ["new_dependency_information", "new_customer_evidence", "contradiction_detected", "explicit_customer_correction", "post_intermediate_progression"] as const;
export const FEATURE_CLASSES = ["none", "low", "medium", "high", "critical"] as const;
export const RETRY_OUTCOMES = ["answered", "unknown", "skipped", "invalid", "ignored", "superseded"] as const;
export const TEMPLATE_KEYS = ["ask_room_type", "ask_room_area_approximate", "ask_room_area_approximate_retry", "ask_building_type", "ask_indoor_position_known", "ask_outdoor_position_known", "ask_line_route_known", "ask_electrical_supply_known", "ask_accessibility_known", "confirm_room_area_assumption", "notice_line_route_site_check", "notice_electrical_site_check", "notice_outdoor_position_site_check", "notice_accessibility_site_check", "internal_human_review", "notice_human_review", "present_preliminary_assessment", "end_collection_paused", "end_collection_site_visit"] as const;
export const ASSUMPTION_KEYS = ["rough_room_area_for_level_2", "typical_room_height", "single_room_mvp"] as const;
export const FALLBACK_PATHS = ["offer_assumption", "mark_requires_site_check", "request_human_review", "present_intermediate_result", "end_collection"] as const;
export const HUMAN_REVIEW_REASONS = ["critical_contradiction", "safety_conflict", "customer_requests_binding_price", "customer_requests_human", "outside_mvp_domain", "possible_hazard", "no_safe_customer_action"] as const;
export const PLANNER_REASON_CODES = ["missing_for_target", "retry_simplified", "retry_limit_fallback", "contradiction_requires_clarification", "customer_effort_break", "target_reached", "site_check_required", "assumption_available", "dependency_not_satisfied", "earlier_progression_band_open", "customer_does_not_know", "additional_evidence_required", "revisit_not_allowed", "revisit_trigger_present", "no_eligible_customer_action", ...HUMAN_REVIEW_REASONS] as const;
export const INELIGIBILITY_CODES = ["information_already_sufficient", "not_applicable", "retry_limit_reached", "missing_dependency", "dependency_not_satisfied", "earlier_progression_band_open", "customer_cannot_answer", "customer_does_not_know", "additional_evidence_required", "revisit_not_allowed", "already_requires_site_check", "assumption_already_active", "not_relevant_for_target", "contradiction_requires_resolution", "stale_state_version", "entity_not_found", "human_takeover_required", "customer_effort_limit_reached", "active_question_pending"] as const;
export const PLANNER_STOP_REASONS = ["target_readiness_reached", "no_eligible_customer_action", "customer_declined", "customer_unresponsive", "requires_human_review", "site_visit_required", "critical_contradiction", "collection_paused", "maximum_customer_effort_reached"] as const;
export const PLANNER_ERROR_CODES = ["invalid_planner_context", "stale_planner_context", "invalid_candidate", "candidate_not_found", "no_eligible_candidate", "invalid_retry_state", "invalid_customer_effort_state", "invalid_target_readiness", "invalid_action_type", "invalid_answer_contract", "invalid_score_class", "planner_selection_failed"] as const;

export type PlannerActionType = typeof PLANNER_ACTION_TYPES[number];
export type FeatureClass = typeof FEATURE_CLASSES[number];
export type PriorityBand = typeof PRIORITY_BANDS[number];
export type ProgressionBand = typeof PROGRESSION_BANDS[number];
export type IneligibilityCode = typeof INELIGIBILITY_CODES[number];
export type PlannerErrorCode = typeof PLANNER_ERROR_CODES[number];
export type PlannerResult<T> = { success: true; data: T } | { success: false; code: PlannerErrorCode };
export type PlannerEntityRef = Readonly<{ information_key: PropertyKey; entity_type: EntityType; entity_id: string }>;
