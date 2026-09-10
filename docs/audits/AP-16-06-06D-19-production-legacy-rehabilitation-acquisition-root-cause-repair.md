# AP-16-06-06D-19 – Production Legacy Rehabilitation Acquisition Diagnostics

## 1. Baseline

Baseline ist `d14aabc01dd189079df5d2f3a6c6ccf4bcf2b922` (aktueller lokaler `main`-Merge-Stand zu Arbeitsbeginn).

## 2. Production-Symptom

Discovery findet genau einen bestehenden D-18-Kandidaten. Die Acquisition endet vor Authority-Read, Normalisierung und Provider-Aufruf mit `persistence_failed` / `rpc_error`. Der bisherige Rehabilitation-Callback läuft erst nach erfolgreichem RPC-Return; deshalb bedeutete `attempted:false / not_attempted` nicht, dass PostgreSQL die Rehabilitation nicht betreten hatte.

## 3. Ausgeschlossene Ursachen

Die Production-Read-only-Prüfungen zu deferrable Pending↔Snapshot-FKs, Partial-Unique-Indizes, Pending-/Runtime-Checks und Guards, Effort-State-Checks, Pflichtspalten sowie `audit_log` wurden als gegeben übernommen. D-19 erfindet dafür keine Ersatzhypothese und enthält keine Bestandsdatenkorrektur.

## 4. Vollständige D-18-Write-Sequenz

Nach Service-Role-Prüfung und Command-Lock sperrt die Funktion Conversation, Runtime und ursprüngliches Pending. Sie liest Snapshot und Source, prüft unveränderte Conversation-/Runtime-/Knowledge-/Pending-/Snapshot-Linie, fehlenden neueren Inbound, fehlendes neueres Pending und den technischen Human-Review-Auditnachweis. Danach:

1. Constraints deferred setzen;
2. Recovery-Pending mit neuer UUID, Revision `N+1`, unverändertem Prompt und Original-Pending-Lineage einfügen;
3. Recovery-Snapshot mit neuer UUID und Original-Snapshot-Lineage einfügen;
4. `app.runtime_authority_mutation=allowed` lokal setzen;
5. Effort-State auf `N+1` nachziehen;
6. Runtime auf `awaiting_customer_answer`, Recovery-Pending und `N+1` setzen;
7. denselben Command atomar auf `failed/cycle_failed`, Semantics v2 und Recovery-Pending umstellen, Terminal-Timestamps/-Result-Revisions konsistent leeren, Lease freigeben und historischen AI-Zähler unverändert lassen;
8. Audit-Eintrag schreiben;
9. D-17-Acquisition aufrufen, die den rehabilitierten `failed` Command normal leased und auf `processing` setzt.

Alle Zielspalten wurden gegen die wirksamen Migrationen geprüft: Typen und NOT NULL-Werte stimmen; die gegenseitigen FKs sind deferred; Lineage-Unique-Indizes erlauben genau einen Nachfolger; Runtime- und Command-Timestamp-Checks erhalten einen legalen Endzustand; Security Definer und Grants bleiben unverändert; der Authority-Mutation-Schalter steht vor den bewachten Updates. Die D-17-Claim-Funktion erkennt den neuen `failed/cycle_failed` Zustand nicht als terminalen Replay.

## 5. Root Cause / Stop-Bedingung

**Root Cause noch nicht abschließend bewiesen; D-19 instrumentiert exakt den nächsten Production-Fehler.**

Die vollständige statische Prüfung belegt keinen einzelnen Schemawiderspruch, und in dieser Umgebung steht kein mit dem Production-Datensatz reproduzierbarer PostgreSQL-Lauf zur Verfügung. Entsprechend wird keine spekulative Produktlogik-Reparatur vorgenommen. Der beobachtete Fehler ist dennoch erklärbar: jede ungefangene Exception in einem der Writes oder in der anschließenden D-17-Acquisition rollt die gesamte RPC-Transaktion zurück; Supabase lieferte sie bislang an einen Adapter, der nur die Oberklasse `rpc_error` behielt.

## 6. Reparatur / exakte DB-Diagnostik

Eine forward-only Migration ersetzt ausschließlich die beiden Funktionen. Die Rehabilitation führt ein statisches Phasen-Enum (`eligibility`, `recovery_pending_insert`, `recovery_snapshot_insert`, `effort_state_update`, `runtime_update`, `command_rehabilitation_update`, `audit_insert`) und die Acquisition zusätzlich `downstream_acquisition`. Ein Exception-Handler re-raised mit **dem originalen SQLSTATE**, ersetzt aber die freie PostgreSQL-Message durch `d19_db_stage:<enum>`. Das Re-Raise bleibt eine echte Exception; PostgreSQL rollt sämtliche Writes atomar zurück.

