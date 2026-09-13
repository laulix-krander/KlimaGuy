\pset pager off
\echo '=== PostgreSQL version ==='
select version();
\echo '=== lifecycle function definitions ==='
select pg_get_functiondef('public.transition_conversation_status(uuid,public.conversation_status,integer,text)'::regprocedure);
select pg_get_functiondef('public.ingest_whatsapp_inbound_text(text,text,text,timestamptz,text)'::regprocedure);
select pg_get_functiondef('public.bootstrap_first_contact_foundation(uuid)'::regprocedure);
\echo '=== binding indexes ==='
select pg_get_indexdef(indexrelid)
from pg_index
where indrelid = 'public.conversation_transport_bindings'::regclass
order by indexrelid::regclass::text;
\echo '=== binding and conversation constraints ==='
select conrelid::regclass::text as relation, conname, pg_get_constraintdef(oid)
from pg_constraint
where conrelid in (
  'public.conversation_transport_bindings'::regclass,
  'public.conversations'::regclass
)
order by relation, conname;
