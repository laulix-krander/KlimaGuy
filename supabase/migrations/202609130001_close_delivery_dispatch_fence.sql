-- Step 2: serialize Conversation close with the final outbound dispatch authority.
-- Whichever transaction locks the Conversation first wins: close fences dispatch,
-- while an authorized (possibly in-flight) attempt makes close retryable.

create or replace function public.authorize_whatsapp_outbound_dispatch(target_delivery_command_id uuid,target_execution_owner_id uuid,target_dispatch_token uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare d public.transport_delivery_commands%rowtype;c public.conversations%rowtype;p public.conversation_pending_interactions%rowtype;conversation_key uuid;now_at timestamptz:=statement_timestamp();next_number integer;
begin
 if auth.role()<>'service_role' then return jsonb_build_object('status','not_authorized');end if;
 select conversation_id into conversation_key from public.transport_delivery_commands where id=target_delivery_command_id;
 if conversation_key is null then return jsonb_build_object('status','ownership_lost');end if;
 -- This is the shared serialization point with transition_conversation_status.
 select * into c from public.conversations where id=conversation_key for update;
 select * into d from public.transport_delivery_commands where id=target_delivery_command_id for update;
 if not found or d.conversation_id<>c.id or d.status<>'sending' or d.execution_owner_id<>target_execution_owner_id or d.execution_lease_expires_at<=now_at then return jsonb_build_object('status','ownership_lost');end if;
 if exists(select 1 from public.transport_send_attempts a where a.delivery_command_id=d.id and a.finished_at is null) then return jsonb_build_object('status','already_authorized');end if;
 if d.attempt_count>=3 then return jsonb_build_object('status','attempts_exhausted');end if;
 select * into p from public.conversation_pending_interactions where prompt_message_id=d.internal_message_id;
 if c.status<>'open'
    or not exists(select 1 from public.conversation_transport_bindings b join public.conversation_transport_identities i on i.id=b.transport_identity_id where b.id=d.transport_binding_id and b.conversation_id=c.id and b.transport_identity_id=d.transport_identity_id and b.provider='whatsapp' and b.status='active' and i.status='active')
    or (p.id is not null and (p.status<>'pending' or not exists(select 1 from public.conversation_runtime_states r where r.conversation_id=c.id and r.active_pending_interaction_id=p.id))) then
  update public.transport_delivery_commands set status='blocked',claim_token=null,claimed_at=null,next_attempt_at=null,failure_code=case when c.status='human_review' then 'human_takeover_blocked' when c.status<>'open' then 'conversation_not_sendable' else 'stale_interaction' end,retry_classification=case when c.status='human_review' then 'human_review_required' else 'terminal' end,execution_owner_id=null,execution_lease_expires_at=null where id=d.id;
  return jsonb_build_object('status','lifecycle_blocked');
 end if;
 next_number:=d.attempt_count+1;
 update public.transport_delivery_commands set attempt_count=next_number,dispatch_started_at=now_at,dispatch_attempt_number=next_number,dispatch_token=target_dispatch_token,next_attempt_at=null where id=d.id returning * into d;
 insert into public.transport_send_attempts(delivery_command_id,attempt_number,started_at) values(d.id,next_number,now_at);
 insert into public.audit_log(actor_id,entity_type,entity_id,action,metadata) values(null,'transport_delivery_command',d.id,'whatsapp_delivery_dispatch_authorized',jsonb_build_object('delivery_command_id',d.id,'internal_message_id',d.internal_message_id,'conversation_id',c.id,'conversation_revision',c.revision,'transport_binding_id',d.transport_binding_id,'attempt_number',next_number));
 return jsonb_build_object('status','authorized','delivery_command_id',d.id,'attempt_number',next_number,'dispatch_token',target_dispatch_token,'dispatch_started_at',now_at);
end$$;

create or replace function public.transition_conversation_status(target_conversation_id uuid,target_status public.conversation_status,expected_revision integer,target_idempotency_key text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare c public.conversations%rowtype;cmd public.conversation_state_commands%rowtype;now_at timestamptz:=statement_timestamp();
begin
 perform public.assert_conversation_admin();
 -- Same row lock as final dispatch authorization establishes the total order.
 select * into c from public.conversations where id=target_conversation_id for update;
 if not found then raise exception 'conversation_not_found';end if;
 select * into cmd from public.conversation_state_commands where conversation_id=c.id and idempotency_key=target_idempotency_key;
 if found then if cmd.target_status<>target_status then raise exception 'idempotency_conflict';end if;return public.conversation_dto(c);end if;
 if c.status=target_status then return public.conversation_dto(c);end if;
 if c.revision<>expected_revision then raise exception 'stale_conversation_revision';end if;
 if not ((c.status='open' and target_status in ('paused','human_review','closed')) or (c.status in ('paused','human_review') and target_status in ('open','closed'))) then raise exception 'invalid_status_transition';end if;
 if target_status='closed' and exists(
   select 1 from public.transport_delivery_commands d
   join public.transport_send_attempts a on a.delivery_command_id=d.id and a.finished_at is null
   where d.conversation_id=c.id and d.provider='whatsapp'
 ) then raise exception 'conversation_dispatch_in_progress';end if;
 perform set_config('app.conversation_authority_mutation','allowed',true);
 update public.conversations set status=target_status,revision=revision+1 where id=c.id and revision=expected_revision returning * into c;
 insert into public.conversation_state_commands(conversation_id,command,target_status,result_revision,actor_id,idempotency_key) values(c.id,'status_transition',target_status,c.revision,auth.uid(),target_idempotency_key);
 insert into public.audit_log(actor_id,entity_type,entity_id,action,metadata) values(auth.uid(),'conversation',c.id,'conversation_status_changed',jsonb_build_object('actor_id',auth.uid(),'conversation_id',c.id,'project_id',c.current_project_id,'revision',c.revision,'timestamp',now_at));
 return public.conversation_dto(c);
end$$;

revoke all on function public.authorize_whatsapp_outbound_dispatch(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.authorize_whatsapp_outbound_dispatch(uuid,uuid,uuid) to service_role;
revoke all on function public.transition_conversation_status(uuid,public.conversation_status,integer,text) from public,anon,authenticated;
grant execute on function public.transition_conversation_status(uuid,public.conversation_status,integer,text) to authenticated;

comment on function public.authorize_whatsapp_outbound_dispatch(uuid,uuid,uuid) is 'Final provider-send fence serialized with Conversation close; authorization is bound to the original Conversation and active Binding.';
comment on function public.transition_conversation_status(uuid,public.conversation_status,integer,text) is 'Conversation CAS transition; close fails retryably while an authorized provider dispatch remains in progress.';
