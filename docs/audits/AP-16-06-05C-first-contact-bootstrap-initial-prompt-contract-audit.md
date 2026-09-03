# AP-16-06-05C — First Contact Bootstrap & Initial Prompt Contract Audit

**Branch:** `codex/ap16-06-05c-first-contact-contract-audit`  
**Baseline:** `f7d8702f2629266a035e6768b5c07d6715387e6e`  
**Prüfdatum:** 2026-09-03  
**Scope:** Audit und Contract Freeze; keine Produkt-, Schema-, Runtime- oder Delivery-Änderung

## 1. Executive Result

**AUDIT RESULT: PRODUCT DECISION REQUIRED**

Die kleinste korrekte Gesamtoperation ist **nicht** der bestehende Customer-Answer-Cycle. Sie ist ein eigener, service-only First-Contact-Bootstrap mit drei fachlich getrennten Phasen:

1. eine datenbankseitig serialisierte Claim-/Create-Authority bindet genau den persistierten `conversation_transport_identities.id` an genau einen Customer, erzeugt genau ein **conversation-spezifisches** Bootstrap-Project, schreibt Conversation-Customer-/Project-Provenance und initialisiert einen leeren Knowledge-/Runtime-Ausgangspunkt;
2. TypeScript baut daraus mit den vorhandenen deterministischen Domainfunktionen einen Planner Context, wählt eine kataloggebundene Frage und rendert sie ohne OpenAI;
3. eine zweite atomare DB-Authority validiert den Claim und die Revisionen, reserviert die übergebenen UUID-Identitäten, persistiert Snapshot, Pending Interaction, Outbound Message **und Delivery Command** und wechselt die Runtime erst dann nach `awaiting_customer_answer`.

Der vorhandene Planner und Renderer können grundsätzlich aus einem validen leeren Knowledge State deterministisch eine erste Frage erzeugen. `activate_planner_interaction_snapshot(...)` beweist außerdem bereits die richtige atomare Prompt-/Snapshot-/Pending-/Runtime-Form für eine Runtime in `idle`. Produktiv fehlen jedoch (a) die legitime Initialisierung eines claimlosen Knowledge State, (b) eine service-only Runtime-Initialisierung, (c) die Bootstrap-Orchestrierung und (d) die atomare Anlage eines discoverbaren Delivery Commands. Diese Lücken sind implementierbar und benötigen keinen weiteren Architektur-Audit.

Vier echte Produktentscheidungen verhindern dennoch `READY FOR IMPLEMENTATION`: unbekannte Pflichtnamen des Customers, ein legitimer Domain-Actor für `customers.created_by` und `projects.created_by`, der Project-Titel sowie die Semantik bereits eingegangener erster/parallel schneller Texte. Keine dieser Entscheidungen lässt sich aus aktuellem Repository-Code ableiten.

Repository-Authorities: [Initialschema](../../supabase/migrations/202607210001_initial_schema.sql), [Conversation Core](../../supabase/migrations/202608230004_persistent_conversation_message_authority.sql), [Runtime](../../supabase/migrations/202608230005_persistent_conversation_runtime.sql), [Planner Snapshot](../../supabase/migrations/202609010001_planner_snapshot_persistence.sql), [Inbound](../../supabase/migrations/202608240001_whatsapp_inbound_text_ingestion.sql), [Delivery](../../supabase/migrations/202609020005_whatsapp_delivery_identity_retry_authority.sql), [Planner](../../lib/domain/conversation-intelligence/question-planner.ts) und [Renderer](../../lib/domain/conversation-intelligence/question-template-renderer.ts).

## 2. Confirmed 05B Blockers

Die zehn Feststellungen aus 05B bleiben gültig, mit einer Präzisierung zur Prompt-Authority:

| # | Bestätigter Repository-Fakt | 05C-Präzisierung |
|---|---|---|
| 1–2 | Eine neue Transport Identity hat `customer_id = null`; die neu erzeugte Conversation übernimmt `null`. | Die Conversation-Identity ist danach durch `guard_conversation_state()` unveränderlich. Eine spätere Bootstrap-Authority muss eine enge, kontrollierte Ausnahme für die einmalige Bindung besitzen; ein freies Update ist unzulässig. |
| 3–4 | Project benötigt `customer_id`, `title`, `created_by`; für Titel und automatischen Creator gibt es keinen Default. | Dies bleibt eine Produktentscheidung, nicht bloß eine technische Eingabe. |
| 5–8 | Project-Zuordnung allein schafft keine Eligibility; Runtime startet `idle`; `awaiting_customer_answer` verlangt eine aktive Pending Interaction. | Die Transition darf nur zusammen mit gültigem Snapshot, Prompt Message und Pending Interaction committed werden. |
| 9 | Ein erster freier Text kann den Answer-Cycle nicht betreten. | `message.sequence` muss größer als die Sequence der beantworteten Prompt Message sein; ein bereits vor dem Prompt persistierter Text kann daher bewusst **nicht** nachträglich dessen Antwort werden. |
| 10 | Ein echter Prompt braucht Prompt-/Snapshot-/Sequence-Authorities. | `activate_planner_interaction_snapshot(...)` deckt viel davon bereits ab, legt aber keinen Delivery Command an und löst Customer/Project/Knowledge/Runtime-Bootstrap nicht. |

Damit ist **First Contact → Bootstrap + Initial Prompt** eine neue Operation. Erst **Customer Reply nach diesem Prompt → bestehender Customer-Answer-Cycle** ist semantisch zulässig.

## 3. Customer Model

### 3.1 Persistiertes Schema und Pflichtfelder

