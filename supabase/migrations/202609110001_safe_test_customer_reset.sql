-- AP-16-06-06D-23: atomic, identity-based reset for an explicitly confirmed test contact.
-- Provider receipts are deliberately retained as replay tombstones.
create function public.reset_test_transport_customer(
  target_provider text,
  target_sender_scope text,
  target_external_identity text,
  target_confirmation text,
  dry_run boolean default true
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  identity_row public.conversation_transport_identities%rowtype;
  customer_count integer;
  conversation_count integer;
  project_count integer;
  message_count integer;
  result jsonb;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'test_reset_requires_service_role';
  end if;
  if target_confirmation is distinct from 'RESET TEST CUSTOMER' then
    raise exception 'test_reset_confirmation_required';
  end if;
  if target_provider is distinct from 'whatsapp' then
    raise exception 'test_reset_provider_not_supported';
  end if;
  if target_provider is null or target_sender_scope is null or target_external_identity is null
     or length(target_provider) not between 1 and 64
     or length(target_sender_scope) not between 1 and 255
     or length(target_external_identity) not between 1 and 255 then
    raise exception 'test_reset_invalid_identity';
  end if;

  select * into identity_row
  from public.conversation_transport_identities
  where provider = 'whatsapp'
    and sender_scope = target_sender_scope
    and external_identity = target_external_identity
  for update;
  if not found then raise exception 'test_reset_identity_not_found'; end if;
  if identity_row.customer_id is null then raise exception 'test_reset_customer_not_bound'; end if;

  -- Fail closed if the customer is shared by another external identity.
  if exists (
    select 1 from public.conversation_transport_identities
    where customer_id = identity_row.customer_id and id <> identity_row.id
  ) then raise exception 'test_reset_customer_shared'; end if;

  drop table if exists pg_temp.reset_conversations;
  drop table if exists pg_temp.reset_projects;
  create temporary table reset_conversations(id uuid primary key) on commit drop;
  insert into reset_conversations
  select distinct c.id
  from public.conversations c
  left join public.conversation_transport_bindings b on b.conversation_id = c.id
  where c.customer_id = identity_row.customer_id or b.transport_identity_id = identity_row.id;

  create temporary table reset_projects(id uuid primary key) on commit drop;
  insert into reset_projects
  select id from public.projects where customer_id = identity_row.customer_id;

  -- Every selected conversation/project must belong only to the selected customer.
  if exists (
    select 1 from public.conversations c join reset_conversations r on r.id=c.id
    where c.customer_id is distinct from identity_row.customer_id
  ) then raise exception 'test_reset_conversation_ownership_conflict'; end if;
  if exists (
    select 1 from public.conversation_project_assignments a join reset_conversations c on c.id=a.conversation_id
    left join reset_projects p on p.id=a.project_id where p.id is null
  ) then raise exception 'test_reset_project_ownership_conflict'; end if;

  -- Media/evidence/offer/execution records can own storage or commercial history.
  -- This MVP test reset intentionally refuses those identities instead of guessing.
  if exists(select 1 from public.project_media where project_id in(select id from reset_projects))
    or exists(select 1 from public.project_evidence where project_id in(select id from reset_projects))
    or exists(select 1 from public.project_offers where project_id in(select id from reset_projects))
    or exists(select 1 from public.project_executions where project_id in(select id from reset_projects))
  then raise exception 'test_reset_independent_project_data_present'; end if;
  if exists(
    select 1 from public.transport_message_attachments a
    join public.transport_message_bindings b on b.id=a.provider_message_binding_id
    where b.transport_identity_id=identity_row.id
  ) or exists(
    select 1 from public.transport_media_ingestion_commands
    where transport_identity_id=identity_row.id
  ) then raise exception 'test_reset_transport_media_present'; end if;

  select count(*) into customer_count from public.customers where id=identity_row.customer_id;
  select count(*) into conversation_count from reset_conversations;
  select count(*) into project_count from reset_projects;
  select count(*) into message_count from public.conversation_messages where conversation_id in(select id from reset_conversations);
  result := jsonb_build_object(
    'customers', customer_count, 'conversations', conversation_count,
    'projects', project_count, 'messages', message_count,
    'runtime_states', (select count(*) from public.conversation_runtime_states where conversation_id in(select id from reset_conversations)),
    'pending_interactions', (select count(*) from public.conversation_pending_interactions where conversation_id in(select id from reset_conversations)),
    'snapshots', (select count(*) from public.conversation_interaction_snapshots where conversation_id in(select id from reset_conversations)),
    'cycle_commands', (select count(*) from public.conversation_cycle_commands where conversation_id in(select id from reset_conversations)),
    'ai_results', (select count(*) from public.customer_answer_ai_inference_results where conversation_id in(select id from reset_conversations)),
    'answer_contexts', (select count(*) from public.customer_answer_execution_contexts where conversation_id in(select id from reset_conversations)),
    'provider_receipts_retained', (select count(*) from public.transport_webhook_receipts
      where internal_message_id in(select id from public.conversation_messages where conversation_id in(select id from reset_conversations))),
    'dry_run', dry_run
  );
  if dry_run then return result; end if;

  set constraints all deferred;

  -- These tables are intentionally immutable during normal product operation.
  -- Transactional trigger suspension is scoped to this locked, service-only reset;
  -- PostgreSQL rolls every ALTER TABLE back together with the deletes on error.
  alter table public.customer_answer_execution_contexts disable trigger customer_answer_execution_contexts_immutable;
  alter table public.customer_answer_claim_evidence disable trigger ca_evidence_append_only;
  alter table public.customer_answer_knowledge_claims disable trigger ca_claims_append_only;
  alter table public.customer_answer_knowledge_transitions disable trigger ca_transitions_append_only;
  alter table public.conversation_cycle_events disable trigger cycle_events_append_only;
  alter table public.conversation_cycle_commands disable trigger cycle_command_history_guard;
  alter table public.conversation_runtime_states disable trigger runtime_header_guard;
  alter table public.conversation_interaction_snapshots disable trigger planner_snapshot_immutable;
  alter table public.conversation_pending_interactions disable trigger pending_interaction_guard;
  alter table public.conversation_runtime_commands disable trigger runtime_commands_append_only;
  alter table public.transport_delivery_events disable trigger transport_delivery_events_append_only;
  alter table public.conversation_message_text disable trigger conversation_message_text_append_only;
  alter table public.conversation_message_references disable trigger conversation_message_references_append_only;
  alter table public.conversation_messages disable trigger conversation_messages_append_only;
  alter table public.conversation_project_assignments disable trigger conversation_assignments_append_only;
  alter table public.conversation_state_commands disable trigger conversation_state_commands_append_only;
  alter table public.project_knowledge_claim_evidence disable trigger project_knowledge_claim_evidence_append_only;
  alter table public.project_knowledge_claims disable trigger project_knowledge_claims_append_only;
  alter table public.project_knowledge_state_transitions disable trigger project_knowledge_transitions_append_only;

  delete from public.customer_answer_execution_contexts where conversation_id in(select id from reset_conversations);
  delete from public.customer_answer_ai_inference_results where conversation_id in(select id from reset_conversations);
  delete from public.customer_answer_claim_evidence where project_id in(select id from reset_projects);
  delete from public.customer_answer_knowledge_claims where project_id in(select id from reset_projects);
  delete from public.customer_answer_knowledge_transitions where conversation_id in(select id from reset_conversations);
  delete from public.conversation_cycle_events where conversation_id in(select id from reset_conversations);
  delete from public.conversation_cycle_commands where conversation_id in(select id from reset_conversations);
  delete from public.conversation_runtime_states where conversation_id in(select id from reset_conversations);
  delete from public.conversation_interaction_snapshots where conversation_id in(select id from reset_conversations);
  delete from public.conversation_pending_interactions where conversation_id in(select id from reset_conversations);
  delete from public.conversation_information_collection where conversation_id in(select id from reset_conversations);
  delete from public.conversation_retry_states where conversation_id in(select id from reset_conversations);
  delete from public.conversation_effort_states where conversation_id in(select id from reset_conversations);
  delete from public.conversation_evidence_request_states where conversation_id in(select id from reset_conversations);
  delete from public.conversation_runtime_commands where conversation_id in(select id from reset_conversations);

  delete from public.transport_send_attempts where delivery_command_id in
    (select id from public.transport_delivery_commands where conversation_id in(select id from reset_conversations));
  delete from public.transport_delivery_events where delivery_command_id in
    (select id from public.transport_delivery_commands where conversation_id in(select id from reset_conversations))
    or provider_message_binding_id in
    (select id from public.transport_message_bindings where transport_identity_id=identity_row.id);
  delete from public.transport_delivery_commands where conversation_id in(select id from reset_conversations);

  -- Keep receipt uniqueness (provider replay protection), but detach product FKs.
  update public.transport_webhook_receipts r set internal_message_id=null
  where r.internal_message_id in(select id from public.conversation_messages where conversation_id in(select id from reset_conversations));
  delete from public.transport_message_bindings where transport_identity_id=identity_row.id;
  delete from public.conversation_message_text where message_id in
    (select id from public.conversation_messages where conversation_id in(select id from reset_conversations));
  delete from public.conversation_message_references where message_id in
    (select id from public.conversation_messages where conversation_id in(select id from reset_conversations));
  delete from public.conversation_messages where conversation_id in(select id from reset_conversations);

  delete from public.conversation_project_assignments where conversation_id in(select id from reset_conversations);
  delete from public.conversation_state_commands where conversation_id in(select id from reset_conversations);
  delete from public.conversation_transport_bindings where transport_identity_id=identity_row.id;
  delete from public.conversations where id in(select id from reset_conversations);

  delete from public.project_knowledge_claim_retractions where project_id in(select id from reset_projects);
  delete from public.project_knowledge_state_transitions where project_id in(select id from reset_projects);
  delete from public.project_knowledge_corrections where project_id in(select id from reset_projects);
  delete from public.project_knowledge_claim_evidence where project_id in(select id from reset_projects);
  delete from public.project_knowledge_claims where project_id in(select id from reset_projects);
  delete from public.project_knowledge_states where project_id in(select id from reset_projects);
  delete from public.project_notes where project_id in(select id from reset_projects);
  delete from public.projects where id in(select id from reset_projects);
  delete from public.conversation_transport_identities where id=identity_row.id;
  delete from public.customers where id=identity_row.customer_id;

  alter table public.customer_answer_execution_contexts enable trigger customer_answer_execution_contexts_immutable;
  alter table public.customer_answer_claim_evidence enable trigger ca_evidence_append_only;
  alter table public.customer_answer_knowledge_claims enable trigger ca_claims_append_only;
  alter table public.customer_answer_knowledge_transitions enable trigger ca_transitions_append_only;
  alter table public.conversation_cycle_events enable trigger cycle_events_append_only;
  alter table public.conversation_cycle_commands enable trigger cycle_command_history_guard;
  alter table public.conversation_runtime_states enable trigger runtime_header_guard;
  alter table public.conversation_interaction_snapshots enable trigger planner_snapshot_immutable;
  alter table public.conversation_pending_interactions enable trigger pending_interaction_guard;
  alter table public.conversation_runtime_commands enable trigger runtime_commands_append_only;
  alter table public.transport_delivery_events enable trigger transport_delivery_events_append_only;
  alter table public.conversation_message_text enable trigger conversation_message_text_append_only;
  alter table public.conversation_message_references enable trigger conversation_message_references_append_only;
  alter table public.conversation_messages enable trigger conversation_messages_append_only;
  alter table public.conversation_project_assignments enable trigger conversation_assignments_append_only;
  alter table public.conversation_state_commands enable trigger conversation_state_commands_append_only;
  alter table public.project_knowledge_claim_evidence enable trigger project_knowledge_claim_evidence_append_only;
  alter table public.project_knowledge_claims enable trigger project_knowledge_claims_append_only;
  alter table public.project_knowledge_state_transitions enable trigger project_knowledge_transitions_append_only;

  return result || jsonb_build_object('dry_run',false,'reset','completed');
end
$$;

revoke all on function public.reset_test_transport_customer(text,text,text,text,boolean) from public, anon, authenticated;
grant execute on function public.reset_test_transport_customer(text,text,text,text,boolean) to service_role;
comment on function public.reset_test_transport_customer(text,text,text,text,boolean) is
  'Service-role-only, explicitly confirmed test identity reset. Atomic; preserves webhook receipt deduplication tombstones.';
