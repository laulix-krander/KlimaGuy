\set ON_ERROR_STOP on
\pset pager off

begin;

create function pg_temp.assert_true(assertion boolean, assertion_number integer, detail text)
returns void language plpgsql as $$
begin
  if assertion is not true then
    raise exception 'ASSERTION % FAIL: %', assertion_number, detail;
  end if;
  raise notice 'ASSERTION % PASS: %', assertion_number, detail;
end $$;

-- Supabase request claims are represented by transaction-local settings.
select set_config('request.jwt.claim.role', 'service_role', true);

-- Stable non-PII fixture actors. The auth trigger creates reviewer profiles.
insert into auth.users(id, raw_app_meta_data) values
  ('00000000-0000-4000-8000-000000000001', '{"system_actor_key":"klimaguy_system"}'),
  ('00000000-0000-4000-8000-000000000002', '{}');
update public.profiles set role='admin' where id='00000000-0000-4000-8000-000000000002';
select pg_temp.assert_true(
  (public.register_system_actor('klimaguy_system', '00000000-0000-4000-8000-000000000001')->>'status') = 'provisioned',
  30,
  'system actor authority is provisioned for committed FK-valid foundation work'
);

create temp table proof_state (
  identity_id uuid,
  customer_n uuid,
  conversation_n uuid,
  project_n uuid,
  binding_n uuid,
  revision_r integer,
  old_message_id uuid,
  old_receipt_id uuid,
  conversation_n_before_close jsonb,
  project_n_before jsonb,
  conversation_n1 uuid,
  project_n1 uuid,
  binding_n1 uuid
);

-- OLD-WAMID enters through the real ingestion authority; First Contact creates
-- CUST-1 and P-N through the real foundation authority.
with ingested as (
  select public.ingest_whatsapp_inbound_text(
    '1196551136885100', '4917632091248', 'OLD-WAMID',
    '2026-09-13T08:00:00Z', 'Erste Klimaanfrage'
  ) result
), founded as (
  select public.bootstrap_first_contact_foundation((result->>'conversation_id')::uuid) result, ingested.result ingestion
  from ingested
)
insert into proof_state(identity_id, customer_n, conversation_n, project_n, binding_n, revision_r, old_message_id, old_receipt_id)
select
  (ingestion->>'transport_identity_id')::uuid,
  (result->>'customer_id')::uuid,
  (ingestion->>'conversation_id')::uuid,
  (result->>'project_id')::uuid,
  b.id,
  b.revision,
  (ingestion->>'internal_message_id')::uuid,
  (ingestion->>'receipt_id')::uuid
from founded
join public.conversation_transport_bindings b
  on b.conversation_id=(ingestion->>'conversation_id')::uuid and b.status='active';

select pg_temp.assert_true((select count(*)=1 from public.conversation_transport_identities), 1, 'stable Identity exists exactly once');
select pg_temp.assert_true((select count(*)=1 from public.conversation_transport_bindings b join proof_state s on s.identity_id=b.transport_identity_id where b.status='active'), 2, 'exactly one active Binding exists before close');
select pg_temp.assert_true((select c.status='open' from public.conversations c join proof_state s on s.conversation_n=c.id), 3, 'Conversation N is open before close');
select pg_temp.assert_true((select b.conversation_id=s.conversation_n from public.conversation_transport_bindings b join proof_state s on s.binding_n=b.id), 1, 'active Binding points to Conversation N');
select pg_temp.assert_true((select c.current_project_id=s.project_n and c.customer_id=s.customer_n from public.conversations c join proof_state s on s.conversation_n=c.id), 3, 'Conversation N has P-N and CUST-1');
select pg_temp.assert_true((select count(*)=1 from public.transport_webhook_receipts where provider_event_identity='OLD-WAMID' and processing_status='processed'), 6, 'OLD-WAMID is recorded and deduplicated');

update proof_state s set
  conversation_n_before_close=(select to_jsonb(c) from public.conversations c where c.id=s.conversation_n),
  project_n_before=(select to_jsonb(p) from public.projects p where p.id=s.project_n);

-- The admin claim is required by the supported transition authority.
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000002', true);
select public.transition_conversation_status(
  conversation_n,
  'closed',
  (select revision from public.conversations where id=conversation_n),
  'lifecycle-proof-close-n'
) from proof_state;

