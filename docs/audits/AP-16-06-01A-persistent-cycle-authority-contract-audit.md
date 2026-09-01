# AP-16-06-01A — Persistent Cycle Authority Contract Audit

**Baseline:** `304f767` (aktueller Repository-Stand beim Audit)
**Scope:** ausschließlich Persistence-/Authority-Vertrag; keine Produktimplementierung, Migration, Provider- oder Send-Integration.

## 1. Executive Summary

Der STOP aus AP-16-06-01 ist bestätigt. `processPersistentCustomerMessage(...)` benötigt nach dem Claim ein vollständiges `RenderedCustomerInteraction` und einen fast vollständigen `ConversationCycleContext`. `claim_customer_message_cycle(...)` liefert dagegen nur Identitäten, Revisionen und Sequenzen. Die aktive `conversation_pending_interactions`-Zeile enthält zwar einige Bindungsfelder, aber weder den vollständigen `SelectedNextAction` noch den tatsächlich gerenderten `RenderedCustomerInteraction`/`AnswerContract`. Ein erneutes Planen oder Rendern beim Eingang der Antwort wäre eine zweite Authority und ist verboten.

Die kleinstmögliche sichere Grenze besteht aus:

1. einem unveränderlichen, versionierten Planner-/Render-Snapshot je Pending Interaction,
2. einem erweiterten Cycle-Command als ID-Reservierung und Retry-Authority,
3. einer geschlossenen Read-Authority, die Snapshot, Message, Runtime-Komponenten, Knowledge und reservierte IDs konsistent lädt,
4. einer einzigen CAS-geschützten Commit-Authority für Knowledge, Runtime, vorherige/folgende Interaktion, interne Outbound Message, Events und terminales Command-Ergebnis,
5. einer sanitisierten Failure-Authority.

Der generische AP-15-Customer-Answer-Claim ist **nicht** semantisch identisch mit dem reviewergebundenen `evidence_claim_proposals`-Workflow. Für Customer-Answer-Transitions fehlt daher eine eigene persistente Knowledge-Apply-Repräsentation; eine Wiederverwendung des Descriptive-Review-RPC ist ausgeschlossen.

Die vier Auditfragen sind eindeutig beantwortet: **A)** Planner und Render sind als erzeugte Generation zu snapshotten; **B)** alle nicht bereits durch vorhandenen Code deterministisch erzeugten resultierenden Objekt-IDs werden je Command vor Domain Execution reserviert; **C)** Customer-Answer-Knowledge benötigt eine eigene atomare Apply-Authority gegen `project_knowledge_states.current_version`; **D)** der unten spezifizierte `PersistentConversationCycleCommit` ist eine einzelne Transaktion.

## 2. Verified STOP Condition

Der STOP ist anhand des Codes beweisbar:

- `processPersistentCustomerMessage` baut die Normalisierung aus `authority.rendered_interaction` und ruft `runConversationCycle` mit `authority.cycle_context` auf (`lib/actions/persistent-conversation-cycle-service.ts`).
- `CustomerMessageCycleAuthority` verlangt unter anderem `RenderedCustomerInteraction`, Knowledge State, Information Collection, Retry, Effort, Evidence State/Availability, vorherige `SelectedNextAction`, Interpretation-/Proposal-IDs, Event-IDs, Assessment-/Planner-IDs und Template-Version (`lib/actions/persistent-conversation-cycle-service.ts`, `lib/domain/conversation-intelligence/conversation-cycle-types.ts`).
- `claim_customer_message_cycle` gibt nur Command-/Conversation-/Project-/Pending-IDs, drei erwartete Revisionen und Message-/Prompt-Sequenz zurück. Es lädt weder Text noch Snapshot noch Domain Context (`supabase/migrations/202608230006_persistent_live_conversation_cycle.sql`).
- `conversation_pending_interactions` speichert nur einen Teil der Action-Bindung und `prompt_message_id`. Es fehlen insbesondere `selected_candidate_id`, Fallbacks, Reason Codes, Priority/Progression, Score, Planner-Entscheidungsdetails und der volle Answer Contract (`supabase/migrations/202608230005_persistent_conversation_runtime.sql`, `202608230006_persistent_live_conversation_cycle.sql`).
- `validatePendingTemplateBinding` kann lediglich den **aktuellen** statischen Registry-Eintrag anhand Key/Locale/Version prüfen. Das beweist nicht, dass dessen Inhalt dem damals gerenderten Text und Contract entspricht; Renderparameter sind ebenfalls nicht persistent (`lib/domain/conversation-runtime.ts`).
- Es existieren nur Claim- und bewusst unimplementierte Commit-Kommentare; keine RPC, die den vollständigen AP-15-Erfolg schreibt (`supabase/migrations/202608230006_persistent_live_conversation_cycle.sql`).

**STOP-Folge:** Weder Defaults noch Registry-Lookup, Replanning oder Re-Rendering dürfen die fehlende Authority ersetzen. AP-16-06-01 darf erst nach Implementierung dieses Vertrags fortgesetzt werden.

## 3. Required Domain Inputs

### 3.1 Feld-für-Feld-Matrix des vorigen Assistant-/System-Turns

