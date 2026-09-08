# AP-16-06-06D-1A — AI Cycle Attempt, No-Claim Commit and Technical Escalation Authority Audit

## 1. Auftrag, Baseline und Ergebnis

Dieser **reine Authority-Audit** untersucht genau die vier durch AP-16-06-06D-1 belegten technischen Lücken. Er implementiert weder Migration noch Runtime, aktiviert keine AI, ruft keinen Provider auf und ändert weder Environment noch Planner, Renderer, First Contact, WhatsApp, Delivery, Pricing, Offer, Media oder Vision.

- Repository-Baseline: `50cbd7bcc7ff70f53e386fc5371e5d515e7f7f5c` (Merge von AP-16-06-06D-1 in `main`)
- Audit-Branch: `codex/ap16-06-06d-1a-ai-cycle-authority-audit`
- Four Gaps Audited: **4/4**
- Product Decisions Remaining: **keine**; die sechs Entscheidungen aus 06D-1 bleiben bindend.
- **RESULT: READY**

READY bedeutet hier ausschließlich: Die kleinste korrekte Authority-Erweiterung für ein separates Implementierungspaket ist vollständig bestimmbar. Es ist **keine** Freigabe zur produktiven OpenAI-Composition.

## 2. Vollständig gelesene verbindliche Authority

1. `docs/audits/AP-16-06-06A-provider-neutral-ai-boundary-readiness-audit.md`
2. `docs/implementation/AP-16-06-06B-provider-neutral-ai-boundary.md`
3. `docs/implementation/AP-16-06-06C-openai-server-adapter.md`
4. `docs/audits/AP-16-06-06D-0-productive-ai-activation-wiring-audit.md`
5. `docs/audits/AP-16-06-06D-1-product-decision-authority-completion.md`

Die Tatsachenquelle für bestehende Persistenz ist insbesondere `202608230005_persistent_conversation_runtime.sql`, `202608230006_persistent_live_conversation_cycle.sql`, `202609010001_planner_snapshot_persistence.sql`, `202609010002_cycle_context_read_authority.sql`, `202609020001_customer_answer_knowledge_apply.sql`, `202609020002_atomic_cycle_commit_failure_authority.sql` und die aktuell überschreibende Migration `202609020003_recoverable_conversation_cycle_runner.sql`. Servicequellen sind `persistent-conversation-cycle-service.ts`, `persistent-cycle-context-read.ts`, `persistent-cycle-commit.ts`, `persistent-cycle-data-source.ts`, `recoverable-cycle-runner.ts` und `productive-cycle-runtime.ts`.

Bindend bleiben: `no_match` und `ambiguous` sind erfolgreiche claimlose Ausgänge ohne Retry oder allein dadurch ausgelöstes Review; maximal drei AI Calls gelten je Kundenantwort; Recovery ist Retry Owner; `configuration_failure` eskaliert sofort; permanente Fehler werden nie `no_match`; das Gate bleibt `AI_CUSTOMER_ANSWER_CLASSIFICATION_ENABLED`, Default `false`.

## 3. Ist-Authority: persistente Strukturen

### 3.1 `public.conversation_runtime_states`

Relevante Spalten sind `conversation_id` (PK), `project_id`, `revision`, `knowledge_state_version`, `runtime_status`, `active_pending_interaction_id`, `active_evidence_request_id`, Zeitstempel. Status: `idle`, `awaiting_customer_answer`, `awaiting_evidence`, `intermediate_break`, `human_review`, `collection_stopped`. Checks koppeln `awaiting_customer_answer` genau an eine aktive Pending Interaction und verhindern gleichzeitig aktive Text-/Evidence-Bindings. Die deferrable FKs zeigen auf Pending/Evidence.

Schreibschutz: RLS ist aktiv; Browserrollen besitzen nur kontrolliertes Lesen. `runtime_header_guard`/`guard_runtime_identity()` lehnt Update/Delete ohne transaktionslokales `app.runtime_authority_mutation='allowed'` ab. Schreibende Security-Definer-RPCs setzen dieses Flag. `conversation_runtime_updated` pflegt `updated_at`.

### 3.2 `public.conversation_pending_interactions`

Relevante Spalten: `id`, Conversation/Project/Decision-/Entity-Bindings, `information_key`, Template/Locale/`answer_type`, `expected_knowledge_state_version`, `runtime_revision`, `status`, `answered_by_message_id`, Statuszeitpunkte sowie später ergänzte `prompt_message_id` und `snapshot_id`. Status: `pending`, `answered`, `superseded`, `cancelled`; ein partieller Unique Index erlaubt höchstens eine `pending` Interaction je Conversation.

`pending_interaction_guard` macht alle Identitäts-/Semantikfelder immutable und verlangt die Runtime-Mutation-Authority. `pending_message_binding` verifiziert, dass die Antwortmessage zur Conversation gehört. Statuschecks erzwingen passende Message-/Zeitfelder. Der normale Commit und die Review-RPC dürfen die beantwortete Zeile schreiben.

### 3.3 `public.conversation_interaction_snapshots`

Die immutable Snapshot-Authority aus `202609010001_planner_snapshot_persistence.sql` bindet `id`, `pending_interaction_id`, Conversation/Project, Runtime-/Knowledge-Version, Outbound Message/Sequence, `snapshot_schema_version`, `selected_action` und `rendered_interaction`. Sie enthält keinen Customerinput oder AI-/Provideroutput. `planner_snapshot_immutable` verhindert Update/Delete; RLS/Revokes verhindern Clientwrites. Der Atomic Commit erzeugt Snapshot, Outbound Message und nächste Pending Interaction gemeinsam.

### 3.4 Knowledge State und Version

`public.project_knowledge_states` besitzt projektweit `current_version`; Claims/Evidence/Transitions sind separate persistente Authority. Der Runtimeheader spiegelt `knowledge_state_version`. `public.apply_customer_answer_knowledge_transition(uuid,jsonb)` sperrt Command und Knowledge State, prüft Command-, Proposal-, Transition-, Apply- und Expected-Version-Bindings und schreibt atomar Claims/Evidence/Transition; eine wirkliche Änderung erhöht die Version, ein autorisierter fachlicher No-Change kann sie beibehalten. RLS, Security-Definer-RPC, append-only/identity guards und CAS schützen die Authority.

Claimless AI success ist **keine Knowledge Transition**. Deshalb darf dafür weder ein vorhandener fachlich anders bedeutender No-Change-Typ noch ein Fake-Claim erzeugt werden.

