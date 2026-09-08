# AP-16-06-06D-1 — Product Decision Authority Completion

## 1. Scope

Dieses Paket prüft ausschließlich die sechs außerhalb des Codes verbindlich getroffenen Produktentscheidungen für eine spätere produktive AI-Aktivierung gegen den Repository-Stand `3620360f24719cae8e211a7ce86a3a1083216b3b`. Es fügt nur dieses Authority-Artefakt hinzu. Es aktiviert keine AI, ändert keinen Conversation Cycle, keine Runtime, keine Konfiguration, keine Environment-Datei, keine Migration und keinen produktiven Transportpfad.

Der Audit unterscheidet strikt zwischen einer **geschlossenen Produktentscheidung** und einer **vorhandenen technischen Implementierungs-Authority**. Eine festgelegte Semantik ist nicht automatisch mit den heute persistierten Countern, Terminalzuständen und Commit-Verträgen ausführbar. Wegen der in den Abschnitten 7, 9, 13 und 14 nachgewiesenen technischen Lücken ist dieses Paket nicht die Freigabe für AP-16-06-06D.

## 2. Authority

Verbindliche fachliche Vorgaben dieses Dokuments sind die sechs Entscheidungen im Auftrag. Technische Ausgangs-Authority und vollständig gelesene Vorarbeiten sind:

1. `docs/audits/AP-16-06-06A-provider-neutral-ai-boundary-readiness-audit.md`;
2. `docs/implementation/AP-16-06-06B-provider-neutral-ai-boundary.md`;
3. `docs/implementation/AP-16-06-06C-openai-server-adapter.md`;
4. `docs/audits/AP-16-06-06D-0-productive-ai-activation-wiring-audit.md`.

Der aktuelle Code ist bei Abweichungen die technische Tatsachenquelle. Insbesondere wurden Service, Data Source, Context Read, Runner, Composition Root, Cycle, Interpretation, Apply, Atomic Commit, Recovery-Migrationen und AI-Contracts geprüft. 06B und 06C bleiben unverändert: Der AI-Ausgang ist nur ein Proposal, `maxRetries: 0` bleibt Adapter-Authority, und es gibt keine produktive Composition.

## 3. Six Binding Product Decisions

Alle **6/6 Produktentscheidungen sind fachlich aufgezeichnet**; keine wird in diesem Audit neu entschieden:

1. **`no_match`:** erfolgreicher Inference-Ausgang ohne Claim, ohne Review allein wegen dieses Ergebnisses und ohne technischen Retry; Information bleibt offen und der deterministische Planner bleibt Authority.
2. **`ambiguous`:** für den MVP dieselbe Apply-Semantik wie `no_match`: erfolgreicher Ausgang ohne Claim, Canonical Value, Review allein wegen dieses Ergebnisses oder technischen Retry; keine persistente Ambiguity Authority.
3. **Permanente/nicht verwertbare AI-Fehler:** nie als `no_match`, keine fachliche Teilmutation; kontrollierte begrenzte Recovery und spätestens bei Ausschöpfung Human Review.
4. **`configuration_failure`:** kein normaler AI-Retry, kein stiller Fallback; sofortige technische/Human-Review-Eskalation ohne fachliche Teilmutation.
5. **Maximal drei AI-Versuche insgesamt je zu verarbeitender Kundenantwort:** Attempt 1 im ursprünglichen Cycle, Attempts 2 und 3 durch Recovery; danach Human Review. Retry Owner ist ausschließlich KlimaGuy Recovery, nicht der Adapter.
6. **Feature Gate:** `AI_CUSTOMER_ANSWER_CLASSIFICATION_ENABLED`, server-only, Default `false`, exakter String `true` aktiviert; alles andere deaktiviert. Bei aktivem Gate gelten weiterhin die Invocation Conditions aus 06D-0.

Diese Entscheidungen sind vollständig. Das Ergebnis `BLOCKED` entsteht nicht aus einer offenen Produktfrage, sondern aus fehlender technischer Authority zur korrekten Umsetzung.

## 4. Current-Code Validation

### Produktiver Call Graph

```text
gespeicherte Customer-Text-Message
  -> runPersistentCustomerMessageCycle(...)
  -> createPersistentCycleDataSource(...)
  -> processPersistentCustomerMessage(...)
  -> acquire_customer_message_cycle_execution
  -> loadCustomerMessageCycleAuthority(...)
  -> normalizeCustomerAnswer(..., attempt_number: 1)
  -> runConversationCycle(...)
  -> interpretNormalizedAnswer(...)
  -> applyStateTransitionProposal(...)
  -> Missing Information / Assessment / planNextAction / Renderer
  -> commitCustomerMessageCycle(...)
  -> commit_customer_message_cycle (atomar)
```

Der Recovery-Pfad entdeckt ausschließlich abgelaufene `processing`-Commands und ruft denselben Runner mit derselben `source_message_id` erneut auf. `createProductiveCycleRuntime()` komponiert derzeit nur den serverseitigen Supabase-Service-Role-Client für Discovery, Claim, Read und Commit. Weder der AI-Interpreter noch der OpenAI-Adapter werden dort konstruiert oder produktiv aufgerufen.

### Festgestellte Tatsachen

