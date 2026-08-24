-- AP-16-04-01-01: narrow, service-only and atomic WhatsApp text ingestion.
-- A transport-created unassigned conversation has no human creator.
alter table public.conversations alter column created_by drop not null;

create or replace function public.guard_conversation_state() returns trigger language plpgsql set search_path=public,pg_temp as $$ begin
 if (new.current_project_id is distinct from old.current_project_id or new.status is distinct from old.status or new.revision is distinct from old.revision) and coalesce(current_setting('app.conversation_authority_mutation',true),'')<>'allowed' then raise exception 'conversation_mutation_requires_authority'; end if;
 if new.customer_id is distinct from old.customer_id or new.created_by is distinct from old.created_by or new.creation_command_key is distinct from old.creation_command_key then raise exception 'conversation_identity_immutable'; end if; return new; end $$;

create function public.ingest_whatsapp_inbound_text(
 target_sender_scope text,
 target_external_identity text,
 target_provider_message_id text,
 target_occurred_at timestamptz,
 target_text text
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
 receipt public.transport_webhook_receipts%rowtype;
 identity_row public.conversation_transport_identities%rowtype;
 binding_row public.conversation_transport_bindings%rowtype;
 conversation_row public.conversations%rowtype;
 message_row public.conversation_messages%rowtype;
 sequence_number integer;
 identity_created boolean := false;
 conversation_bound boolean := false;
 cycle_eligible boolean := false;
 now_at timestamptz := statement_timestamp();
begin
 if length(target_sender_scope) not between 1 and 255 or length(target_external_identity) not between 1 and 255
    or length(target_provider_message_id) not between 1 and 512 or length(target_text) not between 1 and 20000
    or target_occurred_at is null then raise exception 'malformed_payload'; end if;

 insert into public.transport_webhook_receipts(provider,sender_scope,provider_event_identity,event_kind,processing_status)
 values('whatsapp',target_sender_scope,target_provider_message_id,'inbound_text','processing')
 on conflict(provider,sender_scope,provider_event_identity) do nothing returning * into receipt;
 if receipt.id is null then
   select * into receipt from public.transport_webhook_receipts where provider='whatsapp' and sender_scope=target_sender_scope and provider_event_identity=target_provider_message_id;
   select * into message_row from public.conversation_messages where id=receipt.internal_message_id;
   select i.* into identity_row from public.conversation_transport_identities i join public.transport_message_bindings mb on mb.transport_identity_id=i.id where mb.provider='whatsapp' and mb.sender_scope=target_sender_scope and mb.provider_message_id=target_provider_message_id;
   insert into public.audit_log(actor_id,entity_type,entity_id,action,metadata) values(null,'transport_webhook_receipt',receipt.id,'whatsapp_webhook_replayed',jsonb_build_object('receipt_id',receipt.id,'result_code','duplicate_event','timestamp',now_at));
   return jsonb_build_object('status','duplicate','receipt_id',receipt.id,'transport_identity_id',identity_row.id,'conversation_id',message_row.conversation_id,'internal_message_id',receipt.internal_message_id,'cycle_eligible',false);
 end if;
 insert into public.audit_log(actor_id,entity_type,entity_id,action,metadata) values(null,'transport_webhook_receipt',receipt.id,'whatsapp_webhook_received',jsonb_build_object('receipt_id',receipt.id,'result_code','authenticated','timestamp',now_at));

 insert into public.conversation_transport_identities(provider,sender_scope,external_identity)
 values('whatsapp',target_sender_scope,target_external_identity)
 on conflict(provider,sender_scope,external_identity) do nothing returning * into identity_row;
 if identity_row.id is null then
   select * into identity_row from public.conversation_transport_identities where provider='whatsapp' and sender_scope=target_sender_scope and external_identity=target_external_identity for update;
 else identity_created := true; end if;
 if identity_row.status<>'active' then raise exception 'transport_identity_failed'; end if;
 if identity_created then insert into public.audit_log(actor_id,entity_type,entity_id,action,metadata) values(null,'conversation_transport_identity',identity_row.id,'whatsapp_transport_identity_created',jsonb_build_object('transport_identity_id',identity_row.id,'result_code','created','timestamp',now_at)); end if;

 select * into binding_row from public.conversation_transport_bindings where transport_identity_id=identity_row.id and status='active' for update;
 if binding_row.id is not null then select * into conversation_row from public.conversations where id=binding_row.conversation_id for update; end if;
 if conversation_row.id is null or conversation_row.status='closed' then
   if binding_row.id is not null then update public.conversation_transport_bindings set status='superseded',superseded_at=now_at where id=binding_row.id; end if;
   insert into public.conversations(customer_id,current_project_id,status,creation_command_key,created_by)
   values(identity_row.customer_id,null,'open','whatsapp:'||receipt.id,null) returning * into conversation_row;
   insert into public.conversation_transport_bindings(conversation_id,transport_identity_id,provider,status,revision)
   values(conversation_row.id,identity_row.id,'whatsapp','active',coalesce(binding_row.revision,0)+1) returning * into binding_row;
   conversation_bound := true;
 end if;

 select m.* into message_row from public.conversation_messages m join public.transport_message_bindings mb on mb.internal_message_id=m.id where mb.provider='whatsapp' and mb.sender_scope=target_sender_scope and mb.provider_message_id=target_provider_message_id;
 if message_row.id is null then
   sequence_number:=coalesce((select max(sequence) from public.conversation_messages where conversation_id=conversation_row.id),0)+1;
   insert into public.conversation_messages(conversation_id,sequence,direction,message_kind,actor_class,occurred_at,idempotency_key)
   values(conversation_row.id,sequence_number,'inbound','text','customer',target_occurred_at,'whatsapp:'||receipt.id) returning * into message_row;
   insert into public.conversation_message_text(message_id,body) values(message_row.id,target_text);
   insert into public.transport_message_bindings(provider,sender_scope,provider_message_id,internal_message_id,transport_identity_id,direction,provider_occurred_at)
   values('whatsapp',target_sender_scope,target_provider_message_id,message_row.id,identity_row.id,'inbound',target_occurred_at);
 end if;
 update public.transport_webhook_receipts set processing_status='processed',internal_message_id=message_row.id where id=receipt.id;
 select exists(select 1 from public.conversation_runtime_states r where r.conversation_id=conversation_row.id and r.project_id=conversation_row.current_project_id and r.runtime_status='awaiting_customer_answer')
   and conversation_row.status='open' and conversation_row.current_project_id is not null into cycle_eligible;
 if conversation_bound then insert into public.audit_log(actor_id,entity_type,entity_id,action,metadata) values(null,'conversation_transport_binding',binding_row.id,'whatsapp_conversation_bound',jsonb_build_object('transport_identity_id',identity_row.id,'conversation_id',conversation_row.id,'result_code','bound','timestamp',now_at)); end if;
 insert into public.audit_log(actor_id,entity_type,entity_id,action,metadata) values(null,'conversation_message',message_row.id,'whatsapp_inbound_text_recorded',jsonb_build_object('receipt_id',receipt.id,'transport_identity_id',identity_row.id,'conversation_id',conversation_row.id,'message_id',message_row.id,'result_code','recorded','timestamp',now_at));
 return jsonb_build_object('status','recorded','receipt_id',receipt.id,'transport_identity_id',identity_row.id,'conversation_id',conversation_row.id,'internal_message_id',message_row.id,'cycle_eligible',cycle_eligible);
end $$;

revoke all on function public.ingest_whatsapp_inbound_text(text,text,text,timestamptz,text) from public,anon,authenticated;
grant execute on function public.ingest_whatsapp_inbound_text(text,text,text,timestamptz,text) to service_role;
comment on function public.ingest_whatsapp_inbound_text(text,text,text,timestamptz,text) is 'Atomic WhatsApp text transport boundary. Service role only; no raw payload, secret, project heuristic, or provider field in Conversation Core.';
