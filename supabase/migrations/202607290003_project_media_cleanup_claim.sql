-- AP-12-02-11-01: atomically claim and logically soft-delete one old pending/failed orphan.
alter table public.project_media
  add constraint project_media_project_id_id_key unique (project_id, id);

create table public.project_media_cleanup_items (
  id uuid primary key default gen_random_uuid(),
  media_id uuid not null,
  project_id uuid not null,
  cleanup_status text not null,
  source_upload_status text not null,
  claimed_by uuid not null,
  claimed_at timestamptz not null,
  completed_at timestamptz,
  last_error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint project_media_cleanup_items_media_unique unique (media_id),
  constraint project_media_cleanup_items_media_project_fk
    foreign key (project_id, media_id) references public.project_media(project_id, id) on delete restrict,
  constraint project_media_cleanup_items_project_fk
    foreign key (project_id) references public.projects(id) on delete restrict,
  constraint project_media_cleanup_items_claimed_by_fk
    foreign key (claimed_by) references auth.users(id) on delete restrict,
  constraint project_media_cleanup_items_cleanup_status_check
    check (cleanup_status in ('claimed', 'soft_deleted', 'claim_failed')),
  constraint project_media_cleanup_items_source_status_check
    check (source_upload_status in ('pending', 'failed')),
  constraint project_media_cleanup_items_completed_at_check
    check ((cleanup_status = 'soft_deleted') = (completed_at is not null)),
  constraint project_media_cleanup_items_last_error_check
    check ((cleanup_status = 'claim_failed') = (last_error_code is not null)),
  constraint project_media_cleanup_items_last_error_not_empty_check
    check (last_error_code is null or btrim(last_error_code) <> '')
);

create trigger project_media_cleanup_items_updated
  before update on public.project_media_cleanup_items
  for each row execute function public.set_updated_at();

alter table public.project_media_cleanup_items enable row level security;
revoke all on table public.project_media_cleanup_items from public, anon, authenticated;

create function public.claim_and_soft_delete_project_media_orphan(
  target_media_id uuid,
  target_project_id uuid
)
returns table (
  cleanup_item_id uuid,
  media_id uuid,
  project_id uuid,
  cleanup_status text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor_id uuid := auth.uid();
  source_status text;
  claimed_item_id uuid;
  operation_time timestamptz := statement_timestamp();
begin
  if actor_id is null
    or target_media_id is null
    or target_project_id is null
    or public.current_app_role() is distinct from 'admin' then
    return;
  end if;

  select pm.upload_status
  into source_status
  from public.project_media pm
  join public.projects p on p.id = pm.project_id
  where pm.id = target_media_id
    and pm.project_id = target_project_id
    and pm.deleted_at is null
    and pm.upload_status in ('pending', 'failed')
    and pm.created_at <= operation_time - interval '24 hours'
    and not exists (
      select 1 from public.project_media_cleanup_items ci where ci.media_id = pm.id
    )
  for update of pm;

  if source_status is null then
    return;
  end if;

  insert into public.project_media_cleanup_items (
    media_id, project_id, cleanup_status, source_upload_status,
    claimed_by, claimed_at
  ) values (
    target_media_id, target_project_id, 'claimed', source_status,
    actor_id, operation_time
  ) returning id into claimed_item_id;

  update public.project_media pm
  set deleted_at = operation_time
  where pm.id = target_media_id
    and pm.project_id = target_project_id
    and pm.deleted_at is null
    and pm.upload_status = source_status;

  if not found then
    raise exception using errcode = '40001', message = 'orphan candidate changed concurrently';
  end if;

  update public.project_media_cleanup_items ci
  set cleanup_status = 'soft_deleted', completed_at = operation_time
  where ci.id = claimed_item_id and ci.cleanup_status = 'claimed';

  insert into public.audit_log (actor_id, entity_type, entity_id, action, metadata, created_at)
  values (
    actor_id,
    'project_media',
    target_media_id,
    'orphan_soft_delete',
    jsonb_build_object(
      'project_id', target_project_id,
      'source_upload_status', source_status,
      'result', 'soft_deleted',
      'cleanup_item_id', claimed_item_id
    ),
    operation_time
  );

  return query select claimed_item_id, target_media_id, target_project_id, 'soft_deleted'::text;
end;
$$;

revoke execute on function public.claim_and_soft_delete_project_media_orphan(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.claim_and_soft_delete_project_media_orphan(uuid, uuid)
  to authenticated;

-- This package intentionally does not remove or otherwise mutate physical objects.
