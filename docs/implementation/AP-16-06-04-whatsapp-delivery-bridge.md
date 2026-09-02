# AP-16-06-04 – WhatsApp Delivery Bridge (STOP-Audit)

**Baseline:** `dcba992d6b4f961efffe2812731f3e3e724457c1`  
**Ergebnis:** **STOP – keine produktive Bridge implementiert**

## 1. Architecture Basis

Geprüft wurden die Audits AP-16-06-00, AP-16-06-01A und AP-16-06-03A, die Implementierungen AP-16-06-01E/F, AP-16-06-02 und AP-16-06-03 sowie der aktuelle Cycle-, Webhook- und WhatsApp-Delivery-Code. Die persistente Cycle-Authority und die WhatsApp-Delivery-Authority bleiben getrennte Zuständigkeiten.

## 2. Scope

Dieses Dokument hält den verpflichtenden Pre-Implementation-Check und die eingetretenen STOP-Bedingungen fest. Es wurden weder Runtime-Code noch Migrationen verändert. Insbesondere wurde keine unvollständige Delivery-State-Machine, kein Recovery-Scheduler und kein unmittelbarer Send-Aufruf ergänzt.

## 3. Conversation Cycle / Delivery Separation

Der atomare Cycle-Commit schreibt bei `completed_with_next_interaction` die reservierte `next_outbound_message_id` als interne `conversation_messages`-Zeile, den zugehörigen Text in `conversation_message_text`, Snapshot und Pending Interaction und bindet die Message-ID als `conversation_cycle_commands.outbound_message_id`. Der externe Graph-Aufruf ist nicht Teil dieser Transaktion.

Der produktive Cycle Runner reduziert ein erfolgreiches Service-Ergebnis derzeit jedoch auf `{ kind: "completed", command_id }`. Seine öffentliche Result-Grenze gibt `outbound_message_id` nicht weiter. Ein Delivery-Fehler darf diesen terminal committed Cycle nicht erneut ausführen; dafür wurde keine Kopplung implementiert.

## 4. Outbound Message Identity

Die Persistence besitzt eine eindeutige Authority: `conversation_cycle_commands.outbound_message_id` entspricht nach erfolgreichem Commit der reservierten `next_outbound_message_id`. Auch das unmittelbare Ergebnis von `processPersistentCustomerMessage(...)` enthält `outbound_message_id`.

An der tatsächlich produktiv verwendeten Grenze `runPersistentCustomerMessageCycle(...)` geht diese ID aber verloren. `triggerPersistentMessageCycle(...)` awaited nur den Runner und erhält wegen dessen geschlossenem Result Contract keine autoritative Outbound-ID. Eine Suche nach letzter Message, Text, Sequence oder Conversation-Ende wäre heuristisch und ist ausgeschlossen. Damit ist STOP-Bedingung 1 an der produktiven Caller Boundary erfüllt.

## 5. Immediate Delivery Trigger

Es existiert kein produktiver Caller von `deliverPendingWhatsAppMessage(...)`. Ein sicherer unmittelbarer Anschluss kann ohne Erweiterung des Runner-Result-Contracts nicht genau die vom soeben terminalisierten Cycle erzeugte Message adressieren.

Zusätzlich besitzt der Webhook-Route-Contract kein explizites `maxDuration`; der bisher bestätigte Runtime-Freeze umfasst nur den deterministischen Cycle ohne Graph API. `sendWhatsAppText(...)` kann bis zu 15 Sekunden auf den externen Request warten. Ohne neuen, ausdrücklich bestätigten Gesamtbudget-Contract wurde deshalb kein weiterer awaited Side Effect in den Inbound-Webhook aufgenommen. Fire-and-forget bleibt ausgeschlossen.

## 6. Existing Delivery Authority Integration

`deliverPendingWhatsAppMessage(...)` kapselt in der normalen Erfolgsstrecke Claim, Revalidation, genau einen `sendWhatsAppText(...)`-Aufruf und Completion. Die Completion bindet die Provider Message ID und setzt `accepted_by_provider`. Die Funktion verwendet damit den vorhandenen Graph-Adapter und keine parallele Send-Implementierung.

Diese Orchestrierung ist für eine zuverlässige Bridge dennoch nicht vollständig: Es gibt weder eine Delivery-Recovery-Discovery noch Lease-/Reclaim-Semantik für `sending`. Daher ist STOP-Bedingung 2 für den geforderten produktiven Gesamtvertrag erfüllt.

## 7. Provider Send Boundary

`claim_whatsapp_outbound_delivery(...)` lädt ausschließlich den persistierten Message-Text und die aktive WhatsApp-Transportidentität. `deliverPendingWhatsAppMessage(...)` reicht exakt `claimed.text` und `claimed.destination` an `sendWhatsAppText(...)` weiter. Route Body oder User Input bestimmen weder Text noch Empfänger. Der Graph Adapter validiert seine Eingabe, nutzt die gepinnte Version `v25.0`, sendet serverseitig mit dem bestehenden Access Token und gibt keine rohen Provider-Bodies zurück.

