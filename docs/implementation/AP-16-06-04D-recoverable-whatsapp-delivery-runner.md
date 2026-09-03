# AP-16-06-04D – Recoverable WhatsApp Delivery Runner

## 1. Architecture Basis

Grundlagen sind der Crash-Contract AP-16-06-04A, die Identity-/Retry-Authority AP-16-06-04B, Lease/Reclaim/Discovery aus AP-16-06-04C, der Recoverable Conversation Cycle Runner AP-16-06-02, die produktive Runtime AP-16-06-03 v2 und die bestehende WhatsApp Delivery Authority. Die DB-Authorities bleiben für Eligibility, Attempts, Retry-Timing, Lease und Fencing maßgeblich.

## 2. Scope

Dieses Paket ergänzt genau eine serverseitige Orchestrationsgrenze für ein persistiertes Delivery Work Item. Es ergänzt keine fachliche DB-Authority und keine Migration.

## 3. Runner Contract

`runRecoverableWhatsAppDelivery(...)` liefert ausschließlich die geschlossenen Kategorien `sent`, `retry_scheduled`, `terminal_failed`, `ambiguous`, `busy`, `not_due`, `already_terminal`, `retry_not_allowed`, `attempts_exhausted`, `ownership_lost` oder `failed`. Ergebnisse enthalten weder IDs noch Customer-, Provider- oder Konfigurationsdaten.

## 4. Input Identity

Der normale Lauf akzeptiert ausschließlich `outbound_message_id`. Ein Discovery Work Item mit `FINALIZE_AMBIGUOUS` akzeptiert ausschließlich dessen persistente `delivery_command_id`. Telefonnummer, Text und Provider Payload sind keine Caller-Eingaben.

## 5. Owner / Acquire

Jeder normale Aufruf erzeugt eine neue opaque Owner-UUID und acquired zuerst. Owner-UUID, Dispatch-Token und Provider-ID bleiben getrennte Identitäten. Acquire-/Reclaim-Versuche erhöhen keinen Provider-Attempt.

## 6. Revalidation

Nach Acquire verwendet der Runner die vorhandene fenced Revalidation. `ownership_lost` stoppt sofort; Text und Destination kommen ausschließlich aus dem acquired, autoritativ geladenen Kontext.

## 7. Pre-Dispatch Configuration

Access Token, Phone Number ID und die gepinnte Graph-Version `v25.0` werden erst bei Invocation serverseitig gelesen und vor Dispatch Authorization geprüft. Bei fehlender oder falscher Konfiguration wird ausschließlich die vorhandene fenced Pre-Dispatch-Failure-Authority verwendet; es entstehen weder Attempt noch Dispatch-Marker oder Provider Call.

## 8. Dispatch Authorization

Unmittelbar vor dem Provider Call autorisiert die bestehende atomare Authority exakt einen Attempt mit separatem Dispatch-Token. Nur `authorized` erlaubt den Send. `already_authorized` wird wegen eines möglichen Side Effects als `ambiguous` geschlossen; `attempts_exhausted` und `ownership_lost` werden ohne Send weitergereicht.

## 9. Provider Send Boundary

Der Runner verwendet ausschließlich `sendWhatsAppText(...)`. Pro Invocation existiert syntaktisch genau eine awaited Send-Stelle, keine Schleife, Rekursion, Queue oder Fire-and-forget-Ausführung. Gesendet werden exakt persistierter Text und persistierte Destination.

## 10. Provider Success Completion

Success wird mit aktuellem Owner, exakter Attempt-Nummer, exaktem Dispatch-Token und Provider Message ID an die vorhandene Completion übergeben. Nur `completed` ergibt `sent`.

## 11. Retryable Failure

Kontrollierte, sicher abgelehnte `retryable`-Ergebnisse werden einmal completed und ergeben `retry_scheduled`. `next_attempt_at`, Backoff und Maximalzahl bleiben ausschließlich DB-seitig; der Runner sendet nicht erneut.

