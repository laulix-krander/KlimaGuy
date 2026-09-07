# AP-16-06-05H — First-Contact Commit RPC Production Root-Cause Audit

## Abschlussbericht

| Feld | Ergebnis |
|---|---|
| Branch | `codex/ap16-06-05h-first-contact-commit-rpc-root-cause-audit` |
| Baseline Commit | `87731d2e44df2dfa347975fb0bfa0b80d828c4f9` (aktueller Main-Merge von AP-16-06-05G-1) |
| Audit-Commit | Git-Commit mit Message `docs: audit first contact commit rpc root cause` (die unveränderliche SHA steht in Git/PR; sie kann nicht selbst Bestandteil ihres eigenen Inhalts sein) |
| Audit-Artefakt | `docs/audits/AP-16-06-05H-first-contact-commit-rpc-production-root-cause-audit.md` |
| Audit Result | **ROOT CAUSE IDENTIFIED** |
| Root Cause Identified | **JA** |
| READY for AP-16-06-05H-1 | **JA** |
| Recommended Next Package | `AP-16-06-05H-1 — First-Contact Commit RPC Repair` |

Dieser Audit ist rein statisch und read-only. Er ändert weder Runtime-Code noch SQL, Migrationen oder Production-Daten.

## Executive Summary und exakte Evidenz

Die konkrete Ursache ist Statement O des atomaren Commits:

```sql
perform set_config('app.runtime_authority_mutation','allowed');
```

PostgreSQL stellt `set_config(setting_name text, new_value text, is_local boolean)` bereit; einen Zwei-Argument-Overload gibt es nicht. Der finale Function Body ruft deshalb zur Laufzeit eine nicht existente Funktion auf. PL/pgSQL validiert diesen eingebetteten Ausdruck nicht zwingend bei `CREATE FUNCTION`, sondern plant ihn beim Erreichen des Statements. Der resultierende Fehler entspricht:

```text
function set_config(unknown, unknown) does not exist
```

Alle anderen Authority-Pfade im Repository verwenden korrekt das dritte Argument `true`, einschließlich des unmittelbar als Vorlage dienenden `activate_planner_interaction_snapshot(...)`. Nur `commit_first_contact_initial_prompt(...)` hat den aritätsfalschen Aufruf. Der Fehler liegt nach allen sechs Inserts und unmittelbar vor dem geschützten Runtime-Update. Wegen der Transaktionsatomarität werden die zuvor ausgeführten Inserts vollständig zurückgerollt. Das erklärt exakt den gegebenen Production-Befund: Kontext `eligible`, `commit_rpc_failed`, keine Pending Interaction, kein Snapshot, keine Nachricht, kein Delivery Command und kein Initial-Prompt Runtime Command.

Die Ursache ist daher nicht bloß wahrscheinlich, sondern aus finalem Function Body, PostgreSQL-Funktionsvertrag und beobachtetem atomarem Rollback eindeutig ableitbar.

## Production Failure Fact und Call Graph

Als verifizierte Eingabe gilt Conversation `ed8e842d-e6f4-4c5d-9305-e723d6f6794c`: Foundation vollständig, Runtime Revision 1/`idle`, Knowledge Version 1, keine aktive Pending Interaction/Evidence Request und aktive WhatsApp-Binding/Identity. `get_first_contact_initial_prompt_context(...)` liefert `eligible`; der produktive Diagnosepfad meldet `first_contact_initialization_failed`, `diagnostic_code=commit_rpc_failed`, `stage=commit`.

Der exakte Aufrufpfad ist:

1. `runProductiveFirstContactInitialization(...)`
2. `runFirstContactInitialPrompt(conversationId)`
3. Supabase Service-Role-Client
4. `initializeFirstContactPrompt(...)`
5. `get_first_contact_initial_prompt_context(target_conversation_id)`
6. Assessment → Planner → Renderer → Zod-Snapshot-Validierung
7. `client.rpc("commit_first_contact_initial_prompt", namedArguments)`
8. `public.commit_first_contact_initial_prompt(...)`
9. Exception am Zwei-Argument-Aufruf von `set_config`; PostgREST liefert `error`, der Adapter klassifiziert dies absichtlich inhaltsfrei als `commit_rpc_failed`.

