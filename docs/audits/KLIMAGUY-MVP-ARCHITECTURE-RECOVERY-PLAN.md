# KlimaGuy MVP Architecture Recovery Plan

Stand: 13. September 2026. Gegenstand ist ausschließlich der aktuelle Repository-Stand des Branches bei Erstellung dieses Audits. Aussagen über die tatsächlich in Production installierten Funktionsdefinitionen sind ohne Production-Katalogabzug ausdrücklich **nicht** verifiziert.

## 1. Executive Decision

| Frage | Entscheidung |
|---|---|
| Root architecture problem | Es wurde versucht, ein absichtlich historisches, restriktives Datenmodell physisch zu „resetten“, während die eigentliche Produktlücke – ein natürliches, faktenbildendes und bildverstehendes KI-Gespräch – weitgehend offen blieb. |
| Hard Delete für das MVP | **NO** |
| Bestehender Conversation-Lifecycle ausreichend | **PARTIAL** – als Lifecycle- und Memory-Grenze ja; vor Produktivnutzung fehlen ein logischer Admin-Operator und vollständig bewiesene Side-Effect-Fences. |
| `qualification_runs` erforderlich | **NO** |
| Architekturwahl | **OPTION B – Thin MVP Path Beside Legacy** |
| Kürzester Weg zurück zur Produktentwicklung | Erst Lifecycle/Dedupe/Fences durch Integrationstests beweisen und Reset auf „aktive Conversation schließen“ umstellen; danach einen kleinen, feature-geflaggten KI-Turn mit projektgebundenen Fakten und anschließend den realen Bildpfad ergänzen; zuletzt an die bestehende menschliche Angebotsfreigabe anbinden. |

Die vorhandene Grenze ist grundsätzlich richtig: eine stabile WhatsApp-Identität besitzt genau ein aktives Binding; wird dessen Conversation `closed`, erzeugt die nächste neue Text-Ingestion eine neue offene Conversation und eine um eins erhöhte Binding-Revision. Die First-Contact-Foundation bindet dieselbe stabile Customer-ID und erzeugt für die neue Conversation ein neues Project. Historie bleibt stehen. Das ist der richtige Reset-Begriff.

Die Diagnose überschätzt jedoch zwei Punkte. Erstens ist Bild-Ingestion nur als nicht verdrahtete, ausdrücklich blockierte SQL-Staging-Grundlage vorhanden; der produktive Webhook verwirft `media_deferred`. Zweitens sind Recovery-Discoveries zwar überwiegend auf offene Conversations beschränkt, aber „alle Stale-Worker-Fences sind da“ ist zu stark: insbesondere besteht im Outbound-Runner nach der letzten Revalidierung ein Race zwischen Dispatch-Autorisierung/Provider-Call und gleichzeitigem Close. Daher ist der Lifecycle **PARTIAL**, nicht bedingungslos vollständig.

## 2. Source Diagnosis Reviewed

`docs/audits/KLIMAGUY-DIAGNOSE-20260913.md` wurde vor Beginn dieses Dokuments vollständig gelesen (214/214 Zeilen).

### CONFIRMED

- Stable Identity, historisierte Bindings mit Revision, Conversation-Status und Project-Zuordnung bilden bereits die benötigte Lifecycle-Grenze (`supabase/migrations/202608230007_conversation_transport_persistence.sql:9-49`; `202608240001_whatsapp_inbound_text_ingestion.sql:44-62`).
- Ein neues Text-Provider-Event nach `closed` erzeugt Conversation N+1, superseded das alte Binding und erhöht dessen Revision; es öffnet N nicht wieder (`202608240001_whatsapp_inbound_text_ingestion.sql:53-62`).
- Die First-Contact-Foundation verwendet den stabilen Customer wieder und erzeugt ein neues Project, wenn `current_project_id` fehlt (`202609040001_first_contact_foundation.sql:50-88`).
- `transition_conversation_status` ist eine admin-geschützte, revisionsbasierte, idempotente Status-Autorität (`202608230004_persistent_conversation_message_authority.sql:65,86-93`).
- Der einzige produktive OpenAI-Netzwerkaufruf ist `client.responses.parse`; Standardmodell ist `gpt-4.1-mini`; er klassifiziert eine normalisierte Antwort gegen eine Allowlist und darf weder Kundentext noch nächste Frage, Claims, Preise oder Angebote erzeugen (`lib/server/ai/providers/openai/adapter.ts:59-129`; `config.ts:5-12`; `instructions.ts:3-13`).
- Kundenausgaben und Folgefragen des Legacy-Pfads stammen aus dem deutschsprachigen `QUESTION_TEMPLATE_REGISTRY` (`lib/domain/conversation-intelligence/question-template-registry.ts:11-35`).
- Es existiert keine produktive Vision-Inferenz und kein `previous_response_id`.
- Hard Delete widerspricht den append-only/restrict/history-Eigenschaften und ist kein MVP-Reset.

### CORRECTED

- **„Bild-Ingestion eröffnet automatisch Conversation/Project neu“:** Das SQL-RPC würde eine neue Conversation und Binding-Revision erzeugen, aber es ist produktiv nicht verdrahtet, legt selbst kein Project an und erstellt absichtlich einen `blocked/provider_contract_unavailable` Command. Der Webhook erzeugt für Bilder lediglich `media_deferred` und verarbeitet nur `inbound_text` (`parser.ts:42-57`; `webhook.ts:73-87`; `202608240003_whatsapp_media_safe_staging.sql:68-116`).
- **„alle Recovery-Discoveries joinen nur open“:** First Contact und Cycle Recovery tun dies. Delivery Discovery selbst filtert nicht auf Conversation-Status; Acquisition und Revalidation blockieren später. Das ist gut, aber wegen des Provider-Dispatch-Race nur **PARTIAL** (`202609030001_whatsapp_delivery_lease_recovery_authority.sql:50-56,59-70,144-156`; `recoverable-delivery-runner.ts:73-100`).
- **„Produktfunktion zu 0 %“:** Als rhetorische Bewertung verständlich, technisch aber zu absolut. Signierter Text-Webhook, persistente Nachrichten, deterministischer Fragebogen, optionaler KI-Allowlist-Klassifikator und Delivery existieren. Der angestrebte natürliche Gesprächs-/Vision-Kern ist dennoch **MISSING**.
- Die Diagnose empfiehlt einen einzigen großen PR für Facts, AI-Turn und Vision. Das ist zu riskant und wird hier in kleine, sequenzielle PRs zerlegt.
- Die bestehende Knowledge-Struktur ist real, aber für den dünnen MVP-Pfad nicht „einfach“: sie setzt versionierte Claims, Evidence und Transition-Authorities voraus. Eine kleine additive Fakten-Autorität ist wahrscheinlich angemessen, ihr exaktes Schema muss aus einem vorangehenden Contract-PR kommen.

### REJECTED

- PR #223 zu reparieren oder Migration 0006 weiterzuverfolgen ist Teil dieses Recovery-Pfads: **REJECTED**. Beides ist ausdrücklich außerhalb dieses Audits und Hard Delete wird für das MVP beendet.
- Der aktuelle Image-Pfad könne bereits alte Projektmedien sicher aus einem neuen KI-Kontext ausschließen: **REJECTED als aktueller Produktclaim**, weil es noch keinen produktiven Image-Kontext gibt. Die vorhandenen Projekt- und Conversation-IDs ermöglichen diese Sicherheit erst im neuen Pfad.

## 3. Verified Current Architecture

### Transport, Identität, Binding

