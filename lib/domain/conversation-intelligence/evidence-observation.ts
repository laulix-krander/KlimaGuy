import { z } from "zod";
import { evidenceAvailabilitySchema, evidenceTargetKeySchema, type EvidenceAvailability, type EvidenceTargetKey } from "./evidence-request";
import { ACTOR_CLASSES } from "./types";

export const EVIDENCE_OBSERVATION_TYPES = [
  "room_overview_visible", "wall_area_visible", "window_visible", "door_visible",
  "indoor_area_visible", "outdoor_area_visible", "possible_indoor_mounting_area_visible",
  "possible_outdoor_mounting_area_visible", "line_route_context_visible",
  "wall_penetration_context_visible", "electrical_connection_visible",
  "accessibility_context_visible", "measurement_reference_visible", "image_insufficient",
  "image_obstructed", "image_wrong_area",
] as const;
export const EVIDENCE_QUALITIES = ["sufficient_for_observation", "partially_sufficient", "insufficient", "wrong_target", "obstructed", "ambiguous", "invalid"] as const;
export const INTERPRETATION_STATUSES = ["observed", "insufficient", "ambiguous", "requires_review", "rejected"] as const;
export const OBSERVATION_REASON_CODES = ["visible_feature_recorded", "partial_view", "insufficient_view", "view_obstructed", "wrong_target_shown", "ambiguous_view", "invalid_evidence"] as const;
export const OBSERVATION_SOURCE_ACTORS = ["admin", "reviewer", "ai"] as const satisfies readonly (typeof ACTOR_CLASSES[number])[];
export const OBSERVATION_CATEGORY = "observation" as const;

export type EvidenceObservationType = typeof EVIDENCE_OBSERVATION_TYPES[number];
export type EvidenceQuality = typeof EVIDENCE_QUALITIES[number];
export type InterpretationStatus = typeof INTERPRETATION_STATUSES[number];

const uuid = z.string().uuid();
const timestamp = z.string().datetime({ offset: true });
export const evidenceObservationTypeSchema = z.enum(EVIDENCE_OBSERVATION_TYPES);
export const evidenceQualitySchema = z.enum(EVIDENCE_QUALITIES);
export const interpretationStatusSchema = z.enum(INTERPRETATION_STATUSES);
export const evidenceObservationValueSchema = z.union([
  z.object({ kind: z.literal("visibility"), value: z.enum(["visible", "not_visible"]) }).strict(),
  z.object({ kind: z.literal("evidence_condition"), value: z.null() }).strict(),
]);
export const evidenceObservationSchema = z.object({
  observation_id: uuid,
  contract_version: z.literal(1),
  evidence_id: uuid,
  project_id: uuid,
  conversation_id: uuid,
  target_key: evidenceTargetKeySchema,
  observation_category: z.literal(OBSERVATION_CATEGORY),
  observation_type: evidenceObservationTypeSchema,
  observation_value: evidenceObservationValueSchema,
  source_actor_class: z.enum(OBSERVATION_SOURCE_ACTORS),
  observed_at: timestamp,
  evidence_quality: evidenceQualitySchema,
  interpretation_status: interpretationStatusSchema,
  scope: z.object({ request_id: uuid, scope_key: z.literal("requested_target") }).strict(),
  reason_codes: z.array(z.enum(OBSERVATION_REASON_CODES)).min(1).readonly(),
}).strict().superRefine((value, context) => {
  const bad = value.observation_type.startsWith("image_");
  if (bad !== (value.observation_value.kind === "evidence_condition")) context.addIssue({ code: "custom", message: "observation_value_type_mismatch" });
  if (bad && value.interpretation_status === "observed") context.addIssue({ code: "custom", message: "bad_evidence_cannot_be_observed" });
});
export const evidenceObservationStateSchema = z.object({ project_id: uuid, conversation_id: uuid, revision: z.number().int().nonnegative(), observations: z.array(evidenceObservationSchema).readonly() }).strict().superRefine((state, context) => {
  if (new Set(state.observations.map(({ observation_id }) => observation_id)).size !== state.observations.length) context.addIssue({ code: "custom", message: "duplicate_observation_id" });
});

export type EvidenceObservation = Readonly<z.infer<typeof evidenceObservationSchema>>;
export type EvidenceObservationState = Readonly<z.infer<typeof evidenceObservationStateSchema>>;

