-- AP-16-06-05D: atomic, replay-safe First Contact foundation (no prompt/delivery).
alter table public.customers alter column first_name drop not null;
alter table public.customers alter column last_name drop not null;

-- Customer identity remains immutable outside this narrowly scoped authority. The
-- only newly legal transition is NULL -> customer while the foundation RPC holds
-- both transport and conversation row locks.
create or replace function public.guard_conversation_state() returns trigger
language plpgsql set search_path=public,pg_temp as $$ begin
 if (new.current_project_id is distinct from old.current_project_id or new.status is distinct from old.status or new.revision is distinct from old.revision)
   and coalesce(current_setting('app.conversation_authority_mutation',true),'')<>'allowed' then raise exception 'conversation_mutation_requires_authority'; end if;
 if new.customer_id is distinct from old.customer_id
   and not (coalesce(current_setting('app.first_contact_customer_binding',true),'')='allowed' and old.customer_id is null and new.customer_id is not null)
   then raise exception 'conversation_identity_immutable'; end if;
 if new.created_by is distinct from old.created_by or new.creation_command_key is distinct from old.creation_command_key then raise exception 'conversation_identity_immutable'; end if;
 return new;
end $$;

create function public.bootstrap_first_contact_foundation(target_conversation_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
 actor_result jsonb; actor_id uuid; identity_row public.conversation_transport_identities%rowtype;
 binding_row public.conversation_transport_bindings%rowtype; conversation_row public.conversations%rowtype;
 customer_row public.customers%rowtype; project_row public.projects%rowtype;
 knowledge_row public.project_knowledge_states%rowtype; runtime_row public.conversation_runtime_states%rowtype;
 assignment_row public.conversation_project_assignments%rowtype;
 customer_created boolean:=false; changed boolean:=false; result_code text; failure_code text; active_binding_count integer;
begin
 if auth.role() is distinct from 'service_role' then return jsonb_build_object('status','invalid_state'); end if;
 if target_conversation_id is null then return jsonb_build_object('status','invalid_state'); end if;
 actor_result:=public.resolve_system_actor();
 if actor_result->>'status' in ('not_provisioned','not_authorized') then return jsonb_build_object('status','actor_unavailable'); end if;
 if actor_result->>'status'<>'verified' then return jsonb_build_object('status','actor_invalid'); end if;
 begin actor_id:=(actor_result->>'auth_user_id')::uuid; exception when others then return jsonb_build_object('status','actor_invalid'); end;

 -- Stable lock order: persisted transport identity first, then conversation.
 select count(*) into active_binding_count from public.conversation_transport_bindings b where b.conversation_id=target_conversation_id and b.status='active';
 if active_binding_count<>1 then return jsonb_build_object('status','invalid_state'); end if;
 select i.* into identity_row from public.conversation_transport_identities i
 join public.conversation_transport_bindings b on b.transport_identity_id=i.id
 where b.conversation_id=target_conversation_id and b.status='active';
 if not found then return jsonb_build_object('status','invalid_state'); end if;
 select * into identity_row from public.conversation_transport_identities where id=identity_row.id for update;
 select * into conversation_row from public.conversations where id=target_conversation_id for update;
 if not found or identity_row.status<>'active' or conversation_row.status<>'open' then return jsonb_build_object('status','invalid_state'); end if;
 select * into binding_row from public.conversation_transport_bindings
 where transport_identity_id=identity_row.id and status='active' for update;
 if not found or binding_row.conversation_id<>conversation_row.id then return jsonb_build_object('status','invalid_state'); end if;

 if identity_row.customer_id is not null and conversation_row.customer_id is not null
   and identity_row.customer_id<>conversation_row.customer_id then raise exception 'foundation_conflict'; end if;
 if identity_row.customer_id is not null then
   select * into customer_row from public.customers where id=identity_row.customer_id and deleted_at is null for update;
   if not found then raise exception 'foundation_conflict'; end if;
 elsif conversation_row.customer_id is not null then
   select * into customer_row from public.customers where id=conversation_row.customer_id and deleted_at is null for update;
   if not found then raise exception 'foundation_conflict'; end if;
 else
   insert into public.customers(first_name,last_name,email,phone,created_by)
   values(null,null,null,null,actor_id) returning * into customer_row;
   customer_created:=true; changed:=true;
   insert into public.audit_log(actor_id,entity_type,entity_id,action,metadata)
   values(actor_id,'customer',customer_row.id,'first_contact_customer_created',jsonb_build_object('customer_id',customer_row.id,'result_code','created'));
 end if;
 if identity_row.customer_id is null then update public.conversation_transport_identities set customer_id=customer_row.id where id=identity_row.id; changed:=true;
 elsif identity_row.customer_id<>customer_row.id then raise exception 'foundation_conflict'; end if;
 if conversation_row.customer_id is null then
   perform set_config('app.first_contact_customer_binding','allowed',true);
   update public.conversations set customer_id=customer_row.id where id=conversation_row.id returning * into conversation_row; changed:=true;
 elsif conversation_row.customer_id<>customer_row.id then raise exception 'foundation_conflict'; end if;

 if conversation_row.current_project_id is null then
   insert into public.projects(customer_id,title,created_by)
   values(customer_row.id,'Neue Klimaanfrage',actor_id) returning * into project_row;
   perform set_config('app.conversation_authority_mutation','allowed',true);
   update public.conversations set current_project_id=project_row.id,revision=revision+1 where id=conversation_row.id returning * into conversation_row;
   insert into public.conversation_project_assignments(conversation_id,project_id,assignment_revision,action,actor_id,idempotency_key)
   values(conversation_row.id,project_row.id,conversation_row.revision,'assigned',actor_id,'first-contact-foundation:'||identity_row.id) returning * into assignment_row;
   insert into public.audit_log(actor_id,entity_type,entity_id,action,metadata)
   values(actor_id,'project',project_row.id,'first_contact_project_created',jsonb_build_object('customer_id',customer_row.id,'project_id',project_row.id,'result_code','created')),
         (actor_id,'conversation',conversation_row.id,'conversation_project_assigned',jsonb_build_object('conversation_id',conversation_row.id,'project_id',project_row.id,'revision',conversation_row.revision,'result_code','assigned'));
   changed:=true;
 else
   select * into project_row from public.projects where id=conversation_row.current_project_id and deleted_at is null for update;
   if not found or project_row.customer_id<>customer_row.id then raise exception 'foundation_conflict'; end if;
   select * into assignment_row from public.conversation_project_assignments where conversation_id=conversation_row.id and project_id=project_row.id order by assignment_revision desc limit 1;
   if not found then raise exception 'foundation_conflict'; end if;
 end if;

 insert into public.project_knowledge_states(project_id,current_version,schema_version)
 values(project_row.id,1,1) on conflict(project_id) do nothing returning * into knowledge_row;
 if found then
   changed:=true;
   insert into public.audit_log(actor_id,entity_type,entity_id,action,metadata) values(actor_id,'project_knowledge_state',knowledge_row.id,'knowledge_state_initialized',jsonb_build_object('project_id',project_row.id,'version',1,'result_code','initialized'));
 else select * into knowledge_row from public.project_knowledge_states where project_id=project_row.id for update;
 end if;
 if knowledge_row.current_version<1 or knowledge_row.schema_version<>1 then raise exception 'foundation_conflict'; end if;

 select * into runtime_row from public.conversation_runtime_states where conversation_id=conversation_row.id for update;
 if not found then
   insert into public.conversation_runtime_states(conversation_id,project_id,revision,knowledge_state_version,runtime_status)
   values(conversation_row.id,project_row.id,1,knowledge_row.current_version,'idle') returning * into runtime_row;
   insert into public.conversation_effort_states values(conversation_row.id,project_row.id,0,0,0,null,1);
   insert into public.conversation_runtime_commands(conversation_id,command_type,idempotency_key,expected_revision,result_revision,result_status,actor_id)
   values(conversation_row.id,'initialize','first-contact-foundation:'||identity_row.id,0,1,'completed',actor_id);
   insert into public.audit_log(actor_id,entity_type,entity_id,action,metadata) values(actor_id,'conversation_runtime',conversation_row.id,'conversation_runtime_initialized',jsonb_build_object('conversation_id',conversation_row.id,'project_id',project_row.id,'revision',1,'knowledge_state_version',knowledge_row.current_version,'result_code','initialized'));
   changed:=true;
 elsif runtime_row.project_id<>project_row.id then raise exception 'foundation_conflict';
 end if;

 result_code:=case when customer_created then 'created' when changed then 'partial_completed' else 'already_complete' end;
 insert into public.audit_log(actor_id,entity_type,entity_id,action,metadata)
 values(actor_id,'conversation',conversation_row.id,'first_contact_foundation_completed',jsonb_build_object('conversation_id',conversation_row.id,'customer_id',customer_row.id,'project_id',project_row.id,'conversation_revision',conversation_row.revision,'knowledge_state_version',knowledge_row.current_version,'runtime_revision',runtime_row.revision,'result_code',result_code));
 return jsonb_build_object('status',result_code,'conversation_id',conversation_row.id,'customer_id',customer_row.id,'project_id',project_row.id,'conversation_revision',conversation_row.revision,'knowledge_state_version',knowledge_row.current_version,'runtime_revision',runtime_row.revision,'runtime_status',runtime_row.runtime_status);
exception when others then
 get stacked diagnostics failure_code=message_text;
 if failure_code='foundation_conflict' then return jsonb_build_object('status','conflict'); end if;
 return jsonb_build_object('status','persistence_failure');
end $$;

revoke execute on function public.bootstrap_first_contact_foundation(uuid) from public,anon,authenticated;
grant execute on function public.bootstrap_first_contact_foundation(uuid) to service_role;
comment on function public.bootstrap_first_contact_foundation(uuid) is 'Atomic service-only foundation from persisted conversation identity; no PII, prompt, answer, planner or delivery side effects.';