- Die stabile WhatsApp-Identität ist die eindeutige Kombination `(provider, sender_scope, external_identity)` in `conversation_transport_identities`. `sender_scope` ist die WhatsApp Phone Number ID; `external_identity` ist der Absender. Eine optionale `customer_id` bindet sie dauerhaft an den fachlichen Kunden (`202608230007_conversation_transport_persistence.sql:9-19`; Parser `lib/server/whatsapp/parser.ts:29-55`).
- `conversation_transport_bindings` verbindet eine Identity mit einer Conversation. Ein Partial Unique Index erlaubt pro Identity genau ein Binding mit Status `active`; alte Bindings werden `superseded` und behalten `superseded_at` (`202608230007_conversation_transport_persistence.sql:25-37`).
- `revision` ist die monotone Generation dieser Transportbindung für dieselbe Identity: beim Neuanlegen `coalesce(previous.revision,0)+1`. Sie ist **nicht** die Conversation-Revision und kein Lock-Token eines laufenden Turns (`202608240001_whatsapp_inbound_text_ingestion.sql:53-60`).

### Conversation, Customer, Project

- Conversations speichern `customer_id`, `current_project_id`, Status und eine eigene optimistische `revision`; Nachrichten gehören ausschließlich über `conversation_id` zu einer Conversation (`202608230004_persistent_conversation_message_authority.sql:7-16,33-47`).
- Customers enthalten langlebige Stammdaten; Projects enthalten fallbezogene Felder wie Status, Adresse, Summary und `requires_human_review` und sind per `customer_id` angebunden (`202607210001_initial_schema.sql:3-9`).
- Die First-Contact-Foundation sperrt Identity und Conversation, übernimmt die bestehende `identity.customer_id` oder erzeugt nur beim allerersten Kontakt einen Customer. Für jede Conversation ohne Project erzeugt sie „Neue Klimaanfrage“, weist es zu und erhöht die Conversation-Revision (`202609040001_first_contact_foundation.sql:36-88`).
- Damit bleiben Customer-Stammdaten absichtlich stabil, während Conversation-Transcript, Project-Daten, Knowledge und Runtime je Project/Conversation getrennt sind. Mögliche Kontamination besteht nur, wenn ein künftiger Prompt pauschal Customer-Stammdaten oder alle Customer-Projects statt ausschließlich `current_project_id` lädt.

### Nachrichten und Historie

- `conversation_messages`, Text und References sind append-only; FKs sind `RESTRICT`. Message-Replay ist über Receipt und Provider-Binding vom aktuellen Routing entkoppelt (`202608230004_persistent_conversation_message_authority.sql:33-62`; `202608230007_conversation_transport_persistence.sql:39-63`).
- Historische Conversations und Bindings werden nicht gelöscht. Die aktive Conversation wird nicht über „neueste Conversation“, sondern über das einzige aktive Identity-Binding bestimmt.

### Aktueller Text-End-to-End-Pfad

1. `app/api/webhooks/whatsapp/route.ts` delegiert GET/POST an die Node-Handler (`route.ts:1-9`).
2. POST begrenzt Body auf 1 MiB, prüft HMAC-SHA256 vor JSON-Parsing und validiert in einem toleranten Parser zu strikten Zod-Contracts (`webhook.ts:10-30,59-71`; `security.ts:7-12`; `parser.ts:17-61`).
3. `persistWhatsAppInboundText` verwendet einen serverseitigen Service-Role-Client und validiert das RPC-Ergebnis (`ingestion.ts:14-23,51-71`).
4. `ingest_whatsapp_inbound_text` claimt den Receipt atomar; Duplicate kehrt mit `cycle_eligible=false` zurück, bevor Identity/Binding/Message mutiert werden (`202608240001...sql:32-42`).
5. Neue Events lösen Identity und aktives Binding auf; nur wenn Conversation fehlt oder `closed` ist, wird eine neue Conversation plus nächste Binding-Revision erzeugt (`...:44-62`). `paused` und `human_review` werden **nicht** ersetzt.
6. Die inbound Textnachricht und das Provider-Mapping werden in derselben Transaktion geschrieben (`...:64-73`).
7. Bestehende Runtime mit `awaiting_customer_answer` setzt `cycle_eligible`; andernfalls prüft der Webhook First Contact und initialisiert Foundation/Initial Prompt (`...:74-78`; `webhook.ts:76-85`).
8. Der Cycle kann ein Outbound-Message/Delivery-Command erzeugen; unmittelbare Delivery ist best effort, persistente Recovery bleibt zuständig (`ingestion.ts:28-49,73-79`).

## 4. Conversation Lifecycle Audit

| Stage | Status | Verifiziertes Verhalten / Lücke |
|---|---|---|
| Stable Identity | **VERIFIED** | Eindeutig über provider + sender scope + external identity; Customer-ID bleibt stabil. |
| Active Binding | **VERIFIED** | Genau ein aktives Binding je Identity; alte Bindings historisch `superseded`. |
| Binding revision | **VERIFIED** | Beginnt bei 1, erhöht sich bei neuer Conversation; keine allgemeine Turn-CAS. |
| Current Conversation | **VERIFIED** | Über aktives Binding, nicht über Customer oder Zeitstempel. |
| Current Project | **VERIFIED** | `conversations.current_project_id`; First Contact erzeugt es, falls null. |
| Close | **PARTIAL** | DB-Autorität existiert und ist geeignet; aktuelle Admin-Reset-UI ruft jedoch den physischen Reset-Service auf, nicht Close (`test-customer-reset-service.ts:54-76`). |
| New text after close | **VERIFIED** | Old Binding → superseded; Conversation N+1 → open; Binding revision +1; neue Message in N+1. |
| New Project after text | **VERIFIED** | First-Contact-Routing sieht N+1 als healable und Foundation erzeugt Project N+1; asynchron/best effort plus Recovery, nicht in derselben Ingestion-Transaktion. |
| New image after close | **MISSING** produktiv / **VERIFIED** nur im unverdrahteten RPC | RPC besitzt gleiche Conversation-Regel; Webhook ruft es nicht auf, Command ist blockiert, kein Project/`project_media`. |
| Historical isolation | **PARTIAL** | IDs/FKs liefern die richtige Grenze; der neue AI-Context-Reader und Media-Promotion müssen sie noch explizit erzwingen. |

**Konkrete Antwort für Text:** Bei einer vollständig neuen `wamid` nach `closed` passiert **B + C**, danach asynchron **D**: keine Wiederöffnung von N; N+1 wird erstellt, Binding-Revision erhöht, Text N+1 zugeordnet und First Contact erzeugt Project N+1. Derselbe alte Provider-ID-Replay ist vorher Duplicate und tut nichts.

## 5. Reset Decision

| Gegenstand | Entscheidung | Begründung / Zustand nach Reset |
|---|---|---|
| Physical Hard Delete | **NO / STOP** | Kein MVP-Erfordernis; kollidiert mit Historie, Append-only und FK-Graph. |
| Logical Conversation Close | **YES** | Aktives Binding auflösen, aktive/open Conversation per CAS auf `closed` setzen; das nächste neue Event übernimmt die Binding-Supersession atomar. |
| Neue `qualification_runs` | **NO** | Conversation + Binding-Revision + Project bildet dieselbe Grenze bereits ab. |
| Historische Messages bewahren | **YES** | Bleiben ausschließlich an Conversation N gebunden. |
| Webhook Receipts bewahren | **YES, zwingend** | Nur so bleibt eine alte `wamid` auch nach mehreren Lifecycles ein No-op. |

Präzise Zielsemantik des Operators:

1. Admin authentifizieren und feste Test-Transport-Identity serverseitig auflösen.
2. Das einzige aktive Binding und dessen Conversation sperren/lesen.
3. Wenn keine aktive offene Conversation existiert: idempotenter Erfolg „bereits zurückgesetzt“; `paused`/`human_review` benötigen eine explizite Produktentscheidung, empfohlen ist kontrolliert ebenfalls nach `closed` zu transitionieren.
4. `transition_conversation_status(conversation_id, 'closed', expected_revision, idempotency_key)` oder eine schmale serverseitige Authority mit exakt gleicher Semantik verwenden.
5. Nichts physisch löschen und das Binding nicht manuell ändern. Die nächste **neue** Ingestion superseded es atomar.

Nach Reset bleiben Customers, Projects, Conversations, Messages, Snapshots, Pending Interactions, Runtime/Commands, Knowledge, Evidence, Media und Receipts unverändert historisch erhalten. Project N bleibt unverändert. Aktive Legacy-Arbeit muss über Status/Revision wirkungslos werden. Das nächste neue Event erzeugt N+1/Project N+1. „Wait“ ist kein Sicherheitsmechanismus; korrekte Fences sind es.

### Status-Transition-Autorität

- Exakter Name/Ort: `public.transition_conversation_status` in `supabase/migrations/202608230004_persistent_conversation_message_authority.sql:86-93`.
- Inputs: `target_conversation_id uuid`, `target_status public.conversation_status`, `expected_revision integer`, `target_idempotency_key text`.
- CAS: Bei echter Änderung muss `expected_revision == conversations.revision`; Erfolg erhöht Revision um eins.
- Idempotenz: Gleiches `(conversation_id,idempotency_key)` und gleicher Zielstatus liefert aktuellen DTO; anderer Zielstatus ergibt `idempotency_conflict`. Wenn der Status bereits dem Ziel entspricht, liefert die Funktion Erfolg, sogar vor dem Revision-Check.
- Erlaubte Übergänge: `open → paused|human_review|closed`; `paused|human_review → open|closed`; aus `closed` keiner.
- Autorisierung: `SECURITY DEFINER`, intern `assert_conversation_admin()`: `auth.uid()` gesetzt und `current_app_role()='admin'`; Grants laut selben Migrationsende nur für `authenticated` (Zeilen 113-121). Service Role allein erfüllt ohne Benutzer-JWT diese Admin-Prüfung nicht.
- Aktuelle App: Lese-Service existiert, aber kein produktiver Action/Adapter für Statuswechsel; die Reset-UI nutzt den physischen Reset-Operator. Deshalb ist die DB-Funktion passend, die Admin-Exposition jedoch **MISSING**.

## 6. Deduplication and Replay Safety

Der tatsächliche Receipt-Key ist `UNIQUE(provider, sender_scope, provider_event_identity)`; bei WhatsApp Text und Image wird `provider_event_identity = provider_message_id/wamid` gesetzt (`202608230007...sql:39-50`; Text `202608240001...sql:32-40`; Image `202608240003...sql:84-91`). Zusätzlich schützt `transport_message_bindings` dieselbe Provider-Tupelidentität (`202608230007...sql:52-63`).

**Replay-Beweis für Text:** Der Receipt-Insert verwendet `ON CONFLICT DO NOTHING`. Bei Conflict lädt das RPC Receipt/alte Message/alte Identity, schreibt nur einen Audit-Event und gibt `status=duplicate`, `cycle_eligible=false` zurück. Der Webhook startet bei Duplicate keinen Cycle. Er kann allerdings aktuell in den First-Contact-Zweig gelangen, weil `else if (!result.cycle_eligible)` auch Duplicates umfasst; für einen alten Receipt zeigt `conversation_id` auf N. Eligibility lehnt N wegen `closed` als `not_applicable` ab. Somit: keine Message in N+1, kein OpenAI, keine Conversation, keine Antwort (`webhook.ts:76-85`; `202609040003...sql:7-15`).

**Neue wamid:** hat einen neuen Receipt-Key und wird regulär akzeptiert, auch bei gleicher Telefonnummer.

**Rest-Risiken:**

- Replay-Sicherheit gilt nur, solange Receipts permanent erhalten bleiben und Meta Message IDs innerhalb `(provider,sender_scope)` eindeutig sind – genau deshalb dürfen Reset-RPCs sie nicht entfernen oder ihren Schlüssel verändern.
- Der Duplicate-First-Contact-Aufruf ist unnötig und sollte in der MVP-Routing-PR explizit auf `status==='recorded'` begrenzt werden; aktuell ist er für closed N harmlos, aber unnötige Arbeit.
- Bild-Replay besitzt dieselbe SQL-Dedupe, ist jedoch produktiv nicht erreichbar.
- Ein Integrationstest muss den exakten Fall „alter Receipt N, N geschlossen, N+1 aktiv“ beweisen; Repository-Codebeweis ersetzt keinen Production-Katalog-/E2E-Beweis.

## 7. Stale Worker Audit

| Worker/Pfad | Guard | Safe nach Close? | Klassifikation / Risiko |
|---|---|---|---|
| First-contact immediate route | Eligibility verlangt `c.status='open'`, aktives Binding | Ja, vor Foundation; Foundation prüft nochmals open/binding | **SAFE** für Close. |
| First-contact cron discovery | `c.status='open'`, aktives Identity/Binding | Ja | **SAFE** (`202609040003...sql:29-51`). |
| First-contact foundation | Row locks; Conversation open; aktives Binding | Ja | **SAFE** (`202609040001...sql:36-48`). |
| Existing cycle recovery discovery | open + current Project + expected Conversation revision + Runtime/Knowledge/Pending/Snapshot lineage | Ja bei Discovery | **SAFE** (`202609100003...sql:98-133`). |
| Missing-command recovery discovery | Aktuelle SQL-Fassung enthält open-/project-/runtimegebundene Joins; nachfolgende Acquisition prüft Authority | Ja, aber Production-Fassung muss verifiziert werden | **PARTIAL** wegen vieler überschreibender Migrationen und ohne Production-Katalogbeweis. |
| Cycle acquisition / context / commit | Open, current project, expected conversation/runtime/knowledge revision an mehreren DB-Authorities | Alte N kann N+1 nicht mutieren; Close ändert Conversation revision | **SAFE** im Repository. Project IDs verhindern Mutation von N+1 (`202609100006...sql:14`; `202609100007...sql:66,117`). |
| Laufende OpenAI-Klassifikation | Kein Cancel nach Request-Start; Ergebnis-Commit wird DB-seitig revalidiert | Provider-Aufruf kann noch laufen, aber Commit sollte stale werden | **PARTIAL**: Kosten/Latency möglich, kein erwarteter Customer-Side-Effect. E2E-Fault-Injection nötig. |
| Delivery recovery discovery | Kein Join auf Conversation | Kandidat kann entdeckt werden | **PARTIAL**; Acquisition blockiert geschlossenes N (`202609030001...sql:144-156,50-56`). |
| Delivery acquisition/revalidation | Conversation muss open sein; aktives Binding; Pending muss aktuell sein | Bis zur Revalidation ja | **PARTIAL**. |
| Delivery zwischen revalidate und send | Keine weitere Conversation-Prüfung in `authorize`; Provider-Call folgt direkt | Close kann genau in diesem Fenster erfolgen | **UNSAFE race**: verspätete Antwort aus N kann nach Close an dieselbe Telefonnummer gehen (`recoverable-delivery-runner.ts:79-100`). Revision wird im Delivery-Command nicht als letzte Send-CAS geprüft. |
| Delivery completion/status reconciliation | Claim/dispatch token und Provider-Binding schützen Versuche; kein Project N+1 | Kein Cross-Project-Write, aber gesendete Nachricht ist irreversibel | **PARTIAL**. |
| Media webhook/runner | Webhook ignoriert Media; kein produktiver Download-Runner | Keine Wirkung | **NOT APPLICABLE aktuell**; Zielpfad benötigt neue Fences. |
| Manual Project media processing | Project-ID/FKs und `deleted_at/upload_status` | Nicht durch Conversation-Close gestoppt; fachlich Admin-Workflow | **NOT APPLICABLE** zum automatischen Gespräch. |
| Offer/Execution processing | Admin-Autoritäten, Project-ID, revisions-/statusgebunden; nicht automatisch vom WhatsApp-Cycle gestartet | Kein automatischer Kundenreply | **SAFE / NOT APPLICABLE** zum Reset; Project N bleibt historisch verarbeitbar. |
| Cron/internal routes | Bearer-Secret, delegieren an obige Discoveries | So sicher wie jeweilige DB-Authority | **PARTIAL** insgesamt (`app/api/internal/*`). |

