import { canSoftDeleteAnyProjectNote, canSoftDeleteOwnProjectNote } from "@/lib/domain/permissions";
import { deleteProjectNoteSchema, projectIdSchema, projectNoteIdSchema, roleSchema } from "@/lib/domain/schemas";
import type { ActiveProjectForNoteMutation, ActiveProjectNoteForMutation, ProjectNoteMutationResult } from "./project-note-update-service";

export type SoftDeletedProjectNote = { id: string; project_id: string };
export type ProjectNoteSoftDeleteRpcArgs = { target_note_id: string; target_project_id: string };

type QueryResult<T> = Promise<{ data: T | null; error: unknown }>;
type RpcResult<T> = Promise<{ data: T | null; error: unknown }>;
type AuthQuery = { getUser(): Promise<{ data: { user: { id: string } | null } }> };
export type ProjectNoteDeleteProfilesQuery = { select(columns: "role"): { eq(column: "id", value: string): { single(): QueryResult<{ role: string | null }> } } };
export type ActiveProjectForNoteDeleteQuery = { select(columns: "id"): { eq(column: "id", value: string): { is(column: "deleted_at", value: null): { single(): QueryResult<ActiveProjectForNoteMutation> } } } };
export type ProjectNoteDeleteQuery = {
  select(columns: "id,project_id,created_by"): { eq(column: "id", value: string): { eq(column: "project_id", value: string): { is(column: "deleted_at", value: null): { single(): QueryResult<ActiveProjectNoteForMutation> } } } };
};

export type SoftDeleteProjectNoteDataSource = {
  auth: AuthQuery;
  from(table: "profiles"): ProjectNoteDeleteProfilesQuery;
  from(table: "projects"): ActiveProjectForNoteDeleteQuery;
  from(table: "project_notes"): ProjectNoteDeleteQuery;
  rpc(functionName: "soft_delete_project_note", args: ProjectNoteSoftDeleteRpcArgs): RpcResult<boolean>;
};

export function formDataToDeleteProjectNoteInput(formData: FormData): Record<string, FormDataEntryValue | null> {
  return {
    note_id: formData.get("note_id"),
    project_id: formData.get("project_id"),
  };
}

export async function softDeleteProjectNoteWithDataSource(
  dataSource: SoftDeleteProjectNoteDataSource,
  input: unknown
): Promise<ProjectNoteMutationResult<SoftDeletedProjectNote>> {
  const { data: authData } = await dataSource.auth.getUser();
  const user = authData.user;
  if (!user) return { success: false, error: "Sie müssen angemeldet sein." };

  const { data: profile } = await dataSource.from("profiles").select("role").eq("id", user.id).single();
  const parsedRole = roleSchema.safeParse(profile?.role);
  if (!profile || !parsedRole.success) return { success: false, error: "Ihr Benutzerprofil konnte nicht überprüft werden." };

  const ids = getIds(input);
  if (!projectNoteIdSchema.safeParse(ids.note_id).success) return { success: false, error: "Die Notiz-ID ist ungültig.", fieldErrors: { note_id: ["Die Notiz-ID ist ungültig."] } };
  if (!projectIdSchema.safeParse(ids.project_id).success) return { success: false, error: "Die Projekt-ID ist ungültig.", fieldErrors: { project_id: ["Die Projekt-ID ist ungültig."] } };

  const parsedInput = deleteProjectNoteSchema.safeParse(input);
  if (!parsedInput.success) {
    const fieldErrors = parsedInput.error.flatten().fieldErrors;
    const error = fieldErrors.note_id ? "Die Notiz-ID ist ungültig." : fieldErrors.project_id ? "Die Projekt-ID ist ungültig." : "Bitte prüfen Sie die markierten Felder.";
    return { success: false, error, fieldErrors };
  }

  const { data: project } = await dataSource.from("projects").select("id").eq("id", parsedInput.data.project_id).is("deleted_at", null).single();
  if (!project) return { success: false, error: "Das Projekt wurde nicht gefunden oder ist nicht mehr verfügbar." };

  const { data: note } = await dataSource.from("project_notes").select("id,project_id,created_by").eq("id", parsedInput.data.note_id).eq("project_id", parsedInput.data.project_id).is("deleted_at", null).single();
  if (!note || note.project_id !== parsedInput.data.project_id) return { success: false, error: "Die Notiz wurde nicht gefunden oder ist nicht mehr verfügbar." };

  const mayDelete = canSoftDeleteAnyProjectNote(parsedRole.data) || canSoftDeleteOwnProjectNote(parsedRole.data, user.id, note.created_by);
  if (!mayDelete) return { success: false, error: "Sie sind nicht berechtigt, diese Notiz zu löschen." };

  const { data: wasDeleted, error } = await dataSource.rpc("soft_delete_project_note", {
    target_note_id: parsedInput.data.note_id,
    target_project_id: parsedInput.data.project_id,
  });
  if (error) return { success: false, error: "Die Notiz konnte nicht gelöscht werden. Bitte versuchen Sie es erneut." };
  if (wasDeleted !== true) return { success: false, error: "Die Notiz wurde nicht gefunden oder ist nicht mehr verfügbar." };

  return { success: true, data: { id: parsedInput.data.note_id, project_id: note.project_id } };
}

function getIds(input: unknown): { note_id?: unknown; project_id?: unknown } {
  if (typeof input !== "object" || input === null) return {};
  return { note_id: (input as { note_id?: unknown }).note_id, project_id: (input as { project_id?: unknown }).project_id };
}
