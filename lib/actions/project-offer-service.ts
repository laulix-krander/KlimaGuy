import { canManageProjectOffers } from "@/lib/domain/permissions";
import { createProjectOfferDraftSchema, projectOfferDtoSchema, transitionProjectOfferSchema, type ProjectOfferDto } from "@/lib/domain/project-offer";
import { roleSchema } from "@/lib/domain/schemas";
import type { ActionResult } from "./project-create-service";

type RpcResult = Promise<{ data: unknown; error: unknown }>;
export type ProjectOfferDataSource = {
  auth: { getUser(): Promise<{ data: { user: { id: string } | null } }> };
  getRole(actorId: string): Promise<string | null>;
  rpc(name: "create_project_offer_draft" | "mark_project_offer_created" | "mark_project_offer_sent" | "accept_project_offer" | "reject_project_offer" | "supersede_project_offer", args: Record<string, unknown>): RpcResult;
};

async function authorize(ds: ProjectOfferDataSource): Promise<ActionResult<true>> {
  const { data } = await ds.auth.getUser();
  if (!data.user) return { success: false, error: "Sie müssen angemeldet sein." };
  const role = roleSchema.safeParse(await ds.getRole(data.user.id));
  if (!role.success || !canManageProjectOffers(role.data)) return { success: false, error: "Sie sind nicht berechtigt, Angebote zu verwalten." };
  return { success: true, data: true };
}

async function invoke(ds: ProjectOfferDataSource, name: Parameters<ProjectOfferDataSource["rpc"]>[0], args: Record<string, unknown>): Promise<ActionResult<ProjectOfferDto>> {
  const auth = await authorize(ds); if (!auth.success) return auth;
  const { data, error } = await ds.rpc(name, args);
  if (error) return { success: false, error: "Die Angebotsänderung konnte nicht sicher gespeichert werden." };
  const parsed = projectOfferDtoSchema.safeParse(data);
  return parsed.success ? { success: true, data: parsed.data } : { success: false, error: "Die Angebotsantwort war ungültig." };
}

export async function createProjectOfferDraft(ds: ProjectOfferDataSource, input: unknown): Promise<ActionResult<ProjectOfferDto>> {
  const p = createProjectOfferDraftSchema.safeParse(input); if (!p.success) return { success: false, error: "Die Angebotsanfrage ist ungültig." };
  return invoke(ds, "create_project_offer_draft", { target_project_id: p.data.projectId, expected_project_status: p.data.expectedProjectStatus, target_idempotency_key: p.data.idempotencyKey });
}
export async function transitionProjectOffer(ds: ProjectOfferDataSource, action: "created" | "sent" | "accepted" | "rejected" | "supersede", input: unknown): Promise<ActionResult<ProjectOfferDto>> {
  const p = transitionProjectOfferSchema.safeParse(input); if (!p.success) return { success: false, error: "Die Angebotsanfrage ist ungültig." };
  const rpc = ({ created: "mark_project_offer_created", sent: "mark_project_offer_sent", accepted: "accept_project_offer", rejected: "reject_project_offer", supersede: "supersede_project_offer" } as const)[action];
  return invoke(ds, rpc, { target_project_id: p.data.projectId, target_offer_id: p.data.offerId, expected_revision: p.data.expectedRevision, target_idempotency_key: p.data.idempotencyKey });
}
