-- AP-15-05-03-03-03-03-01: project-scoped, locator-free correction authority.
alter table public.project_evidence drop constraint project_evidence_classified_binding_check;
alter table public.project_evidence add column revision bigint not null default 1 check(revision>0), add column invalidated_at timestamptz;
alter table public.project_evidence add constraint project_evidence_lifecycle_check check((binding_status='invalidated' and invalidated_at is not null) or (binding_status<>'invalidated' and invalidated_at is null));
alter table public.project_evidence drop constraint project_evidence_semantic_binding_key;
create unique index project_evidence_active_semantic_binding_key on public.project_evidence(project_id,project_media_id,evidence_target,purpose) where binding_status='bound';
alter table public.evidence_observations add constraint evidence_observation_project_identity_key unique(project_id,id), add constraint evidence_observation_no_self_supersession check(supersedes_observation_id is null or supersedes_observation_id<>id);
create unique index evidence_observation_one_successor_idx on public.evidence_observations(supersedes_observation_id) where supersedes_observation_id is not null and status='recorded';
alter table public.evidence_claim_proposals add constraint evidence_claim_proposal_project_identity_key unique(project_id,id);
alter table public.project_knowledge_claims add constraint project_knowledge_claim_project_identity_v2_key unique(project_id,claim_id);
alter table public.project_knowledge_state_transitions alter column proposal_id drop not null, alter column review_id drop not null;
alter table public.project_knowledge_state_transitions drop constraint project_knowledge_state_transitions_transition_type_check;
alter table public.project_knowledge_state_transitions add constraint project_knowledge_state_transitions_transition_type_check check(transition_type in ('claim_created','claim_retraction_proposed'));
alter table public.project_knowledge_state_transitions add column correction_id uuid, add column target_claim_id uuid;

