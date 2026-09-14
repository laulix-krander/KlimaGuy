-- Step 7: one idempotent MVP turn per inbound message. Provider inference stays outside
-- PostgreSQL; context acquisition and the final facts/outbound commit are fenced here.
create type public.mvp_ai_turn_status as enum ('running', 'completed', 'failed');

create table public.mvp_ai_turns (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete restrict,
  project_id uuid not null references public.projects(id) on delete restrict,
  inbound_message_id uuid not null references public.conversation_messages(id) on delete restrict,
  expected_conversation_revision integer not null check (expected_conversation_revision > 0),
  binding_id uuid not null references public.conversation_transport_bindings(id) on delete restrict,
  binding_revision integer not null check (binding_revision > 0),
  status public.mvp_ai_turn_status not null default 'running',
  qualification_status text check (qualification_status is null or qualification_status in ('in_progress','ready_for_offer','needs_human')),
  needs_human boolean,
  human_reason text check (human_reason is null or human_reason in ('customer_request','conflicting_information','safety_concern','unsupported_request','requires_site_check')),
  outbound_message_id uuid references public.conversation_messages(id) on delete restrict,
  failure_code text check (failure_code is null or failure_code in ('provider_failure','invalid_provider_output','commit_failed')),
  created_at timestamptz not null default statement_timestamp(),
  completed_at timestamptz,
  unique (inbound_message_id)
);

create index mvp_ai_turns_conversation_created on public.mvp_ai_turns(conversation_id, created_at desc);
alter table public.mvp_ai_turns enable row level security;
revoke all on public.mvp_ai_turns from public, anon, authenticated;
grant select on public.mvp_ai_turns to authenticated;
create policy "mvp turns scoped staff read" on public.mvp_ai_turns for select to authenticated using (
  auth.uid() is not null and public.current_app_role() in ('admin','reviewer') and
  exists (select 1 from public.conversations c where c.id=conversation_id and c.current_project_id=project_id)
);