| Feld | Domain-Typ | Erzeuger | Heute persistent (Tabelle.Spalte; Version) | Klassifikation | Codebegründung |
|---|---|---|---|---|---|
| `decision_id` | `SelectedNextAction.decision_id` | `planNextAction`, aus `planner_decision_id` | `conversation_pending_interactions.decision_id`; gebunden an Runtime-Revision | **Snapshot** | Normalisierung und Interpretation binden Answer → Render → Action über dieselbe Decision-ID. |
| `selected_candidate_id` | UUID | `planNextAction` | nein | **Snapshot** | Identifiziert die wirklich gewählte Candidate-Generation; ist nicht aus Pending-Feldern beweisbar. |
| `project_id`, `conversation_id` | UUID | Planner Context | Pending und Runtime; Runtime-Revision | **Snapshot-Bindung** | Cross-Binding wird in Normalisierung/Interpretation geprüft. Duplizierung im Snapshot ist absichtliche Integritätsbindung. |
| `based_on_state_version` | positive Integer | Planner | indirekt als `expected_knowledge_state_version`, nicht als vollständige Action | **Snapshot** | `runConversationCycle` verlangt Gleichheit von Action-Version und Knowledge-Version. |
| `action_type` | `PlannerActionType` | Planner | `selected_action_type`; Runtime-Revision | **Snapshot** | Steuert Interpretation, Effort und Rendering. |
| `information_key` | `PropertyKey` | Candidate/Planner | Pending-Spalte; Runtime-Revision | **Snapshot** | Wählt Interpretation Rule und Knowledge Property. |
| `entity_type`, `entity_id` | Entity binding | Candidate/Planner | Pending-Spalten; Runtime-Revision | **Snapshot** | Steuern Claim-Ziel, Retry und Collection. |
| `answer_contract.answer_type` | Planner-Minimalcontract | Planner | `answer_type`; Runtime-Revision | **Snapshot** | Action-Schema enthält nur Answer Type; für Normalisierung nicht ausreichend. |
| `template_key`, `template_version` | Template binding | Planner/Renderer | Pending-Spalten; Runtime-Revision | **Snapshot** | Teil der Answer-/Render-Bindung. |
| `assumption_key` | `AssumptionKey?` | Planner | nein | **Snapshot** | Interpretation einer Bestätigung benötigt exakt den gewählten serverseitigen Assumption Key. |
| `fallback_paths` | readonly Planner paths | Candidate/Planner | nein | **Snapshot** | Bestandteil der gewählten Planner-Entscheidung; spätere Neuberechnung könnte abweichen. |
| `reason_codes` | readonly Planner codes | Planner | nein | **Snapshot** | Erklärungs-/Entscheidungsprovenienz der konkreten Generation. |
| `priority_band` | `PriorityBand` | Candidate/Planner | nein | **Snapshot** | Ergebnis der Priorisierung, nicht aus dem reduzierten Pending beweisbar. |
| `progression_band` | `ProgressionBand` | Candidate/Planner | nein | **Snapshot** | Explizite Progression-Entscheidung. |
| `dependency_status` | satisfied/not_satisfied | Candidate/Planner | nein | **Snapshot** | Explizite Dependency-Entscheidung. |
| `collection_eligibility` | eligible/blocked/revisit_allowed | Candidate/Planner | nein | **Snapshot** | Explizite Eligibility-Entscheidung. |
| `revisit_status` | Planner revisit status | Candidate/Planner | nur Collection besitzt einen anderen `revisit_status`; nicht Action | **Snapshot** | Die beiden Felder sind semantisch nicht austauschbar. |
| `information_gain_status`, `collection_path`, `gain_reason_codes` | Information-gain decision | Candidate/Planner | Collection speichert nur vergangene path/reason; Action nein | **Snapshot** | Konkret gewählte Information-Gain-Entscheidung darf nicht aus späterem State rekonstruiert werden. |
| `score_breakdown` | `ScoreBreakdown` | Planner Scoring | nein | **Snapshot** | Ergebnis der damaligen Candidate-Bewertung. |
| `created_at`, `created_by_actor_class` | Timestamp/system | Planner | Pending `created_at` ist kein garantierter Planner-Zeitstempel | **Snapshot** | Vollständige Action-Schema-Validierung verlangt beide Werte. |
| `locale` | `"de"` | Render-Aufruf | Pending-Spalte | **Snapshot** | Bestandteil der Template-/Answer-Bindung. |
| `message_kind` | `QuestionMessageKind` | Template Renderer | nein | **Snapshot** | Bestimmt Semantik/Sichtbarkeit des gerenderten Ergebnisses. |
| `primary_text`, `supporting_text`, `help_text`, `accessibility_text` | Rendered text | Renderer + kontrollierte Parameter | nur der tatsächlich versendete zusammengesetzte Text kann in `conversation_message_text.body` liegen; Einzelteile nein | **Snapshot** | Die spätere Normalisierung benötigt zwar nicht den Text, aber Outbound-/Audit-Bindung muss exakt die gesendete Generation belegen. |
| `examples`, `answer_options` | readonly render fields | Template Renderer | nein | **Snapshot** | Normalisierung nutzt Optionen und Beispiele/Contract; Registry-Rekonstruktion ist über Deployments keine Persistence-Authority. |
| vollständiger `answer_contract` | `AnswerContract?` | versioniertes Template beim Rendern | nur `answer_type` im Pending | **Snapshot** | `normalizeCustomerAnswer` nutzt Required/Unknown/Skip, Grenzen, Einheit, Precision, Options, Error Code und Maximum Attempts. |
| `customer_visible` | boolean | Template Renderer | nein | **Snapshot** | Autorisiert, ob eine interne Outbound Message kundenfähig ist. |
| kontrollierte Renderparameter | `RenderParameters` | Cycle Renderer | nein | **Derived, nicht persistieren**, sofern der vollständige Render-Output gesnapshotshottet wird | Parameter sind Zwischenwerte; der validierte Output ist die Authority. |
| nicht gewählte Candidates und Feature Classes | `QuestionCandidate[]` | `generateQuestionCandidates` | nein | **Derived, nicht persistieren** | Der Cycle konsumiert beim Answer-Turn nur die gewählte `SelectedNextAction`; Replanning erzeugt eine neue Generation. |

### 3.2 Übriger `ConversationCycleContext`

| Context-Feld | Quelle/Authority | Heute verfügbar | Vertrag |
|---|---|---|---|
| `knowledge_state`, `expected_state_version` | `project_knowledge_states` plus Claims/Evidence-Projektion | Read-Model existiert für descriptive Knowledge; Conversation-Bindung/Customer-Answer-Abdeckung unvollständig | Unter Lock vollständig materialisieren; Version muss Command-/Runtime-/Pending-CAS entsprechen. |
| `information_collection_state` | `conversation_information_collection` | ja, normalisiert | Ohne Defaults bei geclaimter Revision laden. |
| `retry_state` | `conversation_retry_states` | ja | Ohne Defaults laden. |
| `customer_effort_state` | `conversation_effort_states` | ja | Ohne Defaults laden. |
| `evidence_request_state` | `conversation_evidence_request_states` | teilweise: Zeilen bilden State, aber Read-Schema-Materialisierung ist vorhanden | Vollständig und revisionsgebunden laden. |
| `evidence_availability` | Evidence/Media-Projektion | keine geschlossene Cycle-Read-Authority nachgewiesen | Neue Read-Authority muss die existierende autoritative Projektion verwenden; keine Heuristik. |
| vorige `selected_action`, `rendered_interaction` | neuer Snapshot | nein | Pflicht. |
| `interpretation_id`, `transition_id`, `claim_id`, Evidence-IDs, `apply_id` | derzeit Caller-Fixtures/Context | nicht reserviert | Im Command vor Execution reservieren. |
| `cycle_id`, `correlation_id`, Assessment-/Planner-/Event-IDs, `next_evidence_request_id` | derzeit Caller/Simulator | nicht reserviert | Im Command bzw. Child-ID-Reservoir vor Execution reservieren. Candidate-IDs sind dagegen im aktuellen Planner durch `idFor(information_key, action)` deterministisch erzeugt; `planner_candidate_ids` wird nicht konsumiert. |
| `event_sequence_start` | letzte Conversation-Event-Sequenz | keine Cycle-Event-Tabelle nachgewiesen | Unter Lock reservieren/ableiten und im Claim binden. |
| `occurred_at` | Domain-Zeitpunkt | Simulator/Caller | Als `execution_at` im Command beim ersten Claim fixieren. |
| `template_version`, `locale` | neue Generation | teilweise Pending | Aus Snapshot übernehmen; keine globale aktuelle Version verwenden. |
| `previous_events` | optional | keine notwendige Nutzung im aktuellen Cycle | **Derived/optional, nicht persistieren**, solange kein Codepfad es fachlich konsumiert. |

