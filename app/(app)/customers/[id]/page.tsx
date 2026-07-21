import { notFound, redirect } from "next/navigation";
import { Card, EmptyState, ErrorBox, LinkButton, SuccessBox } from "@/components/ui";
import { ConfirmSubmit } from "@/components/confirm-submit";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/actions/auth";
import { softDeleteCustomer } from "@/lib/actions/customers";
import { canDeleteCustomer, canEditCustomer } from "@/lib/domain/permissions";
import { formatDateTime, statusToLabel } from "@/lib/domain/mappers";
import type { ProjectStatus } from "@/lib/domain/types";

type CustomerRow = { id: string; first_name: string; last_name: string; email: string | null; phone: string | null; created_at: string; updated_at: string };
type ProjectRow = { id: string; title: string; status: ProjectStatus; updated_at: string };

export default async function CustomerDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ message?: string; error?: string }> }) {
  const { id } = await params; const sp = await searchParams; const supabase = await createClient(); const currentUser = await getCurrentUser();
  const [{ data: customer }, { data: projects }] = await Promise.all([supabase.from("customers").select("id,first_name,last_name,email,phone,created_at,updated_at").eq("id", id).is("deleted_at", null).single(), supabase.from("projects").select("id,title,status,updated_at").eq("customer_id", id).is("deleted_at", null).order("updated_at", { ascending: false })]);
  if (!customer) notFound();
  const row = customer as CustomerRow; const activeProjects = (projects ?? []) as ProjectRow[];
  async function deleteAction() { "use server"; const result = await softDeleteCustomer(id); if (!result.success) redirect(`/customers/${id}?error=${encodeURIComponent(result.error)}`); redirect(`/customers?message=${encodeURIComponent("Kunde wurde soft gelöscht.")}`); }
  return <div className="space-y-6"><SuccessBox message={sp.message} /><ErrorBox message={sp.error} /><div className="flex flex-wrap items-center justify-between gap-3"><h1 className="text-3xl font-bold">{row.first_name} {row.last_name}</h1><div className="flex gap-2">{currentUser && canEditCustomer(currentUser.role) ? <LinkButton href={`/customers/${id}/edit`} variant="secondary">Bearbeiten</LinkButton> : null}{currentUser && canDeleteCustomer(currentUser.role) ? <form action={deleteAction}><ConfirmSubmit message="Diesen Kunden soft löschen? Der Datensatz wird nicht endgültig entfernt. Kunden mit aktiven Projekten können nicht gelöscht werden." className="rounded-lg bg-red-700 px-4 py-2 font-medium text-white">Löschen</ConfirmSubmit></form> : null}</div></div><Card><dl className="grid gap-3 md:grid-cols-2"><div><dt className="font-semibold">E-Mail</dt><dd>{row.email ?? "—"}</dd></div><div><dt className="font-semibold">Telefon</dt><dd>{row.phone ?? "—"}</dd></div><div><dt className="font-semibold">Erstellt</dt><dd>{formatDateTime(row.created_at)}</dd></div><div><dt className="font-semibold">Geändert</dt><dd>{formatDateTime(row.updated_at)}</dd></div></dl></Card><Card><h2 className="mb-4 text-xl font-semibold">Aktive Projekte</h2>{activeProjects.length === 0 ? <EmptyState>Keine aktiven Projekte vorhanden.</EmptyState> : <div className="space-y-2">{activeProjects.map((project) => <a className="block rounded border p-3 hover:bg-slate-50" href={`/projects/${project.id}`} key={project.id}><strong>{project.title}</strong><p className="text-sm text-slate-600">{statusToLabel(project.status)}</p></a>)}</div>}</Card></div>;
}