### 3.5 `public.conversation_cycle_commands`

Die tatsächliche Cycle-Command-Tabelle (nicht `conversation_runtime_commands`) ist die richtige Kundenantwort-Authority. Relevante Spalten:

- stabile Bindung: `id`, `conversation_id`, `project_id`, `source_message_id`, `prompt_message_id`, `pending_interaction_id`, `command_type`, `idempotency_key`;
- CAS: `expected_conversation_revision`, `expected_runtime_revision`, `expected_knowledge_version`;
- reservierte IDs/Domainzeit: `execution_at`, Correlation-/Interpretation-/Transition-/Apply-/Assessment-/Planner-/Event-/Next-Generation-IDs;
- Ergebnis: `status`, `result_code`, Resultversionen, `outbound_message_id`, `commit_payload_hash`, `completed_at`, `failed_at`;
- Ausführung: `execution_owner_id`, `execution_lease_expires_at`, `execution_attempt_count`, `last_execution_started_at`.

Statusmaschine: `pending -> processing -> completed | failed | stale | human_review_required`; historisch darf `failed -> processing` erneut geclaimt werden. Terminal sind `completed`, `stale`, `human_review_required`; `failed` ist gegenwärtig nicht discoverable. Unique Constraints sichern `(conversation_id,idempotency_key)`, genau einen Customer-Answer-Command pro `source_message_id` und höchstens einen `processing` Command je Conversation.

`guard_cycle_command_history()` macht Identitäten, erwartete Versionen, reservierte IDs, Domainzeit und einmal gesetzten Payloadhash immutable und sperrt terminale Commands vollständig. Tabellenrechte sind für `public`, `anon`, `authenticated` entzogen; die RPCs sind nur `service_role` gewährt. `execution_attempt_count` zählt Acquisitions und bleibt ausdrücklich reine Observability — **keine AI-Attempt-Authority**.

### 3.6 `public.conversation_runtime_commands`

Diese ältere, separate Runtime-CAS-Historie enthält `id`, `conversation_id`, `command_type`, `idempotency_key`, `expected_revision`, `result_revision`, `result_status`, `actor_id`, `created_at`. `runtime_commands_append_only` verhindert Update/Delete; RLS/Revokes verhindern Clientmutation. Sie repräsentiert geschlossene Runtime-Kommandos, aber weder den langlebigen Customer-Message-Cycle, dessen Lease/Owner noch dessen Recovery. Sie ist deshalb kein geeigneter AI-Attempt-Speicher.

## 4. Vollständiges RPC-/Funktionsinventar der relevanten Pfade

| Authority | Exakter SQL-Name und Pfad | Locks/Checks, Schreiber und Idempotenz |
|---|---|---|
| Initialer Claim (durch Recoverable Runner ersetzt) | `public.claim_customer_message_cycle(uuid)`, `supabase/migrations/202609010002_cycle_context_read_authority.sql` | Conversation, Runtime, Pending und Knowledge werden geprüft/gesperrt; `source_message_id`/Idempotency unique; terminaler Replay. Nur `service_role`. |
| Acquire/Lease | `public.acquire_customer_message_cycle_execution(uuid,uuid,integer)`, `supabase/migrations/202609020003_recoverable_conversation_cycle_runner.sql` | Command wird `FOR UPDATE` gelesen; aktive fremde Lease ergibt `busy`; setzt Owner, 30–900-s-Lease, erhöht `execution_attempt_count`. Terminale Ergebnisse werden replayed. Nur `service_role`. |
| Context Read | `public.get_customer_message_cycle_context(uuid)`, `supabase/migrations/202609010002_cycle_context_read_authority.sql`; Mapper `loadCustomerMessageCycleAuthority(...)`, `lib/actions/persistent-cycle-context-read.ts` | Nur `processing`; Source-/Prompt-/Pending-/Snapshotbindungen sowie Runtime-/Knowledge-Version werden erneut geprüft. Read mutiert nicht. |
| Normaler Commit | `public.commit_customer_message_cycle(uuid,jsonb)`, finale Fassung in `202609020003_recoverable_conversation_cycle_runner.sql`; Service `commitCustomerMessageCycle(...)` in `lib/server/conversation/persistent-cycle-commit.ts` | Lockfolge Conversation → Runtime → Knowledge → Pending → Command, dann Komponenten/Messages; Owner und nicht abgelaufene Lease; Runtime-/Knowledge-CAS; aktive Pending-/Prompt-/Snapshotbindung; stabile IDs; Payloadhash-Replay. Wendet derzeit zwingend Knowledge Transition an und commitet Pending, Runtime, Collection/Retry/Effort/Evidence, Events, Planner Snapshot, Outbound und Command in **einer DB-Transaktion**. |
| Terminaler Cyclefehler | `public.fail_customer_message_cycle(uuid,text,uuid)`, finale Fassung in `202609020003_recoverable_conversation_cycle_runner.sql`; `failCustomerMessage(...)` in `persistent-cycle-commit.ts` | Command `FOR UPDATE`; Owner/Lease; Codes nur `normalization_failed`, `cycle_failed`, `persistence_failed`; setzt `failed`, `failed_at`, löscht Lease. Kein Knowledge-/Runtimecommit. Nicht idempotent replayend. |
| Recovery Discovery | `public.discover_recoverable_conversation_cycles(integer)`, `202609020003_recoverable_conversation_cycle_runner.sql`; `discoverRecoverableConversationCycles(...)`, `lib/server/conversation/recoverable-cycle-runner.ts` | Nur `status='processing'` mit null/abgelaufener Lease, sortiert nach Ablauf/Start/Creation. Kein Lock/Claim; konkurrierende Finder werden erst beim Acquire gefenct. |
| Human Review Completion | `public.complete_customer_message_human_review(uuid,jsonb)`, finale Fassung in `202609020003_recoverable_conversation_cycle_runner.sql`; `completeCustomerMessageWithHumanReview(...)`, `persistent-cycle-commit.ts` | Owner/Lease, processing, Source/Pending, Runtimerevision, Knowledgeversion und Pendingstatus. Setzt Pending `answered`, Runtime revision+1/`human_review`, entfernt aktive Bindings, Command `human_review_required`, `result_code='human_review'`; keine Knowledgemutation und kein Outbound. Nur Service Role. |
| Orchestration | `processPersistentCustomerMessage(...)`, `lib/actions/persistent-conversation-cycle-service.ts` | Claim → Read → Normalization → Domain Cycle → Commit/Review/Fail. Normalization benutzt fachlich `attempt_number: 1`; dieser Wert ist kein AI Counter. |
| Recovery Owner | `runPersistentCustomerMessageCycle(...)`, `lib/server/conversation/recoverable-cycle-runner.ts` | Neue zufällige Owner-ID je Lauf, fünf Minuten Lease, ownership-lost fencing. Der productive Composition Root stellt nur den serverseitigen RPC-Client bereit. |

