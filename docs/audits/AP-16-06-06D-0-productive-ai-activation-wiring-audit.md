# AP-16-06-06D-0 — Productive AI Activation Wiring Audit

## 0. Ergebnis und Audit-Metadaten

| Feld | Ergebnis |
|---|---|
| Audit-Typ | Reiner Architektur- und Wiring-Audit; keine produktive Änderung |
| Branch | `codex/ap16-06-06d-0-productive-ai-activation-wiring-audit` |
| Baseline Commit | `3f9e37a5ff9eceb4600d6e92b907b1ad43d0fd5b` |
| Artefakt | `docs/audits/AP-16-06-06D-0-productive-ai-activation-wiring-audit.md` |
| Commit Message | `docs: audit productive AI activation wiring` |
| Audit Result | **PRODUCT DECISION REQUIRED** |
| Product Decision Required | **JA** |
| READY FOR AP-16-06-06D | **NEIN** |
| Persistence Required | **NEIN** |
| New AI Command Required | **NEIN** |

Der technische Wiring Point und der Composition Root sind eindeutig. Der aktuelle Code autorisiert aber **nicht**, wie `no_match`, `ambiguous` sowie permanente beziehungsweise Konfigurationsfehler fachlich abgeschlossen werden. Das ist keine bloße Implementierungslücke: `runConversationCycle(...)` kann ohne erfolgreiche Interpretation nicht zu Missing Information und Planner weiterlaufen, und die Recovery Authority entdeckt nur Commands in `processing`, während `failCustomerMessage(...)` einen Command terminal auf `failed` setzt. Eine heimliche Abbildung auf `unknown`, ein künstlicher Claim, endlose Recovery oder Human Review wäre jeweils neue Produktsemantik. Deshalb ist der vorgeschriebene Stop-Zustand **PRODUCT DECISION REQUIRED**.

## 1. Verbindliche Authority und Scope

Vollständig gelesen und für diesen Audit verbindlich übernommen wurden:

1. `docs/audits/AP-16-06-06A-provider-neutral-ai-boundary-readiness-audit.md`;
2. `docs/implementation/AP-16-06-06B-provider-neutral-ai-boundary.md`;
3. `docs/implementation/AP-16-06-06C-openai-server-adapter.md`.

Unverändert fest steht: Die AI Boundary liegt nach deterministischer Normalization und vor deterministischer Interpretation/Claim-Erzeugung. AI ist nur Proposal-Quelle. Sie besitzt keine Authority über Knowledge, Claims, Supersession, Runtime, Planner, Renderer, Persistence, Delivery, Pricing, Offer oder Human Review.

Untersucht wurden außerdem der produktive und recoverable Customer-Answer-Cycle, Context Read, Normalization, Interpretation Registry, Knowledge Apply, Atomic Commit, First Contact, Runtime Composition, Planner, Renderer, Delivery, die 06B-Operation und der 06C-Adapter. Es gab keinen API Call, keine Env-/Vercel-Aktion, keine Migration und keine Änderung produktiver Dateien oder Tests.

## 2. Produktiver Customer-Answer-Call-Graph

```text
persistierte Inbound-Textnachricht
  -> triggerPersistentMessageCycle(message_id)
     lib/server/whatsapp/ingestion.ts
  -> createProductiveCycleRuntime()
     lib/server/conversation/productive-cycle-runtime.ts
  -> runPersistentCustomerMessageCycle(runtime.runner, { message_id })
     lib/server/conversation/recoverable-cycle-runner.ts
  -> createPersistentCycleDataSource(..., owner + 300-s lease)
  -> processPersistentCustomerMessage(source, { message_id })
     lib/actions/persistent-conversation-cycle-service.ts
     -> claimCustomerMessage(message_id)
        -> acquire_customer_message_cycle_execution
        -> get_customer_message_cycle_context
        -> loadCustomerMessageCycleAuthority(...)
     -> RawCustomerAnswer aus persistiertem Text + gebundenem Snapshot
     -> normalizeCustomerAnswer(...)
     -> runConversationCycle(...)
        -> interpretNormalizedAnswer(...)
        -> applyStateTransitionProposal(...)
        -> Retry/Effort/Collection
        -> deriveMissingInformation(...) / deriveReadiness(...)
        -> buildIntermediateAssessment(...)
        -> planNextAction(...), optional planEvidenceRequest(...)
        -> renderQuestionTemplate(...)
        -> deriveConversationEvents(...)
     -> optional completeCustomerMessageWithHumanReview(...)
     -> commitCustomerMessageCycle(...)
        -> TypeScript-Zod- und Cross-Field-Validation
        -> commit_customer_message_cycle (eine DB-Transaktion)
           -> Knowledge Apply
           -> Runtime Revision/Snapshot/Pending
           -> Outbound Message/Delivery Command
  -> nur nach erfolgreichem Commit: runImmediateWhatsAppDelivery(...)
     -> runRecoverableWhatsAppDelivery(...)

Recovery:
POST /api/internal/conversation-cycles/recovery
  -> createConversationCycleRecoveryHandler(...)
  -> createProductiveCycleRuntime()
  -> discoverRecoverableConversationCycles(...)
  -> je source_message_id derselbe runPersistentCustomerMessageCycle(...)-Pfad
```

First Contact läuft separat über Eligibility, Foundation, `initializeFirstContactPrompt(...)`, `commit_first_contact_initial_prompt` und gegebenenfalls Delivery. Er passiert `processPersistentCustomerMessage(...)` und damit den späteren AI-Zweig nicht.

## 3. Schrittweise Rekonstruktion und Authority

