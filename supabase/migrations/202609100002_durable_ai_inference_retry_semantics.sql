-- AP-16-06-06D-17: durable, authority-bound AI results and one-time v1 exhaustion rehabilitation.
alter table public.conversation_cycle_commands add column inference_semantics_version integer not null default 1;
alter table public.conversation_cycle_commands add column legacy_ai_exhaustion_rehabilitated_at timestamptz;
alter table public.conversation_cycle_commands add column current_semantics_ai_attempt_count integer not null default 0;
alter table public.conversation_cycle_commands add constraint conversation_cycle_commands_inference_semantics_check check(inference_semantics_version in (1,2));
alter table public.conversation_cycle_commands add constraint conversation_cycle_commands_current_semantics_attempt_check check(current_semantics_ai_attempt_count between 0 and 3);
alter table public.conversation_cycle_commands alter column inference_semantics_version set default 2;

create table public.customer_answer_ai_inference_results(
 command_id uuid primary key references public.conversation_cycle_commands(id) on delete restrict,
 source_message_id uuid not null references public.conversation_messages(id) on delete restrict,
 conversation_id uuid not null references public.conversations(id) on delete restrict,
 project_id uuid not null references public.projects(id) on delete restrict,
 pending_interaction_id uuid not null references public.conversation_pending_interactions(id) on delete restrict,
 decision_id uuid not null,
 expected_runtime_revision integer not null check(expected_runtime_revision>0),
 expected_knowledge_version integer not null check(expected_knowledge_version>0),
 information_key text not null check(length(information_key) between 1 and 128),
 semantics_version integer not null check(semantics_version=2),
 schema_version integer not null check(schema_version=1),
 attempt_number integer not null check(attempt_number between 1 and 3),
 outcome text not null check(outcome in ('matched','no_match','ambiguous')),
 canonical_value text check(length(canonical_value) between 1 and 128),
 completed_at timestamptz not null default statement_timestamp(),
 created_at timestamptz not null default statement_timestamp(),
 constraint customer_answer_ai_result_value_check check((outcome='matched' and canonical_value is not null) or (outcome<>'matched' and canonical_value is null))
);
alter table public.customer_answer_ai_inference_results enable row level security;
revoke all on public.customer_answer_ai_inference_results from public,anon,authenticated;
grant select,insert on public.customer_answer_ai_inference_results to service_role;

create or replace function public.get_customer_answer_ai_inference_result(target_command_id uuid,target_source_message_id uuid,target_pending_interaction_id uuid,target_conversation_id uuid,target_project_id uuid,target_decision_id uuid,expected_runtime_revision integer,expected_knowledge_version integer,target_information_key text,execution_owner_id uuid) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare x public.customer_answer_ai_inference_results%rowtype;
begin
 if auth.role() is distinct from 'service_role' then raise insufficient_privilege using message='customer_answer_ai_result_service_role_required'; end if;
 select ar.* into x from public.customer_answer_ai_inference_results ar
 join public.conversation_cycle_commands cmd on cmd.id=ar.command_id and cmd.status='processing' and cmd.execution_owner_id=execution_owner_id and cmd.execution_lease_expires_at>statement_timestamp()
 join public.conversation_runtime_states r on r.conversation_id=ar.conversation_id and r.project_id=ar.project_id and r.runtime_status='awaiting_customer_answer' and r.active_pending_interaction_id=ar.pending_interaction_id and r.revision=ar.expected_runtime_revision and r.knowledge_state_version=ar.expected_knowledge_version
 join public.conversation_pending_interactions p on p.id=ar.pending_interaction_id and p.status='pending' and p.answered_by_message_id is null
 where ar.command_id=target_command_id and ar.source_message_id=target_source_message_id and ar.pending_interaction_id=target_pending_interaction_id and ar.conversation_id=target_conversation_id and ar.project_id=target_project_id and ar.decision_id=target_decision_id and ar.expected_runtime_revision=expected_runtime_revision and ar.expected_knowledge_version=expected_knowledge_version and ar.information_key=target_information_key and ar.semantics_version=2 and ar.schema_version=1;
 if not found then return jsonb_build_object('success',true,'found',false); end if;
 return jsonb_build_object('success',true,'found',true,'outcome',x.outcome,'canonical_value',x.canonical_value,'attempt_number',x.attempt_number,'semantics_version',x.semantics_version,'schema_version',x.schema_version);
end $$;

