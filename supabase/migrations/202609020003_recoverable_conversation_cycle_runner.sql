-- AP-16-06-02: finite execution ownership, reclaim discovery, and terminal-write fencing.
alter table public.conversation_cycle_commands
 add column execution_owner_id uuid,
 add column execution_lease_expires_at timestamptz,
 add column execution_attempt_count integer not null default 0 check(execution_attempt_count>=0),
 add column last_execution_started_at timestamptz;

create index recoverable_conversation_cycle_commands
 on public.conversation_cycle_commands(execution_lease_expires_at,id)
 where status='processing';

comment on column public.conversation_cycle_commands.execution_owner_id is 'Opaque per-attempt infrastructure fencing identity; never a domain identity.';
comment on column public.conversation_cycle_commands.execution_lease_expires_at is 'Finite database-authoritative execution lease expiry.';
comment on column public.conversation_cycle_commands.execution_attempt_count is 'Observability count only; no max-attempt policy is introduced.';

create function public.acquire_customer_message_cycle_execution(target_message_id uuid,execution_owner uuid,lease_seconds integer) returns jsonb
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

create function public.discover_recoverable_conversation_cycles(result_limit integer default 100) returns table(command_id uuid,source_message_id uuid,lease_expired_at timestamptz)
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
revoke all on function public.fail_customer_message_cycle(uuid,text) from service_role;

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
 if commit_payload#>>'{normalized_answer,answer_id}'<>cmd.source_message_id::text or commit_payload#>>'{interpretation,proposal,transition_id}'<>cmd.transition_id::text
  or commit_payload#>>'{proposal,transition_id}'<>cmd.transition_id::text or commit_payload#>>'{proposal,interpretation_id}'<>cmd.interpretation_id::text
  or commit_payload#>>'{apply_result,apply_id}'<>cmd.apply_id::text or commit_payload#>>'{apply_result,transition_id}'<>cmd.transition_id::text
  or (commit_payload#>>'{apply_result,previous_state_version}')::integer<>cmd.expected_knowledge_version then return jsonb_build_object('success',false,'code','invalid_input'); end if;
 if commit_payload->'events' is null or jsonb_typeof(commit_payload->'events')<>'array' or jsonb_array_length(commit_payload->'events')>cardinality(cmd.event_ids) then return jsonb_build_object('success',false,'code','invalid_input'); end if;

 knowledge_result:=public.apply_customer_answer_knowledge_transition(cmd.id,jsonb_build_object('proposal',commit_payload->'proposal','apply_id',commit_payload#>>'{apply_result,apply_id}','changed',(commit_payload#>>'{apply_result,changed}')::boolean));
 if coalesce((knowledge_result->>'success')::boolean,false)=false then return jsonb_build_object('success',false,'code',case when knowledge_result->>'code' in ('knowledge_stale') then 'stale_knowledge_version' when knowledge_result->>'code'='duplicate_conflict' then 'duplicate_conflict' else 'persistence_failed' end); end if;
 resulting_version:=(knowledge_result->>'resulting_knowledge_version')::integer;
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
declare cmd public.conversation_cycle_commands%rowtype; r public.conversation_runtime_states%rowtype; p public.conversation_pending_interactions%rowtype; k integer; next_revision integer;
begin
 if auth.role()<>'service_role' then return jsonb_build_object('success',false,'code','command_not_found'); end if;
 select * into cmd from public.conversation_cycle_commands where id=target_command_id for update;
 if review_payload->>'execution_owner_id' is null or cmd.execution_owner_id is distinct from (review_payload->>'execution_owner_id')::uuid or cmd.execution_lease_expires_at<=statement_timestamp() then return jsonb_build_object('success',false,'code','ownership_lost'); end if;
 if not found or cmd.status<>'processing' then return jsonb_build_object('success',false,'code','command_not_claimed'); end if;
 select * into r from public.conversation_runtime_states where conversation_id=cmd.conversation_id for update;
 select * into p from public.conversation_pending_interactions where id=cmd.pending_interaction_id for update;
 select current_version into k from public.project_knowledge_states where project_id=cmd.project_id for update;
 if review_payload->>'source_message_id'<>cmd.source_message_id::text or review_payload->>'pending_interaction_id'<>cmd.pending_interaction_id::text or r.revision<>cmd.expected_runtime_revision or k<>cmd.expected_knowledge_version or p.status<>'pending' then return jsonb_build_object('success',false,'code','interaction_not_current'); end if;
 next_revision:=r.revision+1; perform set_config('app.runtime_authority_mutation','allowed',true);
 update public.conversation_pending_interactions set status='answered',answered_by_message_id=cmd.source_message_id,answered_at=cmd.execution_at where id=p.id;
 update public.conversation_runtime_states set revision=next_revision,runtime_status='human_review',active_pending_interaction_id=null,active_evidence_request_id=null,updated_at=cmd.execution_at where conversation_id=cmd.conversation_id;
 update public.conversation_cycle_commands set status='human_review_required',result_code='human_review',result_runtime_revision=next_revision,result_knowledge_version=k,completed_at=statement_timestamp(),execution_lease_expires_at=null where id=cmd.id;
 return jsonb_build_object('success',true,'command_id',cmd.id,'runtime_revision',next_revision,'knowledge_version',k,'pending_interaction_id',null);
end $$;

revoke all on function public.commit_customer_message_cycle(uuid,jsonb),public.complete_customer_message_human_review(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.commit_customer_message_cycle(uuid,jsonb),public.complete_customer_message_human_review(uuid,jsonb) to service_role;
