import { z } from "zod";

export const MEDIA_DEPENDENCY_PROJECTION_VERSION = "media_dependency_projection_v1" as const;
export const MEDIA_DEPENDENCY_TYPES = ["evidence_interpretation", "observation_followup", "claim_proposal_review", "claim_apply", "claim_correction"] as const;
export const MEDIA_DEPENDENCY_STATUSES = ["open", "resolved", "invalidated"] as const;
export const MEDIA_DEPENDENCY_COMPLETENESS_STATUSES = ["complete", "incomplete", "drifted", "rebuild_required"] as const;
export const MEDIA_DEPENDENCY_MISSING_AUTHORITIES = ["offer", "execution"] as const;
export const MEDIA_DEPENDENCY_REASON_CODES = [
  "interpretation_pending", "interpretation_retry_required", "observation_followup_pending",
  "proposal_review_pending", "approved_apply_pending", "claim_apply_retry_required",
  "claim_correction_pending", "claim_correction_retry_required", "offer_authority_missing", "execution_authority_missing",
  "source_record_inconsistent", "projection_incomplete", "source_media_unavailable",
] as const;

type DependencyType = typeof MEDIA_DEPENDENCY_TYPES[number];
type DependencyStatus = typeof MEDIA_DEPENDENCY_STATUSES[number];
type ReasonCode = typeof MEDIA_DEPENDENCY_REASON_CODES[number];
type MissingAuthority = typeof MEDIA_DEPENDENCY_MISSING_AUTHORITIES[number];
type Source = Readonly<{ id: string; revision: number }>;
export type MediaDependencyProjectionInput = Readonly<{
  project_id: string;
  project_media_id: string;
  media_available: boolean;
  evidence: readonly Readonly<{
    id: string;
    interpretation_runs: readonly (Source & { status: "pending" | "in_progress" | "completed" | "insufficient_evidence" | "failed" | "invalidated"; result_code: string | null })[];
    observations: readonly (Source & { status: "recorded" | "invalidated"; claimable: boolean; proposal_id: string | null })[];
    proposals: readonly (Source & { observation_id: string; status: "pending_review" | "approved_apply_pending" | "applied" | "rejected" | "insufficient_evidence" | "conflict" | "stale" | "superseded"; apply_result?: "applied" | "no_change" | "retryable_failure" | "replan_required" | "terminal_invalid" | null })[];
    has_applied_claim: boolean;
    corrections?: readonly (Source & { status: "pending" | "applied" | "rejected" | "no_change" | "stale" | "failed" })[];
  }>[];
}>;

export type DerivedMediaDependency = Readonly<{
  evidence_id: string; dependency_type: DependencyType; source_record_kind: "interpretation_run" | "observation" | "claim_proposal" | "knowledge_correction";
  source_record_id: string; source_revision: number; status: DependencyStatus; reason_codes: readonly ReasonCode[];
}>;
export type MediaDependencyProjectionResult = Readonly<{
  projection_version: typeof MEDIA_DEPENDENCY_PROJECTION_VERSION;
  dependencies: readonly DerivedMediaDependency[];
  completeness: "complete" | "incomplete";
  missing_authority_types: readonly MissingAuthority[];
  reason_codes: readonly ReasonCode[];
}>;

const terminalProposal = new Set(["applied", "rejected", "insufficient_evidence", "superseded"]);
const reasonForMissing = { offer: "offer_authority_missing", execution: "execution_authority_missing" } as const;

