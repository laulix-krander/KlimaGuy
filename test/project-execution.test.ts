import { describe, expect, it, vi } from "vitest";
import { canManageProjectExecution } from "@/lib/domain/permissions";
import { executionDependencyStatus, isProjectExecutionTransitionAllowed, projectExecutionDtoSchema } from "@/lib/domain/project-execution";
import { deriveProjectMediaDependencies } from "@/lib/domain/project-media-dependency-projection";
import { transitionProjectExecution, type ProjectExecutionDataSource } from "@/lib/actions/project-execution-service";

const offerId = "11111111-1111-4111-8111-111111111111";
const executionId = "22222222-2222-4222-8222-222222222222";
const projectId = "33333333-3333-4333-8333-333333333333";
const dto = { id: executionId, project_id: projectId, accepted_offer_id: offerId, status: "active", revision: 2, started_at: "2026-08-23T00:00:00Z", completed_at: null, cancelled_at: null, created_at: "2026-08-22T00:00:00Z", updated_at: "2026-08-23T00:00:00Z" };
function source(role: string | null = "admin", data: unknown = dto): ProjectExecutionDataSource { return { auth: { getUser: async () => ({ data: { user: { id: "actor" } } }) }, getRole: async () => role, rpc: vi.fn(async () => ({ data, error: null })) }; }
const evidence = [{ id: crypto.randomUUID(), interpretation_runs: [], observations: [], proposals: [], has_applied_claim: false }];

describe("minimal persistent execution authority", () => {
  it("has a closed lifecycle and dependency mapping", () => {
    expect(isProjectExecutionTransitionAllowed("not_started", "active")).toBe(true); expect(isProjectExecutionTransitionAllowed("not_started", "cancelled")).toBe(true);
    expect(isProjectExecutionTransitionAllowed("active", "completed")).toBe(true); expect(isProjectExecutionTransitionAllowed("active", "cancelled")).toBe(true);
    expect(isProjectExecutionTransitionAllowed("completed", "active")).toBe(false); expect(isProjectExecutionTransitionAllowed("cancelled", "active")).toBe(false);
    expect(executionDependencyStatus("not_started")).toBe("open"); expect(executionDependencyStatus("active")).toBe("open"); expect(executionDependencyStatus("completed")).toBe("resolved");
  });
  it("keeps mutations admin-only and validates the narrow DTO", async () => {
    expect(canManageProjectExecution("admin")).toBe(true); expect(canManageProjectExecution("reviewer")).toBe(false); expect(canManageProjectExecution(null)).toBe(false);
    await expect(transitionProjectExecution(source("reviewer"), "start", { executionId, expectedRevision: 1, idempotencyKey: "start-key" })).resolves.toMatchObject({ success: false });
    await expect(transitionProjectExecution(source(), "start", { executionId, expectedRevision: 1, idempotencyKey: "start-key" })).resolves.toMatchObject({ success: true, data: { revision: 2 } });
    expect(projectExecutionDtoSchema.safeParse({ ...dto, customer_name: "PII" }).success).toBe(false);
  });
  it("projects accepted execution open and terminal execution resolved with no missing authorities", () => {
    for (const status of ["not_started", "active"] as const) {
      const result = deriveProjectMediaDependencies({ project_id: projectId, project_media_id: crypto.randomUUID(), media_available: true, project_status: "accepted", current_offer: { id: offerId, revision: 4, status: "accepted" }, current_execution: { id: executionId, accepted_offer_id: offerId, revision: 1, status }, evidence });
      expect(result.missing_authority_types).toEqual([]); expect(result.dependencies).toEqual(expect.arrayContaining([expect.objectContaining({ dependency_type: "project_execution", status: "open" })]));
    }
    const completed = deriveProjectMediaDependencies({ project_id: projectId, project_media_id: crypto.randomUUID(), media_available: true, project_status: "closed", current_offer: { id: offerId, revision: 4, status: "accepted" }, current_execution: { id: executionId, accepted_offer_id: offerId, revision: 3, status: "completed" }, evidence });
    expect(completed).toMatchObject({ completeness: "complete", missing_authority_types: [] }); expect(completed.dependencies).toEqual(expect.arrayContaining([expect.objectContaining({ dependency_type: "project_execution", status: "resolved" })]));
  });
  it("recognizes no-order but fails closed for missing and inconsistent execution authority", () => {
    const rejected = deriveProjectMediaDependencies({ project_id: projectId, project_media_id: crypto.randomUUID(), media_available: true, project_status: "rejected", current_offer: { id: offerId, revision: 4, status: "rejected" }, evidence });
    expect(rejected.missing_authority_types).toEqual([]); expect(rejected.dependencies.some((d) => d.dependency_type === "project_execution")).toBe(false);
    const missing = deriveProjectMediaDependencies({ project_id: projectId, project_media_id: crypto.randomUUID(), media_available: true, project_status: "accepted", current_offer: { id: offerId, revision: 4, status: "accepted" }, evidence });
    expect(missing.missing_authority_types).toEqual(["execution"]);
    const inconsistent = deriveProjectMediaDependencies({ project_id: projectId, project_media_id: crypto.randomUUID(), media_available: true, project_status: "accepted", current_offer: { id: offerId, revision: 4, status: "accepted" }, current_execution: { id: executionId, accepted_offer_id: offerId, revision: 3, status: "completed" }, evidence });
    expect(inconsistent).toMatchObject({ completeness: "incomplete", missing_authority_types: ["execution"] });
  });
});
