import { getUserAdministration } from "@/lib/actions/user-administration-read-service";
import { UserAdministrationView } from "./user-administration-view";

export default async function UserAdministrationPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const { page } = await searchParams;
  const result = await getUserAdministration({ page: page ?? "1", per_page: "25" });
  return <UserAdministrationView result={result} />;
}
