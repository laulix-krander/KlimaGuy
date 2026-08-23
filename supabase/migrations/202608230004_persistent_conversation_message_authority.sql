-- AP-16-01: provider-independent Conversation and append-only Message authority.
create type public.conversation_status as enum ('open','paused','human_review','closed');
create type public.conversation_message_direction as enum ('inbound','outbound','internal');
create type public.conversation_message_kind as enum ('text','image_reference','document_reference','system_notice','internal_note');
create type public.conversation_message_actor as enum ('customer','admin','reviewer','system','ai');

create table public.conversations (
 id uuid primary key default gen_random_uuid(), customer_id uuid references public.customers(id) on delete restrict,
 current_project_id uuid references public.projects(id) on delete restrict, status public.conversation_status not null default 'open',
 revision integer not null default 1 check(revision > 0), creation_command_key text not null check(length(creation_command_key) between 8 and 128),
 created_by uuid not null references auth.users(id) on delete restrict, created_at timestamptz not null default statement_timestamp(),
 updated_at timestamptz not null default statement_timestamp(), unique(created_by,creation_command_key)
);
create index conversations_project on public.conversations(current_project_id,updated_at desc);
create index conversations_customer on public.conversations(customer_id,updated_at desc);
create trigger conversations_updated before update on public.conversations for each row execute function public.set_updated_at();

create table public.conversation_project_assignments (
 id uuid primary key default gen_random_uuid(), conversation_id uuid not null references public.conversations(id) on delete restrict,
 project_id uuid not null references public.projects(id) on delete restrict, assignment_revision integer not null check(assignment_revision > 0),
 action text not null check(action in ('assigned','reassigned')), actor_id uuid not null references auth.users(id) on delete restrict,
 idempotency_key text not null check(length(idempotency_key) between 8 and 128), created_at timestamptz not null default statement_timestamp(),
 unique(conversation_id,assignment_revision), unique(conversation_id,idempotency_key)
);
create table public.conversation_state_commands (
 id uuid primary key default gen_random_uuid(), conversation_id uuid not null references public.conversations(id) on delete restrict,
 command text not null check(command='status_transition'), target_status public.conversation_status not null,
 result_revision integer not null check(result_revision > 0), actor_id uuid not null references auth.users(id) on delete restrict,
 idempotency_key text not null check(length(idempotency_key) between 8 and 128), created_at timestamptz not null default statement_timestamp(),
 unique(conversation_id,idempotency_key)
);

create table public.conversation_messages (
 id uuid primary key default gen_random_uuid(), conversation_id uuid not null references public.conversations(id) on delete restrict,
 sequence integer not null check(sequence > 0), direction public.conversation_message_direction not null,
 message_kind public.conversation_message_kind not null, actor_class public.conversation_message_actor not null,
 occurred_at timestamptz not null, reply_to_message_id uuid references public.conversation_messages(id) on delete restrict,
 idempotency_key text not null check(length(idempotency_key) between 8 and 128), created_at timestamptz not null default statement_timestamp(),
 unique(conversation_id,sequence), unique(conversation_id,idempotency_key), check(reply_to_message_id is null or reply_to_message_id<>id),
 check((message_kind='internal_note')=(direction='internal')),
 check((direction='inbound' and actor_class='customer') or (direction='outbound' and actor_class in ('admin','reviewer','system','ai')) or (direction='internal' and actor_class in ('admin','reviewer','system')))
);
create index conversation_messages_history on public.conversation_messages(conversation_id,sequence);
create table public.conversation_message_text (
 message_id uuid primary key references public.conversation_messages(id) on delete restrict,
 body text not null check(length(body) between 1 and 20000)
);
create table public.conversation_message_references (
 message_id uuid primary key references public.conversation_messages(id) on delete restrict,
 reference_id uuid not null
);

create function public.guard_conversation_state() returns trigger language plpgsql set search_path=public,pg_temp as $$ begin
 if (new.current_project_id is distinct from old.current_project_id or new.status is distinct from old.status or new.revision is distinct from old.revision) and coalesce(current_setting('app.conversation_authority_mutation',true),'')<>'allowed' then raise exception 'conversation_mutation_requires_authority'; end if;
 if new.customer_id is distinct from old.customer_id or new.created_by<>old.created_by or new.creation_command_key<>old.creation_command_key then raise exception 'conversation_identity_immutable'; end if; return new; end $$;