- `processPersistentCustomerMessage(...)` ist der korrekte Wiring Point nach Normalization und vor Cycle-Ausführung.
- `normalizeCustomerAnswer(...)` erhält derzeit immer die fachliche `attempt_number: 1`; dies ist **nicht** der Execution- oder AI-Attempt-Counter.
- `interpretCustomerAnswer(...)` führt den exakten Registry-Match vor dem Provider Call aus, validiert die serverseitige Allowlist und reicht neutrale Failures unverändert weiter.
- `runConversationCycle(...)` akzeptiert nur eine `NormalizedCustomerAnswer`, ruft zwingend `interpretNormalizedAnswer(...)` auf und erreicht Missing Information sowie Planner nur nach erfolgreicher Interpretation und erfolgreichem Apply.
- `commitCustomerMessageCycle(...)` verlangt zwingend eine erfolgreiche Interpretation, ein `StateTransitionProposal` und ein erfolgreiches Apply-Result. Die SQL-Authority ruft ebenso zwingend `apply_customer_answer_knowledge_transition(...)` auf.
- Der persistierte Transition-Check kennt keinen semantisch korrekten „successful inference without claim“-Transitiontyp. Vorhandene No-Change-Typen (`skip_recorded`, `assumption_rejected`, `assumption_deferred`, `duplicate_no_change`) haben andere fachliche Bedeutungen und dürfen nicht als Ersatz missbraucht werden.
- `fail_customer_message_cycle(...)` setzt den Command auf `failed`; Recovery Discovery findet nur `processing`. Ein so abgeschlossener Fehler wird nicht erneut ausgeführt.
- `complete_customer_message_human_review(...)` ist eine vorhandene atomare Terminal-Authority, setzt Runtime auf `human_review`, beantwortet die Pending Interaction, entfernt deren aktive Bindung und setzt den Command auf `human_review_required`.

## 5. Final AI Result Semantics

### `matched`

Ein `matched`-Resultat ist nur ein untrusted Proposal. Nach erneutem serverseitigem Schema-, Binding-, Registry- und Allowlist-Check darf ausschließlich der vorgeschlagene Canonical Value in die bestehende Interpretation gelangen. Erst diese erzeugt gegebenenfalls Claim, Evidence und State Transition. Das AI-Resultat selbst besitzt keine Business Authority.

### `no_match`

`no_match` ist ein erfolgreicher AI-Abschluss ohne Claim und ohne Canonical Value. Die Information bleibt missing. Es gibt keinen AI-Retry, keine AI-Rückfrage und kein Human Review allein wegen `no_match`. Der Planner soll anschließend aus unverändertem Knowledge State entscheiden.

### `ambiguous`

`ambiguous` ist ebenfalls ein erfolgreicher AI-Abschluss ohne Claim und ohne Canonical Value. Für den MVP ist seine Knowledge-Apply-Wirkung identisch zu `no_match`. Es gibt keine neue persistente Ambiguity-Authority, keinen AI-Retry und kein Review allein aufgrund dieses Ergebnisses.

## 6. Final Failure Semantics

- **Retryable technical failures:** `timeout` und `transient_provider_failure` dürfen durch den recoverable Conversation Cycle bis zur verbindlichen Gesamtobergrenze von drei AI Calls erneut ausgeführt werden.
- **Non-transient failures:** `invalid_structured_output`, `refused`, `unsupported` und `permanent_provider_failure` sind niemals `no_match`. Sie dürfen keine fachliche Mutation erzeugen. Die Produktentscheidung erlaubt begrenzte Recovery, verlangt jedoch keinen sinnlosen identischen Provider-Retry. Die heutige neutrale Authority markiert sie als `retryable: false`; eine frühere direkte Review-Eskalation wäre produktkonform.
- **Configuration:** `configuration_failure` wird nie Teil der normalen AI-Retry-Serie und muss direkt Human Review erreichen.
- Der OpenAI Adapter bleibt bei genau einem Provider Call pro Aufruf und `maxRetries: 0`.

Der heutige Orchestration-Failure-Code `cycle_failed` ist zu grob, um AI-Fehlerklassen oder deren unterschiedliche Policy auszudrücken. Zudem terminalisiert `fail_customer_message_cycle(...)` den Command, statt ihn recoverable zu lassen. Eine Abbildung aller neutralen Failure Classes auf `cycle_failed` würde daher die verbindliche Semantik nicht erfüllen.

## 7. Attempt Authority

### Vorhandene Struktur

| Frage | Aktueller Stand |
|---|---|
| Tabelle | `public.conversation_cycle_commands` |
| Spalte | `execution_attempt_count integer not null default 0` |
| Erhöhung | `acquire_customer_message_cycle_execution(...)` erhöht bei jeder erfolgreichen Command-Acquisition um eins |
| Bedeutung | Laut SQL-Kommentar ausschließlich Observability; ausdrücklich **keine Max-Attempt-Policy** |
| Bindung | An einen persistenten Conversation-Cycle-Command; ein Customer-Answer-Command ist über `source_message_id` an eine gespeicherte Kundenmessage gebunden |
| Initial + Recovery | Ja, erfolgreiche initiale Acquisition und jede spätere Re-Acquisition desselben `processing`-Commands werden gemeinsam gezählt |
| Was zählt | Vollständige Runner-Acquisition, auch wenn der Lauf vor AI scheitert oder AI wegen Gate/Eligibility/Exact Match nie aufgerufen wird |
| Sichtbarkeit in TypeScript | Acquisition parst `execution_attempt_count` wegen `.passthrough()`, übernimmt ihn aber nicht in `CustomerMessageCycleAuthority`; die Context-Read-Authority liefert ihn ebenfalls nicht |
| Reset | Nie für denselben Command; ein neuer Customer-Answer-Command beginnt bei Default 0 |
| Exhaustion | Keine bestehende Prüfung und keine bestehende Transition |

