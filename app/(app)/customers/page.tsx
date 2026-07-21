import { Card, EmptyState, ErrorBox, LinkButton, SuccessBox } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/actions/auth";
import { canCreateCustomer } from "@/lib/domain/permissions";

type CustomerListRow = { id: string; first_name: string; last_name: string; email: string | null; phone: string | null; updated_at: string };

export default async function Customers({ searchParams }: { searchParams: Promise<{ q?: string; message?: string; error?: string }> }) {
  const { q, message, error: errorMessage } = await searchParams;
  const supabase = await createClient();
  const currentUser = await getCurrentUser();
  let query = supabase.from("customers").select("id,first_name,last_name,email,phone,updated_at").is("deleted_at", null).order("updated_at", { ascending: false });
  if (q) query = query.or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%,email.ilike.%${q}%,phone.ilike.%${q}%`);
  const { data, error } = await query;
  const customers = (data ?? []) as CustomerListRow[];
  return <div className="space-y-6"><div className="flex flex-wrap items-center justify-between gap-3"><h1 className="text-3xl font-bold">Kundenverwaltung</h1>{currentUser && canCreateCustomer(currentUser.role) ? <LinkButton href="/customers/new">Kunde anlegen</LinkButton> : null}</div><SuccessBox message={message} /><ErrorBox message={errorMessage} /><Card><form className="mb-4 flex flex-col gap-2 md:flex-row"><input name="q" placeholder="Suche nach Name, E-Mail oder Telefon" defaultValue={q} className="flex-1 rounded border p-2"/><button className="rounded border px-4 py-2">Suchen</button></form>{error ? <ErrorBox message="Kunden konnten nicht geladen werden." /> : customers.length === 0 ? <EmptyState>Keine aktiven Kunden gefunden.</EmptyState> : <div className="grid gap-2">{customers.map((customer) => <a className="rounded border p-3 hover:bg-slate-50" href={`/customers/${customer.id}`} key={customer.id}><strong>{customer.first_name} {customer.last_name}</strong><p className="text-sm text-slate-600">{customer.email ?? "Keine E-Mail"} · {customer.phone ?? "Keine Telefonnummer"}</p></a>)}</div>}</Card></div>;
}
