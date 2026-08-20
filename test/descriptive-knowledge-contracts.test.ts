import { describe, expect, it } from "vitest";
import {
  ALL_PROPERTY_KEYS,
  DESCRIPTIVE_PROPERTY_KEYS,
  KNOWLEDGE_STRENGTHS,
  OBSERVATION_CLAIM_MAPPING_REGISTRY,
  PROPERTY_STRENGTH_REGISTRY,
  SYNTHETIC_IDS,
  SYNTHETIC_SINGLE_ROOM_STATES,
  deriveMissingInformation,
  deriveReadiness,
  knowledgeClaimSchema,
  knowledgeStateSchema,
  knowledgeStrengthSchema,
  propertyStrengthContractSchema,
  validateClaimStrengthForProperty,
} from "@/lib/domain/conversation-intelligence";

const AT = "2026-08-20T12:00:00.000Z";
const descriptiveClaim = {
  claim_id: "a1000000-0000-4000-8000-000000000001",
  project_id: SYNTHETIC_IDS.project,
  entity_type: "installation" as const,
  entity_id: SYNTHETIC_IDS.installation,
  property_key: "outdoor_installation_area_observed" as const,
  value_type: "boolean" as const,
  value: true,
  epistemic_status: "observed" as const,
  knowledge_strength: "descriptive_fact" as const,
  evidence: [{ evidence_id: "a1000000-0000-4000-8000-000000000002", source_type: "ai_analysis" as const, source_id: "a1000000-0000-4000-8000-000000000003", actor_class: "ai" as const, observed_at: AT, evidence_status: "active" as const }],
  created_at: AT,
  state_version: 2,
};

describe("Descriptive Knowledge Contracts", () => {
  it("hält Strength geschlossen und Claims strikt", () => {
    expect(KNOWLEDGE_STRENGTHS).toEqual(["observed", "descriptive_fact", "technical_hypothesis", "technical_assessment", "reviewer_approved", "site_verified"]);
    expect(knowledgeStrengthSchema.safeParse("final").success).toBe(false);
    expect(knowledgeClaimSchema.safeParse(descriptiveClaim).success).toBe(true);
    expect(knowledgeClaimSchema.safeParse({ ...descriptiveClaim, knowledge_strength: "final" }).success).toBe(false);
    expect(knowledgeClaimSchema.safeParse({ ...descriptiveClaim, extra: true }).success).toBe(false);
    expect(knowledgeClaimSchema.safeParse({ ...descriptiveClaim, value: false }).success).toBe(false);
  });

  it("registriert jeden Property Key genau einmal, gültig und tief unveränderlich", () => {
    expect(PROPERTY_STRENGTH_REGISTRY).toHaveLength(ALL_PROPERTY_KEYS.length);
    expect(new Set(PROPERTY_STRENGTH_REGISTRY.map((item) => item.property_key)).size).toBe(ALL_PROPERTY_KEYS.length);
    expect(PROPERTY_STRENGTH_REGISTRY.every((item) => propertyStrengthContractSchema.safeParse(item).success)).toBe(true);
    expect(Object.isFrozen(PROPERTY_STRENGTH_REGISTRY)).toBe(true);
    expect(PROPERTY_STRENGTH_REGISTRY.every((item) => Object.isFrozen(item) && Object.isFrozen(item.allowed_actor_classes) && Object.isFrozen(item.allowed_epistemic_statuses))).toBe(true);
  });

  it("begrenzt die descriptive Allowlist auf fünf boolesche, nicht-technische Kontextfacts", () => {
    expect(DESCRIPTIVE_PROPERTY_KEYS).toEqual(["room_overview_context_observed", "indoor_installation_area_observed", "outdoor_installation_area_observed", "line_route_context_observed", "wall_penetration_context_observed"]);
    const contracts = PROPERTY_STRENGTH_REGISTRY.filter((item) => item.property_class === "descriptive");
    expect(contracts).toHaveLength(5);
    expect(contracts.every((item) => item.value_type === "boolean" && item.minimum_strength === "descriptive_fact" && item.maximum_strength === "descriptive_fact" && item.technical_readiness_effect === "none")).toBe(true);
    for (const unsafe of ["electrical_supply_suitable", "core_drilling_safe", "final_mounting_approval", "noise_approved", "structural_safety", "window_visible", "door_visible", "measurement_reference_visible"]) expect(ALL_PROPERTY_KEYS).not.toContain(unsafe);
  });

  it("erzwingt Actor-, Strength- und Site-Check-Grenzen fail closed", () => {
    expect(validateClaimStrengthForProperty({ property_key: "outdoor_installation_area_observed", strength: "descriptive_fact", epistemic_status: "observed", actor_class: "ai" })).toEqual({ success: true });
    expect(validateClaimStrengthForProperty({ property_key: "outdoor_installation_area_observed", strength: "reviewer_approved", epistemic_status: "observed", actor_class: "reviewer" })).toEqual({ success: false, reason: "strength_above_maximum" });
    expect(validateClaimStrengthForProperty({ property_key: "wall_penetration_context_observed", strength: "technical_assessment", epistemic_status: "observed", actor_class: "reviewer" })).toEqual({ success: false, reason: "strength_above_maximum" });
    expect(validateClaimStrengthForProperty({ property_key: "electrical_supply_known", strength: "descriptive_fact", epistemic_status: "observed", actor_class: "ai" })).toEqual({ success: false, reason: "strength_below_minimum" });
    expect(validateClaimStrengthForProperty({ property_key: "electrical_supply_known", strength: "technical_assessment", epistemic_status: "observed", actor_class: "ai" })).toEqual({ success: false, reason: "actor_not_allowed" });
    expect(validateClaimStrengthForProperty({ property_key: "room_area_sqm", strength: "technical_hypothesis", epistemic_status: "reported", actor_class: "customer" })).toEqual({ success: true });
  });

  it("lässt Readiness und Technical Missing Information exakt unverändert", () => {
    const before = SYNTHETIC_SINGLE_ROOM_STATES.B;
    const after = knowledgeStateSchema.parse({ ...before, state_version: 2, claims: [...before.claims, descriptiveClaim], updated_at: AT });
    expect(deriveReadiness(after)).toEqual(deriveReadiness(before));
    expect(deriveMissingInformation(after)).toEqual(deriveMissingInformation(before));
    expect(deriveMissingInformation(after).some((item) => item.information_key === "outdoor_unit_position_known")).toBe(true);
  });

  it("erlaubt nur Planner-Evidence-Kontext und exakt fünf descriptive Mapping Rules", () => {
    const descriptive = PROPERTY_STRENGTH_REGISTRY.filter((item) => item.property_class === "descriptive");
    expect(descriptive.every((item) => ["evidence_context_satisfied", "human_review_context"].includes(item.planner_context_effect))).toBe(true);
    expect(descriptive.every((item) => item.technical_readiness_effect === "none")).toBe(true);
    expect(OBSERVATION_CLAIM_MAPPING_REGISTRY.filter((item) => item.review_class === "auto_proposable").map((item) => item.property_key).sort()).toEqual([...DESCRIPTIVE_PROPERTY_KEYS].sort());
  });
});
