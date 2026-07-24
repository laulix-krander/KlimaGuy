import { describe, expect, it } from "vitest";
import { canChangeHumanReview, canChangeProjectClass, canChangeProjectStatus } from "@/lib/domain/permissions";
import { getAllowedProjectStatusTransitions, isProjectStatusTransitionAllowed } from "@/lib/domain/project-status";
import { projectIdSchema, updateProjectReviewSchema } from "@/lib/domain/schemas";
import type { ProjectStatus } from "@/lib/domain/types";
import {
  type ActiveProjectReviewQuery,
  type ProjectReviewProfilesQuery,
  type ProjectReviewUpdate,
  type UpdateProjectReviewDataSource,
  formDataToUpdateProjectReviewInput,
  updateProjectReviewWithDataSource,
} from "@/lib/actions/project-review-service";

const validProjectId = "11111111-1111-4111-8111-111111111111";
const customerId = "22222222-2222-4222-8222-222222222222";
const validInput = { status: "collecting_information", project_class: "A", requires_human_review: true };

function source(options: { user?: boolean; role?: string | null; current?: { id: string; customer_id: string; status: ProjectStatus } | null; row?: { id: string; customer_id: string } | null; loadError?: unknown; error?: unknown } = {}) {
  const calls = { payload: undefined as ProjectReviewUpdate | undefined, eq: [] as Array<[string, string]>, is: [] as Array<[string, null]>, select: [] as string[] };
  function from(table: "profiles"): ProjectReviewProfilesQuery;
  function from(table: "projects"): ActiveProjectReviewQuery;
  function from(table: "profiles" | "projects"): ProjectReviewProfilesQuery | ActiveProjectReviewQuery {
    if (table === "profiles") return { select: () => ({ eq: () => ({ single: async () => ({ data: options.role === null ? null : { role: options.role ?? "admin" }, error: null }) }) }) };
    return {
      select(columns: "id,customer_id,status") { calls.select.push(columns); return { eq(column: "id", value: string) { calls.eq.push([column, value]); return { is(column: "deleted_at", value: null) { calls.is.push([column, value]); return { single: async () => ({ data: options.current === undefined ? { id: validProjectId, customer_id: customerId, status: "new" as ProjectStatus } : options.current, error: options.loadError ?? null }) }; } }; } }; },
      update(payload: ProjectReviewUpdate) { calls.payload = payload; return { eq(column: "id", value: string) { calls.eq.push([column, value]); return { eq(column2: "status", value2: ProjectStatus) { calls.eq.push([column2, value2]); return { is(column3: "deleted_at", value3: null) { calls.is.push([column3, value3]); return { select(columns: "id,customer_id") { calls.select.push(columns); return { single: async () => ({ data: options.row === undefined ? { id: validProjectId, customer_id: customerId } : options.row, error: options.error ?? null }) }; } }; } }; } }; } }; },
    };
  }
  const dataSource: UpdateProjectReviewDataSource = { auth: { async getUser() { return { data: { user: options.user === false ? null : { id: "user-1" } } }; } }, from };
  return { dataSource, calls };
}

describe("updateProjectReviewSchema", () => {
  it("accepts a valid review schema", () => { expect(updateProjectReviewSchema.parse(validInput)).toEqual(validInput); });
  it.each(["A", "B", "C", "D"])("accepts project class %s", (project_class) => { expect(updateProjectReviewSchema.parse({ ...validInput, project_class }).project_class).toBe(project_class); });
  it("rejects a null project class", () => { expect(() => updateProjectReviewSchema.parse({ ...validInput, project_class: null })).toThrow(); });
  it("accepts human review true and false", () => {
    expect(updateProjectReviewSchema.parse({ ...validInput, requires_human_review: true }).requires_human_review).toBe(true);
    expect(updateProjectReviewSchema.parse({ ...validInput, requires_human_review: false }).requires_human_review).toBe(false);
  });
  it("strips unknown fields", () => { expect(updateProjectReviewSchema.parse({ ...validInput, title: "x", summary: "x" })).toEqual(validInput); });
});