create or replace function public.persist_customer_answer_ai_inference_result(target_command_id uuid,target_source_message_id uuid,target_pending_interaction_id uuid,target_conversation_id uuid,target_project_id uuid,target_decision_id uuid,expected_runtime_revision integer,expected_knowledge_version integer,target_information_key text,execution_owner_id uuid,inference_outcome text,canonical_value text,inference_attempt_number integer,inference_semantics_version integer,result_schema_version integer) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare cmd public.conversation_cycle_commands%rowtype; existing public.customer_answer_ai_inference_results%rowtype;
begin
 if auth.role() is distinct from 'service_role' then raise insufficient_privilege using message='customer_answer_ai_result_service_role_required'; end if;
 if inference_outcome not in ('matched','no_match','ambiguous') or inference_semantics_version<>2 or result_schema_version<>1 or inference_attempt_number not between 1 and 3 or (inference_outcome='matched')<>(canonical_value is not null) then return jsonb_build_object('success',false,'code','invalid_input'); end if;
 select * into cmd from public.conversation_cycle_commands where id=target_command_id for update;
 if not found or cmd.status<>'processing' or cmd.command_type<>'customer_answer' or cmd.execution_owner_id is distinct from execution_owner_id or cmd.execution_lease_expires_at<=statement_timestamp() or cmd.source_message_id<>target_source_message_id or cmd.pending_interaction_id<>target_pending_interaction_id or cmd.conversation_id<>target_conversation_id or cmd.project_id<>target_project_id or cmd.expected_runtime_revision<>expected_runtime_revision or cmd.expected_knowledge_version<>expected_knowledge_version then return jsonb_build_object('success',false,'code','authority_rejected'); end if;
 if not exists(select 1 from public.conversation_runtime_states r join public.conversation_pending_interactions p on p.id=r.active_pending_interaction_id where r.conversation_id=target_conversation_id and r.project_id=target_project_id and r.runtime_status='awaiting_customer_answer' and r.revision=expected_runtime_revision and r.knowledge_state_version=expected_knowledge_version and p.id=target_pending_interaction_id and p.status='pending' and p.answered_by_message_id is null) then return jsonb_build_object('success',false,'code','authority_rejected'); end if;
 select * into existing from public.customer_answer_ai_inference_results where command_id=target_command_id;
 if found then return jsonb_build_object('success',(existing.source_message_id=target_source_message_id and existing.decision_id=target_decision_id and existing.information_key=target_information_key and existing.outcome=inference_outcome and existing.canonical_value is not distinct from canonical_value),'code','replayed'); end if;
 insert into public.customer_answer_ai_inference_results(command_id,source_message_id,conversation_id,project_id,pending_interaction_id,decision_id,expected_runtime_revision,expected_knowledge_version,information_key,semantics_version,schema_version,attempt_number,outcome,canonical_value) values(target_command_id,target_source_message_id,target_conversation_id,target_project_id,target_pending_interaction_id,target_decision_id,expected_runtime_revision,expected_knowledge_version,target_information_key,2,1,inference_attempt_number,inference_outcome,canonical_value);
 return jsonb_build_object('success',true,'code','persisted');
end $$;

-- Preserve the D-15 authority and add a narrow pre-claim transition for v1 false exhaustion.
alter function public.acquire_customer_message_cycle_execution(uuid,uuid,integer) rename to acquire_customer_message_cycle_execution_v1;
create function public.acquire_customer_message_cycle_execution(target_message_id uuid,execution_owner uuid,lease_seconds integer) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare cmd public.conversation_cycle_commands%rowtype;
begin
 if auth.role() is distinct from 'service_role' then raise insufficient_privilege using message='customer_message_cycle_service_role_required'; end if;
 select * into cmd from public.conversation_cycle_commands where source_message_id=target_message_id for update;
 if found and cmd.command_type='customer_answer' and cmd.status='human_review_required' and cmd.result_code='ai_attempts_exhausted' and cmd.inference_semantics_version=1 and cmd.legacy_ai_exhaustion_rehabilitated_at is null
 and exists(select 1 from public.conversations c join public.conversation_runtime_states r on r.conversation_id=c.id join public.conversation_pending_interactions p on p.id=r.active_pending_interaction_id join public.conversation_interaction_snapshots s on s.id=p.snapshot_id where c.id=cmd.conversation_id and c.status='open' and c.current_project_id=cmd.project_id and c.revision=cmd.expected_conversation_revision and r.project_id=cmd.project_id and r.runtime_status='awaiting_customer_answer' and r.revision=cmd.expected_runtime_revision and r.knowledge_state_version=cmd.expected_knowledge_version and p.id=cmd.pending_interaction_id and p.status='pending' and p.answered_by_message_id is null and p.prompt_message_id=cmd.prompt_message_id and s.pending_interaction_id=p.id)
 and not exists(select 1 from public.conversation_messages newer join public.conversation_messages source on source.id=cmd.source_message_id where newer.conversation_id=cmd.conversation_id and newer.direction='inbound' and newer.actor_class='customer' and newer.sequence>source.sequence) then
  update public.conversation_cycle_commands set status='failed',result_code='cycle_failed',failed_at=statement_timestamp(),execution_lease_expires_at=null,inference_semantics_version=2,legacy_ai_exhaustion_rehabilitated_at=statement_timestamp() where id=cmd.id;
 end if;
 return public.acquire_customer_message_cycle_execution_v1(target_message_id,execution_owner,lease_seconds);
