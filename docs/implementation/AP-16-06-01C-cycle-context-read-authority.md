# AP-16-06-01C – Cycle Context and ID Reservation Authority

## 1. Architecture Basis

Die Implementierung folgt AP-16-06-00, dem verbindlichen Authority Contract AP-16-06-01A und der Snapshot-Grenze AP-16-06-01B. Sie schließt ausschließlich den Read-Pfad zwischen einem bereits geclaimten Customer-Message-Command und dem bestehenden `CustomerMessageCycleAuthority`-Vertrag. Planner, Renderer, Registry, Provider und Domain-Ausführung sind nicht Bestandteil des Reads.

## 2. Scope

Das Paket ergänzt stabile Command-Reservierungen, eine service-only RPC und einen strikt validierenden TypeScript-Adapter. `processPersistentCustomerMessage(...)` wird weder aufgerufen noch mit einem produktiven Runner verbunden. Es gibt keinen Customer-Answer-Commit und keine Failure-Transition.

## 3. Authority Inputs

Einziger Caller-Input ist die persistierte `cycle command id`. Conversation, Project, Source Message, Prompt, Pending Interaction, Snapshot, Runtime-/Knowledge-Version und alle reservierten IDs werden von der Datenbank über vorhandene Bindungen bestimmt. Der Customer-Text stammt ausschließlich aus `conversation_message_text`.

Der vollständige Context enthält Knowledge State, Information Collection, Retry, Customer Effort, Evidence Request State und die aus persistierten Request-Zeilen bestehende Evidence Availability. Leere Collection-/Retry-/Evidence-Zeilenmengen verwenden ausschließlich die bereits im Runtime-Modell definierte initiale Semantik; der verpflichtende Effort-Header muss vorhanden sein.

## 4. Read RPC / Persistence Boundary

`get_customer_message_cycle_context(uuid)` akzeptiert nur einen Command. Die side-effect-freie RPC prüft Command-Status, Conversation-Status/-Revision, Project, Runtime, Knowledge, exakt gebundene Pending Interaction, Snapshot, Source Message und Prompt Message. Sie gibt entweder einen allow-listed Code oder den vollständigen Rohkontext zurück. Sie schreibt keine Tabelle, erhöht keine Version und protokolliert keinen Text.

## 5. TypeScript Mapping

`loadCustomerMessageCycleAuthority(...)` validiert die RPC-Antwort strikt mit Zod, prüft sämtliche redundanten IDs und CAS-Bindungen und erzeugt danach exakt den bestehenden `CustomerMessageCycleAuthority`. Supabase-/RPC-Details bleiben außerhalb der Domain. Freie Datenbankfehlermeldungen werden nicht weitergereicht.

## 6. Planner Snapshot Integration

Der Adapter verwendet dieselbe exportierte Snapshot-Row-Validierung wie AP-16-06-01B. Dadurch werden `SelectedNextAction`, `RenderedCustomerInteraction`, vollständiger Answer Contract, Schema-Version, Template, Decision, Candidate, Conversation, Project, Runtime-/Knowledge-Version, Outbound Message und zusammengesetzter Text geprüft. Es gibt keinen Registry Lookup, kein Replanning, kein Re-Rendering und keine Default-Ergänzung.

## 7. Runtime / Knowledge / Pending Binding

Command, Conversation, Runtime, Knowledge Header, Pending Interaction und Snapshot müssen dasselbe Project und dieselbe Conversation tragen. Runtime Revision und Knowledge Version müssen exakt den beim Claim fixierten Werten entsprechen. Die Source Message muss ein interner inbound Customer Text nach der gebundenen outbound Prompt-Sequenz sein. Prompt-Message-Text und Snapshot-Text müssen identisch sein.

## 8. ID Authority

Der erste Claim reserviert Cycle/Command, Correlation, Interpretation, Transition, Claim, Customer-/System-Evidence, Apply, Assessment, nächste Planner Decision, fünf Event-Slots, Evidence Request, nächste Pending Interaction, nächsten Snapshot und nächste Outbound Message. `execution_at` und `event_sequence_start` werden ebenfalls beim ersten Claim fixiert. Retry liest dieselbe Command-Zeile; der Read erzeugt keine UUID. Planner Candidate IDs bleiben gemäß Audit deterministisch und werden nicht reserviert.

## 9. CAS / Stale Behavior

Terminale oder nicht geclaimte Commands, geänderte Conversation-/Human-Review-Zustände, Runtime- oder Knowledge-Abweichungen, eine andere aktive Pending Interaction, falsche Prompt-/Snapshot-Bindungen und Cross-Project-/Cross-Conversation-Daten scheitern geschlossen. Die RPC repariert keinen Zustand.

## 10. Legacy Behavior

Historische Pending Interactions ohne `snapshot_id` liefern `snapshot_missing`. Historische Commands ohne den neuen Reservierungskontext liefern `authority_incomplete`. Es gibt keinen Backfill, Default-Snapshot oder Rekonstruktionspfad.

## 11. Side-Effect-Free Boundary

Der Read verändert weder Runtime Revision noch Knowledge Version oder Pending Status. Er erzeugt keine Message, keinen Snapshot, kein Event, kein Audit-Log, keinen Delivery Command und keine fachliche Transition.

## 12. Security

Die neue `security definer` RPC besitzt einen expliziten `search_path`, prüft `service_role`, widerruft Execute für `public`, `anon` und `authenticated` und gewährt ausschließlich `service_role` Zugriff. Der Adapter ist durch `server-only` gegen Client-Nutzung geschützt. Message Contents werden nicht in Command-Metadaten oder Audit-Daten kopiert.

## 13. Tests

Fokussierte Vitest-Tests prüfen den vollständigen Authority-Load, Snapshot-/Answer-Contract-Exactness, Runtime-Komponenten, ID-Replay, alle wesentlichen Identity-/CAS-/Sequence-Gates, ungültige oder fehlende Snapshots und die side-effect-freie service-only Migration. Gesamttests, Typecheck, Lint und `git diff --check` bilden die Abschlussvalidierung.

## 14. Explicitly Not Implemented

- Customer-Answer Knowledge Apply
- atomarer Customer-Answer-Cycle-Commit oder Failure-RPC
- produktive Ausführung von `processPersistentCustomerMessage(...)`
- Runner, Worker, Recovery oder Scheduler
- WhatsApp Send oder Provider-Bindung
- OpenAI, LLM oder Inference

## 15. Handoff to Next Package

Das gemäß AP-16-06-01A unmittelbar nächste Paket ist **AP-16-06-01D — Customer-Answer Knowledge Apply Contract**. Erst danach folgen AP-16-06-01E (Atomic Cycle Commit and Failure Authority) und AP-16-06-01F (Concrete PersistentCycleDataSource); es gibt keinen Sprung zu OpenAI.
