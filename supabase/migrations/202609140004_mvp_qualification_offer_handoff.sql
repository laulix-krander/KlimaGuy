-- Step 11: the lifecycle-fenced turn commit is also the sole automated handoff.
-- It changes Project review state only; project_offers remains human/admin controlled.
create or replace function public.commit_mvp_ai_turn(target_turn_id uuid, target_facts_patch jsonb,
 target_reply_text text, target_qualification_status text, target_needs_human boolean, target_human_reason text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare turn_row public.mvp_ai_turns%rowtype; c public.conversations%rowtype;
 b public.conversation_transport_bindings%rowtype; p public.projects%rowtype;
 outbound_id uuid:=gen_random_uuid(); next_sequence integer; server_ready boolean:=false;
 missing_keys text[]:=array[]::text[]; requires_site_check boolean:=false; resulting_qualification text;
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
   or p.id is null then
   update public.mvp_ai_turns set status='failed',failure_code='commit_failed',completed_at=statement_timestamp() where id=turn_row.id;
   return jsonb_build_object('status','stale');
 end if;
 perform public.apply_mvp_project_fact_patch(turn_row.project_id,target_facts_patch);

 select coalesce(array_agg(required_key) filter(where not exists(
   select 1 from public.mvp_project_facts f where f.project_id=turn_row.project_id and f.fact_key=required_key
 )),array[]::text[]) into missing_keys
 from unnest(array['installation_address','requested_room_count','indoor_unit_count','indoor_unit_position','outdoor_unit_position','line_route']) required_key;
 select exists(select 1 from public.mvp_project_facts f where f.project_id=turn_row.project_id
   and f.fact_key in ('condensate_drainage','electrical_supply') and f.fact_value='"requires_site_check"'::jsonb) into requires_site_check;
 server_ready:=cardinality(missing_keys)=0 and not requires_site_check;
 resulting_qualification:=case when target_qualification_status='ready_for_offer' and not server_ready then 'in_progress' else target_qualification_status end;

 -- New MVP Projects enter the existing qualification state on their first committed turn.
 if p.status='new' then update public.projects set status='collecting_information' where id=p.id and status='new'; p.status:='collecting_information'; end if;
 if target_qualification_status='needs_human' and target_needs_human then
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
                  when target_qualification_status='ready_for_offer' then 'missing_facts' else 'none' end,
   'missing_facts',to_jsonb(missing_keys));
end $$;

comment on function public.commit_mvp_ai_turn(uuid,jsonb,text,text,boolean,text) is
 'Atomically commits an MVP turn and deterministic Project review handoff. Never creates, prices, approves, or sends an offer.';