| # | Datei / Funktion | Input | Output | Authority Owner | Wirft/fehlschlägt? | Persistiert? | Retry/Recovery |
|---:|---|---|---|---|---|---:|---|
| 1 | `lib/server/whatsapp/ingestion.ts` / `persistWhatsAppInboundText` | validiertes WhatsApp-Text-Event | interne Message-/Conversation-ID, `cycle_eligible` | Ingestion RPC | RPC/Schemafehler | **JA** | Provider-Deduplikation; nach Persistenz Cycle Recovery |
| 2 | `persistent-cycle-data-source.ts` / `claimCustomerMessage` | interne Message-ID | terminal Replay oder Command Authority | Acquire RPC | busy, stale, invalid, persistence | Command/Lease **JA** | abgelaufene 300-s-Lease reclaimbar |
| 3 | `persistent-cycle-context-read.ts` / `loadCustomerMessageCycleAuthority` | Command-ID | Message, Pending, Snapshot und Cycle Context | Read RPC + Validator | alle Binding-/Versionsfehler controlled | nur Reads | erneuter Read; stale wird nicht gerechnet |
| 4 | `persistent-conversation-cycle-service.ts` / Raw-Komposition | Authority | `RawCustomerAnswer` | Service-Orchestrierung | Richtung/Actor/Kind/Sequence rejected | NEIN | Command bleibt je Ausgang controlled |
| 5 | `answer-normalization.ts` / `normalizeCustomerAnswer` | Raw Answer, gebundene gerenderte Interaction, Attempt 1 | `NormalizedCustomerAnswer` | Answer Contract | geschlossene Normalization Codes | NEIN | derzeit `fail_customer_message_cycle(normalization_failed)` |
| 6 | `answer-interpretation.ts` / `interpretNormalizedAnswer` | Normalized Answer, Action, Knowledge, feste IDs/Version | `StateTransitionProposal` in `InterpretationResult` | Interpretation Registry | Mapping, Type, Reviewer/Conflict | NEIN | Cycle Failure oder Human Review |
| 7 | `state-transition.ts` / `applyStateTransitionProposal` | Proposal + in-memory State | Apply Result + neuer in-memory State | Knowledge Domain | stale/invalid/protected | NEIN | gesamter Cycle neu berechenbar |
| 8 | Retry/Effort/Collection Functions | Interpretation Outcome + vorherige Zustände | neue bounded Zustände | Conversation Domain | Schema-/Invariantfehler | NEIN | gesamter Cycle |
| 9 | `readiness.ts` / `deriveMissingInformation`, `deriveReadiness` | angewandter State | Missing/Readiness | Readiness Registry | kein externer Failure | NEIN | deterministisch ableitbar |
| 10 | `intermediate-assessment.ts` / `buildIntermediateAssessment` | State + feste Assessment-ID | Assessment | Assessment Domain | controlled Failure | NEIN | gesamter Cycle |
| 11 | `question-planner.ts` / `planNextAction` | State, Missing, Assessment, Retry/Effort | Action oder Stop | Planner | controlled Failure | NEIN | Replanning Flag/gesamter Cycle |
| 12 | `question-template-renderer.ts` / `renderQuestionTemplate` | ausgewählte Action + Registry Params | Interaction | Renderer Registry | Template Failure | NEIN | gesamter Cycle |
| 13 | `persistent-cycle-commit.ts` / `commitCustomerMessageCycle` | kompletter Cycle Success + erwartete Revisionen | RPC Payload/Result | Commit Adapter | Zod/Cross-Field/RPC Failure | erst RPC | Recovery nur solange Command processing |
| 14 | `commit_customer_message_cycle` | validierter Payload | Knowledge/Runtime/Pending/Outbound atomar | PostgreSQL RPC | CAS, ownership, constraints | **JA, atomar** | stale/ownership/replay geschützt |
| 15 | `ingestion.ts` / `runImmediateWhatsAppDelivery` | ausschließlich committete Outbound-ID | Delivery-Handoff | Delivery Runner | eigener Failure Space | Delivery State | eigene Delivery Recovery |

## 4. Exakter Wiring Point

### 4.1 Call-Site

Der einzige korrekte produktive Call-Site liegt in:

- `lib/actions/persistent-conversation-cycle-service.ts`
- Funktion `processPersistentCustomerMessage(...)`
- **unmittelbar nach** dem erfolgreichen `normalizeCustomerAnswer(...)`
- **unmittelbar vor** `runConversationCycle({ ...a.cycle_context, normalized_answer: ..., execution_status: "not_processed" })`.

Aktueller Input an dieser Stelle ist:

- `normalized.normalized_answer`;
- `a.rendered_interaction` einschließlich Answer Contract;
- `a.cycle_context.interpretation_inputs.selected_action` mit `information_key`, `semantic_mode`, Entity-/Decision-Binding;
- stabile Command-/Message-/Correlation-/Decision-IDs und Attempt Authority;
- registrierte Canonical Values.

Aktueller Output ist ein synchron an `runConversationCycle(...)` übergebenes `NormalizedCustomerAnswer`. Der bestehende deterministic-first Pfad ist heute:

```text
normalized_answer
  -> runConversationCycle
  -> interpretNormalizedAnswer
  -> Registry exact lookup bei text
  -> StateTransitionProposal
  -> Apply/Missing/Assessment/Planner/Renderer
```

Der geplante kleinste AI-Fallback ist:

```text
normalized_answer
  -> schmaler serverseitiger CustomerAnswerInterpreter
     -> Eligibility/Allowlist bauen
     -> interpretCustomerAnswer(input, provider)
        -> exact Registry Match: kein Provider
        -> sonst provider-neutraler Call
     -> matched: kanonische Semantik als expliziter, vertrauensloser Override
  -> runConversationCycle / interpretNormalizedAnswer
  -> unveränderte Registry-/Claim-/Apply-Authority
```

### 4.2 Noch fehlende Bridge

06B kann die Eligibility ausdrücken und liefert `canonicalValue`, aber der aktuelle Cycle kann dieses Ergebnis **noch nicht konsumieren**:

- `runConversationCycle` ist synchron und akzeptiert nur `normalized_answer` im Context;
- `interpretNormalizedAnswer` schlägt Text über `rule.canonical_values[normalisierter Kundentext]` nach;
- die Registry mappt etwa `wohnung -> apartment`; ein AI-Resultat `canonicalValue: "apartment"` ist selbst kein Registry-Key;
- `no_match` und `ambiguous` sind keine vorhandenen `NormalizedCustomerAnswer.outcome`-Werte.