`customers` hat UUID-PK mit `gen_random_uuid()`, `updated_at`-Trigger und `deleted_at` für Soft Delete. RLS ist aktiv. Lesen dürfen Admin und Reviewer; Insert erlaubt die Browser-Policy nur einem Admin und nur mit `created_by = auth.uid()`. `audit_log` ist vom Client vollständig entzogen.

| Feld | DB required | Domain required | Default | Autoritativ aus WhatsApp verfügbar | Später erfragbar | Bootstrap `null`/unknown heute zulässig |
|---|---:|---:|---|---:|---:|---:|
| `id` | ja | ja | UUID | nein/nicht nötig | nein | automatisch |
| `first_name` | ja | ja, Trim, 1–120 Zeichen | keiner | **nein** | ja | **nein** |
| `last_name` | ja | ja, Trim, 1–120 Zeichen | keiner | **nein** | ja | **nein** |
| `email` | nein | optional, validierte E-Mail | `null` implizit | nein | ja | ja |
| `phone` | nein | optionaler Text bis 500 Zeichen | `null` implizit | Transportziel vorhanden, aber keine Domain-Bindungsauthority | ja/abgleichbar | ja |
| `created_by` | ja | bestehender `auth.users(id)` | keiner | nein | nein | **nein** |
| `created_at`, `updated_at` | ja | Infrastruktur | DB-Zeit | nein/nicht nötig | nein | automatisch |
| `deleted_at` | nein | Soft Delete | `null` implizit | nein | nein | ja |

Es gibt keine Felder `name`, `address` oder `company`; Namen sind getrennt. Installationsadresse liegt am Project. Es gibt keinen Unique Constraint auf Name, E-Mail oder Telefonnummer.

### 3.2 Ergebnis

Ein fachlich ehrlicher „unknown first-contact customer“ kann **heute nicht** erzeugt werden: `first_name`, `last_name` und `created_by` fehlen. Leere Strings scheitern am Domain-Schema und sind auch fachlich keine Unknown-Semantik. Transportdaten dürfen nicht als Namen erfunden werden. Die einzige bestehende Creation ist der authentifizierte Admin-Flow; es gibt keine service-only Customer-Creation-RPC, keinen Creation-Ledger-Eintrag, keinen Customer-Creation-Trigger und kein Customer-Created-Audit-Event.

## 4. WhatsApp Transport Identity vs Customer Identity

`conversation_transport_identities` ist die PII-haltige Transport-Authority. Ihre stabile interne UUID identifiziert die Kombination aus `provider`, `sender_scope` und `external_identity`; der Unique Constraint erzwingt deren Eindeutigkeit. `external_identity` ist ein Routing-/Participant-Wert, **kein Customer-Domain-Schlüssel**. Die nullable FK `customer_id` ist die vorgesehene explizite Brücke.

Die Domain-Identität ist ausschließlich `customers.id`. Deshalb gelten:

- keine freie String-Suche `customers.phone = external_identity`;
- keine Telefonnummer als Customer-ID, Name, Project-Titel oder Auditmetadatum;
- kein Customer-Merge allein aufgrund ähnlich formatierter Nummern;
- Bindung nur unter Lock der persistierten Transport-Identity und der aktiven Conversation;
- vorhandenes nicht-null `transport_identity.customer_id` gewinnt; Konflikte schließen fail-closed.

Die interne `transport_identity_id` ist der richtige Bootstrap-Idempotency-Anker. Sie ist stabil, nicht textheuristisch und kann ohne Rohtelefonnummer in Ledger/Audit referenziert werden.

## 5. Customer Bootstrap Contract

Nach den offenen Entscheidungen muss eine additive service-only Authority mindestens:

1. `transport_identity_id`, `conversation_id` und eine persistierte Bootstrap-Command-ID entgegennehmen;
2. zuerst die Transport Identity, danach die aktive Binding-/Conversation-Zeile in stabiler Reihenfolge sperren;
3. beweisen, dass Binding, Identity und Conversation zusammengehören und aktiv/offen sind;
4. bei vorhandener Customer-Bindung dieselbe Customer-ID idempotent zurückgeben;
5. andernfalls genau einen Customer mit **produktseitig autorisierten** Unknown-/Actor-Werten erzeugen;
6. Identity und Conversation in derselben Transaktion an diese Customer-ID binden;
7. einen Bootstrap-Ledger-/Unique-Key auf `transport_identity_id` schreiben;
8. nur IDs, Result Code, Revision und Zeit auditieren.

Die bestehende Conversation-Immutability darf dafür nicht entfernt werden. Die neue Authority braucht einen eng begrenzten, transaktionslokalen Mutation Guard: nur Übergang `conversation.customer_id: null → identity.customer_id`, niemals Wechsel eines bestehenden Customers.

Customer- und Project-Erstellung sollen in derselben DB-Phase liegen. So entsteht kein ungebundener Customer nach einem Crash. Ein Customer darf später mehrere Projects besitzen; die Idempotenz ist daher **Bootstrap pro Transport Identity/Conversation**, niemals `UNIQUE(projects.customer_id)`.

## 6. Project Model

| Feld | Vertrag beim Bootstrap |
|---|---|
| `id` | UUID, später vorreservierbar oder DB-generiert und im Ledger fixiert |
| `customer_id` | `NOT NULL`; exakt die autoritativ gebundene Customer-ID |
| `title` | `NOT NULL`, Domain 1–180 getrimmte Zeichen; offene Produktentscheidung |
| `status` | vorhandener DB-/Domain-Default `new` |
| `project_class` | nullable; keine Klassifikation erfinden |
| `installation_address`, `postal_code`, `city`, `summary` | nullable; unbekannt lassen |
| `requires_human_review` | vorhandener Default `true`; nicht abschwächen |
| `created_by` | `NOT NULL` FK `auth.users`; offene Actor-Entscheidung |
| Timestamps / `deleted_at` | bestehende Defaults, Updated-Trigger und Soft Delete |

