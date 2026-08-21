-- AP-15-05-03-01: persistent decision state only. No storage or row deletion exists here.
create table public.project_media_lifecycle (
  id uuid not null default gen_random_uuid(),
  project_id uuid not null,
  project_media_id uuid not null,
  revision bigint not null default 1,
  retention_state text not null default 'protected',
  eligibility_status text not null default 'blocked',
  eligibility_reason_codes text[] not null default array['retention_policy_missing']::text[],
  hold_status text not null default 'none',
  policy_version text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint project_media_lifecycle_pkey primary key (id),
  constraint project_media_lifecycle_project_fkey foreign key (project_id) references public.projects(id) on delete restrict,
  constraint project_media_lifecycle_media_project_fkey foreign key (project_id, project_media_id)
    references public.project_media(project_id, id) on delete restrict,
  constraint project_media_lifecycle_media_key unique (project_media_id),
  constraint project_media_lifecycle_revision_check check (revision >= 1),
  constraint project_media_lifecycle_retention_check check (retention_state in ('protected','retention_pending','deletion_eligible','deletion_blocked')),
  constraint project_media_lifecycle_eligibility_check check (eligibility_status in ('eligible','blocked','policy_not_configured','dependency_state_unknown','media_not_ready','media_already_logically_deleted','project_state_blocks','offer_state_blocks','evidence_dependency_blocks','lifecycle_state_blocks')),
  constraint project_media_lifecycle_hold_check check (hold_status in ('none','operational_hold','legal_hold')),
  constraint project_media_lifecycle_policy_check check (policy_version is null or policy_version = 'customer_photo_retention_v1'),
  constraint project_media_lifecycle_reasons_check check (eligibility_reason_codes <@ array['media_not_ready','media_failed','media_pending','media_soft_deleted','lifecycle_missing','retention_policy_missing','retention_not_completed','project_active','offer_state_unknown','offer_open','offer_preparation_open','evidence_dependency_open','observation_dependency_unknown','proposal_dependency_unknown','review_dependency_unknown','correction_dependency_unknown','legal_or_operational_hold','cross_project_mismatch','unsupported_media_state']::text[]),
  constraint project_media_lifecycle_eligible_consistency_check check (eligibility_status <> 'eligible' or (retention_state = 'deletion_eligible' and hold_status = 'none' and policy_version is not null and cardinality(eligibility_reason_codes) = 0))
);

create index project_media_lifecycle_project_idx on public.project_media_lifecycle(project_id, project_media_id);
create trigger project_media_lifecycle_updated before update on public.project_media_lifecycle
  for each row execute function public.set_updated_at();

alter table public.project_media_lifecycle enable row level security;
revoke all privileges on table public.project_media_lifecycle from public, anon, authenticated;
grant select on table public.project_media_lifecycle to authenticated;

create policy "project media lifecycle select active admin"
  on public.project_media_lifecycle for select to authenticated
  using (auth.uid() is not null and public.current_app_role() = 'admin' and exists (
    select 1 from public.projects where projects.id = project_media_lifecycle.project_id and projects.deleted_at is null
  ));

create function public.initialize_project_media_lifecycle(target_media_id uuid, target_project_id uuid)
returns public.project_media_lifecycle language plpgsql security definer set search_path = public, pg_temp as $$
declare result public.project_media_lifecycle;
begin
  if auth.uid() is null or public.current_app_role() is distinct from 'admin' then return null; end if;
  insert into public.project_media_lifecycle(project_id, project_media_id)
  select target_project_id, target_media_id from public.project_media pm join public.projects p on p.id=pm.project_id
   where pm.id=target_media_id and pm.project_id=target_project_id and p.deleted_at is null
  on conflict (project_media_id) do nothing;
  select * into result from public.project_media_lifecycle where project_media_id=target_media_id and project_id=target_project_id;
  return result;
end; $$;

-- Admin-only CAS configuration. Eligibility remains blocked until the separate evaluator verifies live gates.
create function public.configure_project_media_lifecycle(target_media_id uuid,target_project_id uuid,expected_revision bigint,target_retention_state text,target_hold_status text,target_policy_version text)
returns public.project_media_lifecycle language plpgsql security definer set search_path = public, pg_temp as $$
declare current_row public.project_media_lifecycle; result public.project_media_lifecycle;
begin
  if auth.uid() is null or public.current_app_role() is distinct from 'admin' then return null; end if;
  if target_retention_state not in ('protected','retention_pending','deletion_eligible','deletion_blocked') or target_hold_status not in ('none','operational_hold','legal_hold') or target_policy_version is distinct from 'customer_photo_retention_v1' then return null; end if;
  select * into current_row from public.project_media_lifecycle where project_media_id=target_media_id and project_id=target_project_id for update;
  if current_row.id is null or current_row.revision <> expected_revision then return null; end if;
  if current_row.retention_state=target_retention_state and current_row.hold_status=target_hold_status and current_row.policy_version=target_policy_version then return current_row; end if;
  update public.project_media_lifecycle set retention_state=target_retention_state,hold_status=target_hold_status,policy_version=target_policy_version,
    eligibility_status='blocked',eligibility_reason_codes=array['retention_not_completed']::text[],revision=revision+1 where id=current_row.id returning * into result;
  insert into public.audit_log(actor_id,entity_type,entity_id,action,metadata) values(auth.uid(),'project_media',target_media_id,'project_media_lifecycle_configured',jsonb_build_object('project_id',target_project_id,'revision',result.revision,'retention_state',result.retention_state,'hold_status',result.hold_status,'policy_version',result.policy_version));
  return result;
