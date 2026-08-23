-- AP-15-05-03-03-03-04-02: minimal accepted-offer execution lifecycle; no ERP, scheduling, retention, or delete unlock.
create type public.project_execution_status as enum ('not_started','active','completed','cancelled');

alter table public.project_offers add constraint project_offers_id_project_unique unique(id,project_id);

create table public.project_executions (
 id uuid primary key default gen_random_uuid(),
 project_id uuid not null references public.projects(id) on delete restrict,
 accepted_offer_id uuid not null,
 status public.project_execution_status not null default 'not_started',
 revision integer not null default 1 check(revision > 0),
 created_by uuid not null references auth.users(id) on delete restrict,
 creation_command_key text not null check(length(creation_command_key) between 8 and 128),
 started_at timestamptz,
 completed_at timestamptz,
 cancelled_at timestamptz,
 created_at timestamptz not null default statement_timestamp(),
 updated_at timestamptz not null default statement_timestamp(),
 constraint project_executions_offer_project_fk foreign key(accepted_offer_id,project_id) references public.project_offers(id,project_id) on delete restrict,
 constraint project_executions_one_per_accepted_offer unique(accepted_offer_id),
 constraint project_executions_creation_identity unique(project_id,creation_command_key),
 constraint project_executions_lifecycle_timestamps check(
  (status='not_started' and started_at is null and completed_at is null and cancelled_at is null) or
  (status='active' and started_at is not null and completed_at is null and cancelled_at is null) or
  (status='completed' and started_at is not null and completed_at is not null and cancelled_at is null) or
  (status='cancelled' and completed_at is null and cancelled_at is not null))
);
create index project_executions_project on public.project_executions(project_id,created_at desc);
create trigger project_executions_updated before update on public.project_executions for each row execute function public.set_updated_at();

create table public.project_execution_commands (
 id uuid primary key default gen_random_uuid(),
 project_id uuid not null references public.projects(id) on delete restrict,
 execution_id uuid not null references public.project_executions(id) on delete restrict,
 command text not null check(command in ('start','complete','cancel')),
 idempotency_key text not null check(length(idempotency_key) between 8 and 128),
 result_revision integer not null check(result_revision > 0),
 actor_id uuid not null references auth.users(id) on delete restrict,
 created_at timestamptz not null default statement_timestamp(),
 unique(project_id,idempotency_key)
);

create function public.validate_project_execution_offer() returns trigger language plpgsql set search_path=public,pg_temp as $$
declare o public.project_offers%rowtype;
begin
 select * into o from public.project_offers where id=new.accepted_offer_id and project_id=new.project_id;
 if not found or o.status<>'accepted' or exists(select 1 from public.project_offers newer where newer.project_id=o.project_id and newer.offer_version>o.offer_version and newer.status<>'superseded') then raise exception 'execution_requires_current_accepted_offer'; end if;
 return new;
end $$;
create constraint trigger validate_project_execution_offer after insert or update on public.project_executions deferrable initially immediate for each row execute function public.validate_project_execution_offer();

create function public.guard_project_execution_lifecycle() returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
 if new.status is distinct from old.status and coalesce(current_setting('app.execution_authority_transition',true),'')<>'allowed' then raise exception 'execution_transition_requires_authority'; end if;
 if new.project_id<>old.project_id or new.accepted_offer_id<>old.accepted_offer_id or new.created_by<>old.created_by or new.creation_command_key<>old.creation_command_key then raise exception 'execution_identity_immutable'; end if;
 return new;
end $$;
create trigger project_execution_lifecycle_guard before update on public.project_executions for each row execute function public.guard_project_execution_lifecycle();

-- Acceptance is the only creation boundary. The trigger participates in the Offer RPC transaction, so failure rolls acceptance back.
create function public.create_execution_after_offer_acceptance() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare e public.project_executions%rowtype;
begin
 if new.status='accepted' and old.status='sent' then
  insert into public.project_executions(project_id,accepted_offer_id,created_by,creation_command_key)
  values(new.project_id,new.id,auth.uid(),'offer-accept:'||new.id::text||':'||new.revision::text)
  on conflict(accepted_offer_id) do nothing returning * into e;
  if not found then select * into e from public.project_executions where accepted_offer_id=new.id; end if;
  if e.project_id<>new.project_id or e.status<>'not_started' then raise exception 'execution_creation_conflict'; end if;
  insert into public.audit_log(actor_id,entity_type,entity_id,action,metadata) values(auth.uid(),'project_execution',e.id,'project_execution_created',jsonb_build_object('actor_id',auth.uid(),'project_id',e.project_id,'execution_id',e.id,'offer_id',new.id,'previous_status',null,'resulting_status','not_started','revision',e.revision,'timestamp',e.created_at));
 end if;
 return new;
