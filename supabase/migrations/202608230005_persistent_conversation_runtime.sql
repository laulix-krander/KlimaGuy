-- AP-16-02: normalized, provider-independent live conversation runtime authority.
create type public.conversation_runtime_status as enum ('idle','awaiting_customer_answer','awaiting_evidence','intermediate_break','human_review','collection_stopped');
create type public.pending_interaction_status as enum ('pending','answered','superseded','cancelled');
create type public.runtime_command_type as enum ('initialize','activate_interaction','answer_interaction','activate_evidence_request','complete_evidence_request','enter_intermediate_break','continue_after_break','enter_human_review');

create table public.conversation_runtime_states (
 conversation_id uuid primary key references public.conversations(id) on delete restrict,
 project_id uuid not null references public.projects(id) on delete restrict,
 revision integer not null check(revision>0), knowledge_state_version integer not null check(knowledge_state_version>0),
 runtime_status public.conversation_runtime_status not null default 'idle',
 active_pending_interaction_id uuid, active_evidence_request_id uuid,
 created_at timestamptz not null default statement_timestamp(), updated_at timestamptz not null default statement_timestamp(),
 check(not(active_pending_interaction_id is not null and active_evidence_request_id is not null)),
 check((runtime_status='awaiting_customer_answer')=(active_pending_interaction_id is not null)),
 check((runtime_status='awaiting_evidence')=(active_evidence_request_id is not null))
);
create trigger conversation_runtime_updated before update on public.conversation_runtime_states for each row execute function public.set_updated_at();

create table public.conversation_pending_interactions (
 id uuid primary key, conversation_id uuid not null references public.conversations(id) on delete restrict,
 project_id uuid not null references public.projects(id) on delete restrict, decision_id uuid not null,
 selected_action_type text not null check(selected_action_type in ('ask_text','ask_yes_no','ask_approximate_number')),
 information_key text not null, entity_type text not null check(entity_type in ('project','room','installation')), entity_id uuid not null,
 template_key text not null check(length(template_key) between 1 and 100), template_version integer not null check(template_version>0),
 locale text not null check(locale='de'), answer_type text not null check(answer_type in ('text','boolean','approximate_number')),
 expected_knowledge_state_version integer not null check(expected_knowledge_state_version>0), runtime_revision integer not null check(runtime_revision>0),
 status public.pending_interaction_status not null default 'pending', answered_by_message_id uuid references public.conversation_messages(id) on delete restrict,
 created_at timestamptz not null default statement_timestamp(), answered_at timestamptz, superseded_at timestamptz, cancelled_at timestamptz,
 check((status='pending' and answered_by_message_id is null and answered_at is null and superseded_at is null and cancelled_at is null)
    or (status='answered' and answered_by_message_id is not null and answered_at is not null and superseded_at is null and cancelled_at is null)
    or (status='superseded' and answered_by_message_id is null and answered_at is null and superseded_at is not null and cancelled_at is null)
    or (status='cancelled' and answered_by_message_id is null and answered_at is null and superseded_at is null and cancelled_at is not null))
);
create unique index one_pending_interaction_per_conversation on public.conversation_pending_interactions(conversation_id) where status='pending';

