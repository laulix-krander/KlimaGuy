create extension if not exists pg_trgm;
alter table project_notes add column if not exists deleted_at timestamptz;

create index if not exists customers_search_idx on customers using gin ((first_name || ' ' || last_name || ' ' || coalesce(email, '') || ' ' || coalesce(phone, '')) gin_trgm_ops) where deleted_at is null;
create index if not exists projects_filter_idx on projects(status, project_class, requires_human_review, updated_at desc) where deleted_at is null;
create index if not exists project_notes_active_project_idx on project_notes(project_id, created_at) where deleted_at is null;
create index if not exists audit_log_entity_idx on audit_log(entity_type, entity_id, created_at desc);

create or replace function prevent_reviewer_project_field_updates() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if current_app_role() = 'reviewer' and (
    new.customer_id is distinct from old.customer_id or new.title is distinct from old.title or
    new.installation_address is distinct from old.installation_address or new.postal_code is distinct from old.postal_code or
    new.city is distinct from old.city or new.deleted_at is distinct from old.deleted_at
  ) then raise exception 'reviewers may only update status, project class, summary and review flag'; end if;
  return new;
end; $$;

create or replace function prevent_note_unauthorized_updates() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if current_app_role() = 'reviewer' and old.created_by is distinct from auth.uid() then
    raise exception 'reviewers may only update own notes';
  end if;
  return new;
end; $$;

drop trigger if exists note_update_guard on project_notes;
create trigger note_update_guard before update on project_notes for each row execute function prevent_note_unauthorized_updates();

create or replace function create_audit_event(
  p_entity_type text,
  p_entity_id uuid,
  p_action text,
  p_metadata jsonb default '{}'::jsonb
) returns void language plpgsql security definer set search_path = public as $$
begin
  insert into audit_log(actor_id, entity_type, entity_id, action, metadata)
  values (auth.uid(), p_entity_type, p_entity_id, p_action, coalesce(p_metadata, '{}'::jsonb));
end; $$;

revoke all on function create_audit_event(text, uuid, text, jsonb) from public;
grant execute on function create_audit_event(text, uuid, text, jsonb) to authenticated;

drop policy if exists "notes read" on project_notes;
create policy "notes read active" on project_notes for select using (current_app_role() in ('admin','reviewer') and deleted_at is null);

create policy "audit read for internal users" on audit_log for select using (current_app_role() in ('admin','reviewer'));

grant select on audit_log to authenticated;

create or replace function is_allowed_project_status_transition(p_from project_status, p_to project_status) returns boolean language sql immutable as $$
  select p_from = p_to or case p_from
    when 'new' then p_to in ('collecting_information','rejected','closed')
    when 'collecting_information' then p_to in ('technical_review','rejected','closed')
    when 'technical_review' then p_to in ('collecting_information','quote_draft','human_review','rejected','closed')
    when 'quote_draft' then p_to in ('technical_review','human_review','quote_sent','rejected','closed')
    when 'human_review' then p_to in ('technical_review','quote_draft','quote_sent','rejected','closed')
    when 'quote_sent' then p_to in ('accepted','rejected','closed')
    when 'accepted' then p_to = 'closed'
    when 'rejected' then p_to = 'closed'
    when 'closed' then false
  end;
$$;

create or replace function prevent_invalid_project_status_transition() returns trigger language plpgsql as $$
begin
  if not is_allowed_project_status_transition(old.status, new.status) then
    raise exception 'invalid project status transition';
  end if;
  return new;
end; $$;

drop trigger if exists project_status_transition_guard on projects;
create trigger project_status_transition_guard before update of status on projects for each row execute function prevent_invalid_project_status_transition();
