# AP-16-06-05I-1 — First-Contact Runtime Guard Repair

## Audit Authority und Production-Evidence

Verbindliche Authority ist
[`AP-16-06-05I-actual-first-contact-commit-exception-root-cause-audit.md`](../audits/AP-16-06-05I-actual-first-contact-commit-exception-root-cause-audit.md),
ergänzt durch den danach rollbackbar ausgeführten Production-Aufruf von
`public.commit_first_contact_initial_prompt(...)`. Dieser Aufruf lieferte SQLSTATE
`42703` mit `record "new" has no field "decision_id"`. Damit ist die tatsächliche
Root Cause identifiziert; die Hypothese aus AP-16-06-05H bleibt widerlegt.

Der Production-Trigger-Katalog bindet dieselbe Function
`public.guard_runtime_identity()` an:

- `pending_interaction_guard` als `BEFORE DELETE OR UPDATE` auf
  `conversation_pending_interactions`;
- `runtime_header_guard` als `BEFORE DELETE OR UPDATE` auf
  `conversation_runtime_states`.

Diese Trigger-Zuordnung wird nicht verändert.

## Root Cause und exakter Fix

Die bisherige gemeinsame Boolean-Bedingung kombinierte den Tabellenvergleich mit
Zugriffen auf Pending-spezifische Felder. Beim Runtime-State-Update wurde dadurch
unter anderem `NEW.decision_id` gegen einen Rowtype ausgewertet, der keine solche
Spalte besitzt. PostgreSQL brach den First-Contact-Commit deshalb mit `42703` ab.

Die forward-only Migration ersetzt ausschließlich
`public.guard_runtime_identity()`. Ein expliziter äußerer Zweig für
`tg_table_name = 'conversation_pending_interactions'` umschließt jetzt die gesamte
Pending-Identity-Prüfung. Damit kann ein Runtime-State-Rowtype keines der
Pending-spezifischen `NEW.*`- oder `OLD.*`-Felder erreichen. Die Reparatur verlässt
sich nicht mehr auf die Abschirmung von Feldzugriffen innerhalb eines kombinierten
Boolean-Ausdrucks.

## Unveränderte Contracts

- Die Function bleibt `LANGUAGE plpgsql` mit `search_path=public,pg_temp`.
- Die gemeinsame Prüfung auf
  `app.runtime_authority_mutation = allowed` und ihre Exception
  `runtime_mutation_requires_authority` bleiben unverändert. Ohne Authority ist
  das Runtime-Update verboten, mit Authority erreicht es weiterhin `return new`.
- Die Pending-Identity-Exception
  `pending_interaction_identity_immutable` und alle geschützten Felder bleiben
  unverändert.
- Trigger-Bindings, Tabellen und Schemas werden nicht geändert.
- Die bestehende `DELETE`-Semantik wird bewusst nicht bereinigt: Der Tabellenzweig,
  die Authority-Prüfung und `return new` entsprechen dem bisherigen Contract. Die
  Migration nimmt keine opportunistische Änderung am DELETE-Verhalten vor.
- Semantik und Body von `commit_first_contact_initial_prompt(...)` bleiben
  unverändert.

## Regression Coverage

Der Migrationstest prüft den expliziten Tabellenzweig, die vollständige Liste der
immutablen Pending-Felder, die alleinige Position von `NEW.decision_id` innerhalb
dieses Zweigs, die unveränderte Runtime-Authority-Exception und den Return-Contract.
Er stellt außerdem sicher, dass die Repair-Migration weder First-Contact-Function
noch Trigger-Zuordnung anfasst. Die vorhandenen First-Contact-, Runtime-,
Planner-Snapshot-, Pending-Interaction-, Delivery-Authority- und Migrationstests
decken die unveränderten angrenzenden Contracts ab.

In dieser Repository-Umgebung ist keine echte PostgreSQL-/Supabase-Testinstanz
konfiguriert. Deshalb wurde keine Fake-Datenbank ergänzt. Die vorhandene
migrationsgestützte Coverage besteht aus SQL-Contract-Tests; die echte atomare
Ausführung bleibt Bestandteil der Production-Verifikation.

## Production Verification

Nach dem Merge:

1. genau diese neue Migration in Production anwenden; keine Environment- oder
   Scheduler-Änderung vornehmen;
2. First-Contact Recovery laufen lassen;
3. für Conversation `ed8e842d-e6f4-4c5d-9305-e723d6f6794c` Runtime Revision `2`
   und Status `awaiting_customer_answer` verifizieren;
4. aktive Pending Interaction, Planner Snapshot, Outbound Message, Runtime Command
   `first-contact-initial-prompt:v1` und WhatsApp Delivery Command verifizieren;
5. bestätigen, dass `commit_rpc_failed` und SQLSTATE `42703` nicht erneut auftreten;
6. anschließend WhatsApp Delivery Recovery unverändert arbeiten lassen.

## Non-Goals

Nicht Bestandteil sind Änderungen an historischen Migrationen, Planner, Renderer,
First Contact Recovery, Delivery, Webhook, Scheduler, OpenAI, Offer/Pricing, Human
Review, Knowledge State, Runtime- oder Pending-Schema, Prompttext, Snapshot-Payload,
System Actor, Transport Binding sowie allgemeines Trigger-Refactoring.