## 4. Planner Snapshot Authority

### Eindeutige Entscheidung

**AUTHORITATIVE SNAPSHOT:** Das vollständige, strikt schema-validierte `SelectedNextAction` **und** das vollständige, strikt schema-validierte `RenderedCustomerInteraction` der tatsächlich aktivierten Interaction. Dies umfasst ausdrücklich Candidate-ID, Planner-/Progression-/Dependency-/Eligibility-/Revisit-/Information-Gain-Entscheidungen, Score, Fallbacks, Reasons, Entity-, Information-, Assumption- und Template-Bindung, sämtliche gerenderten Texte, Options und den vollständigen Answer Contract.

**DETERMINISTIC DERIVED DATA:** nicht gewählte Candidates, rohe Feature-Berechnungsinputs, Renderparameter, Missing Information, Readiness und Intermediate Assessment. Diese Werte werden für eine neue Planner-Generation aus den dann CAS-gebundenen Authorities berechnet; sie dürfen **nicht** verwendet werden, um den vorigen Prompt zu rekonstruieren. `selected_candidate_id` bleibt trotz ableitbarer Herkunft Snapshot, weil die Candidate-Liste nicht persistiert wird und nur diese ID die konkrete Auswahl belegt.

Der Snapshot erhält eine explizite `snapshot_schema_version = 1`; Domain-`template_version` und `based_on_state_version` bleiben davon getrennt. JSONB ist zulässig, aber nur hinter striktem Zod-Schema, Größenlimits und unveränderlicher DB-Zeile; keine beliebigen Payloads.

## 5. Snapshot Creation Boundary

Der Snapshot entsteht im bestehenden Domain-Ablauf unmittelbar nach erfolgreichem:

`runConversationCycle → SelectedNextAction → renderQuestionTemplate → RenderedCustomerInteraction`.

Er wird **nicht** beim späteren Answer-Claim erzeugt. Die zukünftige Commit-Operation, welche die neue Generation aktiviert, muss in derselben DB-Transaktion:

1. den Snapshot schreiben,
2. genau eine interne Outbound `conversation_messages`-/`conversation_message_text`-Generation schreiben,
3. `prompt_message_id` und `snapshot_id` in der neuen Pending Interaction binden,
4. die Pending Interaction aktivieren und die Runtime-Revision erhöhen,
5. das erzeugende Cycle Command terminalisieren.

Gebunden werden `snapshot.id`, Pending-ID, `decision_id`, `selected_candidate_id`, `based_on_state_version`, Template Key/Version/Locale, Outbound Message-ID/Sequence, Conversation-/Project-ID und resultierende Runtime-/Knowledge-Version. DB-Constraints/RPC-Prüfungen müssen die IDs und redundanten Bindungen vergleichen. So kann eine Customer Message nur gegen die Interaction interpretiert werden, deren `prompt_message_id.sequence` vor ihr liegt und deren Snapshot exakt den gesendeten Prompt erzeugt hat.

## 6. Deterministic ID Authority

### Einheitliches Modell

Vor der Domain-Ausführung reserviert `claim_customer_message_cycle` beim **ersten** Claim alle nicht bereits deterministisch erzeugten IDs, die der Cycle möglicherweise in einem Commit referenziert, und persistiert sie im unveränderlichen Command-Kontext. Reservierung bedeutet UUID-Erzeugung in der DB und Rückgabe an TypeScript; sie bedeutet noch keine fachliche Zeile. Beim Retry wird derselbe Command-Kontext zurückgegeben. Vorhandene natürliche Idempotency Keys bleiben: `answer:<source_message_id>` für das Command und zweckgebundene Keys/Unique Constraints für Child Rows.

IDs werden nicht durch neues Hashing erfunden. Stabile Ableitung gilt für bestehende textuelle Idempotency Keys (`conversation_id:decision_id:answer_id`) und für die bereits implementierte Planner-Candidate-Funktion `idFor(information_key, action)`. Alle übrigen neuen UUIDs werden reserviert. Ungenutzte reservierte IDs dürfen ohne Zielzeile bleiben. Das derzeitige `planner_candidate_ids`-Context-Feld bleibt derived/ungenutzt und wird nicht zu einer falschen Persistence-Authority erhoben.

## 7. Failure and Replay ID Stability

Bei Crash nach Claim und vor Commit bleiben **identisch**: Command/Cycle/Correlation, Interpretation, Transition, Claim, Customer-/System-Evidence, Apply, Assessment, Planner Decision, die vom bestehenden Planner deterministisch erzeugte Candidate ID, Event IDs, Evidence Request, nächste Pending Interaction, Planner Snapshot und Outbound Message. Auch `execution_at`, Event-Sequenzstart und erwartete Revisionen bleiben identisch.

Neu entstehen dürfen nur technische, nicht persistierte Prozess-/Trace-Identitäten und bei einem **neuen logischen Cycle** dessen neue Reservierungen. Delivery-Attempt-IDs gehören zur späteren Transport-Authority und nicht zum Cycle Retry.

Dubletten werden verhindert durch:

- Unique `source_message_id` → ein Customer-Answer-Command,
- Unique `(conversation_id,idempotency_key)` → ein logischer Command,
- ein Processing Command pro Conversation plus Locks/CAS,
- reservierte IDs als PK und zweckgebundene Unique Keys,
- Knowledge Transition Unique `command_id`/`transition_id`/idempotency key,
- eine aktive Pending/Evidence Request pro Conversation,
- Outbound `conversation_messages.id = reserved_outbound_message_id` und Unique Idempotency Key,
- terminale Replay-Antwort aus dem Command ohne erneute Domain-Ausführung.

Ein fehlgeschlagener retrybarer Command wird wieder `processing`, behält aber seinen vollständigen Kontext. Ein stale oder human-review-terminaler Command wird nur replayed.

