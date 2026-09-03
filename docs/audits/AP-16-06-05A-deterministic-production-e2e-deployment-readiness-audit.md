# AP-16-06-05A — Deterministic Production E2E Deployment Readiness Audit

**Audit-Baseline:** `fa4df471371687be84540be05ec49bd18fd27e10`  
**Audit-Datum:** 2026-09-03  
**Scope:** Repository-Sollzustand und sicherer Deployment-/Validierungsplan; kein Zugriff auf Production und keine Produktänderung.

## 1. Executive Result

**AUDIT RESULT: BLOCKED**

Die AP-16-06-Fortsetzungs- und Delivery-Kette ist im Repository vollständig und ihre Deployment-Reihenfolge ist bestimmbar. Der verlangte erste Live-Test „neue externe Nummer sendet `Hallo` und erhält eine deterministische Antwort“ ist jedoch durch den aktuellen produktiven Inbound-Vertrag nicht erreichbar: `ingest_whatsapp_inbound_text(...)` legt für eine neue Transportidentität eine offene Conversation mit `current_project_id = null` an. `cycle_eligible` wird nur für eine bereits projektgebundene Conversation mit Runtime-Status `awaiting_customer_answer` wahr. Im produktiven Code existiert keine Authority/Route, die aus diesem ersten Inbound automatisch Projekt, Runtime, Pending Interaction, Planner Snapshot und initialen Outbound Prompt erzeugt oder bindet.

Die **kleinste fehlende Authority** ist daher eine explizite produktive Conversation-Bootstrap-/Initial-Prompt-Authority (einschließlich sicherer Projektzuordnung) für neue WhatsApp-Identitäten. Betroffen sind der Vertrag in `202608240001_whatsapp_inbound_text_ingestion.sql` und der ausschließlich `cycle_eligible` verarbeitende Pfad in `lib/server/whatsapp/webhook.ts`/`lib/server/whatsapp/ingestion.ts`. Ohne diese Authority wird `Hallo` zwar genau einmal persistiert und mit HTTP 200 bestätigt, aber es startet kein Cycle, es entsteht kein Outbound und der geforderte E2E-PASS ist unmöglich. Deployment darf deshalb bis einschließlich Infrastrukturverifikation vorbereitet, der deklarierte Live-E2E-PASS aber nicht behauptet werden.

**Kleinstmögliches Folgepaket:** separater Architekturentscheid und Implementierung einer atomaren, idempotenten, service-only Bootstrap-Authority samt Migration, produktiver Aufrufgrenze, RLS/Audit-Vertrag und Tests. Dieses Audit repariert die Lücke ausdrücklich nicht. Alternativ könnte ein späterer, separat autorisierter Testvertrag eine nachweislich vorpräparierte Transportbindung mit aktivem Pending Prompt verwenden; das wäre aber nicht der hier verlangte erstmalige `Hallo`-Test einer echten externen Nummer und ist aktuell nicht als reproduzierbarer Production-Setup-Pfad vorhanden.

Production-Istwerte und tatsächlich angewandte Migrationen wurden nicht abgefragt. Alle bekannten externen Fakten bleiben bis zur manuellen Verifikation **unbestätigt**.

## 2. Repository Baseline

- Baseline ist Commit `fa4df471371687be84540be05ec49bd18fd27e10`.
- Stack: Next.js App Router/Node-Runtime, serverseitiger Supabase-Service-Client, PostgreSQL Authorities, `pg_cron`/Vault/`pg_net`, Meta Graph API.
- Im Repository liegen neun chronologisch zusammenhängende AP-16-06-Migrationen von `202609010001` bis `202609030002`; keine Lücke im Dateinummern-/Abhängigkeitsverlauf wurde gefunden.
- `.env.example` und produktiver Code stimmen bei den relevanten Variablennamen überein.
- Die historischen Migrationen wurden in diesem Paket weder geändert noch durch Ersatz-SQL nachgebildet. Die Schema-Migrationen sind normale einmalig anzuwendende additive Migrationen, nicht beliebig erneut ausführbare Installationsskripte. Nur die beiden Scheduler-Migrationen besitzen ausdrücklich Replace-on-Replay-Verhalten.

## 3. Deterministic Runtime Path

Für eine **bereits vorbereitete, offene, projektgebundene Conversation mit aktivem Pending Prompt** ist der Pfad:

`Meta POST → Signaturprüfung → atomare Inbound-Persistenz/Deduplizierung → cycle_eligible → leasegebundener Conversation Cycle → persistenter Context → deterministische Interpretation/Transition/Planung/Rendering → atomarer Commit → outbound_message_id → awaited Delivery Runner → Acquire/Revalidate/Authorize → bestehender Meta-Graph-Adapter → Provider-ID-Binding → Status-Reconciliation`.

Recovery bleibt fachlich getrennt:

- Conversation: `pg_cron → Vault → pg_net → POST /api/internal/conversation-cycles/recovery → Discovery → Cycle Runner`.
- Delivery: `pg_cron → Vault → pg_net → POST /api/internal/whatsapp/deliveries/recovery → bounded Discovery → Delivery Runner`.

Der Pfad enthält weder OpenAI noch LLM, Language Rewrite oder provider-neutrale Language Inference. Die Blockade liegt **vor** diesem Fortsetzungspfad: Es fehlt der produktive Bootstrap für den ersten Kontakt.

## 4. Migration Inventory

Alle folgenden Dateien sind im Repository vorhanden und müssen für den AP-16-06-Sollzustand in Production in exakt dieser Reihenfolge angewandt sein. „Vorbedingung“ meint zusätzlich sämtliche chronologisch älteren Baseline-Migrationen bis einschließlich `202608240003_whatsapp_media_safe_staging.sql`.

