-- Global operator-approved KlimaGuy knowledge. Deliberately independent from all project-scoped knowledge/evidence tables.
create table public.klimaguy_knowledge_entries (
  id uuid primary key default gen_random_uuid(),
  category text not null check (category in ('customer_communication','qualification_behavior','photo_guidance','human_handoff','hvac_practice')),
  title text not null check (title=btrim(title) and char_length(title) between 3 and 120),
  guidance text not null check (guidance=btrim(guidance) and char_length(guidance) between 10 and 800),
  priority integer not null default 50 check (priority between 0 and 100),
  status text not null default 'active' check (status in ('active','archived')),
  source_type text not null check (source_type in ('manual','learning_candidate')),
  revision integer not null default 1 check (revision > 0),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default statement_timestamp(), updated_at timestamptz not null default statement_timestamp()
);

create table public.klimaguy_learning_candidates (
  id uuid primary key default gen_random_uuid(),
  category text not null check (category in ('customer_communication','qualification_behavior','photo_guidance','human_handoff','hvac_practice')),
  title text not null check (title=btrim(title) and char_length(title) between 3 and 120),
  proposed_guidance text not null check (proposed_guidance=btrim(proposed_guidance) and char_length(proposed_guidance) between 10 and 800),
  rationale text not null check (rationale=btrim(rationale) and char_length(rationale) between 10 and 600),
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  occurrence_count integer not null default 1 check (occurrence_count > 0), fingerprint text not null check (fingerprint ~ '^[0-9a-f]{64}$'),
  source_turn_id uuid not null references public.mvp_ai_turns(id) on delete restrict,
  source_project_id uuid not null references public.projects(id) on delete restrict,
  source_conversation_id uuid not null references public.conversations(id) on delete restrict,
  source_inbound_message_id uuid not null references public.conversation_messages(id) on delete restrict,
  source_outbound_message_id uuid not null references public.conversation_messages(id) on delete restrict,
  revision integer not null default 1 check (revision > 0),
  reviewed_by uuid references auth.users(id) on delete set null, reviewed_at timestamptz,
  promoted_knowledge_entry_id uuid references public.klimaguy_knowledge_entries(id) on delete restrict,
  created_at timestamptz not null default statement_timestamp(), updated_at timestamptz not null default statement_timestamp(),
  check ((status='pending' and reviewed_by is null and reviewed_at is null and promoted_knowledge_entry_id is null) or
         (status='approved' and reviewed_by is not null and reviewed_at is not null and promoted_knowledge_entry_id is not null) or
         (status='rejected' and reviewed_by is not null and reviewed_at is not null and promoted_knowledge_entry_id is null))
);
create unique index klimaguy_learning_pending_fingerprint on public.klimaguy_learning_candidates(fingerprint) where status='pending';
create index klimaguy_knowledge_runtime on public.klimaguy_knowledge_entries(priority desc,updated_at desc,id) where status='active';
create index klimaguy_learning_inbox on public.klimaguy_learning_candidates(updated_at desc) where status='pending';
create trigger klimaguy_knowledge_entries_updated before update on public.klimaguy_knowledge_entries for each row execute function public.set_updated_at();
create trigger klimaguy_learning_candidates_updated before update on public.klimaguy_learning_candidates for each row execute function public.set_updated_at();

alter table public.klimaguy_knowledge_entries enable row level security;
alter table public.klimaguy_learning_candidates enable row level security;
create policy "admin reads klimaguy knowledge" on public.klimaguy_knowledge_entries for select to authenticated using (auth.uid() is not null and public.current_app_role()='admin');
create policy "admin reads klimaguy learning" on public.klimaguy_learning_candidates for select to authenticated using (auth.uid() is not null and public.current_app_role()='admin');

create function public.create_klimaguy_knowledge_entry(target_category text,target_title text,target_guidance text,target_priority integer)
returns public.klimaguy_knowledge_entries language plpgsql security definer set search_path='' as $$
declare fresh public.klimaguy_knowledge_entries%rowtype;
begin
 if auth.uid() is null or public.current_app_role()<>'admin' then raise exception 'klimaguy_knowledge_forbidden' using errcode='42501'; end if;
 insert into public.klimaguy_knowledge_entries(category,title,guidance,priority,source_type,created_by,updated_by)
 values(target_category,btrim(target_title),btrim(target_guidance),target_priority,'manual',auth.uid(),auth.uid()) returning * into fresh;
 insert into public.audit_log(actor_id,entity_type,entity_id,action,metadata) values(auth.uid(),'klimaguy_knowledge_entry',fresh.id,'klimaguy_knowledge_created',jsonb_build_object('category',fresh.category,'new_revision',fresh.revision));
 return fresh;
end $$;