**Größtes Lifecycle-Risiko:** Eine bereits revalidierte, aber noch nicht an Meta gesendete Delivery aus N kann die Close-Grenze überholen. Vor Freigabe des logischen Reset-Operators ist ein atomarer „send intent/current lifecycle“-Fence plus ein deterministischer Concurrency-Test erforderlich. Wegen externer Side Effects kann PostgreSQL allein den Meta-Call nicht atomar zurückrollen; Ziel ist ein minimales, dokumentiertes Race-Fenster mit finaler Autorisierung, Binding-Revision/Conversation-Revision und Operator-Verhalten („drain or close“) statt falscher Absolutheit.

## 8. Current OpenAI Reality

| Frage | Befund |
|---|---|
| Produktive Calls | Genau ein Call-Site: `client.responses.parse(...)` in `lib/server/ai/providers/openai/adapter.ts:105-110`. Tests/Fakes sind keine produktiven Calls. |
| Modell | Konfigurierbar über `OPENAI_MODEL`, Default `gpt-4.1-mini` (`config.ts:5,21-35`). |
| Aktivierung | Nur wenn `AI_CUSTOMER_ANSWER_CLASSIFICATION_ENABLED === 'true'`; lazy Provider-Import (`productive-cycle-runtime.ts:27-42`). |
| Zweck | Bereits normalisierte Textantwort einem bekannten `informationKey` und übergebenen Allowlist-Werten zuordnen. Exakter Registry-Treffer läuft sogar deterministisch ohne OpenAI (`operation.ts:13-33`). |
| Prompt | Deutsch; nur `matched/no_match/ambiguous`; keine weiteren Entscheidungen/Claims/Frage/Kundenantwort/Preise/Angebote (`providers/openai/instructions.ts:3-13`). |
| Structured Output | `{schemaVersion:1,result:'matched'|'no_match'|'ambiguous',canonicalValue:string|null}`, danach nochmals Zod-/Domainvalidiert (`adapter.ts:16-20,109-118`). |
| Generiert Kundenprosa? | **NO**. |
| Wählt nächste Frage? | **NO**. Deterministischer Planner + `QUESTION_TEMPLATE_REGISTRY`. |
| Extrahiert allgemeine Projektfakten? | **NO**. Nur einen kanonischen Allowlist-Wert für eine bereits ausgewählte Property. |
| Sieht Bilder? | **NO**. Request enthält JSON-String/Text, kein Image-Input. |
| Vision implementiert? | **NO**. Keine produktiven `input_image`/`image_url` Calls. |
| Provider Memory | **NO**. Kein `previous_response_id`; das ist für das Ziel auch nicht erforderlich. |

Der OpenAI-Adapter ist als server-only, Zod-validiertes, provider-neutrales Muster **REUSE**, aber sein heutiger Operationsvertrag ist nicht der MVP-Gesprächs-Turn und bleibt Legacy.

## 9. KlimaGuy MVP Gap

| Capability | Status | Required change |
|---|---|---|
| Signierten WhatsApp-Text empfangen | **WORKING** | Beibehalten, Production-E2E beweisen. |
| Provider-Dedupe | **WORKING** | Replay-over-reset-Test und Receipts bewahren. |
| Stabile Identity / frischer Lifecycle | **PARTIAL** | Text-Code vorhanden; Admin-Close + Race-Fences + Production-Beweis fehlen. |
| Natürliche Nachricht verstehen | **PARTIAL** | Nur enge Allowlist-Klassifikation; neuer allgemeiner Turn nötig. |
| Aktuellen Gesprächskontext verstehen | **LEGACY-ONLY** | Legacy lädt Snapshot/Pending; neuer Reader muss Transcript nur für aktuelle Conversation laden. |
| Natürliche deutsche Antwort | **MISSING** | `reply_text` aus validiertem Structured Output. |
| Nächste nützliche Frage frei wählen | **MISSING** | Im neuen Turn, fachlich begrenzt und mit Human-Eskalation. |
| HVAC-Fakten strukturiert akkumulieren | **LEGACY-ONLY** | Komplexer Knowledge-Claim-Pfad kann enge Fakten; schlanke, kanonische Project-Facts-Autorität nötig. |
| Foto über WhatsApp empfangen | **MISSING** | Parser/Handler/Meta resolve-download; vorhandenes RPC ist blockierter Stub. |
| Foto dauerhaft aktuellem Project zuordnen | **MISSING** | Promotion von Staging zu `project_media` oder enger neue Authority; Project-Zuordnung zwingend. |
| Bildinhalt durch KI verstehen | **MISSING** | Vision-fähiger Turn mit bytes/signed durable URL ausschließlich aktueller ready Medien. |
| Qualification Progress | **LEGACY-ONLY** | Neuer Status aus kanonischen Facts, serverseitig validiert; Ready-Kriterien definieren. |
| Ready-for-offer Handoff | **PARTIAL** | Project-/Offer-Status vorhanden, aber kein AI-Qualifikationsadapter. |
| Human Offer Approval | **WORKING** als Authority/UI-Grundlage | Beibehalten; niemals automatische Preis-/Freigabeautorität an AI. |

## 10. Keep / Reuse / Freeze / Replace

### Infrastruktur und Kern

| Component | Decision | Why |
|---|---|---|
| WhatsApp webhook route | **KEEP** | Schmaler Node-Einstieg, testbare Dependencies. |
| Signature validation | **KEEP** | Timing-safe HMAC vor Parsing. |
| Request-size handling | **KEEP** | Streaming 1-MiB-Sicherheitsgrenze. |
| `transport_webhook_receipts` | **KEEP** | Globale Replay-Grenze über Lifecycles. |
| Dedupe algorithm | **KEEP** | Atomarer unique receipt; kleine Routing-Korrektur für Duplicates. |
| Transport identities | **KEEP** | Richtige stabile PII-Grenze, server-only. |
| Transport bindings/revisions | **KEEP** | Richtige Lifecycle-Auflösung und Historie. |
| Conversations | **KEEP** | Richtige Turn-/Memory-/Reset-Grenze. |
| Conversation messages/text | **KEEP** | Kanonischer, append-only Transcript. |
| Customers | **KEEP** | Stabile Person/Stammdaten getrennt vom Fall. |
| Projects | **KEEP** | Fachlicher Fall und Offer-Handoff. |
| `project_media` | **REUSE** | Reife durable Project-Media-Struktur, aber WhatsApp-Promotion fehlt. |
| Media staging tables/bucket | **REUSE** | Sichere private Pfade, MIME/Size/Storage-Finalisierung; heutiger Providerpfad blockiert. |
| Supabase Storage integration | **REUSE** | Private Buckets, serverseitige Adapter; projektgebundener Promotion/Read fehlt. |
| Outbound WhatsApp delivery | **REUSE** | Persistente Commands, Attempt-/Provider-Bindings; finalen Lifecycle-Fence ergänzen. |
| Delivery recovery | **REUSE** | Lease/retry/ambiguity wertvoll; Discovery/Fence härten. |
| Admin UI/Auth | **REUSE** | Rollenbasis und bestehende Operator-Seite; Reset-Semantik ersetzen. |
| RLS/security/audit | **KEEP** | Gute Sicherheitsbasis; jede additive Tabelle gleich behandeln. |
| OpenAI adapter pattern | **REUSE** | Server-only, timeout, error mapping, neutraler Contract; neue Operation separat. |
| Structured Output + Zod | **KEEP** | Pflicht vor jedem Persistieren von KI-Ausgaben. |
| Physischer Test-reset service/RPC im MVP | **FREEZE** | Nicht löschen, aber kein Aufruf aus dem neuen Operator/Pfad. |

