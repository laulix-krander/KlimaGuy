import { notFound, redirect } from "next/navigation";
import { Card, Badge, EmptyState, ErrorBox, LinkButton, SuccessBox } from "@/components/ui";
import { ConfirmSubmit } from "@/components/confirm-submit";
import { SubmitButton } from "@/components/submit-button";
import { createClient } from "@/lib/supabase/server";
import { createProjectNote, softDeleteProjectNote, updateProjectNote } from "@/lib/actions/project-notes";
import { softDeleteProject, updateProjectStatus } from "@/lib/actions/projects";
import { getCurrentUser } from "@/lib/actions/auth";
import { canDeleteProject, canEditNote } from "@/lib/domain/permissions";
import { formatDateTime, statusToLabel } from "@/lib/domain/mappers";
import { getAllowedStatusTransitions } from "@/lib/domain/project-status";
import { projectClassLabels, type ProjectClass, type ProjectStatus } from "@/lib/domain/types";

type ProjectRow = { id: string; customer_id: string; title: string; status: ProjectStatus; project_class: ProjectClass | null; installation_address: string | null; postal_code: string | null; city: string | null; summary: string | null; requires_human_review: boolean; created_at: string; updated_at: string; customers: { first_name: string; last_name: string } | null };
type NoteRow = { id: string; content: string; created_by: string; created_at: string; updated_at: string };
type AuditRow = { id: string; actor_id: string | null; action: string; metadata: { description?: string; changed_fields?: string[] } | null; created_at: string };

function auditDescription(audit: AuditRow): string {
  if (audit.metadata?.description) return audit.metadata.description;
  if (audit.metadata?.changed_fields?.length) return `Geändert: ${audit.metadata.changed_fields.join(", ")}`;
  return "Änderung erfasst";
}

