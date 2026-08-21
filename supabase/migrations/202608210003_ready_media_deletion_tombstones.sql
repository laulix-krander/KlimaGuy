-- AP-15-05-03-02: transactional intent + eventual-consistent storage side effect
-- + transactional completion. This migration never hard-deletes Media or Evidence rows.
alter table public.project_media
  add column physical_state text not null default 'present',
  add column storage_deleted_at timestamptz null,
  add constraint project_media_physical_state_check check (physical_state in ('present','deletion_pending','absent','deletion_failed')),
  add constraint project_media_physical_state_consistency_check check (
    (physical_state = 'absent' and storage_deleted_at is not null and deleted_at is not null)
    or (physical_state <> 'absent' and storage_deleted_at is null)
  );

alter table public.project_media_lifecycle
  add column deletion_execution_state text not null default 'idle',
  add constraint project_media_lifecycle_execution_check check (deletion_execution_state in (
    'idle','deletion_pending','deletion_in_progress','deletion_failed','physically_deleted'
  ));

create function public.guard_project_media_lifecycle_active_deletion()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if old.deletion_execution_state in ('deletion_pending','deletion_in_progress')
    and new.deletion_execution_state = old.deletion_execution_state
    and current_setting('app.ready_media_completion',true) is distinct from 'on' then
    raise exception 'active media deletion blocks lifecycle changes' using errcode='40001';
  end if;
  return new;
end; $$;
create trigger project_media_lifecycle_active_deletion_guard before update on public.project_media_lifecycle
  for each row execute function public.guard_project_media_lifecycle_active_deletion();

-- Preserve the existing immutable locator contract while allowing only this transaction's completion
-- to set the protected logical-delete timestamp.
create or replace function public.prevent_project_media_protected_field_updates()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if new.id is distinct from old.id or new.project_id is distinct from old.project_id
    or new.storage_bucket is distinct from old.storage_bucket or new.storage_path is distinct from old.storage_path
    or new.original_filename is distinct from old.original_filename or new.stored_filename is distinct from old.stored_filename
    or new.mime_type is distinct from old.mime_type or new.file_size_bytes is distinct from old.file_size_bytes
    or new.media_type is distinct from old.media_type or new.source is distinct from old.source
    or new.uploaded_by is distinct from old.uploaded_by or new.created_at is distinct from old.created_at
    or (new.deleted_at is distinct from old.deleted_at and current_setting('app.ready_media_completion',true) is distinct from 'on') then
    raise exception 'project media protected fields cannot be changed';
  end if;
  if new.upload_status is distinct from old.upload_status and not (old.upload_status='pending' and new.upload_status in ('ready','failed')) then
    raise exception 'project media upload status transition is not allowed';
  end if;
  if new.physical_state is distinct from old.physical_state and current_setting('app.ready_media_completion',true) is distinct from 'on'
    and not (old.physical_state='present' and new.physical_state='deletion_pending')
    and not (old.physical_state in ('deletion_pending','deletion_failed') and new.physical_state='deletion_failed') then
    raise exception 'project media physical state transition is not allowed';
  end if;
  return new;
end; $$;

create table public.project_media_deletion_attempts (
  attempt_id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  project_media_id uuid not null,
  expected_lifecycle_revision bigint not null check (expected_lifecycle_revision >= 1),
  claim_token uuid not null default gen_random_uuid() unique,
  status text not null default 'claimed' check (status in ('claimed','storage_delete_pending','storage_deleted','completion_pending','completed','retryable_failed','terminal_failed')),
  attempt_number integer not null check (attempt_number > 0),
  deletion_reason text not null check (deletion_reason in ('retention_expired','project_closed','customer_request','invalid_media','wrong_project','duplicate_transport','admin_cleanup')),
  requested_by uuid not null references auth.users(id) on delete restrict,
  requested_at timestamptz not null default statement_timestamp(),
  claimed_at timestamptz not null default statement_timestamp(),
  lease_expires_at timestamptz not null default (statement_timestamp() + interval '5 minutes'),
  completed_at timestamptz null,
  failure_code text null check (failure_code is null or failure_code in ('media_not_found','lifecycle_not_found','not_deletion_eligible','stale_lifecycle_revision','hold_active','project_state_changed','offer_state_changed','evidence_dependency_changed','deletion_already_in_progress','deletion_already_completed','invalid_claim_token','storage_delete_failed','completion_failed','persistence_failed','cross_project_mismatch')),
  storage_result_category text null check (storage_result_category is null or storage_result_category in ('deleted','already_missing','retryable_failure','permanent_failure','unknown')),
  lifecycle_policy_version text not null check (lifecycle_policy_version = 'customer_photo_retention_v1'),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  constraint deletion_attempt_project_fkey foreign key (project_id) references public.projects(id) on delete restrict,
  constraint deletion_attempt_media_project_fkey foreign key (project_id, project_media_id) references public.project_media(project_id,id) on delete restrict
);
create unique index project_media_deletion_one_active_idx on public.project_media_deletion_attempts(project_media_id)
  where status in ('claimed','storage_delete_pending','storage_deleted','completion_pending');
