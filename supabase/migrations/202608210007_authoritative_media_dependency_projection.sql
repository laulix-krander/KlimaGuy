-- AP-15-05-03-03-03-02: reconstructable, locator-free delete dependency projection.
alter table public.project_evidence add constraint project_evidence_media_identity_key unique(project_id,id,project_media_id);
alter table public.evidence_observations add constraint evidence_observation_source_identity_key unique(project_id,evidence_id,id);
alter table public.evidence_claim_proposals add constraint evidence_claim_proposal_source_identity_key unique(project_id,evidence_id,id);

create table public.project_media_dependency_projection_state (
  project_id uuid not null,
  project_media_id uuid not null,
  projection_version text not null default 'media_dependency_projection_v1' check(projection_version='media_dependency_projection_v1'),
  completeness_status text not null default 'rebuild_required' check(completeness_status in ('complete','incomplete','drifted','rebuild_required')),
  supported_authority_types text[] not null default array['evidence_interpretation','observation_followup','claim_proposal_review','claim_apply']::text[] check(supported_authority_types=array['evidence_interpretation','observation_followup','claim_proposal_review','claim_apply']::text[]),
  missing_authority_types text[] not null default array['correction','offer','execution']::text[] check(missing_authority_types=array['correction','offer','execution']::text[]),
  source_revision bigint not null default 0 check(source_revision>=0),
  drift_detected boolean not null default false,
  last_rebuilt_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  primary key(project_id,project_media_id),
  foreign key(project_id,project_media_id) references public.project_media(project_id,id) on delete restrict
);

create table public.project_media_dependencies (
  id uuid primary key default gen_random_uuid(), project_id uuid not null, project_media_id uuid not null, evidence_id uuid not null,
  dependency_type text not null check(dependency_type in ('evidence_interpretation','observation_followup','claim_proposal_review','claim_apply')),
  source_record_kind text not null check(source_record_kind in ('interpretation_run','observation','claim_proposal')),
  source_record_id uuid not null, source_revision bigint not null check(source_revision>0),
  interpretation_run_id uuid, observation_id uuid, claim_proposal_id uuid,
  status text not null check(status in ('open','resolved','invalidated')),
  reason_code text check(reason_code in ('interpretation_pending','interpretation_retry_required','observation_followup_pending','proposal_review_pending','approved_apply_pending','claim_apply_retry_required')),
  projection_version text not null default 'media_dependency_projection_v1' check(projection_version='media_dependency_projection_v1'),
  opened_at timestamptz not null, resolved_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  foreign key(project_id,evidence_id,project_media_id) references public.project_evidence(project_id,id,project_media_id) on delete restrict,
  foreign key(project_id,evidence_id,interpretation_run_id) references public.evidence_interpretation_runs(project_id,evidence_id,id) on delete restrict,
  foreign key(project_id,evidence_id,observation_id) references public.evidence_observations(project_id,evidence_id,id) on delete restrict,
  foreign key(project_id,evidence_id,claim_proposal_id) references public.evidence_claim_proposals(project_id,evidence_id,id) on delete restrict,
  constraint project_media_dependency_typed_source check(
    (source_record_kind='interpretation_run' and source_record_id=interpretation_run_id and interpretation_run_id is not null and observation_id is null and claim_proposal_id is null) or
    (source_record_kind='observation' and source_record_id=observation_id and observation_id is not null and interpretation_run_id is null and claim_proposal_id is null) or
    (source_record_kind='claim_proposal' and source_record_id=claim_proposal_id and claim_proposal_id is not null and interpretation_run_id is null and observation_id is null)
  ),
  constraint project_media_dependency_resolution check((status='open' and resolved_at is null) or (status in ('resolved','invalidated') and resolved_at is not null)),
  unique(project_media_id,dependency_type,source_record_kind,source_record_id,projection_version)
);
create index project_media_dependencies_gate_idx on public.project_media_dependencies(project_id,project_media_id,status);
create trigger project_media_dependencies_updated before update on public.project_media_dependencies for each row execute function public.set_updated_at();
create trigger project_media_dependency_state_updated before update on public.project_media_dependency_projection_state for each row execute function public.set_updated_at();

