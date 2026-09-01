# AP-16-06-00 — Conversation Runtime → OpenAI Integration Readiness Audit

## 1. Executive Summary

Der produktive WhatsApp-Inbound-Transport ist vorhanden: Reale Webhooks erreichen `/api/webhooks/whatsapp`, und eingehende Textnachrichten werden persistent verarbeitet. Für eine als `cycle_eligible` bewertete Nachricht wird `claim_customer_message_cycle` aufgerufen. Der produktive Ablauf endet heute jedoch an dieser Claim-Grenze.

`claim_customer_message_cycle` reserviert ausschließlich persistenten Cycle-State. Die Funktion führt weder die vorhandene TypeScript-Domain-Orchestrierung aus noch startet sie einen Worker oder Runner. Sie erzeugt keine Outbound-Nachricht und ruft weder OpenAI noch Meta zum Versand auf.

Die deterministische AP-15-Domain-Orchestrierung und WhatsApp-Outbound-Bausteine sind bereits vorhanden. Nicht vorhanden sind die produktive Verbindung dieser Teile, eine vollständige persistente Commit-/Failure-Authority und eine produktive OpenAI-Integration. OpenAI darf die deterministische AP-15-Domain-Authority nicht ersetzen.

## 2. Current End-to-End WhatsApp Flow

Der festgestellte produktive Pfad ist:

1. Meta liefert einen realen WhatsApp-Webhook an `/api/webhooks/whatsapp`.
2. Der Inbound-Transport validiert und verarbeitet eine unterstützte Textnachricht persistent.
3. Die Verarbeitung bestimmt, ob die Nachricht `cycle_eligible` ist.
4. Bei `cycle_eligible` wird `claim_customer_message_cycle` aufgerufen.
5. Der persistente Cycle-State wird reserviert beziehungsweise geclaimt.
6. Danach erfolgt heute kein produktiver Aufruf der Conversation-Cycle-Orchestrierung, kein persistenter Cycle-Commit, keine Outbound-Erzeugung und kein WhatsApp-Send.

Damit ist der reale Inbound-Pfad funktionsfähig, aber nicht zu einem vollständigen Reply-Runtime-Pfad geschlossen.

## 3. What `claim_customer_message_cycle` Actually Does

`claim_customer_message_cycle` ist eine persistente Claim-Authority. Sie reserviert beziehungsweise claimed den relevanten Cycle-State, damit eine Nachricht kontrolliert einem Verarbeitungszyklus zugeordnet werden kann.

Die Funktion:

- führt keine TypeScript-Domain-Orchestrierung aus,
- ruft keinen Worker oder produktiven Runner auf,
- erzeugt keine Outbound-Nachricht,
- ruft OpenAI nicht auf,
- ruft Meta nicht für einen Send auf.

Ein erfolgreicher Claim ist daher nicht gleichbedeutend mit einem ausgeführten oder abgeschlossenen Conversation Cycle.

## 4. Existing Conversation Cycle Architecture

`processPersistentCustomerMessage(...)` existiert als vorgesehener providerunabhängiger Service für einen persistenten Conversation Cycle. `runConversationCycle(...)` stellt die bereits vorhandene deterministische Cycle-Orchestrierung bereit.

Die Architektur trennt damit grundsätzlich:

- persistenten State und dessen Authority,
- providerunabhängige Cycle-Ausführung,
- deterministische Domain-Entscheidungen,
- spätere sprachliche Realisierung,
- Outbound-Persistence und Provider-Delivery.

Eine produktive `PersistentCycleDataSource`-Implementierung wurde im abgeschlossenen Audit nicht gefunden. Ebenso fehlen für diesen Pfad eine vollständige Commit-/Failure-Authority und ein produktiver Conversation-Cycle-Runner. Der entworfene Service ist deshalb noch kein vollständig ausführbarer Produktionspfad.

## 5. Existing AP-15 Domain Authorities

Die AP-15-Domain-Orchestrierung existiert bereits und bleibt die fachliche Authority. Dazu gehört `runConversationCycle(...)` als deterministischer Orchestrierungseinstieg. Fachliche Entscheidungen dürfen nicht an ein Sprachmodell delegiert werden.

