-- Forward-only production repair: 202609180002 is already applied.
create or replace function public.record_klimaguy_learning_candidates(target_turn_id uuid,target_candidates jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare turn_row public.mvp_ai_turns%rowtype; item jsonb; fp text; affected integer:=0;
begin
 if auth.role()<>'service_role' then raise exception 'klimaguy_learning_forbidden' using errcode='42501'; end if;
 if jsonb_typeof(target_candidates)<>'array' or jsonb_array_length(target_candidates)>2 then raise exception 'klimaguy_learning_invalid_candidates' using errcode='22023'; end if;
 select * into turn_row from public.mvp_ai_turns where id=target_turn_id and status='completed' and outbound_message_id is not null;
 if not found then raise exception 'klimaguy_learning_turn_not_completed' using errcode='22023'; end if;
 for item in select value from jsonb_array_elements(target_candidates) loop
   if jsonb_typeof(item)<>'object'
      or item ?& array['category','title','proposed_guidance','rationale']=false
      or (item-array['category','title','proposed_guidance','rationale']::text[])<>'{}'::jsonb
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

revoke all on function public.record_klimaguy_learning_candidates(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.record_klimaguy_learning_candidates(uuid,jsonb) to service_role;