create or replace function public.mark_media_dependency_projection_dirty() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare pid uuid; eid uuid; mid uuid;
begin
 pid:=coalesce(new.project_id,old.project_id); eid:=coalesce(new.evidence_id,old.evidence_id);
 select project_media_id into mid from public.project_evidence where project_id=pid and id=eid;
 if mid is not null then
   insert into public.project_media_dependency_projection_state(project_id,project_media_id,completeness_status,source_revision)
   values(pid,mid,'rebuild_required',1) on conflict(project_id,project_media_id) do update set completeness_status='rebuild_required',drift_detected=false,source_revision=project_media_dependency_projection_state.source_revision+1;
   insert into public.audit_log(actor_id,entity_type,entity_id,action,metadata) values(auth.uid(),'project_media_dependency_projection',mid,'media_dependency_projection_marked_incomplete',jsonb_build_object('actor_id',auth.uid(),'project_id',pid,'media_id',mid,'projection_version','media_dependency_projection_v1','open_dependency_count',(select count(*) from public.project_media_dependencies where project_media_id=mid and status='open'),'result','rebuild_required','timestamp',statement_timestamp()));
 end if;
 return coalesce(new,old);
end $$;
create trigger interpretation_projection_dirty after insert or update or delete on public.evidence_interpretation_runs for each row execute function public.mark_media_dependency_projection_dirty();
create trigger observation_projection_dirty after insert or update or delete on public.evidence_observations for each row execute function public.mark_media_dependency_projection_dirty();
create trigger proposal_projection_dirty after insert or update or delete on public.evidence_claim_proposals for each row execute function public.mark_media_dependency_projection_dirty();
create or replace function public.mark_transition_media_dependency_projection_dirty() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare pid uuid; eid uuid; mid uuid;
begin
 pid:=coalesce(new.project_id,old.project_id);
 select p.evidence_id into eid from public.evidence_claim_proposals p where p.id=coalesce(new.proposal_id,old.proposal_id);
 select project_media_id into mid from public.project_evidence where project_id=pid and id=eid;
 if mid is not null then
   insert into public.project_media_dependency_projection_state(project_id,project_media_id,completeness_status,source_revision)
   values(pid,mid,'rebuild_required',1) on conflict(project_id,project_media_id) do update set completeness_status='rebuild_required',drift_detected=false,source_revision=project_media_dependency_projection_state.source_revision+1;
   insert into public.audit_log(actor_id,entity_type,entity_id,action,metadata) values(auth.uid(),'project_media_dependency_projection',mid,'media_dependency_projection_marked_incomplete',jsonb_build_object('actor_id',auth.uid(),'project_id',pid,'media_id',mid,'projection_version','media_dependency_projection_v1','open_dependency_count',(select count(*) from public.project_media_dependencies where project_media_id=mid and status='open'),'result','rebuild_required','timestamp',statement_timestamp()));
 end if;
 return coalesce(new,old);
end $$;
create trigger transition_projection_dirty after insert or update or delete on public.project_knowledge_state_transitions for each row execute function public.mark_transition_media_dependency_projection_dirty();