RLS gestattet Browser-Insert nur Admins mit eigener User-ID und `requires_human_review = true`. Der automatisierte Bootstrap darf diese UI-Policy nicht vortäuschen; er benötigt eine explizite service-only Authority. Der bestehende Admin-Create-Flow verlangt aktiven Customer, eingegebenen Titel und eingeloggten Admin und ist daher nicht wiederverwendbar.

Project-Lifecycle und Human Review bleiben unverändert. Das Initialproject ist lediglich das erste Project dieser Conversation, keine globale 1:1-Beziehung zum Customer.

## 7. Project Title Authority

Es existiert **keine** fachlich autorisierte deterministische Default-Regel. Weder DB noch Server setzen einen Titel; UI und Zod verlangen Eingabe. Es gibt keine sequenzielle Titelauthority und keinen customer-name-basierten Generator.

**EXPLICIT PRODUCT DECISION REQUIRED.** Technisch kompatible Optionen, ohne Festlegung:

| Option | Schema Impact | Privacy Impact | User-facing Impact | Determinismus | Migration |
|---|---|---|---|---|---|
| fester neutraler Bootstrap-Titel | keiner | niedrig, keine PII | gleiche zunächst wenig unterscheidbare Titel | vollständig | Bootstrap-Authority, keine Spaltenänderung |
| sequence-/UUID-abgeleitetes neutrales Label | ggf. Bootstrap-Sequenz-/Ledger-Authority | niedrig, wenn keine Transportdaten | unterscheidbar, technisch wirkend | vollständig bei persistierter Sequenz | wahrscheinlich additive Authority |
| transport-abgeleitetes, nicht-PII Label | Definition eines zulässigen internen Alias nötig | abhängig von Herleitung; Rohnummer verboten | möglicherweise technisch wirkend | nur bei stabiler Alias-Authority | wahrscheinlich additive Authority |
| `title` künftig nullable | Domain-/UI-Schemaänderung | niedrig | UI muss Untitled-Zustand darstellen | vollständig | **Schema-Migration erforderlich** |

Customer-Namen sind beim First Contact unbekannt und daher keine verfügbare Titelquelle.

## 8. `created_by` Authority

Customer und Project haben jeweils eine eigene `created_by NOT NULL REFERENCES auth.users(id)`-Spalte. `service_role` ist eine Datenbankrolle, **kein** Domain-User und liefert keine legitime FK-ID. `audit_log.actor_id` darf dagegen null sein und bestehende Maschinenereignisse verwenden dies bereits. Diese Semantiken dürfen nicht vermischt werden.

Im Repository gibt es keinen fest definierten System-User, Service-Account, Tenant-/Business-Owner-Fallback oder Creator-Trigger. Auch aus `profiles` lässt sich kein deterministisch eindeutiger Owner wählen; mehrere Admins sind zulässig. Eine Fake-UUID oder „erster Admin/latest user“-Query ist verboten.

**EXPLICIT PRODUCT DECISION REQUIRED:** Produkt/Identity-Modell muss entweder einen real provisionierten System-Actor bestimmen, einen explizit konfigurierten Business-Owner mit validierter FK bestimmen oder in einer bewussten Migration `created_by` von „human creator“ trennen/nullable machen. Die Entscheidung muss für Customer und Project separat in der Persistenz gelten, kann aber denselben legitimen Actor wählen.

## 9. Conversation Assignment

Die vorhandene Admin-Authority `assign_conversation_project(...)` besitzt die richtigen Muster: Conversation `FOR UPDATE`, Expected Revision/CAS, pro Conversation eindeutigen Idempotency Key, `assigned`/`reassigned`, Revisionserhöhung, append-only `conversation_project_assignments` und `conversation_project_assigned` Audit. Sie verlangt aber `auth.uid()` als Admin/Actor und ein bereits existentes Project.

Der Bootstrap muss diese Invarianten integrieren, nicht die Admin-RPC aus der Service Role imitieren:

- Project gehört zum gebundenen `conversation.customer_id`;
- bei `current_project_id IS NULL`: genau ein Bootstrap-Project anlegen und `assigned`-Provenance schreiben;
- bei vorhandenem Project: idempotent dasselbe Ergebnis liefern, keinen zweiten Datensatz anlegen;
- bestehende spätere Admin-Reassignment-Authority unverändert lassen;
- Bootstrap-Assignment mit `actor_id = null` benötigt entweder eine separate maschinenfähige Provenance-Tabelle/nullable Actor-Migration oder ein ausdrücklich legitimiertes System-Actor-Modell, weil `conversation_project_assignments.actor_id` heute `NOT NULL` ist.

## 10. Runtime Initialization

`initialize_conversation_runtime(...)` verlangt eine Project-Zuordnung und einen existierenden `project_knowledge_states`-Header. Sie erstellt Revision `1`, übernimmt dessen positive `current_version`, setzt `idle` (außer Conversation ist bereits `human_review`), lässt beide Active-Referenzen null, initialisiert Effort-Zähler mit null und schreibt Command/Audit. Sie ist ausschließlich eine authentifizierte Admin-Authority und schreibt `auth.uid()` in `conversation_runtime_commands.actor_id`.

Für ein frisches Project existiert kein allgemeiner claimloser Knowledge-State-Initializer. Der bestehende Initialisierungsweg liegt im human-reviewed Evidence-Claim-Apply und ist für Bootstrap semantisch falsch. Eine neue service-only Empty-Knowledge-Initialization muss exakt Version/Schema `1`, keine Claims und keine erfundene Previous-State-Transition repräsentieren.

