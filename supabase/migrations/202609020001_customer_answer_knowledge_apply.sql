-- AP-16-06-01D: provider-independent, append-only customer-answer knowledge authority.
create table public.customer_answer_knowledge_transitions (
 id uuid primary key, command_id uuid not null unique references public.conversation_cycle_commands(id) on delete restrict,
 project_id uuid not null references public.projects(id) on delete restrict,
 conversation_id uuid not null references public.conversations(id) on delete restrict,
 source_message_id uuid not null references public.conversation_messages(id) on delete restrict,
 interpretation_id uuid not null unique, apply_id uuid not null unique,
 transition_type text not null check(transition_type in ('claim_created','claim_supersession_proposed','unknown_recorded','skip_recorded','assumption_confirmed','assumption_rejected','assumption_deferred','duplicate_no_change','contradiction_recorded')),
 information_key text not null, expected_knowledge_version integer not null check(expected_knowledge_version>0),
 resulting_knowledge_version integer not null check(resulting_knowledge_version>=expected_knowledge_version and resulting_knowledge_version<=expected_knowledge_version+1),
 idempotency_key text not null, payload jsonb not null, applied_at timestamptz not null,
 created_at timestamptz not null default now(), unique(conversation_id,idempotency_key),
 constraint ca_transition_version_check check(resulting_knowledge_version=expected_knowledge_version or resulting_knowledge_version=expected_knowledge_version+1)
);

create table public.customer_answer_knowledge_claims (
 claim_id uuid primary key, transition_id uuid not null references public.customer_answer_knowledge_transitions(id) on delete restrict,
 project_id uuid not null references public.projects(id) on delete restrict,
 source_message_id uuid not null references public.conversation_messages(id) on delete restrict,
 cycle_command_id uuid not null references public.conversation_cycle_commands(id) on delete restrict,
 interpretation_id uuid not null, entity_type text not null check(entity_type in ('project','room','installation')),
 entity_id uuid not null, property_key text not null check(property_key in ('building_type','ownership_status','requested_room_count','desired_installation_scope','room_type','room_area_sqm','room_height_m','floor_level','roof_floor','usage_type','sun_exposure','indoor_unit_position_known','outdoor_unit_position_known','line_route_known','estimated_line_length_m','core_drilling_count','condensate_route_known','electrical_supply_known','accessibility_known','room_overview_context_observed','indoor_installation_area_observed','outdoor_installation_area_observed','line_route_context_observed','wall_penetration_context_observed')), value_type text not null check(value_type in ('string','number','boolean','unknown')),
 value_text text, value_number numeric, value_boolean boolean,
 epistemic_status text not null check(epistemic_status in ('confirmed','reported','observed','estimated','assumed','unknown','not_applicable','contradicted','requires_site_check')),
 knowledge_strength text check(knowledge_strength in ('observed','descriptive_fact','technical_hypothesis','technical_assessment','reviewer_approved','site_verified')),
 approximation text check(approximation in ('exact','approximate')), supersedes_claim_id uuid references public.customer_answer_knowledge_claims(claim_id) on delete restrict,
 created_version integer not null check(created_version>1), source_class text not null check(source_class='customer_answer'),
 created_at timestamptz not null,
 constraint ca_claim_typed_value_check check(
  (value_type='string' and value_text is not null and value_number is null and value_boolean is null) or
  (value_type='number' and value_text is null and value_number is not null and value_boolean is null) or
  (value_type='boolean' and value_text is null and value_number is null and value_boolean is not null) or
  (value_type='unknown' and value_text is null and value_number is null and value_boolean is null and epistemic_status='unknown')),
 unique(project_id,claim_id)
);

create table public.customer_answer_claim_evidence (
 id uuid primary key, claim_id uuid not null references public.customer_answer_knowledge_claims(claim_id) on delete restrict,
 project_id uuid not null references public.projects(id) on delete restrict,
 source_type text not null check(source_type in ('customer_message','system_rule')),
 source_id uuid not null, actor_class text not null check(actor_class in ('customer','system')),
 evidence_status text not null check(evidence_status='active'), observed_at timestamptz not null,
 created_at timestamptz not null default now(), unique(claim_id,id),
 constraint ca_evidence_source_actor_check check((source_type='customer_message' and actor_class='customer') or (source_type='system_rule' and actor_class='system'))
);

create trigger ca_transitions_append_only before update or delete on public.customer_answer_knowledge_transitions for each row execute function public.prevent_knowledge_append_only_mutation();
create trigger ca_claims_append_only before update or delete on public.customer_answer_knowledge_claims for each row execute function public.prevent_knowledge_append_only_mutation();
create trigger ca_evidence_append_only before update or delete on public.customer_answer_claim_evidence for each row execute function public.prevent_knowledge_append_only_mutation();
alter table public.customer_answer_knowledge_transitions enable row level security;
alter table public.customer_answer_knowledge_claims enable row level security;
alter table public.customer_answer_claim_evidence enable row level security;
revoke all on public.customer_answer_knowledge_transitions,public.customer_answer_knowledge_claims,public.customer_answer_claim_evidence from public,anon,authenticated;