create table public.project_knowledge_corrections(
 correction_id uuid primary key default gen_random_uuid(), project_id uuid not null,
 correction_type text not null check(correction_type in ('evidence_invalidation','observation_invalidation','observation_supersession','proposal_supersession','claim_retraction','claim_replacement')),
 action text not null check(action in ('invalidate','supersede','retract','replace')),
 status text not null default 'pending' check(status in ('pending','applied','rejected','no_change','stale','failed')),
 reason_code text not null check(reason_code in ('wrong_project','wrong_target','wrong_evidence_binding','observation_incorrect','interpretation_error','reviewer_correction','duplicate_evidence','superseded_by_better_evidence','provenance_invalidated')),
 target_evidence_id uuid, target_observation_id uuid, target_proposal_id uuid, target_claim_id uuid,
 replacement_observation_id uuid, replacement_claim_id uuid,
 expected_target_revision bigint check(expected_target_revision>0), expected_state_version bigint check(expected_state_version>0), resulting_state_version bigint check(resulting_state_version>0),
 actor_id uuid not null, actor_class text not null check(actor_class='admin'), correction_rule_version text not null default 'correction_v1' check(correction_rule_version='correction_v1'),
 idempotency_key text not null check(length(idempotency_key) between 16 and 200), revision bigint not null default 1 check(revision>0),
 result_code text check(result_code in ('target_already_invalidated','correction_already_applied','stale_target_revision','stale_state','reviewer_protected','source_media_unavailable','replacement_not_valid','correction_conflict','persistence_failed','transition_already_applied')),
 created_at timestamptz not null default statement_timestamp(), applied_at timestamptz, updated_at timestamptz not null default now(),
 foreign key(project_id) references public.projects(id) on delete restrict,
 foreign key(project_id,target_evidence_id) references public.project_evidence(project_id,id) on delete restrict,
 foreign key(project_id,target_observation_id) references public.evidence_observations(project_id,id) on delete restrict,
 foreign key(project_id,target_proposal_id) references public.evidence_claim_proposals(project_id,id) on delete restrict,
 foreign key(project_id,target_claim_id) references public.project_knowledge_claims(project_id,claim_id) on delete restrict,
 foreign key(project_id,replacement_observation_id) references public.evidence_observations(project_id,id) on delete restrict,
 foreign key(project_id,replacement_claim_id) references public.project_knowledge_claims(project_id,claim_id) on delete restrict,
 constraint correction_idempotency_key unique(project_id,idempotency_key),
 constraint correction_target_shape check(
  (correction_type='evidence_invalidation' and action='invalidate' and target_evidence_id is not null and target_observation_id is null and target_proposal_id is null and target_claim_id is null and replacement_observation_id is null and replacement_claim_id is null) or
  (correction_type='observation_invalidation' and action='invalidate' and target_evidence_id is null and target_observation_id is not null and target_proposal_id is null and target_claim_id is null and replacement_observation_id is null and replacement_claim_id is null) or
  (correction_type='observation_supersession' and action='supersede' and target_observation_id is not null and replacement_observation_id is not null and target_evidence_id is null and target_proposal_id is null and target_claim_id is null and replacement_claim_id is null) or
  (correction_type='proposal_supersession' and action='supersede' and target_proposal_id is not null and target_evidence_id is null and target_observation_id is null and target_claim_id is null and replacement_observation_id is null and replacement_claim_id is null) or
  (correction_type='claim_retraction' and action='retract' and target_claim_id is not null and target_evidence_id is null and target_observation_id is null and target_proposal_id is null and replacement_observation_id is null and replacement_claim_id is null) or
  (correction_type='claim_replacement' and action='replace' and target_claim_id is not null and replacement_claim_id is not null and target_evidence_id is null and target_observation_id is null and target_proposal_id is null and replacement_observation_id is null)
 ),
 constraint correction_terminal_shape check((status='pending' and applied_at is null and resulting_state_version is null) or (status in ('applied','no_change') and applied_at is not null) or status in ('rejected','stale','failed'))
);
alter table public.project_knowledge_state_transitions add constraint knowledge_transition_correction_fkey foreign key(correction_id) references public.project_knowledge_corrections(correction_id) on delete restrict, add constraint knowledge_transition_target_claim_fkey foreign key(project_id,target_claim_id) references public.project_knowledge_claims(project_id,claim_id) on delete restrict;
create trigger project_knowledge_corrections_updated before update on public.project_knowledge_corrections for each row execute function public.set_updated_at();
create unique index one_open_claim_correction on public.project_knowledge_corrections(project_id,target_claim_id,action) where status='pending' and target_claim_id is not null;

create table public.project_knowledge_claim_retractions(
 correction_id uuid primary key, project_id uuid not null, claim_id uuid not null, transition_id uuid not null,
 state_version bigint not null check(state_version>1), retracted_at timestamptz not null default statement_timestamp(),
 foreign key(correction_id) references public.project_knowledge_corrections(correction_id) on delete restrict,
 foreign key(project_id,claim_id) references public.project_knowledge_claims(project_id,claim_id) on delete restrict,
 foreign key(transition_id) references public.project_knowledge_state_transitions(id) on delete restrict,
 unique(project_id,claim_id)
);

alter table public.project_knowledge_corrections enable row level security;
alter table public.project_knowledge_claim_retractions enable row level security;
revoke all on public.project_knowledge_corrections,public.project_knowledge_claim_retractions from public,anon,authenticated;
grant select on public.project_knowledge_corrections,public.project_knowledge_claim_retractions to authenticated;
create policy "knowledge correction admin read" on public.project_knowledge_corrections for select to authenticated using(auth.uid() is not null and public.current_app_role()='admin' and exists(select 1 from public.projects p where p.id=project_id and p.deleted_at is null));
create policy "knowledge retraction admin read" on public.project_knowledge_claim_retractions for select to authenticated using(auth.uid() is not null and public.current_app_role()='admin' and exists(select 1 from public.projects p where p.id=project_id and p.deleted_at is null));

