-- AP-16-06-06D-18: reconstruct authority only for proven v1 false-exhaustion Human Review.
alter table public.conversation_pending_interactions
 add column recovery_of_pending_interaction_id uuid references public.conversation_pending_interactions(id) on delete restrict;
create unique index one_recovery_pending_per_original
 on public.conversation_pending_interactions(recovery_of_pending_interaction_id)
 where recovery_of_pending_interaction_id is not null;

alter table public.conversation_interaction_snapshots
 add column recovery_of_snapshot_id uuid references public.conversation_interaction_snapshots(id) on delete restrict;
alter table public.conversation_interaction_snapshots
 drop constraint conversation_interaction_snapshots_outbound_message_id_key;
create unique index one_original_snapshot_per_outbound
 on public.conversation_interaction_snapshots(outbound_message_id)
 where recovery_of_snapshot_id is null;
create unique index one_recovery_snapshot_per_original
 on public.conversation_interaction_snapshots(recovery_of_snapshot_id)
 where recovery_of_snapshot_id is not null;

-- The explicit lineage columns are immutable along with the rest of Pending Interaction identity.
create or replace function public.guard_runtime_identity() returns trigger language plpgsql set search_path=public,pg_temp as $$ begin
 if tg_table_name='conversation_pending_interactions' and (new.conversation_id<>old.conversation_id or new.project_id<>old.project_id or new.decision_id<>old.decision_id or new.selected_action_type<>old.selected_action_type or new.information_key<>old.information_key or new.entity_type<>old.entity_type or new.entity_id<>old.entity_id or new.template_key<>old.template_key or new.template_version<>old.template_version or new.answer_type<>old.answer_type or new.expected_knowledge_state_version<>old.expected_knowledge_state_version or new.runtime_revision<>old.runtime_revision or new.recovery_of_pending_interaction_id is distinct from old.recovery_of_pending_interaction_id) then raise exception 'pending_interaction_identity_immutable'; end if;
 if coalesce(current_setting('app.runtime_authority_mutation',true),'')<>'allowed' then raise exception 'runtime_mutation_requires_authority'; end if; return new; end $$;

-- This is the only authority allowed to continue a terminal command with successor runtime identity.
create or replace function public.guard_cycle_command_history() returns trigger language plpgsql set search_path=public,pg_temp as $$ begin
 if old.status='human_review_required' and old.result_code='ai_attempts_exhausted' and old.inference_semantics_version=1 and old.legacy_ai_exhaustion_rehabilitated_at is null
  and new.status='failed' and new.result_code='cycle_failed' and new.inference_semantics_version=2 and new.legacy_ai_exhaustion_rehabilitated_at is not null
  and new.expected_runtime_revision=old.result_runtime_revision+1 and new.expected_knowledge_version=old.expected_knowledge_version
  and new.pending_interaction_id<>old.pending_interaction_id and new.prompt_message_id=old.prompt_message_id
  and new.ai_inference_attempt_count=old.ai_inference_attempt_count and new.current_semantics_ai_attempt_count=0 then return new; end if;
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

create function public.rehabilitate_legacy_ai_exhaustion_human_review(target_message_id uuid) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare
 cmd public.conversation_cycle_commands%rowtype; c public.conversations%rowtype; r public.conversation_runtime_states%rowtype;
 p public.conversation_pending_interactions%rowtype; s public.conversation_interaction_snapshots%rowtype;
 source public.conversation_messages%rowtype; recovery_pending_id uuid:=gen_random_uuid(); recovery_snapshot_id uuid:=gen_random_uuid();
 next_revision integer; now_at timestamptz:=statement_timestamp();
