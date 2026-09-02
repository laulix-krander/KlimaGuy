# AP-16-06-04A — WhatsApp Delivery Recovery Authority & Crash Contract Audit

**Baseline:** `5937bbefa2fe1e7444c93f8dba5a0ccf7cf81d68`
**Scope:** Architektur-Freeze; ausschließlich Dokumentation, keine produktive Delivery Bridge.

## 1. Executive Result

Der Contract kann ohne eine bislang unbelegte Provider-Idempotenzfunktion sicher geschlossen werden. Maßgeblich ist eine konservative Grenze: **Ein automatischer erneuter Provider-Send ist nur zulässig, wenn persistente Authority beweist, dass der vorherige Provider-Side-Effect noch nicht begonnen hat.** Sobald der Request begonnen haben kann, führt verlorene Ownership zu `delivery_ambiguous`, niemals zu Blind-Retry.

Der vorhandene Happy Path ist verwendbar, aber Recovery ist heute nicht produktionssicher. Der Cycle Commit kennt die eindeutige Outbound-ID; der produktive Cycle Runner entfernt sie. Der Delivery Command entsteht erst lazy beim Claim. `sending` besitzt weder Lease noch Send-Phasenmarker und kann permanent stranden. `failed` ist ungeachtet seiner Klassifikation erneut claimbar, ein persistenter Fälligkeitszeitpunkt fehlt, und Versuch 4 scheitert lediglich an Constraints.

Der verbindliche Zielvertrag ergänzt deshalb (noch nicht in diesem Paket): durchgereichte `outbound_message_id`, vor jedem externen Side Effect persistente Command-/Attempt-Authority, Lease und Owner-Fencing, eine atomare Dispatch-Grenze, geschlossenes Retry-Timing und bounded Discovery. Das Acceptance-before-Binding-Race wird nicht „aufgelöst“, sondern sicher eingeschlossen: ab möglichem Dispatch ist ein verwaister Versuch ambiguous/manual; ein späterer Webhook kann nur nach bereits bekanntem Provider-ID-Binding automatisch zuordnen.

## 2. Architecture Basis

Vollständig geprüft wurden die geforderten Audits AP-16-06-00, AP-16-06-01A und AP-16-06-03A, die Implementierungsdokumente AP-16-06-01E/F, AP-16-06-02, AP-16-06-03 v2 und der STOP-Audit AP-16-06-04 sowie der aktuelle Cycle-, Persistence-, WhatsApp-Adapter-, Webhook-, Reconciliation-, Migrations- und Testcode.

Die Grenzen bleiben getrennt:

1. Conversation Cycle entscheidet und committet intern atomar.
2. WhatsApp Delivery besitzt eine eigene transportbezogene Command-, Retry- und Recovery-Authority.
3. Providerstatus reconciled ausschließlich eine bereits gebundene Provider-ID.
4. OpenAI, Replanning, Preis- oder Angebotsentscheidungen gehören nicht in Delivery.

AP-16-06-03 liefert als technisches Vorbild Node/Vercel, fail-closed Bearer-Auth, Supabase Vault, `pg_cron` und `pg_net`; seine fachliche Cycle-Recovery-Authority und sein Secret werden nicht wiederverwendet.

## 3. Current Delivery Path

Der aktuelle Pfad ist:

1. `deliverPendingWhatsAppMessage({ internal_message_id })` ruft `claim_whatsapp_outbound_delivery(...)` auf.
2. Claim validiert die interne outbound Text Message, offene Conversation, aktive WhatsApp-Bindung/-Identität und gegebenenfalls die aktive Pending Interaction.
3. Claim legt den Delivery Command lazy an, setzt `sending`, erzeugt `claim_token`, erhöht `attempt_count` und legt einen gestarteten Attempt an.
4. TypeScript revalidiert Claim und fachliche Sendbarkeit unmittelbar vor dem Adapter.
5. Konfiguration wird gelesen; fehlende Konfiguration wird als `provider_auth_error/configuration` completed.
6. `sendWhatsAppText(...)` sendet exakt Text und Destination an `POST /v25.0/{phone-number-id}/messages`; Fetch ist auf 15 Sekunden begrenzt.
7. Erfolg liefert die Provider Message ID nur in der Response. Completion legt das Binding an und setzt atomar `accepted_by_provider`.
8. Kontrollierte Fehler werden als `failed` oder `delivery_ambiguous` completed.

`replay` und `blocked` senden nicht. Ein Completion-Fehler nach einem Send wird nur als `delivery_completion_requires_reconciliation` geworfen; er repariert den persistenten `sending`-Zustand nicht. Es existieren weder produktiver Caller noch Delivery Discovery, Lease, Recovery Runner, Route oder Scheduler.