create function public.update_klimaguy_knowledge_entry(target_id uuid,target_expected_revision integer,target_category text,target_title text,target_guidance text,target_priority integer)
returns public.klimaguy_knowledge_entries language plpgsql security definer set search_path='' as $$
declare old public.klimaguy_knowledge_entries%rowtype; fresh public.klimaguy_knowledge_entries%rowtype; changed text[];
begin
 if auth.uid() is null or public.current_app_role()<>'admin' then raise exception 'klimaguy_knowledge_forbidden' using errcode='42501'; end if;
 select * into old from public.klimaguy_knowledge_entries where id=target_id for update;
 if not found then raise exception 'klimaguy_knowledge_not_found' using errcode='P0002'; end if;
 if old.revision<>target_expected_revision then raise exception 'klimaguy_knowledge_stale' using errcode='40001'; end if;
 changed:=array_remove(array[case when old.category is distinct from target_category then 'category' end,case when old.title is distinct from btrim(target_title) then 'title' end,case when old.guidance is distinct from btrim(target_guidance) then 'guidance' end,case when old.priority is distinct from target_priority then 'priority' end],null);
 update public.klimaguy_knowledge_entries set category=target_category,title=btrim(target_title),guidance=btrim(target_guidance),priority=target_priority,revision=revision+1,updated_by=auth.uid(),updated_at=statement_timestamp() where id=target_id returning * into fresh;
 insert into public.audit_log(actor_id,entity_type,entity_id,action,metadata) values(auth.uid(),'klimaguy_knowledge_entry',fresh.id,'klimaguy_knowledge_updated',jsonb_build_object('previous_revision',old.revision,'new_revision',fresh.revision,'category',fresh.category,'changed_fields',to_jsonb(changed)));
 return fresh;
end $$;

create function public.set_klimaguy_knowledge_entry_status(target_id uuid,target_expected_revision integer,target_status text)
returns public.klimaguy_knowledge_entries language plpgsql security definer set search_path='' as $$
declare old public.klimaguy_knowledge_entries%rowtype; fresh public.klimaguy_knowledge_entries%rowtype; action_name text;
begin
 if auth.uid() is null or public.current_app_role()<>'admin' then raise exception 'klimaguy_knowledge_forbidden' using errcode='42501'; end if;
 if target_status not in ('active','archived') then raise exception 'klimaguy_knowledge_invalid_status' using errcode='22023'; end if;
 select * into old from public.klimaguy_knowledge_entries where id=target_id for update;
 if not found then raise exception 'klimaguy_knowledge_not_found' using errcode='P0002'; end if;
 if old.revision<>target_expected_revision then raise exception 'klimaguy_knowledge_stale' using errcode='40001'; end if;
 if old.status=target_status then return old; end if;
 update public.klimaguy_knowledge_entries set status=target_status,revision=revision+1,updated_by=auth.uid(),updated_at=statement_timestamp() where id=target_id returning * into fresh;
 action_name:=case target_status when 'archived' then 'klimaguy_knowledge_archived' else 'klimaguy_knowledge_reactivated' end;
 insert into public.audit_log(actor_id,entity_type,entity_id,action,metadata) values(auth.uid(),'klimaguy_knowledge_entry',fresh.id,action_name,jsonb_build_object('previous_revision',old.revision,'new_revision',fresh.revision,'category',fresh.category)); return fresh;
end $$;