## 8. Knowledge Persistence Contract

| Output | Domain-Typ | Authority | Bestehende Repräsentation/RPC | Contract-Fit | Entscheidung |
|---|---|---|---|---|---|
| Raw/normalized answer | `RawCustomerAnswer` / `NormalizedCustomerAnswer` | Raw Message authoritative; Normalized derived | Raw in `conversation_messages` + text; normalized keine | Normalized ist reproduzierbar **nur** mit Snapshot | Nicht als eigene Authority persistieren; Commit validiert Bindung, Events/Transition tragen Resultat. |
| Answer interpretation | `InterpretationResult` | derived Domain Result | keine Cycle-Tabelle | kein Fit | Nicht vollständig persistieren; `interpretation_id` und resultierende Transition/Event-Provenienz persistieren. |
| State transition | `StateTransitionProposal` + Apply Result | authoritative nach Commit | `project_knowledge_state_transitions` ist auf reviewed descriptive proposal/review beschränkt | kein Fit für Customer Answer | Neue Customer-Answer-Transition-Authority erforderlich. |
| Knowledge claim | `KnowledgeClaimProposal` | authoritative nach Apply | `project_knowledge_claims` besitzt breitere Epistemic Types, aber aktuelle Transition-/Evidence-FKs erlauben Customer Message nicht | Shape teilweise, Provenienz nein | Bestehende Claims kontrolliert erweitern oder getrennte technische Claim-Tabelle; bevorzugt bestehende Knowledge State/Claims mit neuer Transition-/Evidence-Provenienz. |
| Claim proposal | Bestandteil `StateTransitionProposal` | pre-commit derived proposal | `evidence_claim_proposals` | falsche Semantik | Nicht dort speichern; innerhalb atomarem Commit validieren und direkt als Customer-Answer-Transition anwenden. |
| Evidence binding | `EvidenceProposal` (`customer_message`/`system_rule`) | authoritative nach Apply | `project_knowledge_claim_evidence` erlaubt nur `project_evidence` | kein Fit | Neue locator-freie Knowledge-Evidence-Provenienz für Customer Message/System Rule erforderlich. |
| Evidence request | `SelectedEvidenceRequest`, `EvidenceRequestState` | authoritative Runtime Output | `conversation_evidence_request_states`; keine Commit-RPC | weitgehend passend; `template_key` und request reason/render text fehlen | Row plus outbound/render binding in Commit; keine Vermischung mit Knowledge Evidence. |
| Human review | Cycle Failure/Status | authoritative boundary | Runtime/Conversation/Command Status unterstützen human review | Status vorhanden, Resume-Context nicht vollständig | Snapshot/Command erhalten; sanitisierten Reason Code persistieren. |
| Missing information | `deriveMissingInformation` | derived | keine | bewusst derived | Nicht persistieren. |
| Customer effort | `CustomerEffortState` | authoritative Runtime State | `conversation_effort_states` | passend | Atomar ersetzen/upserten, Runtime-Revision binden. |
| Information Collection | `InformationCollectionState` | authoritative Runtime State | `conversation_information_collection` | passend | Atomar diff/upsert/delete nach vollständigem Resultat; Collection-Version binden. |
| Retry state | `ConversationRetryState` | authoritative Runtime State | `conversation_retry_states` | passend | Atomar schreiben. |
| Runtime progression | Cycle Status + Planner/Evidence result | authoritative | `conversation_runtime_states`, Pending/Evidence Rows | passend, Commit fehlt | Atomare Transition mit Revision+1. |
| Readiness/assessment | derived | keine | keine | bewusst derived | Nicht persistieren, sofern kein separat freigegebener Read-Use-Case eingeführt wird. |
| Domain events | `ConversationEvent[]` | authoritative append-only record | keine Cycle-Event-Tabelle | fehlt | Neue append-only Conversation-Domain-Event-Tabelle. |

## 9. Descriptive Claim Boundary

Die Namen sind ähnlich, die Authorities nicht:

- `evidence_claim_proposals` entstehen aus typisierten Evidence Observations und erfordern explizite menschliche Review.
- `apply_reviewed_descriptive_claim` rekonstruiert Proposal, Review, Observation, Evidence und Media-Lifecycle unter Locks; es akzeptiert nur descriptive Observation-Properties und `project_evidence`.
- AP-15-Customer-Answer-Claims entstehen deterministisch aus einer normalisierten Customer Message und einer vorherigen Selected Action. Sie erlauben technische Properties, `customer_message`/`system_rule` Evidence, Unknown/Assumed/Reported sowie kontrollierte Supersession/Contradiction.

Damit sind sie verschiedene Authority-Typen. Customer-Answer-Claims dürfen weder in `evidence_claim_proposals` eingeschleust noch über `apply_reviewed_descriptive_claim` angewendet werden. Der Implementation Contract ergänzt eine eigene `customer_answer`-Transition-/Evidence-Provenienz unter derselben `project_knowledge_states.current_version`-CAS, ohne reviewergebundene Schutzregeln zu umgehen. Schutz durch Reviewer-Evidence wird bereits in der Domain erkannt und muss im DB-Commit erneut fail-closed geprüft werden.

## 10. Knowledge Version CAS

1. Beim Claim wird unter Lock `project_knowledge_states.current_version` gelesen.
2. Diese Version muss gleich `conversation_runtime_states.knowledge_state_version`, `conversation_pending_interactions.expected_knowledge_state_version` und Snapshot `selected_action.based_on_state_version` sein.
3. Sie wird unveränderlich als `command.expected_knowledge_version` gespeichert und als `ConversationCycleContext.expected_state_version` verwendet.
4. Der Commit lockt denselben Knowledge State und verlangt weiterhin exakt diese Version.
5. Nur eine tatsächlich verändernde `StateTransitionProposal` erhöht `current_version` auf `proposed_state_version`; No-change lässt sie unverändert. Das entspricht `applyStateTransitionProposal`.
6. Claims, Evidence-Provenienz, Knowledge Transition, Runtime Knowledge Binding, Collection/Retry/Effort, Events, Pending Resolution, nächste Generation und Command-Terminalstatus gehören atomar zu diesem Resultat.

Bei `expected != current` erfolgt **fail closed / stale**: keine Domain Outputs werden geschrieben, das Command wird mit `status=stale`, `result_code=stale_knowledge_version` terminalisiert und ein neuer fachlicher Cycle benötigt einen neuen expliziten Replan-/Resume-Pfad. Ein stilles Neu-Laden und Anwenden des alten Results ist verboten.

