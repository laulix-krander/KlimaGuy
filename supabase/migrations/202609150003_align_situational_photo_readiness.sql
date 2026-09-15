-- Align situational photo readiness after 202609150002 was applied in production.
-- The public RPC signature and all lifecycle fences remain unchanged.
create or replace function public.commit_mvp_ai_turn(target_turn_id uuid, target_facts_patch jsonb,
 target_customer_name_patch jsonb, target_media_classifications jsonb, target_reply_text text, target_qualification_status text, target_needs_human boolean, target_human_reason text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare turn_row public.mvp_ai_turns%rowtype; c public.conversations%rowtype;
 b public.conversation_transport_bindings%rowtype; p public.projects%rowtype; customer_row public.customers%rowtype;
 outbound_id uuid:=gen_random_uuid(); next_sequence integer; server_ready boolean:=false;
 missing_keys text[]:=array[]::text[]; required_photos text[]:=array[]::text[]; missing_photos text[]:=array[]::text[]; requires_site_check boolean:=false; classification jsonb; resulting_qualification text;
begin
 select * into turn_row from public.mvp_ai_turns where id=target_turn_id for update;
 if not found then raise exception 'mvp_turn_not_found'; end if;
 if turn_row.status='completed' then return jsonb_build_object('status','completed','outbound_message_id',turn_row.outbound_message_id); end if;
 if turn_row.status<>'running' then return jsonb_build_object('status','stale'); end if;
 select * into c from public.conversations where id=turn_row.conversation_id for update;
 select * into b from public.conversation_transport_bindings where id=turn_row.binding_id for update;
 select * into p from public.projects where id=turn_row.project_id and deleted_at is null for update;
 if c.status<>'open' or c.engine_owner<>'mvp' or c.current_project_id<>turn_row.project_id
   or c.revision<>turn_row.expected_conversation_revision or b.status<>'active' or b.revision<>turn_row.binding_revision
   or p.id is null or p.customer_id<>c.customer_id then
   update public.mvp_ai_turns set status='failed',failure_code='commit_failed',completed_at=statement_timestamp() where id=turn_row.id;
   return jsonb_build_object('status','stale');
 end if;
 select * into customer_row from public.customers where id=c.customer_id and id=p.customer_id and deleted_at is null for update;
 if not found then
   update public.mvp_ai_turns set status='failed',failure_code='commit_failed',completed_at=statement_timestamp() where id=turn_row.id;
   return jsonb_build_object('status','stale');
 end if;
 if target_customer_name_patch is not null then
   if jsonb_typeof(target_customer_name_patch)<>'object'
      or target_customer_name_patch - array['first_name','last_name']::text[] <> '{}'::jsonb
      or not (target_customer_name_patch ? 'first_name' and target_customer_name_patch ? 'last_name')
      or jsonb_typeof(target_customer_name_patch->'first_name') not in ('string','null')
      or jsonb_typeof(target_customer_name_patch->'last_name') not in ('string','null')
      or (nullif(btrim(target_customer_name_patch->>'first_name'),'') is null and nullif(btrim(target_customer_name_patch->>'last_name'),'') is null)
      or length(coalesce(target_customer_name_patch->>'first_name',''))>120
      or length(coalesce(target_customer_name_patch->>'last_name',''))>120 then raise exception 'invalid_customer_name_patch'; end if;
   update public.customers set
     first_name=case when first_name is null then nullif(btrim(target_customer_name_patch->>'first_name'),'') else first_name end,
     last_name=case when last_name is null then nullif(btrim(target_customer_name_patch->>'last_name'),'') else last_name end
   where id=customer_row.id;
 end if;
 if jsonb_typeof(coalesce(target_media_classifications,'[]'::jsonb)) <> 'array' then raise exception 'invalid_media_classifications'; end if;
 for classification in select value from jsonb_array_elements(coalesce(target_media_classifications,'[]'::jsonb)) loop
   if jsonb_typeof(classification)<>'object' or classification-array['media_id','category','observation']::text[]<>'{}'::jsonb
      or not (classification ? 'media_id' and classification ? 'category' and classification ? 'observation')
      or (classification->>'category' is not null and classification->>'category' not in ('room_overview','indoor_unit_location','outdoor_unit_location','pipe_route','electrical_connection','condensate_route')) then raise exception 'invalid_media_classification'; end if;
   if not exists(select 1 from public.mvp_ai_turn_media tm join public.project_media pm on pm.id=tm.project_media_id where tm.turn_id=turn_row.id and pm.id=(classification->>'media_id')::uuid and pm.project_id=turn_row.project_id and pm.source_conversation_id=turn_row.conversation_id and pm.source_message_id=turn_row.inbound_message_id and pm.upload_status='ready' and pm.deleted_at is null and pm.media_type='image') then raise exception 'media_not_bound_to_turn'; end if;
   if classification->>'category' is not null then update public.project_media set category=classification->>'category' where id=(classification->>'media_id')::uuid; end if;
   if nullif(btrim(classification->>'observation'),'') is not null then insert into public.project_media_ai_observations(project_id,project_media_id,turn_id,observation) values(turn_row.project_id,(classification->>'media_id')::uuid,turn_row.id,btrim(classification->>'observation')); end if;
 end loop;
 perform public.apply_mvp_project_fact_patch(turn_row.project_id,target_facts_patch);
 -- One deterministic policy array drives both the informational projection and readiness authority.
 required_photos:=array['room_overview','indoor_unit_location','outdoor_unit_location']::text[]
   || case when not exists(select 1 from public.mvp_project_facts where project_id=turn_row.project_id and fact_key='line_route') then array['pipe_route']::text[] else array[]::text[] end
   || case when exists(select 1 from public.mvp_project_facts where project_id=turn_row.project_id and fact_key='electrical_supply' and fact_value in ('"available"'::jsonb,'"unknown"'::jsonb,'"requires_site_check"'::jsonb)) then array['electrical_connection']::text[] else array[]::text[] end
   || case when exists(select 1 from public.mvp_project_facts where project_id=turn_row.project_id and fact_key='condensate_drainage' and fact_value in ('"unknown"'::jsonb,'"requires_site_check"'::jsonb)) then array['condensate_route']::text[] else array[]::text[] end;
 insert into public.mvp_project_facts(project_id,fact_key,fact_value)
 values(turn_row.project_id,'required_photo_categories',to_jsonb(required_photos))
 on conflict(project_id,fact_key) do update set fact_value=excluded.fact_value,updated_at=statement_timestamp();

 select coalesce(array_agg(required_key) filter(where not exists(
   select 1 from public.mvp_project_facts f where f.project_id=turn_row.project_id and f.fact_key=required_key
 )),array[]::text[]) into missing_keys
 from unnest(array['installation_address','postal_code','city','building_type','requested_room_count','room_type','room_area_sqm','indoor_unit_count','indoor_unit_position','outdoor_unit_position','line_route','estimated_line_length_m','condensate_drainage','electrical_supply','installation_access']) required_key;
 select coalesce(array_agg(required_category order by ordinal) filter(where not exists(select 1 from public.project_media pm where pm.project_id=turn_row.project_id and pm.upload_status='ready' and pm.deleted_at is null and pm.media_type='image' and pm.mime_type in ('image/jpeg','image/png','image/webp') and pm.category=required_category)),array[]::text[]) into missing_photos from unnest(required_photos) with ordinality as required(required_category,ordinal);
 select exists(select 1 from public.mvp_project_facts f where f.project_id=turn_row.project_id
   and ((f.fact_key in ('condensate_drainage','electrical_supply') and f.fact_value in ('"unknown"'::jsonb,'"requires_site_check"'::jsonb)) or (f.fact_key='installation_access' and f.fact_value in ('"unknown"'::jsonb,'"special_access_required"'::jsonb)))) into requires_site_check;
 server_ready:=cardinality(missing_keys)=0 and cardinality(missing_photos)=0 and not requires_site_check;
 resulting_qualification:=case when target_qualification_status='ready_for_offer' and not server_ready then 'in_progress' else target_qualification_status end;

 -- New MVP Projects enter the existing qualification state on their first committed turn.
 if p.status='new' then update public.projects set status='collecting_information' where id=p.id and status='new'; p.status:='collecting_information'; end if;
 if requires_site_check then
   update public.projects set requires_human_review=true where id=p.id and requires_human_review is distinct from true;
 elsif target_qualification_status='needs_human' and target_needs_human then
   update public.projects set requires_human_review=true where id=p.id and requires_human_review is distinct from true;
 elsif target_qualification_status='ready_for_offer' and server_ready and not target_needs_human and p.status='collecting_information' then
   update public.projects set status='technical_review',requires_human_review=true where id=p.id and status='collecting_information';
 end if;

 next_sequence:=coalesce((select max(sequence) from public.conversation_messages where conversation_id=c.id),0)+1;
 insert into public.conversation_messages(id,conversation_id,sequence,direction,message_kind,actor_class,occurred_at,reply_to_message_id,idempotency_key)
 values(outbound_id,c.id,next_sequence,'outbound','text','ai',statement_timestamp(),turn_row.inbound_message_id,'mvp-turn:'||turn_row.id);
 insert into public.conversation_message_text(message_id,body) values(outbound_id,target_reply_text);
 insert into public.transport_delivery_commands(internal_message_id,conversation_id,transport_binding_id,transport_identity_id)
 values(outbound_id,c.id,b.id,b.transport_identity_id);
 update public.mvp_ai_turns set status='completed',qualification_status=resulting_qualification,
   needs_human=target_needs_human,human_reason=target_human_reason,outbound_message_id=outbound_id,completed_at=statement_timestamp()
 where id=turn_row.id;
 return jsonb_build_object('status','completed','outbound_message_id',outbound_id,'qualification_status',resulting_qualification,
   'handoff',case when target_qualification_status='ready_for_offer' and server_ready then 'technical_review'
                  when target_qualification_status='needs_human' then 'human_review_required'
                  when target_qualification_status='ready_for_offer' then 'missing_evidence' else 'none' end,
   'missing_facts',to_jsonb(missing_keys),'missing_photos',to_jsonb(missing_photos));
end $$;

comment on function public.commit_mvp_ai_turn(uuid,jsonb,jsonb,jsonb,text,text,boolean,text) is
 'Atomically commits an MVP turn and deterministic Project review handoff. Never creates, prices, approves, or sends an offer.';
revoke all on function public.commit_mvp_ai_turn(uuid,jsonb,jsonb,jsonb,text,text,boolean,text) from public,anon,authenticated;
grant execute on function public.commit_mvp_ai_turn(uuid,jsonb,jsonb,jsonb,text,text,boolean,text) to service_role;