## 12. Non-Retryable Failure

Kontrollierte terminale oder Konfigurations-Ablehnungen nach Dispatch werden durch dieselbe Completion persistiert und ergeben `terminal_failed`. Der Runner erfindet keinen nächsten Retry-Zeitpunkt.

## 13. Ambiguous Delivery

Ein kontrolliertes `requires_reconciliation`-Ergebnis wird fenced completed und ergibt `ambiguous`. Es gibt keinen unmittelbaren oder später im selben Aufruf ausgeführten Resend.

## 14. Ownership Lost

`ownership_lost` aus Revalidation, Pre-Dispatch Failure, Dispatch Authorization oder Completion stoppt den Lauf sofort. Es folgt weder eine alternative Mutation noch ein Provider-Resend.

## 15. Post-Dispatch Failure Safety

Ab erfolgreicher Dispatch Authorization gilt ein Side Effect als möglich. Unerwartete Send-/Completion-Exceptions und nicht erfolgreiche lokale Completion werden deshalb fail-closed als `ambiguous` behandelt. Der persistierte Dispatch-Marker erlaubt der Recovery später die sichere Finalisierung, niemals einen Blind-Retry.

## 16. Recovery Action Handling

`FINALIZE_AMBIGUOUS` ruft ausschließlich `finalize_expired_whatsapp_delivery_ambiguous(...)` auf. Der Pfad erzeugt keinen Owner, acquired nicht, revalidiert nicht, autorisiert keinen Dispatch und sendet nicht. Discovery selbst liegt ausdrücklich außerhalb des Runners.

## 17. Dependency Injection

Acquire, Revalidation, Konfigurationslesung, Pre-Dispatch Failure, Dispatch Authorization, Sender, Completion, Ambiguous-Finalisierung sowie UUID-Erzeuger sind injizierbar. Dadurch laufen die Runner-Tests ohne Datenbank und Netzwerk.

## 18. Productive Server Composition

`createProductiveRecoverableWhatsAppDeliveryDependencies()` komponiert lazy die bestehende Supabase-RPC-Persistence und den bestehenden Graph-Adapter. Der bisherige `deliverPendingWhatsAppMessage(...)` ist nur noch ein schmaler Compatibility Adapter auf den Runner; es bestehen keine konkurrierenden Orchestrationspfade. Der Modulimport führt weder DB- noch Graph-Operationen aus.

## 19. Security

Runner und Komposition sind `server-only`. Service Role und WhatsApp Credentials gelangen nicht in Domain- oder Result-Types. Exceptions werden nicht als rohe Fehlermeldungen ausgegeben; es werden keine personenbezogenen Logs ergänzt.

## 20. Tests

Die fokussierte Suite prüft Reihenfolge und Owner, autoritative Payload-Daten, genau einen Send, geschlossene Acquire-/Dispatch-Ausgänge, Konfigurationsfehler vor Attempt, retryable/rate-limited/terminal/ambiguous Completion, Ownership-Verlust, Success-Completion-Races, Exception-Sicherheit, Datenminimierung und den isolierten `FINALIZE_AMBIGUOUS`-Pfad. Bestehende Delivery-, Lease-/Recovery-, Identity-/Retry-, Runtime- und Webhook-Tests bleiben unverändert.

## 21. Explicitly Not Implemented

Nicht implementiert sind produktives Webhook Wiring, Recovery Route, Scheduler, neue Migration, neuer Graph API Adapter, OpenAI/LLM, Replanning, Re-Rendering, neue Outbound Message, Conversation Cycle Reopen, Heartbeat, interne Retry-Schleife oder Recovery Discovery im Runner.

## 22. Handoff to AP-16-06-04E

AP-16-06-04E kann die persistierte Outbound-ID nach erfolgreichem Cycle gezielt an diesen Runner übergeben und bounded Recovery Discovery/Route/Scheduling verdrahten. Dabei müssen Awaiting, Limits und genau ein Runner-Aufruf je Work Item erhalten bleiben.
