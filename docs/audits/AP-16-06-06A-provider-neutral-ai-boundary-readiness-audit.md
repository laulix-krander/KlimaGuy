# AP-16-06-06A — Provider-Neutral AI Boundary Readiness Audit

## 0. Audit-Metadaten und Ergebnis

| Feld | Wert |
|---|---|
| Audit-Typ | Reiner Architektur- und Readiness-Audit; keine Produktänderung |
| Branch | `codex/ap16-06-06a-provider-neutral-ai-boundary-readiness-audit` |
| Baseline | `8722c49829229f8414819933a06bcf2f2dfcffe9` (`Merge pull request #182 from laulix-krander/codex/behebe-first-contact-runtime-guard-fehler`) |
| Artefakt | `docs/audits/AP-16-06-06A-provider-neutral-ai-boundary-readiness-audit.md` |
| Ergebnis | **READY** |
| OpenAI implementiert | **NEIN** |
| Neue Persistenz erforderlich | **NEIN** für den ersten Use Case |
| Product Decision Required | **NEIN** |
| READY FOR AP-16-06-06B | **JA** |

Die kleinste saubere erste AI Boundary liegt **nach** der bestehenden deterministischen, an den ausstehenden Prompt gebundenen `normalizeCustomerAnswer(...)`-Stufe und **vor** der bestehenden deterministischen Claim-/Transition-Erzeugung in `interpretNormalizedAnswer(...)`. Sie wird ausschließlich für noch nicht eindeutig durch das serverseitige Mapping-Register klassifizierbare **freie Textantworten auf eine bekannte, aktuell ausstehende Frage** aufgerufen. Ihr Ergebnis ist lediglich ein schema-validiertes, enges semantisches Proposal (zum Beispiel ein kanonischer Wert aus der für `building_type` zugelassenen Wertemenge), niemals ein `KnowledgeClaimProposal`, eine State Transition oder eine auszuliefernde Antwort.

Diese Position folgt unmittelbar aus dem Repository: Der produktive Service komponiert erst die gespeicherte Nachricht mit dem persistierten Planner-Snapshot, normalisiert sie deterministisch und übergibt das Ergebnis dann an den vollständig deterministischen Conversation Cycle. Im Cycle erzeugt `interpretNormalizedAnswer(...)` Claims anhand eines serverseitigen Registers; danach folgen State Apply, Missing Information, Assessment, Planner und Renderer. Der erste AI-Aufruf darf daher nur die heute enge lexikalische Lücke zwischen validiertem Freitext und registrierter kanonischer Bedeutung schließen. Alle nachfolgenden Authorities bleiben unverändert.

## 1. Scope und verbindlicher Produktstand

Als Authority werden die im Auftrag genannten produktiven Fakten übernommen: WhatsApp Webhook, Customer-/Project-/Conversation-Foundation, Runtime, First-Contact-Recovery, deterministischer Planner und Renderer, atomarer First-Contact-Commit, Outbound/Delivery Command und produktive WhatsApp-Auslieferung funktionieren. Der erste reale Kunde erhält deterministisch `Um welche Gebäudeart handelt es sich?`. Diese Tatsachen werden hier nicht erneut als Produktionsnachweis geprüft.

Der Audit hat ausschließlich vorhandenen Code, Schemas, Tests, Migrationen und Repository-Konventionen gelesen. Er hat insbesondere **nicht**:

- OpenAI oder einen anderen Provider integriert;
- ein SDK, einen API-Key, Environment-Variablen oder ein Modell ausgewählt;
- Planner, Renderer, Runtime, Webhook, Recovery, Delivery, WhatsApp oder First Contact verändert;
- eine Migration oder produktive Inference-Aktivierung erstellt;
- Pricing-, Offer-, Review- oder Media-Authority verändert.

## 2. Konkrete Boundary-Entscheidung

### 2.1 Exakte Lage

Der spätere produktive Ablauf soll an der relevanten Stelle so aussehen:

```text
gespeicherte Inbound-Textnachricht
  -> Authority Context + persistierter Planner-Snapshot
  -> normalizeCustomerAnswer(...)                  [deterministisch]
  -> interpretCustomerAnswer(...)                  [Domain Operation]
       -> vorhandenes exaktes Registry-Mapping     [zuerst, deterministisch]
       -> nur bei eligible freiem Text:
          generateStructuredInference(...)         [Provider Port]
       -> Zod-Parse des externen Resultats          [deterministisch]
       -> Allowlist-/Binding-/Versionsprüfung       [deterministisch]
       -> interpretNormalizedAnswer(...) bzw.
          enger deterministischer Mapping-Pfad     [Domain Authority]
  -> applyStateTransitionProposal(...)             [deterministisch]
  -> bestehender restlicher Cycle                  [deterministisch]
  -> atomarer Commit                               [DB Authority]
```

`interpretCustomerAnswer(...)` ist die use-case-spezifische Domain Boundary. Sie entscheidet, ob überhaupt Inference zulässig ist, minimiert den Context, ruft den Port auf und validiert das Proposal. `generateStructuredInference(...)` ist der darunterliegende provider-neutrale Transport-Port. Die Domain-Operation darf **nicht** als generische Chat- oder Textgenerierungsfunktion gestaltet werden.

### 2.2 Warum nicht an einer anderen Stelle?

- **Vor Normalization:** zu früh. Dann müsste das Modell Binding, Answer Contract, Leerwerte, Längen, `unknown`/`skip`, Zahlen, Einheiten und Boolesche Antworten interpretieren. Diese Regeln existieren bereits deterministisch und müssen Authority bleiben.
- **Als Erzeuger vollständiger Knowledge Claims:** zu breit. IDs, Provenance, Entity Binding, Versionssprünge, Supersession, Widersprüche und geschützte Reviewer-Korrekturen sind vorhandene Domain Authority.
- **Nach Planner:** ungeeignet für den ersten Use Case. Der Renderer produziert bereits kontrollierte deutsche Templates; eine Sprachschicht dort behebt nicht die konkrete Freitext-Interpretationslücke.
- **Im Webhook oder WhatsApp Adapter:** falsche Schicht. Transportidentitäten und Telefonnummern würden unnötig in die AI Boundary gelangen; Recovery und Domain Binding wären umgangen.
- **Im Commit oder Delivery-Pfad:** ausdrücklich verboten. Dort dürfen nur bereits validierte und deterministisch autorisierte Cycle-Ergebnisse verarbeitet werden.

