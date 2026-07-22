import { describe, expect, it } from "vitest";
import { canEditAnyProjectNote, canEditOwnProjectNote, canSoftDeleteAnyProjectNote, canSoftDeleteOwnProjectNote } from "@/lib/domain/permissions";
import { deleteProjectNoteSchema, updateProjectNoteSchema } from "@/lib/domain/schemas";
import {
  type ActiveProjectForNoteUpdateQuery,
  type ProjectNoteUpdatePatch,
  type ProjectNoteUpdateProfilesQuery,
  type ProjectNoteUpdateQuery,
  type UpdateProjectNoteDataSource,
  formDataToUpdateProjectNoteInput,
  updateProjectNoteWithDataSource,
} from "@/lib/actions/project-note-update-service";
import {
  type ActiveProjectForNoteDeleteQuery,
  type ProjectNoteDeletePatch,
  type ProjectNoteDeleteProfilesQuery,
  type ProjectNoteDeleteQuery,
  type SoftDeleteProjectNoteDataSource,
  formDataToDeleteProjectNoteInput,
  softDeleteProjectNoteWithDataSource,
} from "@/lib/actions/project-note-delete-service";

const noteId = "11111111-1111-4111-8111-111111111111";
const projectId = "22222222-2222-4222-8222-222222222222";
const userId = "33333333-3333-4333-8333-333333333333";
const otherUserId = "44444444-4444-4444-8444-444444444444";
const deletedAt = "2026-07-22T14:00:00.000Z";
const longContent = "x".repeat(4000);

type Options = { user?: boolean; role?: string | null; project?: { id: string } | null; note?: { id: string; project_id: string; created_by: string } | null; row?: { id: string; project_id: string } | null; error?: unknown };

function updateSource(options: Options = {}) {
  const calls = { updatePayload: undefined as ProjectNoteUpdatePatch | undefined, eq: [] as Array<[string, string]>, is: [] as Array<[string, null]>, select: [] as string[] };
  function from(table: "profiles"): ProjectNoteUpdateProfilesQuery;
  function from(table: "projects"): ActiveProjectForNoteUpdateQuery;
  function from(table: "project_notes"): ProjectNoteUpdateQuery;
  function from(table: "profiles" | "projects" | "project_notes"): ProjectNoteUpdateProfilesQuery | ActiveProjectForNoteUpdateQuery | ProjectNoteUpdateQuery {
    if (table === "profiles") return { select: () => ({ eq: () => ({ single: async () => ({ data: options.role === null ? null : { role: options.role ?? "admin" }, error: null }) }) }) };
    if (table === "projects") return { select(columns: "id") { calls.select.push(columns); return { eq(column: "id", value: string) { calls.eq.push([column, value]); return { is(column: "deleted_at", value: null) { calls.is.push([column, value]); return { single: async () => ({ data: options.project === undefined ? { id: projectId } : options.project, error: null }) }; } }; } }; } };
    return {
      select(columns: "id,project_id,created_by") { calls.select.push(columns); return { eq(column: "id", value: string) { calls.eq.push([column, value]); return { eq(column2: "project_id", value2: string) { calls.eq.push([column2, value2]); return { is(column3: "deleted_at", value3: null) { calls.is.push([column3, value3]); return { single: async () => ({ data: options.note === undefined ? { id: noteId, project_id: projectId, created_by: userId } : options.note, error: null }) }; } }; } }; } }; },
      update(payload: ProjectNoteUpdatePatch) { calls.updatePayload = payload; return { eq(column: "id", value: string) { calls.eq.push([column, value]); return { eq(column2: "project_id", value2: string) { calls.eq.push([column2, value2]); return { is(column3: "deleted_at", value3: null) { calls.is.push([column3, value3]); return { select(columns: "id,project_id") { calls.select.push(columns); return { single: async () => ({ data: options.row === undefined ? { id: noteId, project_id: projectId } : options.row, error: options.error ?? null }) }; } }; } }; } }; } }; },
    };
  }
  const dataSource: UpdateProjectNoteDataSource = { auth: { async getUser() { return { data: { user: options.user === false ? null : { id: userId } } }; } }, from };
  return { dataSource, calls };
}

