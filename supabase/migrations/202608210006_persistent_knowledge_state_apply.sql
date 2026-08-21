-- AP-15-05-03-03-03-01: project-scoped knowledge authority and reviewed descriptive apply.
-- Knowledge is project scoped. No conversation identifier or storage locator is persisted here.
create table public.project_knowledge_states (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null unique references public.projects(id) on delete restrict,
  current_version integer not null default 1 check (current_version > 0),
  schema_version integer not null default 1 check (schema_version = 1),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  constraint project_knowledge_state_project_identity_key unique(project_id,id)
);
create trigger project_knowledge_states_updated before update on public.project_knowledge_states
  for each row execute function public.set_updated_at();

alter table public.evidence_claim_reviews add constraint evidence_claim_review_project_identity_key unique(project_id,id);

create table public.project_knowledge_state_transitions (
  id uuid primary key default gen_random_uuid(), knowledge_state_id uuid not null, project_id uuid not null,
  proposal_id uuid not null unique, review_id uuid not null,
  expected_state_version integer not null check(expected_state_version>0),
  resulting_state_version integer not null check(resulting_state_version>0),
  transition_type text not null check(transition_type='claim_created'),
  result_code text not null check(result_code in ('applied','no_change')),
  idempotency_key text not null unique, actor_id uuid not null references auth.users(id) on delete restrict,
  applied_at timestamptz not null default statement_timestamp(), created_at timestamptz not null default now(),
  constraint knowledge_transition_state_fkey foreign key(project_id,knowledge_state_id) references public.project_knowledge_states(project_id,id) on delete restrict,
  constraint knowledge_transition_proposal_fkey foreign key(project_id,proposal_id) references public.evidence_claim_proposals(project_id,id) on delete restrict,
  constraint knowledge_transition_review_fkey foreign key(project_id,review_id) references public.evidence_claim_reviews(project_id,id) on delete restrict
);

create table public.project_knowledge_claims (
  claim_id uuid primary key default gen_random_uuid(), knowledge_state_id uuid not null, project_id uuid not null,
  entity_id uuid not null, entity_type text not null check(entity_type in ('project','room','installation')),
  property_key text not null check(property_key in ('room_overview_context_observed','indoor_installation_area_observed','outdoor_installation_area_observed','line_route_context_observed','wall_penetration_context_observed')),
  value_type text not null check(value_type in ('string','number','boolean','unknown')),
  value_text text, value_number numeric, value_boolean boolean,
  epistemic_status text not null check(epistemic_status in ('confirmed','reported','observed','estimated','assumed','unknown','not_applicable','contradicted','requires_site_check')),
  knowledge_strength text check(knowledge_strength in ('observed','descriptive_fact','technical_hypothesis','technical_assessment','reviewer_approved','site_verified')),
  supersedes_claim_id uuid, source_transition_id uuid not null, claim_state_version integer not null check(claim_state_version>1),
  created_at timestamptz not null default statement_timestamp(),
  constraint knowledge_claim_state_fkey foreign key(project_id,knowledge_state_id) references public.project_knowledge_states(project_id,id) on delete restrict,
  constraint knowledge_claim_transition_fkey foreign key(source_transition_id) references public.project_knowledge_state_transitions(id) on delete restrict,
  constraint knowledge_claim_typed_value_check check(
    (value_type='string' and value_text is not null and value_number is null and value_boolean is null) or
    (value_type='number' and value_text is null and value_number is not null and value_boolean is null) or
    (value_type='boolean' and value_text is null and value_number is null and value_boolean is not null) or
    (value_type='unknown' and value_text is null and value_number is null and value_boolean is null and epistemic_status in ('unknown','not_applicable','requires_site_check'))
  ),
  constraint knowledge_claim_descriptive_shape_check check(
    property_key not in ('room_overview_context_observed','indoor_installation_area_observed','outdoor_installation_area_observed','line_route_context_observed','wall_penetration_context_observed')
    or (value_type='boolean' and value_boolean is true and epistemic_status='observed' and knowledge_strength='descriptive_fact')
  ),
  constraint knowledge_claim_project_identity_key unique(project_id,knowledge_state_id,claim_id),
  constraint knowledge_claim_supersession_fkey foreign key(project_id,knowledge_state_id,supersedes_claim_id)
    references public.project_knowledge_claims(project_id,knowledge_state_id,claim_id) on delete restrict
);
create index project_knowledge_claims_state_version_idx on public.project_knowledge_claims(knowledge_state_id,claim_state_version);