create function public.invalidate_project_evidence(target_project_id uuid,target_evidence_id uuid,expected_revision bigint,target_reason_code text,target_idempotency_key text) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare e public.project_evidence%rowtype; c public.project_knowledge_corrections%rowtype;
begin
 if auth.uid() is null or public.current_app_role()<>'admin' then raise exception 'unauthorized'; end if;
 select * into c from public.project_knowledge_corrections where project_id=target_project_id and idempotency_key=target_idempotency_key; if found then return jsonb_build_object('correction_id',c.correction_id,'status',c.status,'revision',c.revision); end if;
 select * into e from public.project_evidence where project_id=target_project_id and id=target_evidence_id for update; if not found then raise exception 'target_not_found'; end if;
 insert into public.project_knowledge_corrections(project_id,correction_type,action,reason_code,target_evidence_id,expected_target_revision,actor_id,actor_class,idempotency_key) values(e.project_id,'evidence_invalidation','invalidate',target_reason_code,e.id,expected_revision,auth.uid(),'admin',target_idempotency_key) returning * into c;
 if e.binding_status='invalidated' then update public.project_knowledge_corrections set status='no_change',result_code='target_already_invalidated',applied_at=statement_timestamp() where correction_id=c.correction_id returning * into c;
 elsif e.revision<>expected_revision then update public.project_knowledge_corrections set status='stale',result_code='stale_target_revision' where correction_id=c.correction_id returning * into c;
 else update public.project_evidence set binding_status='invalidated',invalidated_at=statement_timestamp(),revision=revision+1 where id=e.id; update public.evidence_interpretation_runs set status='invalidated',completed_at=coalesce(completed_at,statement_timestamp()),revision=revision+1 where evidence_id=e.id and status in ('pending','in_progress'); update public.evidence_claim_proposals set status='superseded',revision=revision+1 where evidence_id=e.id and status in ('pending_review','approved_apply_pending'); update public.project_knowledge_corrections set status='applied',applied_at=statement_timestamp() where correction_id=c.correction_id returning * into c; insert into public.audit_log(actor_id,entity_type,entity_id,action,metadata) values(auth.uid(),'project_evidence',e.id,'evidence_invalidated',jsonb_build_object('actor_id',auth.uid(),'project_id',e.project_id,'evidence_id',e.id,'correction_id',c.correction_id,'reason_code',c.reason_code,'revision',e.revision+1,'timestamp',statement_timestamp())); end if;
 return jsonb_build_object('correction_id',c.correction_id,'status',c.status,'revision',c.revision);
end $$;

create function public.invalidate_evidence_observation(target_project_id uuid,target_observation_id uuid,expected_revision bigint,target_reason_code text,target_idempotency_key text) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare o public.evidence_observations%rowtype; c public.project_knowledge_corrections%rowtype;
begin
 if auth.uid() is null or public.current_app_role()<>'admin' then raise exception 'unauthorized'; end if; select * into c from public.project_knowledge_corrections where project_id=target_project_id and idempotency_key=target_idempotency_key; if found then return jsonb_build_object('correction_id',c.correction_id,'status',c.status,'revision',c.revision); end if;
 select * into o from public.evidence_observations where project_id=target_project_id and id=target_observation_id for update; if not found then raise exception 'target_not_found'; end if;
 insert into public.project_knowledge_corrections(project_id,correction_type,action,reason_code,target_observation_id,expected_target_revision,actor_id,actor_class,idempotency_key) values(o.project_id,'observation_invalidation','invalidate',target_reason_code,o.id,expected_revision,auth.uid(),'admin',target_idempotency_key) returning * into c;
 if o.status='invalidated' then update public.project_knowledge_corrections set status='no_change',result_code='target_already_invalidated',applied_at=statement_timestamp() where correction_id=c.correction_id returning * into c; elsif o.revision<>expected_revision then update public.project_knowledge_corrections set status='stale',result_code='stale_target_revision' where correction_id=c.correction_id returning * into c; else update public.evidence_observations set status='invalidated',invalidated_at=statement_timestamp(),revision=revision+1 where id=o.id; update public.evidence_claim_proposals set status='superseded',revision=revision+1 where observation_id=o.id and status in ('pending_review','approved_apply_pending'); update public.project_knowledge_corrections set status='applied',applied_at=statement_timestamp() where correction_id=c.correction_id returning * into c; insert into public.audit_log(actor_id,entity_type,entity_id,action,metadata) values(auth.uid(),'evidence_observation',o.id,'observation_invalidated',jsonb_build_object('actor_id',auth.uid(),'project_id',o.project_id,'evidence_id',o.evidence_id,'observation_id',o.id,'correction_id',c.correction_id,'reason_code',c.reason_code,'revision',o.revision+1,'timestamp',statement_timestamp())); end if; return jsonb_build_object('correction_id',c.correction_id,'status',c.status,'revision',c.revision);
