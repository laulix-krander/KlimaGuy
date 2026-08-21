import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { canManageProjectMediaLifecycle } from "@/lib/domain/permissions";
import {
  evaluateProjectMediaDeletionEligibility, PROJECT_MEDIA_DELETION_REASON_CODES, PROJECT_MEDIA_ELIGIBILITY_STATUSES,
  PROJECT_MEDIA_HOLD_STATES, PROJECT_MEDIA_RETENTION_POLICY_VERSIONS, PROJECT_MEDIA_RETENTION_STATES,
  projectMediaLifecycleDtoSchema, type ProjectMediaDeletionEligibilityInput,
} from "@/lib/domain/project-media-lifecycle";
import { getProjectMediaLifecycleWithDataSource, type ProjectMediaLifecycleReadDataSource } from "@/lib/actions/project-media-lifecycle-read-service";

const PROJECT="11111111-1111-4111-8111-111111111111", MEDIA="22222222-2222-4222-8222-222222222222";
const lifecycle = projectMediaLifecycleDtoSchema.parse({ project_media_id: MEDIA, retention_state: "deletion_eligible", eligibility_status: "eligible", reason_codes: [], hold_status: "none", policy_version: "customer_photo_retention_v1", revision: 3, updated_at: "2026-08-21T12:00:00.000Z" });
const baseline: ProjectMediaDeletionEligibilityInput = { project_id: PROJECT, media: { project_id: PROJECT, upload_status: "ready", deleted_at: null }, lifecycle, project_status: "closed", evidence: [], offer_state: "not_relevant", dependency_state: "not_relevant" };

describe("Project-Media-Lifecycle-Contract", () => {
  it("verwendet geschlossene immutable Registries und ein strict locatorfreies DTO", () => {
    expect(Object.isFrozen(PROJECT_MEDIA_RETENTION_STATES)).toBe(true);
    expect(PROJECT_MEDIA_RETENTION_STATES).toEqual(["protected","retention_pending","deletion_eligible","deletion_blocked"]);
    expect(PROJECT_MEDIA_HOLD_STATES).toEqual(["none","operational_hold","legal_hold"]);
    expect(PROJECT_MEDIA_RETENTION_POLICY_VERSIONS).toEqual(["customer_photo_retention_v1"]);
    expect(PROJECT_MEDIA_ELIGIBILITY_STATUSES).toContain("dependency_state_unknown");
    for (const code of ["media_not_ready","media_failed","media_pending","media_soft_deleted","lifecycle_missing","retention_policy_missing","retention_not_completed","project_active","offer_state_unknown","offer_open","offer_preparation_open","evidence_dependency_open","observation_dependency_unknown","proposal_dependency_unknown","review_dependency_unknown","correction_dependency_unknown","legal_or_operational_hold","cross_project_mismatch","unsupported_media_state"]) expect(PROJECT_MEDIA_DELETION_REASON_CODES).toContain(code);
    expect(projectMediaLifecycleDtoSchema.parse(lifecycle)).toEqual(lifecycle);
    expect(projectMediaLifecycleDtoSchema.safeParse({ ...lifecycle, storage_path: "secret" }).success).toBe(false);
    expect(projectMediaLifecycleDtoSchema.safeParse({ ...lifecycle, policy_version: "90_days" }).success).toBe(false);
  });
  it("ist deterministisch, pure und erlaubt nur den vollständig expliziten Zustand", () => {
    const input = structuredClone(baseline); const before=structuredClone(input);
    expect(evaluateProjectMediaDeletionEligibility(input)).toEqual({status:"eligible",reason_codes:[]});
    expect(evaluateProjectMediaDeletionEligibility(input)).toEqual(evaluateProjectMediaDeletionEligibility(input));
    expect(input).toEqual(before);
  });
  it.each([
    [{media:{...baseline.media,upload_status:"pending"}},"media_not_ready","media_pending"],
    [{media:{...baseline.media,upload_status:"failed"}},"media_not_ready","media_failed"],
    [{media:{...baseline.media,deleted_at:"2026-08-21T00:00:00Z"}},"media_already_logically_deleted","media_soft_deleted"],
    [{lifecycle:null},"lifecycle_state_blocks","lifecycle_missing"],
    [{lifecycle:{...lifecycle,policy_version:null}},"policy_not_configured","retention_policy_missing"],
    [{lifecycle:{...lifecycle,hold_status:"legal_hold"}},"lifecycle_state_blocks","legal_or_operational_hold"],
    [{project_status:"accepted"},"project_state_blocks","project_active"],
    [{offer_state:"unknown"},"offer_state_blocks","offer_state_unknown"],
    [{offer_state:"open"},"offer_state_blocks","offer_open"],
    [{lifecycle:{...lifecycle,retention_state:"retention_pending",eligibility_status:"blocked"}},"lifecycle_state_blocks","retention_not_completed"],
  ] as const)("blockiert Gate %#", (change,status,reason) => {
    const result=evaluateProjectMediaDeletionEligibility({...baseline,...change} as ProjectMediaDeletionEligibilityInput);
    expect(result.status).toBe(status); expect(result.reason_codes).toContain(reason);
  });
  it("trennt ungebundenes Media und blockiert Evidence bei unbekannten produktiven Dependencies", () => {
    expect(evaluateProjectMediaDeletionEligibility(baseline).status).toBe("eligible");
    const result=evaluateProjectMediaDeletionEligibility({...baseline,evidence:[{binding_status:"bound",target_valid:true,purpose_valid:true}],offer_state:"unknown",dependency_state:"unknown"});
    expect(result).toMatchObject({status:"offer_state_blocks",reason_codes:["offer_state_unknown"]});
    const dependencies=evaluateProjectMediaDeletionEligibility({...baseline,evidence:[{binding_status:"bound",target_valid:true,purpose_valid:true}],offer_state:"closed",dependency_state:"unknown"});
    expect(dependencies.status).toBe("dependency_state_unknown");
  });
});

