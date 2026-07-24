import { z } from "zod";
import { canChangeProjectStatus } from "@/lib/domain/permissions";
import { isProjectStatusTransitionAllowed } from "@/lib/domain/project-status";
import { projectIdSchema, roleSchema, updateProjectStatusSchema } from "@/lib/domain/schemas";
import type { ProjectStatus } from "@/lib/domain/types";
import type { ActionResult } from "./project-create-service";

export type UpdatedProjectStatus = { id: string; customer_id: string };
export type ProjectStatusUpdate = { status: ProjectStatus };
type AuthUser = { id: string };
type ProfileRow = { role: string | null };
type ActiveProjectStatusRow = { id: string; customer_id: string; status: ProjectStatus };
type QueryResult<T> = Promise<{ data: T | null; error: unknown }>;

type AuthQuery = { getUser(): Promise<{ data: { user: AuthUser | null }; error?: unknown }> };
export type ProjectStatusProfilesQuery = { select(columns: "role"): { eq(column: "id", value: string): { single(): QueryResult<ProfileRow> } } };
export type ActiveProjectStatusQuery = {
  select(columns: "id,customer_id,status"): {
    eq(column: "id", value: string): {
      is(column: "deleted_at", value: null): {
        single(): QueryResult<ActiveProjectStatusRow>;
      };
    };
  };
  update(payload: ProjectStatusUpdate): {
    eq(column: "id", value: string): {
      eq(column: "status", value: ProjectStatus): {
        is(column: "deleted_at", value: null): {
          select(columns: "id,customer_id"): { single(): QueryResult<UpdatedProjectStatus> };
        };
      };
    };
  };
};
export type UpdateProjectStatusDataSource = {
  auth: AuthQuery;
  from(table: "profiles"): ProjectStatusProfilesQuery;
  from(table: "projects"): ActiveProjectStatusQuery;
};

export function formDataToUpdateProjectStatusInput(formData: FormData): { projectId: unknown; values: unknown } {
  return {
    projectId: formData.get("project_id"),
    values: { status: formData.get("status") },
  };
}

function fieldErrorsFromZod(error: z.ZodError): Record<string, string[]> {
  return Object.fromEntries(
    Object.entries(error.flatten().fieldErrors).filter((entry): entry is [string, string[]] => Array.isArray(entry[1]) && entry[1].length > 0),
  );
}

export async function updateProjectStatusWithDataSource(
  dataSource: UpdateProjectStatusDataSource,
  projectId: unknown,
  input: unknown,
): Promise<ActionResult<UpdatedProjectStatus>> {
  const { data: authData } = await dataSource.auth.getUser();
  const user = authData.user;

  if (!user) return { success: false, error: "Sie müssen angemeldet sein." };

  const { data: profile } = await dataSource.from("profiles").select("role").eq("id", user.id).single();
  const parsedRole = roleSchema.safeParse(profile?.role);
  if (!profile || !parsedRole.success) return { success: false, error: "Ihr Benutzerprofil konnte nicht überprüft werden." };
  if (!canChangeProjectStatus(parsedRole.data)) return { success: false, error: "Sie sind nicht berechtigt, den Projektstatus zu bearbeiten." };

  const parsedId = projectIdSchema.safeParse(projectId);
  if (!parsedId.success) return { success: false, error: "Die Projekt-ID ist ungültig." };

  const parsedInput = updateProjectStatusSchema.safeParse(input);
  if (!parsedInput.success) {
    return { success: false, error: "Bitte prüfen Sie die markierten Felder.", fieldErrors: fieldErrorsFromZod(parsedInput.error) };
  }

  const { data: currentProject, error: loadError } = await dataSource
    .from("projects")
    .select("id,customer_id,status")
    .eq("id", parsedId.data)
    .is("deleted_at", null)
    .single();

  if (loadError) return { success: false, error: "Das Projekt konnte nicht geladen werden. Bitte versuchen Sie es erneut." };
  if (!currentProject) return { success: false, error: "Das Projekt wurde nicht gefunden oder ist nicht mehr verfügbar." };

  const currentStatus = currentProject.status;
  const targetStatus = parsedInput.data.status;
  if (targetStatus !== currentStatus && !isProjectStatusTransitionAllowed(currentStatus, targetStatus)) {
    return { success: false, error: "Dieser Statuswechsel ist nicht erlaubt." };
  }

  const payload: ProjectStatusUpdate = { status: targetStatus };
  const { data: project, error } = await dataSource
    .from("projects")
    .update(payload)
    .eq("id", parsedId.data)
    .eq("status", currentStatus)
    .is("deleted_at", null)
    .select("id,customer_id")
    .single();

  if (error) return { success: false, error: "Der Projektstatus konnte nicht aktualisiert werden. Bitte versuchen Sie es erneut." };
  if (!project) return { success: false, error: "Das Projekt wurde zwischenzeitlich geändert. Bitte laden Sie die Seite neu." };

  return { success: true, data: project };
}
