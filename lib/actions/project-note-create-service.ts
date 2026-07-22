import { canCreateProjectNote } from "@/lib/domain/permissions";
import { projectIdSchema, projectNoteSchema, roleSchema } from "@/lib/domain/schemas";

export type ProjectNoteActionResult<T = undefined> =
  | { success: true; data: T }
  | { success: false; error: string; fieldErrors?: Record<string, string[]>; values?: { content?: string } };

export type CreatedProjectNote = { id: string; project_id: string };
export type ProjectNoteInsert = { project_id: string; content: string; created_by: string };
export type ActiveProjectNoteProject = { id: string };

type QueryResult<T> = Promise<{ data: T | null; error: unknown }>;
type AuthQuery = { getUser(): Promise<{ data: { user: { id: string } | null } }> };
export type ProjectNoteProfilesQuery = { select(columns: "role"): { eq(column: "id", value: string): { single(): QueryResult<{ role: string | null }> } } };
export type ActiveProjectForNoteQuery = { select(columns: "id"): { eq(column: "id", value: string): { is(column: "deleted_at", value: null): { single(): QueryResult<ActiveProjectNoteProject> } } } };
export type ProjectNotesInsertQuery = { insert(payload: ProjectNoteInsert): { select(columns: "id,project_id"): { single(): QueryResult<CreatedProjectNote> } } };

export type CreateProjectNoteDataSource = {
  auth: AuthQuery;
  from(table: "profiles"): ProjectNoteProfilesQuery;
  from(table: "projects"): ActiveProjectForNoteQuery;
  from(table: "project_notes"): ProjectNotesInsertQuery;
};

export function formDataToCreateProjectNoteInput(formData: FormData): Record<string, FormDataEntryValue | null> {
  return {
    project_id: formData.get("project_id"),
    content: formData.get("content"),
  };
}

export async function createProjectNoteWithDataSource(
  dataSource: CreateProjectNoteDataSource,
  input: unknown,
): Promise<ProjectNoteActionResult<CreatedProjectNote>> {
  const { data: authData } = await dataSource.auth.getUser();
  const user = authData.user;

  if (!user) return { success: false, error: "Sie müssen angemeldet sein.", values: getValues(input) };

  const { data: profile } = await dataSource.from("profiles").select("role").eq("id", user.id).single();
  const parsedRole = roleSchema.safeParse(profile?.role);

  if (!profile || !parsedRole.success) return { success: false, error: "Ihr Benutzerprofil konnte nicht überprüft werden.", values: getValues(input) };
  if (!canCreateProjectNote(parsedRole.data)) return { success: false, error: "Sie sind nicht berechtigt, Projektnotizen anzulegen.", values: getValues(input) };

  const projectIdInput = typeof input === "object" && input !== null && "project_id" in input ? (input as { project_id?: unknown }).project_id : undefined;
  if (!projectIdSchema.safeParse(projectIdInput).success) {
    return { success: false, error: "Die Projekt-ID ist ungültig.", fieldErrors: { project_id: ["Die Projekt-ID ist ungültig."] }, values: getValues(input) };
  }

  const parsedInput = projectNoteSchema.safeParse(input);
  if (!parsedInput.success) {
    const fieldErrors = parsedInput.error.flatten().fieldErrors;
    return { success: false, error: fieldErrors.project_id ? "Die Projekt-ID ist ungültig." : "Bitte prüfen Sie die markierten Felder.", fieldErrors, values: getValues(input) };
  }

  const { data: project } = await dataSource.from("projects").select("id").eq("id", parsedInput.data.project_id).is("deleted_at", null).single();
  if (!project || project.id !== parsedInput.data.project_id) return { success: false, error: "Das Projekt wurde nicht gefunden oder ist nicht mehr verfügbar.", values: { content: parsedInput.data.content } };

  const payload: ProjectNoteInsert = {
    project_id: parsedInput.data.project_id,
    content: parsedInput.data.content,
    created_by: user.id,
  };

  const { data: note, error } = await dataSource.from("project_notes").insert(payload).select("id,project_id").single();
  if (error || !note?.id || note.project_id !== parsedInput.data.project_id) return { success: false, error: "Die Notiz konnte nicht hinzugefügt werden. Bitte versuchen Sie es erneut.", values: { content: parsedInput.data.content } };

  return { success: true, data: note };
}

function getValues(input: unknown): { content?: string } {
  if (typeof input !== "object" || input === null || !("content" in input)) return {};
  const content = (input as { content?: unknown }).content;
  return typeof content === "string" ? { content } : {};
}