06D benötigt daher die kleinste explizite Bridge statt eines Casts oder einer Mutation des Originaltexts:

1. einen serverseitigen `customer-answer-interpreter.ts`, der Eligibility und die freigegebene Allowlist bildet und `interpretCustomerAnswer(...)` aufruft;
2. einen engen optionalen `canonicalValue`-Input für die bestehende Interpretation, der nur nach erneuter Prüfung gegen `Object.values(rule.canonical_values)` gilt;
3. Weitergabe dieses Inputs durch `runConversationCycle`, ohne IDs, Claim-Daten oder State aus AI zu übernehmen.

Den AI-Wert in einen beliebigen deutschen Registry-Key zurückzuübersetzen und als `normalized_answer.value.text` zu persistieren, ist **nicht** empfohlen: Das würde den tatsächlich normalisierten Kundentext verfälschen. Die Bridge soll Original-Normalization und AI-Proposal getrennt halten. Sie braucht keine neue Persistenz; der kanonische Wert wird nur verwendet, um im bestehenden Interpreter denselben Claim-Zweig zu erreichen.

## 5. Deterministic-first Decision Table

| Condition | AI Call? | Next Step |
|---|---:|---|
| First-Contact Initial Prompt / Bootstrap | **NEIN** | bestehender Planner/Renderer/`commit_first_contact_initial_prompt` |
| Keine gebundene aktuelle Pending Interaction | **NEIN** | Context Read/Acquire lehnt ab (`interaction_not_current`/missing) |
| Message ist nicht inbound + customer + text | **NEIN** | Service lehnt `message_not_inbound_customer_text` ab |
| Media-only Event | **NEIN** | Parser liefert `media_deferred`; regulärer Text-Cycle wird nicht gestartet |
| Media mit Caption/Text | **NEIN für 06D** | aktueller Parser behandelt den Event als Media, nicht als `inbound_text`; keine Caption-Klassifikation vorziehen |
| Normalization fehlgeschlagen | **NEIN** | bestehender Normalization-Failure-Pfad |
| Outcome ist `unknown`, `skipped`, `deferred`, assumption result oder `invalid` | **NEIN** | bestehende deterministische Interpretation |
| Normalized Value ist Boolean, Number oder Number Range | **NEIN** | bestehende deterministische Interpretation/Failure |
| Answer Contract ist nicht `text` | **NEIN** | bestehender deterministischer Pfad |
| Selected Action / Question Semantic Mode passt nicht zur aktiven Text-Regel | **NEIN** | fail closed; kein Provider |
| Information Key ist nicht explizit für AI-Klassifikation freigegeben | **NEIN** | ursprüngliche deterministische Interpretation bleibt maßgeblich |
| Allowlist fehlt, ist leer, doppelt, ungültig oder enthält nicht registrierte Values | **NEIN** | fail closed vor Provider; sichere Diagnose |
| Exakter Registry Match nach Trim/Locale/Punktuation | **NEIN** | `matched` aus Quelle `deterministic`, dann bestehender Interpretation-/Claim-Pfad |
| Bereits deterministisch interpretierbarer nicht-textueller Wert | **NEIN** | bestehender Pfad |
| Effektiver Knowledge Claim hat bereits identischen Wert | **NEIN**, wenn exakter Match | bestehende Duplicate-No-Change-Authority; Knowledge allein darf einen sonst eligible Text nicht semantisch erraten |
| Gültiger gebundener normalisierter Text, unterstützte/freigegebene Textregel, valide Allowlist, kein Exact Match, Gate aktiv | **JA** | `interpretCustomerAnswer(...)` |
| Gate false/missing (empfohlener Default) | **NEIN** | unveränderter bisheriger deterministischer Pfad |
| Gate true, OpenAI-Konfiguration fehlt/ungültig | Call-Versuch endet vor Netzwerk | `configuration_failure`; fachlicher Abschluss ist offene Produktentscheidung |

Die kleinstmögliche Invocation Condition ist damit die Konjunktion aus: echte persistierte Textantwort; erfolgreich gebunden und normalisiert; Outcome `answered`; Value `text`; aktuell gebundene Action; aktive Text-Mapping-Regel; passender Semantic Mode; explizit aktivierter Information Key; valide nichtleere serverseitige Allowlist; kein exakter Registry Match; Feature Gate true.

## 6. Composition Root und Dependency Injection

Der exakte produktive Composition Root ist `lib/server/conversation/productive-cycle-runtime.ts:createProductiveCycleRuntime()`. Er wird sowohl vom unmittelbaren Ingestion-Trigger als auch vom Recovery Handler verwendet. Nur dort soll `OpenAiStructuredInferenceProvider` erzeugt und hinter dem provider-neutralen Port beziehungsweise dem schmalen Customer-Answer-Interpreter in `runtime.runner` injiziert werden.

```text
createProductiveCycleRuntime()
  -> new OpenAiStructuredInferenceProvider(...)       [server-only Adapter]
  -> createCustomerAnswerInterpreter(provider, gate)  [server-only Facade]
  -> RecoverableCycleDependencies.answerInterpreter
  -> runPersistentCustomerMessageCycle(...)
  -> processPersistentCustomerMessage(..., interpreter)
  -> interpretCustomerAnswer(..., provider-neutraler Port)
```

Weder `runConversationCycle`, `interpretNormalizedAnswer`, Webhook noch Delivery dürfen `new OpenAI(...)` oder den OpenAI Adapter importieren. Der Adapter darf pro Runtime-Instanz seinen Client lazy wiederverwenden, wie 06C bereits vorsieht. Tests injizieren einen Fake Interpreter/Provider. Ein globaler mutable Singleton ist nicht nötig und entspricht keinem vorhandenen Composition Pattern.

## 7. Result Semantics

### 7.1 `matched`

