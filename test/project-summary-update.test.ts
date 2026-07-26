import { describe, expect, it } from "vitest";
import { canEditProjectSummary } from "@/lib/domain/permissions";
import { updateProjectSummarySchema } from "@/lib/domain/schemas";
import { getProjectDetailRevalidationPaths } from "@/lib/actions/project-revalidation";
import {
  type ActiveProjectSummaryQuery,
  type ProjectSummaryProfilesQuery,
  type ProjectSummaryUpdate,
  type UpdateProjectSummaryDataSource,
  formDataToUpdateProjectSummaryInput,
  updateProjectSummaryWithDataSource,
} from "@/lib/actions/project-summary-update-service";

const validProjectId = "11111111-1111-4111-8111-111111111111";
const customerId = "22222222-2222-4222-8222-222222222222";
const validInput = { summary: "Neue interne Zusammenfassung" };

function source(options: { user?: boolean; role?: string | null; current?: { id: string; customer_id: string; summary: string | null } | null; row?: { id: string; customer_id: string } | null; loadError?: unknown; error?: unknown } = {}) {
  const calls = { payload: undefined as ProjectSummaryUpdate | undefined, eq: [] as Array<[string, string]>, is: [] as Array<[string, null]>, summaryMatch: undefined as string | null | undefined, select: [] as string[] };
  function from(table: "profiles"): ProjectSummaryProfilesQuery;
  function from(table: "projects"): ActiveProjectSummaryQuery;
  function from(table: "profiles" | "projects"): ProjectSummaryProfilesQuery | ActiveProjectSummaryQuery {
    if (table === "profiles") return { select: () => ({ eq: () => ({ single: async () => ({ data: options.role === null ? null : { role: options.role ?? "admin" }, error: null }) }) }) };
    return {
      select(columns: "id,customer_id,summary") { calls.select.push(columns); return { eq(column: "id", value: string) { calls.eq.push([column, value]); return { is(column: "deleted_at", value: null) { calls.is.push([column, value]); return { single: async () => ({ data: options.current === undefined ? { id: validProjectId, customer_id: customerId, summary: "Alt" } : options.current, error: options.loadError ?? null }) }; } }; } }; },
      update(payload: ProjectSummaryUpdate) { calls.payload = payload; return { eq(column: "id", value: string) { calls.eq.push([column, value]); return { matchSummary(currentSummary: string | null) { calls.summaryMatch = currentSummary; return { is(column3: "deleted_at", value3: null) { calls.is.push([column3, value3]); return { select(columns: "id,customer_id") { calls.select.push(columns); return { single: async () => ({ data: options.row === undefined ? { id: validProjectId, customer_id: customerId } : options.row, error: options.error ?? null }) }; } }; } }; } }; } }; },
    };
  }
  const dataSource: UpdateProjectSummaryDataSource = { auth: { async getUser() { return { data: { user: options.user === false ? null : { id: "user-1" } } }; } }, from };
  return { dataSource, calls };
}

describe("updateProjectSummarySchema", () => {
  it("accepts only summary, trims empty values to null, and strips unknown fields", () => {
    expect(updateProjectSummarySchema.parse({ ...validInput, status: "accepted", project_class: "A", requires_human_review: false })).toEqual(validInput);
    expect(updateProjectSummarySchema.parse({ summary: "   " })).toEqual({ summary: null });
    expect(() => updateProjectSummarySchema.parse({ summary: "x".repeat(4001) })).toThrow();
  });
});

describe("project summary update service", () => {
  it("allows admins to edit only the summary", async () => {
    const mock = source({ role: "admin" });
    expect(canEditProjectSummary("admin")).toBe(true);
    await expect(updateProjectSummaryWithDataSource(mock.dataSource, validProjectId, { ...validInput, status: "accepted", title: "x" })).resolves.toMatchObject({ success: true });
    expect(Object.keys(mock.calls.payload ?? {})).toEqual(["summary"]);
    expect(mock.calls.payload).toEqual(validInput);
  });

  it("rejects reviewers and other unauthorized roles", async () => {
    expect(canEditProjectSummary("reviewer")).toBe(false);
    await expect(updateProjectSummaryWithDataSource(source({ role: "reviewer" }).dataSource, validProjectId, validInput)).resolves.toMatchObject({ success: false, error: "Sie sind nicht berechtigt, die Projektzusammenfassung zu bearbeiten." });
    await expect(updateProjectSummaryWithDataSource(source({ role: "customer" }).dataSource, validProjectId, validInput)).resolves.toMatchObject({ success: false, error: "Ihr Benutzerprofil konnte nicht überprüft werden." });
  });

  it("rejects validation errors, missing auth, invalid project IDs, and missing projects", async () => {
    await expect(updateProjectSummaryWithDataSource(source().dataSource, validProjectId, { summary: "x".repeat(4001) })).resolves.toMatchObject({ success: false, error: "Bitte prüfen Sie die markierten Felder." });
    await expect(updateProjectSummaryWithDataSource(source({ user: false }).dataSource, validProjectId, validInput)).resolves.toMatchObject({ success: false, error: "Sie müssen angemeldet sein." });
    await expect(updateProjectSummaryWithDataSource(source().dataSource, "x", validInput)).resolves.toMatchObject({ success: false, error: "Die Projekt-ID ist ungültig." });
    await expect(updateProjectSummaryWithDataSource(source({ current: null }).dataSource, validProjectId, validInput)).resolves.toMatchObject({ success: false, error: "Das Projekt wurde nicht gefunden oder ist nicht mehr verfügbar." });
  });

  it("requires an active project and uses the current summary as conflict filter", async () => {
    const mock = source({ current: { id: validProjectId, customer_id: customerId, summary: null } });
    await updateProjectSummaryWithDataSource(mock.dataSource, validProjectId, validInput);
    expect(mock.calls.eq).toContainEqual(["id", validProjectId]);
    expect(mock.calls.is).toContainEqual(["deleted_at", null]);
    expect(mock.calls.summaryMatch).toBeNull();
    await expect(updateProjectSummaryWithDataSource(source({ row: null }).dataSource, validProjectId, validInput)).resolves.toMatchObject({ success: false, error: "Das Projekt wurde zwischenzeitlich geändert. Bitte laden Sie die Seite neu." });
  });

  it("maps FormData to the summary allowlist and keeps project revalidation paths available", () => {
    const formData = new FormData();
    formData.set("project_id", validProjectId);
    formData.set("summary", "Text");
    formData.set("status", "accepted");
    formData.set("project_class", "A");
    expect(formDataToUpdateProjectSummaryInput(formData)).toEqual({ projectId: validProjectId, values: { summary: "Text" } });
    expect(getProjectDetailRevalidationPaths({ id: validProjectId, customer_id: customerId })).toEqual([`/projects/${validProjectId}`]);
  });
});