begin
 if auth.role() is distinct from 'service_role' then raise insufficient_privilege using message='legacy_human_review_rehabilitation_service_role_required'; end if;
 select * into cmd from public.conversation_cycle_commands where source_message_id=target_message_id for update;
 if not found then return jsonb_build_object('success',false,'code','command_not_found'); end if;
 if cmd.legacy_ai_exhaustion_rehabilitated_at is not null then return jsonb_build_object('success',true,'code','already_rehabilitated','command_id',cmd.id); end if;
 if cmd.command_type<>'customer_answer' or cmd.status<>'human_review_required' or cmd.result_code<>'ai_attempts_exhausted' or cmd.inference_semantics_version<>1 then return jsonb_build_object('success',false,'code','not_eligible'); end if;
 select * into c from public.conversations where id=cmd.conversation_id for update;
 select * into r from public.conversation_runtime_states where conversation_id=cmd.conversation_id for update;
 select * into p from public.conversation_pending_interactions where id=cmd.pending_interaction_id for update;
 select * into s from public.conversation_interaction_snapshots where id=p.snapshot_id;
 select * into source from public.conversation_messages where id=cmd.source_message_id;
 if c.id is null or c.status<>'open' or c.current_project_id is distinct from cmd.project_id or c.revision<>cmd.expected_conversation_revision then return jsonb_build_object('success',false,'code','conversation_authority_changed'); end if;
 if source.id is null or source.conversation_id<>cmd.conversation_id or source.direction<>'inbound' or source.actor_class<>'customer' or source.message_kind<>'text' or not exists(select 1 from public.conversation_message_text mt where mt.message_id=source.id) then return jsonb_build_object('success',false,'code','source_invalid'); end if;
 if exists(select 1 from public.conversation_messages newer where newer.conversation_id=cmd.conversation_id and newer.direction='inbound' and newer.actor_class='customer' and newer.sequence>source.sequence) then return jsonb_build_object('success',false,'code','newer_customer_inbound'); end if;
 if r.conversation_id is null or r.project_id<>cmd.project_id or r.runtime_status<>'human_review' or r.active_pending_interaction_id is not null or r.active_evidence_request_id is not null or r.revision<>cmd.expected_runtime_revision+1 or r.revision<>cmd.result_runtime_revision or r.knowledge_state_version<>cmd.expected_knowledge_version or (select current_version from public.project_knowledge_states where project_id=cmd.project_id)<>cmd.expected_knowledge_version then return jsonb_build_object('success',false,'code','runtime_lineage_changed'); end if;
 if p.id is null or p.conversation_id<>cmd.conversation_id or p.project_id<>cmd.project_id or p.status<>'answered' or p.answered_by_message_id is distinct from cmd.source_message_id or p.runtime_revision<>cmd.expected_runtime_revision or p.expected_knowledge_state_version<>cmd.expected_knowledge_version or p.prompt_message_id is distinct from cmd.prompt_message_id then return jsonb_build_object('success',false,'code','pending_lineage_changed'); end if;
 if s.id is null or s.pending_interaction_id<>p.id or s.conversation_id<>cmd.conversation_id or s.project_id<>cmd.project_id or s.runtime_revision<>cmd.expected_runtime_revision or s.knowledge_state_version<>cmd.expected_knowledge_version or s.outbound_message_id is distinct from cmd.prompt_message_id then return jsonb_build_object('success',false,'code','snapshot_lineage_changed'); end if;
 if exists(select 1 from public.conversation_pending_interactions newer where newer.conversation_id=cmd.conversation_id and newer.status='pending') then return jsonb_build_object('success',false,'code','newer_pending_interaction'); end if;
 if not exists(select 1 from public.audit_log a where a.entity_type='conversation_cycle_command' and a.entity_id=cmd.id and a.action='conversation_cycle_technical_human_review_requested' and a.metadata->>'command_id'=cmd.id::text and a.metadata->>'reason'='ai_attempts_exhausted' and (a.metadata->>'runtime_revision_before')::integer=cmd.expected_runtime_revision and (a.metadata->>'runtime_revision_after')::integer=r.revision and (a.metadata->>'knowledge_version')::integer=cmd.expected_knowledge_version) then return jsonb_build_object('success',false,'code','human_review_provenance_missing'); end if;
 next_revision:=r.revision+1;
 set constraints all deferred;
 insert into public.conversation_pending_interactions(id,conversation_id,project_id,decision_id,selected_action_type,information_key,entity_type,entity_id,template_key,template_version,locale,answer_type,expected_knowledge_state_version,runtime_revision,status,prompt_message_id,snapshot_id,recovery_of_pending_interaction_id)
 values(recovery_pending_id,p.conversation_id,p.project_id,p.decision_id,p.selected_action_type,p.information_key,p.entity_type,p.entity_id,p.template_key,p.template_version,p.locale,p.answer_type,p.expected_knowledge_state_version,next_revision,'pending',p.prompt_message_id,recovery_snapshot_id,p.id);
 insert into public.conversation_interaction_snapshots(id,pending_interaction_id,conversation_id,project_id,runtime_revision,knowledge_state_version,outbound_message_id,outbound_message_sequence,snapshot_schema_version,selected_action,rendered_interaction,recovery_of_snapshot_id)
 values(recovery_snapshot_id,recovery_pending_id,s.conversation_id,s.project_id,next_revision,s.knowledge_state_version,s.outbound_message_id,s.outbound_message_sequence,s.snapshot_schema_version,s.selected_action,s.rendered_interaction,s.id);
 perform set_config('app.runtime_authority_mutation','allowed',true);
 update public.conversation_effort_states set runtime_revision=next_revision where conversation_id=cmd.conversation_id and project_id=cmd.project_id and runtime_revision=r.revision;
 update public.conversation_runtime_states set revision=next_revision,runtime_status='awaiting_customer_answer',active_pending_interaction_id=recovery_pending_id,updated_at=now_at where conversation_id=cmd.conversation_id;
 update public.conversation_cycle_commands set status='failed',result_code='cycle_failed',failed_at=now_at,completed_at=null,result_runtime_revision=null,result_knowledge_version=null,pending_interaction_id=recovery_pending_id,expected_runtime_revision=next_revision,inference_semantics_version=2,legacy_ai_exhaustion_rehabilitated_at=now_at,execution_owner_id=null,execution_lease_expires_at=null where id=cmd.id;
 insert into public.audit_log(actor_id,entity_type,entity_id,action,metadata) values(null,'conversation_cycle_command',cmd.id,'legacy_ai_exhaustion_human_review_rehabilitated',jsonb_build_object('command_id',cmd.id,'conversation_id',cmd.conversation_id,'project_id',cmd.project_id,'source_message_id',cmd.source_message_id,'original_pending_interaction_id',p.id,'recovery_pending_interaction_id',recovery_pending_id,'runtime_revision_before',r.revision,'runtime_revision_after',next_revision,'knowledge_version',cmd.expected_knowledge_version,'historical_ai_attempt_count',cmd.ai_inference_attempt_count,'result_code','rehabilitated'));
 return jsonb_build_object('success',true,'code','rehabilitated','command_id',cmd.id,'recovery_pending_interaction_id',recovery_pending_id,'runtime_revision',next_revision);