Der TypeScript-Adapter akzeptiert nur fünfstellige SQLSTATE-Werte, mappt bekannte Codes auf feste Kategorien und extrahiert ausschließlich bekannte D-19-Phasen. Unbekannte Codes werden `database_error`. `message`, `details`, `hint`, SQL, Kundeninhalt und Promptinhalt werden nie in das Diagnoseobjekt kopiert. Ein Constraint-Name wird bewusst nicht aus Freitext geparst. Recovery-Logs erhalten `safe_rpc_code`, `safe_rpc_summary` und optional `safe_db_stage`. Für einen entdeckten Kandidaten weist der Trace bei einem Acquisition-RPC-Fehler nun korrekt aus, dass der RPC-Versuch stattfand, ohne einen DB-Erfolg zu behaupten.

## 7. Retry, Concurrency und Idempotenz

Der Command-Row-Lock serialisiert zwei Worker. Recovery-Pending und Recovery-Snapshot besitzen je eine eindeutige Original-Lineage; bei erfolgreicher Transaktion markiert der Command die Rehabilitation dauerhaft. Bei einer Exception werden Marker und beide neuen Zeilen gemeinsam zurückgerollt. Wiederholungen nach `cycle_failed` laufen über die bestehende D-15/D-17-Lease-Autorität. Durable D-17-Ergebnisse bleiben commandgebunden und verhindern erneute Inference bei Downstream-Retry. Keine Prompt- oder Kundenmessage wird in diesem Pfad erzeugt; fachliche Anwendung bleibt durch bestehende Command-/Interpretation-Idempotenz geschützt.

## 8. D-17-/D-16-Integration

D-19 ändert weder Semantics-v2-Zähler noch Durable-Result-Schema. Historische `ai_inference_attempt_count=3` bleiben erhalten, `current_semantics_ai_attempt_count` wird nicht zurückgesetzt, und die bestehende enge Regel für höchstens einen korrigierten v2-Versuch eines rehabilitierten Commands bleibt bestehen. Exact und AI-matched laufen weiterhin über den gemeinsamen D-16-Interpretation-Key und den deterministischen `building_type`-Apply-Pfad.

## 9. Tests und Resultate

Contract-Tests decken SQLSTATE `23502`, `23503`, `23505`, `23514`, `P0001` und unbekannte Codes, Phase-Whitelist und Nichtweitergabe sensitiver Message/Details/Hint-Daten ab. Migrationstests prüfen Phasen, originales SQLSTATE, echte Exception-/Rollback-Semantik und unveränderte D-18-Verträge. Die bestehenden Composition-, Recovery- und D-18-Tests wurden gemeinsam ausgeführt. Typecheck und Lint sind erfolgreich. Der relevante D-15–D-19-/Recovery-Lauf ist erfolgreich. Der vollständige Vitest-Lauf erreichte 1324/1325 Tests; ein bereits in der Baseline vorhandener OpenAI-Isolationstest beanstandet den bestehenden dynamischen Adapterimport in `productive-cycle-runtime.ts`, der von D-19 nicht geändert wurde.

## 10. Geänderte Dateien

- `supabase/migrations/202609100004_legacy_rehabilitation_acquisition_diagnostics.sql`
- `lib/server/conversation/acquisition-rpc-diagnostics.ts`
- `lib/server/conversation/persistent-cycle-data-source.ts`
- `lib/actions/persistent-conversation-cycle-service.ts`
- `lib/domain/conversation-cycle-orchestration.ts`
- `lib/server/conversation/recoverable-cycle-runner.ts`
- `lib/server/conversation/recovery-handler.ts`
- `test/legacy-rehabilitation-acquisition-diagnostics.test.ts`
- dieses Audit-Artefakt

## 11. Migration und Production-Aktivierung

Production-Migration erforderlich: **JA** – `202609100004_legacy_rehabilitation_acquisition_diagnostics.sql`. Nach Deployment von Migration und Servercode genügt der nächste normale Scheduler-Lauf. Kein manueller Dateneingriff und kein Resend.

## 12. Erwarteter Production-One-Run-Trace

Bei erneutem DB-Fehler: Candidate `true`, RPC-Versuch `true`, Rehabilitationserfolg `false`, danach Acquisition-Fehler mit `rpc_error`, originalem `safe_rpc_code`, normalisiertem `safe_rpc_summary` und statischem `safe_db_stage`. Beim Erfolg bleibt die D-18-Transaktion atomar, D-17 übernimmt die Lease, und der normale durable Inference-/deterministische Commit-Pfad läuft weiter.

## 13. Explizite Antworten

- Production-Migration erforderlich: **JA**
- Kunden-Resend erforderlich: **NEIN**
- historische `ai_inference_attempt_count` zurückgesetzt: **NEIN**
- AI max-3 verändert: **NEIN**
- WhatsApp max-3 verändert: **NEIN**
- technisches Lifetime-Execution-Limit eingeführt: **NEIN**
- Incident-spezifische DML enthalten: **NEIN**
- Kundentext/Prompttext in neuer Diagnostik: **NEIN**