`complete_customer_message_human_review(...)` besitzt heute keinen Reasoninput, keinen Audit-Log-Eintrag und im TypeScript-Contract nur Domain-Cycle-Resultate mit `requires_human_review`. Genau diese schmale Service-Lücke muss geschlossen werden; die Review-Persistenz selbst ist bereits passend.

## 5. Auswahl der AI-Attempt-Authority

### 5.1 Variantenvergleich

| Variante | Semantik/Lifecycle | Concurrency/Recovery | Komplexität/Minimierung | Urteil |
|---|---|---|---|---|
| A. Spalte am `conversation_cycle_commands` | Genau ein Command je Customer Message; lebt über Recovery und endet mit deren Verarbeitung; kein Reset nötig | Command-Row-Lock, Owner/Lease/CAS vorhanden | Eine Integer-Spalte, kein Text/Providerdatum, providerneutral | **Gewählt** |
| B. Spalte an `conversation_pending_interactions` | Falsch: eine Interaction kann durch konkurrierende/spätere Messages beantwortet werden; Counter gehört zur Antwort, nicht zur Frage | Wechsel/Completion erschweren Reset und stale fencing | Vermischt Frage- und Request-Lifecycle | Verworfen |
| C. eigene AI-Attempt-Tabelle | Semantisch möglich, einzelne Reservationen auditierbar | Unique `(command,attempt)` wäre sicher | Unnötige Entität, RLS/Guards/Retention/Indexes; Requesthistory entgegen Datenminimierung | Verworfen |
| D. vorhandene Counter (`execution_attempt_count`, Retry-/Collection-Attempts, Runtime Commands) | Zählen Runner, fachliche Frageversuche oder abgeschlossene Runtimekommandos statt echte AI-Autorisierung | Keine korrekte Obergrenze je AI-eligible Kundenantwort | Keine Migration, aber sachlich falsch | Verworfen; Entscheidung wird nicht neu geöffnet |

### 5.2 Gewähltes Datenmodell

Eine neue Spalte auf `public.conversation_cycle_commands`:

```text
ai_inference_attempt_count integer NOT NULL DEFAULT 0
CHECK (ai_inference_attempt_count BETWEEN 0 AND 3)
```

Sie bedeutet: Anzahl **atomar reservierter, serverseitig autorisierter providerneutraler Inference-Request-Attempts** für genau die durch `source_message_id` gebundene Kundenantwort. Sie ist keine Request-/Response-History und speichert weder Prompt, Text, Resultat, Provider, Modell noch OpenAI-ID. Bestehende Zeilen werden mit `0` kompatibel backfilled. Kein Index ist nötig: jede Operation adressiert den PK/unique Messagecommand.

Deterministic bypass und Gate Off rufen die Reservation nie auf und zählen daher nicht. `matched`, `no_match`, `ambiguous` und jede Failure nach einem autorisierten Aufruf verbrauchen die vorher reservierte Nummer. Reservationen werden auch bei Crash oder stale Result niemals zurückgebucht.

## 6. Reservation vor dem externen Call

**JA: persistent reservieren und committen, bevor der externe Request begonnen wird.** Die Reservation ist eine kurze eigenständige DB-Transaktion. Danach endet die DB-Transaktion; externe Latenz liegt niemals innerhalb eines DB-Locks.

Exakter Folgeablauf:

1. Gate, Semantik, Binding, Registry/Allowlist und deterministic exact match werden lokal geprüft.
2. Nur wenn danach ein Provider Call wirklich erforderlich ist, ruft der serverseitige Cycle `reserve_customer_answer_ai_inference_attempt(...)` auf.
3. Die RPC sperrt/validiert und erhöht atomar von 0→1, 1→2 oder 2→3; ihr erfolgreicher Rückgabewert ist das einmalige lokale Recht, unmittelbar genau einen Request zu starten.
4. Erst nach erfolgreicher RPC-Antwort darf der Provideradapter aufgerufen werden.
5. Reservation 4 wird abgewiesen; der Service startet keinen Providerrequest und eskaliert bei einem noch verarbeitbaren Command in Review.

Damit gelten bei zwei Runnern höchstens drei erfolgreiche Reservationen. Crash direkt vor Providerkontakt kann ein Budget verbrauchen, obwohl kein Request ankommt; Crash während des Calls oder verlorene Antwort verbraucht ebenfalls das Budget. Das ist nötig, weil Zurückbuchen einen möglicherweise bereits empfangenen Request doppelt freigeben würde.

**External Exactly-Once Guaranteed: NEIN.** Ohne persistente providerseitige Idempotency-/Receipt-Authority kann lokal weder bewiesen werden, dass OpenAI einen Request tatsächlich empfangen hat, noch dass ein verlorenes Ergebnis nicht verarbeitet wurde. Garantiert wird die stärkste korrekte lokale Semantik: **Maximum Locally Authorized Attempts: 3**. Jede erfolgreiche Reservation autorisiert höchstens einen unmittelbar folgenden serverseitigen Adapteraufruf; Prozesscode und Tests müssen dieses Capability-artige Ergebnis linear konsumieren. Die DB kann allein nicht beweisen, dass fehlerhafter Servicecode dieselbe Reservation nicht zweimal nutzt; der einzige Caller bleibt die geschlossene serverseitige Runtime und der Adapter selbst hat `maxRetries: 0`.

## 7. Exakter Reservation-RPC-Contract

### `public.reserve_customer_answer_ai_inference_attempt(...)`

Inputs:

```sql
target_command_id uuid,
target_source_message_id uuid,
expected_runtime_revision integer,
expected_knowledge_version integer,
execution_owner_id uuid
```

Erfolg:

```json
{"success":true,"code":"reserved","command_id":"uuid","attempt_number":1}
```

Kontrollierte Fehler: `invalid_input`, `command_not_found`, `command_not_claimed`, `ownership_lost`, `stale_runtime_revision`, `stale_knowledge_version`, `interaction_not_current`, `attempts_exhausted`. Keine Provideroperation findet statt.

