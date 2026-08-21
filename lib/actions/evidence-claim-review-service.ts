import { canReviewEvidenceClaimProposal } from "@/lib/domain/permissions";
import { roleSchema } from "@/lib/domain/schemas";
import {
  createEvidenceClaimProposalInputSchema, evidenceClaimProposalDtoSchema, evidenceClaimReviewDtoSchema,
  reviewEvidenceClaimProposalInputSchema, type EvidenceClaimProposalDto, type EvidenceClaimReviewDto,
} from "@/lib/domain/conversation-intelligence/persistent-claim-review";
import { proposeKnowledgeClaimFromObservation } from "@/lib/domain/conversation-intelligence/observation-claim-mapping";

type Result<T> = Promise<{ data: T | null; error: unknown }>;
export type EvidenceClaimReviewDataSource = {
  auth: { getUser(): Promise<{ data: { user: { id: string } | null } }> };
  getProfile(id: string): Result<{ role: string | null }>;
  getMappingInput(observationId: string): Result<unknown>;
  create(observationId: string): Result<unknown>;
  review(input: { proposal_id: string; expected_proposal_revision: number; review_action: string }): Result<unknown>;
  listProposals(projectId: string): Result<unknown[]>;
  listReviews(projectId: string): Result<unknown[]>;
};
type Failure = { success: false; code: "invalid_input" | "not_authenticated" | "not_authorized" | "not_claimable" | "stale" | "persistence_failed"; error: string };
const fail = (code: Failure["code"], error: string): Failure => ({ success: false, code, error });
async function authorize(source: EvidenceClaimReviewDataSource): Promise<Failure | null> {
  const { data } = await source.auth.getUser(); if (!data.user) return fail("not_authenticated", "Zugriff nicht erlaubt.");
  const profile = await source.getProfile(data.user.id); const role = roleSchema.safeParse(profile.data?.role);
  return role.success && canReviewEvidenceClaimProposal(role.data) ? null : fail("not_authorized", "Zugriff nicht erlaubt.");
}
export async function createPersistentEvidenceClaimProposal(source: EvidenceClaimReviewDataSource, input: unknown): Promise<{ success: true; data: EvidenceClaimProposalDto } | Failure> {
  const parsed = createEvidenceClaimProposalInputSchema.safeParse(input); if (!parsed.success) return fail("invalid_input", "Ungültige Beobachtung.");
  const denied = await authorize(source); if (denied) return denied;
  // This is the only semantic mapping boundary. The RPC reconstructs the same row under
  // lock and treats its property allowlist only as database defence-in-depth.
  const mappingInput = await source.getMappingInput(parsed.data.observation_id);
  if (mappingInput.error || proposeKnowledgeClaimFromObservation(mappingInput.data).kind !== "claim_proposal") return fail("not_claimable", "Beobachtung ist nicht claimfähig.");
  const result = await source.create(parsed.data.observation_id); if (result.error || !result.data) return fail("not_claimable", "Beobachtung ist nicht claimfähig.");
  const dto = evidenceClaimProposalDtoSchema.safeParse(result.data); return dto.success ? { success: true, data: dto.data } : fail("persistence_failed", "Claim-Vorschlag konnte nicht gespeichert werden.");
}
export async function reviewPersistentEvidenceClaimProposal(source: EvidenceClaimReviewDataSource, input: unknown): Promise<{ success: true; data: { proposal: EvidenceClaimProposalDto; review: EvidenceClaimReviewDto } } | Failure> {
  const parsed = reviewEvidenceClaimProposalInputSchema.safeParse(input); if (!parsed.success) return fail("invalid_input", "Ungültige Reviewentscheidung.");
  const denied = await authorize(source); if (denied) return denied;
  const result = await source.review(parsed.data); if (result.error || !result.data || typeof result.data !== "object") return fail("stale", "Proposal ist nicht mehr reviewbar.");
  const row = result.data as { proposal?: unknown; review?: unknown }, proposal = evidenceClaimProposalDtoSchema.safeParse(row.proposal), review = evidenceClaimReviewDtoSchema.safeParse(row.review);
  return proposal.success && review.success ? { success: true, data: { proposal: proposal.data, review: review.data } } : fail("persistence_failed", "Reviewentscheidung konnte nicht gespeichert werden.");
}
export async function readPersistentEvidenceClaimReviews(source: EvidenceClaimReviewDataSource, projectId: string): Promise<{ success: true; data: { proposals: EvidenceClaimProposalDto[]; reviews: EvidenceClaimReviewDto[] } } | Failure> {
  const id = zUuid.safeParse(projectId); if (!id.success) return fail("invalid_input", "Ungültiges Projekt."); const denied = await authorize(source); if (denied) return denied;
  const [p, r] = await Promise.all([source.listProposals(id.data), source.listReviews(id.data)]); const proposals = p.data?.map(x => evidenceClaimProposalDtoSchema.safeParse(x)); const reviews = r.data?.map(x => evidenceClaimReviewDtoSchema.safeParse(x));
  if (p.error || r.error || !proposals || !reviews || proposals.some(x => !x.success) || reviews.some(x => !x.success)) return fail("persistence_failed", "Reviews konnten nicht geladen werden.");
  return { success: true, data: { proposals: proposals.flatMap(x => x.success ? [x.data] : []), reviews: reviews.flatMap(x => x.success ? [x.data] : []) } };
}
const zUuid = createEvidenceClaimProposalInputSchema.shape.observation_id;