## 4. Outbound Message Identity

Die ID wird nicht erst nachträglich gesucht. `acquire_customer_message_cycle_execution(...)` reserviert `next_outbound_message_id` als UUID im Cycle Command. Der atomare Success Commit verwendet genau diese ID für `conversation_messages`, `conversation_message_text`, Snapshot/Pending-Bindung und `conversation_cycle_commands.outbound_message_id`; sein DB-Result und `PersistentCycleResult` enthalten `outbound_message_id`.

`ConversationCycleSuccess` selbst enthält **keine** persistente Outbound Message ID: Es ist ein Domain-Ergebnis vor Persistence. `PersistentCycleCommit` trägt den Domain-Cycle, während erst `commitCustomerMessageCycle(...)` das persistente Result mit der reservierten ID zurückgibt. Die konkrete Verlustgrenze ist `runPersistentCustomerMessageCycle(...)`: Ein erfolgreicher `PersistentCycleResult` wird auf `{ kind: "completed", command_id }` reduziert. Danach kann `triggerPersistentMessageCycle(...)` die ID nicht an Delivery geben.

**Verbindlicher Handoff:** Nur für einen neuen, erfolgreich committed `completed_with_next_interaction`-Ausgang erweitert der Runner sein Success-Result um `outbound_message_id: UUID`. Replay muss die bereits persistierte `conversation_cycle_commands.outbound_message_id` genauso liefern, sofern vorhanden. Andere Runner-Ausgänge tragen keine ID. Caller übergibt exakt diese ID an die Delivery-Orchestration. Verboten sind Latest-Message-Lookup, Textvergleich, Sequence Guessing und Conversation-last-message-Heuristiken. Das Domain-Objekt `ConversationCycleSuccess` wird nicht unnötig erweitert.

## 5. Delivery Command Lifecycle

Tatsächlich gilt heute Variante **B**: Der Cycle Commit erzeugt Message und Text, aber keinen `transport_delivery_commands`-Datensatz. Erst `claim_whatsapp_outbound_delivery(internal_message_id)` führt ein idempotentes Insert aus. Damit existiert bei Crash vor Claim kein Command, obwohl die Message dauerhaft existiert. Ab erfolgreichem Claim existiert der Command vor dem Graph-Side-Effect.

Zielvertrag: Der Command muss **vor** externer Ausführung dauerhaft und eindeutig existieren. AP-16-06-04B erzeugt ihn idempotent aus der autoritativen Outbound-ID (entweder innerhalb des atomaren Cycle Commit oder durch eine separate idempotente Enqueue-Authority direkt danach). Die bevorzugte stärkere Variante ist Erzeugung im Cycle-Success-Commit, weil zwischen Message Commit und Enqueue keine Discovery-Lücke entsteht. Der Command bleibt über `(provider, transport_binding_id, internal_message_id)` eindeutig. Transportbindung und -identität werden beim späteren Acquire/Revalidate erneut autoritativ geprüft.

## 6. Delivery State Matrix

Die acht Statuswerte sind aktuell DB-Enum und TypeScript-Schema. „Recoverbar“ unten beschreibt den Zielcontract.

| State | Bedeutung / heutiger Claim | Externer Side Effect möglich? | Provider-ID bekannt? | Auto-Retry | Recovery-Aktion | Terminal? | Status-Webhook |
|---|---|---:|---:|---|---|---:|---|
| `pending` | Command vorhanden, noch kein Dispatch; heute claimbar | nein | nein | erlaubt | due Command acquiren | nein | ohne Binding unmatched |
| `sending` | Claim aktiv; heute immer `replay` | je nach fehlender Phase unbekannt | gewöhnlich nein | nur bei persistent bewiesenem pre-dispatch; sonst verboten | aktive Lease: `busy`; expired pre-dispatch: reclaim; expired dispatch-possible: ambiguous | nein, kann heute stranden | ohne Binding unmatched |
| `accepted_by_provider` | Completion und Binding erfolgreich; Claim `replay` | ja | ja | verboten | kein Send; Status erwarten | transport-terminal für Send | `sent` bleibt accepted; `delivered/read/failed` können reconciliieren |
| `delivered` | Provider meldete Zustellung; Claim `replay` | ja | ja | verboten | keine | ja | `read` darf fortschreiten; `sent/failed` regressieren nicht |
| `read` | Provider meldete gelesen; Claim `replay` | ja | ja | verboten | keine | ja | bleibt `read` |
| `failed` | kontrollierter Fehler; heute ungeachtet Klassifikation claimbar | abhängig von Failure Class | evtl. nein | nur `retryable`, due, Attempts < 3 und Side-Effect sicher ausgeschlossen | schedule/acquire oder terminalisieren | bedingt | mit Binding: `sent/delivered/read` können korrigieren; sonst unmatched |
| `delivery_ambiguous` | Side Effect möglich, lokal unbeweisbar; Claim `replay` | ja/möglich | nein | verboten | manuelle Klärung, kein Send | ja für Automatik | ohne Binding nicht zuordenbar |
| `blocked` | fachlich/konfigurationsbedingt gesperrt; Claim `blocked` | nein bzw. älterer Side Effect bleibt maßgeblich | evtl. | verboten | manuelle/fachliche Behebung, neuer expliziter Command nur nach Autorisierung | ja | nur vorhandenes Binding kann reconciliieren |

