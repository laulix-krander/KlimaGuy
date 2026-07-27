-- AP-12-01-04: narrow, admin-only soft delete for ready project media.
create or replace function public.prevent_project_media_protected_field_updates()
returns trigger
language plpgsql
as $$
begin
  if new.id is distinct from old.id
    or new.project_id is distinct from old.project_id
    or new.storage_bucket is distinct from old.storage_bucket
    or new.storage_path is distinct from old.storage_path
    or new.original_filename is distinct from old.original_filename
    or new.stored_filename is distinct from old.stored_filename
    or new.mime_type is distinct from old.mime_type
    or new.file_size_bytes is distinct from old.file_size_bytes
    or new.media_type is distinct from old.media_type
    or new.source is distinct from old.source
    or new.uploaded_by is distinct from old.uploaded_by
    or new.created_at is distinct from old.created_at then
    raise exception 'project media protected fields cannot be changed';
  end if;

  -- A deleted row is terminal. Normal authenticated callers have no UPDATE grant
  -- for deleted_at; only the bounded SECURITY DEFINER RPC below can set it.
  if old.deleted_at is not null and new.deleted_at is distinct from old.deleted_at then
    raise exception 'project media restore is not allowed';
  end if;

  if new.upload_status is distinct from old.upload_status
    and not (
      old.upload_status = 'pending'
      and new.upload_status in ('ready', 'failed')
    ) then
    raise exception 'project media upload status transition is not allowed';
  end if;

  return new;
end;
$$;

create function public.soft_delete_project_media(
  target_media_id uuid,
  target_project_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor_id uuid := auth.uid();
  affected_rows integer := 0;
begin
  if actor_id is null
    or target_media_id is null
    or target_project_id is null then
    return false;
  end if;

  if public.current_app_role() is distinct from 'admin' then
    return false;
  end if;

  update public.project_media
  set deleted_at = statement_timestamp()
  where public.project_media.id = target_media_id
    and public.project_media.project_id = target_project_id
    and public.project_media.deleted_at is null
    and public.project_media.upload_status = 'ready'
    and exists (
      select 1
      from public.projects
      where public.projects.id = target_project_id
        and public.projects.deleted_at is null
    );

  get diagnostics affected_rows = row_count;
  return affected_rows = 1;
end;
$$;

revoke execute on function public.soft_delete_project_media(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.soft_delete_project_media(uuid, uuid)
  to authenticated;

-- Table privileges and policies remain unchanged. postgres/function ownership and
-- service_role platform behavior are internal capabilities, not browser paths.
