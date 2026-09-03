# AP-16-06-05B — New Conversation Bootstrap & Initial Project Assignment Authority

**Baseline:** `92c5af82b367b2ccbff9963e09b8f956f31f97b6`  
**Prüfdatum:** 2026-09-03  
**Ergebnis:** **STOP — keine Bootstrap-Implementierung autorisiert**

## 1. Architecture Basis

Geprüft wurden AP-16-06-05A, AP-16-06-00 und die Implementierungsverträge AP-16-06-01E, AP-16-06-01F, AP-16-06-02, AP-16-06-03 und AP-16-06-04E sowie der aktuelle WhatsApp-, Conversation-, Runtime-, Planner-, Project- und Datenbankcode. Der produktive Pfad bleibt ein modularer Monolith mit einer serverseitigen Supabase-Authority, einem deterministischen Conversation Cycle und einer davon getrennten Delivery-Authority.

Die Pre-Implementation-Prüfung bestätigt mehrere STOP-Bedingungen des Pakets. Deshalb wurden weder Produktcode noch Schema oder bestehende Tests verändert. Insbesondere wurde keine teilweise Project-Assignment-Lösung eingebaut, die eine Conversation weiterhin dauerhaft nicht verarbeitbar ließe.

## 2. AP-16-06-05A Blocker

AP-16-06-05A beschreibt zutreffend, dass `ingest_whatsapp_inbound_text(...)` eine neue offene Conversation mit `current_project_id = null` persistiert. Die aktuelle Eligibility wird nur dann wahr, wenn die Conversation offen und projektgebunden ist **und** ein passender Runtime-Datensatz den Status `awaiting_customer_answer` besitzt.

Eine isolierte Zuweisung von `current_project_id` würde den Blocker daher nicht schließen: Für einen neuen Kontakt fehlen außerdem eine Customer-Bindung, ein initialisierter Knowledge-/Runtime-Zustand, eine aktive Pending Interaction, deren Planner Snapshot und deren bereits persistierte Outbound-Prompt-Message.

## 3. Existing Conversation/Customer/Project Model

### Customer

`customers` ist die fachliche Customer-Authority. Ein Datensatz verlangt `first_name`, `last_name` und `created_by`; es gibt keinen systemseitigen First-Contact-Default. Es existiert kein Unique Constraint auf E-Mail oder Telefonnummer. Das ist eine bewusste fachliche Kardinalität, die dieses Paket nicht verändern darf.

### Conversation

`conversations` enthält `customer_id` (nullable), `current_project_id` (nullable FK auf `projects`, `ON DELETE RESTRICT`), Status, Revision, einen pro Ersteller eindeutigen Creation-Key und `created_by` (für Transport-Conversations inzwischen nullable). Projektwechsel sind über die append-only Tabelle `conversation_project_assignments` und die bestehende Admin-Authority `assign_conversation_project(...)` modelliert. Diese Authority ist authentifizierten Admins vorbehalten, erwartet ein bereits existentes Project und erstellt kein Project atomar mit der Zuweisung.

### Project

`projects` ist die fachliche Project-Authority. Minimal erforderlich sind `customer_id`, `title` und `created_by`. Bestehende Defaults sind `status = new` und `requires_human_review = true`; `project_class` ist optional. Die produktive Erstellung erfolgt im Admin-Flow nach Zod-Validierung und verlangt einen eingegebenen Titel. Es gibt keinen autoritativen systemseitigen Titel- oder Ersteller-Default für einen WhatsApp-First-Contact.

### WhatsApp Transport Identity

`conversation_transport_identities` ist die PII-haltige Transport-Authority mit der Eindeutigkeit `(provider, sender_scope, external_identity)`. Ihre `customer_id` ist nullable. Eine neue Nummer erzeugt die Identity ohne Customer-Zuordnung; anschließend übernimmt die neue Conversation genau dieses nullable `customer_id`. `conversation_transport_bindings` erzwingt höchstens eine aktive Conversation-Bindung pro Identity. Webhook- und Message-Deduplizierung erfolgen separat über `(provider, sender_scope, provider_event_identity)` beziehungsweise `(provider, sender_scope, provider_message_id)`.