Aktuell kann Reconciliation `failed` aus einem gebundenen `accepted_by_provider` setzen, solange nicht bereits `delivered/read`; das ist Providerstatus, nicht Erlaubnis zum Resend. `failed` darf im Ziel deshalb nur durch zusätzliche Retry-Klassifikation und Side-Effect-Sicherheit sendbar sein.

## 7. Retry Eligibility Matrix

Aktuell mappt der Adapter 429 zu `rate_limited/retryable`, 5xx zu `transient_provider_error/retryable`, 401/403 zu `provider_auth_error/configuration`, sonstige non-2xx zu `provider_rejected/terminal`; Fetch-Abbruch/-Exception wird `ambiguous_send_result/requires_reconciliation`. Die DB kennt außerdem `network_error`, `destination_invalid` und `configuration_error`, der Adapter erzeugt sie derzeit nicht differenziert.

| Failure Class | Einstufung | Persistentes Timing | Max. Provider-Attempts | Ambiguous? | Manuell? | Endzustand |
|---|---|---|---:|---:|---:|---|
| 429 Rate Limit, sicher beantwortet | **AUTO RETRY ALLOWED** | Provider `Retry-After`, falls künftig kontrolliert validiert; sonst 5 min | 3 | nein | nach Exhaustion | `failed/retryable`, dann `failed/terminal` |
| 5xx/transient Provider Response, sicher abgelehnt | **AUTO RETRY ALLOWED** | 1 min nach Attempt 1, 5 min nach Attempt 2 | 3 | nein | nach Exhaustion | `failed/retryable`, dann `failed/terminal` |
| Authentication/Provider-Konfiguration (401/403, fehlende Env) | **AUTO RETRY FORBIDDEN** | keines | aktueller Provider-Attempt bleibt unverändert, wenn kein Call; sonst verbrauchter Attempt | nein | ja, Konfiguration reparieren und explizit reauthorisieren | `blocked/configuration` |
| Malformed Request / Schema / unsupported payload | **TERMINAL** | keines | verbrauchter Attempt nur falls Call begann | nein | fachliche Korrektur | `failed/terminal` |
| Recipient/Destination invalid | **TERMINAL** | keines | verbrauchter Attempt | nein | Stammdatenprüfung | `failed/terminal` |
| Explizite sonstige Provider-Ablehnung (4xx) | **TERMINAL** | keines | verbrauchter Attempt | nein | bei Bedarf manuell | `failed/terminal` |
| Controlled Timeout, Netzwerkabbruch oder unbekannte Acceptance | **MANUAL / AMBIGUOUS** | keines | verbrauchter Attempt | ja | ja | `delivery_ambiguous/requires_reconciliation` |
| Crash nach möglichem Dispatch | **MANUAL / AMBIGUOUS** | Lease-Ablauf dient nur Erkennung | verbrauchter Attempt | ja | ja | `delivery_ambiguous/requires_reconciliation` |
| Maximal 3 Attempts erreicht | **TERMINAL** | keines | 3 | nein, außer letzter Versuch selbst ambiguous | ja | `failed/terminal` oder `delivery_ambiguous` |
| Conversation/Pending Interaction stale, closed oder Human Takeover | **TERMINAL/BLOCKED** | keines | kein neuer Attempt | nein | fachliche Authority | `blocked/terminal` bzw. `human_review_required` |

Die Eligibility ist eine DB-Authority, kein TypeScript-`if`: claim/acquire akzeptiert ausschließlich `pending` oder `failed + retry_classification='retryable' + next_attempt_at <= statement_timestamp() + attempt_count < 3 + kein möglicher früherer Side Effect`. `configuration`, `terminal`, `human_review_required`, `requires_reconciliation`, ambiguous und alle Transport-Erfolgszustände sind ausgeschlossen. Attempt 4 muss als geschlossenes `already_terminal` resultieren; heute würde `attempt_count+1` beziehungsweise Attempt Nummer 4 nur an Check Constraints scheitern.

