# AP-16-06-05F – Productive First-Contact Wiring & Recovery

## 1. Architecture Basis

05F bleibt ein modularer Monolith und verdrahtet ausschließlich persistierte Authorities. Der Webhook interpretiert weder Nachrichtentext noch plant er selbst. OpenAI ist nicht beteiligt.

## 2. 05D Foundation

`runFirstContactFoundation(conversation_id)` ist die atomare, replay-sichere Authority für Customer, Transport-Bindung, Conversation-Bindung, Project **„Neue Klimaanfrage“**, Project Assignment, leeren Knowledge State v1 und Runtime revision 1/`idle`. Der stabile System Actor `klimaguy_system` wird innerhalb der Datenbank aufgelöst; keine konkrete Auth-UUID wird übergeben oder hardcodiert. Pre-Prompt Messages bleiben append-only und werden nicht als Answers verarbeitet.

## 3. 05E Initial Prompt

`runFirstContactInitialPrompt(conversation_id)` komponiert den vorhandenen deterministischen Planner und Renderer. Die atomare Commit-Authority persistiert genau einen `building_type`/`ask_building_type` Snapshot, eine Pending Interaction, Outbound Message, Delivery Command und Runtime revision 2/`awaiting_customer_answer`. Sie ruft keinen Provider auf.

## 4. Productive Webhook Routing

Unmittelbar nach erfolgreicher Text-Persistenz wird genau einmal anhand des Persistenzresultats geroutet:

1. `recorded && cycle_eligible`: unveränderter Customer-Answer Cycle.
2. `!cycle_eligible` und persistierte First-Contact Eligibility `healable`/`already_initialized`: First-Contact-Orchestrator.
3. Sonst: kein Runtime-Pfad.

Die Entscheidung wird nach Initialisierung nicht wiederholt. Dadurch kann dieselbe Inbound Message nicht gleichzeitig First Contact und Customer Answer sein.

## 5. Recorded vs Duplicate

`recorded` und `duplicate` dürfen bei `cycle_eligible=false` dieselbe idempotente Healing-Authority aufrufen. Ein Duplicate startet niemals den normalen Customer-Answer Cycle. Das schließt die Crash-Lücke nach Inbound Commit, ohne Cycle-Dedupe zu umgehen.

## 6. Same Message Never Answer

Der Orchestrator erhält ausschließlich `conversation_id`, Startbudget und die Delivery-Option – keinen Text und keine Message-ID. „Hallo“ bleibt Pre-Prompt History. Auch nachdem 05E im selben Request `awaiting_customer_answer` gesetzt hat, gibt es weder Eligibility-Recheck noch Cycle-Re-entry, Customer-Answer Command, Knowledge Transition oder Claim.

## 7. First-Contact Orchestrator

`runProductiveFirstContactInitialization` awaited zuerst 05D und nur bei `created`, `partial_completed` oder `already_complete` 05E. Conflict, Actor-/State-/Persistence-Probleme schließen kontrolliert. `stale` wird nicht erneut versucht; `already_advanced` und `not_applicable` starten keine Delivery. Resultate sind geschlossen und PII-frei.

## 8. Immediate Delivery Handoff

Nur `initialized` oder `already_initialized` liefern die autoritative persistierte `outbound_message_id`. Nur diese ID geht an den vorhandenen `runRecoverableWhatsAppDelivery`; es gibt keinen zweiten Graph-Adapter und keine Lookup-Heuristik. Ein Replay kann damit den Crash zwischen Prompt Commit und Handoff heilen. Der lease-/retry-sichere Runner bleibt alleinige Provider-Attempt-Authority.

## 9. `outbound_message_id` Authority

Es gibt keine Suche nach latest outbound, Sequence, Text, Question, Timestamp oder Prompt. Ausschließlich der geschlossene 05E-Result-Contract autorisiert den Handoff. 05F erzeugt weder eine zweite Outbound Message noch einen zweiten Delivery Command.

