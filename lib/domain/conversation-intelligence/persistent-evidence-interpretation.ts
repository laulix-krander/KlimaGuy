import { z } from "zod";
import {
  EVIDENCE_OBSERVATION_TYPES,
  EVIDENCE_QUALITIES,
  INTERPRETATION_STATUSES as OBSERVATION_INTERPRETATION_STATUSES,
  OBSERVATION_SOURCE_ACTORS,
  evidenceObservationValueSchema,
  evidenceObservationTypeSchema,
  evidenceQualitySchema,
  interpretationStatusSchema,
  observationOptionsForTarget,
  type EvidenceObservationType,
} from "./evidence-observation";
import { evidenceTargetKeySchema, type EvidenceTargetKey } from "./evidence-request";

export const EVIDENCE_INTERPRETATION_RUN_STATUSES = ["pending", "in_progress", "completed", "insufficient_evidence", "failed", "invalidated"] as const;
export const EVIDENCE_INTERPRETATION_RESULT_CODES = ["observation_recorded", "multiple_observations_recorded", "no_observation", "insufficient_evidence", "invalid_evidence", "target_mismatch", "stale_context", "persistence_failed", "source_media_unavailable"] as const;
export const EVIDENCE_INTERPRETATION_VERSIONS = ["synthetic_observation_v1"] as const;
export const PERSISTED_OBSERVATION_STATUSES = ["recorded", "invalidated"] as const;

const uuid = z.string().uuid();
const timestamp = z.string().datetime({ offset: true });
export const interpretationRunStatusSchema = z.enum(EVIDENCE_INTERPRETATION_RUN_STATUSES);
export const interpretationResultCodeSchema = z.enum(EVIDENCE_INTERPRETATION_RESULT_CODES);
export const interpretationVersionSchema = z.enum(EVIDENCE_INTERPRETATION_VERSIONS);

export const startEvidenceInterpretationInputSchema = z.object({ project_id: uuid, evidence_id: uuid }).strict();
export const evidenceInterpretationRunDtoSchema = z.object({
  run_id: uuid, evidence_id: uuid, status: interpretationRunStatusSchema,
  result: interpretationResultCodeSchema.nullable(), revision: z.number().int().positive(),
  interpretation_version: interpretationVersionSchema, started_at: timestamp,
  completed_at: timestamp.nullable(), updated_at: timestamp,
}).strict();
export const persistentObservationDtoSchema = z.object({
  observation_id: uuid, evidence_id: uuid, type: evidenceObservationTypeSchema,
  value: evidenceObservationValueSchema, quality: evidenceQualitySchema,
  actor_class: z.enum(OBSERVATION_SOURCE_ACTORS), interpretation_status: interpretationStatusSchema,
  status: z.enum(PERSISTED_OBSERVATION_STATUSES), observed_at: timestamp, revision: z.number().int().positive(),
}).strict();
export const recordPersistentObservationInputSchema = z.object({
  interpretation_run_id: uuid, observation_id: uuid, observation_type: evidenceObservationTypeSchema,
  observation_value: evidenceObservationValueSchema, evidence_quality: evidenceQualitySchema,
  interpretation_status: interpretationStatusSchema,
}).strict();

export function isObservationAllowedForEvidenceTarget(target: EvidenceTargetKey, type: EvidenceObservationType): boolean {
  return observationOptionsForTarget(evidenceTargetKeySchema.parse(target)).includes(type);
}

// Compile-time guards: the persistence contract deliberately reuses, rather than forks,
// the established observation allowlists.
void EVIDENCE_OBSERVATION_TYPES; void EVIDENCE_QUALITIES; void OBSERVATION_INTERPRETATION_STATUSES;

export type EvidenceInterpretationRunDto = Readonly<z.infer<typeof evidenceInterpretationRunDtoSchema>>;
export type PersistentObservationDto = Readonly<z.infer<typeof persistentObservationDtoSchema>>;
