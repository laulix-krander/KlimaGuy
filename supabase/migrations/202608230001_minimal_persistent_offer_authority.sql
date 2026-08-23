-- AP-15-05-03-03-03-04-01: lifecycle authority only; no prices, PII, artifact, execution or storage coupling.
create type public.project_offer_status as enum ('draft','created','sent','accepted','rejected','superseded');

create table public.project_offers (
 id uuid primary key default gen_random_uuid(),
 project_id uuid not null references public.projects(id) on delete restrict,
 offer_version integer not null check (offer_version > 0),
 revision integer not null default 1 check (revision > 0),
 status public.project_offer_status not null default 'draft',
 supersedes_offer_id uuid references public.project_offers(id) on delete restrict,
 created_by uuid not null references auth.users(id) on delete restrict,
 created_at timestamptz not null default statement_timestamp(),
 offer_created_at timestamptz,
 sent_at timestamptz,
 accepted_at timestamptz,
 rejected_at timestamptz,
 updated_at timestamptz not null default statement_timestamp(),
 constraint project_offers_project_version_unique unique(project_id,offer_version),
 constraint project_offers_not_self_superseding check(supersedes_offer_id is null or supersedes_offer_id<>id),
 constraint project_offers_lifecycle_timestamps check(
  (status='draft' and offer_created_at is null and sent_at is null and accepted_at is null and rejected_at is null) or
  (status='created' and offer_created_at is not null and sent_at is null and accepted_at is null and rejected_at is null) or
  (status='sent' and offer_created_at is not null and sent_at is not null and accepted_at is null and rejected_at is null) or
  (status='accepted' and offer_created_at is not null and sent_at is not null and accepted_at is not null and rejected_at is null) or
  (status='rejected' and offer_created_at is not null and sent_at is not null and accepted_at is null and rejected_at is not null) or
  (status='superseded' and offer_created_at is not null and accepted_at is null and rejected_at is null))
);
create unique index project_offers_one_current on public.project_offers(project_id) where status<>'superseded';
create index project_offers_project_history on public.project_offers(project_id,offer_version desc);
create trigger project_offers_updated before update on public.project_offers for each row execute function public.set_updated_at();

create table public.project_offer_commands (
 id uuid primary key default gen_random_uuid(), project_id uuid not null references public.projects(id) on delete restrict,
 offer_id uuid not null references public.project_offers(id) on delete restrict, command text not null check(command in ('create_draft','mark_created','mark_sent','accept','reject','supersede')),
 idempotency_key text not null check(length(idempotency_key) between 8 and 128), result_revision integer not null check(result_revision>0),
 actor_id uuid not null references auth.users(id) on delete restrict, created_at timestamptz not null default statement_timestamp(), unique(project_id,idempotency_key)
);

create function public.validate_project_offer_supersession() returns trigger language plpgsql set search_path=public,pg_temp as $$
declare prior public.project_offers%rowtype; cycle_found boolean;
begin
 if new.supersedes_offer_id is null then return new; end if;
 select * into prior from public.project_offers where id=new.supersedes_offer_id;
 if not found or prior.project_id<>new.project_id or prior.offer_version>=new.offer_version then raise exception 'invalid_offer_supersession'; end if;
 with recursive chain(id,supersedes_offer_id) as (select id,supersedes_offer_id from public.project_offers where id=new.supersedes_offer_id union all select o.id,o.supersedes_offer_id from public.project_offers o join chain c on o.id=c.supersedes_offer_id) select exists(select 1 from chain where id=new.id) into cycle_found;
 if cycle_found then raise exception 'offer_supersession_cycle'; end if; return new;
end $$;
create constraint trigger validate_project_offer_supersession after insert or update of supersedes_offer_id on public.project_offers deferrable initially deferred for each row execute function public.validate_project_offer_supersession();

-- Prevent project status from impersonating Offer Authority. Controlled RPCs set a transaction-local guard.
create function public.guard_offer_project_status() returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
 if new.status in ('quote_draft','quote_sent','accepted','rejected') and new.status is distinct from old.status and coalesce(current_setting('app.offer_authority_transition',true),'')<>'allowed' then raise exception 'offer_status_requires_authority'; end if; return new;