end $$;
create trigger create_execution_after_offer_acceptance after update of status on public.project_offers for each row execute function public.create_execution_after_offer_acceptance();

create function public.project_execution_dto(e public.project_executions) returns jsonb language sql immutable set search_path=public,pg_temp as $$
 select jsonb_build_object('id',e.id,'project_id',e.project_id,'accepted_offer_id',e.accepted_offer_id,'status',e.status,'revision',e.revision,'started_at',e.started_at,'completed_at',e.completed_at,'cancelled_at',e.cancelled_at,'created_at',e.created_at,'updated_at',e.updated_at)
$$;
create function public.assert_execution_admin() returns void language plpgsql security definer set search_path=public,pg_temp as $$ begin if auth.uid() is null or public.current_app_role()<>'admin' then raise exception 'unauthorized'; end if; end $$;

create function public.transition_project_execution(target_execution_id uuid,expected_revision integer,target_idempotency_key text,target_command text) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare e public.project_executions%rowtype; n public.project_executions%rowtype; o public.project_offers%rowtype; p public.projects%rowtype; cmd public.project_execution_commands%rowtype; next_status public.project_execution_status; event_name text; now_at timestamptz:=statement_timestamp();
begin
 perform public.assert_execution_admin(); if target_command not in ('start','complete','cancel') then raise exception 'invalid_command'; end if;
 select * into e from public.project_executions where id=target_execution_id; if not found then raise exception 'execution_not_found'; end if;
 select * into cmd from public.project_execution_commands where project_id=e.project_id and idempotency_key=target_idempotency_key;
 if found then if cmd.command<>target_command or cmd.execution_id<>target_execution_id then raise exception 'idempotency_conflict'; end if; select * into n from public.project_executions where id=cmd.execution_id; return public.project_execution_dto(n); end if;
 select * into p from public.projects where id=e.project_id and deleted_at is null for update;
 select * into o from public.project_offers where id=e.accepted_offer_id and project_id=e.project_id for update;
 select * into e from public.project_executions where id=target_execution_id for update;
 if e.revision<>expected_revision then raise exception 'stale_execution_revision'; end if;
 if o.status<>'accepted' or p.status<>'accepted' then raise exception 'inconsistent_execution_authority'; end if;
 if target_command='start' and e.status='not_started' then next_status:='active'; event_name:='project_execution_started';
 elsif target_command='complete' and e.status='active' then next_status:='completed'; event_name:='project_execution_completed';
 elsif target_command='cancel' and e.status in ('not_started','active') then next_status:='cancelled'; event_name:='project_execution_cancelled';
 else raise exception 'illegal_execution_transition'; end if;
 perform set_config('app.execution_authority_transition','allowed',true);
 update public.project_executions set status=next_status,revision=revision+1,
  started_at=case when next_status='active' then now_at else started_at end,
  completed_at=case when next_status='completed' then now_at else completed_at end,
  cancelled_at=case when next_status='cancelled' then now_at else cancelled_at end
 where id=e.id and revision=expected_revision returning * into n;
 if next_status in ('completed','cancelled') then
  perform set_config('app.execution_authority_transition','allowed',true); perform set_config('app.offer_authority_transition','allowed',true);
  update public.projects set status='closed' where id=p.id and status='accepted'; if not found then raise exception 'stale_project'; end if;
 end if;
 insert into public.project_execution_commands(project_id,execution_id,command,idempotency_key,result_revision,actor_id) values(e.project_id,e.id,target_command,target_idempotency_key,n.revision,auth.uid());
 perform public.mark_project_offer_projection_dirty(e.project_id);
 insert into public.audit_log(actor_id,entity_type,entity_id,action,metadata) values(auth.uid(),'project_execution',n.id,event_name,jsonb_build_object('actor_id',auth.uid(),'project_id',n.project_id,'execution_id',n.id,'offer_id',n.accepted_offer_id,'previous_status',e.status,'resulting_status',n.status,'revision',n.revision,'timestamp',now_at));
 return public.project_execution_dto(n);
end $$;
create function public.start_project_execution(target_execution_id uuid,expected_revision integer,target_idempotency_key text) returns jsonb language sql security definer set search_path=public,pg_temp as $$ select public.transition_project_execution(target_execution_id,expected_revision,target_idempotency_key,'start') $$;
create function public.complete_project_execution(target_execution_id uuid,expected_revision integer,target_idempotency_key text) returns jsonb language sql security definer set search_path=public,pg_temp as $$ select public.transition_project_execution(target_execution_id,expected_revision,target_idempotency_key,'complete') $$;
create function public.cancel_project_execution(target_execution_id uuid,expected_revision integer,target_idempotency_key text) returns jsonb language sql security definer set search_path=public,pg_temp as $$ select public.transition_project_execution(target_execution_id,expected_revision,target_idempotency_key,'cancel') $$;

