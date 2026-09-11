\echo 'D-23E: real PostgreSQL integration validation'
select version();

create schema reset_it;
set search_path = reset_it, public;
create extension if not exists pgcrypto;

-- This deliberately small catalog reproduces only the production reset mutation
-- surface recorded by D-23D. It does not replay historical migrations.
create table customers(id uuid primary key);
create table projects(id uuid primary key, customer_id uuid not null references customers on delete restrict);
create table conversations(id uuid primary key, customer_id uuid references customers on delete restrict, project_id uuid references projects on delete restrict);
create table conversation_transport_identities(
  id uuid primary key, customer_id uuid references customers on delete restrict,
  provider text not null, sender_scope text not null, external_identity text not null,
  unique(provider,sender_scope,external_identity));
create table conversation_transport_bindings(id uuid primary key, conversation_id uuid not null references conversations on delete restrict, transport_identity_id uuid not null references conversation_transport_identities on delete restrict);
create table conversation_messages(
  id uuid primary key, conversation_id uuid not null references conversations on delete restrict,
  reply_to_message_id uuid references conversation_messages on delete restrict, direction text not null);
create table conversation_message_text(message_id uuid primary key references conversation_messages on delete restrict, body text not null);
create table conversation_message_references(id uuid primary key, message_id uuid not null references conversation_messages on delete restrict);
create table conversation_project_assignments(id uuid primary key, conversation_id uuid not null references conversations on delete restrict, project_id uuid not null references projects on delete restrict);
create table conversation_state_commands(id uuid primary key, conversation_id uuid not null references conversations on delete restrict);

create table conversation_pending_interactions(
  id uuid primary key, conversation_id uuid not null references conversations on delete restrict,
  project_id uuid not null references projects on delete restrict,
  answered_by_message_id uuid references conversation_messages on delete restrict,
  prompt_message_id uuid references conversation_messages on delete restrict,
  snapshot_id uuid,
  recovery_of_pending_interaction_id uuid references conversation_pending_interactions on delete restrict);
create unique index one_recovery_pending_per_original on conversation_pending_interactions(recovery_of_pending_interaction_id) where recovery_of_pending_interaction_id is not null;
create table conversation_interaction_snapshots(
  id uuid primary key, conversation_id uuid not null references conversations on delete restrict,
  project_id uuid not null references projects on delete restrict,
  pending_interaction_id uuid not null unique,
  outbound_message_id uuid not null,
  recovery_of_snapshot_id uuid references conversation_interaction_snapshots on delete restrict);
create unique index one_original_snapshot_per_outbound on conversation_interaction_snapshots(outbound_message_id) where recovery_of_snapshot_id is null;
create unique index one_recovery_snapshot_per_original on conversation_interaction_snapshots(recovery_of_snapshot_id) where recovery_of_snapshot_id is not null;
alter table conversation_pending_interactions add constraint pending_snapshot_fk foreign key(snapshot_id) references conversation_interaction_snapshots on delete restrict deferrable initially deferred;
alter table conversation_interaction_snapshots add constraint snapshot_pending_interaction_fk foreign key(pending_interaction_id) references conversation_pending_interactions on delete restrict deferrable initially deferred;
alter table conversation_interaction_snapshots add constraint snapshot_outbound_message_fk foreign key(outbound_message_id) references conversation_messages on delete restrict deferrable initially deferred;

create table conversation_information_collection(id uuid primary key, conversation_id uuid not null references conversations, project_id uuid not null references projects);
create table conversation_retry_states(id uuid primary key, conversation_id uuid not null references conversations, project_id uuid not null references projects);
create table conversation_effort_states(id uuid primary key, conversation_id uuid not null references conversations, project_id uuid not null references projects);
create table conversation_evidence_request_states(id uuid primary key, conversation_id uuid not null references conversations, project_id uuid not null references projects, message_id uuid references conversation_messages);
create table conversation_runtime_commands(id uuid primary key, conversation_id uuid not null references conversations);
create table conversation_runtime_states(conversation_id uuid primary key references conversations, project_id uuid not null references projects, active_pending_interaction_id uuid references conversation_pending_interactions deferrable initially deferred, active_evidence_request_id uuid references conversation_evidence_request_states deferrable initially deferred);
create table conversation_cycle_commands(id uuid primary key, conversation_id uuid not null references conversations, project_id uuid references projects, source_message_id uuid not null references conversation_messages, prompt_message_id uuid references conversation_messages, pending_interaction_id uuid references conversation_pending_interactions);
create table customer_answer_ai_inference_results(id uuid primary key, command_id uuid not null references conversation_cycle_commands, conversation_id uuid not null references conversations, project_id uuid not null references projects, source_message_id uuid not null references conversation_messages, pending_interaction_id uuid not null references conversation_pending_interactions);
create table customer_answer_execution_contexts(id uuid primary key, command_id uuid not null references conversation_cycle_commands, conversation_id uuid not null references conversations, project_id uuid not null references projects, source_message_id uuid not null references conversation_messages, prompt_message_id uuid not null references conversation_messages, original_pending_interaction_id uuid not null references conversation_pending_interactions, original_snapshot_id uuid not null references conversation_interaction_snapshots);

