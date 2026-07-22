import { describe, expect, it } from "vitest";
import { canCreateProjectNote } from "@/lib/domain/permissions";
import { projectNoteSchema } from "@/lib/domain/schemas";
import {
  type ActiveProjectForNoteQuery,
  type CreateProjectNoteDataSource,
  type ProjectNoteInsert,
  type ProjectNoteProfilesQuery,
  type ProjectNotesInsertQuery,
  createProjectNoteWithDataSource,
  formDataToCreateProjectNoteInput,
} from "@/lib/actions/project-note-create-service";

const projectId = "11111111-1111-4111-8111-111111111111";
const userId = "22222222-2222-4222-8222-222222222222";
const noteId = "33333333-3333-4333-8333-333333333333";
const longContent = "x".repeat(4000);

type SourceOptions = { user?: boolean; role?: string | null; project?: { id: string } | null; insertRow?: { id: string; project_id: string } | null; projectError?: unknown; insertError?: unknown };

function source(options: SourceOptions = {}) {
  const calls = { payload: undefined as ProjectNoteInsert | undefined, eq: [] as Array<[string, string]>, is: [] as Array<[string, null]>, select: [] as string[] };
  function from(table: "profiles"): ProjectNoteProfilesQuery;
  function from(table: "projects"): ActiveProjectForNoteQuery;
  function from(table: "project_notes"): ProjectNotesInsertQuery;
  function from(table: "profiles" | "projects" | "project_notes"): ProjectNoteProfilesQuery | ActiveProjectForNoteQuery | ProjectNotesInsertQuery {
    if (table === "profiles") return { select: () => ({ eq: () => ({ single: async () => ({ data: options.role === null ? null : { role: options.role ?? "admin" }, error: null }) }) }) };
    if (table === "projects") return { select(columns: "id") { calls.select.push(columns); return { eq(column: "id", value: string) { calls.eq.push([column, value]); return { is(column: "deleted_at", value: null) { calls.is.push([column, value]); return { single: async () => ({ data: options.project === undefined ? { id: projectId } : options.project, error: options.projectError ?? null }) }; } }; } }; } };
    return { insert(payload: ProjectNoteInsert) { calls.payload = payload; return { select(columns: "id,project_id") { calls.select.push(columns); return { single: async () => ({ data: options.insertRow === undefined ? { id: noteId, project_id: projectId } : options.insertRow, error: options.insertError ?? null }) }; } }; } };
  }
  const dataSource: CreateProjectNoteDataSource = { auth: { async getUser() { return { data: { user: options.user === false ? null : { id: userId } } }; } }, from };
  return { dataSource, calls };
}

describe("projectNoteSchema", () => {
  it("accepts valid note data and UUIDs", () => expect(projectNoteSchema.parse({ project_id: projectId, content: "Notiz" })).toEqual({ project_id: projectId, content: "Notiz" }));
  it("rejects invalid and empty project IDs", () => { expect(() => projectNoteSchema.parse({ project_id: "x", content: "Notiz" })).toThrow(); expect(() => projectNoteSchema.parse({ project_id: "", content: "Notiz" })).toThrow(); });
  it("trims content and rejects empty content", () => { expect(projectNoteSchema.parse({ project_id: projectId, content: "  Text  " }).content).toBe("Text"); expect(() => projectNoteSchema.parse({ project_id: projectId, content: "" })).toThrow("Notiz ist erforderlich."); expect(() => projectNoteSchema.parse({ project_id: projectId, content: "   " })).toThrow("Notiz ist erforderlich."); });
  it("accepts the maximum content length and rejects longer content", () => { expect(projectNoteSchema.parse({ project_id: projectId, content: longContent }).content).toHaveLength(4000); expect(() => projectNoteSchema.parse({ project_id: projectId, content: `${longContent}x` })).toThrow("Notiz darf höchstens 4000 Zeichen lang sein."); });
  it("strips unknown and client-controlled fields", () => {
    const parsed = projectNoteSchema.parse({ project_id: projectId, content: "Text", id: "evil", created_by: "evil", deleted_at: "evil", metadata: "evil" });
    expect(parsed).toEqual({ project_id: projectId, content: "Text" });
    expect(parsed).not.toHaveProperty("created_by"); expect(parsed).not.toHaveProperty("deleted_at"); expect(parsed).not.toHaveProperty("id");
  });
});

