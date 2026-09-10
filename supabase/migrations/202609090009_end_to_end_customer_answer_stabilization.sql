-- AP-16-06-06D-15: retry technical failures by lease/backoff, never by a customer lifetime budget.
create or replace function public.claim_customer_message_cycle(target_message_id uuid) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare
 m public.conversation_messages%rowtype; c public.conversations%rowtype;
 r public.conversation_runtime_states%rowtype; p public.conversation_pending_interactions%rowtype;
 s public.conversation_interaction_snapshots%rowtype; pm public.conversation_messages%rowtype;
 k integer; cmd public.conversation_cycle_commands%rowtype; prompt_sequence integer; event_start integer;
 rehabilitated boolean:=false; previous_attempts integer; epoch_attempts integer;
begin
 if auth.role() is distinct from 'service_role' then raise insufficient_privilege using message='customer_message_cycle_service_role_required'; end if;
 select * into m from public.conversation_messages where id=target_message_id;
 if not found then return jsonb_build_object('success',false,'code','message_not_found'); end if;
 select * into c from public.conversations where id=m.conversation_id for update;
 select * into r from public.conversation_runtime_states where conversation_id=c.id for update;
 select * into cmd from public.conversation_cycle_commands where source_message_id=m.id for update;
 if found and cmd.status in ('completed','stale','human_review_required') then
  return jsonb_build_object('success',true,'replay',true,'command_id',cmd.id,'status',cmd.status,'result_code',cmd.result_code,'result_runtime_revision',cmd.result_runtime_revision,'result_knowledge_version',cmd.result_knowledge_version,'outbound_message_id',cmd.outbound_message_id);
 end if;
 if c.status<>'open' or c.current_project_id is null or r.conversation_id is null or r.project_id<>c.current_project_id or r.runtime_status<>'awaiting_customer_answer' then return jsonb_build_object('success',false,'code','conversation_not_processable'); end if;
 if m.direction<>'inbound' or m.actor_class<>'customer' or m.message_kind<>'text' then return jsonb_build_object('success',false,'code','message_not_inbound_customer_text'); end if;
 select * into p from public.conversation_pending_interactions where id=r.active_pending_interaction_id for update;
 if p.id is null or p.status<>'pending' or p.answered_by_message_id is not null then return jsonb_build_object('success',false,'code','pending_interaction_not_found'); end if;
 select current_version into k from public.project_knowledge_states where project_id=r.project_id for update;
 if p.runtime_revision<>r.revision then return jsonb_build_object('success',false,'code','stale_runtime_revision'); end if;
 if p.expected_knowledge_state_version<>r.knowledge_state_version or p.expected_knowledge_state_version<>k then return jsonb_build_object('success',false,'code','stale_knowledge_version'); end if;
 if p.snapshot_id is null then return jsonb_build_object('success',false,'code','pending_interaction_not_found'); end if;
 select * into s from public.conversation_interaction_snapshots where id=p.snapshot_id;
 select * into pm from public.conversation_messages where id=p.prompt_message_id;
 prompt_sequence:=pm.sequence;
 if s.id is null or s.pending_interaction_id<>p.id or s.conversation_id<>c.id or s.project_id<>r.project_id or s.runtime_revision<>r.revision or s.knowledge_state_version<>k or s.outbound_message_id<>p.prompt_message_id or pm.id is null or pm.conversation_id<>c.id or pm.direction<>'outbound' or pm.actor_class not in ('system','ai') or pm.message_kind<>'text' or pm.sequence<>s.outbound_message_sequence or prompt_sequence is null or m.sequence<=prompt_sequence or not exists(select 1 from public.conversation_message_text mt where mt.message_id=m.id) or not exists(select 1 from public.conversation_message_text mt where mt.message_id=pm.id and mt.body=concat_ws(E'\n\n',s.rendered_interaction->>'primary_text',s.rendered_interaction->>'supporting_text',s.rendered_interaction->>'help_text')) then return jsonb_build_object('success',false,'code','message_precedes_interaction'); end if;
 if exists(select 1 from public.conversation_messages newer where newer.conversation_id=c.id and newer.direction='inbound' and newer.actor_class='customer' and newer.sequence>m.sequence) then return jsonb_build_object('success',false,'code','interaction_not_current'); end if;
 event_start:=coalesce((select max(sequence) from public.conversation_messages where conversation_id=c.id),0)+1;
 if cmd.id is null then
  insert into public.conversation_cycle_commands(conversation_id,project_id,source_message_id,prompt_message_id,command_type,idempotency_key,expected_conversation_revision,expected_runtime_revision,expected_knowledge_version,pending_interaction_id,status,execution_at,event_sequence_start,correlation_id,interpretation_id,transition_id,claim_id,customer_evidence_id,system_evidence_id,apply_id,assessment_id,planner_decision_id,event_ids,next_evidence_request_id,next_pending_interaction_id,next_snapshot_id,next_outbound_message_id)
  values(c.id,r.project_id,m.id,p.prompt_message_id,'customer_answer','answer:'||m.id,c.revision,r.revision,k,p.id,'processing',statement_timestamp(),event_start,gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),array[gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid()],gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid()) returning * into cmd;
 elsif cmd.status='failed' then
  if cmd.command_type<>'customer_answer' or cmd.result_code not in ('persistence_failed','cycle_failed') or cmd.conversation_id<>c.id or cmd.project_id<>r.project_id or cmd.pending_interaction_id<>p.id or cmd.prompt_message_id<>p.prompt_message_id or cmd.expected_conversation_revision<>c.revision or cmd.expected_runtime_revision<>r.revision or cmd.expected_knowledge_version<>k or (cmd.execution_lease_expires_at is not null and cmd.execution_lease_expires_at>statement_timestamp()) then return jsonb_build_object('success',false,'code','interaction_not_current'); end if;
  update public.conversation_cycle_commands set status='processing',failed_at=null where id=cmd.id returning * into cmd;
 end if;
 return jsonb_build_object('success',true,'replay',false,'command_id',cmd.id,'conversation_id',c.id,'project_id',r.project_id,'pending_interaction_id',p.id,'expected_conversation_revision',c.revision,'expected_runtime_revision',r.revision,'expected_knowledge_version',k,'message_sequence',m.sequence,'prompt_sequence',prompt_sequence,'technical_rehabilitated',rehabilitated,'technical_rehabilitation_count',cmd.technical_rehabilitation_count,'previous_execution_attempt_count',previous_attempts,'technical_epoch_attempt_limit',2147483647);
