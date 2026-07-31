-- AP-14-02-01: role changes are serialized under this transaction-scoped key.
-- profiles currently has no supported direct update path, so browser UPDATE is closed entirely.
revoke update on table public.profiles from anon, authenticated;

create function public.change_user_profile_role(
  target_user_id uuid,
  target_role public.app_role,
  expected_current_role public.app_role
)
returns table (
  result_target_user_id uuid,
  old_role public.app_role,
  new_role public.app_role,
  changed boolean,
  result_code text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor_id uuid := auth.uid();
  actor_role public.app_role;
  current_role public.app_role;
  operation_time timestamptz := statement_timestamp();
begin
  if actor_id is null
    or target_user_id is null
    or target_role is null
    or expected_current_role is null then
    return query select target_user_id, null::public.app_role, null::public.app_role, false, 'forbidden'::text;
    return;
  end if;

  -- One constant lock serializes every role change, including changes to different users.
  perform pg_advisory_xact_lock(14020120260731::bigint);

  select p.role into actor_role
  from public.profiles p
  where p.id = actor_id
  for update;

  if actor_role is distinct from 'admin'::public.app_role then
    return query select target_user_id, null::public.app_role, null::public.app_role, false, 'forbidden'::text;
    return;
  end if;

  if actor_id = target_user_id then
    return query select target_user_id, actor_role, actor_role, false, 'self_change_blocked'::text;
    return;
  end if;

  select p.role into current_role
  from public.profiles p
  where p.id = target_user_id
  for update;

  if not found then
    return query select target_user_id, null::public.app_role, null::public.app_role, false, 'target_not_found'::text;
    return;
  end if;

  if current_role is distinct from expected_current_role then
    return query select target_user_id, current_role, target_role, false, 'role_conflict'::text;
    return;
  end if;

  if current_role = target_role then
    return query select target_user_id, current_role, target_role, false, 'no_change'::text;
    return;
  end if;

  if current_role = 'admin'::public.app_role
    and target_role = 'reviewer'::public.app_role
    and not exists (
      select 1 from public.profiles p
      where p.role = 'admin'::public.app_role and p.id <> target_user_id
    ) then
    return query select target_user_id, current_role, target_role, false, 'last_admin_protected'::text;
    return;
  end if;

  update public.profiles p
  set role = target_role
  where p.id = target_user_id and p.role = expected_current_role;

  if not found then
    raise exception using errcode = '40001', message = 'role changed concurrently';
  end if;

  insert into public.audit_log (actor_id, entity_type, entity_id, action, metadata, created_at)
  values (
    actor_id, 'profile', target_user_id, 'user_role_changed',
    jsonb_build_object('old_role', current_role, 'new_role', target_role, 'result', 'role_changed'),
    operation_time
  );

  return query select target_user_id, current_role, target_role, true, 'role_changed'::text;
end;
$$;

revoke execute on function public.change_user_profile_role(uuid, public.app_role, public.app_role)
  from public, anon, authenticated;
grant execute on function public.change_user_profile_role(uuid, public.app_role, public.app_role)
  to authenticated;
