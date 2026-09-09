-- AP-16-06-06D-3A: forward-only compatibility repair for the 06D-3
-- reconciliation. It repeats the idempotent schema/authority reconciliation because
-- the failed SQL Editor batch may have left no, partial, or complete earlier DDL.
-- Historical migration 202609090001 is intentionally unchanged.
alter table public.conversation_cycle_commands add column if not exists project_id uuid;
alter table public.conversation_cycle_commands add column if not exists prompt_message_id uuid;
alter table public.conversation_cycle_commands add column if not exists execution_at timestamp with time zone;
alter table public.conversation_cycle_commands add column if not exists correlation_id uuid;
alter table public.conversation_cycle_commands add column if not exists interpretation_id uuid;
alter table public.conversation_cycle_commands add column if not exists transition_id uuid;
alter table public.conversation_cycle_commands add column if not exists claim_id uuid;
alter table public.conversation_cycle_commands add column if not exists customer_evidence_id uuid;
alter table public.conversation_cycle_commands add column if not exists system_evidence_id uuid;
alter table public.conversation_cycle_commands add column if not exists apply_id uuid;
alter table public.conversation_cycle_commands add column if not exists assessment_id uuid;
alter table public.conversation_cycle_commands add column if not exists planner_decision_id uuid;
alter table public.conversation_cycle_commands add column if not exists event_ids uuid[];
alter table public.conversation_cycle_commands add column if not exists next_evidence_request_id uuid;
alter table public.conversation_cycle_commands add column if not exists next_pending_interaction_id uuid;
alter table public.conversation_cycle_commands add column if not exists next_snapshot_id uuid;
alter table public.conversation_cycle_commands add column if not exists next_outbound_message_id uuid;
alter table public.conversation_cycle_commands add column if not exists event_sequence_start integer;
alter table public.conversation_cycle_commands add column if not exists commit_payload_hash bytea;
alter table public.conversation_cycle_commands add column if not exists execution_owner_id uuid;
alter table public.conversation_cycle_commands add column if not exists execution_lease_expires_at timestamp with time zone;
alter table public.conversation_cycle_commands add column if not exists execution_attempt_count integer not null default 0;
alter table public.conversation_cycle_commands add column if not exists last_execution_started_at timestamp with time zone;
alter table public.conversation_cycle_commands add column if not exists ai_inference_attempt_count integer not null default 0;

-- ADD COLUMN IF NOT EXISTS cannot establish compatibility: fail before installing
-- functions when an existing critical column has the wrong type or nullability.
do $$
declare bad text;
begin
 select string_agg(e.name, ', ' order by e.name) into bad
 from (values
  ('project_id','uuid',false),
  ('prompt_message_id','uuid',false),
  ('execution_at','timestamp with time zone',false),
  ('correlation_id','uuid',false),
  ('interpretation_id','uuid',false),
  ('transition_id','uuid',false),
  ('claim_id','uuid',false),
  ('customer_evidence_id','uuid',false),
  ('system_evidence_id','uuid',false),
  ('apply_id','uuid',false),
  ('assessment_id','uuid',false),
  ('planner_decision_id','uuid',false),
  ('event_ids','uuid[]',false),
  ('next_evidence_request_id','uuid',false),
  ('next_pending_interaction_id','uuid',false),
  ('next_snapshot_id','uuid',false),
  ('next_outbound_message_id','uuid',false),
  ('event_sequence_start','integer',false),
  ('commit_payload_hash','bytea',false),
  ('execution_owner_id','uuid',false),
  ('execution_lease_expires_at','timestamp with time zone',false),
  ('execution_attempt_count','integer',true),
  ('last_execution_started_at','timestamp with time zone',false),
  ('ai_inference_attempt_count','integer',true)
) as e(name,type_name,must_not_be_null)
 left join pg_catalog.pg_attribute a
  on a.attrelid='public.conversation_cycle_commands'::regclass
 and a.attname=e.name and a.attnum>0 and not a.attisdropped
 where a.attname is null
    or a.atttypid<>pg_catalog.to_regtype(e.type_name)::oid
    or (e.must_not_be_null and not a.attnotnull);
 if bad is not null then raise exception 'incompatible conversation_cycle_commands columns: %',bad; end if;
 if exists(select 1 from public.conversation_cycle_commands where execution_attempt_count<0 or ai_inference_attempt_count not between 0 and 3) then
  raise exception 'invalid command attempt counters';
 end if;
end $$;

alter table public.conversation_cycle_commands alter column execution_attempt_count set default 0;
alter table public.conversation_cycle_commands alter column ai_inference_attempt_count set default 0;

-- Normalize named constraints rather than trusting a possibly incompatible object
-- merely because its name exists. Existing rows were validated above.
alter table public.conversation_cycle_commands drop constraint if exists conversation_cycle_commands_execution_attempt_count_check;
alter table public.conversation_cycle_commands add constraint conversation_cycle_commands_execution_attempt_count_check check(execution_attempt_count>=0);
alter table public.conversation_cycle_commands drop constraint if exists conversation_cycle_commands_ai_inference_attempt_count_check;
alter table public.conversation_cycle_commands add constraint conversation_cycle_commands_ai_inference_attempt_count_check check(ai_inference_attempt_count between 0 and 3);

