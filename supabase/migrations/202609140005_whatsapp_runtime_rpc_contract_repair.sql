-- Restore the two service-only RPC contracts used before any provider call.
-- This is deliberately forward-only: shipped migrations remain immutable.

create or replace function public.resolve_conversation_engine_owner(
  target_conversation_id uuid,
  target_provider text,
  target_sender_scope text,
  target_external_identity text,
  proposed_owner public.conversation_engine_owner
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare c public.conversations%rowtype;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'not_authorized'; end if;
  select * into c from public.conversations where id=target_conversation_id for update;
  if not found then raise exception 'conversation_not_found'; end if;
  if not exists(
    select 1 from public.conversation_transport_bindings b
    join public.conversation_transport_identities i on i.id=b.transport_identity_id
    where b.conversation_id=c.id and b.status='active'
      and b.provider=target_provider and i.provider=target_provider
      and i.sender_scope=target_sender_scope and i.external_identity=target_external_identity
  ) then raise exception 'conversation_identity_mismatch'; end if;
  if c.engine_owner is null then
    perform set_config('app.conversation_engine_authority','allowed',true);
    update public.conversations set engine_owner=proposed_owner where id=c.id returning * into c;
  end if;
  return jsonb_build_object('conversation_id',c.id,'engine_owner',c.engine_owner);
end $$;

create or replace function public.discover_recoverable_whatsapp_deliveries(target_limit integer default 5)
returns table(delivery_command_id uuid,outbound_message_id uuid,recovery_action text)
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if auth.role() is distinct from 'service_role' then
    raise insufficient_privilege using message='whatsapp_delivery_recovery_service_role_required';
  end if;
  return query
    select d.id,d.internal_message_id,
      case
        when d.status='sending' and (d.execution_owner_id is null or exists(
          select 1 from public.transport_send_attempts a
          where a.delivery_command_id=d.id and a.finished_at is null
        )) then 'FINALIZE_AMBIGUOUS'
        else 'SAFE_TO_RUN'
      end::text
    from public.transport_delivery_commands d
    where d.provider='whatsapp' and (
      (d.status='pending' and d.execution_owner_id is null) or
      (d.status='failed' and d.retry_classification='retryable' and d.next_attempt_at<=statement_timestamp() and d.attempt_count<3 and d.execution_owner_id is null) or
      (d.status='sending' and (d.execution_lease_expires_at is null or d.execution_lease_expires_at<=statement_timestamp()))
    )
    order by coalesce(d.execution_lease_expires_at,d.next_attempt_at,d.created_at),d.id
    limit least(greatest(coalesce(target_limit,5),0),5);
end $$;

revoke all on function public.resolve_conversation_engine_owner(uuid,text,text,text,public.conversation_engine_owner) from public,anon,authenticated;
grant execute on function public.resolve_conversation_engine_owner(uuid,text,text,text,public.conversation_engine_owner) to service_role;
revoke all on function public.discover_recoverable_whatsapp_deliveries(integer) from public,anon,authenticated;
grant execute on function public.discover_recoverable_whatsapp_deliveries(integer) to service_role;

comment on function public.resolve_conversation_engine_owner(uuid,text,text,text,public.conversation_engine_owner) is 'Service-only immutable Conversation engine resolution contract used by the WhatsApp webhook.';
comment on function public.discover_recoverable_whatsapp_deliveries(integer) is 'Side-effect-free, bounded service-only WhatsApp delivery recovery discovery contract.';
