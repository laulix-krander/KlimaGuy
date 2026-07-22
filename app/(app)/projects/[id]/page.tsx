import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, Badge } from "@/components/ui";
import { humanReviewDisplay, optionalFieldDisplay, projectClassDisplay, projectSummaryDisplay } from "@/lib/domain/display";
import { canChangeHumanReview, canChangeProjectClass, canChangeProjectStatus, canCreateProjectNote, canEditAnyProjectNote, canEditOwnProjectNote, canEditProjectCoreFields, canSoftDeleteAnyProjectNote, canSoftDeleteOwnProjectNote } from "@/lib/domain/permissions";
import { projectIdSchema, roleSchema } from "@/lib/domain/schemas";
import { statusToLabel } from "@/lib/domain/mappers";
import type { ProjectClass, ProjectStatus } from "@/lib/domain/types";
import { createClient } from "@/lib/supabase/server";
import { ProjectNoteForm } from "./project-note-form";
import { ProjectNoteItem } from "./project-note-item";
import { ProjectReviewForm } from "./project-review-form";


function formatDate(value: string): string {
  return new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function firstRelatedCustomer<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? value[0] ?? null : value;
}

type ProjectNoteRow = { id: string; content: string; created_by: string; created_at: string };
type NoteAuthorProfile = { id: string; display_name: string | null; role: string | null };

function authorDisplay(profile: NoteAuthorProfile | undefined): string {
  if (!profile) return "Interner Benutzer";
  if (profile.display_name?.trim()) return profile.display_name.trim();
  if (profile.role === "admin") return "Admin";
  if (profile.role === "reviewer") return "Reviewer";
  return "Interner Benutzer";
}