describe("project note permissions", () => {
  it("allows admins and reviewers to create notes", () => { expect(canCreateProjectNote("admin")).toBe(true); expect(canCreateProjectNote("reviewer")).toBe(true); });
  it("rejects invalid roles in the service", async () => await expect(createProjectNoteWithDataSource(source({ role: "owner" }).dataSource, { project_id: projectId, content: "Text" })).resolves.toMatchObject({ success: false, error: "Ihr Benutzerprofil konnte nicht überprüft werden." }));
});

describe("project note creation service", () => {
  it("rejects unauthenticated calls, missing profiles, and invalid roles", async () => {
    await expect(createProjectNoteWithDataSource(source({ user: false }).dataSource, { project_id: projectId, content: "Text" })).resolves.toMatchObject({ success: false, error: "Sie müssen angemeldet sein." });
    await expect(createProjectNoteWithDataSource(source({ role: null }).dataSource, { project_id: projectId, content: "Text" })).resolves.toMatchObject({ success: false, error: "Ihr Benutzerprofil konnte nicht überprüft werden." });
    await expect(createProjectNoteWithDataSource(source({ role: "invalid" }).dataSource, { project_id: projectId, content: "Text" })).resolves.toMatchObject({ success: false, error: "Ihr Benutzerprofil konnte nicht überprüft werden." });
  });

  it("rejects invalid UUIDs before project lookup and insert", async () => {
    const mock = source();
    const result = await createProjectNoteWithDataSource(mock.dataSource, { project_id: "x", content: "Text" });
    expect(result).toMatchObject({ success: false, error: "Die Projekt-ID ist ungültig." });
    expect(mock.calls.payload).toBeUndefined(); expect(mock.calls.eq).toEqual([]);
  });

  it("rejects unknown or soft deleted projects and filters by id and deleted_at", async () => {
    const mock = source({ project: null });
    await expect(createProjectNoteWithDataSource(mock.dataSource, { project_id: projectId, content: "Text" })).resolves.toMatchObject({ success: false, error: "Das Projekt wurde nicht gefunden oder ist nicht mehr verfügbar." });
    expect(mock.calls.eq).toEqual([["id", projectId]]); expect(mock.calls.is).toEqual([["deleted_at", null]]); expect(mock.calls.payload).toBeUndefined();
  });

  it("accepts active projects", async () => await expect(createProjectNoteWithDataSource(source().dataSource, { project_id: projectId, content: "Text" })).resolves.toEqual({ success: true, data: { id: noteId, project_id: projectId } }));

  it("builds an allowlisted insert payload with server-side created_by", async () => {
    const mock = source();
    await createProjectNoteWithDataSource(mock.dataSource, { project_id: projectId, content: "  Text  ", id: "evil", created_by: "client", deleted_at: "evil", project: { id: projectId }, profile: { id: userId }, role: "admin", unknown: "evil" });
    expect(mock.calls.payload).toEqual({ project_id: projectId, content: "Text", created_by: userId });
    expect(Object.keys(mock.calls.payload ?? {}).sort()).toEqual(["content", "created_by", "project_id"]);
  });

  it("returns neutral database errors and treats missing insert IDs as failure", async () => {
    const failed = await createProjectNoteWithDataSource(source({ insertError: { message: "raw Supabase SQL error" } }).dataSource, { project_id: projectId, content: "Text" });
    expect(failed).toMatchObject({ success: false, error: "Die Notiz konnte nicht hinzugefügt werden. Bitte versuchen Sie es erneut." });
    expect(failed.success ? "" : failed.error).not.toContain("raw Supabase");
    await expect(createProjectNoteWithDataSource(source({ insertRow: null }).dataSource, { project_id: projectId, content: "Text" })).resolves.toMatchObject({ success: false, error: "Die Notiz konnte nicht hinzugefügt werden. Bitte versuchen Sie es erneut." });
  });

  it("maps FormData allowlist fields and ignores manipulated fields", () => {
    const form = new FormData(); form.set("project_id", projectId); form.set("content", "Text"); form.set("created_by", "client"); form.set("deleted_at", "evil"); form.set("id", "evil");
    expect(formDataToCreateProjectNoteInput(form)).toEqual({ project_id: projectId, content: "Text" });
  });
});
