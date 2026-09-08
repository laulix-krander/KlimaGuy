# AP-16-06-06B — Provider-Neutral AI Boundary

## Audit Authority und Ergebnis

Verbindliche Authority ist `docs/audits/AP-16-06-06A-provider-neutral-ai-boundary-readiness-audit.md` mit dem Ergebnis **READY**. Dieses Paket setzt ausschließlich die dort definierte, noch unbenutzte Boundary um.

## Boundary Position und erster AI Use Case

Die Boundary liegt nach `normalizeCustomerAnswer(...)` und vor `interpretNormalizedAnswer(...)`. `interpretCustomerAnswer(...)` klassifiziert genau eine gebundene, normalisierte Freitextantwort in einen serverseitig registrierten Canonical Value, `no_match` oder `ambiguous`. Ein exakter Registry-Treffer bleibt deterministisch und ruft keinen Provider auf.

## Domain Operation und Provider Contract

`interpretCustomerAnswer(...)` validiert Input, Eligibility, Registry, Semantic Binding und Allowlist, führt deterministic-first aus und ruft nur danach `StructuredInferenceProvider.generateStructuredInference(...)` auf. Der Port enthält keine Provider-, Modell-, SDK- oder API-Begriffe. Sein `unknown`-Output endet unmittelbar am versionierten Zod-Schema.

## Input Contract

Schema v1 enthält Operation/Schema-Version, Locale, lokale Binding-Correlation, Question-Semantik, genau einen normalisierten Text und Canonical-Allowlist. Der minimierte Providerinput enthält nur Schema-Version, Information Key, Semantic Mode, Antworttext und Allowlist. Telefonnummern, WhatsApp-/Transport-IDs, interne Customer-/Conversation-/Project-IDs, Historie, Knowledge State, Preise, Angebote, Mitarbeiterdaten, Media und Secrets sind ausgeschlossen.

## Output Contract und Allowlist Authority

Die strikte discriminated union erlaubt ausschließlich `matched` mit `canonicalValue`, `no_match` oder `ambiguous`. Die Domain prüft einen Match nach dem Schema-Parse erneut gegen die vom Server kontrollierte Allowlist. Die Allowlist selbst darf nur registrierte Canonical Values der gebundenen aktiven Text-Property enthalten.

## Failure Contract und Validation Authority

Neutrale Failure Classes sind `transient_provider_failure`, `timeout`, `invalid_structured_output`, `refused`, `unsupported`, `configuration_failure` und `permanent_provider_failure`. Raw Exceptions und Providerobjekte sind kein Contract-Bestandteil. Transportresultat und operation-spezifischer Output werden an der Operationsgrenze erneut geparst; Binding, Versionen und Allowlist bleiben deterministische Authority.

## Retry, Idempotency und Persistenz

Es gibt keine Retry Engine und keine Queue. Identische Inputs sind mit dem Fake reproduzierbar; ein Proposal hat allein keine fachliche Wirkung. **Persistence Required: NEIN.** Fehler oder invalider Output mutieren nichts.

## Produktive Aktivierung und OpenAI

**Productive Activation: NEIN.** Conversation Cycle, Recovery, Webhook, First Contact, Apply, Planner, Renderer, Runtime Commit und Delivery bleiben unverändert. **OpenAI Implemented: NEIN.** Es wurden weder SDK, API Call, Key, Env-Konfiguration noch Modell ergänzt.

## Non-Goals

Keine Claims, State Transitions, Persistenz, Pricing-/Offer-Authority, Human-Review-Entscheidung, Medienverarbeitung, Diagnostics-Pipeline oder produktive Integration.

## Test Coverage

Contract-Tests decken alle Proposal-Varianten, strikte Schemas, neutrale Failure Classes und Datenminimierung ab. Operations-Tests decken deterministic-first, Allowlist-Authority, gültige Proposals, invaliden Output sowie sämtliche Failure Classes ab. Der Fake Provider arbeitet ohne Netzwerk und zeichnet minimierte Requests deterministisch auf.

## Next Package

Nächster Schritt ist **AP-16-06-06C — OpenAI Server Adapter** hinter dem neutralen Port. Erst AP-16-06-06D darf die Boundary produktiv in den recoverable Conversation Cycle integrieren.