const deepFreeze = <T>(value: T): T => {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
};
const definitions: Readonly<Record<EvidenceObservationType, Readonly<{ label: string }>>> = {
  room_overview_visible:{label:"Raumübersicht sichtbar"}, wall_area_visible:{label:"Wandbereich sichtbar"}, window_visible:{label:"Fenster sichtbar"}, door_visible:{label:"Tür sichtbar"}, indoor_area_visible:{label:"Innenbereich sichtbar"}, outdoor_area_visible:{label:"Außenbereich sichtbar"}, possible_indoor_mounting_area_visible:{label:"Mögliche Innengerät-Montagefläche sichtbar"}, possible_outdoor_mounting_area_visible:{label:"Mögliche Außengerät-Montagefläche sichtbar"}, line_route_context_visible:{label:"Leitungsweg-Kontext sichtbar"}, wall_penetration_context_visible:{label:"Wanddurchführungs-Kontext sichtbar"}, electrical_connection_visible:{label:"Elektrischer Anschluss sichtbar"}, accessibility_context_visible:{label:"Zugänglichkeitskontext sichtbar"}, measurement_reference_visible:{label:"Messreferenz sichtbar"}, image_insufficient:{label:"Foto nicht ausreichend"}, image_obstructed:{label:"Bereich verdeckt"}, image_wrong_area:{label:"Falscher Bereich"},
};
export const EVIDENCE_OBSERVATION_DEFINITIONS = deepFreeze(definitions);
export const TARGET_OBSERVATION_REGISTRY = deepFreeze({
  room_overview:["room_overview_visible","wall_area_visible","window_visible","door_visible","measurement_reference_visible","image_insufficient","image_obstructed","image_wrong_area"],
  indoor_area_overview:["indoor_area_visible","wall_area_visible","window_visible","door_visible","possible_indoor_mounting_area_visible","image_insufficient","image_obstructed","image_wrong_area"],
  outdoor_area_overview:["outdoor_area_visible","possible_outdoor_mounting_area_visible","accessibility_context_visible","image_insufficient","image_obstructed","image_wrong_area"],
  line_route_context:["line_route_context_visible","wall_penetration_context_visible","image_insufficient","image_obstructed","image_wrong_area"],
  electrical_area:["electrical_connection_visible","image_insufficient","image_obstructed","image_wrong_area"],
  accessibility_context:["accessibility_context_visible","image_insufficient","image_obstructed","image_wrong_area"],
} as const satisfies Partial<Record<EvidenceTargetKey, readonly EvidenceObservationType[]>>);

export const observationOptionsForTarget = (target: EvidenceTargetKey) => (TARGET_OBSERVATION_REGISTRY as Partial<Record<EvidenceTargetKey, readonly EvidenceObservationType[]>>)[target] ?? [];

export const EVIDENCE_OBSERVATION_ERROR_CODES = ["invalid_observation_submission","project_mismatch","conversation_mismatch","evidence_identity_invalid","evidence_not_available","target_mismatch","observation_not_allowed","duplicate_observation_id","duplicate_observation_semantics"] as const;
export type RecordObservationResult = Readonly<{ success:true; changed:true; code:"observation_recorded"; state:EvidenceObservationState; observation:EvidenceObservation } | { success:true; changed:false; code:"observation_replayed"; state:EvidenceObservationState; observation:EvidenceObservation } | { success:false; code:typeof EVIDENCE_OBSERVATION_ERROR_CODES[number] }>;
export type RecordObservationInput = Readonly<{ state:EvidenceObservationState; availability:EvidenceAvailability; observation:EvidenceObservation }>;

const same = (a: EvidenceObservation, b: EvidenceObservation) => JSON.stringify(a) === JSON.stringify(b);
export function recordEvidenceObservation(input: unknown): RecordObservationResult {
  if (!input || typeof input !== "object") return { success:false, code:"invalid_observation_submission" };
  const candidate=input as Partial<RecordObservationInput>;
  const state=evidenceObservationStateSchema.safeParse(candidate.state), availability=evidenceAvailabilitySchema.safeParse(candidate.availability), observation=evidenceObservationSchema.safeParse(candidate.observation);
  if (!state.success || !availability.success || !observation.success) return { success:false, code:"invalid_observation_submission" };
  const current=state.data, item=observation.data;
  if(item.project_id!==current.project_id)return{success:false,code:"project_mismatch"};
  if(item.conversation_id!==current.conversation_id)return{success:false,code:"conversation_mismatch"};
  if(!availability.data.evidence_id||availability.data.evidence_id!==item.evidence_id||availability.data.request_id!==item.scope.request_id)return{success:false,code:"evidence_identity_invalid"};
  if(availability.data.status!=="available_unanalysed")return{success:false,code:"evidence_not_available"};
  if(availability.data.target_key!==item.target_key)return{success:false,code:"target_mismatch"};
  if(!observationOptionsForTarget(item.target_key).includes(item.observation_type))return{success:false,code:"observation_not_allowed"};
  const existing=current.observations.find(entry=>entry.observation_id===item.observation_id);
  if(existing)return same(existing,item)?{success:true,changed:false,code:"observation_replayed",state:deepFreeze(current),observation:existing}:{success:false,code:"duplicate_observation_id"};
  if(current.observations.some(entry=>entry.evidence_id===item.evidence_id&&entry.observation_type===item.observation_type&&JSON.stringify(entry.observation_value)===JSON.stringify(item.observation_value)))return{success:false,code:"duplicate_observation_semantics"};
  const next=evidenceObservationStateSchema.parse({...current,revision:current.revision+1,observations:[...current.observations,item]});
  return{success:true,changed:true,code:"observation_recorded",state:deepFreeze(next),observation:deepFreeze(item)};
}

export const createEvidenceObservationState=(project_id:string,conversation_id:string):EvidenceObservationState=>deepFreeze(evidenceObservationStateSchema.parse({project_id,conversation_id,revision:0,observations:[]}));