| Reihenfolge / Datei | Zweck und direkte Vorbedingung | Tabellen / Spalten / Constraints / Indizes | RPCs / Trigger / Cron | E2E-kritisch |
|---|---|---|---|---|
| 1. `202609010001_planner_snapshot_persistence.sql` | Immutable Planner-/Render-Snapshot; benötigt Conversation Runtime/Message Authority | Neu: `conversation_interaction_snapshots`; `conversation_pending_interactions.snapshot_id`; Snapshot-FKs, Eindeutigkeit, JSON-/Größenchecks, erweiterter Action-Type-Check, RLS | `planner_snapshot_dto`, `activate_planner_interaction_snapshot`, `get_planner_interaction_snapshot`; Immutable-/Active-Snapshot-Trigger | Ja |
| 2. `202609010002_cycle_context_read_authority.sql` | Stabile Cycle-Identität und side-effect-free Context Read; benötigt 1 | `conversation_cycle_commands`: Projekt-, Prompt-, Zeit-, Korrelations-, Transition-, Claim-, Evidence-, Apply-, Assessment-, Planner-, Event-, Next-Entity- und Sequence-Reservierungen | ersetzt Guard und `claim_customer_message_cycle`; neu `get_customer_message_cycle_context` | Ja |
| 3. `202609020001_customer_answer_knowledge_apply.sql` | Persistente Customer-Answer-Knowledge-Transition; benötigt 2 und ältere Knowledge Authority | Neu: `customer_answer_knowledge_transitions`, `customer_answer_knowledge_claims`, `customer_answer_claim_evidence`; PK/FK/Unique/Checks, RLS | `apply_customer_answer_knowledge_transition`; append-only Trigger | Ja |
| 4. `202609020002_atomic_cycle_commit_failure_authority.sql` | Atomarer Cycle-Erfolg, Failure und Human Review; benötigt 3 | `conversation_cycle_commands.commit_payload_hash`; neu `conversation_cycle_events`, Constraints/RLS | ersetzt Guard; `commit_customer_message_cycle`, `fail_customer_message_cycle`, `complete_customer_message_human_review`; append-only Trigger | Ja |
| 5. `202609020003_recoverable_conversation_cycle_runner.sql` | Lease/Reclaim/Discovery für Cycles; benötigt 4 | `conversation_cycle_commands`: `execution_owner_id`, `execution_lease_expires_at`, `execution_attempt_count`; partieller Recovery-Index | `acquire_customer_message_cycle_execution`, `discover_recoverable_conversation_cycles`; ersetzt Failure/Commit/Review mit Ownership-Fencing | Ja |
| 6. `202609020004_productive_conversation_cycle_recovery.sql` | produktiver Conversation-Scheduler; benötigt Route, Vercel-Secret, Vault-Werte und 5 | Extensions `pg_cron`, `pg_net`; keine Fachtabelle | Job `conversation-cycle-recovery`, `*/5 * * * *` | Ja für Recovery, nicht für unmittelbare Ausführung |
| 7. `202609020005_whatsapp_delivery_identity_retry_authority.sql` | stabile Delivery-ID, Dispatch- und Retry-Authority; benötigt ältere Outbound-Delivery Authority und 4 für Outbound-Erzeugung | `transport_delivery_commands`: `next_attempt_at` und Dispatch-Marker/-Nummer/-Token; Marker-Check und eindeutiger WhatsApp-Command-Index; die ältere Delivery-Baseline liefert bereits Attempts, Retry-/Status-Typen und Provider-Binding | Claim/Revalidate/Authorize/Pre-dispatch-Fail/Complete RPCs | Ja |
| 8. `202609030001_whatsapp_delivery_lease_recovery_authority.sql` | Delivery Lease, Reclaim, Discovery und Ambiguity-Fencing; benötigt 7 | `transport_delivery_commands`: Execution Owner/Lease/Execution Count/Start; Recovery-Index; konsistente Ownership-/Dispatch-Checks | `acquire_whatsapp_delivery_execution`; ersetzte Revalidate/Authorize/Fail/Complete; `finalize_expired_whatsapp_delivery_ambiguous`, `discover_recoverable_whatsapp_deliveries` | Ja |
| 9. `202609030002_productive_whatsapp_delivery_recovery.sql` | produktiver Delivery-Scheduler; benötigt Route, Vercel-Secret, Vault-Werte und 8 | Extensions `pg_cron`, `pg_net`; keine Fachtabelle | Job `whatsapp-delivery-recovery`, `* * * * *` | Ja für Recovery |

Die Dateien 6 und 9 aktivieren ihre Jobs unmittelbar beim Apply. Sie dürfen nicht vor den jeweiligen externen Voraussetzungen angewandt werden. Keine Datei darf übersprungen oder historisch editiert werden.

## 5. Migration Dependency Order

Verbindliche Apply-Reihenfolge nach bestätigter Baseline `202608240003`:

1. `202609010001_planner_snapshot_persistence.sql`
2. `202609010002_cycle_context_read_authority.sql`
3. `202609020001_customer_answer_knowledge_apply.sql`
4. `202609020002_atomic_cycle_commit_failure_authority.sql`
5. `202609020003_recoverable_conversation_cycle_runner.sql`
6. **Scheduler zunächst zurückhalten:** `202609020004_productive_conversation_cycle_recovery.sql`
7. `202609020005_whatsapp_delivery_identity_retry_authority.sql`
8. `202609030001_whatsapp_delivery_lease_recovery_authority.sql`
9. **erst nach Route/Secrets:** `202609020004_productive_conversation_cycle_recovery.sql`, falls noch nicht angewandt
10. **erst nach Route/Secrets:** `202609030002_productive_whatsapp_delivery_recovery.sql`

