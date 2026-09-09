-- Recovery discovery must distinguish an unauthorized caller from an authorized empty result.
create or replace function public.discover_recoverable_conversation_cycles(result_limit integer default 100)
returns table(command_id uuid, source_message_id uuid, lease_expired_at timestamptz)
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if auth.role() is distinct from 'service_role' then
    raise insufficient_privilege using message = 'conversation_cycle_recovery_service_role_required';
  end if;
  return query
    select c.id,c.source_message_id,coalesce(c.execution_lease_expires_at,c.last_execution_started_at,c.created_at)
    from public.conversation_cycle_commands c
    where c.status='processing'
      and (c.execution_lease_expires_at<=statement_timestamp() or c.execution_lease_expires_at is null)
      and c.command_type='customer_answer' and c.source_message_id is not null
    order by coalesce(c.execution_lease_expires_at,c.last_execution_started_at,c.created_at),c.id
    limit least(greatest(result_limit,1),100);
end $$;

create or replace function public.discover_missing_customer_answer_cycles(result_limit integer default 100)
returns table(source_message_id uuid, discovered_at timestamptz)
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if auth.role() is distinct from 'service_role' then
    raise insufficient_privilege using message = 'conversation_cycle_recovery_service_role_required';
  end if;
  return query
    select m.id, statement_timestamp()
    from public.conversation_messages m
    join public.conversations c on c.id=m.conversation_id
    join public.conversation_runtime_states r on r.conversation_id=c.id and r.project_id=c.current_project_id
    join public.conversation_pending_interactions p on p.id=r.active_pending_interaction_id
    join public.project_knowledge_states k on k.project_id=r.project_id
    join public.conversation_messages prompt on prompt.id=p.prompt_message_id and prompt.conversation_id=c.id
    join public.conversation_interaction_snapshots s on s.id=p.snapshot_id and s.pending_interaction_id=p.id
    where m.direction='inbound' and m.actor_class='customer' and m.message_kind='text'
      and c.status='open' and c.current_project_id is not null
      and r.runtime_status='awaiting_customer_answer' and r.active_pending_interaction_id is not null
      and p.status='pending' and p.conversation_id=c.id and p.project_id=r.project_id
      and p.runtime_revision=r.revision and p.expected_knowledge_state_version=r.knowledge_state_version
      and k.current_version=r.knowledge_state_version and p.snapshot_id is not null and p.prompt_message_id is not null
      and m.sequence>prompt.sequence
      and not exists(select 1 from public.conversation_cycle_commands cmd where cmd.source_message_id=m.id and cmd.command_type='customer_answer')
      and p.answered_by_message_id is null
    order by m.occurred_at,m.id
    limit least(greatest(result_limit,1),100);
end $$;

revoke all on function public.discover_recoverable_conversation_cycles(integer), public.discover_missing_customer_answer_cycles(integer) from public,anon,authenticated;
grant execute on function public.discover_recoverable_conversation_cycles(integer), public.discover_missing_customer_answer_cycles(integer) to service_role;
