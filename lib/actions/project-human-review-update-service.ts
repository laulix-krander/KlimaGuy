import { z } from "zod";
import { canChangeHumanReview } from "@/lib/domain/permissions";
import { projectIdSchema, roleSchema, updateProjectHumanReviewSchema } from "@/lib/domain/schemas";
import type { ActionResult } from "./project-create-service";

export type UpdatedProjectHumanReview = { id: string; customer_id: string };
export type ProjectHumanReviewUpdate = { requires_human_review: boolean };
type AuthUser = { id: string };
type ProfileRow = { role: string | null };
type ActiveProjectHumanReviewRow = { id: string; customer_id: string; requires_human_review: boolean };
type QueryResult<T> = Promise<{ data: T | null; error: unknown }>;

type AuthQuery = { getUser(): Promise<{ data: { user: AuthUser | null }; error?: unknown }> };
export type ProjectHumanReviewProfilesQuery = { select(columns: "role"): { eq(column: "id", value: string): { single(): QueryResult<ProfileRow> } } };
export type ActiveProjectHumanReviewQuery = {
  select(columns: "id,customer_id,requires_human_review"): {
    eq(column: "id", value: string): {
      is(column: "deleted_at", value: null): {
        single(): QueryResult<ActiveProjectHumanReviewRow>;
      };
    };
  };
  update(payload: ProjectHumanReviewUpdate): {
    eq(column: "id", value: string): {
      eq(column: "requires_human_review", currentRequiresHumanReview: boolean): {
        is(column: "deleted_at", value: null): {
          select(columns: "id,customer_id"): { single(): QueryResult<UpdatedProjectHumanReview> };
        };
      };
    };
  };
};
export type UpdateProjectHumanReviewDataSource = {
  auth: AuthQuery;
  from(table: "profiles"): ProjectHumanReviewProfilesQuery;
  from(table: "projects"): ActiveProjectHumanReviewQuery;
};

export function formDataToUpdateProjectHumanReviewInput(formData: FormData): { projectId: unknown; values: unknown } {
  const rawValue = formData.get("requires_human_review");
  return {
    projectId: formData.get("project_id"),
    values: { requires_human_review: rawValue === "true" ? true : rawValue === "false" ? false : rawValue },
  };
}

function fieldErrorsFromZod(error: z.ZodError): Record<string, string[]> {
  return Object.fromEntries(
    Object.entries(error.flatten().fieldErrors).filter((entry): entry is [string, string[]] => Array.isArray(entry[1]) && entry[1].length > 0),
  );
}

export async function updateProjectHumanReviewWithDataSource(
  dataSource: UpdateProjectHumanReviewDataSource,
  projectId: unknown,
  input: unknown,
): Promise<ActionResult<UpdatedProjectHumanReview>> {
  const { data: authData } = await dataSource.auth.getUser();
  const user = authData.user;

  if (!user) return { success: false, error: "Sie müssen angemeldet sein." };

  const { data: profile } = await dataSource.from("profiles").select("role").eq("id", user.id).single();
  const parsedRole = roleSchema.safeParse(profile?.role);
  if (!profile || !parsedRole.success) return { success: false, error: "Ihr Benutzerprofil konnte nicht überprüft werden." };
  if (!canChangeHumanReview(parsedRole.data)) return { success: false, error: "Sie sind nicht berechtigt, das Human-Review-Flag zu bearbeiten." };

  const parsedId = projectIdSchema.safeParse(projectId);
  if (!parsedId.success) return { success: false, error: "Die Projekt-ID ist ungültig." };

  const parsedInput = updateProjectHumanReviewSchema.safeParse(input);
  if (!parsedInput.success) {
    return { success: false, error: "Bitte prüfen Sie die markierten Felder.", fieldErrors: fieldErrorsFromZod(parsedInput.error) };
  }

  const { data: currentProject, error: loadError } = await dataSource
    .from("projects")
    .select("id,customer_id,requires_human_review")
    .eq("id", parsedId.data)
    .is("deleted_at", null)
    .single();

  if (loadError) return { success: false, error: "Das Projekt konnte nicht geladen werden. Bitte versuchen Sie es erneut." };
  if (!currentProject) return { success: false, error: "Das Projekt wurde nicht gefunden oder ist nicht mehr verfügbar." };

  const payload: ProjectHumanReviewUpdate = { requires_human_review: parsedInput.data.requires_human_review };
  const { data: project, error } = await dataSource
    .from("projects")
    .update(payload)
    .eq("id", parsedId.data)
    .eq("requires_human_review", currentProject.requires_human_review)
    .is("deleted_at", null)
    .select("id,customer_id")
    .single();

  if (error) return { success: false, error: "Das Human-Review-Flag konnte nicht aktualisiert werden. Bitte versuchen Sie es erneut." };
  if (!project) return { success: false, error: "Das Projekt wurde zwischenzeitlich geändert. Bitte laden Sie die Seite neu." };

  return { success: true, data: project };
}