create index project_media_deletion_reconcile_idx on public.project_media_deletion_attempts(status,lease_expires_at);
create trigger project_media_deletion_attempt_updated before update on public.project_media_deletion_attempts for each row execute function public.set_updated_at();

create table public.project_evidence_tombstones (
  evidence_id uuid not null,
  project_id uuid not null,
  former_project_media_id uuid not null,
  deleted_at timestamptz not null,
  deletion_reason text not null check (deletion_reason in ('retention_expired','project_closed','customer_request','invalid_media','wrong_project','duplicate_transport','admin_cleanup')),
  provenance_status text not null default 'evidence_tombstoned' check (provenance_status = 'evidence_tombstoned'),
  media_unavailable_reason text not null default 'storage_physically_deleted' check (media_unavailable_reason = 'storage_physically_deleted'),
  lifecycle_policy_version text not null check (lifecycle_policy_version = 'customer_photo_retention_v1'),
  deletion_attempt_id uuid not null,
  primary key (evidence_id, deletion_attempt_id),
  constraint evidence_tombstone_evidence_fkey foreign key (evidence_id) references public.project_evidence(id) on delete restrict,
  constraint evidence_tombstone_project_fkey foreign key (project_id) references public.projects(id) on delete restrict,
  constraint evidence_tombstone_media_project_fkey foreign key (project_id,former_project_media_id) references public.project_media(project_id,id) on delete restrict,
  constraint evidence_tombstone_attempt_fkey foreign key (deletion_attempt_id) references public.project_media_deletion_attempts(attempt_id) on delete restrict
);
create unique index project_evidence_one_tombstone_idx on public.project_evidence_tombstones(evidence_id);
create index project_evidence_tombstone_project_idx on public.project_evidence_tombstones(project_id,former_project_media_id);

alter table public.project_media_deletion_attempts enable row level security;
alter table public.project_evidence_tombstones enable row level security;
revoke all privileges on table public.project_media_deletion_attempts from public,anon,authenticated;
revoke all privileges on table public.project_evidence_tombstones from public,anon,authenticated;
grant select on table public.project_media_deletion_attempts to authenticated;
grant select on table public.project_evidence_tombstones to authenticated;
create policy "ready media deletion attempts select admin" on public.project_media_deletion_attempts for select to authenticated
  using (auth.uid() is not null and public.current_app_role() = 'admin');
create policy "evidence tombstones select admin" on public.project_evidence_tombstones for select to authenticated
  using (auth.uid() is not null and public.current_app_role() = 'admin');

