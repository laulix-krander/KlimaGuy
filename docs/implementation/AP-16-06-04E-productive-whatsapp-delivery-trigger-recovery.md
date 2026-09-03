# AP-16-06-04E — Productive WhatsApp Delivery Trigger & Recovery Scheduler

## 1. Architecture Basis

Grundlage sind AP-16-06-04A bis D sowie AP-16-06-03A und AP-16-06-03. Conversation Cycle und WhatsApp Delivery bleiben getrennte Authorities. Die bestehende persistente Outbound-ID, Delivery-Discovery, Lease/Fencing-, Dispatch- und Completion-Authority werden unverändert verwendet; neue fachliche DB-Semantik ist nicht nötig.

## 2. Scope

Dieses Paket verdrahtet ausschließlich den produktiven Immediate-Handoff und die dauerhafte Delivery-Recovery über eine eigene interne Route und einen eigenen Supabase-Scheduler. Es ergänzt eine additive Infrastrukturmigration.

## 3. Immediate Delivery Handoff

Der produktive Cycle-Caller awaited `runPersistentCustomerMessageCycle`. Ausschließlich `completed` mit vorhandener `outbound_message_id` startet genau einmal und vollständig awaited `runRecoverableWhatsAppDelivery`. Alle anderen Cycle-Ergebnisse und `completed` ohne Outbound-ID starten nichts. Es gibt weder Lookup noch Fire-and-forget.

## 4. Outbound Message Identity

Die einzige Handoff-Identity ist die exakt im Cycle-Result persistiert zurückgegebene `outbound_message_id`. Text, Telefonnummer, Conversation, Sequenz und „letzte Message“ werden nicht zur Korrelation verwendet.

## 5. Webhook Transport Boundary

Nach erfolgreicher Inbound-Persistenz bleibt Meta HTTP 200 maßgeblich. Kontrollierte Delivery-Ergebnisse und unerwartete Delivery-Exceptions werden nicht an Meta propagiert. Sie lösen keine zweite Invocation aus; persistente Delivery-Recovery bleibt Retry-Authority.

## 6. Immediate Runtime Budget

Die Node-Webhook-Route hat `maxDuration = 60`. Der Handler erfasst den Requestbeginn mit `performance.now()` und reicht ihn an den produktiven Trigger. Vor dem Start der Delivery werden monotonic die verbleibenden 60 Sekunden berechnet. Bei weniger als 20 Sekunden wird nichts gestartet; die bereits persistierte Pending-Delivery bleibt für Recovery erhalten. Ein gestarteter Runner wird vollständig awaited und nicht künstlich abgebrochen.

## 7. Delivery Runner Composition

Immediate- und Recovery-Pfad verwenden `createProductiveRecoverableWhatsAppDeliveryDependencies()` aus 04D. Es gibt keinen zweiten Supabase-Client-, Graph-Adapter- oder Runner-Contract.

## 8. Recovery Route

`POST /api/internal/whatsapp/deliveries/recovery` läuft server-only in der Node-Runtime, `dynamic = "force-dynamic"`, `maxDuration = 60`. Es gibt keinen GET-Handler und keine fachlichen Request-Parameter.

## 9. Authorization Contract

Die Route liest ausschließlich `WHATSAPP_DELIVERY_RECOVERY_SECRET`. Fehlend oder leer ergibt vor Factory, Discovery und Mutation HTTP 503. Akzeptiert wird exakt ein `Authorization: Bearer <secret>`; fehlend, malformed, mehrdeutig oder falsch ergibt vorher HTTP 401. Beide unveränderten Tokens werden per SHA-256 gehasht und mit `timingSafeEqual` verglichen. Das Secret erscheint weder in URL, Body, Cookie, Log noch Response.

## 10. Recovery Discovery

Nach Auth erfolgt genau ein `discoverRecoverableWhatsAppDeliveries(5)`. Keine freie SQL-Abfrage, Pagination oder Re-Discovery findet statt. Das Ergebnis enthält ausschließlich Command-ID, Outbound-ID und Recovery-Action.

## 11. Recovery Action Handling

`SAFE_TO_RUN` wird exakt auf `{ recovery_action: "SAFE_TO_RUN", outbound_message_id }` abgebildet. `FINALIZE_AMBIGUOUS` wird ausschließlich mit `{ recovery_action: "FINALIZE_AMBIGUOUS", delivery_command_id }` aufgerufen; der bestehende Runner führt dabei keinen Acquire, Dispatch oder Provider-Send aus.

## 12. Batch / Concurrency

Batchgröße ist hart 5. Eine awaited `for`-Schleife verarbeitet den einmal entdeckten Snapshot strikt sequenziell mit Concurrency 1. Es gibt kein `Promise.all`, keine Pagination und keinen In-Process-Retry.

## 13. Runtime / Start Budget