### Kritische Antwort

**NEIN.** Die Regel „maximal drei AI-Versuche pro zu verarbeitender Kundenantwort“ kann mit der bestehenden Attempt Authority nicht korrekt und deterministisch umgesetzt werden.

Obwohl der Command stabil an die Message gebunden ist und initiale Ausführung plus Recovery gemeinsam zählt, zählt `execution_attempt_count` **Runner-Ausführungen**, nicht AI-Aufrufe. Ein Pre-AI-Persistenz-/Read-/Normalization-Fehler, Gate-Off, unsupported Semantik oder Exact-Match erhöht denselben Counter. Umgekehrt wird der Wert dem Service nicht als autorisierter Policy-Input bereitgestellt. Eine Prüfung `execution_attempt_count <= 3` wäre daher semantisch falsch und ist vom SQL-Kommentar ausdrücklich ausgeschlossen.

Auch die bestehende Recovery vervollständigt die Policy nicht: `failCustomerMessage(..., "cycle_failed")` setzt den Command auf `failed`, während `discover_recoverable_conversation_cycles(...)` nur `processing` entdeckt. Es gibt weder „dritten fehlgeschlagenen AI Call → Human Review“ noch eine autorisierte frühere AI-Failure-Transition.

Verbotene Scheinlösungen sind ein In-Memory-Counter, die Wiederverwendung von `normalized_answer.attempt_number`, das Zählen von SDK-Diagnostics oder die semantisch falsche Umdeutung des Execution-Counters.

**Kleinste notwendige Folge-Authority:** Ein separates, auditiertes Persistenz-/Recovery-Paket muss entweder (a) einen DB-autoritativen AI-Attempt-Zähler am bereits messagegebundenen Cycle Command ergänzen oder (b) den vorhandenen Counter samt Acquisition-Semantik so ändern, dass er ausschließlich einen tatsächlich begonnenen AI Call zählt. Es muss atomar „unter 3 claimen/erhöhen“ und bei Exhaustion in die vorhandene Human-Review-Transition überführen. Beides erfordert eine Migration/RPC-Änderung und liegt damit außerhalb dieses Pakets sowie außerhalb der aktuellen 06D-Must-Not-Change-Liste.

## 8. Human Review Authority

### States und Funktionen

- Runtime State: `conversation_runtime_states.runtime_status = 'human_review'`.
- Command State: `conversation_cycle_commands.status = 'human_review_required'`, `result_code = 'human_review'`.
- Service-Einstieg: `PersistentCycleDataSource.completeCustomerMessageWithHumanReview(...)`.
- Server-Adapter: `completeCustomerMessageWithHumanReview(...)` in `lib/server/conversation/persistent-cycle-commit.ts`.
- Persistenz: RPC `complete_customer_message_human_review(...)`.

### Persistierte Wirkung

Die RPC prüft Execution Owner/Lease sowie Source Message, Pending Interaction, Runtime Revision und Knowledge Version. In einer gesperrten Operation wird die Pending Interaction als beantwortet markiert, die Runtime Revision erhöht, Runtime `human_review` gesetzt, aktive Pending-/Evidence-Bindungen entfernt und der Command terminal `human_review_required`. Knowledge State, Claim, Outbound Message und Delivery Command werden nicht erzeugt oder verändert.

Terminal Replay erkennt `human_review_required`; Recovery Discovery nimmt den Command nicht erneut auf. Damit ist die persistente Review-/Stop-Authority grundsätzlich ohne neue Review-Tabelle oder UI vorhanden.

Die TypeScript-Grenze akzeptiert aktuell jedoch nur ein echtes `ConversationCycleFailure` mit `requires_human_review: true` oder einen erfolgreichen Cycle mit `cycle_status: "human_review_required"`. Sie besitzt keinen neutralen technischen AI-Eskalationsgrund. Eine AI-Fehlerklasse darf deshalb nicht als erfundener Domain-Cycle-Ausgang ausgegeben werden.

## 9. Configuration Failure Authority

`configuration_failure` kann im aktuellen Repository **nicht exakt und ohne Authority-Erweiterung** direkt in Human Review überführt werden:

1. Der Adapter und `interpretCustomerAnswer(...)` liefern die Klasse korrekt und nicht retryable.
2. `processPersistentCustomerMessage(...)` kennt diesen Resulttyp noch nicht.
3. Die vorhandene Review-Persistenz-RPC könnte die gewünschte atomare Transition technisch ausführen.
4. Der einzige TypeScript-Aufruf verlangt aber einen Cycle-Result-Reviewgrund; `configuration_failure` ist kein `ConversationCycleFailure` und keine vorhandene Failure Class in `CONVERSATION_CYCLE_FAILURE_CODES`.
5. Ein Mapping auf `cycle_failed` würde normal retryable klassifiziert und anschließend `failed` persistiert. Ein gefälschtes `human_review_required`-Cycle-Resultat wäre ebenso keine autorisierte Abbildung.