end $$;

-- Discovery admits exactly the migration-scoped, still-current v1 exhaustion candidates.
drop function public.discover_recoverable_conversation_cycles(integer);
create function public.discover_recoverable_conversation_cycles(result_limit integer default 100) returns table(command_id uuid,source_message_id uuid,lease_expired_at timestamptz,requires_technical_rehabilitation boolean)
language sql security definer set search_path=public,pg_temp as $$
 select cmd.id,cmd.source_message_id,coalesce(cmd.execution_lease_expires_at,cmd.last_execution_started_at,cmd.created_at),
  (cmd.status='human_review_required')
 from public.conversation_cycle_commands cmd
 join public.conversations c on c.id=cmd.conversation_id and c.status='open' and c.current_project_id=cmd.project_id and c.revision=cmd.expected_conversation_revision
 join public.conversation_runtime_states r on r.conversation_id=c.id and r.project_id=cmd.project_id and r.runtime_status='awaiting_customer_answer' and r.revision=cmd.expected_runtime_revision and r.knowledge_state_version=cmd.expected_knowledge_version and r.active_pending_interaction_id=cmd.pending_interaction_id
 join public.conversation_pending_interactions p on p.id=cmd.pending_interaction_id and p.status='pending' and p.answered_by_message_id is null and p.prompt_message_id=cmd.prompt_message_id
 join public.conversation_messages source on source.id=cmd.source_message_id
 where auth.role()='service_role' and cmd.command_type='customer_answer' and
 (((cmd.status='processing' or (cmd.status='failed' and cmd.result_code in ('persistence_failed','cycle_failed'))) and (cmd.execution_lease_expires_at<=statement_timestamp() or cmd.execution_lease_expires_at is null))
 or (cmd.status='human_review_required' and cmd.result_code='ai_attempts_exhausted' and cmd.inference_semantics_version=1 and cmd.legacy_ai_exhaustion_rehabilitated_at is null))
 and not exists(select 1 from public.conversation_messages newer where newer.conversation_id=cmd.conversation_id and newer.direction='inbound' and newer.actor_class='customer' and newer.sequence>source.sequence)
 order by 3,cmd.id limit least(greatest(result_limit,1),100)
$$;

revoke all on function public.get_customer_answer_ai_inference_result(uuid,uuid,uuid,uuid,uuid,uuid,integer,integer,text,uuid), public.persist_customer_answer_ai_inference_result(uuid,uuid,uuid,uuid,uuid,uuid,integer,integer,text,uuid,text,text,integer,integer,integer), public.acquire_customer_message_cycle_execution(uuid,uuid,integer), public.acquire_customer_message_cycle_execution_v1(uuid,uuid,integer), public.discover_recoverable_conversation_cycles(integer) from public,anon,authenticated;
grant execute on function public.get_customer_answer_ai_inference_result(uuid,uuid,uuid,uuid,uuid,uuid,integer,integer,text,uuid), public.persist_customer_answer_ai_inference_result(uuid,uuid,uuid,uuid,uuid,uuid,integer,integer,text,uuid,text,text,integer,integer,integer), public.acquire_customer_message_cycle_execution(uuid,uuid,integer), public.discover_recoverable_conversation_cycles(integer) to service_role;

