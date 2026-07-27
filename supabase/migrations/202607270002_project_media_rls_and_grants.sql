-- AP-12-01-02: least-privilege table access for project media.
-- A missing profile makes current_app_role() return NULL, so every role check also
-- proves that the authenticated actor has an existing profile.
alter table public.project_media enable row level security;

revoke all privileges on table public.project_media from public, anon, authenticated;
grant select, insert on table public.project_media to authenticated;
grant update (category, caption, upload_status) on table public.project_media to authenticated;

create policy "project media select active admin"
  on public.project_media
  for select
  to authenticated
  using (
    auth.uid() is not null
    and public.current_app_role() = 'admin'
    and project_media.deleted_at is null
    and project_media.upload_status = 'ready'
    and exists (
      select 1
      from public.projects
      where projects.id = project_media.project_id
        and projects.deleted_at is null
    )
  );

create policy "project media select active reviewer"
  on public.project_media
  for select
  to authenticated
  using (
    auth.uid() is not null
    and public.current_app_role() = 'reviewer'
    and project_media.deleted_at is null
    and project_media.upload_status = 'ready'
    and exists (
      select 1
      from public.projects
      where projects.id = project_media.project_id
        and projects.deleted_at is null
    )
  );

create policy "project media insert active admin"
  on public.project_media
  for insert
  to authenticated
  with check (
    auth.uid() is not null
    and public.current_app_role() = 'admin'
    and project_media.uploaded_by = auth.uid()
    and project_media.deleted_at is null
    and project_media.storage_bucket = 'project-media'
    and project_media.source = 'manual_upload'
    and project_media.upload_status = 'pending'
    and exists (
      select 1
      from public.projects
      where projects.id = project_media.project_id
        and projects.deleted_at is null
    )
  );

create policy "project media update active admin"
  on public.project_media
  for update
  to authenticated
  using (
    auth.uid() is not null
    and public.current_app_role() = 'admin'
    and project_media.deleted_at is null
    and exists (
      select 1
      from public.projects
      where projects.id = project_media.project_id
        and projects.deleted_at is null
    )
  )
  with check (
    auth.uid() is not null
    and public.current_app_role() = 'admin'
    and project_media.deleted_at is null
    and project_media.storage_bucket = 'project-media'
    and project_media.source = 'manual_upload'
    and project_media.upload_status in ('pending', 'ready', 'failed')
    and exists (
      select 1
      from public.projects
      where projects.id = project_media.project_id
        and projects.deleted_at is null
    )
  );

-- UUID primary keys need no sequence privileges. The column-level UPDATE grant
-- limits normal mutations to metadata and upload finalization; the existing guard
-- keeps protected fields immutable and enforces pending -> ready/failed only.
-- No normal role receives DELETE. service_role bypasses RLS and is not a normal
-- user path; it must never be exposed in a browser or ordinary application client.
