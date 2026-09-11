-- AP-16-06-06D-22: durable, command-bound historical customer-answer authority.
-- This is additive. It neither rewrites messages nor creates recovery prompts/snapshots.

create table public.customer_answer_execution_contexts (
  command_id uuid primary key references public.conversation_cycle_commands(id) on delete restrict,
  conversation_id uuid not null references public.conversations(id) on delete restrict,
  project_id uuid not null references public.projects(id) on delete restrict,
  source_message_id uuid not null references public.conversation_messages(id) on delete restrict,
  original_pending_interaction_id uuid not null references public.conversation_pending_interactions(id) on delete restrict,
  prompt_message_id uuid not null references public.conversation_messages(id) on delete restrict,
  original_snapshot_id uuid not null references public.conversation_interaction_snapshots(id) on delete restrict,
  information_key text not null,
  entity_type text not null,
  entity_id uuid not null,
  selected_action_type text not null,
  answer_type text not null,
  expected_knowledge_version integer not null check (expected_knowledge_version > 0),
  original_runtime_revision integer not null check (original_runtime_revision > 0),
  prompt_sequence bigint not null check (prompt_sequence > 0),
  source_sequence bigint not null check (source_sequence > prompt_sequence),
  selected_action jsonb not null check (jsonb_typeof(selected_action) = 'object'),
  rendered_interaction jsonb not null check (jsonb_typeof(rendered_interaction) = 'object'),
  authority_source text not null check (authority_source in ('direct_current_binding','legacy_original_binding','rehabilitated_original_lineage')),
  authority_version integer not null default 1 check (authority_version = 1),
  created_at timestamptz not null default statement_timestamp(),
  unique (source_message_id),
  unique (original_pending_interaction_id, source_message_id)
);

alter table public.customer_answer_execution_contexts enable row level security;
revoke all on public.customer_answer_execution_contexts from public, anon, authenticated;
grant select, insert on public.customer_answer_execution_contexts to service_role;

create function public.reject_customer_answer_execution_context_mutation() returns trigger
language plpgsql set search_path=public,pg_temp as $$
begin
  raise exception 'customer_answer_execution_context_immutable';
end $$;
create trigger customer_answer_execution_contexts_immutable
before update or delete on public.customer_answer_execution_contexts
for each row execute function public.reject_customer_answer_execution_context_mutation();

create function public.bootstrap_customer_answer_execution_context(target_command_id uuid) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare
  cmd public.conversation_cycle_commands%rowtype;
  execution_pending public.conversation_pending_interactions%rowtype;
  original_pending public.conversation_pending_interactions%rowtype;
  original_snapshot public.conversation_interaction_snapshots%rowtype;
  source public.conversation_messages%rowtype;
  prompt public.conversation_messages%rowtype;
  existing public.customer_answer_execution_contexts%rowtype;
  authority_source text;
  rendered_prompt text;