`canonicalValue` wird nicht als Claim übernommen. Die Bridge prüft ihn nochmals gegen die aktive serverseitige Canonical-Allowlist und reicht ihn als enges optionales Interpretation-Proposal an `runConversationCycle`/`interpretNormalizedAnswer` weiter. Der bestehende Interpreter erzeugt weiterhin Evidence, Claim, Transition, Retry Outcome, Versions- und Supersession-Metadaten mit den reservierten IDs. Reviewer-Schutz, Duplicate-Erkennung, Contradiction, Entity-/Decision-Binding, State Apply, Commit-Zod und DB-CAS bleiben aktiv. Daraus darf unverändert ein Claim Proposal entstehen.

### 7.2 `no_match`

06B garantiert nur: kein Canonical Value und kein Claim. Der aktuelle Cycle besitzt jedoch keinen erfolgreichen „unverstanden, Information bleibt offen“-Interpretationspfad für freie Textantworten. Originaltext an `runConversationCycle` führt zu `unsupported_text_mapping`, dann `cycle_failed`; `failCustomerMessage` macht den Command terminal `failed`, sodass reguläre Recovery ihn nicht erneut entdeckt. Ein Mapping auf `unknown` würde einen Unknown Claim und Retry-/Effort-Semantik erzeugen, obwohl der Kunde nicht „weiß ich nicht“ gesagt hat. Planner normal weiterlaufen zu lassen benötigt zunächst eine autorisierte no-change Interpretation. **Offene Produktentscheidung.**

### 7.3 `ambiguous`

`ambiguous` bedeutet fachlich „mehrere Allowlist-Werte plausibel“, nicht „kein Wert passt“. Dennoch existiert weder ein persistiertes Ambiguity-Signal noch eine vorhandene Clarification Action, die dieses Resultat konsumiert. Direkter Human Review ist technisch über `completeCustomerMessageWithHumanReview(...)` möglich, aber AI besitzt keine Review-Authority und keine Authority legt fest, ob Ambiguity sofort, nach N Versuchen oder nie Review auslöst. Es darf kein Claim entstehen. Planner darf erst weiterlaufen, wenn eine Domain-Authority den no-change/clarification outcome definiert. Neue Ambiguity-Persistenz ist für den ersten Use Case nicht technisch zwingend; die fachliche Behandlung ist aber **offen**.

## 8. Failure Matrix

Die Tabelle trennt nachgewiesene sichere Mechanik von noch nicht autorisierter Produktpolitik.

| Failure | Cycle Behavior | Persist Mutation? | Retry Owner | Recoverable? | Human Review? | Observable Diagnostic |
|---|---|---:|---|---:|---|---|
| `timeout` | vor fachlichem Cycle abbrechen; Command bis Lease-Ende `processing` lassen wäre technisch retrybar | nur Acquire/Lease/Attempt; keine Knowledge-/Runtime-Mutation | recoverable Cycle | **JA**, wenn nicht `failCustomerMessage` gerufen wird | Schwelle offen | Klasse, Latenz, Attempt, Schema State |
| `transient_provider_failure` | wie Timeout | nur Lease/Attempt | recoverable Cycle | **JA** | Schwelle offen | safe neutrale Klasse |
| `invalid_structured_output` | kein Proposal/Claim; fail closed | nur Lease/Attempt, sofern nicht terminalisiert | recoverable Cycle technisch möglich | **JA** technisch | 06A nennt bei Wiederholung Review, Schwelle fehlt | Klasse + `schema_validation=invalid` |
| `refused` | kein Proposal/Claim | nur Lease/Attempt, sofern nicht terminalisiert | Produktpolitik offen | technisch ja | offen | neutrale Klasse |
| `unsupported` | kein Proposal/Claim | nur Lease/Attempt, sofern nicht terminalisiert | Produktpolitik offen | Wiederholung wahrscheinlich nutzlos | offen | neutrale Klasse |
| `configuration_failure` | kein Netzwerk-/Domain-Call-Ergebnis, keine Mutation nach Acquire | nur Lease/Attempt, sofern nicht terminalisiert | Deployment oder Cycle? **offen** | technisch ja, bis Konfiguration repariert | offen | neutrale Klasse; niemals Key |
| `permanent_provider_failure` | kein Proposal/Claim | nur Lease/Attempt, sofern nicht terminalisiert | keiner eindeutig autorisiert | Wiederholung fachlich ungeklärt | offen | neutrale Klasse |

**Entscheidung aus aktuellem Code:** Keine Failure Class darf zum vorhandenen `cycle_failed` gemappt und dann als „recoverable“ bezeichnet werden. `fail_customer_message_cycle` setzt `status='failed'`; Discovery selektiert ausschließlich `status='processing'`. Für Timeout/transient kann 06D sicher durch Rückkehr ohne Failure-Commit die Lease-Recovery nutzen, doch es fehlt ein erlaubter `PersistentCycleResult`/Runner-Status für AI Failure. Für alle nicht-transienten Klassen fehlt zusätzlich eine Endzustandsentscheidung. Das muss vor Implementierung festgelegt werden.

## 9. Retry, Idempotency und neue Persistenz

- Das SDK hat `maxRetries: 0`; kein versteckter Provider Retry findet statt.
- `acquire_customer_message_cycle_execution` hält einen 300-Sekunden-Lease und erhöht `execution_attempt_count`; diese Zahl ist ausdrücklich nur Observability, keine Max-Attempt-Policy.
- Command-ID, Source Message, Correlation, Decision, Interpretation, Transition, Claim, Evidence, Apply, Assessment, Planner und Event-IDs sowie `execution_at` bleiben bei Reclaim stabil.
- Ein Retry liest denselben persistenten Text, Snapshot, Pending Binding, Knowledge-/Runtime-Versionen und dieselben registrierten Operation-/Schema-/Instruction-Versionen. Bei unverändertem Deployment entsteht derselbe Requestinput; Providerantworten dürfen trotzdem semantisch variieren.
- Vor dem atomaren Commit bleibt jedes AI Proposal in-memory und ohne Authority. Nur der erste erfolgreiche, versionsgebundene Commit wirkt. Terminal Replay inferiert nicht erneut.
- Ein abweichendes Retry-Resultat erzeugt keine Inkonsistenz, solange kein früheres Resultat committet wurde. Nach Commit blockiert Replay einen zweiten Effekt.