create table public.conversation_information_collection (
 conversation_id uuid not null references public.conversations(id) on delete restrict, project_id uuid not null references public.projects(id) on delete restrict,
 information_key text not null, entity_type text not null check(entity_type in ('project','room','installation')), entity_id uuid not null,
 collection_status text not null check(collection_status in ('not_asked','asked','answered','customer_does_not_know','customer_cannot_provide','skipped','deferred','requires_additional_evidence','requires_site_check','resolved')),
 last_answer_meaning text not null check(last_answer_meaning in ('technical_true','technical_false','customer_knows','customer_does_not_know','customer_can_provide','customer_cannot_provide','reported_value','leave_information_open','defer_collection','requires_additional_evidence')),
 attempts integer not null check(attempts between 0 and 2), evidence_requirement text not null check(evidence_requirement in ('none','additional_evidence','site_check')),
 revisit_status text not null check(revisit_status in ('not_required','allowed','deferred','exhausted')), dependency_signature jsonb,
 last_collection_path text, last_gain_reason text, collection_version integer not null check(collection_version>=0), runtime_revision integer not null check(runtime_revision>0), updated_at timestamptz not null default statement_timestamp(),
 primary key(conversation_id,information_key,entity_type,entity_id), check(dependency_signature is null or jsonb_typeof(dependency_signature)='object')
);
create table public.conversation_retry_states (
 conversation_id uuid not null references public.conversations(id) on delete restrict, project_id uuid not null references public.projects(id) on delete restrict,
 information_key text not null, entity_type text not null check(entity_type in ('project','room','installation')), entity_id uuid not null,
 attempts integer not null check(attempts between 0 and 2), last_outcome text not null check(last_outcome in ('answered','unknown','skipped','invalid','ignored','superseded')),
 maximum_attempts integer not null default 2 check(maximum_attempts=2), last_attempt_at timestamptz, runtime_revision integer not null check(runtime_revision>0),
 primary key(conversation_id,information_key,entity_type,entity_id)
);
create table public.conversation_effort_states (
 conversation_id uuid primary key references public.conversations(id) on delete restrict, project_id uuid not null references public.projects(id) on delete restrict,
 consecutive_technical_questions integer not null check(consecutive_technical_questions>=0), unanswered_questions integer not null check(unanswered_questions>=0), repeated_questions integer not null check(repeated_questions>=0),
 last_break_at timestamptz, runtime_revision integer not null check(runtime_revision>0)
);
create table public.conversation_evidence_request_states (
 request_id uuid primary key, conversation_id uuid not null references public.conversations(id) on delete restrict, project_id uuid not null references public.projects(id) on delete restrict,
 target_key text not null, bundle_key text, status text not null check(status in ('planned','requested','provided','skipped','declined','superseded','cancelled')),
 requested_information_keys text[] not null check(cardinality(requested_information_keys)>0), purpose_codes text[] not null check(cardinality(purpose_codes)>0), required_views text[] not null check(cardinality(required_views)>0),
 minimum_count integer not null check(minimum_count>0), maximum_count integer not null check(maximum_count>=minimum_count), attempts integer not null check(attempts between 1 and 2),
 requested_at timestamptz not null, resolved_at timestamptz, resolved_by_message_id uuid references public.conversation_messages(id) on delete restrict,
 evidence_revision integer not null check(evidence_revision>=0), runtime_revision integer not null check(runtime_revision>0), created_at timestamptz not null default statement_timestamp(), updated_at timestamptz not null default statement_timestamp(),
 check((status in ('planned','requested') and resolved_at is null) or (status not in ('planned','requested') and resolved_at is not null))
);
create unique index one_active_evidence_request_per_conversation on public.conversation_evidence_request_states(conversation_id) where status='requested';
create trigger conversation_evidence_runtime_updated before update on public.conversation_evidence_request_states for each row execute function public.set_updated_at();

create table public.conversation_runtime_commands (
 id uuid primary key default gen_random_uuid(), conversation_id uuid not null references public.conversations(id) on delete restrict,
 command_type public.runtime_command_type not null, idempotency_key text not null check(length(idempotency_key) between 8 and 128),
 expected_revision integer not null check(expected_revision>=0), result_revision integer not null check(result_revision>0), result_status text not null check(result_status in ('completed','no_change')),
 actor_id uuid not null references auth.users(id) on delete restrict, created_at timestamptz not null default statement_timestamp(), unique(conversation_id,idempotency_key)
);

alter table public.conversation_runtime_states add constraint runtime_active_pending_fk foreign key(active_pending_interaction_id) references public.conversation_pending_interactions(id) on delete restrict deferrable initially deferred;
alter table public.conversation_runtime_states add constraint runtime_active_evidence_fk foreign key(active_evidence_request_id) references public.conversation_evidence_request_states(request_id) on delete restrict deferrable initially deferred;

create function public.guard_runtime_identity() returns trigger language plpgsql set search_path=public,pg_temp as $$ begin
 if tg_table_name='conversation_pending_interactions' and (new.conversation_id<>old.conversation_id or new.project_id<>old.project_id or new.decision_id<>old.decision_id or new.selected_action_type<>old.selected_action_type or new.information_key<>old.information_key or new.entity_type<>old.entity_type or new.entity_id<>old.entity_id or new.template_key<>old.template_key or new.template_version<>old.template_version or new.answer_type<>old.answer_type or new.expected_knowledge_state_version<>old.expected_knowledge_state_version or new.runtime_revision<>old.runtime_revision) then raise exception 'pending_interaction_identity_immutable'; end if;
 if coalesce(current_setting('app.runtime_authority_mutation',true),'')<>'allowed' then raise exception 'runtime_mutation_requires_authority'; end if; return new; end $$;