## 8. Provider Message ID Binding

Bei einem kontrolliert zurückgekehrten Provider-Erfolg übergibt die Delivery-Orchestrierung `providerMessageId` an `complete_whatsapp_outbound_delivery(...)`. Diese Authority erzeugt `transport_message_bindings` und bindet die Delivery Command daran. Erst diese Persistenz ermöglicht die bestehende Status-Reconciliation anhand `sender_scope` und Provider Message ID.

## 9. Delivery Completion

Die Completion ist claim-token-gebunden und akzeptiert nur einen Command im Status `sending`. Erfolg setzt `accepted_by_provider`; bekannte Fehlschläge setzen `failed` beziehungsweise `delivery_ambiguous` und schreiben den Attempt-Abschluss. Ein Completion-Fehler nach dem Send wird in TypeScript nur als `delivery_completion_requires_reconciliation` klassifiziert; er repariert oder fencing-sichert den Zustand nicht.

## 10. Retry Semantics

Die Tabellen begrenzen `attempt_count` und Attempt-Nummern auf drei. Der Claim behandelt jedoch jeden Status `failed` erneut als sendbar, ohne `retry_classification` zu prüfen. Damit würden auch `terminal` und `configuration` erneut versucht. Nach dem dritten Versuch würde ein weiterer Claim außerdem an der Datenbank-Constraint scheitern, statt geschlossen `already_terminal` zu liefern.

Es existiert weder ein autoritatives `next_attempt_at`/Backoff noch eine Discovery-Funktion, die ausschließlich retry-fähige Commands auswählt. Retry Eligibility und Timing sind somit nicht hinreichend definiert. STOP-Bedingungen 4 und 5 sind erfüllt; ein Fünf-Minuten-Takt darf nicht aus der separaten Cycle-Recovery übernommen werden.

## 11. Ambiguous Send Semantics

Netzwerkfehler einschließlich Timeout werden als `ambiguous_send_result` / `requires_reconciliation` klassifiziert. Completion setzt den terminal wirkenden Status `delivery_ambiguous`; der Claim gibt diesen Status nur als `replay` zurück und sendet nicht erneut. Diese wichtige Duplicate-Send-Sperre bleibt unverändert.

Ein Prozessabbruch während des Fetches oder nach Provider Acceptance, aber vor lokaler Fehlerklassifikation/Completion erreicht diese persistierte Ambiguous-Markierung jedoch nicht. Der Command bleibt dann `sending`.

## 12. Crash Safety

Die vier geforderten Grenzen ergeben aktuell:

1. **Crash vor Claim:** Die interne Message bleibt erhalten, aber ohne Delivery Command und ohne Discovery-Authority ist sie nicht auffindbar.
2. **Crash nach Claim, vor Graph Call:** Der Command bleibt dauerhaft `sending`; ein erneuter Claim liefert `replay`. Es gibt kein Lease, Expiry oder sicheres Reclaim.
3. **Crash nach Provider Acceptance, vor Provider-ID-Persistenz:** Derselbe persistente Zustand `sending` ist von Fall 2 nicht unterscheidbar. Ein pauschaler Reclaim und Retry könnte eine zweite WhatsApp-Nachricht senden. Genau dieses kritische Race erfüllt STOP-Bedingung 3.
4. **Crash nach Provider-ID-Binding:** Binding und `accepted_by_provider` werden innerhalb derselben Completion-Transaktion geschrieben. Nach Commit liefert Claim `replay`; vor Commit gilt wieder Fall 3.

Die aktuelle `sending`-Zeile liefert also kein persistentes Faktum, das „noch nicht gesendet“ von „vom Provider akzeptiert, aber lokal nicht gebunden“ unterscheidet. Dieses Problem darf nicht durch eine naive Retry-Schleife gelöst werden.

## 13. Delivery Recovery

Im Repository existiert keine Delivery-spezifische Discovery Authority, kein Worker und keine Recovery Route. `claim_whatsapp_outbound_delivery(...)` ist eine ID-basierte Claim-Authority, aber keine bounded Discovery. Freie SQL aus einer Route würde eine neue Authority schaffen und ist ausgeschlossen.

Das kleinstmögliche Folgepaket ist **AP-16-06-04A – WhatsApp Delivery Recovery Authority & Crash Contract**. Es muss vor Trigger-Wiring verbindlich definieren und atomar implementieren:

- bounded Discovery für noch nicht initialisierte interne WhatsApp-Outbounds und explizit eligible Delivery Commands,
- geschlossene Eligibility nach Status, `retry_classification`, Attempt-Limit und autoritativem Retry-Zeitpunkt,
- Lease/Fencing oder eine gleichwertige Crash-Authority für den Zustand vor dem Provider Call,
- eine ausdrückliche Strategie für das Acceptance-vor-Binding-Race, die keinen Blind-Retry zulässt,
- geschlossene Discovery-/Claim-Resultate ohne Texte, Empfänger, Provider-Payloads oder rohe DB-Fehler.

Erst danach kann ein separates Wiring-Paket die bereits persistierte Outbound-ID vom Cycle Result an die Delivery-Authority übergeben.

## 14. Scheduler

Kein Delivery Scheduler wurde umgesetzt. Die bestehende Supabase-`pg_cron`/Vault/`pg_net`-Infrastruktur gehört semantisch der Conversation-Cycle-Recovery. Frequenz, Batchgröße und Secret dürfen ohne Delivery-Recovery-Contract nicht wiederverwendet werden.

## 15. Security

Die vorhandenen WhatsApp-Komponenten sind `server-only`; Access Token, Phone Number ID und Service Role bleiben serverseitig. Provider-Fehler werden auf geschlossene Codes abgebildet. Es wurden keine Logs, Response-Payloads, Secrets, Client-Capabilities oder neue Umgebungsvariablen ergänzt. Die Status-Reconciliation bleibt unverändert und startet keinen Conversation Cycle.

## 16. Tests

Da eine verpflichtende STOP-Bedingung vorliegt, wurden keine AP-16-06-04-Produktions- oder Migrations-Tests vorgetäuscht. Die bestehenden Tests für Outbound Delivery, Webhook, Status-Reconciliation, produktive Conversation Runtime, Recoverable Runner, atomaren Commit und Data-Source-Komposition bleiben unverändert. Abschlussgates werden auf dem dokumentations-only Patch ausgeführt.

## 17. Explicitly Not Implemented

Nicht implementiert sind Immediate Delivery, Graph-Aufruf aus dem Webhook, Delivery Discovery, Delivery Recovery, Delivery Scheduler/Route/Migration, neue Retry- oder Backoff-Policy, Reclaim von `sending`, vierter Attempt, neue Message-Erzeugung, Textsuche, Latest-Message-Heuristik, Sequence Guessing, Conversation-Reopen, Replanning, Re-Rendering, Knowledge Apply, OpenAI, LLM oder Inference. Keine historische Migration wurde verändert.

## 18. Handoff to Provider-Neutral Language Inference

Provider-neutrale Language Inference bleibt nachgelagert und ist keine Voraussetzung für die fehlende Delivery-Recovery-Authority. Zuerst muss AP-16-06-04A das Delivery-Crash-/Retry-Modell schließen; danach kann die Bridge sicher verdrahtet werden. Eine spätere Inference darf weiterhin nur kontrollierten Text vor dessen atomarer Outbound-Persistenz erzeugen und weder Delivery noch fachliche Domain-Entscheidungen steuern.

## 19. Pre-Implementation Check A–N

| Punkt | Verifizierter Befund |
|---|---|
| A | Cycle Success persistiert Message, Text, Snapshot/Pending und Command-Bindung atomar. |
| B | `direction='outbound'`, `message_kind='text'`, erlaubte `actor_class`, aktive WhatsApp-Bindung und -Identität werden beim Delivery Claim autoritativ geprüft. |
| C | Der Cycle Commit erzeugt nur Message/Text und Bindungen, keinen Delivery Command; dieser wird erst im Delivery Claim lazy erzeugt. |
| D | Claim validiert Message/Transport, erzeugt den eindeutigen Command, sperrt bestimmte Status und erhöht sonst den Attempt auf `sending`. |
| E | Delivery komponiert Claim → Revalidation → Konfigurationsprüfung → Graph Send → Completion. |
| F | Der Happy Path ist vollständig; Crash-/Recovery-Semantik ist es nicht. |
| G | Maximal drei Attempts sind als Constraints vorhanden; Eligibility und Timing sind nicht geschlossen. |
| H | Status: `pending`, `sending`, `accepted_by_provider`, `delivered`, `read`, `failed`, `delivery_ambiguous`, `blocked`. |
| I | Kontrollierte Netzwerkfehler werden ambiguous/`requires_reconciliation` und nicht erneut gesendet; Prozessabbruch bleibt ungelöst `sending`. |
| J | Ein produktiver Delivery Caller fehlt. |
| K | Offene Delivery Commands können nicht über eine vorhandene autoritative Discovery gefunden werden. |
| L | Es existiert keine Delivery Discovery Authority. |
| M | Es existiert kein Delivery Scheduler Contract; nur ein separater Cycle-Recovery-Scheduler. |
| N | Der Service-Commit liefert die Outbound-ID, der produktive Runner Result Contract entfernt sie. |

