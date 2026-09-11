## 1. Exakte Definition und Herkunft

`one_original_snapshot_per_outbound` gehört zur Tabelle `public.conversation_interaction_snapshots`.

Die Definition lautet:

```sql
create unique index one_original_snapshot_per_outbound
 on public.conversation_interaction_snapshots(outbound_message_id)
 where recovery_of_snapshot_id is null;
```

Damit gilt:

- **Tabelle:** `public.conversation_interaction_snapshots`
- **Indexspalte:** ausschließlich `outbound_message_id`
- **Prädikat:** nur Datensätze mit `recovery_of_snapshot_id IS NULL`
- **Objekttyp:** ein eigenständiger partieller **UNIQUE INDEX**, keine mit `ALTER TABLE ... ADD CONSTRAINT` angelegte UNIQUE-Constraint
- **Angelegt in:** `supabase/migrations/202609100003_legacy_ai_exhaustion_human_review_rehabilitation.sql`
- Unmittelbar davor wurde die ursprüngliche unbedingte Unique-Constraint `conversation_interaction_snapshots_outbound_message_id_key` entfernt. 【F:supabase/migrations/202609100003_legacy_ai_exhaustion_human_review_rehabilitation.sql†L8-L17】

Die PostgreSQL-Fehlermeldung bezeichnet eine Verletzung eines Unique-Index ebenfalls als Verletzung einer „unique constraint“. Der Repository-DDL zufolge ist das benannte Objekt dennoch ein partieller Unique-Index.

---

## 2. Exakte 0005-Anweisung, die den Fehler auslöst

Der determinierbare Auslöser ist nicht das `DELETE`, sondern dieses `UPDATE`:

```sql
update public.conversation_interaction_snapshots
  set recovery_of_snapshot_id=null
  where conversation_id in(select id from reset_conversations);
```

Diese Anweisung steht vor den Snapshot- und Pending-Deletes. 【F:supabase/migrations/202609110005_fix_reset_snapshot_pending_cycle.sql†L123-L133】

### Unmittelbarer Ausführungspfad

1. Ein ursprünglicher Snapshot hat:
   - `outbound_message_id = c3ee55ca-63a1-4eaa-8931-ddfadfcad368`
   - `recovery_of_snapshot_id IS NULL`
   - und befindet sich deshalb bereits im partiellen Unique-Index.

2. Der zugehörige Recovery-Snapshot besitzt absichtlich **dieselbe** `outbound_message_id`, aber zunächst:
   - `recovery_of_snapshot_id = <ID des ursprünglichen Snapshots>`
   - und befindet sich deshalb zunächst **nicht** im partiellen Index.

3. 0005 setzt beim Recovery-Snapshot `recovery_of_snapshot_id = NULL`.

4. Dadurch erfüllt der Recovery-Snapshot plötzlich das Indexprädikat:

   ```sql
   where recovery_of_snapshot_id is null
   ```

5. PostgreSQL versucht, auch diesen Datensatz unter derselben `outbound_message_id` in `one_original_snapshot_per_outbound` aufzunehmen.

6. Der ursprüngliche Snapshot ist zu diesem Zeitpunkt noch vorhanden, weil das `DELETE` erst danach ausgeführt werden soll.

7. Die Indexpflege des `UPDATE` scheitert daher sofort mit `23505`; PostgreSQL erreicht das nachfolgende `DELETE` nicht.

**Das `UPDATE conversation_pending_interactions SET snapshot_id = NULL, recovery_of_pending_interaction_id = NULL` ist nicht der Pfad zur gemeldeten Outbound-Unique-Verletzung:** Diese Tabelle besitzt keine von `one_original_snapshot_per_outbound` erfasste Spalte, und ihre Trigger schreiben weder Snapshots noch `outbound_message_id`. 【F:supabase/migrations/202609110005_fix_reset_snapshot_pending_cycle.sql†L123-L129】【F:supabase/migrations/202609100003_legacy_ai_exhaustion_human_review_rehabilitation.sql†L12-L14】

---

## 3. Exakte Trigger und Funktionen auf den beiden Tabellen

