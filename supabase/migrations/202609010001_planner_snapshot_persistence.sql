-- AP-16-06-01B: immutable planner/render authority activated atomically with prompt and Pending Interaction.
create table public.conversation_interaction_snapshots (
 id uuid primary key,
 pending_interaction_id uuid not null unique,
 conversation_id uuid not null references public.conversations(id) on delete restrict,
 project_id uuid not null references public.projects(id) on delete restrict,
 runtime_revision integer not null check(runtime_revision > 0),
 knowledge_state_version integer not null check(knowledge_state_version > 0),
 outbound_message_id uuid not null unique,
 outbound_message_sequence integer not null check(outbound_message_sequence > 0),
 snapshot_schema_version integer not null check(snapshot_schema_version = 1),
 selected_action jsonb not null,
 rendered_interaction jsonb not null,
 created_at timestamptz not null default statement_timestamp(),
 constraint planner_snapshot_action_object check(jsonb_typeof(selected_action) = 'object'),
 constraint planner_snapshot_render_object check(jsonb_typeof(rendered_interaction) = 'object'),
 constraint planner_snapshot_size check(octet_length(selected_action::text) + octet_length(rendered_interaction::text) <= 65536),
 constraint planner_snapshot_pending_fk foreign key(pending_interaction_id) references public.conversation_pending_interactions(id) on delete restrict deferrable initially deferred,
 constraint planner_snapshot_message_fk foreign key(outbound_message_id) references public.conversation_messages(id) on delete restrict deferrable initially deferred
);

alter table public.conversation_pending_interactions
 add column snapshot_id uuid,
 add constraint pending_snapshot_fk foreign key(snapshot_id) references public.conversation_interaction_snapshots(id) on delete restrict deferrable initially deferred;
create unique index one_pending_per_planner_snapshot on public.conversation_pending_interactions(snapshot_id) where snapshot_id is not null;

-- Customer-answerable confirmations were already part of the planner contract but the reduced legacy row only allowed ask_* actions.
alter table public.conversation_pending_interactions drop constraint conversation_pending_interactions_selected_action_type_check;
alter table public.conversation_pending_interactions add constraint pending_action_type_check
 check(selected_action_type in ('ask_text','ask_yes_no','ask_approximate_number','offer_assumption'));

create function public.reject_planner_snapshot_change() returns trigger language plpgsql set search_path=public,pg_temp as $$
begin raise exception 'planner_snapshot_immutable'; end $$;
create trigger planner_snapshot_immutable before update or delete on public.conversation_interaction_snapshots
 for each row execute function public.reject_planner_snapshot_change();

create function public.guard_active_planner_snapshot() returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
 if new.runtime_status='awaiting_customer_answer' and not exists(
  select 1 from public.conversation_pending_interactions p
  join public.conversation_interaction_snapshots s on s.id=p.snapshot_id and s.pending_interaction_id=p.id
  where p.id=new.active_pending_interaction_id and p.conversation_id=new.conversation_id and p.project_id=new.project_id
    and p.status='pending' and p.runtime_revision=new.revision and p.expected_knowledge_state_version=new.knowledge_state_version
 ) then raise exception 'active_planner_snapshot_required'; end if;
 return new;
end $$;
create constraint trigger active_planner_snapshot_required after insert or update on public.conversation_runtime_states
 deferrable initially deferred for each row execute function public.guard_active_planner_snapshot();

alter table public.conversation_interaction_snapshots enable row level security;
revoke all on public.conversation_interaction_snapshots from public,anon,authenticated;
grant select on public.conversation_interaction_snapshots to authenticated;
create policy "planner snapshot staff read" on public.conversation_interaction_snapshots for select to authenticated
 using(auth.uid() is not null and public.current_app_role() in ('admin','reviewer') and exists(
  select 1 from public.conversation_runtime_states r where r.conversation_id=conversation_id and r.project_id=project_id
 ));

