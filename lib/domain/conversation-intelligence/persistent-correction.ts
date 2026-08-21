import { z } from "zod";
import { getEffectiveClaims, retractClaim } from "./knowledge-state";
import { knowledgeStateSchema, type KnowledgeState } from "./schemas";

export const CORRECTION_TYPES = ["evidence_invalidation", "observation_invalidation", "observation_supersession", "proposal_supersession", "claim_retraction", "claim_replacement"] as const;
export const CORRECTION_ACTIONS = ["invalidate", "supersede", "retract", "replace"] as const;
export const CORRECTION_STATUSES = ["pending", "applied", "rejected", "no_change", "stale", "failed"] as const;
export const CORRECTION_REASON_CODES = ["wrong_project", "wrong_target", "wrong_evidence_binding", "observation_incorrect", "interpretation_error", "reviewer_correction", "duplicate_evidence", "superseded_by_better_evidence", "provenance_invalidated"] as const;
export const CORRECTION_FAILURE_CODES = ["invalid_input", "unauthorized", "target_not_found", "target_already_invalidated", "correction_already_applied", "stale_target_revision", "stale_state", "reviewer_protected", "source_media_unavailable", "replacement_not_valid", "correction_conflict", "persistence_failed", "transition_already_applied"] as const;
export type CorrectionFailureCode = typeof CORRECTION_FAILURE_CODES[number];
export const correctionRetryClass = (code: CorrectionFailureCode): "retryable" | "requires_recheck" | "requires_review" | "terminal" => code === "persistence_failed" ? "retryable" : ["stale_target_revision", "stale_state", "correction_conflict"].includes(code) ? "requires_recheck" : ["reviewer_protected", "replacement_not_valid", "source_media_unavailable"].includes(code) ? "requires_review" : "terminal";

const uuid = z.string().uuid(); const timestamp = z.string().datetime({ offset: true });
export const knowledgeCorrectionDtoSchema = z.object({ correction_id: uuid, correction_type: z.enum(CORRECTION_TYPES), status: z.enum(CORRECTION_STATUSES), reason: z.enum(CORRECTION_REASON_CODES), target_type: z.enum(["evidence", "observation", "proposal", "claim"]), target_id: uuid, resulting_state_version: z.number().int().positive().nullable(), actor_class: z.literal("admin"), created_at: timestamp, applied_at: timestamp.nullable(), updated_at: timestamp }).strict();

export type ClaimRetractionInput = Readonly<{ state: KnowledgeState; claim_id: string; expected_state_version: number; applied_at: string; actor_class: "admin"; allow_reviewer_override?: boolean }>;
export type ClaimRetractionResult = Readonly<{ success: true; code: "applied"; changed: true; state: KnowledgeState }> | Readonly<{ success: true; code: "no_change"; changed: false; state: KnowledgeState }> | Readonly<{ success: false; code: "invalid_input" | "stale_state" | "target_not_found" | "reviewer_protected"; retry_class: "requires_recheck" | "requires_review" | "terminal" }>;

/** Pure half of the CAS apply. Persistence locks state/correction and records the transition atomically. */
export function applyClaimRetraction(input: ClaimRetractionInput): ClaimRetractionResult {
  const parsed = knowledgeStateSchema.safeParse(input.state);
  if (!parsed.success || input.actor_class !== "admin") return { success: false, code: "invalid_input", retry_class: "terminal" };
  if (parsed.data.state_version !== input.expected_state_version) return { success: false, code: "stale_state", retry_class: "requires_recheck" };
  const target = parsed.data.claims.find((claim) => claim.claim_id === input.claim_id);
  if (!target) return { success: false, code: "target_not_found", retry_class: "terminal" };
  if (target.evidence.some((item) => item.actor_class === "reviewer" || item.evidence_status === "manually_corrected" || item.source_type === "reviewer_correction") && !input.allow_reviewer_override) return { success: false, code: "reviewer_protected", retry_class: "requires_review" };
  if (!getEffectiveClaims(parsed.data).some((claim) => claim.claim_id === input.claim_id)) return { success: true, code: "no_change", changed: false, state: parsed.data };
  const result = retractClaim(parsed.data, input.claim_id, input.expected_state_version, input.applied_at);
  return result.success ? { success: true, code: "applied", changed: true, state: result.data } : { success: false, code: "invalid_input", retry_class: "terminal" };
}