Damit existiert für eine wirklich neue Nummer gerade **kein bereits autoritativ aufgelöster Customer**, an den ein Project gebunden werden könnte. Eine freie Telefonnummernsuche oder eine aus der Telefonnummer abgeleitete Project-/Customer-Identität wäre unzulässig.

## 4. Bootstrap Trigger

Der beabsichtigte Trigger wäre ein autoritativ persistierter WhatsApp-Inbound für eine Conversation ohne `current_project_id`. Der aktuelle Ingestion-Result liefert sowohl für `recorded` als auch `duplicate` die Conversation-ID; beim Duplicate wird `cycle_eligible` jedoch fest als `false` zurückgegeben. Eine spätere idempotente Bootstrap-Authority könnte daher auch im Duplicate-Pfad erneut aufgerufen werden, ohne die Message erneut zu persistieren oder automatisch einen zweiten Cycle zu starten.

Dieser Trigger wurde nicht verdrahtet, weil die nachfolgenden fachlichen Authorities fehlen.

## 5. Bootstrap Atomicity

Eine einzelne `security definer`-RPC könnte technisch Conversation Row Lock, Project Create, Assignment-Historie und Audit in einer Transaktion schließen. Die bestehende `assign_conversation_project(...)`-RPC reicht dafür nicht aus, weil Project-Erstellung und Assignment sonst zwei Transaktionen wären.

Die technische Atomizität ist lösbar, aber die Transaktion hat ohne Customer-, Titel- und Initial-Prompt-Authority keine gültigen fachlichen Eingaben. Es wurde deshalb keine unvollständige RPC angelegt.

## 6. Idempotency

Conversation Row Locking und „existing project wins“ könnten Replay-Sicherheit für die reine Zuweisung gewährleisten. Ein zusätzlicher globaler Constraint „ein Project pro Customer“ wäre falsch, weil weitere echte Projects erlaubt bleiben müssen. Eine Bootstrap-spezifische Ledger-/Provenance-Identität wäre erst zusammen mit dem vollständigen First-Contact-Vertrag festzulegen.

Mangels implementierbarer Gesamt-Authority gibt es in 05B keine neue Idempotency-Behauptung und keinen neuen Constraint.

## 7. Concurrency / Locking

Die vorhandenen CAS-/Locking-Konventionen sperren die maßgebliche Conversation mit `SELECT ... FOR UPDATE`. Eine vollständige Bootstrap-RPC müsste denselben stabilen Lock zuerst nehmen, danach `current_project_id` erneut prüfen und bei vorhandener Zuweisung geschlossen `already_assigned` liefern. Damit wären zwei parallele First Messages gegen doppelte Project-Erstellung serialisiert.

Dieser Mechanismus wurde nicht isoliert implementiert, weil ein so erstelltes Project mangels zulässiger Pflichtwerte und Initial-Prompt-State nicht produktiv nutzbar wäre.

## 8. Project Defaults

Autoritative Defaults existieren nur für `status = new` und `requires_human_review = true`; `project_class` darf null bleiben. Für die Pflichtfelder `title` und `created_by` gibt es keinen Bootstrap-Default. Einen Namen wie „WhatsApp-Anfrage“, eine Telefonnummer als Namen oder einen künstlichen System-User einzuführen wäre neue Business-Semantik und verletzt die ausdrückliche STOP-Bedingung 1.

## 9. Customer Binding

Das gewünschte Project müsste exakt `conversation.customer_id` übernehmen. Für einen neuen WhatsApp-Kontakt ist dieser Wert null, weil die Transport-Identity ohne Customer angelegt wird. `projects.customer_id` ist dagegen `NOT NULL`. Das Paket darf weder Namen erfinden noch anhand einer freien Telefonnummernsuche heuristisch einen Customer auswählen. Es fehlt somit eine autoritative First-Contact-Customer-Resolution/-Creation-Policy.

## 10. current_project_id Assignment