create table public.project_knowledge_claim_evidence (
  id uuid primary key default gen_random_uuid(), claim_id uuid not null, knowledge_state_id uuid not null,
  project_id uuid not null, evidence_id uuid not null,
  source_type text not null check(source_type='project_evidence'),
  actor_class text not null check(actor_class in ('admin','reviewer','ai')),
  evidence_status text not null check(evidence_status in ('active','superseded','invalidated','manually_confirmed','manually_corrected')),
  observed_at timestamptz not null, created_at timestamptz not null default now(),
  constraint knowledge_claim_evidence_claim_fkey foreign key(project_id,knowledge_state_id,claim_id)
    references public.project_knowledge_claims(project_id,knowledge_state_id,claim_id) on delete restrict,
  constraint knowledge_claim_evidence_source_fkey foreign key(project_id,evidence_id)
    references public.project_evidence(project_id,id) on delete restrict,
  constraint knowledge_claim_evidence_unique unique(claim_id,evidence_id)
);

create function public.prevent_knowledge_append_only_mutation() returns trigger language plpgsql
set search_path=public,pg_temp as $$ begin raise exception 'knowledge_history_append_only'; end $$;
create trigger project_knowledge_claims_append_only before update or delete on public.project_knowledge_claims
  for each row execute function public.prevent_knowledge_append_only_mutation();
create trigger project_knowledge_claim_evidence_append_only before update or delete on public.project_knowledge_claim_evidence
  for each row execute function public.prevent_knowledge_append_only_mutation();
create trigger project_knowledge_transitions_append_only before update or delete on public.project_knowledge_state_transitions
  for each row execute function public.prevent_knowledge_append_only_mutation();

alter table public.project_knowledge_states enable row level security;
alter table public.project_knowledge_claims enable row level security;
alter table public.project_knowledge_claim_evidence enable row level security;
alter table public.project_knowledge_state_transitions enable row level security;
revoke all on public.project_knowledge_states,public.project_knowledge_claims,public.project_knowledge_claim_evidence,public.project_knowledge_state_transitions from public,anon,authenticated;
grant select on public.project_knowledge_states,public.project_knowledge_claims,public.project_knowledge_claim_evidence,public.project_knowledge_state_transitions to authenticated;
create policy "knowledge state admin project read" on public.project_knowledge_states for select to authenticated using(auth.uid() is not null and public.current_app_role()='admin' and exists(select 1 from public.projects p where p.id=project_id and p.deleted_at is null));
create policy "knowledge claims admin project read" on public.project_knowledge_claims for select to authenticated using(auth.uid() is not null and public.current_app_role()='admin' and exists(select 1 from public.projects p where p.id=project_id and p.deleted_at is null));
create policy "knowledge evidence admin project read" on public.project_knowledge_claim_evidence for select to authenticated using(auth.uid() is not null and public.current_app_role()='admin' and exists(select 1 from public.projects p where p.id=project_id and p.deleted_at is null));
create policy "knowledge transitions admin project read" on public.project_knowledge_state_transitions for select to authenticated using(auth.uid() is not null and public.current_app_role()='admin' and exists(select 1 from public.projects p where p.id=project_id and p.deleted_at is null));

-- The RPC accepts only proposal identity/revision and state CAS. Claim, review, evidence and actor are reconstructed under locks.
create function public.apply_reviewed_descriptive_claim(target_proposal_id uuid,expected_proposal_revision integer,expected_state_version integer)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare p public.evidence_claim_proposals%rowtype; r public.evidence_claim_reviews%rowtype; o public.evidence_observations%rowtype;
 e public.project_evidence%rowtype; m public.project_media%rowtype; lc public.project_media_lifecycle%rowtype;
 s public.project_knowledge_states%rowtype; t public.project_knowledge_state_transitions%rowtype; c public.project_knowledge_claims%rowtype;
 idem text; result text; next_version integer; initialized boolean:=false; expected_observation text; expected_target text; failure_code text;