-- Claim locks Media, Lifecycle and Project in one transaction. The persistent baseline has no Offer entity;
-- closed is the only authoritative project/offer approximation, while every bound Evidence stays fail-closed.
create function public.claim_ready_project_media_deletion(target_media_id uuid,target_project_id uuid,target_expected_revision bigint,target_deletion_reason text)
returns table(attempt_id uuid,project_media_id uuid,project_id uuid,claim_token uuid,status text,storage_bucket text,storage_path text,lease_expires_at timestamptz)
language plpgsql security definer set search_path = public, pg_temp as $$
declare pm public.project_media; lc public.project_media_lifecycle; p public.projects; active_attempt public.project_media_deletion_attempts; new_attempt public.project_media_deletion_attempts; next_number integer;
begin
  if auth.uid() is null or public.current_app_role() is distinct from 'admin' then return; end if;
  if target_deletion_reason not in ('retention_expired','project_closed','invalid_media','wrong_project','duplicate_transport','admin_cleanup') then return; end if;
  select * into p from public.projects where id=target_project_id for update;
  select * into pm from public.project_media where id=target_media_id for update;
  if pm.id is null or pm.project_id is distinct from target_project_id or p.id is null then return; end if;
  select * into lc from public.project_media_lifecycle where project_media_id=target_media_id and project_id=target_project_id for update;
  if lc.id is null or lc.revision <> target_expected_revision or p.deleted_at is not null or p.status <> 'closed'
    or pm.upload_status <> 'ready' or pm.deleted_at is not null or pm.physical_state not in ('present','deletion_pending','deletion_failed')
    or lc.retention_state <> 'deletion_eligible' or lc.eligibility_status <> 'eligible'
    or lc.policy_version is null or lc.hold_status <> 'none' or lc.deletion_execution_state not in ('idle','deletion_in_progress','deletion_failed')
    or exists(select 1 from public.project_evidence e where e.project_id=target_project_id and e.project_media_id=target_media_id and e.binding_status='bound') then return; end if;
  select * into active_attempt from public.project_media_deletion_attempts a where a.project_media_id=target_media_id
    and a.status in ('claimed','storage_delete_pending','storage_deleted','completion_pending') order by a.requested_at desc limit 1 for update;
  if active_attempt.attempt_id is not null and active_attempt.lease_expires_at >= statement_timestamp() then
    return query select active_attempt.attempt_id,active_attempt.project_media_id,active_attempt.project_id,active_attempt.claim_token,active_attempt.status,pm.storage_bucket,pm.storage_path,active_attempt.lease_expires_at; return;
  end if;
  if active_attempt.attempt_id is not null then update public.project_media_deletion_attempts set status='retryable_failed',failure_code='storage_delete_failed',storage_result_category='unknown' where project_media_deletion_attempts.attempt_id=active_attempt.attempt_id; end if;
  select coalesce(max(a.attempt_number),0)+1 into next_number from public.project_media_deletion_attempts a where a.project_media_id=target_media_id;
  insert into public.project_media_deletion_attempts(project_id,project_media_id,expected_lifecycle_revision,attempt_number,deletion_reason,requested_by,lifecycle_policy_version,status)
    values(target_project_id,target_media_id,target_expected_revision,next_number,target_deletion_reason,auth.uid(),lc.policy_version,'storage_delete_pending') returning * into new_attempt;
  perform set_config('app.ready_media_completion','on',true);
  update public.project_media set physical_state='deletion_pending' where id=target_media_id;
  update public.project_media_lifecycle set deletion_execution_state='deletion_in_progress' where id=lc.id;
  insert into public.audit_log(actor_id,entity_type,entity_id,action,metadata) values(auth.uid(),'project_media',target_media_id,'ready_media_deletion_claimed',jsonb_build_object('project_id',target_project_id,'attempt_id',new_attempt.attempt_id,'revision_before',lc.revision,'revision_after',lc.revision,'deletion_reason',target_deletion_reason,'result_code','claimed','timestamp',statement_timestamp()));
  return query select new_attempt.attempt_id,new_attempt.project_media_id,new_attempt.project_id,new_attempt.claim_token,new_attempt.status,pm.storage_bucket,pm.storage_path,new_attempt.lease_expires_at;
end; $$;