-- Project closed cannot impersonate completion/cancellation.
create function public.guard_execution_project_close() returns trigger language plpgsql set search_path=public,pg_temp as $$
begin if old.status='accepted' and new.status='closed' and coalesce(current_setting('app.execution_authority_transition',true),'')<>'allowed' then raise exception 'project_close_requires_execution_authority'; end if; return new; end $$;
create trigger projects_execution_close_guard before update of status on public.projects for each row execute function public.guard_execution_project_close();

-- Projection V4: a source-specific FK, deterministic status mapping, and fail-closed aggregate consistency.
alter table public.project_media_dependencies drop constraint project_media_dependencies_dependency_type_check, drop constraint project_media_dependencies_source_record_kind_check, drop constraint project_media_dependency_typed_source;
alter table public.project_media_dependencies add column project_execution_id uuid references public.project_executions(id) on delete restrict;
alter table public.project_media_dependencies add constraint project_media_dependencies_dependency_type_check check(dependency_type in ('evidence_interpretation','observation_followup','claim_proposal_review','claim_apply','claim_correction','offer_preparation','offer_open','project_execution'));
alter table public.project_media_dependencies add constraint project_media_dependencies_source_record_kind_check check(source_record_kind in ('interpretation_run','observation','claim_proposal','knowledge_correction','project_offer','project_execution'));
alter table public.project_media_dependencies add constraint project_media_dependency_typed_source check(
 (source_record_kind='interpretation_run' and source_record_id=interpretation_run_id and interpretation_run_id is not null and observation_id is null and claim_proposal_id is null and correction_id is null and project_offer_id is null and project_execution_id is null) or
 (source_record_kind='observation' and source_record_id=observation_id and observation_id is not null and interpretation_run_id is null and claim_proposal_id is null and correction_id is null and project_offer_id is null and project_execution_id is null) or
 (source_record_kind='claim_proposal' and source_record_id=claim_proposal_id and claim_proposal_id is not null and interpretation_run_id is null and observation_id is null and correction_id is null and project_offer_id is null and project_execution_id is null) or
 (source_record_kind='knowledge_correction' and source_record_id=correction_id and correction_id is not null and interpretation_run_id is null and observation_id is null and claim_proposal_id is null and project_offer_id is null and project_execution_id is null) or
 (source_record_kind='project_offer' and source_record_id=project_offer_id and project_offer_id is not null and interpretation_run_id is null and observation_id is null and claim_proposal_id is null and correction_id is null and project_execution_id is null) or
 (source_record_kind='project_execution' and source_record_id=project_execution_id and project_execution_id is not null and interpretation_run_id is null and observation_id is null and claim_proposal_id is null and correction_id is null and project_offer_id is null));

alter table public.project_media_dependency_projection_state drop constraint project_media_dependency_projection_state_supported_authority_types_check, drop constraint project_media_dependency_projection_state_missing_authority_types_check;
alter table public.project_media_dependency_projection_state alter column supported_authority_types set default array['evidence_interpretation','observation_followup','claim_proposal_review','claim_apply','correction','offer','execution']::text[];
update public.project_media_dependency_projection_state set completeness_status='rebuild_required',supported_authority_types=array['evidence_interpretation','observation_followup','claim_proposal_review','claim_apply','correction','offer','execution'],missing_authority_types=array['offer','execution'];
alter table public.project_media_dependency_projection_state add constraint project_media_dependency_projection_state_supported_authority_types_check check(supported_authority_types=array['evidence_interpretation','observation_followup','claim_proposal_review','claim_apply','correction','offer','execution']::text[]), add constraint project_media_dependency_projection_state_missing_authority_types_check check(missing_authority_types in (array[]::text[],array['execution']::text[],array['offer','execution']::text[]));