### 2.3 Klassifikation der untersuchten Bereiche

Legende: **A** = AI-frei/deterministisch; **B** = AI darf später Input liefern, Authority bleibt deterministisch; **C** = erster geeigneter Inference Point; **D** = ungeeignet/ausdrücklich verboten.

| Bereich | Klasse | Begründung |
|---|---:|---|
| Inbound Message Processing/Persistence | A / D für AI | Signatur, Parsing, Deduplikation und Persistenz sind Transport-/DB-Authority. |
| Inbound Message Composition | A | Verbindet gespeicherte Nachricht mit Snapshot, IDs, Sequence und Pending Interaction. |
| Customer Answer Normalization | A | Answer Contract, Bindings, Sonderwerte, Zahl/Einheit/Boolean und Grenzen sind bereits deterministisch. |
| Freitext-Klassifikation nach Normalization | **C** | Kleinster Inference Point: kanonischen Wert aus einer operation-spezifischen Allowlist vorschlagen. |
| Customer Answer Interpretation | B | Domain-Operation darf AI-Proposal konsumieren; Binding und endgültige Interpretation bleiben deterministisch. |
| Knowledge Claim Proposal | B | Nur indirekt aus validierter Semantik durch vorhandene Domain-Regeln; das Modell erzeugt keinen Claim. |
| Knowledge Apply / State Transition | A / D | Versions-, Widerspruchs-, Supersession- und Reviewer-Schutz-Authority. |
| Evidence Interpretation | B, nicht erster Use Case | Später denkbar als Proposal; Media bleibt hier vollständig out of scope. |
| Intermediate Assessment | A | Reine Ableitung aus validiertem Knowledge State. |
| Missing Information / Readiness | A | Registry- und zustandsbasierte Domain-Ableitung. |
| Planner | A / D | Next Question/Action bleibt deterministische Authority. |
| Renderer | A / D für ersten Use Case | Kontrollierte Templates bleiben Authority; keine direkte Reply Generation. |
| Persistent Runtime/Snapshot/Pending Interaction | A / D | Ausschließlich atomarer Commit validierter Cycle-Daten. |
| First Contact | A | Deterministischer Bootstrap bleibt unverändert. |
| Outbound Persistence/Delivery/WhatsApp | A / D | Kein Model Output darf Message oder Delivery Command direkt erstellen oder versenden. |
| Pricing/Offer/Human Review | D | AI besitzt weder Preis-, Angebots- noch Freigabe-Authority. |

## 3. Tatsächlicher produktiver Conversation-Cycle Call Graph

### 3.1 Gesamtgraph ab gespeicherter Inbound Message

```text
Meta webhook
  -> createWhatsAppWebhookHandlers().POST
  -> parseWhatsAppWebhook
  -> persistWhatsAppInboundText
       -> RPC ingest_whatsapp_inbound_text
       -> { internal_message_id, conversation_id, cycle_eligible, ... }
  -> wenn cycle_eligible: triggerPersistentMessageCycle({ message_id })
       -> createProductiveCycleRuntime()
       -> runPersistentCustomerMessageCycle(...)
            -> createPersistentCycleDataSource(owner, 5-minute lease)
            -> processPersistentCustomerMessage(...)
                 -> claimCustomerMessage(message_id)
                      -> RPC acquire_customer_message_cycle_execution
                      -> terminal replay ODER
                      -> loadCustomerMessageCycleAuthority(command_id)
                           -> RPC get_customer_message_cycle_context
                           -> validate command/message/pending/snapshot/context
                 -> compose RawCustomerAnswer from persisted Message + Snapshot
                 -> normalizeCustomerAnswer(...)
                 -> runConversationCycle(...)
                      -> validate ConversationCycleContext
                      -> interpretNormalizedAnswer(...)
                      -> applyStateTransitionProposal(...)
                      -> applyRetryOutcome / applyCustomerEffortOutcome
                      -> applyInformationCollectionOutcome
                      -> deriveMissingInformation / deriveReadiness
                      -> buildIntermediateAssessment
                      -> planNextAction
                      -> optional planEvidenceRequest
                      -> renderQuestionTemplate
                      -> deriveConversationEvents
                 -> human review completion ODER
                 -> commitCustomerMessageCycle(...)
                      -> validate every calculated artifact with Zod
                      -> composeRenderedCustomerText
                      -> RPC commit_customer_message_cycle (one transaction)
                           -> Knowledge transition
                           -> runtime revision/snapshot
                           -> pending interaction
                           -> outbound message + delivery command (if applicable)
       -> runImmediateWhatsAppDelivery, only for committed outbound ID and time budget
            -> runRecoverableWhatsAppDelivery
                 -> acquire -> revalidate -> authorize -> Meta send -> complete

Recovery route
  -> discover_recoverable_conversation_cycles
  -> for each source_message_id: same runPersistentCustomerMessageCycle path
```

First Contact ist ein separater Bootstrap: Bei noch nicht `cycle_eligible`er Inbound-Nachricht prüft der Webhook Eligibility und komponiert Foundation, deterministische Initial-Assessment/Planner/Renderer-Ausführung und atomaren Initial-Prompt-Commit. Erst eine spätere Kundenantwort auf dessen persistierte Pending Interaction läuft durch den oben beschriebenen regulären Cycle.

### 3.2 Schrittweise Authority-, State- und Failure-Tabelle