end $$;

drop function if exists public.discover_recoverable_conversation_cycles(integer);
create function public.discover_recoverable_conversation_cycles(result_limit integer default 100)
returns table(command_id uuid,source_message_id uuid,lease_expired_at timestamptz,requires_technical_rehabilitation boolean)
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if auth.role() is distinct from 'service_role' then raise insufficient_privilege using message='conversation_cycle_recovery_service_role_required'; end if;
 return query select cmd.id,cmd.source_message_id,coalesce(cmd.execution_lease_expires_at,cmd.last_execution_started_at,cmd.created_at),
  false as requires_technical_rehabilitation
 from public.conversation_cycle_commands cmd
 join public.conversations c on c.id=cmd.conversation_id and c.status='open' and c.current_project_id=cmd.project_id and c.revision=cmd.expected_conversation_revision
 join public.conversation_runtime_states r on r.conversation_id=c.id and r.project_id=cmd.project_id and r.runtime_status='awaiting_customer_answer' and r.revision=cmd.expected_runtime_revision and r.knowledge_state_version=cmd.expected_knowledge_version and r.active_pending_interaction_id=cmd.pending_interaction_id
 join public.project_knowledge_states k on k.project_id=cmd.project_id and k.current_version=cmd.expected_knowledge_version
 join public.conversation_pending_interactions p on p.id=cmd.pending_interaction_id and p.status='pending' and p.answered_by_message_id is null and p.conversation_id=cmd.conversation_id and p.project_id=cmd.project_id and p.runtime_revision=cmd.expected_runtime_revision and p.expected_knowledge_state_version=cmd.expected_knowledge_version and p.prompt_message_id=cmd.prompt_message_id
 join public.conversation_interaction_snapshots s on s.id=p.snapshot_id and s.pending_interaction_id=p.id and s.conversation_id=cmd.conversation_id and s.project_id=cmd.project_id and s.runtime_revision=cmd.expected_runtime_revision and s.knowledge_state_version=cmd.expected_knowledge_version and s.outbound_message_id=cmd.prompt_message_id
 join public.conversation_messages source on source.id=cmd.source_message_id and source.conversation_id=cmd.conversation_id and source.direction='inbound' and source.actor_class='customer' and source.message_kind='text'
 join public.conversation_messages prompt on prompt.id=cmd.prompt_message_id and prompt.conversation_id=cmd.conversation_id and prompt.direction='outbound' and prompt.actor_class in ('system','ai') and prompt.message_kind='text' and prompt.sequence=s.outbound_message_sequence and source.sequence>prompt.sequence
 where cmd.command_type='customer_answer' and cmd.source_message_id is not null and
  ((cmd.status='processing' and (cmd.execution_lease_expires_at<=statement_timestamp() or cmd.execution_lease_expires_at is null))
   or (cmd.status='failed' and cmd.result_code in ('persistence_failed','cycle_failed')
       and (cmd.execution_lease_expires_at<=statement_timestamp() or cmd.execution_lease_expires_at is null)))
  and exists(select 1 from public.conversation_message_text mt where mt.message_id=source.id)
  and exists(select 1 from public.conversation_message_text mt where mt.message_id=prompt.id and mt.body=concat_ws(E'\n\n',s.rendered_interaction->>'primary_text',s.rendered_interaction->>'supporting_text',s.rendered_interaction->>'help_text'))
  and not exists(select 1 from public.conversation_messages newer where newer.conversation_id=cmd.conversation_id and newer.direction='inbound' and newer.actor_class='customer' and newer.sequence>source.sequence)
 order by coalesce(cmd.execution_lease_expires_at,cmd.last_execution_started_at,cmd.created_at),cmd.id
 limit least(greatest(result_limit,1),100);