end $$;
create trigger projects_offer_status_guard before update of status on public.projects for each row execute function public.guard_offer_project_status();

create function public.mark_project_offer_projection_dirty(target_project_id uuid) returns void language sql security definer set search_path=public,pg_temp as $$
 insert into public.project_media_dependency_projection_state(project_id,project_media_id,completeness_status,source_revision)
 select e.project_id,e.project_media_id,'rebuild_required',1 from public.project_evidence e where e.project_id=target_project_id and e.status<>'invalidated'
 on conflict(project_id,project_media_id) do update set completeness_status='rebuild_required',drift_detected=false,source_revision=project_media_dependency_projection_state.source_revision+1
$$;

create function public.project_offer_dto(o public.project_offers) returns jsonb language sql immutable set search_path=public,pg_temp as $$ select jsonb_build_object('id',o.id,'project_id',o.project_id,'offer_version',o.offer_version,'revision',o.revision,'status',o.status,'supersedes_offer_id',o.supersedes_offer_id,'created_at',o.created_at,'offer_created_at',o.offer_created_at,'sent_at',o.sent_at,'accepted_at',o.accepted_at,'rejected_at',o.rejected_at,'updated_at',o.updated_at) $$;

create function public.assert_offer_admin() returns void language plpgsql security definer set search_path=public,pg_temp as $$ begin if auth.uid() is null or public.current_app_role()<>'admin' then raise exception 'unauthorized'; end if; end $$;

create function public.create_project_offer_draft(target_project_id uuid,expected_project_status public.project_status,target_idempotency_key text) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare p public.projects%rowtype; o public.project_offers%rowtype; cmd public.project_offer_commands%rowtype;
begin perform public.assert_offer_admin(); select * into cmd from public.project_offer_commands where project_id=target_project_id and idempotency_key=target_idempotency_key; if found then if cmd.command<>'create_draft' then raise exception 'idempotency_conflict'; end if; select * into o from public.project_offers where id=cmd.offer_id; return public.project_offer_dto(o); end if;
 select * into p from public.projects where id=target_project_id and deleted_at is null for update; if not found then raise exception 'project_not_found'; end if; if p.status<>expected_project_status or p.status not in ('technical_review','human_review') then raise exception 'stale_project'; end if;
 insert into public.project_offers(project_id,offer_version,created_by) values(p.id,1,auth.uid()) returning * into o;
 perform set_config('app.offer_authority_transition','allowed',true); update public.projects set status='quote_draft' where id=p.id and status=expected_project_status; if not found then raise exception 'stale_project'; end if;
 insert into public.project_offer_commands(project_id,offer_id,command,idempotency_key,result_revision,actor_id) values(p.id,o.id,'create_draft',target_idempotency_key,o.revision,auth.uid()); perform public.mark_project_offer_projection_dirty(p.id);
 insert into public.audit_log(actor_id,entity_type,entity_id,action,metadata) values(auth.uid(),'project_offer',o.id,'offer_draft_created',jsonb_build_object('actor_id',auth.uid(),'project_id',p.id,'offer_id',o.id,'offer_version',o.offer_version,'revision',o.revision,'previous_status',null,'resulting_status','draft','timestamp',o.created_at)); return public.project_offer_dto(o);
end $$;