Lockfolge entspricht dem Commit: Command zunächst ungelockt nur zum Ermitteln der Bindings, dann Conversation → Runtime → Knowledge → Pending → Command `FOR UPDATE`. Die RPC verlangt `auth.role()='service_role'`, `command_type='customer_answer'`, `status='processing'`, gleiche Source Message, aktuellen Owner, `execution_lease_expires_at > statement_timestamp()`, unveränderte Command-/Runtime-/Knowledge-Versionen, die aktive `pending` Interaction samt Prompt/Snapshotbindung und Counter `< 3`. Das Update `count=count+1` und die Rückgabe geschehen in derselben Transaktion.

- Attempts 1/2/3: erfolgreich mit genau der neuen Nummer.
- Attempt 4: `attempts_exhausted`, keine Änderung.
- Stale/fremder Owner oder abgelaufene Lease: `ownership_lost`, keine Änderung.
- erledigter/fehlgeschlagener Command: `command_not_claimed`, keine Änderung.
- geänderte Runtime/Knowledge/Pending: spezifischer stale/current-Fehler, keine Änderung.

Eine erneute identische RPC-Anfrage ist bewusst **keine idempotente Reservation**: sie reserviert bei weiterhin gültigem Owner die nächste Nummer. Das ist die korrekte Countersemantik. Idempotenz entsteht nicht aus einem frei wiederverwendbaren Token; der Service darf die RPC nur unmittelbar vor je einem Call ausführen. Eine separate Reservation-ID wäre nur mit einer Attempt-Tabelle dauerhaft deduplizierbar und ist für die geforderte Obergrenze nicht nötig.

## 8. Recoverable AI Failure und Backoff

### 8.1 Gewählte Transition

`cycle_failed`/`fail_customer_message_cycle(...)` ist ungeeignet: `failed` ist terminal für Discovery. Ein neuer Commandstatus ist ebenfalls unnötig. `timeout` und `transient_provider_failure` bleiben als **`processing`** ohne fachlichen Commit; eine neue RPC

```sql
public.defer_customer_message_ai_retry(
  target_command_id uuid,
  target_source_message_id uuid,
  execution_owner_id uuid,
  failure_code text
) returns jsonb
```

akzeptiert ausschließlich `ai_timeout` oder `ai_transient_provider_failure`. Sie sperrt den Command, prüft Service Role, processing, Source, Owner und aktive Lease sowie `ai_inference_attempt_count BETWEEN 1 AND 2`, setzt `result_code=failure_code` und setzt `execution_lease_expires_at = statement_timestamp() + interval '1 minute'`; Owner bleibt als Fencing-Identität stehen. Knowledge, Runtime, Pending, Outbound, Delivery und `failed_at` bleiben unverändert. Rückgabe: `deferred`, `retry_at`, `attempt_count`, oder kontrollierter Fehler.

Die bestehende Recovery Discovery benötigt **keine semantische Erweiterung**: sie findet weiterhin processing Commands, sobald diese Lease abgelaufen ist. Ihre SQL-Definition muss im selben Migrationstext nicht geändert werden. Der Acquire-Code muss ebenfalls nicht geändert werden: ein fremder neuer Owner erhält vor Ablauf `busy` und kann danach übernehmen. Das bewusste Beibehalten des Owners ist wesentlich; `owner=NULL` würde der aktuellen Acquire-Prüfung erlauben, die zukünftige Lease zu umgehen.

**Recovery Discovery Change Required: NEIN.** **Backoff Authority:** die vorhandene DB-Lease, durch die Failure-RPC auf einen festen providerneutralen Mindestabstand von 60 Sekunden neu gesetzt. Das verhindert unmittelbare Wiederholung/Busy Loop auch dann, wenn die ursprüngliche fünfminütige Lease fast abgelaufen war. Keine Queue und keine Retry Engine wird eingeführt. Der Recovery Runner bleibt alleiniger Retry Owner.

Bei bereits verbrauchtem Attempt 3 darf `defer_customer_message_ai_retry` nicht verwendet werden. Der Service eskaliert stattdessen sofort. Bei Crash vor dieser Transition bleibt die normale Rest-Lease/Recovery wirksam; der reservierte Attempt bleibt gezählt. Recovery sieht den Counter erst bei der nächsten Reservation und kann bei 3 keinen vierten Call starten.

### 8.2 Permanente technische Fehler

`invalid_structured_output`, `refused`, `unsupported` und `permanent_provider_failure` werden providerneutral direkt als `ai_non_transient_failure` eskaliert. Das ist mit 06D-1 vereinbar, vermeidet sinnlose Wiederholung und ist enger als „spätestens nach drei“. Sie werden niemals auf claimless success gemappt und mutieren Knowledge nicht.

## 9. Attempt Exhaustion und technische Human-Review-Bridge

### 9.1 Servicefunktion

Die bestehende `completeCustomerMessageWithHumanReview(...)` sollte nicht mit einem gefälschten `ConversationCycleFailure` aufgerufen werden. Die kleinste typsichere Bridge ist ein neuer providerneutraler Wrapper im selben Modul:

```ts
completeCustomerMessageWithTechnicalHumanReview(
  source,
  {
    command_id,
    source_message_id,
    pending_interaction_id,
    expected_runtime_revision,
    expected_knowledge_version,
    reason:
      | "ai_configuration_failure"
      | "ai_attempts_exhausted"
      | "ai_non_transient_failure"
  },
  execution,
): Promise<PersistentCycleResult>
```

Sie validiert ausschließlich UUIDs, positive Versionen und die geschlossene Reason-Union und ruft **dieselbe** DB-RPC `complete_customer_message_human_review(...)`. Die bestehende Domain-Review-Funktion bleibt unverändert und beide Wrapper teilen den schmalen RPC-Parser. Keine neue Reviewpersistenz und kein Reviewer/Approval werden erzeugt.

### 9.2 Kleine Erweiterung der bestehenden DB-RPC

`review_payload` erhält optional `technical_reason`. Zulässig sind nur die drei obigen Kategorien oder `null` für bestehende Domainaufrufe. Runtime- und Commandtransition bleiben identisch. Bei technischer Eskalation setzt die RPC `result_code=technical_reason` statt des generischen `human_review`; terminaler Replay richtet sich weiterhin nach Commandstatus. Zusätzlich schreibt sie genau einen contentfreien `audit_log`-Eintrag:

- `entity_type='conversation_cycle_command'`, `entity_id=cmd.id`;
- `action='conversation_cycle_technical_human_review_requested'`;
- Metadata nur `command_id`, `conversation_id`, `project_id`, `reason`, `ai_attempt_count`, `runtime_revision_before`, `runtime_revision_after`, `knowledge_version` und Timestamp.

Keine Providerklasse, Error Message, Response, Prompt, Kundenmessage oder Secret wird gespeichert. Für normale Domainreviews ist kein neuer Auditdatensatz erforderlich. Die RPC validiert nun zusätzlich `expected_runtime_revision`/`expected_knowledge_version` aus dem technischen Payload; ihre Rowchecks bleiben authoritative.

### 9.3 Exhaustion

Nach dem dritten fehlgeschlagenen autorisierten Call ruft der Service `completeCustomerMessageWithTechnicalHumanReview(... reason:'ai_attempts_exhausted')` auf. Die DB-RPC sperrt in der Commit-Lockfolge, prüft Owner/Lease/CAS/Pending, markiert die beantwortete Pending Interaction mit der Source Message, erhöht Runtime Revision und setzt Runtime `human_review`, löscht aktive Bindings und terminalisiert den Command als `human_review_required` mit `result_code='ai_attempts_exhausted'`. Knowledgeversion bleibt exakt unverändert; es entstehen weder Outbound Message noch Delivery.

Recovery entdeckt danach den Command nicht (`status <> processing`), Acquire replayed terminal, und der Reservation-RPC verlangt processing sowie Counter `<3`. Ein vierter autorisierter Provider Call ist daher auf beiden Grenzen ausgeschlossen.

`configuration_failure` benutzt sofort dieselbe Bridge mit `ai_configuration_failure`, ohne Defer/normalen Retry. Wenn Konfigurationsvalidierung bereits vor einem externen Call scheitert, bleibt der Counter 0; wenn der Adapter die Failure erst nach einer Reservation liefert, bleibt er 1. Beides ist korrekt: nur serverseitig autorisierte Requestversuche zählen, und Configuration erhält null **normale Retries**. Permanente Fehler verwenden `ai_non_transient_failure`.

## 10. Claimless Success Authority

### 10.1 Varianten

| Variante | Bewertung |
|---|---|
| A. normalen Atomic Commit um zero-claim Outcome erweitern | **Gewählt:** behält exakt eine atomare Pending-/Runtime-/Planner-/Outbound-/Command-Grenze und alle stale checks. |
| B. separate Claimless-RPC | Dupliziert fast den gesamten großen Commit und riskiert Drift bei Planner Snapshot, Events und Runtimezuständen. |
| C. reiner Servicebranch mit vorhandener RPC | Unmöglich: heutige RPC und TS-Validierung verlangen Interpretation/Proposal/Apply. Separates Schreiben wäre nicht atomar. |
| D. vorhandenen No-Change-Typ missbrauchen | Fachlich falsch; `skip_recorded`, `assumption_*`, `duplicate_no_change` bedeuten etwas anderes. |

### 10.2 Exakter Commitvertrag

`commit_customer_message_cycle(...)` wird als eine RPC beibehalten, aber `commit_payload` wird eine geschlossene Union:

- bestehend: `knowledge_outcome='transition_applied'` plus unveränderte `normalized_answer`, `interpretation`, `proposal`, `apply_result`;
- neu: `knowledge_outcome='no_claim'`, ohne `interpretation`/`proposal`/`apply_result`, mit ansonsten derselben bereits berechneten Cycle-Generation (Collection, Retry, Effort, Evidence, Events, Cycle Status, Next Interaction).

Die TypeScript-Seite ergänzt `commitCustomerMessageCycleWithoutClaim(...)` als typsicheren Wrapper derselben RPC. Input: Command/Source/Pending, erwartete Runtime-/Knowledge-Version, `outcome: 'no_match'|'ambiguous'` nur in-memory, und eine providerneutrale `ClaimlessConversationCycleSuccess` mit unverändertem Knowledge State plus regulärem Planner-/Renderer-Ergebnis. Output und Failurecodes entsprechen `commitCustomerMessageCycle(...)`.

Im claimlosen SQL-Branch:

1. gelten dieselbe Lockfolge, Owner-/Lease-, Source-/Pending-/Prompt-/Snapshot-, Runtime- und Knowledge-CAS-Prüfung;
2. werden `proposal`, `apply_result` und der Aufruf von `apply_customer_answer_knowledge_transition(...)` strikt abgelehnt/übersprungen;
3. ist `resulting_version = cmd.expected_knowledge_version`; `project_knowledge_states.current_version` und Claims/Transitions bleiben unberührt;
4. werden beantwortete Pending Interaction, Collection/Retry/Effort/Evidence, zulässige Events, nächste Plannergeneration, Snapshot, Outbound und Runtime wie heute in derselben Transaktion geschrieben;
5. wird der Command `completed` und der Payloadhash schützt Replay/Conflict wie heute.

Das beantwortete Pending wird **immer** `answered`: die Message wurde korrekt an genau diese Frage gebunden und erfolgreich verarbeitet, auch wenn sie keinen Claim ergab. Offenlassen wäre falsche Bindingsemantik und könnte dieselbe Message endlos erneut inferieren. Der unveränderte Knowledge State lässt die Information fachlich missing. Danach berechnet der bestehende Planner aus diesem State und den regulär fortgeschriebenen Collection-/Retry-/Effort-Zuständen die nächste Aktion; er darf dieselbe oder eine andere Information wählen. Renderer bleibt unverändert. Die neue nächste Pending Interaction ist eine neue Identität/Revision und wird atomar mit ihrer Outbound Message erzeugt.

`no_match` und `ambiguous` verwenden exakt denselben persistenten `knowledge_outcome='no_claim'`. Ihre Unterscheidung ist nur für die laufende in-memory Steuerung nötig und wird weder in einer neuen Spalte noch in Events/Audit dauerhaft gespeichert. Runtime Correctness benötigt sie nicht; Datenminimierung gewinnt.

**Knowledge Mutation on Claimless Success: NEIN. Planner Changed: NEIN. Renderer Changed: NEIN.**

## 11. Atomicity, Idempotenz und stale results

### 11.1 Grenzen

- **Reservation:** eigene kurze Transaktion; Command/Authority validieren, Counter erhöhen, committen. Nicht zurückrollen, wenn der folgende externe Schritt scheitert.
- **Provider Request:** außerhalb jeder DB-Transaktion; nicht DB-idempotent und nicht exactly once beweisbar.
- **Result Commit:** bestehende atomare Committransaktion, mit neuer claimloser Union; Payloadhash macht identischen terminalen Replay idempotent und abweichenden Replay `duplicate_conflict`.
- **Failure Defer:** eigene kurze Transition ohne Businessmutation.
- **Review:** bestehende atomare Terminaltransition, providerneutral erweitert.

