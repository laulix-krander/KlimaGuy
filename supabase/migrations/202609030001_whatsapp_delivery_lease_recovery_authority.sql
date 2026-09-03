-- AP-16-06-04C: execution lease, ownership fencing and bounded recovery discovery.
alter table public.transport_delivery_commands
  add column execution_owner_id uuid,
  add column execution_lease_expires_at timestamptz,
  add column execution_attempt_count integer not null default 0 check (execution_attempt_count >= 0),
  add column last_execution_started_at timestamptz,
  add constraint transport_delivery_execution_lease_complete check (
    (execution_owner_id is null and execution_lease_expires_at is null)
    or (execution_owner_id is not null and execution_lease_expires_at is not null)
  );

create index transport_delivery_recovery_scan
  on public.transport_delivery_commands(status, execution_lease_expires_at, next_attempt_at, created_at, id)
  where status in ('pending','sending','failed');

drop function public.claim_whatsapp_outbound_delivery(uuid);
drop function public.revalidate_whatsapp_outbound_delivery(uuid,uuid);
drop function public.authorize_whatsapp_outbound_dispatch(uuid,uuid,uuid);
drop function public.fail_whatsapp_outbound_pre_dispatch(uuid,uuid,text,public.transport_retry_classification);
drop function public.complete_whatsapp_outbound_delivery(uuid,uuid,uuid,integer,boolean,text,text,public.transport_retry_classification,timestamptz);

