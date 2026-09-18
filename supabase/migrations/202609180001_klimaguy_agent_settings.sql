create table public.klimaguy_agent_settings (
  id uuid primary key default '00000000-0000-4000-8000-000000000404'::uuid,
  communication_formality text not null check (communication_formality in ('formal','informal')),
  tone text not null check (tone in ('professional','friendly','relaxed')),
  response_length text not null check (response_length in ('short','balanced')),
  emoji_usage text not null check (emoji_usage in ('none','sparse')),
  acknowledge_answers boolean not null,
  question_strategy text not null check (question_strategy in ('one_at_a_time','group_compatible')),
  greeting_style text not null check (greeting_style in ('concise','warm')),
  closing_style text not null check (closing_style in ('concise','warm')),
  ask_customer_name boolean not null,
  customer_name_timing text not null check (customer_name_timing in ('early','after_context')),
  use_customer_name boolean not null,
  photo_request_strategy text not null check (photo_request_strategy in ('grouped','sequential')),
  unknown_answer_behavior text not null check (unknown_answer_behavior in ('mark_unknown_and_continue','escalate_when_critical')),
  site_visit_policy text not null check (site_visit_policy in ('recommend_on_required_site_check','human_decides')),
  revision integer not null check (revision > 0),
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint klimaguy_agent_settings_singleton check (id = '00000000-0000-4000-8000-000000000404'::uuid)
);

alter table public.klimaguy_agent_settings enable row level security;
create policy "staff read klimaguy agent settings" on public.klimaguy_agent_settings for select to authenticated
  using (auth.uid() is not null and public.current_app_role() in ('admin','reviewer'));

create function public.update_klimaguy_agent_settings(
  target_communication_formality text, target_tone text, target_response_length text, target_emoji_usage text,
  target_acknowledge_answers boolean, target_question_strategy text, target_greeting_style text, target_closing_style text,
  target_ask_customer_name boolean, target_customer_name_timing text, target_use_customer_name boolean,
  target_photo_request_strategy text, target_unknown_answer_behavior text, target_site_visit_policy text,
  target_expected_revision integer
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare old public.klimaguy_agent_settings%rowtype; fresh public.klimaguy_agent_settings%rowtype; changed text[];
begin
  if auth.uid() is null or public.current_app_role() <> 'admin' then raise exception 'klimaguy_settings_forbidden' using errcode='42501'; end if;
  if target_expected_revision < 0 then raise exception 'klimaguy_settings_invalid_revision' using errcode='22023'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('klimaguy_agent_settings', 0));
  select * into old from public.klimaguy_agent_settings where id='00000000-0000-4000-8000-000000000404'::uuid for update;
  if not found then
    if target_expected_revision <> 0 then raise exception 'klimaguy_settings_stale' using errcode='40001'; end if;
    insert into public.klimaguy_agent_settings(id,communication_formality,tone,response_length,emoji_usage,acknowledge_answers,question_strategy,greeting_style,closing_style,ask_customer_name,customer_name_timing,use_customer_name,photo_request_strategy,unknown_answer_behavior,site_visit_policy,revision,updated_by)
    values('00000000-0000-4000-8000-000000000404',target_communication_formality,target_tone,target_response_length,target_emoji_usage,target_acknowledge_answers,target_question_strategy,target_greeting_style,target_closing_style,target_ask_customer_name,target_customer_name_timing,target_use_customer_name,target_photo_request_strategy,target_unknown_answer_behavior,target_site_visit_policy,1,auth.uid()) returning * into fresh;
    changed := array['communication_formality','tone','response_length','emoji_usage','acknowledge_answers','question_strategy','greeting_style','closing_style','ask_customer_name','customer_name_timing','use_customer_name','photo_request_strategy','unknown_answer_behavior','site_visit_policy'];
  else
    if old.revision <> target_expected_revision then raise exception 'klimaguy_settings_stale' using errcode='40001'; end if;
    changed := array_remove(array[
      case when old.communication_formality is distinct from target_communication_formality then 'communication_formality' end,
      case when old.tone is distinct from target_tone then 'tone' end, case when old.response_length is distinct from target_response_length then 'response_length' end,
      case when old.emoji_usage is distinct from target_emoji_usage then 'emoji_usage' end, case when old.acknowledge_answers is distinct from target_acknowledge_answers then 'acknowledge_answers' end,
      case when old.question_strategy is distinct from target_question_strategy then 'question_strategy' end, case when old.greeting_style is distinct from target_greeting_style then 'greeting_style' end,
      case when old.closing_style is distinct from target_closing_style then 'closing_style' end, case when old.ask_customer_name is distinct from target_ask_customer_name then 'ask_customer_name' end,
      case when old.customer_name_timing is distinct from target_customer_name_timing then 'customer_name_timing' end, case when old.use_customer_name is distinct from target_use_customer_name then 'use_customer_name' end,
      case when old.photo_request_strategy is distinct from target_photo_request_strategy then 'photo_request_strategy' end,
      case when old.unknown_answer_behavior is distinct from target_unknown_answer_behavior then 'unknown_answer_behavior' end,
      case when old.site_visit_policy is distinct from target_site_visit_policy then 'site_visit_policy' end], null);
    update public.klimaguy_agent_settings set communication_formality=target_communication_formality,tone=target_tone,response_length=target_response_length,emoji_usage=target_emoji_usage,acknowledge_answers=target_acknowledge_answers,question_strategy=target_question_strategy,greeting_style=target_greeting_style,closing_style=target_closing_style,ask_customer_name=target_ask_customer_name,customer_name_timing=target_customer_name_timing,use_customer_name=target_use_customer_name,photo_request_strategy=target_photo_request_strategy,unknown_answer_behavior=target_unknown_answer_behavior,site_visit_policy=target_site_visit_policy,revision=old.revision+1,updated_by=auth.uid(),updated_at=statement_timestamp() where id=old.id returning * into fresh;
  end if;
  insert into public.audit_log(actor_id,entity_type,entity_id,action,metadata) values(auth.uid(),'klimaguy_agent_settings',fresh.id,'klimaguy_agent_settings_updated',jsonb_build_object('previous_revision',coalesce(old.revision,0),'new_revision',fresh.revision,'changed_fields',to_jsonb(changed)));
  return jsonb_build_object('status','updated','revision',fresh.revision,'updated_at',fresh.updated_at);
end $$;

revoke all on table public.klimaguy_agent_settings from anon, authenticated;
grant select on table public.klimaguy_agent_settings to authenticated;
revoke all on function public.update_klimaguy_agent_settings(text,text,text,text,boolean,text,text,text,boolean,text,boolean,text,text,text,integer) from public, anon;
grant execute on function public.update_klimaguy_agent_settings(text,text,text,text,boolean,text,text,text,boolean,text,boolean,text,text,text,integer) to authenticated;