Ein Provider-Call ist nicht Teil dieser Transaktion. Delivery wird erst nach einem erfolgreichen Commit erwogen.

## Statement-für-Statement-Prüfung gegen das finale Schema

| Schritt | Finales Statement / Wirkung | Kann beim gegebenen State scheitern? | Bewertung |
|---|---|---|---|
| A | Conversation `SELECT ... FOR UPDATE` | Nur fehlend, nicht `open` oder ohne Project; dann kontrolliertes `not_applicable`, keine RPC-Exception. | Durch Production-Fakten und `eligible` ausgeschlossen. |
| B | Runtime `SELECT ... FOR UPDATE` | Fehlende Row könnte später NULL-Vergleiche begünstigen, ist aber verifiziert vorhanden und passend. | Kein Blocker. |
| C | Knowledge State `SELECT ... FOR UPDATE` | Fehlend/veraltet ergibt kontrolliertes `stale` oder nachgelagerte Constraint-Probleme. | Version und Row verifiziert. |
| D | aktive WhatsApp-Binding `FOR UPDATE` | Keine oder mehrere aktive Bindings ergeben kontrolliertes `invalid_state`. | Verifiziert genau eine aktive Binding. |
| E | aktive Transport Identity `FOR UPDATE` | Fehlend/inaktiv ergibt kontrolliertes `invalid_state`. | Verifiziert aktiv. |
| F | Snapshot Contract | Casts (`integer`, `uuid`) könnten bei fremdem JSON werfen; Abweichungen ergeben sonst kontrolliertes `invalid_state`. | Der produktive TypeScript-Pfad hat denselben typisierten Planner-/Renderer-Vertrag erfolgreich validiert. Gegen die bekannten Payloads kein aktueller Blocker. |
| G | `resolve_system_actor()` | Actor-Status oder Side-Effect könnte fehlschlagen. | Kette separat geprüft; nicht der statisch zwingende Fehler. |
| H | drei benannte Constraints auf deferred setzen | Würde bei fehlender/nicht deferrable Constraint-Definition werfen. | Production-Verifikation: alle vorhanden und deferrable. |
| I | Snapshot INSERT | PK/Unique/FK/Checks könnten scheitern. | IDs neu; Objekt/Größe/Version vorgeprüft; zirkuläre FKs deferred. |
| J | Message INSERT | Sequenz-/Idempotency-Unique könnten konkurrieren. | Conversation-Lock serialisiert diesen Authority-Pfad; Production hat keinen Initial-Prompt-Datensatz. |
| K | Message Text INSERT | Message-FK/Body-Checks könnten scheitern. | Parent wurde in J angelegt; Append-only-Trigger feuert nicht auf INSERT. |
| L | Pending Interaction INSERT | Enum/CHECK/Casts/FKs könnten scheitern. | Finaler Planner-Vertrag und Production-Inventar passen; Binding-Trigger akzeptiert `answered_by_message_id = NULL`. |
| M | Delivery Command INSERT | Defaults, Identity-/Binding-FKs oder WhatsApp-Unique könnten scheitern. | Spätere Lease-Spalten besitzen zulässige NULL-/0-Defaults; verifizierte Identity/Binding; kein bestehendes Command. |
| N | Runtime Command INSERT | Enum, Actor-FK oder Idempotency-Unique könnten scheitern. | `activate_interaction` existiert, Actor ist verifiziert, kein bestehender Initial-Prompt Command. |
| **O** | **`set_config(..., 'allowed')` mit zwei Argumenten** | **Immer, sobald erreicht: undefinierte PostgreSQL-Funktion.** | **Bewiesene Root Cause.** |
| P | Runtime State UPDATE | Guard verlangt Session-Flag `allowed`; ohne O würde er `runtime_mutation_requires_authority` werfen. | Wird wegen Fehler in O nicht erreicht. Korrektes O mit lokalem Flag autorisiert P. |
| Q | Effort State UPDATE | Row/Checks; fehlende Row würde still 0 Rows aktualisieren. | Vorhandene Row/Revision/Counter verifiziert; wird aktuell nicht erreicht. |
| R | Audit Log INSERT | Actor-FK, RLS oder zukünftige Constraints könnten die Transaktion am Ende stoppen. | Finales Schema hat nur Actor-FK und NOT NULL auf Text/JSON; SECURITY DEFINER beseitigt keine RLS per se, aber Service Role bypassed RLS. Wird aktuell nicht erreicht. |
| S | Deferred Validierung | Zirkuläre Snapshot/Pending/Message-FKs und Constraint-Trigger könnten erst am Ende werfen. | Finaler Zustand ist konsistent, wird aktuell wegen O nie erreicht. |