create trigger pending_interaction_guard before update or delete on public.conversation_pending_interactions for each row execute function public.guard_runtime_identity();
create trigger runtime_header_guard before update or delete on public.conversation_runtime_states for each row execute function public.guard_runtime_identity();
create trigger runtime_commands_append_only before update or delete on public.conversation_runtime_commands for each row execute function public.reject_append_only_change();

create function public.initialize_conversation_runtime(target_conversation_id uuid,target_idempotency_key text) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare c public.conversations%rowtype; r public.conversation_runtime_states%rowtype; k integer; cmd public.conversation_runtime_commands%rowtype; begin perform public.assert_conversation_admin();
 select * into c from public.conversations where id=target_conversation_id for update; if not found then raise exception 'conversation_not_found'; end if; if c.current_project_id is null then raise exception 'runtime_requires_project'; end if;
 select * into r from public.conversation_runtime_states where conversation_id=c.id for update; if found then return jsonb_build_object('conversation_id',r.conversation_id,'project_id',r.project_id,'revision',r.revision,'knowledge_state_version',r.knowledge_state_version,'runtime_status',r.runtime_status,'active_pending_interaction_id',r.active_pending_interaction_id,'active_evidence_request_id',r.active_evidence_request_id,'created_at',r.created_at,'updated_at',r.updated_at); end if;
 select current_version into k from public.project_knowledge_states where project_id=c.current_project_id for update; if k is null then raise exception 'knowledge_state_not_initialized'; end if;
 insert into public.conversation_runtime_states(conversation_id,project_id,revision,knowledge_state_version,runtime_status) values(c.id,c.current_project_id,1,k,case when c.status='human_review' then 'human_review'::public.conversation_runtime_status else 'idle'::public.conversation_runtime_status end) returning * into r;
 insert into public.conversation_effort_states values(c.id,c.current_project_id,0,0,0,null,1);
 insert into public.conversation_runtime_commands(conversation_id,command_type,idempotency_key,expected_revision,result_revision,result_status,actor_id) values(c.id,'initialize',target_idempotency_key,0,1,'completed',auth.uid());
 insert into public.audit_log(actor_id,entity_type,entity_id,action,metadata) values(auth.uid(),'conversation_runtime',c.id,'conversation_runtime_initialized',jsonb_build_object('conversation_id',c.id,'project_id',c.current_project_id,'revision',1,'knowledge_state_version',k));
 return jsonb_build_object('conversation_id',r.conversation_id,'project_id',r.project_id,'revision',r.revision,'knowledge_state_version',r.knowledge_state_version,'runtime_status',r.runtime_status,'active_pending_interaction_id',null,'active_evidence_request_id',null,'created_at',r.created_at,'updated_at',r.updated_at); end $$;

-- Message binding is checked in the controlled answer/complete command, and additionally here for all direct authority paths.
create function public.guard_runtime_message_binding() returns trigger language plpgsql set search_path=public,pg_temp as $$ declare cid uuid; begin
 if tg_table_name='conversation_pending_interactions' then if new.answered_by_message_id is not null then select conversation_id into cid from public.conversation_messages where id=new.answered_by_message_id; if cid is null or cid<>new.conversation_id then raise exception 'answer_message_conversation_mismatch'; end if; end if;
 elsif tg_table_name='conversation_evidence_request_states' then if new.resolved_by_message_id is not null then select conversation_id into cid from public.conversation_messages where id=new.resolved_by_message_id; if cid is null or cid<>new.conversation_id then raise exception 'evidence_message_conversation_mismatch'; end if; end if; end if; return new; end $$;
create trigger pending_message_binding before insert or update on public.conversation_pending_interactions for each row execute function public.guard_runtime_message_binding();
create trigger evidence_message_binding before insert or update on public.conversation_evidence_request_states for each row execute function public.guard_runtime_message_binding();