create function public.record_klimaguy_learning_candidates(target_turn_id uuid,target_candidates jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare turn_row public.mvp_ai_turns%rowtype; item jsonb; fp text; affected integer:=0;
begin
 if auth.role()<>'service_role' then raise exception 'klimaguy_learning_forbidden' using errcode='42501'; end if;
 if jsonb_typeof(target_candidates)<>'array' or jsonb_array_length(target_candidates)>2 then raise exception 'klimaguy_learning_invalid_candidates' using errcode='22023'; end if;
 select * into turn_row from public.mvp_ai_turns where id=target_turn_id and status='completed' and outbound_message_id is not null;
 if not found then raise exception 'klimaguy_learning_turn_not_completed' using errcode='22023'; end if;
 for item in select value from jsonb_array_elements(target_candidates) loop
   if jsonb_typeof(item)<>'object' or item ?& array['category','title','proposed_guidance','rationale']=false or jsonb_object_length(item)<>4
      or item->>'category' not in ('customer_communication','qualification_behavior','photo_guidance','human_handoff','hvac_practice')
      or char_length(btrim(item->>'title')) not between 3 and 120 or char_length(btrim(item->>'proposed_guidance')) not between 10 and 800 or char_length(btrim(item->>'rationale')) not between 10 and 600
   then raise exception 'klimaguy_learning_invalid_candidate' using errcode='22023'; end if;
   fp:=encode(public.digest(convert_to((item->>'category')||E'\n'||lower(regexp_replace(btrim(item->>'proposed_guidance'),'\s+',' ','g')),'UTF8'),'sha256'),'hex');
   insert into public.klimaguy_learning_candidates(category,title,proposed_guidance,rationale,fingerprint,source_turn_id,source_project_id,source_conversation_id,source_inbound_message_id,source_outbound_message_id)
   values(item->>'category',btrim(item->>'title'),btrim(item->>'proposed_guidance'),btrim(item->>'rationale'),fp,turn_row.id,turn_row.project_id,turn_row.conversation_id,turn_row.inbound_message_id,turn_row.outbound_message_id)
   on conflict (fingerprint) where status='pending' do update set occurrence_count=public.klimaguy_learning_candidates.occurrence_count+1,revision=public.klimaguy_learning_candidates.revision+1,source_turn_id=excluded.source_turn_id,source_project_id=excluded.source_project_id,source_conversation_id=excluded.source_conversation_id,source_inbound_message_id=excluded.source_inbound_message_id,source_outbound_message_id=excluded.source_outbound_message_id,updated_at=statement_timestamp(); affected:=affected+1;
 end loop;
 return jsonb_build_object('status','recorded','candidate_count',affected);
end $$;

create function public.review_klimaguy_learning_candidate(target_id uuid,target_expected_revision integer,target_action text,target_category text default null,target_title text default null,target_guidance text default null,target_priority integer default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare candidate public.klimaguy_learning_candidates%rowtype; promoted public.klimaguy_knowledge_entries%rowtype;
begin
 if auth.uid() is null or public.current_app_role()<>'admin' then raise exception 'klimaguy_knowledge_forbidden' using errcode='42501'; end if;
 if target_action not in ('approve','reject') then raise exception 'klimaguy_learning_invalid_action' using errcode='22023'; end if;
 select * into candidate from public.klimaguy_learning_candidates where id=target_id for update;
 if not found then raise exception 'klimaguy_learning_not_found' using errcode='P0002'; end if;
 if candidate.status<>'pending' then raise exception 'klimaguy_learning_already_reviewed' using errcode='22023'; end if;
 if candidate.revision<>target_expected_revision then raise exception 'klimaguy_learning_stale' using errcode='40001'; end if;
 if target_action='approve' then
   insert into public.klimaguy_knowledge_entries(category,title,guidance,priority,status,source_type,created_by,updated_by) values(target_category,btrim(target_title),btrim(target_guidance),target_priority,'active','learning_candidate',auth.uid(),auth.uid()) returning * into promoted;
   update public.klimaguy_learning_candidates set status='approved',reviewed_by=auth.uid(),reviewed_at=statement_timestamp(),promoted_knowledge_entry_id=promoted.id,revision=revision+1,updated_at=statement_timestamp() where id=candidate.id;
   insert into public.audit_log(actor_id,entity_type,entity_id,action,metadata) values(auth.uid(),'klimaguy_learning_candidate',candidate.id,'klimaguy_learning_candidate_approved',jsonb_build_object('candidate_id',candidate.id,'knowledge_entry_id',promoted.id,'previous_revision',candidate.revision,'new_revision',candidate.revision+1,'category',target_category));
   return jsonb_build_object('status','approved','knowledge_entry_id',promoted.id);
 end if;
 update public.klimaguy_learning_candidates set status='rejected',reviewed_by=auth.uid(),reviewed_at=statement_timestamp(),revision=revision+1,updated_at=statement_timestamp() where id=candidate.id;
 insert into public.audit_log(actor_id,entity_type,entity_id,action,metadata) values(auth.uid(),'klimaguy_learning_candidate',candidate.id,'klimaguy_learning_candidate_rejected',jsonb_build_object('candidate_id',candidate.id,'previous_revision',candidate.revision,'new_revision',candidate.revision+1,'category',candidate.category));
 return jsonb_build_object('status','rejected');
end $$;

revoke all on table public.klimaguy_knowledge_entries,public.klimaguy_learning_candidates from public,anon,authenticated;
grant select on table public.klimaguy_knowledge_entries,public.klimaguy_learning_candidates to authenticated;
revoke all on function public.create_klimaguy_knowledge_entry(text,text,text,integer),public.update_klimaguy_knowledge_entry(uuid,integer,text,text,text,integer),public.set_klimaguy_knowledge_entry_status(uuid,integer,text),public.review_klimaguy_learning_candidate(uuid,integer,text,text,text,text,integer) from public,anon;
grant execute on function public.create_klimaguy_knowledge_entry(text,text,text,integer),public.update_klimaguy_knowledge_entry(uuid,integer,text,text,text,integer),public.set_klimaguy_knowledge_entry_status(uuid,integer,text),public.review_klimaguy_learning_candidate(uuid,integer,text,text,text,text,integer) to authenticated;
revoke all on function public.record_klimaguy_learning_candidates(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.record_klimaguy_learning_candidates(uuid,jsonb) to service_role;