Der spätere Call Site wäre nach AI-Interpretation in `processPersistentCustomerMessage(...)`, noch vor `runConversationCycle(...)`. Die kleinste Folgeänderung ist ein provider-neutraler technischer Review-Eskalationsinput für `completeCustomerMessageWithHumanReview(...)`, mit geschlossener serverseitiger Reason-Allowlist und unveränderter RPC-Wirkung. Ob ein sicherer Reason persistiert werden muss, ist im technischen Folgepaket zu entscheiden; eine neue AI-Review-Tabelle ist nicht nötig. Bis diese Service-Authority existiert, ist Entscheidung 4 technisch nicht ausführbar.

## 10. Feature Gate Authority

Für eine spätere Implementierung gilt:

```ts
const enabled = process.env.AI_CUSTOMER_ANSWER_CLASSIFICATION_ENABLED === "true";
```

Nur der exakte, kleingeschriebene String `true` aktiviert das Gate. Missing, `false`, Leerstring, Whitespace-Varianten, Groß-/Kleinschreibungsvarianten und jeder malformed Wert deaktivieren AI. Das entspricht der einfachen serverseitigen Env-Konvention des Composition Roots und ist fail-closed.

Das Gate wird ausschließlich serverseitig im Composition Root gelesen. Es ist keine `NEXT_PUBLIC_...`-Variable, kein Datenbankflag und kein Remote-Config-System. Dieses Paket ergänzt weder `.env.example` noch Deployment-Konfiguration. Bei Gate Off wird der Adapter nicht konstruiert/aufgerufen. Gate On plus `configuration_failure` darf nicht fail-open werden, sondern muss nach Schließung der in Abschnitt 9 beschriebenen Lücke direkt eskalieren.

## 11. Deterministic-First Authority

Auch mit aktivem Gate darf AI ausschließlich laufen, wenn gleichzeitig gilt:

- echte persistierte inbound Customer-Textantwort;
- erfolgreiche deterministische Normalization;
- aktuelle, gebundene Pending Question und Snapshot;
- unterstützte aktive Text-Semantik;
- nichtleere, vollständig registry-validierte serverseitige Allowlist;
- kein exakter deterministischer Registry-Treffer;
- Gate exakt aktiv.

First Contact, Media einschließlich Caption-im-Media-Pfad, Boolean/Number/Unknown/Skip/Assumption, unsupported Semantik, ungültige Allowlist und exakte Registry Matches bleiben AI-frei. Planner, Renderer, Commit und Delivery erhalten keine AI-Metadaten.

## 12. Matched Bridge

Die kleinste zulässige Bridge für `matched` bleibt die 06D-0-Architektur:

1. `interpretCustomerAnswer(...)` prüft Eligibility, Exact Match und Allowlist und liefert ein Proposal.
2. Die serverseitige Facade prüft `canonicalValue` erneut gegen die für `information_key` registrierte Allowlist.
3. Original-`NormalizedCustomerAnswer` und ursprünglicher Kundentext bleiben unverändert.
4. Ein enger, providerneutraler optionaler Canonical-Override wird an `runConversationCycle(...)`/`interpretNormalizedAnswer(...)` gereicht.
5. `interpretNormalizedAnswer(...)` nutzt diesen Wert nur im vorhandenen Text-Mapping-Zweig und erzeugt mit bestehenden IDs, Bindings, Evidence- und Claim-Regeln das normale Proposal.
6. Apply und Atomic Commit bleiben alleinige Business Authority.

Diese Bridge ist technisch mit kleinen TypeScript-Contract-Erweiterungen ausführbar und benötigt keine Migration. AI darf niemals direkt `KnowledgeClaimProposal`, State Transition oder mutierten Customer Input liefern.

## 13. No-Match Bridge

### Prüfung der drei Optionen

- **A — bestehender Cycle Input:** nicht möglich. `NormalizedCustomerAnswer` besitzt keinen erfolgreichen `no_match`-Ausgang. Unveränderter Freitext endet als `unsupported_text_mapping` und der Cycle erreicht den Planner nicht.
- **B — kleiner providerneutraler Processing Result:** in-memory darstellbar, aber der heutige Cycle- und Atomic-Commit-Vertrag verlangt anschließend zwingend Interpretation, Transition und Apply. Ohne Commit-Authority-Änderung kann der erfolgreiche Customer-Answer-Command nicht korrekt abgeschlossen und die Planner-Fortsetzung nicht atomar persistiert werden.
- **C — Service-Level Branch:** allein nicht ausreichend. Ein Skip von `runConversationCycle(...)` überspringt Missing Information, Planner, Renderer und Atomic Commit. Ein vorhandenes `duplicate_no_change`/`skip_recorded` zu fälschen wäre fachlich falsch.

Damit kann `no_match` heute **nicht** als „successful inference without claim“ mit anschließendem Planner-Weiterlauf umgesetzt werden, ohne eine persistierte Authority zu ändern. Die kleinste saubere Lösung ist ein expliziter providerneutraler No-Claim-Cycle-Ausgang samt autorisiertem No-Change-Transitiontyp, den Cycle, Apply-Schemas und Atomic Commit verstehen. Die SQL-Transition-Check-Constraint und Apply-Allowlist müssten diesen Typ akzeptieren; das erfordert eine Migration. Planner und Renderer müssen dabei nicht geändert werden.

## 14. Ambiguous Bridge