select pg_temp.assert_true((select status='closed' from public.conversations c join proof_state s on s.conversation_n=c.id), 4, 'Conversation N closes through transition_conversation_status');
select pg_temp.assert_true((select count(*)=1 from public.customers c join proof_state s on s.customer_n=c.id) and (select count(*)=1 from public.projects p join proof_state s on s.project_n=p.id) and (select count(*)=1 from public.conversations c join proof_state s on s.conversation_n=c.id) and (select count(*)=1 from public.conversation_messages m join proof_state s on s.old_message_id=m.id) and (select count(*)=1 from public.conversation_transport_bindings b join proof_state s on s.binding_n=b.id), 5, 'logical close deletes zero historical rows');
select pg_temp.assert_true((select count(*)=1 from public.transport_webhook_receipts r join proof_state s on s.old_receipt_id=r.id), 6, 'OLD receipt survives close');

select set_config('request.jwt.claim.role', 'service_role', true);
create temp table new_ingestion as
select public.ingest_whatsapp_inbound_text(
  '1196551136885100', '4917632091248', 'NEW-WAMID',
  '2026-09-13T08:05:00Z', 'Eine vollständig neue Nachricht'
) result;

update proof_state s set
  conversation_n1=(select (result->>'conversation_id')::uuid from new_ingestion),
  binding_n1=(select b.id from public.conversation_transport_bindings b where b.transport_identity_id=s.identity_id and b.status='active');

select pg_temp.assert_true((select result->>'status'='recorded' from new_ingestion), 7, 'NEW-WAMID is accepted');
select pg_temp.assert_true((select status='closed' from public.conversations c join proof_state s on s.conversation_n=c.id), 8, 'Conversation N remains closed');
select pg_temp.assert_true((select status<>'open' from public.conversations c join proof_state s on s.conversation_n=c.id), 9, 'Conversation N is never reopened');
select pg_temp.assert_true((select b.status='superseded' and b.superseded_at is not null from public.conversation_transport_bindings b join proof_state s on s.binding_n=b.id), 10, 'B-N is historical and superseded');
select pg_temp.assert_true((select count(*)=1 from public.conversation_transport_bindings b join proof_state s on s.identity_id=b.transport_identity_id where b.status='active'), 11, 'exactly one new active Binding exists');
select pg_temp.assert_true((select b.revision=s.revision_r+1 from public.conversation_transport_bindings b join proof_state s on s.binding_n1=b.id), 12, 'new Binding revision is R+1');
select pg_temp.assert_true((select conversation_n1<>conversation_n from proof_state), 13, 'Conversation N+1 is newly created');
select pg_temp.assert_true((select c.status='open' from public.conversations c join proof_state s on s.conversation_n1=c.id), 14, 'Conversation N+1 is open');
select pg_temp.assert_true((select m.conversation_id=s.conversation_n1 from public.conversation_messages m cross join proof_state s where m.id=(select (result->>'internal_message_id')::uuid from new_ingestion)) and not exists(select 1 from public.conversation_messages m join proof_state s on s.conversation_n=m.conversation_id where m.id=(select (result->>'internal_message_id')::uuid from new_ingestion)), 15, 'NEW-WAMID internal Message belongs only to N+1');
select pg_temp.assert_true((select c.customer_id=s.customer_n from public.conversations c join proof_state s on s.conversation_n1=c.id), 16, 'stable Customer CUST-1 is reused during ingestion');

create temp table foundation_n1 as
select public.bootstrap_first_contact_foundation((select conversation_n1 from proof_state)) result;
update proof_state set project_n1=(select (result->>'project_id')::uuid from foundation_n1);

select pg_temp.assert_true((select result->>'status' in ('partial_completed','created') from foundation_n1), 17, 'First Contact creates the fresh Project P-N+1');
select pg_temp.assert_true((select project_n1<>project_n from proof_state), 18, 'P-N+1 differs from P-N');
select pg_temp.assert_true((select c.current_project_id=s.project_n from public.conversations c join proof_state s on s.conversation_n=c.id), 19, 'N retains P-N');
select pg_temp.assert_true((select c.current_project_id=s.project_n1 from public.conversations c join proof_state s on s.conversation_n1=c.id), 20, 'N+1 points to P-N+1');
select pg_temp.assert_true((select p.customer_id=s.customer_n from public.projects p join proof_state s on s.project_n1=p.id), 17, 'P-N+1 belongs to stable CUST-1');
select pg_temp.assert_true((select to_jsonb(p)=s.project_n_before from public.projects p join proof_state s on s.project_n=p.id), 18, 'historical P-N remains byte-equivalent');

