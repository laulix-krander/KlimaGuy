-- Step 10: bind each current-Conversation image to exactly one stateless MVP turn.
create table public.mvp_ai_turn_media (
  turn_id uuid not null references public.mvp_ai_turns(id) on delete restrict,
  project_media_id uuid not null references public.project_media(id) on delete restrict,
  created_at timestamptz not null default statement_timestamp(),
  primary key (turn_id, project_media_id),
  unique (project_media_id)
);
alter table public.mvp_ai_turn_media enable row level security;
revoke all on public.mvp_ai_turn_media from public,anon,authenticated;
grant select on public.mvp_ai_turn_media to authenticated;
create policy "mvp turn media scoped staff read" on public.mvp_ai_turn_media for select to authenticated using (
 auth.uid() is not null and public.current_app_role() in ('admin','reviewer') and exists(
  select 1 from public.mvp_ai_turns t join public.conversations c on c.id=t.conversation_id
  where t.id=turn_id and c.current_project_id=t.project_id));

create or replace function public.acquire_mvp_ai_turn(target_conversation_id uuid,target_inbound_message_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare c public.conversations%rowtype; m public.conversation_messages%rowtype; b public.conversation_transport_bindings%rowtype;
 turn_row public.mvp_ai_turns%rowtype; project_title text; inbound_text text; transcript jsonb; media_context jsonb;
begin
 select * into c from public.conversations where id=target_conversation_id for update;
 if not found or c.status<>'open' or c.engine_owner<>'mvp' or c.current_project_id is null then return jsonb_build_object('status','not_applicable'); end if;
 select * into m from public.conversation_messages where id=target_inbound_message_id for update;
 if not found or m.conversation_id<>c.id or m.direction<>'inbound' or m.actor_class<>'customer' or m.message_kind not in ('text','image_reference') then return jsonb_build_object('status','invalid_message'); end if;
 select * into turn_row from public.mvp_ai_turns where inbound_message_id=m.id;
 if found then return jsonb_build_object('status',case when turn_row.status='completed' then 'completed' else 'busy' end,'turn_id',turn_row.id,'outbound_message_id',turn_row.outbound_message_id); end if;
 select * into b from public.conversation_transport_bindings where conversation_id=c.id and provider='whatsapp' and status='active' for update;
 if not found then return jsonb_build_object('status','not_applicable'); end if;
 select title into project_title from public.projects where id=c.current_project_id and deleted_at is null;
 if project_title is null then return jsonb_build_object('status','not_applicable'); end if;
 if m.message_kind='text' then select body into inbound_text from public.conversation_message_text where message_id=m.id;
 else select caption into inbound_text from public.transport_message_attachments where source_message_id=m.id; end if;
 if m.message_kind='text' and inbound_text is null then return jsonb_build_object('status','invalid_message'); end if;
 insert into public.mvp_ai_turns(conversation_id,project_id,inbound_message_id,expected_conversation_revision,binding_id,binding_revision)
 values(c.id,c.current_project_id,m.id,c.revision,b.id,b.revision) returning * into turn_row;
 insert into public.mvp_ai_turn_media(turn_id,project_media_id)
 select turn_row.id,pm.id from public.project_media pm where pm.project_id=c.current_project_id and pm.source_conversation_id=c.id
  and pm.source_message_id=m.id and pm.source='whatsapp' and pm.media_type='image' and pm.upload_status='ready' and pm.deleted_at is null
  and pm.mime_type in ('image/jpeg','image/png','image/webp') on conflict do nothing;
 select coalesce(jsonb_agg(item order by (item->>'sequence')::integer),'[]'::jsonb) into transcript from (
  select jsonb_build_object('message_id',history.id,'sequence',history.sequence,'direction',history.direction,'text',txt.body) item
  from public.conversation_messages history join public.conversation_message_text txt on txt.message_id=history.id
  where history.conversation_id=c.id and history.direction in ('inbound','outbound') and history.sequence<=m.sequence order by history.sequence desc limit 40) bounded;
 select coalesce(jsonb_agg(jsonb_build_object('media_id',pm.id,'category',case when pm.category in ('indoor_unit_location','outdoor_unit_location','pipe_route','electrical_connection','condensate_route') then pm.category else 'room_overview' end,
  'mime_type',pm.mime_type,'caption',pm.caption,'storage_bucket',pm.storage_bucket,'storage_path',pm.storage_path,'file_size_bytes',pm.file_size_bytes)),'[]'::jsonb)
 into media_context from public.mvp_ai_turn_media tm join public.project_media pm on pm.id=tm.project_media_id where tm.turn_id=turn_row.id;
 return jsonb_build_object('status','acquired','turn_id',turn_row.id,'turn',jsonb_build_object('inbound_message_id',m.id,'conversation_id',c.id,
  'expected_conversation_revision',c.revision,'binding_id',b.id,'binding_revision',b.revision,'project_id',c.current_project_id),
  'project',jsonb_build_object('title',project_title),'inbound',jsonb_build_object('message_id',m.id,'text',inbound_text),'transcript',transcript,'ready_media',media_context);
end$$;

create function public.revalidate_mvp_ai_turn(target_turn_id uuid) returns boolean language sql security definer set search_path=public,pg_temp stable as $$
 select exists(select 1 from public.mvp_ai_turns t join public.conversations c on c.id=t.conversation_id
 join public.conversation_transport_bindings b on b.id=t.binding_id
 where t.id=target_turn_id and t.status='running' and c.status='open' and c.engine_owner='mvp' and c.current_project_id=t.project_id
 and c.revision=t.expected_conversation_revision and b.status='active' and b.revision=t.binding_revision
 and not exists(select 1 from public.mvp_ai_turn_media tm join public.project_media pm on pm.id=tm.project_media_id
  where tm.turn_id=t.id and (pm.project_id<>t.project_id or pm.source_conversation_id<>t.conversation_id or pm.upload_status<>'ready' or pm.deleted_at is not null)));
$$;
revoke all on function public.revalidate_mvp_ai_turn(uuid) from public,anon,authenticated;
grant execute on function public.revalidate_mvp_ai_turn(uuid) to service_role;