create function public.apply_customer_answer_knowledge_transition(target_command_id uuid,transition_payload jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare cmd public.conversation_cycle_commands%rowtype; ks public.project_knowledge_states%rowtype; old_t public.customer_answer_knowledge_transitions%rowtype;
 p jsonb; c jsonb; ev jsonb; changed boolean; next_version integer; old_claim public.customer_answer_knowledge_claims%rowtype;
begin
 if auth.role()<>'service_role' then return jsonb_build_object('success',false,'code','command_not_found'); end if;
 if target_command_id is null or jsonb_typeof(transition_payload)<>'object' then return jsonb_build_object('success',false,'code','transition_invalid'); end if;
 select * into cmd from public.conversation_cycle_commands where id=target_command_id for update;
 if not found then return jsonb_build_object('success',false,'code','command_not_found'); end if;
 if cmd.command_type<>'customer_answer' or cmd.status<>'processing' then return jsonb_build_object('success',false,'code','command_not_claimed'); end if;
 p:=transition_payload->'proposal'; changed:=coalesce((transition_payload->>'changed')::boolean,false);
 if jsonb_typeof(p)<>'object' or p->>'project_id'<>cmd.project_id::text then return jsonb_build_object('success',false,'code','project_mismatch'); end if;
 if p->>'conversation_id'<>cmd.conversation_id::text then return jsonb_build_object('success',false,'code','conversation_mismatch'); end if;
 if p->>'answer_id'<>cmd.source_message_id::text then return jsonb_build_object('success',false,'code','source_message_mismatch'); end if;
 if p->>'transition_id'<>cmd.transition_id::text or p->>'interpretation_id'<>cmd.interpretation_id::text or transition_payload->>'apply_id'<>cmd.apply_id::text or coalesce(p->>'transition_origin','customer_answer')<>'customer_answer' then return jsonb_build_object('success',false,'code','provenance_invalid'); end if;
 select * into old_t from public.customer_answer_knowledge_transitions where id=cmd.transition_id or command_id=cmd.id;
 if found then
  if old_t.payload<>transition_payload then return jsonb_build_object('success',false,'code','duplicate_conflict'); end if;
  return jsonb_build_object('success',true,'code','replayed','replayed',true,'project_id',old_t.project_id,'command_id',old_t.command_id,'previous_knowledge_version',old_t.expected_knowledge_version,'resulting_knowledge_version',old_t.resulting_knowledge_version,'transition_id',old_t.id,'applied_claim_ids',coalesce((select jsonb_agg(claim_id order by claim_id) from public.customer_answer_knowledge_claims where transition_id=old_t.id),'[]'::jsonb));
 end if;
 select * into ks from public.project_knowledge_states where project_id=cmd.project_id for update;
 if not found or ks.current_version<>cmd.expected_knowledge_version or (p->>'based_on_state_version')::integer<>cmd.expected_knowledge_version then return jsonb_build_object('success',false,'code','knowledge_stale'); end if;
 if p->>'transition_type'='human_review_required' then return jsonb_build_object('success',false,'code','human_review_required'); end if;
 if p->>'transition_type' not in ('claim_created','claim_supersession_proposed','unknown_recorded','skip_recorded','assumption_confirmed','assumption_rejected','assumption_deferred','duplicate_no_change','contradiction_recorded') then return jsonb_build_object('success',false,'code','transition_invalid'); end if;
 if jsonb_typeof(p->'claim_proposals')<>'array' or jsonb_array_length(p->'claim_proposals')>1 or jsonb_typeof(p->'evidence_proposals')<>'array' then return jsonb_build_object('success',false,'code','claim_invalid'); end if;
 if changed<>(jsonb_array_length(p->'claim_proposals')=1) then return jsonb_build_object('success',false,'code','claim_invalid'); end if;
 next_version:=cmd.expected_knowledge_version+(case when changed then 1 else 0 end);
 if (p->>'proposed_state_version')::integer<>next_version then return jsonb_build_object('success',false,'code','knowledge_stale'); end if;
 c:=case when changed then p->'claim_proposals'->0 else null end;
 if changed and (c->>'claim_id'<>cmd.claim_id::text or c->>'project_id'<>cmd.project_id::text or (c->>'based_on_state_version')::integer<>cmd.expected_knowledge_version or (c->>'proposed_state_version')::integer<>next_version) then return jsonb_build_object('success',false,'code','claim_invalid'); end if;
 if changed and not ((c->>'entity_type'='project' and c->>'property_key' in ('building_type','ownership_status','requested_room_count','desired_installation_scope')) or (c->>'entity_type'='room' and c->>'property_key' in ('room_type','room_area_sqm','room_height_m','floor_level','roof_floor','usage_type','sun_exposure','indoor_unit_position_known','room_overview_context_observed','indoor_installation_area_observed')) or (c->>'entity_type'='installation' and c->>'property_key' in ('outdoor_unit_position_known','line_route_known','estimated_line_length_m','core_drilling_count','condensate_route_known','electrical_supply_known','accessibility_known','outdoor_installation_area_observed','line_route_context_observed','wall_penetration_context_observed'))) then return jsonb_build_object('success',false,'code','claim_invalid'); end if;
 if changed and c ? 'supersedes_claim_id' then
  select * into old_claim from public.customer_answer_knowledge_claims where claim_id=(c->>'supersedes_claim_id')::uuid and project_id=cmd.project_id;
  if not found or exists(select 1 from public.customer_answer_knowledge_claims n where n.supersedes_claim_id=old_claim.claim_id) then return jsonb_build_object('success',false,'code','claim_invalid'); end if;
 end if;
 if changed and (jsonb_array_length(c->'evidence')<>jsonb_array_length(p->'evidence_proposals') or c->'evidence'<>p->'evidence_proposals') then return jsonb_build_object('success',false,'code','provenance_invalid'); end if;
 if changed and exists(select 1 from jsonb_array_elements(c->'evidence') x where (x->>'observed_at')::timestamptz<>cmd.execution_at or (x->>'source_type' not in ('customer_message','system_rule')) or (x->>'source_type'='customer_message' and (x->>'source_id'<>cmd.source_message_id::text or x->>'evidence_id'<>cmd.customer_evidence_id::text or x->>'actor_class'<>'customer')) or (x->>'source_type'='system_rule' and (x->>'evidence_id'<>cmd.system_evidence_id::text or x->>'actor_class'<>'system'))) then return jsonb_build_object('success',false,'code','provenance_invalid'); end if;
 insert into public.customer_answer_knowledge_transitions(id,command_id,project_id,conversation_id,source_message_id,interpretation_id,apply_id,transition_type,information_key,expected_knowledge_version,resulting_knowledge_version,idempotency_key,payload,applied_at)
 values(cmd.transition_id,cmd.id,cmd.project_id,cmd.conversation_id,cmd.source_message_id,cmd.interpretation_id,cmd.apply_id,p->>'transition_type',p->>'information_key',cmd.expected_knowledge_version,next_version,p->>'idempotency_key',transition_payload,cmd.execution_at);
 if changed then
  insert into public.customer_answer_knowledge_claims(claim_id,transition_id,project_id,source_message_id,cycle_command_id,interpretation_id,entity_type,entity_id,property_key,value_type,value_text,value_number,value_boolean,epistemic_status,knowledge_strength,approximation,supersedes_claim_id,created_version,source_class,created_at)
  values(cmd.claim_id,cmd.transition_id,cmd.project_id,cmd.source_message_id,cmd.id,cmd.interpretation_id,c->>'entity_type',(c->>'entity_id')::uuid,c->>'property_key',c->>'value_type',case when c->>'value_type'='string' then c->>'value' end,case when c->>'value_type'='number' then (c->>'value')::numeric end,case when c->>'value_type'='boolean' then (c->>'value')::boolean end,c->>'epistemic_status',c->>'knowledge_strength',c->>'approximation',(c->>'supersedes_claim_id')::uuid,next_version,'customer_answer',cmd.execution_at);
  for ev in select value from jsonb_array_elements(c->'evidence') loop
   insert into public.customer_answer_claim_evidence(id,claim_id,project_id,source_type,source_id,actor_class,evidence_status,observed_at) values((ev->>'evidence_id')::uuid,cmd.claim_id,cmd.project_id,ev->>'source_type',(ev->>'source_id')::uuid,ev->>'actor_class','active',(ev->>'observed_at')::timestamptz);
  end loop;
  update public.project_knowledge_states set current_version=next_version where id=ks.id and current_version=cmd.expected_knowledge_version;
 end if;
 return jsonb_build_object('success',true,'code',case when changed then 'applied' else 'no_change' end,'replayed',false,'project_id',cmd.project_id,'command_id',cmd.id,'previous_knowledge_version',cmd.expected_knowledge_version,'resulting_knowledge_version',next_version,'transition_id',cmd.transition_id,'applied_claim_ids',case when changed then jsonb_build_array(cmd.claim_id) else '[]'::jsonb end);
exception when unique_violation or foreign_key_violation or check_violation or invalid_text_representation then
 return jsonb_build_object('success',false,'code','duplicate_conflict');
when others then return jsonb_build_object('success',false,'code','persistence_failed');
end $$;

revoke all on function public.apply_customer_answer_knowledge_transition(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.apply_customer_answer_knowledge_transition(uuid,jsonb) to service_role;
comment on function public.apply_customer_answer_knowledge_transition(uuid,jsonb) is 'Isolated AP-16-06-01D knowledge-only authority; AP-16-06-01E must compose it into the full atomic cycle commit.';
