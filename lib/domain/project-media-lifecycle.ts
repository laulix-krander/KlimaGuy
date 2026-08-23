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
  "legal_or_operational_hold", "cross_project_mismatch", "unsupported_media_state", "project_not_terminal",
  "offer_authority_unknown", "execution_active", "execution_authority_unknown", "correction_open",
  "dependency_projection_missing", "dependency_projection_incomplete", "dependency_projection_drifted",
  "dependency_projection_rebuild_required", "missing_authorities", "open_dependencies", "media_not_present",
  "stale_lifecycle_revision", "stale_projection", "legacy_authority_unknown", "delete_attempt_conflict",
] as const);
export const PROJECT_MEDIA_RETENTION_POLICY_VERSIONS = Object.freeze(["customer_photo_retention_v1"] as const);
export const PROJECT_MEDIA_DELETION_EXECUTION_STATES = Object.freeze([
  "idle", "deletion_pending", "deletion_in_progress", "deletion_failed", "physically_deleted",
] as const);
export const PROJECT_MEDIA_PHYSICAL_STATES = Object.freeze(["present", "deletion_pending", "absent", "deletion_failed"] as const);
export const READY_MEDIA_DELETION_REASONS = Object.freeze([
  "retention_expired", "project_closed", "invalid_media", "wrong_project", "duplicate_transport", "admin_cleanup",
] as const);
export const READY_MEDIA_DELETION_ATTEMPT_STATUSES = Object.freeze([
  "claimed", "storage_delete_pending", "storage_deleted", "completion_pending", "completed", "retryable_failed", "terminal_failed",
] as const);
export const READY_MEDIA_DELETION_FAILURE_CODES = Object.freeze([
  "media_not_found", "lifecycle_not_found", "not_deletion_eligible", "stale_lifecycle_revision", "hold_active",
  "project_state_changed", "offer_state_changed", "evidence_dependency_changed", "deletion_already_in_progress",
  "deletion_already_completed", "invalid_claim_token", "storage_delete_failed", "completion_failed",
  "persistence_failed", "cross_project_mismatch",
] as const);

export const readyMediaDeletionInputSchema = z.object({
  project_id: z.string().uuid(),
  project_media_id: z.string().uuid(),
  expected_lifecycle_revision: z.number().int().positive(),
  deletion_reason: z.enum(READY_MEDIA_DELETION_REASONS),
}).strict();

