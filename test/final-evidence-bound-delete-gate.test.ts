import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { evaluateProjectMediaDeletionEligibility, type ProjectMediaDeletionEligibilityInput, type ProjectMediaLifecycleDto } from "@/lib/domain/project-media-lifecycle";

const PROJECT="11111111-1111-4111-8111-111111111111", MEDIA="22222222-2222-4222-8222-222222222222";
const lifecycle={project_media_id:MEDIA,retention_state:"deletion_eligible",eligibility_status:"eligible",reason_codes:[],hold_status:"none",policy_version:"customer_photo_retention_v1",revision:7,updated_at:"2026-08-23T12:00:00.000Z"} satisfies ProjectMediaLifecycleDto;
const authority={projection:{version:"media_dependency_projection_v1",expected_version:"media_dependency_projection_v1",revision:12,expected_revision:12,completeness:"complete",drift_detected:false,missing_authorities:[],open_dependencies:0},offer:{status:"rejected"},execution:null,correction_open:false,active_delete_attempt:false} as const;
const baseline:ProjectMediaDeletionEligibilityInput={project_id:PROJECT,media:{project_id:PROJECT,upload_status:"ready",deleted_at:null},physical_state:"present",lifecycle,expected_lifecycle_revision:7,project_status:"closed",evidence:[{binding_status:"bound",target_valid:true,purpose_valid:true}],offer_state:"closed",dependency_state:"closed",final_authority:authority};

describe("final Evidence-bound deletion eligibility",()=>{
 it("allows authoritative no-order, completed and cancelled flows",()=>{
  expect(evaluateProjectMediaDeletionEligibility(baseline).status).toBe("eligible");
  for(const status of ["completed","cancelled"] as const) expect(evaluateProjectMediaDeletionEligibility({...baseline,final_authority:{...authority,offer:{status:"accepted"},execution:{status}}}).status).toBe("eligible");
 });
 it.each([
  [{final_authority:{...authority,offer:{status:"draft"}}},"offer_open"],
  [{final_authority:{...authority,offer:{status:"created"}}},"offer_open"],
  [{final_authority:{...authority,offer:{status:"sent"}}},"offer_open"],
  [{final_authority:{...authority,offer:{status:"accepted"},execution:{status:"active"}}},"execution_active"],
  [{final_authority:{...authority,correction_open:true}},"correction_open"],
  [{final_authority:{...authority,projection:{...authority.projection,missing_authorities:["offer"]}}},"missing_authorities"],
  [{final_authority:{...authority,projection:{...authority.projection,open_dependencies:1}}},"open_dependencies"],
  [{final_authority:{...authority,projection:null}},"dependency_projection_missing"],
  [{final_authority:{...authority,projection:{...authority.projection,completeness:"incomplete"}}},"dependency_projection_incomplete"],
  [{final_authority:{...authority,projection:{...authority.projection,completeness:"drifted"}}},"dependency_projection_drifted"],
  [{final_authority:{...authority,projection:{...authority.projection,completeness:"rebuild_required"}}},"dependency_projection_rebuild_required"],
  [{final_authority:{...authority,projection:{...authority.projection,revision:13}}},"stale_projection"],
  [{expected_lifecycle_revision:8},"stale_lifecycle_revision"],
  [{final_authority:{...authority,active_delete_attempt:true}},"delete_attempt_conflict"],
 ] as const)("fails closed %#",(change,reason)=>expect(evaluateProjectMediaDeletionEligibility({...baseline,...change} as ProjectMediaDeletionEligibilityInput).reason_codes).toContain(reason));
 it("keeps legacy Evidence closed and unbound behavior unchanged",()=>{
  const {final_authority:_,...legacy}=baseline;
  expect(evaluateProjectMediaDeletionEligibility(legacy).reason_codes).toContain("legacy_authority_unknown");
  expect(evaluateProjectMediaDeletionEligibility({...legacy,evidence:[]}).status).toBe("eligible");
 });
});

describe("atomic database final gate",()=>{
 const sql=readFileSync("supabase/migrations/202608230003_final_evidence_bound_delete_gate.sql","utf8").toLowerCase();
 it("revalidates projection and source authorities under locks for evaluation and claim",()=>{
  for(const token of ["final_evidence_bound_media_delete_gate","for update","missing_authority_types","status='open'","project_knowledge_corrections","project_offers","project_executions","eligibility_projection_revision","stale_projection","media_deletion_claim_rejected_by_final_gate"]) expect(sql).toContain(token);
  expect(sql.match(/final_evidence_bound_media_delete_gate\(target_project_id,target_media_id\)/g)).toHaveLength(2);
 });
 it("preserves the recoverable physical boundary and security",()=>{
  expect(sql).not.toMatch(/storage\.from|\.remove\(|delete from public\.project_media|delete from public\.project_evidence|service_role|signed url|retention.*interval/i);
  expect(sql).toContain("security definer set search_path=public,pg_temp"); expect(sql).toContain("auth.uid()");
  expect(sql).not.toMatch(/grant (insert|update|delete)/);
 });
});
