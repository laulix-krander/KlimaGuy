import Link from "next/link";
import { Card } from "@/components/ui";
import { canCreateCustomer } from "@/lib/domain/permissions";
import { roleSchema } from "@/lib/domain/schemas";
import { createClient } from "@/lib/supabase/server";

export default async function Customers({ searchParams }: { searchParams: Promise<{ deleted?: string }> }) {
  const { deleted } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = user
    ? await supabase.from("profiles").select("role").eq("id", user.id).single()
    : { data: null };
  const parsedRole = roleSchema.safeParse(profile?.role);
  const mayCreateCustomer = parsedRole.success && canCreateCustomer(parsedRole.data);

  const { data, error } = await supabase
    .from("customers")
    .select("id,first_name,last_name,email,phone,updated_at")
    .is("deleted_at", null)
    .order("updated_at", { ascending: false });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-3xl font-bold">Kundenverwaltung</h1>
        {mayCreateCustomer ? (
          <Link className="rounded-lg bg-teal-700 px-4 py-2 font-medium text-white hover:bg-teal-800" href="/customers/new">
            Kunde anlegen
          </Link>
        ) : null}
      </div>
      <Card>
        {deleted === "1" ? (
          <div className="mb-4 rounded border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800" role="status">Kunde wurde gelöscht.</div>
        ) : null}
        {error ? (
          <p className="text-red-700">Die Kundenliste konnte nicht geladen werden.</p>
        ) : null}
        {!error && (!data || data.length === 0) ? (
          <p className="text-slate-600">Es sind noch keine Kunden vorhanden.</p>
        ) : null}
        <div className="grid gap-2">
          {(data ?? []).map((customer) => (
            <Link className="rounded border p-3 hover:bg-slate-50" href={`/customers/${customer.id}`} key={customer.id}>
              <strong>{customer.first_name} {customer.last_name}</strong>
              <p className="text-sm text-slate-600">{customer.email ?? "Keine E-Mail"} · {customer.phone ?? "Keine Telefonnummer"}</p>
            </Link>
          ))}
        </div>
      </Card>
    </div>
  );
}
