import { z } from "zod";
import type { ProjectStatus } from "./types";

export const PROJECT_MEDIA_RETENTION_STATES = Object.freeze([
  "protected", "retention_pending", "deletion_eligible", "deletion_blocked",
] as const);
export const PROJECT_MEDIA_HOLD_STATES = Object.freeze(["none", "operational_hold", "legal_hold"] as const);
export const PROJECT_MEDIA_ELIGIBILITY_STATUSES = Object.freeze([
  "eligible", "blocked", "policy_not_configured", "dependency_state_unknown", "media_not_ready",
  "media_already_logically_deleted", "project_state_blocks", "offer_state_blocks",
  "evidence_dependency_blocks", "lifecycle_state_blocks",
] as const);
export const PROJECT_MEDIA_DELETION_REASON_CODES = Object.freeze([
  "media_not_ready", "media_failed", "media_pending", "media_soft_deleted", "lifecycle_missing",
  "retention_policy_missing", "retention_not_completed", "project_active", "offer_state_unknown",
  "offer_open", "offer_preparation_open", "evidence_dependency_open", "observation_dependency_unknown",
  "proposal_dependency_unknown", "review_dependency_unknown", "correction_dependency_unknown",
  "legal_or_operational_hold", "cross_project_mismatch", "unsupported_media_state",
] as const);
export const PROJECT_MEDIA_RETENTION_POLICY_VERSIONS = Object.freeze(["customer_photo_retention_v1"] as const);

export const projectMediaLifecycleDtoSchema = z.object({
  project_media_id: z.string().uuid(),
  retention_state: z.enum(PROJECT_MEDIA_RETENTION_STATES),
  eligibility_status: z.enum(PROJECT_MEDIA_ELIGIBILITY_STATUSES),
  reason_codes: z.array(z.enum(PROJECT_MEDIA_DELETION_REASON_CODES)),
  hold_status: z.enum(PROJECT_MEDIA_HOLD_STATES),
  policy_version: z.enum(PROJECT_MEDIA_RETENTION_POLICY_VERSIONS).nullable(),
  revision: z.number().int().positive(),
  updated_at: z.string().datetime({ offset: true }),
}).strict();

export type ProjectMediaLifecycleDto = z.infer<typeof projectMediaLifecycleDtoSchema>;
export type ProjectMediaDeletionEligibility =
  | { status: "eligible"; reason_codes: [] }
  | { status: Exclude<(typeof PROJECT_MEDIA_ELIGIBILITY_STATUSES)[number], "eligible">; reason_codes: (typeof PROJECT_MEDIA_DELETION_REASON_CODES)[number][] };

export type ProjectMediaDeletionEligibilityInput = {
  project_id: string;
  media: { project_id: string; upload_status: string; deleted_at: string | null };
  lifecycle: ProjectMediaLifecycleDto | null;
  project_status: ProjectStatus;
  evidence: { binding_status: string; target_valid: boolean; purpose_valid: boolean }[];
  offer_state: "not_relevant" | "unknown" | "open" | "closed";
  dependency_state: "not_relevant" | "unknown" | "open" | "closed";
};

const blocked = (status: Exclude<ProjectMediaDeletionEligibility["status"], "eligible">, ...reason_codes: (typeof PROJECT_MEDIA_DELETION_REASON_CODES)[number][]): ProjectMediaDeletionEligibility => ({ status, reason_codes });

/** Pure, deterministic gate only. It never starts or executes deletion. */
export function evaluateProjectMediaDeletionEligibility(input: ProjectMediaDeletionEligibilityInput): ProjectMediaDeletionEligibility {
  if (input.media.project_id !== input.project_id) return blocked("lifecycle_state_blocks", "cross_project_mismatch");
  if (input.media.deleted_at !== null) return blocked("media_already_logically_deleted", "media_soft_deleted");
  if (input.media.upload_status !== "ready") {
    const reason = input.media.upload_status === "pending" ? "media_pending" : input.media.upload_status === "failed" ? "media_failed" : "unsupported_media_state";
    return blocked("media_not_ready", "media_not_ready", reason);
  }
  if (!input.lifecycle) return blocked("lifecycle_state_blocks", "lifecycle_missing");
  if (!input.lifecycle.policy_version) return blocked("policy_not_configured", "retention_policy_missing");
  if (input.lifecycle.hold_status !== "none") return blocked("lifecycle_state_blocks", "legal_or_operational_hold");
  if (input.project_status !== "closed") return blocked("project_state_blocks", "project_active");
  if (input.offer_state === "unknown") return blocked("offer_state_blocks", "offer_state_unknown");
  if (input.offer_state === "open") return blocked("offer_state_blocks", "offer_open");
  if (input.evidence.some((item) => item.binding_status === "bound" && (!item.target_valid || !item.purpose_valid))) return blocked("evidence_dependency_blocks", "evidence_dependency_open");
  if (input.evidence.length > 0 && input.dependency_state === "unknown") return blocked("dependency_state_unknown", "observation_dependency_unknown", "proposal_dependency_unknown", "review_dependency_unknown", "correction_dependency_unknown");
  if (input.dependency_state === "open") return blocked("evidence_dependency_blocks", "evidence_dependency_open");
  if (input.lifecycle.retention_state !== "deletion_eligible" || input.lifecycle.eligibility_status !== "eligible") return blocked("lifecycle_state_blocks", "retention_not_completed");
  return { status: "eligible", reason_codes: [] };
}