create or replace function public.guard_cycle_command_history() returns trigger language plpgsql set search_path=public,pg_temp as $$ begin
 if old.status='human_review_required' and old.result_code='ai_attempts_exhausted' and old.inference_semantics_version=1 and old.legacy_ai_exhaustion_rehabilitated_at is null and new.status='failed' and new.result_code='cycle_failed' and new.inference_semantics_version=2 and new.legacy_ai_exhaustion_rehabilitated_at is not null then return new; end if;
 if old.status in ('completed','stale','human_review_required') or new.id<>old.id or new.conversation_id<>old.conversation_id
  or new.project_id is distinct from old.project_id or new.source_message_id is distinct from old.source_message_id or new.prompt_message_id is distinct from old.prompt_message_id or new.command_type<>old.command_type
  or new.idempotency_key<>old.idempotency_key or new.expected_conversation_revision<>old.expected_conversation_revision or new.expected_runtime_revision<>old.expected_runtime_revision or new.expected_knowledge_version<>old.expected_knowledge_version
  or new.pending_interaction_id is distinct from old.pending_interaction_id or new.execution_at is distinct from old.execution_at or new.correlation_id is distinct from old.correlation_id or new.interpretation_id is distinct from old.interpretation_id
  or new.transition_id is distinct from old.transition_id or new.claim_id is distinct from old.claim_id or new.customer_evidence_id is distinct from old.customer_evidence_id or new.system_evidence_id is distinct from old.system_evidence_id
  or new.apply_id is distinct from old.apply_id or new.assessment_id is distinct from old.assessment_id or new.planner_decision_id is distinct from old.planner_decision_id or new.event_ids is distinct from old.event_ids
  or new.next_evidence_request_id is distinct from old.next_evidence_request_id or new.next_pending_interaction_id is distinct from old.next_pending_interaction_id or new.next_snapshot_id is distinct from old.next_snapshot_id or new.next_outbound_message_id is distinct from old.next_outbound_message_id
  or new.event_sequence_start is distinct from old.event_sequence_start or new.ai_inference_attempt_count<old.ai_inference_attempt_count or new.ai_inference_attempt_count>old.ai_inference_attempt_count+1
  or new.current_semantics_ai_attempt_count<old.current_semantics_ai_attempt_count or new.current_semantics_ai_attempt_count>old.current_semantics_ai_attempt_count+1 then raise exception 'cycle_command_immutable'; end if;
 return new;
end $$;

create or replace function public.reserve_customer_answer_ai_inference_attempt(target_command_id uuid,target_source_message_id uuid,expected_runtime_revision integer,expected_knowledge_version integer,execution_owner_id uuid) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare cmd public.conversation_cycle_commands%rowtype; r public.conversation_runtime_states%rowtype; p public.conversation_pending_interactions%rowtype; k public.project_knowledge_states%rowtype; next_attempt integer;
begin
 if auth.role()<>'service_role' then return jsonb_build_object('success',false,'code','command_not_found'); end if;
 select * into cmd from public.conversation_cycle_commands where id=target_command_id for update;
 select * into r from public.conversation_runtime_states where conversation_id=cmd.conversation_id for update;
 select * into k from public.project_knowledge_states where project_id=cmd.project_id for update;
 select * into p from public.conversation_pending_interactions where id=cmd.pending_interaction_id for update;
 if not found or cmd.status<>'processing' or cmd.command_type<>'customer_answer' then return jsonb_build_object('success',false,'code','command_not_claimed'); end if;
 if cmd.execution_owner_id is distinct from execution_owner_id or cmd.execution_lease_expires_at<=statement_timestamp() then return jsonb_build_object('success',false,'code','ownership_lost'); end if;
 if cmd.source_message_id<>target_source_message_id or p.id is null or p.status<>'pending' or p.answered_by_message_id is not null then return jsonb_build_object('success',false,'code','interaction_not_current'); end if;
 if r.revision<>expected_runtime_revision or r.revision<>cmd.expected_runtime_revision then return jsonb_build_object('success',false,'code','stale_runtime_revision'); end if;
 if k.current_version<>expected_knowledge_version or r.knowledge_state_version<>expected_knowledge_version or expected_knowledge_version<>cmd.expected_knowledge_version then return jsonb_build_object('success',false,'code','stale_knowledge_version'); end if;
 if cmd.inference_semantics_version<>2 or cmd.current_semantics_ai_attempt_count>=3 or (cmd.legacy_ai_exhaustion_rehabilitated_at is not null and cmd.current_semantics_ai_attempt_count>=1) then return jsonb_build_object('success',false,'code','attempts_exhausted'); end if;
 next_attempt:=cmd.current_semantics_ai_attempt_count+1;
 update public.conversation_cycle_commands set current_semantics_ai_attempt_count=next_attempt,ai_inference_attempt_count=case when legacy_ai_exhaustion_rehabilitated_at is null then ai_inference_attempt_count+1 else ai_inference_attempt_count end where id=cmd.id;
 return jsonb_build_object('success',true,'code','reserved','command_id',cmd.id,'attempt_number',next_attempt);
end $$;
revoke all on function public.reserve_customer_answer_ai_inference_attempt(uuid,uuid,integer,integer,uuid) from public,anon,authenticated;
grant execute on function public.reserve_customer_answer_ai_inference_attempt(uuid,uuid,integer,integer,uuid) to service_role;