### `conversation_interaction_snapshots`

Der Repository-Migrationsverlauf definiert einen Trigger:

```sql
create trigger planner_snapshot_immutable
before update or delete
on public.conversation_interaction_snapshots
for each row execute function public.reject_planner_snapshot_change();
```

Seine Funktion führt ausschließlich aus:

```sql
begin
  raise exception 'planner_snapshot_immutable';
end
```

Sie erzeugt keinen Snapshot, kopiert keinen Snapshot und ändert keine `outbound_message_id`. 【F:supabase/migrations/202609010001_planner_snapshot_persistence.sql†L32-L35】

### `conversation_pending_interactions`

Es gibt zwei relevante Trigger:

#### `pending_interaction_guard`

```sql
create trigger pending_interaction_guard
before update or delete
on public.conversation_pending_interactions
for each row execute function public.guard_runtime_identity();
```

【F:supabase/migrations/202608230005_persistent_conversation_runtime.sql†L80-L84】

Die effektive, zuletzt ersetzte Funktion:

- prüft die Identitätsfelder der Pending Interaction;
- betrachtet dabei auch `recovery_of_pending_interaction_id`;
- verlangt anschließend die Runtime-Mutationsberechtigung;
- gibt ansonsten lediglich `NEW` zurück.

Sie enthält kein `INSERT`, kein Snapshot-Copying und kein Schreiben von `outbound_message_id`. 【F:supabase/migrations/202609100005_production_runtime_update_undefined_column_repair.sql†L2-L37】

#### `pending_message_binding`

```sql
create trigger pending_message_binding
before insert or update
on public.conversation_pending_interactions
for each row execute function public.guard_runtime_message_binding();
```

Die Funktion liest bei gesetzter `answered_by_message_id` lediglich die Conversation der referenzierten Nachricht und validiert deren Bindung. Danach gibt sie `NEW` zurück. Sie führt ebenfalls weder Snapshot-`INSERT`s noch Snapshot-`UPDATE`s aus. Außerdem feuert sie nicht bei `DELETE`. 【F:supabase/migrations/202608230005_persistent_conversation_runtime.sql†L98-L103】

### DELETE-Trigger

- Beim Snapshot-`DELETE` könnte nur `planner_snapshot_immutable` feuern; dieser Trigger wird im Reset deaktiviert und würde ohnehin ausschließlich eine Exception werfen.
- Beim Pending-`DELETE` könnte `pending_interaction_guard` feuern; auch dieser wird deaktiviert und würde keine Snapshot-Zeile erzeugen.
- `pending_message_binding` feuert nicht auf `DELETE`.
- Im Repository gibt es keinen `AFTER UPDATE`, `AFTER DELETE` oder anderen Trigger auf einer dieser beiden Tabellen, der einen Recovery-Snapshot anlegt oder `outbound_message_id` verändert.

---

## 4. Exakte Mutation, die zur Kollision führt

Die Recovery-Zeile wird ursprünglich durch `public.rehabilitate_legacy_ai_exhaustion_human_review(...)` angelegt.

Die Funktion lädt den ursprünglichen Snapshot in `s`:

```sql
select * into s
from public.conversation_interaction_snapshots
where id=p.snapshot_id;
```

【F:supabase/migrations/202609100003_legacy_ai_exhaustion_human_review_rehabilitation.sql†L56-L60】

Anschließend erzeugt sie einen Recovery-Snapshot und kopiert ausdrücklich die Outbound-Identität des Originals:

```sql
insert into public.conversation_interaction_snapshots(
  ...,
  outbound_message_id,
  outbound_message_sequence,
  ...,
  recovery_of_snapshot_id
)
values(
  ...,
  s.outbound_message_id,
  s.outbound_message_sequence,
  ...,
  s.id
);
```

【F:supabase/migrations/202609100003_legacy_ai_exhaustion_human_review_rehabilitation.sql†L69-L74】

Somit ist die identische `outbound_message_id` zwischen Original und Recovery **beabsichtigtes Repository-Verhalten**. Die Eindeutigkeit bleibt nur deshalb zunächst gültig, weil:

- das Original `recovery_of_snapshot_id IS NULL` hat und im Index liegt;
- die Recovery-Zeile `recovery_of_snapshot_id = s.id` hat und vom Indexprädikat ausgeschlossen ist.

Die kollidierende Mutation erfolgt dann direkt durch 0005:

```sql
set recovery_of_snapshot_id = null
```

【F:supabase/migrations/202609110005_fix_reset_snapshot_pending_cycle.sql†L127-L129】

Es wird also **kein neuer Snapshot erzeugt**. Stattdessen wird ein existierender Recovery-Snapshot durch die Änderung seiner Lineage-Spalte zu einem zweiten „Original“ im Sinne des partiellen Unique-Index umklassifiziert. Diese Index-Neuklassifizierung ist die Ursache der `23505`.

---

## 5. Triggerstatus im Fehlerzeitpunkt

0005 deaktiviert beide mutabilitätsbezogenen Trigger **vor** den neuen Detachment-Updates:

```sql
alter table public.conversation_interaction_snapshots
  disable trigger planner_snapshot_immutable;

alter table public.conversation_pending_interactions
  disable trigger pending_interaction_guard;
```

Das geschieht in Zeilen 103–104. Die Detachment-Updates folgen erst in Zeilen 124–129. 【F:supabase/migrations/202609110005_fix_reset_snapshot_pending_cycle.sql†L96-L105】【F:supabase/migrations/202609110005_fix_reset_snapshot_pending_cycle.sql†L123-L129】

Daraus folgt:

- `planner_snapshot_immutable` ist beim Snapshot-`UPDATE` **deaktiviert**.
- `pending_interaction_guard` ist beim Pending-`UPDATE` **deaktiviert**.
- `pending_message_binding` wird von 0005 **nicht deaktiviert** und feuert daher auf dem Pending-`UPDATE`; seine Funktion validiert aber nur `answered_by_message_id` und erzeugt oder verändert keinen Snapshot. 【F:supabase/migrations/202608230005_persistent_conversation_runtime.sql†L98-L103】
- Für den fehlschlagenden Snapshot-`UPDATE` existiert kein verantwortlicher Side-Effect-Trigger.
- Der partielle Unique-Index bleibt selbstverständlich aktiv. `DISABLE TRIGGER` deaktiviert keine Indexpflege.

Auch:

```sql
set constraints all deferred;
```

verhindert diesen Fehler nicht. Der relevante Gegenstand ist ein eigenständiger partieller Unique-Index und keine deferrable UNIQUE-Constraint. Die Eindeutigkeit wird deshalb während des `UPDATE` geprüft. 0005 führt das Deferment vor den Trigger-Deaktivierungen und Updates aus, aber es erfasst diesen Index nicht. 【F:supabase/migrations/202609110005_fix_reset_snapshot_pending_cycle.sql†L96-L104】

---

## 6. Beweisstatus

### Aus Repository-Code bewiesen

Der Root Cause ist aus Repository-Code und dem gemeldeten Constraint-/Indexnamen beweisbar:

1. Der Index erfasst `outbound_message_id` genau dann, wenn `recovery_of_snapshot_id IS NULL`. 【F:supabase/migrations/202609100003_legacy_ai_exhaustion_human_review_rehabilitation.sql†L12-L14】
2. Die Rehabilitationsfunktion kopiert `s.outbound_message_id` in den Recovery-Snapshot und setzt dessen `recovery_of_snapshot_id` auf `s.id`. 【F:supabase/migrations/202609100003_legacy_ai_exhaustion_human_review_rehabilitation.sql†L71-L74】
3. 0005 setzt diese Lineage-Spalte auf `NULL`, bevor es Original und Recovery löscht. 【F:supabase/migrations/202609110005_fix_reset_snapshot_pending_cycle.sql†L123-L133】
4. Damit qualifizieren sich Original und Recovery gleichzeitig für denselben partiellen Unique-Index.
5. Die gemeldete `23505` nennt genau diesen Index und genau die darin erfasste Spalte.

### Nicht aus Repository-Daten beweisbar