## Final Schema Drift Analysis

Migration `202609040002_deterministic_initial_prompt_commit.sql` ist die einzige Definition von `commit_first_contact_initial_prompt`. Die danach sortierte Migration `202609040003_productive_first_contact_recovery.sql` fügt nur Eligibility-, Discovery- und Scheduler-Funktionen hinzu; sie ersetzt weder Commit-Funktion noch betroffene Tabellen, Trigger, Enums oder Constraints. Es existiert deshalb kein post-05E Schema-Drift, der den Defekt eingeführt hat: Der falsche Aufruf steht bereits in 05E.

Vor 05E relevante Drift wurde in der finalen Reihenfolge berücksichtigt:

- Planner Snapshot Persistence ergänzt Snapshot-Tabelle, drei deferred FKs, Unique Snapshot-Binding, `offer_assumption` und den deferred Runtime-Snapshot-Guard.
- Delivery Identity/Retry ergänzt Dispatch-Felder und den partiellen Unique Index pro WhatsApp-Message.
- Delivery Lease/Recovery ergänzt nullable Lease-Felder, `execution_attempt_count NOT NULL DEFAULT 0` und einen konsistenten Lease-CHECK. Der 05E-INSERT lässt diese Felder in einem zulässigen Defaultzustand.
- System Actor Authority ergänzt Registry und Resolver. Sie ist vor 05E angelegt.
- Weder Runtime-/Pending-/Snapshot-/Effort- noch Audit-Log-Schema werden nach 05E verändert.

Die inventarisierten 54/54 Commit-Spalten, CHECKs, FKs, Unique Indexes und Trigger werden als bereits verifizierte Production-Fakten akzeptiert und hier nicht als unbestimmte Alternativen wiederholt.

## Deferred Constraint Analysis

Der beabsichtigte Endzustand erfüllt alle deferred Beziehungen:

- `planner_snapshot_pending_fk`: Snapshot `pending_interaction_id = target_interaction_id`; L legt genau diese Pending Row an.
- `planner_snapshot_message_fk`: Snapshot `outbound_message_id = target_outbound_message_id`; J legt genau diese Message an.
- `pending_snapshot_fk`: Pending `snapshot_id = target_snapshot_id`; I legt genau diesen Snapshot an.
- `active_planner_snapshot_required`: P setzt Revision auf `r.revision + 1` und bindet `target_interaction_id`; Snapshot und Pending tragen dieselbe Conversation, dasselbe Project, dieselbe neue Runtime Revision und dieselbe Knowledge Version, und Pending hat Status `pending`.

Die Reihenfolge I → J → K → L ist aufgrund der explizit deferred FKs zulässig. Der Constraint-Trigger sieht am Transaktionsende den vollständigen Zustand. Keine dieser Prüfungen wird im fehlerhaften Lauf erreicht, weil O vor P und vor der Deferred-Endphase wirft; die Transaktion rollt vorher zurück.

## Trigger Body Analysis