Insbesondere darf OpenAI nicht die Authority für fachlichen Zustand, Planung, Preisberechnung, Freigaben, Persistenzentscheidungen oder andere deterministische Domain-Regeln übernehmen. Eine spätere Inference-Schicht darf nur innerhalb eines bereits fachlich begrenzten Auftrags arbeiten; ihr Ergebnis muss vor weiterer Verwendung kontrolliert und validiert werden.

## 6. Existing WhatsApp Outbound Architecture

Für WhatsApp Outbound Delivery bestehen bereits folgende Bausteine:

- Delivery Claim,
- Revalidation,
- Graph API Sender,
- Provider Message ID Binding,
- Delivery Status Reconciliation,
- Retry- und Failure-Klassifikation.

Diese Bausteine bilden eine Delivery-Architektur, schließen aber allein nicht die Lücke zwischen geclaimtem Inbound Cycle und persistierter Outbound-Nachricht. `deliverPendingWhatsAppMessage(...)` wird aktuell nicht von einem produktiven Cycle Runner, Scheduler oder Route Handler aufgerufen.

## 7. Current OpenAI Integration Status

Aktuell existiert keine produktive OpenAI-Integration:

- Es wurde kein produktiv verwendeter OpenAI-SDK- oder OpenAI-Client gefunden.
- Es existiert kein `OPENAI_API_KEY`-Contract.
- Es gibt keinen produktiven Runtime-Aufruf von OpenAI im Conversation Cycle.
- Es gibt keine produktive Verbindung von OpenAI-Ausgaben zu Outbound-Persistence oder WhatsApp Delivery.

OpenAI soll nicht die bestehende AP-15-Domain-Authority übernehmen. Die fehlende OpenAI-Integration ist außerdem nicht die unmittelbare Ursache dafür, dass heute keine WhatsApp-Antwort gesendet wird: Der deterministische persistente Cycle-Pfad ist bereits vor einer möglichen Inference-Grenze unvollständig.

## 8. Exact Reason No WhatsApp Reply Is Sent Today

Eine eingehende, `cycle_eligible` Textnachricht erreicht den persistenten Claim. `claim_customer_message_cycle` reserviert den Cycle-State, führt den Cycle aber nicht aus.

Danach fehlt ein produktiver Runner, der:

1. den vollständigen Authority Context lädt,
2. das Claim-Ergebnis validiert,
3. `processPersistentCustomerMessage(...)` und darüber die deterministische Domain-Orchestrierung ausführt,
4. das Ergebnis atomar committet oder kontrolliert in einen Failure-State überführt,
5. eine Outbound-Nachricht persistent erzeugt und
6. den vorhandenen WhatsApp-Delivery-Pfad anstößt.

Deshalb entsteht heute keine auslieferbare Outbound-Nachricht. Entsprechend gibt es auch keinen produktiven Aufruf von `deliverPendingWhatsAppMessage(...)` aus dem Cycle Runtime-Pfad und keinen Meta-Send.

## 9. Missing Runtime Components

Für einen geschlossenen produktiven Runtime-Pfad fehlen:

- eine produktive `PersistentCycleDataSource`-Implementierung,
- das vollständige Laden des Authority Context,
- die verbindliche Validierung des Claim-Ergebnisses,
- eine atomare Commit-Authority für den ausgeführten Cycle,
- eine kontrollierte Failure-Transition,
- ein produktiver Conversation-Cycle-Runner,
- die Verbindung vom erfolgreichen Cycle-Ergebnis zur Outbound-Persistence,
- die produktive Auslösung des vorhandenen WhatsApp-Delivery-Pfads.

Eine Language-/Inference-Integration ist erst nach Schließung dieser deterministischen Lücken sinnvoll einzuordnen.

## 10. Recommended OpenAI Integration Boundary

Die empfohlene spätere OpenAI-Grenze ist eine schmale, serverseitige und providerisolierte Language-/Inference-Grenze:

1. **nach** der deterministischen Domain-Entscheidung,
2. **vor** Outbound-Persistence und Delivery.

Die Domain-Authority liefert einen begrenzten, strukturierten Auftrag. Die Inference-Grenze darf daraus eine sprachliche Darstellung erzeugen, aber keine Domain-Entscheidung ersetzen. Eingaben und Ausgaben sind mit expliziten Schemas zu validieren. Ungeprüfte Modell-Ausgaben dürfen nicht persistiert oder versendet werden. Provider-Secrets bleiben ausschließlich serverseitig.

