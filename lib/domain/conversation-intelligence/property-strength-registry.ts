import { z } from "zod";
import {
  ACTOR_CLASSES,
  ALL_PROPERTY_KEYS,
  ENTITY_TYPES,
  EPISTEMIC_STATUSES,
  KNOWLEDGE_STRENGTHS,
  PROPERTY_CLASSES,
  PROPERTY_KEYS,
  type ActorClass,
  type EntityType,
  type EpistemicStatus,
  type KnowledgeStrength,
  type PropertyKey,
} from "./types";

export const DESCRIPTIVE_PROPERTY_KEYS = [
  "room_overview_context_observed",
  "indoor_installation_area_observed",
  "outdoor_installation_area_observed",
  "line_route_context_observed",
  "wall_penetration_context_observed",
] as const;
export const PROPERTY_VALUE_TYPES = ["string", "number", "boolean"] as const;
export const TECHNICAL_READINESS_EFFECTS = ["none", "property_specific"] as const;
export const PLANNER_CONTEXT_EFFECTS = ["none", "evidence_context_satisfied", "human_review_context"] as const;

export const knowledgeStrengthSchema = z.enum(KNOWLEDGE_STRENGTHS);
export const propertyClassSchema = z.enum(PROPERTY_CLASSES);
export const propertyStrengthContractSchema = z.object({
  property_key: z.enum(ALL_PROPERTY_KEYS),
  entity_type: z.enum(ENTITY_TYPES),
  value_type: z.enum(PROPERTY_VALUE_TYPES),
  property_class: propertyClassSchema,
  minimum_strength: knowledgeStrengthSchema,
  maximum_strength: knowledgeStrengthSchema,
  allowed_epistemic_statuses: z.array(z.enum(EPISTEMIC_STATUSES)).min(1).readonly(),
  allowed_actor_classes: z.array(z.enum(ACTOR_CLASSES)).min(1).readonly(),
  technical_readiness_effect: z.enum(TECHNICAL_READINESS_EFFECTS),
  planner_context_effect: z.enum(PLANNER_CONTEXT_EFFECTS),
  requires_human_review: z.boolean(),
  site_check_only: z.boolean(),
}).strict().superRefine((contract, context) => {
  if (!(PROPERTY_KEYS[contract.entity_type] as readonly string[]).includes(contract.property_key)) context.addIssue({ code: "custom", message: "property_entity_mismatch" });
  if (KNOWLEDGE_STRENGTHS.indexOf(contract.minimum_strength) > KNOWLEDGE_STRENGTHS.indexOf(contract.maximum_strength)) context.addIssue({ code: "custom", message: "strength_range_invalid" });
  if (contract.site_check_only !== (contract.property_class === "site_check_only")) context.addIssue({ code: "custom", message: "site_check_contract_mismatch" });
  if (contract.property_class === "descriptive" && (contract.minimum_strength !== "descriptive_fact" || contract.maximum_strength !== "descriptive_fact" || contract.technical_readiness_effect !== "none")) context.addIssue({ code: "custom", message: "descriptive_boundary_invalid" });
});

export type PropertyStrengthContract = Readonly<z.infer<typeof propertyStrengthContractSchema>>;
const deepFreeze = <T>(value: T): T => {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.values(value as Record<string, unknown>).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
};

