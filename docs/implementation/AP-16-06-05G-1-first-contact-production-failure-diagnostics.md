# AP-16-06-05G-1 — First-Contact Production Failure Diagnostics

## Purpose

Dieses Paket ergänzt ausschließlich serverseitige, geschlossene und PII-freie Produktionsdiagnostik für fehlgeschlagene First-Contact-Ausführungen. Es repariert den Produktionsfehler nicht und verändert keinen fachlichen Ablauf.

## Audit Authority

Verbindliche Authority ist `docs/audits/AP-16-06-05G-first-contact-production-failure-diagnostics-audit.md`, unter unveränderter Beachtung von AP-16-06-05D, AP-16-06-05E, AP-16-06-05F sowie der bestehenden Webhook-, Recovery- und Delivery-Contracts.

## Diagnostic Taxonomy

| Diagnostic Code | Stage | erlaubter Result Code |
| --- | --- | --- |
| `foundation_exception` | `foundation` | – |
| `foundation_result_rejected` | `foundation` | `conflict`, `actor_unavailable`, `actor_invalid`, `invalid_state`, `persistence_failure` |
| `initial_prompt_adapter_unavailable` | `initial_prompt_adapter` | – |
| `initial_context_rpc_failed` | `initial_context` | – |
| `initial_context_result_invalid` | `initial_context` | – |
| `initial_context_result_rejected` | `initial_context` | `invalid_state` |
| `assessment_failed` | `assessment` | – |
| `planning_failed` | `planning` | – |
| `rendering_failed` | `rendering` | – |
| `snapshot_validation_failed` | `snapshot_validation` | – |
| `commit_rpc_failed` | `commit` | – |
| `commit_result_invalid` | `commit` | – |
| `commit_result_rejected` | `commit` | `invalid_state` |
| `unexpected_error` | `orchestration` | – |

`initialized`, `already_initialized`, `stale`, `already_advanced` und `not_applicable` sind keine Failure-Diagnosen.

## Propagation Contract

Context-, Assessment-, Planner-, Renderer-, Snapshot- und Commit-Boundaries klassifizieren den Fehler an der tiefsten sicher unterscheidbaren Stelle. Sie propagieren ausschließlich geschlossene Diagnostic Metadata und loggen nicht. Der Initial-Prompt-Adapter klassifiziert nur fehlende beziehungsweise ungültige Server-Konfiguration. Das öffentliche `ProductiveFirstContactResult` bleibt unverändert; Diagnostic Metadata endet am Orchestrator.

## Logging Boundary

`runProductiveFirstContactInitialization(...)` ist die einzige Logging Boundary. Vor genau einem `{ status: "failed" }` wird genau einmal `console.error("first_contact_initialization_failed", diagnostic)` aufgerufen. Webhook, Recovery, Adapter und Domain-Funktion erzeugen keinen zweiten Event.

## Allowed Fields

Erlaubt sind ausschließlich das konstante Event Label sowie `diagnostic_code`, die fest zugeordnete `stage` und nur bei den drei Rejected-Klassen der geschlossene `result_code`. Der Plattform-Timestamp wird nicht durch Anwendungsmetadaten ergänzt.

## Forbidden Fields und PII/Security Contract

Verboten sind sämtliche IDs, Telefonnummern und Transportidentitäten, Namen, E-Mail-Adressen, Nachrichten-, Prompt- oder Rendertexte, Snapshots, Knowledge Claims, Provider-/Meta-Payloads, SQL und Parameter, Credentials, Tokens und Secrets. Ebenso verboten sind rohe Error-Objekte, Zod-Issues sowie `message`, `details`, `hint`, `code`, `stack` und `cause`. RPC-Errors dienen ausschließlich als boolesches Signal für den festen Boundary-Code.

## Error Swallowing vorher/nachher

Vorher fielen Context-RPC und Context-Parsing, Planner/Renderer/Snapshot sowie Commit-RPC und Commit-Parsing jeweils zusammen und wurden schließlich als `failed` verworfen. Nachher bleibt dasselbe fachliche Ergebnis erhalten, wird aber intern mit genau einer geschlossenen Stage-Diagnose bis zur zentralen Sink propagiert. Es werden weder Fehlertexte ausgewertet noch Retries oder Reparaturen ergänzt.

## Webhook Semantics

Ein bereits persistierter Meta-Inbound bleibt auch bei First-Contact-Failure HTTP 200. Exceptions gelangen nicht zur Webhook-Response, das One-Time-Routing und „Same message never answer“ bleiben erhalten. Es gibt keine Re-Evaluation, keinen zweiten Prompt und keinen Webhook-Logger für diesen Fehler.

## Recovery Semantics

`POST /api/internal/first-contact/recovery` bleibt unverändert: kontrollierte Item-Failures ergeben HTTP 200 und erhöhen `failed`; Batch Size 10, Concurrency 1, 40-Sekunden-Startbudget, per-item Isolation und Summary Shape bleiben bestehen. Es gibt keinen Recovery-Logger für denselben Event.

## Duplicate Prevention

Eine Invocation besitzt eine einzige Sink im Orchestrator. Tiefere Funktionen klassifizieren nur. Webhook und Recovery konsumieren weiterhin lediglich das öffentliche Resultat. Eine spätere Recovery-Ausführung ist eine neue Invocation und kann bei erneutem Scheitern genau einen neuen Event erzeugen.

## Tests

Vitest deckt die 14 Codes beziehungsweise ihre Boundaries, erwartete Nichtfehlerzustände, Exactly-once-Ausgabe, erlaubte Shapes, Sentinel-basierte PII-/Secret-/Raw-Error-Guards, unveränderte Delivery-Gates sowie HTTP-200- und Summary-Semantik von Webhook und Recovery ab.

## Production Use

1. Code deployen.
2. Keine Migration ausführen.
3. Keine neue Environment Variable setzen.
4. Recovery laufen lassen oder genau einen kontrollierten First-Contact-Test auslösen.
5. In Vercel Logs nach `first_contact_initialization_failed` suchen.
6. Ausschließlich `diagnostic_code` und `stage` (gegebenenfalls den geschlossenen `result_code`) auswerten.
7. Keine erneuten Nachrichten senden, solange der persistierte Zustand untersucht wird.
8. Danach ein separates Root-Cause-/Repair-Paket erstellen.

## Explicit Non-Goals

Keine Fehlerreparatur; keine SQL- oder Migrationänderung; keine Änderung an Commit RPC, Foundation, Bootstrap, Planner, Renderer, Prompttext, Snapshot Business Contract, Delivery, Graph API, Retry, Recovery Discovery, Scheduler, Webhook Response, Customer-Answer-Semantik oder Knowledge Claims; kein OpenAI/LLM; keine Offer-/Pricing-/Human-Review-Änderung; keine neue Route, Dependency, Environment Variable oder Telemetry-Plattform.