Jede Result-/Review-Transition verwendet die **vor dem Call geladenen** erwarteten IDs und Versionen. Sie darf nach dem Call keine aktuellen Werte nachladen und ersetzen. Owner-/Leaseverlust oder Revision-/Knowledge-/Pendingdrift verwirft das Resultat ohne Businesswirkung. Die verbrauchte Reservation bleibt verbraucht.

### 11.2 Konkurrenzmatrix

| Fall | Schutz und Ergebnis | Attempt / Folgeschritt |
|---|---|---|
| Zwei Runner reservieren | Aktive Lease weist fremden Owner ab; Command-Row-Lock serialisiert Updates. | Höchstens eine Reservation je tatsächlichem berechtigtem Lauf; Counter nie >3. |
| Lease läuft während Request aus/anderer Runner übernimmt | Result-Commit/Review prüfen ursprünglichen Owner plus aktive Lease. | Altes Result verworfen; Attempt bleibt verbraucht. Neuer Owner darf, falls Counter <3, neu reservieren. |
| Zweite Kundenmessage | Unique Command je Source Message; aktive Pendingbindung und Message-/Promptsequence. Conversation kann nur einen processing Command haben. | Nicht an alte Interaction bindbare Message wirkt nicht; alter Attempt bleibt. |
| Pending Interaction ändert sich | Runtime active ID, Pendingstatus/revision, Prompt und Snapshot werden geprüft. | Stales Result verworfen; weiterer Attempt nur nach gültiger Recoveryauthority, sonst Review/terminaler stale handling. |
| Knowledge wird korrigiert | Project Knowledge `FOR UPDATE`, Command expected version und Runtime mirror CAS. | Stales Result ohne Apply/Commit; Attempt bleibt. Kein erneuter Call unter künstlich aktualisiertem Context desselben Commands. |
| Runtime Revision steigt | `expected_runtime_revision` gegen Runtime/Pending. | Result verworfen; Attempt bleibt. |
| AI Result kommt stale zurück | Owner/Lease/CAS/Binding in Claim- oder Claimless-Commit. | Keine Knowledge-/Runtimewirkung; nur bereits persistierter Attempt. |
| Crash nach Reservation | Lease läuft ab; Discovery liefert processing Command; neuer Owner reacquired. | Verlorene Reservation bleibt; Attempt 2/3 möglich, bei 3 Review ohne Attempt 4. |
| Crash direkt vor Provider | Lokal nicht vom „Provider empfangen“ unterscheidbar. | Budget bleibt konservativ verbraucht. |
| Provider verarbeitet, Antwort geht verloren | Recovery kann mit neuer Reservation erneut inferieren. | Kein Exactly Once; dennoch maximal drei lokal autorisierte Requests und idempotenter Businesscommit. |

Ein stale Result allein löst nicht unkontrolliert Human Review aus. Wenn die aktuelle Businessauthority nicht mehr zum Command passt, greifen bestehende stale/current-Semantiken. Nur ein weiterhin gültiger Command mit ausgeschöpftem AI-Budget wird `ai_attempts_exhausted` eskaliert.

## 12. Exakter minimaler Migrationsscope des Folgepakets

**Migration Required: JA.** Eine neue, einzelne Migration unter `supabase/migrations/<timestamp>_ai_cycle_attempt_claimless_technical_escalation_authority.sql` muss ausschließlich:

1. `conversation_cycle_commands.ai_inference_attempt_count integer NOT NULL DEFAULT 0 CHECK BETWEEN 0 AND 3` hinzufügen; Default backfilled vorhandene Zeilen auf 0.
2. `guard_cycle_command_history()` ersetzen: der Counter darf nur durch geschlossene RPCs monoton steigen, nie sinken; terminale Commands bleiben immutable. Direkte Tabellenrechte bleiben entzogen.
3. `reserve_customer_answer_ai_inference_attempt(...)` exakt wie Abschnitt 7 erstellen.
4. `defer_customer_message_ai_retry(...)` exakt wie Abschnitt 8 erstellen.
5. `commit_customer_message_cycle(uuid,jsonb)` ersetzen und nur um den validierten `knowledge_outcome='no_claim'`-Branch erweitern; bestehender Transitionbranch bleibt kompatibel (`knowledge_outcome` darf für alte Caller bis zur gleichzeitig ausgelieferten Serviceänderung als `transition_applied` interpretiert werden, danach explizit).
6. `complete_customer_message_human_review(uuid,jsonb)` ersetzen und optionalen geschlossenen `technical_reason`, erwartete Versionen, reason-spezifischen `result_code` sowie den contentfreien technischen Auditdatensatz ergänzen; normale Payloads bleiben kompatibel.
7. Existing acquire/discovery/fail Funktionen, Statusenum und Tabellen nicht erweitern. Keine Recovery-Discovery-Änderung und kein neuer Status.
8. `REVOKE ALL ... FROM public,anon,authenticated` und `GRANT EXECUTE ... TO service_role` für beide neuen Funktionen setzen; vorhandene Grants der ersetzten Funktionen erneut explizit setzen.
9. SQL `COMMENT ON COLUMN/FUNCTION` dokumentiert: providerneutraler autorisierter Requestcounter, Maximum 3, keine Exactly-Once-Aussage, Defer nutzt Lease als Retry-not-before.

Indexes: **keine neuen**. Trigger: nur Guarddefinition ersetzen, kein neuer Trigger. RLS: bestehend, keine neue Policy. Backfill: Default 0 im `ADD COLUMN`; kein historischer AI Call existiert, da produktive Activation aus ist. Keine AI-History, Prompts, Texte, Provider-/OpenAI-Felder oder neue Tabelle.

## 13. Exakter Service-Layer-Scope des Folgepakets

### Must Change

1. `supabase/migrations/<timestamp>_ai_cycle_attempt_claimless_technical_escalation_authority.sql` (neu): gesamte DB-Authority aus Abschnitt 12.
2. `lib/actions/persistent-conversation-cycle-service.ts`
   - Typen/Portoperationen `reserveCustomerAnswerAiInferenceAttempt`, `deferCustomerMessageAiRetry`, `completeCustomerMessageWithTechnicalHumanReview`, `commitCustomerMessageCycleWithoutClaim` ergänzen.
   - Keine produktive AI-Verkabelung; nur providerneutrale Authoritycontracts.
   - Reservation Input: Command/Source/expected Versions; Output: reserved attempt 1–3 oder kontrollierter Fehler.
   - Defer Input: IDs plus `timeout|transient_provider_failure`; Output: deferred timestamp/count oder owner/stale/exhausted failure.
   - Technical review Input/Output gemäß Abschnitt 9.
   - Claimless Input/Output gemäß Abschnitt 10.
