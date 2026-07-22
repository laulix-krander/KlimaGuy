import { z } from "zod";
import { canEditProjectCoreFields } from "@/lib/domain/permissions";
import { projectIdSchema, roleSchema, updateProjectCoreSchema } from "@/lib/domain/schemas";
import type { ActionResult } from "./project-create-service";

export type UpdatedProject = { id: string; customer_id: string };
export type ProjectCoreUpdate = z.infer<typeof updateProjectCoreSchema>;
type AuthUser = { id: string };
type ProfileRow = { role: string | null };
type QueryResult<T> = Promise<{ data: T | null; error: unknown }>;

type AuthQuery = { getUser(): Promise<{ data: { user: AuthUser | null }; error?: unknown }> };
export type ProjectUpdateProfilesQuery = { select(columns: "role"): { eq(column: "id", value: string): { single(): QueryResult<ProfileRow> } } };
export type ProjectsUpdateQuery = {
  update(payload: ProjectCoreUpdate): {
    eq(column: "id", value: string): {
      is(column: "deleted_at", value: null): {
        select(columns: "id,customer_id"): { single(): QueryResult<UpdatedProject> };
      };
    };
  };
};
export type UpdateProjectDataSource = {
  auth: AuthQuery;
  from(table: "profiles"): ProjectUpdateProfilesQuery;
  from(table: "projects"): ProjectsUpdateQuery;
};

export function formDataToUpdateProjectCoreInput(formData: FormData): { projectId: unknown; values: unknown } {
  return {
    projectId: formData.get("project_id"),
    values: {
      title: formData.get("title"),
      installation_address: formData.get("installation_address"),
      postal_code: formData.get("postal_code"),
      city: formData.get("city"),
      summary: formData.get("summary"),
    },
  };
}

function fieldErrorsFromZod(error: z.ZodError): Record<string, string[]> {
  return Object.fromEntries(
    Object.entries(error.flatten().fieldErrors).filter((entry): entry is [string, string[]] => Array.isArray(entry[1]) && entry[1].length > 0),
  );
}

export async function updateProjectCoreWithDataSource(
  dataSource: UpdateProjectDataSource,
  projectId: unknown,
  input: unknown,
): Promise<ActionResult<UpdatedProject>> {
  const { data: authData } = await dataSource.auth.getUser();
  const user = authData.user;

  if (!user) return { success: false, error: "Sie müssen angemeldet sein." };

  const { data: profile } = await dataSource.from("profiles").select("role").eq("id", user.id).single();
  const parsedRole = roleSchema.safeParse(profile?.role);
  if (!profile || !parsedRole.success) return { success: false, error: "Ihr Benutzerprofil konnte nicht überprüft werden." };
  if (!canEditProjectCoreFields(parsedRole.data)) return { success: false, error: "Sie sind nicht berechtigt, Projektdaten zu bearbeiten." };

  const parsedId = projectIdSchema.safeParse(projectId);
  if (!parsedId.success) return { success: false, error: "Die Projekt-ID ist ungültig." };

  const parsedInput = updateProjectCoreSchema.safeParse(input);
  if (!parsedInput.success) {
    return { success: false, error: "Bitte prüfen Sie die markierten Felder.", fieldErrors: fieldErrorsFromZod(parsedInput.error) };
  }

  const payload: ProjectCoreUpdate = {
    title: parsedInput.data.title,
    installation_address: parsedInput.data.installation_address,
    postal_code: parsedInput.data.postal_code,
    city: parsedInput.data.city,
    summary: parsedInput.data.summary,
  };

  const { data: project, error } = await dataSource
    .from("projects")
    .update(payload)
    .eq("id", parsedId.data)
    .is("deleted_at", null)
    .select("id,customer_id")
    .single();

  if (error) return { success: false, error: "Das Projekt konnte nicht aktualisiert werden. Bitte versuchen Sie es erneut." };
  if (!project) return { success: false, error: "Das Projekt wurde nicht gefunden oder ist nicht mehr verfügbar." };

  return { success: true, data: project };
}
