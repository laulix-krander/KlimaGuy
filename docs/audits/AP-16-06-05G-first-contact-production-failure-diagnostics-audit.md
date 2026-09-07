# AP-16-06-05G — First-Contact Production Failure Diagnostics Audit

**Datum:** 2026-09-07

**Baseline:** `0ac7e03950c201b0baab3be979e4723b4439afce` (`main`-Merge-Stand, PR #177)

**Branch:** `codex/ap16-06-05g-first-contact-failure-diagnostics-audit`

**Scope:** ausschließlich Architektur- und Implementierungs-Audit; keine Produktdatei, Migration oder Production-Daten geändert
**Audit Result:** **READY**

## 1. Executive Result

Der aktuelle Code kann den Fehler nicht nachträglich aus dem persistierten Production-Zustand bestimmen. Er kann ihn bei einer erneuten First-Contact-Ausführung aber ohne PII, rohe Provider-/DB-Fehler, Migration oder fachliche Änderung eindeutig bis auf die ausführende Stufe klassifizieren. Dafür müssen die bereits vorhandenen geschlossenen Ergebnisse intern um ebenso geschlossene Diagnose-Metadaten ergänzt und **nur an einer Stelle**, in `runProductiveFirstContactInitialization(...)`, geloggt werden.

Der Production-Zustand beweist, dass 05D Foundation und der gelesene Initial-Context erfolgreich beziehungsweise `eligible` sind. Weil kein Artefakt des atomaren Commits existiert, liegt der beobachtete Lauf nach dem Context-Read und vor einem erfolgreichen Commit. Der heutige Code lässt jedoch vier noch plausible Klassen zusammenfallen: Assessment/Planning, Rendering, Snapshot-Validierung sowie Commit-RPC/Commit-Result. Eine genauere Behauptung wäre Spekulation.

**READY für `AP-16-06-05G-1 — First-Contact Production Failure Diagnostics`: JA.** Das Folgepaket diagnostiziert lediglich eine künftige beziehungsweise Recovery-Ausführung. Es repariert den zugrunde liegenden Fehler nicht.

## 2. Gelesene Authorities und Scope

Vollständig gelesen wurden die verlangten Produktdateien:

- [`productive-first-contact.ts`](../../lib/server/conversation/productive-first-contact.ts), [`first-contact-initial-prompt.ts`](../../lib/server/conversation/first-contact-initial-prompt.ts), beide First-Contact-Adapter, Foundation, Eligibility, Recovery und Recovery-Handler;
- [`whatsapp/webhook.ts`](../../lib/server/whatsapp/webhook.ts) und die interne [Recovery-Route](../../app/api/internal/first-contact/recovery/route.ts);
- die Migrationen [05D Foundation](../../supabase/migrations/202609040001_first_contact_foundation.sql), [05E Initial Prompt](../../supabase/migrations/202609040002_deterministic_initial_prompt_commit.sql) und [05F Recovery](../../supabase/migrations/202609040003_productive_first_contact_recovery.sql).

Direkt aufgerufene Authorities wurden ebenfalls gelesen: Intermediate Assessment, Readiness, Question Planner, Question Renderer, Planner-Snapshot-Schema, WhatsApp-Ingestion, produktive Outbound-Delivery-Komposition und Recoverable Delivery Runner.

Als Architekturgrundlage wurden berücksichtigt:

- [AP-16-06-05C](AP-16-06-05C-first-contact-bootstrap-initial-prompt-contract-audit.md), [05D-A](../implementation/AP-16-06-05D-A-system-actor-provisioning-domain-identity.md), [05D](../implementation/AP-16-06-05D-first-contact-customer-project-runtime-bootstrap.md), [05E](../implementation/AP-16-06-05E-deterministic-initial-planning-atomic-prompt-commit.md) und [05F](../implementation/AP-16-06-05F-productive-first-contact-wiring-recovery.md);
- [AP-16-06-04D](../implementation/AP-16-06-04D-recoverable-whatsapp-delivery-runner.md) und [04E](../implementation/AP-16-06-04E-productive-whatsapp-delivery-trigger-recovery.md);
- [AP-16-06-03](../implementation/AP-16-06-03-productive-runtime-trigger-recovery-v2.md) und [03A](AP-16-06-03A-deployment-runtime-scheduler-contract-freeze.md).

Im Produktcode existiert derzeit keine zentrale Logging-/Telemetry-Authority. Die Suche nach `console.error`, `console.warn`, `logger` und `telemetry` ergab keinen für diesen Pfad wiederverwendbaren PII-sicheren Mechanismus. STOP-Bedingung 7 tritt daher nicht ein.

## 3. Production Failure Path

### 3.1 Belegbarer Call Graph

```text
POST /api/webhooks/whatsapp
  createWhatsAppWebhookHandlers().POST
    verify signature -> parse -> persistWhatsAppInboundText
    when !cycle_eligible:
      readProductiveFirstContactEligibility(conversation_id)
        getFirstContactEligibility -> client.rpc(get_first_contact_eligibility)
      runProductiveFirstContactInitialization(... immediate_delivery: true)
        runFirstContactFoundation
          bootstrapFirstContactFoundation
            client.rpc(bootstrap_first_contact_foundation)
        runFirstContactInitialPrompt
          initializeFirstContactPrompt
            source.rpc(get_first_contact_initial_prompt_context)
            buildIntermediateAssessment
              deriveReadiness / deriveMissingInformation
            planNextAction
            renderQuestionTemplate
            plannerInteractionSnapshotSchema.safeParse
            composeRenderedCustomerText
            source.rpc(commit_first_contact_initial_prompt)
        only after initialized/already_initialized:
          runRecoverableWhatsAppDelivery(outbound_message_id)

POST /api/internal/first-contact/recovery
  createFirstContactRecoveryHandler().POST
    discoverRecoverableFirstContacts(10)
      client.rpc(discover_recoverable_first_contacts)
    sequentially, one item at a time:
      runProductiveFirstContactInitialization(... immediate_delivery: false)
```

### 3.2 Einordnung der gegebenen Production-Fakten

`eligible` aus `get_first_contact_initial_prompt_context` schließt für genau diesen Read die Context-Zweige `already_initialized`, `already_advanced`, `not_applicable` und `invalid_state` aus. Foundation-, Customer- und Project-Bootstrap werden deshalb nicht als primäre Ursache neu bewertet.

Der Commit ist atomar: erst innerhalb `commit_first_contact_initial_prompt` entstehen Snapshot, Outbound Message, Pending Interaction, Delivery Command und Runtime Command; danach wird Runtime Revision/Status aktualisiert. Seine Exception-Section mappt nur `unique_violation` auf `stale` und wirft alle anderen SQL-Fehler wieder hoch. Das vollständige Fehlen aller Artefakte ist daher vereinbar mit (a) einem Fehler vor RPC-Aufruf, (b) einem zurückgegebenen/geworfenen RPC-Fehler, (c) einem geschlossenen abgelehnten Commit-Result oder (d) einem transaktional zurückgerollten SQL-Fehler. Es beweist keine dieser Unterklassen.

Delivery ist nicht Teil der offenen Fehlerstelle: sie wird erst nach einem Resultat mit `outbound_message_id` aufgerufen. Ohne Outbound Message kann weder Immediate Delivery noch Delivery Recovery die fehlende Prompt-Erzeugung heilen.

## 4. Error-Swallowing-Inventar

| Boundary | heutiger Result-Contract | mögliche Fehler/Exceptions | heutiges Catch/Mapping | verlorene Information |
|---|---|---|---|---|
| Webhook Eligibility | `healable | already_initialized | not_applicable | invalid_state` | Client-Erzeugung/RPC kann werfen; RPC-`error`; ungültiges Zod-Resultat | Eligibility mappt RPC-Fehler und Parse-Fehler beide auf `invalid_state`; äußerer Initialisierungs-`catch` ist leer | DB-Fehler, Parse-Ursache und jede geworfene Exception; kein Log |
| Webhook Initialisierung | `ProductiveFirstContactResult` | Orchestrator oder Adapter kann werfen | leerer innerer `catch`; persistierter Inbound bleibt isoliert | das gesamte Resultat beziehungsweise Exception; absichtlich keine Response-Semantik |
| Foundation Adapter | inferiertes Foundation-Resultat | fehlende/ungültige Env; `createClient`; Fetch/RPC | Env wird `persistence_failure`; übrige Exception propagiert | Env und RPC-Resultfehler sind spätestens oben nicht mehr unterscheidbar |
| Foundation Domain/RPC | `created | partial_completed | already_complete | conflict | actor_unavailable | actor_invalid | invalid_state | persistence_failure` | RPC-Promise kann werfen; `.error`; ungültiges RPC-JSON | `.error` und Zod-Fehler werden beide `persistence_failure`; Throw propagiert | strukturierter DB-Fehler und Zod-Issues; Orchestrator kollabiert alle Failure-Codes auf `failed` |
| Productive Orchestrator: Foundation | `ProductiveFirstContactResult` | Dependency wirft | `catch -> failed`; alle Nicht-Success-Resultate `-> failed` | Exception versus konkreter Foundation-Code |
| Initial Prompt Adapter | `InitialPromptResult` (inferiert) | fehlende/ungültige Env; Client/RPC kann werfen | Env `-> persistence_failed`; Throw propagiert | Konfiguration versus spätere Persistenz ist oben nicht unterscheidbar |
| Context RPC | `eligible`, Replay oder geschlossene Context-Status | RPC kann werfen; `.error`; Result kann Schema verletzen | `.error` und Parse-Fehler beide `persistence_failed`; Throw propagiert | RPC-Fehler versus Zod-Fehler; rohe DB-Fehlerdetails werden verworfen |
| Assessment | `DomainResult<IntermediateAssessment>` | geschlossenes Domain-Failure; unerwarteter Throw | Failure `-> planning_failed`; Throw propagiert | Assessment-Code und Stufe |
| Planner | `PlannerResult<PlanNextActionResult>` | Failure-Code; valider `stop_result`; unerwarteter Throw | Failure **und** Stop `-> planning_failed`; Throw propagiert | Planner-Code und „Failure vs kein selected_action“ |
| Renderer | `RenderQuestionTemplateResult` | geschlossener Render-Code; unerwarteter Throw | alle `!success -> planning_failed`; Throw propagiert | Renderer ist nicht mehr von Planning unterscheidbar; Render-Code verloren |
| Snapshot-Validierung | Zod `safeParse` | Zod-Issues; theoretischer Throw in Komposition | Parse-Failure `-> planning_failed`; Throw propagiert | nicht mehr von Planning/Rendering unterscheidbar; Zod-Issues verloren |
| Commit RPC | Success Identity oder `already_advanced | not_applicable | stale | invalid_state` | RPC kann werfen; `.error`; ungültiges JSON | `.error` und invalides Result `-> persistence_failed`; Throw propagiert | RPC-Fehler versus invalides Result; DB-Fehlerdetails verloren |
| Productive Orchestrator: Prompt | `InitialPromptResult` | Adapter/Composition wirft | `catch -> failed`; `planning_failed`, `persistence_failed`, `invalid_state` alle `-> failed` | alle tieferen Stufen; der konkrete produktive Fehler kollabiert zu `failed` |
| Immediate Delivery | First-Contact-Success plus `started | deferred` | Delivery wirft | `catch -> deferred` | Delivery-Fehler absichtlich geschlossen; nicht Ursache des fehlenden Commits |
| Recovery Discovery | `FirstContactRecoveryItem[]` | Config/RPC/Zod kann werfen | RPC wird zu fester Exception; Parse wirft; **nicht** vom Handler um Discovery herum gefangen | kann Route vor Summary scheitern; nicht der beschriebene HTTP-200-Item-Failure |
| Recovery Item | `ProductiveFirstContactResult` | Runner kann werfen | Result wird gezählt; Throw `unexpected_error += 1` | konkrete Exception; per-item Isolation bleibt erhalten |

**Antwort auf Auditfrage 1:** Ein Supabase-Fehler ist nur unmittelbar am jeweiligen Adapter-/Domain-RPC-Return verfügbar. Ein Zod-Fehler ist nur am jeweiligen `safeParse` verfügbar. Planner und Renderer liefern unterschiedliche geschlossene Unions, werden aber in `InitialPromptResult` beide `planning_failed`. Commit-RPC-Fehler und ungültiges Commit-Result werden beide `persistence_failed`. Im Orchestrator werden diese schließlich `failed`.

## 5. Closed Diagnostic Taxonomy

Die Taxonomie ist eine interne Diagnoseklassifikation, keine neue fachliche API. `stage` und zulässiger `result_code` sind je Code fest, nicht frei formulierbar.

| `diagnostic_code` | `stage` | erste sichere Klassifikations-Boundary | optionaler geschlossener `result_code` |
|---|---|---|---|
| `foundation_exception` | `foundation` | Orchestrator-Catch um Foundation | keiner |
| `foundation_result_rejected` | `foundation` | Orchestrator nach Foundation-Result | einer der fünf bestehenden Foundation-Failure-Statuswerte |
| `initial_prompt_adapter_unavailable` | `initial_prompt_adapter` | Initial-Prompt-Adapter Env-Validierung | keiner |
| `initial_context_rpc_failed` | `initial_context` | Context-RPC: zurückgegebenes `error` **oder** geworfene RPC-Exception | keiner |
| `initial_context_result_invalid` | `initial_context` | `contextResult.safeParse` | keiner |
| `initial_context_result_rejected` | `initial_context` | valides `invalid_state` | `invalid_state` |
| `assessment_failed` | `assessment` | `buildIntermediateAssessment` Failure oder Throw | kein Domain-Code loggen (nicht für Production-Diagnose erforderlich) |
| `planning_failed` | `planning` | Planner Failure, Throw oder unerwarteter `stop_result` | kein Planner-Code loggen |
| `rendering_failed` | `rendering` | Renderer Failure oder Throw | kein Renderer-Code loggen |
| `snapshot_validation_failed` | `snapshot_validation` | Snapshot-`safeParse` | keiner |
| `commit_rpc_failed` | `commit` | Commit-RPC: zurückgegebenes `error` **oder** geworfene RPC-Exception | keiner |
| `commit_result_invalid` | `commit` | weder Success- noch Closed-Result-Schema parsebar | keiner |
| `commit_result_rejected` | `commit` | valides `invalid_state` | `invalid_state` |
| `unexpected_error` | `orchestration` | letzter defensiver Orchestrator-Catch, nur wenn keine tiefere Klassifikation existiert | keiner |

### 5.1 Bewusst nicht als Failure-Diagnose geloggte Resultate

- Context `already_initialized` ist Replay-Success.
- Context/Commit `already_advanced` und `not_applicable` bleiben `not_applicable`.
- Commit `stale` bleibt `stale`.
- `initialized` und `already_initialized` sind Success.
- Delivery `deferred` ist nach erfolgreichem Commit keine Initialisierungs-Fehldiagnose.

`initial_context_not_eligible` wäre daher zu grob: es würde erwartete Konkurrenz-/Idempotenzresultate als Fehler markieren. Nur `invalid_state` führt heute letztlich zu `failed` und erhält den engeren Code `initial_context_result_rejected`. Ebenso ist `commit_result_rejected` nur für `invalid_state` erforderlich. Die Taxonomie trennt exakt die heute zusammenfallenden Stufen, ohne DB-Fehlertexte oder Zod-Issues zu benötigen.

## 6. Raw Error versus Closed Error

Die installierte `@supabase/supabase-js`-/PostgREST-Version liefert bei fehlgeschlagenen Requests ein strukturiertes Error-Objekt. Der Typ besitzt `message`, `details`, `hint` und `code`; Netzwerkfehler können außerdem intern Stack/Cause in `details` abbilden. Der aktuelle First-Contact-Source-Contract typisiert `error` absichtlich als `unknown` und prüft nur Truthiness.

Für G-1 gilt verbindlich:

1. `message`, `details`, `hint`, Stack, Cause und das gesamte Error-Objekt dürfen niemals geloggt, serialisiert, zurückgegeben oder an Diagnostic Metadata angehängt werden. Diese Werte können SQL, konkrete Werte, Payload, URLs oder Infrastrukturdetails enthalten.
2. Auch `code` wird in G-1 **nicht** geloggt. Obwohl Postgres-/PostgREST-Codes häufig stabil sind, existiert im Repository keine geprüfte Allowlist mit Semantik und Redaction-Contract. Ein ungefiltertes Feld würde den engen Contract unnötig erweitern.
3. Die einzige Ableitung aus `error` ist dessen Vorhandensein: Context versus Commit ist bereits durch die aufrufende Boundary eindeutig. Daraus entsteht der feste Code `initial_context_rpc_failed` beziehungsweise `commit_rpc_failed`.
4. Zod-Issues werden ebenfalls nicht geloggt. Der feste Code `*_result_invalid` reicht aus.

Damit ist der aktuelle Production-Fehler einer Stufe zuordenbar, ohne Provider-/DB-Details zu exponieren. Ein späteres separates Paket darf eine explizite DB-Code-Allowlist auditieren; G-1 benötigt sie nicht.

## 7. Safe Diagnostic Data Contract

### 7.1 Exakt erlaubtes Event

```ts
console.error("first_contact_initialization_failed", {
  diagnostic_code: /* geschlossener Code aus Abschnitt 5 */,
  stage: /* zum Code gehörige geschlossene Stage */,
  // result_code nur für foundation_result_rejected oder *_result_rejected
  result_code: /* geschlossener bestehender Status; sonst Feld weglassen */,
});
```

Erlaubt sind ausschließlich:

- das konstante Event Label `first_contact_initialization_failed`;
- `diagnostic_code` aus der geschlossenen Union in Abschnitt 5;
- die deterministisch dazugehörige `stage`;
- optional `result_code`, nur aus der je Tabellenzeile erlaubten geschlossenen Union.

Der Plattform-Timestamp genügt. `conversation_id`, `project_id`, `outbound_message_id`, Pending-/Snapshot-/Command-/Delivery-UUIDs und eine neu generierte Correlation-ID sind **nicht erforderlich und verboten**. Im Webhook ist ein Event einer Function-Ausführung zeitlich zugeordnet; Recovery arbeitet mit Concurrency 1 und erzeugt pro fehlgeschlagenem Item genau ein Event. Eine ID würde die Fehlerstufe nicht genauer machen und erhöht unnötig Korrelation/Reidentifikationsrisiko.

### 7.2 Explizit verbotene Felder und Werte

Verboten sind Telefonnummer, WhatsApp External Identity, Customer-Name, E-Mail, Nachrichtentext, Prompttext, gerenderter Customer-Text, Provider-/Meta-Payload, Tokens und Secrets jeder Art, Supabase-Credentials, generiertes Passwort, Snapshot, Knowledge Claims, User-Free-Text, rohe Query/SQL-Parameter sowie alle internen IDs. Ebenfalls verboten: Error-Objekt, Error-Name/-Message/-Details/-Hint/-Code, Stacktrace, Cause, Zod-Issues, `JSON.stringify(error)` und dynamisch aus Fehlern gebaute Strings.

Es werden keine Parameter aus dem Inbound Event, Planner Context, Render Result, Commit Args oder Environment in den Logger gereicht. Tests behandeln sensible Canary-Werte als unzulässige Teilstrings in sämtlichen Logger-Argumenten.

## 8. Minimaler Implementierungspunkt und Logging Boundary

### 8.1 Bewertung der Optionen

| Option | Bewertung |
|---|---|
| A — nur Orchestrator | einziger richtiger Logging-Ort, aber ohne geschlossene Tiefenpropagation kann er Context/Planner/Renderer/Snapshot/Commit nicht unterscheiden |
| B — Initial Prompt/Adapter | richtiger erster Klassifikationsort für tiefe Stufen, aber falscher Logging-Ort: Foundation fehlt und Aufrufer könnten doppelt loggen |
| C — RPC Adapter | kann RPC-Fehler sehen, nicht Domain-/Parse-/Result-Stufen; direktes Logging würde Context und Commit plus Orchestrator duplizieren |
| D — Recovery Handler | sieht heute nur `failed`; deckt Immediate Webhook nicht ab und würde Recovery-Exceptions doppelt/anders behandeln |
| E — geschlossene Propagation nach oben | **gewählt**: tief klassifizieren, ausschließlich oben loggen |

### 8.2 Verbindliche Strategie

Der Fehler wird an der jeweils tiefsten sicheren Boundary klassifiziert und als interne, geschlossene `diagnostic` Metadata nach oben propagiert. **Ausschließlich** `runProductiveFirstContactInitialization(...)` emittiert, unmittelbar bevor es `{ status: "failed" }` zurückgibt, genau ein Event. Der Logger erhält nie das originale `Error`.

Der Orchestrator klassifiziert Foundation-Exception/-Result selbst. Initial Prompt klassifiziert Context, Assessment, Planning, Rendering, Snapshot und Commit. Der Adapter klassifiziert nur seine eigene Konfigurationsgrenze. Ein letzter Orchestrator-Catch erzeugt `unexpected_error`, wenn eine Dependency ohne Diagnostic Metadata wirft. Webhook und Recovery Handler loggen First-Contact-Item-Fehler nicht.

**Deduplication:** Ein einzelner Invocation-Scoped Kontrollfluss hat genau eine Sink. Tiefe Ebenen loggen nie; der Orchestrator loggt nur `status === "failed"`; Webhook-/Recovery-Catches und Summary-Mapping loggen nie. Eine spätere Recovery-Ausführung ist eine neue Ausführung und darf bei erneutem Fehlschlag ein neues Event erzeugen. Das ist keine Dublette derselben Ausführung.

Eine kleine private Funktion im Orchestrator darf die strukturelle Ausgabe zentralisieren; es wird keine allgemeine Telemetry-Architektur eingeführt. `console.error` ist angemessen, weil jeder Event einem nicht erreichten Initial Prompt entspricht. `console.warn` würde einen fachlich kontrollierten, aber produktionsblockierenden Fehler untergewichten.

## 9. Result-Union-Änderungen

Der öffentliche fachliche `ProductiveFirstContactResult` bleibt exakt unverändert. Insbesondere Webhook und Recovery Response erhalten keine Diagnostic-Felder.

Für die serverinterne Propagation ist folgende minimale Änderung verbindlich:

- `InitialPromptResult` behält alle heutigen `status`-Werte und Success-Identitäten.
- Nur die drei heute zu Orchestrator-`failed` führenden Varianten (`invalid_state`, `planning_failed`, `persistence_failed`) erhalten verpflichtend `diagnostic: { diagnostic_code; stage; result_code? }`.
- Alternativ darf die Implementierung diese drei Statuswerte durch eine private detaillierte Union innerhalb derselben Datei erzeugen, sofern der exportierte Adapter-Return diese Metadata typsicher bis zum Orchestrator trägt. Kein `any`, kein freier String und kein `Error` im Typ.
- `ProductiveFirstContactResult` wird nicht erweitert. Der Orchestrator entfernt die Metadata an seiner öffentlichen Return-Boundary nach dem einmaligen Log.
- Foundation-Result muss nicht geändert werden; dessen vorhandener Status ist ausreichend. Adapter-Konfigurationsfehler bleiben fachlich `persistence_failure`, werden aber entweder durch eine nur intern erkennbare Metadata oder eine private Adapter-Result-Union als `initial_prompt_adapter_unavailable` klassifiziert.

Die bevorzugte Umsetzung ist ein nicht exportierter beziehungsweise serverinterner `FirstContactDiagnostic`-Typ in `first-contact-initial-prompt.ts`, den der Orchestrator als Type importiert. Keine Diagnostic Metadata gelangt in Browser, Provider oder HTTP JSON.

## 10. Webhook Contract

Unverändert verbindlich:

- Ein erfolgreich persistierter Meta-Inbound bleibt nach kontrolliertem Initialisierungsfehler HTTP 200.
- Keine Diagnose-Exception wird absichtlich zum Webhook propagiert; Logging darf selbst keine fallible Serialisierung enthalten.
- Die vorhandene leere Isolation um Eligibility/Initialisierung bleibt bestehen.
- „Same message never answer“ bleibt erhalten: Routing erfolgt einmal aus dem Persistence-Result, ohne erneute Cycle-Eligibility nach Bootstrap.
- Diagnose erzeugt weder einen zweiten Initialisierungsaufruf noch einen zweiten Prompt.
- Planner-, Commit- und Delivery-Semantik bleiben unverändert. Insbesondere wird Delivery nur nach persistiertem Prompt gestartet.

## 11. Recovery Contract

Unverändert verbindlich:

- kontrollierte Item-Failures liefern HTTP 200 und erhöhen weiterhin `failed`;
- nur ein tatsächlich geworfener, nicht vom Orchestrator geschlossener Item-Fehler erhöht weiterhin `unexpected_error`;
- Discovery-Batchgröße bleibt 10, die awaited Schleife bleibt Concurrency 1, das Startbudget bleibt 40.000 ms;
- `failed` und `unexpected_error` bleiben unveränderte Summary Counts ohne IDs oder Diagnosefelder;
- Scheduler, Minute-Takt, Vault, Secret, Route und Migration bleiben unverändert;
- keine neue Route, kein neues Secret, keine Migration.

Bei einem vom Orchestrator geschlossenen Failure entsteht genau ein serverseitiger Event und `failed += 1`. Falls der Orchestrator selbst wider Erwarten vor seiner Sink wirft, bleibt der Handler bei `unexpected_error += 1`; G-1 darf daraus keinen zweiten First-Contact-Diagnostic-Logger im Handler machen.

## 12. Teststrategie für AP-16-06-05G-1

### 12.1 `test/first-contact-initial-prompt.test.ts`

Mit injizierter RPC-Source und, soweit für reine Domain-Stufen nötig, eng ergänzten internen Dependencies testen:

1. Context-RPC returned `error` und RPC-Throw -> `initial_context_rpc_failed`.
2. Ungültiges Context-JSON -> `initial_context_result_invalid`.
3. Context `invalid_state` -> `initial_context_result_rejected`; erwartete `already_*`/`not_applicable` bleiben ohne Failure-Diagnostic.
4. Assessment Failure/Throw -> `assessment_failed`.
5. Planner Failure, Stop oder Throw -> `planning_failed`.
6. Renderer Failure/Throw -> `rendering_failed`.
7. Snapshot Parse Failure -> `snapshot_validation_failed`.
8. Commit-RPC returned `error` und RPC-Throw -> `commit_rpc_failed`.
9. Ungültiges Commit-JSON -> `commit_result_invalid`.
10. Commit `invalid_state` -> `commit_result_rejected`; `stale`, `already_advanced`, `not_applicable` bleiben ihre heutigen fachlichen Resultate ohne Failure-Diagnostic.
11. Success/Replay bleibt bitgleich in Identitäten und ohne Diagnostic.

Tests dürfen Planner/Renderer nicht fachlich verändern. Falls Injection ergänzt wird, müssen Defaults exakt die heutigen Funktionen sein und der Erfolgsfall den heutigen Snapshot/Text beweisen.

### 12.2 `test/productive-first-contact.test.ts`

1. Foundation Throw -> genau ein Event `foundation_exception`.
2. Jeder Foundation-Failure-Status -> genau ein `foundation_result_rejected` mit ausschließlich zulässigem `result_code`.
3. Jede Initial-Prompt Failure-Metadata -> genau ein Event mit exakt Code/Stage und weiterhin `{status:"failed"}`.
4. unklassifizierter Prompt Throw -> genau ein `unexpected_error`.
5. Success, replay, stale, not-applicable und Delivery-deferred/-exception -> kein Initialisierungs-Failure-Event.
6. Logger-Spy beweist exakt einen Call pro fehlgeschlagener Ausführung und exakt zwei Argumente im erlaubten Shape.
7. Canary-Errors enthalten Telefonnummer, Nachricht, Prompt, Secret, Supabase `message/details/hint/code`, SQL und Stack; kein Logger-Argument enthält einen Canary-Teilstring und kein Error-Objekt wird übergeben.

### 12.3 `test/whatsapp-webhook.test.ts`

1. Persistenz plus jeder kontrollierte First-Contact-Failure bleibt HTTP 200.
2. Initialisierungs-Throw bleibt HTTP 200.
3. kein zweiter Cycle-/Initialisierungs-/Delivery-Aufruf; bestehendes One-Time-Routing bleibt unverändert.
4. Der Orchestrator-Logger wird nicht im Webhook dupliziert (über injizierten bereits geschlossenen Runner beziehungsweise statischen Spy).

### 12.4 `test/first-contact-recovery.test.ts`

1. kontrollierter Failure bleibt HTTP 200 und `failed: 1`.
2. Throw bleibt HTTP 200 und `unexpected_error: 1`.
3. kein Handler-Logger und damit keine Dublette; Summary bleibt exakt im bisherigen Shape.
4. Batch 10, Concurrency 1 und 40-Sekunden-Startbudget bleiben durch bestehende Tests gesichert.

### 12.5 Regression

Fokussiert alle First-Contact-, Initial-Prompt-, Recovery- und Webhook-Tests; danach komplette Vitest-Suite, Typecheck, Lint und `git diff --check`. Statische Tests stellen sicher, dass keine Migration, Route, Scheduler-, Planner-, Renderer-, Commit-, Delivery- oder Retry-Fachlogik geändert wird.

## 13. Exakter Umfang von AP-16-06-05G-1

### 13.1 Genaue Produktdateien

Änderungen sind ausschließlich zulässig in:

1. `lib/server/conversation/first-contact-initial-prompt.ts` — tiefe geschlossene Klassifikation/Propagation;
2. `lib/server/conversation/first-contact-initial-prompt-adapter.ts` — ausschließlich Adapter-Konfigurationsklassifikation;
3. `lib/server/conversation/productive-first-contact.ts` — Foundation-Klassifikation, genau eine Logging-Sink, Entfernung interner Metadata am Return;
4. `test/first-contact-initial-prompt.test.ts`;
5. `test/productive-first-contact.test.ts`;
6. `test/whatsapp-webhook.test.ts`;
7. `test/first-contact-recovery.test.ts`.

Eine neue Logging-Hilfsdatei ist für diesen einen Event nicht gerechtfertigt. Foundation-Dateien, Recovery-Produktdateien und Webhook-Produktdatei müssen nicht geändert werden. Sollte eine reine Dependency-Injection-Seam für Assessment/Planner/Renderer/Snapshot erforderlich sein, bleibt sie lokal in `first-contact-initial-prompt.ts`, mit unveränderten Production-Defaults.

### 13.2 Non-Goals

G-1 repariert keinen Fehler, erzeugt keinen manuellen Prompt, führt kein Production-RPC/SQL aus und ändert keine Daten. Keine Migration und keine historische SQL-Änderung; keine Änderung an Bootstrap, Eligibility, Planner-Regeln, Templates/Renderer, Snapshot-Schema, Commit-SQL, Delivery, Retry, Scheduler, Graph API, OpenAI/LLM, Pricing, Offer Authority, Human Review, Knowledge Claims oder Customer-Answer-Semantik. Keine neue öffentliche API, Route, Response, ID-Korrelation oder Telemetry-Plattform.

## 14. STOP Conditions geprüft

| STOP-Bedingung | Ergebnis |
|---|---|
| Stufe nur mit PII/rohem Fehler bestimmbar | tritt nicht ein; feste Boundary-Codes genügen |
| neue Migration erforderlich | nein |
| Webhook-HTTP-200 müsste geändert werden | nein |
| Recovery-Semantik müsste geändert werden | nein |
| Planner/Renderer/Commit/Delivery fachlich zu ändern | nein; nur Resultklassifikation um bestehende Aufrufe |
| OpenAI/LLM erforderlich | nein |
| gleichwertige zentrale sichere Telemetry-Authority vorhanden | nein |

Der Audit bleibt dennoch bewusst bei „Stufe“, nicht „Root Cause“: `commit_rpc_failed` verrät sicher, dass der Commit-RPC technisch scheiterte, aber nicht warum. Eine Ursache aus DB-Texten abzuleiten oder diese zu loggen ist ausdrücklich nicht autorisiert.

## 15. Abschlussbericht

- **Branch:** `codex/ap16-06-05g-first-contact-failure-diagnostics-audit`
- **Baseline Commit:** `0ac7e03950c201b0baab3be979e4723b4439afce`
- **Commit SHA:** wird durch den Audit-Commit `docs: audit first contact production failure diagnostics` erzeugt
- **Audit Result:** **READY**
- **Audit Artifact:** `docs/audits/AP-16-06-05G-first-contact-production-failure-diagnostics-audit.md`
- **Production Failure Path:** Context ist nach gegebenem Nachweis eligible; Fehler liegt im beobachteten Lauf zwischen Context-Freigabe und erfolgreichem atomaren Commit, heute ohne weitere sichere Unterklassifikation.
- **Error Swallowing Inventory:** Abschnitt 4.
- **Closed Diagnostic Taxonomy:** 14 feste Codes in Abschnitt 5; erwartete Idempotenz-/Konkurrenzresultate werden nicht als Failure geloggt.
- **Safe Diagnostic Data Contract:** ausschließlich Event Label, Code, Stage und bei drei Rejected-Klassen ein geschlossener Result-Code; keine IDs, Inhalte oder Rohfehler.
- **Exact Logging Boundary:** genau eine Sink in `runProductiveFirstContactInitialization(...)`.
- **Duplicate-Logging Prevention:** tiefe Klassifikation ohne Logging; kein Webhook-/Recovery-Item-Logging; genau ein Orchestrator-Event pro fehlgeschlagener Ausführung.
- **Webhook Contract:** persistierter Inbound und kontrollierte Initialisierungsfehler bleiben HTTP 200; One-Time-Routing unverändert.
- **Recovery Contract:** HTTP 200 bei Item-Failures, Summary, Batch 10, Concurrency 1 und 40-Sekunden-Startbudget unverändert.
- **Security / PII Contract:** Abschnitt 7; insbesondere keine UUID, Error-Serialisierung, Stacktrace oder Supabase-Felder.
- **Required Result-Union Changes:** nur serverinterne Diagnostic Metadata an den drei Initial-Prompt-Failure-Varianten; `ProductiveFirstContactResult` bleibt unverändert.
- **Test Plan:** Abschnitt 12.
- **STOP Conditions geprüft:** alle sieben, keine eingetreten.
- **READY für AP-16-06-05G-1:** **JA**.
- **Empfohlenes nächstes Paket:** `AP-16-06-05G-1 — First-Contact Production Failure Diagnostics` exakt nach Abschnitt 13.