**Neue persistente AI-Inference-Authority erforderlich: NEIN.** Ein eigener AI Command würde unnötige PII-Retention und eine zweite State Machine einführen. Der bestehende Command reicht technisch. Er benötigt aber eine ausdrücklich entschiedene Failure-/Review-Policy; das ist keine neue AI-Persistenz.

## 10. Atomicity, Locks und externe Latenz

Der Cycle läuft nicht in einer langen Datenbanktransaktion. Acquire und Context Read sind einzelne RPCs. Nach deren Abschluss existiert nur ein zeitlich begrenzter Command-Lease; es werden keine Row Locks über den TypeScript-Compute und damit auch nicht über einen späteren OpenAI Call gehalten. Der externe Call kann und soll nach Context Read/Normalization und vor `runConversationCycle` vollständig außerhalb einer DB-Transaktion erfolgen.

Writes vor Inference:

- Inbound Message ist bereits final persistiert;
- Cycle Command existiert;
- Acquire setzt Owner, Lease, `execution_attempt_count` und Startzeit.

Keine Knowledge-, Runtime-, Pending-, Outbound- oder Delivery-Mutation geschieht vor Inference. Erst `commit_customer_message_cycle` startet eine kurze Transaktion, lockt Conversation, Runtime, Knowledge, Pending und Command in stabiler Reihenfolge, validiert Owner/Lease sowie erwartete Revisionen und führt Knowledge/Runtime/Outbound atomar aus.

Der OpenAI Default-Timeout von 15 Sekunden liegt deutlich unter dem 300-Sekunden-Lease. Der Recovery Handler startet keine weiteren Commands mehr nach 45 Sekunden Requestbudget, kann aber einen bereits gestarteten 15-Sekunden-Call beenden. Im Webhook beträgt das Budget 60 Sekunden; nach Cycle-Commit wird Immediate Delivery nur bei mindestens 20 Sekunden Restbudget begonnen. AI darf Delivery nicht in dieselbe Transaktion ziehen.

## 11. Concurrency und stale Context

Während des AI Calls können weitere Ereignisse eintreffen. Der heutige Schutz ist ausreichend, sofern 06D die erwarteten Werte unverändert weitergibt:

| Concurrent Change | Bestehender Schutz beim späteren Commit |
|---|---|
| zweite Kundenmessage | gebundene Source-/Pending-IDs und aktive Pending Interaction; ein konkurrierender erfolgreicher Commit ändert/erledigt Pending |
| Mitarbeiterkorrektur | Knowledge `current_version` und Runtime Knowledge Version weichen vom Command ab |
| Runtime Revision steigt | `expected_runtime_revision` CAS schlägt mit `stale_runtime_revision` fehl |
| Knowledge Version steigt | `expected_knowledge_version` CAS schlägt mit `stale_knowledge_version` fehl |
| Pending Interaction wechselt/erlischt | aktive Pending-ID, Status, Prompt-/Snapshot-/Revision-Binding schlägt mit `interaction_not_current` fehl |
| Lease geht während Call verloren | `execution_owner_id`/Expiry-Fencing schlägt mit `ownership_lost` fehl |

Zusätzliche persistente stale-result protection ist nicht nötig. Die kleinste 06D-Prüfung ist: AI-Resultat nur innerhalb desselben Authority-Objekts verwenden und vor Commit niemals erwartete Runtime-/Knowledge-Version, Pending-ID, Decision-ID oder Source Message austauschen. Der vorhandene Commit-CAS ist die finale Authority.

## 12. Configuration Failure und Feature Gate

### Fehlender/ungültiger Key

06C mappt fehlenden/ungültigen `OPENAI_API_KEY` vor Clientbau auf `configuration_failure`; 401/403 werden ebenso gemappt. Es entsteht kein Claim und keine fachliche Mutation. Welche der Optionen A–D produktiv gelten soll, ist aber nicht eindeutig autorisiert:

- A, Cycle recoverable lassen: technisch möglich, kann bei dauerhafter Fehlkonfiguration endlos reclaimeable bleiben;
- B, AI überspringen: 06C spricht von explizit gegateter Composition, definiert aber keinen fail-open nach aktivem Gate;
- C, deterministischer Fallback: bei nicht exakt gemapptem Text führt der heutige Pfad nur zu `unsupported_text_mapping`, keinem erfolgreichen Fallback;
- D, Human Review: technische Boundary vorhanden, doch AI darf Review nicht autorisieren und eine Policy fehlt.

Folglich ist `configuration_failure` eine echte Produktentscheidung.

### Feature Gate

Ein explizites serverseitiges Gate ist für sicheren Rollout fachlich sinnvoll und durch 06C („explizit gegatete Composition“) vorgezeichnet. Im Repository existiert kein allgemeines produktives Feature-Flag-Framework; Provider-Konfiguration allein als Aktivierung würde Rollback und gestuften Rollout koppeln. Empfehlung zur Entscheidung:

| Element | Empfehlung (noch nicht implementiert) |
|---|---|
| Env Name | `AI_CUSTOMER_ANSWER_CLASSIFICATION_ENABLED` |
| Werte | strikt `true` oder `false`; andere Werte invalid |
| Default bei missing | `false` |
| Verhalten bei `false` | Adapter nicht konstruieren/aufrufen; heutiger deterministischer Pfad |
| Verhalten bei `true` + gültige Config | nur eligible Non-Exact-Text-Fallback aktiv |
| Verhalten bei `true` + fehlendem Key | **Produktentscheidung erforderlich**: Deployment fail-fast, recoverable Failure oder kontrollierter Bypass |

