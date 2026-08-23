-- AP-15-05-03-03-03-04-03: consume existing authorities to unlock only fully authoritative Evidence-bound media.
alter table public.project_media_lifecycle
 add column eligibility_projection_version text,
 add column eligibility_projection_revision bigint;
alter table public.project_media_lifecycle add constraint project_media_lifecycle_projection_snapshot_check check(
 (eligibility_projection_version is null and eligibility_projection_revision is null) or
 (eligibility_projection_version='media_dependency_projection_v1' and eligibility_projection_revision>=0));
alter table public.project_media_lifecycle drop constraint project_media_lifecycle_reasons_check;
alter table public.project_media_lifecycle add constraint project_media_lifecycle_reasons_check check(eligibility_reason_codes <@ array[
 'media_not_ready','media_failed','media_pending','media_soft_deleted','lifecycle_missing','retention_policy_missing','retention_not_completed','project_active','offer_state_unknown','offer_open','offer_preparation_open','evidence_dependency_open','observation_dependency_unknown','proposal_dependency_unknown','review_dependency_unknown','correction_dependency_unknown','legal_or_operational_hold','cross_project_mismatch','unsupported_media_state',
 'project_not_terminal','offer_authority_unknown','execution_active','execution_authority_unknown','correction_open','dependency_projection_missing','dependency_projection_incomplete','dependency_projection_drifted','dependency_projection_rebuild_required','missing_authorities','open_dependencies','media_not_present','stale_lifecycle_revision','stale_projection','legacy_authority_unknown','delete_attempt_conflict'
]::text[]);

-- The function is a gate, not an authority. Callers lock Project, Media and Lifecycle first;
-- this function locks and revalidates the projection and each existing source authority.
create function public.final_evidence_bound_media_delete_gate(target_project_id uuid,target_media_id uuid)
returns text[] language plpgsql security definer set search_path=public,pg_temp as $$
declare ps public.project_media_dependency_projection_state%rowtype; o public.project_offers%rowtype; e public.project_executions%rowtype; p public.projects%rowtype; reasons text[]:=array[]::text[];
begin
 select * into p from public.projects where id=target_project_id and deleted_at is null for update;
 select * into ps from public.project_media_dependency_projection_state where project_id=target_project_id and project_media_id=target_media_id for update;
 if not found then return array['dependency_projection_missing']; end if;
 if ps.projection_version<>'media_dependency_projection_v1' then reasons:=reasons||'stale_projection'; end if;
 if ps.completeness_status='incomplete' then reasons:=reasons||'dependency_projection_incomplete';
 elsif ps.completeness_status='drifted' or ps.drift_detected then reasons:=reasons||'dependency_projection_drifted';
 elsif ps.completeness_status='rebuild_required' then reasons:=reasons||'dependency_projection_rebuild_required'; end if;
 if cardinality(ps.missing_authority_types)>0 then reasons:=reasons||'missing_authorities'; end if;
 perform 1 from public.project_media_dependencies where project_id=target_project_id and project_media_id=target_media_id for update;
 if exists(select 1 from public.project_media_dependencies where project_id=target_project_id and project_media_id=target_media_id and status='open') then reasons:=reasons||'open_dependencies'; end if;
 perform 1 from public.project_knowledge_corrections c join public.project_media_dependencies d on d.correction_id=c.correction_id where d.project_id=target_project_id and d.project_media_id=target_media_id for update of c;
 if exists(select 1 from public.project_knowledge_corrections c join public.project_media_dependencies d on d.correction_id=c.correction_id where d.project_id=target_project_id and d.project_media_id=target_media_id and c.status in ('pending','stale','failed')) then reasons:=reasons||'correction_open'; end if;
 select * into o from public.project_offers where project_id=target_project_id and status<>'superseded' for update;
 if not found then return reasons||array['offer_authority_unknown','legacy_authority_unknown']; end if;
 if o.status in ('draft','created','sent') then reasons:=reasons||'offer_open';
 elsif o.status='rejected' then
   if p.status<>'closed' or exists(select 1 from public.project_executions where project_id=target_project_id) then reasons:=reasons||'project_not_terminal'; end if;
 elsif o.status='accepted' then
   select * into e from public.project_executions where project_id=target_project_id and accepted_offer_id=o.id for update;
   if not found then reasons:=reasons||'execution_authority_unknown';
   elsif e.status in ('not_started','active') then reasons:=reasons||'execution_active';
   elsif e.status not in ('completed','cancelled') or p.status<>'closed' then reasons:=reasons||'project_not_terminal'; end if;
 else reasons:=reasons||'offer_authority_unknown'; end if;
 if p.status<>'closed' then reasons:=reasons||'project_not_terminal'; end if;
 return array(select distinct x from unnest(reasons) x order by x);
end $$;

