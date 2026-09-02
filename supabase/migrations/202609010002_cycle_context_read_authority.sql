-- AP-16-06-01C: stable command reservations and side-effect-free claimed-cycle context read.
alter table public.conversation_cycle_commands
  add column project_id uuid references public.projects(id) on delete restrict,
  add column prompt_message_id uuid references public.conversation_messages(id) on delete restrict,
  add column execution_at timestamptz,
  add column correlation_id uuid,
  add column interpretation_id uuid,
  add column transition_id uuid,
  add column claim_id uuid,
  add column customer_evidence_id uuid,
  add column system_evidence_id uuid,
  add column apply_id uuid,
  add column assessment_id uuid,
  add column planner_decision_id uuid,
  add column event_ids uuid[],
  add column next_evidence_request_id uuid,
  add column next_pending_interaction_id uuid,
  add column next_snapshot_id uuid,
  add column next_outbound_message_id uuid,
  add column event_sequence_start integer;

comment on column public.conversation_cycle_commands.execution_at is 'Fixed domain time for every retry of this logical cycle.';
comment on column public.conversation_cycle_commands.event_ids is 'Exactly five bounded AP-15 event reservations; no message content.';

create or replace function public.guard_cycle_command_history() returns trigger language plpgsql set search_path=public,pg_temp as $$ begin
 if old.status in ('completed','stale','human_review_required') or new.id<>old.id or new.conversation_id<>old.conversation_id
  or new.project_id is distinct from old.project_id or new.source_message_id is distinct from old.source_message_id
  or new.prompt_message_id is distinct from old.prompt_message_id or new.command_type<>old.command_type
  or new.idempotency_key<>old.idempotency_key or new.expected_conversation_revision<>old.expected_conversation_revision
  or new.expected_runtime_revision<>old.expected_runtime_revision or new.expected_knowledge_version<>old.expected_knowledge_version
  or new.pending_interaction_id is distinct from old.pending_interaction_id or new.execution_at is distinct from old.execution_at
  or new.correlation_id is distinct from old.correlation_id or new.interpretation_id is distinct from old.interpretation_id
  or new.transition_id is distinct from old.transition_id or new.claim_id is distinct from old.claim_id
  or new.customer_evidence_id is distinct from old.customer_evidence_id or new.system_evidence_id is distinct from old.system_evidence_id
  or new.apply_id is distinct from old.apply_id or new.assessment_id is distinct from old.assessment_id
  or new.planner_decision_id is distinct from old.planner_decision_id or new.event_ids is distinct from old.event_ids
  or new.next_evidence_request_id is distinct from old.next_evidence_request_id or new.next_pending_interaction_id is distinct from old.next_pending_interaction_id
  or new.next_snapshot_id is distinct from old.next_snapshot_id or new.next_outbound_message_id is distinct from old.next_outbound_message_id
  or new.event_sequence_start is distinct from old.event_sequence_start then raise exception 'cycle_command_immutable'; end if;
 return new;
end $$;

-- Only commands created after this migration acquire reservations. Historical commands remain fail-closed.
create or replace function public.claim_customer_message_cycle(target_message_id uuid) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare m public.conversation_messages%rowtype; c public.conversations%rowtype; r public.conversation_runtime_states%rowtype; p public.conversation_pending_interactions%rowtype; k integer; cmd public.conversation_cycle_commands%rowtype; prompt_sequence integer; event_start integer;
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
 if p.expected_knowledge_state_version<>r.knowledge_state_version or p.expected_knowledge_state_version<>k then return jsonb_build_object('success',false,'code','stale_knowledge_version'); end if;
 if p.snapshot_id is null then return jsonb_build_object('success',false,'code','pending_interaction_not_found'); end if;
 select sequence into prompt_sequence from public.conversation_messages where id=p.prompt_message_id;
 if prompt_sequence is null or m.sequence<=prompt_sequence then return jsonb_build_object('success',false,'code','message_precedes_interaction'); end if;
 event_start:=coalesce((select max(sequence) from public.conversation_messages where conversation_id=c.id),0)+1;
 if cmd.id is null then
  insert into public.conversation_cycle_commands(conversation_id,project_id,source_message_id,prompt_message_id,command_type,idempotency_key,expected_conversation_revision,expected_runtime_revision,expected_knowledge_version,pending_interaction_id,status,execution_at,event_sequence_start,correlation_id,interpretation_id,transition_id,claim_id,customer_evidence_id,system_evidence_id,apply_id,assessment_id,planner_decision_id,event_ids,next_evidence_request_id,next_pending_interaction_id,next_snapshot_id,next_outbound_message_id)
  values(c.id,r.project_id,m.id,p.prompt_message_id,'customer_answer','answer:'||m.id,c.revision,r.revision,k,p.id,'processing',statement_timestamp(),event_start,gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),array[gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid()],gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid()) returning * into cmd;
 elsif cmd.status='failed' then update public.conversation_cycle_commands set status='processing',failed_at=null where id=cmd.id returning * into cmd;
 end if;
 return jsonb_build_object('success',true,'replay',false,'command_id',cmd.id,'conversation_id',c.id,'project_id',r.project_id,'pending_interaction_id',p.id,'expected_conversation_revision',c.revision,'expected_runtime_revision',r.revision,'expected_knowledge_version',k,'message_sequence',m.sequence,'prompt_sequence',prompt_sequence);