/** Pure, clock-free projection. Source tables remain authoritative; output ordering is canonical. */
export function deriveProjectMediaDependencies(input: MediaDependencyProjectionInput): MediaDependencyProjectionResult {
  const dependencies: DerivedMediaDependency[] = [];
  let inconsistent = false;
  for (const evidence of input.evidence) {
    const proposalIds = new Set(evidence.proposals.map((proposal) => proposal.id));
    for (const run of evidence.interpretation_runs) {
      const retry = run.status === "failed";
      const open = run.status === "pending" || run.status === "in_progress" || retry;
      dependencies.push({ evidence_id: evidence.id, dependency_type: "evidence_interpretation", source_record_kind: "interpretation_run", source_record_id: run.id, source_revision: run.revision, status: run.status === "invalidated" ? "invalidated" : open ? "open" : "resolved", reason_codes: open ? [retry ? "interpretation_retry_required" : "interpretation_pending"] : [] });
    }
    for (const observation of evidence.observations) {
      if (observation.proposal_id && !proposalIds.has(observation.proposal_id)) inconsistent = true;
      const open = observation.status === "recorded" && observation.claimable && !observation.proposal_id;
      dependencies.push({ evidence_id: evidence.id, dependency_type: "observation_followup", source_record_kind: "observation", source_record_id: observation.id, source_revision: observation.revision, status: observation.status === "invalidated" ? "invalidated" : open ? "open" : "resolved", reason_codes: open ? ["observation_followup_pending"] : [] });
    }
    for (const proposal of evidence.proposals) {
      const reviewOpen = ["pending_review", "approved_apply_pending", "conflict", "stale"].includes(proposal.status);
      dependencies.push({ evidence_id: evidence.id, dependency_type: "claim_proposal_review", source_record_kind: "claim_proposal", source_record_id: proposal.id, source_revision: proposal.revision, status: proposal.status === "superseded" ? "invalidated" : reviewOpen ? "open" : "resolved", reason_codes: reviewOpen ? [proposal.status === "approved_apply_pending" ? "approved_apply_pending" : "proposal_review_pending"] : [] });
      if (proposal.status === "approved_apply_pending" || proposal.status === "applied" || proposal.apply_result) {
        const retry = proposal.apply_result === "retryable_failure" || proposal.apply_result === "replan_required";
        const invalid = proposal.apply_result === "terminal_invalid";
        const resolved = proposal.status === "applied" && (proposal.apply_result === "applied" || proposal.apply_result === "no_change" || proposal.apply_result == null);
        dependencies.push({ evidence_id: evidence.id, dependency_type: "claim_apply", source_record_kind: "claim_proposal", source_record_id: proposal.id, source_revision: proposal.revision, status: invalid ? "invalidated" : resolved ? "resolved" : "open", reason_codes: resolved || invalid ? [] : [retry ? "claim_apply_retry_required" : "approved_apply_pending"] });
      }
      if (!terminalProposal.has(proposal.status) && proposal.status !== "pending_review" && proposal.status !== "approved_apply_pending" && proposal.status !== "conflict" && proposal.status !== "stale") inconsistent = true;
    }
    for (const correction of evidence.corrections ?? []) {
      const open = correction.status === "pending" || correction.status === "stale" || correction.status === "failed";
      dependencies.push({ evidence_id: evidence.id, dependency_type: "claim_correction", source_record_kind: "knowledge_correction", source_record_id: correction.id, source_revision: correction.revision, status: open ? "open" : "resolved", reason_codes: open ? [correction.status === "pending" ? "claim_correction_pending" : "claim_correction_retry_required"] : [] });
    }
  }
  const missing = [...MEDIA_DEPENDENCY_MISSING_AUTHORITIES];
  const reasons: ReasonCode[] = missing.map((authority) => reasonForMissing[authority]);
  if (!input.media_available) reasons.push("source_media_unavailable");
  if (inconsistent) reasons.push("source_record_inconsistent", "projection_incomplete");
  const rank = (value: DerivedMediaDependency) => `${value.evidence_id}:${value.dependency_type}:${value.source_record_id}`;
  dependencies.sort((a, b) => rank(a).localeCompare(rank(b)));
  return Object.freeze({ projection_version: MEDIA_DEPENDENCY_PROJECTION_VERSION, dependencies: Object.freeze(dependencies), completeness: inconsistent || !input.media_available ? "incomplete" : "complete", missing_authority_types: Object.freeze(missing), reason_codes: Object.freeze([...new Set(reasons)]) });
}

export const mediaDependencyProjectionDtoSchema = z.object({
  project_media_id: z.string().uuid(), projection_status: z.enum(MEDIA_DEPENDENCY_COMPLETENESS_STATUSES),
  open_dependencies: z.number().int().nonnegative(), missing_authorities: z.array(z.enum(MEDIA_DEPENDENCY_MISSING_AUTHORITIES)),
  reason_codes: z.array(z.enum(MEDIA_DEPENDENCY_REASON_CODES)), projection_version: z.literal(MEDIA_DEPENDENCY_PROJECTION_VERSION),
  updated_at: z.string().datetime({ offset: true }),
}).strict();
export type MediaDependencyProjectionDto = Readonly<z.infer<typeof mediaDependencyProjectionDtoSchema>>;
