import { describe, expect, it } from "vitest";
import { canChangeProjectStatus } from "@/lib/domain/permissions";
import { getAllowedProjectStatusTransitions, isProjectStatusTransitionAllowed } from "@/lib/domain/project-status";
import { updateProjectStatusSchema } from "@/lib/domain/schemas";
import type { ProjectStatus } from "@/lib/domain/types";
import { getProjectCoreRevalidationPaths } from "@/lib/actions/project-revalidation";
import {
  type ActiveProjectStatusQuery,
  type ProjectStatusProfilesQuery,
  type ProjectStatusUpdate,
  type UpdateProjectStatusDataSource,
  formDataToUpdateProjectStatusInput,
  updateProjectStatusWithDataSource,
} from "@/lib/actions/project-status-update-service";

const validProjectId = "11111111-1111-4111-8111-111111111111";
const customerId = "22222222-2222-4222-8222-222222222222";
const validInput = { status: "collecting_information" };

function source(options: { user?: boolean; role?: string | null; current?: { id: string; customer_id: string; status: ProjectStatus } | null; row?: { id: string; customer_id: string } | null; loadError?: unknown; error?: unknown } = {}) {
  const calls = { payload: undefined as ProjectStatusUpdate | undefined, eq: [] as Array<[string, string]>, is: [] as Array<[string, null]>, select: [] as string[] };
  function from(table: "profiles"): ProjectStatusProfilesQuery;
  function from(table: "projects"): ActiveProjectStatusQuery;
  function from(table: "profiles" | "projects"): ProjectStatusProfilesQuery | ActiveProjectStatusQuery {
    if (table === "profiles") return { select: () => ({ eq: () => ({ single: async () => ({ data: options.role === null ? null : { role: options.role ?? "admin" }, error: null }) }) }) };
    return {
      select(columns: "id,customer_id,status") { calls.select.push(columns); return { eq(column: "id", value: string) { calls.eq.push([column, value]); return { is(column: "deleted_at", value: null) { calls.is.push([column, value]); return { single: async () => ({ data: options.current === undefined ? { id: validProjectId, customer_id: customerId, status: "new" as ProjectStatus } : options.current, error: options.loadError ?? null }) }; } }; } }; },
      update(payload: ProjectStatusUpdate) { calls.payload = payload; return { eq(column: "id", value: string) { calls.eq.push([column, value]); return { eq(column2: "status", value2: ProjectStatus) { calls.eq.push([column2, value2]); return { is(column3: "deleted_at", value3: null) { calls.is.push([column3, value3]); return { select(columns: "id,customer_id") { calls.select.push(columns); return { single: async () => ({ data: options.row === undefined ? { id: validProjectId, customer_id: customerId } : options.row, error: options.error ?? null }) }; } }; } }; } }; } }; },
    };
  }
  const dataSource: UpdateProjectStatusDataSource = { auth: { async getUser() { return { data: { user: options.user === false ? null : { id: "user-1" } } }; } }, from };
  return { dataSource, calls };
}

describe("updateProjectStatusSchema", () => {
  it("accepts only an existing project status and strips unknown fields", () => {
    expect(updateProjectStatusSchema.parse({ ...validInput, title: "x", project_class: "A", requires_human_review: false })).toEqual(validInput);
    expect(() => updateProjectStatusSchema.parse({ status: "invented" })).toThrow();
  });
});

describe("project status update service", () => {
  it("allows admins to edit only the status", async () => {
    const mock = source({ role: "admin" });
    expect(canChangeProjectStatus("admin")).toBe(true);
    await expect(updateProjectStatusWithDataSource(mock.dataSource, validProjectId, { ...validInput, project_class: "A", title: "x" })).resolves.toMatchObject({ success: true });
    expect(Object.keys(mock.calls.payload ?? {})).toEqual(["status"]);
    expect(mock.calls.payload).toEqual(validInput);
  });

  it("allows reviewers when the hardened status permission allows it", async () => {
    const mock = source({ role: "reviewer" });
    expect(canChangeProjectStatus("reviewer")).toBe(true);
    await expect(updateProjectStatusWithDataSource(mock.dataSource, validProjectId, validInput)).resolves.toMatchObject({ success: true });
    expect(mock.calls.payload).toEqual(validInput);
  });

  it("rejects missing auth, invalid roles, invalid project IDs, and missing projects", async () => {
    await expect(updateProjectStatusWithDataSource(source({ user: false }).dataSource, validProjectId, validInput)).resolves.toMatchObject({ success: false, error: "Sie müssen angemeldet sein." });
    await expect(updateProjectStatusWithDataSource(source({ role: "customer" }).dataSource, validProjectId, validInput)).resolves.toMatchObject({ success: false, error: "Ihr Benutzerprofil konnte nicht überprüft werden." });
    await expect(updateProjectStatusWithDataSource(source().dataSource, "x", validInput)).resolves.toMatchObject({ success: false, error: "Die Projekt-ID ist ungültig." });
    await expect(updateProjectStatusWithDataSource(source({ current: null }).dataSource, validProjectId, validInput)).resolves.toMatchObject({ success: false, error: "Das Projekt wurde nicht gefunden oder ist nicht mehr verfügbar." });
  });

  it("accepts valid transitions and rejects invalid transitions through the domain rules", async () => {
    expect(isProjectStatusTransitionAllowed("new", "collecting_information")).toBe(true);
    expect(getAllowedProjectStatusTransitions("closed")).toEqual([]);
    await expect(updateProjectStatusWithDataSource(source().dataSource, validProjectId, { status: "collecting_information" })).resolves.toMatchObject({ success: true });
    await expect(updateProjectStatusWithDataSource(source().dataSource, validProjectId, { status: "accepted" })).resolves.toMatchObject({ success: false, error: "Dieser Statuswechsel ist nicht erlaubt." });
  });

  it("uses id, current status, and active row filters and reports conflicts", async () => {
    const mock = source();
    await updateProjectStatusWithDataSource(mock.dataSource, validProjectId, validInput);
    expect(mock.calls.eq).toContainEqual(["id", validProjectId]);
    expect(mock.calls.eq).toContainEqual(["status", "new"]);
    expect(mock.calls.is).toContainEqual(["deleted_at", null]);
    await expect(updateProjectStatusWithDataSource(source({ row: null }).dataSource, validProjectId, validInput)).resolves.toMatchObject({ success: false, error: "Das Projekt wurde zwischenzeitlich geändert. Bitte laden Sie die Seite neu." });
  });

  it("maps FormData to the status allowlist and keeps project revalidation paths available", () => {
    const formData = new FormData();
    formData.set("project_id", validProjectId);
    formData.set("status", "new");
    formData.set("title", "Nicht erlaubt");
    expect(formDataToUpdateProjectStatusInput(formData)).toEqual({ projectId: validProjectId, values: { status: "new" } });
    expect(getProjectCoreRevalidationPaths({ id: validProjectId, customer_id: customerId })).toEqual(["/projects", `/projects/${validProjectId}`, `/customers/${customerId}`]);
  });
});
