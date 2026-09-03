-- AP-16-06-04B: persistent outbound identity, retry timing and dispatch boundary.
alter table public.transport_delivery_commands
  add column next_attempt_at timestamptz,
  add column dispatch_started_at timestamptz,
  add column dispatch_attempt_number integer check (dispatch_attempt_number between 1 and 3),
  add column dispatch_token uuid,
  add constraint transport_delivery_dispatch_marker_complete check (
    (dispatch_started_at is null and dispatch_attempt_number is null and dispatch_token is null)
    or (dispatch_started_at is not null and dispatch_attempt_number is not null and dispatch_token is not null)
  );

-- An internal outbound identity can authorize only one WhatsApp command, even if a
-- binding is superseded later. The former three-column constraint remains valid.
create unique index transport_delivery_one_whatsapp_command_per_message
  on public.transport_delivery_commands(internal_message_id) where provider='whatsapp';

create or replace function public.claim_whatsapp_outbound_delivery(target_internal_message_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare m public.conversation_messages%rowtype;c public.conversations%rowtype;b public.conversation_transport_bindings%rowtype;i public.conversation_transport_identities%rowtype;d public.transport_delivery_commands%rowtype;p public.conversation_pending_interactions%rowtype;body text;token uuid:=gen_random_uuid();now_at timestamptz:=statement_timestamp();
begin
 if auth.role()<>'service_role' then return jsonb_build_object('status','not_authorized'); end if;
 select * into m from public.conversation_messages where id=target_internal_message_id for update;
 if not found or m.direction<>'outbound' or m.message_kind<>'text' or m.actor_class not in ('admin','reviewer','system','ai') then return jsonb_build_object('status','not_sendable');end if;
 select * into c from public.conversations where id=m.conversation_id for update;
 select * into b from public.conversation_transport_bindings where conversation_id=c.id and provider='whatsapp' and status='active' for update;
 if b.id is null then return jsonb_build_object('status','not_sendable');end if;
 select * into i from public.conversation_transport_identities where id=b.transport_identity_id and status='active' for update;
 if i.id is null then return jsonb_build_object('status','not_sendable');end if;
 insert into public.transport_delivery_commands(internal_message_id,conversation_id,transport_binding_id,transport_identity_id)
 values(m.id,c.id,b.id,i.id) on conflict do nothing;
 select * into d from public.transport_delivery_commands where provider='whatsapp' and internal_message_id=m.id for update;
 if d.status in ('sending','accepted_by_provider','delivered','read','delivery_ambiguous','blocked') then
  return jsonb_build_object('delivery_command_id',d.id,'claim_token',coalesce(d.claim_token,d.id),'destination','redacted','text','redacted','sender_scope',i.sender_scope,'status',case when d.status='blocked' then 'blocked' else 'replay' end);
 end if;
 if d.status='failed' and not (d.retry_classification='retryable' and d.next_attempt_at is not null and d.next_attempt_at<=now_at and d.attempt_count<3) then
  return jsonb_build_object('delivery_command_id',d.id,'claim_token',d.id,'destination','redacted','text','redacted','sender_scope',i.sender_scope,'status',case when d.next_attempt_at>now_at then 'not_due' else 'terminal' end);
 end if;
 if c.status<>'open' then update public.transport_delivery_commands set status='blocked',next_attempt_at=null,failure_code=case when c.status='human_review' then 'human_takeover_blocked' else 'conversation_not_sendable' end,retry_classification=case when c.status='human_review' then 'human_review_required' else 'terminal' end where id=d.id;return jsonb_build_object('delivery_command_id',d.id,'claim_token',d.id,'destination','redacted','text','redacted','sender_scope',i.sender_scope,'status','blocked');end if;
 select * into p from public.conversation_pending_interactions where prompt_message_id=m.id;
 if p.id is not null and (p.status<>'pending' or not exists(select 1 from public.conversation_runtime_states r where r.conversation_id=c.id and r.active_pending_interaction_id=p.id and r.runtime_status in ('awaiting_customer_answer','awaiting_evidence'))) then update public.transport_delivery_commands set status='blocked',next_attempt_at=null,failure_code='stale_interaction',retry_classification='terminal' where id=d.id;return jsonb_build_object('delivery_command_id',d.id,'claim_token',d.id,'destination','redacted','text','redacted','sender_scope',i.sender_scope,'status','blocked');end if;
 select t.body into body from public.conversation_message_text t where t.message_id=m.id;
 if body is null then return jsonb_build_object('status','not_sendable');end if;
 -- Acquire/revalidation are deliberately not provider attempts.
 update public.transport_delivery_commands set status='sending',claim_token=token,claimed_at=now_at where id=d.id returning * into d;
 return jsonb_build_object('delivery_command_id',d.id,'claim_token',token,'destination',i.external_identity,'text',body,'sender_scope',i.sender_scope,'status','sending');
end$$;

create or replace function public.revalidate_whatsapp_outbound_delivery(target_delivery_command_id uuid,target_claim_token uuid)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare d public.transport_delivery_commands%rowtype;c public.conversations%rowtype;p public.conversation_pending_interactions%rowtype;
begin
 if auth.role()<>'service_role' then return false;end if;
 select * into d from public.transport_delivery_commands where id=target_delivery_command_id for update;
 select * into c from public.conversations where id=d.conversation_id for update;
 if d.status<>'sending' or d.claim_token<>target_claim_token or c.status<>'open' or not exists(select 1 from public.conversation_transport_bindings b join public.conversation_transport_identities i on i.id=b.transport_identity_id where b.id=d.transport_binding_id and b.status='active' and i.status='active') then update public.transport_delivery_commands set status='blocked',claim_token=null,claimed_at=null,next_attempt_at=null,failure_code=case when c.status='human_review' then 'human_takeover_blocked' else 'conversation_not_sendable' end,retry_classification=case when c.status='human_review' then 'human_review_required' else 'terminal' end where id=d.id;return false;end if;
 select * into p from public.conversation_pending_interactions where prompt_message_id=d.internal_message_id;
 if p.id is not null and (p.status<>'pending' or not exists(select 1 from public.conversation_runtime_states r where r.conversation_id=d.conversation_id and r.active_pending_interaction_id=p.id)) then update public.transport_delivery_commands set status='blocked',claim_token=null,claimed_at=null,next_attempt_at=null,failure_code='stale_interaction',retry_classification='terminal' where id=d.id;return false;end if;
 return true;
end$$;

create function public.authorize_whatsapp_outbound_dispatch(target_delivery_command_id uuid,target_claim_token uuid,target_dispatch_token uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare d public.transport_delivery_commands%rowtype;now_at timestamptz:=statement_timestamp();next_number integer;
begin
 if auth.role()<>'service_role' then return jsonb_build_object('status','not_authorized');end if;
 select * into d from public.transport_delivery_commands where id=target_delivery_command_id for update;
 if not found or d.status<>'sending' or d.claim_token<>target_claim_token then return jsonb_build_object('status','not_eligible');end if;
 if d.attempt_count>0 and not (d.retry_classification='retryable' and d.next_attempt_at is not null and d.next_attempt_at<=now_at) then return jsonb_build_object('status','not_eligible');end if;
 -- A replay observes the same authorization but is never permission for a second HTTP call.
 if d.dispatch_token=target_dispatch_token and exists(select 1 from public.transport_send_attempts a where a.delivery_command_id=d.id and a.attempt_number=d.dispatch_attempt_number and a.finished_at is null) then return jsonb_build_object('status','already_authorized','delivery_command_id',d.id,'attempt_number',d.dispatch_attempt_number,'dispatch_token',d.dispatch_token,'dispatch_started_at',d.dispatch_started_at);end if;
 if exists(select 1 from public.transport_send_attempts a where a.delivery_command_id=d.id and a.finished_at is null) then return jsonb_build_object('status','already_authorized');end if;
 if d.attempt_count>=3 then update public.transport_delivery_commands set status='failed',claim_token=null,claimed_at=null,next_attempt_at=null,retry_classification='terminal' where id=d.id;return jsonb_build_object('status','attempts_exhausted');end if;
 next_number:=d.attempt_count+1;
 update public.transport_delivery_commands set attempt_count=next_number,dispatch_started_at=now_at,dispatch_attempt_number=next_number,dispatch_token=target_dispatch_token,next_attempt_at=null where id=d.id returning * into d;
 insert into public.transport_send_attempts(delivery_command_id,attempt_number,started_at) values(d.id,next_number,now_at);
 insert into public.audit_log(actor_id,entity_type,entity_id,action,metadata) values(null,'transport_delivery_command',d.id,'whatsapp_delivery_dispatch_authorized',jsonb_build_object('delivery_command_id',d.id,'internal_message_id',d.internal_message_id,'attempt_number',next_number));
 return jsonb_build_object('status','authorized','delivery_command_id',d.id,'attempt_number',next_number,'dispatch_token',target_dispatch_token,'dispatch_started_at',now_at);
end$$;

create function public.fail_whatsapp_outbound_pre_dispatch(target_delivery_command_id uuid,target_claim_token uuid,target_failure_code text,target_retry_classification public.transport_retry_classification)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare d public.transport_delivery_commands%rowtype;
begin
 if auth.role()<>'service_role' then return jsonb_build_object('status','not_authorized');end if;
 select * into d from public.transport_delivery_commands where id=target_delivery_command_id and status='sending' and claim_token=target_claim_token for update;
 if not found then return jsonb_build_object('status','stale_claim');end if;
 if exists(select 1 from public.transport_send_attempts a where a.delivery_command_id=d.id and a.finished_at is null) then return jsonb_build_object('status','dispatch_possible');end if;
 if not (target_failure_code in ('provider_auth_error','configuration_error','binding_missing','destination_invalid','conversation_not_sendable','stale_interaction','human_takeover_blocked') and target_retry_classification in ('configuration','terminal','human_review_required')) then return jsonb_build_object('status','invalid_result');end if;
 update public.transport_delivery_commands set status='blocked',failure_code=target_failure_code,retry_classification=target_retry_classification,next_attempt_at=null,failed_at=statement_timestamp(),claim_token=null,claimed_at=null where id=d.id;
 return jsonb_build_object('status','completed');
end$$;

drop function public.complete_whatsapp_outbound_delivery(uuid,uuid,boolean,text,text,public.transport_retry_classification,timestamptz);
create function public.complete_whatsapp_outbound_delivery(target_delivery_command_id uuid,target_claim_token uuid,target_dispatch_token uuid,target_attempt_number integer,target_success boolean,target_provider_message_id text,target_failure_code text,target_retry_classification public.transport_retry_classification,target_provider_accepted_at timestamptz)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare d public.transport_delivery_commands%rowtype;i public.conversation_transport_identities%rowtype;mb public.transport_message_bindings%rowtype;result public.transport_send_result_class;now_at timestamptz:=statement_timestamp();retry_at timestamptz;
begin
 if auth.role()<>'service_role' then return jsonb_build_object('status','not_authorized');end if;
 select * into d from public.transport_delivery_commands where id=target_delivery_command_id for update;
 if not found or d.status<>'sending' or d.claim_token<>target_claim_token or d.dispatch_token<>target_dispatch_token or d.dispatch_attempt_number<>target_attempt_number or d.attempt_count<>target_attempt_number then return jsonb_build_object('status','stale_attempt');end if;
 if not exists(select 1 from public.transport_send_attempts a where a.delivery_command_id=d.id and a.attempt_number=target_attempt_number and a.finished_at is null) then return jsonb_build_object('status','stale_attempt');end if;
 select * into i from public.conversation_transport_identities where id=d.transport_identity_id;
 if target_success then
  if target_provider_message_id is null or target_provider_accepted_at is null then return jsonb_build_object('status','invalid_result');end if;
  insert into public.transport_message_bindings(provider,sender_scope,provider_message_id,internal_message_id,transport_identity_id,direction,provider_occurred_at) values('whatsapp',i.sender_scope,target_provider_message_id,d.internal_message_id,i.id,'outbound',target_provider_accepted_at) on conflict(provider,sender_scope,provider_message_id) do nothing returning * into mb;
  if mb.id is null then select * into mb from public.transport_message_bindings where provider='whatsapp' and sender_scope=i.sender_scope and provider_message_id=target_provider_message_id and internal_message_id=d.internal_message_id;end if;
  if mb.id is null then return jsonb_build_object('status','binding_conflict');end if;
  update public.transport_delivery_commands set status='accepted_by_provider',provider_message_binding_id=mb.id,accepted_at=target_provider_accepted_at,claim_token=null,claimed_at=null,next_attempt_at=null,failure_code=null,retry_classification=null where id=d.id;
  result:='provider_accepted';
 else
  if not ((target_failure_code='rate_limited' and target_retry_classification='retryable') or (target_failure_code='transient_provider_error' and target_retry_classification='retryable') or (target_failure_code='ambiguous_send_result' and target_retry_classification='requires_reconciliation') or (target_failure_code='provider_auth_error' and target_retry_classification='configuration') or (target_failure_code in ('provider_rejected','destination_invalid') and target_retry_classification='terminal')) then return jsonb_build_object('status','invalid_result');end if;
  result:=case target_failure_code when 'rate_limited' then 'rate_limited'::public.transport_send_result_class when 'transient_provider_error' then 'transient_failure'::public.transport_send_result_class when 'ambiguous_send_result' then 'ambiguous'::public.transport_send_result_class when 'provider_auth_error' then 'configuration_failure'::public.transport_send_result_class else 'provider_rejected'::public.transport_send_result_class end;
  if target_retry_classification='retryable' and target_attempt_number<3 then retry_at:=now_at+case when target_failure_code='rate_limited' or target_attempt_number=2 then interval '5 minutes' else interval '1 minute' end;end if;
  update public.transport_delivery_commands set status=case when target_failure_code='ambiguous_send_result' then 'delivery_ambiguous'::public.transport_delivery_status when target_retry_classification='configuration' then 'blocked'::public.transport_delivery_status else 'failed'::public.transport_delivery_status end,failure_code=target_failure_code,retry_classification=case when target_retry_classification='retryable' and target_attempt_number>=3 then 'terminal'::public.transport_retry_classification else target_retry_classification end,next_attempt_at=retry_at,failed_at=now_at,claim_token=null,claimed_at=null where id=d.id;
 end if;
 update public.transport_send_attempts set finished_at=now_at,result_class=result,failure_code=target_failure_code,provider_message_id=target_provider_message_id where delivery_command_id=d.id and attempt_number=target_attempt_number;
 insert into public.audit_log(actor_id,entity_type,entity_id,action,metadata) values(null,'transport_delivery_command',d.id,case when target_success then 'whatsapp_delivery_attempt_completed' else 'whatsapp_delivery_attempt_failed' end,jsonb_build_object('delivery_command_id',d.id,'internal_message_id',d.internal_message_id,'attempt_number',target_attempt_number,'result_class',result));
 return jsonb_build_object('status','completed');
end$$;

revoke all on function public.claim_whatsapp_outbound_delivery(uuid),public.revalidate_whatsapp_outbound_delivery(uuid,uuid),public.authorize_whatsapp_outbound_dispatch(uuid,uuid,uuid),public.fail_whatsapp_outbound_pre_dispatch(uuid,uuid,text,public.transport_retry_classification),public.complete_whatsapp_outbound_delivery(uuid,uuid,uuid,integer,boolean,text,text,public.transport_retry_classification,timestamptz) from public,anon,authenticated;
grant execute on function public.claim_whatsapp_outbound_delivery(uuid),public.revalidate_whatsapp_outbound_delivery(uuid,uuid),public.authorize_whatsapp_outbound_dispatch(uuid,uuid,uuid),public.fail_whatsapp_outbound_pre_dispatch(uuid,uuid,text,public.transport_retry_classification),public.complete_whatsapp_outbound_delivery(uuid,uuid,uuid,integer,boolean,text,text,public.transport_retry_classification,timestamptz) to service_role;

comment on column public.transport_delivery_commands.next_attempt_at is 'Persistent retry timing authority; null means no automatic retry.';
comment on column public.transport_delivery_commands.dispatch_started_at is 'Conservative boundary after which a provider side effect may have occurred; retained historically.';
