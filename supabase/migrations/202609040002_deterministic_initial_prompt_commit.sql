-- AP-16-06-05E: service-only read and atomic deterministic initial-prompt commit.
create function public.get_first_contact_initial_prompt_context(target_conversation_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare c public.conversations%rowtype; r public.conversation_runtime_states%rowtype;
 k public.project_knowledge_states%rowtype; e public.conversation_effort_states%rowtype;
 p public.conversation_pending_interactions%rowtype; s public.conversation_interaction_snapshots%rowtype;
 d public.transport_delivery_commands%rowtype;
begin
 if auth.role() is distinct from 'service_role' or target_conversation_id is null then return jsonb_build_object('status','invalid_state'); end if;
 select * into c from public.conversations where id=target_conversation_id;
 if not found or c.status<>'open' or c.current_project_id is null then return jsonb_build_object('status','not_applicable'); end if;
 select * into r from public.conversation_runtime_states where conversation_id=c.id;
 select * into k from public.project_knowledge_states where project_id=c.current_project_id;
 if r.conversation_id is null or k.id is null or r.project_id<>c.current_project_id then return jsonb_build_object('status','invalid_state'); end if;
 if r.runtime_status='awaiting_customer_answer' and r.active_pending_interaction_id is not null then
  if not exists(select 1 from public.conversation_runtime_commands x where x.conversation_id=c.id and x.idempotency_key='first-contact-initial-prompt:v1' and x.result_revision=r.revision) then return jsonb_build_object('status','already_advanced'); end if;
  select * into p from public.conversation_pending_interactions where id=r.active_pending_interaction_id and status='pending';
  select * into s from public.conversation_interaction_snapshots where id=p.snapshot_id and pending_interaction_id=p.id;
  select * into d from public.transport_delivery_commands where provider='whatsapp' and internal_message_id=s.outbound_message_id;
  if p.id is null or s.id is null or d.id is null or p.prompt_message_id<>s.outbound_message_id or p.runtime_revision<>r.revision then return jsonb_build_object('status','invalid_state'); end if;
  return jsonb_build_object('status','already_initialized','conversation_id',c.id,'project_id',r.project_id,'runtime_revision',r.revision,'knowledge_state_version',k.current_version,'interaction_id',p.id,'planner_snapshot_id',s.id,'outbound_message_id',s.outbound_message_id,'delivery_command_id',d.id);
 end if;
 if r.runtime_status<>'idle' or r.active_pending_interaction_id is not null or r.active_evidence_request_id is not null then return jsonb_build_object('status','already_advanced'); end if;
 if r.knowledge_state_version<>k.current_version or exists(select 1 from public.project_knowledge_claims q where q.project_id=c.current_project_id) then return jsonb_build_object('status','not_applicable'); end if;
 select * into e from public.conversation_effort_states where conversation_id=c.id;
 if e.conversation_id is null or e.project_id<>r.project_id or e.runtime_revision<>r.revision or e.consecutive_technical_questions<>0 or e.unanswered_questions<>0 or e.repeated_questions<>0
  or exists(select 1 from public.conversation_information_collection x where x.conversation_id=c.id)
  or exists(select 1 from public.conversation_retry_states x where x.conversation_id=c.id)
  or exists(select 1 from public.conversation_pending_interactions x where x.conversation_id=c.id and x.status='pending')
 then return jsonb_build_object('status','invalid_state'); end if;
 return jsonb_build_object('status','eligible','conversation_id',c.id,'project_id',r.project_id,'runtime_revision',r.revision,'knowledge_state_version',k.current_version);
end $$;

create function public.commit_first_contact_initial_prompt(
 target_conversation_id uuid, expected_project_id uuid, expected_knowledge_version integer, expected_runtime_revision integer,
 target_interaction_id uuid, target_snapshot_id uuid, target_outbound_message_id uuid, target_delivery_command_id uuid,
 target_occurred_at timestamptz, target_snapshot jsonb, target_outbound_text text
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare c public.conversations%rowtype; r public.conversation_runtime_states%rowtype; k public.project_knowledge_states%rowtype;
 p public.conversation_pending_interactions%rowtype; s public.conversation_interaction_snapshots%rowtype; d public.transport_delivery_commands%rowtype;
 b public.conversation_transport_bindings%rowtype; i public.conversation_transport_identities%rowtype; actor_id uuid;
 action jsonb; rendered jsonb; next_revision integer; next_sequence integer;
begin
 if auth.role() is distinct from 'service_role' then return jsonb_build_object('status','invalid_state'); end if;
 if target_conversation_id is null or expected_project_id is null or expected_knowledge_version<1 or expected_runtime_revision<1
  or target_interaction_id is null or target_snapshot_id is null or target_outbound_message_id is null or target_delivery_command_id is null then return jsonb_build_object('status','invalid_state'); end if;
 select * into c from public.conversations where id=target_conversation_id for update;
 if not found or c.status<>'open' or c.current_project_id is null then return jsonb_build_object('status','not_applicable'); end if;
 select * into r from public.conversation_runtime_states where conversation_id=c.id for update;
 select * into k from public.project_knowledge_states where project_id=c.current_project_id for update;
 if r.runtime_status='awaiting_customer_answer' and r.active_pending_interaction_id is not null then
  if not exists(select 1 from public.conversation_runtime_commands x where x.conversation_id=c.id and x.idempotency_key='first-contact-initial-prompt:v1' and x.result_revision=r.revision) then return jsonb_build_object('status','already_advanced'); end if;
  select * into p from public.conversation_pending_interactions where id=r.active_pending_interaction_id and status='pending';
  select * into s from public.conversation_interaction_snapshots where id=p.snapshot_id and pending_interaction_id=p.id;
  select * into d from public.transport_delivery_commands where provider='whatsapp' and internal_message_id=s.outbound_message_id;
  if p.id is null or s.id is null or d.id is null or p.prompt_message_id<>s.outbound_message_id or p.runtime_revision<>r.revision then return jsonb_build_object('status','invalid_state'); end if;
  return jsonb_build_object('status','already_initialized','conversation_id',c.id,'project_id',r.project_id,'runtime_revision',r.revision,'knowledge_state_version',k.current_version,'interaction_id',p.id,'planner_snapshot_id',s.id,'outbound_message_id',s.outbound_message_id,'delivery_command_id',d.id);
 end if;
 if r.project_id<>expected_project_id or c.current_project_id<>expected_project_id or k.project_id<>expected_project_id
  or r.revision<>expected_runtime_revision or r.knowledge_state_version<>expected_knowledge_version or k.current_version<>expected_knowledge_version then return jsonb_build_object('status','stale'); end if;
 if r.runtime_status<>'idle' or r.active_pending_interaction_id is not null or r.active_evidence_request_id is not null then return jsonb_build_object('status','already_advanced'); end if;
 if exists(select 1 from public.conversation_pending_interactions x where x.conversation_id=c.id and x.status='pending') then return jsonb_build_object('status','invalid_state'); end if;
 select * into b from public.conversation_transport_bindings where conversation_id=c.id and provider='whatsapp' and status='active' for update;
 if not found or exists(select 1 from public.conversation_transport_bindings x where x.conversation_id=c.id and x.provider='whatsapp' and x.status='active' and x.id<>b.id) then return jsonb_build_object('status','invalid_state'); end if;
 select * into i from public.conversation_transport_identities where id=b.transport_identity_id and status='active' for update;
 if not found then return jsonb_build_object('status','invalid_state'); end if;
 action:=target_snapshot->'selected_action'; rendered:=target_snapshot->'rendered_interaction';
 if target_snapshot->>'snapshot_schema_version'<>'1' or jsonb_typeof(action)<>'object' or jsonb_typeof(rendered)<>'object' or octet_length(target_snapshot::text)>65536
  or action->>'conversation_id'<>c.id::text or action->>'project_id'<>r.project_id::text or (action->>'based_on_state_version')::integer<>k.current_version
  or action->>'decision_id' is null or action->>'decision_id'<>rendered->>'decision_id' or action->>'template_key'<>rendered->>'template_key'
  or action->>'template_version'<>rendered->>'template_version' or action#>>'{answer_contract,answer_type}'<>rendered#>>'{answer_contract,answer_type}'
  or rendered->>'locale'<>'de' or rendered->>'customer_visible'<>'true' or rendered->>'message_kind'<>'question'
  or target_outbound_text is distinct from concat_ws(E'\n\n',rendered->>'primary_text',rendered->>'supporting_text',rendered->>'help_text')
  or length(target_outbound_text) not between 1 and 20000 then return jsonb_build_object('status','invalid_state'); end if;
 select (public.resolve_system_actor()->>'auth_user_id')::uuid into actor_id;
 if actor_id is null then return jsonb_build_object('status','invalid_state'); end if;
 next_revision:=r.revision+1; next_sequence:=coalesce((select max(sequence) from public.conversation_messages where conversation_id=c.id),0)+1;
 set constraints planner_snapshot_pending_fk,planner_snapshot_message_fk,pending_snapshot_fk deferred;
 insert into public.conversation_interaction_snapshots(id,pending_interaction_id,conversation_id,project_id,runtime_revision,knowledge_state_version,outbound_message_id,outbound_message_sequence,snapshot_schema_version,selected_action,rendered_interaction)
 values(target_snapshot_id,target_interaction_id,c.id,r.project_id,next_revision,k.current_version,target_outbound_message_id,next_sequence,1,action,rendered) returning * into s;
 insert into public.conversation_messages(id,conversation_id,sequence,direction,message_kind,actor_class,occurred_at,idempotency_key)
 values(target_outbound_message_id,c.id,next_sequence,'outbound','text','system',target_occurred_at,'first-contact-initial-prompt:v1');
 insert into public.conversation_message_text(message_id,body) values(target_outbound_message_id,target_outbound_text);
 insert into public.conversation_pending_interactions(id,conversation_id,project_id,decision_id,selected_action_type,information_key,entity_type,entity_id,template_key,template_version,locale,answer_type,expected_knowledge_state_version,runtime_revision,prompt_message_id,snapshot_id)
 values(target_interaction_id,c.id,r.project_id,(action->>'decision_id')::uuid,action->>'action_type',action->>'information_key',action->>'entity_type',(action->>'entity_id')::uuid,action->>'template_key',(action->>'template_version')::integer,'de',action#>>'{answer_contract,answer_type}',k.current_version,next_revision,target_outbound_message_id,target_snapshot_id);
 insert into public.transport_delivery_commands(id,internal_message_id,conversation_id,transport_binding_id,transport_identity_id)
 values(target_delivery_command_id,target_outbound_message_id,c.id,b.id,i.id) returning * into d;
 insert into public.conversation_runtime_commands(conversation_id,command_type,idempotency_key,expected_revision,result_revision,result_status,actor_id)
 values(c.id,'activate_interaction','first-contact-initial-prompt:v1',r.revision,next_revision,'completed',actor_id);
 perform set_config('app.runtime_authority_mutation','allowed',true);
 update public.conversation_runtime_states set revision=next_revision,runtime_status='awaiting_customer_answer',active_pending_interaction_id=target_interaction_id where conversation_id=c.id;
 update public.conversation_effort_states set consecutive_technical_questions=1,runtime_revision=next_revision where conversation_id=c.id;
 insert into public.audit_log(actor_id,entity_type,entity_id,action,metadata) values(actor_id,'conversation',c.id,'first_contact_initial_prompt_committed',jsonb_build_object('conversation_id',c.id,'project_id',r.project_id,'interaction_id',target_interaction_id,'planner_snapshot_id',target_snapshot_id,'outbound_message_id',target_outbound_message_id,'delivery_command_id',target_delivery_command_id,'question_key',action->>'information_key','template_key',action->>'template_key','runtime_revision',next_revision,'knowledge_version',k.current_version,'result_code','initialized'));
 return jsonb_build_object('status','initialized','conversation_id',c.id,'project_id',r.project_id,'runtime_revision',next_revision,'knowledge_state_version',k.current_version,'interaction_id',target_interaction_id,'planner_snapshot_id',target_snapshot_id,'outbound_message_id',target_outbound_message_id,'delivery_command_id',target_delivery_command_id);
exception when unique_violation then return jsonb_build_object('status','stale');
 when others then raise;
end $$;

revoke execute on function public.get_first_contact_initial_prompt_context(uuid) from public,anon,authenticated;
revoke execute on function public.commit_first_contact_initial_prompt(uuid,uuid,integer,integer,uuid,uuid,uuid,uuid,timestamptz,jsonb,text) from public,anon,authenticated;
grant execute on function public.get_first_contact_initial_prompt_context(uuid),public.commit_first_contact_initial_prompt(uuid,uuid,integer,integer,uuid,uuid,uuid,uuid,timestamptz,jsonb,text) to service_role;
comment on function public.commit_first_contact_initial_prompt(uuid,uuid,integer,integer,uuid,uuid,uuid,uuid,timestamptz,jsonb,text) is 'Atomic initial prompt persistence only; no customer answer, knowledge mutation, provider attempt or Graph call.';