create table transport_message_bindings(id uuid primary key, internal_message_id uuid not null unique references conversation_messages, transport_identity_id uuid not null references conversation_transport_identities, provider text not null, sender_scope text not null, provider_message_id text not null, unique(provider,sender_scope,provider_message_id));
create table transport_webhook_receipts(id uuid primary key, provider text not null, sender_scope text not null, provider_event_identity text not null, internal_message_id uuid references conversation_messages on delete restrict, unique(provider,sender_scope,provider_event_identity));
create table transport_delivery_commands(id uuid primary key, message_id uuid not null references conversation_messages, conversation_id uuid not null references conversations, conversation_binding_id uuid not null references conversation_transport_bindings, transport_identity_id uuid not null references conversation_transport_identities, provider_message_binding_id uuid references transport_message_bindings);
create table transport_send_attempts(id uuid primary key, delivery_command_id uuid not null references transport_delivery_commands);
create table transport_delivery_events(id uuid primary key, delivery_command_id uuid references transport_delivery_commands, provider_message_binding_id uuid references transport_message_bindings);
create table transport_message_attachments(id uuid primary key, source_message_id uuid not null unique references conversation_messages, provider_message_binding_id uuid not null unique references transport_message_bindings);
create table transport_media_ingestion_commands(id uuid primary key, source_message_id uuid not null unique references conversation_messages, provider_message_binding_id uuid not null unique references transport_message_bindings, transport_identity_id uuid not null references conversation_transport_identities, conversation_id uuid not null references conversations, project_media_id uuid, staging_asset_id uuid unique, status text not null check(status in ('staged','failed')), completed_at timestamptz, failure_code text, retry_classification text, check ((status='staged')=(staging_asset_id is not null and completed_at is not null)));
create table transport_media_staging_assets(id uuid primary key, ingestion_command_id uuid not null unique references transport_media_ingestion_commands on delete restrict, conversation_id uuid not null references conversations, source_message_id uuid not null unique references conversation_messages);
alter table transport_media_ingestion_commands add constraint ingestion_staging_asset_fk foreign key(staging_asset_id) references transport_media_staging_assets on delete restrict;

create table project_evidence(id uuid primary key, project_id uuid not null references projects);
create table project_media(id uuid primary key, project_id uuid not null references projects);
alter table transport_media_ingestion_commands add constraint ingestion_project_media_fk foreign key(project_media_id) references project_media;
create table evidence_interpretation_runs(id uuid primary key, project_id uuid not null references projects, evidence_id uuid not null references project_evidence);
create table evidence_observations(id uuid primary key, project_id uuid not null references projects, run_id uuid not null references evidence_interpretation_runs, supersedes_observation_id uuid references evidence_observations on delete restrict);
create table evidence_claim_proposals(id uuid primary key, project_id uuid not null references projects, observation_id uuid not null references evidence_observations);
create table evidence_claim_reviews(id uuid primary key, project_id uuid not null references projects, proposal_id uuid not null references evidence_claim_proposals);
create table project_knowledge_states(id uuid primary key, project_id uuid not null unique references projects);
create table project_knowledge_state_transitions(id uuid primary key, project_id uuid not null references projects, state_id uuid not null references project_knowledge_states, proposal_id uuid not null references evidence_claim_proposals, review_id uuid not null references evidence_claim_reviews, correction_id uuid, target_claim_id uuid, unique(project_id,id));
create table project_knowledge_claims(id uuid primary key, project_id uuid not null references projects, state_id uuid not null references project_knowledge_states, source_transition_id uuid not null references project_knowledge_state_transitions, supersedes_claim_id uuid references project_knowledge_claims on delete restrict, unique(project_id,id));
create table project_knowledge_corrections(id uuid primary key, project_id uuid not null references projects, target_claim_id uuid not null references project_knowledge_claims, replacement_claim_id uuid not null references project_knowledge_claims, unique(project_id,id));
alter table project_knowledge_state_transitions add constraint knowledge_transition_correction_fkey foreign key(correction_id) references project_knowledge_corrections on delete restrict;
alter table project_knowledge_state_transitions add constraint knowledge_transition_target_claim_fkey foreign key(project_id,target_claim_id) references project_knowledge_claims(project_id,id) on delete restrict;
create table project_knowledge_claim_evidence(id uuid primary key, project_id uuid not null references projects, claim_id uuid not null references project_knowledge_claims, evidence_id uuid not null references project_evidence);
create table project_knowledge_claim_retractions(id uuid primary key, project_id uuid not null references projects, correction_id uuid not null references project_knowledge_corrections, claim_id uuid not null references project_knowledge_claims, transition_id uuid not null references project_knowledge_state_transitions);
create table project_media_dependencies(id uuid primary key, project_id uuid not null references projects, media_id uuid not null references project_media, correction_id uuid references project_knowledge_corrections);

