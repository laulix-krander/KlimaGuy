-- AP-16-06-05F: persisted-state first-contact routing/discovery plus infrastructure-only scheduler.
create function public.get_first_contact_eligibility(target_conversation_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare c public.conversations%rowtype; r public.conversation_runtime_states%rowtype;
begin
 if auth.role() is distinct from 'service_role' or target_conversation_id is null then return jsonb_build_object('status','invalid_state'); end if;
 select * into c from public.conversations where id=target_conversation_id;
 if not found or c.status<>'open' or c.creation_command_key not like 'whatsapp:%' then return jsonb_build_object('status','not_applicable'); end if;
 if not exists(
   select 1 from public.conversation_transport_bindings b
   join public.conversation_transport_identities i on i.id=b.transport_identity_id
   where b.conversation_id=c.id and b.provider='whatsapp' and b.status='active' and i.status='active'
   group by b.conversation_id having count(*)=1
 ) or not exists(select 1 from public.conversation_messages m where m.conversation_id=c.id and m.direction='inbound')
 then return jsonb_build_object('status','invalid_state'); end if;
 select * into r from public.conversation_runtime_states where conversation_id=c.id;
 if r.conversation_id is not null and r.runtime_status='awaiting_customer_answer' and r.active_pending_interaction_id is not null
   and exists(select 1 from public.conversation_runtime_commands x where x.conversation_id=c.id and x.idempotency_key='first-contact-initial-prompt:v1' and x.result_revision=r.revision)
 then return jsonb_build_object('status','already_initialized'); end if;
 if c.current_project_id is not null and exists(select 1 from public.project_knowledge_claims q where q.project_id=c.current_project_id)
 then return jsonb_build_object('status','not_applicable'); end if;
 if r.conversation_id is null then return jsonb_build_object('status','healable'); end if;
 if r.runtime_status='idle' and r.active_pending_interaction_id is null and r.active_evidence_request_id is null
   and not exists(select 1 from public.conversation_runtime_commands x where x.conversation_id=c.id and x.idempotency_key='first-contact-initial-prompt:v1')
 then return jsonb_build_object('status','healable'); end if;
 return jsonb_build_object('status','not_applicable');
end $$;

create function public.discover_recoverable_first_contacts(target_limit integer default 10)
returns table(conversation_id uuid,recovery_action text)
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if auth.role() is distinct from 'service_role' then raise exception 'not_authorized'; end if;
 return query
 select c.id,
   case when r.conversation_id is null or c.customer_id is null or c.current_project_id is null
     then 'FOUNDATION_REQUIRED' else 'INITIAL_PROMPT_REQUIRED' end::text
 from public.conversations c
 join public.conversation_transport_bindings b on b.conversation_id=c.id and b.provider='whatsapp' and b.status='active'
 join public.conversation_transport_identities i on i.id=b.transport_identity_id and i.status='active'
 left join public.conversation_runtime_states r on r.conversation_id=c.id
 where c.status='open' and c.creation_command_key like 'whatsapp:%'
   and exists(select 1 from public.conversation_messages m where m.conversation_id=c.id and m.direction='inbound')
   and not exists(select 1 from public.conversation_runtime_commands x where x.conversation_id=c.id and x.idempotency_key='first-contact-initial-prompt:v1')
   and (r.conversation_id is null or (r.runtime_status='idle' and r.active_pending_interaction_id is null and r.active_evidence_request_id is null))
   and not exists(select 1 from public.conversation_pending_interactions p where p.conversation_id=c.id and p.status='pending')
   and (c.current_project_id is null or not exists(select 1 from public.project_knowledge_claims q where q.project_id=c.current_project_id))
 group by c.id,c.created_at,r.conversation_id,r.runtime_status,r.active_pending_interaction_id,r.active_evidence_request_id
 having count(*)=1
 order by c.created_at asc,c.id asc
 limit least(greatest(coalesce(target_limit,10),0),10);
end $$;

revoke execute on function public.get_first_contact_eligibility(uuid) from public,anon,authenticated;
revoke execute on function public.discover_recoverable_first_contacts(integer) from public,anon,authenticated;
grant execute on function public.get_first_contact_eligibility(uuid) to service_role;
grant execute on function public.discover_recoverable_first_contacts(integer) to service_role;
comment on function public.get_first_contact_eligibility(uuid) is 'Content-free persisted-state routing authority; never examines inbound text.';
comment on function public.discover_recoverable_first_contacts(integer) is 'Bounded deterministic service-only discovery; no planning, answer, message, or delivery mutation.';

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;
do $migration$
declare existing_job bigint;
begin
 for existing_job in select jobid from cron.job where jobname='first-contact-recovery' loop
  perform cron.unschedule(existing_job);
 end loop;
 perform cron.schedule(
  'first-contact-recovery','* * * * *',
  $request$
   select net.http_post(
    url := rtrim(url_secret.decrypted_secret,'/') || '/api/internal/first-contact/recovery',
    headers := jsonb_build_object('Authorization','Bearer ' || auth_secret.decrypted_secret,'Content-Type','application/json'),
    body := '{}'::jsonb
   )
   from vault.decrypted_secrets url_secret cross join vault.decrypted_secrets auth_secret
   where url_secret.name='KLIMAGUY_PRODUCTION_BASE_URL'
    and auth_secret.name='FIRST_CONTACT_RECOVERY_SECRET'
    and url_secret.decrypted_secret ~ '^https://[^/?#]+(?:[.][^/?#]+)+$'
    and auth_secret.decrypted_secret<>''
  $request$
 );
end
$migration$;
