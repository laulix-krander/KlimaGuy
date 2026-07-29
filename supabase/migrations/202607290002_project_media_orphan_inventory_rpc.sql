-- AP-12-02-09: bounded, admin-only, read-only pending/failed orphan inventory.
create function public.list_project_media_orphan_candidates(
  target_status text,
  target_page integer
)
returns table (
  media_id uuid,
  project_id uuid,
  project_title text,
  upload_status text,
  created_at timestamptz,
  age_hours integer,
  mime_type text,
  file_size_bytes bigint,
  total_count integer
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null or public.current_app_role() is distinct from 'admin' then
    return;
  end if;

  if target_status not in ('all', 'pending', 'failed')
    or target_page is null
    or target_page < 1
    or target_page > 10000 then
    return;
  end if;

  return query
  select
    pm.id,
    pm.project_id,
    p.title,
    pm.upload_status,
    pm.created_at,
    floor(extract(epoch from (statement_timestamp() - pm.created_at)) / 3600)::integer,
    pm.mime_type,
    pm.file_size_bytes,
    count(*) over ()::integer
  from public.project_media pm
  join public.projects p on p.id = pm.project_id
  where pm.deleted_at is null
    and pm.upload_status in ('pending', 'failed')
    and pm.created_at <= statement_timestamp() - interval '24 hours'
    and (target_status = 'all' or pm.upload_status = target_status)
  order by pm.created_at asc, pm.id asc
  limit 50
  offset ((target_page - 1) * 50);
end;
$$;

revoke execute on function public.list_project_media_orphan_candidates(text, integer)
  from public, anon, authenticated;
grant execute on function public.list_project_media_orphan_candidates(text, integer)
  to authenticated;

-- No Storage scan is performed. The function returns neither paths nor filenames,
-- customer data, URLs or tokens and performs no mutation.