## 8. Retry Timing

Ein persistentes `next_attempt_at timestamptz` ist erforderlich. Authority ist die Failure-Completion-Transaktion: Sie klassifiziert einen sicher nicht akzeptierten Fehler, berechnet aus Failure Class und gerade verbrauchter Attempt-Nummer den festen Zeitpunkt und schreibt beides atomar. Ein validierter Provider-`Retry-After` darf für Rate Limit Vorrang haben, muss begrenzt werden (mindestens 1 Minute, höchstens 24 Stunden); der heutige Adapter transportiert ihn noch nicht.

Defaults: transient nach Attempt 1 `+1 Minute`, nach Attempt 2 `+5 Minuten`; Rate Limit ohne Header `+5 Minuten`. Nach Attempt 3 wird kein Zeitpunkt geschrieben und terminalisiert. Scheduler-Frequenz ist nur Discovery-Latenz, niemals Backoff-Authority. Erfolgs-, blocked-, terminale und ambiguous Zustände haben `next_attempt_at = null`.

## 9. Attempt Semantics

Ein **Delivery Attempt** ist genau eine persistente Autorisierung, den Graph Request möglicherweise zu beginnen. Ownership-Acquire, Reclaim, Revalidation, Konfigurationsprüfung und reine DB-Ausführung sind keine Provider-Attempts.

Heute erhöht Claim zu früh: bereits beim Übergang nach `sending`, also vor Revalidation, Konfigurationsprüfung und Graph Call. Zielvertrag:

1. Acquire setzt Owner/Lease und Phase `claimed`/`prepared`, erhöht `attempt_count` nicht.
2. Revalidation und Konfigurationsprüfung laufen unter gültiger Ownership.
3. Eine atomare fenced `authorize/start dispatch`-RPC prüft nochmals Eligibility/Owner/Lease, erhöht `attempt_count`, erzeugt genau einen `transport_send_attempts`-Datensatz und setzt `dispatch_started_at`/Phase `dispatch_started`.
4. Erst nach erfolgreichem RPC-Result darf der Prozess Graph aufrufen.
5. Completion beendet genau diese Attempt-Nummer.

Ein Crash nach dem Dispatch-Marker, aber vor dem tatsächlichen HTTP Call erzeugt konservativ ein false-positive ambiguous Result; er erlaubt niemals ein möglicherweise doppeltes Senden. Lease-Übernahme allein erzeugt weder Attempt noch Send-Erlaubnis.

## 10. Ownership / Lease Requirement

Ja, eine Delivery-spezifische Execution Lease und Owner-Fencing sind nötig. `sending` kann heute dauerhaft stranden; `claim_token` hat weder Ablauf noch Owner-Lebensdauer. Benötigt werden semantisch:

- `execution_owner_id uuid`,
- `execution_lease_expires_at timestamptz`,
- `execution_attempt_count integer` nur für Worker-/Lease-Observability,
- `last_execution_started_at timestamptz`,
- eine explizite persistente Phase beziehungsweise `dispatch_started_at timestamptz`,
- weiterhin getrennt `attempt_count` als Provider-Attemptzahl.

Jede mutierende Operation prüft Command, Owner und nicht abgelaufene Lease. Completion ist zusätzlich an Attempt/Dispatch-Token zu fences. Heartbeat ist für MVP unnötig: Lease 60 Sekunden, Graph Timeout 15 Sekunden und Routebudget lassen ausreichend Marge. Eine aktive Lease ergibt `busy`. Eine expired Lease vor Dispatch darf reclaimed werden; nach Dispatch wird sie atomar zu ambiguous terminalisiert, nicht reclaimed und gesendet.

## 11. Provider Message ID Authority

Die Provider-ID entsteht erst aus der erfolgreichen Graph-Response (`messages[0].id`). TypeScript hält sie kurzzeitig in `WhatsAppSendResult`. `complete_whatsapp_outbound_delivery(...)` persistiert sie in derselben DB-Transaktion in `transport_message_bindings` und referenziert dieses Binding aus `transport_delivery_commands.provider_message_binding_id`; anschließend ist `accepted_by_provider` gesetzt und der Attempt beendet.

`transport_message_bindings` ist die Authority. Sie schützt jede interne Message durch `internal_message_id UNIQUE` und jede externe Identity durch `UNIQUE(provider, sender_scope, provider_message_id)`. Completion ist replay-sicher, wenn dieselbe Provider-ID bereits an dieselbe interne Message gebunden ist, und wirft bei Konflikt. Danach liefert Claim `replay` und sendet nicht.

