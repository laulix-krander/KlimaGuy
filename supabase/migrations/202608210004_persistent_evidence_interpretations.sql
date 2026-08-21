-- AP-15-05-03-03-01: locator-free workflow and typed observation authority.
alter table public.project_evidence add constraint project_evidence_project_identity_key unique (project_id, id);

create table public.evidence_interpretation_runs (
  id uuid primary key default gen_random_uuid(), project_id uuid not null, evidence_id uuid not null,
  revision bigint not null default 1 check (revision > 0),
  status text not null default 'pending' check (status in ('pending','in_progress','completed','insufficient_evidence','failed','invalidated')),
  source_actor_class text not null check (source_actor_class in ('admin','reviewer','ai')),
  interpretation_version text not null default 'synthetic_observation_v1' check (interpretation_version = 'synthetic_observation_v1'),
  started_at timestamptz not null default statement_timestamp(), completed_at timestamptz,
  result_code text check (result_code in ('observation_recorded','multiple_observations_recorded','no_observation','insufficient_evidence','invalid_evidence','target_mismatch','stale_context','persistence_failed','source_media_unavailable')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  constraint evidence_interpretation_evidence_fkey foreign key (project_id,evidence_id) references public.project_evidence(project_id,id) on delete restrict,
  constraint evidence_interpretation_identity_key unique (project_id,evidence_id,id),
  constraint evidence_interpretation_terminal_check check (
    (status in ('pending','in_progress') and completed_at is null and result_code is null) or
    (status = 'completed' and completed_at is not null and result_code in ('observation_recorded','multiple_observations_recorded','no_observation')) or
    (status = 'insufficient_evidence' and completed_at is not null and result_code = 'insufficient_evidence') or
    (status = 'failed' and completed_at is not null and result_code in ('invalid_evidence','target_mismatch','stale_context','persistence_failed','source_media_unavailable')) or
    (status = 'invalidated' and completed_at is not null)
  )
);
create unique index evidence_interpretation_one_active_idx on public.evidence_interpretation_runs(evidence_id,interpretation_version) where status in ('pending','in_progress');
create index evidence_interpretation_project_evidence_idx on public.evidence_interpretation_runs(project_id,evidence_id,created_at desc);
create trigger evidence_interpretation_runs_updated before update on public.evidence_interpretation_runs for each row execute function public.set_updated_at();

create table public.evidence_observations (
  id uuid primary key default gen_random_uuid(), project_id uuid not null, evidence_id uuid not null, interpretation_run_id uuid not null,
  observation_type text not null check (observation_type in ('room_overview_visible','wall_area_visible','window_visible','door_visible','indoor_area_visible','outdoor_area_visible','possible_indoor_mounting_area_visible','possible_outdoor_mounting_area_visible','line_route_context_visible','wall_penetration_context_visible','electrical_connection_visible','accessibility_context_visible','measurement_reference_visible','image_insufficient','image_obstructed','image_wrong_area')),
  value_kind text not null check (value_kind in ('visibility','evidence_condition')),
  value_text text check ((value_kind='visibility' and value_text in ('visible','not_visible')) or (value_kind='evidence_condition' and value_text is null)),
  evidence_quality text not null check (evidence_quality in ('sufficient_for_observation','partially_sufficient','insufficient','wrong_target','obstructed','ambiguous','invalid')),
  actor_class text not null check (actor_class in ('admin','reviewer','ai')),
  interpretation_status text not null check (interpretation_status in ('observed','insufficient','ambiguous','requires_review','rejected')),
  status text not null default 'recorded' check (status in ('recorded','invalidated')),
  observed_at timestamptz not null default statement_timestamp(), revision bigint not null default 1 check (revision > 0),
  supersedes_observation_id uuid references public.evidence_observations(id) on delete restrict, invalidated_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  constraint evidence_observation_evidence_fkey foreign key (project_id,evidence_id) references public.project_evidence(project_id,id) on delete restrict,
  constraint evidence_observation_run_fkey foreign key (project_id,evidence_id,interpretation_run_id) references public.evidence_interpretation_runs(project_id,evidence_id,id) on delete restrict,
  constraint evidence_observation_bad_value_check check ((observation_type like 'image_%') = (value_kind='evidence_condition')),
  constraint evidence_observation_invalidation_check check ((status='recorded' and invalidated_at is null) or (status='invalidated' and invalidated_at is not null))
);
create unique index evidence_observation_active_semantics_idx on public.evidence_observations(evidence_id,observation_type,value_kind,coalesce(value_text,'__null__')) where status='recorded';
create index evidence_observation_project_evidence_idx on public.evidence_observations(project_id,evidence_id,observed_at desc);
create index evidence_observation_run_idx on public.evidence_observations(interpretation_run_id);
create trigger evidence_observations_updated before update on public.evidence_observations for each row execute function public.set_updated_at();

alter table public.evidence_interpretation_runs enable row level security;
alter table public.evidence_observations enable row level security;
revoke all on public.evidence_interpretation_runs, public.evidence_observations from public, anon, authenticated;
grant select on public.evidence_interpretation_runs, public.evidence_observations to authenticated;
create policy "interpretation admin read" on public.evidence_interpretation_runs for select to authenticated using (auth.uid() is not null and public.current_app_role()='admin' and exists(select 1 from public.projects p where p.id=project_id and p.deleted_at is null));
create policy "observation admin read" on public.evidence_observations for select to authenticated using (auth.uid() is not null and public.current_app_role()='admin' and exists(select 1 from public.projects p where p.id=project_id and p.deleted_at is null));

create or replace function public.start_evidence_interpretation(target_project_id uuid,target_evidence_id uuid)
returns table(run_id uuid,evidence_id uuid,status text,result text,revision bigint,interpretation_version text,started_at timestamptz,completed_at timestamptz,updated_at timestamptz)
language plpgsql security definer set search_path=public,pg_temp as $$
declare e public.project_evidence%rowtype; m public.project_media%rowtype; lc public.project_media_lifecycle%rowtype; r public.evidence_interpretation_runs%rowtype;
begin
 if auth.uid() is null or public.current_app_role()<>'admin' then raise exception 'not_authorized'; end if;
 select * into e from public.project_evidence where project_id=target_project_id and id=target_evidence_id and binding_status='bound' for update;
 if not found then raise exception 'evidence_unavailable'; end if;
 select * into m from public.project_media where project_id=e.project_id and id=e.project_media_id for update;
 select * into lc from public.project_media_lifecycle where project_id=e.project_id and project_media_id=e.project_media_id for update;
 if m.upload_status<>'ready' or m.physical_state<>'present' or m.deleted_at is not null or lc.deletion_execution_state<>'idle' or exists(select 1 from public.project_evidence_tombstones t where t.evidence_id=e.id) then raise exception 'source_media_unavailable'; end if;
 select * into r from public.evidence_interpretation_runs x where x.evidence_id=e.id and x.interpretation_version='synthetic_observation_v1' and x.status in ('pending','in_progress') for update;
 if not found then insert into public.evidence_interpretation_runs(project_id,evidence_id,source_actor_class) values(e.project_id,e.id,'admin') returning * into r;
   insert into public.audit_log(actor_id,entity_type,entity_id,action,metadata) values(auth.uid(),'evidence_interpretation',r.id,'interpretation_started',jsonb_build_object('actor_id',auth.uid(),'project_id',e.project_id,'evidence_id',e.id,'run_id',r.id,'result_code',null,'revision',r.revision,'timestamp',r.started_at));
 end if;
 return query select r.id,r.evidence_id,r.status,r.result_code,r.revision,r.interpretation_version,r.started_at,r.completed_at,r.updated_at;
end $$;
revoke all on function public.start_evidence_interpretation(uuid,uuid) from public,anon; grant execute on function public.start_evidence_interpretation(uuid,uuid) to authenticated;

create or replace function public.record_evidence_observation(target_run_id uuid,target_observation_id uuid,target_type text,target_value_kind text,target_value_text text,target_quality text,target_interpretation_status text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.evidence_interpretation_runs%rowtype; e public.project_evidence%rowtype; m public.project_media%rowtype; lc public.project_media_lifecycle%rowtype; o public.evidence_observations%rowtype; observation_count bigint; target_allowed boolean;
begin
 if auth.uid() is null or public.current_app_role()<>'admin' then raise exception 'not_authorized'; end if;
 select * into r from public.evidence_interpretation_runs where id=target_run_id for update;
 if not found or r.status not in ('pending','in_progress') then raise exception 'stale_run'; end if;
 select * into e from public.project_evidence where project_id=r.project_id and id=r.evidence_id and binding_status='bound' for update;
 select * into m from public.project_media where project_id=e.project_id and id=e.project_media_id for update;
 select * into lc from public.project_media_lifecycle where project_id=e.project_id and project_media_id=e.project_media_id for update;
 if m.upload_status<>'ready' or m.physical_state<>'present' or m.deleted_at is not null or lc.deletion_execution_state<>'idle' or exists(select 1 from public.project_evidence_tombstones t where t.evidence_id=e.id) then raise exception 'source_media_unavailable'; end if;
 -- Database defence mirrors the canonical TypeScript target registry; callers use that registry directly.
 target_allowed := case e.evidence_target
  when 'room_overview' then target_type=any(array['room_overview_visible','wall_area_visible','window_visible','door_visible','measurement_reference_visible','image_insufficient','image_obstructed','image_wrong_area'])
  when 'indoor_area_overview' then target_type=any(array['indoor_area_visible','wall_area_visible','window_visible','door_visible','possible_indoor_mounting_area_visible','image_insufficient','image_obstructed','image_wrong_area'])
  when 'outdoor_area_overview' then target_type=any(array['outdoor_area_visible','possible_outdoor_mounting_area_visible','accessibility_context_visible','image_insufficient','image_obstructed','image_wrong_area'])
  when 'line_route_context' then target_type=any(array['line_route_context_visible','wall_penetration_context_visible','image_insufficient','image_obstructed','image_wrong_area'])
  when 'electrical_area' then target_type=any(array['electrical_connection_visible','image_insufficient','image_obstructed','image_wrong_area'])
  when 'accessibility_context' then target_type=any(array['accessibility_context_visible','image_insufficient','image_obstructed','image_wrong_area']) else false end;
 if not target_allowed then raise exception 'target_mismatch'; end if;
 select * into o from public.evidence_observations where evidence_id=e.id and observation_type=target_type and value_kind=target_value_kind and value_text is not distinct from target_value_text and status='recorded';
 if not found then
  insert into public.evidence_observations(id,project_id,evidence_id,interpretation_run_id,observation_type,value_kind,value_text,evidence_quality,actor_class,interpretation_status)
  values(target_observation_id,e.project_id,e.id,r.id,target_type,target_value_kind,target_value_text,target_quality,'admin',target_interpretation_status) returning * into o;
  insert into public.audit_log(actor_id,entity_type,entity_id,action,metadata) values(auth.uid(),'evidence_observation',o.id,'observation_recorded',jsonb_build_object('actor_id',auth.uid(),'project_id',e.project_id,'evidence_id',e.id,'run_id',r.id,'observation_id',o.id,'result_code','observation_recorded','revision',o.revision,'timestamp',o.observed_at));
 end if;
 select count(*) into observation_count from public.evidence_observations where interpretation_run_id=r.id and status='recorded';
 update public.evidence_interpretation_runs set status='in_progress',revision=revision+1 where id=r.id returning * into r;
 return jsonb_build_object('run',jsonb_build_object('run_id',r.id,'evidence_id',r.evidence_id,'status',r.status,'result',r.result_code,'revision',r.revision,'interpretation_version',r.interpretation_version,'started_at',r.started_at,'completed_at',r.completed_at,'updated_at',r.updated_at),'observation',jsonb_build_object('observation_id',o.id,'evidence_id',o.evidence_id,'type',o.observation_type,'value',jsonb_build_object('kind',o.value_kind,'value',o.value_text),'quality',o.evidence_quality,'actor_class',o.actor_class,'interpretation_status',o.interpretation_status,'status',o.status,'observed_at',o.observed_at,'revision',o.revision));
end $$;
revoke all on function public.record_evidence_observation(uuid,uuid,text,text,text,text,text) from public,anon; grant execute on function public.record_evidence_observation(uuid,uuid,text,text,text,text,text) to authenticated;

create or replace function public.finish_evidence_interpretation(target_run_id uuid,target_outcome text)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.evidence_interpretation_runs%rowtype; action_name text;
begin
 if auth.uid() is null or public.current_app_role()<>'admin' then raise exception 'not_authorized'; end if;
 select * into r from public.evidence_interpretation_runs where id=target_run_id for update;
 if not found or r.status not in ('pending','in_progress') then raise exception 'stale_run'; end if;
 if target_outcome in ('observation_recorded','multiple_observations_recorded') then
   if (select count(*) from public.evidence_observations where interpretation_run_id=r.id and status='recorded') <> case when target_outcome='observation_recorded' then 1 else 2 end
      and not (target_outcome='multiple_observations_recorded' and (select count(*) from public.evidence_observations where interpretation_run_id=r.id and status='recorded') > 2) then raise exception 'inconsistent_observation_count'; end if;
   update public.evidence_interpretation_runs set status='completed',result_code=target_outcome,completed_at=statement_timestamp(),revision=revision+1 where id=r.id returning * into r; action_name:='interpretation_completed';
 elsif exists(select 1 from public.evidence_observations where interpretation_run_id=r.id and status='recorded') then raise exception 'observations_exist';
 elsif target_outcome='insufficient_evidence' then update public.evidence_interpretation_runs set status='insufficient_evidence',result_code='insufficient_evidence',completed_at=statement_timestamp(),revision=revision+1 where id=r.id returning * into r; action_name:='interpretation_insufficient';
 elsif target_outcome='no_observation' then update public.evidence_interpretation_runs set status='completed',result_code='no_observation',completed_at=statement_timestamp(),revision=revision+1 where id=r.id returning * into r; action_name:='interpretation_completed';
 elsif target_outcome='persistence_failed' then update public.evidence_interpretation_runs set status='failed',result_code='persistence_failed',completed_at=statement_timestamp(),revision=revision+1 where id=r.id returning * into r; action_name:='interpretation_failed';
 else raise exception 'invalid_outcome'; end if;
 insert into public.audit_log(actor_id,entity_type,entity_id,action,metadata) values(auth.uid(),'evidence_interpretation',r.id,action_name,jsonb_build_object('actor_id',auth.uid(),'project_id',r.project_id,'evidence_id',r.evidence_id,'run_id',r.id,'result_code',r.result_code,'revision',r.revision,'timestamp',r.completed_at)); return true;
end $$;
revoke all on function public.finish_evidence_interpretation(uuid,text) from public,anon; grant execute on function public.finish_evidence_interpretation(uuid,text) to authenticated;

comment on table public.evidence_interpretation_runs is 'Locator-free persistent workflow authority; pending/in_progress is an open media dependency.';
comment on table public.evidence_observations is 'Typed persistent findings. Recorded findings remain fail-closed until later proposal/review authorities exist.';
