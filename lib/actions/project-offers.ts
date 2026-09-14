"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createProjectOfferDraft } from "./project-offer-service";

export async function createProjectOfferDraftAction(formData: FormData): Promise<void> {
  const client = await createClient();
  const projectId = formData.get("projectId");
  const expectedProjectStatus = formData.get("expectedProjectStatus");
  const result = await createProjectOfferDraft({
    auth: { getUser: () => client.auth.getUser() },
    getRole: async (actorId) => {
      const { data } = await client.from("profiles").select("role").eq("id", actorId).single();
      return data?.role ?? null;
    },
    rpc: async (name, args) => {
      const { data, error } = await client.rpc(name, args);
      return { data, error };
    },
  }, { projectId, expectedProjectStatus, idempotencyKey: crypto.randomUUID() });
  if (!result.success) redirect(`/projects/${String(projectId)}?offer_error=1`);
  revalidatePath(`/projects/${result.data.project_id}`);
  redirect(`/projects/${result.data.project_id}?offer_draft_created=1`);
}