Status-Webhooks enthalten im aktuellen validierten Contract `sender_scope`, Provider Message ID, Status und Zeitpunkt, aber keine interne `outbound_message_id`. Reconciliation sucht zuerst das vorhandene Binding. Ohne Binding wird nur ein `matched=false` Event gespeichert und `unmatched` zurückgegeben. `sent`, `delivered`, `read` oder `failed` können daher eine ungebundene lokale Delivery **nicht zuverlässig rekonstruieren**. Telefonnummer/Empfänger oder zeitliche Nähe sind keine sichere Korrelation.

## 12. Crash Matrix

| Crash Point | Persistierter lokaler Zustand | Provider-Side-Effect | Sichere automatische Aktion | Duplicate-Risiko | Erforderliche Authority |
|---|---|---|---|---|---|
| A vor Claim/Enqueue | heute nur Outbound Message; Ziel `pending` Command | sicher keiner | bounded Discovery/Enqueue, dann acquire | keines | atomare Command-Erzeugung oder message-to-command discovery |
| B nach Acquire, vor Revalidation | `sending/prepared`, Owner+Lease, kein Dispatch-Marker | sicher keiner | aktive Lease `busy`; nach Ablauf reclaim/revalidate | keines | Lease + Phase + fencing |
| C nach Revalidation, vor Graph Call | vor Dispatch-RPC sicher pre-send; nach Dispatch-Marker konservativ unbekannt | abhängig vom Marker | pre-dispatch reclaim; dispatch-marked ambiguous | bei Blind-Retry nach Marker | atomare Dispatch-Autorisierung |
| D während TCP/HTTP Request | `sending/dispatch_started`, offener Attempt | unbekannt | nach Lease `delivery_ambiguous`, kein Send | hoch bei Retry | phase-aware expiry transition |
| E Provider verarbeitet, Client erhält keine Response | `sending/dispatch_started` oder kontrolliert `delivery_ambiguous` | möglich/ja | ambiguous/manual, kein Send | hoch bei Retry | ambiguous completion/recovery |
| F Success Response, Crash vor ID-Persistenz | `sending/dispatch_started`; Provider-ID nur verloren im RAM | ja | ambiguous/manual, kein Send | sicher verhindert durch No-Retry | fenced expiry → ambiguous |
| G Provider-ID persistiert, Crash vor „terminaler Completion“ | im heutigen RPC unmöglich: Binding und `accepted_by_provider` sind eine Transaktion; bei DB-Commit unbekannt gilt F | ja | nach sichtbarem Commit replay; sonst ambiguous | keines bei No-Retry | atomare Completion + binding constraints |
| H Completion erfolgreich, danach Crash | Binding + `accepted_by_provider`, Attempt finished | ja | `already_terminal`, kein Send | keines | replay-safe Claim/Runner |

## 13. Acceptance-Before-Binding Race

Der aktuelle Request Body enthält keinen client-generierten Idempotency Key; der Adapter erwartet ausschließlich die von Meta zurückgegebene `messages[0].id`. Im Repository ist weder eine Meta-Funktion zum idempotenten Wiederholen dieses Message-Sends noch eine Lookup-Authority anhand einer Client-ID belegt. Eine solche Funktion wird deshalb **nicht** angenommen und ist nicht autoritativ für diesen Contract.

KlimaGuy verhindert das Duplikat durch das sichere, konservative Verfahren:

1. vor Dispatch wird ein persistenter Attempt samt Dispatch-Marker atomar autorisiert;
2. ab diesem Marker wird angenommen, dass Provider Acceptance möglich ist;
3. fehlt nach Lease-Ablauf das atomare Provider-ID-Binding, transitioniert Recovery fenced zu `delivery_ambiguous`;
4. `delivery_ambiguous` ist für automatische Sends terminal und verlangt manuelle Klärung;
5. erst ein expliziter menschlicher, auditierter neuer Send-Entschluss darf gegebenenfalls eine neue Nachricht erzeugen — niemals ein Retry desselben unklaren Attempts.

Diese Strategie garantiert keine automatische Auflösung und kann eine tatsächlich ungesendete Nachricht manuell zurücklassen. Sie garantiert aber, dass Recovery aus dem ununterscheidbaren Zustand nicht blind dupliziert.

### Strategiebewertung

