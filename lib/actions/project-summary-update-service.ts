import { z } from "zod";
import { canEditProjectSummary } from "@/lib/domain/permissions";
import { projectIdSchema, roleSchema, updateProjectSummarySchema } from "@/lib/domain/schemas";
import type { ActionResult } from "./project-create-service";

export type UpdatedProjectSummary = { id: string; customer_id: string };
export type ProjectSummaryUpdate = { summary: string | null };
type AuthUser = { id: string };
type ProfileRow = { role: string | null };
type ActiveProjectSummaryRow = { id: string; customer_id: string; summary: string | null };
type QueryResult<T> = Promise<{ data: T | null; error: unknown }>;

type AuthQuery = { getUser(): Promise<{ data: { user: AuthUser | null }; error?: unknown }> };
export type ProjectSummaryProfilesQuery = { select(columns: "role"): { eq(column: "id", value: string): { single(): QueryResult<ProfileRow> } } };
export type ActiveProjectSummaryQuery = {
  select(columns: "id,customer_id,summary"): {
    eq(column: "id", value: string): {
      is(column: "deleted_at", value: null): {
        single(): QueryResult<ActiveProjectSummaryRow>;
      };
    };
  };
  update(payload: ProjectSummaryUpdate): {
    eq(column: "id", value: string): {
      matchSummary(currentSummary: string | null): {
        is(column: "deleted_at", value: null): {
          select(columns: "id,customer_id"): { single(): QueryResult<UpdatedProjectSummary> };
        };
      };
    };
  };
};
export type UpdateProjectSummaryDataSource = {
  auth: AuthQuery;
  from(table: "profiles"): ProjectSummaryProfilesQuery;
  from(table: "projects"): ActiveProjectSummaryQuery;
};

export function formDataToUpdateProjectSummaryInput(formData: FormData): { projectId: unknown; values: unknown } {
  return {
    projectId: formData.get("project_id"),
    values: { summary: formData.get("summary") },
  };
}

function fieldErrorsFromZod(error: z.ZodError): Record<string, string[]> {
  return Object.fromEntries(
    Object.entries(error.flatten().fieldErrors).filter((entry): entry is [string, string[]] => Array.isArray(entry[1]) && entry[1].length > 0),
  );
}

export async function updateProjectSummaryWithDataSource(
  dataSource: UpdateProjectSummaryDataSource,
  projectId: unknown,
  input: unknown,
): Promise<ActionResult<UpdatedProjectSummary>> {
  const { data: authData } = await dataSource.auth.getUser();
  const user = authData.user;

  if (!user) return { success: false, error: "Sie müssen angemeldet sein." };

  const { data: profile } = await dataSource.from("profiles").select("role").eq("id", user.id).single();
  const parsedRole = roleSchema.safeParse(profile?.role);
  if (!profile || !parsedRole.success) return { success: false, error: "Ihr Benutzerprofil konnte nicht überprüft werden." };
  if (!canEditProjectSummary(parsedRole.data)) return { success: false, error: "Sie sind nicht berechtigt, die Projektzusammenfassung zu bearbeiten." };

  const parsedId = projectIdSchema.safeParse(projectId);
  if (!parsedId.success) return { success: false, error: "Die Projekt-ID ist ungültig." };

  const parsedInput = updateProjectSummarySchema.safeParse(input);
  if (!parsedInput.success) {
    return { success: false, error: "Bitte prüfen Sie die markierten Felder.", fieldErrors: fieldErrorsFromZod(parsedInput.error) };
  }

  const { data: currentProject, error: loadError } = await dataSource
    .from("projects")
    .select("id,customer_id,summary")
    .eq("id", parsedId.data)
    .is("deleted_at", null)
    .single();

  if (loadError) return { success: false, error: "Das Projekt konnte nicht geladen werden. Bitte versuchen Sie es erneut." };
  if (!currentProject) return { success: false, error: "Das Projekt wurde nicht gefunden oder ist nicht mehr verfügbar." };

  const payload: ProjectSummaryUpdate = { summary: parsedInput.data.summary };
  const { data: project, error } = await dataSource
    .from("projects")
    .update(payload)
    .eq("id", parsedId.data)
    .matchSummary(currentProject.summary)
    .is("deleted_at", null)
    .select("id,customer_id")
    .single();

  if (error) return { success: false, error: "Die Projektzusammenfassung konnte nicht aktualisiert werden. Bitte versuchen Sie es erneut." };
  if (!project) return { success: false, error: "Das Projekt wurde zwischenzeitlich geändert. Bitte laden Sie die Seite neu." };

  return { success: true, data: project };
}