`current_project_id` liegt ausschließlich auf `conversations` und referenziert ein Project restriktiv. Der Mutation Guard erlaubt Änderungen nur innerhalb einer Conversation-Authority. `assign_conversation_project(...)` führt Revision/CAS, append-only Assignment-Provenance und Audit bereits korrekt aus, ist aber eine Admin-Authority und keine atomare Service-Role-Project-Creation-Authority.

Eine Zuweisung allein würde Eligibility nicht herstellen, weil Runtime und Pending Prompt fehlen.

## 11. Audit / Provenance

Vorhandene Project-Zuweisungen werden in `conversation_project_assignments` und `audit_log` mit Conversation-, Project-, Revision- und Zeitidentität erfasst. Eine spätere Bootstrap-Authority kann diese Konvention mit `actor_id = null` und einer festen systemseitigen Action weiterverwenden, ohne Telefonnummer, Customer-Text oder Provider-Payload zu speichern.

Da kein Bootstrap stattfindet, wurde auch kein irreführendes Bootstrap-Event persistiert oder definiert.

## 12. Duplicate Inbound Handling

Provider-Replays erzeugen durch `transport_webhook_receipts` und `transport_message_bindings` keine zweite Message oder Conversation. Der aktuelle Duplicate-Result enthält die bestehende interne Message- und Conversation-ID, setzt aber `cycle_eligible = false`; der Webhook triggert Cycles nur für `status = recorded`.

Das erlaubt grundsätzlich, bei einem späteren vollständigen Bootstrap-Contract auf Duplicate-Zustellung die Assignment-/Initialisierungslücke idempotent nachzuholen, ohne allein wegen des Duplicates einen zweiten Message Cycle zu starten. In 05B wurde keine fragile `recorded`-only-Integration ergänzt.

## 13. Crash Between Persistence and Bootstrap

Der aktuelle Ingestion-RPC schließt Message-Persistenz atomar ab, bevor eine separate App-Layer-Bootstrap-RPC aufgerufen werden könnte. Stirbt der Prozess dazwischen, bleibt die Message dedupliziert. Ein Meta-Retry erreicht den Duplicate-Pfad und triggert keinen Cycle.

Eine idempotente Bootstrap-Prüfung könnte zwar auf dem Duplicate-Pfad nachgeholt werden. Sie könnte den bereits persistierten Text aber weiterhin nicht als First Turn verarbeiten, weil `claim_customer_message_cycle(...)` zwingend eine aktive Pending Interaction und eine zeitlich vorhergehende Prompt-Message verlangt. Ohne eine vollständige Initial-Prompt-Authority wäre die Conversation dauerhaft stuck. Genau deshalb wird der Fehler nicht still geschluckt und keine Teilintegration vorgenommen.

## 14. Cycle Eligibility

Die bestehende Ableitung lautet:

1. Conversation ist `open`.
2. `current_project_id` ist nicht null.
3. Es existiert eine Runtime derselben Conversation und desselben Projects.
4. Diese Runtime ist `awaiting_customer_answer`.

Der Runtime-Invariant bindet `awaiting_customer_answer` zusätzlich an eine nicht-null `active_pending_interaction_id`. Das Setzen von `current_project_id` allein kann Eligibility daher nicht auf `true` bringen. `initialize_conversation_runtime(...)` würde außerdem zunächst `idle` erzeugen und verlangt bereits einen `project_knowledge_states`-Datensatz. Ein hardcodiertes `cycle_eligible = true` wäre falsch und wurde nicht implementiert.

## 15. First-Turn Compatibility

**STOP-Bedingung 6 ist erfüllt.** Der bestehende Customer-Message-Cycle kann keinen ersten Text ohne vorherigen Pending Prompt verarbeiten:

- `conversation_cycle_commands` verlangt für `customer_answer` sowohl `source_message_id` als auch `pending_interaction_id`.
- `claim_customer_message_cycle(...)` akzeptiert nur Runtime-Status `awaiting_customer_answer`.
- Die aktive Pending Interaction muss existieren und `pending` sein.
- Deren `prompt_message_id` muss auf eine persistierte Outbound-Message zeigen.
- Die Inbound-Sequenz muss nach der Prompt-Sequenz liegen.
- Der Context Read verlangt zusätzlich einen passenden Planner Snapshot.

