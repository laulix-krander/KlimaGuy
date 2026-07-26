import { describe, expect, it } from "vitest";
import { canChangeHumanReview } from "@/lib/domain/permissions";
import { updateProjectHumanReviewSchema } from "@/lib/domain/schemas";
import { getProjectOverviewRevalidationPaths } from "@/lib/actions/project-revalidation";
import {
  type ActiveProjectHumanReviewQuery,
  type ProjectHumanReviewProfilesQuery,
  type ProjectHumanReviewUpdate,
  type UpdateProjectHumanReviewDataSource,
  formDataToUpdateProjectHumanReviewInput,
  updateProjectHumanReviewWithDataSource,
} from "@/lib/actions/project-human-review-update-service";

const validProjectId = "11111111-1111-4111-8111-111111111111";
const customerId = "22222222-2222-4222-8222-222222222222";

function source(options: { user?: boolean; role?: string | null; current?: { id: string; customer_id: string; requires_human_review: boolean } | null; row?: { id: string; customer_id: string } | null; loadError?: unknown; error?: unknown } = {}) {
  const calls = { payload: undefined as ProjectHumanReviewUpdate | undefined, eq: [] as Array<[string, string | boolean]>, is: [] as Array<[string, null]>, select: [] as string[] };
  function from(table: "profiles"): ProjectHumanReviewProfilesQuery;
  function from(table: "projects"): ActiveProjectHumanReviewQuery;
  function from(table: "profiles" | "projects"): ProjectHumanReviewProfilesQuery | ActiveProjectHumanReviewQuery {
    if (table === "profiles") return { select: () => ({ eq: () => ({ single: async () => ({ data: options.role === null ? null : { role: options.role ?? "admin" }, error: null }) }) }) };
    return {
      select(columns: "id,customer_id,requires_human_review") { calls.select.push(columns); return { eq(column: "id", value: string) { calls.eq.push([column, value]); return { is(column: "deleted_at", value: null) { calls.is.push([column, value]); return { single: async () => ({ data: options.current === undefined ? { id: validProjectId, customer_id: customerId, requires_human_review: false } : options.current, error: options.loadError ?? null }) }; } }; } }; },
      update(payload: ProjectHumanReviewUpdate) { calls.payload = payload; return { eq(column: "id", value: string) { calls.eq.push([column, value]); return { eq(column2: "requires_human_review", value2: boolean) { calls.eq.push([column2, value2]); return { is(column3: "deleted_at", value3: null) { calls.is.push([column3, value3]); return { select(columns: "id,customer_id") { calls.select.push(columns); return { single: async () => ({ data: options.row === undefined ? { id: validProjectId, customer_id: customerId } : options.row, error: options.error ?? null }) }; } }; } }; } }; } }; },
    };
  }
  const dataSource: UpdateProjectHumanReviewDataSource = { auth: { async getUser() { return { data: { user: options.user === false ? null : { id: "user-1" } } }; } }, from };
  return { dataSource, calls };
}

describe("updateProjectHumanReviewSchema", () => {
  it("accepts true and false and strips unknown fields", () => {
    expect(updateProjectHumanReviewSchema.parse({ requires_human_review: true, title: "x", status: "accepted" })).toEqual({ requires_human_review: true });
    expect(updateProjectHumanReviewSchema.parse({ requires_human_review: false, summary: "x", project_class: "A" })).toEqual({ requires_human_review: false });
  });

  it("rejects missing and invalid boolean values", () => {
    expect(() => updateProjectHumanReviewSchema.parse({})).toThrow();
    expect(() => updateProjectHumanReviewSchema.parse({ requires_human_review: "false" })).toThrow();
    expect(() => updateProjectHumanReviewSchema.parse({ requires_human_review: 0 })).toThrow();
  });
});

