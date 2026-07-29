import { createClient } from "@/lib/supabase/server";
import {
  getProjectMediaOrphanInventoryWithDataSource,
  type ProjectMediaOrphanInventoryResult,
  type ProjectMediaOrphanInventoryRow,
} from "./project-media-orphan-inventory-service";

export async function getProjectMediaOrphanInventory(input: unknown): Promise<ProjectMediaOrphanInventoryResult> {
  const supabase = await createClient();
  return getProjectMediaOrphanInventoryWithDataSource({
    auth: { getUser: () => supabase.auth.getUser() },
    getProfile: async (userId) => supabase.from("profiles").select("role").eq("id", userId).single(),
    listCandidates: async (filter, page) => {
      const { data, error } = await supabase.rpc("list_project_media_orphan_candidates", {
        target_status: filter,
        target_page: page,
      });
      return { data: data as ProjectMediaOrphanInventoryRow[] | null, error };
    },
  }, input);
}