Chronologisch liegt Datei 6 vor 7/8. Bei einem normalen vollständigen Migration-Runner kann sie nur sicher an Position 6 laufen, wenn Code, Environment und Vault vorher fertig sind. Bei kontrollierter manueller Anwendung darf sie nach 8 zurückgestellt werden; innerhalb der Schema-/Authority-Kette bleiben alle fachlichen Dateien chronologisch. Scheduler 9 bleibt zuletzt.

## 6. Production Migration Verification Contract

`supabase_migrations.schema_migrations` ist **keine vorausgesetzte Authority**. Vor jedem Apply muss eine spätere, read-only Verification die effektiven Objekte katalogbasiert prüfen und pro Datei als vollständig/fehlend/partiell klassifizieren:

- Tabellen über `pg_class`/`information_schema.tables`, Spalten inklusive Typ, Nullability und Default über `pg_attribute`/`information_schema.columns`.
- benannte PK/FK/Unique/Check-Constraints und partielle Indizes über `pg_constraint`, `pg_index`, `pg_class` und `pg_get_indexdef`.
- exakte Function-Signaturen und Rückgabetypen über `pg_proc`, `pg_namespace`, `pg_get_function_identity_arguments` und `pg_get_function_result`; bei ersetzten RPCs muss die neueste Signatur gelten.
- Trigger, RLS-Flag, Policies und Grants über `pg_trigger`, `pg_class.relrowsecurity`, `pg_policies` und ACL/Privilege-Sichten.
- Enumwerte über `pg_type`/`pg_enum`.
- Extensions über `pg_extension`.
- Cron exakt über `cron.job`: stabiler Name, Schedule und Command; pro Name genau eine aktive Zeile.

Ein teilweise vorhandener Footprint ist **kein Erfolg** und darf nicht durch SQL-Fragmente ergänzt werden. Er ist ein STOP für eine technische Bestandsanalyse. Erst wenn die komplette Vorgängermigration objektbasiert bestätigt ist, darf die nächste vollständige Repository-Migration angewandt werden. Dieser Audit enthält absichtlich keinen ausführbaren User-SQL-Block.

## 7. Vercel Environment Inventory

`NEXT_PUBLIC_SUPABASE_ANON_KEY` ist allgemeiner App-Betrieb, aber keine Authority im serverseitigen deterministischen E2E-Pfad. Der tatsächliche Supabase-URL-Name ist `NEXT_PUBLIC_SUPABASE_URL`, nicht `SUPABASE_URL`.

Legende: **R** = erforderlich, **–** = nicht erforderlich. Alle als required markierten Werte müssen für Vercel **Production** gesetzt sein.

| Variable | GET | POST | Cycle | Immediate Delivery | Cycle Recovery | Delivery Recovery | Status / Default | Sensitiv |
|---|:---:|:---:|:---:|:---:|:---:|:---:|---|:---:|
| `NEXT_PUBLIC_SUPABASE_URL` | – | R (Persistenz/Status) | R | R | R | R | required; kein Runtime-Default | Nein (öffentlich benannter Endpoint) |
| `SUPABASE_SERVICE_ROLE_KEY` | – | R | R | R | R | R | required; kein Default; ausschließlich serverseitig | Ja |
| `WHATSAPP_WEBHOOK_VERIFY_TOKEN` | R | – | – | – | – | – | required für GET; kein Default | Ja |
| `WHATSAPP_META_APP_SECRET` | – | R | – | – | – | – | required; kein Default | Ja |
| `WHATSAPP_ACCESS_TOKEN` | – | – | – | R | – | R | required für Send; kein Default | Ja |
| `WHATSAPP_PHONE_NUMBER_ID` | – | – | – | R | – | R | required für Send; kein Default | Betriebskennung, vertraulich behandeln |
| `WHATSAPP_GRAPH_API_VERSION` | – | – | – | R | – | R | required zur Laufzeit; `.env.example` zeigt `v25.0`, Adapter akzeptiert ausschließlich den gepinnten Wert; kein Code-Fallback | Nein |
| `CONVERSATION_CYCLE_RECOVERY_SECRET` | – | – | – | – | R | – | required für Route; leer/fehlend fail-closed; kein Default | Ja |
| `WHATSAPP_DELIVERY_RECOVERY_SECRET` | – | – | – | – | – | R | required für Route; leer/fehlend fail-closed; kein Default | Ja |

Für den vollständigen App-Deploy bleiben `NEXT_PUBLIC_SUPABASE_ANON_KEY` und weitere allgemeine App-Variablen außerhalb dieses engen Transportaudits gemäß bestehendem Deploymentvertrag erforderlich; sie ersetzen keine der obigen E2E-Authorities.

## 8. Supabase Vault Inventory

Exakt erwartete Namen:

1. `KLIMAGUY_PRODUCTION_BASE_URL` — gemeinsam von beiden Schedulern gelesen.
2. `CONVERSATION_CYCLE_RECOVERY_SECRET` — muss bytegenau dem gleichnamigen Vercel-Secret entsprechen.
3. `WHATSAPP_DELIVERY_RECOVERY_SECRET` — muss bytegenau dem gleichnamigen Vercel-Secret entsprechen und fachlich vom Conversation-Secret getrennt bleiben.

Keiner dieser Werte steht in einer Migration. Der Base-URL-Vertrag lautet: HTTPS-Production-Origin, ohne Route/Pfad, Query oder Fragment, nicht Preview, nicht localhost. Die Scheduler validieren zusätzlich per Regex einen HTTPS-Host mit Punkt und hängen den kontrollierten Pfad nach `rtrim(..., '/')` an. Ein Beispielhost ist kein Production-Wert.

