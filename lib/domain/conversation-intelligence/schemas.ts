import { z } from "zod";
import { ACTOR_CLASSES, ALLOWED_OUTPUTS, ALL_PROPERTY_KEYS, DIAGNOSTIC_CODES, ENTITY_TYPES, EPISTEMIC_STATUSES, EVIDENCE_SOURCE_TYPES, EVIDENCE_STATUSES, EVENT_TYPES, MISSING_REASON_CODES, PROHIBITED_OUTPUTS, PROPERTY_KEYS, READINESS_DIMENSIONS, READINESS_LEVELS, UNCERTAINTY_CLASSES } from "./types";

const uuid = z.string().uuid();
const timestamp = z.string().datetime({ offset: true });
export const actorClassSchema = z.enum(ACTOR_CLASSES);
export const eventTypeSchema = z.enum(EVENT_TYPES);
export const evidenceSourceTypeSchema = z.enum(EVIDENCE_SOURCE_TYPES);
export const evidenceStatusSchema = z.enum(EVIDENCE_STATUSES);
export const epistemicStatusSchema = z.enum(EPISTEMIC_STATUSES);
export const readinessLevelSchema = z.enum(READINESS_LEVELS);
export const uncertaintyClassSchema = z.enum(UNCERTAINTY_CLASSES);

export const evidenceReferenceSchema = z.object({
  evidence_id: uuid, source_type: evidenceSourceTypeSchema, source_id: uuid,
  actor_class: actorClassSchema, observed_at: timestamp, evidence_status: evidenceStatusSchema,
}).strict();

const unknownStatuses = ["unknown", "not_applicable", "requires_site_check"] as const;
const stringKeys = ["building_type", "ownership_status", "desired_installation_scope", "room_type", "usage_type", "sun_exposure"] as const;
const numberKeys = ["requested_room_count", "room_area_sqm", "room_height_m", "floor_level", "estimated_line_length_m", "core_drilling_count"] as const;
const booleanKeys = ["roof_floor", "indoor_unit_position_known", "outdoor_unit_position_known", "line_route_known", "condensate_route_known", "electrical_supply_known", "accessibility_known"] as const;
const knownStatus = epistemicStatusSchema.exclude(unknownStatuses);
const claimBase = {
  claim_id: uuid, project_id: uuid, entity_type: z.enum(ENTITY_TYPES), entity_id: uuid,
  property_key: z.enum(ALL_PROPERTY_KEYS), evidence: z.array(evidenceReferenceSchema).min(1).readonly(),
  created_at: timestamp, state_version: z.number().int().positive(), supersedes_claim_id: uuid.optional(),
};
const valuePart = z.discriminatedUnion("value_type", [
  z.object({ ...claimBase, value_type: z.literal("string"), value: z.string().trim().min(1).max(120), epistemic_status: knownStatus }).strict(),
  z.object({ ...claimBase, value_type: z.literal("number"), value: z.number().finite().positive(), epistemic_status: knownStatus }).strict(),
  z.object({ ...claimBase, value_type: z.literal("boolean"), value: z.boolean(), epistemic_status: knownStatus }).strict(),
  z.object({ ...claimBase, value_type: z.literal("unknown"), value: z.null(), epistemic_status: z.enum(unknownStatuses) }).strict(),
]);
export const knowledgeClaimSchema = valuePart.superRefine((claim, context) => {
  if (!(PROPERTY_KEYS[claim.entity_type] as readonly string[]).includes(claim.property_key)) context.addIssue({ code: z.ZodIssueCode.custom, path: ["property_key"], message: "property_entity_mismatch" });
  const allowed = claim.value_type === "string" ? stringKeys : claim.value_type === "number" ? numberKeys : claim.value_type === "boolean" ? booleanKeys : ALL_PROPERTY_KEYS;
  if (!(allowed as readonly string[]).includes(claim.property_key)) context.addIssue({ code: z.ZodIssueCode.custom, path: ["value"], message: "property_value_mismatch" });
  if ((claim.property_key === "requested_room_count" || claim.property_key === "floor_level" || claim.property_key === "core_drilling_count") && claim.value_type === "number" && !Number.isInteger(claim.value)) context.addIssue({ code: z.ZodIssueCode.custom, path: ["value"], message: "integer_required" });
});
export type KnowledgeClaim = z.infer<typeof knowledgeClaimSchema>;