create function public.planner_snapshot_dto(s public.conversation_interaction_snapshots) returns jsonb language sql stable set search_path=public,pg_temp as $$
 select jsonb_build_object(
  'id',s.id,'pending_interaction_id',s.pending_interaction_id,'conversation_id',s.conversation_id,'project_id',s.project_id,
  'runtime_revision',s.runtime_revision,'knowledge_state_version',s.knowledge_state_version,
  'outbound_message_id',s.outbound_message_id,'outbound_message_sequence',s.outbound_message_sequence,
  'snapshot_schema_version',s.snapshot_schema_version,'selected_action',s.selected_action,
  'rendered_interaction',s.rendered_interaction,'outbound_text',t.body,'created_at',s.created_at
 ) from public.conversation_message_text t where t.message_id=s.outbound_message_id
$$;

create function public.activate_planner_interaction_snapshot(
 target_snapshot_id uuid,target_pending_interaction_id uuid,target_outbound_message_id uuid,target_conversation_id uuid,
 expected_runtime_revision integer,target_idempotency_key text,target_occurred_at timestamptz,target_snapshot jsonb,target_outbound_text text
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare c public.conversations%rowtype; r public.conversation_runtime_states%rowtype; s public.conversation_interaction_snapshots%rowtype;
 action jsonb; rendered jsonb; knowledge_version integer; next_revision integer; next_sequence integer;
begin
 if auth.role()<>'service_role' then raise exception 'machine_authority_required'; end if;
 if target_snapshot is null or jsonb_typeof(target_snapshot)<>'object' or target_snapshot->>'snapshot_schema_version'<>'1' then raise exception 'invalid_snapshot_contract'; end if;
 action:=target_snapshot->'selected_action'; rendered:=target_snapshot->'rendered_interaction';
 if jsonb_typeof(action)<>'object' or jsonb_typeof(rendered)<>'object' or octet_length(target_snapshot::text)>65536 then raise exception 'invalid_snapshot_contract'; end if;
 select * into c from public.conversations where id=target_conversation_id for update;
 if not found or c.status<>'open' or c.current_project_id is null then raise exception 'conversation_not_processable'; end if;
 select * into r from public.conversation_runtime_states where conversation_id=c.id for update;
 if not found or r.project_id<>c.current_project_id then raise exception 'runtime_binding_mismatch'; end if;
 select current_version into knowledge_version from public.project_knowledge_states where project_id=r.project_id for update;
 if action->>'conversation_id'<>c.id::text or rendered->>'conversation_id'<>c.id::text
   or action->>'project_id'<>r.project_id::text or rendered->>'project_id'<>r.project_id::text
   or action->>'decision_id' is null or action->>'decision_id'<>rendered->>'decision_id'
   or action->>'selected_candidate_id' is null
   or action->>'template_key' is null or action->>'template_key'<>rendered->>'template_key'
   or action->>'template_version' is null or action->>'template_version'<>rendered->>'template_version'
   or action#>>'{answer_contract,answer_type}' is null or action#>>'{answer_contract,answer_type}'<>rendered#>>'{answer_contract,answer_type}'
   or rendered->>'locale'<>'de' or rendered->>'customer_visible'<>'true'
   or rendered->>'message_kind' not in ('question','confirmation') then raise exception 'snapshot_binding_mismatch'; end if;
 if target_outbound_text is distinct from concat_ws(E'\n\n',rendered->>'primary_text',rendered->>'supporting_text',rendered->>'help_text')
   or length(target_outbound_text) not between 1 and 20000 then raise exception 'outbound_text_mismatch'; end if;
 select * into s from public.conversation_interaction_snapshots where id=target_snapshot_id or pending_interaction_id=target_pending_interaction_id or outbound_message_id=target_outbound_message_id for update;
 if found then
  if s.id<>target_snapshot_id or s.pending_interaction_id<>target_pending_interaction_id or s.outbound_message_id<>target_outbound_message_id
    or s.conversation_id<>c.id or s.project_id<>r.project_id or s.selected_action<>action or s.rendered_interaction<>rendered
    or not exists(select 1 from public.conversation_pending_interactions p where p.id=s.pending_interaction_id and p.snapshot_id=s.id)
    or not exists(select 1 from public.conversation_message_text t where t.message_id=s.outbound_message_id and t.body=target_outbound_text)
    then raise exception 'snapshot_replay_conflict'; end if;
  return public.planner_snapshot_dto(s);
 end if;
 if r.revision<>expected_runtime_revision then raise exception 'stale_runtime_revision'; end if;
 if r.knowledge_state_version<>knowledge_version or (action->>'based_on_state_version')::integer<>knowledge_version then raise exception 'stale_knowledge_version'; end if;
 if r.runtime_status not in ('idle','intermediate_break') or r.active_pending_interaction_id is not null or r.active_evidence_request_id is not null then raise exception 'runtime_not_activatable'; end if;
 next_revision:=r.revision+1;
 next_sequence:=coalesce((select max(sequence) from public.conversation_messages where conversation_id=c.id),0)+1;
 set constraints planner_snapshot_pending_fk,planner_snapshot_message_fk,pending_snapshot_fk deferred;
 insert into public.conversation_interaction_snapshots(id,pending_interaction_id,conversation_id,project_id,runtime_revision,knowledge_state_version,outbound_message_id,outbound_message_sequence,snapshot_schema_version,selected_action,rendered_interaction)
 values(target_snapshot_id,target_pending_interaction_id,c.id,r.project_id,next_revision,knowledge_version,target_outbound_message_id,next_sequence,1,action,rendered) returning * into s;
 insert into public.conversation_messages(id,conversation_id,sequence,direction,message_kind,actor_class,occurred_at,idempotency_key)
 values(target_outbound_message_id,c.id,next_sequence,'outbound','text','system',target_occurred_at,target_idempotency_key);
 insert into public.conversation_message_text(message_id,body) values(target_outbound_message_id,target_outbound_text);
 insert into public.conversation_pending_interactions(id,conversation_id,project_id,decision_id,selected_action_type,information_key,entity_type,entity_id,template_key,template_version,locale,answer_type,expected_knowledge_state_version,runtime_revision,prompt_message_id,snapshot_id)
 values(target_pending_interaction_id,c.id,r.project_id,(action->>'decision_id')::uuid,action->>'action_type',action->>'information_key',action->>'entity_type',(action->>'entity_id')::uuid,action->>'template_key',(action->>'template_version')::integer,rendered->>'locale',action#>>'{answer_contract,answer_type}',knowledge_version,next_revision,target_outbound_message_id,target_snapshot_id);
 perform set_config('app.runtime_authority_mutation','allowed',true);
 update public.conversation_runtime_states set revision=next_revision,runtime_status='awaiting_customer_answer',active_pending_interaction_id=target_pending_interaction_id,updated_at=statement_timestamp() where conversation_id=c.id;
 return public.planner_snapshot_dto(s);
end $$;

create function public.get_planner_interaction_snapshot(target_pending_interaction_id uuid) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare p public.conversation_pending_interactions%rowtype; s public.conversation_interaction_snapshots%rowtype;
begin
 if auth.role()<>'service_role' then raise exception 'machine_authority_required'; end if;
 select * into p from public.conversation_pending_interactions where id=target_pending_interaction_id;
 if not found or p.snapshot_id is null then return null; end if;
 select * into s from public.conversation_interaction_snapshots where id=p.snapshot_id;
 if not found or s.pending_interaction_id<>p.id or s.conversation_id<>p.conversation_id or s.project_id<>p.project_id
   or s.runtime_revision<>p.runtime_revision or s.knowledge_state_version<>p.expected_knowledge_state_version
   or s.outbound_message_id<>p.prompt_message_id then return null; end if;
 return public.planner_snapshot_dto(s);
end $$;

revoke all on function public.activate_planner_interaction_snapshot(uuid,uuid,uuid,uuid,integer,text,timestamptz,jsonb,text),public.get_planner_interaction_snapshot(uuid) from public,anon,authenticated;
grant execute on function public.activate_planner_interaction_snapshot(uuid,uuid,uuid,uuid,integer,text,timestamptz,jsonb,text),public.get_planner_interaction_snapshot(uuid) to service_role;
comment on table public.conversation_interaction_snapshots is 'Immutable schema-v1 SelectedNextAction and RenderedCustomerInteraction authority. No customer input, provider payload, token, or AI output.';
comment on column public.conversation_pending_interactions.snapshot_id is 'Nullable only for legacy rows; every newly activated customer-answerable interaction is fail-closed without an immutable snapshot.';