| Strategie | Urteil | Begründung / Produktwirkung |
|---|---|---|
| A `sending` nach Lease automatisch senden | unsicher | Pre-call und accepted-before-binding sind heute gleich; kann doppelt senden. |
| B expired `sending` immer ambiguous/manual | sicher, aber grob | verhindert Duplikate, erzeugt auch bei frühem Crash manuelle Fälle. Phasenmarker reduziert diese. |
| C pre-send Attempt Record + post-send Binding | notwendig, allein nicht ausreichend | schafft Audit/Fencing; der unvermeidbare Spalt nach Marker wird konservativ ambiguous. |
| D Provider-Idempotency-Key | nicht verfügbar/nicht autoritativ | aktueller Code und belegter Contract besitzen keinen; darf später nur nach offizieller Meta-Verifikation ergänzen. |
| E spätere Status-Webhooks | keine Recovery-Lösung ohne Binding | Webhook trägt Provider-ID, aber keine sichere interne ID; bleibt unmatched. |
| F kontrollierter Timeout → ambiguous | sicher für kontrollierte Fehler | existiert bereits; Crash-Recovery muss dieselbe Semantik persistent nachholen. |
| G nie Retry nach unbestätigtem Side Effect | verbindlich und sicher | mögliche Nichtzustellung verlangt Human Handling statt probabilistischer Duplikatvermeidung. |

## 14. Ambiguous Delivery Contract

`delivery_ambiguous` bedeutet verbindlich: **Ein externer Side Effect kann stattgefunden haben, lokale Authority kann dessen Erfolg oder sichere Nichtausführung aber nicht beweisen.** `retry_classification='requires_reconciliation'`, `next_attempt_at=null`, kein Claim/Auto-Retry, keine automatische Terminal-Failure-Umschreibung.

Der heutige Status deckt kontrollierte Fetch-Exceptions und Timeouts korrekt ab. Die Lücke ist, dass ein harter Prozessabbruch Completion umgeht und `sending` hinterlässt. Die Recovery-Authority muss expired `dispatch_started` fenced in denselben persistenten Zustand überführen und den offenen Attempt als ambiguous beenden. Manuelle Aktionen müssen auditierbar sein und dürfen nicht den alten Attempt erneut aktivieren.

## 15. Auto-Retry Safety Rule

> **AUTO RETRY DARF NUR STATTFINDEN, WENN PERSISTENTE AUTHORITY SICHER BEWEIST, DASS DER VORHERIGE PROVIDER SIDE EFFECT NICHT ERFOLGT IST.**

Eine HTTP-Ablehnung vor Acceptance kann dieser Beweis sein. Ein Timeout, Connection Reset, Prozessabbruch nach Dispatch-Autorisierung, verlorene Success Response oder Completion-Fehler ist kein Beweis. Lease-Ablauf, fehlendes Binding, fehlender Webhook und Wahrscheinlichkeit sind ebenfalls kein Beweis.

## 16. Recovery Discovery Contract

Eine service-role-only RPC entdeckt höchstens **5** Zeilen, stabil nach `(due_at, created_at, id)`, ohne Pagination/Backlog-Drain im selben Tick. Ergebnis enthält ausschließlich `delivery_command_id` und eine geschlossene Kategorie; keine Message-ID ist für den Scheduler nötig.

| Zustand | Discovery / Aktion |
|---|---|
| `pending/new` und due | `ready`; runner acquire |
| `failed/retryable`, `next_attempt_at <= now`, Attempts < 3 | `ready`; runner acquire |
| `failed/retryable`, noch nicht due | nicht entdecken; direkter Runner ergibt `not_due` |
| `sending/prepared`, aktive Lease | nicht entdecken; direkter Runner ergibt `busy` |
| `sending/prepared`, expired, nachweislich pre-dispatch | `reclaimable_pre_dispatch`; fenced reclaim |
| `sending/dispatch_started`, expired | `ambiguous_expired`; fenced ambiguous transition, **kein Send** |
| `delivery_ambiguous` | nicht für automatische Arbeit entdecken; separater Admin-/Manual-Workflow |
| terminal `failed`, `blocked`, Attempts erschöpft | nicht entdecken |
| `accepted_by_provider`, `delivered`, `read` | nicht entdecken |

Falls die stärkere atomare Command-Erzeugung nicht gewählt wird, braucht es zusätzlich eine bounded service-role Enqueue-Discovery über auslieferbare outbound Messages ohne Command. Sie darf nur IDs liefern. Bevorzugt wird diese zweite Discovery durch atomare Command-Erzeugung vermieden.

Geschlossener Runner-Result-Contract:

- `sent` (Binding + accepted committed),
- `already_terminal`,
- `busy`,
- `retry_scheduled`,
- `terminal_failed`,
- `ambiguous`,
- `ownership_lost`,
- `not_due`,
- `blocked`.

Jedes Result darf optional nur `delivery_command_id` für interne Komposition tragen. Route Responses enthalten ausschließlich aggregierte Counts. Unbekannte DB-/Providerfehler werden nicht als retryable improvisiert; vor möglichem Dispatch `terminal_failed`, danach `ambiguous` beziehungsweise `ownership_lost` mit anschließender Recovery-Klassifikation.