function deleteSource(options: Options = {}) {
  const calls = { deletePayload: undefined as ProjectNoteDeletePatch | undefined, eq: [] as Array<[string, string]>, is: [] as Array<[string, null]>, select: [] as string[] };
  function from(table: "profiles"): ProjectNoteDeleteProfilesQuery;
  function from(table: "projects"): ActiveProjectForNoteDeleteQuery;
  function from(table: "project_notes"): ProjectNoteDeleteQuery;
  function from(table: "profiles" | "projects" | "project_notes"): ProjectNoteDeleteProfilesQuery | ActiveProjectForNoteDeleteQuery | ProjectNoteDeleteQuery {
    if (table === "profiles") return { select: () => ({ eq: () => ({ single: async () => ({ data: options.role === null ? null : { role: options.role ?? "admin" }, error: null }) }) }) };
    if (table === "projects") return { select(columns: "id") { calls.select.push(columns); return { eq(column: "id", value: string) { calls.eq.push([column, value]); return { is(column: "deleted_at", value: null) { calls.is.push([column, value]); return { single: async () => ({ data: options.project === undefined ? { id: projectId } : options.project, error: null }) }; } }; } }; } };
    return {
      select(columns: "id,project_id,created_by") { calls.select.push(columns); return { eq(column: "id", value: string) { calls.eq.push([column, value]); return { eq(column2: "project_id", value2: string) { calls.eq.push([column2, value2]); return { is(column3: "deleted_at", value3: null) { calls.is.push([column3, value3]); return { single: async () => ({ data: options.note === undefined ? { id: noteId, project_id: projectId, created_by: userId } : options.note, error: null }) }; } }; } }; } }; },
      update(payload: ProjectNoteDeletePatch) { calls.deletePayload = payload; return { eq(column: "id", value: string) { calls.eq.push([column, value]); return { eq(column2: "project_id", value2: string) { calls.eq.push([column2, value2]); return { is(column3: "deleted_at", value3: null) { calls.is.push([column3, value3]); return { select(columns: "id,project_id") { calls.select.push(columns); return { single: async () => ({ data: options.row === undefined ? { id: noteId, project_id: projectId } : options.row, error: options.error ?? null }) }; } }; } }; } }; } }; },
    };
  }
  const dataSource: SoftDeleteProjectNoteDataSource = { auth: { async getUser() { return { data: { user: options.user === false ? null : { id: userId } } }; } }, from };
  return { dataSource, calls };
}

describe("AP-10 schemas", () => {
  it("accepts valid update IDs and trims content", () => expect(updateProjectNoteSchema.parse({ note_id: noteId, project_id: projectId, content: "  Text  " })).toEqual({ note_id: noteId, project_id: projectId, content: "Text" }));
  it("rejects invalid IDs and empty content", () => { expect(() => updateProjectNoteSchema.parse({ note_id: "x", project_id: projectId, content: "Text" })).toThrow(); expect(() => updateProjectNoteSchema.parse({ note_id: noteId, project_id: "x", content: "Text" })).toThrow(); expect(() => updateProjectNoteSchema.parse({ note_id: noteId, project_id: projectId, content: "" })).toThrow("Notiz ist erforderlich."); expect(() => updateProjectNoteSchema.parse({ note_id: noteId, project_id: projectId, content: "   " })).toThrow("Notiz ist erforderlich."); });
  it("accepts 4000 content characters and rejects more", () => { expect(updateProjectNoteSchema.parse({ note_id: noteId, project_id: projectId, content: longContent }).content).toHaveLength(4000); expect(() => updateProjectNoteSchema.parse({ note_id: noteId, project_id: projectId, content: `${longContent}x` })).toThrow(); });
  it("strips unknown update fields", () => expect(updateProjectNoteSchema.parse({ note_id: noteId, project_id: projectId, content: "Text", created_by: "client", deleted_at: deletedAt })).toEqual({ note_id: noteId, project_id: projectId, content: "Text" }));
  it("accepts delete IDs and strips unknown fields", () => expect(deleteProjectNoteSchema.parse({ note_id: noteId, project_id: projectId, deleted_at: deletedAt, content: "x", created_by: "client" })).toEqual({ note_id: noteId, project_id: projectId }));
  it("rejects invalid delete IDs", () => { expect(() => deleteProjectNoteSchema.parse({ note_id: "x", project_id: projectId })).toThrow(); expect(() => deleteProjectNoteSchema.parse({ note_id: noteId, project_id: "x" })).toThrow(); });
});

