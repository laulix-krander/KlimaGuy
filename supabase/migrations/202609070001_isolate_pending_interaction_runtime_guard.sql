create or replace function public.guard_runtime_identity()
returns trigger
language plpgsql
set search_path=public,pg_temp
as $$
begin
  if tg_table_name = 'conversation_pending_interactions' then
    if (
      new.conversation_id <> old.conversation_id
      or new.project_id <> old.project_id
      or new.decision_id <> old.decision_id
      or new.selected_action_type <> old.selected_action_type
      or new.information_key <> old.information_key
      or new.entity_type <> old.entity_type
      or new.entity_id <> old.entity_id
      or new.template_key <> old.template_key
      or new.template_version <> old.template_version
      or new.answer_type <> old.answer_type
      or new.expected_knowledge_state_version <> old.expected_knowledge_state_version
      or new.runtime_revision <> old.runtime_revision
    ) then
      raise exception 'pending_interaction_identity_immutable';
    end if;
  end if;

  if coalesce(
    current_setting('app.runtime_authority_mutation', true),
    ''
  ) <> 'allowed' then
    raise exception 'runtime_mutation_requires_authority';
  end if;

  return new;
end
$$;