const valueTypes: Record<PropertyKey, typeof PROPERTY_VALUE_TYPES[number]> = {
  building_type: "string", ownership_status: "string", requested_room_count: "number", desired_installation_scope: "string",
  room_type: "string", room_area_sqm: "number", room_height_m: "number", floor_level: "number", roof_floor: "boolean", usage_type: "string", sun_exposure: "string", indoor_unit_position_known: "boolean",
  outdoor_unit_position_known: "boolean", line_route_known: "boolean", estimated_line_length_m: "number", core_drilling_count: "number", condensate_route_known: "boolean", electrical_supply_known: "boolean", accessibility_known: "boolean",
  room_overview_context_observed: "boolean", indoor_installation_area_observed: "boolean", outdoor_installation_area_observed: "boolean", line_route_context_observed: "boolean", wall_penetration_context_observed: "boolean",
};
const entityFor = (key: PropertyKey): EntityType => (Object.entries(PROPERTY_KEYS).find(([, keys]) => (keys as readonly string[]).includes(key))?.[0] ?? "project") as EntityType;
const descriptive = new Set<PropertyKey>(DESCRIPTIVE_PROPERTY_KEYS);
const technicalActors: readonly ActorClass[] = ["customer", "admin", "reviewer", "system", "ai"];
const technicalStatuses: readonly EpistemicStatus[] = EPISTEMIC_STATUSES;
const contracts = ALL_PROPERTY_KEYS.map((property_key): PropertyStrengthContract => propertyStrengthContractSchema.parse(descriptive.has(property_key) ? {
  property_key, entity_type: entityFor(property_key), value_type: valueTypes[property_key], property_class: "descriptive", minimum_strength: "descriptive_fact", maximum_strength: "descriptive_fact",
  allowed_epistemic_statuses: ["observed"], allowed_actor_classes: ["admin", "reviewer", "ai"], technical_readiness_effect: "none",
  planner_context_effect: property_key === "wall_penetration_context_observed" ? "human_review_context" : "evidence_context_satisfied", requires_human_review: true, site_check_only: false,
} : {
  property_key, entity_type: entityFor(property_key), value_type: valueTypes[property_key], property_class: "technical", minimum_strength: "technical_hypothesis", maximum_strength: "site_verified",
  allowed_epistemic_statuses: technicalStatuses, allowed_actor_classes: technicalActors, technical_readiness_effect: "property_specific", planner_context_effect: "none", requires_human_review: false, site_check_only: false,
}));

export const PROPERTY_STRENGTH_REGISTRY: readonly PropertyStrengthContract[] = deepFreeze(contracts);
export const getPropertyStrengthContract = (propertyKey: PropertyKey): PropertyStrengthContract => PROPERTY_STRENGTH_REGISTRY.find((contract) => contract.property_key === propertyKey)!;

export type ClaimStrengthValidationInput = Readonly<{ property_key: PropertyKey; strength: KnowledgeStrength; epistemic_status: EpistemicStatus; actor_class: ActorClass }>;
export type ClaimStrengthValidationResult = { readonly success: true } | { readonly success: false; readonly reason: "strength_below_minimum" | "strength_above_maximum" | "epistemic_status_not_allowed" | "actor_not_allowed" | "site_check_required" };
export function validateClaimStrengthForProperty(input: ClaimStrengthValidationInput): ClaimStrengthValidationResult {
  const contract = getPropertyStrengthContract(input.property_key);
  if (!contract.allowed_actor_classes.includes(input.actor_class)) return { success: false, reason: "actor_not_allowed" };
  if (!contract.allowed_epistemic_statuses.includes(input.epistemic_status)) return { success: false, reason: "epistemic_status_not_allowed" };
  if (contract.site_check_only && input.strength !== "site_verified") return { success: false, reason: "site_check_required" };
  const strength = KNOWLEDGE_STRENGTHS.indexOf(input.strength);
  if ((input.actor_class === "ai" || input.actor_class === "customer" || input.actor_class === "system") && strength > KNOWLEDGE_STRENGTHS.indexOf("technical_hypothesis")) return { success: false, reason: "actor_not_allowed" };
  if (strength < KNOWLEDGE_STRENGTHS.indexOf(contract.minimum_strength)) return { success: false, reason: "strength_below_minimum" };
  if (strength > KNOWLEDGE_STRENGTHS.indexOf(contract.maximum_strength)) return { success: false, reason: "strength_above_maximum" };
  return { success: true };
}
