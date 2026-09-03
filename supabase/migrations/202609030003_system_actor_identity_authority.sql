-- AP-16-06-05D-A: stable attribution identity; Auth users are never created by SQL.
alter type public.app_role add value if not exists 'system';

create table public.system_actor_registry (
  system_actor_key text primary key check (system_actor_key = 'klimaguy_system'),
  auth_user_id uuid not null unique references auth.users(id) on delete restrict,
  created_at timestamptz not null default statement_timestamp(),
  verified_at timestamptz not null default statement_timestamp()
);
alter table public.system_actor_registry enable row level security;
revoke all on table public.system_actor_registry from public, anon, authenticated;

create function public.guard_system_actor_profile()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if exists (select 1 from auth.users u where u.id = old.id and u.raw_app_meta_data ->> 'system_actor_key' = 'klimaguy_system')
    and (tg_op = 'DELETE' or not (auth.role() = 'service_role' and new.role::text = 'system')) then
    raise exception 'system_actor_profile_protected';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;
create trigger system_actor_profile_guard before update or delete on public.profiles
for each row execute function public.guard_system_actor_profile();
revoke execute on function public.guard_system_actor_profile() from public, anon, authenticated;

create function public.register_system_actor(stable_actor_key text, target_auth_user_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare existing_id uuid; profile_role text;
begin
  if auth.role() is distinct from 'service_role' then return jsonb_build_object('status','not_authorized'); end if;
  if stable_actor_key is distinct from 'klimaguy_system' or target_auth_user_id is null then
    return jsonb_build_object('status','invalid_actor');
  end if;
  perform pg_advisory_xact_lock(hashtextextended(stable_actor_key, 16060501));
  select r.auth_user_id into existing_id from public.system_actor_registry r where r.system_actor_key = stable_actor_key for update;
  if found then
    if existing_id <> target_auth_user_id then return jsonb_build_object('status','conflict'); end if;
    return public.verify_system_actor(stable_actor_key);
  end if;
  if not exists (select 1 from auth.users u where u.id=target_auth_user_id and u.raw_app_meta_data ->> 'system_actor_key'=stable_actor_key) then
    return jsonb_build_object('status','invalid_actor');
  end if;
  select p.role::text into profile_role from public.profiles p where p.id=target_auth_user_id for update;
  if profile_role is distinct from 'reviewer' and profile_role is distinct from 'system' then
    return jsonb_build_object('status','invalid_actor');
  end if;
  insert into public.system_actor_registry(system_actor_key,auth_user_id) values(stable_actor_key,target_auth_user_id);
  update public.profiles set role='system'::text::public.app_role, display_name='KlimaGuy System' where id=target_auth_user_id;
  insert into public.audit_log(actor_id,entity_type,entity_id,action,metadata)
  values(target_auth_user_id,'system_actor',target_auth_user_id,'system_actor_registered',jsonb_build_object('system_actor_key',stable_actor_key,'result','provisioned'));
  return jsonb_build_object('status','provisioned','auth_user_id',target_auth_user_id);
exception when unique_violation then return jsonb_build_object('status','conflict');
end $$;

create function public.verify_system_actor(stable_actor_key text default 'klimaguy_system')
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare actor_id uuid;
begin
  if auth.role() is distinct from 'service_role' then return jsonb_build_object('status','not_authorized'); end if;
  if stable_actor_key is distinct from 'klimaguy_system' then return jsonb_build_object('status','invalid_actor'); end if;
  select r.auth_user_id into actor_id from public.system_actor_registry r where r.system_actor_key=stable_actor_key;
  if actor_id is null then return jsonb_build_object('status','not_provisioned'); end if;
  if not exists (select 1 from auth.users u join public.profiles p on p.id=u.id where u.id=actor_id and u.raw_app_meta_data ->> 'system_actor_key'=stable_actor_key and p.role::text='system') then
    return jsonb_build_object('status','invalid_actor');
  end if;
  update public.system_actor_registry set verified_at=statement_timestamp() where system_actor_key=stable_actor_key;
  return jsonb_build_object('status','verified','auth_user_id',actor_id);
end $$;

create function public.resolve_system_actor()
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if auth.role() is distinct from 'service_role' then return jsonb_build_object('status','not_authorized'); end if;
  return public.verify_system_actor('klimaguy_system');
end $$;

revoke execute on function public.register_system_actor(text,uuid), public.verify_system_actor(text), public.resolve_system_actor() from public, anon, authenticated;
grant execute on function public.register_system_actor(text,uuid), public.verify_system_actor(text), public.resolve_system_actor() to service_role;
