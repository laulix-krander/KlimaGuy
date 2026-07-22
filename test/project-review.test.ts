import { describe, expect, it } from "vitest";
import { canChangeHumanReview, canChangeProjectClass, canChangeProjectStatus } from "@/lib/domain/permissions";
import { getAllowedProjectStatusTransitions, isProjectStatusTransitionAllowed } from "@/lib/domain/project-status";
import { projectIdSchema, updateProjectReviewSchema } from "@/lib/domain/schemas";
import { PROJECT_CLASSES, PROJECT_STATUSES, type ProjectStatus } from "@/lib/domain/types";
import {
  type ProjectReviewDataSource,
  type ProjectReviewLoadQuery,
  type ProjectReviewProfilesQuery,
  type ProjectReviewUpdate,
  formDataToUpdateProjectReviewInput,
  updateProjectReviewWithDataSource,
} from "@/lib/actions/project-review-service";

const projectId = "11111111-1111-4111-8111-111111111111";
const customerId = "22222222-2222-4222-8222-222222222222";

type SourceOptions = { user?: boolean; role?: string | null; currentStatus?: ProjectStatus; row?: false; loadError?: unknown; updateRow?: false; updateError?: unknown };

function source(options: SourceOptions = {}) {
  const calls = { loadEq: [] as Array<[string, string]>, loadIs: [] as Array<[string, null]>, payload: undefined as ProjectReviewUpdate | undefined, updateEq: [] as Array<[string, string]>, updateIs: [] as Array<[string, null]> };
  const currentStatus = options.currentStatus ?? "new";
  function from(table: "profiles"): ProjectReviewProfilesQuery;
  function from(table: "projects"): ProjectReviewLoadQuery;
  function from(table: "profiles" | "projects"): ProjectReviewProfilesQuery | ProjectReviewLoadQuery {
    if (table === "profiles") return { select: () => ({ eq: () => ({ single: async () => ({ data: options.role === null ? null : { role: options.role ?? "admin" }, error: null }) }) }) };
    return {
      select: () => ({ eq: (column: "id", value: string) => { calls.loadEq.push([column, value]); return { is: (column: "deleted_at", value: null) => { calls.loadIs.push([column, value]); return { single: async () => ({ data: options.row === false ? null : { id: projectId, customer_id: customerId, status: currentStatus, deleted_at: null }, error: options.loadError ?? null }) }; } }; } }),
      update(payload: ProjectReviewUpdate) { calls.payload = payload; return { eq(column: "id", value: string) { calls.updateEq.push([column, value]); return { eq(column: "status", value: ProjectStatus) { calls.updateEq.push([column, value]); return { is(column: "deleted_at", value: null) { calls.updateIs.push([column, value]); return { select: () => ({ single: async () => ({ data: options.updateRow === false ? null : { id: projectId, customer_id: customerId }, error: options.updateError ?? null }) }) }; } }; } }; } }; },
    };
  }
  const dataSource: ProjectReviewDataSource = { auth: { async getUser() { return { data: { user: options.user === false ? null : { id: "user-1" } } }; } }, from };
  return { dataSource, calls };
}

const review = (status: ProjectStatus = "collecting_information") => ({ status, project_class: "A", requires_human_review: true });

describe("updateProjectReviewSchema", () => {
  it("accepts valid project reviews and all central status values", () => {
    for (const status of PROJECT_STATUSES) expect(updateProjectReviewSchema.parse({ status, project_class: "A", requires_human_review: true }).status).toBe(status);
  });
  it("accepts project classes A to D and rejects null or invalid classes", () => {
    for (const projectClass of PROJECT_CLASSES) expect(updateProjectReviewSchema.parse({ status: "new", project_class: projectClass, requires_human_review: false }).project_class).toBe(projectClass);
    expect(() => updateProjectReviewSchema.parse({ status: "new", project_class: null, requires_human_review: true })).toThrow();
    expect(() => updateProjectReviewSchema.parse({ status: "new", project_class: "E", requires_human_review: true })).toThrow();
  });
  it("accepts true and false booleans and rejects string booleans", () => {
    expect(updateProjectReviewSchema.parse({ status: "new", project_class: "A", requires_human_review: true }).requires_human_review).toBe(true);
    expect(updateProjectReviewSchema.parse({ status: "new", project_class: "A", requires_human_review: false }).requires_human_review).toBe(false);
    for (const value of ["false", "0", "off", "true"]) expect(() => updateProjectReviewSchema.parse({ status: "new", project_class: "A", requires_human_review: value })).toThrow();
  });
  it("strips unknown fields", () => {
    const parsed = updateProjectReviewSchema.parse({ ...review(), title: "x", customer_id: "x", summary: "x", metadata: { x: true } });
    expect(Object.keys(parsed).sort()).toEqual(["project_class", "requires_human_review", "status"]);
  });
});

describe("AP-01 review permissions", () => {
  it("allows admins and reviewers for status, class, and human review", () => {
    for (const role of ["admin", "reviewer"] as const) {
      expect(canChangeProjectStatus(role)).toBe(true);
      expect(canChangeProjectClass(role)).toBe(true);
      expect(canChangeHumanReview(role)).toBe(true);
    }
  });
  it("rejects invalid roles in the service", async () => {
    await expect(updateProjectReviewWithDataSource(source({ role: "owner" }).dataSource, projectId, review())).resolves.toMatchObject({ success: false, error: "Ihr Benutzerprofil konnte nicht überprüft werden." });
  });
});

