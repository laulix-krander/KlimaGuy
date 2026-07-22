import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, Badge } from "@/components/ui";
import { humanReviewDisplay, optionalFieldDisplay, projectClassDisplay, projectSummaryDisplay } from "@/lib/domain/display";
import { canChangeHumanReview, canChangeProjectClass, canChangeProjectStatus, canEditProjectCoreFields } from "@/lib/domain/permissions";
import { projectIdSchema, roleSchema } from "@/lib/domain/schemas";
import { statusToLabel } from "@/lib/domain/mappers";
import type { ProjectClass, ProjectStatus } from "@/lib/domain/types";
import { createClient } from "@/lib/supabase/server";
import { ProjectReviewForm } from "./project-review-form";


function formatDate(value: string): string {
  return new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function firstRelatedCustomer<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? value[0] ?? null : value;
}

export default async function ProjectDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ created?: string; updated?: string; review_updated?: string }> }) {
  const { id } = await params;
  const { created, updated, review_updated } = await searchParams;
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
    </div>
  );
}