export type ReadyMediaDeletionFailureDisposition = "retryable" | "requires_recheck" | "terminal" | "human_review_required";
export const READY_MEDIA_DELETION_FAILURE_DISPOSITIONS: Readonly<Record<(typeof READY_MEDIA_DELETION_FAILURE_CODES)[number], ReadyMediaDeletionFailureDisposition>> = Object.freeze({
  media_not_found: "terminal", lifecycle_not_found: "requires_recheck", not_deletion_eligible: "requires_recheck",
  stale_lifecycle_revision: "requires_recheck", hold_active: "human_review_required", project_state_changed: "requires_recheck",
  offer_state_changed: "requires_recheck", evidence_dependency_changed: "human_review_required",
  deletion_already_in_progress: "requires_recheck", deletion_already_completed: "terminal", invalid_claim_token: "terminal",
  storage_delete_failed: "retryable", completion_failed: "retryable", persistence_failed: "retryable",
  cross_project_mismatch: "terminal",
});

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
  expected_lifecycle_revision?: number;
  physical_state?: "present" | "deletion_pending" | "absent" | "deletion_failed";
  final_authority?: Readonly<{
    projection: null | { version: typeof import("./project-media-dependency-projection").MEDIA_DEPENDENCY_PROJECTION_VERSION; expected_version: typeof import("./project-media-dependency-projection").MEDIA_DEPENDENCY_PROJECTION_VERSION; revision: number; expected_revision: number; completeness: "complete" | "incomplete" | "drifted" | "rebuild_required"; drift_detected: boolean; missing_authorities: readonly string[]; open_dependencies: number };
    offer: null | { status: "draft" | "created" | "sent" | "accepted" | "rejected" };
    execution: null | { status: "not_started" | "active" | "completed" | "cancelled" };
    correction_open: boolean;
    active_delete_attempt: boolean;
  }>;
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
  if (input.expected_lifecycle_revision !== undefined && input.lifecycle.revision !== input.expected_lifecycle_revision) return blocked("lifecycle_state_blocks", "stale_lifecycle_revision");
  if (input.physical_state !== undefined && input.physical_state !== "present") return blocked("media_not_ready", "media_not_present");
  if (!input.lifecycle.policy_version) return blocked("policy_not_configured", "retention_policy_missing");
  if (input.lifecycle.hold_status !== "none") return blocked("lifecycle_state_blocks", "legal_or_operational_hold");
  if (input.project_status !== "closed") return blocked("project_state_blocks", "project_active");
  const boundEvidence = input.evidence.some((item) => item.binding_status === "bound");
  if (boundEvidence && input.final_authority) {
    const authority = input.final_authority;
    if (!authority.projection) return blocked("dependency_state_unknown", "dependency_projection_missing");
    if (authority.projection.version !== authority.projection.expected_version || authority.projection.revision !== authority.projection.expected_revision) return blocked("dependency_state_unknown", "stale_projection");
    if (authority.projection.completeness === "incomplete") return blocked("dependency_state_unknown", "dependency_projection_incomplete");
    if (authority.projection.completeness === "drifted" || authority.projection.drift_detected) return blocked("dependency_state_unknown", "dependency_projection_drifted");
    if (authority.projection.completeness === "rebuild_required") return blocked("dependency_state_unknown", "dependency_projection_rebuild_required");
    if (authority.projection.missing_authorities.length) return blocked("dependency_state_unknown", "missing_authorities");
    if (authority.projection.open_dependencies > 0) return blocked("evidence_dependency_blocks", "open_dependencies");
    if (authority.correction_open) return blocked("evidence_dependency_blocks", "correction_open");
    if (!authority.offer) return blocked("offer_state_blocks", "offer_authority_unknown", "legacy_authority_unknown");
    if (["draft", "created", "sent"].includes(authority.offer.status)) return blocked("offer_state_blocks", "offer_open");
    if (authority.offer.status === "accepted") {
      if (!authority.execution) return blocked("dependency_state_unknown", "execution_authority_unknown");
      if (["not_started", "active"].includes(authority.execution.status)) return blocked("evidence_dependency_blocks", "execution_active");
    } else if (authority.execution) return blocked("dependency_state_unknown", "execution_authority_unknown");
    if (authority.active_delete_attempt) return blocked("lifecycle_state_blocks", "delete_attempt_conflict");
  }
  if (input.offer_state === "unknown") return blocked("offer_state_blocks", "offer_state_unknown");
  if (input.offer_state === "open") return blocked("offer_state_blocks", "offer_open");
  if (input.evidence.some((item) => item.binding_status === "bound" && (!item.target_valid || !item.purpose_valid))) return blocked("evidence_dependency_blocks", "evidence_dependency_open");
  if (input.evidence.length > 0 && input.dependency_state === "unknown") return blocked("dependency_state_unknown", "observation_dependency_unknown", "proposal_dependency_unknown", "review_dependency_unknown", "correction_dependency_unknown");
  if (input.dependency_state === "open") return blocked("evidence_dependency_blocks", "evidence_dependency_open");
  if (boundEvidence && !input.final_authority) return blocked("dependency_state_unknown", "legacy_authority_unknown");
  if (input.lifecycle.retention_state !== "deletion_eligible" || input.lifecycle.eligibility_status !== "eligible") return blocked("lifecycle_state_blocks", "retention_not_completed");
  return { status: "eligible", reason_codes: [] };
}
