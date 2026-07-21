import { Card } from "@/components/ui";
import { canCreateProject } from "@/lib/domain/permissions";
import { roleSchema } from "@/lib/domain/schemas";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";
import { ProjectForm } from "./project-form";

const customerIdSchema = z.string().uuid();

type SearchParams = { customer_id?: string };

export default async function NewProjectPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const { customer_id: requestedCustomerId } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = user
    ? await supabase.from("profiles").select("role").eq("id", user.id).single()
    : { data: null };
  const parsedRole = roleSchema.safeParse(profile?.role);

  if (!user) {
    return <Card>Sie müssen angemeldet sein.</Card>;
  }

  if (!profile || !parsedRole.success) {
    return <Card>Ihr Benutzerprofil konnte nicht überprüft werden.</Card>;
  }

  if (!canCreateProject(parsedRole.data)) {
    return <Card>Sie sind nicht berechtigt, Projekte anzulegen.</Card>;
  }

  const { data: customers } = await supabase
    .from("customers")
    .select("id,first_name,last_name,email")
    .is("deleted_at", null)
    .order("last_name", { ascending: true })
    .order("first_name", { ascending: true });

  let selectedCustomerId: string | undefined;
  let selectionWarning: string | undefined;

  if (requestedCustomerId) {
    const parsedCustomerId = customerIdSchema.safeParse(requestedCustomerId);

    if (!parsedCustomerId.success) {
      selectionWarning = "Die übergebene Kunden-ID ist ungültig. Bitte wählen Sie einen aktiven Kunden aus.";
    } else if ((customers ?? []).some((customer) => customer.id === parsedCustomerId.data)) {
      selectedCustomerId = parsedCustomerId.data;
    } else {
      selectionWarning = "Der vorausgewählte Kunde wurde nicht gefunden oder ist nicht mehr verfügbar. Bitte wählen Sie einen aktiven Kunden aus.";
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Projekt anlegen</h1>
      <Card>
        {customers && customers.length > 0 ? (
          <ProjectForm
            customers={customers}
            selectedCustomerId={selectedCustomerId}
            cancelHref={selectedCustomerId ? `/customers/${selectedCustomerId}` : "/projects"}
            selectionWarning={selectionWarning}
          />
        ) : (
          <p className="text-slate-600">Es sind keine aktiven Kunden für die Projektanlage vorhanden.</p>
        )}
      </Card>
    </div>
  );
}
