-- AP-15-05-03-03-02: persistent typed proposals and append-only human review.
alter table public.evidence_observations add constraint evidence_observation_project_identity_key unique (project_id,evidence_id,interpretation_run_id,id);

create table public.evidence_claim_proposals (
 id uuid primary key default gen_random_uuid(), project_id uuid not null, evidence_id uuid not null,
 observation_id uuid not null, interpretation_run_id uuid not null, entity_id uuid not null,
 entity_type text not null check (entity_type in ('room','installation')),
 property_key text not null check (property_key in ('room_overview_context_observed','indoor_installation_area_observed','outdoor_installation_area_observed','line_route_context_observed','wall_penetration_context_observed')),
 value_boolean boolean not null check (value_boolean is true), value_type text not null check (value_type='boolean'),
 epistemic_status text not null check (epistemic_status='observed'),
 knowledge_strength text not null check (knowledge_strength='descriptive_fact'),
 status text not null default 'pending_review' check (status in ('pending_review','approved_apply_pending','applied','rejected','insufficient_evidence','conflict','stale','superseded')),
 mapping_rule_version bigint not null check (mapping_rule_version=1), revision bigint not null default 1 check (revision>0),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 constraint evidence_claim_proposal_observation_fkey foreign key (project_id,evidence_id,interpretation_run_id,observation_id) references public.evidence_observations(project_id,evidence_id,interpretation_run_id,id) on delete restrict,
 constraint evidence_claim_proposal_project_identity_key unique(project_id,id),
 constraint evidence_claim_proposal_semantic_key unique(observation_id,mapping_rule_version,entity_type,entity_id,property_key,value_type,value_boolean)
);
create index evidence_claim_proposals_project_status_idx on public.evidence_claim_proposals(project_id,status,created_at desc);
create index evidence_claim_proposals_evidence_idx on public.evidence_claim_proposals(evidence_id);
create trigger evidence_claim_proposals_updated before update on public.evidence_claim_proposals for each row execute function public.set_updated_at();

create table public.evidence_claim_reviews (
 id uuid primary key default gen_random_uuid(), project_id uuid not null, proposal_id uuid not null,
 review_actor_id uuid not null, review_actor_class text not null check(review_actor_class='admin'),
 review_action text not null check(review_action in ('approve','reject','mark_evidence_insufficient')),
 result_code text not null check(result_code in ('approved','rejected','insufficient_evidence','no_change','apply_pending')),
 proposal_revision bigint not null check(proposal_revision>0), reviewed_at timestamptz not null default statement_timestamp(),
 constraint evidence_claim_review_proposal_fkey foreign key(project_id,proposal_id) references public.evidence_claim_proposals(project_id,id) on delete restrict,
 constraint evidence_claim_review_replay_key unique(proposal_id,proposal_revision,review_action)
);
create index evidence_claim_reviews_project_proposal_idx on public.evidence_claim_reviews(project_id,proposal_id,reviewed_at desc);
create function public.prevent_evidence_claim_review_mutation() returns trigger language plpgsql set search_path=public,pg_temp as $$ begin raise exception 'claim_review_append_only'; end $$;
create trigger evidence_claim_reviews_append_only before update or delete on public.evidence_claim_reviews for each row execute function public.prevent_evidence_claim_review_mutation();

alter table public.evidence_claim_proposals enable row level security;
alter table public.evidence_claim_reviews enable row level security;
revoke all on public.evidence_claim_proposals,public.evidence_claim_reviews from public,anon,authenticated;
grant select on public.evidence_claim_proposals,public.evidence_claim_reviews to authenticated;
create policy "claim proposal admin project read" on public.evidence_claim_proposals for select to authenticated using(auth.uid() is not null and public.current_app_role()='admin' and exists(select 1 from public.projects p where p.id=project_id and p.deleted_at is null));
create policy "claim review admin project read" on public.evidence_claim_reviews for select to authenticated using(auth.uid() is not null and public.current_app_role()='admin' and exists(select 1 from public.projects p where p.id=project_id and p.deleted_at is null));

