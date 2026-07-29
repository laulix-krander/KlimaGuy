import { Card } from "@/components/ui";
import { getProjectMediaOrphanInventory } from "@/lib/actions/project-media-orphan-inventory";
import { canClaimProjectMediaOrphan } from "@/lib/domain/permissions";
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

  return <OrphanInventoryView canClaim={canClaimProjectMediaOrphan("admin")} data={result.data} />;
}
