import { describe, expect, it } from "vitest";
import { canEditProjectCoreFields } from "@/lib/domain/permissions";
import { projectIdSchema, updateProjectMetadataSchema } from "@/lib/domain/schemas";
import {
  type ProjectCoreUpdate,
  type ProjectUpdateProfilesQuery,
  type ProjectsUpdateQuery,
  type UpdateProjectDataSource,
  formDataToUpdateProjectCoreInput,
  updateProjectCoreWithDataSource,
} from "@/lib/actions/project-update-service";
import { getProjectCoreRevalidationPaths } from "@/lib/actions/projects";

const validProjectId = "11111111-1111-4111-8111-111111111111";
const customerId = "22222222-2222-4222-8222-222222222222";

function source(options: { user?: boolean; role?: string | null; row?: { id: string; customer_id: string } | null; error?: unknown } = {}) {
  const calls = { payload: undefined as ProjectCoreUpdate | undefined, eq: [] as Array<[string, string]>, is: [] as Array<[string, null]>, select: "" };
  function from(table: "profiles"): ProjectUpdateProfilesQuery;
  function from(table: "projects"): ProjectsUpdateQuery;
  function from(table: "profiles" | "projects"): ProjectUpdateProfilesQuery | ProjectsUpdateQuery {
    if (table === "profiles") return { select: () => ({ eq: () => ({ single: async () => ({ data: options.role === null ? null : { role: options.role ?? "admin" }, error: null }) }) }) };
    return { update(payload: ProjectCoreUpdate) { calls.payload = payload; return { eq(column: "id", value: string) { calls.eq.push([column, value]); return { is(column: "deleted_at", value: null) { calls.is.push([column, value]); return { select(columns: "id,customer_id") { calls.select = columns; return { single: async () => ({ data: options.row === undefined ? { id: validProjectId, customer_id: customerId } : options.row, error: options.error ?? null }) }; } }; } }; } }; } };
  }
  const dataSource: UpdateProjectDataSource = {
    auth: { async getUser() { return { data: { user: options.user === false ? null : { id: "user-1" } } }; } },
    from,
  };
  return { dataSource, calls };
}

describe("updateProjectMetadataSchema", () => {
  it("accepts a full valid update", () => {
    expect(updateProjectMetadataSchema.parse({ title: "Projekt", installation_address: "Straße 1", postal_code: "12345", city: "Köln" })).toEqual({ title: "Projekt", installation_address: "Straße 1", postal_code: "12345", city: "Köln" });
  });
  it("accepts only the required title", () => { expect(updateProjectMetadataSchema.parse({ title: "Projekt" })).toMatchObject({ title: "Projekt" }); });
  it("trims title and rejects empty title", () => {
    expect(updateProjectMetadataSchema.parse({ title: "  Projekt  " }).title).toBe("Projekt");
    expect(() => updateProjectMetadataSchema.parse({ title: "" })).toThrow();
    expect(() => updateProjectMetadataSchema.parse({ title: "   " })).toThrow();
  });
  it("normalizes optional fields without aggressive postal code changes", () => {
    expect(updateProjectMetadataSchema.parse({ title: "P", installation_address: "", postal_code: "", city: "" })).toEqual({ title: "P", installation_address: null, postal_code: null, city: null });
    expect(updateProjectMetadataSchema.parse({ title: "P", installation_address: "  A  ", postal_code: "  12 345  ", city: "  Ort  " })).toEqual({ title: "P", installation_address: "A", postal_code: "12 345", city: "Ort" });
  });
  it("strips unknown fields", () => { expect(updateProjectMetadataSchema.parse({ title: "P", customer_id: customerId, status: "accepted", metadata: "x" })).not.toHaveProperty("customer_id"); });
});

