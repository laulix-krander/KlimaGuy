import { notFound } from "next/navigation";
import { Card } from "@/components/ui";
import { optionalFieldDisplay } from "@/lib/domain/display";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";

const customerIdSchema = z.string().uuid();

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export default async function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsedId = customerIdSchema.safeParse(id);

  if (!parsedId.success) {
    notFound();
  }

  const supabase = await createClient();
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
      <h1 className="text-3xl font-bold">{customer.first_name} {customer.last_name}</h1>
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