create function public.acquire_mvp_ai_turn(target_conversation_id uuid, target_inbound_message_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare c public.conversations%rowtype; m public.conversation_messages%rowtype;
 b public.conversation_transport_bindings%rowtype; turn_row public.mvp_ai_turns%rowtype;
 project_title text; inbound_text text; transcript jsonb;
begin
 select * into c from public.conversations where id=target_conversation_id for update;
 if not found or c.status<>'open' or c.engine_owner<>'mvp' or c.current_project_id is null then
   return jsonb_build_object('status','not_applicable');
 end if;
 select * into m from public.conversation_messages where id=target_inbound_message_id for update;
 if not found or m.conversation_id<>c.id or m.direction<>'inbound' or m.actor_class<>'customer' or m.message_kind<>'text' then
   return jsonb_build_object('status','invalid_message');
 end if;
 select * into turn_row from public.mvp_ai_turns where inbound_message_id=m.id;
 if found then
   return jsonb_build_object('status',case when turn_row.status='completed' then 'completed' else 'busy' end,
     'turn_id',turn_row.id,'outbound_message_id',turn_row.outbound_message_id);
 end if;
 select * into b from public.conversation_transport_bindings
 where conversation_id=c.id and provider='whatsapp' and status='active' for update;
 if not found then return jsonb_build_object('status','not_applicable'); end if;
 select title into project_title from public.projects where id=c.current_project_id and deleted_at is null;
 if project_title is null then return jsonb_build_object('status','not_applicable'); end if;
 select body into inbound_text from public.conversation_message_text where message_id=m.id;
 if inbound_text is null then return jsonb_build_object('status','invalid_message'); end if;
 insert into public.mvp_ai_turns(conversation_id,project_id,inbound_message_id,expected_conversation_revision,binding_id,binding_revision)
 values(c.id,c.current_project_id,m.id,c.revision,b.id,b.revision) returning * into turn_row;
 select coalesce(jsonb_agg(item order by (item->>'sequence')::integer),'[]'::jsonb) into transcript from (
   select jsonb_build_object('message_id',history.id,'sequence',history.sequence,'direction',history.direction,'text',text.body) item
   from public.conversation_messages history join public.conversation_message_text text on text.message_id=history.id
   where history.conversation_id=c.id and history.direction in ('inbound','outbound') and history.sequence<=m.sequence
   order by history.sequence desc limit 40
 ) bounded;
 return jsonb_build_object('status','acquired','turn_id',turn_row.id,'turn',jsonb_build_object(
   'inbound_message_id',m.id,'conversation_id',c.id,'expected_conversation_revision',c.revision,
   'binding_id',b.id,'binding_revision',b.revision,'project_id',c.current_project_id),
   'project',jsonb_build_object('title',project_title),'inbound',jsonb_build_object('message_id',m.id,'text',inbound_text),
   'transcript',transcript,'ready_media','[]'::jsonb);
end $$;

create function public.commit_mvp_ai_turn(target_turn_id uuid, target_facts_patch jsonb,
 target_reply_text text, target_qualification_status text, target_needs_human boolean, target_human_reason text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare turn_row public.mvp_ai_turns%rowtype; c public.conversations%rowtype;
 b public.conversation_transport_bindings%rowtype; outbound_id uuid:=gen_random_uuid(); next_sequence integer;
begin
 select * into turn_row from public.mvp_ai_turns where id=target_turn_id for update;
 if not found then raise exception 'mvp_turn_not_found'; end if;
 if turn_row.status='completed' then return jsonb_build_object('status','completed','outbound_message_id',turn_row.outbound_message_id); end if;
 if turn_row.status<>'running' then return jsonb_build_object('status','stale'); end if;
 select * into c from public.conversations where id=turn_row.conversation_id for update;
 select * into b from public.conversation_transport_bindings where id=turn_row.binding_id for update;
 if c.status<>'open' or c.engine_owner<>'mvp' or c.current_project_id<>turn_row.project_id
   or c.revision<>turn_row.expected_conversation_revision or b.status<>'active' or b.revision<>turn_row.binding_revision then
   update public.mvp_ai_turns set status='failed',failure_code='commit_failed',completed_at=statement_timestamp() where id=turn_row.id;
   return jsonb_build_object('status','stale');
 end if;
 perform public.apply_mvp_project_fact_patch(turn_row.project_id,target_facts_patch);
 next_sequence:=coalesce((select max(sequence) from public.conversation_messages where conversation_id=c.id),0)+1;
 insert into public.conversation_messages(id,conversation_id,sequence,direction,message_kind,actor_class,occurred_at,reply_to_message_id,idempotency_key)
 values(outbound_id,c.id,next_sequence,'outbound','text','ai',statement_timestamp(),turn_row.inbound_message_id,'mvp-turn:'||turn_row.id);
 insert into public.conversation_message_text(message_id,body) values(outbound_id,target_reply_text);
 insert into public.transport_delivery_commands(internal_message_id,conversation_id,transport_binding_id,transport_identity_id)
 values(outbound_id,c.id,b.id,b.transport_identity_id);
 update public.mvp_ai_turns set status='completed',qualification_status=target_qualification_status,
   needs_human=target_needs_human,human_reason=target_human_reason,outbound_message_id=outbound_id,completed_at=statement_timestamp()
 where id=turn_row.id;
 return jsonb_build_object('status','completed','outbound_message_id',outbound_id);
end $$;

create function public.fail_mvp_ai_turn(target_turn_id uuid, target_failure_code text)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if target_failure_code not in ('provider_failure','invalid_provider_output','commit_failed') then raise exception 'invalid_failure_code'; end if;
 update public.mvp_ai_turns set status='failed',failure_code=target_failure_code,completed_at=statement_timestamp()
 where id=target_turn_id and status='running';
end $$;

revoke all on function public.acquire_mvp_ai_turn(uuid,uuid),
 public.commit_mvp_ai_turn(uuid,jsonb,text,text,boolean,text),public.fail_mvp_ai_turn(uuid,text) from public,anon,authenticated;
grant execute on function public.acquire_mvp_ai_turn(uuid,uuid),
 public.commit_mvp_ai_turn(uuid,jsonb,text,text,boolean,text),public.fail_mvp_ai_turn(uuid,text) to service_role;

comment on table public.mvp_ai_turns is 'Idempotency and lifecycle fence for provider-independent MVP AI turns; no provider memory or prompt content.';