create trigger conversation_state_guard before update on public.conversations for each row execute function public.guard_conversation_state();
create function public.reject_append_only_change() returns trigger language plpgsql set search_path=public,pg_temp as $$ begin raise exception 'append_only_authority'; end $$;
create trigger conversation_messages_append_only before update or delete on public.conversation_messages for each row execute function public.reject_append_only_change();
create trigger conversation_message_text_append_only before update or delete on public.conversation_message_text for each row execute function public.reject_append_only_change();
create trigger conversation_message_references_append_only before update or delete on public.conversation_message_references for each row execute function public.reject_append_only_change();
create trigger conversation_assignments_append_only before update or delete on public.conversation_project_assignments for each row execute function public.reject_append_only_change();
create trigger conversation_state_commands_append_only before update or delete on public.conversation_state_commands for each row execute function public.reject_append_only_change();

create function public.conversation_dto(c public.conversations) returns jsonb language sql immutable set search_path=public,pg_temp as $$ select jsonb_build_object('conversation_id',c.id,'customer_id',c.customer_id,'project_id',c.current_project_id,'status',c.status,'revision',c.revision,'created_at',c.created_at,'updated_at',c.updated_at) $$;
create function public.assert_conversation_admin() returns void language plpgsql security definer set search_path=public,pg_temp as $$ begin if auth.uid() is null or public.current_app_role()<>'admin' then raise exception 'unauthorized'; end if; end $$;

create function public.create_conversation(target_customer_id uuid,target_project_id uuid,target_idempotency_key text) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare c public.conversations%rowtype; now_at timestamptz:=statement_timestamp(); begin perform public.assert_conversation_admin();
 select * into c from public.conversations where created_by=auth.uid() and creation_command_key=target_idempotency_key; if found then if c.customer_id is distinct from target_customer_id or c.current_project_id is distinct from target_project_id then raise exception 'idempotency_conflict'; end if; return public.conversation_dto(c); end if;
 if target_customer_id is not null and not exists(select 1 from public.customers where id=target_customer_id and deleted_at is null) then raise exception 'customer_not_found'; end if;
 if target_project_id is not null and not exists(select 1 from public.projects where id=target_project_id and deleted_at is null) then raise exception 'project_not_found'; end if;
 insert into public.conversations(customer_id,current_project_id,creation_command_key,created_by) values(target_customer_id,target_project_id,target_idempotency_key,auth.uid()) returning * into c;
 if target_project_id is not null then insert into public.conversation_project_assignments(conversation_id,project_id,assignment_revision,action,actor_id,idempotency_key) values(c.id,target_project_id,1,'assigned',auth.uid(),target_idempotency_key); end if;
 insert into public.audit_log(actor_id,entity_type,entity_id,action,metadata) values(auth.uid(),'conversation',c.id,'conversation_created',jsonb_build_object('actor_id',auth.uid(),'conversation_id',c.id,'project_id',c.current_project_id,'revision',c.revision,'timestamp',now_at)); return public.conversation_dto(c); end $$;
-- Initial assignment and controlled admin reassignment use the same CAS authority and preserve history.
create function public.assign_conversation_project(target_conversation_id uuid,target_project_id uuid,expected_revision integer,target_idempotency_key text) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare c public.conversations%rowtype; h public.conversation_project_assignments%rowtype; action_name text; now_at timestamptz:=statement_timestamp(); begin perform public.assert_conversation_admin();
 select * into c from public.conversations where id=target_conversation_id for update; if not found then raise exception 'conversation_not_found'; end if;
 select * into h from public.conversation_project_assignments where conversation_id=c.id and idempotency_key=target_idempotency_key; if found then if h.project_id<>target_project_id then raise exception 'idempotency_conflict'; end if; return public.conversation_dto(c); end if;
 if c.revision<>expected_revision then raise exception 'stale_conversation_revision'; end if; if not exists(select 1 from public.projects where id=target_project_id and deleted_at is null) then raise exception 'project_not_found'; end if;
 if c.current_project_id=target_project_id then return public.conversation_dto(c); end if; action_name:=case when c.current_project_id is null then 'assigned' else 'reassigned' end;
 perform set_config('app.conversation_authority_mutation','allowed',true); update public.conversations set current_project_id=target_project_id,revision=revision+1 where id=c.id and revision=expected_revision returning * into c;
 insert into public.conversation_project_assignments(conversation_id,project_id,assignment_revision,action,actor_id,idempotency_key) values(c.id,target_project_id,c.revision,action_name,auth.uid(),target_idempotency_key);
 insert into public.audit_log(actor_id,entity_type,entity_id,action,metadata) values(auth.uid(),'conversation',c.id,'conversation_project_assigned',jsonb_build_object('actor_id',auth.uid(),'conversation_id',c.id,'project_id',target_project_id,'revision',c.revision,'timestamp',now_at)); return public.conversation_dto(c); end $$;

