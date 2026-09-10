# AP-16-06-06D-20 — Production Runtime-Update Undefined-Column Repair

## 1. Baseline SHA

Audit- und Implementierungsbasis ist der aktuelle `main`-Merge-Stand
`2fe49a0ddfe8f26c6df501f5ce31a8ef39bd4381` (PR #209 / D-19).

## 2. Production Evidence

Der reale Recovery-Lauf meldet den D-18-Kandidaten als erkannt und versucht, aber
nicht erfolgreich rehabilitiert. Der Recovery-Item-Fehler liegt in `acquisition`,
vor Authority-Context, OpenAI und Normalisierung. D-19 grenzt die atomare
Rehabilitation weiter auf `runtime_update` ein. Damit sind Discovery,
Recovery-Pending-Insert, Recovery-Snapshot-Insert und Effort-State-Update bereits
erreicht; wegen der Exception werden sie dennoch gemeinsam zurückgerollt.

## 3. `safe_rpc_code` 42703

`safe_rpc_code = 42703` ist PostgreSQL `undefined_column`. D-19 bewahrt dabei den
originalen SQLSTATE, gibt aber statt der rohen, potenziell personenbezogenen
DB-Message nur einen statischen Phasenbezeichner weiter.

## 4. `safe_db_stage` `runtime_update`

Die unmittelbar markierte Anweisung ist das `UPDATE` auf
`public.conversation_runtime_states`. Alle fünf dort verwendeten Spalten existieren:
`revision`, `runtime_status`, `active_pending_interaction_id`, `updated_at` und
`conversation_id`. Der Fehler liegt deshalb nicht in der UPDATE-Spaltenliste,
sondern in einem auf diesem UPDATE ausgeführten Trigger.

## 5. Exakter undefinierter Spaltenname

Der exakte erste nicht auflösbare Feldname ist **`decision_id`**. Die Runtime-Tabelle
besitzt dieses Feld nicht; es gehört ausschließlich zu
`conversation_pending_interactions`.

## 6. Exakte auslösende Funktion/SQL-Stelle

D-18 ersetzt `public.guard_runtime_identity()` nach der früheren D-15-Reparatur
erneut durch eine einzeilige generische Bedingung:

```sql
if tg_table_name='conversation_pending_interactions' and (
  ... or new.decision_id<>old.decision_id ...
) then ...
```

Dieselbe Funktion ist Triggerfunktion von `runtime_header_guard`. Bei einem Runtime-
UPDATE haben `NEW` und `OLD` den Rowtype von `conversation_runtime_states`.
PostgreSQL bereitet die zusammengesetzte PL/pgSQL-Ausdrucksanweisung gegen diesen
Trigger-Rowtype auf; ein SQL-`AND` ist keine Grenze für die Feldauflösung. Nach den
auf beiden Tabellen vorhandenen Feldern `conversation_id` und `project_id` ist
`NEW.decision_id`/`OLD.decision_id` die erste unbekannte Row-Property und PostgreSQL
wirft 42703.

## 7. Warum frühere statische Checks dies nicht gezeigt haben

Die D-15-Regression prüfte nur die damalige Migration
`202609070001_isolate_pending_interaction_runtime_guard.sql`. Deren explizite äußere
Tabellenverzweigung war korrekt. D-18 fügte das neue immutable Recovery-Lineage-Feld
hinzu, ersetzte dabei aber die gesamte Funktion wieder mit dem älteren kombinierten
`AND`-Muster. Der D-18-Test prüfte Schutzfelder und Rehabilitation statisch, jedoch
nicht den nach allen Migrationen effektiv geltenden Triggervertrag für einen Runtime-
Rowtype. D-19 diagnostizierte absichtlich nur Phase und SQLSTATE.

## 8. Reparatur

Die einzige forward-only Migration
`202609100005_production_runtime_update_undefined_column_repair.sql` ersetzt nur
`guard_runtime_identity()`. Sämtliche Pending-Identity-Referenzen stehen wieder in
einem äußeren `IF tg_table_name = 'conversation_pending_interactions'`-Block. Das in
D-18 ergänzte Feld `recovery_of_pending_interaction_id` bleibt unveränderlich.
Tabellen, Trigger, Daten und D-19-Funktionen werden nicht geändert.

## 9. Schutz-/Trigger-Semantik nach Fix

Auf `conversation_runtime_states` wirken beim UPDATE:

1. `conversation_runtime_updated`, `BEFORE UPDATE`, ruft `set_updated_at()` auf und
   schreibt ausschließlich das vorhandene `NEW.updated_at`. Trigger gleicher Art
   laufen nach Namen; dieser Trigger läuft daher vor `runtime_header_guard`.
2. `runtime_header_guard`, `BEFORE UPDATE OR DELETE`, ruft
   `guard_runtime_identity()` auf. Für Runtime-Zeilen werden keine Pending-Felder
   aufgelöst; die transaktionslokale Authority-Anforderung bleibt unverändert.
3. `active_planner_snapshot_required`, deferred `AFTER INSERT OR UPDATE` Constraint-
   Trigger, prüft für aktive Pending-Runtime weiterhin Conversation, Project,
   Pending-Status, Runtime-Revision, Knowledge-Version und passenden Snapshot.

`guard_active_planner_snapshot()` referenziert an `NEW` nur Runtime-Felder, die die
Tabelle besitzt. Seine Unterabfragen referenzieren qualifizierte Pending- und
Snapshot-Spalten. Keine der drei Funktionen ruft eine weitere triggerrelevante
Routine auf. Die D-20-Migration schwächt daher weder Identity-, Authority- noch
Snapshot-Schutz.

## 10. D-18/D-19/D-17-Integration

Die D-18-Rehabilitation rekonstruiert weiterhin genau eine Recovery-Pending- und
Recovery-Snapshot-Zeile, erhöht Effort und Runtime von `human_review / N` auf
`awaiting_customer_answer / N+1`, bindet die Runtime an das neue Pending und lässt
die Knowledge-Version unverändert. Danach wird dasselbe Command auf Semantik v2
rehabilitiert und an die unveränderte D-17-Acquisition übergeben. D-19 behält
`safe_rpc_code`, `safe_rpc_summary` und `safe_db_stage`; rohe DB-Messages werden
nicht protokolliert.

Es gibt keinen Kunden-Resend, keinen neuen Inbound, keine neue Prompt-Message, keinen
Counter-Reset, keine Änderung der AI-/WhatsApp-Max-3-Semantik und kein technisches
Lifetime-Ausführungslimit. Der historische `ai_inference_attempt_count` bleibt
unverändert.

## 11. Tests

Der D-20-Regressionstest ermittelt aus dem von D-18 hinterlassenen Guard und dem
Runtime-Tabellenvertrag reproduzierbar `decision_id` als erstes nicht auflösbares
Feld. Er validiert danach die tabellenlokale Feldauflösung der neuen Funktion, alle
Runtime-UPDATE-Spalten, Authority- und Planner-Schutz, die Production-artigen Legacy-
V1-Voraussetzungen, Pending/Snapshot/Effort/Runtime-Lineage, unveränderte Knowledge-
Version, Command-v2-Rehabilitation, anschließende D-17-Acquisition sowie das Ausbleiben
von Message-Insert und Attempt-Counter-Reset. Zusätzlich werden die bestehenden
Migrationstests und die vollständige Vitest-, TypeScript- und ESLint-Prüfung
ausgeführt.

## 12. Geänderte Dateien

- `supabase/migrations/202609100005_production_runtime_update_undefined_column_repair.sql`
- `test/production-runtime-update-undefined-column-repair-migration.test.ts`
- `docs/audits/AP-16-06-06D-20-production-runtime-update-undefined-column-repair.md`

## 13. Migration

Production-Migration erforderlich: **JA**. Exakter Dateiname:
`202609100005_production_runtime_update_undefined_column_repair.sql`.
Die Migration enthält weder DML noch Incident-UUIDs und editiert keine historische
Migration.

## 14. Production-Aktivierung

Die neue Migration regulär auf Production anwenden. Es sind keine Bestandsdaten-
Mutation, kein Counter-Reset und kein Kunden-Resend erforderlich. Anschließend den
normalen Recovery-Runner erneut ausführen; keine incident-spezifische DML ist nötig.

## 15. Erwarteter nächster Recovery-Trace

Für den belegten Legacy-v1-Fall wird
`conversation_cycle_legacy_human_review_rehabilitation` mit `candidate: true`,
`attempted: true`, `succeeded: true` und `result_code: rehabilitated` erwartet.
Danach erreicht derselbe Lauf die normale D-17-Acquisition. Ein künftig anderer
DB-Fehler bleibt über `safe_rpc_code`, `safe_rpc_summary` und den statischen
`safe_db_stage` sichtbar, ohne rohe DB-Message.