## 17. Immediate Delivery Contract

Immediate Delivery wird für MVP nach einem neuen `completed`-Cycle mit nicht-null `outbound_message_id` **awaited** über den separaten `RecoverableWhatsAppDeliveryRunner` ausgeführt. Kein Fire-and-forget. Replay/andere Cycle Results starten keinen zweiten unmittelbaren Send; der persistente Command macht Wiederholung des Triggers idempotent.

Dies ist nur mit explizitem Webhook-Runtime-Contract zulässig: Node Runtime, `maxDuration=60`, Graph Timeout höchstens 15 Sekunden und kein Start eines Delivery Attempts, wenn für Revalidation + 15 Sekunden Request + Completion weniger als 20 Sekunden Restbudget verbleiben. Da der Conversation Cycle bereits awaited ist, darf bei zu wenig Restbudget **kein** Send beginnen; `pending` bleibt für Recovery. Der WhatsApp-Inbound-HTTP-Vertrag bleibt nach erfolgreicher Persistenz 200, unabhängig vom geschlossenen Delivery Result. Keine PII, Providerfehler oder interne IDs werden an Meta exponiert.

Diese Entscheidung minimiert normale Antwortlatenz, ohne den Webhook durch Fire-and-forget unsicher zu machen. Der Recovery Scheduler ist die dauerhafte Auffangauthority für nicht gestartete/abgebrochene sichere Fälle; ambiguous Fälle werden nicht erneut gesendet.

## 18. Delivery Recovery Scheduler

Die technische Infrastruktur wird analog, aber fachlich separat verwendet:

`Supabase pg_cron → Vault → pg_net → POST /api/internal/whatsapp-deliveries/recovery → Vercel Node`

Frequenz: **jede Minute** (`* * * * *`). Das reduziert Latenz für Commands, deren Immediate Start wegen Budget ausblieb. `next_attempt_at` bleibt alleinige Backoff-Authority; der Minutentakt macht einen Retry nicht vorzeitig eligible. Kein gemeinsamer Job, keine gemeinsame Route und keine gemeinsame Discovery mit Conversation Cycles.

## 19. Batch / Concurrency / Runtime

- feste Batch Size **5**, weil bis zu fünf sequenzielle Graph Calls à 15 Sekunden möglich wären und ein externer Call deutlich teurer als ein deterministischer Cycle ist;
- **Concurrency 1**, awaited Schleife, kein `Promise.all`, kein Worker Pool;
- Node Runtime, `maxDuration=60`, monotones Gesamtbudget und **35 Sekunden Startbudget**;
- vor jedem Command muss zusätzlich das 20-Sekunden-Minimum gelten; ein laufender Attempt wird nicht künstlich abgebrochen;
- Discovery genau einmal je Request, keine Pagination oder zweite Schleife; Rest übernimmt der nächste Minutentick.

Batch 5 begrenzt Authority und Response, obwohl das Zeitbudget real meist nur zwei Starts erlaubt. Per-Command-Exceptions werden isoliert; sie dürfen keine Texte, Telefonnummern, Provider-Payloads oder rohen Fehler loggen.

## 20. Authorization

Die separate Route benötigt ein separates serverseitiges Secret: `WHATSAPP_DELIVERY_RECOVERY_SECRET`. Es wird kein Wert erzeugt. Vercel Environment und Supabase Vault halten denselben extern provisionierten Wert.

Contract wie AP-16-06-03: ausschließlich exakt ein `Authorization: Bearer <token>`, fail closed bei fehlender/leerer Konfiguration (503), malformed/mehrdeutig/falsch (401), konstanter Vergleich der SHA-256-Digests mit `timingSafeEqual`, Auth vor DB-Client/Discovery/Runner, kein GET, keine IDs/Batchparameter in Query, Body oder Cookies. Responses enthalten nur feste Fehler oder aggregierte Result-Counts.

## 21. Security

Alle neuen DB-Authorities sind künftig `security definer`, besitzen festen `search_path=public,pg_temp`, werden von `public`, `anon` und `authenticated` revoked und ausschließlich `service_role` granted. RLS bleibt für alle Delivery-Tabellen aktiv. Browser erhalten keine Discovery-, Acquire-, Dispatch-, Completion- oder Manual-Recovery-Capability.

