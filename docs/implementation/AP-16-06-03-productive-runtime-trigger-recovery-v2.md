# AP-16-06-03 – Productive Runtime Trigger & Recovery Scheduling (v2)

## 1. Architecture Basis

Grundlage sind die Audits AP-16-06-00, AP-16-06-01A und AP-16-06-03A sowie die Implementierungspakete AP-16-06-01B bis F und AP-16-06-02. Die bestehenden Read-, Commit-, Failure-, Review-, Acquire- und Discovery-Authorities bleiben unverändert maßgeblich.

## 2. AP-16-06-03A Contract

Umgesetzt ist der eingefrorene Vertrag: Vercel Hobby als Node-Runtime, awaited Immediate Execution und Supabase `pg_cron` → Vault → `pg_net` → Vercel für die Recovery. Der feste Takt ist fünf Minuten, Batchgröße 10, Concurrency 1, Gesamtbudget 60 Sekunden und Startbudget 45 Sekunden.

## 3. Immediate Trigger

Nach erfolgreicher `persistWhatsAppInboundText(...)`-Persistenz startet nur `recorded && cycle_eligible` genau einen `runPersistentCustomerMessageCycle(...)` mit der internen `message_id`. Der vorhandene Webhook awaited weiterhin den injizierbaren `MessageCycleTrigger`. Duplikate und nicht geeignete Nachrichten starten keinen Cycle.

## 4. Legacy Claim Replacement

Der direkte produktive Aufruf von `claim_customer_message_cycle(...)` wurde aus `triggerPersistentMessageCycle(...)` entfernt. Nur die leasegebundene Data Source des Runners ruft `acquire_customer_message_cycle_execution(...)` auf; es gibt keinen Vor-Claim und kein doppeltes Claiming.

## 5. Transport Acceptance Boundary

Inbound-Persistenz bleibt Transport-Authority. Alle geschlossenen Runner-Ergebnisse sowie eine unerwartete Exception nach erfolgreicher Persistenz verändern HTTP 200 nicht und werden nicht an Meta exponiert. Persistenz-, Signatur- und Parsingfehler behalten den bestehenden Transportvertrag. Delivery-/Read-Status-Reconciliation wurde nicht verändert.

## 6. Runner Composition

`createProductiveCycleRuntime()` erzeugt lazy und ausschließlich serverseitig einen zentralen Service-Role-Supabase-Client. Derselbe eng gekapselte RPC-Adapter wird den bestehenden Acquire-, Read-, Commit-, Failure-, Review- und Discovery-Grenzen übergeben. Beim Modulimport erfolgen keine Netzwerk- oder Datenbankoperationen.

## 7. Recovery Route

`POST /api/internal/conversation-cycles/recovery` läuft explizit in der Node-Runtime mit `maxDuration = 60`. Es gibt keinen GET-Handler. Die Route akzeptiert keine fachlichen IDs oder steuerbaren Batchparameter.

## 8. Authorization

Zuerst wird `CONVERSATION_CYCLE_RECOVERY_SECRET` geprüft. Fehlende oder leere Konfiguration liefert 503. Erst danach wird exakt ein `Authorization: Bearer <Token>` akzeptiert; fehlende, malformed, mehrdeutige oder falsche Header liefern 401. Query, Body und Cookies sind keine Auth-Grenzen. Vor erfolgreicher Auth werden weder Client noch Discovery noch Runner erzeugt.

## 9. Constant-Time Secret Comparison

Beide unveränderten UTF-8-Token werden mit SHA-256 gehasht. Die gleich langen Digests werden mit `node:crypto.timingSafeEqual` verglichen. Secret, Header und Vergleichsdetails werden weder geloggt noch beantwortet.

## 10. Recovery Discovery

Die Route ruft genau einmal `discoverRecoverableConversationCycles(..., 10)` auf. Sie liest keine Tabellen direkt, prüft keine Lease und implementiert kein Reclaim.

## 11. Batch Size

Ein Request entdeckt maximal 10 Commands. Es gibt keine Pagination, zweite Discovery oder backlog-leerende Schleife.

## 12. Sequential Execution

Die Discovery-Reihenfolge wird mit einer einfachen awaited Schleife und Concurrency 1 verarbeitet. Jeder `source_message_id` erhält höchstens einen Runner-Aufruf je Tick; `Promise.all` und Worker-Pools werden nicht verwendet.

## 13. Runtime Budget