| Schritt | Input | Output | Art / State | Authority Owner | Failure | Retry / Recovery |
|---|---|---|---|---|---|---|
| Inbound RPC | validiertes WhatsApp Text Event inkl. Providertransportdaten | interne Message-/Conversation-IDs, `cycle_eligible` | deterministisch; persistiert | Ingestion RPC | Exception bei RPC/Schemafehler; Webhook sendet keinen ungeprüften State weiter | Provider-Duplikat wird persistent dedupliziert; gespeicherte Nachricht bleibt final |
| Cycle Trigger | ausschließlich interne `message_id` | Runner Result | deterministisch; in-memory | serverseitige Ingestion-Orchestrierung | Triggerfehler wird geschluckt, weil Persistence final ist | persistente Cycle Recovery übernimmt |
| Acquire/Claim | Message ID, Execution Owner, Lease | Command oder terminaler Replay | deterministisch; persistiert | `acquire_customer_message_cycle_execution` | controlled error, busy, stale oder persistence failure | fünfminütige Lease; Discovery findet recoverable Commands; Replay verhindert Doppelcommit |
| Context Read | Command ID | `CustomerMessageCycleAuthority` | deterministisch; DB read + in-memory | Context-Read RPC plus TypeScript Validator | unvollständige/stale/mismatched Authority wird abgelehnt | recheck/stale; kein Domain-Lauf mit inkonsistentem Snapshot |
| Inbound Composition | Message, Snapshot, Pending Interaction | `RawCustomerAnswer` | deterministisch; in-memory | `processPersistentCustomerMessage` | falsche Richtung/Actor/Kind/Sequence endet controlled | terminal bzw. recheck gemäß Failure Class |
| Normalization | Raw Answer, `RenderedCustomerInteraction`, attempt 1 | `NormalizedCustomerAnswer` | deterministisch; in-memory | `normalizeCustomerAnswer` + Answer Contract | konkreter Normalization Code; Command wird `normalization_failed` | heute technisch retryable; identischer Input bleibt deterministisch |
| Interpretation | Normalized Answer + selected action + knowledge/version/IDs | `StateTransitionProposal` | deterministisch; in-memory | Registry + `interpretNormalizedAnswer` | Mapping-, Binding-, Conflict- oder Review Failure | Cycle failure oder Human Review; IDs/Idempotency Key sind command-stabil |
| Knowledge Apply | Proposal + current Knowledge State | Apply Result + next State | deterministisch; in-memory | `applyStateTransitionProposal` | invalid transition, protected review, contradiction, version failure | kein Persistieren; Cycle failure/recovery |
| Retry/Effort/Collection | Interpretation outcome + previous states | neue bounded states | deterministisch; in-memory | Conversation Domain | invariant/schema failure | kein Partial Commit |
| Missing/Readiness | next Knowledge State | Missing list/readiness | deterministisch; in-memory | readiness registry/functions | nach gültigem State kein externer Failure-Pfad | bei gesamtem Cycle erneut ableitbar |
| Assessment | next State + command-vorgegebene ID/time/version | Assessment | deterministisch; in-memory | `buildIntermediateAssessment` | controlled cycle failure | gesamter Cycle kann erneut laufen |
| Planner | State, assessment, missing, retry/effort/evidence context | selected action oder stop | deterministisch; in-memory | `planNextAction` | planner failure/replanning flags | gesamter Cycle mit gleicher Authority erneut |
| Renderer | ausgewählte Action, locale/version, kontrollierte Parameter | `RenderedCustomerInteraction` | deterministisch; in-memory | Template Registry + Renderer | template failure | kein Outbound; gesamter Cycle erneut |
| Events | Interpretation/Apply/Result + reservierte IDs | Domain Events | deterministisch; in-memory | Domain Event Derivation | cycle failure | kein Partial Commit |
| Commit Validation | kompletter `ConversationCycleSuccess` | validierter RPC Payload/Text | deterministisch; in-memory | serverseitiger Commit Adapter/Zod | invalid calculated artifact wird `cycle_failed` | nichts fachlich persistiert |
| Atomic Cycle Commit | Command/source/pending IDs, expected revisions, Cycle | Knowledge/runtime/snapshot/pending/outbound/delivery IDs | deterministisch; persistiert in einer Transaktion | DB RPC | stale/ownership/invariant/persistence controlled failure | Command Replay und optimistic revisions verhindern Doppelwirkung |
| Human Review Completion | controlled Review Cycle Result | terminal `human_review_required` | deterministisch; persistiert | DB RPC; keine automatische Approval | persistence/ownership failure | recoverable; kein Outbound als AI-Entscheidung |
| Immediate Delivery | committed Outbound ID + verbleibendes Requestbudget | Started/deferred | externer Provider; Delivery State persistiert | Delivery Runner + Meta Adapter | pre-dispatch failure, ambiguous post-dispatch, classified provider failure | eigener Claim/Lease/Dispatch Token/Attempt und Delivery Recovery |

Wichtig für die AI Boundary: Bis zum atomaren Commit ist der gesamte berechnete Cycle nur in-memory. Es gibt keine partielle Knowledge- oder Runtime-Mutation. Genau diese Eigenschaft erlaubt eine proposal-only Inference innerhalb des geclaimten Cycle, ohne einen neuen persistenten AI Command einzuführen.

## 4. First Contact bleibt AI-frei

`initializeFirstContactPrompt(...)` konstruiert für den leeren Knowledge State deterministisch Missing Information und Assessment, lässt den existierenden Planner eine Action wählen, rendert das registrierte Template, validiert den Snapshot und committet IDs, Pending Interaction, Outbound Message und Delivery Command atomar. Für keine dieser Aufgaben fehlt semantischer Input: Es gibt noch keine Kundenantwort zu interpretieren.

Ein AI-Aufruf im Bootstrap würde daher:

- keine fachliche Lücke schließen;
- zusätzliche Latenz und einen neuen externen Failure Mode vor die erste Antwort setzen;
- den nachgewiesenen deterministischen Wortlaut gefährden;
- Recovery und Idempotency ohne Nutzen komplexer machen.

Der Bootstrap soll unverändert bleiben. Der **frühestmögliche sinnvolle** AI-Aufruf ist nach dem First Contact, wenn die gespeicherte Kundenantwort auf `ask_building_type` den regulären Cycle erreicht, deterministisch als gültiger Text normalisiert wurde und das exakte Canonical-Register keinen eindeutigen Treffer liefert. Exakte registrierte Antworten wie `Wohnung` oder `Einfamilienhaus` benötigen weiterhin keinen Provider Call. Ein Ausdruck wie `Dachgeschosswohnung` ist sogar als UI-Beispiel vorhanden, aber nicht selbst als Canonical-Key registriert; dies belegt die konkrete schmale Klassifikationslücke, ohne daraus Modell-Authority abzuleiten.

## 5. Genau ein erster AI Use Case

### Auswahl

**Strukturierte Klassifikation einer normalisierten freien Kunden-Textantwort auf die aktuell ausstehende, gebundene Frage in genau einen zugelassenen kanonischen Antwortwert oder `no_match`.**