create function public.transition_project_offer(target_project_id uuid,target_offer_id uuid,expected_revision integer,target_idempotency_key text,target_command text) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare o public.project_offers%rowtype; n public.project_offers%rowtype; p public.projects%rowtype; cmd public.project_offer_commands%rowtype; next_status public.project_offer_status; project_target public.project_status; event_name text; now_at timestamptz:=statement_timestamp();
begin perform public.assert_offer_admin(); if target_command not in ('mark_created','mark_sent','accept','reject','supersede') then raise exception 'invalid_command'; end if;
 select * into cmd from public.project_offer_commands where project_id=target_project_id and idempotency_key=target_idempotency_key; if found then if cmd.command<>target_command or (target_command<>'supersede' and cmd.offer_id<>target_offer_id) then raise exception 'idempotency_conflict'; end if; select * into n from public.project_offers where id=cmd.offer_id; return public.project_offer_dto(n); end if;
 select * into p from public.projects where id=target_project_id and deleted_at is null for update; select * into o from public.project_offers where id=target_offer_id and project_id=target_project_id for update; if not found then raise exception 'offer_not_found'; end if; if o.revision<>expected_revision then raise exception 'stale_offer_revision'; end if;
 if target_command='mark_created' and o.status='draft' then next_status:='created'; event_name:='offer_created';
 elsif target_command='mark_sent' and o.status='created' then next_status:='sent'; project_target:='quote_sent'; event_name:='offer_sent';
 elsif target_command='accept' and o.status='sent' then next_status:='accepted'; project_target:='accepted'; event_name:='offer_accepted';
 elsif target_command='reject' and o.status='sent' then next_status:='rejected'; project_target:='rejected'; event_name:='offer_rejected';
 elsif target_command='supersede' and o.status in ('created','sent') then next_status:='superseded'; project_target:='quote_draft'; event_name:='offer_superseded'; else raise exception 'illegal_offer_transition'; end if;
 if target_command='supersede' then
  update public.project_offers set status='superseded',revision=revision+1 where id=o.id and revision=expected_revision returning * into o;
  insert into public.project_offers(project_id,offer_version,revision,status,supersedes_offer_id,created_by) values(o.project_id,o.offer_version+1,1,'draft',o.id,auth.uid()) returning * into n;
 else
  update public.project_offers set status=next_status,revision=revision+1,offer_created_at=case when next_status='created' then now_at else offer_created_at end,sent_at=case when next_status='sent' then now_at else sent_at end,accepted_at=case when next_status='accepted' then now_at else accepted_at end,rejected_at=case when next_status='rejected' then now_at else rejected_at end where id=o.id and revision=expected_revision returning * into n;
 end if;
 if project_target is not null then
  if (target_command='mark_sent' and p.status<>'quote_draft') or (target_command in ('accept','reject') and p.status<>'quote_sent') or (target_command='supersede' and p.status not in ('quote_draft','quote_sent')) then raise exception 'stale_project'; end if;
  perform set_config('app.offer_authority_transition','allowed',true); update public.projects set status=project_target where id=p.id;
 end if;
 insert into public.project_offer_commands(project_id,offer_id,command,idempotency_key,result_revision,actor_id) values(target_project_id,n.id,target_command,target_idempotency_key,n.revision,auth.uid()); perform public.mark_project_offer_projection_dirty(target_project_id);
 insert into public.audit_log(actor_id,entity_type,entity_id,action,metadata) values(auth.uid(),'project_offer',case when target_command='supersede' then o.id else n.id end,event_name,jsonb_build_object('actor_id',auth.uid(),'project_id',target_project_id,'offer_id',case when target_command='supersede' then o.id else n.id end,'offer_version',case when target_command='supersede' then o.offer_version else n.offer_version end,'revision',case when target_command='supersede' then o.revision else n.revision end,'previous_status',case when target_command='supersede' then 'created_or_sent' else o.status::text end,'resulting_status',next_status,'timestamp',now_at));
 return public.project_offer_dto(n);
end $$;

create function public.mark_project_offer_created(target_project_id uuid,target_offer_id uuid,expected_revision integer,target_idempotency_key text) returns jsonb language sql security definer set search_path=public,pg_temp as $$ select public.transition_project_offer(target_project_id,target_offer_id,expected_revision,target_idempotency_key,'mark_created') $$;
create function public.mark_project_offer_sent(target_project_id uuid,target_offer_id uuid,expected_revision integer,target_idempotency_key text) returns jsonb language sql security definer set search_path=public,pg_temp as $$ select public.transition_project_offer(target_project_id,target_offer_id,expected_revision,target_idempotency_key,'mark_sent') $$;
create function public.accept_project_offer(target_project_id uuid,target_offer_id uuid,expected_revision integer,target_idempotency_key text) returns jsonb language sql security definer set search_path=public,pg_temp as $$ select public.transition_project_offer(target_project_id,target_offer_id,expected_revision,target_idempotency_key,'accept') $$;
create function public.reject_project_offer(target_project_id uuid,target_offer_id uuid,expected_revision integer,target_idempotency_key text) returns jsonb language sql security definer set search_path=public,pg_temp as $$ select public.transition_project_offer(target_project_id,target_offer_id,expected_revision,target_idempotency_key,'reject') $$;
create function public.supersede_project_offer(target_project_id uuid,target_offer_id uuid,expected_revision integer,target_idempotency_key text) returns jsonb language sql security definer set search_path=public,pg_temp as $$ select public.transition_project_offer(target_project_id,target_offer_id,expected_revision,target_idempotency_key,'supersede') $$;