`idle` ist noch nicht cycle-eligible, weil Ingestion `open + current_project_id + passende Runtime mit awaiting_customer_answer` verlangt. Zusätzlich erzwingt der Runtime-Check eine Active Pending Interaction und der deferrable Snapshot-Trigger deren gültigen Snapshot.

## 11. First Prompt vs Customer Answer

### A. Initial Conversation Prompt Creation

Input ist ein gebootstrapter, offener Conversation-/Project-/Knowledge-/Runtime-Zustand ohne vorherige Kundenantwort. Sie plant/rendert und aktiviert die erste echte Frage. Sie erzeugt **keinen** `customer_answer`-Command und interpretiert den ersten Inbound nicht.

### B. Customer Answer Cycle

Input ist eine spätere Inbound-Textmessage, deren Sequence nach der persistierten Prompt Message liegt. `claim_customer_message_cycle(...)` bindet sie an die aktuell aktive, pending Interaction und deren Snapshot. Nur dieser Pfad interpretiert Antworten und plant Folgeturns.

Eine Fake Pending Interaction vor dem ersten Inbound würde Chronologie, Prompt Identity und Answer Contract fälschen und ist ausgeschlossen.

## 12. Deterministic Initial Planning

Die Capability existiert ohne OpenAI:

1. `deriveMissingInformation(emptyKnowledgeState)` liefert den bestehenden Readiness-Katalog offener Informationen;
2. `buildIntermediateAssessment(...)` kann einen leeren validen Zustand einordnen;
3. `planNextAction(...)` generiert, filtert, scored und rankt deterministisch;
4. `renderQuestionTemplate(...)` bindet Action, `template_key`, Version, Locale `de` und Answer Contract an einen statischen Registry-Eintrag;
5. der Snapshot persistiert Selected Action und gerenderte Interaction immutable.

Die Planner-Capability ist unabhängig von einer vorherigen Customer Answer. Nur die **produktive Composition** wird heute ausschließlich aus Cycle/Continuation aufgerufen. Eine Initial-Prompt-Orchestrierung fehlt.

Der leere Knowledge State muss `{ project_id, conversation_id, state_version: 1, claims: [], updated_at }` repräsentieren; Collection State ist Version `0` mit leeren Items, Retry leer, Effort null, Evidence State leer und kein Active Question/Human Takeover. Diese Werte folgen bestehenden Schemas/Initialzuständen; UUIDs und Zeit werden pro Bootstrap-Claim reserviert, nicht frei bei Retry neu erzeugt.

## 13. Initial Question Selection

Die aktuelle Missing-Info-Authority markiert unter anderem `desired_installation_scope`, `requested_room_count`, `room_type`, `room_area_sqm` und `building_type` als offen. Der aktuelle Candidate-Katalog besitzt jedoch nicht für jeden Missing-Key eine Regel. Aus dem validen leeren Project-State bleiben katalogfähige, dependency-gültige frühe Kandidaten; Ranking entscheidet nach Progression Band, Score, Effort, Answerability, Readiness, dann `information_key`, Entity und Candidate-ID.

Unter **unverändertem aktuellem Code** gewinnt dadurch deterministisch der katalogisierte Text-Candidate `building_type` mit Template `ask_building_type` (vor `room_type` im lexikalischen Tie-Break). Dies ist eine Feststellung des Codes, keine neu erfundene Business-Priorität. Project Classification ist dafür nicht erforderlich. Evidence Request ist beim initialen leeren Zustand nicht die ausgewählte erste Action; dessen Planner greift erst in der bestehenden Cycle-Composition bei einem `no_eligible_customer_action`-Fallback.

Dieser exakte Ausgang darf erst als produktiver Contract getestet werden, nachdem ein echter Empty-Knowledge-Read DTO dieselben validierten Inputs liefert. OpenAI ist weder nötig noch zulässig.

## 14. Initial Outbound Message

Ein gültiger Initial Prompt benötigt genau eine:

- `conversation_messages`-Zeile: vorreservierte UUID, richtige Conversation, nächste atomar berechnete Sequence, `outbound/text/system`, persistierter Zeitpunkt und stabiler Idempotency Key;
- `conversation_message_text`-Zeile mit exakt der Renderer-Composition;
- Pending Interaction und immutable Snapshot mit derselben Outbound-ID;
- Delivery-Command-Zeile für aktive WhatsApp-Binding-/Identity-IDs.

`activate_planner_interaction_snapshot(...)` kann die ersten drei Elemente und die Runtime-Transition aus `idle` atomar erzeugen. Es reserviert die Sequence unter Conversation Lock als `max(sequence)+1` und validiert Snapshot-/Renderer-Bindings. Es erzeugt aber keinen `transport_delivery_commands`-Datensatz und schreibt kein eigenes Audit-/Runtime-Command-Event.

Die bestehende Atomic-Cycle-Commit-Authority ist nicht direkt wiederverwendbar: sie verlangt einen geclaimten `customer_answer`-Command, Source Message, alte Pending Interaction und Answer-Transition. Wiederverwendbar sind Invarianten, DTOs und Lock-/CAS-Konventionen. Nötig ist eine separate minimale `commit_initial_prompt`-Authority.

## 15. Pending Interaction

Tatsächliche persistierte Felder eines initialen, beantwortbaren Textprompts:

| Feldgruppe | Vertrag |
|---|---|
| Identity/Scope | vorreserviertes `id`; `conversation_id`; `project_id` |
| Planner identity | `decision_id`; `selected_action_type`; `information_key`; `entity_type`; `entity_id` |
| Template/Answer | `template_key`; positive `template_version`; Locale `de`; `answer_type` |
| CAS | `expected_knowledge_state_version`; **resultierende** `runtime_revision` |
| Prompt/Snapshot | `prompt_message_id`; `snapshot_id` |
| Lifecycle | Default `pending`; keine Answer-Message/-Zeit und keine Supersede-/Cancel-Zeit |

Es gibt keine separate Spalte „expected answer schema“: Der persistierte `answer_type` und der vollständige `selected_action.answer_contract` im Snapshot bilden diesen Vertrag. `outbound_message_id` heißt auf der Pending-Zeile `prompt_message_id`.

## 16. Planner Snapshot

`conversation_interaction_snapshots` ist immutable und benötigt vorreservierte Snapshot-/Pending-/Outbound-UUIDs, Conversation/Project, resultierende Runtime Revision, Knowledge Version, Outbound Sequence, Schema Version `1`, vollständige `selected_action` und `rendered_interaction`. Snapshot und Pending referenzieren einander über deferred FKs.

Ein legitimer Initialsnapshot ist möglich: „previous state“ ist nicht erforderlich. Benötigt werden ausschließlich der tatsächlich persistierte Empty-Knowledge-State Version `1`, initiale Collection/Retry/Effort/Evidence-Defaults, deterministisch reservierte `decision_id`/Zeit, Planner-Ergebnis, Registry-Version und Renderer-Ergebnis. `based_on_state_version` muss `1` entsprechen. Ein synthetischer Customer Answer oder Fake-Claim ist verboten.

## 17. Message Sequence

Inbound und Outbound teilen `conversation_messages.sequence` mit `UNIQUE(conversation_id, sequence)`. Ingestion sperrt Identity/Binding/Conversation und berechnet `max + 1`; Snapshot Activation sperrt die Conversation und tut dasselbe. `outbound_message_sequence` im Snapshot muss exakt dieser Sequence entsprechen.

Es gibt keine separate Prompt-Sequence. Prompt Identity ist `prompt_message_id`/`outbound_message_id`; Planner Identity ist `decision_id` plus katalogisierte Candidate-/Template-Identität. Der Initial Commit muss die Conversation zuerst sperren und die nächste Sequence atomar berechnen. Keine hardcodierte `2`, keine „latest message“-Auflösung und kein Text-Hash.

## 18. Runtime Transition

Der legitime Übergang lautet:

`idle, revision 1, project_id P, knowledge_version 1, active refs null`

→ atomarer Initial-Prompt-Commit →

`awaiting_customer_answer, revision 2, project_id P, knowledge_version 1, active_pending_interaction_id I, active_evidence_request_id null`.

Im selben Commit müssen Pending `I`, Snapshot `S`, Prompt Message `M`, Snapshot→`M/I`, Pending→`M/S` und Delivery Command→`M` konsistent sein. Erst nach Commit ist die Conversation cycle-eligible. Eine direkte Statusmutation ist unzulässig.

## 19. Delivery Handoff

Der bestehende Recoverable WhatsApp Delivery Runner bleibt die einzige Send-Engine. Nach Commit erhält er exakt `outbound_message_id = M`; Claim/Revalidate/Authorize liest das aktive Binding, das Ziel und den persistierten Text, reserviert maximal einen WhatsApp-Command pro interner Message und markiert vor dem Graph-Aufruf den Attempt.

Für Crash-Sicherheit muss der Initial Commit den `transport_delivery_commands`-Datensatz bereits atomar pending anlegen. Der heutige Claim legt ihn lazy an; stirbt der Prozess zwischen Prompt-Commit und erstem Claim, kann Delivery Discovery keine noch nicht existente Command-Zeile finden. Danach deckt bestehende Delivery Recovery pre-dispatch Lease, Retry und post-dispatch Ambiguity ab. Es wird keine neue Delivery Engine benötigt.

„Exactly one Graph attempt“ gilt für den kontrollierten Happy Path. Bei ausdrücklich retryable Provider-Rejections sind die bereits begrenzten späteren Attempts Teil des existierenden Vertrags; bei möglicher externer Wirkung wird nicht blind erneut gesendet.

## 20. Transaction / Orchestration Boundary

Eine einzige riesige RPC soll nicht TypeScript-Domainplanung duplizieren. Der sichere Vertrag ist:

### Phase 1 — atomic bootstrap claim

Eine DB-Transaktion sperrt Identity/Binding/Conversation, löst oder erzeugt Customer, erzeugt Project, schreibt Assignment, initialisiert claimlosen Knowledge Header + Runtime/Defaults und persistiert alle später benötigten UUIDs, `planning_at`, erwartete Revisionen und Status `planning`. Replay liefert exakt dieselben Identitäten. Customer + Project + Bindings sind damit gemeinsam atomar.

### Phase 2 — deterministic TypeScript planning

Ein service-only Servermodul liest den **expliziten Bootstrap Claim**, nicht „latest“, baut den validierten leeren Context und ruft bestehende Missing-Info-, Assessment-, Planner- und Renderer-Funktionen auf. Kein Netzwerk/LLM, keine DB-Mutation und keine neue UUID/Zeit bei Retry.

### Phase 3 — atomic initial prompt commit

Eine DB-Transaktion sperrt in stabiler Reihenfolge Conversation, Bootstrap Claim, Runtime, Knowledge State, Transport Binding/Identity; validiert Revisionen/Project/Plan-Bindings; berechnet Sequence; schreibt Snapshot, Pending, Message/Text, Delivery Command, Runtime-Transition, terminalen Claim und Audit. Replay liefert dieselbe Outbound-ID; Konflikte verlangen Replan oder Review.