Erste Operation: `customer_answer.canonical_classification.v1`, zunächst für bestehende aktive Text-Mappings wie `building_type` (und nur nach expliziter serverseitiger Allowlist-Freigabe je `information_key`).

### Warum dieser Use Case der kleinste sinnvolle ist

1. Der Context ist durch Pending Interaction, Snapshot, Decision, Template, Locale, Entity und Knowledge Version bereits eng gebunden.
2. Deterministic-first bleibt möglich: bestehende Normalization und exakte Registry-Treffer laufen ohne AI.
3. Das Resultat kann auf eine kleine vorhandene Canonical-Value-Menge begrenzt werden.
4. Die vorhandene Interpretation kann aus dem validierten kanonischen Wert deterministisch Evidence-/Claim-/Transition-Metadaten, IDs und Versionsbezug erzeugen.
5. Bei Timeout, Refusal, ungültigem Output oder `no_match` gibt es keine Partial Mutation. Die Operation kann technisch erneut versucht oder kontrolliert an Human Review gegeben werden.
6. Der Use Case benötigt weder historischen Chatverlauf noch Telefonnummer, WhatsApp-ID, Angebot, Medien oder Mitarbeiterdaten.

Nicht gewählt werden allgemeine Extraktion mehrerer Claims, freie Knowledge-Claim-Erzeugung, Next Question Planning, Renderer/Reply Generation, Pricing, Offer Authority, Review Decision oder direkte Persistenz. Diese Optionen vergrößern Output- und Authority-Fläche ohne Not.

## 6. Zwei notwendige Contract-Ebenen

### 6.1 Domain AI Operation

Der Conversation-Code soll nur die fachliche Operation kennen:

```ts
type CustomerAnswerClassificationInputV1 = Readonly<{
  operation: "customer_answer.canonical_classification";
  operationVersion: 1;
  schemaVersion: 1;
  locale: "de";
  correlation: Readonly<{
    correlationId: string;
    conversationId: string;
    answerId: string;
    decisionId: string;
  }>;
  question: Readonly<{
    informationKey: PropertyKey;
    semanticMode: QuestionSemanticMode;
    templateKey: string;
    templateVersion: number;
  }>;
  answer: Readonly<{
    text: string;
  }>;
  allowedValues: readonly Readonly<{
    key: string;
    label: string;
  }>[];
}>;

type CustomerAnswerClassificationProposalV1 = Readonly<{
  schemaVersion: 1;
  result: "matched" | "no_match" | "ambiguous";
  canonicalValue?: string;
}>;

interface CustomerAnswerInterpreter {
  interpretCustomerAnswer(
    input: CustomerAnswerClassificationInputV1,
  ): Promise<CustomerAnswerClassificationProposalV1>;
}
```

Der tatsächliche AP-16-06-06B-Contract sollte für `matched` eine discriminated union verwenden, sodass nur dieser Zweig `canonicalValue` besitzt. Der Contract enthält bewusst keine Confidence-Zahl als Authority: providerübergreifend ist sie nicht kalibriert und darf keine Freigabeentscheidung steuern. `no_match` und `ambiguous` dürfen keinen Claim erzeugen.

Die Domain Operation:

- validiert Input und Binding;
- versucht zuerst das bestehende deterministische Mapping;
- erlaubt AI nur für freigeschaltete Text-Properties;
- bildet Canonical Allowlist und minimale Instructions serverseitig;
- validiert Transportresultat und Proposal;
- prüft `canonicalValue` erneut gegen die **serverseitig erzeugte** Allowlist;
- gibt nur das enge Proposal an die deterministische Interpretation weiter.

### 6.2 Provider Transport Port

Darunter ist ein schmaler strukturierter Inference-Port sinnvoll. Er verhindert, dass ein späterer zweiter Provider die Domain Operation neu implementieren muss:

```ts
type AiOperationKey = "customer_answer.canonical_classification";

type StructuredInferenceRequest = Readonly<{
  operationKey: AiOperationKey;
  operationVersion: 1;
  inputSchemaVersion: 1;
  outputSchemaVersion: 1;
  locale: "de";
  correlation: Readonly<{
    correlationId: string;
    conversationId: string;
    attempt: number;
  }>;
  instructions: Readonly<{
    templateKey: string;
    version: 1;
  }>;
  input: unknown; // vor Port-Aufruf durch operation-spezifisches Zod-Schema validiert
}>;

type StructuredInferenceSuccess = Readonly<{
  success: true;
  state: "completed";
  output: unknown; // unmittelbar nach Rückkehr operation-spezifisch parsen
  usage?: Readonly<{
    inputUnits?: number;
    outputUnits?: number;
    totalUnits?: number;
  }>;
  diagnostics: Readonly<{
    latencyMs: number;
    attempt: number;
  }>;
}>;

type AiInferenceFailureClass =
  | "transient_provider_failure"
  | "timeout"
  | "invalid_structured_output"
  | "refused"
  | "unsupported"
  | "configuration_failure"
  | "permanent_provider_failure";

type StructuredInferenceFailure = Readonly<{
  success: false;
  state: "failed";
  failureClass: AiInferenceFailureClass;
  retryable: boolean;
  diagnostics: Readonly<{
    latencyMs: number;
    attempt: number;
    schemaValidation: "not_run" | "valid" | "invalid";
  }>;
}>;

interface StructuredInferenceProvider {
  generateStructuredInference(
    request: StructuredInferenceRequest,
  ): Promise<StructuredInferenceSuccess | StructuredInferenceFailure>;
}
```

`unknown` steht nur an der externen Transportgrenze. Die Domain Operation muss es sofort mit dem output-versionierten Zod-Schema parsen; es darf nicht weiter in Domain Types gelangen. Alternativ kann AP-16-06-06B den Port generisch typisieren, sofern kein unsicherer Cast und kein Provider-Type-Leak entsteht. Der Port ist **kein** öffentlicher Universal-Chat-Service und akzeptiert weder beliebige Prompts noch beliebige Tool Calls.

Beide Ebenen sind nötig: Nur eine generische Provider-Schnittstelle würde Providerneutralität liefern, aber die Domain-Policy (Eligibility, Minimaldaten, Allowlist, Fallback) verstreuen. Nur eine Domain-Schnittstelle würde jeden Adapter zwingen, Prompt-, Schema- und Error-Übersetzung erneut mit Domain-Regeln zu vermischen.

