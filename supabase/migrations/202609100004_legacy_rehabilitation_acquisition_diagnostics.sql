-- AP-16-06-06D-19: privacy-safe transactional phase diagnostics for D-18.
-- No data migration. The original SQLSTATE is retained and the raw database message is replaced.
create or replace function public.rehabilitate_legacy_ai_exhaustion_human_review(target_message_id uuid) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare
 cmd public.conversation_cycle_commands%rowtype; c public.conversations%rowtype; r public.conversation_runtime_states%rowtype;
 p public.conversation_pending_interactions%rowtype; s public.conversation_interaction_snapshots%rowtype;
 source public.conversation_messages%rowtype; recovery_pending_id uuid:=gen_random_uuid(); recovery_snapshot_id uuid:=gen_random_uuid();
 next_revision integer; now_at timestamptz:=statement_timestamp(); d19_db_stage text:='eligibility';
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
 d19_db_stage:='recovery_pending_insert';
 set constraints all deferred;
 insert into public.conversation_pending_interactions(id,conversation_id,project_id,decision_id,selected_action_type,information_key,entity_type,entity_id,template_key,template_version,locale,answer_type,expected_knowledge_state_version,runtime_revision,status,prompt_message_id,snapshot_id,recovery_of_pending_interaction_id)
 values(recovery_pending_id,p.conversation_id,p.project_id,p.decision_id,p.selected_action_type,p.information_key,p.entity_type,p.entity_id,p.template_key,p.template_version,p.locale,p.answer_type,p.expected_knowledge_state_version,next_revision,'pending',p.prompt_message_id,recovery_snapshot_id,p.id);
 d19_db_stage:='recovery_snapshot_insert';
 insert into public.conversation_interaction_snapshots(id,pending_interaction_id,conversation_id,project_id,runtime_revision,knowledge_state_version,outbound_message_id,outbound_message_sequence,snapshot_schema_version,selected_action,rendered_interaction,recovery_of_snapshot_id)
 values(recovery_snapshot_id,recovery_pending_id,s.conversation_id,s.project_id,next_revision,s.knowledge_state_version,s.outbound_message_id,s.outbound_message_sequence,s.snapshot_schema_version,s.selected_action,s.rendered_interaction,s.id);
 d19_db_stage:='effort_state_update';
 perform set_config('app.runtime_authority_mutation','allowed',true);
 update public.conversation_effort_states set runtime_revision=next_revision where conversation_id=cmd.conversation_id and project_id=cmd.project_id and runtime_revision=r.revision;
 d19_db_stage:='runtime_update';
 update public.conversation_runtime_states set revision=next_revision,runtime_status='awaiting_customer_answer',active_pending_interaction_id=recovery_pending_id,updated_at=now_at where conversation_id=cmd.conversation_id;
 d19_db_stage:='command_rehabilitation_update';
 update public.conversation_cycle_commands set status='failed',result_code='cycle_failed',failed_at=now_at,completed_at=null,result_runtime_revision=null,result_knowledge_version=null,pending_interaction_id=recovery_pending_id,expected_runtime_revision=next_revision,inference_semantics_version=2,legacy_ai_exhaustion_rehabilitated_at=now_at,execution_owner_id=null,execution_lease_expires_at=null where id=cmd.id;
 d19_db_stage:='audit_insert';
 insert into public.audit_log(actor_id,entity_type,entity_id,action,metadata) values(null,'conversation_cycle_command',cmd.id,'legacy_ai_exhaustion_human_review_rehabilitated',jsonb_build_object('command_id',cmd.id,'conversation_id',cmd.conversation_id,'project_id',cmd.project_id,'source_message_id',cmd.source_message_id,'original_pending_interaction_id',p.id,'recovery_pending_interaction_id',recovery_pending_id,'runtime_revision_before',r.revision,'runtime_revision_after',next_revision,'knowledge_version',cmd.expected_knowledge_version,'historical_ai_attempt_count',cmd.ai_inference_attempt_count,'result_code','rehabilitated'));
 d19_db_stage:='downstream_acquisition';
 return jsonb_build_object('success',true,'code','rehabilitated','command_id',cmd.id,'recovery_pending_interaction_id',recovery_pending_id,'runtime_revision',next_revision);
exception when others then
 raise exception using errcode=sqlstate,message='d19_db_stage:'||d19_db_stage;
end $$;

create or replace function public.acquire_customer_message_cycle_execution(target_message_id uuid,execution_owner uuid,lease_seconds integer) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare rehabilitation jsonb; acquired jsonb;
begin
 if auth.role() is distinct from 'service_role' then raise insufficient_privilege using message='d19_db_stage:eligibility'; end if;
 rehabilitation:=public.rehabilitate_legacy_ai_exhaustion_human_review(target_message_id);
 begin
  acquired:=public.acquire_customer_message_cycle_execution_d17(target_message_id,execution_owner,lease_seconds);
 exception when others then
  raise exception using errcode=sqlstate,message='d19_db_stage:downstream_acquisition';
 end;
 if rehabilitation->>'code'='rehabilitated' then
  return acquired||jsonb_build_object('legacy_human_review_rehabilitation_attempted',true,'legacy_human_review_rehabilitation_succeeded',true,'legacy_human_review_rehabilitation_result_code','rehabilitated');
 end if;
 return acquired;
end $$;

comment on function public.rehabilitate_legacy_ai_exhaustion_human_review(uuid) is 'D-19 service-only atomic D-18 rehabilitation with privacy-safe SQLSTATE and static write-phase diagnostics.';
