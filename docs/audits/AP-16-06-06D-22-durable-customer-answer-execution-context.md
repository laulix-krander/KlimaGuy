# AP-16-06-06D-22 – Durable Customer Answer Execution Context

## 1. Baseline SHA

`168fb0a5a2f986c77fa97ad8ee0e0fa6b9d8344c` (aktueller `main`-Stand zu Beginn).

## 2. Problem Statement

Der bisherige Ausführungspfad erwarb einen bestehenden Command und rekonstruierte danach die historische Antwort-Autorität mit `get_customer_message_cycle_context` aus dem aktuellen Runtime-, Pending-, Snapshot-, Knowledge- und Effort-Zustand. Ein fachlich unveränderter Input konnte deshalb nach einem technischen Fehler oder Human Review an späterem Revisionsdrift scheitern. Das war kein einzelnes fehlerhaftes Predicate, sondern eine Vermischung historischer Input-Autorität mit aktueller Mutationsautorität.

## 3. Warum D-18/D-20/D-21 das Grundproblem nicht lösen konnten

D-18 erzeugte für einen eng definierten alten Human-Review-Fall ein Recovery-Pending und einen Recovery-Snapshot. D-20 reparierte ausschließlich die tabellenlokale Triggerauflösung beim Runtime-Update. D-21 erlaubte der Rekonstruktion, für den Effort-State auf die Originalrevision zurückzufallen. Alle drei Maßnahmen ließen aber die wiederholte Rekonstruktion bestehen: ein weiterer Drift konnte das nächste Gleichheits-Predicate brechen. D-22 speichert stattdessen den einmal bewiesenen historischen Zusammenhang.

## 4. Current Architecture

Der produktive Weg ist Recovery Route → `createProductiveCycleRuntime()` → Discovery → `acquire_customer_message_cycle_execution` → Data Source → Context Read → Normalisierung → deterministische beziehungsweise AI-Interpretation → atomarer Commit/Planner/Outbound. D-17 lädt vor einer neuen Provider-Reservation ein dauerhaftes erfolgreiches AI-Ergebnis. Vor D-22 las der Data Source unmittelbar `get_customer_message_cycle_context`.

Die Antwort ist erstmals zweifelsfrei gebunden, wenn der Command existiert und geclaimt ist und Source, aktuelle Frage, Prompt, Snapshot, Sequenzen, Conversation, Project und Knowledge-Basis gemeinsam geprüft wurden. D-22 führt diese Prüfung in `bootstrap_customer_answer_execution_context` aus.

## 5. Historical Input Authority vs Current Mutation Authority

**Historical Input Authority** umfasst Command, Conversation, Project, Source Message, ursprüngliches Pending, Prompt, ursprünglichen Snapshot, Sequenzen, Information/Entity/Answer-Typ, ursprüngliche Revisionen sowie `selected_action` und `rendered_interaction`. Sie wird einmal festgeschrieben.

**Current Mutation Authority** umfasst eine offene Conversation, das weiterhin aktuelle Project, Command-Lease/Owner-Fencing in den bestehenden RPCs, die aktuelle Knowledge-Version, Schutz vor einer neueren Customer-Inbound und die bestehenden idempotenten Commit-Regeln. Runtime-Revisionsdrift ändert den historischen Input nicht; eine fachlich nicht mehr zulässige Mutation scheitert weiterhin in der aktuellen Authority beziehungsweise im atomaren Commit.

## 6. Durable Context Design

`customer_answer_execution_contexts` ist ein kleiner, command-gebundener Authority Record. Der Kundeninhalt wird nicht dupliziert: `source_message_id` referenziert die unveränderte `conversation_message_text`-Zeile. Provider-Payloads und der gesamte dynamische Cycle Context werden nicht gespeichert. Dynamische Knowledge-, Collection-, Retry-, Effort- und Evidence-Zustände werden beim Read frisch geladen und bewusst mit dem historischen Input kombiniert.