describe("project human review update service", () => {
  it("allows admins to change false to true with an explicit allowlisted payload", async () => {
    const mock = source({ role: "admin", current: { id: validProjectId, customer_id: customerId, requires_human_review: false } });
    expect(canChangeHumanReview("admin")).toBe(true);
    await expect(updateProjectHumanReviewWithDataSource(mock.dataSource, validProjectId, { requires_human_review: true, title: "x" })).resolves.toMatchObject({ success: true });
    expect(Object.keys(mock.calls.payload ?? {})).toEqual(["requires_human_review"]);
    expect(mock.calls.payload).toEqual({ requires_human_review: true });
    expect(mock.calls.eq).toContainEqual(["requires_human_review", false]);
  });

  it("allows admins to change true to false and keeps false in the update payload", async () => {
    const mock = source({ role: "admin", current: { id: validProjectId, customer_id: customerId, requires_human_review: true } });
    await expect(updateProjectHumanReviewWithDataSource(mock.dataSource, validProjectId, { requires_human_review: false, status: "accepted" })).resolves.toMatchObject({ success: true });
    expect(mock.calls.payload).toEqual({ requires_human_review: false });
    expect(mock.calls.payload).toHaveProperty("requires_human_review", false);
    expect(mock.calls.eq).toContainEqual(["requires_human_review", true]);
  });

  it("rejects reviewers and other non-admin roles", async () => {
    expect(canChangeHumanReview("reviewer")).toBe(false);
    await expect(updateProjectHumanReviewWithDataSource(source({ role: "reviewer" }).dataSource, validProjectId, { requires_human_review: true })).resolves.toMatchObject({ success: false, error: "Sie sind nicht berechtigt, das Human-Review-Flag zu bearbeiten." });
    await expect(updateProjectHumanReviewWithDataSource(source({ role: "customer" }).dataSource, validProjectId, { requires_human_review: true })).resolves.toMatchObject({ success: false, error: "Ihr Benutzerprofil konnte nicht überprüft werden." });
  });

  it("rejects missing auth, invalid project IDs, missing input, invalid input, and inactive projects", async () => {
    await expect(updateProjectHumanReviewWithDataSource(source({ user: false }).dataSource, validProjectId, { requires_human_review: true })).resolves.toMatchObject({ success: false, error: "Sie müssen angemeldet sein." });
    await expect(updateProjectHumanReviewWithDataSource(source().dataSource, "x", { requires_human_review: true })).resolves.toMatchObject({ success: false, error: "Die Projekt-ID ist ungültig." });
    await expect(updateProjectHumanReviewWithDataSource(source().dataSource, validProjectId, {})).resolves.toMatchObject({ success: false, error: "Bitte prüfen Sie die markierten Felder." });
    await expect(updateProjectHumanReviewWithDataSource(source().dataSource, validProjectId, { requires_human_review: "true" })).resolves.toMatchObject({ success: false, error: "Bitte prüfen Sie die markierten Felder." });
    await expect(updateProjectHumanReviewWithDataSource(source({ current: null }).dataSource, validProjectId, { requires_human_review: true })).resolves.toMatchObject({ success: false, error: "Das Projekt wurde nicht gefunden oder ist nicht mehr verfügbar." });
  });

  it("uses active project filters, detects conflicts for current true and false, and exposes revalidation paths", async () => {
    const currentFalse = source({ current: { id: validProjectId, customer_id: customerId, requires_human_review: false }, row: null });
    await expect(updateProjectHumanReviewWithDataSource(currentFalse.dataSource, validProjectId, { requires_human_review: true })).resolves.toMatchObject({ success: false, error: "Das Projekt wurde zwischenzeitlich geändert. Bitte laden Sie die Seite neu." });
    expect(currentFalse.calls.is).toContainEqual(["deleted_at", null]);
    expect(currentFalse.calls.eq).toContainEqual(["requires_human_review", false]);

    const currentTrue = source({ current: { id: validProjectId, customer_id: customerId, requires_human_review: true } });
    await updateProjectHumanReviewWithDataSource(currentTrue.dataSource, validProjectId, { requires_human_review: false });
    expect(currentTrue.calls.eq).toContainEqual(["requires_human_review", true]);
    expect(getProjectOverviewRevalidationPaths({ id: validProjectId, customer_id: customerId })).toEqual(["/projects", `/projects/${validProjectId}`]);
  });

  it("maps FormData explicitly to booleans and distinguishes missing fields", () => {
    const yes = new FormData(); yes.set("project_id", validProjectId); yes.set("requires_human_review", "true"); yes.set("summary", "x");
    expect(formDataToUpdateProjectHumanReviewInput(yes)).toEqual({ projectId: validProjectId, values: { requires_human_review: true } });
    const no = new FormData(); no.set("project_id", validProjectId); no.set("requires_human_review", "false");
    expect(formDataToUpdateProjectHumanReviewInput(no)).toEqual({ projectId: validProjectId, values: { requires_human_review: false } });
    const missing = new FormData(); missing.set("project_id", validProjectId);
    expect(formDataToUpdateProjectHumanReviewInput(missing)).toEqual({ projectId: validProjectId, values: { requires_human_review: null } });
  });
});