### Legacy Runtime

| Subsystem | Classification | Begründung für neuen MVP-Pfad |
|---|---|---|
| Planner | **FREEZE FOR NEW MVP** | Erzeugt Registry-Fragebogen statt natürlichem Turn. |
| Interaction Snapshots | **FREEZE FOR NEW MVP** | Nur Legacy-Pending/Planner-Vertrag. |
| Pending Interactions | **FREEZE FOR NEW MVP** | Nicht nötig, wenn jeder Turn Transcript + Facts rekonstruiert. |
| Cycle Commands | **REUSABLE BUT OPTIONAL** | Muster für Idempotenz/Lease; Tabelle nicht zwingend wiederverwenden. |
| Runtime Commands | **FREEZE FOR NEW MVP** | Legacy-Orchestrierung. |
| Runtime States | **FREEZE FOR NEW MVP** | Doppelter State neben Conversation/Project/Facts wäre Split-Brain. |
| Effort States | **FREEZE FOR NEW MVP** | Kann später als UX-Signal zurückkehren, kein MVP-Blocker. |
| Retry States | **FREEZE FOR NEW MVP** | Legacy-Frage-Antwort-Retry; Infrastruktur-Retry getrennt modellieren. |
| Evidence Request States | **REUSABLE BUT OPTIONAL** | Später für formale Nachweise; zunächst `missing_facts`/Media-Prompt. |
| Knowledge Claims | **REUSABLE BUT OPTIONAL** | Wertvoll für spätere geprüfte Fachwissensschicht, zu schwer für natürlichen MVP-Turn. |
| Knowledge State Transitions | **FREEZE FOR NEW MVP** | Nicht als primäre Facts-Autorität verwenden. |
| Knowledge Corrections | **FREEZE FOR NEW MVP** | Nicht löschen; spätere Promotion geprüfter Fakten möglich. |
| Claim Retractions | **FREEZE FOR NEW MVP** | Wie Corrections. |
| Evidence Claim Proposals/Reviews | **REUSABLE BUT OPTIONAL** | Sinnvoll für spätere fachliche/visuelle Verifikation; nicht MVP-Abhängigkeit. |

„Freeze“ heißt: keine Löschung, keine destruktive Migration, keine Erweiterung für den neuen Pfad und bestehende Conversations weiterhin legacy-kompatibel behandeln. Routing muss per explizitem Feature Flag/Lifecycle-Modus verhindern, dass eine Conversation beide Engines nutzt.

## 11. Recommended Architecture

### Vergleich der exakt vier Optionen

| Option | Benefits | Risks | Scope | MVP speed | Reuse | Rollback complexity |
|---|---|---|---|---|---|---|
| **A Continue Legacy Runtime** | Bereits viele Zustands-/Recovery-Authorities; deterministisch/auditierbar | Natürliche Konversation bleibt gegen Snapshot/Pending/Planner-Verträge gekoppelt; Vision/Facts schwer integrierbar; hohe Änderungsfläche | **HIGH** | **SLOW** | Hoch, aber falscher Schwerpunkt | Hoch wegen historischer State-Migrationen |
| **B Thin MVP Path Beside Legacy** | Transport/Lifecycle/Message/Media/Delivery/Auth bleiben; kleiner vertikaler Produktpfad; feature-flaggable | Zwei Engines müssen pro Conversation strikt exklusiv sein; neue Turn-Fences/Facts nötig | **MEDIUM**, sequenziell | **FASTEST** | Hoch bei funktionierender Infrastruktur | Niedrig bis mittel: Flag off, additive Daten behalten |
| **C Add `qualification_runs`** | Expliziter neuer Run-State | Dupliziert Conversation-Lifecycle, Mapping-/Reset-/Memory-Split-Brain, zusätzliche Migration/Queries | **MEDIUM-HIGH** | Langsamer | Mittel | Mittel-hoch |
| **D Rewrite** | Sauberes Greenfield-Modell | Verliert getestete Security/Dedupe/Delivery/Admin-Arbeit; hoher Regression-/Zeit-Risk | **VERY HIGH** | **SLOWEST** | Niedrig | Sehr hoch |

**Auswahl: B.** Keine neue Lifecycle-Entität. Die Engine-Auswahl gehört als serverseitige Konfiguration/Feature Flag an die stabile Identity oder neu gestartete Conversation; sie darf nicht während einer Conversation wechseln.

```text
Meta WhatsApp
  |
  v
[existing signature + bounded parser]
  |
  v
[existing receipt dedupe] -- old wamid --> DUPLICATE / STOP
  |
  v
[stable transport identity]
  |
  v
[single active binding rev R] --> [OPEN conversation C]
                                       |
                                       +--> [current project P]
                                       +--> [messages WHERE conversation_id=C]
                                       +--> [facts WHERE project_id=P]
                                       +--> [ready media WHERE project_id=P]
                                                        |
                                                        v
                                           [ONE validated AI turn]
                                             | reply_text
                                             | facts_patch
                                             | status/human flag
                                                        |
                              [atomic/idempotent persist + C/R/P fence]
                                                        |
                                   [existing outbound delivery + final fence]
                                                        v
                                                  Meta WhatsApp

Admin reset: OPEN C --CAS--> CLOSED C; retain every row.
Next new wamid: binding R superseded --> binding R+1 --> C+1 --> P+1.
```

## 12. Target AI Conversation Turn

### Inputs

- Immutable turn identity: inbound `message_id`, Conversation ID + expected Conversation revision, active Binding ID + binding revision, current Project ID.
- Transcript: bounded recent/all relevant `conversation_messages` and text **only where `conversation_id = current C`**, deterministic order by sequence.
- Project facts: effective, server-validated facts **only where `project_id = current P`**.
- Media: only durable, non-deleted, `ready` image records belonging to P and explicitly linked to current inbound/current C; never query by Customer alone.
- Server-owned HVAC qualification policy: allowed fact keys/value schemas, required/minimum facts, safety/escalation/offer rules. Preisregeln are not an AI input authority.

### Structured output contract

Conceptually:

```json
{
  "reply_text": "Natürliche deutsche Antwort und nächste sinnvolle Frage",
  "facts_patch": [],
  "missing_facts": [],
  "qualification_status": "in_progress | ready_for_offer | needs_human",
  "needs_human": false
}
```

The real contract must be a discriminated, strict Zod schema. `facts_patch` may contain only registry keys and key-specific validated values, source message/media IDs supplied by the server, confidence/status from fixed enums, and explicit replace/supersede semantics. Model-provided IDs, prices, offer approval, SQL/storage paths and authorization decisions are ignored/rejected.

### Canonical state and memory