create or replace function public.rebuild_project_media_dependencies(target_project_id uuid,target_project_media_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare m public.project_media%rowtype; lc public.project_media_lifecycle%rowtype; open_count bigint; rebuilt_at timestamptz:=statement_timestamp();
begin
 if auth.uid() is null or public.current_app_role()<>'admin' then raise exception 'not_authorized'; end if;
 select * into m from public.project_media where project_id=target_project_id and id=target_project_media_id for update;
 if not found then raise exception 'media_unavailable'; end if;
 select * into lc from public.project_media_lifecycle where project_id=m.project_id and project_media_id=m.id for update;
 if lc.deletion_execution_state<>'idle' or m.physical_state<>'present' or m.deleted_at is not null then raise exception 'source_media_unavailable'; end if;
 insert into public.project_media_dependency_projection_state(project_id,project_media_id) values(m.project_id,m.id) on conflict do nothing;
 delete from public.project_media_dependencies where project_id=m.project_id and project_media_id=m.id;
 insert into public.project_media_dependencies(project_id,project_media_id,evidence_id,dependency_type,source_record_kind,source_record_id,source_revision,interpretation_run_id,status,reason_code,opened_at,resolved_at)
 select r.project_id,e.project_media_id,r.evidence_id,'evidence_interpretation','interpretation_run',r.id,r.revision,r.id,
 case when r.status in ('pending','in_progress','failed') then 'open' when r.status='invalidated' then 'invalidated' else 'resolved' end,
 case when r.status in ('pending','in_progress') then 'interpretation_pending' when r.status='failed' then 'interpretation_retry_required' end,
 r.started_at,case when r.status in ('pending','in_progress','failed') then null else coalesce(r.completed_at,rebuilt_at) end
 from public.evidence_interpretation_runs r join public.project_evidence e on (e.project_id,e.id)=(r.project_id,r.evidence_id) where e.project_media_id=m.id;
 insert into public.project_media_dependencies(project_id,project_media_id,evidence_id,dependency_type,source_record_kind,source_record_id,source_revision,observation_id,status,reason_code,opened_at,resolved_at)
 select o.project_id,e.project_media_id,o.evidence_id,'observation_followup','observation',o.id,o.revision,o.id,
 case when o.status='invalidated' then 'invalidated' when o.observation_type not like 'image_%' and o.value_text='visible' and o.evidence_quality='sufficient_for_observation' and o.interpretation_status='observed' and p.id is null then 'open' else 'resolved' end,
 case when o.status='recorded' and o.observation_type not like 'image_%' and o.value_text='visible' and o.evidence_quality='sufficient_for_observation' and o.interpretation_status='observed' and p.id is null then 'observation_followup_pending' end,
 o.observed_at,case when o.status='recorded' and o.observation_type not like 'image_%' and o.value_text='visible' and o.evidence_quality='sufficient_for_observation' and o.interpretation_status='observed' and p.id is null then null else coalesce(o.invalidated_at,rebuilt_at) end
 from public.evidence_observations o join public.project_evidence e on (e.project_id,e.id)=(o.project_id,o.evidence_id) left join public.evidence_claim_proposals p on p.observation_id=o.id where e.project_media_id=m.id;
 insert into public.project_media_dependencies(project_id,project_media_id,evidence_id,dependency_type,source_record_kind,source_record_id,source_revision,claim_proposal_id,status,reason_code,opened_at,resolved_at)
 select p.project_id,e.project_media_id,p.evidence_id,'claim_proposal_review','claim_proposal',p.id,p.revision,p.id,
 case when p.status='superseded' then 'invalidated' when p.status in ('pending_review','approved_apply_pending','conflict','stale') then 'open' else 'resolved' end,
 case when p.status='approved_apply_pending' then 'approved_apply_pending' when p.status in ('pending_review','conflict','stale') then 'proposal_review_pending' end,
 p.created_at,case when p.status in ('pending_review','approved_apply_pending','conflict','stale') then null else rebuilt_at end
 from public.evidence_claim_proposals p join public.project_evidence e on (e.project_id,e.id)=(p.project_id,p.evidence_id) where e.project_media_id=m.id;
 insert into public.project_media_dependencies(project_id,project_media_id,evidence_id,dependency_type,source_record_kind,source_record_id,source_revision,claim_proposal_id,status,reason_code,opened_at,resolved_at)
 select p.project_id,e.project_media_id,p.evidence_id,'claim_apply','claim_proposal',p.id,p.revision,p.id,case when p.status='applied' and t.id is not null then 'resolved' else 'open' end,case when p.status='approved_apply_pending' then 'approved_apply_pending' else 'claim_apply_retry_required' end,p.created_at,case when p.status='applied' and t.id is not null then t.applied_at end
 from public.evidence_claim_proposals p join public.project_evidence e on (e.project_id,e.id)=(p.project_id,p.evidence_id) left join public.project_knowledge_state_transitions t on t.proposal_id=p.id where e.project_media_id=m.id and p.status in ('approved_apply_pending','applied');
 select count(*) into open_count from public.project_media_dependencies where project_id=m.project_id and project_media_id=m.id and status='open';
 update public.project_media_dependency_projection_state set completeness_status='complete',drift_detected=false,last_rebuilt_at=rebuilt_at where project_id=m.project_id and project_media_id=m.id;
 insert into public.audit_log(actor_id,entity_type,entity_id,action,metadata) values(auth.uid(),'project_media_dependency_projection',m.id,'media_dependency_projection_rebuilt',jsonb_build_object('actor_id',auth.uid(),'project_id',m.project_id,'media_id',m.id,'projection_version','media_dependency_projection_v1','open_dependency_count',open_count,'result','complete','timestamp',rebuilt_at));
 return jsonb_build_object('project_media_id',m.id,'projection_status','complete','open_dependencies',open_count,'missing_authorities',array['correction','offer','execution'],'reason_codes',array['correction_authority_missing','offer_authority_missing','execution_authority_missing'],'projection_version','media_dependency_projection_v1','updated_at',rebuilt_at);
end $$;

create or replace function public.detect_project_media_dependency_drift(target_project_id uuid,target_project_media_id uuid) returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare drift boolean; open_count bigint;
begin
 if auth.uid() is null or public.current_app_role()<>'admin' then raise exception 'not_authorized'; end if;
 perform 1 from public.project_media where project_id=target_project_id and id=target_project_media_id for update;
 select exists(
  select 1 from public.evidence_interpretation_runs r join public.project_evidence e on (e.project_id,e.id)=(r.project_id,r.evidence_id) left join public.project_media_dependencies d on d.interpretation_run_id=r.id and d.dependency_type='evidence_interpretation'
  where e.project_media_id=target_project_media_id and ((r.status in ('pending','in_progress','failed')) is distinct from (d.status='open') or d.source_revision<>r.revision or d.id is null)
 ) into drift;
 if drift then update public.project_media_dependency_projection_state set completeness_status='drifted',drift_detected=true where project_id=target_project_id and project_media_id=target_project_media_id;
  select count(*) into open_count from public.project_media_dependencies where project_media_id=target_project_media_id and status='open';
  insert into public.audit_log(actor_id,entity_type,entity_id,action,metadata) values(auth.uid(),'project_media_dependency_projection',target_project_media_id,'media_dependency_projection_drift_detected',jsonb_build_object('actor_id',auth.uid(),'project_id',target_project_id,'media_id',target_project_media_id,'projection_version','media_dependency_projection_v1','open_dependency_count',open_count,'result','drifted','timestamp',statement_timestamp()));
 end if; return drift;
end $$;

-- Existing authority rows are never treated as safe: deployment creates an explicit rebuild requirement.
insert into public.project_media_dependency_projection_state(project_id,project_media_id)
select distinct e.project_id,e.project_media_id from public.project_evidence e on conflict do nothing;

alter table public.project_media_dependencies enable row level security;
alter table public.project_media_dependency_projection_state enable row level security;
revoke all on public.project_media_dependencies,public.project_media_dependency_projection_state from public,anon,authenticated;
grant select on public.project_media_dependencies,public.project_media_dependency_projection_state to authenticated;
create policy "media dependency admin read" on public.project_media_dependencies for select to authenticated using(auth.uid() is not null and public.current_app_role()='admin' and exists(select 1 from public.projects p where p.id=project_id and p.deleted_at is null));
create policy "media dependency state admin read" on public.project_media_dependency_projection_state for select to authenticated using(auth.uid() is not null and public.current_app_role()='admin' and exists(select 1 from public.projects p where p.id=project_id and p.deleted_at is null));
revoke all on function public.rebuild_project_media_dependencies(uuid,uuid),public.detect_project_media_dependency_drift(uuid,uuid) from public,anon;
grant execute on function public.rebuild_project_media_dependencies(uuid,uuid),public.detect_project_media_dependency_drift(uuid,uuid) to authenticated;
comment on table public.project_media_dependencies is 'Reconstructable delete-gate projection; typed FKs preserve source authority and no locator data is stored.';
comment on table public.project_media_dependency_projection_state is 'Completeness and drift contract. Missing correction, offer and execution authorities remain fail-closed.';