- `guard_runtime_identity`: Trigger nur auf UPDATE/DELETE von Pending und Runtime. Bei P prüft er `current_setting('app.runtime_authority_mutation', true) = 'allowed'`. Er greift für Runtime nicht auf `OLD`-Pending-Felder zu; die erste Bedingung ist durch `tg_table_name` kurzgeschlossen. O sollte genau sein Authority-Flag setzen, scheitert aber vorher.
- `guard_runtime_message_binding`: feuert bei Pending INSERT/UPDATE. Bei L ist `answered_by_message_id` NULL, daher erfolgt kein Message-Lookup und `NEW` wird akzeptiert. Kein `OLD`-Zugriff.
- `guard_active_planner_snapshot`: deferred AFTER INSERT/UPDATE auf Runtime; prüft den oben beschriebenen konsistenten Endzustand und verwendet nur `NEW`.
- `set_updated_at`: setzt bei Runtime UPDATE lediglich `NEW.updated_at = now()`; kein Auth-/OLD-Zwang und kein INSERT-Trigger auf Runtime.
- `reject_append_only_change`: wirft bedingungslos, ist aber ausschließlich an UPDATE/DELETE der Message-/Runtime-Command-Tabellen gebunden; J, K und N sind INSERTs.
- `reject_planner_snapshot_change`: wirft bedingungslos, ist aber ausschließlich an Snapshot UPDATE/DELETE gebunden; I ist INSERT.

Keiner dieser finalen Bodies wurde nach 05E ersetzt. Der relevante Guard bestätigt vielmehr die Intention hinter O und macht den fehlenden dritten Parameter besonders eindeutig.

## System Actor Side-Effect Analysis

`resolve_system_actor()` prüft `auth.role() = service_role` und delegiert an `verify_system_actor('klimaguy_system')`. Der Verifier liest Registry, Auth User und Profile, validiert Metadata/Role und aktualisiert danach `system_actor_registry.verified_at`.

Auf `system_actor_registry` gibt es RLS und Revokes für `public`, `anon`, `authenticated`, aber keine Trigger und keinen zusätzlichen Guard. Beide Funktionen sind SECURITY DEFINER mit fixiertem Search Path; der produktive Aufruf erfolgt als Service Role. Der einzige System-Actor-Trigger schützt `profiles` vor UPDATE/DELETE und wird durch das Registry-UPDATE nicht ausgelöst. Die verifizierte Actor-Konsistenz plus diese Side-Effect-Kette schließen G als aktuellen statischen Blocker aus. Auch das `verified_at`-Update wird bei O zusammen mit der Gesamttransaktion zurückgerollt.

## Audit Log Analysis

Der finale Insert setzt alle NOT-NULL-Felder: `entity_type='conversation'`, Conversation-UUID als `entity_id`, feste `action`, objektförmige `metadata` und den verifizierten Auth-User als `actor_id`. `actor_id` referenziert `auth.users(id)`; dieser User ist laut Production-Fakt vorhanden. Das initiale Schema aktiviert RLS und entzieht `anon`/`authenticated` direkten Zugriff. Der RPC läuft als SECURITY DEFINER und wird nur Service Role gewährt; keine spätere Migration fügt einen Audit-Trigger oder einen einschränkenden CHECK hinzu. R ist somit final-schema-kompatibel, wird wegen O aber nie erreicht.

## RPC Signature, Argument Shape, Overloads und Schema Cache

Repositoryweit existiert genau eine Commit-Signatur:

```text
(uuid, uuid, integer, integer, uuid, uuid, uuid, uuid, timestamptz, jsonb, text) -> jsonb
```

Die elf benannten TypeScript-Argumente stimmen exakt mit den SQL-Parametern überein:

| TypeScript / PostgREST Name | PostgreSQL-Typ | Quelle |
|---|---|---|
| `target_conversation_id` | `uuid` | validierter Context |
| `expected_project_id` | `uuid` | validierter Context |
| `expected_knowledge_version` | `integer` | positive Zod-Integer-Version |
| `expected_runtime_revision` | `integer` | positive Zod-Integer-Revision |
| vier `target_*_id` | je `uuid` | `randomUUID()` |
| `target_occurred_at` | `timestamptz` | `Date.toISOString()` |
| `target_snapshot` | `jsonb` | erfolgreich validiertes Objekt |
| `target_outbound_text` | `text` | Renderer-Komposition |