Domain-Code kennt ausdrücklich weder OpenAI, Modellnamen, API-Oberflächen, Tokenbegriffe, Provider Request IDs noch SDK Types. Die im Transport optionalen `usage`-Einheiten sind absichtlich providerneutral und nicht fachlich auswertbar.

## 7. Structured Output und deterministische Validation Authority

Das Repository verwendet an allen externen und persistenten Grenzen Zod `safeParse`/`parse`, häufig `.strict()`, discriminated unions, UUID-/Version-Schemas und zusätzliche Cross-Field-Invarianten. Dieses Muster ist verbindlich.

Validation erfolgt zweimal:

1. **Adaptergrenze:** Der Provider Adapter übersetzt die Providerantwort in JSON/unknown, prüft das erwartete strukturierte Format und mappt Providerfehler. Provider-SDK-Objekte verlassen den Adapter nicht.
2. **Domain-Operationsgrenze:** Das operation-spezifische, versionierte Zod-Schema parst das `unknown` erneut. Danach werden Operation/Schema-Version, Information Key, Answer/Decision Binding und Canonical Allowlist deterministisch geprüft.

Bestehende Schemas sollen gezielt wiederverwendet, aber nicht als Model-Output-Schema missbraucht werden:

- `normalizedCustomerAnswerSchema` bleibt Input Authority und wird nicht vom Modell erzeugt.
- `knowledgeClaimProposalSchema`, `stateTransitionProposalSchema` und `interpretationResultSchema` bleiben **downstream Domain Schemas**. Sie sind zu mächtig als AI Output, weil sie IDs, State Versions, Provenance, Supersession und epistemischen Status enthalten.
- Für AI Output ist ein neues kleines `customerAnswerClassificationProposalV1Schema` erforderlich.
- Das vorhandene Registry-Mapping beziehungsweise eine daraus deterministisch abgeleitete Canonical Allowlist bleibt die Value Authority.

Nach erfolgreichem Parse bleiben zwingend: Binding zum ausstehenden Decision/Template, Property-/Entity-Regel, Current State Version, Idempotency Key, Claim-/Evidence-ID-Vorgaben, Widerspruchserkennung, Reviewer-Schutz, Supersession, `applyStateTransitionProposal`, Missing/Readiness, Assessment, Planner, Renderer und Commit-Schema-Validation.

Model Output ist ausschließlich ein Proposal. Er darf niemals direkt Knowledge State, Runtime, Pending Interaction, Snapshot, Outbound Message, Delivery Command oder Audit-/Review-State schreiben.

## 8. Prompt Authority und Versionierung

Operation Instructions gehören serverseitig zur use-case-spezifischen AI Operation, nicht in Domain Entities, Client-Code, Environment-Variablen oder den Provider Adapter. Der Adapter soll transportieren, nicht fachliche Prompt Authority besitzen. In Analogie zu den versionierten Template-/Mapping-Registern wird empfohlen:

```text
lib/server/ai/operations/customer-answer-classification/
  instructions.ts
  schemas.ts
  operation.ts
```

Minimaler Instructions Contract:

```ts
type AiOperationInstructions = Readonly<{
  operationKey: "customer_answer.canonical_classification";
  operationVersion: 1;
  inputSchemaVersion: 1;
  outputSchemaVersion: 1;
  instructionTemplateKey: "customer_answer_canonical_classification_de";
  instructionTemplateVersion: 1;
}>;
```

Die kleine Instruction sagt sinngemäß nur: klassifiziere den gegebenen Text ausschließlich in einen gelieferten Wert oder `no_match`/`ambiguous`, erfinde nichts, führe keine Aktionen aus. Der Audit schreibt keinen finalen Prompt. Jede semantische Änderung erhöht `operationVersion` beziehungsweise `instructionTemplateVersion`; Schemaänderungen erhöhen die jeweilige Schema-Version. Versionswerte sind Code Authority, nicht frei konfigurierbare Env-Werte.

## 9. Providerkonfiguration und späterer Env Contract

Provider-spezifisch und ausschließlich unter `lib/server/ai/providers/openai/` bleiben später:

- Credential;
- Modellkennung;
- API-/structured-output mode;
- Request Timeout;
- Adapter-interne Retry-Grenzen/Backoff;
- maximale Provider-Ausgabe;
- Provider Endpoint, falls überhaupt konfigurierbar;
- Provider Request IDs, native Finish Reasons, native Usage und SDK Errors;
- Übersetzung des neutralen Schemas in das Providerformat.

Diese Konfiguration darf weder in `lib/domain/conversation-intelligence`, `ConversationCycleContext`, Knowledge State, Planner, Renderer noch in persistierte fachliche Snapshots leaken.

Voraussichtlicher späterer OpenAI-Adapter-Env-Contract (nur Vorschlag; jetzt nicht angelegt):

| Variable | Status | Zweck |
|---|---|---|
| `OPENAI_API_KEY` | required für aktivierten OpenAI Adapter | serverseitiges Provider Credential |
| `OPENAI_MODEL` | optional/configurable, Adapter mit explizitem sicheren Default oder Startfehler | Modellkennung; keine Domain Authority |
| `OPENAI_TIMEOUT_MS` | optional | begrenztes Request Timeout unterhalb der Cycle Lease/Route Budgets |
| `OPENAI_MAX_OUTPUT_UNITS` | optional | adapterseitige Ausgabebegrenzung |
| `AI_DIAGNOSTICS_LEVEL` | optional | ausschließlich `off`/safe metadata; niemals Raw Payload Logging |

Retry sollte primär von der provider-neutralen Failure Class und dem umgebenden Cycle kontrolliert werden; ein Adapter darf nur eng begrenzte, pre-response Transport-Retries ausführen. Eine freie `OPENAI_RETRY_COUNT`-Einstellung darf die Cycle-Laufzeit oder semantische Attempts nicht unkontrolliert vervielfachen. Kein Wert erhält ein `NEXT_PUBLIC_`-Präfix. Credentials werden mit Zod im server-only Adapter validiert und nie geloggt.

## 10. Observability

Minimale provider-neutrale Diagnostic Events:

| Feld | Inhalt |
|---|---|
| `operation_key` / `operation_version` | stabile Operation und Version |
| `correlation_id` | vorhandene Cycle Correlation ID |
| `conversation_id` | interne UUID; kein Transport-Identifier |
| `attempt` | Cycle-/Inference-Attempt |
| `outcome` | `success` oder neutrale Failure Class |
| `latency_ms` | monotone Requestdauer |
| `schema_validation` | `not_run`, `valid`, `invalid` |
| `input_size_bucket` | optional grobe Größe, niemals Text |
| `output_result` | optional `matched`/`no_match`/`ambiguous`, kein Kundentext |

Nicht loggen: Kundentext, vollständige Prompts, Telefonnummern, WhatsApp Sender-/Message-IDs, Credentials, Providerpayloads, technische Projektdetails, Mitarbeiterdaten oder Modelantworten. Provider Request ID und native Providerdiagnostik dürfen ausschließlich im Adapter-/Diagnostics-Layer bleiben und nur dann in geschützter Telemetrie erscheinen, wenn dies datenschutzseitig freigegeben ist; sie werden nicht Teil von Domain Result, Runtime oder Audit Authority.

Ein Diagnostics Failure darf niemals das fachliche Ergebnis verändern. Bestehende content-free Recovery-Summaries sind das Vorbild.

## 11. Retry, Recovery und Idempotency

### 11.1 Innerhalb des recoverable Cycle?

**Ja.** Die Inference gehört als in-memory Berechnung in den bereits geclaimten recoverable Conversation Cycle, nach Context Read/Normalization und vor Domain Apply. Das bestehende Command reserviert stabile Correlation-, Interpretation-, Transition-, Claim-, Evidence-, Apply-, Assessment-, Planner- und Event-IDs. Der Commit prüft erwartete Runtime-/Knowledge-Versionen und schreibt die gesamte Generation atomar.

### 11.2 Eigener persistenter AI Command?

**Nein, nicht für diesen ersten Use Case.** Inference hat keine eigene externe fachliche Wirkung. Vor dem Cycle Commit existiert nur ein Proposal in-memory; ein Crash verliert es ohne Partial Mutation. Ein persistenter Inference Command würde eine neue State Machine, PII-Retention und Reconciliation Authority schaffen, obwohl die bestehende Cycle Idempotency ausreicht.

### 11.3 Timeout nach Providerantwort, vor Domain-Commit

Wenn der Adapter die Antwort wegen Timeout nicht kontrolliert zurückgibt oder der Prozess danach abstürzt, bleibt kein Domain-Ergebnis persistiert. Die Cycle Lease läuft aus; Recovery übernimmt denselben source message command. Eine erneute Inference ist erlaubt. Anders als Delivery hat die Providerantwort keine externe Kundenwirkung und benötigt daher keine Ambiguous-Dispatch-Reconciliation.

### 11.4 Invalides Output

Adapter oder Domain-Zod-Parse mappt es auf `invalid_structured_output`. Es entsteht kein Claim und kein Commit. Innerhalb eines einzelnen Runner-Aufrufs darf höchstens die ausdrücklich definierte bounded Retry-Policy greifen; anschließend wird der Cycle technisch fehlgeschlagen und über bestehende Recovery erneut versucht. Wiederholt invalides/unsupported/ambiguous Ergebnis muss kontrolliert Human Review auslösen, statt Input zu erfinden oder den Planner zu umgehen. Die genaue technische Schwelle ist Implementierungsdetail von 06D, darf aber vorhandene `maximum_attempts`/Human-Review-Semantik nicht überschreiben.

### 11.5 Darf ein Retry semantisch anders antworten?

Ein Provider kann trotz identischem Input ein anderes Proposal liefern; der Contract darf Determinismus nicht vortäuschen. Zulässig ist dies nur, weil:

- der Output auf dieselbe kleine Allowlist begrenzt ist;
- ein Proposal allein keine Wirkung hat;
- nur der erste atomar committete, versionsgebundene Domain-Übergang Authority erhält;
- terminaler Command Replay keine erneute Inference ausführt;
- `ambiguous`/`no_match` keine Knowledge-Mutation erzeugen.

06D muss Requestinput, Operation-/Instruction-/Schema-Version und Allowlist für jeden Retry identisch aus der persistenten Cycle Authority rekonstruieren. Ein Retry darf nicht still ein anderes Modellprompt oder Schema verwenden. Besteht fachliche Mehrdeutigkeit, ist Human Review die sichere Auflösung. Es ist **keine** neue Persistenzentscheidung nötig; falls später mehrere Claims, lange Workflows, Kostenbuchung oder asynchrone Inference eingeführt werden, ist ein neuer Audit für persistente Inference Commands erforderlich.

Die aktuelle fünfminütige Lease wurde für den netzwerkfreien Cycle festgelegt. 06D muss einen deutlich kleineren Provider-Timeout und Routebudget-Kompatibilität testen. Es darf Lease oder Recovery Scheduler nicht nebenbei ändern; reicht das Budget nicht, ist Activation neu zu entscheiden.

## 12. Security- und Datenboundary

### 12.1 Minimale Payload des ersten Use Cases

An den Provider dürfen nur gesendet werden:

- der bereits durch Längen-/Binding-Regeln validierte Textwert der **einen** aktuellen Kundenantwort;
- Locale `de`;
- semantischer Question/Information Key und eine kurze operation-spezifische Beschreibung;
- die kleine serverseitige Liste erlaubter kanonischer Werte/Labels;
- Operation-, Instruction- und Schema-Version;
- ein adapterseitig erzeugter, nicht rückauflösbarer Request-Correlation-Wert, falls technisch erforderlich.

Die Domain-internen Correlation-/Conversation-IDs werden für lokale Diagnostik benötigt, müssen aber nicht an den Provider übertragen werden. Der Provider Request soll keine internen UUIDs enthalten, sofern das SDK keinen lokalen opaque identifier verlangt; in diesem Fall ist ein kurzlebiges, adapterinternes Pseudonym zu verwenden.

### 12.2 Datenkategorien