Secret-Rotation ist koordiniert: erst einen sicheren Wechselplan festlegen, dann Vercel und Vault passend aktualisieren; ein Zwischenzustand erzeugt 401-Recovery-Fehler. Es werden hier keine Werte erzeugt oder dokumentiert.

## 9. Recovery Route Inventory

| Vertrag | Conversation Cycle Recovery | WhatsApp Delivery Recovery |
|---|---|---|
| Path / Methode | `POST /api/internal/conversation-cycles/recovery` | `POST /api/internal/whatsapp/deliveries/recovery` |
| Runtime | `nodejs`, `force-dynamic`, `maxDuration = 60` | `nodejs`, `force-dynamic`, `maxDuration = 60` |
| Auth Env | `CONVERSATION_CYCLE_RECOVERY_SECRET` | `WHATSAPP_DELIVERY_RECOVERY_SECRET` |
| Fehlende/leere Config | HTTP 503, leer, vor DB-Capability | HTTP 503, leer, vor DB-Capability |
| Ungültige Auth | HTTP 401, leer | HTTP 401, leer |
| Batch / Discovery | 10, genau eine Discovery | 5, genau eine Discovery |
| Startbudget | 45.000 ms | 35.000 ms |
| Concurrency | 1, sequenziell awaited | 1, sequenziell awaited |
| Response | nur aggregierte Counts und `budget_exhausted` Boolean | nur aggregierte Counts; `budget_exhausted` als Restanzahl |

Kein GET-Handler, keine fachlichen Requestparameter, keine IDs, Texte, Telefonnummern, Providerdaten, Secrets oder rohen Fehler in der Response.

## 10. Scheduler Inventory

| Job | Schedule | Ziel | Vault Auth / URL |
|---|---|---|---|
| `conversation-cycle-recovery` | `*/5 * * * *` (alle fünf Minuten) | `/api/internal/conversation-cycles/recovery` | `CONVERSATION_CYCLE_RECOVERY_SECRET` / `KLIMAGUY_PRODUCTION_BASE_URL` |
| `whatsapp-delivery-recovery` | `* * * * *` (jede Minute) | `/api/internal/whatsapp/deliveries/recovery` | `WHATSAPP_DELIVERY_RECOVERY_SECRET` / `KLIMAGUY_PRODUCTION_BASE_URL` |

Beide Migrationen iterieren vor `cron.schedule` über alle Jobs mit dem stabilen Namen und rufen `cron.unschedule(jobid)` auf. Replay ersetzt damit gleichnamige Jobs, statt Duplikate zu erzeugen. Gleichnamige Altduplikate werden vollständig entfernt. Andere Jobnamen können semantisch ähnliche Altjobs darstellen und müssen bei der Production-Verifikation separat ausgeschlossen werden.

Beide Commands nutzen `net.http_post`, `Authorization: Bearer …`, `Content-Type: application/json` und Body `{}`. Sie enthalten keine Customer-/Message-Daten, keine Secrets im Query/URL und keine Domain-, Claim-, Retry- oder Dispatch-Logik. Fehlt ein Vault-Wert oder scheitert die URL-Prüfung, erzeugt das `SELECT ... WHERE` keinen HTTP-Aufruf; der Job existiert dennoch und die Fehlkonfiguration muss beobachtet werden.

## 11. Meta Webhook Contract

- Route: `GET|POST /api/webhooks/whatsapp`, Node, `maxDuration = 60`.
- GET benötigt `WHATSAPP_WEBHOOK_VERIFY_TOKEN`, liefert bei fehlender Config 503, bei falschem Challenge-Vertrag 403 und sonst den Challenge-Text mit 200.
- POST liest höchstens 1 MiB, prüft `X-Hub-Signature-256` mit `WHATSAPP_META_APP_SECRET` über den unveränderten Body, validiert/parst den Providerpayload und lehnt fehlende Config mit 503, ungültige Signatur mit 401, zu große Payload mit 413 und malformed JSON/Event mit 400 ab.
- Inbound Text wird atomar per `ingest_whatsapp_inbound_text` persistiert und über Provider-Eventidentität dedupliziert. Nur `recorded && cycle_eligible` startet den awaited Cycle; Duplicate und neue ungebundene Conversation starten keinen Cycle.
- Nach erfolgreicher Persistenz werden Cycle-/Immediate-Delivery-Fehler isoliert; die Webhook-Antwort bleibt 200. Persistenz- oder Status-Reconciliation-Fehler ergeben 500.
- Delivery-Statusereignisse werden über die vorhandene Status-Reconciliation verarbeitet.

Extern sind später nur zu **verifizieren**, nicht neu zu erfinden: Callback zeigt auf die Production-Webhook-Route; GET-Verifikation funktioniert; Meta App Secret passt zur Signatur; `messages` ist subscribed; die dedizierte Nummer/Phone Number ID gehört zum Sender Scope; Meta kann POST zustellen; Token besitzt die benötigte Sendeberechtigung; Status-Webhooks erreichen dieselbe Route. Historische Aussagen gelten bis dahin nicht als Istnachweis.

## 12. Graph Send Contract