Reihenfolge ist bei PostgRESTs Named Mapping nicht relevant; Namen und Nullability stimmen. Es gibt keine zweite Migration mit `CREATE`, `CREATE OR REPLACE` oder `DROP` derselben Commit-Funktion und damit keinen repositoryseitigen Overload. Ein stale PostgREST Schema Cache ist abstrakt möglich, aber weder belegt noch erforderlich, um den beobachteten Fehler zu erklären. Da der produktive RPC als Commit-RPC aufgelöst wird und dessen Body einen zwingenden Laufzeitfehler enthält, wird Schema Cache nicht als Root Cause eingestuft.

## Test Coverage Gap

Die First-Contact-Tests verwenden für beide RPCs ausschließlich Vitest-Mocks. Der Erfolgsfall gibt synthetisch `initialized` zurück; der Fehlerfall prüft nur, dass ein beliebiger RPC-Fehler sicher als `commit_rpc_failed` klassifiziert und sein Inhalt nicht geloggt wird. Die Migrationstests lesen SQL als Text und prüfen grobe Presence-/Ordering-/Security-Muster. Sie parsen oder kompilieren PL/pgSQL nicht und erwarten nicht die korrekte dreistellige `set_config`-Signatur.

Auch Planner Snapshot-, Delivery Authority- und Runtime Authority-Tests sind Unit- bzw. SQL-Text-Contract-Tests. Es gibt keinen migration-backed Test, der alle Migrationen in Reihenfolge auf einer echten PostgreSQL-Instanz anwendet, System Actor/Auth/Profile seeded, den 05E-Commit ausführt, deferred Constraints bis Transaktionsende erzwingt und Audit/Delivery/Runtime gemeinsam prüft. Deshalb konnten weder der Laufzeitfehler in O noch echte Trigger-, Deferred-, Registry-Side-Effect- oder Audit-Log-Fehler entdeckt werden.

Eine lokale DB-Reproduktion ist in der aktuellen Umgebung nicht möglich: PostgreSQL/Supabase CLI bzw. eine konfigurierte lokale Instanz stehen nicht bereit. Das beeinträchtigt die statische Beweisführung nicht; die fehlende Zwei-Argument-Signatur kann zusätzlich rein lesend im Production-Katalog bestätigt werden.

## Priorisiertes Root-Cause Ranking

### 1. Bewiesen: falsche `set_config`-Arität in Statement O

- **Stelle:** direkt nach Runtime Command INSERT, vor Runtime State UPDATE.
- **Repository-Begründung:** Zwei Argumente in 05E; sämtliche vergleichbaren Authority-Aufrufe verwenden drei, insbesondere `..., 'allowed', true`.
- **Dafür:** erklärt RPC-Exception und vollständigen atomaren Rollback exakt; wird auf jedem ansonsten erfolgreichen Initial-Commit erreicht.
- **Dagegen:** keine Production-Fakten.
- **Ein Beweisschritt:** der unten beschriebene eine read-only Katalog-Check.

### 2. Stark widerlegt: Exception in einem Insert I–N

- **Stelle:** Snapshot, Message, Text, Pending, Delivery oder Runtime Command INSERT.
- **Repository-Begründung:** Cast-/CHECK-/FK-/Unique-Punkte existieren, sind aber mit dem validierten Payload und den bereits erhobenen Production-Inventaren konsistent.
- **Dafür:** eine unbekannte, vom Repository abweichende Production-Definition könnte ebenfalls eine Exception erzeugen.
- **Dagegen:** 54/54 Spalten, CHECKs, FKs, Unique Indexes, Trigger und leerer Zielzustand wurden produktiv verifiziert; außerdem bleibt O unabhängig davon sicher defekt.
- **Beweis/Widerlegung im selben Schritt:** `pg_get_functiondef` im Katalog-Check stellt sicher, dass Production den defekten finalen Body tatsächlich hat; ein Ausführungstest ist zur Root-Cause-Feststellung nicht nötig.

