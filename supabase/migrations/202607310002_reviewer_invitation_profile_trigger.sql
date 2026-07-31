create function public.create_reviewer_profile_for_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (id, role)
  values (new.id, 'reviewer'::public.app_role);
  return new;
end;
$$;

revoke execute on function public.create_reviewer_profile_for_auth_user() from public, anon, authenticated;

create trigger reviewer_invitation_profile_trigger
after insert on auth.users
for each row execute function public.create_reviewer_profile_for_auth_user();

create function public.record_reviewer_invitation_audit(target_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null
    or public.current_app_role() is distinct from 'admin'::public.app_role
    or not exists (
      select 1 from public.profiles
      where id = target_user_id and role = 'reviewer'::public.app_role
    ) then
    return false;
  end if;

  insert into public.audit_log (actor_id, entity_type, entity_id, action, metadata, created_at)
  values (auth.uid(), 'auth_user', target_user_id, 'reviewer_invited',
    jsonb_build_object('result_code', 'reviewer_invited'), now());
  return true;
end;
$$;

revoke execute on function public.record_reviewer_invitation_audit(uuid) from public, anon, authenticated;
grant execute on function public.record_reviewer_invitation_audit(uuid) to authenticated;
