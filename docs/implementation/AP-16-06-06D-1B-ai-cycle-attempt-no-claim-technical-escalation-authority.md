# AP-16-06-06D-1B — AI-Cycle-Completion-Authority

## Authority und Migration

Unmittelbare Authority ist der mit **READY** abgeschlossene Audit `AP-16-06-06D-1A`. Die einzelne Migration `202609080001_ai_cycle_attempt_claimless_technical_escalation_authority.sql` erweitert ausschließlich den bestehenden Customer-Answer-Cycle-Command, dessen Atomic Commit und dessen Human-Review-Transition. Es entstehen keine Queue, kein Commandtyp und keine providerbezogene Tabelle.

## AI Attempt Counter und Semantik

`conversation_cycle_commands.ai_inference_attempt_count` ist ein providerneutraler, persistenter Integer mit `NOT NULL DEFAULT 0` und DB-Constraint `0..3`. Er zählt lokal autorisierte Inference-Request-Attempts je Kundenantwort-Command. Er ist unabhängig vom weiterhin unveränderten Observability-Counter `execution_attempt_count`, der Runner-Acquisitions zählt. Gate-off und deterministischer Bypass reservieren nichts.

## Reservation RPC, Concurrency und Idempotenz

`reserve_customer_answer_ai_inference_attempt(command, source message, runtime revision, knowledge version, owner)` sperrt in stabiler Reihenfolge Conversation, Runtime, Knowledge, Pending Interaction und Command. Sie prüft Service Role, Processingzustand, Command-/Messagebindung, aktive Lease/Owner, Runtime-/Knowledge-CAS sowie die aktive Pending-/Prompt-/Snapshotbindung. Der gesperrte Command wird atomar von 0→1, 1→2 oder 2→3 erhöht; `attempts_exhausted` verändert bei 3 nichts. Eine erfolgreiche Reservation ist absichtlich nicht idempotent: Jeder Aufruf reserviert genau die nächste lokale Berechtigung.

Die Reservation findet im Folgepaket erst nach Gate, Eligibility, Normalisierung, Allowlist und Exact-Match-Bypass, aber unmittelbar vor dem externen Call statt. **External Exactly-Once Guaranteed: NEIN.** Ein Crash vor, während oder nach dem externen Request kann eine Reservation verbrauchen. Garantiert sind ausschließlich maximal drei lokal autorisierte Requests; Providerempfang und -verarbeitung können lokal nicht bewiesen werden.

## Recoverable Failure, Backoff und Recovery Discovery

`defer_customer_message_ai_retry(...)` akzeptiert ausschließlich `ai_timeout` und `ai_transient_provider_failure`. Die Transition lässt Command `processing`, Owner und verbrauchten Counter bestehen und setzt die bestehende Lease auf `statement_timestamp() + 1 minute`. Knowledge, Runtime, Pending Interaction, Outbound und Delivery werden nicht mutiert. Die bestehende Discovery findet schon heute nur `processing` Commands mit fälliger/null Lease; deshalb wurde sie nicht geändert. Vor Ablauf gibt es keine Reacquisition, danach bleibt der Recovery Runner Retry Owner. Attempt 3 ist nicht deferrable.

## Attempt Exhaustion und technische Human Review

`completeCustomerMessageWithTechnicalHumanReview(...)` ist eine providerneutrale Service-Bridge auf die bestehende RPC `complete_customer_message_human_review(...)`. Die geschlossene Reason-Allowlist lautet:

- `ai_configuration_failure`: sofortige Review ohne normalen Retry;
- `ai_attempts_exhausted`: Review nach ausgeschöpften drei Reservationen;
- `ai_non_transient_failure`: permanente technische Failure, niemals `no_match`.

Die bestehende Transition beantwortet die Pending Interaction, erhöht die Runtime Revision, setzt Runtime auf `human_review` und Command auf `human_review_required`; Knowledge bleibt unverändert und Recovery entdeckt den terminalen Command nicht. Nur bei technischer Review entsteht ein contentfreier Auditdatensatz mit stabilen IDs, Reason, Counter und Versionsmetadaten. Providerfehlertext, Prompt, Antworttext, Request/Response, Telefonnummer, Providerkennung und Secret werden nicht persistiert.

## Claimless Success und Atomic Commit Extension

Der bestehende `commit_customer_message_cycle(...)` besitzt nun die diskriminierte `knowledge_outcome`-Union `transition_applied | no_claim`; alte Payloads bleiben als `transition_applied` kompatibel. `commitCustomerMessageCycleWithoutClaim(...)` erzeugt ausschließlich `no_claim`. `no_match` und `ambiguous` bleiben In-Memory-Outcomes und werden nicht separat persistiert.

Der `no_claim`-Branch lehnt Interpretation, Proposal und Apply-Result ab und ruft die Knowledge-Transition nicht auf. Deshalb entstehen keine Claims, Evidence, Supersession oder Correction, und weder `project_knowledge_states.current_version` noch der Runtime-Knowledge-Mirror werden wegen eines fehlenden Claims erhöht. Er behält Owner-/Lease-, Source-/Pending-/Prompt-/Snapshot-, Runtime-/Knowledge-CAS, stabile reservierte IDs, Payloadhash-Replay und stale-context rejection des bestehenden Atomic Commit bei.

## Pending Interaction, Runtime, Planner und Renderer

Die beantwortete Pending Interaction wird atomar `answered` und an die Source Message gebunden. Dadurch kann dieselbe Kundenantwort nicht endlos als offene Antwort verarbeitet werden. Der bereits außerhalb der Persistenzauthority berechnete reguläre Cycle-Fortschritt kann Collection/Retry/Effort/Evidence, Events, nächste Pending Interaction, Planner Snapshot, Outbound Message und Delivery-Folgeauthority wie bisher committen. Missing Information folgt dem unveränderten Knowledge State. Planner und Renderer wurden nicht geändert.

## Datenminimierung und Paketgrenzen

- Productive AI Activation Added: **NEIN**
- OpenAI-specific Persistence Added: **NEIN**
- New AI Command Added: **NEIN**
- Planner Changed: **NEIN**
- Renderer Changed: **NEIN**
- First Contact Changed: **NEIN**
- Delivery Changed: **NEIN**
- WhatsApp Changed: **NEIN**

Die neuen Serviceverträge sind providerneutral. Der produktive Composition Root konstruiert weiterhin keinen OpenAI-Adapter für den Conversation Cycle und `processPersistentCustomerMessage(...)` ruft keine AI-Interpretation auf.

## Next Package

AP-16-06-06D darf nach erneuter Readiness-Prüfung Gate/Eligibility/Allowlist/Exact-Match-Reihenfolge, Reservation, externen Adaptercall sowie die hier vorbereiteten Outcome- und Failure-Transitions produktiv komponieren. Deployment-Secret und Gate-Aktivierung bleiben außerhalb dieses Pakets.