end; $$;

-- Current persistence has no Offer entity and no durable Observation/Proposal/Review authority.
-- Therefore every bound Evidence item fails closed. Unbound media does not inherit that synthetic dependency.
create function public.evaluate_project_media_deletion_eligibility(target_media_id uuid,target_project_id uuid,expected_revision bigint)
returns public.project_media_lifecycle language plpgsql security definer set search_path = public, pg_temp as $$
declare lc public.project_media_lifecycle; pm public.project_media; project_status text; next_status text; reasons text[];
begin
  if auth.uid() is null or public.current_app_role() is distinct from 'admin' then return null; end if;
  select * into lc from public.project_media_lifecycle where project_media_id=target_media_id and project_id=target_project_id for update;
  select m.* into pm from public.project_media m where m.id=target_media_id and m.project_id=target_project_id;
  select p.status into project_status from public.projects p where p.id=target_project_id and p.deleted_at is null;
  if lc.id is null or lc.revision<>expected_revision or pm.id is null then return null;
  if pm.deleted_at is not null then next_status:='media_already_logically_deleted'; reasons:=array['media_soft_deleted'];
  elsif pm.upload_status<>'ready' then next_status:='media_not_ready'; reasons:=array['media_not_ready',case when pm.upload_status='pending' then 'media_pending' when pm.upload_status='failed' then 'media_failed' else 'unsupported_media_state' end];
  elsif lc.policy_version is null then next_status:='policy_not_configured'; reasons:=array['retention_policy_missing'];
  elsif lc.hold_status<>'none' then next_status:='lifecycle_state_blocks'; reasons:=array['legal_or_operational_hold'];
  elsif project_status is distinct from 'closed' then next_status:='project_state_blocks'; reasons:=array['project_active'];
  elsif exists(select 1 from public.project_evidence e where e.project_id=target_project_id and e.project_media_id=target_media_id and e.binding_status='bound') then next_status:='dependency_state_unknown'; reasons:=array['offer_state_unknown','observation_dependency_unknown','proposal_dependency_unknown','review_dependency_unknown','correction_dependency_unknown'];
  elsif lc.retention_state<>'deletion_eligible' then next_status:='lifecycle_state_blocks'; reasons:=array['retention_not_completed'];
  else next_status:='eligible'; reasons:=array[]::text[]; end if;
  if lc.eligibility_status=next_status and lc.eligibility_reason_codes=reasons then return lc; end if;
  update public.project_media_lifecycle set eligibility_status=next_status,eligibility_reason_codes=reasons,revision=revision+1 where id=lc.id returning * into lc;
  insert into public.audit_log(actor_id,entity_type,entity_id,action,metadata) values(auth.uid(),'project_media',target_media_id,'project_media_deletion_eligibility_evaluated',jsonb_build_object('project_id',target_project_id,'revision',lc.revision,'eligibility_status',lc.eligibility_status,'reason_codes',lc.eligibility_reason_codes));
  return lc;
end; $$;

revoke execute on function public.initialize_project_media_lifecycle(uuid,uuid) from public,anon,authenticated;
revoke execute on function public.configure_project_media_lifecycle(uuid,uuid,bigint,text,text,text) from public,anon,authenticated;
revoke execute on function public.evaluate_project_media_deletion_eligibility(uuid,uuid,bigint) from public,anon,authenticated;
grant execute on function public.initialize_project_media_lifecycle(uuid,uuid) to authenticated;
grant execute on function public.configure_project_media_lifecycle(uuid,uuid,bigint,text,text,text) to authenticated;
grant execute on function public.evaluate_project_media_deletion_eligibility(uuid,uuid,bigint) to authenticated;

-- Safety hardening of the legacy logical-delete RPC: ready media must pass the lifecycle gate.
create or replace function public.soft_delete_project_media(target_media_id uuid,target_project_id uuid)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare affected_rows integer := 0;
begin
  if auth.uid() is null or public.current_app_role() is distinct from 'admin' then return false; end if;
  update public.project_media set deleted_at=statement_timestamp()
   where id=target_media_id and project_id=target_project_id and deleted_at is null and upload_status='ready'
   and exists(select 1 from public.projects where id=target_project_id and deleted_at is null)
   and exists(select 1 from public.project_media_lifecycle lc where lc.project_media_id=target_media_id and lc.project_id=target_project_id and lc.retention_state='deletion_eligible' and lc.eligibility_status='eligible' and lc.hold_status='none' and lc.policy_version is not null);
  get diagnostics affected_rows=row_count; return affected_rows=1;
end; $$;

comment on table public.project_media_lifecycle is 'Fail-closed lifecycle and deletion eligibility decisions; contains no storage locator and performs no physical deletion.';