export default async function ProjectDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ created?: string; updated?: string; review_updated?: string; note_created?: string; note_updated?: string; note_deleted?: string }> }) {
  const { id } = await params;
  const { created, updated, review_updated, note_created, note_updated, note_deleted } = await searchParams;
  const parsedId = projectIdSchema.safeParse(id);

  if (!parsedId.success) {
    notFound();
  }

  const supabase = await createClient();
  const { data: project } = await supabase
    .from("projects")
    .select("id,title,status,project_class,requires_human_review,installation_address,postal_code,city,summary,created_at,updated_at,customers(id,first_name,last_name)")
    .eq("id", parsedId.data)
    .is("deleted_at", null)
    .single();

  if (!project) {
    notFound();
  }

  const customer = firstRelatedCustomer(project.customers);
  const { data: authData } = await supabase.auth.getUser();
  const { data: profile } = authData.user ? await supabase.from("profiles").select("role").eq("id", authData.user.id).single() : { data: null };
  const parsedRole = roleSchema.safeParse(profile?.role);
  const mayEditProject = parsedRole.success && canEditProjectCoreFields(parsedRole.data);
  const mayEditProjectReview = parsedRole.success && canChangeProjectStatus(parsedRole.data) && canChangeProjectClass(parsedRole.data) && canChangeHumanReview(parsedRole.data);
  const mayCreateProjectNote = parsedRole.success && canCreateProjectNote(parsedRole.data);

  const { data: notesData } = await supabase
    .from("project_notes")
    .select("id,content,created_by,created_at")
    .eq("project_id", project.id)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  const notes: ProjectNoteRow[] = notesData ?? [];
  const authorIds = Array.from(new Set(notes.map((note) => note.created_by)));
  const { data: profilesData } = authorIds.length > 0
    ? await supabase.from("profiles").select("id,display_name,role").in("id", authorIds)
    : { data: [] };
  const authorProfiles = new Map((profilesData ?? []).map((author) => [author.id, author as NoteAuthorProfile]));

  return (
    <div className="space-y-6">
      {created === "1" ? (
        <div className="rounded border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800" role="status">
          Projekt wurde angelegt.
        </div>
      ) : null}
      {updated === "1" ? (
        <div className="rounded border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800" role="status">
          Projektdaten wurden aktualisiert.
        </div>
      ) : null}
      {review_updated === "1" ? (
        <div className="rounded border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800" role="status">
          Projektprüfung wurde aktualisiert.
        </div>
      ) : null}
      {note_created === "1" ? (
        <div className="rounded border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800" role="status">
          Notiz wurde hinzugefügt.
        </div>
      ) : null}
      {note_updated === "1" ? (
        <div className="rounded border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800" role="status">
          Notiz wurde aktualisiert.
        </div>
      ) : null}
      {note_deleted === "1" ? (
        <div className="rounded border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800" role="status">
          Notiz wurde gelöscht.
        </div>
      ) : null}
      <div className="flex items-start justify-between gap-4">
        <h1 className="text-3xl font-bold">{project.title}</h1>
        {mayEditProject ? <Link className="rounded-lg bg-teal-700 px-4 py-2 font-medium text-white hover:bg-teal-800" href={`/projects/${project.id}/edit`}>Bearbeiten</Link> : null}
      </div>
      <Card>
        <dl className="grid gap-4 md:grid-cols-2">
          <div>
            <dt className="font-medium">Kunde</dt>
            <dd>
              {customer?.id ? (
                <Link className="text-teal-700 underline-offset-2 hover:underline" href={`/customers/${customer.id}`}>
                  {customer.first_name} {customer.last_name}
                </Link>
              ) : (
                "Nicht angegeben"
              )}
            </dd>
          </div>
          <div><dt className="font-medium">Status</dt><dd><Badge tone={project.requires_human_review ? "warn" : "default"}>{statusToLabel(project.status as ProjectStatus)}</Badge></dd></div>
          <div><dt className="font-medium">Projektklasse</dt><dd>{projectClassDisplay(project.project_class as ProjectClass | null)}</dd></div>
          <div><dt className="font-medium">Human Review</dt><dd>{humanReviewDisplay(project.requires_human_review)}</dd></div>
          <div><dt className="font-medium">Installationsadresse</dt><dd>{optionalFieldDisplay(project.installation_address)}</dd></div>
          <div><dt className="font-medium">Postleitzahl</dt><dd>{optionalFieldDisplay(project.postal_code)}</dd></div>
          <div><dt className="font-medium">Ort</dt><dd>{optionalFieldDisplay(project.city)}</dd></div>
          <div><dt className="font-medium">Erstellt</dt><dd>{formatDate(project.created_at)}</dd></div>
          <div><dt className="font-medium">Zuletzt geändert</dt><dd>{formatDate(project.updated_at)}</dd></div>
          <div className="md:col-span-2"><dt className="font-medium">Interne Zusammenfassung</dt><dd>{projectSummaryDisplay(project.summary)}</dd></div>
        </dl>
      </Card>
      {mayEditProjectReview ? (
        <Card>
          <div className="mb-4">
            <h2 className="text-xl font-semibold">Projektprüfung</h2>
            <p className="text-sm text-slate-600">Bearbeiten Sie ausschließlich Status, Projektklasse und die Kennzeichnung für menschliche Prüfung.</p>
          </div>
          <ProjectReviewForm projectId={project.id} status={project.status as ProjectStatus} projectClass={project.project_class as ProjectClass | null} requiresHumanReview={project.requires_human_review} />
        </Card>
      ) : null}
      <Card>
        <div className="mb-4">
          <h2 className="text-xl font-semibold">Interne Notizen</h2>
          <p className="text-sm text-slate-600">Diese Notizen sind nur für interne Benutzer sichtbar.</p>
        </div>
        {notes.length > 0 ? (
          <ul className="mb-6 space-y-3">
            {notes.map((note) => {
              const canEditNote = parsedRole.success && (canEditAnyProjectNote(parsedRole.data) || canEditOwnProjectNote(parsedRole.data, authData.user?.id ?? "", note.created_by));
              const canDeleteNote = parsedRole.success && (canSoftDeleteAnyProjectNote(parsedRole.data) || canSoftDeleteOwnProjectNote(parsedRole.data, authData.user?.id ?? "", note.created_by));
              return (
                <ProjectNoteItem
                  canDelete={canDeleteNote}
                  canEdit={canEditNote}
                  content={note.content}
                  key={note.id}
                  meta={`${authorDisplay(authorProfiles.get(note.created_by))} · ${formatDate(note.created_at)}`}
                  noteId={note.id}
                  projectId={project.id}
                />
              );
            })}
          </ul>
        ) : (
          <p className="mb-6 rounded-lg border border-dashed p-4 text-sm text-slate-600">Noch keine internen Notizen vorhanden.</p>
        )}
        {mayCreateProjectNote ? <ProjectNoteForm projectId={project.id} /> : null}
      </Card>
    </div>
  );
}