describe("AP-10 permissions", () => {
  it("allows admin and reviewer note ownership behavior", () => {
    expect(canEditAnyProjectNote("admin")).toBe(true); expect(canEditOwnProjectNote("reviewer", userId, userId)).toBe(true); expect(canEditOwnProjectNote("reviewer", userId, otherUserId)).toBe(false);
    expect(canSoftDeleteAnyProjectNote("admin")).toBe(true); expect(canSoftDeleteOwnProjectNote("reviewer", userId, userId)).toBe(true); expect(canSoftDeleteOwnProjectNote("reviewer", userId, otherUserId)).toBe(false);
  });
  it("rejects reviewer updates and deletes on foreign notes", async () => {
    await expect(updateProjectNoteWithDataSource(updateSource({ role: "reviewer", note: { id: noteId, project_id: projectId, created_by: otherUserId } }).dataSource, { note_id: noteId, project_id: projectId, content: "Text" })).resolves.toMatchObject({ success: false, error: "Sie sind nicht berechtigt, diese Notiz zu bearbeiten." });
    await expect(softDeleteProjectNoteWithDataSource(deleteSource({ role: "reviewer", note: { id: noteId, project_id: projectId, created_by: otherUserId } }).dataSource, { note_id: noteId, project_id: projectId }, () => deletedAt)).resolves.toMatchObject({ success: false, error: "Sie sind nicht berechtigt, diese Notiz zu löschen." });
  });
  it("allows admin foreign-note and reviewer own-note updates/deletes", async () => {
    await expect(updateProjectNoteWithDataSource(updateSource({ role: "admin", note: { id: noteId, project_id: projectId, created_by: otherUserId } }).dataSource, { note_id: noteId, project_id: projectId, content: "Text" })).resolves.toMatchObject({ success: true });
    await expect(updateProjectNoteWithDataSource(updateSource({ role: "reviewer" }).dataSource, { note_id: noteId, project_id: projectId, content: "Text" })).resolves.toMatchObject({ success: true });
    await expect(softDeleteProjectNoteWithDataSource(deleteSource({ role: "admin", note: { id: noteId, project_id: projectId, created_by: otherUserId } }).dataSource, { note_id: noteId, project_id: projectId }, () => deletedAt)).resolves.toMatchObject({ success: true });
    await expect(softDeleteProjectNoteWithDataSource(deleteSource({ role: "reviewer" }).dataSource, { note_id: noteId, project_id: projectId }, () => deletedAt)).resolves.toMatchObject({ success: true });
  });
});

describe("AP-10 update service", () => {
  it("rejects auth, profile, role, invalid project and note IDs", async () => {
    await expect(updateProjectNoteWithDataSource(updateSource({ user: false }).dataSource, { note_id: noteId, project_id: projectId, content: "Text" })).resolves.toMatchObject({ success: false, error: "Sie müssen angemeldet sein." });
    await expect(updateProjectNoteWithDataSource(updateSource({ role: null }).dataSource, { note_id: noteId, project_id: projectId, content: "Text" })).resolves.toMatchObject({ success: false, error: "Ihr Benutzerprofil konnte nicht überprüft werden." });
    await expect(updateProjectNoteWithDataSource(updateSource({ role: "owner" }).dataSource, { note_id: noteId, project_id: projectId, content: "Text" })).resolves.toMatchObject({ success: false, error: "Ihr Benutzerprofil konnte nicht überprüft werden." });
    await expect(updateProjectNoteWithDataSource(updateSource().dataSource, { note_id: "x", project_id: projectId, content: "Text" })).resolves.toMatchObject({ success: false, error: "Die Notiz-ID ist ungültig." });
    await expect(updateProjectNoteWithDataSource(updateSource().dataSource, { note_id: noteId, project_id: "x", content: "Text" })).resolves.toMatchObject({ success: false, error: "Die Projekt-ID ist ungültig." });
  });
  it("checks active project and active note with required filters", async () => {
    const noProject = updateSource({ project: null }); await updateProjectNoteWithDataSource(noProject.dataSource, { note_id: noteId, project_id: projectId, content: "Text" }); expect(noProject.calls.updatePayload).toBeUndefined(); expect(noProject.calls.eq).toContainEqual(["id", projectId]); expect(noProject.calls.is).toContainEqual(["deleted_at", null]);
    const noNote = updateSource({ note: null }); await updateProjectNoteWithDataSource(noNote.dataSource, { note_id: noteId, project_id: projectId, content: "Text" }); expect(noNote.calls.updatePayload).toBeUndefined(); expect(noNote.calls.eq).toContainEqual(["id", noteId]); expect(noNote.calls.eq).toContainEqual(["project_id", projectId]); expect(noNote.calls.is).toContainEqual(["deleted_at", null]);
  });
  it("uses created_by from database and an allowlisted content patch", async () => {
    const mock = updateSource(); await updateProjectNoteWithDataSource(mock.dataSource, { note_id: noteId, project_id: projectId, content: "  Text  ", deleted_at: deletedAt, created_by: otherUserId, created_at: deletedAt, unknown: "x" });
    expect(mock.calls.updatePayload).toEqual({ content: "Text" }); expect(Object.keys(mock.calls.updatePayload ?? {})).toEqual(["content"]); expect(mock.calls.eq).toContainEqual(["id", noteId]); expect(mock.calls.eq).toContainEqual(["project_id", projectId]); expect(mock.calls.is).toContainEqual(["deleted_at", null]);
  });
  it("treats no update row and raw database errors as neutral failures", async () => {
    await expect(updateProjectNoteWithDataSource(updateSource({ row: null }).dataSource, { note_id: noteId, project_id: projectId, content: "Text" })).resolves.toMatchObject({ success: false, error: "Die Notiz konnte nicht aktualisiert werden. Bitte versuchen Sie es erneut." });
    const result = await updateProjectNoteWithDataSource(updateSource({ error: { message: "raw SQL" } }).dataSource, { note_id: noteId, project_id: projectId, content: "Text" }); expect(result.success ? "" : result.error).not.toContain("raw SQL");
  });
});