## 11. Atomic Commit Payload

Zukünftiger Name gemäß bestehender TypeScript-Konvention: **`PersistentConversationCycleCommit`**. `required` bedeutet für jeden erfolgreichen Commit vorhanden; `optional` ist nur bei passendem Cycle-Result-Kind zulässig. JSON-Blobs müssen jeweils eigene strikte Zod-Schemas besitzen.

| Feld | Req. | A/D | Ziel | CAS | Sensitivität |
|---|---|---|---|---|---|
| `command_id`, `conversation_id`, `source_message_id`, `project_id` | required | Authority identity | Command/validierte FKs | alle müssen reserviertem Command entsprechen | opaque IDs |
| `expected_conversation_revision` | required | Authority | nur CAS | Conversation | intern |
| `expected_runtime_revision` | required | Authority | nur CAS | Runtime | intern |
| `expected_knowledge_version` | required | Authority | Transition/State CAS | Knowledge | intern |
| `expected_pending_interaction_id`, `expected_pending_runtime_revision` | required | Authority | Pending resolution | Pending | intern |
| `expected_prompt_message_id`, `expected_prompt_message_sequence`, `source_message_sequence` | required | Authority | Message gate | Message append order | intern |
| `normalized_answer_result` | required | **Derived** | nicht als freie JSON-Ablage; RPC validiert Bindung/Result Code | Snapshot/Message | enthält abgeleiteten Customer-Wert, personenbezogen möglich |
| `knowledge_transition` | required | Proposal bis Commit, danach Authority | neue Customer-Answer Transition + Claims/Evidence | Knowledge Version | fachlich, potentiell personenbezogen; typed values only |
| `runtime_state_result` | required | Authority nach Commit | runtime header | Runtime Revision | intern |
| `retry_state_result` | required | Authority nach Commit | retry rows | Runtime Revision | intern |
| `information_collection_result` | required | Authority nach Commit | collection rows | Runtime/Collection Version | intern/fachlich |
| `customer_effort_result` | required | Authority nach Commit | effort row | Runtime Revision | intern |
| `evidence_request_result` | optional | Authority nach Commit | evidence request row/state | Runtime Revision | keine Locator/Providerdaten |
| `human_review_result` | optional, exklusiv zu normalem Next | Authority | Command + Runtime/Conversation Status | Runtime/Conversation | kontrollierter Code, kein Freitext |
| `selected_action_snapshot` | optional, required bei nächster Pending | Authority Snapshot | Snapshot table | resultierende Knowledge Version | intern, keine Customer Message |
| `rendered_interaction_snapshot` | optional, required bei Outbound/Next | Authority Snapshot | Snapshot table | Bindung an Action | Assistant-Text, validiert |
| `new_pending_interaction` | optional | Authority | pending table | neue Runtime Revision | opaque/Domain metadata |
| `internal_outbound_message` (`id`, idempotency key, actor, kind, occurred_at, reply_to, body) | optional | Authority | message + text | Message sequence/identity | Assistant-Text; keine Providerdaten |
| `events` | required (kann schema-validiert leer nur wenn Domain dies erlaubt; aktuell min. IDs nötig) | Authority append-only | neue event table | State versions, sequence | Codes/IDs/typed payload only |
| `terminal.status`, `terminal.result_code`, `terminal.outbound_message_id` | required | Authority | cycle command | result revisions/IDs | sanitisiert |

Nicht im Payload: Raw Customer Text (wird per `source_message_id` serverseitig geladen), Telefonnummern, WhatsApp/OpenAI Payloads, Storage Locator, Secrets, Stacktraces oder freie Fehlermeldungen. IDs und `execution_at` werden nicht vom Commit neu vorgegeben, sondern gegen die Command-Reservierung geprüft.

## 12. Atomicity Boundary

In **einer** DB-Transaktion erfolgen:

- Locks und alle CAS-Prüfungen,
- Customer-Answer Knowledge Transition, Claims, Supersession-Provenienz, Evidence Bindings und Version,
- Runtime Header und sämtliche Runtime-Komponenten,
- Auflösung der vorherigen Pending Interaction mit `answered_by_message_id`,
- optional neue Evidence Request **oder** neue Pending Interaction,
- Planner-/Render-Snapshot der neuen Interaction,
- interne Outbound Message und Text,
- Conversation Domain Events/Sequenzen,
- resultierende Conversation-/Runtime-/Knowledge-Revisionen,
- terminaler Cycle-Command-Status/Result.

Außerhalb bleiben nur: Domain-Berechnung vor dem Commit, spätere Provider Delivery, Delivery Attempts/Provider-ID sowie rein derived Read Models. Wenn Persistenz scheitert, rollt alles zurück; das Command bleibt retrybar `processing` oder wird durch eine separate Failure-Authority sanitisiert auf `failed` gesetzt. Es darf keinen Zustand „Knowledge angewandt, aber Outbound/Pending fehlt“ geben.

## 13. Internal Outbound Message Authority

`RenderedCustomerInteraction` ist der strukturierte Render-Snapshot. Der tatsächlich an den Kunden freigegebene Text ist die validierte, deterministisch zusammengesetzte Darstellung daraus und wird genau einmal in `conversation_message_text.body` zur reservierten outbound `conversation_messages.id` gespeichert. Der Snapshot bindet diese Message-ID; die Pending Interaction bindet Snapshot-ID und dieselbe `prompt_message_id`.

Für den späteren WhatsApp-Transport ist ausschließlich die interne `conversation_messages.id` die logische Outbound-Identity. Die bestehende Delivery-Authority darf diese ID claimen und eine Provider Message ID daran binden. Ein Replay des Cycle Commit findet Command/Message bereits anhand reservierter ID bzw. Idempotency Key und gibt dasselbe `outbound_message_id` zurück; es erzeugt keine zweite interne Message.

`reply_to_message_id` zeigt beim Cycle-Reply auf `source_message_id`. `direction='outbound'`, `actor_class='system'` (oder nur falls eine spätere validierte Language Boundary ausdrücklich autorisiert: das bestehende zulässige Actor-Modell) und `message_kind='text'`. Snapshot-`customer_visible` muss `true` sein. Interne Notices ohne Customer Visibility dürfen nicht zur Delivery gelangen.

## 14. Human Review Boundary

Der bestehende Domain-Pfad endet in Human Review, wenn Interpretation Reviewer-Schutz/Review verlangt, eine Transition `human_review_required` ist, Planner/Stop `request_human_review` wählt oder ein Runtime-Invariant die technische Klassifikation `human_review` verlangt. Keine neue Semantik wird ergänzt.