Postgres remains canonical. Every turn reconstructs context from C/P; **no provider-side conversation memory and no `previous_response_id`**. This avoids provider/Postgres split-brain, makes replay deterministic enough to audit, and makes close/new Project the memory boundary. Provider response IDs may be stored only as diagnostics/idempotency provenance, never as memory authority.

### Side-effect fencing

1. Unique turn claim by inbound `message_id`; Duplicate/already terminal returns no-op.
2. Before inference: C open, active Binding points to C with expected revision R, P equals `current_project_id`.
3. After inference and before persist: re-check the same values under lock; atomically persist validated facts, outbound Message/Delivery Command and turn terminal status.
4. Before provider send: re-check C open + Conversation revision + active Binding ID/revision + outbound belongs to this turn. Closing invalidates unsent work.
5. Exactly one provider-call authorization token/attempt. Any uncertain send is reconciled, never blindly resent.
6. A turn from N may write only Project N. No Customer-wide facts query/write.

## 13. Project Facts Recommendation

The repository has two candidates, neither is a simple fit:

- `projects` has a few scalar fields (`installation_address`, `postal_code`, `city`, `summary`, status), but not typed extensible HVAC facts or source provenance (`202607210001_initial_schema.sql:6-9`). Overloading `summary` JSON/text would lose validation, provenance and concurrency safety.
- `project_knowledge_states` + claims/evidence/transitions does represent typed facts, provenance and versions, but its mutation authorities are tightly coupled to legacy entity IDs, Evidence, reviewer protection and Planner state (`202608210006_persistent_knowledge_state_apply.sql:3-58`). Reusing it as the first natural-turn write path would retain most complexity Option B is meant to bypass.

**Recommendation:** after a contract-only PR, add one minimal project-scoped facts authority (working name `project_facts`; final name/schema decided in that PR). It should use the repository’s actual primitives: UUID PK/FKs, `projects(id) ON DELETE RESTRICT`, JSONB only for a validated typed value, `conversation_messages(id)` and optional `project_media(id)` provenance, explicit enum/text-check status/confidence, timestamps, revision/supersession or effective-row constraint, RLS, service-only writes, staff reads, audit event, no physical client delete.

Do not store the entire model response as canonical facts. Do not guess a free-form key/value schema. A domain registry must define MVP keys and types first (e.g. room type/area, building context, indoor/outdoor placement, pipe route, electrical/condensate/access context, photo observations) and distinguish customer report, AI observation, assumption and human verification. Promotion into the sophisticated Knowledge system is later optional.

## 14. Media / Vision Plan

### Reusable current pieces

- Parser has a recognized media-type branch but intentionally emits only `media_deferred` (`parser.ts:7,42-46`).
- SQL has Receipt/Identity/Binding/Message/Attachment/Command creation mirroring text lifecycle (`202608240003...sql:68-116`).
- Private `transport-media-staging` supports JPEG/PNG/WebP, 15 MB, deterministic opaque paths, storage-object verification and staged finalization (`...:47-65,119-167`).
- Server-only adapter validates actual bytes/MIME and uploads with `upsert:false` (`media-staging-adapter.ts:10-42`).
- Mature `project_media` supports private durable project-scoped ready images and soft deletion (`202607270001_project_media_table_baseline.sql:1-17,43-62,84-97`).

### Missing path

1. Strictly parse WhatsApp image `id`, caption, sender and timestamp into a Zod contract.
2. Call image ingestion RPC; do not leave the created command permanently `blocked`.
3. Resolve/download from Meta server-side with auth, timeout, byte/MIME/size validation and bounded retry.
4. Persist to private staging, finalize object existence, then atomically promote/copy into a durable `project_media` row belonging to C’s locked `current_project_id` (or define staging itself as the durable context authority; preferred is project_media reuse).
5. Link source Message ↔ attachment/staging ↔ project_media. Revalidate C/P/binding before promotion and AI scheduling.
6. AI context query uses `project_media.project_id=P`, `upload_status='ready'`, `deleted_at IS NULL`, image MIME, plus current Conversation provenance. Supply short-lived server-generated content or fetched bytes, never Meta’s expiring URL and never public bucket URLs.
7. Mark which media were processed by which turn so old ready photos are not repeatedly injected unless deliberately included.

Old Project N media cannot leak when every query begins with P from locked Conversation N+1 and verifies provenance. Customer-wide media lookup is forbidden. Current staging records lack `project_id`, so they alone are insufficient for Vision isolation until joined through `command.conversation_id → conversation.current_project_id` under a fence or promoted.

## 15. Offer Boundary

`project_offers` already provides versioned `draft → created → sent → accepted/rejected/superseded`, optimistic revision and admin-only transition authorities. A draft can only be created while Project is `technical_review` or `human_review`, and creation transitions Project to `quote_draft` (`202608230001_minimal_persistent_offer_authority.sql:67-72`; `lib/domain/project-offer.ts:3-26`; `project-offer-service.ts:13-36`). Projects default to `requires_human_review=true` (`202607210001_initial_schema.sql:7,27`).

`qualification_status='ready_for_offer'` therefore means only: validated minimum facts are present and the Project may be transitioned/requested into `technical_review`/`human_review`. It does **not** create a priced offer, calculate price, mark created/sent, approve or accept. A logged-in authorized human uses the existing offer authority to create/review the draft. Price computation stays deterministic and outside the language model; current infrastructure is lifecycle-only and contains no priced artifact.

## 16. Exact Implementation Roadmap

### Step 1 — Freeze baseline and prove lifecycle in PostgreSQL

- **GOAL:** Add tests (not behavior) proving close → new text wamid → N+1/binding revision+1 → First Contact P+1, retained N, and old-wamid no-op.
- **WHY:** The central hypothesis must become an executable gate and detect migration/Production drift.
- **FILES/SUBSYSTEMS:** integration test harness/fixtures, lifecycle RPCs, CI; Production catalog snapshot procedure.
- **DATABASE CHANGE:** NO.
- **PRODUCTION RISK:** LOW.
- **ACCEPTANCE:** Fresh migrated PostgreSQL passes exact row/value assertions; replay creates zero rows/commands; test records current function definitions/hash.
- **ROLLBACK:** Remove tests/CI job only.

### Step 2 — Close/delivery concurrency contract

- **GOAL:** Define and enforce cancellation of all not-yet-dispatched N work when C closes; close cannot report success while an old send can newly start.
- **WHY:** Logical reset is unsafe without customer-visible side-effect fencing.
- **FILES/SUBSYSTEMS:** conversation transition/delivery SQL authorities, delivery runner, concurrency integration tests.
- **DATABASE CHANGE:** YES, additive/replacement authority migration likely; no deletes.
- **PRODUCTION RISK:** HIGH.
- **ACCEPTANCE:** Barrier-controlled tests close at each acquire/revalidate/authorize/send boundary; after successful close, zero newly initiated provider calls from N; N work cannot touch P+1.
- **ROLLBACK:** Revert runner and forward migration restoring prior functions; disable logical reset UI until safe.

### Step 3 — Logical Admin Test Customer Reset

- **GOAL:** Replace the UI’s commit behavior with resolution + CAS close; retain preview as non-destructive lifecycle preview.
- **WHY:** End hard-delete work and enable repeatable testing.
- **FILES/SUBSYSTEMS:** `app/(app)/admin/test-customer-reset/*`, `lib/actions/test-customer-reset*`, server adapter, conversation authority, tests/docs.
- **DATABASE CHANGE:** NO if existing authenticated RPC is invoked with user session; otherwise only a narrow non-destructive authority migration, reviewed separately.
- **PRODUCTION RISK:** MEDIUM.
- **ACCEPTANCE:** Admin-only; repeated commit idempotent; all historical counts unchanged; UI shows closed Conversation ID/revision; next new text creates N+1/P+1.
- **ROLLBACK:** Feature flag/hide operator and revert app wiring; never reactivate hard delete as fallback.