- Einzige Send-Grenze ist `sendWhatsAppText` in `lib/server/whatsapp/outbound-adapter.ts`; Immediate und Recovery benutzen denselben recoverable Runner und denselben Adapter. Es gibt keine zweite Graph-Implementierung.
- Erforderlich: `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_GRAPH_API_VERSION`. Die Version ist auf `v25.0` gepinnt; ein anderer oder fehlender Wert scheitert vor Dispatch als Konfigurationsproblem. `.env.example` dokumentiert, ersetzt aber keine Production-Variable.
- Ziel und Text werden nicht aus dem Webhook erneut konstruiert: Acquire liest die persistierte aktive Transportidentität (`external_identity`) und `conversation_message_text.body` des exakt übergebenen `outbound_message_id`.
- POST geht an `https://graph.facebook.com/{version}/{phoneNumberId}/messages`, JSON-Textpayload, Bearer Token, Timeout 15 Sekunden.
- Vor dem Netzaufruf erfolgen Acquire, Revalidation und atomare Dispatch-Autorisierung/Attempt-Markierung. Erfolg erfordert einen Zod-validierten Provider-Message-ID-Wert; Completion bindet ihn an exakt dieselbe interne Message und setzt `accepted_by_provider`.
- 401/403 = Configuration, 429/5xx = retryable, andere Nicht-2xx/ungültiger Success-Vertrag = terminal rejection, Transportexception/Timeout = ambiguous/reconciliation — kein blinder Resend.

## 13. Immediate Delivery E2E Path

Für eine vorbereitete eligible Conversation ist der erwartete Happy Path exakt:

1. Customer sendet Text.
2. Meta POSTet den Webhook.
3. Signaturprüfung besteht.
4. Inbound wird genau einmal persistiert.
5. Conversation Cycle läuft.
6. Deterministische Antwort wird atomar committed.
7. Commit liefert `outbound_message_id`.
8. Mindestens 20 Sekunden Webhook-Budget verbleiben.
9. Delivery Runner acquiriert den Command mit 60-Sekunden-Lease.
10. Revalidation besteht.
11. Dispatch wird atomar autorisiert und Attempt 1 persistiert.
12. Der einzige Graph-Adapter sendet einmal.
13. Meta liefert eine Provider Message ID.
14. Provider-Binding und `accepted_by_provider` werden persistiert.
15. Webhook liefert HTTP 200.
16. Customer erhält die Antwort.
17. Spätere Status-Webhooks reconciliieren `sent`/`delivered`/`read`, soweit von Meta geliefert.

Für eine **neue** externe Identität stoppt der aktuelle echte Pfad nach Schritt 4 mit `cycle_eligible = false`; genau dies blockiert den verlangten Test.

## 14. Recovery E2E Path

### A. Zu wenig Immediate-Budget

Unter 20 Sekunden Restbudget startet kein Delivery Runner. Der atomar mit dem Outbound angelegte Pending-Command bleibt bestehen; der Minuten-Cron entdeckt ihn und sendet ihn über denselben Runner höchstens einmal.

### B. Retryable Provider-Rejection

Bei 429 bzw. 5xx persistiert Completion `failed`, Klassifikation `retryable`, Attempt und `next_attempt_at` (nach Attempt 1 eine Minute, bei Rate Limit bzw. Attempt 2 fünf Minuten). Es gibt keinen In-Process-Resend. Discovery berücksichtigt nur fällige Commands und maximal drei Provider-Attempts.

### C. Crash pre-dispatch

Ist noch kein offener Provider-Attempt autorisiert, läuft die Execution-Lease nach 60 Sekunden aus. Discovery kennzeichnet den Command `SAFE_TO_RUN`; ein neuer Owner darf sicher reclaimen.

### D. Crash post-dispatch ohne Provider-Binding

Ein offener Send-Attempt beweist mögliche externe Wirkung. Nach Lease-Ablauf liefert Discovery `FINALIZE_AMBIGUOUS`; der Runner sendet nicht erneut, sondern persistiert `delivery_ambiguous`/`requires_reconciliation`. Manuelle/Provider-Reconciliation ist erforderlich.

## 15. Production Deployment Order

Wegen des BLOCKED-Ergebnisses ist dies der sichere **Vorbereitungsablauf**, nicht die Freigabe des Live-Tests:

1. Production-Istzustand objektbasiert read-only erfassen; bei Teilmigration STOP.
2. Production-Meta-Grundvertrag und vorhandene App-Baseline verifizieren, ohne Testmessage zu senden.
3. Sämtliche benötigten Vercel-Production-Env-Namen setzen/verifizieren; beide Recovery-Secrets getrennt halten; anschließend kompatiblen aktuellen Code deployen.
4. Live-Erreichbarkeit beider POST-Routes prüfen: fehlende/falsche Auth fail-closed; korrekte Auth erst nach Secret-Match.
5. Vault `KLIMAGUY_PRODUCTION_BASE_URL` sowie beide getrennten Recovery-Secrets setzen/verifizieren; Secret-Paare müssen exakt passen.
6. Fehlende fachliche AP-16-06-Migrationen 1–5 und 7–8 vollständig in chronologischer Reihenfolge anwenden. Keine historische Datei editieren, keine Migration überspringen.
7. Objekt-Footprint und RPC-Signaturen erneut prüfen.
8. Erst jetzt Conversation-Scheduler-Migration 6 und Delivery-Scheduler-Migration 9 anwenden; sie aktivieren sofort.
9. Je Route autorisierten, inhaltsarmen Recovery-Request und aggregierte 200-Response verifizieren.
10. Genau einen Cron je stabilem Namen, Frequenz, Command und erfolgreiche `pg_net`-Ausführung verifizieren.
11. **STOP:** Noch keinen `Hallo`-E2E-Test als PASS-Versuch ausführen, bis das Folgepaket die Bootstrap-Lücke geschlossen und migriert hat.
12. Danach denselben Ist-/Secret-/Cron-Check wiederholen und erst dann den Live-Test freigeben.

## 16. Code-vs-Migration Ordering

