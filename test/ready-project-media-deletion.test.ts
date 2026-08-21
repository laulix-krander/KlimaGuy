import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { canExecuteProjectMediaDeletion } from "@/lib/domain/permissions";
import { readyMediaDeletionInputSchema, READY_MEDIA_DELETION_FAILURE_DISPOSITIONS } from "@/lib/domain/project-media-lifecycle";
import { deleteReadyProjectMediaWithDataSource, type ReadyProjectMediaDeletionDataSource } from "@/lib/actions/ready-project-media-deletion-service";
import { deleteClaimedReadyProjectMediaObject } from "@/lib/server/ready-project-media-delete-adapter";

const PROJECT="11111111-1111-4111-8111-111111111111", MEDIA="22222222-2222-4222-8222-222222222222", ATTEMPT="33333333-3333-4333-8333-333333333333", TOKEN="44444444-4444-4444-8444-444444444444", FILE="55555555-5555-4555-8555-555555555555";
const input={project_id:PROJECT,project_media_id:MEDIA,expected_lifecycle_revision:7,deletion_reason:"admin_cleanup"};
const claim={attempt_id:ATTEMPT,project_media_id:MEDIA,project_id:PROJECT,claim_token:TOKEN,status:"storage_delete_pending",storage_bucket:"project-media" as const,storage_path:`projects/${PROJECT}/originals/${MEDIA}/${FILE}.jpg`,lease_expires_at:"2026-08-21T10:05:00.000Z"};
function source(overrides:Partial<ReadyProjectMediaDeletionDataSource>={}):ReadyProjectMediaDeletionDataSource{return {auth:{getUser:vi.fn().mockResolvedValue({data:{user:{id:"actor"}}})},getProfile:vi.fn().mockResolvedValue({data:{role:"admin"},error:null}),claim:vi.fn().mockResolvedValue({data:[claim],error:null}),remove:vi.fn().mockResolvedValue({result:"deleted"}),markStorageDeleted:vi.fn().mockResolvedValue({data:true,error:null}),complete:vi.fn().mockResolvedValue({data:[{attempt_id:ATTEMPT,status:"completed",completion_result:"deleted",lifecycle_revision:8}],error:null}),fail:vi.fn().mockResolvedValue({data:true,error:null}),...overrides};}

describe("recoverable Ready-Media deletion",()=>{
  it("accepts only the four client fields and is admin-only",()=>{
    expect(canExecuteProjectMediaDeletion("admin")).toBe(true); expect(canExecuteProjectMediaDeletion("reviewer")).toBe(false);
    expect(readyMediaDeletionInputSchema.safeParse(input).success).toBe(true);
    for(const key of ["storage_path","storage_bucket","claim_token","actor","force"]) expect(readyMediaDeletionInputSchema.safeParse({...input,[key]:"forbidden"}).success).toBe(false);
    expect(readyMediaDeletionInputSchema.safeParse({...input,deletion_reason:"customer_request"}).success).toBe(false);
  });
  it("passes only the claimed canonical locator to storage and transactionally completes",async()=>{
    const data=source(); const result=await deleteReadyProjectMediaWithDataSource(data,input);
    expect(result).toEqual({success:true,code:"deletion_completed",attempt_id:ATTEMPT,lifecycle_revision:8});
    expect(data.remove).toHaveBeenCalledWith({projectId:PROJECT,mediaId:MEDIA,bucket:"project-media",path:claim.storage_path});
    expect(data.markStorageDeleted).toHaveBeenCalledWith({attemptId:ATTEMPT,mediaId:MEDIA,projectId:PROJECT,token:TOKEN,storageResult:"deleted"});
    expect(data.complete).toHaveBeenCalledWith({attemptId:ATTEMPT,mediaId:MEDIA,projectId:PROJECT,token:TOKEN,storageResult:"deleted"});
  });
  it("persists retryable and terminal storage failures without completion",async()=>{
    for(const storage of [{result:"retryable_failure" as const,errorCode:"storage_delete_transient" as const},{result:"permanent_failure" as const,errorCode:"storage_delete_failed" as const}]){
      const data=source({remove:vi.fn().mockResolvedValue(storage)}); const result=await deleteReadyProjectMediaWithDataSource(data,input);
      expect(result.success).toBe(false); expect(data.fail).toHaveBeenCalledWith(expect.objectContaining({retryable:storage.result==="retryable_failure"})); expect(data.complete).not.toHaveBeenCalled();
    }
  });
  it("rejects a locator not canonically bound to project and media",async()=>{
    const remove=vi.fn().mockResolvedValue({data:null,error:null});
    const result=await deleteClaimedReadyProjectMediaObject({projectId:PROJECT,mediaId:MEDIA,bucket:"project-media",path:`projects/${PROJECT}/originals/99999999-9999-4999-8999-999999999999/${FILE}.jpg`},{storage:{from:()=>({remove})}});
    expect(result).toEqual({result:"permanent_failure",errorCode:"invalid_storage_locator"}); expect(remove).not.toHaveBeenCalled();
  });
  it("classifies every closed failure code",()=>expect(Object.keys(READY_MEDIA_DELETION_FAILURE_DISPOSITIONS)).toHaveLength(15));
});

describe("migration safety contract",()=>{
  const sql=readFileSync("supabase/migrations/202608210003_ready_media_deletion_tombstones.sql","utf8").toLowerCase();
  it("creates leased attempts, locator-free unique tombstones, execution state, RLS and narrow grants",()=>{
    for(const token of ["create table public.project_media_deletion_attempts","create table public.project_evidence_tombstones","lease_expires_at","deletion_execution_state","physical_state","unique index project_evidence_one_tombstone_idx","enable row level security","revoke all privileges","security definer set search_path = public, pg_temp","auth.uid()","for update"]) expect(sql).toContain(token);
    const tombstone=sql.slice(sql.indexOf("create table public.project_evidence_tombstones"),sql.indexOf("alter table public.project_media_deletion_attempts enable"));
    expect(tombstone).not.toMatch(/storage_path|storage_bucket|signed|filename|caption|email|phone|hash|exif/);
    expect(sql).not.toMatch(/on delete cascade|delete from public\.project_media|delete from public\.project_evidence/);
    expect(sql).not.toMatch(/grant (insert|update|delete).*authenticated/);
  });
  it("revalidates lifecycle CAS, hold, closed project, evidence and exact ready media in the claim",()=>{
    const claimSql=sql.slice(sql.indexOf("create function public.claim_ready_project_media_deletion"),sql.indexOf("create function public.complete_ready_project_media_deletion"));
    for(const token of ["lc.revision <> target_expected_revision","p.status <> 'closed'","pm.upload_status <> 'ready'","lc.retention_state <> 'deletion_eligible'","lc.eligibility_status <> 'eligible'","lc.hold_status <> 'none'","from public.project_evidence","project_media_deletion_one_active_idx"]) expect(sql).toContain(token);
    expect(claimSql).not.toContain("delete from");
  });
  it("completes all evidence tombstones and leaves both authoritative rows under restrict FKs",()=>{
    expect(sql).toMatch(/insert into public\.project_evidence_tombstones[\s\S]*select e\.id[\s\S]*on conflict \(evidence_id\) do nothing/);
    expect(sql).toContain("deletion_attempt_media_project_fkey"); expect(sql).toContain("evidence_tombstone_evidence_fkey");
    for(const event of ["ready_media_deletion_claimed","ready_media_storage_deleted","ready_media_deletion_completed","ready_media_deletion_failed"]) expect(sql).toContain(event);
  });
});
