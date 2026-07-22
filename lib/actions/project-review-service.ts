import { z } from "zod";
import { canChangeHumanReview, canChangeProjectClass, canChangeProjectStatus } from "@/lib/domain/permissions";
import { isProjectStatusTransitionAllowed } from "@/lib/domain/project-status";
import { projectIdSchema, roleSchema, updateProjectReviewSchema } from "@/lib/domain/schemas";
import type { ProjectStatus } from "@/lib/domain/types";
import type { ActionResult } from "./project-create-service";

export type UpdatedProjectReview = { id: string; customer_id: string };
export type ProjectReviewUpdate = z.infer<typeof updateProjectReviewSchema>;
type AuthUser = { id: string };
type ProfileRow = { role: string | null };
type ActiveProjectRow = { id: string; customer_id: string; status: ProjectStatus; deleted_at: string | null };
type QueryResult<T> = Promise<{ data: T | null; error: unknown }>;

type AuthQuery = { getUser(): Promise<{ data: { user: AuthUser | null }; error?: unknown }> };
export type ProjectReviewProfilesQuery = { select(columns: "role"): { eq(column: "id", value: string): { single(): QueryResult<ProfileRow> } } };
export type ProjectReviewLoadQuery = {
  select(columns: "id,customer_id,status,deleted_at"): {
    eq(column: "id", value: string): {
      is(column: "deleted_at", value: null): { single(): QueryResult<ActiveProjectRow> };
    };
  };
  update(payload: ProjectReviewUpdate): {
    eq(column: "id", value: string): {
      eq(column: "status", value: ProjectStatus): {
        is(column: "deleted_at", value: null): {
          select(columns: "id,customer_id"): { single(): QueryResult<UpdatedProjectReview> };
        };
      };
    };
  };
};
export type ProjectReviewDataSource = {
  auth: AuthQuery;
  from(table: "profiles"): ProjectReviewProfilesQuery;
  from(table: "projects"): ProjectReviewLoadQuery;
};

export function formDataToUpdateProjectReviewInput(formData: FormData): { projectId: unknown; values: unknown } {
  return {
    projectId: formData.get("project_id"),
    values: {
      status: formData.get("status"),
      project_class: formData.get("project_class"),
      requires_human_review: formData.get("requires_human_review") === "on",
    },
  };
}

function fieldErrorsFromZod(error: z.ZodError): Record<string, string[]> {
  return Object.fromEntries(
    Object.entries(error.flatten().fieldErrors).filter((entry): entry is [string, string[]] => Array.isArray(entry[1]) && entry[1].length > 0),
  );
}

function canEditProjectReview(role: z.infer<typeof roleSchema>): boolean {
  return canChangeProjectStatus(role) && canChangeProjectClass(role) && canChangeHumanReview(role);
}

export async function updateProjectReviewWithDataSource(
  dataSource: ProjectReviewDataSource,
  projectId: unknown,
  input: unknown,
): Promise<ActionResult<UpdatedProjectReview>> {
  const { data: authData } = await dataSource.auth.getUser();
  const user = authData.user;

  if (!user) return { success: false, error: "Sie müssen angemeldet sein." };

  const { data: profile } = await dataSource.from("profiles").select("role").eq("id", user.id).single();
  const parsedRole = roleSchema.safeParse(profile?.role);
  if (!profile || !parsedRole.success) return { success: false, error: "Ihr Benutzerprofil konnte nicht überprüft werden." };
  if (!canEditProjectReview(parsedRole.data)) return { success: false, error: "Sie sind nicht berechtigt, die Projektprüfung zu bearbeiten." };

  const parsedId = projectIdSchema.safeParse(projectId);
  if (!parsedId.success) return { success: false, error: "Die Projekt-ID ist ungültig." };

  const parsedInput = updateProjectReviewSchema.safeParse(input);
  if (!parsedInput.success) return { success: false, error: "Bitte prüfen Sie die markierten Felder.", fieldErrors: fieldErrorsFromZod(parsedInput.error) };

  const { data: project, error: loadError } = await dataSource
    .from("projects")
    .select("id,customer_id,status,deleted_at")
    .eq("id", parsedId.data)
    .is("deleted_at", null)
    .single();

  if (loadError) return { success: false, error: "Die Projektprüfung konnte nicht aktualisiert werden. Bitte versuchen Sie es erneut." };
  if (!project) return { success: false, error: "Das Projekt wurde nicht gefunden oder ist nicht mehr verfügbar." };

  if (parsedInput.data.status !== project.status && !isProjectStatusTransitionAllowed(project.status, parsedInput.data.status)) {
    return { success: false, error: "Der gewählte Statusübergang ist nicht zulässig." };
  }

  const payload: ProjectReviewUpdate = {
    status: parsedInput.data.status,
    project_class: parsedInput.data.project_class,
    requires_human_review: parsedInput.data.requires_human_review,
  };

  const { data: updatedProject, error: updateError } = await dataSource
    .from("projects")
    .update(payload)
    .eq("id", parsedId.data)
    .eq("status", project.status)
    .is("deleted_at", null)
    .select("id,customer_id")
    .single();

  if (updateError) return { success: false, error: "Die Projektprüfung konnte nicht aktualisiert werden. Bitte versuchen Sie es erneut." };
  if (!updatedProject) return { success: false, error: "Das Projekt wurde zwischenzeitlich geändert. Bitte laden Sie die Seite neu." };

  return { success: true, data: updatedProject };
}