Der autorisierte Handler startet seine monotone Uhr vor Factory und Discovery. Vor jedem Element gilt `elapsed < 35.000 ms`. Ab 35 Sekunden wird kein neues Element gestartet; ein laufender Runner wird vollständig awaited. Es gibt kein `Promise.race` und keine Cancellation.

## 14. Recovery Response

Die HTTP-200-Response enthält ausschließlich Counts: `discovered`, `attempted`, alle geschlossenen Runner-Statuswerte, `unexpected_error` und `budget_exhausted`. `budget_exhausted` ist die Anzahl der Elemente des einmal entdeckten Snapshots, die wegen des Startbudgets nicht gestartet wurden. Einzelne Exceptions erhöhen `unexpected_error`; folgende Elemente dürfen innerhalb des Budgets weiterlaufen. IDs, Texte, Telefonnummern, Providerdaten und rohe Fehler fehlen.

## 15. Scheduler

Die additive Migration `202609030002_productive_whatsapp_delivery_recovery.sql` aktiviert die vorhandenen Extension-Grenzen und ersetzt replay-/conflict-aware den stabilen Job `whatsapp-delivery-recovery`. Er läuft exakt jede Minute (`* * * * *`) und sendet über `pg_net` einen HTTPS POST an die Delivery-Recovery-Route. Der Takt ist nur Polling; `next_attempt_at` bleibt Retry-Timing-Authority. SQL enthält keine Claim-, Retry- oder Dispatch-Semantik.

## 16. Vault Contract

Der Scheduler liest `KLIMAGUY_PRODUCTION_BASE_URL` als origin-only HTTPS-Production-URL und `WHATSAPP_DELIVERY_RECOVERY_SECRET` aus `vault.decrypted_secrets`. Der kontrollierte Route-Pfad wird angehängt. Migration und Repository enthalten keinen echten Secret-Wert oder Production Host.

## 17. Environment Variables

`.env.example` dokumentiert `WHATSAPP_DELIVERY_RECOVERY_SECRET` ohne Wert und Default. Die gleichnamige Vercel-Variable und der Vault-Eintrag müssen exakt denselben geheimen Wert repräsentieren. `KLIMAGUY_PRODUCTION_BASE_URL` bleibt ein Vault-only Scheduler-Contract.

## 18. Deployment Handoff

Nach Code-Deployment und vor Scheduler-Aktivierung sind manuell zu provisionieren:

1. Vercel: `WHATSAPP_DELIVERY_RECOVERY_SECRET`.
2. Supabase Vault: `WHATSAPP_DELIVERY_RECOVERY_SECRET` mit exakt demselben geheimen Wert.
3. Supabase Vault: `KLIMAGUY_PRODUCTION_BASE_URL` als origin-only HTTPS Production URL, ohne Pfad, Query oder Fragment und weder Preview noch localhost.
4. Danach die additive 04E-Migration auf Production anwenden.

## 19. Security

Auth läuft vor Erzeugung einer DB-Capability. Route und Composition sind server-only. Recovery akzeptiert keine IDs oder Customer-Daten vom Request. Keine PII, Secrets, Provider-Payloads, Provider-IDs, DB-/Providerfehler oder Stacktraces werden ausgegeben. Cycle-State, Planner und Rendering werden durch Delivery nicht berührt.

## 20. Tests

Fokussierte Tests decken Immediate-ID-Handoff, vollständiges Awaiting, sämtliche ausgeschlossenen Cycle-Ergebnisse, 20-Sekunden-Grenze, Exception-Isolation, fail-closed Auth, SHA-256/`timingSafeEqual`, einmalige Discovery mit Limit 5, Identity-Mapping beider Actions, Sequenz, Counts, 35-Sekunden-Grenze, Route- und Scheduler-Statik ab. Bestehende Cycle-, Webhook-, Delivery-Runner-, Identity-/Retry-, Lease-/Recovery- und Outbound-Tests bleiben aktiv.

## 21. Explicitly Not Implemented

Nicht implementiert sind OpenAI/LLM, Language Rewrite, neue Cycle- oder Delivery-Semantik, neue Delivery-Tabellen/RPCs, Replanning, Re-Rendering, Conversation-Cycle-Reopen, neue Outbound Messages im Retry, zweiter Graph-Adapter, parallele Sends, In-Process-Retry, Timer/Queue oder historische Migrationsänderungen.

## 22. Handoff to deterministic E2E validation / language inference

Empfohlen ist als Nächstes eine deterministische E2E-Validierung der produktiven Vault-, pg_cron-, pg_net-, Vercel- und Meta-Grenzen mit inhaltsarmer Observability. Vor Language Inference/OpenAI müssen Runtime-, Lease- und Timeout-Verträge erneut auditiert werden; dieses Paket autorisiert keine Inference.