create function public.transition_conversation_status(target_conversation_id uuid,target_status public.conversation_status,expected_revision integer,target_idempotency_key text) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare c public.conversations%rowtype; cmd public.conversation_state_commands%rowtype; now_at timestamptz:=statement_timestamp(); begin perform public.assert_conversation_admin(); select * into c from public.conversations where id=target_conversation_id for update; if not found then raise exception 'conversation_not_found'; end if;
 select * into cmd from public.conversation_state_commands where conversation_id=c.id and idempotency_key=target_idempotency_key; if found then if cmd.target_status<>target_status then raise exception 'idempotency_conflict'; end if; return public.conversation_dto(c); end if;
 if c.status=target_status then return public.conversation_dto(c); end if; if c.revision<>expected_revision then raise exception 'stale_conversation_revision'; end if;
 if not ((c.status='open' and target_status in ('paused','human_review','closed')) or (c.status in ('paused','human_review') and target_status in ('open','closed'))) then raise exception 'invalid_status_transition'; end if;
 perform set_config('app.conversation_authority_mutation','allowed',true); update public.conversations set status=target_status,revision=revision+1 where id=c.id and revision=expected_revision returning * into c;
 insert into public.conversation_state_commands(conversation_id,command,target_status,result_revision,actor_id,idempotency_key) values(c.id,'status_transition',target_status,c.revision,auth.uid(),target_idempotency_key);
 insert into public.audit_log(actor_id,entity_type,entity_id,action,metadata) values(auth.uid(),'conversation',c.id,'conversation_status_changed',jsonb_build_object('actor_id',auth.uid(),'conversation_id',c.id,'project_id',c.current_project_id,'revision',c.revision,'timestamp',now_at)); return public.conversation_dto(c); end $$;

create function public.message_dto(m public.conversation_messages) returns jsonb language sql stable set search_path=public,pg_temp as $$ select jsonb_build_object('message_id',m.id,'conversation_id',m.conversation_id,'sequence',m.sequence,'direction',m.direction,'kind',m.message_kind,'actor_class',m.actor_class,'content',case when t.message_id is not null then jsonb_build_object('type','text','text',t.body) else jsonb_build_object('type','reference','reference_id',r.reference_id) end,'occurred_at',m.occurred_at,'created_at',m.created_at,'reply_to_message_id',m.reply_to_message_id) from public.conversation_message_text t full join public.conversation_message_references r on false where t.message_id=m.id or r.message_id=m.id $$;
create function public.record_conversation_message(target_conversation_id uuid,target_direction public.conversation_message_direction,target_kind public.conversation_message_kind,target_actor public.conversation_message_actor,target_text text,target_reference_id uuid,target_occurred_at timestamptz,target_reply_to uuid,target_idempotency_key text) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare c public.conversations%rowtype; m public.conversation_messages%rowtype; reply public.conversation_messages%rowtype; seq integer; content jsonb; now_at timestamptz:=statement_timestamp(); begin perform public.assert_conversation_admin();
 select * into c from public.conversations where id=target_conversation_id for update; if not found then raise exception 'conversation_not_found'; end if; if c.status='closed' then raise exception 'conversation_closed'; end if;
 select * into m from public.conversation_messages where conversation_id=c.id and idempotency_key=target_idempotency_key; if found then
  if m.direction<>target_direction or m.message_kind<>target_kind or m.actor_class<>target_actor or m.occurred_at<>target_occurred_at or m.reply_to_message_id is distinct from target_reply_to or
   (target_text is not null and not exists(select 1 from public.conversation_message_text t where t.message_id=m.id and t.body=target_text)) or
   (target_reference_id is not null and not exists(select 1 from public.conversation_message_references r where r.message_id=m.id and r.reference_id=target_reference_id)) then raise exception 'idempotency_conflict'; end if;
  return public.message_dto(m); end if;
 if target_reply_to is not null then select * into reply from public.conversation_messages where id=target_reply_to; if not found then raise exception 'reply_message_not_found'; end if; if reply.conversation_id<>c.id then raise exception 'reply_conversation_mismatch'; end if; end if;
 if target_kind in ('text','system_notice','internal_note') then if target_text is null or length(target_text) not between 1 and 20000 or target_reference_id is not null then raise exception 'invalid_message_content'; end if; else if target_reference_id is null or target_text is not null then raise exception 'invalid_message_content'; end if; end if;
 seq:=coalesce((select max(sequence) from public.conversation_messages where conversation_id=c.id),0)+1;
 insert into public.conversation_messages(conversation_id,sequence,direction,message_kind,actor_class,occurred_at,reply_to_message_id,idempotency_key) values(c.id,seq,target_direction,target_kind,target_actor,target_occurred_at,target_reply_to,target_idempotency_key) returning * into m;
 if target_text is not null then insert into public.conversation_message_text(message_id,body) values(m.id,target_text); else insert into public.conversation_message_references(message_id,reference_id) values(m.id,target_reference_id); end if;
 insert into public.audit_log(actor_id,entity_type,entity_id,action,metadata) values(auth.uid(),'conversation_message',m.id,'conversation_message_recorded',jsonb_build_object('actor_id',auth.uid(),'conversation_id',c.id,'project_id',c.current_project_id,'message_id',m.id,'message_kind',m.message_kind,'direction',m.direction,'sequence',m.sequence,'timestamp',now_at)); return public.message_dto(m); end $$;