-- Projection V3: typed offer sources, conservative project-wide binding; execution deliberately remains missing.
alter table public.project_media_dependencies drop constraint project_media_dependencies_dependency_type_check, drop constraint project_media_dependencies_source_record_kind_check, drop constraint project_media_dependency_typed_source;
alter table public.project_media_dependencies add column project_offer_id uuid references public.project_offers(id) on delete restrict;
alter table public.project_media_dependencies add constraint project_media_dependencies_dependency_type_check check(dependency_type in ('evidence_interpretation','observation_followup','claim_proposal_review','claim_apply','claim_correction','offer_preparation','offer_open'));
alter table public.project_media_dependencies add constraint project_media_dependencies_source_record_kind_check check(source_record_kind in ('interpretation_run','observation','claim_proposal','knowledge_correction','project_offer'));
alter table public.project_media_dependencies add constraint project_media_dependency_typed_source check(
 (source_record_kind='interpretation_run' and source_record_id=interpretation_run_id and interpretation_run_id is not null and observation_id is null and claim_proposal_id is null and correction_id is null and project_offer_id is null) or
 (source_record_kind='observation' and source_record_id=observation_id and observation_id is not null and interpretation_run_id is null and claim_proposal_id is null and correction_id is null and project_offer_id is null) or
 (source_record_kind='claim_proposal' and source_record_id=claim_proposal_id and claim_proposal_id is not null and interpretation_run_id is null and observation_id is null and correction_id is null and project_offer_id is null) or
 (source_record_kind='knowledge_correction' and source_record_id=correction_id and correction_id is not null and interpretation_run_id is null and observation_id is null and claim_proposal_id is null and project_offer_id is null) or
 (source_record_kind='project_offer' and source_record_id=project_offer_id and project_offer_id is not null and interpretation_run_id is null and observation_id is null and claim_proposal_id is null and correction_id is null));
alter table public.project_media_dependency_projection_state drop constraint project_media_dependency_projection_state_supported_authority_types_check, drop constraint project_media_dependency_projection_state_missing_authority_types_check;
alter table public.project_media_dependency_projection_state alter column supported_authority_types set default array['evidence_interpretation','observation_followup','claim_proposal_review','claim_apply','correction','offer']::text[];
alter table public.project_media_dependency_projection_state alter column missing_authority_types set default array['offer','execution']::text[];
update public.project_media_dependency_projection_state set completeness_status='rebuild_required',supported_authority_types=array['evidence_interpretation','observation_followup','claim_proposal_review','claim_apply','correction','offer'],missing_authority_types=array['offer','execution'];
alter table public.project_media_dependency_projection_state add constraint project_media_dependency_projection_state_supported_authority_types_check check(supported_authority_types=array['evidence_interpretation','observation_followup','claim_proposal_review','claim_apply','correction','offer']::text[]), add constraint project_media_dependency_projection_state_missing_authority_types_check check(missing_authority_types in (array['offer','execution']::text[],array['execution']::text[]));