Ein erstes `Hallo` kann deshalb nicht autoritativ in den bestehenden Cycle eintreten. Es als Antwort auf eine erfundene Frage zu behandeln, eine Fake-Question/-Prompt-ID anzulegen oder einen beliebigen Pending Prompt einzuschleusen wäre ausdrücklich verboten. Der bestehende Planner plant den **nächsten** Turn aus einem bereits geclaimten Answer-Context; er stellt keine separate First-Turn-Startauthority bereit.

## 16. Service Role / Security

Die geforderte spätere RPC muss `security definer`, einen festen `search_path`, eine explizite Service-Role-Prüfung sowie Revokes für `public`, `anon` und `authenticated` und ausschließlich einen Grant an `service_role` besitzen. Das bestehende Admin-Assignment darf nicht als Browser- oder Service-Workaround missbraucht werden. In diesem STOP-Ergebnis wurde keine neue DB-Capability exponiert.

## 17. Tests

Die verlangten Bootstrap-, Race-, Atomicity-, Audit-, Security-, Crash-Recovery- und First-Turn-Tests können ohne Erfindung der fehlenden fachlichen Authorities nicht wahrheitsgemäß implementiert werden. Bestehende Tests wurden nicht abgeschwächt. Repository-Tests, Typecheck, Lint und Diff-Check dienen ausschließlich dazu, die dokumentarische Änderung und unveränderte Baseline zu validieren.

## 18. Explicitly Not Implemented

Nicht implementiert wurden Project-Erstellung, Project-Zuweisung, Customer-Erstellung/-Suche, Runtime-Initialisierung, Pending Interaction, Initial Prompt, Planner-Erweiterung, Cycle-Trigger, Delivery, Recovery-Scheduler, Graph-Adapter, OpenAI, LLM, heuristische Klassifikation, Projektname oder Backfill. Es wurde keine historische Migration geändert und keine neue Migration angelegt.

## 19. Production Migration Impact

Es gibt in AP-16-06-05B **keine Migration** und damit keinen Production-Schema-Impact. Bestehende unassigned Conversations werden nicht verändert oder pauschal zugewiesen. Der AP-16-06-05A-Deployment-Gate bleibt blockiert.

## 20. Handoff back to AP-16-06-05A Deployment Gate

**READY für einen erneuten Production-E2E-Readiness-Gate: NEIN.**

Fehlende Authorities und kleinster sicherer Folgeumfang:

1. Eine fachliche First-Contact-Customer-Authority muss definieren, wie eine neue Transport-Identity ohne Namen zu einem gültigen Customer wird, oder das Customer-Schema muss separat und bewusst dafür erweitert werden.
2. Eine fachliche Project-Bootstrap-Default-Authority muss gültige Werte für `title` und `created_by` festlegen, ohne Telefonnummer, Heuristik oder LLM.
3. **AP-16-06-05C — Initial Conversation Prompt / First-Turn Authority** muss atomar/idempotent Project Knowledge State, Runtime, initialen Planner Snapshot, Pending Interaction und eine echte vorhergehende Outbound-Prompt-Message erzeugen oder einen alternativen autoritativen First-Turn-Command definieren.
4. Erst danach kann eine additive, service-only Gesamt-RPC Conversation Locking, Project Create, Assignment, Runtime/Prompt-Bootstrap, Audit und geschlossene Replay-Resultate transaktional verbinden; Ingestion kann sie für `recorded` und zur Crash-Heilung für `duplicate` aufrufen, während der bestehende Cycle-Trigger weiterhin nur seine genau-einmalige Message-Authority verwendet.

Bis diese Entscheidungen autorisiert sind, bleibt der exakte unsichere Fall: Message persistiert, Prozessende vor/bei Bootstrap, Duplicate Delivery dedupliziert, aber weder Project-/Runtime-/Pending-Prompt-Authority noch zulässiger First-Turn-Cycle vorhanden. Eine isolierte 05B-Project-Zuweisung würde diesen Fall nicht schließen.
