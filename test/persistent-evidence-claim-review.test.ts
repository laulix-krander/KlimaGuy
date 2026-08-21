import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { canApplyReviewedEvidenceClaim, canReviewEvidenceClaimProposal } from "@/lib/domain/permissions";
import { EVIDENCE_CLAIM_PROPOSAL_STATUSES, createEvidenceClaimProposalInputSchema, evidenceClaimProposalDtoSchema, reviewEvidenceClaimProposalInputSchema } from "@/lib/domain/conversation-intelligence/persistent-claim-review";

const sql = readFileSync("supabase/migrations/202608210005_persistent_evidence_claim_review.sql", "utf8");

describe("persistent claim/review contracts", () => {
  it("keeps payloads narrow and status/strength/epistemic closed", () => {
    expect(EVIDENCE_CLAIM_PROPOSAL_STATUSES).toEqual(["pending_review","approved_apply_pending","applied","rejected","insufficient_evidence","conflict","stale","superseded"]);
    expect(createEvidenceClaimProposalInputSchema.safeParse({ observation_id: crypto.randomUUID(), property: "free" }).success).toBe(false);
    expect(reviewEvidenceClaimProposalInputSchema.safeParse({ proposal_id: crypto.randomUUID(), expected_proposal_revision: 1, review_action: "change_strength" }).success).toBe(false);
    const base = { proposal_id:crypto.randomUUID(),evidence_id:crypto.randomUUID(),observation_id:crypto.randomUUID(),property:"room_overview_context_observed",value:true,value_type:"boolean",epistemic:"observed",strength:"descriptive_fact",status:"pending_review",revision:1,created_at:"2026-08-21T12:00:00.000Z",updated_at:"2026-08-21T12:00:00.000Z" };
    expect(evidenceClaimProposalDtoSchema.safeParse(base).success).toBe(true);
    expect(evidenceClaimProposalDtoSchema.safeParse({...base,strength:"reviewer_approved"}).success).toBe(false);
    expect(evidenceClaimProposalDtoSchema.safeParse({...base,epistemic:"confirmed"}).success).toBe(false);
  });
  it("uses separate admin-only capabilities", () => {
    expect(canReviewEvidenceClaimProposal("admin")).toBe(true); expect(canApplyReviewedEvidenceClaim("admin")).toBe(true);
    for (const role of ["reviewer", null] as const) { expect(canReviewEvidenceClaimProposal(role)).toBe(false); expect(canApplyReviewedEvidenceClaim(role)).toBe(false); }
  });
});

describe("persistent claim/review migration", () => {
  it("creates separate project-bound authorities and semantic uniqueness", () => {
    expect(sql).toContain("create table public.evidence_claim_proposals"); expect(sql).toContain("create table public.evidence_claim_reviews");
    expect(sql).toContain("foreign key (project_id,evidence_id,interpretation_run_id,observation_id)"); expect(sql).toContain("foreign key(project_id,proposal_id)");
    expect(sql).toContain("evidence_claim_proposal_semantic_key unique"); expect(sql).toContain("evidence_claim_review_replay_key unique");
  });
  it("enforces append-only history, RLS, indexes and narrow grants", () => {
    expect(sql).toContain("evidence_claim_reviews_append_only"); expect(sql.match(/enable row level security/g)).toHaveLength(2);
    expect(sql).toContain("grant select on public.evidence_claim_proposals,public.evidence_claim_reviews"); expect(sql).not.toMatch(/grant (insert|update|delete|all) on public\.evidence_claim_(proposals|reviews)/i);
    expect(sql).toContain("evidence_claim_proposals_project_status_idx"); expect(sql).toContain("evidence_claim_reviews_project_proposal_idx");
  });
  it("locks lifecycle races, observations and review CAS fail closed", () => {
    expect((sql.match(/for update/g) ?? []).length).toBeGreaterThanOrEqual(8); expect(sql).toContain("o.status<>'recorded'"); expect(sql).toContain("p.revision<>expected_proposal_revision");
    expect(sql).toContain("lc.deletion_execution_state<>'idle'"); expect(sql).toContain("project_evidence_tombstones"); expect(sql).toContain("approved_apply_pending");
  });
  it("materializes exactly the five positive descriptive mappings without apply", () => {
    for (const property of ["room_overview_context_observed","indoor_installation_area_observed","outdoor_installation_area_observed","line_route_context_observed","wall_penetration_context_observed"]) expect(sql).toContain(property);
    expect(sql).not.toMatch(/addClaim|applyStateTransitionProposal|knowledge_claim_recorded/); expect(sql).toContain("knowledge_strength='descriptive_fact'"); expect(sql).toContain("epistemic_status='observed'");
  });
  it("contains sanitized audit actions and no locator, PII, AI or network columns", () => {
    for (const action of ["claim_proposal_created","claim_proposal_replayed","claim_review_approved","claim_review_rejected","claim_review_evidence_insufficient","claim_apply_pending"]) expect(sql).toContain(action);
    expect(sql).not.toMatch(/email|customer_text|storage_path|signed_url|provider_response|prompt|service.role|storage\.from|https?:|openai|anthropic|whatsapp|ocr/i);
  });
});