In diesem Pfad:

- entsteht **keine** kundenadressierte Outbound Message und keine neue Pending Interaction,
- wird die vorherige Pending Interaction nicht als fachlich beantwortet/Knowledge-angewandt markiert, sofern keine erfolgreiche Transition vorliegt; der atomare Commit darf sie kontrolliert `cancelled`/`answered` nur gemäß konkretem Domain Result behandeln,
- werden Runtime und Conversation in vorhandenen `human_review`-Status überführt,
- wird das Command terminal `human_review_required` mit kontrolliertem `result_code`, ohne Freitext,
- bleiben Source Message, voriger Snapshot, Command-Kontext, erwartete Versionen und Domain-Provenienz für einen späteren **expliziten** Resume/Review-Command erhalten.

Der aktuelle Code definiert keinen automatischen Resume-Algorithmus. Daher ist automatisches Wiederaufnehmen **nicht** Teil von AP-16-06-01; die Authority ist der terminale Command plus unveränderlicher Snapshot und menschliche Statusentscheidung.

## 15. Failure Authority

| Fall | Status / Result Code | Retry | Zulässige Persistenz |
|---|---|---|---|
| Normalization failure | `failed / normalization_failed` | retryable gemäß bestehender Klassifikation; gleiche IDs/Snapshot | nur Command-Code/Zeit; keine normalized/raw values |
| Domain cycle failure | `failed / cycle_failed` | retryable; gleiche IDs | nur sanitisierten Code; keine partiellen Domain Outputs |
| Stale Authority | `stale / stale_runtime_revision`, `stale_knowledge_version` oder `interaction_not_current` | terminal für diesen Command; requires recheck/new command | Command terminal, keine Outputs |
| Persistence failure | Command bleibt sicher retrybar; separate `failed / persistence_failed` nur wenn Failure-RPC selbst committet | retryable | kein partieller Commit, keine Exception/Stacktrace |
| Human review | `human_review_required / <allow-listed-domain-code>` | nicht automatisch retrybar | Status-/Resume-Authority, keine Outbound Message |

Die Failure-RPC akzeptiert `command_id`, erwarteten aktuellen Status und einen Enum-Code. Sie darf nur `processing → failed|stale|human_review_required` erlauben, bindet Zeit serverseitig und gibt terminale Replays stabil zurück. Unbekannte Exceptions werden ausschließlich auf `persistence_failed`/`cycle_failed` gemappt; SQL-/Provider-/Stacktrace-Texte dürfen nicht in Command, Event oder Audit Log gelangen.

## 16. Security and Data Minimization

| Daten | Persistieren? | Grenze |
|---|---|---|
| Customer Message Text | bereits einmal in Message Text; nicht im Snapshot/Command/Commit duplizieren | personenbezogen möglich; serverseitig laden, niemals loggen |
| gerenderter Assistant Text | ja, einmal Message Body plus strukturierter Snapshot soweit für Authority erforderlich | strikt validiert, Größenlimits, kein ungeprüfter AI-Text |
| Planner Metadata | ja, nur gewählte Action | keine PII, versioniertes striktes Schema |
| Provider-/WhatsApp-Daten | nein | Delivery-separate Authority |
| Storage Locator/Media Payload | nein | nur opaque Evidence IDs/Availability-Projektion |
| freie Model-/AI-Ausgabe | nein | nicht Teil dieses Audits; niemals ungeprüft |
| Secrets/Service Role | nein | RPC server-only; keine Client-Exposition |
| typed Knowledge Values | nur wenn Transition sie fachlich anwendet | Datenminimierung, RLS/geschlossene RPC, kein Audit-Metadaten-Leak |

Snapshot- und Event-Tabellen erhalten RLS, keine Browser-Mutationsrechte, geschlossene Security-Definer-RPCs mit festem `search_path`, Append-only/Immutable Guards und keine generischen JSON-Write-Endpunkte.

## 17. Future OpenAI Boundary

Die Struktur erlaubt weiterhin:

`deterministische Domain Decision → optional kontrollierte Language/Inference Boundary → schema-/policy-validierter Render-Text → atomarer Snapshot/Outbound Commit`.

Der Domain-Snapshot bleibt unabhängig vom Provider. Falls später Sprache variiert wird, muss der final validierte `RenderedCustomerInteraction` die persistierte Authority sein; Provider-Rohdaten werden nicht gespeichert. OpenAI wird weder zum Laden noch Rekonstruieren des vorigen Planner States benötigt und darf Planner, Preis, Knowledge Transition oder Freigabe nicht entscheiden.

## 18. Authority Matrix

| Authority | Produced By | Persisted Today | Required Snapshot | Reconstructable | CAS Protected | Future Destination |
|---|---|---|---|---|---|---|
| SelectedNextAction | `planNextAction` | teilweise Pending | ja, vollständig | nein | Knowledge + Runtime | Interaction Snapshot |
| RenderedCustomerInteraction | Template Renderer | Text ggf. Message, Struktur nein | ja, vollständig | nein | Action/Template/Message | Interaction Snapshot + Message Text |
| Answer Contract | Template Renderer/Registry | nur answer type | ja, vollständig | nein | Snapshot identity | Interaction Snapshot |
| Pending Interaction | Cycle Commit | ja | referenziert Snapshot | nein | Runtime/Knowledge/Prompt | erweiterte Pending Row |
| Runtime State | Runtime Authority | ja | nein | aus normalisierten Rows ja | Runtime Revision | bestehende Runtime-Tabellen |
| Knowledge State | Knowledge Authority | ja, descriptive Scope | nein | aus Claims/Evidence, nach Erweiterung | Knowledge Version | bestehender State + erweiterte Transitions/Provenienz |
| Normalized Answer | Normalizer | nein | nein | ja, aus Raw + Snapshot | Decision/Template/Message | nicht separat persistieren |
| Knowledge Transition | Interpreter/Apply | nur descriptive Review-Transition | nein | nein nach Commit | Knowledge Version/Command | neue Customer-Answer Transition Authority |
| Evidence Request | Evidence Planner | Runtime Rows teilweise | Render-Bindung bei Outbound ja | State ja, vorige Auswahl nein | Runtime Revision | bestehende Evidence Row + Snapshot/Message |
| Customer Effort State | Cycle | ja | nein | nein | Runtime Revision | bestehende Effort Row |
| Information Collection State | Cycle | ja | nein | nein | Runtime/Collection Version | bestehende Collection Rows |
| Internal Outbound Message | Commit aus validiertem Render | allgemeine Message Authority existiert | Bindung ja | nein | Command/Sequence | bestehende Message/Text + Snapshot FK |