create or replace function public.evaluate_project_media_deletion_eligibility(target_media_id uuid,target_project_id uuid,expected_revision bigint)
returns public.project_media_lifecycle language plpgsql security definer set search_path=public,pg_temp as $$
declare lc public.project_media_lifecycle; pm public.project_media; reasons text[]:=array[]::text[]; next_status text; ps public.project_media_dependency_projection_state%rowtype; event_name text;
begin
 if auth.uid() is null or public.current_app_role()<>'admin' then return null; end if;
 perform 1 from public.projects where id=target_project_id for update;
 select * into pm from public.project_media where id=target_media_id and project_id=target_project_id for update;
 select * into lc from public.project_media_lifecycle where project_media_id=target_media_id and project_id=target_project_id for update;
 if lc.id is null or pm.id is null then return null; end if;
 if lc.revision<>expected_revision then
   insert into public.audit_log(actor_id,entity_type,entity_id,action,metadata) values(auth.uid(),'project_media',target_media_id,'media_deletion_eligibility_blocked',jsonb_build_object('actor_id',auth.uid(),'project_id',target_project_id,'media_id',target_media_id,'lifecycle_revision',lc.revision,'projection_version',null,'projection_revision',null,'result','blocked','reason_codes',array['stale_lifecycle_revision'],'timestamp',statement_timestamp()));
   return null;
 elsif pm.deleted_at is not null then reasons:=array['media_soft_deleted'];
 elsif pm.upload_status<>'ready' then reasons:=array['media_not_ready'];
 elsif pm.physical_state<>'present' then reasons:=array['media_not_present'];
 elsif lc.policy_version is null then reasons:=array['retention_policy_missing'];
 elsif lc.retention_state<>'deletion_eligible' then reasons:=array['retention_not_completed'];
 elsif lc.hold_status<>'none' then reasons:=array['legal_or_operational_hold'];
 elsif lc.deletion_execution_state<>'idle' or exists(select 1 from public.project_media_deletion_attempts a where a.project_media_id=target_media_id and a.status in ('claimed','storage_delete_pending','storage_deleted','completion_pending')) then reasons:=array['delete_attempt_conflict'];
 elsif exists(select 1 from public.project_evidence pe where pe.project_id=target_project_id and pe.project_media_id=target_media_id and pe.binding_status='bound') then reasons:=public.final_evidence_bound_media_delete_gate(target_project_id,target_media_id);
 else select case when p.status='closed' then array[]::text[] else array['project_not_terminal'] end into reasons from public.projects p where p.id=target_project_id and p.deleted_at is null; end if;
 next_status:=case when cardinality(reasons)=0 then 'eligible' when reasons @> array['retention_policy_missing'] then 'policy_not_configured' when reasons && array['media_not_ready','media_not_present'] then 'media_not_ready' else 'blocked' end;
 select * into ps from public.project_media_dependency_projection_state where project_id=target_project_id and project_media_id=target_media_id;
 if lc.eligibility_status=next_status and lc.eligibility_reason_codes=reasons and lc.eligibility_projection_revision is not distinct from ps.source_revision then return lc; end if;
 update public.project_media_lifecycle set eligibility_status=next_status,eligibility_reason_codes=reasons,eligibility_projection_version=case when cardinality(reasons)=0 and ps.project_media_id is not null then ps.projection_version end,eligibility_projection_revision=case when cardinality(reasons)=0 and ps.project_media_id is not null then ps.source_revision end,revision=revision+1 where id=lc.id returning * into lc;
 event_name:=case when next_status='eligible' then 'media_deletion_eligibility_granted' else 'media_deletion_eligibility_blocked' end;
 insert into public.audit_log(actor_id,entity_type,entity_id,action,metadata) values(auth.uid(),'project_media',target_media_id,event_name,jsonb_build_object('actor_id',auth.uid(),'project_id',target_project_id,'media_id',target_media_id,'lifecycle_revision',lc.revision,'projection_version',ps.projection_version,'projection_revision',ps.source_revision,'result',next_status,'reason_codes',reasons,'timestamp',statement_timestamp()));
 return lc;
end $$;