create or replace function public.create_evidence_claim_proposal(target_observation_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare o public.evidence_observations%rowtype; e public.project_evidence%rowtype; m public.project_media%rowtype; lc public.project_media_lifecycle%rowtype; p public.evidence_claim_proposals%rowtype; target_property text; target_entity text;
begin
 if auth.uid() is null or public.current_app_role()<>'admin' then raise exception 'review_not_allowed'; end if;
 select * into o from public.evidence_observations where id=target_observation_id for update;
 if not found then raise exception 'observation_not_claimable'; end if;
 if o.status<>'recorded' then raise exception 'observation_invalidated'; end if;
 select * into e from public.project_evidence where project_id=o.project_id and id=o.evidence_id and binding_status='bound' for update;
 select * into m from public.project_media where project_id=e.project_id and id=e.project_media_id for update;
 select * into lc from public.project_media_lifecycle where project_id=e.project_id and project_media_id=e.project_media_id for update;
 if m.upload_status<>'ready' or m.physical_state<>'present' or m.deleted_at is not null or lc.deletion_execution_state<>'idle' or exists(select 1 from public.project_evidence_tombstones t where t.evidence_id=e.id) then raise exception 'source_media_unavailable'; end if;
 target_property := case
  when e.evidence_target='room_overview' and o.observation_type='room_overview_visible' then 'room_overview_context_observed'
  when e.evidence_target='indoor_area_overview' and o.observation_type='indoor_area_visible' then 'indoor_installation_area_observed'
  when e.evidence_target='outdoor_area_overview' and o.observation_type='outdoor_area_visible' then 'outdoor_installation_area_observed'
  when e.evidence_target='line_route_context' and o.observation_type='line_route_context_visible' then 'line_route_context_observed'
  when e.evidence_target='line_route_context' and o.observation_type='wall_penetration_context_visible' then 'wall_penetration_context_observed' end;
 if target_property is null or o.value_kind<>'visibility' or o.value_text<>'visible' or o.evidence_quality<>'sufficient_for_observation' or o.interpretation_status<>'observed' then raise exception 'observation_not_claimable'; end if;
 target_entity := case when target_property in ('room_overview_context_observed','indoor_installation_area_observed') then 'room' else 'installation' end;
 select * into p from public.evidence_claim_proposals x where x.observation_id=o.id and x.mapping_rule_version=1 and x.entity_type=target_entity and x.entity_id=o.project_id and x.property_key=target_property and x.value_boolean=true;
 if found then
  insert into public.audit_log(actor_id,entity_type,entity_id,action,metadata) values(auth.uid(),'evidence_claim_proposal',p.id,'claim_proposal_replayed',jsonb_build_object('actor_id',auth.uid(),'project_id',p.project_id,'evidence_id',p.evidence_id,'observation_id',p.observation_id,'proposal_id',p.id,'result_code','already_exists','revision',p.revision,'timestamp',statement_timestamp()));
 else
  insert into public.evidence_claim_proposals(project_id,evidence_id,observation_id,interpretation_run_id,entity_id,entity_type,property_key,value_boolean,value_type,epistemic_status,knowledge_strength,mapping_rule_version)
   values(o.project_id,o.evidence_id,o.id,o.interpretation_run_id,o.project_id,target_entity,target_property,true,'boolean','observed','descriptive_fact',1) returning * into p;
  insert into public.audit_log(actor_id,entity_type,entity_id,action,metadata) values(auth.uid(),'evidence_claim_proposal',p.id,'claim_proposal_created',jsonb_build_object('actor_id',auth.uid(),'project_id',p.project_id,'evidence_id',p.evidence_id,'observation_id',p.observation_id,'proposal_id',p.id,'result_code','created','revision',p.revision,'timestamp',p.created_at));
 end if;
 return jsonb_build_object('proposal_id',p.id,'evidence_id',p.evidence_id,'observation_id',p.observation_id,'property',p.property_key,'value',p.value_boolean,'value_type',p.value_type,'epistemic',p.epistemic_status,'strength',p.knowledge_strength,'status',p.status,'revision',p.revision,'created_at',p.created_at,'updated_at',p.updated_at);
end $$;

create or replace function public.review_evidence_claim_proposal(target_proposal_id uuid,expected_proposal_revision bigint,target_review_action text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare p public.evidence_claim_proposals%rowtype; o public.evidence_observations%rowtype; e public.project_evidence%rowtype; m public.project_media%rowtype; lc public.project_media_lifecycle%rowtype; r public.evidence_claim_reviews%rowtype; next_status text; result text; audit_action text;
begin
 if auth.uid() is null or public.current_app_role()<>'admin' then raise exception 'review_not_allowed'; end if;
 if target_review_action not in ('approve','reject','mark_evidence_insufficient') then raise exception 'review_not_allowed'; end if;
 select * into p from public.evidence_claim_proposals where id=target_proposal_id for update; if not found then raise exception 'stale_proposal'; end if;
 select * into r from public.evidence_claim_reviews where proposal_id=p.id and proposal_revision=expected_proposal_revision and review_action=target_review_action;
 if found then return jsonb_build_object('proposal',jsonb_build_object('proposal_id',p.id,'evidence_id',p.evidence_id,'observation_id',p.observation_id,'property',p.property_key,'value',p.value_boolean,'value_type',p.value_type,'epistemic',p.epistemic_status,'strength',p.knowledge_strength,'status',p.status,'revision',p.revision,'created_at',p.created_at,'updated_at',p.updated_at),'review',jsonb_build_object('review_id',r.id,'proposal_id',r.proposal_id,'action',r.review_action,'result',r.result_code,'actor_class',r.review_actor_class,'reviewed_at',r.reviewed_at)); end if;
 if p.status<>'pending_review' or p.revision<>expected_proposal_revision then raise exception 'stale_proposal'; end if;
 select * into o from public.evidence_observations where project_id=p.project_id and evidence_id=p.evidence_id and interpretation_run_id=p.interpretation_run_id and id=p.observation_id for update;
 if o.status<>'recorded' then raise exception 'observation_invalidated'; end if;
 select * into e from public.project_evidence where project_id=p.project_id and id=p.evidence_id for update; select * into m from public.project_media where project_id=e.project_id and id=e.project_media_id for update; select * into lc from public.project_media_lifecycle where project_id=e.project_id and project_media_id=e.project_media_id for update;
 if m.physical_state<>'present' or m.deleted_at is not null or lc.deletion_execution_state<>'idle' or exists(select 1 from public.project_evidence_tombstones t where t.evidence_id=e.id) then raise exception 'source_media_unavailable'; end if;
 if target_review_action='approve' then next_status:='approved_apply_pending';result:='apply_pending';audit_action:='claim_review_approved'; elsif target_review_action='reject' then next_status:='rejected';result:='rejected';audit_action:='claim_review_rejected'; else next_status:='insufficient_evidence';result:='insufficient_evidence';audit_action:='claim_review_evidence_insufficient'; end if;
 insert into public.evidence_claim_reviews(project_id,proposal_id,review_actor_id,review_actor_class,review_action,result_code,proposal_revision) values(p.project_id,p.id,auth.uid(),'admin',target_review_action,result,p.revision) returning * into r;
 update public.evidence_claim_proposals set status=next_status,revision=revision+1 where id=p.id returning * into p;
 insert into public.audit_log(actor_id,entity_type,entity_id,action,metadata) values(auth.uid(),'evidence_claim_review',r.id,audit_action,jsonb_build_object('actor_id',auth.uid(),'project_id',p.project_id,'evidence_id',p.evidence_id,'observation_id',p.observation_id,'proposal_id',p.id,'review_id',r.id,'result_code',result,'revision',p.revision,'timestamp',r.reviewed_at));
 if target_review_action='approve' then insert into public.audit_log(actor_id,entity_type,entity_id,action,metadata) values(auth.uid(),'evidence_claim_proposal',p.id,'claim_apply_pending',jsonb_build_object('actor_id',auth.uid(),'project_id',p.project_id,'evidence_id',p.evidence_id,'observation_id',p.observation_id,'proposal_id',p.id,'review_id',r.id,'result_code','apply_pending','revision',p.revision,'timestamp',r.reviewed_at)); end if;
 return jsonb_build_object('proposal',jsonb_build_object('proposal_id',p.id,'evidence_id',p.evidence_id,'observation_id',p.observation_id,'property',p.property_key,'value',p.value_boolean,'value_type',p.value_type,'epistemic',p.epistemic_status,'strength',p.knowledge_strength,'status',p.status,'revision',p.revision,'created_at',p.created_at,'updated_at',p.updated_at),'review',jsonb_build_object('review_id',r.id,'proposal_id',r.proposal_id,'action',r.review_action,'result',r.result_code,'actor_class',r.review_actor_class,'reviewed_at',r.reviewed_at));
end $$;
revoke all on function public.create_evidence_claim_proposal(uuid),public.review_evidence_claim_proposal(uuid,bigint,text) from public,anon;
grant execute on function public.create_evidence_claim_proposal(uuid),public.review_evidence_claim_proposal(uuid,bigint,text) to authenticated;
comment on table public.evidence_claim_proposals is 'Current typed descriptive proposal workflow authority; pending states remain open media dependencies.';
comment on table public.evidence_claim_reviews is 'Append-only human review decisions; no direct update or delete grant.';