export const knowledgeStateSchema = z.object({ project_id: uuid, conversation_id: uuid, state_version: z.number().int().positive(), claims: z.array(knowledgeClaimSchema).readonly(), updated_at: timestamp }).strict().superRefine((state, context) => {
  if (state.claims.some((claim) => claim.project_id !== state.project_id)) context.addIssue({ code: z.ZodIssueCode.custom, path: ["claims"], message: "project_mismatch" });
  if (new Set(state.claims.map((claim) => claim.claim_id)).size !== state.claims.length) context.addIssue({ code: z.ZodIssueCode.custom, path: ["claims"], message: "duplicate_claim_id" });
});
export type KnowledgeState = z.infer<typeof knowledgeStateSchema>;

const eventBase = { event_id: uuid, conversation_id: uuid, project_id: uuid, sequence: z.number().int().positive(), occurred_at: timestamp, actor_class: actorClassSchema };
export const conversationEventSchema = z.discriminatedUnion("event_type", [
  z.object({ ...eventBase, event_type: z.literal("customer_message_received"), payload: z.object({ message_id: uuid }).strict() }).strict(),
  z.object({ ...eventBase, event_type: z.literal("internal_note_added"), payload: z.object({ note_id: uuid }).strict() }).strict(),
  z.object({ ...eventBase, event_type: z.literal("knowledge_claim_recorded"), payload: z.object({ claim_id: uuid, state_version: z.number().int().positive() }).strict() }).strict(),
  z.object({ ...eventBase, event_type: z.literal("knowledge_claim_superseded"), payload: z.object({ claim_id: uuid, superseded_claim_id: uuid, state_version: z.number().int().positive() }).strict() }).strict(),
  z.object({ ...eventBase, event_type: z.literal("assessment_created"), payload: z.object({ assessment_id: uuid, based_on_state_version: z.number().int().positive() }).strict() }).strict(),
  z.object({ ...eventBase, event_type: z.literal("reviewer_correction_recorded"), payload: z.object({ correction_claim_id: uuid, corrected_claim_id: uuid }).strict() }).strict(),
]);

export const contradictionSchema = z.object({ entity_type: z.enum(ENTITY_TYPES), entity_id: uuid, property_key: z.enum(ALL_PROPERTY_KEYS), claim_ids: z.array(uuid).min(2).readonly(), diagnostic_code: z.enum(DIAGNOSTIC_CODES) }).strict();
export const missingInformationSchema = z.object({ information_key: z.enum(ALL_PROPERTY_KEYS), entity_type: z.enum(ENTITY_TYPES), entity_id: uuid, importance: z.enum(["critical", "high", "medium", "low"]), reason_code: z.enum(MISSING_REASON_CODES), blocks_level: readinessLevelSchema, can_use_assumption: z.boolean(), can_require_site_check: z.boolean() }).strict();
export const readinessDimensionSchema = z.object({ status: uncertaintyClassSchema, blockers: z.array(z.enum(ALL_PROPERTY_KEYS)).readonly(), warnings: z.array(z.enum(ALL_PROPERTY_KEYS)).readonly(), assumptions: z.array(uuid).readonly(), site_check_items: z.array(z.enum(ALL_PROPERTY_KEYS)).readonly() }).strict();
export const intermediateAssessmentSchema = z.object({
  assessment_id: uuid, project_id: uuid, conversation_id: uuid, based_on_state_version: z.number().int().positive(), readiness_level: readinessLevelSchema,
  readiness_dimensions: z.record(z.enum(READINESS_DIMENSIONS), readinessDimensionSchema), known_facts: z.array(uuid).readonly(), reported_information: z.array(uuid).readonly(), assumptions: z.array(uuid).readonly(), unknowns: z.array(z.enum(ALL_PROPERTY_KEYS)).readonly(), contradictions: z.array(contradictionSchema).readonly(), site_check_items: z.array(z.enum(ALL_PROPERTY_KEYS)).readonly(), allowed_outputs: z.array(z.enum(ALLOWED_OUTPUTS)).readonly(), prohibited_outputs: z.array(z.enum(PROHIBITED_OUTPUTS)).readonly(), created_at: timestamp, created_by_actor_class: z.enum(["system", "admin", "reviewer"]),
}).strict();
export type IntermediateAssessment = z.infer<typeof intermediateAssessmentSchema>;