## 10. Runtime Budget

Der Webhook nutzt seinen vorhandenen monotonen `performance.now()`-Startwert, 60 Sekunden Runtime und denselben Mindest-Restzeit-Contract von 20 Sekunden. Unterhalb des Budgets wird kein neuer Delivery Attempt gestartet; der persistierte Command bleibt recoverable. `Date.now()` wird nicht in die Rechnung gemischt.

## 11. Delivery Recovery Separation

Die First-Contact-Recovery führt bewusst nur Foundation und Initial-Prompt Commit aus (`immediate_delivery=false`) und stoppt. Danach ist ausschließlich die vorhandene WhatsApp Delivery Recovery für pending Commands zuständig. So entstehen keine parallelen Provider- oder Retry-Pfade.

## 12. First-Contact Recovery Discovery

`discover_recoverable_first_contacts` ist eine service-only, content-free Datenbank-Authority. Sie findet deterministisch offene Conversations mit persistierter Inbound Message sowie genau einer aktiven WhatsApp Transport Identity/Binding, deren Foundation fehlt oder deren Runtime noch im pristine `idle`-Zustand ohne Initial-Prompt-Command/Pending Interaction steht. Vollständig initialisierte, awaiting, advanced, geschlossene oder transportlose Conversations werden ausgeschlossen. Das Ergebnis enthält nur `conversation_id` und `FOUNDATION_REQUIRED`/`INITIAL_PROMPT_REQUIRED`, maximal 10, sortiert nach `created_at`, dann UUID.

## 13. Recovery Route

`POST /api/internal/first-contact/recovery` läuft als Node.js, `force-dynamic`, `maxDuration=60`. Pro Request erfolgt genau eine Discovery, keine Pagination und kein Work-fetching-Loop.

## 14. Auth Contract

Nur `Authorization: Bearer <FIRST_CONTACT_RECOVERY_SECRET>` ist zulässig. Fehlende/leere Serverkonfiguration ergibt 503 vor Client/Discovery/Orchestration. Fehlende, falsche, malformed oder ambiguous Bearer-Header ergeben 401. SHA-256-Digests werden mit `timingSafeEqual` verglichen. Secret in URL, Query, Body oder Cookie ist nicht unterstützt.

## 15. Scheduler

Supabase `pg_cron` plant den stabilen Job `first-contact-recovery` replay-/conflict-aware nach vorherigem Unschedule mit `* * * * *`. Eine Minute ist zeitnah genug für Erstkontakt und nicht höher frequentiert als Delivery Recovery. `pg_net` sendet HTTPS POST zur internen Route; Vercel Cron ist nicht Primärscheduler.

## 16. Vault Contract

Scheduler-SQL liest ausschließlich `KLIMAGUY_PRODUCTION_BASE_URL` und `FIRST_CONTACT_RECOVERY_SECRET` aus Vault. Die Base URL muss eine HTTPS Production Origin ohne Path, Query oder Fragment sein; localhost und Preview-Pfade erfüllen den Contract nicht. Das Secret muss byte-identisch zum Vercel Production Secret sein.

## 17. Batch, Concurrency & Budget

Batchgröße ist maximal 10. Verarbeitung erfolgt sequentiell mit Concurrency 1. Vor jedem neuen Item wird das monotone 40-Sekunden-Startbudget geprüft; ein begonnenes Item wird vollständig awaited. Unbegonnene Items werden in `budget_exhausted` gezählt.

## 18. Failure Isolation

Eine unerwartete Item-Exception erhöht `unexpected_error`; weitere Items laufen, sofern Budget vorhanden. Die Antwort enthält nur Counts: `discovered`, `completed`, `already_complete`, `not_applicable`, `stale`, `failed`, `unexpected_error`, `budget_exhausted`. Keine IDs oder Inhalte werden ausgegeben.

## 19. Meta HTTP 200 Isolation