Eine monotone Uhr startet nach erfolgreicher Auth vor der Discovery. Vor jedem neuen Command gilt `elapsed < 45.000 ms`. Bei Erreichen des Startbudgets beginnt kein weiterer Command; ein bereits laufender Runner wird nicht abgebrochen. `budget_exhausted` signalisiert den Rest inhaltsarm, der nächste Tick übernimmt ihn.

## 14. Failure Isolation

Alle sieben kontrollierten Runner-Kategorien werden einzeln gezählt. Eine unerwartete per-Command-Exception erhöht ausschließlich `unexpected_error` und verhindert weitere Starts innerhalb des Budgets nicht. Es gibt weder internen Retry noch per-Command-Timeout.

## 15. Supabase Cron

Die additive Migration `202609020004_productive_conversation_cycle_recovery.sql` aktiviert die bestehenden Supabase-Erweiterungsgrenzen `pg_cron` und `pg_net`, entfernt bei Replay einen Job gleichen Namens und plant `conversation-cycle-recovery` exakt mit `*/5 * * * *`.

## 16. Vault / pg_net

Der Cron-Command liest ausschließlich `KLIMAGUY_PRODUCTION_BASE_URL` und `CONVERSATION_CYCLE_RECOVERY_SECRET` aus `vault.decrypted_secrets`. Er sendet einen HTTPS POST mit JSON Content-Type und Bearer Header an `/api/internal/conversation-cycles/recovery`. Die Migration enthält weder echte Werte noch Customer-, Message- oder Providerdaten.

## 17. Deployment Secret Contract

Nach Merge sind einmalig folgende externe Schritte erforderlich:

1. In Vercel `CONVERSATION_CYCLE_RECOVERY_SECRET` als serverseitige Environment Variable mit einem starken geheimen Wert setzen.
2. In Supabase Vault einen Secret-Eintrag namens `CONVERSATION_CYCLE_RECOVERY_SECRET` mit exakt demselben geheimen String anlegen.
3. In Supabase Vault `KLIMAGUY_PRODUCTION_BASE_URL` als origin-only HTTPS-URL der produktiven KlimaGuy-Deployment-Domain ohne Pfad, Query oder Fragment anlegen; keine Preview- oder lokale URL.
4. Die additive Migration auf das Production-Supabase-Projekt anwenden, nachdem beide Vault-Einträge vorhanden sind.

Die Migration provisioniert bewusst keinen Wert. Eine Rotation muss Vercel und Vault koordiniert aktualisieren.

## 18. Security

Route und Komposition sind server-only. Auth läuft vor jeder DB-Capability. Responses enthalten nur feste leere 401/503-Antworten oder aggregierte Counts. Keine IDs, Customer-Inhalte, Telefonnummern, Providerdaten, rohen Fehler oder Secrets werden ausgegeben. Die Route führt keine direkte Persistence-Mutation aus.

## 19. Observability

Die autorisierte Response enthält ausschließlich `discovered`, `attempted`, die sieben Result-Counts, `unexpected_error` und `budget_exhausted`. Es wurden keine personenbezogenen Logs ergänzt.

## 20. Tests

Fokussierte Tests prüfen Fail-closed-Auth, Digestvergleich, Limit 10, einmalige Discovery, Reihenfolge/Concurrency 1, alle Resultklassen, Exception-Isolation, die 45-Sekunden-Grenze, Node/60-Sekunden-Konfiguration, Migration/Vault/Cron sowie verbotene Trigger-Grenzen. Die Webhook-Tests sichern Signatur, Deduplizierung, awaited Injection und Transport-Acceptance.

## 21. Explicitly Not Implemented

Nicht implementiert sind WhatsApp Outbound Send, Graph API Delivery, OpenAI/LLM/Inference, Replanning, Re-Rendering, direkte Knowledge-/Runtime-Mutation, neue Domain-Semantik, Queue, Timer, parallele Worker, Heartbeat oder eine zweite Scheduler-Technologie. Historische Migrationen wurden nicht verändert.

## 22. Handoff to WhatsApp Delivery Bridge

Das empfohlene nächste Paket ist der separat auditierte WhatsApp Delivery Bridge: Es darf intern persistierte Outbound Messages an die bestehende Delivery Authority anbinden, ohne Cycle- und Delivery-Retry zu vermischen. OpenAI bleibt weiterhin außerhalb dieses Handoffs.