begin
  if auth.role() is distinct from 'service_role' then raise insufficient_privilege using message='answer_context_service_role_required'; end if;
  select * into cmd from public.conversation_cycle_commands where id=target_command_id for update;
  if not found then return jsonb_build_object('success',false,'code','command_not_found'); end if;
  select * into existing from public.customer_answer_execution_contexts where command_id=cmd.id;
  if found then
    if existing.conversation_id=cmd.conversation_id and existing.project_id=cmd.project_id and existing.source_message_id=cmd.source_message_id and existing.prompt_message_id=cmd.prompt_message_id
    then return jsonb_build_object('success',true,'code','reused','answer_context_source',existing.authority_source); end if;
    return jsonb_build_object('success',false,'code','authority_incomplete');
  end if;
  if cmd.command_type<>'customer_answer' or cmd.status<>'processing' or cmd.project_id is null or cmd.prompt_message_id is null then return jsonb_build_object('success',false,'code','command_not_claimed'); end if;
  if not exists(select 1 from public.conversations c where c.id=cmd.conversation_id and c.status='open' and c.current_project_id=cmd.project_id) then return jsonb_build_object('success',false,'code','conversation_mismatch'); end if;
  select * into source from public.conversation_messages where id=cmd.source_message_id;
  if source.id is null or source.conversation_id<>cmd.conversation_id or source.direction<>'inbound' or source.actor_class<>'customer' or source.message_kind<>'text' or not exists(select 1 from public.conversation_message_text mt where mt.message_id=source.id) then return jsonb_build_object('success',false,'code','source_message_invalid'); end if;
  if exists(select 1 from public.conversation_messages newer where newer.conversation_id=cmd.conversation_id and newer.direction='inbound' and newer.actor_class='customer' and newer.sequence>source.sequence) then return jsonb_build_object('success',false,'code','source_message_invalid'); end if;
  select * into execution_pending from public.conversation_pending_interactions where id=cmd.pending_interaction_id;
  if execution_pending.id is null or execution_pending.conversation_id<>cmd.conversation_id or execution_pending.project_id<>cmd.project_id or execution_pending.prompt_message_id<>cmd.prompt_message_id then return jsonb_build_object('success',false,'code','pending_interaction_stale'); end if;
  original_pending:=execution_pending;
  authority_source:=case when execution_pending.status='pending' then 'direct_current_binding' else 'legacy_original_binding' end;
  if execution_pending.recovery_of_pending_interaction_id is not null then
    select * into original_pending from public.conversation_pending_interactions where id=execution_pending.recovery_of_pending_interaction_id;
    authority_source:='rehabilitated_original_lineage';
  end if;
  if original_pending.id is null or original_pending.conversation_id<>cmd.conversation_id or original_pending.project_id<>cmd.project_id or original_pending.prompt_message_id<>cmd.prompt_message_id then return jsonb_build_object('success',false,'code','pending_interaction_stale'); end if;
  if authority_source<>'direct_current_binding' and (original_pending.status<>'answered' or original_pending.answered_by_message_id is distinct from cmd.source_message_id) then return jsonb_build_object('success',false,'code','source_message_invalid'); end if;
  select * into original_snapshot from public.conversation_interaction_snapshots where id=original_pending.snapshot_id and pending_interaction_id=original_pending.id;
  if original_snapshot.id is null or original_snapshot.conversation_id<>cmd.conversation_id or original_snapshot.project_id<>cmd.project_id or original_snapshot.outbound_message_id<>cmd.prompt_message_id or original_snapshot.runtime_revision<>original_pending.runtime_revision or original_snapshot.knowledge_state_version<>original_pending.expected_knowledge_state_version then return jsonb_build_object('success',false,'code','snapshot_invalid'); end if;
  if authority_source='rehabilitated_original_lineage' and (execution_pending.snapshot_id is null or not exists(select 1 from public.conversation_interaction_snapshots recovery_snapshot where recovery_snapshot.id=execution_pending.snapshot_id and recovery_snapshot.pending_interaction_id=execution_pending.id and recovery_snapshot.recovery_of_snapshot_id=original_snapshot.id)) then return jsonb_build_object('success',false,'code','snapshot_invalid'); end if;
  select * into prompt from public.conversation_messages where id=cmd.prompt_message_id;
  rendered_prompt:=concat_ws(E'\n\n',original_snapshot.rendered_interaction->>'primary_text',original_snapshot.rendered_interaction->>'supporting_text',original_snapshot.rendered_interaction->>'help_text');
  if prompt.id is null or prompt.conversation_id<>cmd.conversation_id or prompt.direction<>'outbound' or prompt.actor_class not in ('system','ai') or prompt.message_kind<>'text' or prompt.sequence<>original_snapshot.outbound_message_sequence or source.sequence<=prompt.sequence or not exists(select 1 from public.conversation_message_text mt where mt.message_id=prompt.id and mt.body=rendered_prompt) then return jsonb_build_object('success',false,'code','prompt_message_mismatch'); end if;
  insert into public.customer_answer_execution_contexts(command_id,conversation_id,project_id,source_message_id,original_pending_interaction_id,prompt_message_id,original_snapshot_id,information_key,entity_type,entity_id,selected_action_type,answer_type,expected_knowledge_version,original_runtime_revision,prompt_sequence,source_sequence,selected_action,rendered_interaction,authority_source)
  values(cmd.id,cmd.conversation_id,cmd.project_id,cmd.source_message_id,original_pending.id,cmd.prompt_message_id,original_snapshot.id,original_pending.information_key,original_pending.entity_type,original_pending.entity_id,original_pending.selected_action_type,original_pending.answer_type,original_pending.expected_knowledge_state_version,original_pending.runtime_revision,prompt.sequence,source.sequence,original_snapshot.selected_action,original_snapshot.rendered_interaction,authority_source);
  return jsonb_build_object('success',true,'code','created','answer_context_source',authority_source);
