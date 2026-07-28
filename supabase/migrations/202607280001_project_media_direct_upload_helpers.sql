-- AP-12-02-HF-02: bounded reads for pending reservations and uploaded-object verification.
-- Pending rows remain hidden from the ordinary project_media SELECT policy.
create function public.get_pending_project_media_upload(target_media_id uuid, target_project_id uuid)
returns table (id uuid, project_id uuid, storage_bucket text, storage_path text, stored_filename text,
  mime_type text, file_size_bytes bigint, uploaded_by uuid, upload_status text, deleted_at timestamptz)
language sql stable security definer set search_path = public, pg_temp
as $$
  select pm.id, pm.project_id, pm.storage_bucket, pm.storage_path, pm.stored_filename,
    pm.mime_type, pm.file_size_bytes, pm.uploaded_by, pm.upload_status, pm.deleted_at
  from public.project_media pm join public.projects p on p.id = pm.project_id
  where auth.uid() is not null and public.current_app_role() = 'admin'
    and pm.id = target_media_id and pm.project_id = target_project_id
    and pm.uploaded_by = auth.uid() and pm.upload_status = 'pending'
    and pm.deleted_at is null and p.deleted_at is null;
$$;
revoke all on function public.get_pending_project_media_upload(uuid, uuid) from public, anon;
grant execute on function public.get_pending_project_media_upload(uuid, uuid) to authenticated;

-- Reads only the exact object bound to an active, caller-owned pending reservation.
-- It does not return object content, tokens, URLs, filenames supplied by users, or customer data.
create function public.get_project_media_storage_object_metadata(target_media_id uuid, target_project_id uuid)
returns table (bucket_id text, name text, size bigint, mime_type text)
language sql stable security definer set search_path = public, storage, pg_temp
as $$
  select so.bucket_id, so.name, (so.metadata ->> 'size')::bigint, so.metadata ->> 'mimetype'
  from public.project_media pm
  join public.projects p on p.id = pm.project_id
  join storage.objects so on so.bucket_id = pm.storage_bucket and so.name = pm.storage_path
  where auth.uid() is not null and public.current_app_role() = 'admin'
    and pm.id = target_media_id and pm.project_id = target_project_id
    and pm.uploaded_by = auth.uid() and pm.upload_status = 'pending'
    and pm.deleted_at is null and p.deleted_at is null;
$$;
revoke all on function public.get_project_media_storage_object_metadata(uuid, uuid) from public, anon;
grant execute on function public.get_project_media_storage_object_metadata(uuid, uuid) to authenticated;
