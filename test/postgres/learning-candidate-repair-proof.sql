-- Runs inside lifecycle-proof.sql so its real conversation/project/message fixture
-- can exercise the repaired production RPC without duplicating domain setup.
create temp table learning_repair_state as
with acquired as (
  select public.acquire_mvp_ai_turn(
    (select conversation_n1 from proof_state),
    (select (result->>'internal_message_id')::uuid from followup)
  ) result
), committed as (
  select
    (result->>'turn_id')::uuid turn_id,
    public.commit_mvp_ai_turn(
      (result->>'turn_id')::uuid,
      '{}'::jsonb,
      'Vielen Dank, wir prüfen Ihre Angaben.',
      'in_progress',
      false,
      null
    ) result
  from acquired
)
select turn_id from committed where result->>'status'='completed';

select pg_temp.assert_true(
  (select public.record_klimaguy_learning_candidates(
    turn_id,
    '[{"category":"customer_communication","title":"Klare Rückmeldung","proposed_guidance":"Kunden erhalten eine klare und zeitnahe Rückmeldung.","rationale":"Dies verbessert die Nachvollziehbarkeit der Kommunikation."}]'::jsonb
  ) = '{"status":"recorded","candidate_count":1}'::jsonb from learning_repair_state),
  31,
  'valid exact four-key candidate records without undefined-function / 42883 failure'
);

do $$
begin
  perform public.record_klimaguy_learning_candidates(
    (select turn_id from learning_repair_state),
    '[{"category":"customer_communication","title":"Zusatzfeld ablehnen","proposed_guidance":"Zusätzliche Felder werden konsequent zurückgewiesen.","rationale":"Nur der festgelegte Vertrag darf gespeichert werden.","extra":true}]'::jsonb
  );
  raise exception 'ASSERTION 32 FAIL: extra-key candidate was accepted';
exception when sqlstate '22023' then
  raise notice 'ASSERTION 32 PASS: extra-key candidate is rejected';
end $$;

do $$
begin
  perform public.record_klimaguy_learning_candidates(
    (select turn_id from learning_repair_state),
    '[{"category":"customer_communication","title":"Fehlendes Feld ablehnen","proposed_guidance":"Fehlende Felder werden konsequent zurückgewiesen."}]'::jsonb
  );
  raise exception 'ASSERTION 33 FAIL: missing-key candidate was accepted';
exception when sqlstate '22023' then
  raise notice 'ASSERTION 33 PASS: missing-key candidate is rejected';
end $$;

do $$
begin
  perform public.record_klimaguy_learning_candidates(
    (select turn_id from learning_repair_state),
    '[{}, {}, {}]'::jsonb
  );
  raise exception 'ASSERTION 34 FAIL: more than two candidates were accepted';
exception when sqlstate '22023' then
  raise notice 'ASSERTION 34 PASS: more than two candidates are rejected';
end $$;

select public.record_klimaguy_learning_candidates(
  turn_id,
  '[{"category":"customer_communication","title":"Klare Rückmeldung","proposed_guidance":"Kunden erhalten eine klare und zeitnahe Rückmeldung.","rationale":"Dies verbessert die Nachvollziehbarkeit der Kommunikation."}]'::jsonb
) from learning_repair_state;

select pg_temp.assert_true(
  (select occurrence_count=2 and revision=2
   from public.klimaguy_learning_candidates
   where title='Klare Rückmeldung' and status='pending'),
  35,
  'exact duplicate pending candidate increments occurrence_count and revision'
);