create or replace function public.claim_ready_project_media_deletion(target_media_id uuid,target_project_id uuid,target_expected_revision bigint,target_deletion_reason text)
returns table(attempt_id uuid,project_media_id uuid,project_id uuid,claim_token uuid,status text,storage_bucket text,storage_path text,lease_expires_at timestamptz)
language plpgsql security definer set search_path=public,pg_temp as $$
declare pm public.project_media; lc public.project_media_lifecycle; p public.projects; ps public.project_media_dependency_projection_state; active_attempt public.project_media_deletion_attempts; new_attempt public.project_media_deletion_attempts; next_number integer; reasons text[]:=array[]::text[];
begin
 if auth.uid() is null or public.current_app_role()<>'admin' or target_deletion_reason not in ('retention_expired','project_closed','invalid_media','wrong_project','duplicate_transport','admin_cleanup') then return; end if;
 select * into p from public.projects where id=target_project_id for update; select * into pm from public.project_media where id=target_media_id and project_id=target_project_id for update; select * into lc from public.project_media_lifecycle where project_media_id=target_media_id and project_id=target_project_id for update;
 if lc.id is null or pm.id is null or lc.revision<>target_expected_revision then reasons:=array['stale_lifecycle_revision'];
 elsif p.deleted_at is not null or pm.upload_status<>'ready' or pm.deleted_at is not null or pm.physical_state<>'present' then reasons:=array['media_not_present'];
 elsif lc.retention_state<>'deletion_eligible' or lc.eligibility_status<>'eligible' then reasons:=array['retention_not_completed'];
 elsif lc.policy_version is null then reasons:=array['retention_policy_missing']; elsif lc.hold_status<>'none' then reasons:=array['legal_or_operational_hold']; elsif lc.deletion_execution_state<>'idle' then reasons:=array['delete_attempt_conflict'];
 elsif exists(select 1 from public.project_evidence pe where pe.project_id=target_project_id and pe.project_media_id=target_media_id and pe.binding_status='bound') then
   reasons:=public.final_evidence_bound_media_delete_gate(target_project_id,target_media_id); select * into ps from public.project_media_dependency_projection_state where project_id=target_project_id and project_media_id=target_media_id for update;
   if lc.eligibility_projection_version is distinct from ps.projection_version or lc.eligibility_projection_revision is distinct from ps.source_revision then reasons:=reasons||'stale_projection'; end if;
 elsif p.status<>'closed' then reasons:=array['project_not_terminal']; end if;
 if cardinality(reasons)>0 then insert into public.audit_log(actor_id,entity_type,entity_id,action,metadata) values(auth.uid(),'project_media',target_media_id,'media_deletion_claim_rejected_by_final_gate',jsonb_build_object('actor_id',auth.uid(),'project_id',target_project_id,'media_id',target_media_id,'lifecycle_revision',lc.revision,'projection_version',ps.projection_version,'projection_revision',ps.source_revision,'result','blocked','reason_codes',array(select distinct x from unnest(reasons) x order by x),'timestamp',statement_timestamp())); return; end if;
 select * into active_attempt from public.project_media_deletion_attempts a where a.project_media_id=target_media_id and a.status in ('claimed','storage_delete_pending','storage_deleted','completion_pending') order by a.requested_at desc limit 1 for update;
 if active_attempt.attempt_id is not null and active_attempt.lease_expires_at>=statement_timestamp() then return query select active_attempt.attempt_id,active_attempt.project_media_id,active_attempt.project_id,active_attempt.claim_token,active_attempt.status,pm.storage_bucket,pm.storage_path,active_attempt.lease_expires_at; return; end if;
 if active_attempt.attempt_id is not null then update public.project_media_deletion_attempts set status='retryable_failed',failure_code='storage_delete_failed',storage_result_category='unknown' where project_media_deletion_attempts.attempt_id=active_attempt.attempt_id; end if;
 select coalesce(max(a.attempt_number),0)+1 into next_number from public.project_media_deletion_attempts a where a.project_media_id=target_media_id;
 insert into public.project_media_deletion_attempts(project_id,project_media_id,expected_lifecycle_revision,attempt_number,deletion_reason,requested_by,lifecycle_policy_version,status) values(target_project_id,target_media_id,target_expected_revision,next_number,target_deletion_reason,auth.uid(),lc.policy_version,'storage_delete_pending') returning * into new_attempt;
 perform set_config('app.ready_media_completion','on',true); update public.project_media set physical_state='deletion_pending' where id=target_media_id; update public.project_media_lifecycle set deletion_execution_state='deletion_in_progress' where id=lc.id;
 insert into public.audit_log(actor_id,entity_type,entity_id,action,metadata) values(auth.uid(),'project_media',target_media_id,'ready_media_deletion_claimed',jsonb_build_object('project_id',target_project_id,'attempt_id',new_attempt.attempt_id,'revision_before',lc.revision,'revision_after',lc.revision,'deletion_reason',target_deletion_reason,'result_code','claimed','timestamp',statement_timestamp()));
 return query select new_attempt.attempt_id,new_attempt.project_media_id,new_attempt.project_id,new_attempt.claim_token,new_attempt.status,pm.storage_bucket,pm.storage_path,new_attempt.lease_expires_at;
end $$;

revoke all on function public.final_evidence_bound_media_delete_gate(uuid,uuid) from public,anon,authenticated;
revoke all on function public.evaluate_project_media_deletion_eligibility(uuid,uuid,bigint),public.claim_ready_project_media_deletion(uuid,uuid,bigint,text) from public,anon,authenticated;
grant execute on function public.evaluate_project_media_deletion_eligibility(uuid,uuid,bigint),public.claim_ready_project_media_deletion(uuid,uuid,bigint,text) to authenticated;
comment on function public.final_evidence_bound_media_delete_gate(uuid,uuid) is 'Consumes existing source authorities and projection under locks; never deletes media, Evidence, or Storage.';
