-- AP-12-02-11-02-01: controlled physical purge of one soft-deleted orphan.
alter table public.project_media_cleanup_items
  add column purge_status text not null default 'not_started',
  add column purge_claimed_at timestamptz,
  add column purge_completed_at timestamptz,
  add column purge_attempt_count integer not null default 0,
  add column last_purge_error_code text,
  add column purge_claim_token uuid,
  add column purge_claimed_by uuid references auth.users(id) on delete restrict,
  add constraint project_media_cleanup_items_purge_status_check check (purge_status in ('not_started','in_progress','retry_required','purged','failed')),
  add constraint project_media_cleanup_items_purge_attempt_check check (purge_attempt_count >= 0),
  add constraint project_media_cleanup_items_purge_claimed_at_check check ((purge_status = 'not_started') = (purge_claimed_at is null)),
  add constraint project_media_cleanup_items_purge_completed_at_check check ((purge_status = 'purged') = (purge_completed_at is not null)),
  add constraint project_media_cleanup_items_purge_error_state_check check (last_purge_error_code is null or purge_status in ('retry_required','failed')),
  add constraint project_media_cleanup_items_purge_error_not_empty_check check (last_purge_error_code is null or btrim(last_purge_error_code) <> ''),
  add constraint project_media_cleanup_items_purge_token_check check ((purge_status = 'in_progress') = (purge_claim_token is not null)),
  add constraint project_media_cleanup_items_purged_no_error_check check (purge_status <> 'purged' or last_purge_error_code is null),
  add constraint project_media_cleanup_items_purge_actor_check check ((purge_status = 'not_started') = (purge_claimed_by is null));

create function public.claim_project_media_storage_purge(target_media_id uuid, target_project_id uuid)
returns table (cleanup_item_id uuid, media_id uuid, project_id uuid, purge_claim_token uuid, storage_bucket text, storage_path text, purge_status text)
language plpgsql security definer set search_path = public, pg_temp as $$
declare actor_id uuid := auth.uid(); claimed public.project_media_cleanup_items; target public.project_media; operation_time timestamptz := statement_timestamp();
begin
  if actor_id is null or public.current_app_role() is distinct from 'admin' then return; end if;
  select ci.* into claimed from public.project_media_cleanup_items ci
   where ci.media_id=target_media_id and ci.project_id=target_project_id and ci.purge_status='purged';
  if claimed.id is not null then
    return query select claimed.id,pm.id,pm.project_id,null::uuid,pm.storage_bucket,pm.storage_path,'purged'::text
      from public.project_media pm where pm.id=target_media_id and pm.project_id=target_project_id and pm.deleted_at is not null and pm.upload_status in ('pending','failed');
    return;
  end if;
  select pm.* into target from public.project_media pm join public.projects p on p.id = pm.project_id
   where pm.id = target_media_id and pm.project_id = target_project_id and pm.deleted_at is not null
     and pm.upload_status in ('pending','failed') and pm.upload_status <> 'ready'
     and pm.storage_bucket = 'project-media'
     and pm.storage_path = 'projects/' || pm.project_id::text || '/originals/' || pm.id::text || '/' || pm.stored_filename
     and p.deleted_at is null for update of pm;
  if target.id is null then return; end if;
  select ci.* into claimed from public.project_media_cleanup_items ci
   where ci.media_id = target_media_id and ci.project_id = target_project_id
     and ci.cleanup_status = 'soft_deleted' and ci.completed_at is not null
     and ci.source_upload_status in ('pending','failed') and ci.purge_status in ('not_started','retry_required')
   for update;
  if claimed.id is null then return; end if;
  update public.project_media_cleanup_items ci set purge_status='in_progress', purge_claimed_at=operation_time,
    purge_attempt_count=ci.purge_attempt_count+1, purge_claim_token=gen_random_uuid(), purge_claimed_by=actor_id,
    last_purge_error_code=null, purge_completed_at=null where ci.id=claimed.id and ci.purge_status in ('not_started','retry_required') returning ci.* into claimed;
  if claimed.id is null then raise exception using errcode='40001', message='purge claim conflict'; end if;
  insert into public.audit_log(actor_id,entity_type,entity_id,action,metadata,created_at) values
    (actor_id,'project_media',target_media_id,'project_media_purge_claimed',jsonb_build_object('cleanup_item_id',claimed.id,'media_id',target_media_id,'project_id',target_project_id,'attempt',claimed.purge_attempt_count,'from_status','not_started_or_retry_required','to_status','in_progress'),operation_time);
  return query select claimed.id,target.id,target.project_id,claimed.purge_claim_token,target.storage_bucket,target.storage_path,claimed.purge_status;
