import Link from "next/link";
import { Card, Badge } from "@/components/ui";
import { humanReviewDisplay, projectClassDisplay } from "@/lib/domain/display";
import { statusToLabel } from "@/lib/domain/mappers";
import { canCreateProject } from "@/lib/domain/permissions";
import { roleSchema } from "@/lib/domain/schemas";
import type { ProjectClass, ProjectStatus } from "@/lib/domain/types";
import { createClient } from "@/lib/supabase/server";

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function firstRelatedCustomer<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? value[0] ?? null : value;
}

export default async function ProjectsPage({ searchParams }: { searchParams: Promise<{ created?: string }> }) {
  const { created } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = user
    ? await supabase.from("profiles").select("role").eq("id", user.id).single()
    : { data: null };
  const parsedRole = roleSchema.safeParse(profile?.role);
  const mayCreateProject = parsedRole.success && canCreateProject(parsedRole.data);

  const { data: projects, error } = await supabase
    .from("projects")
    .select("id,title,status,project_class,requires_human_review,created_at,customers(id,first_name,last_name)")
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  return (
    <div className="space-y-6">
      {created === "1" ? (
        <div className="rounded border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800" role="status">
          Projekt wurde angelegt.
        </div>
      ) : null}
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-3xl font-bold">Projektverwaltung</h1>
        {mayCreateProject ? (
          <Link className="rounded-lg bg-teal-700 px-4 py-2 font-medium text-white hover:bg-teal-800" href="/projects/new">
            Projekt anlegen
          </Link>
        ) : null}
      </div>
      <Card>
        {error ? (
          <p className="text-red-700">Die Projekte konnten nicht geladen werden.</p>
        ) : projects && projects.length > 0 ? (
          <div className="grid gap-3">
            {projects.map((project) => {
              const customer = firstRelatedCustomer(project.customers);
              return (
                <Link className="rounded border p-4 hover:bg-slate-50" href={`/projects/${project.id}`} key={project.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="font-semibold">{project.title}</h2>
                    <p className="text-sm text-slate-600">
                      Kunde: {customer?.first_name} {customer?.last_name}
                    </p>
                  </div>
                  <Badge tone={project.requires_human_review ? "warn" : "default"}>{statusToLabel(project.status as ProjectStatus)}</Badge>
                </div>
                <dl className="mt-3 grid gap-2 text-sm text-slate-700 md:grid-cols-3">
                  <div><dt className="font-medium">Projektklasse</dt><dd>{projectClassDisplay(project.project_class as ProjectClass | null)}</dd></div>
                  <div><dt className="font-medium">Human Review</dt><dd>{humanReviewDisplay(project.requires_human_review)}</dd></div>
                  <div><dt className="font-medium">Erstellt</dt><dd>{formatDate(project.created_at)}</dd></div>
                </dl>
                </Link>
              );
            })}
          </div>
        ) : (
          <p className="text-slate-600">Noch keine Projekte vorhanden.</p>
        )}
      </Card>
    </div>
  );
}