end $$;

-- Replacement remains the existing reviewed claim_supersession_proposed path. Retraction is claim-less and append-only.
-- The application service reconstructs target identity; no property/value/strength is accepted from the client.
create function public.retract_project_knowledge_claim(target_project_id uuid,target_claim_id uuid,expected_state_version bigint,target_reason_code text,target_idempotency_key text) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare k public.project_knowledge_claims%rowtype; s public.project_knowledge_states%rowtype; c public.project_knowledge_corrections%rowtype; t public.project_knowledge_state_transitions%rowtype; transition_uuid uuid:=gen_random_uuid();
begin
 if auth.uid() is null or public.current_app_role()<>'admin' then raise exception 'unauthorized'; end if; select * into c from public.project_knowledge_corrections where project_id=target_project_id and idempotency_key=target_idempotency_key; if found then return jsonb_build_object('correction_id',c.correction_id,'status',c.status,'resulting_state_version',c.resulting_state_version); end if;
 select * into k from public.project_knowledge_claims where project_id=target_project_id and claim_id=target_claim_id for update; if not found then raise exception 'target_not_found'; end if; select * into s from public.project_knowledge_states where project_id=target_project_id for update;
 insert into public.project_knowledge_corrections(project_id,correction_type,action,reason_code,target_claim_id,expected_state_version,actor_id,actor_class,idempotency_key) values(target_project_id,'claim_retraction','retract',target_reason_code,k.claim_id,expected_state_version,auth.uid(),'admin',target_idempotency_key) returning * into c;
 if exists(select 1 from public.project_knowledge_claim_retractions where project_id=target_project_id and claim_id=k.claim_id) or exists(select 1 from public.project_knowledge_claims n where n.project_id=target_project_id and n.supersedes_claim_id=k.claim_id) then update public.project_knowledge_corrections set status='no_change',result_code='correction_already_applied',resulting_state_version=s.current_version,applied_at=statement_timestamp() where correction_id=c.correction_id returning * into c;
 elsif s.current_version<>expected_state_version then update public.project_knowledge_corrections set status='stale',result_code='stale_state' where correction_id=c.correction_id returning * into c;
 elsif exists(select 1 from public.project_knowledge_claim_evidence ce where ce.claim_id=k.claim_id and (ce.actor_class='reviewer' or ce.evidence_status='manually_corrected')) then update public.project_knowledge_corrections set status='rejected',result_code='reviewer_protected' where correction_id=c.correction_id returning * into c;
 else update public.project_knowledge_states set current_version=current_version+1 where project_id=target_project_id; insert into public.project_knowledge_state_transitions(id,knowledge_state_id,project_id,proposal_id,review_id,expected_state_version,resulting_state_version,transition_type,result_code,idempotency_key,actor_id,applied_at) values(transition_uuid,s.id,target_project_id,null,null,expected_state_version,expected_state_version+1,'claim_retraction_proposed','applied',target_idempotency_key,auth.uid(),statement_timestamp()) returning * into t; insert into public.project_knowledge_claim_retractions(correction_id,project_id,claim_id,transition_id,state_version) values(c.correction_id,target_project_id,k.claim_id,t.id,expected_state_version+1); update public.project_knowledge_corrections set status='applied',resulting_state_version=expected_state_version+1,applied_at=statement_timestamp() where correction_id=c.correction_id returning * into c; insert into public.audit_log(actor_id,entity_type,entity_id,action,metadata) values(auth.uid(),'project_knowledge_claim',k.claim_id,'knowledge_claim_retracted',jsonb_build_object('actor_id',auth.uid(),'project_id',target_project_id,'claim_id',k.claim_id,'correction_id',c.correction_id,'transition_id',t.id,'reason_code',c.reason_code,'version_before',expected_state_version,'version_after',expected_state_version+1,'timestamp',statement_timestamp())); end if; return jsonb_build_object('correction_id',c.correction_id,'status',c.status,'resulting_state_version',c.resulting_state_version);
