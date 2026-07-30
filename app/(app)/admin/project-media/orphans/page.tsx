import { Card } from "@/components/ui";
import { getProjectMediaOrphanInventory } from "@/lib/actions/project-media-orphan-inventory";
import { canClaimProjectMediaOrphan } from "@/lib/domain/permissions";
import { createClient } from "@/lib/supabase/server";
import type { PurgeCandidate } from "./orphan-inventory-view";
import { OrphanInventoryView } from "./orphan-inventory-view";

export default async function ProjectMediaOrphanInventoryPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; status?: string }>;
}) {
  const params = await searchParams;
  const result = await getProjectMediaOrphanInventory({ page: params.page ?? "1", status: params.status ?? "all" });

  if (!result.success) {
    return <Card><h1 className="mb-3 text-3xl font-bold">Medien-Inventur</h1><p className="text-red-700">{result.error}</p></Card>;
  }

  const supabase = await createClient();
  const { data: purgeRows } = await supabase.rpc("list_project_media_purge_candidates", { target_page: 1, target_page_size: 50 });

  return <OrphanInventoryView canClaim={canClaimProjectMediaOrphan("admin")} data={result.data} purgeCandidates={(purgeRows ?? []) as PurgeCandidate[]} />;
}