| Kategorie | Erster Use Case | Regel |
|---|---:|---|
| Kundentext | **JA, minimal** | nur die einzelne gebundene Antwort; keine Chat-Historie |
| Technische Projektdaten | NEIN | nicht nötig; Question Key/Allowlist genügt |
| Telefonnummer | **ausgeschlossen** | niemals für Klassifikation erforderlich |
| WhatsApp Provider-/Message-/Sender-IDs | **ausgeschlossen** | Transportdetails bleiben im WhatsApp Layer |
| Interne UUIDs | nicht an Provider | lokal für Binding/Diagnostics; wenn nötig pseudonymisieren |
| Nutzer-/Mitarbeiterdaten | **ausgeschlossen** | kein Operationsbedarf |
| Angebots-/Preis-/Kalkulationsdaten | **ausgeschlossen** | außerhalb Use Case und AI Authority |
| Fotos/Media/URLs/Metadaten | **ausgeschlossen** | Text-only; Vision ausdrücklich out of scope |
| Knowledge State/Claims | **ausgeschlossen** | für Canonical Classification nicht erforderlich |
| Secrets/Service Role | **ausgeschlossen** | nur der Adapter besitzt sein Providercredential |

Kundentext kann personenbezogene Angaben enthalten, auch wenn die Frage nur nach Gebäudeart fragt. Deshalb muss die produktive Aktivierung die Provider-Datenverarbeitung organisatorisch freigegeben haben; architektonisch ist die Payload bereits minimiert. Dieser Audit setzt die im Auftrag gewünschte Provider-Nutzung als zulässiges Ziel voraus und trifft keine Rechtsberatung.

## 13. Media explizit out of scope

Die erste Operation akzeptiert ausschließlich `answer.text: string`; keine Union mit Bild, URL, Blob oder Media ID. Erweiterbarkeit entsteht durch **neue operation keys und eigene versionierte Input-/Output-Schemas**, nicht durch Aufweichen dieser Operation zu multimodalem `unknown`. Eine spätere Operation wie Evidence-/Image-Interpretation benötigt einen separaten Audit zu Storage Access, Retention, Provenance, Human Review und Claim Strength. Der generische Transport-Port kann später weitere strikt registrierte operation keys aufnehmen; 06B/C implementieren dennoch nur Text-Inference.

## 14. Decision Matrix

| Concern | Current Owner | Future AI Role | AI Authority? | Provider Specific? |
|---|---|---|---:|---:|
| Inbound persistence | WhatsApp ingestion RPC | keine | NEIN | WhatsApp ja; AI nein |
| Customer answer composition | Persistent Cycle Service + Snapshot | keine | NEIN | NEIN |
| Customer answer interpretation | Interpretation Registry/Domain | enges Canonical Proposal bei freiem Text | **NEIN** | Domain op nein; Adapter ja |
| Normalization | `normalizeCustomerAnswer` + Answer Contract | keine | NEIN | NEIN |
| Claim proposal | `interpretNormalizedAnswer` | nur validierter semantischer Input | NEIN | NEIN |
| Knowledge apply | `applyStateTransitionProposal` + DB commit | keine | NEIN | NEIN |
| Evidence interpretation | bestehende Evidence Domain/Review | später Proposal möglich, nicht 06B–D | NEIN | später Adapter ja |
| Assessment | `buildIntermediateAssessment` | keine | NEIN | NEIN |
| Missing information | `deriveMissingInformation` | keine | NEIN | NEIN |
| Readiness | `deriveReadiness` | keine | NEIN | NEIN |
| Planner | `planNextAction` | keine | NEIN | NEIN |
| Renderer | Template Registry/Renderer | keine im ersten Use Case | NEIN | NEIN |
| Runtime commit | `commit_customer_message_cycle` RPC | keine | NEIN | NEIN |
| Snapshot/pending interaction | Cycle Commit RPC | keine | NEIN | NEIN |
| Outbound persistence | Cycle/First-Contact Commit RPC | keine | NEIN | NEIN |
| Delivery | Recoverable Delivery Runner + Meta Adapter | keine | NEIN | nur Meta Adapter |
| Pricing | deterministische Angebotsdomain | verboten | NEIN | NEIN |
| Offer authority | Human-/Offer-Authority | verboten | NEIN | NEIN |
| Human review decision | vorhandene Review Authority | höchstens unautorisierbares Signal | NEIN | NEIN |

## 15. Exakte spätere Repository-Platzierung

Die vorhandene Struktur trennt pure Conversation Domain (`lib/domain/conversation-intelligence`), server-only Composition/Adapter (`lib/server/...`) und produktive Actions (`lib/actions`). Daraus folgt, ohne neue Top-Level-Architektur:

```text
lib/server/ai/contracts.ts
lib/server/ai/schemas.ts
lib/server/ai/errors.ts
lib/server/ai/operations/customer-answer-classification/schemas.ts
lib/server/ai/operations/customer-answer-classification/instructions.ts
lib/server/ai/operations/customer-answer-classification/operation.ts
lib/server/ai/testing/fake-structured-inference-provider.ts

# erst AP-16-06-06C
lib/server/ai/providers/openai/config.ts
lib/server/ai/providers/openai/adapter.ts
lib/server/ai/providers/openai/error-mapper.ts

# erst AP-16-06-06D, möglichst schmale Composition
lib/server/conversation/customer-answer-interpreter.ts
```

Operation-spezifische Value Types, die keine Serverabhängigkeit haben, können bei tatsächlichem Bedarf unter `lib/domain/conversation-intelligence/customer-answer-classification-*` liegen. Der Provider Port und Instructions bleiben jedoch server-only, weil externe Inference und Providercredentials niemals Client-/pure-Domain-Code erreichen dürfen. Bestehende `answer-normalization-*`, `answer-interpretation-*`, Planner- und Renderer-Dateien werden in 06B/C nicht umgebaut.

Tests folgen der bestehenden flachen Konvention:

```text
test/ai-customer-answer-classification.test.ts
test/ai-structured-inference-contract.test.ts
test/openai-structured-inference-adapter.test.ts      # 06C
test/productive-ai-customer-answer-cycle.test.ts      # 06D
```

## 16. Teststrategie für die Implementierungspakete

### Provider-neutral (06B)