3. `lib/server/conversation/persistent-cycle-commit.ts`
   - RPC-Namensunion, strikte Zod-Schemas und die vier Serviceadapter ergänzen.
   - Failure Mapping darf `attempts_exhausted`, ownership und stale nicht verschlucken; keine Raw Errors/PII loggen.
4. `lib/server/conversation/persistent-cycle-data-source.ts`
   - neue Adapteroperationen mit vorhandenem `CycleExecutionContext.ownerId` komponieren; Owner nie vom Client entgegennehmen.
5. `test/ai-cycle-completion-authority-migration.test.ts` (neu): SQL-Struktur, Constraints, Locks, Grants, Guards, RPC-Branches und unveränderte Grenzen.
6. `test/ai-cycle-completion-authority-service.test.ts` (neu): Servicecontracts, Validation, Mapping, Reservation/Defer/Review/Claimless und Fehlersemantik mit RPC-Fakes.

Die Implementierungs-Authority stellt Funktionen bereit, ruft sie aber noch nicht aus dem produktiven AI-Pfad auf. `processPersistentCustomerMessage(...)` bleibt in diesem Paket ausführungslogisch unverändert.

### May Change (nur technisch erforderlich)

- `lib/actions/persistent-cycle-context-read.ts`: `ai_inference_attempt_count` in `CustomerMessageCycleAuthority` aufnehmen, falls Exhaustion vor Reservation angezeigt werden soll. Nicht erforderlich für Sicherheit, weil die Reservation-RPC authoritative ist.
- `lib/domain/conversation-cycle-orchestration.ts`: ausschließlich neue providerneutrale kontrollierte Fehlercodes/Resulttypen für die Servicegrenze; keine AI- oder Plannerlogik.
- `test/persistent-conversation-cycle-service.test.ts`, `test/persistent-cycle-data-source-composition.test.ts`, `test/atomic-cycle-commit-failure-authority.test.ts`, `test/recoverable-conversation-cycle-runner.test.ts`, `test/persistent-conversation-cycle-migration.test.ts`, `test/conversation-runtime-migration.test.ts`: Regressionen/Contractintegration.
- Dokumentation des separaten Implementierungspakets unter `docs/implementation/`.

### Must Not Change

- `lib/server/ai/providers/openai/**`, OpenAI Adapter Contract/Implementation, `maxRetries: 0`;
- `lib/domain/ai/**` und der providerneutrale 06B-Contract;
- Planner (`question-planner*`, Registry, Planner schemas), Renderer/Templates;
- First Contact einschließlich Bootstrap, Initial Prompt und Recovery;
- WhatsApp Webhook, Parser, Ingestion, Routes;
- WhatsApp Delivery und Delivery Recovery;
- Pricing/Calculation/Offer Authority;
- Media/OCR/Vision/Audio;
- Client UI, Auth oder Environment-/Vercel-/Secretdateien;
- produktive Composition in `lib/server/conversation/productive-cycle-runtime.ts` und produktive AI-Aktivierung;
- normale Claim-/Knowledge-Semantik in `apply_customer_answer_knowledge_transition(...)`.

Für das spätere AP-16-06-06D gelten dessen eigene, nach dieser Implementierung neu zu bestätigende Allowlist und Reihenfolge.

## 14. Exakter Testplan für das Implementierungspaket

### 14.1 Attempt Reservation

- gültige erste/zweite/dritte Reservation liefert 1/2/3; vierte liefert `attempts_exhausted` und verändert nichts;
- deterministic exact match und Gate Off rufen die Reservationoperation nicht auf (späterer 06D-Integrationstest) und Counter bleibt 0;
- `matched`, `no_match`, `ambiguous` und technische Failure nach Call behalten jeweils die Reservation;
- parallele Transaktionen serialisieren am Command und können niemals >3 committen;
- falscher/staler Owner, null/abgelaufene Lease, falsche Message/Pending, stale Runtime/Knowledge und terminaler Command werden ohne Increment abgewiesen;
- Clientrollen haben weder Tabellenupdate noch RPC-Execute; Service Role hat nur RPC-Execute.

### 14.2 Recoverable Failure

- `timeout` und `transient_provider_failure` verändern null Knowledge/Runtime/Pending/Outbound/Delivery;
- processing bleibt erhalten, Owner bleibt, Lease wird mindestens 60 Sekunden in die Zukunft gesetzt;
- Discovery liefert vor Fälligkeit nichts, danach den Command; Acquire vor Fälligkeit ist busy, danach übernimmt ein neuer Owner;
- Recovery reserviert korrekt Attempt 2/3; keine Busy Loop;
- Failure nach Attempt 3 geht nicht durch Defer, sondern Review; Reservation 4 bleibt unmöglich;
- Crash vor/nach Provider und vor Defer wird über regulären Leaseablauf recoverable, verbrauchter Counter bleibt.

### 14.3 Configuration/Permanent/Exhaustion

- Configuration Failure führt unmittelbar zu `ai_configuration_failure`/Human Review, ohne normalen Retry und ohne Knowledgemutation;
- Pending wird korrekt answered, Runtime `human_review`, Command `human_review_required`; Discovery/Acquire nimmt ihn nicht erneut auf;
- permanente Klassen werden niemals `no_match`, sondern `ai_non_transient_failure`, ohne Knowledgemutation;
- nach dritter retrybarer Failure `ai_attempts_exhausted`; contentfreies Audit enthält nur Allowlist-Metadaten und keine Provider-/Kundendaten;
- falscher Owner, abgelaufene Lease, stale Revision/Knowledge und falsche Pendingbindung können Review nicht committen.

### 14.4 Claimless `no_match` und `ambiguous`

Für beide separat:

- erfolgreicher AI Call/Reservation, null Claim/Evidence/Knowledge Transition;
- `project_knowledge_states.current_version` und Runtime Knowledgeversion bleiben gleich;
- beantwortete alte Pending Interaction wird atomar completed;
- bestehender Planner läuft auf unverändertem Knowledge, Information bleibt missing;
- dessen nächste Interaction/Snapshot/Outbound oder anderer regulärer Cycle-Endzustand wird atomar committed;
- kein AI Retry und kein Human Review allein aufgrund des Outcomes;
- keine dauerhafte Unterscheidung der beiden Outcomes.