do $$ begin
 if not exists(select 1 from pg_constraint where conrelid='public.conversation_cycle_commands'::regclass and conname='conversation_cycle_commands_project_id_fkey') then
  alter table public.conversation_cycle_commands add constraint conversation_cycle_commands_project_id_fkey foreign key(project_id) references public.projects(id) on delete restrict;
 end if;
 if not exists(select 1 from pg_constraint where conrelid='public.conversation_cycle_commands'::regclass and conname='conversation_cycle_commands_prompt_message_id_fkey') then
  alter table public.conversation_cycle_commands add constraint conversation_cycle_commands_prompt_message_id_fkey foreign key(prompt_message_id) references public.conversation_messages(id) on delete restrict;
 end if;
end $$;
create index if not exists recoverable_conversation_cycle_commands on public.conversation_cycle_commands(execution_lease_expires_at,id) where status='processing';
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

create or replace function public.get_customer_message_cycle_context(target_command_id uuid) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
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
create or replace function public.acquire_customer_message_cycle_execution(target_message_id uuid,execution_owner uuid,lease_seconds integer) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare claimed jsonb; cmd public.conversation_cycle_commands%rowtype; now_at timestamptz:=statement_timestamp(); reclaimed boolean;
begin
 if auth.role()<>'service_role' then return jsonb_build_object('success',false,'code','message_not_found'); end if;
 if execution_owner is null or lease_seconds<30 or lease_seconds>900 then return jsonb_build_object('success',false,'code','invalid_input'); end if;
 claimed:=public.claim_customer_message_cycle(target_message_id);
 if coalesce((claimed->>'success')::boolean,false)=false or coalesce((claimed->>'replay')::boolean,false)=true then return claimed; end if;
 select * into cmd from public.conversation_cycle_commands where id=(claimed->>'command_id')::uuid for update;
 if cmd.status<>'processing' then return jsonb_build_object('success',false,'code','busy','command_id',cmd.id); end if;
 if cmd.execution_owner_id is not null and cmd.execution_lease_expires_at>now_at and cmd.execution_owner_id<>execution_owner then
  return jsonb_build_object('success',false,'code','busy','command_id',cmd.id);
 end if;
 reclaimed:=cmd.execution_attempt_count>0 or cmd.execution_owner_id is not null;
 update public.conversation_cycle_commands set execution_owner_id=execution_owner,
  execution_lease_expires_at=now_at+make_interval(secs=>lease_seconds),
  execution_attempt_count=execution_attempt_count+1,last_execution_started_at=now_at where id=cmd.id;
 return claimed||jsonb_build_object('acquire_kind',case when reclaimed then 'reclaimed' else 'acquired' end,
  'execution_owner_id',execution_owner,'execution_lease_expires_at',now_at+make_interval(secs=>lease_seconds),
  'execution_attempt_count',cmd.execution_attempt_count+1);
end $$;

create or replace function public.discover_recoverable_conversation_cycles(result_limit integer default 100) returns table(command_id uuid,source_message_id uuid,lease_expired_at timestamptz)
language sql security definer set search_path=public,pg_temp as $$
 select c.id,c.source_message_id,coalesce(c.execution_lease_expires_at,c.last_execution_started_at,c.created_at)
 from public.conversation_cycle_commands c
 where auth.role()='service_role' and c.status='processing'
  and (c.execution_lease_expires_at<=statement_timestamp() or c.execution_lease_expires_at is null)
  and c.command_type='customer_answer' and c.source_message_id is not null
 order by coalesce(c.execution_lease_expires_at,c.last_execution_started_at,c.created_at),c.id
 limit least(greatest(result_limit,1),100)
$$;

-- Legacy processing rows deliberately receive no invented owner. A NULL lease is discoverable/reclaimable;
-- all stable command IDs, reserved domain IDs, CAS versions, and execution_at remain untouched.

create or replace function public.fail_customer_message_cycle(target_command_id uuid,failure_code text,execution_owner_id uuid default null) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare cmd public.conversation_cycle_commands%rowtype;
begin
 if auth.role()<>'service_role' then return jsonb_build_object('success',false,'code','command_not_found'); end if;
 if failure_code not in ('normalization_failed','cycle_failed','persistence_failed') then return jsonb_build_object('success',false,'code','invalid_input'); end if;
 select * into cmd from public.conversation_cycle_commands where id=target_command_id for update;
 if not found then return jsonb_build_object('success',false,'code','command_not_found'); end if;
 if execution_owner_id is null or cmd.execution_owner_id is distinct from execution_owner_id or cmd.execution_lease_expires_at<=statement_timestamp() then return jsonb_build_object('success',false,'code','ownership_lost'); end if;
 if cmd.status in ('completed','human_review_required','stale') then return jsonb_build_object('success',false,'code','command_not_claimed'); end if;
 if cmd.status='failed' then return jsonb_build_object('success',true,'code','replayed','command_id',cmd.id); end if;
 if cmd.status<>'processing' then return jsonb_build_object('success',false,'code','command_not_claimed'); end if;
 update public.conversation_cycle_commands set status='failed',result_code=failure_code,failed_at=statement_timestamp(),execution_lease_expires_at=null where id=cmd.id;
 return jsonb_build_object('success',true,'code','failed','command_id',cmd.id);