Der Interpreter benötigt später den Source-Text, dessen Zeit/Sequenz, `selected_action`, `rendered_interaction`, die fachlichen IDs/Versionen und den frischen deterministischen Domain-Zustand. Text und frischer Domain-Zustand bleiben normalisiert; die strukturierten Frage-/Action-Daten werden historisch festgehalten.

## 7. Schema

Primary Key und Unique Authority ist `command_id`; zusätzliche Unique Constraints schützen Source- und Pending/Source-Bindung. Foreign Keys verwenden `ON DELETE RESTRICT`. `authority_source` unterscheidet `direct_current_binding`, `legacy_original_binding` und `rehabilitated_original_lineage`. `authority_version = 1` macht die Semantik explizit versionierbar.

## 8. Immutability

Die Tabelle bietet service-role-seitig nur `SELECT` und `INSERT`. RLS ist aktiviert, Client-Rollen erhalten keine Rechte. Ein `BEFORE UPDATE OR DELETE`-Trigger verwirft jede Mutation. Wiederholtes Bootstrap gibt den existierenden, passend gebundenen Record zurück; ein Konflikt scheitert geschlossen.

## 9. Bootstrap für neue Answers

Nach erfolgreichem Acquire wird beim neuen Context Read zunächst idempotent gebootstrapt. Für ein direktes Pending werden Source/Conversation/Project, Text-Kind, Prompt-Inhalt, Snapshot, Prompt- und Source-Sequenz sowie das Fehlen einer neueren Customer-Inbound geprüft. Danach erfolgt genau ein Insert.

## 10. Bootstrap für Legacy Answers

Ein alter Command ohne Record kann aus seinem nachweisbaren Original-Pending und Original-Snapshot gebootstrapt werden. Ein bereits beantwortetes Legacy-Pending muss durch exakt `cmd.source_message_id` beantwortet worden sein; Prompt und Project müssen unverändert passen. Nicht eindeutige Lineage scheitert geschlossen.

## 11. Bootstrap für D-18 rehabilitierte Answers

Bei `recovery_of_pending_interaction_id` wird auf das beantwortete Original-Pending zurückgegangen. Der Recovery-Snapshot muss über `recovery_of_snapshot_id` exakt den Original-Snapshot referenzieren. Source bleibt die Command-Source und Prompt bleibt die historische Prompt Message. Es werden keine zweite Rehabilitation und keine neuen Runtime-Zeilen erzeugt.

## 12. Retry Flow

Discovery → Acquire/Lease → `get_customer_answer_execution_context` → vorhandenen Record wiederverwenden (oder einmalig generisch bootstrappen) → historische Source/Action/Render-Daten laden → frischen Domain-Zustand laden → normalisieren/interpretieren → committen. Original-Pending und Original-Snapshot müssen nach Capture weder aktiv noch pending sein. Es werden für technische Retries keine Message, kein Pending und kein Snapshot erzeugt.

## 13. D-17 Integration

Die D-17-Reihenfolge bleibt unverändert: nach Normalisierung/Eligibility wird zunächst `get_customer_answer_ai_inference_result` mit der Command-Autorität abgefragt. Ein gültiges Result wird wiederverwendet; nur ohne Result wird ein Provider Attempt reserviert. Das Maximum von drei echten Provider Attempts und die Semantics-/Schema-Versionen bleiben unverändert.

## 14. Removal/Bypass alter Reconstruction Dependency

Der TypeScript-Produktionspfad ruft nun `get_customer_answer_execution_context` statt `get_customer_message_cycle_context` auf. Der alte RPC bleibt ausschließlich als Legacy-Kompatibilitätsoberfläche bestehen und wird vom normalen D-22-Retry nicht mehr benötigt. Historische Action/Render-Autorität stammt aus dem Record, nicht aus einer aktuellen Recovery-Lineage-Rekonstruktion.

## 15. Security Invariants

Service Role ist für Bootstrap/Read erforderlich. Source muss Customer/Inbound/Text derselben Conversation sein. Project muss current bleiben. Prompt ist Outbound Text derselben Conversation und muss in Sequenz und gerendertem Inhalt zum Original-Snapshot passen. Eine neuere Customer-Inbound verwirft die Autorität. Knowledge Drift scheitert vor Mutation. Bestehende Lease-, Owner- und Commit-Fences bleiben erhalten.