create function public.complete_ready_project_media_deletion(target_attempt_id uuid,target_media_id uuid,target_project_id uuid,target_claim_token uuid,target_storage_result text)
returns table(attempt_id uuid,status text,completion_result text,lifecycle_revision bigint)
language plpgsql security definer set search_path = public, pg_temp as $$
declare a public.project_media_deletion_attempts; lc public.project_media_lifecycle; finished_at timestamptz:=statement_timestamp(); next_revision bigint;
begin
  if auth.uid() is null or public.current_app_role() is distinct from 'admin' then return; end if;
  select * into a from public.project_media_deletion_attempts where project_media_deletion_attempts.attempt_id=target_attempt_id for update;
  if a.attempt_id is null or a.project_id<>target_project_id or a.project_media_id<>target_media_id or a.claim_token<>target_claim_token then return; end if;
  select * into lc from public.project_media_lifecycle where project_media_id=target_media_id and project_id=target_project_id for update;
  if a.status='completed' then return query select a.attempt_id,a.status,'already_completed'::text,lc.revision; return; end if;
  if target_storage_result not in ('deleted','already_missing') or a.status not in ('storage_delete_pending','storage_deleted','completion_pending') or lc.deletion_execution_state<>'deletion_in_progress' then return; end if;
  insert into public.project_evidence_tombstones(evidence_id,project_id,former_project_media_id,deleted_at,deletion_reason,lifecycle_policy_version,deletion_attempt_id)
    select e.id,e.project_id,e.project_media_id,finished_at,a.deletion_reason,a.lifecycle_policy_version,a.attempt_id from public.project_evidence e
    where e.project_id=target_project_id and e.project_media_id=target_media_id on conflict (evidence_id) do nothing;
  perform set_config('app.ready_media_completion','on',true);
  update public.project_media set physical_state='absent',storage_deleted_at=finished_at,deleted_at=coalesce(deleted_at,finished_at) where id=target_media_id and project_id=target_project_id;
  update public.project_media_lifecycle set deletion_execution_state='physically_deleted',revision=revision+1 where id=lc.id returning revision into next_revision;
  update public.project_media_deletion_attempts set status='completed',completed_at=finished_at,failure_code=null where project_media_deletion_attempts.attempt_id=a.attempt_id;
  insert into public.audit_log(actor_id,entity_type,entity_id,action,metadata) values(auth.uid(),'project_media',target_media_id,'ready_media_deletion_completed',jsonb_build_object('project_id',target_project_id,'attempt_id',a.attempt_id,'revision_before',lc.revision,'revision_after',next_revision,'deletion_reason',a.deletion_reason,'result_code','completed','timestamp',finished_at));
  return query select a.attempt_id,'completed'::text,target_storage_result,next_revision;
end; $$;

-- Storage is outside PostgreSQL. This small transaction records the confirmed side effect before
-- completion so a crash is explicitly visible as storage_deleted_completion_pending.
create function public.mark_ready_project_media_storage_deleted(target_attempt_id uuid,target_media_id uuid,target_project_id uuid,target_claim_token uuid,target_storage_result text)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare a public.project_media_deletion_attempts; lc public.project_media_lifecycle;
begin
  if auth.uid() is null or public.current_app_role() is distinct from 'admin' or target_storage_result not in ('deleted','already_missing') then return false; end if;
  select * into a from public.project_media_deletion_attempts where attempt_id=target_attempt_id for update;
  if a.attempt_id is null or a.project_id<>target_project_id or a.project_media_id<>target_media_id or a.claim_token<>target_claim_token then return false; end if;
  if a.status in ('storage_deleted','completion_pending','completed') then return true; end if;
  if a.status<>'storage_delete_pending' then return false; end if;
  select * into lc from public.project_media_lifecycle where project_media_id=target_media_id and project_id=target_project_id for update;
  update public.project_media_deletion_attempts set status='completion_pending',storage_result_category=target_storage_result where attempt_id=a.attempt_id;
  insert into public.audit_log(actor_id,entity_type,entity_id,action,metadata) values(auth.uid(),'project_media',target_media_id,'ready_media_storage_deleted',jsonb_build_object('project_id',target_project_id,'attempt_id',a.attempt_id,'revision_before',lc.revision,'revision_after',lc.revision,'deletion_reason',a.deletion_reason,'result_code',target_storage_result,'timestamp',statement_timestamp()));
  return true;
end; $$;

