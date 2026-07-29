"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  claimProjectMediaOrphanWithDataSource,
  type ProjectMediaOrphanClaimResult,
  type ProjectMediaOrphanClaimDataSource,
} from "./project-media-orphan-claim-service";

export async function claimProjectMediaOrphanAction(
  _previousState: ProjectMediaOrphanClaimResult | null,
  formData: FormData,
): Promise<ProjectMediaOrphanClaimResult> {
  const supabase = await createClient();
  const dataSource: ProjectMediaOrphanClaimDataSource = {
    auth: { getUser: () => supabase.auth.getUser() },
    getProfile: async (userId) => supabase.from("profiles").select("role").eq("id", userId).single(),
    claim: async (mediaId, projectId) => {
      const { data, error } = await supabase.rpc("claim_and_soft_delete_project_media_orphan", {
        target_media_id: mediaId,
        target_project_id: projectId,
      });
      return { data, error };
    },
  };
  const result = await claimProjectMediaOrphanWithDataSource(dataSource, {
    media_id: formData.get("media_id"),
    project_id: formData.get("project_id"),
  });
  if (result.success) revalidatePath("/admin/project-media/orphans");
  return result;
}
