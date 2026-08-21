import { z } from "zod";
import { DESCRIPTIVE_REVIEW_PROPERTIES } from "./descriptive-claim-review";
import { getEffectiveClaims } from "./knowledge-state";
import { knowledgeStateSchema, type KnowledgeClaim, type KnowledgeState } from "./schemas";

export const KNOWLEDGE_STATE_SCHEMA_VERSION = 1 as const;
export const KNOWLEDGE_STATE_INITIAL_VERSION = 1 as const;
export const KNOWLEDGE_APPLY_RESULT_CODES = ["applied", "no_change"] as const;
export const KNOWLEDGE_APPLY_FAILURE_CODES = ["invalid_input", "unauthorized", "proposal_not_found", "proposal_not_applyable", "approval_review_missing", "stale_proposal", "stale_state", "observation_invalidated", "evidence_invalid", "source_media_unavailable", "project_mismatch", "reviewer_protection", "contradiction_requires_review", "persistence_failed", "transition_already_applied"] as const;

const uuid = z.string().uuid();
const timestamp = z.string().datetime({ offset: true });
export const applyReviewedClaimInputSchema = z.object({
  proposal_id: uuid,
  expected_proposal_revision: z.number().int().positive(),
  expected_state_version: z.number().int().positive(),
}).strict();
export const persistentClaimRowSchema = z.object({
  claim_id: uuid, project_id: uuid, entity_id: uuid, entity_type: z.enum(["project", "room", "installation"]),
  property_key: z.string(), value_type: z.enum(["string", "number", "boolean", "unknown"]),
  value_text: z.string().nullable(), value_number: z.number().nullable(), value_boolean: z.boolean().nullable(),
  epistemic_status: z.enum(["confirmed", "reported", "observed", "estimated", "assumed", "unknown", "not_applicable", "contradicted", "requires_site_check"]),
  knowledge_strength: z.enum(["observed", "descriptive_fact", "technical_hypothesis", "technical_assessment", "reviewer_approved", "site_verified"]).nullable(),
  supersedes_claim_id: uuid.nullable(), claim_state_version: z.number().int().positive(), created_at: timestamp,
  evidence: z.array(z.object({ id: uuid, evidence_id: uuid, actor_class: z.enum(["admin", "reviewer", "ai"]), evidence_status: z.enum(["active", "superseded", "invalidated", "manually_confirmed", "manually_corrected"]), observed_at: timestamp }).strict()).min(1),
}).strict();
export const knowledgeStateHeaderRowSchema = z.object({ id: uuid, project_id: uuid, current_version: z.number().int().positive(), schema_version: z.literal(KNOWLEDGE_STATE_SCHEMA_VERSION), updated_at: timestamp }).strict();
export const knowledgeClaimDtoSchema = z.object({ claim_id: uuid, entity_id: uuid, entity_type: z.enum(["project", "room", "installation"]), property_key: z.string(), value: z.union([z.string(), z.number(), z.boolean(), z.null()]), value_type: z.enum(["string", "number", "boolean", "unknown"]), epistemic_status: z.string(), knowledge_strength: z.string().nullable(), created_at: timestamp }).strict();
export const projectKnowledgeStateDtoSchema = z.object({ project_id: uuid, current_version: z.number().int().positive(), schema_version: z.literal(1), effective_claims: z.array(knowledgeClaimDtoSchema) }).strict();
export const knowledgeApplyResultDtoSchema = z.object({ transition_id: uuid, proposal_id: uuid, claim_id: uuid.nullable(), result: z.enum(KNOWLEDGE_APPLY_RESULT_CODES), retry_class: z.literal("terminal"), previous_state_version: z.number().int().positive(), current_state_version: z.number().int().positive(), replayed: z.boolean() }).strict();

export type PersistentClaimRow = z.infer<typeof persistentClaimRowSchema>;
export type ProjectKnowledgeStateDto = z.infer<typeof projectKnowledgeStateDtoSchema>;

const typedValue = (row: PersistentClaimRow) => row.value_type === "string" ? row.value_text : row.value_type === "number" ? row.value_number : row.value_type === "boolean" ? row.value_boolean : null;

/** Materializes the existing pure aggregate. conversation_id is transient execution context only and is never persisted. */
export function materializePersistentKnowledgeState(header: unknown, rows: unknown[], transientConversationId: string): KnowledgeState {
  const stateHeader = knowledgeStateHeaderRowSchema.parse(header);
  const claims = rows.map(raw => {
    const row = persistentClaimRowSchema.parse(raw);
    const claim = {
      claim_id: row.claim_id, project_id: row.project_id, entity_type: row.entity_type, entity_id: row.entity_id,
      property_key: row.property_key, value_type: row.value_type, value: typedValue(row), epistemic_status: row.epistemic_status,
      evidence: row.evidence.map(item => ({ evidence_id: item.id, source_type: "project_media", source_id: item.evidence_id, actor_class: item.actor_class, observed_at: item.observed_at, evidence_status: item.evidence_status })),
      created_at: row.created_at, state_version: row.claim_state_version,
      ...(row.knowledge_strength ? { knowledge_strength: row.knowledge_strength } : {}), ...(row.supersedes_claim_id ? { supersedes_claim_id: row.supersedes_claim_id } : {}),
    };
    return claim as KnowledgeClaim;
  });
  return knowledgeStateSchema.parse({ project_id: stateHeader.project_id, conversation_id: transientConversationId, state_version: stateHeader.current_version, claims, updated_at: stateHeader.updated_at });
}

export function toProjectKnowledgeStateDto(state: KnowledgeState, schemaVersion = KNOWLEDGE_STATE_SCHEMA_VERSION): ProjectKnowledgeStateDto {
  return projectKnowledgeStateDtoSchema.parse({ project_id: state.project_id, current_version: state.state_version, schema_version: schemaVersion, effective_claims: getEffectiveClaims(state).map(claim => ({ claim_id: claim.claim_id, entity_id: claim.entity_id, entity_type: claim.entity_type, property_key: claim.property_key, value: claim.value, value_type: claim.value_type, epistemic_status: claim.epistemic_status, knowledge_strength: claim.knowledge_strength ?? null, created_at: claim.created_at })) });
}

export const isDescriptiveApplyProperty = (value: string): value is typeof DESCRIPTIVE_REVIEW_PROPERTIES[number] => (DESCRIPTIVE_REVIEW_PROPERTIES as readonly string[]).includes(value);
