alter table project_notes
  add column deleted_at timestamptz null;

create index project_notes_active_project_created_idx
  on project_notes(project_id, created_at desc)
  where deleted_at is null;

drop policy if exists "notes read" on project_notes;
drop policy if exists "notes insert" on project_notes;
drop policy if exists "notes update" on project_notes;

create policy "project notes read active" on project_notes
  for select
  using (
    auth.uid() is not null
    and current_app_role() in ('admin', 'reviewer')
    and deleted_at is null
    and exists (
      select 1
      from projects
      where projects.id = project_notes.project_id
        and projects.deleted_at is null
    )
  );

create policy "project notes insert active" on project_notes
  for insert
  with check (
    auth.uid() is not null
    and current_app_role() in ('admin', 'reviewer')
    and created_by = auth.uid()
    and deleted_at is null
    and exists (
      select 1
      from projects
      where projects.id = project_notes.project_id
        and projects.deleted_at is null
    )
  );

create policy "project notes update active admin" on project_notes
  for update
  using (
    auth.uid() is not null
    and current_app_role() = 'admin'
    and deleted_at is null
  )
  with check (
    auth.uid() is not null
    and current_app_role() = 'admin'
    and exists (
      select 1
      from projects
      where projects.id = project_notes.project_id
        and projects.deleted_at is null
    )
  );

create policy "project notes update own active reviewer" on project_notes
  for update
  using (
    auth.uid() is not null
    and current_app_role() = 'reviewer'
    and created_by = auth.uid()
    and deleted_at is null
  )
  with check (
    auth.uid() is not null
    and current_app_role() = 'reviewer'
    and created_by = auth.uid()
    and exists (
      select 1
      from projects
      where projects.id = project_notes.project_id
        and projects.deleted_at is null
    )
  );

create or replace function prevent_project_note_protected_field_updates()
returns trigger
language plpgsql
as $$
begin
  if new.id is distinct from old.id
    or new.project_id is distinct from old.project_id
    or new.created_by is distinct from old.created_by
    or new.created_at is distinct from old.created_at then
    raise exception 'project note protected fields cannot be changed';
  end if;

  if old.deleted_at is not null and new.deleted_at is distinct from old.deleted_at then
    raise exception 'project note restore is not allowed';
  end if;

  return new;
end;
$$;

create trigger project_notes_protected_fields_guard
  before update on project_notes
  for each row
  execute function prevent_project_note_protected_field_updates();
