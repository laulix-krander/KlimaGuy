import { notFound } from "next/navigation";
import { Card } from "@/components/ui";
import { canEditProjectCoreFields } from "@/lib/domain/permissions";
import { projectIdSchema, roleSchema } from "@/lib/domain/schemas";
import { createClient } from "@/lib/supabase/server";
import { ProjectEditForm } from "./project-edit-form";

export default async function EditProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsedId = projectIdSchema.safeParse(id);
  if (!parsedId.success) notFound();

  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  const { data: profile } = authData.user ? await supabase.from("profiles").select("role").eq("id", authData.user.id).single() : { data: null };
  const parsedRole = roleSchema.safeParse(profile?.role);
  const mayEditProject = parsedRole.success && canEditProjectCoreFields(parsedRole.data);

  const { data: project } = await supabase
    .from("projects")
    .select("id,title,installation_address,postal_code,city")
    .eq("id", parsedId.data)
    .is("deleted_at", null)
    .single();

  if (!project) notFound();

  if (!profile || !parsedRole.success) {
    return <Card className="space-y-3"><h1 className="text-3xl font-bold">Projekt bearbeiten</h1><p>Ihr Benutzerprofil konnte nicht überprüft werden.</p></Card>;
  }

  if (!mayEditProject) {
    return <Card className="space-y-3"><h1 className="text-3xl font-bold">Projekt bearbeiten</h1><p>Sie sind nicht berechtigt, Projektdaten zu bearbeiten.</p></Card>;
  }

  return <div className="space-y-6"><h1 className="text-3xl font-bold">Projekt bearbeiten</h1><Card><ProjectEditForm project={project} /></Card></div>;
}