### 3. Stark widerlegt: System-Actor-Side-Effect oder finaler Audit Insert

- **Stelle:** G beziehungsweise R.
- **Repository-Begründung:** Registry-UPDATE besitzt keinen Trigger; Service Role/SECURITY DEFINER und verifizierter Auth-FK passen. Audit besitzt keinen zusätzlichen finalen Guard.
- **Dafür:** beide Statements können grundsätzlich eine Transaktion zurückrollen.
- **Dagegen:** Actor-Gültigkeit ist produktiv bewiesen; R wird wegen O nicht erreicht.
- **Beweis/Widerlegung im selben Schritt:** Production-`pg_get_functiondef` lokalisiert O zwischen G und R; Existenz nur der dreistelligen Built-in-Signatur beweist, dass die Ausführung spätestens dort zwingend endet.

## Kleinster nächster Beweisschritt

Vor einer Reparatur genau **einen rein lesenden Production-Katalog-Check** als Service Role bzw. DB-Operator ausführen; er mutiert keine Conversation und benötigt weder Planner-/Renderer-Payload noch Provider/LLM:

```sql
select
  pg_get_functiondef(
    'public.commit_first_contact_initial_prompt(uuid,uuid,integer,integer,uuid,uuid,uuid,uuid,timestamptz,jsonb,text)'::regprocedure
  ) like '%set_config(''app.runtime_authority_mutation'',''allowed'');%' as production_has_broken_call,
  to_regprocedure('pg_catalog.set_config(text,text)') is null as two_argument_overload_absent,
  to_regprocedure('pg_catalog.set_config(text,text,boolean)') is not null as three_argument_signature_present;
```

Erwartetes eindeutiges Ergebnis: dreimal `true`. Dies bestätigt zugleich Production-Body und Built-in-Vertrag, ohne die bestehende Conversation anzufassen. Weil der Root Cause bereits statisch identifiziert ist, ist ein rollbackbarer mutierender Function-Test unnötig und gegenüber diesem Katalog-Check weniger sicher. Reale Planner-/Renderer-Payloads müssen für diesen Beweis ausdrücklich nicht erzeugt, erfunden, gespeichert oder geloggt werden.

## Kleinstes Repair-Paket

### AP-16-06-05H-1 — First-Contact Commit RPC Repair

- **Exakte Datei:** eine neue, vorwärtsgerichtete Supabase-Migration nach `202609040003`; historische Migration 05E nicht umschreiben.
- **Exakte Änderung:** `CREATE OR REPLACE FUNCTION public.commit_first_contact_initial_prompt(...)` mit unverändertem Vertrag/Body bis auf `perform set_config('app.runtime_authority_mutation','allowed',true);`. Grants, fixed Search Path und Kommentar erhalten.
- **Migration:** **ja**, weil Production-Function Body repariert werden muss.
- **Regression Tests:** (1) SQL-Contract-Test verlangt exakt die Drei-Argument-Form und verbietet die Zwei-Argument-Form; (2) migration-backed PostgreSQL-Test mit allen Migrationen, seeded System Actor und initialem validen Zustand; echter Commit bis zur deferred Endphase; Assertions auf Snapshot, Message/Text, Pending, Delivery Command, Runtime Command, Runtime Revision/Binding, Effort und Audit; Transaktion im Test rollbacken. (3) bestehende First-Contact-, Planner-, Delivery- und Runtime-Suites.
- **Production Verification:** Migration deployen; Signatur und `pg_get_functiondef` read-only prüfen; dann den bestehenden Recovery-Pfad die unveränderte Conversation erneut verarbeiten lassen. Erwartet: genau eine atomare Initialisierung, kein unmittelbarer Provider-Call durch die Commit-Funktion, Runtime Revision 2 und konsistente persistierte IDs. Keine manuelle Mutation der bestehenden Conversation.

## Endergebnis

**ROOT CAUSE IDENTIFIED**

Der 05E-Commit ruft `set_config` mit zwei statt drei Argumenten auf. **Root Cause Identified: JA. READY for AP-16-06-05H-1: JA.**
