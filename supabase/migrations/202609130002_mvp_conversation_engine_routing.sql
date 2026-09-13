-- Step 4: immutable, Conversation-scoped engine ownership.
create type public.conversation_engine_owner as enum ('legacy','mvp');

alter table public.conversations
  add column engine_owner public.conversation_engine_owner;

-- Every Conversation predating this rollout remains on its historical engine.
update public.conversations set engine_owner='legacy' where engine_owner is null;

create function public.guard_conversation_engine_owner() returns trigger
language plpgsql set search_path=public,pg_temp as $$
begin
  if new.engine_owner is distinct from old.engine_owner
     and coalesce(current_setting('app.conversation_engine_authority',true),'')<>'allowed'
  then raise exception 'conversation_engine_owner_immutable'; end if;
  return new;
end $$;
create trigger conversation_engine_owner_guard before update on public.conversations
for each row execute function public.guard_conversation_engine_owner();

create function public.resolve_conversation_engine_owner(
  target_conversation_id uuid,
  target_provider text,
  target_sender_scope text,
  target_external_identity text,
  proposed_owner public.conversation_engine_owner
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare c public.conversations%rowtype;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'not_authorized'; end if;
  select * into c from public.conversations where id=target_conversation_id for update;
  if not found then raise exception 'conversation_not_found'; end if;
  if not exists(
    select 1 from public.conversation_transport_bindings b
    join public.conversation_transport_identities i on i.id=b.transport_identity_id
    where b.conversation_id=c.id and b.status='active'
      and b.provider=target_provider and i.provider=target_provider
      and i.sender_scope=target_sender_scope and i.external_identity=target_external_identity
  ) then raise exception 'conversation_identity_mismatch'; end if;
  if c.engine_owner is null then
    perform set_config('app.conversation_engine_authority','allowed',true);
    update public.conversations set engine_owner=proposed_owner where id=c.id returning * into c;
  end if;
  return jsonb_build_object('conversation_id',c.id,'engine_owner',c.engine_owner);
end $$;

revoke all on function public.resolve_conversation_engine_owner(uuid,text,text,text,public.conversation_engine_owner) from public,anon,authenticated;
grant execute on function public.resolve_conversation_engine_owner(uuid,text,text,text,public.conversation_engine_owner) to service_role;

-- Recovery must never attach the legacy initial prompt to an MVP Conversation.
create or replace function public.get_first_contact_eligibility(target_conversation_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare c public.conversations%rowtype; r public.conversation_runtime_states%rowtype;
begin
 if auth.role() is distinct from 'service_role' or target_conversation_id is null then return jsonb_build_object('status','invalid_state'); end if;
 select * into c from public.conversations where id=target_conversation_id;
 if not found or c.status<>'open' or c.creation_command_key not like 'whatsapp:%' or c.engine_owner<>'legacy' then return jsonb_build_object('status','not_applicable'); end if;
 if not exists(select 1 from public.conversation_transport_bindings b join public.conversation_transport_identities i on i.id=b.transport_identity_id where b.conversation_id=c.id and b.provider='whatsapp' and b.status='active' and i.status='active' group by b.conversation_id having count(*)=1)
   or not exists(select 1 from public.conversation_messages m where m.conversation_id=c.id and m.direction='inbound') then return jsonb_build_object('status','invalid_state'); end if;
 select * into r from public.conversation_runtime_states where conversation_id=c.id;
 if r.conversation_id is not null and r.runtime_status='awaiting_customer_answer' and r.active_pending_interaction_id is not null and exists(select 1 from public.conversation_runtime_commands x where x.conversation_id=c.id and x.idempotency_key='first-contact-initial-prompt:v1' and x.result_revision=r.revision) then return jsonb_build_object('status','already_initialized'); end if;
 if c.current_project_id is not null and exists(select 1 from public.project_knowledge_claims q where q.project_id=c.current_project_id) then return jsonb_build_object('status','not_applicable'); end if;
 if r.conversation_id is null then return jsonb_build_object('status','healable'); end if;
 if r.runtime_status='idle' and r.active_pending_interaction_id is null and r.active_evidence_request_id is null and not exists(select 1 from public.conversation_runtime_commands x where x.conversation_id=c.id and x.idempotency_key='first-contact-initial-prompt:v1') then return jsonb_build_object('status','healable'); end if;
 return jsonb_build_object('status','not_applicable');
end $$;

create or replace function public.discover_recoverable_first_contacts(target_limit integer default 10)
returns table(conversation_id uuid,recovery_action text) language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if auth.role() is distinct from 'service_role' then raise exception 'not_authorized'; end if;
 return query select c.id,case when r.conversation_id is null or c.customer_id is null or c.current_project_id is null then 'FOUNDATION_REQUIRED' else 'INITIAL_PROMPT_REQUIRED' end::text
 from public.conversations c join public.conversation_transport_bindings b on b.conversation_id=c.id and b.provider='whatsapp' and b.status='active'
 join public.conversation_transport_identities i on i.id=b.transport_identity_id and i.status='active' left join public.conversation_runtime_states r on r.conversation_id=c.id
 where c.status='open' and c.creation_command_key like 'whatsapp:%' and c.engine_owner='legacy'
 and exists(select 1 from public.conversation_messages m where m.conversation_id=c.id and m.direction='inbound')
 and not exists(select 1 from public.conversation_runtime_commands x where x.conversation_id=c.id and x.idempotency_key='first-contact-initial-prompt:v1')
 and (r.conversation_id is null or (r.runtime_status='idle' and r.active_pending_interaction_id is null and r.active_evidence_request_id is null))
 and not exists(select 1 from public.conversation_pending_interactions p where p.conversation_id=c.id and p.status='pending')
 and (c.current_project_id is null or not exists(select 1 from public.project_knowledge_claims q where q.project_id=c.current_project_id))
 group by c.id,c.created_at,r.conversation_id,r.runtime_status,r.active_pending_interaction_id,r.active_evidence_request_id having count(*)=1
 order by c.created_at asc,c.id asc limit least(greatest(coalesce(target_limit,10),0),10);
end $$;