## 19. ID Matrix

| ID | Current Producer | Reservation Point | Stable Across Retry | Persistence Location | Idempotency Boundary |
|---|---|---|---|---|---|
| `command_id` / `cycle_id` | DB Command / Caller Context | erster Claim; Cycle-ID kann Command-ID sein, muss aber explizit gemappt werden | ja | cycle command | source-message unique |
| `correlation_id` | Caller | erster Claim | ja | command/context + events | command |
| source/prompt Message IDs | Message authorities | bereits vor Claim | ja | conversation messages / Pending | message PK + conversation sequence |
| interpretation ID | Caller Context | erster Claim | ja | command reservation + transition/events | command + interpretation unique |
| transition ID | Proposal ID input | erster Claim | ja | command reservation + Knowledge transition | transition PK/command unique |
| claim ID(s) | Proposal IDs | erster Claim, bounded slots passend aktuellem Domain-Maximum | ja | command reservation + claims | claim PK/transition |
| customer/system Evidence IDs | Proposal IDs | erster Claim | ja | command reservation + Knowledge evidence provenance | evidence PK/source binding |
| apply ID | `next_state_ids` Caller | erster Claim | ja | command reservation/transition | transition apply idempotency |
| evidence request ID | Caller `next_evidence_request_id` | erster Claim | ja | command reservation + runtime evidence | request PK + one active |
| assessment ID | Caller | erster Claim | ja | command reservation; Result derived, nicht zwingend eigene Row | command |
| planner candidate IDs | `question-planner.ts:idFor(information_key, action)`; `planner_candidate_ids` wird nicht gelesen | keine Reservierung; bestehende deterministische Planner-Funktion | ja bei identischen Planner Authorities | nur gewählte ID im Snapshot | Snapshot/Decision; keine neue ID-Authority |
| planner decision ID | Caller | erster Claim | ja | command reservation + next Snapshot/Pending | decision ID + command |
| pending interaction ID | heute externer Insert | erster Claim für mögliche nächste Interaction | ja | command reservation + pending | PK + one pending/conversation |
| planner snapshot ID | fehlt | erster Claim | ja | command reservation + snapshot | one snapshot/pending/decision |
| outbound message ID | DB default bei Message Insert | erster Claim | ja | command reservation + messages + command result | reserved PK + message idempotency key |
| conversation event IDs | Caller array | erster Claim, ausreichend viele bounded Slots | ja | command reservation + event rows | event PK + sequence unique |
| runtime component IDs | natürliche Composite Keys; request/pending separat | bestehende entity keys bzw. erster Claim | ja | Runtime component tables | conversation/key + Runtime CAS |
| delivery attempt/provider IDs | Delivery Layer | nicht im Cycle | n/a für Cycle | Outbound Delivery Tabellen | Delivery Claim, separat |

**Event-Slots:** `deriveConversationEvents` kann im aktuellen Contract höchstens fünf Events erzeugen: interpreted, ein Claim, eine Supersession, ein semantisches Event und completed; `proposal_ids` enthält nur eine Claim-ID. Der Claim reserviert deshalb exakt fünf Event-UUIDs. Ungenutzte UUIDs bleiben ohne Event-Zeile. Eine spätere Domain-Erweiterung, die mehr Claims/Supersessions erlaubt, muss Schema-Version und Reservierungscontract gemeinsam migrieren. Candidate-Slots werden nicht reserviert, weil der aktuelle Planner seine Candidate IDs selbst deterministisch erzeugt und das Context-Feld `planner_candidate_ids` nicht verwendet.

## 20. Commit Matrix

| Commit Component | Atomic | CAS Input | Destination | Replay Behavior |
|---|---|---|---|---|
| Command identity/result | ja | command status + immutable context | cycle commands | terminales Result unverändert zurückgeben |
| Knowledge state/version | ja | expected Knowledge Version | project knowledge state | kein zweites Increment |
| Customer-answer transition/claims/evidence | ja | Knowledge + reserved IDs | neue/erweiterte Knowledge Rows | PK/idempotency returns existing logical result |
| Runtime header | ja | expected Runtime Revision | runtime state | result revision wiedergeben |
| Retry/Collection/Effort | ja | Runtime/Collection bindings | bestehende component rows | kein zweites Apply |
| previous Pending resolution | ja | ID/status/revision/prompt | pending row | bereits identisch beantwortet = replay; Konflikt = stale |
| next Pending | ja, falls gewählt | result versions + reserved ID | pending row | dieselbe ID, keine zweite aktive Row |
| Planner/Render Snapshot | ja, falls Interaction | reserved ID + Decision/Template | neue snapshot row | immutable existing equality or conflict |
| Evidence Request | ja, falls gewählt | result Runtime + reserved ID | evidence request row | dieselbe ID, keine Dublette |
| Internal Outbound Message/Text | ja, falls customer-visible Output | prompt/source sequences + reserved ID | message/text | dieselbe ID/idempotency key |
| Conversation Domain Events | ja | reserved IDs + sequence start + versions | neue append-only event table | existing identical; conflict fail closed |
| Human Review Status | ja, exklusiver Result-Pfad | conversation/runtime/command | existing headers + command | terminal replay |
| WhatsApp Delivery | **nein** | eigene Delivery CAS | bestehende Delivery Authority | eigener Retry; Cycle nie erneut committen |

## 21. AP-16-06-01 Implementation Contract