Für `ambiguous` gilt dieselbe technische Analyse wie für `no_match`. Die Knowledge-Wirkung ist identisch: kein Claim und unveränderter Knowledge State. Das Ergebnis darf trotzdem als eigener in-memory Resultcode erhalten bleiben, ohne persistente Ambiguity-Tabelle. Es darf nicht durch `unknown`, `skip`, `duplicate_no_change` oder einen erfundenen Canonical Value ersetzt werden.

Da Cycle und Atomic Commit keinen semantisch korrekten erfolgreichen No-Claim-Ausgang besitzen, ist auch `ambiguous` derzeit nicht vollständig ausführbar. Das in Abschnitt 13 beschriebene Folgepaket kann einen gemeinsamen No-Claim-Apply-Pfad mit zwei nicht-business-authoritativen Ursprungsresultaten definieren.

## 15. Retry / Recovery

Recovery Owner bleibt ausschließlich `runPersistentCustomerMessageCycle(...)` plus `discoverRecoverableConversationCycles(...)` und die DB-Lease/Claim-Authority. Der OpenAI Adapter darf weder SDK-Retry noch semantische Schleife ergänzen.

Zielpolicy nach Schließung der Authority-Lücke:

- `timeout`, `transient_provider_failure`: Command ohne fachlichen Commit recoverable halten; atomar autorisierten AI Attempt 1, 2 oder 3 ausführen; nach Fehlschlag 3 atomar Human Review.
- `invalid_structured_output`, `refused`, `unsupported`, `permanent_provider_failure`: niemals `no_match`; ohne Claim direkt Human Review ist durch `retryable: false` und die Produktobergrenze zulässig und vermeidet sinnlose identische Calls. Falls das Folgepaket aus technischen Gründen Recovery nutzt, bleibt drei die harte Obergrenze.
- `configuration_failure`: sofort Review; null normale Recovery-Attempts.
- `matched`, `no_match`, `ambiguous`: erfolgreiche Inference, keine technische Wiederholung.

Der heutige Zustand erfüllt diese Policy nicht: neutrale Failures sind nicht in Cycle Orchestration gemappt, `failed` ist nicht discoverable und der Execution Counter ist keine AI-Attempt-Authority.

## 16. Atomicity / Idempotency

Die Grundarchitektur ist weiterhin geeignet:

- Ein AI Proposal besitzt allein keine Business Authority.
- Vor `commit_customer_message_cycle(...)` werden weder Knowledge noch Runtime, Pending, Outbound oder Delivery fachlich mutiert; nur Command-Acquisition/Lease ist persistiert.
- Ein nicht committetes Proposal hat keinen Business Effect.
- Recovery darf nach autorisierter Attempt-Prüfung erneut inferieren.
- Stabile Command-, Message-, Interpretation-, Transition-, Apply- und Event-IDs sowie Payload-Hash/Replay schützen den Commit.
- Es ist keine AI-Inference-Tabelle und kein AI Command erforderlich.

Diese Eignung beseitigt jedoch nicht die fehlende AI-Attempt- und No-Claim-Commit-Authority. Der kleinste Folgeweg kann bestehende Command-Persistenz erweitern; er braucht keine eigenständige AI-Entität.

## 17. Stale Context Protection

Die bestehende Schutzkette bleibt ausreichend, sofern ein AI Proposal nur innerhalb desselben geladenen Authority-Objekts verwendet wird:

- Execution Owner und Lease fencen verlorene Runner-Ownership.
- `expected_runtime_revision` schützt gegen geänderte Runtime.
- `expected_knowledge_version` schützt gegen Mitarbeiterkorrektur oder konkurrierenden Knowledge Commit.
- Source Message, Pending Interaction, Prompt Message, Snapshot und Decision Binding schützen gegen eine beantwortete/ersetzte Frage.
- Atomic Commit sperrt und validiert Conversation, Runtime, Knowledge, Pending und Command erneut.

Ein späterer 06D-Pfad darf keine erwartete Revision, ID oder Bindung nach dem AI Call ersetzen. Geänderte Authority führt zu stale/interaction/ownership failure und niemals zur Wirkung eines alten Proposals.

## 18. Final Failure Matrix

| AI Result / Failure | Claim? | Cycle Success? | Retry? | Max AI Attempts | Human Review? | Planner Continues? |
|---|---:|---:|---|---:|---:|---:|
| `matched` | Nur nach Allowlist-Bridge und bestehender Interpretation | Ja | Nein | 1 | Nur aufgrund nachgelagerter bestehender Domain-Regeln | Ja |
| `no_match` | Nein | Ja, nach fehlender No-Claim-Authority | Nein | 1 | Nein, nicht allein deswegen | Ja, Information bleibt missing |
| `ambiguous` | Nein | Ja, nach fehlender No-Claim-Authority | Nein | 1 | Nein, nicht allein deswegen | Ja, Information bleibt missing |
| `timeout` | Nein | Nein, recoverable | Ja | 3 insgesamt | Nach Fehlschlag 3 | Nein im fehlgeschlagenen Attempt |
| `transient_provider_failure` | Nein | Nein, recoverable | Ja | 3 insgesamt | Nach Fehlschlag 3 | Nein im fehlgeschlagenen Attempt |
| `invalid_structured_output` | Nein | Nein | Nicht erforderlich; frühere Review zulässig | höchstens 3 | Direkt bevorzugt, spätestens Exhaustion | Nein |
| `refused` | Nein | Nein | Nicht erforderlich; frühere Review zulässig | höchstens 3 | Direkt bevorzugt, spätestens Exhaustion | Nein |
| `unsupported` | Nein | Nein | Nicht erforderlich; frühere Review zulässig | höchstens 3 | Direkt bevorzugt, spätestens Exhaustion | Nein |
| `configuration_failure` | Nein | Nein | **Nein** | 1 fehlgeschlagener Call/Config-Check, 0 normale Retries | Sofort | Nein |
| `permanent_provider_failure` | Nein | Nein | Nicht erforderlich; frühere Review zulässig | höchstens 3 | Direkt bevorzugt, spätestens Exhaustion | Nein |