| Phase | Code-first | DB-first | Vertrag |
|---|---|---|---|
| 01B–01F / Migrationen 1–4 | Nicht E2E-sicher: neuer Code ruft neue Spalten/RPCs auf; Webhook-Persistenz kann zwar starten, Cycle scheitert und Recovery kann fehlende Authority nicht heilen | Additive Schema-Authorities sind gegenüber altem, diese Objekte nicht nutzendem Code grundsätzlich kompatibler; Constraints können jedoch alte aktive Runtime-Daten fail-closed machen | **DB-first für Fachauthority**, danach Code; Production-Daten vorher prüfen |
| 02 / Migration 5 | Neuer Runner ohne Acquire/Discovery/signaturaktuelle Commit-RPCs scheitert | DB-first ist mit altem Legacy-Caller grundsätzlich kompatibel, da ersetzte RPCs Defaults/bestehende Grenzen berücksichtigen; dennoch als zusammengehörigen Deploy behandeln | **DB-first, dann Code** |
| 03 / Migration 6 | Route-Code ohne Cron ist sicher; Recovery fehlt vorübergehend | Cron vor Route/Env/Vault erzeugt 401/404/503 oder keine Requests | **streng code/env/vault-first, Scheduler zuletzt** |
| 04B / Migration 7 | Delivery-Code erwartet neue Retry-/Dispatch-RPCs und ist ohne Migration nicht sendefähig | Neue Authority kann vor dem neuen Caller existieren; alte Sendelogik darf während Umschaltung nicht parallel betrieben werden | **DB-first, dann vollständiger neuer Code** |
| 04C / Migration 8 | Recoverable Runner erwartet Lease-/Discovery-Signaturen und scheitert ohne Migration | DB-first ersetzt gleichnamige RPC-Signaturen semantisch; deshalb kein alter produktiver Delivery-Caller zwischen 8 und Code deployen | **enger Wartungs-/Deploy-Schritt: DB 8 unmittelbar vor Code** |
| 04E / Migration 9 | Route-Code und Immediate-Pfad ohne Cron sind sicher; nur Recovery fehlt | Cron vor Route/Env/Vault ist unsicher | **streng code/env/vault-first, Scheduler zuletzt** |

Der aktuell produktive AP-16-06-Code kann als Next-App grundsätzlich booten, wenn Migrationen fehlen, weil Clients lazy erzeugt werden. Das macht den Trafficpfad nicht funktionsfähig: Runtime-RPC-Fehler würden nach Inbound-Persistenz isoliert und als Recovery-Backlog erscheinen. Daher darf „App startet“ nicht als DB-Kompatibilitätsnachweis gelten.

## 17. Scheduler Activation Safety

`cron.schedule(...)` aktiviert beide Jobs beim Migration-Commit unmittelbar. Vor Apply müssen deshalb nachweislich vorhanden sein:

1. Production-Route mit exakt passendem Path und POST,
2. jeweiliges Vercel-Production-Secret,
3. bytegleiches jeweiliges Vault-Secret,
4. gültiger `KLIMAGUY_PRODUCTION_BASE_URL`-Production-Origin,
5. benötigte fachliche RPC-Authorities und Service-Role-Konfiguration.

Replay ist für stabile Namen duplicate-safe durch Unschedule-all-then-schedule. Ein Replay kann während des kurzen Replacement-Fensters einen Tick auslassen, erzeugt aber nicht dauerhaft mehrere gleichnamige Jobs. Conversation- und Delivery-Secrets, Routes, Batches und Frequenzen dürfen nicht vertauscht werden.

## 18. First Live Test

Nach Schließen der Bootstrap-Lücke ist der kleinste Test:

- exakt eine echte externe WhatsApp-Nummer,
- exakt die Textnachricht `Hallo`,
- an die dedizierte KlimaGuy Cloud API Nummer,
- keine Medien, Bilder oder Grundrisse,
- keine Wiederholung während Beobachtung und Recovery-Fenster,
- keine OpenAI-/Sprachqualitäts-Erwartung.

Vorher muss feststehen, ob die Bootstrap-Authority die Conversation initialisiert und den ersten deterministischen Prompt erzeugt oder ob `Hallo` eine bereits aktive, deterministisch erzeugte Pending Interaction beantwortet. Der aktuelle Code tut keines von beidem für eine neue Nummer; deshalb wird der Test in diesem Paket nicht ausgeführt.

## 19. Expected Deterministic Outcome

Ein exakter Antworttext für `Hallo` ist repositoryweit **nicht statisch vorhersagbar**, weil der Cycle `Hallo` als Antwort auf den jeweils persistierten Planner Snapshot interpretiert; das Ergebnis hängt vom vorbereiteten Pending Prompt und Knowledge State ab. Der PASS-Vertrag stützt sich daher nicht auf Wortlaut.

Für eine valide aktive Text-Pending-Interaction ist strukturell zu erwarten: Cycle-Command wird einmal terminal (`completed` oder bei deterministisch nicht sicher interpretierbarer Eingabe ausdrücklich `human_review_required`), Knowledge-/Runtime-Transition folgt dem Snapshot, und bei `completed_with_next_interaction` entsteht höchstens ein neuer persistierter Outbound samt neuer Pending Interaction/Snapshot und Delivery-Command. Für den verlangten Happy Path muss konkret `completed` mit nicht-null `outbound_message_id` entstehen; Human Review oder bewusstes Stoppen ist zwar eine valide Domainentscheidung, aber kein Transport-E2E-PASS mit Reply.

Für eine neue Nummer ist der aktuelle deterministische Ausgang dagegen sicher: Inbound persistiert, neue unzugeordnete Conversation, `current_project_id = null`, `cycle_eligible = false`, kein Cycle und kein Reply.

## 20. Observability

