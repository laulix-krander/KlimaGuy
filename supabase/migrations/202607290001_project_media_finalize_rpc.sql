-- AP-12-02-HF-03: atomically verify the reserved object and finalize its media row.
create function public.finalize_project_media_upload(
  target_media_id uuid,
  target_project_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public, storage, pg_temp
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

  update public.project_media as pm
  set upload_status = 'ready'
  from public.projects as p, storage.objects as so
  where pm.id = target_media_id
    and pm.project_id = target_project_id
    and pm.uploaded_by = actor_id
    and pm.deleted_at is null
    and pm.upload_status = 'pending'
    and pm.storage_bucket = 'project-media'
    and p.id = pm.project_id
    and p.deleted_at is null
    and so.bucket_id = pm.storage_bucket
    and so.name = pm.storage_path
    and (so.metadata ->> 'size')::bigint = pm.file_size_bytes
    and so.metadata ->> 'mimetype' = pm.mime_type;

  get diagnostics affected_rows = row_count;
  return affected_rows = 1;
end;
$$;

revoke execute
on function public.finalize_project_media_upload(uuid, uuid)
from public, anon, authenticated;

grant execute
on function public.finalize_project_media_upload(uuid, uuid)
to authenticated;