begin
 if auth.uid() is null or public.current_app_role()<>'admin' then raise exception 'unauthorized'; end if;
 if target_proposal_id is null or expected_proposal_revision is null or expected_proposal_revision<1 or expected_state_version is null or expected_state_version<1 then raise exception 'invalid_input'; end if;
 select * into p from public.evidence_claim_proposals where id=target_proposal_id for update;
 if not found then raise exception 'proposal_not_found'; end if;
 select * into t from public.project_knowledge_state_transitions where proposal_id=p.id;
 if found then return jsonb_build_object('transition_id',t.id,'proposal_id',t.proposal_id,'claim_id',(select claim_id from public.project_knowledge_claims where source_transition_id=t.id),'result',t.result_code,'retry_class','terminal','previous_state_version',t.expected_state_version,'current_state_version',t.resulting_state_version,'replayed',true); end if;
 if p.status<>'approved_apply_pending' then raise exception 'proposal_not_applyable'; end if;
 if p.revision<>expected_proposal_revision then raise exception 'stale_proposal'; end if;
 select * into r from public.evidence_claim_reviews where project_id=p.project_id and proposal_id=p.id and review_action='approve' and result_code='apply_pending' and proposal_revision=p.revision-1 order by reviewed_at desc limit 1 for update;
 if not found or r.review_actor_class<>'admin' then raise exception 'approval_review_missing'; end if;
 select * into o from public.evidence_observations where project_id=p.project_id and evidence_id=p.evidence_id and interpretation_run_id=p.interpretation_run_id and id=p.observation_id for update;
 if not found or o.status<>'recorded' then raise exception 'observation_invalidated'; end if;
 if o.value_kind<>'visibility' or o.value_text<>'visible' or o.evidence_quality<>'sufficient_for_observation' or o.interpretation_status<>'observed' then raise exception 'evidence_invalid'; end if;
 select * into e from public.project_evidence where project_id=p.project_id and id=p.evidence_id and binding_status='bound' for update;
 if not found then raise exception 'evidence_invalid'; end if;
 select * into m from public.project_media where project_id=e.project_id and id=e.project_media_id for update;
 select * into lc from public.project_media_lifecycle where project_id=e.project_id and project_media_id=e.project_media_id for update;
 if m.id is null or lc.id is null or m.upload_status<>'ready' or m.physical_state<>'present' or m.deleted_at is not null or lc.deletion_execution_state<>'idle' or exists(select 1 from public.project_evidence_tombstones x where x.project_id=e.project_id and x.evidence_id=e.id) then raise exception 'source_media_unavailable'; end if;
 expected_target:=case p.property_key when 'room_overview_context_observed' then 'room_overview' when 'indoor_installation_area_observed' then 'indoor_area_overview' when 'outdoor_installation_area_observed' then 'outdoor_area_overview' else 'line_route_context' end;
 expected_observation:=case p.property_key when 'room_overview_context_observed' then 'room_overview_visible' when 'indoor_installation_area_observed' then 'indoor_area_visible' when 'outdoor_installation_area_observed' then 'outdoor_area_visible' when 'line_route_context_observed' then 'line_route_context_visible' when 'wall_penetration_context_observed' then 'wall_penetration_context_visible' end;
 if expected_observation is null or e.evidence_target<>expected_target or o.observation_type<>expected_observation or p.value_type<>'boolean' or p.value_boolean is distinct from true or p.epistemic_status<>'observed' or p.knowledge_strength<>'descriptive_fact' then raise exception 'evidence_invalid'; end if;
 insert into public.project_knowledge_states(project_id,current_version,schema_version) values(p.project_id,1,1) on conflict(project_id) do nothing returning * into s;
 if found then initialized:=true; else select * into s from public.project_knowledge_states where project_id=p.project_id for update; end if;
 if s.current_version<>expected_state_version then raise exception 'stale_state'; end if;
 idem:=concat_ws(':','apply-v1',p.project_id,s.id,p.id,p.revision,r.id,expected_state_version);
 if exists(select 1 from public.project_knowledge_claims old where old.knowledge_state_id=s.id and old.entity_type=p.entity_type and old.entity_id=p.entity_id and old.property_key=p.property_key and not exists(select 1 from public.project_knowledge_claims newer where newer.supersedes_claim_id=old.claim_id) and exists(select 1 from public.project_knowledge_claim_evidence ce where ce.claim_id=old.claim_id and ce.evidence_status not in ('superseded','invalidated')) and not(old.value_type='boolean' and old.value_boolean=true and old.epistemic_status='observed' and old.knowledge_strength='descriptive_fact')) then raise exception 'reviewer_protection'; end if;
 result:=case when exists(select 1 from public.project_knowledge_claims old where old.knowledge_state_id=s.id and old.entity_type=p.entity_type and old.entity_id=p.entity_id and old.property_key=p.property_key and old.value_type='boolean' and old.value_boolean=true and old.epistemic_status='observed' and old.knowledge_strength='descriptive_fact' and not exists(select 1 from public.project_knowledge_claims newer where newer.supersedes_claim_id=old.claim_id) and exists(select 1 from public.project_knowledge_claim_evidence ce where ce.claim_id=old.claim_id and ce.evidence_status not in ('superseded','invalidated'))) then 'no_change' else 'applied' end;
 next_version:=case when result='applied' then s.current_version+1 else s.current_version end;
 insert into public.project_knowledge_state_transitions(knowledge_state_id,project_id,proposal_id,review_id,expected_state_version,resulting_state_version,transition_type,result_code,idempotency_key,actor_id)
 values(s.id,p.project_id,p.id,r.id,s.current_version,next_version,'claim_created',result,idem,auth.uid()) returning * into t;
 if result='applied' then
  insert into public.project_knowledge_claims(knowledge_state_id,project_id,entity_id,entity_type,property_key,value_type,value_boolean,epistemic_status,knowledge_strength,source_transition_id,claim_state_version)
  values(s.id,p.project_id,p.entity_id,p.entity_type,p.property_key,p.value_type,p.value_boolean,p.epistemic_status,p.knowledge_strength,t.id,next_version) returning * into c;
  insert into public.project_knowledge_claim_evidence(claim_id,knowledge_state_id,project_id,evidence_id,source_type,actor_class,evidence_status,observed_at) values(c.claim_id,s.id,p.project_id,e.id,'project_evidence',o.actor_class,'active',o.observed_at);
  update public.project_knowledge_states set current_version=next_version where id=s.id;
 end if;
 update public.evidence_claim_proposals set status='applied',revision=revision+1 where id=p.id;
 if initialized then insert into public.audit_log(actor_id,entity_type,entity_id,action,metadata) values(auth.uid(),'project_knowledge_state',s.id,'knowledge_state_initialized',jsonb_build_object('actor_id',auth.uid(),'project_id',p.project_id,'proposal_id',p.id,'review_id',r.id,'transition_id',t.id,'version_before',1,'version_after',1,'result','initialized','timestamp',t.applied_at)); end if;
 insert into public.audit_log(actor_id,entity_type,entity_id,action,metadata) values(auth.uid(),'project_knowledge_transition',t.id,case when result='applied' then 'knowledge_claim_applied' else 'knowledge_claim_no_change' end,jsonb_build_object('actor_id',auth.uid(),'project_id',p.project_id,'proposal_id',p.id,'review_id',r.id,'claim_id',c.claim_id,'transition_id',t.id,'version_before',s.current_version,'version_after',next_version,'result',result,'timestamp',t.applied_at));
 return jsonb_build_object('transition_id',t.id,'proposal_id',p.id,'claim_id',c.claim_id,'result',result,'retry_class','terminal','previous_state_version',s.current_version,'current_state_version',next_version,'replayed',false);