Ohne neue invasive Logs und ohne PII-Ausgabe sind korrelierte, read-only Signale zu prüfen:

### Vercel

- genau eine POST-Invocation der Inbound-Route, HTTP 200 nach Persistenz;
- keine Telefonnummer, Nachrichtentexte, Tokens, Payloads oder Secrets in Logs;
- Immediate-Lauf darf kontrollierte Cycle-/Delivery-Ergebnisse nicht als Webhook-Fehler exponieren;
- bei Recovery: autorisierte Route, HTTP 200 und nur aggregierte Counts; 401/503 separat sichtbar.

### Supabase

- genau ein `transport_webhook_receipts`-Event und genau ein inbound `conversation_messages`-/Text-/Provider-Binding für die Provider-ID;
- Conversation-Projektbindung und `cycle_eligible`-Vorbedingungen;
- genau ein `conversation_cycle_commands` für die Source Message; Owner/Lease/Attempt und terminaler Status; keine Wiedereröffnung;
- atomare Cycle Events/Knowledge-Transition, Commit-Hash/Result und exakt die zurückgegebene `outbound_message_id`;
- höchstens ein outbound Message-/Text-/Pending-Snapshot-Satz;
- genau ein WhatsApp `transport_delivery_commands` für dieselbe Outbound-ID; Execution Owner/Lease, `execution_attempt_count`, `attempt_count`, Dispatch Marker/Token;
- bei Erfolg genau ein beendeter `transport_send_attempts`-Attempt und ein outbound `transport_message_bindings`-Provider-Binding; Status `accepted_by_provider`, später `delivered`/`read` soweit verfügbar;
- bei Fehler `failure_code`, `retry_classification`, `next_attempt_at` bzw. `delivery_ambiguous` differenziert prüfen;
- Cron und `pg_net`-Resultate ohne Secret-/PII-Ausgabe.

### Meta / Test-Handy

- Meta akzeptiert Eingang/Statuszustellung; Test-Handy zeigt genau eine gesendete `Hallo`-Nachricht und genau eine Antwort;
- Provider-ID/Status lassen sich über sichere Identitäten mit dem DB-Binding korrelieren, ohne sie zu loggen.

## 21. PASS Criteria

Der erste Happy Path ist nur PASS, wenn **alle** Punkte gelten:

1. Webhook authentifiziert und HTTP 200.
2. Inbound-Providerereignis und interne Message jeweils genau einmal persistiert.
3. Conversation Cycle für exakt diese Source Message genau einmal erfolgreich terminal completed.
4. Höchstens eine Outbound Message, für diesen Happy Path genau eine, wurde atomar erzeugt.
5. Dieselbe `outbound_message_id` aus dem Commit ist `internal_message_id` des Delivery-Commands und Input des Runners.
6. Höchstens ein Provider-Attempt; beim kontrollierten Erfolg genau einer.
7. Provider-ID-Binding existiert nach Erfolg und verweist auf dieselbe Outbound-ID.
8. WhatsApp-Antwort erreicht das Handy genau einmal.
9. Kein Duplicate Reply, kein zweiter Delivery-Command, kein automatischer zweiter Send.
10. Cycle bleibt terminal und wird durch Recovery nicht reopened.
11. Keine offenen Recovery-, Retry-, Lease- oder Ambiguity-Fehler für diesen Lauf.

Sprachstil, HVAC-Fachqualität, Sales Tone und perfekte natürliche Formulierung sind keine PASS-Kriterien.

## 22. FAIL Categories

- **Webhook Auth/Config:** 401/403/503, falscher Verify Token/App Secret oder Meta-Ziel.
- **Persistence:** 500, fehlender/partieller Receipt-/Message-/Binding-Satz oder Deduplizierungsbruch.
- **Bootstrap/Eligibility:** neue Conversation bleibt ohne Projekt/Runtime/Pending Prompt; aktueller Audit-Blocker.
- **Cycle failed:** terminal `failed`/Persistence Failure.
- **Cycle stuck/busy:** Processing/Lease bleibt unberechtigt aktiv oder Recovery reclaimed nicht nach Fälligkeit.
- **Unexpected no outbound:** Cycle sollte `completed_with_next_interaction` liefern, aber ID/Message/Command fehlt; ein fachlich erklärter Human Review/Stop ist separat, aber kein Happy-Path-PASS.
- **Delivery pending / Recovery inactive:** Pending bleibt nach Cronfenster ohne Discovery-/Route-Aktivität.
- **Delivery configuration:** fehlende/falsche Supabase-/Graph-Env oder gepinnte Version.
- **Graph rejection:** Auth, Rate Limit, 5xx oder terminale Provider-Rejection entsprechend Klassifikation.
- **Delivery ambiguous:** möglicher Send ohne beweisbares Binding; bewusst kein Resend, manuelle Reconciliation.
- **Duplicate send:** mehr als ein Provider-Attempt/Reply für denselben kontrollierten Happy Path — harter FAIL.
- **Scheduler:** Job fehlt, doppelt, falsche Frequenz/Route/Command oder `pg_net` scheitert.
- **Vault mismatch/base URL:** fehlender/falscher Name, kein gültiger Production-Origin oder Secret-Paar ungleich.
- **Recovery unauthorized:** 401 bei Scheduler-Aufruf; getrennt von fehlender Config (503).

## 23. Diagnosis Order

Ein ausbleibender Reply wird strikt schichtweise diagnostiziert:

1. **Meta → Webhook:** Kam genau ein POST an, war Signatur gültig, welcher HTTP-Status?
2. **Inbound Persistence:** Receipt, Provider-Binding und Inbound Message genau einmal vorhanden?
3. **Eligibility/Bootstrap:** aktive Conversation-Bindung, Projekt, Runtime `awaiting_customer_answer`, Pending Snapshot; war `cycle_eligible` überhaupt wahr?
4. **Cycle:** Command vorhanden, Acquire/Lease, terminales Result, Failure/Human Review/Busy/Stale unterscheiden.
5. **Outbound Persistence:** Commit-Ergebnis und genau eine `outbound_message_id`, Text/Pending Snapshot/Delivery-Command atomar vorhanden?
6. **Immediate Delivery:** Genügend Budget; Acquire/Revalidate/Authorize erfolgt? Konfiguration valide?
7. **Recovery:** fällig, vom passenden Cron entdeckt, Route autorisiert, Startbudget, keine Vermischung mit Cycle-Recovery?
8. **Provider Acceptance:** Attempt/HTTP-Klasse, Provider-ID-Binding, Retry-Termin oder Ambiguity?
9. **Provider Status/Handy:** `accepted_by_provider` ist nicht dasselbe wie delivered/read; Status-Reconciliation und tatsächlichen Empfang prüfen.
10. **Duplicate Guard:** erst nach Ende des relevanten Recovery-Fensters bestätigen, dass kein zweiter Attempt/Reply entstand.

## 24. Manual Deployment Checklist

Jeder Schritt wird später einzeln ausgeführt, danach **STOP und Bestätigung**, bevor der nächste beginnt. Keine spekulativen UI-Pfade gehören zu diesem Vertrag.

- [ ] **STEP 1:** Baseline-Commit und Production-Deployment-Version feststellen. **STOP.**
- [ ] **STEP 2:** Production-Schema objektbasiert bis `202608240003` und alle neun AP-16-06-Footprints klassifizieren. Bei Teilzustand STOP. **STOP.**
- [ ] **STEP 3:** Vercel-Production-Env-Inventar vollständig und ohne Werteausgabe verifizieren. **STOP.**
- [ ] **STEP 4:** aktuellen kompatiblen Code mit beiden Recovery-Routes deployen. **STOP.**
- [ ] **STEP 5:** Conversation-Recovery-Secret-Paar provisionieren/verifizieren. **STOP.**
- [ ] **STEP 6:** Delivery-Recovery-Secret-Paar separat provisionieren/verifizieren. **STOP.**
- [ ] **STEP 7:** Vault-Production-Origin verifizieren. **STOP.**
- [ ] **STEP 8:** fehlende fachliche Migrationen 1–5, 7–8 einzeln, vollständig und geordnet anwenden/verifizieren. **STOP nach jeder Migration.**
- [ ] **STEP 9:** Conversation-Scheduler-Migration anwenden und genau einen Job/erfolgreiche Auth prüfen. **STOP.**
- [ ] **STEP 10:** Delivery-Scheduler-Migration anwenden und genau einen Job/erfolgreiche Auth prüfen. **STOP.**
- [ ] **STEP 11:** Meta GET/POST-/Subscription-/Nummer-/Token-Vertrag ohne E2E-Send verifizieren. **STOP.**
- [ ] **STEP 12:** Bootstrap-Folgepaket implementieren, migrieren und dessen sichere Production-Vorbedingungen verifizieren. **STOP.**
- [ ] **STEP 13:** genau einmal `Hallo` senden. **STOP, keine Wiederholung.**
- [ ] **STEP 14:** Beobachtungen in Diagnose-Reihenfolge erfassen und gemeinsam PASS/FAIL entscheiden. **STOP.**

## 25. Manual SQL Safety

Falls spätere Verification oder Migration SQL erfordert:

- niemals „ändere diese Zeile“ oder Teilpatches;
- immer vollständige, eigenständig ausführbare, vorab überprüfte SQL-Blöcke;
- für Apply möglichst die unveränderte vollständige Repository-Migrationsdatei verwenden;
- historische Migrationen niemals manuell editieren;
- keine fehlenden Einzelobjekte in einem partiellen Footprint improvisieren;
- vor mutierenden Blöcken objektbasierte Read-only-Prüfung und eindeutigen STOP/GO-Entscheid;
- Scheduler erst nach Route/Env/Vault und fachlicher Authority;
- keine Secret-Werte in Query-Ausgabe, Screenshots, Logs oder Auditnotizen.

Dieses Dokument liefert bewusst noch keinen User-SQL-Block.

## 26. OpenAI Gate

OpenAI, LLM, Language Rewrite und provider-neutrale Language Inference bleiben gesperrt, bis ein deterministischer Production-E2E-Lauf vollständig PASS ist:

`WhatsApp inbound → deterministic cycle → persisted outbound → Meta Graph send → Reply arrives`, ohne Duplicate Send und ohne offene Cycle-/Delivery-Recovery-Fehler.

Der aktuelle BLOCKED-Status hält dieses Gate geschlossen. Der erste Test bewertet ausschließlich Transport, Persistence, Runtime, Delivery und Recovery — nicht Sprachqualität, Sales Tone oder LLM-basierte HVAC-Qualität.

## 27. Explicitly Not Implemented

In AP-16-06-05A wurden ausdrücklich nicht implementiert oder verändert:

- keine Produktfunktion und keine Bootstrap-Reparatur,
- keine Source-/Runtime-Logik,
- keine Migration, Tabelle, Spalte, Constraint oder RPC,
- keine Route oder Testsemantik,
- kein Environment-Verhalten,
- kein Cron Job oder Scheduler,
- keine Debug-Logging-Infrastruktur,
- keine Production-Konfiguration und kein Live-Production-Test,
- kein OpenAI, LLM, Language Rewrite oder Language Inference,
- keine Secret-Werte.

**AUDIT RESULT: BLOCKED**