create table project_evidence_tombstones(id uuid primary key, project_id uuid not null references projects, evidence_id uuid not null references project_evidence);
create table project_media_deletion_attempts(id uuid primary key, project_id uuid not null references projects, media_id uuid not null references project_media);
create table project_media_cleanup_items(id uuid primary key, project_id uuid not null references projects, media_id uuid not null references project_media);
create table project_media_lifecycle(id uuid primary key, project_id uuid not null references projects, media_id uuid not null references project_media);
create table project_media_dependency_projection_state(id uuid primary key, project_id uuid not null references projects);
create table project_offers(id uuid primary key, project_id uuid not null references projects);
create table project_executions(id uuid primary key, project_id uuid not null references projects, offer_id uuid not null references project_offers);
create table project_offer_commands(id uuid primary key, project_id uuid not null references projects, offer_id uuid not null references project_offers);
create table project_execution_commands(id uuid primary key, project_id uuid not null references projects, execution_id uuid not null references project_executions);
create table project_notes(id uuid primary key, project_id uuid not null references projects on delete cascade);

create function reject_guarded_mutation() returns trigger language plpgsql as $$begin raise exception 'guarded mutation'; end$$;
create trigger customer_answer_execution_contexts_immutable before update or delete on customer_answer_execution_contexts for each row execute function reject_guarded_mutation();
create trigger cycle_command_history_guard before update or delete on conversation_cycle_commands for each row execute function reject_guarded_mutation();
create trigger runtime_header_guard before update or delete on conversation_runtime_states for each row execute function reject_guarded_mutation();
create trigger planner_snapshot_immutable before update or delete on conversation_interaction_snapshots for each row execute function reject_guarded_mutation();
create trigger pending_interaction_guard before update or delete on conversation_pending_interactions for each row execute function reject_guarded_mutation();
create trigger runtime_commands_append_only before update or delete on conversation_runtime_commands for each row execute function reject_guarded_mutation();
create trigger transport_delivery_events_append_only before update or delete on transport_delivery_events for each row execute function reject_guarded_mutation();
create trigger conversation_message_text_append_only before update or delete on conversation_message_text for each row execute function reject_guarded_mutation();
create trigger conversation_message_references_append_only before update or delete on conversation_message_references for each row execute function reject_guarded_mutation();
create trigger conversation_messages_append_only before update or delete on conversation_messages for each row execute function reject_guarded_mutation();
create trigger conversation_assignments_append_only before update or delete on conversation_project_assignments for each row execute function reject_guarded_mutation();
create trigger conversation_state_commands_append_only before update or delete on conversation_state_commands for each row execute function reject_guarded_mutation();
create trigger project_knowledge_claim_evidence_append_only before update or delete on project_knowledge_claim_evidence for each row execute function reject_guarded_mutation();
create trigger project_knowledge_claims_append_only before update or delete on project_knowledge_claims for each row execute function reject_guarded_mutation();
create trigger project_knowledge_transitions_append_only before update or delete on project_knowledge_state_transitions for each row execute function reject_guarded_mutation();
create trigger evidence_claim_reviews_append_only before update or delete on evidence_claim_reviews for each row execute function reject_guarded_mutation();