## 16. Message/Resend Invariants

D-22 enthält keinen Insert/Update auf `conversation_messages` oder `conversation_message_text`, kopiert keinen Kunden- oder Prompt-Text und dispatcht kein WhatsApp. Recovery erzeugt keinen Prompt, kein Pending und keinen Snapshot.

## 17. Attempt Counter Invariants

D-22 aktualisiert keine Command Counter. AI bleibt bei maximal drei echten v2-Provider-Attempts; ein D-17 Result verhindert eine erneute Reservation nach Downstream-Fehlern. WhatsApp-Dispatch-Limits und Execution-Attempts werden nicht verändert oder zurückgesetzt. Es wird kein Lifetime Execution Ceiling eingeführt.

## 18. Production Legacy Compatibility

Bestehende Commands bleiben unverändert. Der erste D-22-Lauf erwirbt den Command, beweist generisch seine Original-Lineage und legt den Record an. Für den rehabilitierten Fall wird die D-18-Lineage nur beim einmaligen Bootstrap gelesen. Danach ist sie keine Retry-Voraussetzung mehr.

## 19. Tests

Die Migrationstests prüfen Schema/Immutability, drei Bootstrap-Quellen, Lineage, Separation der Authority, fehlende Message-/Pending-/Snapshot-Schreibvorgänge, fehlende Counter-Resets und die fachliche Conversation+Decision+Answer-Idempotency. Bestehende Service-, Recovery-, D-17-, D-18-, D-20- und D-21-Tests sichern die unveränderten Verträge; Typecheck, Lint und Gesamtsuite werden ausgeführt.

## 20. Changed Files

Neue Migration und dieser Audit; Context-Read/Data-Source-Vertrag, Execution-Trace und zugehörige Test-Fixtures werden auf den dauerhaften Read umgestellt. Ein neuer Migrations-Vertragstest dokumentiert die zentralen Safety-Eigenschaften.

## 21. Migrations

Eine additive Forward-only-Migration: `202609100007_durable_customer_answer_execution_context.sql`. Eine Migration genügt, weil Tabelle, RLS/Grants, Immutability, Bootstrap und Read eine atomare Deploy-Einheit bilden.

## 22. Production Rollout

Migration zuerst anwenden, danach Applikationscode deployen. Die alte Read-Funktion und Legacy-Tabellen werden nicht entfernt. Ein Rollback des Codes kann deshalb weiterhin den alten RPC nutzen; angelegte immutable Records sind additive, sichere Daten.

## 23. Expected Production Recovery

Der vorhandene rehabilitierte Command wird entdeckt und acquired. Bootstrap klassifiziert ihn als `rehabilitated_original_lineage`, prüft Original-Pending/-Snapshot/-Prompt/-Source und legt den Record an. Der Read erreicht die Normalisierung. Ein vorhandenes D-17-AI-Ergebnis wird wiederverwendet; andernfalls greift der unveränderte v2-AI-Vertrag. Bei `matched` wird `single_family_house` deterministisch angewendet und der Planner kann fortfahren – ohne Resend oder neue Recovery-Zeilen.

## 24. Remaining Legacy Compatibility Code

D-18-Rehabilitation und Recovery-Pending/-Snapshot bleiben für bereits vorhandene historische Zustände erhalten. D-20 bleibt als korrekter Runtime-Guard relevant. D-21 und `get_customer_message_cycle_context` bleiben rollback-/legacy-kompatibel, sind aber keine Voraussetzung des neuen normalen D-22-Read-Pfads. Neue Answers benötigen keine D-18-Rehabilitation.

## 25. Separate First Contact Incident Hinweis

`first_contact_recovery_discovery_failed` ist ein separates Incident. D-22 ändert weder First-Contact-Discovery noch First-Contact-Recovery und nimmt daran keinen opportunistischen Fix vor.