end $$;

revoke all on function public.invalidate_project_evidence(uuid,uuid,bigint,text,text),public.invalidate_evidence_observation(uuid,uuid,bigint,text,text),public.retract_project_knowledge_claim(uuid,uuid,bigint,text,text) from public,anon;
grant execute on function public.invalidate_project_evidence(uuid,uuid,bigint,text,text),public.invalidate_evidence_observation(uuid,uuid,bigint,text,text),public.retract_project_knowledge_claim(uuid,uuid,bigint,text,text) to authenticated;

-- Projection V2 adds a source-specific correction FK. Offer/execution intentionally remain missing.
alter table public.project_media_dependencies drop constraint project_media_dependencies_dependency_type_check, drop constraint project_media_dependencies_source_record_kind_check, drop constraint project_media_dependency_typed_source;
alter table public.project_media_dependencies add column correction_id uuid;
alter table public.project_media_dependencies add constraint project_media_dependency_correction_fkey foreign key(correction_id) references public.project_knowledge_corrections(correction_id) on delete restrict;
alter table public.project_media_dependencies add constraint project_media_dependencies_dependency_type_check check(dependency_type in ('evidence_interpretation','observation_followup','claim_proposal_review','claim_apply','claim_correction'));
alter table public.project_media_dependencies add constraint project_media_dependencies_source_record_kind_check check(source_record_kind in ('interpretation_run','observation','claim_proposal','knowledge_correction'));
alter table public.project_media_dependencies add constraint project_media_dependency_typed_source check((source_record_kind='interpretation_run' and source_record_id=interpretation_run_id and interpretation_run_id is not null and observation_id is null and claim_proposal_id is null and correction_id is null) or (source_record_kind='observation' and source_record_id=observation_id and observation_id is not null and interpretation_run_id is null and claim_proposal_id is null and correction_id is null) or (source_record_kind='claim_proposal' and source_record_id=claim_proposal_id and claim_proposal_id is not null and interpretation_run_id is null and observation_id is null and correction_id is null) or (source_record_kind='knowledge_correction' and source_record_id=correction_id and correction_id is not null and interpretation_run_id is null and observation_id is null and claim_proposal_id is null));
alter table public.project_media_dependency_projection_state drop constraint project_media_dependency_projection_state_supported_authority_types_check, drop constraint project_media_dependency_projection_state_missing_authority_types_check;
alter table public.project_media_dependency_projection_state alter column supported_authority_types set default array['evidence_interpretation','observation_followup','claim_proposal_review','claim_apply','correction']::text[], alter column missing_authority_types set default array['offer','execution']::text[];
update public.project_media_dependency_projection_state set supported_authority_types=array['evidence_interpretation','observation_followup','claim_proposal_review','claim_apply','correction'],missing_authority_types=array['offer','execution'],completeness_status='rebuild_required';
alter table public.project_media_dependency_projection_state add constraint project_media_dependency_projection_state_supported_authority_types_check check(supported_authority_types=array['evidence_interpretation','observation_followup','claim_proposal_review','claim_apply','correction']::text[]), add constraint project_media_dependency_projection_state_missing_authority_types_check check(missing_authority_types=array['offer','execution']::text[]);

