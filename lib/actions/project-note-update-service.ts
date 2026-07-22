import { canEditAnyProjectNote, canEditOwnProjectNote } from "@/lib/domain/permissions";
import { projectIdSchema, projectNoteIdSchema, roleSchema, updateProjectNoteSchema } from "@/lib/domain/schemas";

export type ProjectNoteMutationResult<T = undefined> =
  | { success: true; data: T }
  | { success: false; error: string; fieldErrors?: Record<string, string[]>; values?: { content?: string } };

export type UpdatedProjectNote = { id: string; project_id: string };
export type ProjectNoteUpdatePatch = { content: string };
export type ActiveProjectForNoteMutation = { id: string };
export type ActiveProjectNoteForMutation = { id: string; project_id: string; created_by: string };

type QueryResult<T> = Promise<{ data: T | null; error: unknown }>;
type AuthQuery = { getUser(): Promise<{ data: { user: { id: string } | null } }> };
export type ProjectNoteUpdateProfilesQuery = { select(columns: "role"): { eq(column: "id", value: string): { single(): QueryResult<{ role: string | null }> } } };
export type ActiveProjectForNoteUpdateQuery = { select(columns: "id"): { eq(column: "id", value: string): { is(column: "deleted_at", value: null): { single(): QueryResult<ActiveProjectForNoteMutation> } } } };
export type ProjectNoteUpdateQuery = {
  select(columns: "id,project_id,created_by"): { eq(column: "id", value: string): { eq(column: "project_id", value: string): { is(column: "deleted_at", value: null): { single(): QueryResult<ActiveProjectNoteForMutation> } } } };
  update(payload: ProjectNoteUpdatePatch): { eq(column: "id", value: string): { eq(column: "project_id", value: string): { is(column: "deleted_at", value: null): { select(columns: "id,project_id"): { single(): QueryResult<UpdatedProjectNote> } } } } };
};

export type UpdateProjectNoteDataSource = {
  auth: AuthQuery;
  from(table: "profiles"): ProjectNoteUpdateProfilesQuery;
  from(table: "projects"): ActiveProjectForNoteUpdateQuery;
  from(table: "project_notes"): ProjectNoteUpdateQuery;
};

export function formDataToUpdateProjectNoteInput(formData: FormData): Record<string, FormDataEntryValue | null> {
  return {
    note_id: formData.get("note_id"),
    project_id: formData.get("project_id"),
    content: formData.get("content"),
  };
}

export async function updateProjectNoteWithDataSource(
  dataSource: UpdateProjectNoteDataSource,
  input: unknown,
): Promise<ProjectNoteMutationResult<UpdatedProjectNote>> {
  const values = getValues(input);
  const { data: authData } = await dataSource.auth.getUser();
  const user = authData.user;
  if (!user) return { success: false, error: "Sie müssen angemeldet sein.", values };

  const { data: profile } = await dataSource.from("profiles").select("role").eq("id", user.id).single();
  const parsedRole = roleSchema.safeParse(profile?.role);
  if (!profile || !parsedRole.success) return { success: false, error: "Ihr Benutzerprofil konnte nicht überprüft werden.", values };

  const ids = getIds(input);
  if (!projectNoteIdSchema.safeParse(ids.note_id).success) return { success: false, error: "Die Notiz-ID ist ungültig.", fieldErrors: { note_id: ["Die Notiz-ID ist ungültig."] }, values };
  if (!projectIdSchema.safeParse(ids.project_id).success) return { success: false, error: "Die Projekt-ID ist ungültig.", fieldErrors: { project_id: ["Die Projekt-ID ist ungültig."] }, values };

  const parsedInput = updateProjectNoteSchema.safeParse(input);
  if (!parsedInput.success) {
    const fieldErrors = parsedInput.error.flatten().fieldErrors;
    const error = fieldErrors.note_id ? "Die Notiz-ID ist ungültig." : fieldErrors.project_id ? "Die Projekt-ID ist ungültig." : "Bitte prüfen Sie die markierten Felder.";
    return { success: false, error, fieldErrors, values };
  }

  const { data: project } = await dataSource.from("projects").select("id").eq("id", parsedInput.data.project_id).is("deleted_at", null).single();
  if (!project) return { success: false, error: "Das Projekt wurde nicht gefunden oder ist nicht mehr verfügbar.", values: { content: parsedInput.data.content } };

  const { data: note } = await dataSource.from("project_notes").select("id,project_id,created_by").eq("id", parsedInput.data.note_id).eq("project_id", parsedInput.data.project_id).is("deleted_at", null).single();
  if (!note || note.project_id !== parsedInput.data.project_id) return { success: false, error: "Die Notiz wurde nicht gefunden oder ist nicht mehr verfügbar.", values: { content: parsedInput.data.content } };

  const mayUpdate = canEditAnyProjectNote(parsedRole.data) || canEditOwnProjectNote(parsedRole.data, user.id, note.created_by);
  if (!mayUpdate) return { success: false, error: "Sie sind nicht berechtigt, diese Notiz zu bearbeiten.", values: { content: parsedInput.data.content } };

  const patch: ProjectNoteUpdatePatch = { content: parsedInput.data.content };
  const { data: updatedNote, error } = await dataSource.from("project_notes").update(patch).eq("id", parsedInput.data.note_id).eq("project_id", parsedInput.data.project_id).is("deleted_at", null).select("id,project_id").single();
  if (error || !updatedNote?.id || updatedNote.project_id !== parsedInput.data.project_id) return { success: false, error: "Die Notiz konnte nicht aktualisiert werden. Bitte versuchen Sie es erneut.", values: { content: parsedInput.data.content } };

  return { success: true, data: updatedNote };
}

function getIds(input: unknown): { note_id?: unknown; project_id?: unknown } {
  if (typeof input !== "object" || input === null) return {};
  return { note_id: (input as { note_id?: unknown }).note_id, project_id: (input as { project_id?: unknown }).project_id };
}

function getValues(input: unknown): { content?: string } {
  if (typeof input !== "object" || input === null || !("content" in input)) return {};
  const content = (input as { content?: unknown }).content;
  return typeof content === "string" ? { content } : {};
}