### Step 4 — MVP engine routing contract and feature flag

- **GOAL:** Select exactly one engine per new Conversation/test Identity; duplicates never route; legacy Conversations remain legacy.
- **WHY:** Prevent two engines from replying to one inbound.
- **FILES/SUBSYSTEMS:** webhook routing, first-contact routing, server config/domain contract, tests.
- **DATABASE CHANGE:** NO initially (server allowlist keyed by non-logged identity scope); persist engine mode later only if tests prove needed.
- **PRODUCTION RISK:** MEDIUM.
- **ACCEPTANCE:** Matrix tests recorded/duplicate × new/existing × legacy/MVP produce exactly one or zero engine invocations as specified.
- **ROLLBACK:** Disable flag; all traffic follows legacy path.

### Step 5 — Define HVAC fact and AI-turn contracts (no provider)

- **GOAL:** Strict domain registry/schema for inputs, `reply_text`, typed `facts_patch`, missing facts, qualification status and human escalation.
- **WHY:** AI must not invent DB keys, prices or authority.
- **FILES/SUBSYSTEMS:** new domain/server AI operation schemas, fixtures, Vitest.
- **DATABASE CHANGE:** NO.
- **PRODUCTION RISK:** LOW.
- **ACCEPTANCE:** Valid/invalid fixtures cover every key/type, unknown key, source spoofing, pricing/offer fields, empty reply, ready/human invariants.
- **ROLLBACK:** Remove unused contract modules.

### Step 6 — Minimal canonical Project Facts authority

- **GOAL:** Persist validated effective/superseding project facts with message/media provenance and idempotent turn identity.
- **WHY:** Existing Project columns are insufficient and Legacy Knowledge is too coupled.
- **FILES/SUBSYSTEMS:** one additive migration, facts domain mapper/repository, RLS/audit tests.
- **DATABASE CHANGE:** YES – one additive structure plus authority/index/policies; no legacy changes.
- **PRODUCTION RISK:** MEDIUM.
- **ACCEPTANCE:** Replaying same patch is no-op; conflict is explicit; cross-project source IDs rejected; client cannot write; staff can read; correction history retained.
- **ROLLBACK:** Disable new path; leave unused additive rows/table, no destructive down migration.

### Step 7 — Context reader and fake-provider turn orchestration

- **GOAL:** Load only C/P transcript/facts and atomically commit one fake AI result to facts + outbound message/command.
- **WHY:** Prove isolation/idempotency before OpenAI.
- **FILES/SUBSYSTEMS:** conversation context repository, turn runner/authority, existing messages/delivery, fake provider tests.
- **DATABASE CHANGE:** YES likely for turn claim/idempotency/fence authority; schema decision isolated to this PR.
- **PRODUCTION RISK:** MEDIUM.
- **ACCEPTANCE:** N/N+1 fixtures prove zero old transcript/facts; concurrent same inbound yields one outbound; close during fake inference yields no commit/send.
- **ROLLBACK:** Disable feature flag; additive turn records remain inert.

### Step 8 — Productive OpenAI natural text turn

- **GOAL:** Add one new structured Responses operation generating natural German reply plus facts/status; retain existing classifier untouched.
- **WHY:** First actual product capability.
- **FILES/SUBSYSTEMS:** OpenAI adapter operation dispatch, prompts/config, turn runner, observability without PII, tests.
- **DATABASE CHANGE:** NO.
- **PRODUCTION RISK:** HIGH.
- **ACCEPTANCE:** Offline contract tests plus controlled test-number E2E: natural multi-turn reply, valid facts, one send, refusal/timeout/schema failure escalates safely without unchecked write.
- **ROLLBACK:** Disable MVP/OpenAI turn flag; no dual fallback reply.

### Step 9 — Productive WhatsApp image ingestion to durable Project media

- **GOAL:** Wire strict image webhook, Meta resolve/download, staging and project-bound ready media.
- **WHY:** Current media path is intentionally nonproductive.
- **FILES/SUBSYSTEMS:** parser/contracts/webhook, media ingestion runner/provider adapter, staging, `project_media`, recovery route, tests.
- **DATABASE CHANGE:** YES likely to promote/link WhatsApp source and recovery state; additive only.
- **PRODUCTION RISK:** HIGH.
- **ACCEPTANCE:** New image wamid creates one receipt/message/current-P ready image; replay no-op; expired/transient failures bounded; close race never promotes to P+1.
- **ROLLBACK:** Disable image flag/worker; staged objects remain private and cleanup policy handles them.

### Step 10 — Vision in the same current-project turn

- **GOAL:** Provide only newly/currently relevant ready P images to the structured AI turn and persist image-sourced observations.
- **WHY:** Meet installation-photo understanding target.
- **FILES/SUBSYSTEMS:** context reader, storage reader/signed input, OpenAI multimodal request, facts provenance, tests.
- **DATABASE CHANGE:** MAYBE (processed-by-turn link if Step 9 did not add it).
- **PRODUCTION RISK:** HIGH.
- **ACCEPTANCE:** Instrumented provider proves current image bytes/input present and old P image absent; output observations validated; uncertain/safety-critical observations marked needs-human, never facts with technical authority.
- **ROLLBACK:** Disable Vision while retaining text MVP and media ingestion.

### Step 11 — Qualification-to-offer human handoff

- **GOAL:** Map server-validated readiness to Project technical/human review and expose human draft action.
- **WHY:** Complete MVP without AI pricing/approval.
- **FILES/SUBSYSTEMS:** qualification policy, project status action, existing offer UI/service, audit/tests.
- **DATABASE CHANGE:** NO expected.
- **PRODUCTION RISK:** MEDIUM.
- **ACCEPTANCE:** Ready project appears for human review; no offer/pricing/sent state changes without authorized human command; AI cannot clear `requires_human_review`.
- **ROLLBACK:** Disable automatic status handoff; facts/conversation continue and admin transitions manually.

### Step 12 — Three-cycle release gate and operations runbook

- **GOAL:** Execute the complete chronological E2E three consecutive times without SQL intervention.
- **WHY:** Repository/unit proof is not Production proof.
- **FILES/SUBSYSTEMS:** E2E harness/runbook, CI/observability dashboards; no behavior changes.
- **DATABASE CHANGE:** NO.
- **PRODUCTION RISK:** LOW.
- **ACCEPTANCE:** Section 18 passes three times, with receipt/conversation/project/turn/media/delivery evidence and no PII logs.
- **ROLLBACK:** Do not enable beyond test identity until passing.

## 17. Sequential PR Plan

Only **one implementation PR may be open/in progress at a time**. Merge evidence from PR N is an input to PR N+1.