end $$;

revoke all on function public.claim_customer_message_cycle(uuid),public.discover_recoverable_conversation_cycles(integer) from public,anon,authenticated;
grant execute on function public.claim_customer_message_cycle(uuid),public.discover_recoverable_conversation_cycles(integer) to service_role;
comment on function public.discover_recoverable_conversation_cycles(integer) is 'Service-only discovery of current customer answers after an expired lease/backoff; technical execution has no lifetime attempt budget.';


create or replace function public.acquire_customer_message_cycle_execution(target_message_id uuid,execution_owner uuid,lease_seconds integer) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare claimed jsonb; cmd public.conversation_cycle_commands%rowtype; now_at timestamptz:=statement_timestamp(); reclaimed boolean;
begin
 if auth.role() is distinct from 'service_role' then raise insufficient_privilege using message='customer_message_cycle_service_role_required'; end if;
 if execution_owner is null or lease_seconds<30 or lease_seconds>900 then return jsonb_build_object('success',false,'code','invalid_input'); end if;
 claimed:=public.claim_customer_message_cycle(target_message_id);
 if coalesce((claimed->>'success')::boolean,false)=false or coalesce((claimed->>'replay')::boolean,false)=true then return claimed; end if;
 select * into cmd from public.conversation_cycle_commands where id=(claimed->>'command_id')::uuid for update;
 if cmd.status<>'processing' then return jsonb_build_object('success',false,'code','busy','command_id',cmd.id); end if;
 if cmd.execution_owner_id is not null and cmd.execution_lease_expires_at>now_at and cmd.execution_owner_id<>execution_owner then return jsonb_build_object('success',false,'code','busy','command_id',cmd.id); end if;
 reclaimed:=cmd.execution_attempt_count>0 or cmd.execution_owner_id is not null;
 update public.conversation_cycle_commands set execution_owner_id=execution_owner,execution_lease_expires_at=now_at+make_interval(secs=>lease_seconds),execution_attempt_count=execution_attempt_count+1,last_execution_started_at=now_at where id=cmd.id;
 return claimed||jsonb_build_object('acquire_kind',case when reclaimed then 'reclaimed' else 'acquired' end,'execution_owner_id',execution_owner,'execution_lease_expires_at',now_at+make_interval(secs=>lease_seconds),'execution_attempt_count',cmd.execution_attempt_count+1);
end $$;


create or replace function public.fail_customer_message_cycle(target_command_id uuid,failure_code text,execution_owner_id uuid default null) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare cmd public.conversation_cycle_commands%rowtype; retry_at timestamptz;
begin
 if auth.role() is distinct from 'service_role' then raise insufficient_privilege using message='customer_message_cycle_service_role_required'; end if;
 if failure_code not in ('normalization_failed','cycle_failed','persistence_failed') then return jsonb_build_object('success',false,'code','invalid_input'); end if;
 select * into cmd from public.conversation_cycle_commands where id=target_command_id for update;
 if not found then return jsonb_build_object('success',false,'code','command_not_found'); end if;
 if execution_owner_id is null or cmd.execution_owner_id is distinct from execution_owner_id or cmd.execution_lease_expires_at<=statement_timestamp() then return jsonb_build_object('success',false,'code','ownership_lost'); end if;
 if cmd.status in ('completed','human_review_required','stale') then return jsonb_build_object('success',false,'code','command_not_claimed'); end if;
 if cmd.status='failed' then return jsonb_build_object('success',true,'code','replayed','command_id',cmd.id); end if;
 if cmd.status<>'processing' then return jsonb_build_object('success',false,'code','command_not_claimed'); end if;
 retry_at:=statement_timestamp()+make_interval(secs=>least(3600,greatest(30,30*(2^least(cmd.execution_attempt_count,7))))::integer);
 update public.conversation_cycle_commands set status='failed',result_code=failure_code,failed_at=statement_timestamp(),execution_owner_id=null,execution_lease_expires_at=case when failure_code in ('cycle_failed','persistence_failed') then retry_at else null end where id=cmd.id;
 return jsonb_build_object('success',true,'code','failed','command_id',cmd.id,'retry_at',case when failure_code in ('cycle_failed','persistence_failed') then retry_at else null end);
end $$;

revoke all on function public.acquire_customer_message_cycle_execution(uuid,uuid,integer),public.fail_customer_message_cycle(uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.acquire_customer_message_cycle_execution(uuid,uuid,integer),public.fail_customer_message_cycle(uuid,text,uuid) to service_role;
comment on function public.fail_customer_message_cycle(uuid,text,uuid) is 'Ownership-fenced failure persistence; retryable technical failures receive capped exponential time backoff without a lifetime attempt ceiling.';