alter function public.rebuild_project_media_dependencies(uuid,uuid) rename to rebuild_project_media_dependencies_without_offers;
create function public.rebuild_project_media_dependencies(target_project_id uuid,target_project_media_id uuid) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare base jsonb; o public.project_offers%rowtype; open_count bigint; missing text[]; reasons text[]; rebuilt_at timestamptz:=statement_timestamp();
begin base:=public.rebuild_project_media_dependencies_without_offers(target_project_id,target_project_media_id);
 select * into o from public.project_offers where project_id=target_project_id and status<>'superseded';
 if found then
  insert into public.project_media_dependencies(project_id,project_media_id,evidence_id,dependency_type,source_record_kind,source_record_id,source_revision,project_offer_id,status,reason_code,opened_at,resolved_at)
  select e.project_id,e.project_media_id,e.id,d.kind,'project_offer',o.id,o.revision,o.id,case when (d.kind='offer_preparation' and o.status='draft') or (d.kind='offer_open' and o.status in ('created','sent')) then 'open' else 'resolved' end,case when d.kind='offer_preparation' and o.status='draft' then 'offer_preparation_open' when d.kind='offer_open' and o.status in ('created','sent') then 'offer_open' end,o.created_at,case when (d.kind='offer_preparation' and o.status='draft') or (d.kind='offer_open' and o.status in ('created','sent')) then null else o.updated_at end
  from public.project_evidence e cross join (values('offer_preparation'),('offer_open')) d(kind) where e.project_id=target_project_id and e.project_media_id=target_project_media_id and e.status<>'invalidated'
  on conflict(project_media_id,dependency_type,source_record_kind,source_record_id,projection_version) do update set source_revision=excluded.source_revision,status=excluded.status,reason_code=excluded.reason_code,resolved_at=excluded.resolved_at,updated_at=statement_timestamp();
  missing:=array['execution']; reasons:=array['execution_authority_missing'];
 else missing:=array['offer','execution']; reasons:=array['offer_authority_missing','execution_authority_missing']; end if;
 select count(*) into open_count from public.project_media_dependencies where project_id=target_project_id and project_media_id=target_project_media_id and status='open';
 update public.project_media_dependency_projection_state set supported_authority_types=array['evidence_interpretation','observation_followup','claim_proposal_review','claim_apply','correction','offer'],missing_authority_types=missing,completeness_status='complete',last_rebuilt_at=rebuilt_at where project_id=target_project_id and project_media_id=target_project_media_id;
 return jsonb_build_object('project_media_id',target_project_media_id,'projection_status','complete','open_dependencies',open_count,'missing_authorities',missing,'reason_codes',reasons,'projection_version','media_dependency_projection_v1','updated_at',rebuilt_at);
end $$;

alter table public.project_offers enable row level security; alter table public.project_offer_commands enable row level security;
revoke all on public.project_offers,public.project_offer_commands from public,anon,authenticated; grant select on public.project_offers to authenticated;
create policy "project offers scoped staff read" on public.project_offers for select to authenticated using(auth.uid() is not null and public.current_app_role() in ('admin','reviewer') and exists(select 1 from public.projects p where p.id=project_id and p.deleted_at is null));
revoke all on function public.create_project_offer_draft(uuid,public.project_status,text),public.mark_project_offer_created(uuid,uuid,integer,text),public.mark_project_offer_sent(uuid,uuid,integer,text),public.accept_project_offer(uuid,uuid,integer,text),public.reject_project_offer(uuid,uuid,integer,text),public.supersede_project_offer(uuid,uuid,integer,text),public.transition_project_offer(uuid,uuid,integer,text,text),public.assert_offer_admin(),public.project_offer_dto(public.project_offers),public.mark_project_offer_projection_dirty(uuid),public.rebuild_project_media_dependencies_without_offers(uuid,uuid) from public,anon,authenticated;
grant execute on function public.create_project_offer_draft(uuid,public.project_status,text),public.mark_project_offer_created(uuid,uuid,integer,text),public.mark_project_offer_sent(uuid,uuid,integer,text),public.accept_project_offer(uuid,uuid,integer,text),public.reject_project_offer(uuid,uuid,integer,text),public.supersede_project_offer(uuid,uuid,integer,text),public.rebuild_project_media_dependencies(uuid,uuid) to authenticated;
comment on table public.project_offers is 'Concrete persistent offer revision lifecycle. created proves this row was server-materialized; it does not prove a PDF, provider delivery, price, customer acceptance, or execution.';
comment on column public.project_offers.offer_created_at is 'Controlled materialization timestamp for the persistent revision, not an artifact or PDF proof.';