### 14.5 Atomicity/Idempotenz

- stale Runtime Revision, stale Knowledge Version, wrong owner, expired lease, wrong Source/Pending/Prompt/Snapshot jeweils abgewiesen;
- identischer abgeschlossener Commit replayed; abweichender Payloadhash `duplicate_conflict`;
- Knowledge-/Runtimekorrektur während externer Latenz macht Result stale;
- Fehler an jeder Write-Stelle rollt die gesamte Claimless-/Review-DB-Transition zurück, nicht aber die vorherige Attemptreservation;
- externe Provideroperation läuft nie innerhalb einer DB-Transaktion;
- Resultcommit ohne vorherige AI-Reservation ist auf Service-/Integrationsebene abzuweisen, während deterministische bestehende Commits weiterhin keinen AI Counter brauchen.

### 14.6 Regression

- bestehender claim-producing Cycle, Knowledge Apply, Domain-/Human-Review-Pfade unverändert;
- Conversation Runtime, Persistent Cycle Service/Orchestration/Data Source/Runner und Migrationsverträge grün;
- Planner, Renderer, First Contact, Delivery und WhatsApp bestehende Tests unverändert grün;
- AI-06B-Contract/Klassifikation und OpenAI-Adaptertests nur mit Fakes; kein echter API Call.

## 15. Audit-Validierung

Die gezielte bestehende Suite deckte Conversation Runtime, persistenten Cycle Service/Orchestration/Data Source, Recoverable Runner, Cycle-Migration/Atomic Commit, Human Review, Knowledge Apply, Planner/Renderer, First Contact, Delivery sowie 06B-Contracts ab. Alle ladbaren gezielten Tests waren erfolgreich; ausschließlich die OpenAI-Adapterdatei konnte wegen des bereits bekannten fehlenden lokalen Pakets `openai@6.16.0` nicht geladen werden.

Die vollständige Suite erreichte **1.185 erfolgreiche Tests in 119 Dateien**; allein `test/openai-structured-inference-adapter.test.ts` war wegen `Failed to resolve import "openai"` nicht ladbar. `npm run typecheck` meldete entsprechend ausschließlich TS2307 für `openai` und `openai/helpers/zod`. `npm run lint` und `git diff --check` waren erfolgreich. Dies ist die bekannte Registry-/Proxy-/Dependency-Umgebungseinschränkung, kein Architekturblocker; Dependency und Lockfile wurden nicht verändert und kein Ersatzclient eingeführt.

## 16. Abschlussbericht

| Feld | Ergebnis |
|---|---|
| Branch | `codex/ap16-06-06d-1a-ai-cycle-authority-audit` |
| Baseline Commit | `50cbd7bcc7ff70f53e386fc5371e5d515e7f7f5c` |
| Commit Message | `docs: audit AI cycle completion authority` |
| Result | **READY** |
| Authority Documents | fünf Dokumente aus Abschnitt 2 plus aktuelle SQL-/Service-Tatsachenquelle |
| Four Gaps Audited | **4/4** |
| Proposed Attempt Authority | monotone, atomare providerneutrale Requestreservation am Customer-Answer-Cycle-Command |
| Attempt Storage Location | `conversation_cycle_commands.ai_inference_attempt_count` |
| Attempt Reservation Point | nach Gate/Eligibility/Allowlist/deterministic bypass, unmittelbar **vor** Provider Call |
| Maximum Locally Authorized Attempts | **3** |
| External Exactly-Once Guaranteed | **NEIN** |
| Recoverable Failure State/Transition | `processing` + `defer_customer_message_ai_retry(...)`; keine Businessmutation |
| Recovery Discovery Change Required | **NEIN** |
| Backoff Authority | vorhandene DB-Lease, bei Defer auf mindestens 60 Sekunden ab jetzt gesetzt |
| Attempt Exhaustion Path | Technical Review Wrapper → bestehende Review-RPC → Runtime `human_review`, Command `human_review_required` |
| Human Review Function/RPC | `completeCustomerMessageWithTechnicalHumanReview(...)` → `complete_customer_message_human_review(...)` |
| Configuration Failure Escalation Bridge | derselbe Wrapper mit `ai_configuration_failure`, sofort und ohne Defer |
| Claimless Success Authority | diskriminierter `no_claim`-Branch im bestehenden Atomic Commit |
| `no_match` Completion Path | gemeinsame claimlose Cycle-Generation → normaler Planner → Atomic Commit |
| `ambiguous` Completion Path | identisch; keine dauerhafte Ambiguity-Persistenz |
| Knowledge Mutation on Claimless Success | **NEIN** |
| Planner Changed | **NEIN** |
| Renderer Changed | **NEIN** |
| Migration Required | **JA** |
| Exact Migration Scope | eine Counterspalte/Check, Guard-Replacement, zwei neue RPCs, zwei bestehende RPC-Replacements, Grants/Comments; keine Tabelle/Indexes/Enumänderung |
| New AI Command Required | **NEIN** |
| OpenAI-Specific Persistence | **NEIN** |
| Service-Layer Changes Required | Reservation, Defer, technische Review-Bridge, claimloser Commit und Data-Source-Composition |
| Must-/May-/Must-Not-Change Files | verbindlich in Abschnitt 13 |
| Product Decisions Remaining | **keine** |
| READY FOR AUTHORITY IMPLEMENTATION | **JA** |
| Recommended Next Step | separates Authority-Implementation-Paket exakt nach Abschnitten 12–14; danach Re-Audit/readiness, erst dann AP-16-06-06D |

## 17. Pakettrennung und Stop Condition

Die sichere Reihenfolge bleibt:

```text
AP-16-06-06D-1A Audit
→ Authority Implementation Package
→ Re-Audit / readiness confirmation if required
→ AP-16-06-06D Productive AI Conversation Integration
→ Production env configuration
→ controlled E2E
```

Keine neue AI Queue, kein Providerfeld und keine grundlegende Architekturänderung ist nötig. Alle vier Lücken werden durch eine kleine Erweiterung der bestehenden Customer-Answer-Command-, Lease-, Atomic-Commit- und Human-Review-Authority geschlossen. Daher ist keine weitere Produktentscheidung nötig und der Audit endet exakt mit **READY**.