alter function public.rebuild_project_media_dependencies(uuid,uuid) rename to rebuild_project_media_dependencies_without_executions;
create function public.rebuild_project_media_dependencies(target_project_id uuid,target_project_media_id uuid) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare base jsonb; o public.project_offers%rowtype; e public.project_executions%rowtype; p public.projects%rowtype; evidence_created timestamptz; missing text[]:=array[]::text[]; reasons text[]:=array[]::text[]; open_count bigint; rebuilt_at timestamptz:=statement_timestamp(); inconsistent boolean:=false;
begin
 base:=public.rebuild_project_media_dependencies_without_executions(target_project_id,target_project_media_id);
 select * into p from public.projects where id=target_project_id and deleted_at is null;
 select * into o from public.project_offers where project_id=target_project_id and status<>'superseded';
 select max(created_at) into evidence_created from public.project_evidence where project_id=target_project_id and project_media_id=target_project_media_id and status<>'invalidated';
 if o.id is null then missing:=array['offer','execution'];
 elsif o.status='rejected' then if p.status not in ('rejected','closed') or exists(select 1 from public.project_executions x where x.project_id=target_project_id) then inconsistent:=true; missing:=array['execution']; end if;
 elsif o.status='accepted' then
  select * into e from public.project_executions where accepted_offer_id=o.id;
  if not found or e.project_id<>o.project_id then missing:=array['execution']; inconsistent:=true;
  elsif (e.status in ('not_started','active') and p.status<>'accepted') or (e.status in ('completed','cancelled') and p.status<>'closed') or (e.status in ('completed','cancelled') and evidence_created>coalesce(e.completed_at,e.cancelled_at)) then missing:=array['execution']; inconsistent:=true;
  else
   insert into public.project_media_dependencies(project_id,project_media_id,evidence_id,dependency_type,source_record_kind,source_record_id,source_revision,project_execution_id,status,reason_code,opened_at,resolved_at)
   select pe.project_id,pe.project_media_id,pe.id,'project_execution','project_execution',e.id,e.revision,e.id,case when e.status in ('not_started','active') then 'open' else 'resolved' end,case when e.status in ('not_started','active') then 'project_execution_open' end,e.created_at,case when e.status in ('completed','cancelled') then coalesce(e.completed_at,e.cancelled_at) end
   from public.project_evidence pe where pe.project_id=target_project_id and pe.project_media_id=target_project_media_id and pe.status<>'invalidated'
   on conflict(project_media_id,dependency_type,source_record_kind,source_record_id,projection_version) do update set source_revision=excluded.source_revision,status=excluded.status,reason_code=excluded.reason_code,resolved_at=excluded.resolved_at,updated_at=statement_timestamp();
  end if;
 else missing:=array['execution']; end if;
 if inconsistent then reasons:=array['source_record_inconsistent','projection_incomplete']; end if;
 if missing @> array['offer'] then reasons:=reasons||'offer_authority_missing'; end if; if missing @> array['execution'] then reasons:=reasons||'execution_authority_missing'; end if;
 select count(*) into open_count from public.project_media_dependencies where project_id=target_project_id and project_media_id=target_project_media_id and status='open';
 update public.project_media_dependency_projection_state set supported_authority_types=array['evidence_interpretation','observation_followup','claim_proposal_review','claim_apply','correction','offer','execution'],missing_authority_types=missing,completeness_status=case when inconsistent then 'incomplete' else 'complete' end,last_rebuilt_at=rebuilt_at where project_id=target_project_id and project_media_id=target_project_media_id;
 return jsonb_build_object('project_media_id',target_project_media_id,'projection_status',case when inconsistent then 'incomplete' else 'complete' end,'open_dependencies',open_count,'missing_authorities',missing,'reason_codes',reasons,'projection_version','media_dependency_projection_v1','updated_at',rebuilt_at);
end $$;

alter table public.project_executions enable row level security; alter table public.project_execution_commands enable row level security;
revoke all on public.project_executions,public.project_execution_commands from public,anon,authenticated; grant select on public.project_executions to authenticated;
create policy "project executions scoped staff read" on public.project_executions for select to authenticated using(auth.uid() is not null and public.current_app_role() in ('admin','reviewer') and exists(select 1 from public.projects p where p.id=project_id and p.deleted_at is null));
revoke all on function public.start_project_execution(uuid,integer,text),public.complete_project_execution(uuid,integer,text),public.cancel_project_execution(uuid,integer,text),public.transition_project_execution(uuid,integer,text,text),public.assert_execution_admin(),public.project_execution_dto(public.project_executions),public.validate_project_execution_offer(),public.create_execution_after_offer_acceptance(),public.guard_project_execution_lifecycle(),public.guard_execution_project_close(),public.rebuild_project_media_dependencies_without_executions(uuid,uuid) from public,anon,authenticated;
grant execute on function public.start_project_execution(uuid,integer,text),public.complete_project_execution(uuid,integer,text),public.cancel_project_execution(uuid,integer,text),public.rebuild_project_media_dependencies(uuid,uuid) to authenticated;
comment on table public.project_executions is 'Minimal persistent lifecycle of work arising from one accepted Offer; not a work order, schedule, invoice, material, staffing, retention, or delete authority.';
