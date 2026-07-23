create or replace function public.soft_delete_project_note(
  target_note_id uuid,
  target_project_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor_id uuid := auth.uid();
  actor_role text := public.current_app_role();
  affected_rows integer := 0;
begin
  if actor_id is null then
    return false;
  end if;

  if actor_role not in ('admin', 'reviewer') then
    return false;
  end if;

  if not exists (
    select 1
    from public.projects
    where public.projects.id = target_project_id
      and public.projects.deleted_at is null
  ) then
    return false;
  end if;

  update public.project_notes
  set deleted_at = statement_timestamp()
  where public.project_notes.id = target_note_id
    and public.project_notes.project_id = target_project_id
    and public.project_notes.deleted_at is null
    and (
      actor_role = 'admin'
      or (
        actor_role = 'reviewer'
        and public.project_notes.created_by = actor_id
      )
    );

  get diagnostics affected_rows = row_count;

  return affected_rows = 1;
end;
$$;

revoke all on function public.soft_delete_project_note(uuid, uuid) from public;
grant execute on function public.soft_delete_project_note(uuid, uuid) to authenticated;
