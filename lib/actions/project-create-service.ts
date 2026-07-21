import { canCreateProject } from "@/lib/domain/permissions";
import { createProjectSchema, roleSchema } from "@/lib/domain/schemas";
import { DEFAULT_REQUIRES_HUMAN_REVIEW, PROJECT_STATUSES, type ProjectStatus } from "@/lib/domain/types";

export type ActionResult<T = undefined> =
  | { success: true; data: T }
  | { success: false; error: string; fieldErrors?: Record<string, string[]> };

export type CreatedProject = { id: string; customer_id: string };
export type ProjectInsert = {
  customer_id: string;
  title: string;
  summary: string | null;
  status: ProjectStatus;
  project_class: null;
  requires_human_review: boolean;
  created_by: string;
};

type QueryResult<T> = Promise<{ data: T | null; error: unknown }>;

type AuthQuery = { getUser(): Promise<{ data: { user: { id: string } | null } }> };
export type ProjectProfilesQuery = { select(columns: "role"): { eq(column: "id", value: string): { single(): QueryResult<{ role: string | null }> } } };
export type ActiveCustomersQuery = { select(columns: "id"): { eq(column: "id", value: string): { is(column: "deleted_at", value: null): { single(): QueryResult<{ id: string }> } } } };
export type ProjectsInsertQuery = { insert(payload: ProjectInsert): { select(columns: "id,customer_id"): { single(): QueryResult<CreatedProject> } } };

export type CreateProjectDataSource = {
  auth: AuthQuery;
  from(table: "profiles"): ProjectProfilesQuery;
  from(table: "customers"): ActiveCustomersQuery;
  from(table: "projects"): ProjectsInsertQuery;
};

export function formDataToCreateProjectInput(formData: FormData): Record<string, FormDataEntryValue | null> {
  return {
    customer_id: formData.get("customer_id"),
    title: formData.get("title"),
    summary: formData.get("summary"),
  };
}

export async function createProjectWithDataSource(
  dataSource: CreateProjectDataSource,
  input: unknown,
): Promise<ActionResult<CreatedProject>> {
  const { data: authData } = await dataSource.auth.getUser();
  const user = authData.user;

  if (!user) {
    return { success: false, error: "Sie müssen angemeldet sein." };
  }

  const { data: profile } = await dataSource.from("profiles").select("role").eq("id", user.id).single();
  const parsedRole = roleSchema.safeParse(profile?.role);

  if (!profile || !parsedRole.success) {
    return { success: false, error: "Ihr Benutzerprofil konnte nicht überprüft werden." };
  }

  if (!canCreateProject(parsedRole.data)) {
    return { success: false, error: "Sie sind nicht berechtigt, Projekte anzulegen." };
  }

  const parsedInput = createProjectSchema.safeParse(input);

  if (!parsedInput.success) {
    const fieldErrors = parsedInput.error.flatten().fieldErrors;
    return {
      success: false,
      error: fieldErrors.customer_id ? "Die Kunden-ID ist ungültig." : "Bitte prüfen Sie die markierten Felder.",
      fieldErrors,
    };
  }

  const { data: customer } = await dataSource
    .from("customers")
    .select("id")
    .eq("id", parsedInput.data.customer_id)
    .is("deleted_at", null)
    .single();

  if (!customer) {
    return { success: false, error: "Der ausgewählte Kunde wurde nicht gefunden oder ist nicht mehr verfügbar." };
  }

  const payload: ProjectInsert = {
    customer_id: parsedInput.data.customer_id,
    title: parsedInput.data.title,
    summary: parsedInput.data.summary,
    status: PROJECT_STATUSES[0],
    project_class: null,
    requires_human_review: DEFAULT_REQUIRES_HUMAN_REVIEW,
    created_by: user.id,
  };

  const { data: project, error } = await dataSource.from("projects").insert(payload).select("id,customer_id").single();

  if (error || !project?.id || project.customer_id !== parsedInput.data.customer_id) {
    return { success: false, error: "Das Projekt konnte nicht angelegt werden. Bitte versuchen Sie es erneut." };
  }

  return { success: true, data: project };
}
