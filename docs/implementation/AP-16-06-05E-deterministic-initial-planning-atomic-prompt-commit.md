# AP-16-06-05E – Deterministic Initial Planning & Atomic Prompt Commit

## Purpose and architecture

Dieses Paket ergänzt zwischen der 05D-Foundation und dem späteren 05F-Wiring eine eigene Initial-Prompt-Operation. Die server-only Composition liest nur eine interne Conversation-ID, plant und rendert mit den bestehenden Domain-Authorities und übergibt das validierte Ergebnis an genau eine atomare PostgreSQL-Commit-Authority. Weder Customer-Answer-Cycle noch Provider werden dabei aufgerufen.

## 05D input state and eligibility

Der zulässige Eingang ist eine offene, projektgebundene Conversation mit leerem Knowledge State, Runtime `idle`, synchroner Knowledge-Version, leerem Effort-/Retry-/Collection-State und ohne aktive Pending Interaction oder Evidence Request. Der Read-Vertrag liefert ausschließlich interne IDs, Versionen und Revisionen. Ein fortgeschrittener Zustand ist `already_advanced` oder `not_applicable`; ein widersprüchlicher Zustand ist `invalid_state`. Vor dem Prompt bleibt `cycle_eligible=false`.

## Initial planning context, planner and renderer authority

TypeScript konstruiert aus dem nachweislich leeren persistenten Knowledge Header den schema-konformen leeren Knowledge State, leitet Missing Information und Intermediate Assessment mit den vorhandenen Domainfunktionen ab und ruft `planNextAction` auf. Danach rendert ausschließlich `renderQuestionTemplate` gegen die vorhandene Registry. Der aktuelle deterministische Registry-/Scoring-Vertrag wählt `building_type` und Template `ask_building_type`; dies ist eine getestete Ausgabe, keine neue First-Contact-Sonderregel. Es gibt weder OpenAI noch LLM, Rewrite oder caller-supplied Question/Prompt.

## Stable IDs and conversation sequence

Die Composition reserviert vor dem Commit UUIDs für Interaction, Snapshot, Outbound Message und Delivery Command. Diese IDs werden direkt persistiert und als Ergebnis zurückgegeben; es gibt keine Latest-Row-, Text-Hash- oder Sequence-Wiederfindung. Die DB sperrt zuerst die Conversation und vergibt innerhalb derselben Transaction `max(conversation_messages.sequence)+1`. Inbound und Outbound bleiben damit in einer gemeinsamen Sequence.

## Pending Interaction and immutable planner snapshot

Der Commit schreibt die vollständige bestehende schema-v1 Kombination aus `SelectedNextAction` und `RenderedCustomerInteraction`. Snapshot, Pending Interaction und Prompt Message sind gegenseitig über ihre stabilen IDs gebunden. Der vorhandene Immutable-Trigger bleibt unverändert. Die Pending Interaction referenziert Question, Entity, Template, Answer Contract, Knowledge Version, neue Runtime Revision, Snapshot und Prompt.

## Outbound message and delivery command

Der persistierte Message-Text ist ausschließlich `composeRenderedCustomerText` des Registry-Renderings. Transport Binding und Identity werden unter Lock aus dem persistenten WhatsApp-Zustand gelesen; Destination und Provider-ID sind keine Inputs. In derselben Transaktion entsteht ein `pending` WhatsApp Delivery Command mit `attempt_count=0` für exakt die Outbound Message. Damit kann die bestehende AP-16-06-04C/D/E Recovery Authority in 05F unmittelbar über `outbound_message_id` übernehmen.

## Runtime transition and knowledge invariance

Runtime wechselt per bestehendem Mutationsmarker und CAS von Revision 1/`idle` auf Revision 2/`awaiting_customer_answer` (allgemein `expected revision + 1`). Eine `activate_interaction` Command-Zeile protokolliert die Transition; Effort Revision wird mitgeführt. Knowledge Header, Version, Claims, Evidence und Project-Fakten werden weder geschrieben noch verändert. Nach dem Commit ergibt der vorhandene Customer-Answer-Vertrag für eine danach eingehende echte Nachricht natürlich `cycle_eligible=true`.

## Pre-prompt contract

Eine oder mehrere vorher persistierte Nachrichten bleiben unveränderte append-only Conversation History. Die Operation liest keinen Nachrichtentext, erstellt keinen Customer-Answer-Command, keine Normalisierung, Claims, Evidence, Proposal oder Knowledge Transition und bindet keine alte Nachricht an die neue Interaction.

## Atomic commit, lock/CAS, idempotency and concurrency

`commit_first_contact_initial_prompt` läuft als eine PostgreSQL-Transaktion. Conversation, Runtime, Knowledge Header, aktive WhatsApp-Bindung und Transport Identity werden gesperrt. Project-ID, Knowledge Version, Runtime Revision/Status und das Fehlen aktiver Arbeit werden erneut geprüft. Ein State-Wechsel zwischen Read/Planning und Commit liefert `stale`, ohne Mutation. Zwei parallele Aufrufe serialisieren am Conversation Lock; der Gewinner committed, der andere liest anschließend den vollständigen Zustand als `already_initialized`. Unique Constraints bleiben zusätzliche Barrieren.

Replay erkennt Runtime, aktive Pending Interaction, Snapshot und Delivery Command als zusammengehörige persistierte Einheit und gibt deren ursprüngliche IDs zurück. Widersprüchliche Partial States werden nicht repariert, sondern geschlossen abgewiesen. Fortgeschrittene Conversations werden weder zurückgesetzt noch erneut gepromptet.

## Failure, rollback and audit/ledger

Snapshot, Message, Pending Interaction, Delivery Command, Runtime Command, Runtime-/Effort-Update und Audit erfolgen im selben Funktionsaufruf. Jeder nicht kontrollierte Fehler bricht die gesamte Transaktion ab; insbesondere kann weder ein Outbound ohne Delivery Command noch eine awaiting Runtime ohne Pending Interaction committen. Audit-Metadaten enthalten nur interne IDs, Question-/Template-Key, Revision, Version und Result Code; der Prompttext wird ausschließlich als Message gespeichert und PII wird nicht dupliziert.

## Security

Read und Commit sind `SECURITY DEFINER`, verwenden den festen Search Path `public, pg_temp`, prüfen `service_role`, revoken Execute für `public`, `anon` und `authenticated` und granten ausschließlich `service_role`. Der produktive Adapter lebt unter `lib/server`, validiert Environment und exponiert keine Browser-Authority.

## Result contract and 05F handoff

Die geschlossene TypeScript-Union umfasst `initialized`, `already_initialized`, `already_advanced`, `not_applicable`, `stale`, `invalid_state`, `planning_failed` und `persistence_failed`. Erfolgszustände enthalten Conversation, Project, Interaction, Snapshot, Runtime/Knowledge-Versionen und insbesondere die exakte persistierte `outbound_message_id`. Diese ID ist der einzige notwendige Handoff an den bestehenden recoverable WhatsApp Delivery Runner in AP-16-06-05F.

## Explicitly not implemented

Nicht enthalten sind produktives Webhook-Wiring, Bootstrap-Discovery/-Recovery, Route oder Scheduler, unmittelbarer WhatsApp-/Graph-Send, Provider Attempt/Lease, Delivery-Retry-Änderungen, Änderungen am Customer-Answer-Cycle, Verarbeitung der Pre-Prompt-Nachricht, OpenAI/LLM, Offer/Pricing, Human-Review- oder Evidence-Truth-Änderungen.