alter table public.conversation_runtime_states enable row level security; alter table public.conversation_pending_interactions enable row level security; alter table public.conversation_information_collection enable row level security; alter table public.conversation_retry_states enable row level security; alter table public.conversation_effort_states enable row level security; alter table public.conversation_evidence_request_states enable row level security; alter table public.conversation_runtime_commands enable row level security;
revoke all on public.conversation_runtime_states,public.conversation_pending_interactions,public.conversation_information_collection,public.conversation_retry_states,public.conversation_effort_states,public.conversation_evidence_request_states,public.conversation_runtime_commands from public,anon,authenticated;
grant select on public.conversation_runtime_states,public.conversation_pending_interactions,public.conversation_information_collection,public.conversation_retry_states,public.conversation_effort_states,public.conversation_evidence_request_states to authenticated;
create policy "runtime project staff read" on public.conversation_runtime_states for select to authenticated using(auth.uid() is not null and public.current_app_role() in ('admin','reviewer') and project_id is not null);
create policy "pending project staff read" on public.conversation_pending_interactions for select to authenticated using(exists(select 1 from public.conversation_runtime_states r where r.conversation_id=conversation_id and auth.uid() is not null and public.current_app_role() in ('admin','reviewer')));
create policy "collection project staff read" on public.conversation_information_collection for select to authenticated using(exists(select 1 from public.conversation_runtime_states r where r.conversation_id=conversation_id and auth.uid() is not null and public.current_app_role() in ('admin','reviewer')));
create policy "retry project staff read" on public.conversation_retry_states for select to authenticated using(exists(select 1 from public.conversation_runtime_states r where r.conversation_id=conversation_id and auth.uid() is not null and public.current_app_role() in ('admin','reviewer')));
create policy "effort project staff read" on public.conversation_effort_states for select to authenticated using(exists(select 1 from public.conversation_runtime_states r where r.conversation_id=conversation_id and auth.uid() is not null and public.current_app_role() in ('admin','reviewer')));
create policy "evidence runtime project staff read" on public.conversation_evidence_request_states for select to authenticated using(exists(select 1 from public.conversation_runtime_states r where r.conversation_id=conversation_id and auth.uid() is not null and public.current_app_role() in ('admin','reviewer')));
revoke all on function public.initialize_conversation_runtime(uuid,text) from public,anon,authenticated; grant execute on function public.initialize_conversation_runtime(uuid,text) to authenticated;
comment on table public.conversation_runtime_states is 'Conversation-scoped live runtime header; binds project Knowledge version and contains no messages, PII, provider data, or free runtime payload.';
comment on table public.conversation_runtime_commands is 'Internal idempotency/CAS ledger. Runtime mutation remains available only through closed authority commands.';
create function public.get_conversation_runtime(target_conversation_id uuid) returns jsonb language sql security definer set search_path=public,pg_temp as $$
 select jsonb_build_object(
  'runtime',to_jsonb(r),
  'pending_interaction',(select to_jsonb(p) from public.conversation_pending_interactions p where p.id=r.active_pending_interaction_id),
  'collection',coalesce((select jsonb_agg(jsonb_build_object('conversation_id',i.conversation_id,'project_id',i.project_id,'runtime_revision',i.runtime_revision,'collection_version',i.collection_version,'item',jsonb_build_object('information_key',i.information_key,'entity_type',i.entity_type,'entity_id',i.entity_id,'collection_status',i.collection_status,'last_answer_meaning',i.last_answer_meaning,'attempts',i.attempts,'evidence_requirement',i.evidence_requirement,'revisit_status',i.revisit_status,'last_dependency_signature',i.dependency_signature,'last_collection_path',i.last_collection_path,'last_gain_reason',i.last_gain_reason,'updated_at',i.updated_at))) from public.conversation_information_collection i where i.conversation_id=r.conversation_id),'[]'::jsonb),
  'retry',coalesce((select jsonb_agg(jsonb_build_object('conversation_id',s.conversation_id,'project_id',s.project_id,'runtime_revision',s.runtime_revision,'item',jsonb_build_object('information_key',s.information_key,'entity_type',s.entity_type,'entity_id',s.entity_id,'attempts',s.attempts,'last_outcome',s.last_outcome,'last_attempt_at',s.last_attempt_at))) from public.conversation_retry_states s where s.conversation_id=r.conversation_id),'[]'::jsonb),
  'effort',(select to_jsonb(e) from public.conversation_effort_states e where e.conversation_id=r.conversation_id),
  'evidence_requests',coalesce((select jsonb_agg(to_jsonb(e)) from public.conversation_evidence_request_states e where e.conversation_id=r.conversation_id),'[]'::jsonb)
 ) from public.conversation_runtime_states r where r.conversation_id=target_conversation_id and auth.uid() is not null and public.current_app_role() in ('admin','reviewer')
$$;
revoke all on function public.get_conversation_runtime(uuid) from public,anon; grant execute on function public.get_conversation_runtime(uuid) to authenticated;
