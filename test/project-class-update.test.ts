import { describe, expect, it } from "vitest";
import { canChangeProjectClass } from "@/lib/domain/permissions";
import { updateProjectClassSchema } from "@/lib/domain/schemas";
import type { ProjectClass } from "@/lib/domain/types";
import { getProjectCoreRevalidationPaths } from "@/lib/actions/project-revalidation";
import {
  type ActiveProjectClassQuery,
  type ProjectClassProfilesQuery,
  type ProjectClassUpdate,
  type UpdateProjectClassDataSource,
  formDataToUpdateProjectClassInput,
  updateProjectClassWithDataSource,
} from "@/lib/actions/project-class-update-service";

const validProjectId = "11111111-1111-4111-8111-111111111111";
const customerId = "22222222-2222-4222-8222-222222222222";
const validInput = { project_class: "B" };

function source(options: { user?: boolean; role?: string | null; current?: { id: string; customer_id: string; project_class: ProjectClass | null } | null; row?: { id: string; customer_id: string } | null; loadError?: unknown; error?: unknown } = {}) {
  const calls = { payload: undefined as ProjectClassUpdate | undefined, eq: [] as Array<[string, string]>, is: [] as Array<[string, null]>, projectClassMatch: undefined as ProjectClass | null | undefined, select: [] as string[] };
  function from(table: "profiles"): ProjectClassProfilesQuery;
  function from(table: "projects"): ActiveProjectClassQuery;
  function from(table: "profiles" | "projects"): ProjectClassProfilesQuery | ActiveProjectClassQuery {
    if (table === "profiles") return { select: () => ({ eq: () => ({ single: async () => ({ data: options.role === null ? null : { role: options.role ?? "admin" }, error: null }) }) }) };
    return {
      select(columns: "id,customer_id,project_class") { calls.select.push(columns); return { eq(column: "id", value: string) { calls.eq.push([column, value]); return { is(column: "deleted_at", value: null) { calls.is.push([column, value]); return { single: async () => ({ data: options.current === undefined ? { id: validProjectId, customer_id: customerId, project_class: "A" as ProjectClass } : options.current, error: options.loadError ?? null }) }; } }; } }; },
      update(payload: ProjectClassUpdate) { calls.payload = payload; return { eq(column: "id", value: string) { calls.eq.push([column, value]); return { matchProjectClass(currentProjectClass: ProjectClass | null) { calls.projectClassMatch = currentProjectClass; return { is(column3: "deleted_at", value3: null) { calls.is.push([column3, value3]); return { select(columns: "id,customer_id") { calls.select.push(columns); return { single: async () => ({ data: options.row === undefined ? { id: validProjectId, customer_id: customerId } : options.row, error: options.error ?? null }) }; } }; } }; } }; } }; },
    };
  }
  const dataSource: UpdateProjectClassDataSource = { auth: { async getUser() { return { data: { user: options.user === false ? null : { id: "user-1" } } }; } }, from };
  return { dataSource, calls };
}

describe("updateProjectClassSchema", () => {
  it("accepts only an existing project class and strips unknown fields", () => {
    expect(updateProjectClassSchema.parse({ ...validInput, status: "accepted", requires_human_review: false, title: "x" })).toEqual(validInput);
    expect(() => updateProjectClassSchema.parse({ project_class: "E" })).toThrow();
  });
});

describe("project class update service", () => {
  it("allows admins to edit only the project class", async () => {
    const mock = source({ role: "admin" });
    expect(canChangeProjectClass("admin")).toBe(true);
    await expect(updateProjectClassWithDataSource(mock.dataSource, validProjectId, { ...validInput, status: "accepted", title: "x" })).resolves.toMatchObject({ success: true });
    expect(Object.keys(mock.calls.payload ?? {})).toEqual(["project_class"]);
    expect(mock.calls.payload).toEqual(validInput);
  });

  it("allows reviewers when the hardened class permission allows it", async () => {
    const mock = source({ role: "reviewer" });
    expect(canChangeProjectClass("reviewer")).toBe(true);
    await expect(updateProjectClassWithDataSource(mock.dataSource, validProjectId, validInput)).resolves.toMatchObject({ success: true });
    expect(mock.calls.payload).toEqual(validInput);
  });

  it("rejects missing auth, invalid roles, invalid project IDs, and missing projects", async () => {
    await expect(updateProjectClassWithDataSource(source({ user: false }).dataSource, validProjectId, validInput)).resolves.toMatchObject({ success: false, error: "Sie müssen angemeldet sein." });
    await expect(updateProjectClassWithDataSource(source({ role: "customer" }).dataSource, validProjectId, validInput)).resolves.toMatchObject({ success: false, error: "Ihr Benutzerprofil konnte nicht überprüft werden." });
    await expect(updateProjectClassWithDataSource(source().dataSource, "x", validInput)).resolves.toMatchObject({ success: false, error: "Die Projekt-ID ist ungültig." });
    await expect(updateProjectClassWithDataSource(source({ current: null }).dataSource, validProjectId, validInput)).resolves.toMatchObject({ success: false, error: "Das Projekt wurde nicht gefunden oder ist nicht mehr verfügbar." });
  });

  it("requires an active project and uses the current project class as conflict filter", async () => {
    const mock = source({ current: { id: validProjectId, customer_id: customerId, project_class: null } });
    await updateProjectClassWithDataSource(mock.dataSource, validProjectId, validInput);
    expect(mock.calls.eq).toContainEqual(["id", validProjectId]);
    expect(mock.calls.is).toContainEqual(["deleted_at", null]);
    expect(mock.calls.projectClassMatch).toBeNull();
    await expect(updateProjectClassWithDataSource(source({ row: null }).dataSource, validProjectId, validInput)).resolves.toMatchObject({ success: false, error: "Das Projekt wurde zwischenzeitlich geändert. Bitte laden Sie die Seite neu." });
  });

  it("maps FormData to the project_class allowlist and keeps project revalidation paths available", () => {
    const formData = new FormData();
    formData.set("project_id", validProjectId);
    formData.set("project_class", "C");
    formData.set("status", "accepted");
    formData.set("summary", "Nicht erlaubt");
    expect(formDataToUpdateProjectClassInput(formData)).toEqual({ projectId: validProjectId, values: { project_class: "C" } });
    expect(getProjectCoreRevalidationPaths({ id: validProjectId, customer_id: customerId })).toEqual(["/projects", `/projects/${validProjectId}`, `/customers/${customerId}`]);
  });
});