- deterministischer Fake Provider mit call capture und versioniertem Ergebnis;
- gültige `matched`, `no_match` und `ambiguous` Responses;
- invalider Schemaoutput, unbekannter Canonical Value und falsche Schema-Version;
- Timeout, transienter und permanenter Failure, Refusal/Unsupported/Configuration Failure;
- deterministic-first: exakter Registry-Treffer ruft Fake Provider nicht auf;
- minimale Payload enthält keine ausgeschlossenen IDs/Daten;
- Compile-/type-level Guard beziehungsweise Import-Regel: keine Provider-/OpenAI-Typen in Domain/Conversation Contracts;
- keine Raw Payload in Diagnostics.

### Domain/Cycle (06B und Activation in 06D)

- dasselbe validierte AI Proposal durchläuft dieselbe Registry-, Claim-, Transition- und Apply-Authority wie deterministischer Input;
- invalides/no-match/ambiguous Proposal mutiert weder Knowledge noch Runtime;
- geschützte Reviewer Claims, Widersprüche, Versionen und Supersession bleiben wirksam;
- Retry rekonstruiert denselben Operation Input und dieselben Versions-/Bindingdaten;
- Crash/Timeout vor Commit erzeugt keinen Partial State; terminaler Replay ruft Provider nicht erneut auf;
- nur ein atomar committetes Ergebnis erzeugt Pending/Outbound/Delivery;
- First Contact bleibt ohne Provider Call;
- Planner/Renderer Output bleibt deterministisch.

### OpenAI Adapter (06C)

- Request Mapping aus neutralem Contract;
- strukturierter Output-/Schema-Mapping und native Finish-State-Übersetzung;
- Error Mapping für Timeout, Rate/Transient, Auth/Configuration, Permanent, Refusal und invaliden Output;
- Provider Request ID/SDK Types verlassen Adapter nicht;
- Secret, Kundentext und Raw Response werden nie geloggt;
- Timeout/Abort und bounded Adapter Retry;
- keine echten oder kostenpflichtigen API Calls; SDK/HTTP Boundary vollständig faken.

## 17. Implementierungspakete

### AP-16-06-06B — Provider-Neutral AI Boundary

**Nur:**

- die neutralen Contracts, Failure Classes und Zod-Schemas;
- die use-case-spezifische `interpretCustomerAnswer`-Boundary für canonical classification;
- operation-/instruction-/schema-versionierte Registry;
- deterministic-first Eligibility und Allowlist Validation;
- deterministischen Fake Provider und die oben genannten Contract-/Domain-Tests.

**Nicht:** OpenAI SDK/Adapter, Env Vars, produktiver Cycle Hook, Migration, Planner/Renderer/First Contact/Delivery.

### AP-16-06-06C — OpenAI Server Adapter

**Nur:**

- server-only OpenAI Adapter hinter `StructuredInferenceProvider`;
- Zod-validierten Environment-/Provider-Config-Contract;
- neutrales Request-/Response Mapping und structured-output translation;
- safe Error-/Diagnostics Mapping, Timeout und Adaptertests;
- kein echter API Call in Tests.

**Nicht:** produktive Conversation-Cycle-Aktivierung, Domain-/Planner-/Renderer-/Delivery-Änderung, Modell-Authority oder Migration.

### AP-16-06-06D — Productive AI Conversation Integration

**Erforderlich: JA, separat.** B und C sollen keine produktive Verhaltensänderung enthalten. 06D verbindet nach deren isolierter Verifikation ausschließlich den eligible Freitext-Fallback im recoverable Cycle mit dem konfigurierten Adapter. Das Paket muss Feature-/configuration gating, Time Budget, safe diagnostics, Failure-to-review behavior, Regressionstests für atomaren Commit/Replay und den Nachweis enthalten, dass First Contact, Planner, Renderer und Delivery unverändert bleiben. Es darf keine neue Persistenz einführen; zeigt der Time-Budget-Test, dass die aktuelle Lease nicht genügt, stoppt 06D für eine neue Architekturentscheidung.

## 18. Abschlussbericht

| Geforderter Punkt | Ergebnis |
|---|---|
| Branch | `codex/ap16-06-06a-provider-neutral-ai-boundary-readiness-audit` |
| Baseline Commit | `8722c49829229f8414819933a06bcf2f2dfcffe9` |
| Commit SHA | wird durch den Audit-Commit erzeugt; siehe Git-Historie |
| Audit Artifact | diese Datei |
| Audit Result | **READY** |
| Current Conversation Cycle Call Graph | Abschnitt 3 |
| First AI Use Case | Canonical Classification einer gebundenen normalisierten Freitextantwort |
| Proposed Provider-Neutral Boundary | nach Normalization, vor deterministischer Interpretation/Claim Proposal |
| Proposed Domain Operation | `interpretCustomerAnswer(...)` |
| Provider Transport | `generateStructuredInference(...)` |
| Structured Output Contract | `matched` + erlaubter Canonical Value, `no_match` oder `ambiguous`; Schema v1 |
| Validation Authority | operation-spezifisches Zod + Registry Allowlist + unveränderte Domain-/Apply-/Commit-Invarianten |
| Retry/Idempotency | bestehender recoverable Cycle, stabile Command Authority, atomarer Commit/Replay; Proposal ohne Side Effect |
| Persistence Required | **NEIN** |
| Product Decision Required | **NEIN** |
| Data Sent to Provider | einzelne Antwort, Locale, Question Semantik, erlaubte Werte, Versionen |
| Data Explicitly Excluded | Telefon/WhatsApp IDs, interne UUIDs, Verlauf, Knowledge State, Projekt-/Mitarbeiter-/Offer-/Preis-/Media-Daten, Secrets |
| Proposed File Placement | Abschnitt 15 |
| AP-16-06-06B Definition | Abschnitt 17 |
| AP-16-06-06C Definition | Abschnitt 17 |
| AP-16-06-06D Required | **JA** |
| OpenAI Implemented | **NEIN** |
| READY FOR AP-16-06-06B | **JA** |
| Recommended Next Step | AP-16-06-06B umsetzen und vollständig isoliert testen; danach 06C, erst danach 06D |

## 19. Stop-Entscheidung

Ein klarer erster Use Case ist vorhanden, die Boundary passt ohne Architekturbruch in die heutige in-memory Calculate-/atomare Commit-Struktur, sämtliche fachliche Authority bleibt deterministisch, und weder ein persistenter Inference Command noch eine ungeklärte Idempotency-Entscheidung ist erforderlich. Die technische Grundlage ist vollständig vorhanden.

**AUDIT RESULT: READY**