create function public.acquire_whatsapp_delivery_execution(target_internal_message_id uuid,target_execution_owner_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare m public.conversation_messages%rowtype;c public.conversations%rowtype;b public.conversation_transport_bindings%rowtype;i public.conversation_transport_identities%rowtype;d public.transport_delivery_commands%rowtype;p public.conversation_pending_interactions%rowtype;body text;now_at timestamptz:=statement_timestamp();lease_duration constant interval:=interval '60 seconds';
begin
 if auth.role()<>'service_role' then return jsonb_build_object('status','not_authorized');end if;
 if target_execution_owner_id is null then return jsonb_build_object('status','invalid_request');end if;
 select * into m from public.conversation_messages where id=target_internal_message_id for update;
 if not found or m.direction<>'outbound' or m.message_kind<>'text' or m.actor_class not in ('admin','reviewer','system','ai') then return jsonb_build_object('status','not_sendable');end if;
 select * into c from public.conversations where id=m.conversation_id for update;
 select * into b from public.conversation_transport_bindings where conversation_id=c.id and provider='whatsapp' and status='active' for update;
 if b.id is null then return jsonb_build_object('status','not_sendable');end if;
 select * into i from public.conversation_transport_identities where id=b.transport_identity_id and status='active' for update;
 if i.id is null then return jsonb_build_object('status','not_sendable');end if;
 insert into public.transport_delivery_commands(internal_message_id,conversation_id,transport_binding_id,transport_identity_id) values(m.id,c.id,b.id,i.id) on conflict do nothing;
 select * into d from public.transport_delivery_commands where provider='whatsapp' and internal_message_id=m.id for update;
 if d.status='delivery_ambiguous' then return jsonb_build_object('status','ambiguous','delivery_command_id',d.id);end if;
 if d.status in ('accepted_by_provider','delivered','read','blocked') then return jsonb_build_object('status','already_terminal','delivery_command_id',d.id);end if;
 if d.status='failed' then
   if d.attempt_count>=3 then return jsonb_build_object('status','attempts_exhausted','delivery_command_id',d.id);end if;
   if d.retry_classification<>'retryable' then return jsonb_build_object('status','retry_not_allowed','delivery_command_id',d.id);end if;
   if d.next_attempt_at is null or d.next_attempt_at>now_at then return jsonb_build_object('status','not_due','delivery_command_id',d.id);end if;
 end if;
 if d.status='sending' then
   if d.execution_owner_id is null then return jsonb_build_object('status','ambiguous','delivery_command_id',d.id);end if; -- legacy: phase cannot be proved
   if d.execution_lease_expires_at>now_at then return jsonb_build_object('status','busy','delivery_command_id',d.id);end if;
   if exists(select 1 from public.transport_send_attempts a where a.delivery_command_id=d.id and a.finished_at is null) then return jsonb_build_object('status','ambiguous','delivery_command_id',d.id);end if;
 end if;
 if d.status not in ('pending','failed','sending') then return jsonb_build_object('status','already_terminal','delivery_command_id',d.id);end if;
 if c.status<>'open' then update public.transport_delivery_commands set status='blocked',next_attempt_at=null,failure_code=case when c.status='human_review' then 'human_takeover_blocked' else 'conversation_not_sendable' end,retry_classification=case when c.status='human_review' then 'human_review_required' else 'terminal' end,execution_owner_id=null,execution_lease_expires_at=null where id=d.id;return jsonb_build_object('status','already_terminal','delivery_command_id',d.id);end if;
 select * into p from public.conversation_pending_interactions where prompt_message_id=m.id;
 if p.id is not null and (p.status<>'pending' or not exists(select 1 from public.conversation_runtime_states r where r.conversation_id=c.id and r.active_pending_interaction_id=p.id and r.runtime_status in ('awaiting_customer_answer','awaiting_evidence'))) then update public.transport_delivery_commands set status='blocked',next_attempt_at=null,failure_code='stale_interaction',retry_classification='terminal',execution_owner_id=null,execution_lease_expires_at=null where id=d.id;return jsonb_build_object('status','already_terminal','delivery_command_id',d.id);end if;
 select t.body into body from public.conversation_message_text t where t.message_id=m.id;
 if body is null then return jsonb_build_object('status','not_sendable');end if;
 update public.transport_delivery_commands set status='sending',claim_token=target_execution_owner_id,claimed_at=now_at,execution_owner_id=target_execution_owner_id,execution_lease_expires_at=now_at+lease_duration,execution_attempt_count=execution_attempt_count+1,last_execution_started_at=now_at where id=d.id returning * into d;
 return jsonb_build_object('status','acquired','delivery_command_id',d.id,'outbound_message_id',d.internal_message_id,'execution_owner_id',d.execution_owner_id,'execution_lease_expires_at',d.execution_lease_expires_at,'destination',i.external_identity,'text',body,'sender_scope',i.sender_scope);
end$$;

create function public.revalidate_whatsapp_outbound_delivery(target_delivery_command_id uuid,target_execution_owner_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare d public.transport_delivery_commands%rowtype;c public.conversations%rowtype;p public.conversation_pending_interactions%rowtype;now_at timestamptz:=statement_timestamp();
begin
 if auth.role()<>'service_role' then return jsonb_build_object('status','not_authorized');end if;
 select * into d from public.transport_delivery_commands where id=target_delivery_command_id for update;
 if not found or d.status<>'sending' or d.execution_owner_id<>target_execution_owner_id or d.execution_lease_expires_at<=now_at then return jsonb_build_object('status','ownership_lost');end if;
 select * into c from public.conversations where id=d.conversation_id for update;
 if c.status<>'open' or not exists(select 1 from public.conversation_transport_bindings b join public.conversation_transport_identities i on i.id=b.transport_identity_id where b.id=d.transport_binding_id and b.status='active' and i.status='active') then update public.transport_delivery_commands set status='blocked',claim_token=null,claimed_at=null,next_attempt_at=null,failure_code=case when c.status='human_review' then 'human_takeover_blocked' else 'conversation_not_sendable' end,retry_classification=case when c.status='human_review' then 'human_review_required' else 'terminal' end,execution_owner_id=null,execution_lease_expires_at=null where id=d.id;return jsonb_build_object('status','blocked');end if;
 select * into p from public.conversation_pending_interactions where prompt_message_id=d.internal_message_id;
 if p.id is not null and (p.status<>'pending' or not exists(select 1 from public.conversation_runtime_states r where r.conversation_id=d.conversation_id and r.active_pending_interaction_id=p.id)) then update public.transport_delivery_commands set status='blocked',claim_token=null,claimed_at=null,next_attempt_at=null,failure_code='stale_interaction',retry_classification='terminal',execution_owner_id=null,execution_lease_expires_at=null where id=d.id;return jsonb_build_object('status','blocked');end if;
 return jsonb_build_object('status','valid');
end$$;

create function public.authorize_whatsapp_outbound_dispatch(target_delivery_command_id uuid,target_execution_owner_id uuid,target_dispatch_token uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare d public.transport_delivery_commands%rowtype;now_at timestamptz:=statement_timestamp();next_number integer;
begin
 if auth.role()<>'service_role' then return jsonb_build_object('status','not_authorized');end if;
 select * into d from public.transport_delivery_commands where id=target_delivery_command_id for update;
 if not found or d.status<>'sending' or d.execution_owner_id<>target_execution_owner_id or d.execution_lease_expires_at<=now_at then return jsonb_build_object('status','ownership_lost');end if;
 if exists(select 1 from public.transport_send_attempts a where a.delivery_command_id=d.id and a.finished_at is null) then return jsonb_build_object('status','already_authorized');end if;
 if d.attempt_count>=3 then return jsonb_build_object('status','attempts_exhausted');end if;
 next_number:=d.attempt_count+1;
 update public.transport_delivery_commands set attempt_count=next_number,dispatch_started_at=now_at,dispatch_attempt_number=next_number,dispatch_token=target_dispatch_token,next_attempt_at=null where id=d.id returning * into d;
 insert into public.transport_send_attempts(delivery_command_id,attempt_number,started_at) values(d.id,next_number,now_at);
 insert into public.audit_log(actor_id,entity_type,entity_id,action,metadata) values(null,'transport_delivery_command',d.id,'whatsapp_delivery_dispatch_authorized',jsonb_build_object('delivery_command_id',d.id,'internal_message_id',d.internal_message_id,'attempt_number',next_number));
 return jsonb_build_object('status','authorized','delivery_command_id',d.id,'attempt_number',next_number,'dispatch_token',target_dispatch_token,'dispatch_started_at',now_at);
end$$;

create function public.fail_whatsapp_outbound_pre_dispatch(target_delivery_command_id uuid,target_execution_owner_id uuid,target_failure_code text,target_retry_classification public.transport_retry_classification)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare d public.transport_delivery_commands%rowtype;now_at timestamptz:=statement_timestamp();
begin
 if auth.role()<>'service_role' then return jsonb_build_object('status','not_authorized');end if;
 select * into d from public.transport_delivery_commands where id=target_delivery_command_id for update;
 if not found or d.status<>'sending' or d.execution_owner_id<>target_execution_owner_id or d.execution_lease_expires_at<=now_at then return jsonb_build_object('status','ownership_lost');end if;
 if exists(select 1 from public.transport_send_attempts a where a.delivery_command_id=d.id and a.finished_at is null) then return jsonb_build_object('status','dispatch_possible');end if;
 if not (target_failure_code in ('provider_auth_error','configuration_error','binding_missing','destination_invalid','conversation_not_sendable','stale_interaction','human_takeover_blocked') and target_retry_classification in ('configuration','terminal','human_review_required')) then return jsonb_build_object('status','invalid_result');end if;
 update public.transport_delivery_commands set status='blocked',failure_code=target_failure_code,retry_classification=target_retry_classification,next_attempt_at=null,failed_at=now_at,claim_token=null,claimed_at=null,execution_owner_id=null,execution_lease_expires_at=null where id=d.id;
 return jsonb_build_object('status','completed');
end$$;

create function public.complete_whatsapp_outbound_delivery(target_delivery_command_id uuid,target_execution_owner_id uuid,target_dispatch_token uuid,target_attempt_number integer,target_success boolean,target_provider_message_id text,target_failure_code text,target_retry_classification public.transport_retry_classification,target_provider_accepted_at timestamptz)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare d public.transport_delivery_commands%rowtype;i public.conversation_transport_identities%rowtype;mb public.transport_message_bindings%rowtype;result public.transport_send_result_class;now_at timestamptz:=statement_timestamp();retry_at timestamptz;
begin
 if auth.role()<>'service_role' then return jsonb_build_object('status','not_authorized');end if;
 select * into d from public.transport_delivery_commands where id=target_delivery_command_id for update;
 if not found or d.status<>'sending' or d.execution_owner_id<>target_execution_owner_id or d.execution_lease_expires_at<=now_at then return jsonb_build_object('status','ownership_lost');end if;
 if d.dispatch_token<>target_dispatch_token or d.dispatch_attempt_number<>target_attempt_number or d.attempt_count<>target_attempt_number or not exists(select 1 from public.transport_send_attempts a where a.delivery_command_id=d.id and a.attempt_number=target_attempt_number and a.finished_at is null) then return jsonb_build_object('status','stale_attempt');end if;
 select * into i from public.conversation_transport_identities where id=d.transport_identity_id;
 if target_success then
  if target_provider_message_id is null or target_provider_accepted_at is null then return jsonb_build_object('status','invalid_result');end if;
  insert into public.transport_message_bindings(provider,sender_scope,provider_message_id,internal_message_id,transport_identity_id,direction,provider_occurred_at) values('whatsapp',i.sender_scope,target_provider_message_id,d.internal_message_id,i.id,'outbound',target_provider_accepted_at) on conflict(provider,sender_scope,provider_message_id) do nothing returning * into mb;
  if mb.id is null then select * into mb from public.transport_message_bindings where provider='whatsapp' and sender_scope=i.sender_scope and provider_message_id=target_provider_message_id and internal_message_id=d.internal_message_id;end if;
  if mb.id is null then return jsonb_build_object('status','binding_conflict');end if;
  update public.transport_delivery_commands set status='accepted_by_provider',provider_message_binding_id=mb.id,accepted_at=target_provider_accepted_at,next_attempt_at=null,failure_code=null,retry_classification=null,claim_token=null,claimed_at=null,execution_owner_id=null,execution_lease_expires_at=null where id=d.id;result:='provider_accepted';
 else
  if not ((target_failure_code='rate_limited' and target_retry_classification='retryable') or (target_failure_code='transient_provider_error' and target_retry_classification='retryable') or (target_failure_code='ambiguous_send_result' and target_retry_classification='requires_reconciliation') or (target_failure_code='provider_auth_error' and target_retry_classification='configuration') or (target_failure_code in ('provider_rejected','destination_invalid') and target_retry_classification='terminal')) then return jsonb_build_object('status','invalid_result');end if;
  result:=case target_failure_code when 'rate_limited' then 'rate_limited'::public.transport_send_result_class when 'transient_provider_error' then 'transient_failure'::public.transport_send_result_class when 'ambiguous_send_result' then 'ambiguous'::public.transport_send_result_class when 'provider_auth_error' then 'configuration_failure'::public.transport_send_result_class else 'provider_rejected'::public.transport_send_result_class end;
  if target_retry_classification='retryable' and target_attempt_number<3 then retry_at:=now_at+case when target_failure_code='rate_limited' or target_attempt_number=2 then interval '5 minutes' else interval '1 minute' end;end if;
  update public.transport_delivery_commands set status=case when target_failure_code='ambiguous_send_result' then 'delivery_ambiguous'::public.transport_delivery_status when target_retry_classification='configuration' then 'blocked'::public.transport_delivery_status else 'failed'::public.transport_delivery_status end,failure_code=target_failure_code,retry_classification=case when target_retry_classification='retryable' and target_attempt_number>=3 then 'terminal'::public.transport_retry_classification else target_retry_classification end,next_attempt_at=retry_at,failed_at=now_at,claim_token=null,claimed_at=null,execution_owner_id=null,execution_lease_expires_at=null where id=d.id;
 end if;
 update public.transport_send_attempts set finished_at=now_at,result_class=result,failure_code=target_failure_code,provider_message_id=target_provider_message_id where delivery_command_id=d.id and attempt_number=target_attempt_number;
 return jsonb_build_object('status','completed');
end$$;

create function public.finalize_expired_whatsapp_delivery_ambiguous(target_delivery_command_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare d public.transport_delivery_commands%rowtype;now_at timestamptz:=statement_timestamp();
begin
 if auth.role()<>'service_role' then return jsonb_build_object('status','not_authorized');end if;
 select * into d from public.transport_delivery_commands where id=target_delivery_command_id for update;
 if not found or d.status in ('accepted_by_provider','delivered','read','blocked','delivery_ambiguous') then return jsonb_build_object('status','already_terminal');end if;
 if d.provider_message_binding_id is not null or exists(select 1 from public.transport_message_bindings mb where mb.internal_message_id=d.internal_message_id and mb.provider='whatsapp' and mb.direction='outbound') then return jsonb_build_object('status','provider_binding_exists');end if;
 if d.status<>'sending' then return jsonb_build_object('status','not_eligible');end if;
 if d.execution_owner_id is not null and d.execution_lease_expires_at>now_at then return jsonb_build_object('status','busy');end if;
 if d.execution_owner_id is not null and not exists(select 1 from public.transport_send_attempts a where a.delivery_command_id=d.id and a.finished_at is null) then return jsonb_build_object('status','safe_to_run');end if;
 if d.execution_owner_id is not null and (d.dispatch_attempt_number is null or d.dispatch_token is null or not exists(select 1 from public.transport_send_attempts a where a.delivery_command_id=d.id and a.attempt_number=d.dispatch_attempt_number and a.finished_at is null)) then return jsonb_build_object('status','inconsistent_attempt');end if;
 update public.transport_delivery_commands set status='delivery_ambiguous',failure_code='ambiguous_send_result',retry_classification='requires_reconciliation',next_attempt_at=null,failed_at=now_at,claim_token=null,claimed_at=null,execution_owner_id=null,execution_lease_expires_at=null where id=d.id;
 update public.transport_send_attempts set finished_at=now_at,result_class='ambiguous',failure_code='ambiguous_send_result' where delivery_command_id=d.id and attempt_number=d.dispatch_attempt_number and finished_at is null;
 return jsonb_build_object('status','finalized');
end$$;

create function public.discover_recoverable_whatsapp_deliveries(target_limit integer default 5)
returns table(delivery_command_id uuid,outbound_message_id uuid,recovery_action text) language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if auth.role()<>'service_role' then return;end if;
 return query select d.id,d.internal_message_id,case when d.status='sending' and (d.execution_owner_id is null or exists(select 1 from public.transport_send_attempts a where a.delivery_command_id=d.id and a.finished_at is null)) then 'FINALIZE_AMBIGUOUS' else 'SAFE_TO_RUN' end
 from public.transport_delivery_commands d
 where d.provider='whatsapp' and (
   (d.status='pending' and d.execution_owner_id is null) or
   (d.status='failed' and d.retry_classification='retryable' and d.next_attempt_at<=statement_timestamp() and d.attempt_count<3 and d.execution_owner_id is null) or
   (d.status='sending' and (d.execution_owner_id is null or d.execution_lease_expires_at<=statement_timestamp()))
 )
 order by coalesce(case when d.status='sending' then d.execution_lease_expires_at else d.next_attempt_at end,d.created_at),d.created_at,d.id
 limit least(greatest(coalesce(target_limit,5),0),5);
end$$;

revoke all on function public.acquire_whatsapp_delivery_execution(uuid,uuid),public.revalidate_whatsapp_outbound_delivery(uuid,uuid),public.authorize_whatsapp_outbound_dispatch(uuid,uuid,uuid),public.fail_whatsapp_outbound_pre_dispatch(uuid,uuid,text,public.transport_retry_classification),public.complete_whatsapp_outbound_delivery(uuid,uuid,uuid,integer,boolean,text,text,public.transport_retry_classification,timestamptz),public.finalize_expired_whatsapp_delivery_ambiguous(uuid),public.discover_recoverable_whatsapp_deliveries(integer) from public,anon,authenticated;
grant execute on function public.acquire_whatsapp_delivery_execution(uuid,uuid),public.revalidate_whatsapp_outbound_delivery(uuid,uuid),public.authorize_whatsapp_outbound_dispatch(uuid,uuid,uuid),public.fail_whatsapp_outbound_pre_dispatch(uuid,uuid,text,public.transport_retry_classification),public.complete_whatsapp_outbound_delivery(uuid,uuid,uuid,integer,boolean,text,text,public.transport_retry_classification,timestamptz),public.finalize_expired_whatsapp_delivery_ambiguous(uuid),public.discover_recoverable_whatsapp_deliveries(integer) to service_role;

comment on column public.transport_delivery_commands.execution_owner_id is 'Opaque owner UUID for the current delivery execution; never a provider attempt identity.';
comment on column public.transport_delivery_commands.execution_lease_expires_at is 'Current delivery execution lease; fixed at 60 seconds by acquire authority.';
comment on column public.transport_delivery_commands.execution_attempt_count is 'Infrastructure execution count only; never provider retry authority.';