create function public.get_conversation(target_conversation_id uuid) returns jsonb language sql security definer set search_path=public,pg_temp as $$ select public.conversation_dto(c) from public.conversations c where c.id=target_conversation_id and auth.uid() is not null and public.current_app_role() in ('admin','reviewer') and (c.current_project_id is not null or public.current_app_role()='admin') $$;
create function public.list_conversation_messages(target_conversation_id uuid,cursor_sequence integer default 0,page_limit integer default 50) returns setof jsonb language sql security definer set search_path=public,pg_temp as $$ select public.message_dto(m) from public.conversation_messages m join public.conversations c on c.id=m.conversation_id where c.id=target_conversation_id and auth.uid() is not null and public.current_app_role() in ('admin','reviewer') and (c.current_project_id is not null or public.current_app_role()='admin') and m.sequence>greatest(cursor_sequence,0) order by m.sequence limit least(greatest(page_limit,1),100) $$;

alter table public.conversations enable row level security; alter table public.conversation_project_assignments enable row level security; alter table public.conversation_state_commands enable row level security; alter table public.conversation_messages enable row level security; alter table public.conversation_message_text enable row level security; alter table public.conversation_message_references enable row level security;
revoke all on public.conversations,public.conversation_project_assignments,public.conversation_state_commands,public.conversation_messages,public.conversation_message_text,public.conversation_message_references from public,anon,authenticated;
grant select on public.conversations,public.conversation_messages,public.conversation_message_text,public.conversation_message_references to authenticated;
create policy "conversation scoped staff read" on public.conversations for select to authenticated using(auth.uid() is not null and public.current_app_role() in ('admin','reviewer') and (current_project_id is not null or public.current_app_role()='admin'));
create policy "message scoped staff read" on public.conversation_messages for select to authenticated using(exists(select 1 from public.conversations c where c.id=conversation_id and auth.uid() is not null and public.current_app_role() in ('admin','reviewer') and (c.current_project_id is not null or public.current_app_role()='admin')));
create policy "message text scoped staff read" on public.conversation_message_text for select to authenticated using(exists(select 1 from public.conversation_messages m join public.conversations c on c.id=m.conversation_id where m.id=message_id and auth.uid() is not null and public.current_app_role() in ('admin','reviewer') and (c.current_project_id is not null or public.current_app_role()='admin')));
create policy "message reference scoped staff read" on public.conversation_message_references for select to authenticated using(exists(select 1 from public.conversation_messages m join public.conversations c on c.id=m.conversation_id where m.id=message_id and auth.uid() is not null and public.current_app_role() in ('admin','reviewer') and (c.current_project_id is not null or public.current_app_role()='admin')));
revoke all on function public.create_conversation(uuid,uuid,text),public.assign_conversation_project(uuid,uuid,integer,text),public.transition_conversation_status(uuid,public.conversation_status,integer,text),public.record_conversation_message(uuid,public.conversation_message_direction,public.conversation_message_kind,public.conversation_message_actor,text,uuid,timestamptz,uuid,text) from public,anon,authenticated;
grant execute on function public.create_conversation(uuid,uuid,text),public.assign_conversation_project(uuid,uuid,integer,text),public.transition_conversation_status(uuid,public.conversation_status,integer,text),public.get_conversation(uuid),public.list_conversation_messages(uuid,integer,integer) to authenticated;
comment on table public.conversation_messages is 'Provider-independent append-only canonical messages; no transport identifiers, payloads, files, runtime state, or Knowledge mutation.';