describe("project review service", () => {
  it.each([
    ["new", "collecting_information"], ["new", "rejected"], ["new", "closed"], ["collecting_information", "technical_review"],
    ["technical_review", "collecting_information"], ["technical_review", "quote_draft"], ["technical_review", "human_review"],
    ["quote_draft", "quote_sent"], ["quote_draft", "technical_review"], ["human_review", "quote_sent"],
    ["quote_sent", "accepted"], ["quote_sent", "rejected"], ["accepted", "closed"], ["rejected", "closed"],
  ] as Array<[ProjectStatus, ProjectStatus]>)('allows %s to %s', async (from, to) => {
    expect(isProjectStatusTransitionAllowed(from, to)).toBe(true);
    await expect(updateProjectReviewWithDataSource(source({ currentStatus: from }).dataSource, projectId, review(to))).resolves.toMatchObject({ success: true });
  });
  it.each([["new", "accepted"], ["collecting_information", "quote_sent"], ["closed", "new"]] as Array<[ProjectStatus, ProjectStatus]>)('rejects %s to %s without update', async (from, to) => {
    const mock = source({ currentStatus: from });
    await expect(updateProjectReviewWithDataSource(mock.dataSource, projectId, review(to))).resolves.toMatchObject({ success: false, error: "Der gewählte Statusübergang ist nicht zulässig." });
    expect(mock.calls.payload).toBeUndefined();
  });
  it("accepts the same status for class or human-review changes including closed", async () => {
    await expect(updateProjectReviewWithDataSource(source({ currentStatus: "closed" }).dataSource, projectId, { status: "closed", project_class: "D", requires_human_review: false })).resolves.toMatchObject({ success: true });
    expect(getAllowedProjectStatusTransitions("closed")).toEqual([]);
  });
  it("rejects missing auth, missing profile, and invalid ids without update", async () => {
    await expect(updateProjectReviewWithDataSource(source({ user: false }).dataSource, projectId, review())).resolves.toMatchObject({ success: false, error: "Sie müssen angemeldet sein." });
    await expect(updateProjectReviewWithDataSource(source({ role: null }).dataSource, projectId, review())).resolves.toMatchObject({ success: false, error: "Ihr Benutzerprofil konnte nicht überprüft werden." });
    const mock = source();
    expect(projectIdSchema.safeParse(projectId).success).toBe(true);
    await expect(updateProjectReviewWithDataSource(mock.dataSource, "invalid", review())).resolves.toMatchObject({ success: false, error: "Die Projekt-ID ist ungültig." });
    expect(mock.calls.payload).toBeUndefined();
  });
  it("loads active projects by id and deleted_at null", async () => {
    const mock = source();
    await updateProjectReviewWithDataSource(mock.dataSource, projectId, review());
    expect(mock.calls.loadEq).toEqual([["id", projectId]]);
    expect(mock.calls.loadIs).toEqual([["deleted_at", null]]);
  });
  it("rejects unknown, deleted, or load-error projects neutrally", async () => {
    await expect(updateProjectReviewWithDataSource(source({ row: false }).dataSource, projectId, review())).resolves.toMatchObject({ success: false, error: "Das Projekt wurde nicht gefunden oder ist nicht mehr verfügbar." });
    await expect(updateProjectReviewWithDataSource(source({ loadError: { message: "raw load" } }).dataSource, projectId, review())).resolves.toMatchObject({ success: false, error: "Die Projektprüfung konnte nicht aktualisiert werden. Bitte versuchen Sie es erneut." });
  });
  it("uses id, current status, and deleted_at concurrency filters", async () => {
    const mock = source({ currentStatus: "new" });
    await updateProjectReviewWithDataSource(mock.dataSource, projectId, review("closed"));
    expect(mock.calls.updateEq).toEqual([["id", projectId], ["status", "new"]]);
    expect(mock.calls.updateIs).toEqual([["deleted_at", null]]);
  });
  it("returns conflict for no affected row and does not treat stale status as success", async () => {
    await expect(updateProjectReviewWithDataSource(source({ updateRow: false }).dataSource, projectId, review())).resolves.toMatchObject({ success: false, error: "Das Projekt wurde zwischenzeitlich geändert. Bitte laden Sie die Seite neu." });
  });
  it("builds an atomic allowlisted patch and ignores project core fields", async () => {
    const mock = source();
    await updateProjectReviewWithDataSource(mock.dataSource, projectId, { ...review(), id: "evil", title: "evil", customer_id: "evil", installation_address: "evil", postal_code: "evil", city: "evil", summary: "evil", created_by: "evil", deleted_at: "evil", metadata: { x: true } });
    expect(Object.keys(mock.calls.payload ?? {}).sort()).toEqual(["project_class", "requires_human_review", "status"]);
    expect(mock.calls.payload).toEqual(review());
  });
  it("returns neutral database errors without raw Supabase details", async () => {
    const result = await updateProjectReviewWithDataSource(source({ updateError: { message: "raw SQL projects" } }).dataSource, projectId, review());
    expect(result).toMatchObject({ success: false, error: "Die Projektprüfung konnte nicht aktualisiert werden. Bitte versuchen Sie es erneut." });
    expect(result.success ? "" : result.error).not.toContain("raw SQL");
  });
  it("maps FormData explicitly including checkbox false", () => {
    const checked = new FormData(); checked.set("project_id", projectId); checked.set("status", "closed"); checked.set("project_class", "D"); checked.set("requires_human_review", "on"); checked.set("title", "evil");
    expect(formDataToUpdateProjectReviewInput(checked)).toEqual({ projectId, values: { status: "closed", project_class: "D", requires_human_review: true } });
    const unchecked = new FormData(); unchecked.set("project_id", projectId); unchecked.set("status", "closed"); unchecked.set("project_class", "D");
    expect(formDataToUpdateProjectReviewInput(unchecked)).toEqual({ projectId, values: { status: "closed", project_class: "D", requires_human_review: false } });
  });
});