describe("AP-10 delete service", () => {
  it("rejects auth/profile/role and validates IDs", async () => {
    await expect(softDeleteProjectNoteWithDataSource(deleteSource({ user: false }).dataSource, { note_id: noteId, project_id: projectId }, () => deletedAt)).resolves.toMatchObject({ success: false, error: "Sie müssen angemeldet sein." });
    await expect(softDeleteProjectNoteWithDataSource(deleteSource({ role: null }).dataSource, { note_id: noteId, project_id: projectId }, () => deletedAt)).resolves.toMatchObject({ success: false, error: "Ihr Benutzerprofil konnte nicht überprüft werden." });
    await expect(softDeleteProjectNoteWithDataSource(deleteSource({ role: "owner" }).dataSource, { note_id: noteId, project_id: projectId }, () => deletedAt)).resolves.toMatchObject({ success: false, error: "Ihr Benutzerprofil konnte nicht überprüft werden." });
    await expect(softDeleteProjectNoteWithDataSource(deleteSource().dataSource, { note_id: "x", project_id: projectId }, () => deletedAt)).resolves.toMatchObject({ success: false, error: "Die Notiz-ID ist ungültig." });
    await expect(softDeleteProjectNoteWithDataSource(deleteSource().dataSource, { note_id: noteId, project_id: "x" }, () => deletedAt)).resolves.toMatchObject({ success: false, error: "Die Projekt-ID ist ungültig." });
  });
  it("checks active project and active note before delete update", async () => {
    const noProject = deleteSource({ project: null }); await softDeleteProjectNoteWithDataSource(noProject.dataSource, { note_id: noteId, project_id: projectId }, () => deletedAt); expect(noProject.calls.deletePayload).toBeUndefined(); expect(noProject.calls.eq).toContainEqual(["id", projectId]); expect(noProject.calls.is).toContainEqual(["deleted_at", null]);
    const noNote = deleteSource({ note: null }); await softDeleteProjectNoteWithDataSource(noNote.dataSource, { note_id: noteId, project_id: projectId }, () => deletedAt); expect(noNote.calls.deletePayload).toBeUndefined(); expect(noNote.calls.eq).toContainEqual(["id", noteId]); expect(noNote.calls.eq).toContainEqual(["project_id", projectId]); expect(noNote.calls.is).toContainEqual(["deleted_at", null]);
  });
  it("uses server-generated deleted_at only and does not hard delete", async () => {
    const mock = deleteSource(); await softDeleteProjectNoteWithDataSource(mock.dataSource, { note_id: noteId, project_id: projectId, deleted_at: "client", created_by: otherUserId }, () => deletedAt);
    expect(mock.calls.deletePayload).toEqual({ deleted_at: deletedAt }); expect(Object.keys(mock.calls.deletePayload ?? {})).toEqual(["deleted_at"]); expect(mock.calls.eq).toContainEqual(["id", noteId]); expect(mock.calls.eq).toContainEqual(["project_id", projectId]); expect(mock.calls.is).toContainEqual(["deleted_at", null]);
  });
  it("treats second delete/no row and raw database errors as neutral failures", async () => {
    await expect(softDeleteProjectNoteWithDataSource(deleteSource({ row: null }).dataSource, { note_id: noteId, project_id: projectId }, () => deletedAt)).resolves.toMatchObject({ success: false, error: "Die Notiz konnte nicht gelöscht werden. Bitte versuchen Sie es erneut." });
    const result = await softDeleteProjectNoteWithDataSource(deleteSource({ error: { message: "raw SQL" } }).dataSource, { note_id: noteId, project_id: projectId }, () => deletedAt); expect(result.success ? "" : result.error).not.toContain("raw SQL");
  });
});

describe("AP-10 FormData mapping", () => {
  it("maps update fields and ignores manipulated fields", () => { const form = new FormData(); form.set("note_id", noteId); form.set("project_id", projectId); form.set("content", "Text"); form.set("created_by", otherUserId); form.set("deleted_at", deletedAt); expect(formDataToUpdateProjectNoteInput(form)).toEqual({ note_id: noteId, project_id: projectId, content: "Text" }); });
  it("maps delete fields and ignores manipulated fields", () => { const form = new FormData(); form.set("note_id", noteId); form.set("project_id", projectId); form.set("created_by", otherUserId); form.set("deleted_at", deletedAt); expect(formDataToDeleteProjectNoteInput(form)).toEqual({ note_id: noteId, project_id: projectId }); });
});