end $$;

revoke all on function public.acquire_customer_message_cycle_execution(uuid,uuid,integer),public.discover_recoverable_conversation_cycles(integer),public.fail_customer_message_cycle(uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.acquire_customer_message_cycle_execution(uuid,uuid,integer),public.discover_recoverable_conversation_cycles(integer),public.fail_customer_message_cycle(uuid,text,uuid) to service_role;

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
  or new.event_sequence_start is distinct from old.event_sequence_start
  or new.ai_inference_attempt_count < old.ai_inference_attempt_count
  or new.ai_inference_attempt_count > old.ai_inference_attempt_count + 1 then raise exception 'cycle_command_immutable'; end if;
 return new;
end $$;

create or replace function public.reserve_customer_answer_ai_inference_attempt(target_command_id uuid,target_source_message_id uuid,expected_runtime_revision integer,expected_knowledge_version integer,execution_owner_id uuid) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare cmd public.conversation_cycle_commands%rowtype; c public.conversations%rowtype; r public.conversation_runtime_states%rowtype; p public.conversation_pending_interactions%rowtype; k public.project_knowledge_states%rowtype; next_attempt integer;
begin
 if auth.role()<>'service_role' then return jsonb_build_object('success',false,'code','command_not_found'); end if;
 if target_command_id is null or target_source_message_id is null or expected_runtime_revision is null or expected_knowledge_version is null or execution_owner_id is null then return jsonb_build_object('success',false,'code','invalid_input'); end if;
 select * into cmd from public.conversation_cycle_commands where id=target_command_id;
 if not found then return jsonb_build_object('success',false,'code','command_not_found'); end if;
 select * into c from public.conversations where id=cmd.conversation_id for update;
 select * into r from public.conversation_runtime_states where conversation_id=cmd.conversation_id for update;
 select * into k from public.project_knowledge_states where project_id=cmd.project_id for update;
 select * into p from public.conversation_pending_interactions where id=cmd.pending_interaction_id for update;
 select * into cmd from public.conversation_cycle_commands where id=target_command_id for update;
 if cmd.status<>'processing' or cmd.command_type<>'customer_answer' then return jsonb_build_object('success',false,'code','command_not_claimed'); end if;
 if cmd.execution_owner_id is distinct from execution_owner_id or cmd.execution_lease_expires_at<=statement_timestamp() then return jsonb_build_object('success',false,'code','ownership_lost'); end if;
 if cmd.source_message_id<>target_source_message_id then return jsonb_build_object('success',false,'code','interaction_not_current'); end if;
 if r.revision<>cmd.expected_runtime_revision or expected_runtime_revision<>cmd.expected_runtime_revision then return jsonb_build_object('success',false,'code','stale_runtime_revision'); end if;
 if k.current_version<>cmd.expected_knowledge_version or r.knowledge_state_version<>cmd.expected_knowledge_version or expected_knowledge_version<>cmd.expected_knowledge_version then return jsonb_build_object('success',false,'code','stale_knowledge_version'); end if;
 if p.id is null or p.status<>'pending' or r.active_pending_interaction_id<>p.id or p.runtime_revision<>cmd.expected_runtime_revision or p.expected_knowledge_state_version<>cmd.expected_knowledge_version or p.prompt_message_id<>cmd.prompt_message_id or p.snapshot_id is null then return jsonb_build_object('success',false,'code','interaction_not_current'); end if;
 if cmd.ai_inference_attempt_count>=3 then return jsonb_build_object('success',false,'code','attempts_exhausted'); end if;
 next_attempt:=cmd.ai_inference_attempt_count+1;
 update public.conversation_cycle_commands set ai_inference_attempt_count=next_attempt where id=cmd.id;
 return jsonb_build_object('success',true,'code','reserved','command_id',cmd.id,'attempt_number',next_attempt);
end $$;

create or replace function public.defer_customer_message_ai_retry(target_command_id uuid,target_source_message_id uuid,execution_owner_id uuid,failure_code text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare cmd public.conversation_cycle_commands%rowtype; retry_at timestamptz:=statement_timestamp()+interval '1 minute';
begin
 if auth.role()<>'service_role' then return jsonb_build_object('success',false,'code','command_not_found'); end if;
 if failure_code not in ('ai_timeout','ai_transient_provider_failure') then return jsonb_build_object('success',false,'code','invalid_input'); end if;
 select * into cmd from public.conversation_cycle_commands where id=target_command_id for update;
 if not found then return jsonb_build_object('success',false,'code','command_not_found'); end if;
 if cmd.status<>'processing' or cmd.command_type<>'customer_answer' then return jsonb_build_object('success',false,'code','command_not_claimed'); end if;
 if execution_owner_id is null or cmd.execution_owner_id is distinct from execution_owner_id or cmd.execution_lease_expires_at<=statement_timestamp() then return jsonb_build_object('success',false,'code','ownership_lost'); end if;
 if cmd.source_message_id<>target_source_message_id then return jsonb_build_object('success',false,'code','invalid_input'); end if;
 if cmd.ai_inference_attempt_count not between 1 and 2 then return jsonb_build_object('success',false,'code','attempts_exhausted'); end if;
 update public.conversation_cycle_commands set result_code=failure_code,execution_lease_expires_at=retry_at where id=cmd.id;
 return jsonb_build_object('success',true,'code','deferred','retry_at',retry_at,'attempt_count',cmd.ai_inference_attempt_count);
end $$;

comment on function public.reserve_customer_answer_ai_inference_attempt(uuid,uuid,integer,integer,uuid) is 'Atomically reserves one of at most three locally authorized provider-neutral inference requests; no external exactly-once guarantee.';
comment on function public.defer_customer_message_ai_retry(uuid,uuid,uuid,text) is 'Defers recoverable inference processing through the existing lease for at least 60 seconds; no business mutation.';
revoke all on function public.reserve_customer_answer_ai_inference_attempt(uuid,uuid,integer,integer,uuid),public.defer_customer_message_ai_retry(uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.reserve_customer_answer_ai_inference_attempt(uuid,uuid,integer,integer,uuid),public.defer_customer_message_ai_retry(uuid,uuid,uuid,text) to service_role;

-- Ownership is checked while the command row is locked, before any domain mutation.
create or replace function public.commit_customer_message_cycle(target_command_id uuid,commit_payload jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare
 cmd public.conversation_cycle_commands%rowtype; c public.conversations%rowtype; r public.conversation_runtime_states%rowtype;
 p public.conversation_pending_interactions%rowtype; ks public.project_knowledge_states%rowtype; knowledge_result jsonb;
 payload_hash bytea; next_revision integer; resulting_version integer; next_interaction jsonb; action jsonb; rendered jsonb;
 item jsonb; ev jsonb; outbound_id uuid; pending_id uuid; next_sequence integer; runtime_status public.conversation_runtime_status;
 result_kind text; selected_request jsonb;
begin
 if auth.role()<>'service_role' then return jsonb_build_object('success',false,'code','command_not_found'); end if;
 if target_command_id is null or jsonb_typeof(commit_payload)<>'object' or octet_length(commit_payload::text)>262144 then return jsonb_build_object('success',false,'code','invalid_input'); end if;
 payload_hash:=digest(convert_to(commit_payload::text,'UTF8'),'sha256');
 -- Stable lock order: Conversation, Runtime, Knowledge, Pending, Command. Command is first read without a lock only to discover bindings.
 select * into cmd from public.conversation_cycle_commands where id=target_command_id;
 if not found then return jsonb_build_object('success',false,'code','command_not_found'); end if;
 select * into c from public.conversations where id=cmd.conversation_id for update;
 select * into r from public.conversation_runtime_states where conversation_id=cmd.conversation_id for update;
 select * into ks from public.project_knowledge_states where project_id=cmd.project_id for update;
 select * into p from public.conversation_pending_interactions where id=cmd.pending_interaction_id for update;
 select * into cmd from public.conversation_cycle_commands where id=target_command_id for update;
 if commit_payload->>'execution_owner_id' is null or cmd.execution_owner_id is distinct from (commit_payload->>'execution_owner_id')::uuid or cmd.execution_lease_expires_at<=statement_timestamp() then return jsonb_build_object('success',false,'code','ownership_lost'); end if;
 if cmd.status='completed' then
  if cmd.commit_payload_hash is distinct from payload_hash then return jsonb_build_object('success',false,'code','duplicate_conflict'); end if;
  return jsonb_build_object('success',true,'code','replayed','command_id',cmd.id,'runtime_revision',cmd.result_runtime_revision,'knowledge_version',cmd.result_knowledge_version,'outbound_message_id',cmd.outbound_message_id,'pending_interaction_id',case when cmd.outbound_message_id is null then null else cmd.next_pending_interaction_id end,'result_kind',cmd.result_code);
 end if;
 if cmd.status<>'processing' or cmd.command_type<>'customer_answer' then return jsonb_build_object('success',false,'code','command_not_claimed'); end if;
 if c.id is null or r.conversation_id is null or ks.id is null or p.id is null then return jsonb_build_object('success',false,'code','runtime_invariant_failed'); end if;
 if cmd.project_id<>c.current_project_id or r.project_id<>cmd.project_id or p.project_id<>cmd.project_id or p.conversation_id<>cmd.conversation_id then return jsonb_build_object('success',false,'code','message_conversation_mismatch'); end if;
 if commit_payload->>'source_message_id'<>cmd.source_message_id::text or commit_payload->>'pending_interaction_id'<>cmd.pending_interaction_id::text then return jsonb_build_object('success',false,'code','message_conversation_mismatch'); end if;
 if r.revision<>cmd.expected_runtime_revision or (commit_payload->>'expected_runtime_revision')::integer<>cmd.expected_runtime_revision then return jsonb_build_object('success',false,'code','stale_runtime_revision'); end if;
 if ks.current_version<>cmd.expected_knowledge_version or r.knowledge_state_version<>cmd.expected_knowledge_version or (commit_payload->>'expected_knowledge_version')::integer<>cmd.expected_knowledge_version then return jsonb_build_object('success',false,'code','stale_knowledge_version'); end if;
 if p.status<>'pending' or r.active_pending_interaction_id<>p.id or p.runtime_revision<>cmd.expected_runtime_revision or p.expected_knowledge_state_version<>cmd.expected_knowledge_version
  or p.prompt_message_id<>cmd.prompt_message_id or p.snapshot_id is null then return jsonb_build_object('success',false,'code','interaction_not_current'); end if;
 if coalesce(commit_payload->>'knowledge_outcome','transition_applied') not in ('transition_applied','no_claim') then return jsonb_build_object('success',false,'code','invalid_input'); end if;
 if coalesce(commit_payload->>'knowledge_outcome','transition_applied')='transition_applied' and (commit_payload#>>'{normalized_answer,answer_id}'<>cmd.source_message_id::text or commit_payload#>>'{interpretation,proposal,transition_id}'<>cmd.transition_id::text
  or commit_payload#>>'{proposal,transition_id}'<>cmd.transition_id::text or commit_payload#>>'{proposal,interpretation_id}'<>cmd.interpretation_id::text
  or commit_payload#>>'{apply_result,apply_id}'<>cmd.apply_id::text or commit_payload#>>'{apply_result,transition_id}'<>cmd.transition_id::text
  or (commit_payload#>>'{apply_result,previous_state_version}')::integer<>cmd.expected_knowledge_version) then return jsonb_build_object('success',false,'code','invalid_input'); end if;
 if commit_payload->>'knowledge_outcome'='no_claim' and (cmd.ai_inference_attempt_count<1 or commit_payload ? 'normalized_answer' or commit_payload ? 'interpretation' or commit_payload ? 'proposal' or commit_payload ? 'apply_result' or (commit_payload->>'current_state_version')::integer<>cmd.expected_knowledge_version) then return jsonb_build_object('success',false,'code','invalid_input'); end if;
 if commit_payload->'events' is null or jsonb_typeof(commit_payload->'events')<>'array' or jsonb_array_length(commit_payload->'events')>cardinality(cmd.event_ids) then return jsonb_build_object('success',false,'code','invalid_input'); end if;

 if coalesce(commit_payload->>'knowledge_outcome','transition_applied')='transition_applied' then
  knowledge_result:=public.apply_customer_answer_knowledge_transition(cmd.id,jsonb_build_object('proposal',commit_payload->'proposal','apply_id',commit_payload#>>'{apply_result,apply_id}','changed',(commit_payload#>>'{apply_result,changed}')::boolean));
  if coalesce((knowledge_result->>'success')::boolean,false)=false then return jsonb_build_object('success',false,'code',case when knowledge_result->>'code' in ('knowledge_stale') then 'stale_knowledge_version' when knowledge_result->>'code'='duplicate_conflict' then 'duplicate_conflict' else 'persistence_failed' end); end if;
  resulting_version:=(knowledge_result->>'resulting_knowledge_version')::integer;
 else resulting_version:=cmd.expected_knowledge_version;
 end if;
 if resulting_version<>(commit_payload->>'current_state_version')::integer then raise exception 'resulting_knowledge_version_mismatch'; end if;
 next_revision:=r.revision+1;
 perform set_config('app.runtime_authority_mutation','allowed',true);
 update public.conversation_pending_interactions set status='answered',answered_by_message_id=cmd.source_message_id,answered_at=cmd.execution_at where id=p.id;

 delete from public.conversation_information_collection x where x.conversation_id=cmd.conversation_id and not exists(select 1 from jsonb_array_elements(commit_payload#>'{information_collection_state,items}') i where i->>'information_key'=x.information_key and i->>'entity_type'=x.entity_type and (i->>'entity_id')::uuid=x.entity_id);
 for item in select value from jsonb_array_elements(commit_payload#>'{information_collection_state,items}') loop
  insert into public.conversation_information_collection(conversation_id,project_id,information_key,entity_type,entity_id,collection_status,last_answer_meaning,attempts,evidence_requirement,revisit_status,dependency_signature,last_collection_path,last_gain_reason,collection_version,runtime_revision,updated_at)
  values(cmd.conversation_id,cmd.project_id,item->>'information_key',item->>'entity_type',(item->>'entity_id')::uuid,item->>'collection_status',item->>'last_answer_meaning',(item->>'attempts')::integer,item->>'evidence_requirement',item->>'revisit_status',item->'last_dependency_signature',item->>'last_collection_path',item->>'last_gain_reason',(commit_payload#>>'{information_collection_state,version}')::integer,next_revision,(commit_payload#>>'{information_collection_state,updated_at}')::timestamptz)
  on conflict(conversation_id,information_key,entity_type,entity_id) do update set collection_status=excluded.collection_status,last_answer_meaning=excluded.last_answer_meaning,attempts=excluded.attempts,evidence_requirement=excluded.evidence_requirement,revisit_status=excluded.revisit_status,dependency_signature=excluded.dependency_signature,last_collection_path=excluded.last_collection_path,last_gain_reason=excluded.last_gain_reason,collection_version=excluded.collection_version,runtime_revision=excluded.runtime_revision,updated_at=excluded.updated_at;
 end loop;
 delete from public.conversation_retry_states x where x.conversation_id=cmd.conversation_id and not exists(select 1 from jsonb_array_elements(commit_payload#>'{retry_state,items}') i where i->>'information_key'=x.information_key and i->>'entity_type'=x.entity_type and (i->>'entity_id')::uuid=x.entity_id);
 for item in select value from jsonb_array_elements(commit_payload#>'{retry_state,items}') loop
  insert into public.conversation_retry_states(conversation_id,project_id,information_key,entity_type,entity_id,attempts,last_outcome,last_attempt_at,runtime_revision)
  values(cmd.conversation_id,cmd.project_id,item->>'information_key',item->>'entity_type',(item->>'entity_id')::uuid,(item->>'attempts')::integer,item->>'last_outcome',(item->>'last_attempt_at')::timestamptz,next_revision)
  on conflict(conversation_id,information_key,entity_type,entity_id) do update set attempts=excluded.attempts,last_outcome=excluded.last_outcome,last_attempt_at=excluded.last_attempt_at,runtime_revision=excluded.runtime_revision;
 end loop;
 insert into public.conversation_effort_states(conversation_id,project_id,consecutive_technical_questions,unanswered_questions,repeated_questions,last_break_at,runtime_revision)
 values(cmd.conversation_id,cmd.project_id,(commit_payload#>>'{customer_effort_state,consecutive_technical_questions}')::integer,(commit_payload#>>'{customer_effort_state,unanswered_questions}')::integer,(commit_payload#>>'{customer_effort_state,repeated_questions}')::integer,(commit_payload#>>'{customer_effort_state,last_break_at}')::timestamptz,next_revision)
 on conflict(conversation_id) do update set consecutive_technical_questions=excluded.consecutive_technical_questions,unanswered_questions=excluded.unanswered_questions,repeated_questions=excluded.repeated_questions,last_break_at=excluded.last_break_at,runtime_revision=excluded.runtime_revision;

 selected_request:=commit_payload->'selected_evidence_request';
 if selected_request is not null and jsonb_typeof(selected_request)='object' then
  if selected_request->>'request_id'<>cmd.next_evidence_request_id::text
   or not exists(select 1 from jsonb_array_elements(commit_payload#>'{evidence_request_state,requests}') state_item where state_item->>'request_id'=selected_request->>'request_id' and state_item->>'status'='requested')
  then raise exception 'evidence_request_binding_mismatch'; end if;
  insert into public.conversation_evidence_request_states(request_id,conversation_id,project_id,target_key,bundle_key,status,requested_information_keys,purpose_codes,required_views,minimum_count,maximum_count,attempts,requested_at,evidence_revision,runtime_revision)
  values((selected_request->>'request_id')::uuid,cmd.conversation_id,cmd.project_id,selected_request->>'target_key',selected_request->>'bundle_key','requested',array(select jsonb_array_elements_text(selected_request->'information_keys')),array(select jsonb_array_elements_text(selected_request->'purpose_codes')),array(select jsonb_array_elements_text(selected_request->'required_views')),(selected_request->>'minimum_count')::integer,(selected_request->>'maximum_count')::integer,1,cmd.execution_at,(commit_payload#>>'{evidence_request_state,revision}')::integer,next_revision);
 end if;

 next_interaction:=commit_payload->'next_interaction'; outbound_id:=null; pending_id:=null;
 if next_interaction is not null and jsonb_typeof(next_interaction)='object' then
  action:=next_interaction->'selected_action'; rendered:=next_interaction->'rendered_interaction';
  if action->>'decision_id'<>cmd.planner_decision_id::text or action->>'project_id'<>cmd.project_id::text or action->>'conversation_id'<>cmd.conversation_id::text
   or (action->>'based_on_state_version')::integer<>resulting_version or rendered->>'decision_id'<>action->>'decision_id'
   or next_interaction->>'outbound_text' is distinct from concat_ws(E'\n\n',rendered->>'primary_text',rendered->>'supporting_text',rendered->>'help_text') then raise exception 'next_interaction_binding_mismatch'; end if;
  outbound_id:=cmd.next_outbound_message_id; pending_id:=cmd.next_pending_interaction_id;
  next_sequence:=coalesce((select max(sequence) from public.conversation_messages where conversation_id=cmd.conversation_id),0)+1;
  set constraints planner_snapshot_pending_fk,planner_snapshot_message_fk,pending_snapshot_fk deferred;
  insert into public.conversation_interaction_snapshots(id,pending_interaction_id,conversation_id,project_id,runtime_revision,knowledge_state_version,outbound_message_id,outbound_message_sequence,snapshot_schema_version,selected_action,rendered_interaction)
  values(cmd.next_snapshot_id,pending_id,cmd.conversation_id,cmd.project_id,next_revision,resulting_version,outbound_id,next_sequence,1,action,rendered);
  insert into public.conversation_messages(id,conversation_id,sequence,direction,message_kind,actor_class,occurred_at,idempotency_key) values(outbound_id,cmd.conversation_id,next_sequence,'outbound','text','system',cmd.execution_at,'cycle:'||cmd.id);
  insert into public.conversation_message_text(message_id,body) values(outbound_id,next_interaction->>'outbound_text');
  insert into public.conversation_pending_interactions(id,conversation_id,project_id,decision_id,selected_action_type,information_key,entity_type,entity_id,template_key,template_version,locale,answer_type,expected_knowledge_state_version,runtime_revision,prompt_message_id,snapshot_id)
  values(pending_id,cmd.conversation_id,cmd.project_id,(action->>'decision_id')::uuid,action->>'action_type',action->>'information_key',action->>'entity_type',(action->>'entity_id')::uuid,action->>'template_key',(action->>'template_version')::integer,rendered->>'locale',action#>>'{answer_contract,answer_type}',resulting_version,next_revision,outbound_id,cmd.next_snapshot_id);
  runtime_status:='awaiting_customer_answer'; result_kind:='completed_with_next_interaction';
 elsif commit_payload->>'cycle_status'='evidence_request_selected' then
  if selected_request is null or selected_request->>'request_id'<>cmd.next_evidence_request_id::text then raise exception 'evidence_request_binding_mismatch'; end if;
  runtime_status:='awaiting_evidence'; result_kind:='evidence_request';
 elsif commit_payload->>'cycle_status'='intermediate_result_ready' then runtime_status:='intermediate_break'; result_kind:='intermediate_break';
 elsif commit_payload->>'cycle_status'='collection_stopped' then runtime_status:='collection_stopped'; result_kind:='collection_stopped';
 else runtime_status:='idle'; result_kind:='collection_stopped'; end if;

 update public.conversation_runtime_states set revision=next_revision,knowledge_state_version=resulting_version,runtime_status=runtime_status,active_pending_interaction_id=pending_id,active_evidence_request_id=case when runtime_status='awaiting_evidence' then cmd.next_evidence_request_id else null end,updated_at=cmd.execution_at where conversation_id=cmd.conversation_id;
 for ev in select value from jsonb_array_elements(commit_payload->'events') loop
  if (ev->>'event_id')::uuid<>cmd.event_ids[((ev->>'sequence')::integer-cmd.event_sequence_start)+1] or ev->>'conversation_id'<>cmd.conversation_id::text or ev->>'project_id'<>cmd.project_id::text or ev->>'correlation_id'<>cmd.correlation_id::text then raise exception 'event_binding_mismatch'; end if;
  insert into public.conversation_cycle_events(id,command_id,conversation_id,project_id,sequence,event_type,actor_class,state_version_before,state_version_after,correlation_id,metadata,occurred_at)
  values((ev->>'event_id')::uuid,cmd.id,cmd.conversation_id,cmd.project_id,(ev->>'sequence')::integer,ev->>'event_type',ev->>'actor_class',(ev->>'state_version_before')::integer,(ev->>'state_version_after')::integer,(ev->>'correlation_id')::uuid,ev->'payload',(ev->>'occurred_at')::timestamptz);
 end loop;
 update public.conversation_cycle_commands set status='completed',result_code=result_kind,result_runtime_revision=next_revision,result_knowledge_version=resulting_version,outbound_message_id=outbound_id,commit_payload_hash=payload_hash,completed_at=statement_timestamp(),execution_lease_expires_at=null where id=cmd.id;
 return jsonb_build_object('success',true,'code','committed','command_id',cmd.id,'runtime_revision',next_revision,'knowledge_version',resulting_version,'outbound_message_id',outbound_id,'pending_interaction_id',pending_id,'result_kind',result_kind);
exception when unique_violation or foreign_key_violation or check_violation or invalid_text_representation or array_subscript_error then
 raise exception 'atomic_cycle_commit_rejected' using errcode='P0001';
end $$;

create or replace function public.complete_customer_message_human_review(target_command_id uuid,review_payload jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare cmd public.conversation_cycle_commands%rowtype; c public.conversations%rowtype; r public.conversation_runtime_states%rowtype; p public.conversation_pending_interactions%rowtype; k integer; next_revision integer; technical_reason text;
begin
 if auth.role()<>'service_role' then return jsonb_build_object('success',false,'code','command_not_found'); end if;
 technical_reason:=review_payload->>'technical_reason';
 if technical_reason is not null and technical_reason not in ('ai_configuration_failure','ai_attempts_exhausted','ai_non_transient_failure') then return jsonb_build_object('success',false,'code','invalid_input'); end if;
 select * into cmd from public.conversation_cycle_commands where id=target_command_id;
 if not found then return jsonb_build_object('success',false,'code','command_not_found'); end if;
 select * into c from public.conversations where id=cmd.conversation_id for update;
 select * into r from public.conversation_runtime_states where conversation_id=cmd.conversation_id for update;
 select current_version into k from public.project_knowledge_states where project_id=cmd.project_id for update;
 select * into p from public.conversation_pending_interactions where id=cmd.pending_interaction_id for update;
 select * into cmd from public.conversation_cycle_commands where id=target_command_id for update;
 if review_payload->>'execution_owner_id' is null or cmd.execution_owner_id is distinct from (review_payload->>'execution_owner_id')::uuid or cmd.execution_lease_expires_at<=statement_timestamp() then return jsonb_build_object('success',false,'code','ownership_lost'); end if;
 if cmd.status<>'processing' then return jsonb_build_object('success',false,'code','command_not_claimed'); end if;
 if review_payload->>'source_message_id'<>cmd.source_message_id::text or review_payload->>'pending_interaction_id'<>cmd.pending_interaction_id::text or r.revision<>cmd.expected_runtime_revision or k<>cmd.expected_knowledge_version or p.status<>'pending' or (technical_reason is not null and ((review_payload->>'expected_runtime_revision')::integer<>cmd.expected_runtime_revision or (review_payload->>'expected_knowledge_version')::integer<>cmd.expected_knowledge_version)) then return jsonb_build_object('success',false,'code','interaction_not_current'); end if;
 next_revision:=r.revision+1; perform set_config('app.runtime_authority_mutation','allowed',true);
 update public.conversation_pending_interactions set status='answered',answered_by_message_id=cmd.source_message_id,answered_at=cmd.execution_at where id=p.id;
 update public.conversation_runtime_states set revision=next_revision,runtime_status='human_review',active_pending_interaction_id=null,active_evidence_request_id=null,updated_at=cmd.execution_at where conversation_id=cmd.conversation_id;
 update public.conversation_cycle_commands set status='human_review_required',result_code=coalesce(technical_reason,'human_review'),result_runtime_revision=next_revision,result_knowledge_version=k,completed_at=statement_timestamp(),execution_lease_expires_at=null where id=cmd.id;
 if technical_reason is not null then
  insert into public.audit_log(actor_id,entity_type,entity_id,action,metadata) values(null,'conversation_cycle_command',cmd.id,'conversation_cycle_technical_human_review_requested',jsonb_build_object('command_id',cmd.id,'conversation_id',cmd.conversation_id,'project_id',cmd.project_id,'reason',technical_reason,'ai_attempt_count',cmd.ai_inference_attempt_count,'runtime_revision_before',r.revision,'runtime_revision_after',next_revision,'knowledge_version',k,'occurred_at',statement_timestamp()));
 end if;
 return jsonb_build_object('success',true,'command_id',cmd.id,'runtime_revision',next_revision,'knowledge_version',k,'pending_interaction_id',null);
end $$;

revoke all on function public.commit_customer_message_cycle(uuid,jsonb),public.complete_customer_message_human_review(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.commit_customer_message_cycle(uuid,jsonb),public.complete_customer_message_human_review(uuid,jsonb) to service_role;


-- Discovery is side-effect free. Acquisition remains the sole command bootstrap authority.
create or replace function public.discover_missing_customer_answer_cycles(result_limit integer default 100)
returns table(source_message_id uuid, discovered_at timestamptz)
language sql security definer set search_path=public,pg_temp as $$
 select m.id, statement_timestamp()
 from public.conversation_messages m
 join public.conversations c on c.id=m.conversation_id
 join public.conversation_runtime_states r on r.conversation_id=c.id and r.project_id=c.current_project_id
 join public.conversation_pending_interactions p on p.id=r.active_pending_interaction_id
 join public.project_knowledge_states k on k.project_id=r.project_id
 join public.conversation_messages prompt on prompt.id=p.prompt_message_id and prompt.conversation_id=c.id
 join public.conversation_interaction_snapshots s on s.id=p.snapshot_id and s.pending_interaction_id=p.id
 where auth.role()='service_role'
  and m.direction='inbound' and m.actor_class='customer' and m.message_kind='text'
  and c.status='open' and c.current_project_id is not null
  and r.runtime_status='awaiting_customer_answer' and r.active_pending_interaction_id is not null
  and p.status='pending' and p.conversation_id=c.id and p.project_id=r.project_id
  and p.runtime_revision=r.revision and p.expected_knowledge_state_version=r.knowledge_state_version
  and k.current_version=r.knowledge_state_version and p.snapshot_id is not null and p.prompt_message_id is not null
  and m.sequence>prompt.sequence
  and not exists(select 1 from public.conversation_cycle_commands cmd where cmd.source_message_id=m.id and cmd.command_type='customer_answer')
  and p.answered_by_message_id is null
 order by m.occurred_at,m.id
 limit least(greatest(result_limit,1),100)
$$;
revoke all on function public.discover_missing_customer_answer_cycles(integer) from public,anon,authenticated;
grant execute on function public.discover_missing_customer_answer_cycles(integer) to service_role;