describe("project review service", () => {
  it("allows admins to edit status, class, and human review", async () => {
    const mock = source({ role: "admin" });
    expect(canChangeProjectStatus("admin") && canChangeProjectClass("admin") && canChangeHumanReview("admin")).toBe(true);
    await expect(updateProjectReviewWithDataSource(mock.dataSource, validProjectId, { ...validInput, requires_human_review: false })).resolves.toMatchObject({ success: true });
    expect(Object.keys(mock.calls.payload ?? {}).sort()).toEqual(["project_class", "requires_human_review", "status"]);
    expect(mock.calls.payload?.requires_human_review).toBe(false);
  });
  it("allows reviewers only to edit status and project class", async () => {
    const mock = source({ role: "reviewer" });
    expect(canChangeProjectStatus("reviewer") && canChangeProjectClass("reviewer")).toBe(true);
    expect(canChangeHumanReview("reviewer")).toBe(false);
    await expect(updateProjectReviewWithDataSource(mock.dataSource, validProjectId, { ...validInput, requires_human_review: false })).resolves.toMatchObject({ success: true });
    expect(Object.keys(mock.calls.payload ?? {}).sort()).toEqual(["project_class", "status"]);
    expect(mock.calls.payload).not.toHaveProperty("requires_human_review");
  });
  it("rejects invalid roles, missing auth, and missing profiles", async () => {
    await expect(updateProjectReviewWithDataSource(source({ role: "owner" }).dataSource, validProjectId, validInput)).resolves.toMatchObject({ success: false, error: "Ihr Benutzerprofil konnte nicht überprüft werden." });
    await expect(updateProjectReviewWithDataSource(source({ user: false }).dataSource, validProjectId, validInput)).resolves.toMatchObject({ success: false, error: "Sie müssen angemeldet sein." });
    await expect(updateProjectReviewWithDataSource(source({ role: null }).dataSource, validProjectId, validInput)).resolves.toMatchObject({ success: false, error: "Ihr Benutzerprofil konnte nicht überprüft werden." });
  });
  it("rejects invalid project UUIDs and deleted projects", async () => {
    expect(projectIdSchema.safeParse("x").success).toBe(false);
    await expect(updateProjectReviewWithDataSource(source().dataSource, "x", validInput)).resolves.toMatchObject({ success: false, error: "Die Projekt-ID ist ungültig." });
    await expect(updateProjectReviewWithDataSource(source({ current: null }).dataSource, validProjectId, validInput)).resolves.toMatchObject({ success: false, error: "Das Projekt wurde nicht gefunden oder ist nicht mehr verfügbar." });
  });
  it("accepts allowed transitions and rejects forbidden transitions", async () => {
    expect(isProjectStatusTransitionAllowed("new", "collecting_information")).toBe(true);
    expect(isProjectStatusTransitionAllowed("new", "accepted")).toBe(false);
    await expect(updateProjectReviewWithDataSource(source().dataSource, validProjectId, { ...validInput, status: "collecting_information" })).resolves.toMatchObject({ success: true });
    await expect(updateProjectReviewWithDataSource(source().dataSource, validProjectId, { ...validInput, status: "accepted" })).resolves.toMatchObject({ success: false, error: "Dieser Statuswechsel ist nicht erlaubt." });
  });
  it("closed has no outgoing transitions but same status changes work", async () => {
    expect(getAllowedProjectStatusTransitions("closed")).toEqual([]);
    await expect(updateProjectReviewWithDataSource(source({ current: { id: validProjectId, customer_id: customerId, status: "closed" } }).dataSource, validProjectId, { status: "closed", project_class: "B", requires_human_review: true })).resolves.toMatchObject({ success: true });
  });
  it("same status plus class or admin human-review changes works", async () => {
    await expect(updateProjectReviewWithDataSource(source().dataSource, validProjectId, { status: "new", project_class: "D", requires_human_review: true })).resolves.toMatchObject({ success: true });
    const mock = source({ role: "admin" });
    await expect(updateProjectReviewWithDataSource(mock.dataSource, validProjectId, { status: "new", project_class: "A", requires_human_review: false })).resolves.toMatchObject({ success: true });
    expect(mock.calls.payload?.requires_human_review).toBe(false);
  });
  it("filters updates by id, current status, and deleted_at", async () => {
    const mock = source(); await updateProjectReviewWithDataSource(mock.dataSource, validProjectId, validInput);
    expect(mock.calls.eq).toContainEqual(["id", validProjectId]); expect(mock.calls.eq).toContainEqual(["status", "new"]); expect(mock.calls.is).toContainEqual(["deleted_at", null]);
  });
  it("returns conflict when no row is affected", async () => {
    await expect(updateProjectReviewWithDataSource(source({ row: null }).dataSource, validProjectId, validInput)).resolves.toMatchObject({ success: false, error: "Das Projekt wurde zwischenzeitlich geändert. Bitte laden Sie die Seite neu." });
  });
  it("builds an admin allowlisted patch and ignores protected fields", async () => {
    const mock = source({ role: "admin" });
    await updateProjectReviewWithDataSource(mock.dataSource, validProjectId, { ...validInput, title: "x", customer_id: "x", summary: "x", created_by: "x", deleted_at: "x" });
    expect(Object.keys(mock.calls.payload ?? {}).sort()).toEqual(["project_class", "requires_human_review", "status"]);
    expect(mock.calls.payload).not.toHaveProperty("title"); expect(mock.calls.payload).not.toHaveProperty("customer_id"); expect(mock.calls.payload).not.toHaveProperty("summary"); expect(mock.calls.payload).not.toHaveProperty("created_by"); expect(mock.calls.payload).not.toHaveProperty("deleted_at");
  });
  it("builds a reviewer allowlisted patch without human-review or protected fields", async () => {
    const mock = source({ role: "reviewer" });
    await updateProjectReviewWithDataSource(mock.dataSource, validProjectId, { ...validInput, requires_human_review: false, title: "x", customer_id: "x", summary: "x", created_by: "x", deleted_at: "x" });
    expect(Object.keys(mock.calls.payload ?? {}).sort()).toEqual(["project_class", "status"]);
    expect(mock.calls.payload).not.toHaveProperty("requires_human_review");
    expect(mock.calls.payload).not.toHaveProperty("title"); expect(mock.calls.payload).not.toHaveProperty("customer_id"); expect(mock.calls.payload).not.toHaveProperty("summary"); expect(mock.calls.payload).not.toHaveProperty("created_by"); expect(mock.calls.payload).not.toHaveProperty("deleted_at");
  });
  it("does not expose raw Supabase errors", async () => {
    const result = await updateProjectReviewWithDataSource(source({ error: { message: "raw Supabase projects error" } }).dataSource, validProjectId, validInput);
    expect(result).toMatchObject({ success: false, error: "Das Projekt konnte nicht aktualisiert werden. Bitte versuchen Sie es erneut." });
    expect(result.success ? "" : result.error).not.toContain("raw Supabase");
  });
  it("maps booleans from FormData correctly and ignores other fields", () => {
    const on = new FormData(); on.set("project_id", validProjectId); on.set("status", "new"); on.set("project_class", "A"); on.set("requires_human_review", "on"); on.set("title", "x");
    expect(formDataToUpdateProjectReviewInput(on)).toEqual({ projectId: validProjectId, values: { status: "new", project_class: "A", requires_human_review: true } });
    const off = new FormData(); off.set("project_id", validProjectId); off.set("status", "new"); off.set("project_class", "A");
    expect(formDataToUpdateProjectReviewInput(off).values).toMatchObject({ requires_human_review: false });
  });
});