Phase 1 darf einen recoverablen Zustand `current_project_id + runtime idle + bootstrap claim planning` hinterlassen. Dieser Zustand ist nicht cycle-eligible, aber ausdrücklich discoverbar und nicht anonym „stuck“.

## 21. Crash Recovery

| Crash-Grenze | Persistierter Zustand | Recovery Contract |
|---|---|---|
| nach Inbound, vor Phase 1 | deduplizierte Inbound Message/Receipt/Identity/Conversation | Bootstrap Discovery findet offene transportgebundene Conversation ohne terminalen Bootstrap; Duplicate darf zusätzlich denselben Claim anstoßen |
| während Phase 1 | keine Teilwirkung | DB-Transaktion rollt zurück; derselbe Anker wird erneut geclaimt |
| nach Customer, vor Project | **darf nicht existieren** | Customer/Project/Bindung müssen eine Transaktion sein |
| nach Phase 1, vor Planung/Commit | Customer + Project + Assignment + idle Runtime + persistierter planning Claim | Bootstrap Recovery übernimmt abgelaufenen Lease und plant mit denselben IDs/Zeitwerten neu |
| während Phase 3 | kein Teilprompt | DB-Transaktion rollt zurück; Reclaim/Retry |
| nach Prompt Commit, vor Delivery Runner | kompletter Pending Prompt + pending Delivery Command | bestehende Delivery Discovery/Runner übernimmt |
| nach Dispatch Authorization | möglicher Provider-Side-Effect | bestehende conservative Ambiguity-/Reconciliation-Authority; kein Blind-Resend |

Conversation Cycle Recovery hilft **nicht** vor einem `customer_answer`-Command und kann daher weder Bootstrap noch Initial Prompt entdecken. Delivery Recovery hilft erst bei existierendem Delivery Command.

## 22. Duplicate Inbound

Meta exactly-once wird nicht angenommen. Bestehende Unique Keys auf Receipt/Provider Message sorgen für genau eine Inbound Message. Der Duplicate-Result liefert deren IDs, aber `cycle_eligible = false`.

Die Bootstrap-Orchestrierung muss für `recorded` **und** `duplicate` idempotent anhand `transport_identity_id + conversation_id` aufrufbar sein. Unter Locks/Unique Ledger gilt:

- ein Customer pro Transport-Bootstrap;
- ein Initialproject pro Conversation-Bootstrap;
- ein Bootstrap Claim und ein Satz reservierter IDs;
- ein Snapshot/Pending/Outbound/Delivery Command;
- kein `customer_answer`-Cycle für die Trigger-Message.

Ein globales „ein Project pro Customer“ oder ein Message-Text-Hash ist ausdrücklich nicht Teil des Contracts.

## 23. Parallel First Messages

Bei „Hallo“ und unmittelbar „Ich möchte eine Klimaanlage“ reserviert Ingestion beide Messages seriell mit eindeutigen Sequences. Beide dürfen denselben Conversation-Bootstrap anstoßen; Conversation-/Claim-Lock und Unique Ledger verhindern doppelte Domainmutationen.

Beide Messages liegen jedoch zeitlich/seriell **vor** dem Initial Prompt. Der bestehende Answer-Cycle weist beide mit `message_precedes_interaction` zurück, wenn man sie rückwirkend an den neuen Prompt bindet. Das ist korrekt und darf nicht umgangen werden.

Welche fachliche Rolle diese pre-prompt Inhalte haben — nur Bootstrap-Trigger, später separat auszuwertende unprompted content oder Anlass für Human Review — ist im Repository nicht festgelegt. **EXPLICIT PRODUCT DECISION REQUIRED.** Bis dahin bleiben beide append-only Inbound Messages erhalten und ungeprocessed; keine Message wird gelöscht, als beantwortet markiert oder willkürlich einem späteren Prompt zugeordnet.

Die spätere Orchestrierung muss pro Conversation serialisieren: solange Bootstrap `planning/committing` ist, keine pre-prompt Message in den Answer Runner geben; nach Commit nur Messages mit Sequence größer als Prompt-Sequence als mögliche Antworten zulassen.

## 24. Bootstrap Recovery Requirement

**Eine eigene Bootstrap Recovery Discovery/Scheduler Authority ist erforderlich.** Duplicate Meta Delivery ist nicht garantiert und darf nicht als Recovery-Mechanismus vorausgesetzt werden. Bestehende Cycle Discovery sieht nur Cycle Commands; bestehende Delivery Discovery nur Delivery Commands. Der Zustand „Inbound vorhanden, Bootstrap fehlt“ sowie „Bootstrap planning, Runtime idle“ ist für beide unsichtbar.

Der Scheduler muss eine getrennte Route/Secret/Job-Identität, bounded Batch, Lease/Reclaim und aggregierte PII-freie Ergebnisse erhalten. Er darf erst in einem späteren Implementierungspaket entstehen; in 05C wird weder Route noch Cron verändert.

## 25. Security

- alle Bootstrap- und Initial-Commit-RPCs `SECURITY DEFINER`, `SET search_path = public, pg_temp`, expliziter `auth.role() = 'service_role'`-Check;
- `REVOKE ALL` von `public`, `anon`, `authenticated`; Execute nur `service_role`;
- Service Role ausschließlich in server-only Modulen; keine Secrets/Keys in Client, Audit oder Dokumentation;
- RLS bleibt auf allen Fach-/Ledger-Tabellen aktiv; keine Browser-Mutation als Workaround;
- keine Rohtelefonnummer, Message-Texte, Provider-Payloads oder Secrets in Infrastruktur-Audit/Claim/Recovery-Ausgabe;
- Transport Binding ID/Identity UUID statt Rohnummer in Provenance;
- Outbound-Text liegt nur in der vorgesehenen Message-Domain; Planner Snapshot enthält ausschließlich kontrollierten Renderer-Output;
- keine ungeprüfte KI-Ausgabe, keine Preisberechnung, keine automatische Angebotsfreigabe.