end $$;

-- D-17 acquisition remains the normal lease authority after the atomic D-18 reconstruction.
alter function public.acquire_customer_message_cycle_execution(uuid,uuid,integer) rename to acquire_customer_message_cycle_execution_d17;
create function public.acquire_customer_message_cycle_execution(target_message_id uuid,execution_owner uuid,lease_seconds integer) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare rehabilitation jsonb; acquired jsonb;
begin
 if auth.role() is distinct from 'service_role' then raise insufficient_privilege using message='customer_message_cycle_service_role_required'; end if;
 rehabilitation:=public.rehabilitate_legacy_ai_exhaustion_human_review(target_message_id);
 acquired:=public.acquire_customer_message_cycle_execution_d17(target_message_id,execution_owner,lease_seconds);
 if rehabilitation->>'code'='rehabilitated' then
  return acquired||jsonb_build_object('legacy_human_review_rehabilitation_attempted',true,'legacy_human_review_rehabilitation_succeeded',true,'legacy_human_review_rehabilitation_result_code','rehabilitated');
 end if;
 return acquired;
end $$;

-- Preserve normal D-17 discovery and add only the proven terminalized signature.
drop function public.discover_recoverable_conversation_cycles(integer);
create function public.discover_recoverable_conversation_cycles(result_limit integer default 100)
returns table(command_id uuid,source_message_id uuid,lease_expired_at timestamptz,requires_technical_rehabilitation boolean,legacy_human_review_rehabilitation_candidate boolean)
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if auth.role() is distinct from 'service_role' then raise insufficient_privilege using message='conversation_cycle_recovery_service_role_required'; end if;
 return query
 with candidates as (
  select cmd.id,cmd.source_message_id,coalesce(cmd.execution_lease_expires_at,cmd.last_execution_started_at,cmd.created_at) discovered_at,(cmd.status='human_review_required') d17,false d18
  from public.conversation_cycle_commands cmd
  join public.conversations c on c.id=cmd.conversation_id and c.status='open' and c.current_project_id=cmd.project_id and c.revision=cmd.expected_conversation_revision
  join public.conversation_runtime_states r on r.conversation_id=c.id and r.project_id=cmd.project_id and r.runtime_status='awaiting_customer_answer' and r.revision=cmd.expected_runtime_revision and r.knowledge_state_version=cmd.expected_knowledge_version and r.active_pending_interaction_id=cmd.pending_interaction_id
  join public.project_knowledge_states k on k.project_id=cmd.project_id and k.current_version=cmd.expected_knowledge_version
  join public.conversation_pending_interactions p on p.id=cmd.pending_interaction_id and p.status='pending' and p.answered_by_message_id is null and p.conversation_id=cmd.conversation_id and p.project_id=cmd.project_id and p.runtime_revision=cmd.expected_runtime_revision and p.expected_knowledge_state_version=cmd.expected_knowledge_version and p.prompt_message_id=cmd.prompt_message_id
  join public.conversation_interaction_snapshots s on s.id=p.snapshot_id and s.pending_interaction_id=p.id and s.conversation_id=cmd.conversation_id and s.project_id=cmd.project_id and s.runtime_revision=cmd.expected_runtime_revision and s.knowledge_state_version=cmd.expected_knowledge_version and s.outbound_message_id=cmd.prompt_message_id
  join public.conversation_messages source on source.id=cmd.source_message_id and source.conversation_id=cmd.conversation_id and source.direction='inbound' and source.actor_class='customer' and source.message_kind='text'
  join public.conversation_messages prompt on prompt.id=cmd.prompt_message_id and prompt.conversation_id=cmd.conversation_id and prompt.direction='outbound' and prompt.actor_class in ('system','ai') and prompt.message_kind='text' and prompt.sequence=s.outbound_message_sequence and source.sequence>prompt.sequence
  where cmd.command_type='customer_answer' and (((cmd.status in ('processing','failed')) and (cmd.status<>'failed' or cmd.result_code in ('persistence_failed','cycle_failed')) and (cmd.execution_lease_expires_at<=statement_timestamp() or cmd.execution_lease_expires_at is null)) or (cmd.status='human_review_required' and cmd.result_code='ai_attempts_exhausted' and cmd.inference_semantics_version=1 and cmd.legacy_ai_exhaustion_rehabilitated_at is null))
   and exists(select 1 from public.conversation_message_text mt where mt.message_id=source.id)
   and exists(select 1 from public.conversation_message_text mt where mt.message_id=prompt.id and mt.body=concat_ws(E'\n\n',s.rendered_interaction->>'primary_text',s.rendered_interaction->>'supporting_text',s.rendered_interaction->>'help_text'))
   and not exists(select 1 from public.conversation_messages newer where newer.conversation_id=cmd.conversation_id and newer.direction='inbound' and newer.actor_class='customer' and newer.sequence>source.sequence)
  union all
  select cmd.id,cmd.source_message_id,coalesce(cmd.completed_at,cmd.created_at),false,true
  from public.conversation_cycle_commands cmd
  join public.conversations c on c.id=cmd.conversation_id and c.status='open' and c.current_project_id=cmd.project_id and c.revision=cmd.expected_conversation_revision
  join public.conversation_runtime_states r on r.conversation_id=cmd.conversation_id and r.project_id=cmd.project_id and r.runtime_status='human_review' and r.revision=cmd.expected_runtime_revision+1 and r.revision=cmd.result_runtime_revision and r.knowledge_state_version=cmd.expected_knowledge_version and r.active_pending_interaction_id is null and r.active_evidence_request_id is null
  join public.project_knowledge_states k on k.project_id=cmd.project_id and k.current_version=cmd.expected_knowledge_version
  join public.conversation_pending_interactions p on p.id=cmd.pending_interaction_id and p.status='answered' and p.answered_by_message_id=cmd.source_message_id and p.runtime_revision=cmd.expected_runtime_revision and p.expected_knowledge_state_version=cmd.expected_knowledge_version and p.prompt_message_id=cmd.prompt_message_id
  join public.conversation_interaction_snapshots s on s.id=p.snapshot_id and s.pending_interaction_id=p.id and s.runtime_revision=cmd.expected_runtime_revision and s.knowledge_state_version=cmd.expected_knowledge_version and s.outbound_message_id=cmd.prompt_message_id
  join public.conversation_messages source on source.id=cmd.source_message_id and source.conversation_id=cmd.conversation_id and source.direction='inbound' and source.actor_class='customer' and source.message_kind='text'
  where cmd.command_type='customer_answer' and cmd.status='human_review_required' and cmd.result_code='ai_attempts_exhausted' and cmd.inference_semantics_version=1 and cmd.legacy_ai_exhaustion_rehabilitated_at is null
   and exists(select 1 from public.audit_log a where a.entity_type='conversation_cycle_command' and a.entity_id=cmd.id and a.action='conversation_cycle_technical_human_review_requested' and a.metadata->>'reason'='ai_attempts_exhausted' and (a.metadata->>'runtime_revision_before')::integer=cmd.expected_runtime_revision and (a.metadata->>'runtime_revision_after')::integer=r.revision)
   and not exists(select 1 from public.conversation_pending_interactions newer where newer.conversation_id=cmd.conversation_id and newer.status='pending')
   and not exists(select 1 from public.conversation_messages newer where newer.conversation_id=cmd.conversation_id and newer.direction='inbound' and newer.actor_class='customer' and newer.sequence>source.sequence)
 ) select x.id,x.source_message_id,x.discovered_at,x.d17,x.d18 from candidates x order by x.discovered_at,x.id limit least(greatest(result_limit,1),100);
end $$;

revoke all on function public.rehabilitate_legacy_ai_exhaustion_human_review(uuid),public.acquire_customer_message_cycle_execution(uuid,uuid,integer),public.acquire_customer_message_cycle_execution_d17(uuid,uuid,integer),public.discover_recoverable_conversation_cycles(integer) from public,anon,authenticated;
grant execute on function public.rehabilitate_legacy_ai_exhaustion_human_review(uuid),public.acquire_customer_message_cycle_execution(uuid,uuid,integer),public.discover_recoverable_conversation_cycles(integer) to service_role;
comment on function public.rehabilitate_legacy_ai_exhaustion_human_review(uuid) is 'Service-only, locked, idempotent D-18 reconstruction for audit-proven terminalized v1 false AI exhaustion.';
