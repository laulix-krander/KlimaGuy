-- Step 6: current, canonical facts for the thin MVP path. This is not a knowledge-history model.
create table public.mvp_project_facts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete restrict,
  fact_key text not null,
  fact_value jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint mvp_project_facts_project_key_unique unique (project_id, fact_key)
);

create index mvp_project_facts_project_idx on public.mvp_project_facts(project_id);
create trigger mvp_project_facts_updated before update on public.mvp_project_facts
for each row execute function public.set_updated_at();

alter table public.mvp_project_facts enable row level security;
revoke all on public.mvp_project_facts from public, anon, authenticated;
grant select on public.mvp_project_facts to authenticated;
create policy "mvp project facts scoped staff read" on public.mvp_project_facts
for select to authenticated
using (
  auth.uid() is not null
  and public.current_app_role() in ('admin', 'reviewer')
  and exists (
    select 1 from public.projects project
    where project.id = project_id and project.deleted_at is null
  )
);

create function public.get_mvp_project_facts(target_project_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare result jsonb;
begin
  if not exists (
    select 1 from public.projects
    where id = target_project_id and deleted_at is null
  ) then
    raise exception 'project_not_found';
  end if;

  select coalesce(
    jsonb_agg(jsonb_build_object('key', fact_key, 'value', fact_value) order by fact_key),
    '[]'::jsonb
  ) into result
  from public.mvp_project_facts
  where project_id = target_project_id;
  return result;
end $$;

create function public.apply_mvp_project_fact_patch(target_project_id uuid, fact_patch jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare item jsonb;
begin
  if not exists (
    select 1 from public.projects
    where id = target_project_id and deleted_at is null
    for update
  ) then
    raise exception 'project_not_found';
  end if;
  if jsonb_typeof(fact_patch) <> 'array' then
    raise exception 'invalid_fact_patch';
  end if;
  if exists (
    select 1 from jsonb_array_elements(fact_patch) element
    group by element->>'key' having count(*) > 1
  ) then
    raise exception 'duplicate_fact_key';
  end if;

  for item in select value from jsonb_array_elements(fact_patch)
  loop
    if jsonb_typeof(item) <> 'object'
      or not (item ? 'key') or not (item ? 'value')
      or (select count(*) from jsonb_object_keys(item)) <> 2
      or jsonb_typeof(item->'key') <> 'string'
    then
      raise exception 'invalid_fact_patch';
    end if;

    insert into public.mvp_project_facts(project_id, fact_key, fact_value)
    values(target_project_id, item->>'key', item->'value')
    on conflict(project_id, fact_key) do update
      set fact_value = excluded.fact_value
      where mvp_project_facts.fact_value is distinct from excluded.fact_value;
  end loop;

  return public.get_mvp_project_facts(target_project_id);
end $$;

revoke all on function public.get_mvp_project_facts(uuid),
  public.apply_mvp_project_fact_patch(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.get_mvp_project_facts(uuid),
  public.apply_mvp_project_fact_patch(uuid, jsonb) to service_role;

comment on table public.mvp_project_facts is
  'Current canonical Project facts for the thin MVP path; conversation history remains in messages.';
