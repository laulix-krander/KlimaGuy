import Link from "next/link";
import { notFound } from "next/navigation";
import { Card } from "@/components/ui";
import { optionalFieldDisplay } from "@/lib/domain/display";
import { canEditCustomer, canSoftDeleteCustomer } from "@/lib/domain/permissions";
import { roleSchema } from "@/lib/domain/schemas";
import { createClient } from "@/lib/supabase/server";
import { DeleteCustomerForm } from "./delete-customer-form";
import { z } from "zod";

const customerIdSchema = z.string().uuid();

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export default async function CustomerDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ updated?: string }> }) {
  const { id } = await params;
  const { updated } = await searchParams;
  const parsedId = customerIdSchema.safeParse(id);

  if (!parsedId.success) {
    notFound();
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = user
    ? await supabase.from("profiles").select("role").eq("id", user.id).single()
    : { data: null };
  const parsedRole = roleSchema.safeParse(profile?.role);
  const mayEditCustomer = parsedRole.success && canEditCustomer(parsedRole.data);
  const maySoftDeleteCustomer = parsedRole.success && canSoftDeleteCustomer(parsedRole.data);

  const { data: customer } = await supabase
    .from("customers")
    .select("id,first_name,last_name,email,phone,created_at,updated_at")
    .eq("id", parsedId.data)
    .is("deleted_at", null)
    .single();

  if (!customer) {
    notFound();
  }

  const { data: projects } = await supabase
    .from("projects")
    .select("id,title")
    .eq("customer_id", customer.id)
    .is("deleted_at", null)
    .order("updated_at", { ascending: false })
    .limit(5);

  return (
    <div className="space-y-6">
      {updated === "1" ? (
        <div className="rounded border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800" role="status">
          Kundendaten wurden aktualisiert.
        </div>
      ) : null}
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-3xl font-bold">{customer.first_name} {customer.last_name}</h1>
        <div className="flex flex-wrap gap-3">
          {mayEditCustomer ? (
            <Link className="rounded-lg bg-teal-700 px-4 py-2 font-medium text-white hover:bg-teal-800" href={`/customers/${customer.id}/edit`}>
              Bearbeiten
            </Link>
          ) : null}
          {maySoftDeleteCustomer ? <DeleteCustomerForm customerId={customer.id} /> : null}
        </div>
      </div>
      <Card>
        <dl className="grid gap-4 md:grid-cols-2">
          <div><dt className="font-medium">E-Mail</dt><dd>{optionalFieldDisplay(customer.email)}</dd></div>
          <div><dt className="font-medium">Telefon</dt><dd>{optionalFieldDisplay(customer.phone)}</dd></div>
          <div><dt className="font-medium">Erstellt</dt><dd>{formatDate(customer.created_at)}</dd></div>
          <div><dt className="font-medium">Zuletzt geändert</dt><dd>{formatDate(customer.updated_at)}</dd></div>
        </dl>
      </Card>
      <Card>
        <h2 className="mb-3 text-xl font-semibold">Zugehörige Projekte</h2>
        {projects && projects.length > 0 ? (
          <ul className="space-y-2">
            {projects.map((project) => <li key={project.id}>{project.title}</li>)}
          </ul>
        ) : (
          <p className="text-slate-600">Noch keine Projekte für diesen Kunden vorhanden.</p>
        )}
      </Card>
    </div>
  );
}
