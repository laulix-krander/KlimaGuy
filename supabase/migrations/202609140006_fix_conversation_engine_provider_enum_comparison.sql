-- Keep the text-based PostgREST contract while comparing transport providers as their database enum.

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
      and b.provider=target_provider::public.conversation_transport_provider and i.provider=target_provider::public.conversation_transport_provider
      and i.sender_scope=target_sender_scope and i.external_identity=target_external_identity
  ) then raise exception 'conversation_identity_mismatch'; end if;
  if c.engine_owner is null then
    perform set_config('app.conversation_engine_authority','allowed',true);
    update public.conversations set engine_owner=proposed_owner where id=c.id returning * into c;
  end if;
  return jsonb_build_object('conversation_id',c.id,'engine_owner',c.engine_owner);
end $$;