Discovery, Route und Scheduler exponieren weder Customer-/Rendered-Text noch Telefonnummer, Destination, Provider-Payload, Provider-ID oder Secrets. Nur die server-only Delivery Engine lädt Text und Transportidentität nach erfolgreichem Acquire und unmittelbar für Revalidation/Send. Personenbezogene Daten und rohe Providerfehler werden nicht geloggt. Audit-Metadaten bleiben auf interne IDs, Attempt-Nummer und geschlossene Codes begrenzt.

## 22. Required DB Authorities

Noch zu implementieren sind:

1. Spalten `execution_owner_id`, `execution_lease_expires_at`, `execution_attempt_count`, `last_execution_started_at`, `dispatch_started_at` (oder gleichwertige explizite Phase), `next_attempt_at`; bei Bedarf ein aktueller `dispatch_token`/Attempt-FK.
2. Constraints für Status/Owner/Lease-Konsistenz, Dispatch nur mit aktivem Owner, `next_attempt_at` nur bei retryable failed, kein Provider-Binding ohne accepted-or-later, Attemptlimit 3 und Eindeutigkeit des aktuellen Attempts.
3. Idempotente Command-Erzeugung aus der autoritativen Outbound-ID, bevorzugt im atomaren Cycle Success Commit.
4. Bounded `discover_recoverable_whatsapp_deliveries(result_limit)` mit maximal 5 und nur inhaltsarmen Kategorien.
5. Fenced `acquire_whatsapp_delivery_execution(...)` für pending/due retry/reclaimable pre-dispatch mit geschlossenem Ergebnis (`acquired`, `busy`, `not_due`, `already_terminal`, `ambiguous`).
6. Fenced Revalidation plus atomare `authorize_whatsapp_delivery_dispatch(...)`, die erst dort Provider-`attempt_count` erhöht und Attempt anlegt.
7. Fenced Completion, die Erfolg + Binding oder Failure + Classification + `next_attempt_at` atomar schreibt.
8. Fenced Expiry-Authority: pre-dispatch freigeben/reclaimen, post-dispatch zu `delivery_ambiguous` abschließen.
9. Optional eine explizite, auditierte Manual-Resolution-Authority; sie darf nie still denselben ambiguous Attempt resend-en.

Historische Migrationen werden nicht verändert. Die heutige `claim_whatsapp_outbound_delivery(...)` muss durch diese geschlossenen Authorities ersetzt oder auf deren Semantik reduziert werden; parallele Authority ist verboten.

## 23. Outbound ID Handoff

Verbindliche Kette:

`atomic cycle commit` → persistierte `conversation_cycle_commands.outbound_message_id` / Runner-Success-Result → `outbound_message_id` an server-only Delivery Runner → idempotenter, derselben internen Message zugeordneter Delivery Command.

Nur die UUID wird transportiert. Kein Text, keine Conversation-Heuristik und keine neue Domain-Payload. Bei `null`, Human Review, Failure, Busy/Stale/Ownership Lost erfolgt kein Immediate Delivery Call. Recovery arbeitet danach auf `delivery_command_id`, nicht erneut auf Cycle-Ausführung.

## 24. Minimal Implementation Packages

1. **AP-16-06-04B — Delivery Identity & Retry Authority:** Runner-Handoff der persistierten Outbound-ID; atomare/idempotente Command-Erzeugung; geschlossene Failure-/Eligibility-Matrix; `next_attempt_at`; Attemptlimit und Config-/Terminal-Sperren.
2. **AP-16-06-04C — Delivery Lease, Fencing & Recovery Discovery:** Owner/Lease, pre-dispatch vs dispatch-started, fenced Acquire/Dispatch/Expiry/Completion und bounded Discovery.
3. **AP-16-06-04D — Recoverable WhatsApp Delivery Runner:** eigene server-only Orchestration, geschlossene Resultate, bestehender validierter Graph Adapter, Crash-/Ambiguous-Verhalten; keine Vermischung mit Cycle Runner.
4. **AP-16-06-04E — Productive Delivery Trigger & Scheduler:** awaited budget-gated Immediate Trigger, separate authentisierte Route, 1-Minuten-Cron/Vault/pg_net, Batch 5, Concurrency 1 und Deployment-Contract.

Die Reihenfolge ist zwingend; insbesondere darf E nicht vor B–D produktiv senden.

## 25. Explicitly Not Implemented

Dieses Audit implementiert keine Produktlogik, Migration, RPC, Route, Scheduler-Konfiguration, Runner- oder Webhook-Änderung, Graph-API-Änderung, Retry-Ausführung, neue Provider-Abfrage, automatische Manual Resolution, OpenAI-/LLM-/Inference-Integration, Replanning, Re-Rendering, Preisberechnung oder Angebotsfreigabe. Es wurde keine Nachricht gesendet und kein Secret erzeugt.

**AUDIT RESULT: READY**