export default async function ProjectDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ message?: string; error?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const supabase = await createClient();
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/login");

  const [{ data: project }, { data: notes }, { data: audits }] = await Promise.all([
    supabase.from("projects").select("*,customers(first_name,last_name)").eq("id", id).is("deleted_at", null).single(),
    supabase.from("project_notes").select("id,content,created_by,created_at,updated_at").eq("project_id", id).is("deleted_at", null).order("created_at", { ascending: true }),
    supabase.from("audit_log").select("id,actor_id,action,metadata,created_at").eq("entity_id", id).order("created_at", { ascending: false }).limit(20),
  ]);

  if (!project) notFound();
  const row = project as ProjectRow;
  const noteRows = (notes ?? []) as NoteRow[];
  const auditRows = (audits ?? []) as AuditRow[];
  const userRole = currentUser.role;
  const userId = currentUser.id;

  async function addNoteAction(formData: FormData) { "use server"; const result = await createProjectNote({ project_id: id, content: formData.get("content") }); if (!result.success) redirect(`/projects/${id}?error=${encodeURIComponent(result.error)}`); redirect(`/projects/${id}?message=${encodeURIComponent("Notiz wurde gespeichert.")}`); }
  async function deleteProjectAction() { "use server"; const result = await softDeleteProject(id); if (!result.success) redirect(`/projects/${id}?error=${encodeURIComponent(result.error)}`); redirect(`/projects?message=${encodeURIComponent("Projekt wurde soft gelöscht.")}`); }
  async function statusAction(formData: FormData) { "use server"; const result = await updateProjectStatus(id, formData.get("status")); if (!result.success) redirect(`/projects/${id}?error=${encodeURIComponent(result.error)}`); redirect(`/projects/${id}?message=${encodeURIComponent("Status wurde geändert.")}`); }

  const address = [row.installation_address, row.postal_code, row.city].filter(Boolean).join(", ") || "offen";

  return <div className="space-y-6"><SuccessBox message={sp.message} /><ErrorBox message={sp.error} /><div className="flex flex-wrap items-center justify-between gap-3"><h1 className="text-3xl font-bold">{row.title}</h1><div className="flex gap-2"><LinkButton href={`/projects/${id}/edit`} variant="secondary">Projekt bearbeiten</LinkButton>{canDeleteProject(userRole) ? <form action={deleteProjectAction}><ConfirmSubmit message="Dieses Projekt soft löschen? Der Datensatz wird nicht endgültig entfernt." className="rounded-lg bg-red-700 px-4 py-2 font-medium text-white">Projekt löschen</ConfirmSubmit></form> : null}</div></div><Card><h2 className="mb-4 text-xl font-semibold">Übersicht</h2><dl className="grid gap-3 md:grid-cols-2"><div><dt className="font-semibold">Kunde</dt><dd><a href={`/customers/${row.customer_id}`}>{row.customers?.first_name} {row.customers?.last_name}</a></dd></div><div><dt className="font-semibold">Adresse</dt><dd>{address}</dd></div><div><dt className="font-semibold">Status</dt><dd><Badge tone={row.requires_human_review ? "warn" : "default"}>{statusToLabel(row.status)}</Badge></dd></div><div><dt className="font-semibold">Projektklasse</dt><dd>{row.project_class ? projectClassLabels[row.project_class] : "Keine Klasse"}</dd></div><div><dt className="font-semibold">Human Review</dt><dd>{row.requires_human_review ? "erforderlich" : "nicht markiert"}</dd></div><div><dt className="font-semibold">Erstellt / geändert</dt><dd>{formatDateTime(row.created_at)} · {formatDateTime(row.updated_at)}</dd></div><div className="md:col-span-2"><dt className="font-semibold">Zusammenfassung</dt><dd>{row.summary ?? "Noch keine Zusammenfassung."}</dd></div></dl></Card><Card><h2 className="mb-4 text-xl font-semibold">Aktionen</h2><form action={statusAction} className="flex flex-wrap items-end gap-3"><label className="space-y-1"><span>Status ändern</span><select name="status" defaultValue={row.status} className="rounded border p-2"><option value={row.status}>{statusToLabel(row.status)}</option>{getAllowedStatusTransitions(row.status).map((status) => <option key={status} value={status}>{statusToLabel(status)}</option>)}</select></label><SubmitButton>Status speichern</SubmitButton></form></Card><Card><h2 className="mb-4 text-xl font-semibold">Notizen</h2>{noteRows.length === 0 ? <EmptyState>Noch keine Notizen vorhanden.</EmptyState> : <div className="space-y-3">{noteRows.map((note) => { async function updateNoteAction(formData: FormData) { "use server"; const result = await updateProjectNote({ id: note.id, project_id: id, content: formData.get("content") }); if (!result.success) redirect(`/projects/${id}?error=${encodeURIComponent(result.error)}`); redirect(`/projects/${id}?message=${encodeURIComponent("Notiz wurde aktualisiert.")}`); } async function deleteNoteAction() { "use server"; const result = await softDeleteProjectNote(note.id); if (!result.success) redirect(`/projects/${id}?error=${encodeURIComponent(result.error)}`); redirect(`/projects/${id}?message=${encodeURIComponent("Notiz wurde soft gelöscht.")}`); } const editable = canEditNote(userRole, note.created_by, userId); return <div key={note.id} className="rounded border p-3"><form action={updateNoteAction} className="space-y-2"><textarea name="content" defaultValue={note.content} disabled={!editable} className="w-full rounded border p-2"/><div className="flex flex-wrap items-center justify-between gap-2"><small>Erstellt {formatDateTime(note.created_at)} · geändert {formatDateTime(note.updated_at)}</small>{editable ? <SubmitButton>Notiz speichern</SubmitButton> : null}</div></form>{editable ? <form action={deleteNoteAction} className="mt-2"><ConfirmSubmit message="Diese Notiz soft löschen?" className="rounded-lg border px-3 py-2 text-red-700">Notiz löschen</ConfirmSubmit></form> : null}</div>; })}</div>}<form action={addNoteAction} className="mt-4 space-y-3"><textarea name="content" required className="w-full rounded border p-2" placeholder="Neue interne Notiz"/><SubmitButton>Notiz anlegen</SubmitButton></form></Card><Card><h2 className="mb-4 text-xl font-semibold">Audit-Verlauf</h2>{auditRows.length === 0 ? <EmptyState>Noch keine Audit-Einträge vorhanden.</EmptyState> : <div className="space-y-2">{auditRows.map((audit) => <div key={audit.id} className="rounded border p-3"><p className="font-medium">{audit.action}</p><p className="text-sm text-slate-600">{formatDateTime(audit.created_at)} · Akteur: {audit.actor_id ?? "System"}</p><p className="text-sm">{auditDescription(audit)}</p></div>)}</div>}</Card></div>;
}