Die Matrix ist finale Produkt-Authority. Markierungen „nach fehlender Authority“ benennen den technischen Blocker, keine offene Semantik.

## 19. 06D File Allowlist

Wegen `BLOCKED` ist diese Liste **provisorisch und nicht ausführungsfreigebend**. Zuerst muss das Folgepaket aus Abschnitt 25 die Persistenz-/Recovery-Authority schließen; danach ist 06D neu gegen dessen Ergebnis zu baselinen.

### Must Change

`lib/actions/persistent-conversation-cycle-service.ts`
- `processPersistentCustomerMessage(...)` als Wiring Point;
- Interpreter nach Normalization und vor Cycle injizieren; Result-/Failure-Branches ohne Providerkonstruktion.

`lib/server/conversation/recoverable-cycle-runner.ts`
- `RecoverableCycleDependencies`, `runPersistentCustomerMessageCycle(...)`;
- Interpreter weiterreichen und die im Folgepaket autorisierte Failure-/Attempt-Transition verwenden.

`lib/server/conversation/productive-cycle-runtime.ts`
- `createProductiveCycleRuntime()`;
- Gate, OpenAI Adapter und providerneutrale Interpreter-Facade ausschließlich serverseitig komponieren.

`lib/server/conversation/customer-answer-interpreter.ts` (neu)
- Eligibility, Information-Key-Allowlist, Labels, Gate-bedingte Operation und Resultmapping;
- kein Claim, Planner oder Persistence Owner.

`lib/domain/conversation-intelligence/answer-interpretation.ts`
- `interpretNormalizedAnswer(...)`;
- nur den validierten Canonical-Override für `matched` konsumieren, Originaltext unverändert lassen.

`lib/domain/conversation-intelligence/answer-interpretation-schemas.ts`
- nur enger providerneutraler Canonical-Override, falls nach Folgepaket noch nötig.

`lib/domain/conversation-intelligence/answer-interpretation-types.ts`
- nur enger providerneutraler Canonical-Override, falls nach Folgepaket noch nötig.

`lib/domain/conversation-intelligence/conversation-cycle.ts`
- den vom Folgepaket autorisierten No-Claim-Cycle-Eingang konsumieren und danach bestehende Missing-/Planner-/Renderer-Funktionen unverändert aufrufen.

`lib/domain/conversation-intelligence/conversation-cycle-schemas.ts`
- ausschließlich der enge providerneutrale Cycle-Input/Result aus dem Folgepaket.

`lib/domain/conversation-intelligence/conversation-cycle-types.ts`
- ausschließlich der enge providerneutrale Cycle-Input/Result aus dem Folgepaket.

`test/productive-ai-customer-answer-cycle.test.ts` (neu)
- Wiring, Gate, Bypass, Resultate, Failure Policy, Attempt Exhaustion, Review und stale fencing mit Fakes.

### May Change

`lib/server/conversation/persistent-cycle-commit.ts`
- nur um die im Folgepaket autorisierte technische Review-Eskalation aufzurufen;
- keine neue Human-Review-Semantik und keine Commit-Neudefinition.

`lib/server/conversation/ai-customer-answer-classification-config.ts` (neu)
- nur falls Gate-Parsing aus dem Composition Root extrahiert wird;
- server-only und exaktes `=== "true"`.

`test/persistent-conversation-cycle-service.test.ts`
- Injection-, No-Claim- und Failure-Regressionen.

`test/recoverable-conversation-cycle-runner.test.ts`
- Recovery-/Attempt-/Exhaustion-Regressionen gegen die neue Authority.

`test/productive-conversation-cycle-runtime.test.ts`
- Gate- und Composition-Regressionen.

`test/persistent-cycle-data-source-composition.test.ts`
- technische Review-/Attempt-Adapter-Regressionen, falls die Folge-Authority dies verlangt.

### Must Not Change

- `supabase/migrations/**` in AP-16-06-06D selbst; die nötige Authority muss vorher separat geschaffen sein;
- Planner einschließlich `question-planner.ts`, Registry und Schemas;
- Renderer einschließlich Templates;
- First Contact und dessen Recovery;
- WhatsApp Webhook, Parser und Ingestion;
- WhatsApp Delivery, Delivery Recovery und Routes;
- Pricing, Calculation und Offer Authority;
- Human-Review-Schema, Review UI und Reviewer-Claim-Authority;
- OpenAI Adapter Contract/Implementation und `maxRetries: 0`;
- 06B provider-neutral Contract;
- Media/OCR/Vision/Audio;
- Environment-/Vercel-Dateien und Secrets.

## 20. Exact 06D Implementation Plan

Dieser Plan darf erst nach erfolgreichem Folge-Authority-Paket ausgeführt werden:

1. In `lib/server/conversation/productive-cycle-runtime.ts::createProductiveCycleRuntime()` Gate exakt serverseitig lesen.
2. Dort bei Gate On `OpenAiStructuredInferenceProvider` und die providerneutrale Facade komponieren; bei Off keinen Adapter konstruieren.
3. Über `lib/server/conversation/recoverable-cycle-runner.ts::runPersistentCustomerMessageCycle(...)` die Dependency bis `processPersistentCustomerMessage(...)` reichen.
4. In `lib/actions/persistent-conversation-cycle-service.ts::processPersistentCustomerMessage(...)` weiterhin zuerst `normalizeCustomerAnswer(...)` ausführen.
5. In der neuen `customer-answer-interpreter.ts` Eligibility, Registry und Exact Match vor jedem Provider Call prüfen.
6. Nur bei echter gebundener Non-Exact-Textantwort, aktiver Semantik, gültiger Allowlist und aktivem Gate `interpretCustomerAnswer(...)` aufrufen.
7. `matched` erneut allowlist-validieren und über den engen Canonical-Override an `interpretNormalizedAnswer(...)` geben; bestehende Claim-/Apply-Authority nutzen.
8. `no_match` in den vom Folgepaket autorisierten erfolgreichen No-Claim-Cycle-Ausgang überführen; keinen Fake Value/Answer/Claim erzeugen.
9. `ambiguous` ebenso ohne Claim behandeln und keine Ambiguity persistieren.
10. Technische Failures vor jeder fachlichen Mutation an die vom Folgepaket geschaffene Cycle-Failure-Authority geben.
11. Nur den DB-autoritativen tatsächlichen AI-Attempt-Wert aus dem Folgepaket verwenden.
12. Vor dem Provider Call atomar höchstens Attempt 3 autorisieren; nach drittem Fehlschlag Review terminalisieren.
13. `configuration_failure` am Service-Wiring-Point ohne normale Retry-Serie über die autorisierte technische Review-Grenze an `complete_customer_message_human_review(...)` geben.
14. In `conversation-cycle.ts::runConversationCycle(...)` bestehende Missing Information, `planNextAction(...)`, Renderer und Commitdaten unverändert ableiten.
15. Recovery über `discoverRecoverableConversationCycles(...)`/`runPersistentCustomerMessageCycle(...)` als alleinigen Retry Owner behalten; Adapter unverändert lassen.

## 21. 06D Test Plan

### Gate

- missing → AI off;
- `false` → AI off;
- exaktes `true` → AI eligible;
- malformed/Whitespace/abweichende Großschreibung → AI off.

### Deterministic bypass

- exakter Registry Match → Provider nie aufgerufen;
- unsupported Semantic Mode → Provider nie aufgerufen;
- fehlende/ungültige Allowlist → Provider nie aufgerufen;
- First Contact → Provider nie aufgerufen;
- Media-only und Media mit Caption → Provider nie aufgerufen.

### `matched`

- AI exakt einmal aufgerufen;
- gültiger Canonical Value akzeptiert, nicht registrierter abgewiesen;
- Allowlist nach Provider erneut geprüft;
- Originaltext unverändert;
- bestehende Interpretation, Claim, Apply und Atomic Commit erfolgreich.

### `no_match`

- erfolgreicher AI Call, null Claims/Evidence;
- Knowledge Version unverändert, Information bleibt missing;
- Planner läuft und entscheidet nächste Interaktion;
- kein technischer Retry und kein Human Review allein deswegen.

### `ambiguous`

- dieselben Assertions wie `no_match`;
- eigener in-memory Resultcode, keine persistente Ambiguity Authority.

### `timeout` / `transient_provider_failure`

- keine fachliche Teilmutation;
- Command bleibt kontrolliert recoverable;
- genau höchstens drei AI Calls für dieselbe Source Message über Initial + Recovery;
- vor-AI Runner-Acquisitions zählen nicht als AI Attempts;
- nach Fehlschlag 3 atomar Human Review; Attempt 4 wird DB-autoritativ verhindert.

### `configuration_failure`

- null normale Retries, sofort Human Review;
- keine Knowledge-, Outbound- oder Delivery-Mutation;
- Runtime/Pending/Command wechseln über bestehende Review-RPC atomar;
- keine Secrets in Resultaten oder Logs.

### Permanente Fehler

- jede Klasse bleibt von `no_match` unterscheidbar;
- null fachliche Teilmutation;
- direkte Review bei nicht-retryable Policy oder bounded Recovery, niemals mehr als drei Calls;
- keine erneute Provider-Schleife im Adapter.

### Concurrency

- geänderte Runtime Revision kann altes Proposal nicht committen;
- geänderte Knowledge Version kann altes Proposal nicht committen;
- geänderte/erledigte Pending Interaction kann altes Proposal nicht committen;
- verlorene Lease kann weder No-Claim- noch Matched-Commit oder Review terminalisieren.

### Isolation

- Planner, Renderer, First Contact, Delivery und WhatsApp unverändert;
- keine Migration in 06D;
- kein echter OpenAI API Call in Tests;
- Gate Off lädt/konstruiert den Provider nicht;
- Domain importiert weder OpenAI SDK noch Server-Provider.

## 22. Manual Production Activation Plan

Nur nach einem erfolgreichen Authority-Folgepaket, einer danach erfolgreichen AP-16-06-06D-Implementierung, Review und Merge:

1. `OPENAI_API_KEY` ausschließlich in Vercel Production setzen.
2. Optional `OPENAI_MODEL` setzen.
3. Optional `OPENAI_TIMEOUT_MS` unterhalb Lease/Requestbudget setzen.
4. `AI_CUSTOMER_ANSWER_CLASSIFICATION_ENABLED` zunächst `false` setzen.
5. Production Deployment durchführen.
6. Deterministischen Pfad mit Gate Off prüfen.
7. Gate kontrolliert auf exaktes `true` setzen.
8. Erneut deployen.
9. Gezielten WhatsApp-Test mit einer nicht-exakten freien Textantwort nach First Contact durchführen.
10. Nur content-free Runtime-/Log-Diagnostik prüfen.
11. `matched` samt Claim-/Commit-Bindings verifizieren.
12. Kontrolliert `no_match` und `ambiguous` ohne Claim/Review verifizieren.
13. Kill Switch `false` dokumentiert und unmittelbar verfügbar halten.

Da `createProductiveCycleRuntime()` im Vercel/Next.js-Serverprozess läuft und dort der Adapter komponiert werden soll, wird keine OpenAI-Konfiguration in Supabase Vault angenommen. Dieses Paket setzt keine Variable und keinen Secretwert.

## 23. Persistence Required

Für Proposal-Persistenz oder einen AI Command: **NEIN**.

Für die Schließung der tatsächlich festgestellten Authority-Lücken: **JA**. Die korrekte AI-Attempt-Zählung/Exhaustion und ein semantisch korrekter atomarer No-Claim-Cycle-Abschluss benötigen Änderungen an bestehender Command-/Transition-/RPC-Authority. Eine neue AI-Inference-Tabelle ist nicht erforderlich; die kleinste Lösung erweitert vorhandene messagegebundene Command- und Transition-Authority.

## 24. Remaining Product Decisions

**Keine.** Product Decisions Recorded: **6/6 JA**.

Offen sind ausschließlich technische Authority-Arbeiten:

1. DB-autoritative Zählung tatsächlicher AI Calls mit atomarer Obergrenze 3 und Review bei Exhaustion;
2. recoverable AI-Failure-Transition statt terminalem `failed` ohne Discovery;
3. semantisch korrekter erfolgreicher No-Claim-Cycle-/Commit-Pfad für `no_match` und `ambiguous`;
4. providerneutrale direkte technische Review-Eskalation für `configuration_failure` und früh terminalisierbare non-transient Failures.

### Baseline-Validierung

Die gezielte Suite für AI-Contracts/Klassifikation/Adapter, Normalization, Interpretation, Knowledge Apply, Persistent Cycle Service/Orchestration, Recoverable Runner, Productive Runtime, Conversation Runtime, Planner, Renderer, First Contact und Delivery erreichte **228 erfolgreiche Tests in 22 Dateien**. Ausschließlich `test/openai-structured-inference-adapter.test.ts` konnte nicht geladen werden, weil das deklarierte Paket `openai@6.16.0` im bereitgestellten `node_modules` fehlt.

Die vollständige Suite erreichte **1.185 erfolgreiche Tests in 119 Dateien**; wiederum war ausschließlich die OpenAI-Adapter-Suite wegen desselben fehlenden Pakets nicht ladbar. Der Typecheck meldet entsprechend ausschließlich die beiden fehlenden Moduldeklarationen `openai` und `openai/helpers/zod`. Lint und `git diff --check` sind erfolgreich. Diese bereits in 06D-0 dokumentierte Registry-/Proxy-/Dependency-Einschränkung ist kein neuer Produkt- oder Architekturfehler und wurde weder durch Package-/Lockfile-Änderungen noch durch einen Ersatzclient umgangen.

## 25. Result

### Exakte Authority-Lücken

Die READY-Bedingungen sind nicht vollständig erfüllt:

- `no_match` und `ambiguous` können im heutigen Cycle-/Commit-Modell nicht erfolgreich ohne Fake-Transition zum Planner gelangen;
- `execution_attempt_count` zählt Runner-Acquisitions, ist ausdrücklich nur Observability und wird dem Service nicht als Policy-Authority übergeben; maximal drei tatsächliche AI Calls sind damit nicht korrekt erzwingbar;
- ein fehlgeschlagener Cycle wird `failed`, aber Recovery entdeckt nur `processing`;
- `configuration_failure` besitzt keine direkte providerneutrale Service-Transition zur vorhandenen Human-Review-Persistenz.

### Kleinstes notwendiges Folgepaket

**AP-16-06-06D-1A — AI Cycle Attempt, No-Claim Commit and Technical Escalation Authority** muss vor 06D:

1. als Migration/RPC-Authority tatsächliche AI Attempts am bestehenden Customer-Answer-Command atomar zählen und auf drei begrenzen;
2. AI-Failure-Recovery/Exhaustion deterministisch und discoverable machen;
3. einen expliziten claimlosen No-Change-Transition-/Atomic-Commit-Pfad für erfolgreiche `no_match`/`ambiguous`-Verarbeitung ergänzen, ohne Planner/Renderer zu ändern;
4. eine providerneutrale technische Eskalation auf die bestehende Human-Review-RPC autorisieren;
5. diese Authority mit Migration-, Service-, Recovery-, Atomicity- und Concurrency-Tests absichern.

Erst danach darf AP-16-06-06D gegen eine aktualisierte File-Allowlist implementiert werden.

**RESULT: BLOCKED**