Diese Grenze erhält die Providerunabhängigkeit des Conversation Cycle und erlaubt einen kontrollierten Austausch oder Ausfall des Language Providers, ohne fachliche Regeln zu verlagern.

## 11. Failure / Retry / Idempotency Analysis

Der persistente Claim ist eine notwendige Idempotency-Grenze, aber noch keine vollständige Execution Authority. Ohne atomaren Commit und kontrollierte Failure-Transition bleibt unbestimmt, wie ein geclaimter, aber nicht erfolgreich abgeschlossener Cycle zuverlässig fortgesetzt, erneut versucht oder beendet wird.

Die Cycle Authority muss mindestens sicherstellen:

- Claim-Validierung vor der Ausführung,
- eindeutige Zuordnung des verarbeiteten Inbound-Events,
- atomaren Commit des fachlichen Ergebnisses,
- kontrollierte Failure-Transition bei Ausführungsfehlern,
- keine doppelte Outbound-Erzeugung bei Wiederholung,
- klare Trennung zwischen Cycle-Retry und Delivery-Retry.

Die vorhandene Outbound-Architektur besitzt Delivery Claim, Revalidation sowie Retry-/Failure-Klassifikation. Diese Delivery-Mechanismen lösen jedoch nicht die davorliegende Cycle-Commit-Lücke. Provider Message ID Binding und Delivery Status Reconciliation greifen erst, wenn eine auslieferbare Outbound-Nachricht vorhanden und an Meta übergeben wurde.

## 12. Security / Secret Boundary

Eine spätere OpenAI-Anbindung muss ausschließlich serverseitig erfolgen. Ein API-Key darf weder in Client-Code noch in clientseitig erreichbare Konfiguration gelangen. Aktuell existiert kein `OPENAI_API_KEY`-Contract; dieser Audit fügt bewusst keinen hinzu.

Weiter gelten folgende Grenzen:

- keine personenbezogenen Daten loggen,
- Modell-Eingaben auf das erforderliche Minimum begrenzen,
- externe Ein- und Ausgaben validieren,
- keine ungeprüften KI-Ausgaben speichern oder versenden,
- keine Preisberechnung durch ein Sprachmodell,
- keine automatische Angebotsfreigabe,
- keine Service-Role-Credentials an Provider oder Client weitergeben.

## 13. Minimal Implementation Packages

Die fehlende Runtime sollte in kontrollierten Paketen geschlossen werden. Die minimale Reihenfolge ist:

1. **Persistent Cycle Authority Completion:** `processPersistentCustomerMessage(...)` mit produktiver Data Source, Authority Context, Claim-Validierung, atomarem Commit und Failure-Transition vollständig ausführbar machen — ohne OpenAI und ohne WhatsApp-Send.
2. **Productive Cycle Runner:** eine explizite produktive Ausführungsgrenze für geclaimte Cycles anbinden und deren Retry-/Idempotency-Verhalten festlegen.
3. **Outbound Persistence Connection:** ein deterministisch autorisiertes Cycle-Ergebnis genau einmal als auslieferbare Outbound-Nachricht persistieren.
4. **WhatsApp Delivery Connection:** den vorhandenen Delivery-Pfad kontrolliert auslösen, ohne Cycle- und Delivery-Retry zu vermischen.
5. **Provider-Isolated Language Boundary:** erst danach eine schmale, validierte, serverseitige Inference-Grenze ergänzen; die AP-15-Domain-Authority bleibt unverändert.

Jedes Paket muss seine eigene Authority-, Failure- und Idempotency-Grenze eindeutig machen. Dieser Audit implementiert keines dieser Pakete.

## 14. Recommended Next Package

**AP-16-06-01 — Persistent Cycle Authority Completion**

### Ziel

Den bereits entworfenen `processPersistentCustomerMessage(...)` Pfad vollständig ausführbar machen, zunächst **OHNE OpenAI** und **OHNE WhatsApp-Send**:

- vollständigen Authority Context laden,
- Claim-Ergebnis validieren,
- atomaren Commit implementieren,
- kontrollierte Failure-Transition implementieren.

Erst nach Abschluss dieses Pakets soll die Anbindung eines produktiven Runners und der nachgelagerten Outbound-Stufen erfolgen. Eine OpenAI-Integration ist nicht Bestandteil des empfohlenen nächsten Pakets.

**AUDIT RESULT: READY**