create function public.fail_ready_project_media_deletion(target_attempt_id uuid,target_media_id uuid,target_project_id uuid,target_claim_token uuid,target_failure_code text,target_retryable boolean)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare a public.project_media_deletion_attempts; lc public.project_media_lifecycle;
begin
  if auth.uid() is null or public.current_app_role() is distinct from 'admin' or target_failure_code<>'storage_delete_failed' then return false; end if;
  select * into a from public.project_media_deletion_attempts where attempt_id=target_attempt_id for update;
  if a.attempt_id is null or a.project_id<>target_project_id or a.project_media_id<>target_media_id or a.claim_token<>target_claim_token or a.status='completed' then return false; end if;
  select * into lc from public.project_media_lifecycle where project_media_id=target_media_id and project_id=target_project_id for update;
  update public.project_media_deletion_attempts set status=case when target_retryable then 'retryable_failed' else 'terminal_failed' end,failure_code=target_failure_code,storage_result_category=case when target_retryable then 'retryable_failure' else 'permanent_failure' end where attempt_id=a.attempt_id;
  update public.project_media set physical_state='deletion_failed' where id=target_media_id;
  update public.project_media_lifecycle set deletion_execution_state='deletion_failed' where id=lc.id;
  insert into public.audit_log(actor_id,entity_type,entity_id,action,metadata) values(auth.uid(),'project_media',target_media_id,'ready_media_deletion_failed',jsonb_build_object('project_id',target_project_id,'attempt_id',a.attempt_id,'revision_before',lc.revision,'revision_after',lc.revision,'deletion_reason',a.deletion_reason,'result_code',target_failure_code,'timestamp',statement_timestamp())); return true;
end; $$;

create function public.list_ready_media_deletion_reconciliation()
returns table(attempt_id uuid,project_id uuid,project_media_id uuid,reconciliation_state text,lease_expires_at timestamptz)
language sql security definer set search_path = public, pg_temp as $$
  select a.attempt_id,a.project_id,a.project_media_id,case when a.status in ('claimed','storage_delete_pending') and a.lease_expires_at<statement_timestamp() then 'stale_attempt' when a.status in ('claimed','storage_delete_pending') then 'claimed_storage_unknown' when a.status in ('storage_deleted','completion_pending') then 'storage_deleted_completion_pending' else 'retryable_failed' end,a.lease_expires_at
  from public.project_media_deletion_attempts a where auth.uid() is not null and public.current_app_role()='admin' and (a.status='retryable_failed' or a.status in ('claimed','storage_delete_pending','storage_deleted','completion_pending'));
$$;

-- Binding and lifecycle configuration cannot race an active claim: both inspect the locked execution axis.
drop policy "project evidence insert active admin" on public.project_evidence;
create policy "project evidence insert active admin" on public.project_evidence for insert to authenticated with check (
  auth.uid() is not null and public.current_app_role()='admin' and source_channel='internal_upload' and source_actor_class='admin' and binding_status='bound'
  and exists(select 1 from public.projects p where p.id=project_evidence.project_id and p.deleted_at is null)
  and exists(select 1 from public.project_media pm join public.project_media_lifecycle lc on lc.project_media_id=pm.id and lc.project_id=pm.project_id
    where pm.id=project_evidence.project_media_id and pm.project_id=project_evidence.project_id and pm.upload_status='ready' and pm.deleted_at is null and pm.media_type='image' and pm.physical_state='present' and lc.deletion_execution_state='idle')
);

revoke execute on function public.claim_ready_project_media_deletion(uuid,uuid,bigint,text) from public,anon,authenticated;
revoke execute on function public.complete_ready_project_media_deletion(uuid,uuid,uuid,uuid,text) from public,anon,authenticated;
revoke execute on function public.mark_ready_project_media_storage_deleted(uuid,uuid,uuid,uuid,text) from public,anon,authenticated;
revoke execute on function public.fail_ready_project_media_deletion(uuid,uuid,uuid,uuid,text,boolean) from public,anon,authenticated;
revoke execute on function public.list_ready_media_deletion_reconciliation() from public,anon,authenticated;
grant execute on function public.claim_ready_project_media_deletion(uuid,uuid,bigint,text) to authenticated;
grant execute on function public.complete_ready_project_media_deletion(uuid,uuid,uuid,uuid,text) to authenticated;
grant execute on function public.mark_ready_project_media_storage_deleted(uuid,uuid,uuid,uuid,text) to authenticated;
grant execute on function public.fail_ready_project_media_deletion(uuid,uuid,uuid,uuid,text,boolean) to authenticated;
grant execute on function public.list_ready_media_deletion_reconciliation() to authenticated;

comment on table public.project_evidence_tombstones is 'Minimal locator-free Evidence provenance after recoverable physical Ready-Media deletion.';
comment on table public.project_media_deletion_attempts is 'Exclusive, leased and idempotent Ready-Media deletion intents; separate from orphan cleanup.';
