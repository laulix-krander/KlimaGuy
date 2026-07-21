import { notFound, redirect } from "next/navigation";
import { Card, ErrorBox } from "@/components/ui";
import { ProjectForm } from "@/components/forms";
import { createClient } from "@/lib/supabase/server";
import { updateProject } from "@/lib/actions/projects";
import { getCurrentUser } from "@/lib/actions/auth";
import type { ProjectClass, ProjectStatus } from "@/lib/domain/types";

type CustomerOption = { id: string; first_name: string; last_name: string };
type ProjectFormRow = { customer_id: string; title: string; status: ProjectStatus; project_class: ProjectClass | null; installation_address: string | null; postal_code: string | null; city: string | null; summary: string | null; requires_human_review: boolean };

export default async function EditProjectPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  const { id } = await params; const { error } = await searchParams; const currentUser = await getCurrentUser(); if (!currentUser) redirect("/login"); const role = currentUser.role; const supabase = await createClient(); const [{ data: project }, { data: customers }] = await Promise.all([supabase.from("projects").select("customer_id,title,status,project_class,installation_address,postal_code,city,summary,requires_human_review").eq("id", id).is("deleted_at", null).single(), supabase.from("customers").select("id,first_name,last_name").is("deleted_at", null).order("last_name")]); if (!project) notFound();
  async function action(formData: FormData) { "use server"; const raw = Object.fromEntries(formData); const input = role === "admin" ? { ...raw, requires_human_review: raw.requires_human_review === "true" } : { status: raw.status, project_class: raw.project_class, summary: raw.summary, requires_human_review: raw.requires_human_review === "true" }; const result = await updateProject(id, input); if (!result.success) redirect(`/projects/${id}/edit?error=${encodeURIComponent(result.error)}`); redirect(`/projects/${id}?message=${encodeURIComponent("Projekt wurde aktualisiert.")}`); }
  return <div className="space-y-6"><h1 className="text-3xl font-bold">Projekt bearbeiten</h1><ErrorBox message={error} /><Card><ProjectForm action={action} customers={(customers ?? []) as CustomerOption[]} project={project as ProjectFormRow} role={role} submitLabel="Änderungen speichern" /></Card></div>;
}