create function public.mark_correction_media_dependency_projection_dirty() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare mid uuid;
begin
 select e.project_media_id into mid from public.project_evidence e left join public.evidence_observations o on o.id=new.target_observation_id left join public.evidence_claim_proposals p on p.id=new.target_proposal_id left join public.project_knowledge_claim_evidence ce on ce.claim_id=new.target_claim_id where e.project_id=new.project_id and e.id=coalesce(new.target_evidence_id,o.evidence_id,p.evidence_id,ce.evidence_id) limit 1;
 if mid is not null then insert into public.project_media_dependency_projection_state(project_id,project_media_id,completeness_status,source_revision) values(new.project_id,mid,'rebuild_required',1) on conflict(project_id,project_media_id) do update set completeness_status='rebuild_required',source_revision=project_media_dependency_projection_state.source_revision+1; end if; return new;
end $$;
create trigger correction_projection_dirty after insert or update on public.project_knowledge_corrections for each row execute function public.mark_correction_media_dependency_projection_dirty();
comment on table public.project_knowledge_corrections is 'Project-scoped correction authority; typed targets only, no property/value, PII, payload, URL or storage locator.';
comment on table public.project_knowledge_claim_retractions is 'Append-only effective-claim retraction relation authorized by correction and transition CAS.';

-- Extend the canonical rebuild entry point without duplicating source derivation for earlier authorities.
alter function public.rebuild_project_media_dependencies(uuid,uuid) rename to rebuild_project_media_dependencies_without_corrections;
create function public.rebuild_project_media_dependencies(target_project_id uuid,target_project_media_id uuid) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare base jsonb; open_count bigint; rebuilt_at timestamptz:=statement_timestamp();
begin
 base:=public.rebuild_project_media_dependencies_without_corrections(target_project_id,target_project_media_id);
 insert into public.project_media_dependencies(project_id,project_media_id,evidence_id,dependency_type,source_record_kind,source_record_id,source_revision,correction_id,status,reason_code,opened_at,resolved_at)
 select c.project_id,e.project_media_id,e.id,'claim_correction','knowledge_correction',c.correction_id,c.revision,c.correction_id,
  case when c.status in ('pending','stale','failed') then 'open' else 'resolved' end,
  case when c.status='pending' then 'claim_correction_pending' when c.status in ('stale','failed') then 'claim_correction_retry_required' end,
  c.created_at,case when c.status in ('pending','stale','failed') then null else coalesce(c.applied_at,c.updated_at) end
 from public.project_knowledge_corrections c
 join public.project_knowledge_claim_evidence ce on ce.claim_id=coalesce(c.target_claim_id,c.replacement_claim_id)
 join public.project_evidence e on (e.project_id,e.id)=(ce.project_id,ce.evidence_id)
 where c.project_id=target_project_id and e.project_media_id=target_project_media_id
 on conflict(project_media_id,dependency_type,source_record_kind,source_record_id,projection_version) do update set source_revision=excluded.source_revision,status=excluded.status,reason_code=excluded.reason_code,resolved_at=excluded.resolved_at,updated_at=statement_timestamp();
 select count(*) into open_count from public.project_media_dependencies where project_id=target_project_id and project_media_id=target_project_media_id and status='open';
 update public.project_media_dependency_projection_state set supported_authority_types=array['evidence_interpretation','observation_followup','claim_proposal_review','claim_apply','correction'],missing_authority_types=array['offer','execution'],completeness_status='complete',last_rebuilt_at=rebuilt_at where project_id=target_project_id and project_media_id=target_project_media_id;
 return jsonb_build_object('project_media_id',target_project_media_id,'projection_status','complete','open_dependencies',open_count,'missing_authorities',array['offer','execution'],'reason_codes',array['offer_authority_missing','execution_authority_missing'],'projection_version','media_dependency_projection_v1','updated_at',rebuilt_at);