Nicht im Repository enthalten sind die konkreten Produktionszeilen für die angegebene UUID. Deshalb lassen sich deren konkrete Snapshot-IDs nicht benennen. Die Fehlermeldung beweist jedoch, dass beim `UPDATE` bereits ein qualifizierender Indexeintrag für diese `outbound_message_id` vorhanden war. Zusammen mit dem expliziten Recovery-Copy-Verhalten ist der Ausführungspfad eindeutig.

Es fehlen **keine Triggerdefinitionen**, die zur Erklärung dieses Fehlers erforderlich wären. Der Fehler ist kein Trigger-Side-Effect.

---

## 7. Kleinster konzeptioneller Fix — nicht implementiert

Der kleinste konzeptionelle Fix besteht darin, die Recovery-Lineage **nicht vor dem Löschen zu nullen**.

Die beiden Snapshot-Zeilen müssen gelöscht werden, ohne den Recovery-Snapshot zuvor durch

```sql
recovery_of_snapshot_id = NULL
```

zu einem zweiten „Original“ im partiellen Index zu machen.

Konzeptionell muss der Reset daher die Snapshot-Selbstreferenz auf eine Weise behandeln, die:

- die Original-/Recovery-Klassifikation bis zur Löschung bewahrt;
- Original und Recovery innerhalb der Transaktion entfernt;
- die bestehende deferrable FK-Behandlung nutzt, soweit diese für die Self-Reference anwendbar ist;
- keine zwischenzeitliche Verletzung des partiellen Unique-Index erzeugt.

Das ist ausdrücklich **keine** Empfehlung für einen neuen Constraint-by-Constraint-Patch und wurde nicht implementiert.

---

## 8. Inspizierte Dateien und Prüfungen

### Dateien

- `AGENTS.md`
- `supabase/migrations/202608230005_persistent_conversation_runtime.sql`
- `supabase/migrations/202609010001_planner_snapshot_persistence.sql`
- `supabase/migrations/202609100003_legacy_ai_exhaustion_human_review_rehabilitation.sql`
- `supabase/migrations/202609100005_production_runtime_update_undefined_column_repair.sql`
- `supabase/migrations/202609110001_safe_test_customer_reset.sql`
- `supabase/migrations/202609110002_fix_safe_test_customer_reset_current_schema.sql`
- `supabase/migrations/202609110003_remove_missing_cycle_events_from_test_reset.sql`
- `supabase/migrations/202609110004_reset_test_customer_production_fk_graph.sql`
- `supabase/migrations/202609110005_fix_reset_snapshot_pending_cycle.sql`

### Durchgeführte Read-only-Prüfungen

- ✅ `find .. -name AGENTS.md -print`
- ✅ `rg -n -C 10 "one_original_snapshot_per_outbound" supabase/migrations docs`
- ✅ `nl -ba supabase/migrations/202609110005_fix_reset_snapshot_pending_cycle.sql`
- ✅ `rg -n -i -U "create\s+(constraint\s+)?trigger[\s\S]{0,500}?on\s+(public\.)?(conversation_pending_interactions|conversation_interaction_snapshots)" supabase/migrations`
- ✅ `rg -n -i "create .*trigger .*conversation_(pending_interactions|interaction_snapshots)|on public\.conversation_(pending_interactions|interaction_snapshots)" supabase/migrations`
- ✅ `nl -ba supabase/migrations/202609100003_legacy_ai_exhaustion_human_review_rehabilitation.sql | sed -n '1,240p'`
- ✅ `nl -ba supabase/migrations/202608230005_persistent_conversation_runtime.sql | sed -n '98,125p'`
- ✅ `nl -ba supabase/migrations/202609100005_production_runtime_update_undefined_column_repair.sql`
- ✅ `git status --short && git diff --exit-code` — Arbeitsbaum unverändert; keine Datei erstellt oder modifiziert.
- ✅ `git status --branch --short` — Branch `work`, keine Änderungen.

Es wurde entsprechend der Anweisung **nichts implementiert, keine Migration 0006 erstellt, nichts committed und kein Pull Request angelegt**.
