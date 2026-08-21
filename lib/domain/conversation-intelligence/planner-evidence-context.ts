import { z } from "zod";
import { getEffectiveClaims } from "./knowledge-state";
import type { KnowledgeState } from "./schemas";

export const PLANNER_EVIDENCE_CONTEXT_KEYS = ["room_overview", "indoor_installation_area", "outdoor_installation_area", "line_route", "wall_penetration"] as const;
export const DESCRIPTIVE_EVIDENCE_PROPERTY_KEYS = ["room_overview_context_observed", "indoor_installation_area_observed", "outdoor_installation_area_observed", "line_route_context_observed", "wall_penetration_context_observed"] as const;
export const PLANNER_EVIDENCE_CONTEXT_TARGET_KEYS = ["room_overview", "indoor_area_overview", "outdoor_area_overview", "line_route_context", "core_drilling_context"] as const;

export const plannerEvidenceContextKeySchema = z.enum(PLANNER_EVIDENCE_CONTEXT_KEYS);
export const plannerEvidenceContextEntrySchema = z.object({
  context_key: plannerEvidenceContextKeySchema,
  property_key: z.enum(DESCRIPTIVE_EVIDENCE_PROPERTY_KEYS),
  entity_type: z.enum(["project", "room", "installation"]),
  entity_id: z.string().uuid(),
  covered_target_keys: z.array(z.enum(PLANNER_EVIDENCE_CONTEXT_TARGET_KEYS)).min(1).readonly(),
}).strict();
export const plannerEvidenceContextSchema = z.array(plannerEvidenceContextEntrySchema).readonly();
export type PlannerEvidenceContext = Readonly<z.infer<typeof plannerEvidenceContextEntrySchema>>;

const entry = (value: Omit<PlannerEvidenceContext, "entity_type" | "entity_id">) => Object.freeze({ ...value, covered_target_keys: Object.freeze([...value.covered_target_keys]) });
export const PLANNER_EVIDENCE_CONTEXT_REGISTRY = Object.freeze([
  entry({ context_key: "room_overview", property_key: "room_overview_context_observed", covered_target_keys: ["room_overview"] }),
  entry({ context_key: "indoor_installation_area", property_key: "indoor_installation_area_observed", covered_target_keys: ["indoor_area_overview"] }),
  entry({ context_key: "outdoor_installation_area", property_key: "outdoor_installation_area_observed", covered_target_keys: ["outdoor_area_overview"] }),
  entry({ context_key: "line_route", property_key: "line_route_context_observed", covered_target_keys: ["line_route_context"] }),
  entry({ context_key: "wall_penetration", property_key: "wall_penetration_context_observed", covered_target_keys: ["core_drilling_context"] }),
] as const);

export function derivePlannerEvidenceContext(state: KnowledgeState): readonly PlannerEvidenceContext[] {
  const rules = new Map(PLANNER_EVIDENCE_CONTEXT_REGISTRY.map(rule => [rule.property_key, rule]));
  return plannerEvidenceContextSchema.parse(getEffectiveClaims(state).flatMap(claim => {
    const rule = rules.get(claim.property_key as typeof DESCRIPTIVE_EVIDENCE_PROPERTY_KEYS[number]);
    return rule && claim.value === true && claim.knowledge_strength === "descriptive_fact" && claim.epistemic_status === "observed"
      ? [{ ...rule, entity_type: claim.entity_type, entity_id: claim.entity_id }]
      : [];
  }));
}

export const isEvidenceTargetCovered = (context: readonly PlannerEvidenceContext[], targetKey: string): boolean =>
  context.some(item => (item.covered_target_keys as readonly string[]).includes(targetKey));