exception when unique_violation then
  select * into existing from public.customer_answer_execution_contexts where command_id=target_command_id;
  if found then return jsonb_build_object('success',true,'code','reused','answer_context_source',existing.authority_source); end if;
  return jsonb_build_object('success',false,'code','authority_incomplete');
end $$;

revoke all on function public.bootstrap_customer_answer_execution_context(uuid) from public,anon,authenticated;
grant execute on function public.bootstrap_customer_answer_execution_context(uuid) to service_role;
comment on function public.bootstrap_customer_answer_execution_context(uuid) is 'Captures immutable historical answer authority once; performs no message, pending, snapshot, or counter mutation.';


create function public.get_customer_answer_execution_context(target_command_id uuid) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare
 cmd public.conversation_cycle_commands%rowtype; c public.conversations%rowtype; r public.conversation_runtime_states%rowtype;
 p public.conversation_pending_interactions%rowtype; m public.conversation_messages%rowtype;
 aec public.customer_answer_execution_contexts%rowtype; body text; rendered_outbound_text text;
 knowledge jsonb; collection jsonb; retry jsonb; effort jsonb; evidence_state jsonb; availability jsonb; context jsonb;
 bootstrap jsonb; effort_revision integer;
begin
 if auth.role() is distinct from 'service_role' then raise insufficient_privilege using message='answer_context_service_role_required'; end if;
 bootstrap:=public.bootstrap_customer_answer_execution_context(target_command_id);
 if not coalesce((bootstrap->>'success')::boolean,false) then return bootstrap; end if;
 select * into cmd from public.conversation_cycle_commands where id=target_command_id;
 select * into aec from public.customer_answer_execution_contexts where command_id=target_command_id;
 if cmd.id is null or aec.command_id is null or cmd.command_type<>'customer_answer' or cmd.status<>'processing' then return jsonb_build_object('success',false,'code','command_not_claimed'); end if;
 if cmd.conversation_id<>aec.conversation_id or cmd.project_id<>aec.project_id or cmd.source_message_id<>aec.source_message_id or cmd.prompt_message_id<>aec.prompt_message_id then return jsonb_build_object('success',false,'code','authority_incomplete'); end if;
 select * into c from public.conversations where id=cmd.conversation_id;
 if c.id is null or c.status<>'open' or c.current_project_id is distinct from cmd.project_id then return jsonb_build_object('success',false,'code','conversation_mismatch'); end if;
 select * into r from public.conversation_runtime_states where conversation_id=cmd.conversation_id;
 if r.conversation_id is null or r.project_id<>cmd.project_id or r.runtime_status<>'awaiting_customer_answer' then return jsonb_build_object('success',false,'code','runtime_stale'); end if;
 if r.knowledge_state_version<>cmd.expected_knowledge_version or (select current_version from public.project_knowledge_states where project_id=cmd.project_id)<>cmd.expected_knowledge_version then return jsonb_build_object('success',false,'code','knowledge_stale'); end if;
 select * into p from public.conversation_pending_interactions where id=cmd.pending_interaction_id;
 if p.id is null or p.conversation_id<>cmd.conversation_id or p.project_id<>cmd.project_id then return jsonb_build_object('success',false,'code','pending_interaction_missing'); end if;
 select * into m from public.conversation_messages where id=aec.source_message_id;
 select mt.body into body from public.conversation_message_text mt where mt.message_id=m.id;
 if m.id is null or body is null or m.conversation_id<>aec.conversation_id or m.direction<>'inbound' or m.actor_class<>'customer' or m.message_kind<>'text' or m.sequence<>aec.source_sequence then return jsonb_build_object('success',false,'code','source_message_invalid'); end if;
 if exists(select 1 from public.conversation_messages newer where newer.conversation_id=aec.conversation_id and newer.direction='inbound' and newer.actor_class='customer' and newer.sequence>aec.source_sequence) then return jsonb_build_object('success',false,'code','source_message_invalid'); end if;
 rendered_outbound_text:=concat_ws(E'\n\n',aec.rendered_interaction->>'primary_text',aec.rendered_interaction->>'supporting_text',aec.rendered_interaction->>'help_text');
 effort_revision:=r.revision;
 if not exists(select 1 from public.conversation_effort_states e where e.conversation_id=cmd.conversation_id and e.project_id=cmd.project_id and e.runtime_revision=effort_revision) then effort_revision:=aec.original_runtime_revision; end if;
 select jsonb_build_object('project_id',ks.project_id,'conversation_id',cmd.conversation_id,'state_version',ks.current_version,'claims',coalesce((select jsonb_agg(jsonb_strip_nulls(jsonb_build_object('claim_id',kc.claim_id,'project_id',kc.project_id,'entity_type',kc.entity_type,'entity_id',kc.entity_id,'property_key',kc.property_key,'value_type',kc.value_type,'value',case kc.value_type when 'string' then to_jsonb(kc.value_text) when 'number' then to_jsonb(kc.value_number) when 'boolean' then to_jsonb(kc.value_boolean) else 'null'::jsonb end,'epistemic_status',kc.epistemic_status,'knowledge_strength',kc.knowledge_strength,'supersedes_claim_id',kc.supersedes_claim_id,'evidence',(select jsonb_agg(jsonb_build_object('evidence_id',ke.id,'source_type',ke.source_type,'source_id',ke.evidence_id,'actor_class',ke.actor_class,'observed_at',ke.observed_at,'evidence_status',ke.evidence_status)) from public.project_knowledge_claim_evidence ke where ke.claim_id=kc.claim_id),'created_at',kc.created_at,'state_version',kc.claim_state_version))) from public.project_knowledge_claims kc where kc.knowledge_state_id=ks.id),'[]'::jsonb),'updated_at',ks.updated_at) into knowledge from public.project_knowledge_states ks where ks.project_id=cmd.project_id;
 select jsonb_build_object('project_id',cmd.project_id,'conversation_id',cmd.conversation_id,'version',coalesce(max(collection_version),0),'items',coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object('information_key',information_key,'entity_type',entity_type,'entity_id',entity_id,'collection_status',collection_status,'last_answer_meaning',last_answer_meaning,'attempts',attempts,'evidence_requirement',evidence_requirement,'revisit_status',revisit_status,'last_dependency_signature',dependency_signature,'last_collection_path',last_collection_path,'last_gain_reason',last_gain_reason,'updated_at',updated_at))) filter(where conversation_id is not null),'[]'::jsonb),'updated_at',coalesce(max(updated_at),r.updated_at)) into collection from public.conversation_information_collection where conversation_id=cmd.conversation_id;
 select jsonb_build_object('project_id',cmd.project_id,'conversation_id',cmd.conversation_id,'items',coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object('information_key',information_key,'entity_type',entity_type,'entity_id',entity_id,'attempts',attempts,'last_outcome',last_outcome,'last_attempt_at',last_attempt_at))) filter(where conversation_id is not null),'[]'::jsonb),'updated_at',coalesce(max(last_attempt_at),r.updated_at)) into retry from public.conversation_retry_states where conversation_id=cmd.conversation_id;
 select jsonb_strip_nulls(jsonb_build_object('consecutive_technical_questions',consecutive_technical_questions,'unanswered_questions',unanswered_questions,'repeated_questions',repeated_questions,'last_break_at',last_break_at)) into effort from public.conversation_effort_states where conversation_id=cmd.conversation_id and project_id=cmd.project_id and runtime_revision=effort_revision;
 select jsonb_build_object('project_id',cmd.project_id,'conversation_id',cmd.conversation_id,'requests',coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object('request_id',request_id,'target_key',target_key,'bundle_key',bundle_key,'requested_for_information_keys',requested_information_keys,'purpose_codes',purpose_codes,'status',status,'attempts',attempts,'requested_at',requested_at,'resolved_at',resolved_at))) filter(where request_id is not null),'[]'::jsonb),'revision',coalesce(max(evidence_revision),0)) into evidence_state from public.conversation_evidence_request_states where conversation_id=cmd.conversation_id;
 select coalesce(jsonb_agg(jsonb_build_object('target_key',target_key,'status',case when status='provided' then 'available_unanalysed' else 'requested' end,'request_id',request_id,'evidence_id',case when status='provided' then request_id else null end)) filter(where status in ('requested','provided')),'[]'::jsonb) into availability from public.conversation_evidence_request_states where conversation_id=cmd.conversation_id;
 if knowledge is null or effort is null then return jsonb_build_object('success',false,'code','authority_incomplete'); end if;
 context:=jsonb_build_object('cycle_id',cmd.id,'correlation_id',cmd.correlation_id,'project_id',cmd.project_id,'conversation_id',cmd.conversation_id,'knowledge_state',knowledge,'information_collection_state',collection,'retry_state',retry,'customer_effort_state',effort,'evidence_request_state',evidence_state,'evidence_availability',availability,'next_evidence_request_id',cmd.next_evidence_request_id,'interpretation_inputs',jsonb_build_object('interpretation_id',cmd.interpretation_id,'selected_action',aec.selected_action,'rendered_interaction',aec.rendered_interaction,'source_message_id',m.id,'source_actor_class','customer','interpreted_at',cmd.execution_at,'idempotency_key',cmd.conversation_id::text||':'||(aec.selected_action->>'decision_id')||':'||m.id::text,'proposal_ids',jsonb_build_object('transition_id',cmd.transition_id,'claim_id',cmd.claim_id,'customer_evidence_id',cmd.customer_evidence_id,'system_evidence_id',cmd.system_evidence_id)),'expected_state_version',cmd.expected_knowledge_version,'next_state_ids',jsonb_build_object('apply_id',cmd.apply_id),'event_ids',to_jsonb(cmd.event_ids),'event_sequence_start',cmd.event_sequence_start,'occurred_at',cmd.execution_at,'assessment_id',cmd.assessment_id,'planner_decision_id',cmd.planner_decision_id,'planner_candidate_ids','[]'::jsonb,'template_version',(aec.rendered_interaction->>'template_version')::integer,'locale',aec.rendered_interaction->>'locale');
 return jsonb_build_object('success',true,'answer_context_source',aec.authority_source,'answer_context_reused',bootstrap->>'code'='reused','answer_context_bootstrap_succeeded',true,'command',jsonb_build_object('id',cmd.id,'conversation_id',cmd.conversation_id,'project_id',cmd.project_id,'source_message_id',cmd.source_message_id,'pending_interaction_id',cmd.pending_interaction_id,'expected_runtime_revision',cmd.expected_runtime_revision,'expected_knowledge_version',cmd.expected_knowledge_version,'execution_at',cmd.execution_at,'correlation_id',cmd.correlation_id,'interpretation_id',cmd.interpretation_id,'transition_id',cmd.transition_id,'claim_id',cmd.claim_id,'customer_evidence_id',cmd.customer_evidence_id,'system_evidence_id',cmd.system_evidence_id,'apply_id',cmd.apply_id,'assessment_id',cmd.assessment_id,'planner_decision_id',cmd.planner_decision_id,'event_ids',cmd.event_ids,'next_evidence_request_id',cmd.next_evidence_request_id,'next_pending_interaction_id',cmd.next_pending_interaction_id,'next_snapshot_id',cmd.next_snapshot_id,'next_outbound_message_id',cmd.next_outbound_message_id,'event_sequence_start',cmd.event_sequence_start),'source_message',jsonb_build_object('id',m.id,'conversation_id',m.conversation_id,'sequence',m.sequence,'direction',m.direction,'actor_class',m.actor_class,'message_kind',m.message_kind,'occurred_at',m.occurred_at,'text',body),'pending_interaction',jsonb_build_object('id',p.id,'conversation_id',p.conversation_id,'project_id',p.project_id,'status','pending','runtime_revision',cmd.expected_runtime_revision,'expected_knowledge_state_version',cmd.expected_knowledge_version,'prompt_message_id',aec.prompt_message_id,'snapshot_id',aec.original_snapshot_id),'snapshot',jsonb_build_object('id',aec.original_snapshot_id,'pending_interaction_id',p.id,'conversation_id',aec.conversation_id,'project_id',aec.project_id,'runtime_revision',cmd.expected_runtime_revision,'knowledge_state_version',cmd.expected_knowledge_version,'outbound_message_id',aec.prompt_message_id,'outbound_message_sequence',aec.prompt_sequence,'snapshot_schema_version',1,'selected_action',aec.selected_action,'rendered_interaction',aec.rendered_interaction,'outbound_text',rendered_outbound_text,'created_at',aec.created_at),'cycle_context',context);
end $$;

revoke all on function public.get_customer_answer_execution_context(uuid) from public,anon,authenticated;
grant execute on function public.get_customer_answer_execution_context(uuid) to service_role;
comment on function public.get_customer_answer_execution_context(uuid) is 'Loads immutable historical answer input and separately validates fresh mutation authority; retries do not reconstruct pending/snapshot lineage.';
