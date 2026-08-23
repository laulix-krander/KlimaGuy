import { projectOfferDtoSchema, type ProjectOfferDto } from "@/lib/domain/project-offer";
import { z } from "zod";

export type ProjectOfferReadDataSource = { list(projectId: string): Promise<{ data: unknown; error: unknown }> };
export async function readProjectOffers(ds: ProjectOfferReadDataSource, projectId: unknown): Promise<{ current: ProjectOfferDto | null; history: ProjectOfferDto[] }> {
  const id = z.string().uuid().parse(projectId); const { data, error } = await ds.list(id); if (error) throw new Error("Angebote konnten nicht geladen werden.");
  const rows = z.array(projectOfferDtoSchema).parse(data);
  return { current: rows.find((offer) => offer.status !== "superseded") ?? null, history: rows.filter((offer) => offer.status === "superseded") };
}