## 26. Audit / Provenance

Bestehendes `audit_log` reicht als Infrastruktur; es ist clientseitig nicht beschreibbar und unterstützt `actor_id = null`. Zusätzlich braucht die Mutation ein relational eindeutiges Bootstrap-Ledger für Idempotenz/Recovery. Erforderliche, sanitizierte Events:

| Event | Minimale Metadaten |
|---|---|
| `first_contact_customer_bootstrapped` | command/customer/transport-identity IDs, result, timestamp; keine Nummer/Namen |
| `first_contact_project_bootstrapped` | command/customer/project/conversation IDs, result, timestamp |
| `conversation_project_bootstrap_assigned` | conversation/project, Assignment Revision, result, timestamp |
| `conversation_initial_prompt_committed` | command, conversation/project, runtime/knowledge revisions, snapshot/pending/outbound IDs, sequence, result, timestamp |

Replays dürfen entweder ein explizites replay Event oder einen Ledger-Result liefern; sie dürfen nicht nochmals „created“ behaupten. Das bestehende Assignment-History-Modell ist beizubehalten. Event-Actor `null` kann Maschinenwirkung korrekt ausdrücken; das löst nicht automatisch die separaten `created_by`-FKs.

## 27. Idempotency

| Operation | Persistierte Identity / Key | Conflict-Regel |
|---|---|---|
| Customer Bootstrap | `transport_identity_id` in Bootstrap-Ledger | bestehende Bindung gewinnt; andere Customer-ID = fail closed |
| Project Bootstrap | Bootstrap `command_id` + `conversation_id` | exakt ein initiales Project für diese Conversation; keine Customer-global uniqueness |
| Assignment | `conversation_id` + Bootstrap Command/Assignment Revision | vorhandenes anderes Project = expliziter already-assigned/conflict result |
| Initial Prompt | Bootstrap `command_id`/Generation | terminaler Commit liefert dieselben reservierten IDs |
| Planner Decision | vorreservierte `decision_id` + Knowledge/Runtime Revision | stale = replan unter neuem Generation-Claim, nie „latest“ |
| Outbound Message | vorreservierte `outbound_message_id`; `(conversation_id,idempotency_key)` | Body/Binding-Abweichung = replay conflict |
| Pending Interaction | vorreservierte `pending_interaction_id`; ein pending pro Conversation | Abweichung = conflict |
| Snapshot | vorreservierte `snapshot_id`, unique Pending und Outbound | immutable replay validation |
| Delivery | unique WhatsApp Command pro `internal_message_id` | bestehender Command gewinnt |

## 28. First-Turn Exactly-Once Contract

Exactly-once bedeutet Domainmutation trotz at-least-once Meta/HTTP/Scheduler-Ausführung:

1. Provider Receipt und Provider Message ID deduplizieren den ersten Inbound.
2. Persistierte `transport_identity_id` und Conversation bestimmen den einen Bootstrap Claim.
3. Phase 1 erzeugt Customer/Project/Binding/Runtime-Grundlage atomar oder gar nicht.
4. Planung ist pure/deterministisch und verwendet claim-reservierte IDs/Zeit.
5. Phase 3 committed genau eine Prompt Generation atomar oder gar nicht.
6. Runtime referenziert exakt deren Pending Interaction; Sequence belegt, dass der Trigger-Inbound nicht deren Antwort ist.
7. Pending Delivery Command macht post-commit Recovery discoverbar.
8. Delivery Authorize markiert den Provider-Attempt vor Side Effect; Ambiguity wird nicht blind wiederholt.
9. Erst eine spätere Message nach Prompt-Sequence erhält genau einen `customer_answer`-Command.

## 29. First Live „Hallo“ Target

Der geforderte strukturelle Zielpfad ist nach den Entscheidungen korrekt, mit zwei Präzisierungen:

1. WhatsApp-Text wird inbound genau einmal persistiert.
2. Die Nachricht ist Bootstrap-Trigger/pre-prompt content, **keine Antwort**.
3. Customer Authority und Identity-/Conversation-Customer-Bindung entstehen atomar.
4. Initialproject, `current_project_id`, Knowledge State Version 1 und idle Runtime entstehen.
5. TypeScript plant/rendert die deterministische katalogisierte Initialfrage.
6. Snapshot, Pending Interaction, Outbound Message, Sequence und Delivery Command committen atomar.
7. Runtime wechselt auf `awaiting_customer_answer` und wird cycle-eligible.
8. Dieselbe Outbound-ID geht an den vorhandenen Recoverable Delivery Runner.
9. Im Happy Path wird genau ein Graph Attempt autorisiert; die Frage kommt einmal an.
10. Erst die nächste Message mit Sequence nach dem Prompt tritt in den normalen Answer-Cycle ein.

Der Wortlaut `Hallo` darf dabei nicht geloggt, künstlich interpretiert oder rückwirkend an die Initialfrage gebunden werden.

## 30. Open Product Decisions

