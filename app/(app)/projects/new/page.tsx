import { redirect } from "next/navigation";
import { Card, ErrorBox } from "@/components/ui";
import { ProjectForm } from "@/components/forms";
import { createClient } from "@/lib/supabase/server";
import { createProject } from "@/lib/actions/projects";
import { getCurrentUser } from "@/lib/actions/auth";

type CustomerOption = { id: string; first_name: string; last_name: string };

export default async function NewProjectPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams; const currentUser = await getCurrentUser(); if (!currentUser || currentUser.role !== "admin") redirect("/projects?error=Sie dürfen keine Projekte anlegen."); const supabase = await createClient(); const { data } = await supabase.from("customers").select("id,first_name,last_name").is("deleted_at", null).order("last_name");
  async function action(formData: FormData) { "use server"; const raw = Object.fromEntries(formData); const result = await createProject({ ...raw, requires_human_review: raw.requires_human_review === "true" }); if (!result.success) redirect(`/projects/new?error=${encodeURIComponent(result.error)}`); if (result.data) redirect(`/projects/${result.data.id}?message=${encodeURIComponent("Projekt wurde angelegt.")}`);
    redirect(`/projects?message=${encodeURIComponent("Projekt wurde angelegt.")}`); }
  return <div className="space-y-6"><h1 className="text-3xl font-bold">Projekt anlegen</h1><ErrorBox message={error} /><Card><ProjectForm action={action} customers={(data ?? []) as CustomerOption[]} role="admin" submitLabel="Projekt speichern" /></Card></div>;
}