create function uid(label text, fixture int) returns uuid language sql immutable as $$select md5(label || ':' || fixture::text)::uuid$$;
create procedure seed_fixture(fixture int, scope text, external_id text)
language plpgsql as $$
begin
  set constraints all deferred;
  alter table conversation_pending_interactions disable trigger pending_interaction_guard;
  alter table project_knowledge_state_transitions disable trigger project_knowledge_transitions_append_only;
  insert into customers values(uid('customer',fixture));
  insert into projects values(uid('project',fixture),uid('customer',fixture));
  insert into conversations values(uid('conversation',fixture),uid('customer',fixture),uid('project',fixture));
  insert into conversation_transport_identities values(uid('identity',fixture),uid('customer',fixture),'whatsapp',scope,external_id);
  insert into conversation_transport_bindings values(uid('conversation-binding',fixture),uid('conversation',fixture),uid('identity',fixture));
  insert into conversation_messages values(uid('message-original',fixture),uid('conversation',fixture),null,'outbound');
  insert into conversation_messages values(uid('message-reply',fixture),uid('conversation',fixture),uid('message-original',fixture),'inbound');
  insert into conversation_message_text values(uid('message-original',fixture),'Frage'),(uid('message-reply',fixture),'Antwort');
  insert into conversation_message_references values(uid('message-reference',fixture),uid('message-reply',fixture));
  insert into conversation_project_assignments values(uid('assignment',fixture),uid('conversation',fixture),uid('project',fixture));
  insert into conversation_state_commands values(uid('state-command',fixture),uid('conversation',fixture));

  insert into conversation_pending_interactions(id,conversation_id,project_id,prompt_message_id) values
    (uid('pending-original',fixture),uid('conversation',fixture),uid('project',fixture),uid('message-original',fixture));
  insert into conversation_pending_interactions(id,conversation_id,project_id,prompt_message_id,recovery_of_pending_interaction_id) values
    (uid('pending-recovery',fixture),uid('conversation',fixture),uid('project',fixture),uid('message-original',fixture),uid('pending-original',fixture));
  insert into conversation_interaction_snapshots values
    (uid('snapshot-original',fixture),uid('conversation',fixture),uid('project',fixture),uid('pending-original',fixture),uid('message-original',fixture),null),
    (uid('snapshot-recovery',fixture),uid('conversation',fixture),uid('project',fixture),uid('pending-recovery',fixture),uid('message-original',fixture),uid('snapshot-original',fixture));
  update conversation_pending_interactions set snapshot_id=case id when uid('pending-original',fixture) then uid('snapshot-original',fixture) else uid('snapshot-recovery',fixture) end where conversation_id=uid('conversation',fixture);

  insert into conversation_information_collection values(uid('information',fixture),uid('conversation',fixture),uid('project',fixture));
  insert into conversation_retry_states values(uid('retry',fixture),uid('conversation',fixture),uid('project',fixture));
  insert into conversation_effort_states values(uid('effort',fixture),uid('conversation',fixture),uid('project',fixture));
  insert into conversation_evidence_request_states values(uid('evidence-request',fixture),uid('conversation',fixture),uid('project',fixture),uid('message-original',fixture));
  insert into conversation_runtime_commands values(uid('runtime-command',fixture),uid('conversation',fixture));
  insert into conversation_runtime_states values(uid('conversation',fixture),uid('project',fixture),uid('pending-original',fixture),uid('evidence-request',fixture));
  insert into conversation_cycle_commands values(uid('cycle-command',fixture),uid('conversation',fixture),uid('project',fixture),uid('message-reply',fixture),uid('message-original',fixture),uid('pending-original',fixture));
  insert into customer_answer_ai_inference_results values(uid('ai-result',fixture),uid('cycle-command',fixture),uid('conversation',fixture),uid('project',fixture),uid('message-reply',fixture),uid('pending-original',fixture));
  insert into customer_answer_execution_contexts values(uid('answer-context',fixture),uid('cycle-command',fixture),uid('conversation',fixture),uid('project',fixture),uid('message-reply',fixture),uid('message-original',fixture),uid('pending-original',fixture),uid('snapshot-original',fixture));

  insert into transport_message_bindings values(uid('message-binding',fixture),uid('message-original',fixture),uid('identity',fixture),'whatsapp',scope,'provider-message-'||fixture);
  insert into transport_webhook_receipts values(uid('receipt',fixture),'whatsapp',scope,'provider-event-'||fixture,uid('message-reply',fixture));
  insert into transport_delivery_commands values(uid('delivery-command',fixture),uid('message-original',fixture),uid('conversation',fixture),uid('conversation-binding',fixture),uid('identity',fixture),uid('message-binding',fixture));
  insert into transport_send_attempts values(uid('send-attempt',fixture),uid('delivery-command',fixture));
  insert into transport_delivery_events values(uid('delivery-event',fixture),uid('delivery-command',fixture),uid('message-binding',fixture));
  insert into transport_message_attachments values(uid('attachment',fixture),uid('message-original',fixture),uid('message-binding',fixture));
  insert into transport_media_ingestion_commands(id,source_message_id,provider_message_binding_id,transport_identity_id,conversation_id,status) values(uid('ingestion',fixture),uid('message-reply',fixture),uid('message-binding',fixture),uid('identity',fixture),uid('conversation',fixture),'failed');
  insert into transport_media_staging_assets values(uid('staging',fixture),uid('ingestion',fixture),uid('conversation',fixture),uid('message-reply',fixture));
  update transport_media_ingestion_commands set status='staged',staging_asset_id=uid('staging',fixture),completed_at=clock_timestamp() where id=uid('ingestion',fixture);

  insert into project_evidence values(uid('evidence',fixture),uid('project',fixture));
  insert into project_media values(uid('media',fixture),uid('project',fixture));
  update transport_media_ingestion_commands set project_media_id=uid('media',fixture) where id=uid('ingestion',fixture);
  insert into evidence_interpretation_runs values(uid('run',fixture),uid('project',fixture),uid('evidence',fixture));
  insert into evidence_observations values(uid('observation-original',fixture),uid('project',fixture),uid('run',fixture),null);
  insert into evidence_observations values(uid('observation-recovery',fixture),uid('project',fixture),uid('run',fixture),uid('observation-original',fixture));
  insert into evidence_claim_proposals values(uid('proposal',fixture),uid('project',fixture),uid('observation-recovery',fixture));
  insert into evidence_claim_reviews values(uid('review',fixture),uid('project',fixture),uid('proposal',fixture));
  insert into project_knowledge_states values(uid('knowledge-state',fixture),uid('project',fixture));
  insert into project_knowledge_state_transitions(id,project_id,state_id,proposal_id,review_id) values(uid('transition',fixture),uid('project',fixture),uid('knowledge-state',fixture),uid('proposal',fixture),uid('review',fixture));
  insert into project_knowledge_claims values(uid('claim-original',fixture),uid('project',fixture),uid('knowledge-state',fixture),uid('transition',fixture),null);
  insert into project_knowledge_claims values(uid('claim-replacement',fixture),uid('project',fixture),uid('knowledge-state',fixture),uid('transition',fixture),uid('claim-original',fixture));
  insert into project_knowledge_corrections values(uid('correction',fixture),uid('project',fixture),uid('claim-original',fixture),uid('claim-replacement',fixture));
  update project_knowledge_state_transitions set correction_id=uid('correction',fixture),target_claim_id=uid('claim-original',fixture) where id=uid('transition',fixture);
  insert into project_knowledge_claim_evidence values(uid('claim-evidence',fixture),uid('project',fixture),uid('claim-original',fixture),uid('evidence',fixture));
  insert into project_knowledge_claim_retractions values(uid('retraction',fixture),uid('project',fixture),uid('correction',fixture),uid('claim-original',fixture),uid('transition',fixture));
  insert into project_media_dependencies values(uid('media-dependency',fixture),uid('project',fixture),uid('media',fixture),uid('correction',fixture));
  insert into project_evidence_tombstones values(uid('evidence-tombstone',fixture),uid('project',fixture),uid('evidence',fixture));
  insert into project_media_deletion_attempts values(uid('media-deletion',fixture),uid('project',fixture),uid('media',fixture));
  insert into project_media_cleanup_items values(uid('media-cleanup',fixture),uid('project',fixture),uid('media',fixture));
  insert into project_media_lifecycle values(uid('media-lifecycle',fixture),uid('project',fixture),uid('media',fixture));
  insert into project_media_dependency_projection_state values(uid('media-projection',fixture),uid('project',fixture));
  insert into project_offers values(uid('offer',fixture),uid('project',fixture));
  insert into project_executions values(uid('execution',fixture),uid('project',fixture),uid('offer',fixture));
  insert into project_offer_commands values(uid('offer-command',fixture),uid('project',fixture),uid('offer',fixture));
  insert into project_execution_commands values(uid('execution-command',fixture),uid('project',fixture),uid('execution',fixture));
  insert into project_notes values(uid('note',fixture),uid('project',fixture));
  alter table conversation_pending_interactions enable trigger pending_interaction_guard;
  alter table project_knowledge_state_transitions enable trigger project_knowledge_transitions_append_only;