Feature Gate Required: **JA (Empfehlung/Authority aus 06C)**. Die Semantik bei aktivem Gate und kaputter Konfiguration sowie der Rolloutmodus müssen vor 06D freigegeben werden.

## 13. Observability

Vorbild sind die content-free Recovery Summaries: aggregierte Statuszählungen, Budgetzustand und keine Message-Inhalte. 06D braucht minimale sichere Diagnostics an der Composition-/Runner-Grenze:

- `operation_key` und Version;
- lokale sichere Cycle-Correlation (vorzugsweise vorhandene opaque `correlation_id`, keine Transport-ID);
- `ai_invoked: yes|no`;
- bei Bypass ein geschlossener Reason Code, z. B. `gate_disabled`, `non_text`, `unsupported_semantic_mode`, `invalid_allowlist`, `exact_registry_match`;
- Result Class `matched|no_match|ambiguous` oder neutrale Failure Class;
- Latenz, Attempt und Schema Validation State;
- optional Recovery-Aggregat je Resultklasse.

Nicht loggen: Kundentext, Telefonnummer, WhatsApp-/Provider-IDs, API-Key, Prompt, vollständigen Request/Response, Knowledge-/Projektdetails, Preise oder Angebote. Diagnostics dürfen fachliches Verhalten nie verändern. Das bestehende 06B/06C-Resultat enthält bereits sichere Latenz-/Attempt-/Schema-Felder; ein neuer persistenter Log ist nicht erforderlich.

## 14. First Contact, Media, Planner, Renderer und Delivery

- Initiale First-Contact-Frage bleibt vollständig deterministisch.
- Kein AI Call beim Erzeugen des Prompts, bei `initializeFirstContactPrompt`, `commit_first_contact_initial_prompt` oder First-Contact Recovery.
- Der früheste AI Call ist eine echte spätere Customer-Textantwort mit aktueller Pending Interaction.
- Media-only wird vom WhatsApp Parser als `media_deferred`, nicht als Customer Text Cycle ausgegeben.
- Bei Media + Caption behandelt der aktuelle Parser die gesamte Message als Media; 06D darf die Caption nicht separat klassifizieren. Damit wird der AI-Pfad vollständig übersprungen.
- Planner und Renderer erhalten ausschließlich den bestehenden, deterministisch angewandten Knowledge State; keine AI-Metadaten.
- Delivery startet ausschließlich mit einer bereits atomar committeten Outbound-ID und bleibt unverändert.

## 15. Exakter Datei-Allowlist-Plan für AP-16-06-06D

### Must Change

- `lib/actions/persistent-conversation-cycle-service.ts`
  - Funktion `processPersistentCustomerMessage(...)`.
  - Nach Normalization den injizierten Customer-Answer-Interpreter awaiten und das autorisierte Resultat vor `runConversationCycle(...)` verzweigen; keine Providerkonstruktion.
- `lib/server/conversation/recoverable-cycle-runner.ts`
  - `RecoverableCycleDependencies` und `runPersistentCustomerMessageCycle(...)`.
  - Interpreterdependency an den Service reichen und entschiedene neutrale AI-Failure-Ergebnisse ohne Partial Commit abbilden.
- `lib/server/conversation/productive-cycle-runtime.ts`
  - `createProductiveCycleRuntime()`.
  - Exakter Composition Root für Gate, OpenAI Adapter und provider-neutrale Interpreter-Injection.
- `lib/server/conversation/customer-answer-interpreter.ts` (neu)
  - schmale server-only Facade/Helper.
  - Eligibility, explizite Information-Key-Allowlist, Labels, Operation Input, Bypass/Result Mapping; kein Claim/Planner/Persistence.
- `lib/domain/conversation-intelligence/answer-interpretation.ts`
  - `interpretNormalizedAnswer(...)`.
  - Nur die enge optional validierte Canonical-Semantik konsumieren, damit der Originaltext unverändert bleibt und derselbe Claim-Zweig läuft.
- `lib/domain/conversation-intelligence/answer-interpretation-schemas.ts` und `answer-interpretation-types.ts`
  - nur soweit für den engen optionalen, allowlist-validierten Canonical-Input zwingend nötig.
  - Keine AI-/Provider-Typen in der Domain.
- `lib/domain/conversation-intelligence/conversation-cycle-schemas.ts` und `conversation-cycle-types.ts`
  - nur soweit erforderlich, um das enge providerneutrale Interpretation-Proposal durch `runConversationCycle` zu reichen.
- `test/productive-ai-customer-answer-cycle.test.ts` (neu)
  - produktives Wiring, Bypass, Results, Failures, Recovery, stale fencing und Composition isoliert mit Fakes.

### May Change

- `lib/server/ai/operations/customer-answer-classification/operation.ts`
  - nur falls eine reine Eligibility-/Exact-Match-Helper-Extraktion nötig wird; 06B-Contract nicht erweitern.
- `lib/server/ai/operations/customer-answer-classification/schemas.ts`
  - nur bei nachgewiesener enger Contract-Korrektur; keine Resultklasse ergänzen.
- `test/persistent-conversation-cycle-service.test.ts`, `test/recoverable-conversation-cycle-runner.test.ts`, `test/productive-conversation-cycle-runtime.test.ts`
  - bestehende Injection-/Recovery-/Composition-Regressionen ergänzen.
- eine neue server-only Config-Datei unter `lib/server/conversation/`
  - nur für das nach Produktentscheidung strikt geparste Gate.
- bestehende AI-Contracttests
  - nur falls ein Contract tatsächlich korrigiert werden muss; keine echten API Calls.

### Must Not Change