describe("project update service", () => {
  const input = { title: "Neu", installation_address: "A", postal_code: "123", city: "Ort" };
  it("allows admins and rejects reviewers", async () => {
    expect(canEditProjectCoreFields("admin")).toBe(true);
    expect(canEditProjectCoreFields("reviewer")).toBe(false);
    await expect(updateProjectCoreWithDataSource(source({ role: "reviewer" }).dataSource, validProjectId, input)).resolves.toMatchObject({ success: false, error: "Sie sind nicht berechtigt, Projektdaten zu bearbeiten." });
  });
  it("rejects missing auth, missing profile, and invalid role", async () => {
    await expect(updateProjectCoreWithDataSource(source({ user: false }).dataSource, validProjectId, input)).resolves.toMatchObject({ success: false, error: "Sie müssen angemeldet sein." });
    await expect(updateProjectCoreWithDataSource(source({ role: null }).dataSource, validProjectId, input)).resolves.toMatchObject({ success: false, error: "Ihr Benutzerprofil konnte nicht überprüft werden." });
    await expect(updateProjectCoreWithDataSource(source({ role: "owner" }).dataSource, validProjectId, input)).resolves.toMatchObject({ success: false, error: "Ihr Benutzerprofil konnte nicht überprüft werden." });
  });
  it("validates project ids and does not update invalid ids", async () => {
    expect(projectIdSchema.safeParse(validProjectId).success).toBe(true);
    expect(projectIdSchema.safeParse("x").success).toBe(false);
    expect(projectIdSchema.safeParse("").success).toBe(false);
    const mock = source();
    await updateProjectCoreWithDataSource(mock.dataSource, "x", input);
    expect(mock.calls.payload).toBeUndefined();
  });
  it("uses id and deleted_at filters and keeps id out of payload", async () => {
    const mock = source();
    await updateProjectCoreWithDataSource(mock.dataSource, validProjectId, input);
    expect(mock.calls.eq).toEqual([["id", validProjectId]]);
    expect(mock.calls.is).toEqual([["deleted_at", null]]);
    expect(mock.calls.payload).not.toHaveProperty("id");
  });
  it("builds an allowlisted patch and ignores mass-assignment fields", async () => {
    const mock = source();
    await updateProjectCoreWithDataSource(mock.dataSource, validProjectId, { ...input, id: "x", customer_id: "x", status: "accepted", project_class: "A", requires_human_review: false, created_by: "x", created_at: "x", updated_at: "x", deleted_at: "x", role: "admin", metadata: { x: true } });
    expect(Object.keys(mock.calls.payload ?? {}).sort()).toEqual(["city", "installation_address", "postal_code", "title"]);
    expect(mock.calls.payload).toEqual(input);
  });
  it("does not trust manipulated FormData fields", () => {
    const form = new FormData();
    form.set("project_id", validProjectId); form.set("title", "P"); form.set("customer_id", "evil"); form.set("status", "accepted");
    expect(formDataToUpdateProjectCoreInput(form)).toEqual({ projectId: validProjectId, values: { title: "P", installation_address: null, postal_code: null, city: null } });
  });
  it("treats unknown, deleted, or no-row updates as unavailable", async () => {
    await expect(updateProjectCoreWithDataSource(source({ row: null }).dataSource, validProjectId, input)).resolves.toMatchObject({ success: false, error: "Das Projekt wurde nicht gefunden oder ist nicht mehr verfügbar." });
    await expect(updateProjectCoreWithDataSource(source({ row: null }).dataSource, validProjectId, input)).resolves.toMatchObject({ success: false });
  });
  it("returns neutral database errors without raw Supabase messages", async () => {
    const result = await updateProjectCoreWithDataSource(source({ error: { message: "raw SQL projects error" } }).dataSource, validProjectId, input);
    expect(result).toMatchObject({ success: false, error: "Das Projekt konnte nicht aktualisiert werden. Bitte versuchen Sie es erneut." });
    expect(result.success ? "" : result.error).not.toContain("raw SQL");
  });

  it("declares the detail, list, and customer paths for revalidation", () => {
    expect(getProjectCoreRevalidationPaths({ id: validProjectId, customer_id: customerId })).toEqual([
      "/projects",
      `/projects/${validProjectId}`,
      `/customers/${customerId}`,
    ]);
  });

  it("returns success with project and customer ids", async () => {
    await expect(updateProjectCoreWithDataSource(source().dataSource, validProjectId, input)).resolves.toEqual({ success: true, data: { id: validProjectId, customer_id: customerId } });
  });
});