end$$;

call seed_fixture(1,'test-sender','49111111111');
call seed_fixture(2,'control-sender','49222222222');

-- Credibility gate: execute the exact unsafe 0005 snapshot mutation and demand 23505.
do $$
declare observed_state text;
begin
  alter table conversation_interaction_snapshots disable trigger planner_snapshot_immutable;
  begin
    update conversation_interaction_snapshots set recovery_of_snapshot_id=null where conversation_id=uid('conversation',1);
    raise exception 'D-23E fixture credibility failure: old 0005 update unexpectedly succeeded';
  exception when unique_violation then
    get stacked diagnostics observed_state = returned_sqlstate;
    if observed_state <> '23505' then raise exception 'expected 23505, got %',observed_state; end if;
    raise notice 'ASSERTION 1 PASS: old 0005 mutation rejected with SQLSTATE %, index one_original_snapshot_per_outbound',observed_state;
  end;
  alter table conversation_interaction_snapshots enable trigger planner_snapshot_immutable;
end$$;

create function catalog_digest() returns text language plpgsql as $$
declare table_name text; table_payload text; payload text := '';
begin
  for table_name in select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='reset_it' and c.relkind='r' order by c.relname loop
    execute format('select coalesce(string_agg(to_jsonb(x)::text, E''\\n'' order by to_jsonb(x)::text),'''') from %I x',table_name) into table_payload;
    payload := payload || table_name || ':' || table_payload;
  end loop;
  select payload || coalesce(string_agg(tgname||':'||tgenabled,',' order by tgname),'') into payload
    from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='reset_it' and not t.tgisinternal;
  return md5(payload);
end$$;

create function reset_closed(target_customer uuid, dry_run boolean, fail_after_disable boolean default false) returns jsonb
language plpgsql as $$
declare result jsonb; target_identity uuid;
begin
  select id into strict target_identity from conversation_transport_identities where customer_id=target_customer for update;
  drop table if exists pg_temp.reset_conversations;
  drop table if exists pg_temp.reset_projects;
  drop table if exists pg_temp.reset_messages;
  drop table if exists pg_temp.reset_transport_bindings;
  create temporary table reset_conversations(id uuid primary key) on commit drop;
  create temporary table reset_projects(id uuid primary key) on commit drop;
  create temporary table reset_messages(id uuid primary key) on commit drop;
  create temporary table reset_transport_bindings(id uuid primary key) on commit drop;
  insert into reset_conversations select id from conversations where customer_id=target_customer;
  insert into reset_projects select id from projects where customer_id=target_customer;
  insert into reset_messages select id from conversation_messages where conversation_id in(select id from reset_conversations);
  insert into reset_transport_bindings select id from transport_message_bindings where transport_identity_id=target_identity or internal_message_id in(select id from reset_messages);
  result=jsonb_build_object(
    'customers',(select count(*) from customers where id=target_customer),'projects',(select count(*) from reset_projects),
    'conversations',(select count(*) from reset_conversations),'messages',(select count(*) from reset_messages),
    'pending_interactions',(select count(*) from conversation_pending_interactions where conversation_id in(select id from reset_conversations)),
    'snapshots',(select count(*) from conversation_interaction_snapshots where conversation_id in(select id from reset_conversations)),
    'runtime_states',(select count(*) from conversation_runtime_states where conversation_id in(select id from reset_conversations)),
    'cycle_commands',(select count(*) from conversation_cycle_commands where conversation_id in(select id from reset_conversations)),
    'ai_results',(select count(*) from customer_answer_ai_inference_results where conversation_id in(select id from reset_conversations)),
    'answer_contexts',(select count(*) from customer_answer_execution_contexts where conversation_id in(select id from reset_conversations)),
    'project_evidence',(select count(*) from project_evidence where project_id in(select id from reset_projects)),
    'project_media',(select count(*) from project_media where project_id in(select id from reset_projects)),
    'project_knowledge_claims',(select count(*) from project_knowledge_claims where project_id in(select id from reset_projects)),
    'transport_bindings',(select count(*) from reset_transport_bindings),
    'provider_receipts_retained',(select count(*) from transport_webhook_receipts where internal_message_id in(select id from reset_messages)),
    'dry_run',dry_run);
  if dry_run then return result; end if;
  set constraints all deferred;
  alter table customer_answer_execution_contexts disable trigger customer_answer_execution_contexts_immutable;
  alter table conversation_cycle_commands disable trigger cycle_command_history_guard;
  alter table conversation_runtime_states disable trigger runtime_header_guard;
  alter table conversation_interaction_snapshots disable trigger planner_snapshot_immutable;
  alter table conversation_pending_interactions disable trigger pending_interaction_guard;
  alter table conversation_runtime_commands disable trigger runtime_commands_append_only;
  alter table transport_delivery_events disable trigger transport_delivery_events_append_only;
  alter table conversation_message_text disable trigger conversation_message_text_append_only;
  alter table conversation_message_references disable trigger conversation_message_references_append_only;
  alter table conversation_messages disable trigger conversation_messages_append_only;
  alter table conversation_project_assignments disable trigger conversation_assignments_append_only;
  alter table conversation_state_commands disable trigger conversation_state_commands_append_only;
  alter table project_knowledge_claim_evidence disable trigger project_knowledge_claim_evidence_append_only;
  alter table project_knowledge_claims disable trigger project_knowledge_claims_append_only;
  alter table project_knowledge_state_transitions disable trigger project_knowledge_transitions_append_only;
  alter table evidence_claim_reviews disable trigger evidence_claim_reviews_append_only;
  if fail_after_disable then raise exception using errcode='P0001',message='deliberate failure after trigger disablement'; end if;

  delete from customer_answer_execution_contexts where conversation_id in(select id from reset_conversations);
  delete from customer_answer_ai_inference_results where conversation_id in(select id from reset_conversations);
  delete from conversation_runtime_states where conversation_id in(select id from reset_conversations);
  delete from conversation_cycle_commands where conversation_id in(select id from reset_conversations);
  -- No snapshot/pending lineage UPDATE: immediate self-FKs disappear set-wise and the cross-table FKs are deferred.
  delete from conversation_interaction_snapshots where conversation_id in(select id from reset_conversations);
  delete from conversation_pending_interactions where conversation_id in(select id from reset_conversations);
  delete from conversation_information_collection where conversation_id in(select id from reset_conversations);
  delete from conversation_retry_states where conversation_id in(select id from reset_conversations);
  delete from conversation_effort_states where conversation_id in(select id from reset_conversations);
  delete from conversation_evidence_request_states where conversation_id in(select id from reset_conversations);
  delete from conversation_runtime_commands where conversation_id in(select id from reset_conversations);

  update transport_media_ingestion_commands set status='failed',staging_asset_id=null,completed_at=null,
    failure_code=coalesce(failure_code,'configuration_error'),retry_classification=coalesce(retry_classification,'terminal')
    where conversation_id in(select id from reset_conversations) and staging_asset_id is not null;
  delete from transport_media_staging_assets where conversation_id in(select id from reset_conversations);
  delete from transport_message_attachments where source_message_id in(select id from reset_messages) or provider_message_binding_id in(select id from reset_transport_bindings);
  delete from transport_media_ingestion_commands where conversation_id in(select id from reset_conversations);
  delete from transport_send_attempts where delivery_command_id in(select id from transport_delivery_commands where conversation_id in(select id from reset_conversations));
  delete from transport_delivery_events where delivery_command_id in(select id from transport_delivery_commands where conversation_id in(select id from reset_conversations)) or provider_message_binding_id in(select id from reset_transport_bindings);
  delete from transport_delivery_commands where conversation_id in(select id from reset_conversations);
  update transport_webhook_receipts set internal_message_id=null where internal_message_id in(select id from reset_messages);
  delete from transport_message_bindings where id in(select id from reset_transport_bindings);
  delete from conversation_message_text where message_id in(select id from reset_messages);
  delete from conversation_message_references where message_id in(select id from reset_messages);
  delete from conversation_messages where id in(select id from reset_messages);
  delete from conversation_project_assignments where conversation_id in(select id from reset_conversations);
  delete from conversation_state_commands where conversation_id in(select id from reset_conversations);
  delete from conversation_transport_bindings where conversation_id in(select id from reset_conversations) or transport_identity_id=target_identity;
  delete from conversations where id in(select id from reset_conversations);

  delete from project_knowledge_claim_retractions where project_id in(select id from reset_projects);
  delete from project_media_dependencies where project_id in(select id from reset_projects);
  delete from project_knowledge_claim_evidence where project_id in(select id from reset_projects);
  update project_knowledge_state_transitions set correction_id=null,target_claim_id=null where project_id in(select id from reset_projects);
  delete from project_knowledge_corrections where project_id in(select id from reset_projects);
  delete from project_knowledge_claims where project_id in(select id from reset_projects);
  delete from project_knowledge_state_transitions where project_id in(select id from reset_projects);
  delete from project_knowledge_states where project_id in(select id from reset_projects);
  delete from evidence_claim_reviews where project_id in(select id from reset_projects);
  delete from evidence_claim_proposals where project_id in(select id from reset_projects);
  delete from evidence_observations where project_id in(select id from reset_projects);
  delete from evidence_interpretation_runs where project_id in(select id from reset_projects);
  delete from project_evidence_tombstones where project_id in(select id from reset_projects);
  delete from project_media_deletion_attempts where project_id in(select id from reset_projects);
  delete from project_media_cleanup_items where project_id in(select id from reset_projects);
  delete from project_media_lifecycle where project_id in(select id from reset_projects);
  delete from project_media_dependency_projection_state where project_id in(select id from reset_projects);
  delete from project_execution_commands where project_id in(select id from reset_projects);
  delete from project_offer_commands where project_id in(select id from reset_projects);
  delete from project_evidence where project_id in(select id from reset_projects);
  delete from project_media where project_id in(select id from reset_projects);
  delete from project_executions where project_id in(select id from reset_projects);
  delete from project_offers where project_id in(select id from reset_projects);
  delete from project_notes where project_id in(select id from reset_projects);
  delete from projects where id in(select id from reset_projects);
  delete from conversation_transport_identities where id=target_identity;
  delete from customers where id=target_customer;

  alter table customer_answer_execution_contexts enable trigger customer_answer_execution_contexts_immutable;
  alter table conversation_cycle_commands enable trigger cycle_command_history_guard;
  alter table conversation_runtime_states enable trigger runtime_header_guard;
  alter table conversation_interaction_snapshots enable trigger planner_snapshot_immutable;
  alter table conversation_pending_interactions enable trigger pending_interaction_guard;
  alter table conversation_runtime_commands enable trigger runtime_commands_append_only;
  alter table transport_delivery_events enable trigger transport_delivery_events_append_only;
  alter table conversation_message_text enable trigger conversation_message_text_append_only;
  alter table conversation_message_references enable trigger conversation_message_references_append_only;
  alter table conversation_messages enable trigger conversation_messages_append_only;
  alter table conversation_project_assignments enable trigger conversation_assignments_append_only;
  alter table conversation_state_commands enable trigger conversation_state_commands_append_only;
  alter table project_knowledge_claim_evidence enable trigger project_knowledge_claim_evidence_append_only;
  alter table project_knowledge_claims enable trigger project_knowledge_claims_append_only;
  alter table project_knowledge_state_transitions enable trigger project_knowledge_transitions_append_only;
  alter table evidence_claim_reviews enable trigger evidence_claim_reviews_append_only;
  return result || jsonb_build_object('dry_run',false,'reset','completed');
end$$;

-- Assertion 2: exact counts and byte-for-byte database state across dry-run.
do $$declare before_digest text; after_digest text; result jsonb; begin
  before_digest:=catalog_digest(); result:=reset_closed(uid('customer',1),true); after_digest:=catalog_digest();
  if before_digest<>after_digest then raise exception 'dry run mutated durable state'; end if;
  if result - 'dry_run' <> '{"customers":1,"projects":1,"conversations":1,"messages":2,"pending_interactions":2,"snapshots":2,"runtime_states":1,"cycle_commands":1,"ai_results":1,"answer_contexts":1,"project_evidence":1,"project_media":1,"project_knowledge_claims":2,"transport_bindings":1,"provider_receipts_retained":1}'::jsonb then raise exception 'unexpected dry-run counts: %',result; end if;
  raise notice 'ASSERTION 2 PASS: dry-run counts and unchanged digest %',before_digest;
end$$;

-- Assertion 19 is intentionally run before commit validation so the complete target graph is available.
do $$declare before_digest text; observed text; begin
  before_digest:=catalog_digest();
  begin perform reset_closed(uid('customer',1),false,true); exception when others then get stacked diagnostics observed=message_text; if observed<>'deliberate failure after trigger disablement' then raise; end if; end;
  if catalog_digest()<>before_digest then raise exception 'rollback did not restore all target data/catalog state'; end if;
  if exists(select 1 from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='reset_it' and not t.tgisinternal and t.tgenabled<>'O') then raise exception 'rollback left a trigger disabled'; end if;
  raise notice 'ASSERTION 19 PASS: deliberate failure rolled back all data and trigger state';
end$$;

select reset_closed(uid('customer',1),false) as committed_reset;

-- Assertions 3-18: committed deletion, receipt retention, control isolation, and catalog integrity.
do $$declare target_rows bigint; enabled_triggers int; total_triggers int; table_name text; actual_count bigint; expected_count bigint; begin
  select count(*) into target_rows from customers where id=uid('customer',1);
  target_rows:=target_rows+(select count(*) from projects where customer_id=uid('customer',1))+(select count(*) from conversations where customer_id=uid('customer',1));
  if target_rows<>0 then raise exception 'target root graph survived'; end if;
  if exists(select 1 from conversation_messages where conversation_id=uid('conversation',1))
    or exists(select 1 from conversation_pending_interactions where conversation_id=uid('conversation',1))
    or exists(select 1 from conversation_interaction_snapshots where conversation_id=uid('conversation',1))
    or exists(select 1 from conversation_runtime_states where conversation_id=uid('conversation',1))
    or exists(select 1 from conversation_cycle_commands where conversation_id=uid('conversation',1))
    or exists(select 1 from project_knowledge_claims where project_id=uid('project',1))
    or exists(select 1 from project_evidence where project_id=uid('project',1))
    or exists(select 1 from project_media where project_id=uid('project',1))
    or exists(select 1 from project_offers where project_id=uid('project',1))
    or exists(select 1 from transport_delivery_commands where conversation_id=uid('conversation',1))
    or exists(select 1 from transport_media_ingestion_commands where conversation_id=uid('conversation',1)) then raise exception 'target reset surface survived'; end if;
  if not exists(select 1 from transport_webhook_receipts where id=uid('receipt',1) and internal_message_id is null and provider_event_identity='provider-event-1') then raise exception 'receipt tombstone missing or still references message'; end if;
  if exists(select 1 from transport_webhook_receipts r left join conversation_messages m on m.id=r.internal_message_id where r.internal_message_id is not null and m.id is null) then raise exception 'dangling receipt message reference'; end if;
  -- Every fixture-bearing control table retains its known control row; restrictive FKs prove graph closure.
  if not exists(select 1 from customers where id=uid('customer',2)) or not exists(select 1 from conversation_interaction_snapshots where id=uid('snapshot-recovery',2) and recovery_of_snapshot_id=uid('snapshot-original',2)) or not exists(select 1 from project_knowledge_claim_retractions where id=uid('retraction',2)) or not exists(select 1 from transport_media_staging_assets where id=uid('staging',2)) then raise exception 'control fixture changed'; end if;
  for table_name in select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='reset_it' and c.relkind='r' order by c.relname loop
    expected_count:=case when table_name in ('conversation_messages','conversation_message_text','conversation_pending_interactions','conversation_interaction_snapshots','evidence_observations','project_knowledge_claims','transport_webhook_receipts') then 2 else 1 end;
    execute format('select count(*) from %I',table_name) into actual_count;
    if actual_count<>expected_count then raise exception 'scope isolation/count failure for %: expected %, got %',table_name,expected_count,actual_count; end if;
  end loop;
  select count(*),count(*) filter(where tgenabled='O') into total_triggers,enabled_triggers from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='reset_it' and not t.tgisinternal;
  if total_triggers<>16 or enabled_triggers<>16 then raise exception 'trigger restoration failed: %/%',enabled_triggers,total_triggers; end if;
  if exists(select 1 from pg_constraint c join pg_namespace n on n.oid=c.connamespace where n.nspname='reset_it' and c.contype='f' and not c.convalidated) then raise exception 'unvalidated FK remains'; end if;
  raise notice 'ASSERTIONS 3-18 PASS: commit, complete target deletion, receipt retention, control isolation, FK integrity, trigger restoration';
end$$;

-- Assertion 20: reuse the exact external WhatsApp identity for a fresh lifecycle and inbound message.
insert into customers values(uid('customer-fresh',3));
insert into projects values(uid('project-fresh',3),uid('customer-fresh',3));
insert into conversations values(uid('conversation-fresh',3),uid('customer-fresh',3),uid('project-fresh',3));
insert into conversation_transport_identities values(uid('identity-fresh',3),uid('customer-fresh',3),'whatsapp','test-sender','49111111111');
insert into conversation_transport_bindings values(uid('binding-fresh',3),uid('conversation-fresh',3),uid('identity-fresh',3));
insert into conversation_messages values(uid('message-fresh',3),uid('conversation-fresh',3),null,'inbound');
insert into conversation_message_text values(uid('message-fresh',3),'Neuer Lebenszyklus');
do $$begin
  if not exists(select 1 from conversation_messages m join conversations c on c.id=m.conversation_id join conversation_transport_identities i on i.customer_id=c.customer_id where i.external_identity='49111111111' and m.id=uid('message-fresh',3)) then raise exception 'fresh lifecycle missing'; end if;
  raise notice 'ASSERTION 20 PASS: same WhatsApp identity accepted for fresh customer/project/conversation/inbound message';
end$$;

\echo 'D-23E ALL 20 ASSERTIONS PASS'