end; $$;

create function public.complete_project_media_storage_purge(target_cleanup_item_id uuid,target_media_id uuid,target_project_id uuid,target_purge_claim_token uuid,target_result text,target_error_code text default null)
returns table (purge_status text, completion_result text)
language plpgsql security definer set search_path = public, pg_temp as $$
declare actor_id uuid := auth.uid(); item public.project_media_cleanup_items; operation_time timestamptz := statement_timestamp(); next_status text; audit_action text;
begin
  if actor_id is null or public.current_app_role() is distinct from 'admin' then return; end if;
  if target_result not in ('deleted','already_missing','retry_required','failed') then return; end if;
  if target_result in ('retry_required','failed') and target_error_code not in ('storage_configuration_missing','storage_delete_unauthorized','storage_delete_transient','storage_delete_failed','storage_response_invalid','purge_completion_failed') then return; end if;
  if target_result in ('deleted','already_missing') and target_error_code is not null then return; end if;
  select ci.* into item from public.project_media_cleanup_items ci join public.project_media pm on pm.id=ci.media_id and pm.project_id=ci.project_id
   where ci.id=target_cleanup_item_id and ci.media_id=target_media_id and ci.project_id=target_project_id
     and ci.purge_status='in_progress' and ci.purge_claim_token=target_purge_claim_token
     and pm.deleted_at is not null and pm.upload_status in ('pending','failed') and pm.upload_status <> 'ready' for update of ci;
  if item.id is null then return; end if;
  next_status := case when target_result in ('deleted','already_missing') then 'purged' when target_result='retry_required' then 'retry_required' else 'failed' end;
  update public.project_media_cleanup_items ci set purge_status=next_status,
    purge_completed_at=case when next_status='purged' then operation_time else null end,
    purge_claim_token=null,last_purge_error_code=case when next_status in ('retry_required','failed') then target_error_code else null end
    where ci.id=item.id and ci.purge_status='in_progress' and ci.purge_claim_token=target_purge_claim_token;
  audit_action := case when target_result='already_missing' then 'project_media_purge_already_missing' when next_status='purged' then 'project_media_purge_completed' when next_status='retry_required' then 'project_media_purge_retry_required' else 'project_media_purge_failed' end;
  insert into public.audit_log(actor_id,entity_type,entity_id,action,metadata,created_at) values
    (actor_id,'project_media',target_media_id,audit_action,jsonb_build_object('cleanup_item_id',item.id,'media_id',target_media_id,'project_id',target_project_id,'attempt',item.purge_attempt_count,'from_status','in_progress','to_status',next_status,'error_code',target_error_code),operation_time);
  return query select next_status,target_result;
end; $$;

create function public.list_project_media_purge_candidates(target_page integer,target_page_size integer)
returns table(cleanup_item_id uuid,media_id uuid,project_id uuid,project_title text,source_upload_status text,cleanup_status text,purge_status text,completed_at timestamptz,purge_attempt_count integer,last_purge_error_code text,created_at timestamptz)
language sql stable security definer set search_path = public, pg_temp as $$
 select ci.id,ci.media_id,ci.project_id,p.title,ci.source_upload_status,ci.cleanup_status,ci.purge_status,ci.completed_at,ci.purge_attempt_count,ci.last_purge_error_code,ci.created_at
 from public.project_media_cleanup_items ci join public.project_media pm on pm.id=ci.media_id and pm.project_id=ci.project_id join public.projects p on p.id=ci.project_id
 where auth.uid() is not null and public.current_app_role()='admin' and target_page >= 1 and target_page_size between 1 and 50
   and ci.cleanup_status='soft_deleted' and ci.completed_at is not null and ci.source_upload_status in ('pending','failed')
   and ci.purge_status in ('not_started','retry_required') and pm.deleted_at is not null and pm.upload_status in ('pending','failed')
 order by ci.completed_at asc,ci.id asc limit least(target_page_size,50) offset ((target_page-1)*least(target_page_size,50)); $$;

revoke execute on function public.claim_project_media_storage_purge(uuid,uuid) from public,anon,authenticated;
revoke execute on function public.complete_project_media_storage_purge(uuid,uuid,uuid,uuid,text,text) from public,anon,authenticated;
revoke execute on function public.list_project_media_purge_candidates(integer,integer) from public,anon,authenticated;
grant execute on function public.claim_project_media_storage_purge(uuid,uuid) to authenticated;
grant execute on function public.complete_project_media_storage_purge(uuid,uuid,uuid,uuid,text,text) to authenticated;
grant execute on function public.list_project_media_purge_candidates(integer,integer) to authenticated;
