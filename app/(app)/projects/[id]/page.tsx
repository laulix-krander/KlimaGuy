import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, Badge } from "@/components/ui";
import { humanReviewDisplay, projectClassDisplay, projectSummaryDisplay } from "@/lib/domain/display";
import { statusToLabel } from "@/lib/domain/mappers";
import type { ProjectClass, ProjectStatus } from "@/lib/domain/types";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";

const projectIdSchema = z.string().uuid();

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function firstRelatedCustomer<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? value[0] ?? null : value;
}

export default async function ProjectDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ created?: string }> }) {
  const { id } = await params;
  const { created } = await searchParams;
  const parsedId = projectIdSchema.safeParse(id);

  if (!parsedId.success) {
    notFound();
  }

  const supabase = await createClient();
  const { data: project } = await supabase
    .from("projects")
    .select("id,title,status,project_class,requires_human_review,summary,created_at,updated_at,customers(id,first_name,last_name)")
    .eq("id", parsedId.data)
    .is("deleted_at", null)
    .single();

  if (!project) {
    notFound();
  }

  const customer = firstRelatedCustomer(project.customers);

  return (
    <div className="space-y-6">
      {created === "1" ? (
        <div className="rounded border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800" role="status">
          Projekt wurde angelegt.
        </div>
      ) : null}
      <h1 className="text-3xl font-bold">{project.title}</h1>
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
          <div><dt className="font-medium">Erstellt</dt><dd>{formatDate(project.created_at)}</dd></div>
          <div><dt className="font-medium">Zuletzt geändert</dt><dd>{formatDate(project.updated_at)}</dd></div>
          <div className="md:col-span-2"><dt className="font-medium">Interne Zusammenfassung</dt><dd>{projectSummaryDisplay(project.summary)}</dd></div>
        </dl>
      </Card>
    </div>
  );
}
