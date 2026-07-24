import { z } from "zod";
import { canChangeProjectClass } from "@/lib/domain/permissions";
import { projectIdSchema, roleSchema, updateProjectClassSchema } from "@/lib/domain/schemas";
import type { ProjectClass } from "@/lib/domain/types";
import type { ActionResult } from "./project-create-service";

export type UpdatedProjectClass = { id: string; customer_id: string };
export type ProjectClassUpdate = { project_class: ProjectClass };
type AuthUser = { id: string };
type ProfileRow = { role: string | null };
type ActiveProjectClassRow = { id: string; customer_id: string; project_class: ProjectClass | null };
type QueryResult<T> = Promise<{ data: T | null; error: unknown }>;

type AuthQuery = { getUser(): Promise<{ data: { user: AuthUser | null }; error?: unknown }> };
export type ProjectClassProfilesQuery = { select(columns: "role"): { eq(column: "id", value: string): { single(): QueryResult<ProfileRow> } } };
export type ActiveProjectClassQuery = {
  select(columns: "id,customer_id,project_class"): {
    eq(column: "id", value: string): {
      is(column: "deleted_at", value: null): {
        single(): QueryResult<ActiveProjectClassRow>;
      };
    };
  };
  update(payload: ProjectClassUpdate): {
    eq(column: "id", value: string): {
      matchProjectClass(currentProjectClass: ProjectClass | null): {
        is(column: "deleted_at", value: null): {
          select(columns: "id,customer_id"): { single(): QueryResult<UpdatedProjectClass> };
        };
      };
    };
  };
};
export type UpdateProjectClassDataSource = {
  auth: AuthQuery;
  from(table: "profiles"): ProjectClassProfilesQuery;
  from(table: "projects"): ActiveProjectClassQuery;
};

export function formDataToUpdateProjectClassInput(formData: FormData): { projectId: unknown; values: unknown } {
  return {
    projectId: formData.get("project_id"),
    values: { project_class: formData.get("project_class") },
  };
}

function fieldErrorsFromZod(error: z.ZodError): Record<string, string[]> {
  return Object.fromEntries(
    Object.entries(error.flatten().fieldErrors).filter((entry): entry is [string, string[]] => Array.isArray(entry[1]) && entry[1].length > 0),
  );
}

export async function updateProjectClassWithDataSource(
  dataSource: UpdateProjectClassDataSource,
  projectId: unknown,
  input: unknown,
): Promise<ActionResult<UpdatedProjectClass>> {
  const { data: authData } = await dataSource.auth.getUser();
  const user = authData.user;

  if (!user) return { success: false, error: "Sie müssen angemeldet sein." };

  const { data: profile } = await dataSource.from("profiles").select("role").eq("id", user.id).single();
  const parsedRole = roleSchema.safeParse(profile?.role);
  if (!profile || !parsedRole.success) return { success: false, error: "Ihr Benutzerprofil konnte nicht überprüft werden." };
  if (!canChangeProjectClass(parsedRole.data)) return { success: false, error: "Sie sind nicht berechtigt, die Projektklasse zu bearbeiten." };

  const parsedId = projectIdSchema.safeParse(projectId);
  if (!parsedId.success) return { success: false, error: "Die Projekt-ID ist ungültig." };

  const parsedInput = updateProjectClassSchema.safeParse(input);
  if (!parsedInput.success) {
    return { success: false, error: "Bitte prüfen Sie die markierten Felder.", fieldErrors: fieldErrorsFromZod(parsedInput.error) };
  }

  const { data: currentProject, error: loadError } = await dataSource
    .from("projects")
    .select("id,customer_id,project_class")
    .eq("id", parsedId.data)
    .is("deleted_at", null)
    .single();

  if (loadError) return { success: false, error: "Das Projekt konnte nicht geladen werden. Bitte versuchen Sie es erneut." };
  if (!currentProject) return { success: false, error: "Das Projekt wurde nicht gefunden oder ist nicht mehr verfügbar." };

  const payload: ProjectClassUpdate = { project_class: parsedInput.data.project_class };
  const { data: project, error } = await dataSource
    .from("projects")
    .update(payload)
    .eq("id", parsedId.data)
    .matchProjectClass(currentProject.project_class)
    .is("deleted_at", null)
    .select("id,customer_id")
    .single();

  if (error) return { success: false, error: "Die Projektklasse konnte nicht aktualisiert werden. Bitte versuchen Sie es erneut." };
  if (!project) return { success: false, error: "Das Projekt wurde zwischenzeitlich geändert. Bitte laden Sie die Seite neu." };

  return { success: true, data: project };
}