end $$;
revoke all on function public.rebuild_project_media_dependencies_without_corrections(uuid,uuid),public.rebuild_project_media_dependencies(uuid,uuid) from public,anon;
grant execute on function public.rebuild_project_media_dependencies(uuid,uuid) to authenticated;

create function public.supersede_evidence_observation(target_project_id uuid,target_observation_id uuid,replacement_observation_id uuid,expected_revision bigint,target_reason_code text,target_idempotency_key text) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare old_o public.evidence_observations%rowtype; new_o public.evidence_observations%rowtype; c public.project_knowledge_corrections%rowtype; cycle_found boolean;
begin
 if auth.uid() is null or public.current_app_role()<>'admin' then raise exception 'unauthorized'; end if;
 select * into c from public.project_knowledge_corrections where project_id=target_project_id and idempotency_key=target_idempotency_key; if found then return jsonb_build_object('correction_id',c.correction_id,'status',c.status); end if;
 select * into old_o from public.evidence_observations where project_id=target_project_id and id=target_observation_id for update; select * into new_o from public.evidence_observations where project_id=target_project_id and id=replacement_observation_id for update;
 if old_o.id is null or new_o.id is null then raise exception 'target_not_found'; end if;
 if old_o.id=new_o.id or old_o.evidence_id<>new_o.evidence_id or old_o.observation_type<>new_o.observation_type or new_o.status<>'recorded' or new_o.supersedes_observation_id is not null then raise exception 'correction_conflict'; end if;
 with recursive chain(id,supersedes_observation_id) as (select id,supersedes_observation_id from public.evidence_observations where id=old_o.id union all select o.id,o.supersedes_observation_id from public.evidence_observations o join chain x on o.id=x.supersedes_observation_id) select exists(select 1 from chain where id=new_o.id) into cycle_found;
 if cycle_found or exists(select 1 from public.evidence_observations where supersedes_observation_id=old_o.id and status='recorded') then raise exception 'correction_conflict'; end if;
 insert into public.project_knowledge_corrections(project_id,correction_type,action,reason_code,target_observation_id,replacement_observation_id,expected_target_revision,actor_id,actor_class,idempotency_key) values(target_project_id,'observation_supersession','supersede',target_reason_code,old_o.id,new_o.id,expected_revision,auth.uid(),'admin',target_idempotency_key) returning * into c;
 if old_o.revision<>expected_revision or old_o.status<>'recorded' then update public.project_knowledge_corrections set status='stale',result_code='stale_target_revision' where correction_id=c.correction_id returning * into c; else update public.evidence_observations set supersedes_observation_id=old_o.id where id=new_o.id; update public.evidence_claim_proposals set status='superseded',revision=revision+1 where observation_id=old_o.id and status in ('pending_review','approved_apply_pending'); update public.project_knowledge_corrections set status='applied',applied_at=statement_timestamp() where correction_id=c.correction_id returning * into c; insert into public.audit_log(actor_id,entity_type,entity_id,action,metadata) values(auth.uid(),'evidence_observation',new_o.id,'observation_superseded',jsonb_build_object('actor_id',auth.uid(),'project_id',target_project_id,'observation_id',new_o.id,'superseded_observation_id',old_o.id,'correction_id',c.correction_id,'reason_code',c.reason_code,'revision',new_o.revision,'timestamp',statement_timestamp())); end if; return jsonb_build_object('correction_id',c.correction_id,'status',c.status);
end $$;
revoke all on function public.supersede_evidence_observation(uuid,uuid,uuid,bigint,text,text) from public,anon;
grant execute on function public.supersede_evidence_observation(uuid,uuid,uuid,bigint,text,text) to authenticated;