| Decision | Why Required | Existing Authority | Possible Options | Recommended by Existing Architecture? | User Decision Required? |
|---|---|---|---|---|---:|
| Unknown Customer names | beide Namen heute DB-/Domain-Pflicht | nur menschlicher Admin-Create | explizite neutrale Unknown-Werte; nullable Name-Migration; separates Bootstrap-Customer-Modell | keine Option autorisiert; Unknown muss explizit modelliert werden | ja |
| Domain creator | Customer, Project und Assignment-History verlangen Auth-User | kein System-/Owner-Fallback | provisionierter System-Actor; explizit konfigurierte/validierte Owner-ID; Actor-/Creator-Schema trennen | Audit darf null actor nutzen, Fach-`created_by` nicht | ja |
| Bootstrap Project title | Pflicht und sichtbar | nur manuelle Eingabe | Optionen aus Abschnitt 7 | neutrale, PII-freie Deterministik passt technisch, aber kein String ist autorisiert | ja |
| Pre-prompt first/parallel text | darf nicht als spätere Antwort gelten, muss erhalten bleiben | append-only Message + Sequence Gate | nur Trigger; separat später interpretierbarer unprompted content; Human Review | Architektur empfiehlt klar **keine rückwirkende Antwort**; weitere Fachrolle offen | ja |

### DECISION 1

**Question:** Wie repräsentiert das Customer-Modell unbekannten Vor- und Nachnamen beim First Contact?  
**Existing facts:** Beide Felder sind DB- und Domain-Pflicht; WhatsApp liefert sie nicht autoritativ; erfundene Personennamen sind verboten.  
**Options:** ausdrücklich autorisierte neutrale Unknown-Werte; nullable Name-Migration samt UI-/Domain-Anpassung; separates Bootstrap-Customer-Modell mit späterer Promotion.  
**Architectural consequence:** Bestimmt Customer-Schema, UI, spätere Vervollständigung und Phase-1-Migration.

### DECISION 2

**Question:** Welcher legitime Domain-Actor steht für automatisch erzeugten Customer, Project und Assignment-Provenance?  
**Existing facts:** `service_role` ist kein `auth.users`-Datensatz; kein System-Actor/Owner-Fallback existiert; Fake UUID ist verboten.  
**Options:** provisionierter System-User; explizit konfigurierte und validierte Business-Owner-ID; Schema trennt maschinelle Creation von Human-`created_by`.  
**Architectural consequence:** Bestimmt FKs, Provisionierung, RLS, Audit und Recovery-Unabhängigkeit von einzelnen Mitarbeitern.

### DECISION 3

**Question:** Welche PII-freie, deterministische Titelregel gilt für das Initialproject?  
**Existing facts:** Titel ist Pflicht und 1–180 Zeichen; es gibt keinen Default/Generator; Name und Telefonnummer sind keine zulässige Quelle.  
**Options:** fixer neutraler Titel; persistierte Sequenz/UUID-Alias; expliziter nicht-PII Transport-Alias; nullable Titel via Migration.  
**Architectural consequence:** Bestimmt Project-Create-Vertrag, UI-Darstellung und ggf. Migration/Sequenzauthority.

### DECISION 4

**Question:** Welche fachliche Rolle behalten ein oder mehrere bereits vor dem Initial Prompt persistierte Kundentexte?  
**Existing facts:** Sie lösen Bootstrap aus, sind append-only und liegen vor der Prompt-Sequence; sie können keine Antwort auf den späteren Prompt sein.  
**Options:** ausschließlich Bootstrap-Trigger/ungeprocessed Historie; eigene spätere „unprompted customer content“-Operation; Human-Review-Queue.  
**Architectural consequence:** Bestimmt Folge-Orchestrierung und Recovery, niemals jedoch eine rückwirkende Fake-Answer-Zuordnung.

## 31. Recommended Implementation Packages

**OPTION B — drei Folgepakete.** Ein Paket wäre wegen zweier separater atomarer DB-Grenzen, dazwischenliegender TypeScript-Planung und eigener Recovery-Aktivierung zu groß und crashseitig schwer beweisbar.

1. **AP-16-06-05D — First Contact Customer & Project Bootstrap Authority**  
   Nach Produktentscheidungen: Customer-/Actor-/Titelvertrag, Bootstrap Ledger, atomare Customer/Project/Identity/Conversation/Assignment-Bindung, empty Knowledge Header, service-only idle Runtime, RLS/Audit/Concurrency-Tests.
2. **AP-16-06-05E — Initial Prompt Commit Authority**  
   Bootstrap-Context Read, reservierte Generation IDs, pure deterministische Planning Composition, atomarer Snapshot/Pending/Message/Delivery-Command/Runtime-Commit, Replay-/Stale-/Sequence-Tests.
3. **AP-16-06-05F — Productive First Contact Orchestration & Recovery**  
   `recorded`/`duplicate` Wiring, Bootstrap lease/discovery/route/scheduler, immediate Handoff zum bestehenden Delivery Runner, parallele Messages und Crash-Matrix, Production-E2E-Gate.

Die Trennung folgt bestehenden Grenzen: DB-CAS/Mutation, TypeScript-Domainlogik und produktive Runner/Recovery. Sie erzeugt keine Microservices und keine zweite Delivery Engine.

## 32. Explicitly Not Implemented

In AP-16-06-05C wurden ausschließlich dieses Audit und der Contract Freeze erstellt. Nicht implementiert wurden:

- keine Produkt- oder Source-Code-Änderung;
- keine Migration, Tabelle, Spalte, Constraint, RPC oder RLS-Policy;
- kein Customer und kein Project;
- keine Customer-/Project-/Conversation-Bindung;
- kein Titel, Name, System-Actor oder Fake UUID;
- kein Knowledge State, Runtime State, Pending Prompt, Planner Snapshot oder Outbound;
- kein Fake Prompt und keine rückwirkende Answer-Zuordnung;
- kein OpenAI/LLM und keine Preislogik;
- keine Delivery-, Graph-, Retry- oder Scheduler-Änderung;
- keine Env-/Secret-Änderung und keine Secret-Werte in der Dokumentation.

**AUDIT RESULT: PRODUCT DECISION REQUIRED**