exception when others then
 -- Entering this handler rolls back every write in the protected block. Only the sanitized failure audit remains.
 get stacked diagnostics failure_code=message_text;
 if auth.uid() is not null and p.id is not null then
  insert into public.audit_log(actor_id,entity_type,entity_id,action,metadata) values(auth.uid(),'evidence_claim_proposal',p.id,'reviewed_claim_apply_failed',jsonb_build_object('actor_id',auth.uid(),'project_id',p.project_id,'proposal_id',p.id,'review_id',r.id,'claim_id',null,'transition_id',null,'version_before',expected_state_version,'version_after',expected_state_version,'result',failure_code,'timestamp',statement_timestamp()));
 end if;
 return jsonb_build_object('success',false,'code',failure_code,'retry_class',case when failure_code='stale_state' then 'requires_replan' when failure_code in ('reviewer_protection','contradiction_requires_review') then 'requires_review' when failure_code='persistence_failed' then 'retryable' else 'terminal' end);
end $$;
revoke all on function public.apply_reviewed_descriptive_claim(uuid,integer,integer) from public,anon;
grant execute on function public.apply_reviewed_descriptive_claim(uuid,integer,integer) to authenticated;

comment on table public.project_knowledge_states is 'Project-scoped knowledge authority; current state is reconstructed from append-only claims.';
comment on table public.project_knowledge_claims is 'Append-only typed knowledge claims; no conversation identity and no storage details.';
comment on table public.project_knowledge_claim_evidence is 'Relational project_evidence provenance only; locator-free and append-only.';
comment on table public.project_knowledge_state_transitions is 'Terminal CAS/idempotency application records, distinct from audit_log.';
