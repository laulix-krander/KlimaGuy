import { z } from "zod";

export const PROJECT_OFFER_STATUSES = ["draft", "created", "sent", "accepted", "rejected", "superseded"] as const;
export const projectOfferStatusSchema = z.enum(PROJECT_OFFER_STATUSES);
export type ProjectOfferStatus = z.infer<typeof projectOfferStatusSchema>;

export const projectOfferDtoSchema = z.object({
  id: z.string().uuid(), project_id: z.string().uuid(), offer_version: z.number().int().positive(), revision: z.number().int().positive(),
  status: projectOfferStatusSchema, supersedes_offer_id: z.string().uuid().nullable(), created_at: z.string().datetime({ offset: true }),
  offer_created_at: z.string().datetime({ offset: true }).nullable(), sent_at: z.string().datetime({ offset: true }).nullable(),
  accepted_at: z.string().datetime({ offset: true }).nullable(), rejected_at: z.string().datetime({ offset: true }).nullable(),
  updated_at: z.string().datetime({ offset: true }),
}).strict();
export type ProjectOfferDto = z.infer<typeof projectOfferDtoSchema>;

export const createProjectOfferDraftSchema = z.object({ projectId: z.string().uuid(), expectedProjectStatus: z.enum(["technical_review", "human_review"]), idempotencyKey: z.string().trim().min(8).max(128) }).strict();
export const transitionProjectOfferSchema = z.object({ projectId: z.string().uuid(), offerId: z.string().uuid(), expectedRevision: z.number().int().positive(), idempotencyKey: z.string().trim().min(8).max(128) }).strict();

const transitions: Readonly<Record<ProjectOfferStatus, readonly ProjectOfferStatus[]>> = Object.freeze({
  draft: ["created"], created: ["sent", "superseded"], sent: ["accepted", "rejected", "superseded"], accepted: [], rejected: [], superseded: [],
});
export function isProjectOfferTransitionAllowed(from: ProjectOfferStatus, to: ProjectOfferStatus): boolean { return transitions[from].includes(to); }

/** `created` proves a materialized persistent revision, never a PDF or delivery artifact. */
export function offerDependencyState(status: ProjectOfferStatus): { preparationOpen: boolean; offerOpen: boolean } {
  return { preparationOpen: status === "draft", offerOpen: status === "created" || status === "sent" };
}