1. **Neue Persistence-Struktur:** `conversation_interaction_snapshots` (immutable, 1:1 Pending, schema version, vollständige Selected Action + Rendered Interaction, outbound FK) sowie `conversation_domain_events` und Customer-Answer-spezifische Knowledge Transition/Evidence-Provenienz. Keine generischen freien Payloads.
2. **Bestehende Erweiterungen:** Pending erhält `snapshot_id` (not null für neu aktivierte Customer Questions); Cycle Command erhält `project_id`, fixiertes `execution_at`, Prompt-Sequenz/-ID und reservierte Result-ID-Felder/Arrays. Knowledge Claim/Transition-Provenienz wird für `customer_answer` erweitert, ohne descriptive Review-FKs/Semantik zu lockern.
3. **Neue Read Authority:** ein server-only `claim/read_customer_message_cycle_context` lädt unter stabiler Lock-Reihenfolge Message+Text, Conversation, Runtime, Pending+Snapshot+Prompt, Knowledge+Claims/Evidence, Collection, Retry, Effort, Evidence State/Availability und Command-Reservierungen; es gibt exakt `CustomerMessageCycleAuthority` zurück oder einen allow-listed Fehler/terminalen Replay.
4. **Neue Commit Authority:** `commit_customer_message_cycle(PersistentConversationCycleCommit)` validiert strikte Shapes und reservierte IDs, prüft alle CAS-Grenzen und schreibt den Abschnitt 12 in einer Transaktion.
5. **Failure Authority:** `fail_customer_message_cycle(command_id, expected_status, failure_code)` mit Enum, serverseitiger Zeit, erlaubten Statusübergängen, stabilen Replays und ohne Freitext.
6. **Snapshot-Zeitpunkt:** im Commit des erzeugenden Cycles, atomar mit interner Outbound Message und Aktivierung der Pending Interaction; niemals beim Answer-Claim.
7. **Vor Domain Execution reservierte IDs:** Cycle/Correlation, Interpretation, Transition, Claim/Evidence/Apply, Assessment, Planner Decision, exakt fünf Event-Slots, Evidence Request, nächster Pending, Snapshot und Outbound Message. Alle bleiben bei Retry stabil. Candidate IDs bleiben ausschließlich Ergebnis der bestehenden deterministischen Planner-Funktion und werden nicht reserviert.
8. **CAS:** Conversation Revision, Runtime Revision, Knowledge Version, Pending ID/Runtime Revision/Status, Snapshot-/Decision-Bindung, Prompt Message-ID/Sequence und Source Message Sequence; Abweichung ist stale/fail closed.
9. **Atomarer Commit:** Knowledge und Version, Transition/Claims/Evidence, sämtliche Runtime-Komponenten, alte Pending-Auflösung, nächste Action/Evidence/Boundary, Snapshot, interne Message, Events und terminales Command Result.
10. **Explizit derived/nicht persistent:** Raw Customer Text außerhalb bestehender Message, separate Normalized-Answer-/Interpretation-Blobs, nicht gewählte Candidate-Objekte, Renderparameter, Missing Information, Readiness, Assessment (außer ID/Event-Provenienz), Provider-/AI-Payloads, Stacktraces und `previous_events`, solange ungenutzt.

Zusätzliche Invarianten: Snapshot Action/Render müssen unter dem zum Build gehörenden Schema validieren; Snapshot/Pending/Message/Command müssen Conversation, Project, Decision, Template und Versionen exakt teilen; Commit-Payload darf keine IDs außerhalb der Command-Reservierung enthalten; Knowledge-Versionsprung ist ausschließlich 0 oder 1 gemäß validierter Transition.

## 22. Recommended Implementation Packages

AP-16-06-01 bleibt als einzelnes Paket zu groß und wird ohne Änderung der Reihenfolge geteilt:

### AP-16-06-01B — Planner Snapshot Persistence

- **Ziel:** immutable Snapshot plus Pending-/Outbound-Bindung.
- **Abhängigkeiten:** bestehende Planner-/Render-Schemas und Message Authority.
- **DB:** Snapshot-Tabelle, Pending-FK/Constraints/RLS/Guards.
- **Code:** strikte Snapshot-Zod-Schemas/Mapper; keine Cycle-Ausführung.
- **Tests:** vollständiger Feld-Roundtrip, Mutation verboten, Cross-Binding/stale Template fail closed, Migration/RLS.
- **Done:** erzeugende Runtime-Operation kann Snapshot+Message+Pending atomar aktivieren.

### AP-16-06-01C — Cycle Context and ID Reservation Authority

- **Ziel:** vollständiger heuristikfreier `CustomerMessageCycleAuthority`-Read.
- **Abhängigkeiten:** 01B.
- **DB:** Command-Kontext/ID-Reservierungen, atomare Claim-/Read-RPC.
- **Code:** konkrete Read Mapper/DataSource-Claim-Seite.
- **Tests:** Retry-ID-Stabilität, Snapshot-Exactness, alle CAS-/Sequence-Gates, keine Defaults.
- **Done:** `runConversationCycle` erhält aus Persistence einen vollständig validen Context.

### AP-16-06-01D — Customer-Answer Knowledge Apply Contract

- **Ziel:** technische Customer-Answer-Transitions/Claims/Evidence ohne descriptive Vermischung.
- **Abhängigkeiten:** bestehende Knowledge State CAS, AP-15 Transition Schemas.
- **DB:** Transition-/Evidence-Provenienz und Constraints/RLS/Guards.
- **Code:** strikte Mapper/DB Shape; noch kein vollständiger Outbound Runner.
- **Tests:** apply/no-change/supersession/contradiction/reviewer protection/idempotency/stale.
- **Done:** AP-15-Transition passt beweisbar und atomar zur persistenten Knowledge Authority.

### AP-16-06-01E — Atomic Cycle Commit and Failure Authority

- **Ziel:** vollständiger Commit/Failure in einer Transaktion.
- **Abhängigkeiten:** 01B–01D.
- **DB:** Commit-/Failure-RPC, Domain Events, Lock/CAS/Replay.
- **Code:** `PersistentConversationCycleCommit` Schema/Mapper und DataSource commit/fail.
- **Tests:** Crash/Replay, jede stale Grenze, alle Result-Kinds, keine partielle Persistenz/Dublette, sanitisiertes Failure.
- **Done:** geclaimter Context kann ohne Provider vollständig terminalisiert werden.

### AP-16-06-01F — Concrete PersistentCycleDataSource

- **Ziel:** Service an Claim/Read/Commit/Failure Authorities anbinden.
- **Abhängigkeiten:** 01E.
- **DB:** keine neue Semantik.
- **Code:** server-only Adapter; keine OpenAI-/WhatsApp-Send-Integration.
- **Tests:** Integrationspfad und terminal replay.
- **Done:** `processPersistentCustomerMessage` ist providerunabhängig ausführbar.

## 23. Recommended Next Package

**AP-16-06-01B — Planner Snapshot Persistence** ist zwingend zuerst umzusetzen. Es schließt die früheste Authority-Lücke am Zeitpunkt der Prompt-Erzeugung. Ohne diesen Snapshot kann auch eine perfekte spätere Claim-/Commit-RPC nicht beweisen, welche Planner-/Render-Generation der Kunde beantwortet hat.

Danach ist die Reihenfolge 01C → 01D → 01E → 01F bindend. Kein Paket darf durch Replanning, Registry-Defaults oder OpenAI-Rekonstruktion übersprungen werden.

**AUDIT RESULT: READY**

Die fehlenden Authorities, ID-Stabilität, Knowledge-Grenze und atomare Commit-Struktur sind konkret festgelegt. Das nächste Paket kann ohne neue Domain-Semantik implementiert werden.