describe("Lifecycle Persistenz und Read", () => {
  const sql=readFileSync("supabase/migrations/202608210002_project_media_lifecycle_eligibility.sql","utf8");
  it("erzwingt UUID/FK, Media-Identität, Cross-Project-Integrität, RLS und enge Grants",()=>{
    for(const token of ["create table public.project_media_lifecycle","id uuid","foreign key (project_id, project_media_id)","unique (project_media_id)","enable row level security","project media lifecycle select active admin","revoke all privileges","grant select","revision bigint","expected_revision"]) expect(sql).toContain(token);
    expect(sql).not.toMatch(/grant (delete|insert|update)|to anon/); expect(sql).not.toContain("on delete cascade");
  });
  it("initialisiert idempotent, erhält Revision bei No-change und härtet Ready-Soft-Delete",()=>{
    expect(sql).toContain("on conflict (project_media_id) do nothing");
    expect(sql).toContain("then return current_row"); expect(sql).toContain("revision=revision+1");
    expect(sql).toMatch(/soft_delete_project_media[\s\S]*eligibility_status='eligible'/);
  });
  it("enthält keine physische Löschung oder unerlaubte Capability",()=>{
    const production=[sql,readFileSync("lib/domain/project-media-lifecycle.ts","utf8"),readFileSync("lib/actions/project-media-lifecycle-read.ts","utf8"),readFileSync("lib/actions/project-media-lifecycle-read-service.ts","utf8")].join("\n");
    expect(production).not.toMatch(/storage\.from|\.remove\(|createSignedUrl|SUPABASE_SERVICE_ROLE|service_role|\.upload\(|fetch\(|openai|anthropic|whatsapp|\bvision\b|\bocr\b/i);
    expect(sql).not.toMatch(/delete from|drop table|tombstone/i);
  });
  it("liest nur admin-, auth- und projektbezogen ein strict DTO",async()=>{
    const source:ProjectMediaLifecycleReadDataSource={auth:{getUser:vi.fn().mockResolvedValue({data:{user:{id:"actor"}}})},getProfile:vi.fn().mockResolvedValue({data:{role:"admin"},error:null}),getActiveProject:vi.fn().mockResolvedValue({data:{id:PROJECT},error:null}),listLifecycle:vi.fn().mockResolvedValue({data:[{...lifecycle,eligibility_reason_codes:[]}],error:null})};
    expect(canManageProjectMediaLifecycle("admin")).toBe(true); expect(canManageProjectMediaLifecycle("reviewer")).toBe(false);
    const result=await getProjectMediaLifecycleWithDataSource(source,PROJECT); expect(result).toEqual({success:true,data:[lifecycle]}); expect(source.listLifecycle).toHaveBeenCalledWith(PROJECT);
    source.getProfile=vi.fn().mockResolvedValue({data:{role:"reviewer"},error:null}); expect(await getProjectMediaLifecycleWithDataSource(source,PROJECT)).toMatchObject({success:false,code:"not_authorized"});
  });
});