Nach erfolgreicher Inbound-Persistenz werden kontrollierte und unerwartete Foundation-, Prompt- und Delivery-Probleme isoliert und nicht zum Meta-500. Fehler vor dem Inbound Commit behalten unverändert das bestehende Verhalten.

## 20. Security

Recovery-DB-Authorities sind nur für `service_role` ausführbar. Responses und neue Observability enthalten keine Telefonnummern, `wa_id`, Texte, Namen, Provider Payloads oder Secrets. Der Webhook übergibt weder Actor, Project noch Prompt. Es gibt keine Knowledge Mutation, KI-Auswertung, automatische Angebotsfreigabe oder Preislogik.

## 21. Production Deployment Requirements

Production Code muss 05D, 05E und 05F enthalten. Erst danach bzw. im kontrollierten Deploymentfenster sind alle unten genannten additiven Migrationen anzuwenden. Codex führt keine Production-SQL-Ausführung durch.

## 22. Required Migrations

Vor Live E2E müssen in Production angewendet sein:

1. `202609040001_first_contact_foundation.sql`
2. `202609040002_deterministic_initial_prompt_commit.sql`
3. `202609040003_productive_first_contact_recovery.sql`

Der Prompt bestätigt das Production Deployment von 05D/05E ausdrücklich nicht; es muss separat verifiziert werden.

## 23. Required Vercel Env

Vercel Production benötigt `FIRST_CONTACT_RECOVERY_SECRET` ohne Default. Zusätzlich bleiben bestehende Supabase-, Meta- und Delivery-Konfigurationen erforderlich.

## 24. Required Vault Entries

Supabase Vault benötigt `KLIMAGUY_PRODUCTION_BASE_URL` und `FIRST_CONTACT_RECOVERY_SECRET`. Letzteres muss byte-identisch zum Vercel-Wert sein.

## 25. Production E2E Runbook

Vor dem Live Test:

- bestätigen, dass Production Code 05D/05E/05F enthält;
- Migrationen `202609040001`, `202609040002`, `202609040003` als applied bestätigen;
- Vercel Production Env `FIRST_CONTACT_RECOVERY_SECRET` bestätigen;
- Vault-Einträge `FIRST_CONTACT_RECOVERY_SECRET` und `KLIMAGUY_PRODUCTION_BASE_URL` bestätigen;
- Recovery Route mit gültigem und ungültigem Bearer testen;
- `pg_cron` Job `first-contact-recovery` und Minutenschedule prüfen;
- vorhandene Delivery Recovery als aktiv/korrekt bestätigen.

Dann von genau einer externen WhatsApp-Nummer exakt eine Textnachricht **„Hallo“** senden: kein Media und kein zweiter manueller Send im Testfenster. PASS: Meta 200; je genau ein Inbound, Customer, Project „Neue Klimaanfrage“, leerer Knowledge State v1, Initial Prompt `building_type`, Outbound Prompt und Delivery Command; Runtime awaiting; maximal ein Provider Attempt pro Runner-Invocation; bei Erfolg Provider Binding und genau eine Kundenantwort; „Hallo“ ist kein Answer; kein Duplicate Prompt/Send und keine unerwarteten Recovery-Fehler.

## 26. Explicitly Not Implemented

Keine neue Planner-/Renderer-/Graph-/Delivery-/Retry-Authority, keine Conversation-Cycle-Fachänderung, kein Content Lookup, keine retroaktive Answer-Auswertung, keine Knowledge Claims, kein Vercel-Cron-Primärscheduler und keine Production-SQL-Ausführung.

## 27. OpenAI Gate

OpenAI bleibt vollständig gesperrt. SDK, API-Key, Modellaufruf, LLM-Klassifikation oder Rewrite sind nicht enthalten oder vorbereitet. Das nächste AI-Paket darf erst nach dokumentiertem deterministischem Production First-Contact E2E PASS beginnen.