| # / PR title | Goal and exact scope | Explicit non-scope | Expected areas | Tests / acceptance gate / merge evidence |
|---|---|---|---|---|
| 1 **Prove logical Conversation lifecycle and replay isolation** | Integration/CI tests only for close/new/replay/P+1 | No UI, reset change, migration 0006 | PostgreSQL harness, migrations-as-fixture | Fresh DB commands + assertion output + function hashes attached; all pass. |
| 2 **Fence stale outbound delivery across Conversation close** | Final send/close contract and concurrency fence | No AI/media/reset UI | Delivery/transition SQL + runner | Deterministic race matrix; provider spy count zero after close; migration-from-current passes. |
| 3 **Change Admin test reset to logical Conversation close** | Non-destructive preview/commit, admin auth/idempotency | No hard-delete RPC edits/deletes | Admin reset UI/action/adapter | Historical row counts unchanged, admin/auth tests, live new N/P proof. |
| 4 **Introduce exclusive feature-flagged MVP conversation routing** | One engine per Conversation/test identity; duplicate stop | No AI provider/facts | Webhook/first contact/config | Routing matrix; zero dual invocations; flag-off legacy parity. |
| 5 **Freeze KlimaGuy MVP turn and HVAC facts contracts** | Zod/domain registries and fixtures only | No DB/OpenAI/runtime | Domain + AI operation schemas | Full invalid/valid matrix, pricing/authority rejection. |
| 6 **Add minimal project facts persistence authority** | One additive project-scoped facts model/repository/RLS | No AI, no Knowledge deletion | Migration/actions/domain | Postgres RLS/idempotency/provenance/concurrency evidence. |
| 7 **Run an isolated conversation turn with a fake provider** | Context C/P + atomic facts/outbound commit | No OpenAI/Vision | Turn runner/context/SQL/delivery | N/N+1 isolation, concurrency, close-race tests. |
| 8 **Activate natural German OpenAI text turns for the test identity** | New structured operation/prompt/provider wiring | No image, pricing, broad rollout | AI adapter/turn/observability | Contract suite, recorded test-number trace, exactly one reply; safe failure trace. |
| 9 **Ingest WhatsApp images into current Project media** | Parser through durable ready `project_media`, recovery | No Vision inference | WhatsApp/media/storage/SQL | Real Meta fixture/live image, replay/close/expiry tests, object provenance. |
| 10 **Add current-project Vision to the MVP turn** | Current ready images in multimodal request; observation facts | No old media, pricing, auto technical claims | AI/context/storage/facts | Captured request proves inclusion/exclusion; uncertainty → human. |
| 11 **Hand ready qualification to human offer review** | Readiness policy → technical/human review; existing draft UI | No price generation or auto approval/send | Project status/offer UI/actions | Permission tests and human-only audit evidence. |
| 12 **Gate MVP release with three reset/text/image cycles** | E2E/runbook/production evidence | No unrelated cleanup | E2E/ops docs | Three consecutive Section-18 runs, no manual SQL, evidence bundle before rollout. |

Every PR must include lint, TypeScript and Vitest results plus its focused integration/E2E evidence. Failure or unknown Production schema stops the sequence; no next PR starts speculatively.

## 18. Final WhatsApp E2E Acceptance Test

Execute chronologically, recording non-PII IDs/counts/timestamps and provider request counts:

1. Select the same known WhatsApp test number and capture active Identity ID, Binding ID/revision R, Conversation N, Project N and historical row counts.
2. As Admin invoke logical reset; assert Conversation N becomes `closed` with revision +1.
3. Assert zero historical Customer/Project/Conversation/Message/Snapshot/Pending/Knowledge/Evidence/Media/Receipt rows were deleted or rewritten outside the status/audit command.
4. Wait only for observation; safety must not depend on waiting. Assert pending delivery/cycle work from N is blocked/stale.
5. Send a completely new text with new wamid W2 from the same WhatsApp number.
6. Assert Receipt `(whatsapp,sender_scope,W2)` is new/processed exactly once.
7. Assert fresh open Conversation N+1 and active Binding revision R+1; old Binding is superseded and N remains closed.
8. Assert fresh Project N+1 belongs to the same stable Customer and is `current_project_id` of N+1.
9. Capture AI request and assert it contains no Message/Facts/Project ID from N/P N.
10. Assert one natural, context-appropriate German `reply_text` is produced and schema-valid.
11. Assert typed facts from W2 persist only under P N+1 with W2’s internal Message provenance.
12. Assert exactly one outbound Message, one authorized provider call and one accepted Provider Message ID.
13. Send a new image with new wamid I2 and optional caption.
14. Assert one receipt, image Message, attachment, successful ingestion and durable ready media under P N+1.
15. Assert AI request actually contains I2’s current durable image content/reference.
16. Assert all media from P N is absent, even if ready and same Customer.
17. Assert a natural reply references only defensible visible information; structured visual observations carry media provenance and uncertainty/human status.
18. Continue with new wamids; assert facts accumulate/correct without duplicate effective facts and questions adapt naturally.
19. Reach server-validated `ready_for_offer`; assert Project enters human/technical review boundary.
20. Assert no price, offer draft, offer creation, send or approval occurs automatically. Have an authorized human perform only the intended review/draft action.
21. Logically reset N+1; assert it closes and no history is deleted.
22. Send another new wamid W3; assert Conversation N+2, Binding R+2 and Project N+2 with clean context.
23. Replay old W2 from closed N+1 after N+2 is active.
24. Assert W2 is duplicate/no-op: zero new Message, Conversation, Project, fact, turn, OpenAI call, media mutation, Delivery Command or WhatsApp response; N+2 remains byte/row-equivalent except unrelated timestamps must not change.
25. Repeat the complete text + image + logical reset lifecycle **three consecutive times without manual SQL debugging**. This is the release gate.

## 19. Stop Doing

| Activity | Decision |
|---|---|
| Physical Hard Delete as MVP reset | **STOP** |
| Migration 0006 | **STOP / DO NOT BUILD** |
| Trigger-disabling reset migrations | **STOP** |
| Recovery-lineage nulling | **STOP** |
| Endless FK/delete graph hunting for MVP | **STOP**; retain only for separate legal retention/DSGVO project. |
| Manual SQL debugging by the human | **STOP**; convert diagnosis into automated tests/catalog evidence. |
| Unnecessary lifecycle abstractions / `qualification_runs` | **STOP** |
| Expand legacy questionnaire runtime before natural AI works | **STOP / FREEZE** |
| Full rewrite | **STOP** |
| Unrelated cleanup during MVP recovery | **STOP** |
| Delete old migrations/history to make schema look clean | **STOP** |
| Claim Production behavior from migration files alone | **STOP** |

## 20. Remaining Unknowns

1. **Production drift:** Is the actually installed `transition_conversation_status`, text/image ingestion and each final recovery function byte-for-byte equivalent to the repository migration result? Obtain read-only `pg_get_functiondef`, constraints/indexes/grants and migration ledger before PR 1 is called Production-verified.
2. **Delivery close race policy:** Can the operator wait for already-authorized dispatches to terminalize, or must close preempt them? Exact UX/transaction contract must be chosen and proven in PR 2; external Meta calls cannot be transactionally rolled back.
3. **Engine selection persistence:** Is a server-side test-identity flag sufficient through MVP, or must engine mode be persisted per Conversation to survive config changes? Decide in PR 4 from deployment behavior, without a new lifecycle entity.
4. **MVP fact vocabulary/readiness:** The exact HVAC fact keys, value types, required threshold and which photo observations can be AI-proposed versus human-verified need Product/HVAC owner sign-off before PR 5.
5. **Meta media contract/runtime:** Actual Graph API version, media metadata/download semantics, expiry/retry behavior and webhook fixtures must be verified against current official Meta documentation during PR 9.
6. **Durable media promotion:** Whether to copy from `transport-media-staging` to `project-media` or extend an existing finalization authority requires storage lifecycle/cost review; staging alone currently has no Project ID.
7. **Model choice/cost/latency:** Select a currently supported structured-output and vision-capable model through evaluation, not the legacy default. This audit intentionally does not prescribe a time-sensitive model name.
8. **Retention/legal deletion:** A real DSGVO erasure workflow may eventually be required, but it is a separate legal/operations architecture with retention exceptions, not the MVP reset.

These unknowns do not justify Hard Delete, `qualification_runs`, continuing Legacy expansion or a rewrite. They are explicit acceptance gates for the numbered PRs.
