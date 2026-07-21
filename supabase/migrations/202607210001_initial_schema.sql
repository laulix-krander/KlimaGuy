create extension if not exists pgcrypto;
create type app_role as enum ('admin','reviewer');
create type project_status as enum ('new','collecting_information','technical_review','quote_draft','human_review','quote_sent','accepted','rejected','closed');
create type project_class as enum ('A','B','C','D');
create table profiles (id uuid primary key references auth.users(id) on delete cascade, display_name text, role app_role not null default 'reviewer', created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table customers (id uuid primary key default gen_random_uuid(), first_name text not null, last_name text not null, email text, phone text, created_by uuid not null references auth.users(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz);
create table projects (id uuid primary key default gen_random_uuid(), customer_id uuid not null references customers(id), title text not null, status project_status not null default 'new', project_class project_class, installation_address text, postal_code text, city text, summary text, requires_human_review boolean not null default true, created_by uuid not null references auth.users(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz);
create table project_notes (id uuid primary key default gen_random_uuid(), project_id uuid not null references projects(id) on delete cascade, content text not null, created_by uuid not null references auth.users(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table audit_log (id uuid primary key default gen_random_uuid(), actor_id uuid references auth.users(id), entity_type text not null, entity_id uuid, action text not null, metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now());
create or replace function set_updated_at() returns trigger language plpgsql as $$ begin new.updated_at = now(); return new; end; $$;
create trigger profiles_updated before update on profiles for each row execute function set_updated_at();
create trigger customers_updated before update on customers for each row execute function set_updated_at();
create trigger projects_updated before update on projects for each row execute function set_updated_at();
create trigger project_notes_updated before update on project_notes for each row execute function set_updated_at();
create index customers_active_idx on customers(updated_at desc) where deleted_at is null;
create index projects_active_status_idx on projects(status, updated_at desc) where deleted_at is null;
create index projects_customer_idx on projects(customer_id) where deleted_at is null;
create index project_notes_project_idx on project_notes(project_id, created_at desc);
create or replace function current_app_role() returns app_role language sql stable security definer set search_path = public as $$ select role from profiles where id = auth.uid() $$;
alter table profiles enable row level security; alter table customers enable row level security; alter table projects enable row level security; alter table project_notes enable row level security; alter table audit_log enable row level security;
create policy "profiles read own or admin" on profiles for select using (id = auth.uid() or current_app_role() = 'admin');
create policy "admins manage profiles" on profiles for all using (current_app_role() = 'admin') with check (current_app_role() = 'admin');
create policy "admins read customers" on customers for select using (current_app_role() in ('admin','reviewer'));
create policy "admins insert customers" on customers for insert with check (current_app_role() = 'admin' and created_by = auth.uid());
create policy "admins update customers" on customers for update using (current_app_role() = 'admin') with check (current_app_role() = 'admin');
create policy "projects read" on projects for select using (current_app_role() in ('admin','reviewer'));
create policy "admins insert projects" on projects for insert with check (current_app_role() = 'admin' and created_by = auth.uid() and requires_human_review = true);
create policy "admins update projects" on projects for update using (current_app_role() = 'admin') with check (current_app_role() = 'admin');
create policy "reviewers update project review fields" on projects for update using (current_app_role() = 'reviewer') with check (current_app_role() = 'reviewer');
create policy "notes read" on project_notes for select using (current_app_role() in ('admin','reviewer'));
create policy "notes insert" on project_notes for insert with check (current_app_role() in ('admin','reviewer') and created_by = auth.uid());
create policy "notes update" on project_notes for update using (current_app_role() in ('admin','reviewer')) with check (current_app_role() in ('admin','reviewer'));
revoke all on audit_log from anon, authenticated;
create or replace function prevent_reviewer_project_field_updates() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if current_app_role() = 'reviewer' and (
    new.customer_id is distinct from old.customer_id or new.title is distinct from old.title or
    new.installation_address is distinct from old.installation_address or new.postal_code is distinct from old.postal_code or
    new.city is distinct from old.city or new.summary is distinct from old.summary or
    new.requires_human_review is distinct from old.requires_human_review or new.deleted_at is distinct from old.deleted_at
  ) then raise exception 'reviewers may only update review fields'; end if;
  return new;
end; $$;
create trigger reviewer_project_update_guard before update on projects for each row execute function prevent_reviewer_project_field_updates();
