import Link from "next/link";
import { Badge, Card } from "@/components/ui";
import { formatBusinessDateTime } from "@/lib/domain/business-time";
import { mvpProjectFactSchema, type MvpProjectFact } from "@/lib/domain/mvp-project-facts";
import { displayFactValue, mapProjectInbox } from "@/lib/domain/project-operations-read-model";
import { statusToLabel } from "@/lib/domain/mappers";
import { canCreateProject } from "@/lib/domain/permissions";
import { roleSchema } from "@/lib/domain/schemas";
import { PROJECT_STATUSES, type ProjectStatus } from "@/lib/domain/types";
import { createClient } from "@/lib/supabase/server";

function firstRelatedCustomer<T>(value: T | T[] | null): T | null { return Array.isArray(value) ? value[0] ?? null : value; }

type Search = { created?: string; q?: string; status?: string; review?: string };
export default async function ProjectsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const filters = await searchParams; const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = user ? await supabase.from("profiles").select("role").eq("id", user.id).single() : { data: null };
  const parsedRole = roleSchema.safeParse(profile?.role); const mayCreateProject = parsedRole.success && canCreateProject(parsedRole.data);
  const { data: rows, error } = await supabase.from("projects").select("id,title,status,requires_human_review,installation_address,city,postal_code,created_at,updated_at,customers(first_name,last_name)").is("deleted_at", null);
  const ids = (rows ?? []).map((row) => row.id);
  const [{ data: factRows }, { data: activityRows }] = ids.length ? await Promise.all([
    supabase.from("mvp_project_facts").select("project_id,fact_key,fact_value").in("project_id", ids),
    supabase.from("conversations").select("current_project_id,updated_at").in("current_project_id", ids).order("updated_at", { ascending: false }),
  ]) : [{ data: [] }, { data: [] }];
  const factsByProject = new Map<string, MvpProjectFact[]>();
  for (const row of factRows ?? []) { const parsed = mvpProjectFactSchema.safeParse({ key: row.fact_key, value: row.fact_value }); if (parsed.success) factsByProject.set(row.project_id, [...(factsByProject.get(row.project_id) ?? []), parsed.data]); }
  const latestByProject = new Map<string, string>(); for (const row of activityRows ?? []) if (row.current_project_id && !latestByProject.has(row.current_project_id)) latestByProject.set(row.current_project_id, row.updated_at);
  const projects = mapProjectInbox((rows ?? []).map((row) => ({ ...row, status: row.status as ProjectStatus, customer: firstRelatedCustomer(row.customers), facts: factsByProject.get(row.id) ?? [], latest_activity_at: latestByProject.get(row.id) })), { query: filters.q, status: filters.status, review: filters.review });
  return <div className="space-y-6">
    {filters.created === "1" ? <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800" role="status">Projekt wurde angelegt.</div> : null}
    <header className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-sm font-semibold uppercase tracking-wider text-teal-700">Operations</p><h1 className="mt-1 text-3xl font-bold text-slate-950">Projekt-Inbox</h1><p className="mt-2 text-slate-600">Anfragen priorisieren, Lücken erkennen und direkt weiterarbeiten.</p></div>{mayCreateProject ? <Link className="rounded-lg bg-teal-700 px-4 py-2 font-medium text-white hover:bg-teal-800" href="/projects/new">Manuelles Projekt</Link> : null}</header>
    <Card className="p-4"><form aria-label="Projekt-Inbox filtern" className="grid gap-3 md:grid-cols-[minmax(14rem,1fr)_13rem_13rem_auto]" method="get"><div><label className="sr-only" htmlFor="project-search">Suche nach Name, Ort oder Projekt</label><input className="w-full rounded-lg border px-3 py-2" defaultValue={filters.q} id="project-search" name="q" placeholder="Name, Ort oder Projekt suchen …" /></div><div><label className="sr-only" htmlFor="status-filter">Projektstatus</label><select className="w-full rounded-lg border px-3 py-2" defaultValue={filters.status ?? ""} id="status-filter" name="status"><option value="">Alle Status</option>{PROJECT_STATUSES.map((status) => <option key={status} value={status}>{statusToLabel(status)}</option>)}</select></div><div><label className="sr-only" htmlFor="review-filter">Human Review</label><select className="w-full rounded-lg border px-3 py-2" defaultValue={filters.review ?? ""} id="review-filter" name="review"><option value="">Alle Review-Zustände</option><option value="true">Human Review erforderlich</option><option value="false">Ohne Review-Hinweis</option></select></div><button className="rounded-lg bg-slate-900 px-4 py-2 font-medium text-white" type="submit">Filtern</button></form></Card>
    {error ? <Card><p className="text-red-700" role="alert">Die Projekte konnten nicht geladen werden.</p></Card> : projects.length === 0 ? <Card className="border-dashed py-12 text-center"><h2 className="font-semibold">Keine passenden Anfragen</h2><p className="mt-1 text-sm text-slate-600">Filter anpassen oder ein neues Projekt anlegen.</p></Card> : <ul aria-label="Projektanfragen" className="space-y-3">{projects.map((project) => { const building = project.facts.find((fact) => fact.key === "building_type"); const room = project.facts.find((fact) => fact.key === "room_type"); const rooms = project.facts.find((fact) => fact.key === "requested_room_count"); return <li key={project.id}><Link className="block rounded-xl border bg-white p-5 shadow-sm transition hover:border-teal-300 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-teal-600" href={`/projects/${project.id}`}><div className="flex flex-wrap items-start justify-between gap-4"><div><div className="flex flex-wrap items-center gap-2"><h2 className="text-lg font-bold text-slate-950">{project.customerName}</h2>{project.requires_human_review ? <Badge tone="warn">Human Review</Badge> : null}</div><p className="mt-1 text-sm text-slate-500">{project.title}</p><p className="mt-3 text-sm text-slate-700">{project.location.place} · {displayFactValue(building)}{room ? ` · ${displayFactValue(room)}` : ""}{rooms ? ` · ${displayFactValue(rooms)} Räume` : ""}</p></div><div className="text-right"><Badge tone={project.status === "technical_review" ? "ok" : project.requires_human_review ? "warn" : "default"}>{statusToLabel(project.status)}</Badge><p className="mt-2 text-xs text-slate-500">Aktiv {formatBusinessDateTime(project.latestActivityAt)} Uhr</p></div></div><div className="mt-4 flex flex-wrap items-center gap-3 border-t pt-4 text-sm"><span className="font-semibold text-teal-800">Angaben {project.qualification.percent}%</span><span className="text-slate-600">{project.qualification.missingFacts.length ? `${project.qualification.missingFacts.length} Pflichtangaben fehlen` : project.qualification.requiresSiteCheck ? "Vor-Ort-Prüfung erforderlich" : "Angaben vollständig"}</span><span className="ml-auto text-xs text-slate-500">Erstellt {formatBusinessDateTime(project.created_at)} Uhr</span></div></Link></li>; })}</ul>}
  </div>;
}