- `lib/domain/conversation-intelligence/question-planner.ts` und Planner-Schemas/Registry;
- `lib/domain/conversation-intelligence/question-template-renderer.ts` und Renderer/Templates;
- alle First-Contact-Dateien und `commit_first_contact_initial_prompt`;
- `lib/server/whatsapp/**`, insbesondere Webhook, Parser, Ingestion und Delivery;
- `app/api/webhooks/whatsapp/route.ts` und Recovery Routes;
- `lib/server/conversation/persistent-cycle-commit.ts` und Atomic Commit Semantik;
- `lib/server/whatsapp/recoverable-delivery-runner.ts` und Delivery Authority;
- `supabase/migrations/**` und sämtliche DB-Schemas/RPCs;
- Pricing-, Kalkulations- und Offer-Authority;
- Human-Review-/Reviewer-Claim-Authority;
- Media/OCR/Vision/Audio/Floor-Plan-Code;
- 06C OpenAI Adapter/Instructions, sofern kein separat nachgewiesener Adapterbug vorliegt;
- Environment-/Vercel-Dateien oder Secrets.

Wenn die Produktentscheidung einen vorhandenen Terminalzustand nicht nutzen kann und eine DB-Änderung verlangen würde, muss 06D erneut stoppen; eine Migration gehört nicht in diesen Allowlist-Plan.

## 16. Exakter Testplan für AP-16-06-06D

### Deterministic bypass

1. `Wohnung!` als Exact Registry Match: Provider exakt null Aufrufe; bestehender Claim/Commit.
2. Boolean, Number, Unknown, Skip, Assumption: Provider null Aufrufe.
3. unsupported Semantic Mode, ungebundene/stale Question, fehlende/ungültige/empty Allowlist: Provider null Aufrufe.
4. Gate false/missing: Provider nicht konstruiert/gerufen, heutiges Verhalten.

### AI `matched`

1. Fake liefert registriertes `apartment`; Bridge reicht nur Canonical-Semantik weiter.
2. Original-Normalized-Text bleibt unverändert; bestehende Interpretation erzeugt Claim `building_type=apartment`.
3. gleiche ID-/Version-/Reviewer-/Contradiction-/Supersession-Validation bleibt aktiv.
4. bestehender Atomic Commit gelingt; nur committierte Outbound-ID geht an Delivery.
5. Canonical Value außerhalb der Allowlist erzeugt keinen Claim/Commit.

### AI `no_match`

1. kein Claim und keine erfundene Unknown-Semantik;
2. exakt der noch zu entscheidende Cycle Outcome;
3. Missing Information bleibt offen;
4. Planner-Verhalten nur über den autorisierten Domain Outcome, nie direkt durch AI.

### AI `ambiguous`

1. kein Claim, keine willkürliche Auswahl;
2. fachlich vom `no_match` unterscheidbarer entschiedener Outcome;
3. Clarification oder Human Review nur gemäß Produktentscheidung;
4. keine neue persistierte AI-Metainformation, sofern nicht neu auditiert.

### Failures

Für `timeout`, `transient_provider_failure`, `invalid_structured_output`, `refused`, `unsupported`, `configuration_failure`, `permanent_provider_failure` jeweils prüfen: Resultklasse, null Knowledge-/Runtime-/Pending-/Outbound-Mutation, safe Diagnostics, Retry-/Terminal-/Review-Verhalten gemäß Entscheidung. Fehlender und 401-Key dürfen weder Client noch Log Secret leaken.

### Recovery und Concurrency

1. Timeout/transient lässt Command gemäß entschiedener Policy reclaimbar; Recovery inferiert denselben persistenten Input erneut.
2. Crash nach AI, vor Commit: nur Lease/Attempt persistiert.
3. terminaler Replay ruft AI nicht erneut.
4. abweichende Providerantwort bei Retry: ausschließlich erster erfolgreicher Atomic Commit wirkt.
5. Runtime Revision, Knowledge Version oder Pending-Wechsel während AI: Commit ergibt stale/interaction/ownership failure, keine Mutation.
6. Provider-Timeout bleibt deutlich unter Lease; Recovery-Routebudget wird eingehalten.

### Isolation und Composition

1. First Contact inklusive Recovery ruft AI nie.
2. Media-only und Media + Caption rufen AI nie.
3. Planner-/Renderer-/Delivery-Dateiquellen und Outputs bleiben unverändert.
4. `OpenAiStructuredInferenceProvider` wird nur serverseitig im Composition Root konstruiert.
5. Fake Provider/Interpreter bleibt injizierbar; keine Suite benötigt einen echten Key oder Netzwerk.
6. Import-Isolation verbietet OpenAI in Domain, Webhook, Planner, Renderer, Commit und Delivery.

## 17. Manueller Production-Activation-Plan nach erfolgreicher 06D-Implementierung

Nur nach dokumentierter Produktentscheidung, Review und grüner Suite:

1. `OPENAI_API_KEY` ausschließlich in Vercel Production setzen.
2. Optional `OPENAI_MODEL` setzen; andernfalls dokumentierten Adapterdefault nutzen.
3. Optional `OPENAI_TIMEOUT_MS` setzen; Wert unter Lease und Requestbudget halten.
4. Entschiedenes `AI_CUSTOMER_ANSWER_CLASSIFICATION_ENABLED` zunächst `false` deployen.
5. Production Redeploy und Startup/Health/Recovery ohne AI verifizieren.
6. Gate kontrolliert aktivieren und erneut deployen; kein Big Bang auf deterministische Treffer.
7. Gezielten WhatsApp-Test nach First Contact mit einer freien Antwort durchführen, die **nicht** exakt im Registry-Key steht, z. B. eine semantische Umschreibung von Wohnung.
8. Content-free Logs prüfen: invoked/bypass, Resultklasse, Latenz, Attempt, keine PII.
9. `matched`, anschließend kontrolliert `no_match` und `ambiguous` gemäß freigegebener Policy verifizieren.
10. Timeout/transient und falsche Konfiguration in sicherer Staging-/Fake-Umgebung prüfen; keine geheimen Werte oder künstliche Providerfehler im Kundensystem erzeugen.
11. Runtime Revision, Knowledge Version, Pending Interaction, Outbound und Delivery auf genau einen atomaren Effekt prüfen.
12. Rollback ausschließlich über Gate `false`; deterministische Treffer bleiben währenddessen unverändert.