create temp table before_replay as select
  (select count(*) from public.conversation_messages) messages,
  (select count(*) from public.conversations) conversations,
  (select count(*) from public.conversation_transport_bindings) bindings,
  (select max(revision) from public.conversation_transport_bindings) binding_revision,
  (select count(*) from public.projects) projects,
  (select count(*) from public.conversation_runtime_commands) runtime_commands,
  (select count(*) from public.conversation_cycle_commands) cycle_commands,
  (select count(*) from public.transport_delivery_commands) delivery_commands,
  (select to_jsonb(c) from public.conversations c join proof_state s on s.conversation_n1=c.id) conversation_n1,
  (select to_jsonb(p) from public.projects p join proof_state s on s.project_n1=p.id) project_n1;
create temp table old_replay as
select public.ingest_whatsapp_inbound_text(
  '1196551136885100', '4917632091248', 'OLD-WAMID',
  '2026-09-13T08:00:00Z', 'Erste Klimaanfrage'
) result;

select pg_temp.assert_true((select result->>'status'='duplicate' from old_replay) and (select count(*)=1 from public.transport_webhook_receipts where provider_event_identity='OLD-WAMID'), 21, 'OLD-WAMID replay is duplicate/no-op');
select pg_temp.assert_true((select count(*) from public.conversation_messages)=(select messages from before_replay), 22, 'replay creates zero Messages');
select pg_temp.assert_true((select count(*) from public.conversations)=(select conversations from before_replay), 23, 'replay creates zero Conversations');
select pg_temp.assert_true((select count(*) from public.projects)=(select projects from before_replay), 24, 'replay creates zero Projects');
select pg_temp.assert_true((select count(*) from public.conversation_runtime_commands)=(select runtime_commands from before_replay) and (select count(*) from public.conversation_cycle_commands)=(select cycle_commands from before_replay), 25, 'replay creates zero Runtime/Cycle commands');
select pg_temp.assert_true((select count(*) from public.transport_delivery_commands)=(select delivery_commands from before_replay), 26, 'replay creates zero outbound delivery work');
select pg_temp.assert_true((select count(*) from public.conversation_transport_bindings)=(select bindings from before_replay) and (select max(revision) from public.conversation_transport_bindings)=(select binding_revision from before_replay) and (select to_jsonb(c)=b.conversation_n1 from public.conversations c cross join proof_state s cross join before_replay b where c.id=s.conversation_n1) and (select to_jsonb(p)=b.project_n1 from public.projects p cross join proof_state s cross join before_replay b where p.id=s.project_n1), 21, 'replay leaves Binding revision, N+1, and P-N+1 unchanged');

create temp table before_followup as select
  (select count(*) from public.conversations) conversations,
  (select id from public.conversation_transport_bindings where status='active') binding_id,
  (select revision from public.conversation_transport_bindings where status='active') binding_revision;
create temp table followup as
select public.ingest_whatsapp_inbound_text(
  '1196551136885100', '4917632091248', 'NEW-WAMID-2',
  '2026-09-13T08:10:00Z', 'Eine normale Folgemeldung'
) result;

select pg_temp.assert_true((select (result->>'conversation_id')::uuid=s.conversation_n1 from followup cross join proof_state s) and (select count(*) from public.conversations)=(select conversations from before_followup), 27, 'NEW-WAMID-2 reuses N+1 and creates no N+2');
select pg_temp.assert_true((select a.id=b.binding_id and a.revision=b.binding_revision from public.conversation_transport_bindings a cross join before_followup b where a.status='active'), 28, 'normal follow-up preserves active Binding and revision');
select pg_temp.assert_true((select m.conversation_id=s.conversation_n1 from public.conversation_messages m cross join proof_state s where m.id=(select (result->>'internal_message_id')::uuid from followup)) and (select c.current_project_id=s.project_n1 from public.conversations c cross join proof_state s where c.id=s.conversation_n1), 27, 'follow-up Message and active Project remain on N+1/P-N+1');
select pg_temp.assert_true((select count(*)=2 from public.conversation_transport_bindings) and (select count(*)=2 from public.conversations), 29, 'no physical delete is used anywhere in the lifecycle');

\ir learning-candidate-repair-proof.sql

set constraints all immediate;
select pg_temp.assert_true(true, 36, 'all FK and constraint checks complete successfully');
commit;

\echo 'LIFECYCLE AND LEARNING CANDIDATE REPAIR PROOF: PASS (assertions 1-36)'