end $$;

create function public.get_customer_message_cycle_context(target_command_id uuid) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare cmd public.conversation_cycle_commands%rowtype; c public.conversations%rowtype; r public.conversation_runtime_states%rowtype; p public.conversation_pending_interactions%rowtype; m public.conversation_messages%rowtype; pm public.conversation_messages%rowtype; s public.conversation_interaction_snapshots%rowtype; body text; prompt_body text; knowledge jsonb; collection jsonb; retry jsonb; effort jsonb; evidence_state jsonb; availability jsonb; context jsonb;
begin
 if auth.role()<>'service_role' then return jsonb_build_object('success',false,'code','command_not_found'); end if;
 select * into cmd from public.conversation_cycle_commands where id=target_command_id;
 if not found then return jsonb_build_object('success',false,'code','command_not_found'); end if;
 if cmd.command_type<>'customer_answer' or cmd.status<>'processing' then return jsonb_build_object('success',false,'code','command_not_claimed'); end if;
 if cmd.project_id is null or cmd.prompt_message_id is null or cmd.execution_at is null or cmd.event_sequence_start is null or cardinality(cmd.event_ids)<>5 then return jsonb_build_object('success',false,'code','authority_incomplete'); end if;
 select * into c from public.conversations where id=cmd.conversation_id;
 if c.id is null or c.status<>'open' or c.revision<>cmd.expected_conversation_revision then return jsonb_build_object('success',false,'code','conversation_mismatch'); end if;
 if c.current_project_id is distinct from cmd.project_id then return jsonb_build_object('success',false,'code','project_mismatch'); end if;
 select * into r from public.conversation_runtime_states where conversation_id=cmd.conversation_id;
 if r.conversation_id is null or r.project_id<>cmd.project_id or r.revision<>cmd.expected_runtime_revision or r.runtime_status<>'awaiting_customer_answer' then return jsonb_build_object('success',false,'code','runtime_stale'); end if;
 if r.knowledge_state_version<>cmd.expected_knowledge_version or (select current_version from public.project_knowledge_states where project_id=cmd.project_id)<>cmd.expected_knowledge_version then return jsonb_build_object('success',false,'code','knowledge_stale'); end if;
 select * into p from public.conversation_pending_interactions where id=cmd.pending_interaction_id;
 if p.id is null then return jsonb_build_object('success',false,'code','pending_interaction_missing'); end if;
 if p.status<>'pending' or r.active_pending_interaction_id<>p.id or p.conversation_id<>cmd.conversation_id or p.project_id<>cmd.project_id or p.runtime_revision<>cmd.expected_runtime_revision or p.expected_knowledge_state_version<>cmd.expected_knowledge_version or p.prompt_message_id<>cmd.prompt_message_id then return jsonb_build_object('success',false,'code','pending_interaction_stale'); end if;
 if p.snapshot_id is null then return jsonb_build_object('success',false,'code','snapshot_missing'); end if;
 select * into s from public.conversation_interaction_snapshots where id=p.snapshot_id and pending_interaction_id=p.id;
 if s.id is null then return jsonb_build_object('success',false,'code','snapshot_missing'); end if;
 select * into m from public.conversation_messages where id=cmd.source_message_id; select body into body from public.conversation_message_text where message_id=m.id;
 if m.id is null or body is null or m.conversation_id<>cmd.conversation_id or m.direction<>'inbound' or m.actor_class<>'customer' or m.message_kind<>'text' then return jsonb_build_object('success',false,'code','source_message_invalid'); end if;
 select * into pm from public.conversation_messages where id=cmd.prompt_message_id; select body into prompt_body from public.conversation_message_text where message_id=pm.id;
 if pm.id is null or pm.conversation_id<>cmd.conversation_id or pm.direction<>'outbound' or pm.actor_class not in ('system','ai') or pm.message_kind<>'text' or pm.sequence<>s.outbound_message_sequence or s.outbound_message_id<>pm.id or prompt_body<>s.outbound_text or m.sequence<=pm.sequence then return jsonb_build_object('success',false,'code','prompt_message_mismatch'); end if;
 if s.conversation_id<>cmd.conversation_id or s.project_id<>cmd.project_id or s.runtime_revision<>cmd.expected_runtime_revision or s.knowledge_state_version<>cmd.expected_knowledge_version then return jsonb_build_object('success',false,'code','snapshot_invalid'); end if;

 select jsonb_build_object('project_id',ks.project_id,'conversation_id',cmd.conversation_id,'state_version',ks.current_version,'claims',coalesce((select jsonb_agg(jsonb_strip_nulls(jsonb_build_object('claim_id',kc.claim_id,'project_id',kc.project_id,'entity_type',kc.entity_type,'entity_id',kc.entity_id,'property_key',kc.property_key,'value_type',kc.value_type,'value',case kc.value_type when 'string' then to_jsonb(kc.value_text) when 'number' then to_jsonb(kc.value_number) when 'boolean' then to_jsonb(kc.value_boolean) else 'null'::jsonb end,'epistemic_status',kc.epistemic_status,'knowledge_strength',kc.knowledge_strength,'supersedes_claim_id',kc.supersedes_claim_id,'evidence',(select jsonb_agg(jsonb_build_object('evidence_id',ke.id,'source_type',ke.source_type,'source_id',ke.evidence_id,'actor_class',ke.actor_class,'observed_at',ke.observed_at,'evidence_status',ke.evidence_status)) from public.project_knowledge_claim_evidence ke where ke.claim_id=kc.claim_id),'created_at',kc.created_at,'state_version',kc.claim_state_version))) from public.project_knowledge_claims kc where kc.knowledge_state_id=ks.id),'[]'::jsonb),'updated_at',ks.updated_at) into knowledge from public.project_knowledge_states ks where ks.project_id=cmd.project_id;
 select jsonb_build_object('project_id',cmd.project_id,'conversation_id',cmd.conversation_id,'version',coalesce(max(collection_version),0),'items',coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object('information_key',information_key,'entity_type',entity_type,'entity_id',entity_id,'collection_status',collection_status,'last_answer_meaning',last_answer_meaning,'attempts',attempts,'evidence_requirement',evidence_requirement,'revisit_status',revisit_status,'last_dependency_signature',dependency_signature,'last_collection_path',last_collection_path,'last_gain_reason',last_gain_reason,'updated_at',updated_at))) filter(where conversation_id is not null),'[]'::jsonb),'updated_at',coalesce(max(updated_at),r.updated_at)) into collection from public.conversation_information_collection where conversation_id=cmd.conversation_id;
 select jsonb_build_object('project_id',cmd.project_id,'conversation_id',cmd.conversation_id,'items',coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object('information_key',information_key,'entity_type',entity_type,'entity_id',entity_id,'attempts',attempts,'last_outcome',last_outcome,'last_attempt_at',last_attempt_at))) filter(where conversation_id is not null),'[]'::jsonb),'updated_at',coalesce(max(last_attempt_at),r.updated_at)) into retry from public.conversation_retry_states where conversation_id=cmd.conversation_id;
 select jsonb_strip_nulls(jsonb_build_object('consecutive_technical_questions',consecutive_technical_questions,'unanswered_questions',unanswered_questions,'repeated_questions',repeated_questions,'last_break_at',last_break_at)) into effort from public.conversation_effort_states where conversation_id=cmd.conversation_id and project_id=cmd.project_id and runtime_revision=cmd.expected_runtime_revision;
 select jsonb_build_object('project_id',cmd.project_id,'conversation_id',cmd.conversation_id,'requests',coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object('request_id',request_id,'target_key',target_key,'bundle_key',bundle_key,'requested_for_information_keys',requested_information_keys,'purpose_codes',purpose_codes,'status',status,'attempts',attempts,'requested_at',requested_at,'resolved_at',resolved_at))) filter(where request_id is not null),'[]'::jsonb),'revision',coalesce(max(evidence_revision),0)) into evidence_state from public.conversation_evidence_request_states where conversation_id=cmd.conversation_id;
 select coalesce(jsonb_agg(jsonb_build_object('target_key',target_key,'status',case when status='provided' then 'available_unanalysed' else 'requested' end,'request_id',request_id,'evidence_id',case when status='provided' then request_id else null end)) filter(where status in ('requested','provided')),'[]'::jsonb) into availability from public.conversation_evidence_request_states where conversation_id=cmd.conversation_id;
 if knowledge is null or effort is null then return jsonb_build_object('success',false,'code','authority_incomplete'); end if;
 context:=jsonb_build_object('cycle_id',cmd.id,'correlation_id',cmd.correlation_id,'project_id',cmd.project_id,'conversation_id',cmd.conversation_id,'knowledge_state',knowledge,'information_collection_state',collection,'retry_state',retry,'customer_effort_state',effort,'evidence_request_state',evidence_state,'evidence_availability',availability,'next_evidence_request_id',cmd.next_evidence_request_id,'interpretation_inputs',jsonb_build_object('interpretation_id',cmd.interpretation_id,'selected_action',s.selected_action,'rendered_interaction',s.rendered_interaction,'source_message_id',m.id,'source_actor_class','customer','interpreted_at',cmd.execution_at,'idempotency_key','answer:'||m.id,'proposal_ids',jsonb_build_object('transition_id',cmd.transition_id,'claim_id',cmd.claim_id,'customer_evidence_id',cmd.customer_evidence_id,'system_evidence_id',cmd.system_evidence_id)),'expected_state_version',cmd.expected_knowledge_version,'next_state_ids',jsonb_build_object('apply_id',cmd.apply_id),'event_ids',to_jsonb(cmd.event_ids),'event_sequence_start',cmd.event_sequence_start,'occurred_at',cmd.execution_at,'assessment_id',cmd.assessment_id,'planner_decision_id',cmd.planner_decision_id,'planner_candidate_ids','[]'::jsonb,'template_version',(s.rendered_interaction->>'template_version')::integer,'locale',s.rendered_interaction->>'locale');
 return jsonb_build_object('success',true,'command',jsonb_build_object('id',cmd.id,'conversation_id',cmd.conversation_id,'project_id',cmd.project_id,'source_message_id',cmd.source_message_id,'pending_interaction_id',cmd.pending_interaction_id,'expected_runtime_revision',cmd.expected_runtime_revision,'expected_knowledge_version',cmd.expected_knowledge_version,'execution_at',cmd.execution_at,'correlation_id',cmd.correlation_id,'interpretation_id',cmd.interpretation_id,'transition_id',cmd.transition_id,'claim_id',cmd.claim_id,'customer_evidence_id',cmd.customer_evidence_id,'system_evidence_id',cmd.system_evidence_id,'apply_id',cmd.apply_id,'assessment_id',cmd.assessment_id,'planner_decision_id',cmd.planner_decision_id,'event_ids',cmd.event_ids,'next_evidence_request_id',cmd.next_evidence_request_id,'next_pending_interaction_id',cmd.next_pending_interaction_id,'next_snapshot_id',cmd.next_snapshot_id,'next_outbound_message_id',cmd.next_outbound_message_id,'event_sequence_start',cmd.event_sequence_start),'source_message',jsonb_build_object('id',m.id,'conversation_id',m.conversation_id,'sequence',m.sequence,'direction',m.direction,'actor_class',m.actor_class,'message_kind',m.message_kind,'occurred_at',m.occurred_at,'text',body),'pending_interaction',jsonb_build_object('id',p.id,'conversation_id',p.conversation_id,'project_id',p.project_id,'status',p.status,'runtime_revision',p.runtime_revision,'expected_knowledge_state_version',p.expected_knowledge_state_version,'prompt_message_id',p.prompt_message_id,'snapshot_id',p.snapshot_id),'snapshot',jsonb_build_object('id',s.id,'pending_interaction_id',s.pending_interaction_id,'conversation_id',s.conversation_id,'project_id',s.project_id,'runtime_revision',s.runtime_revision,'knowledge_state_version',s.knowledge_state_version,'outbound_message_id',s.outbound_message_id,'outbound_message_sequence',s.outbound_message_sequence,'snapshot_schema_version',s.snapshot_schema_version,'selected_action',s.selected_action,'rendered_interaction',s.rendered_interaction,'outbound_text',s.outbound_text,'created_at',s.created_at),'cycle_context',context);
end $$;

revoke all on function public.get_customer_message_cycle_context(uuid) from public,anon,authenticated;
grant execute on function public.get_customer_message_cycle_context(uuid) to service_role;
comment on function public.get_customer_message_cycle_context(uuid) is 'Service-only, side-effect-free AP-16-06-01C authority read; returns no provider payload and writes no audit data.';
