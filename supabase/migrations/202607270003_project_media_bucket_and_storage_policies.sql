-- AP-12-01-03: private project media bucket and least-privilege object access.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'project-media',
  'project-media',
  false,
  25000000,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']::text[]
)
on conflict (id) do update
set name = excluded.name,
    public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- Pending reservations are intentionally invisible through the normal table
-- SELECT policies. This narrow helper therefore performs the required DB-first
-- reservation check without weakening project_media SELECT access.
create function public.can_insert_project_media_storage_object(
  requested_bucket text,
  requested_name text
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    auth.uid() is not null
    and public.current_app_role() = 'admin'
    and requested_bucket = 'project-media'
    and exists (
      select 1
      from public.project_media
      join public.projects on projects.id = project_media.project_id
      where project_media.uploaded_by = auth.uid()
        and project_media.storage_bucket = requested_bucket
        and project_media.storage_path = requested_name
        and project_media.upload_status = 'pending'
        and project_media.deleted_at is null
        and projects.deleted_at is null
    );
$$;

revoke all on function public.can_insert_project_media_storage_object(text, text)
  from public, anon;
grant execute on function public.can_insert_project_media_storage_object(text, text)
  to authenticated;

revoke all privileges on table storage.objects from public, anon, authenticated;
grant select, insert on table storage.objects to authenticated;

create policy "project media storage insert active admin"
  on storage.objects
  for insert
  to authenticated
  with check (
    auth.uid() is not null
    and public.current_app_role() = 'admin'
    and bucket_id = 'project-media'
    and public.can_insert_project_media_storage_object(bucket_id, name)
  );

create policy "project media storage select active admin"
  on storage.objects
  for select
  to authenticated
  using (
    auth.uid() is not null
    and public.current_app_role() = 'admin'
    and bucket_id = 'project-media'
    and exists (
      select 1
      from public.project_media
      join public.projects on projects.id = project_media.project_id
      where project_media.storage_bucket = storage.objects.bucket_id
        and project_media.storage_path = storage.objects.name
        and project_media.upload_status = 'ready'
        and project_media.deleted_at is null
        and projects.deleted_at is null
    )
  );

create policy "project media storage select active reviewer"
  on storage.objects
  for select
  to authenticated
  using (
    auth.uid() is not null
    and public.current_app_role() = 'reviewer'
    and bucket_id = 'project-media'
    and exists (
      select 1
      from public.project_media
      join public.projects on projects.id = project_media.project_id
      where project_media.storage_bucket = storage.objects.bucket_id
        and project_media.storage_path = storage.objects.name
        and project_media.upload_status = 'ready'
        and project_media.deleted_at is null
        and projects.deleted_at is null
    )
  );

-- The pending project_media row must exist before Storage INSERT, and only its
-- exact reserved path is accepted. AP-12-02 will finalize ready objects; failed
-- uploads and orphaned objects require later cleanup and reconciliation.
-- No normal UPDATE or DELETE object policy exists. service_role bypasses RLS and
-- is not a browser, upload, or download path; it requires no additional policy.