Feature Gate plus bestehende Lease/CAS-Recovery reichen technisch für einen kleinen Rollout, **nachdem** Failure- und Non-Match-Abschluss autorisiert sind. Eine neue Migration ist nicht erforderlich.

## 18. Erforderliche Product Decisions

Vor AP-16-06-06D müssen Eigentümer explizit festlegen:

1. **`no_match`:** Soll eine deterministische Clarification/no-change Interpretation ergänzt, direkt Human Review verlangt oder der Command anders abgeschlossen werden? Es darf nicht als `unknown` erfunden werden.
2. **`ambiguous`:** Sofortige Clarification, Human Review oder bounded erneute Frage; klare Abgrenzung von `no_match` und Schwelle.
3. **transiente Failures:** Command in `processing` bis Lease-Recovery lassen oder einen neuen vorhandenen Abschlussweg nutzen; keine falsche Behauptung, `failed` werde entdeckt.
4. **permanente/unsupported/refused/invalid Failures:** terminal, Clarification oder Human Review; maximale Attempts, denn `execution_attempt_count` besitzt bewusst keine Policy.
5. **configuration failure:** fail-fast bei Deployment, Gate-bypass, recoverable warten oder Human Review. Keine Endlosschleife ohne Entscheidung.
6. **Feature Gate/Rollout:** vorgeschlagenes Gate, Default false und Verhalten bei true + kaputter Config verbindlich bestätigen.

Keine dieser Entscheidungen darf in 06D durch einen technischen Default versteckt werden. Insbesondere besitzt die AI selbst keine Human-Review-Authority.

## 19. Validierung des unveränderten Baselines

Die geforderten Tests wurden ohne Teständerung ausgeführt. Die gezielte Suite erreichte **224 erfolgreiche Tests in 22 Dateien**; die Gesamtsuite erreichte **1.185 erfolgreiche Tests in 119 Dateien**. Jeweils ausschließlich die OpenAI-Adapter-Testdatei konnte nicht geladen werden, weil das deklarierte Paket `openai@6.16.0` im bereitgestellten `node_modules` fehlt. Der Reparaturversuch `npm install --ignore-scripts` wurde durch die Registry mit HTTP 403 abgewiesen. Aus demselben Grund meldet TypeScript genau zwei fehlende Moduldeklarationen (`openai` und `openai/helpers/zod`). Lint und `git diff --check` sind erfolgreich. Dies ist eine Abhängigkeits-/Umgebungseinschränkung des Baselines, keine durch den Audit erzeugte Codeabweichung.

Ausgeführt wurden:

- gezielte Vitest-Auswahl für 06B Contract, Customer Answer Classification, 06C Adapter, Normalization, Interpretation, Knowledge Apply, Conversation/Persistent/Recoverable Cycle, First Contact, Runtime, Planner, Renderer und Delivery;
- `npm test`;
- `npm run typecheck`;
- `npm run lint`;
- `git diff --check`.

## 20. Abschlussbericht

| Geforderter Punkt | Ergebnis |
|---|---|
| Branch | `codex/ap16-06-06d-0-productive-ai-activation-wiring-audit` |
| Baseline Commit | `3f9e37a5ff9eceb4600d6e92b907b1ad43d0fd5b` |
| Commit SHA | wird durch den Audit-Commit erzeugt; siehe Git-Historie |
| Commit Message | `docs: audit productive AI activation wiring` |
| Audit Result | **PRODUCT DECISION REQUIRED** |
| Authority Documents | 06A Audit, 06B Implementation, 06C Implementation |
| Productive Customer Answer Call Graph | Abschnitt 2 |
| Exact Wiring Point | `processPersistentCustomerMessage`, nach Normalization/vor `runConversationCycle` |
| Exact Composition Root | `createProductiveCycleRuntime()` |
| Deterministic Bypass Conditions | Abschnitt 5 |
| AI Invocation Conditions | letzte Zeile/Absatz in Abschnitt 5 |
| `matched` Behavior | Canonical Proposal erneut prüfen, bestehende Interpretation/Claim/Apply Authority |
| `no_match` Behavior | kein Claim; fachlicher Cycle-Abschluss **offen** |
| `ambiguous` Behavior | kein Claim; Clarification/Review **offen** |
| Failure Matrix | Abschnitt 8 |
| Retry Owner | bestehender recoverable Conversation Cycle; Policy noch freizugeben |
| Persistence Required | **NEIN** |
| New AI Command Required | **NEIN** |
| Transaction / Lock Findings | kein DB-Lock über AI; Atomic Commit erst danach |
| Stale Context Protection | bestehende Owner/Lease-, Runtime-, Knowledge- und Pending-CAS ausreichend |
| Feature Gate Required | **JA empfohlen** |
| Feature Gate Recommendation | `AI_CUSTOMER_ANSWER_CLASSIFICATION_ENABLED`, default/missing false |
| Production Files 06D Must/May/Must Not Change | Abschnitt 15 |
| Test Plan | Abschnitt 16; Baseline-Validierung Abschnitt 19 |
| Manual Production Activation Plan | Abschnitt 17 |
| Product Decision Required | **JA** |
| READY FOR AP-16-06-06D | **NEIN** |
| Recommended Next Step | Entscheidungen in Abschnitt 18 freigeben; danach 06D gegen den engen Datei-Allowlist-Plan implementieren |

## 21. Stop-Entscheidung

06B und 06C sind vollständig vorhanden, der technische Integrationspunkt, Composition Root, Atomicity und stale protection sind bestimmbar, und eine neue persistente AI Authority ist nicht erforderlich. Der aktuelle Code bietet aber keinen autorisierten erfolgreichen Cycle-Ausgang für `no_match`/`ambiguous` und keine fachlich vollständige Retry-/Terminal-/Review-Policy für alle neutralen Failures. Feature-Gate- und Konfigurationsfehlerverhalten sind ebenfalls nicht verbindlich entschieden.

**AUDIT RESULT: PRODUCT DECISION REQUIRED**
