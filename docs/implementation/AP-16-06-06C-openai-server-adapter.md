# AP-16-06-06C — OpenAI Server Adapter

## Authority und Ergebnis

Verbindliche Authority sind der Readiness-Audit `AP-16-06-06A-provider-neutral-ai-boundary-readiness-audit.md` sowie die Implementierung `AP-16-06-06B-provider-neutral-ai-boundary.md`. Der Adapter verändert keinen 06B-Contract und implementiert ausschließlich dessen `StructuredInferenceProvider`.

## Adapter Placement und Server-only Boundary

`OpenAiStructuredInferenceProvider` liegt mit Konfiguration, Instructions und Error Mapper ausschließlich unter `lib/server/ai/providers/openai`. Jedes Modul trägt den `server-only`-Guard. OpenAI-SDK-Typen und Providerdetails verlassen diesen Bereich nicht. Domain, UI, Client Components, Conversation Cycle, Webhook, Planner, Renderer, Runtime und Delivery importieren den Adapter nicht.

## OpenAI SDK und Responses API

Verwendet wird ausschließlich das offizielle npm-Paket `openai` in Version `6.16.0`. Der Adapter verwendet genau einen stateless Aufruf von `client.responses.parse(...)` je Versuch und `zodTextFormat(...)` aus `openai/helpers/zod`. Es gibt keine Tools, keine Retrieval-Funktion, keinen Tool Loop und keine `previous_response_id`.

## Structured Output und Domain Contract Mapping

Das providerinterne strikte Zod-Objekt besitzt `schemaVersion`, `result` (`matched`, `no_match`, `ambiguous`) sowie das immer vorhandene, nullable `canonicalValue`. Diese Objektform vermeidet ein vom Provider nicht unterstütztes Root-Union-Schema. Der Adapter mappt sie auf die bestehende 06B-Discriminated-Union und validiert das Ergebnis nochmals mit `customerAnswerClassificationProposalV1Schema`. Anschließend bleibt die vorhandene Domain-Allowlist-Prüfung in `interpretCustomerAnswer(...)` Authority. Fehlender, inkonsistenter oder malformed Parsed Output wird niemals aus `output_text` oder per freiem `JSON.parse` rekonstruiert.

## Instructions Version

Unterstützt wird ausschließlich `customer_answer.canonical_classification`, Operation/Input/Output Version 1 und Instruction Template `customer_answer_canonical_classification_de`, Version 1. Die serverseitige Instruction `OPENAI_CUSTOMER_ANSWER_CLASSIFICATION_INSTRUCTIONS_V1` begrenzt das Modell auf einen Allowlist-Match, `no_match` oder `ambiguous` und verbietet neue Canonical Values, Claims, Planung, Kundenantworten, Preise und Angebote. Es gibt keine Promptdatenbank und keine editierbaren System-Prompts.

## Model Configuration

`OPENAI_API_KEY` ist erforderlich. `OPENAI_MODEL` ist optional. Default ist ausschließlich im OpenAI-Konfigurationslayer `gpt-4.1-mini`: ein Responses-/Structured-Outputs-fähiges, kostenbewusstes Modell für die enge Textklassifikation. Die Model-ID besitzt keinerlei Domain Authority.

## Timeout und Retry Policy

`OPENAI_TIMEOUT_MS` ist optional und wird als ganze Zahl zwischen 1.000 und 60.000 Millisekunden validiert; Default sind 15.000 Millisekunden, deutlich unterhalb der bestehenden fünfminütigen Cycle Lease. Der Wert wird dem SDK-Client als Request-Timeout übergeben. Das SDK wird bewusst mit `maxRetries: 0` konstruiert: Der Adapter führt weder sichtbare noch versteckte Wiederholungen aus; Retry-/Idempotency-Authority bleibt beim späteren recoverable Conversation Cycle.

## Error Mapping

| Provider-/Transportfall | Neutrale Failure Class |
|---|---|
| SDK Connection Timeout, Abort/Timeout-Code, HTTP 408 | `timeout` |
| HTTP 429 oder 5xx | `transient_provider_failure` |
| HTTP 401/403 oder invalide/fehlende Konfiguration | `configuration_failure` |
| fehlender/malformed/inkonsistenter Parsed Output oder incomplete Response | `invalid_structured_output` |
| Responses-Content `refusal` | `refused` |
| HTTP 404 / nicht vorhandene Capability | `unsupported` |
| sonstiger nicht-retryable Providerfehler | `permanent_provider_failure` |

Raw Exceptions und Responses verlassen den Adapter nicht. Refusals werden vor Parsed-Output-Verarbeitung erkannt. Incomplete Responses werden abgewiesen; es gibt keinen Freitext-Fallback.

## Data Minimization und Secret Handling

Der Providerrequest enthält nur Locale, Schema-Version, Information Key, Semantic Mode, die einzelne normalisierte Antwort und die kleine Allowlist. Lokale Correlation-ID, Conversation-/Customer-/Project-/WhatsApp-IDs, Historie, Knowledge State, Mitarbeiter-, Preis-, Angebots- und Mediendaten werden nicht übertragen. Der Adapter lädt keine Zusatzdaten nach. Der API-Key wird nur beim serverseitigen Clientbau verwendet und erscheint weder in Resultaten noch Fehlermeldungen oder Logs. Es werden keine Request-, Antwort- oder Kundentext-Logs erzeugt.

## Client Construction und Test Strategy

Der Adapter validiert Konfiguration vor dem Clientbau und hält den Client anschließend instanzlokal wiederverwendbar; es gibt keinen globalen mutable Domain State. Eine schmale providerinterne Client-Boundary ist injizierbar. Adaptertests verwenden ausschließlich Fakes und prüfen Request Mapping, alle Proposalformen, Parsed-Output-Validierung, Refusal/Incomplete Handling, Error Mapping, Konfiguration, Secretfreiheit und Importisolation. Weder Tests noch die vollständige Suite benötigen `OPENAI_API_KEY`, Internet, OpenAI Account oder kostenpflichtige Calls.

## Scope-Nachweis

- Persistence Added: **NEIN**
- Productive Activation Added: **NEIN**
- Conversation Cycle Changed: **NEIN**
- Migration Added: **NEIN**
- WhatsApp/Planner/Renderer/Runtime/Delivery Changed: **NEIN**

## Next Package

Die produktive, explizit gegatete Composition ist ausschließlich Gegenstand von **AP-16-06-06D — Productive AI Conversation Integration**.
