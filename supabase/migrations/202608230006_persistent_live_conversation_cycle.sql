-- AP-16-03: internal, provider-independent Message -> Cycle transaction authority.
create type public.conversation_cycle_command_type as enum ('customer_answer','continue_after_intermediate');
create type public.conversation_cycle_command_status as enum ('pending','processing','completed','failed','stale','human_review_required');

create table public.conversation_cycle_commands (
 id uuid primary key default gen_random_uuid(), conversation_id uuid not null references public.conversations(id) on delete restrict,
 source_message_id uuid references public.conversation_messages(id) on delete restrict, command_type public.conversation_cycle_command_type not null,
 idempotency_key text not null check(length(idempotency_key) between 8 and 128), expected_conversation_revision integer not null check(expected_conversation_revision>0),
 expected_runtime_revision integer not null check(expected_runtime_revision>0), expected_knowledge_version integer not null check(expected_knowledge_version>0),
 pending_interaction_id uuid references public.conversation_pending_interactions(id) on delete restrict,
 status public.conversation_cycle_command_status not null default 'pending', result_code text,
 result_runtime_revision integer, result_knowledge_version integer, outbound_message_id uuid references public.conversation_messages(id) on delete restrict,
 created_at timestamptz not null default statement_timestamp(), completed_at timestamptz, failed_at timestamptz,
 unique(conversation_id,idempotency_key),
 check((command_type='customer_answer' and source_message_id is not null and pending_interaction_id is not null) or (command_type='continue_after_intermediate' and source_message_id is null)),
 check((status in ('pending','processing') and completed_at is null and failed_at is null) or (status in ('completed','stale','human_review_required') and completed_at is not null and failed_at is null) or (status='failed' and failed_at is not null and completed_at is null))
);
create unique index one_customer_answer_cycle_per_message on public.conversation_cycle_commands(source_message_id) where command_type='customer_answer';
create unique index one_processing_cycle_per_conversation on public.conversation_cycle_commands(conversation_id) where status='processing';
alter table public.conversation_pending_interactions add column prompt_message_id uuid references public.conversation_messages(id) on delete restrict;

create function public.guard_cycle_command_history() returns trigger language plpgsql set search_path=public,pg_temp as $$ begin
 if old.status in ('completed','stale','human_review_required') or new.id<>old.id or new.conversation_id<>old.conversation_id or new.source_message_id is distinct from old.source_message_id or new.command_type<>old.command_type or new.idempotency_key<>old.idempotency_key or new.expected_runtime_revision<>old.expected_runtime_revision or new.expected_knowledge_version<>old.expected_knowledge_version then raise exception 'cycle_command_immutable'; end if; return new; end $$;
create trigger cycle_command_history_guard before update or delete on public.conversation_cycle_commands for each row execute function public.guard_cycle_command_history();

alter table public.conversation_cycle_commands enable row level security;
revoke all on public.conversation_cycle_commands from public,anon,authenticated;
-- No browser execute grant: the eventual adapter is an internal server authority.
comment on table public.conversation_cycle_commands is 'AP-16-03 CAS/idempotency ledger. Contains opaque identities and result codes only; never message text, normalized answers, phone or provider data.';
comment on column public.conversation_pending_interactions.prompt_message_id is 'Exact internal outbound prompt answered by this interaction; sequence is the stale/cross-question gate.';

create function public.claim_customer_message_cycle(target_message_id uuid) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare m public.conversation_messages%rowtype; c public.conversations%rowtype; r public.conversation_runtime_states%rowtype; p public.conversation_pending_interactions%rowtype; k integer; cmd public.conversation_cycle_commands%rowtype; prompt_sequence integer;
begin
 select * into m from public.conversation_messages where id=target_message_id; if not found then return jsonb_build_object('success',false,'code','message_not_found'); end if;
 select * into c from public.conversations where id=m.conversation_id for update;
 select * into r from public.conversation_runtime_states where conversation_id=c.id for update;
 select * into cmd from public.conversation_cycle_commands where source_message_id=m.id for update;
 if found and cmd.status in ('completed','stale','human_review_required') then return jsonb_build_object('success',true,'replay',true,'command_id',cmd.id,'status',cmd.status,'result_code',cmd.result_code,'result_runtime_revision',cmd.result_runtime_revision,'result_knowledge_version',cmd.result_knowledge_version,'outbound_message_id',cmd.outbound_message_id); end if;
 if c.status<>'open' or c.current_project_id is null or r.conversation_id is null or r.project_id<>c.current_project_id or r.runtime_status<>'awaiting_customer_answer' then return jsonb_build_object('success',false,'code','conversation_not_processable'); end if;
 if m.direction<>'inbound' or m.actor_class<>'customer' or m.message_kind<>'text' then return jsonb_build_object('success',false,'code','message_not_inbound_customer_text'); end if;
 select * into p from public.conversation_pending_interactions where id=r.active_pending_interaction_id for update;
 if p.id is null or p.status<>'pending' then return jsonb_build_object('success',false,'code','pending_interaction_not_found'); end if;
 select current_version into k from public.project_knowledge_states where project_id=r.project_id for update;
 if p.runtime_revision<>r.revision then return jsonb_build_object('success',false,'code','stale_runtime_revision'); end if;
 if p.expected_knowledge_state_version<>r.knowledge_state_version or p.expected_knowledge_state_version<>k then
  insert into public.conversation_cycle_commands(conversation_id,source_message_id,command_type,idempotency_key,expected_conversation_revision,expected_runtime_revision,expected_knowledge_version,pending_interaction_id,status,result_code,completed_at)
  values(c.id,m.id,'customer_answer','answer:'||m.id,c.revision,r.revision,p.expected_knowledge_state_version,p.id,'stale','stale_knowledge_version',statement_timestamp()) on conflict(source_message_id) where command_type='customer_answer' do nothing returning * into cmd;
  return jsonb_build_object('success',false,'code','stale_knowledge_version','command_id',cmd.id);
 end if;
 select sequence into prompt_sequence from public.conversation_messages where id=p.prompt_message_id;
 if prompt_sequence is null or m.sequence<=prompt_sequence then return jsonb_build_object('success',false,'code','message_precedes_interaction'); end if;
 if cmd.id is null then insert into public.conversation_cycle_commands(conversation_id,source_message_id,command_type,idempotency_key,expected_conversation_revision,expected_runtime_revision,expected_knowledge_version,pending_interaction_id,status)
 values(c.id,m.id,'customer_answer','answer:'||m.id,c.revision,r.revision,k,p.id,'processing') returning * into cmd;
 elsif cmd.status='failed' then update public.conversation_cycle_commands set status='processing',failed_at=null where id=cmd.id returning * into cmd;
 end if;
 return jsonb_build_object('success',true,'replay',false,'command_id',cmd.id,'conversation_id',c.id,'project_id',r.project_id,'pending_interaction_id',p.id,'expected_conversation_revision',c.revision,'expected_runtime_revision',r.revision,'expected_knowledge_version',k,'message_sequence',m.sequence,'prompt_sequence',prompt_sequence);
end $$;
revoke all on function public.claim_customer_message_cycle(uuid) from public,anon,authenticated;
grant execute on function public.claim_customer_message_cycle(uuid) to service_role;

-- The commit authority is intentionally a single transaction. TypeScript computes all domain outcomes;
-- this database boundary only locks/CAS-validates and writes that prevalidated generation.
-- Stable lock order: conversations, conversation_runtime_states, conversation_pending_interactions,
-- project_knowledge_states, conversation_cycle_commands, then component rows/messages.
