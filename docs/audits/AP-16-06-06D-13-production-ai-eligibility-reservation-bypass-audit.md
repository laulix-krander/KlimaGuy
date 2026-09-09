# AP-16-06-06D-13 — Production AI Eligibility / Reservation Bypass Audit

## 1. Status

**Audit abgeschlossen; exakte Production-Root-Cause: NOT PROVEN.** Dieses Paket ist ausschließlich ein statisches Audit. Es ändert weder Anwendungscode noch Tests, Migrationen, Daten, Provider, Modell, Prompt, Timeout, Retry oder Feature Gate.

Der engste beweisbare Ausführungskorridor ist: Authority Context wurde geladen, die beiden vor der Normalisierung liegenden Message-Guards wurden passiert, und danach lieferte einer der beiden Aufrufe des deterministischen Conversation-Cycle-Rechners einen nicht-Human-Review-Fehler, den `processPersistentCustomerMessage` auf den äußeren Code `cycle_failed` abbildete. Der vorgelegte Log beweist dagegen **nicht**, dass die AI-Reservation nicht erreicht oder die Failure-Persistierung fehlgeschlagen ist: Der Recovery Runner setzt beide Diagnosefelder in jedem hier relevanten Fehlerpfad konstant auf `false` und übernimmt keine entsprechende Ausführungsinformation aus dem Service.

Damit ist die Prämisse „Reservation Bypass“ aus dem Log nicht ableitbar. Ohne einen branch-spezifischen, privacy-safe Production-Beleg lässt sich zwischen fehlendem Interpreter, nicht ausgeführter Eligibility, ausgeführter Eligibility/Reservation/Provider-Klassifikation mit anschließendem deterministischen Fehler und den jeweiligen internen Cycle-Fehlercodes nicht entscheiden.

## 2. Baseline SHA

- Audit-Baseline/aktueller Repository-HEAD: `1fd003535e0a52634d4a262b86018cd7e58afe11` (`Merge pull request #202 ... fix-rehabilitated-epoch-retry-authority`).
- Der lokale Branch heißt `work`; `git branch -avv` zeigt keinen separaten lokalen/remoten `main`-Ref. Der HEAD enthält als Merge-Historie die abgeschlossenen Pakete 06D-6 bis 06D-12.
- Relevante wirksame jüngste Migrationen sind insbesondere `202609080001_ai_cycle_attempt_claimless_technical_escalation_authority.sql`, `202609090001_production_cycle_schema_reconciliation.sql`, `202609090002_production_reconciliation_type_compatibility_fix.sql`, `202609090003_stuck_processing_customer_answer_recovery.sql`, `202609090004_customer_answer_context_rpc_repair.sql`, `202609090005_exhausted_technical_recovery_rehabilitation.sql`, `202609090006_existing_recovery_discovery_undefined_column_repair.sql`, `202609090007_customer_answer_context_outbound_text_repair.sql` und `202609090008_rehabilitated_technical_epoch_retry_authority_repair.sql`.
- Die Audit-Artefakte AP-16-06-06D-6 bis -12 wurden gelesen. Sie etablieren schrittweise stuck-processing recovery, Context-RPC-Reparatur, degradierte Discovery, einmalige technische Rehabilitation, Discovery- und Context-`outbound_text`-Reparaturen sowie den frischen rehabilitierten Retry-Epoch. Die neue Evidence bestätigt nun Discovery, Acquisition und Context Read und verschiebt die Grenze hinter diese Pakete.

## 3. Incident Evidence

Vom Auftrag als verifizierte Production-Evidence übernommen:

- `conversation_id=ed8e842d-e6f4-4c5d-9305-e723d6f6794c`
- `customer_id=a20491d7-3c02-4e71-86ff-e125c82f95d2`
- `project_id=75de4d21-e54e-486e-9bff-e8deaace9e85`
- `source_message_id=9afad389-7d46-4aa2-9669-f7a82ead9854`
- `command_id=bbd0df13-47f1-4b68-a4ab-9d372611465f`
- `pending_interaction_id=9732fe6a-81bf-4501-a1b6-88834bfe16ff`
- `information_key=building_type`
- Prompt: „Um welche Gebäudeart handelt es sich?“
- Antwort: „Das ist ein freistehendes Einfamilienhaus, in dem wir selbst wohnen.“
- Production Environment: `AI_CUSTOMER_ANSWER_CLASSIFICATION_ENABLED=true`, Scope Production, bereits vor dem Deployment gesetzt.
- Item Log: `stage=execution`, `failure_category=controlled_failure`, `result_code=cycle_failed`, `acquisition_succeeded=true`, `authority_context_loaded=true`, `ai_attempt_reservation_reached=false`, `failure_persistence_succeeded=false`.
- Summary: genau ein bestehender Command entdeckt und versucht; ein Fehler; keine Discovery-Degradation, kein Busy/Stale/Ownership-Lost/Terminal/Unexpected-Error.
- Vor diesem Lauf gemeldeter Datenwert: `ai_inference_attempt_count=0`. Es liegt kein verifizierter Wert **nach** diesem Lauf vor.

## 4. Current Proven Boundary

`acquisition_succeeded=true` und `authority_context_loaded=true` entstehen im Runner bei einem Service-Fehler mit Command-ID und einer Diagnostic Stage ungleich `context_read`. Weil der Service `cycle_failed` nur nach erfolgreich geladener Authority und nach den Direction/Sequence-Guards erzeugt, ist bewiesen:

1. Input-UUID war gültig.
2. Acquisition lieferte keine Replay-/Busy-/Stale-/Authority-Fehlantwort, sondern einen parsebaren Authority Context.
3. `direction=inbound`, `actor_class=customer`, `message_kind=text` und `message_sequence>prompt_sequence` wurden passiert; andernfalls wären andere Codes zurückgekehrt.
4. `normalizeCustomerAnswer(...)` wurde aufgerufen.
5. Ein deterministischer Rechner (`runConversationCycle` oder, nach einer AI-Reservation und einem erfolgreichen `no_match`/`ambiguous`, `runConversationCycleWithoutClaim`) gab einen nicht-Human-Review-Fehler zurück.

Nicht aus dem Log beweisbar sind Normalisierungs-Ergebnis, Interpreter-Presence, Eligibility-Auswertung, Reservation-Aufruf, Provider-Aufruf, konkreter interner `ConversationCycleFailure.code` und Erfolg der bereits im Service versuchten Failure-Persistierung.

## 5. End-to-End Control Flow

| Übergang | Datei / Funktion | Relevante Bedingung und Rückgaben | Incident-Beweis |
|---|---|---|---|
| HTTP POST | `app/api/internal/conversation-cycles/recovery/route.ts`; exportiertes `POST` | Node Runtime, force-dynamic; delegiert an Handler | Summary/Event beweisen Handler-Ausführung |
| Auth/Composition | `recovery-handler.ts`; `createConversationCycleRecoveryHandler` | Secret fehlt → 503; Token falsch → 401; danach `createRuntime()` | Discovery-Log schließt beide frühen Returns aus |
| Runtime | `productive-cycle-runtime.ts`; `createProductiveCycleRuntime` | Supabase URL/Key fehlen → Throw; sonst Source und Runner; Gate exakt `"true"` → Interpreter property | Discovery/Attempt schließen Config-Throw aus; Property-Presence im konkreten Prozess nicht geloggt |
| Discovery | `recoverable-cycle-runner.ts`; `discoverRecoverableConversationCycles` | Existing/missing RPC je success/failure; dedupliziert, limitiert | existing=1, degraded=false beweist erfolgreiche Existing-Discovery |
| Candidate execution | `recovery-handler.ts` → `runPersistentCustomerMessageCycle` | Budget kann vor Start abbrechen; Result Kind wird gezählt | attempted=1 und failure event beweisen Start |
| Acquisition composition | `recoverable-cycle-runner.ts`; `createPersistentCycleDataSource` und `processPersistentCustomerMessage` | UUID ungültig → `invalid_input`; Claim/acquire kann replay/error/busy/stale liefern | `acquisition_succeeded=true` schließt dies aus |
| Claim/acquire + Context Read | `persistent-cycle-data-source.ts`; `claimCustomerMessage` | `acquire_customer_message_cycle_execution`, danach `loadCustomerMessageCycleAuthority`; Context-Fehler mit Stage `context_read` | `authority_context_loaded=true` beweist parsebare Authority |
| Service guards | `persistent-conversation-cycle-service.ts`; `processPersistentCustomerMessage` | falscher Message-Typ → `message_not_inbound_customer_text`; Sequence ≤ Prompt → `message_precedes_interaction` | `cycle_failed` schließt beide aus |
| Raw answer | gleiche Funktion | baut stets `raw_value={kind:"text", value:a.message_text}` sowie IDs/Template/Locale aus Authority | Konstruktion wurde erreicht; tatsächliche Authority-Felder außer supplied Evidence nicht separat geloggt |
| Normalization | `answer-normalization.ts`; `normalizeCustomerAnswer` | Schema, Bindings, Contract, Attempt, Special, Type/Length; Fehler → persistiere `normalization_failed`, return gleicher Code | Aufruf bewiesen; Erfolg durch `cycle_failed` logisch bewiesen, denn der Fehler-Branch kehrt vorher zurück |
| AI decision | `persistent-conversation-cycle-service.ts` | nur wenn `customerAnswerInterpreter && isCustomerAnswerAiEligible(...)` | Ob Short-Circuit oder Eligibility-Auswertung stattfand: nicht beobachtbar |
| Reservation | Service → Data Source → `persistent-cycle-commit.ts`; `reserveCustomerAnswerAiInferenceAttempt` → SQL RPC | erst nach beiden Bedingungen; controlled failure mappt überwiegend auf `persistence_failed`, exhausted auf Review | Aus `cycle_failed` weder beweisbar noch ausschließbar |
| Interpreter | `createCustomerAnswerInterpreter` → `interpretCustomerAnswer` → lazy Provider | nur nach erfolgreicher Reservation; Fehler führen zu Review/Deferral/Persistence-Fehler, nicht direkt `cycle_failed` | Erfolgreicher Provider-Pfad mit matched/no-match bleibt möglich |
| Deterministic cycle | Service → `runConversationCycle`, oder nach AI `no_match/ambiguous` → `runConversationCycleWithoutClaim` | Human-review Fehler wird terminalisiert; sonstiger Fehler wird als `cycle_failed` persistiert und zurückgegeben | Einer dieser zwei Fehlerzweige ist die exakte äußere Quelle |
| Completion/failure | Commit-/Review-/Failure Authorities | Success commit; Cycle failure invokes `failCustomerMessage` und ignoriert dessen Boolean | Log kann Persistierungserfolg nicht unterscheiden |

Normaler WhatsApp-Inbound und Recovery treffen nach unterschiedlichen Triggern denselben Composition Root und Runner: `ingestion.ts` ruft request-/invocation-time `createProductiveCycleRuntime()` und danach `runPersistentCustomerMessageCycle()` auf; Recovery tut dasselbe über den Handler. Es gibt keine produktive Fallback-/Test-Runtime im Route-Pfad.

## 6. Meaning of `ai_attempt_reservation_reached`

Die Bezeichnung entspricht im aktuellen Code **keinem instrumentierten Zustand**:

- `processPersistentCustomerMessage` besitzt kein Diagnostic-Feld und setzt keinen Reservation-Marker.
- `runPersistentCustomerMessageCycle` setzt `ai_attempt_reservation_reached:false` in seinem `persistence_failed`-Sonderpfad und erneut in jedem übrigen diagnostizierten Failure-Pfad.
- Es gibt keine Zuweisung auf `true`, weder unmittelbar vor noch nach dem RPC.
- `recovery-handler.ts` propagiert lediglich diesen konstanten Wert beziehungsweise defaultet bei fehlender Diagnostic ebenfalls auf `false`.

Folglich kann der Wert `false` bedeuten: vor Normalization abgebrochen, Normalization fehlgeschlagen, Interpreter fehlte, Eligibility war false, Reservation scheiterte, Reservation gelang, OpenAI scheiterte und spätere Authority mappt einen Fehler, oder Reservation/OpenAI gelangen und ein späterer deterministischer Cycle schlug fehl. Möglichkeit **E (Observability markiert reached fälschlich nicht)** ist für jeden tatsächlich erreichten Reservation-Pfad durch den Code bewiesen.

### Realistische Pfade nach Context Read

| Path / Condition | Reservation tatsächlich erreicht? | geloggter Marker | Resultierende Stage / Result Code |
|---|---:|---:|---|
| Message-Typ-/Sequence-Guard | Nein | false | execution / jeweiliger Guard-Code |
| Normalization failure | Nein | false | execution / `normalization_failed` |
| Kein Interpreter | Nein | false | danach deterministic; bei nicht-review Cycle-Fehler execution / `cycle_failed` |
| Interpreter da, Eligibility false | Nein | false | danach deterministic; ggf. execution / `cycle_failed` |
| Eligibility true, lokale Reservation-Inputvalidierung/RPC/Response fehlschlägt | Ja (Funktionsgrenze; RPC bei lokal invalidem Input nein) | false | execution / meist `persistence_failed`; Ownership kann `ownership_lost` werden |
| Reservation attempts exhausted | Ja | false | Review-Authority; Erfolg `human_review`, Fehler ggf. `persistence_failed` |
| Reservation success, Provider config/non-transient/3rd transient failure | Ja | false | Technical Review; Erfolg `human_review`, Authority-Fehler ggf. `persistence_failed` |
| Reservation success, transient attempt 1/2 | Ja | false | Deferral; äußerer `interaction_not_current` oder `persistence_failed` |
| Reservation success, AI no-match/ambiguous, claimless deterministic failure | Ja | false | execution / `cycle_failed` |
| Reservation success, AI matched, ordinary deterministic failure | Ja | false | execution / `cycle_failed` |
| Interpreter absent/ineligible, ordinary deterministic failure | Nein | false | execution / `cycle_failed` |
| Deterministic human-review failure/status | abhängig vom Zweig | false, falls später Failure geloggt | normalerweise `human_review`; Persistenzfehler kann `persistence_failed` liefern |
| Success commit fails | abhängig vom Zweig | false | execution / Commit-Resultcode (typisch `persistence_failed`) |

## 7. Productive Runtime Composition

`createProductiveCycleRuntime()` liest Supabase URL, Service Key und `process.env.AI_CUSTOMER_ANSWER_CLASSIFICATION_ENABLED` **bei jedem Funktionsaufruf**, nicht beim Modulimport. Der Provider Wrapper wird dabei erstellt, aber `OpenAiStructuredInferenceProvider` wird erst beim ersten `generateStructuredInference` dynamisch importiert und danach nur innerhalb dieses Runtime-Objekts wiederverwendet. Es gibt keinen modulweiten Runtime-/Interpreter-Singleton.

Recovery: Route importiert den Handler, der Default `createRuntime` verweist auf `createProductiveCycleRuntime`; erst im authentisierten POST wird `createRuntime()` ausgeführt. Webhook: die Route erstellt Webhook-Handler auf Modulebene, doch `ingestion.ts` erstellt die Productive Runtime erst während der Message-Verarbeitung. Beide verwenden dieselbe Runtime-Funktion und denselben Runner; Unterschiede liegen nur vor deren Aufruf.

Antworten auf die Composition-Fragen:

1. **Ja**, das Gate wird im Recovery-Prozess gelesen, sofern keine Dependency Injection erfolgt; die produktive Route injiziert nichts.
2. **Request-time**, nach erfolgreicher Recovery-Authentisierung.
3. Bei `process.env... === "true"` erzeugt der Code zwingend `customerAnswerInterpreter`. Eine Runtime ohne Interpreter wäre nur bei anderem tatsächlichem String/Environment oder expliziter Test-Injection möglich; Letzteres ist in der Route nicht vorhanden. Die supplied Vercel-Evidence macht fehlendes Gate nicht zu einer vertretbaren Root-Cause, beweist aber ohne Runtime-Beobachtung nicht die konkrete Property im laufenden Invocation-Prozess.
4. Es gibt unterschiedliche Trigger, aber **keine unterschiedlichen Productive Composition Roots** für die Cycle-Ausführung.
5. Ein Modulcache entfernt den Interpreter nicht: Environment wird beim Runtime-Aufruf gelesen. Ein bereits erzeugtes Runtime-Objekt wird ebenfalls nicht global gecacht.
6. **Ja**, der Recovery Default verwendet `createProductiveCycleRuntime` tatsächlich.
7. **Nein** im aktuellen produktiven Route-Code; alternative Runtimes existieren nur über explizite Dependency Injection für Tests.

## 8. Feature-Gate Analysis

`AI_CUSTOMER_ANSWER_CLASSIFICATION_ENABLED` ist ein strikter, case-sensitiver Vergleich mit `"true"`. Die supplied Production-Konfiguration ist daher als Deployment-Evidence **PROVEN** und würde bei diesem Request-Time Read einen Interpreter erzeugen. Es gibt keine zusätzliche AI-Feature-Gate-Prüfung. Der Audit behauptet ausdrücklich nicht, das Gate fehle.

Weil der Log weder den gelesenen Gate-Branch noch Interpreter-Presence enthält, bleibt der konkrete Runtime-Zustand formal `NOT PROVABLE`; aus dem statischen Code plus supplied Deployment-Evidence ist Interpreter-Presence jedoch **erwartet**. Minimal nötige Evidence ist nicht der Environment-Wert erneut, sondern der ausgewertete Branch im konkreten Invocation.

## 9. Concrete `building_type` Normalization

Der Service konstruiert `raw_value.kind="text"`, `raw_value.value` exakt aus `authority.message_text` und setzt `attempt_number=1`. Der Registry-Template-Vertrag für `ask_building_type` ist `answer_type=text`, required, unknown/skip erlaubt, `min_length=2`, `max_length=100`, Optionen unknown/skip und `maximum_attempts=2`.

Unter der durch den geladenen, streng validierten `building_type`-Authority erwarteten Binding-Identität (Project, Conversation, Decision, Template Key/Version und Locale stimmen zwischen Raw Answer und Rendered Interaction) ist die bekannte 68 Zeichen lange Antwort weder special/empty/too short/too long noch Option. Das Ergebnis ist:

```text
success = true
outcome = answered
value.kind = text
value.value = "Das ist ein freistehendes Einfamilienhaus, in dem wir selbst wohnen."
```

Für den **tatsächlichen Lauf** ist Erfolg zusätzlich durch den äußeren `cycle_failed`-Code bewiesen: Jeder Normalization-Fehler kehrt sofort mit `normalization_failed` zurück und kann nicht zu `cycle_failed` werden. Normalization kann also erfolgreich sein, ohne dass Eligibility ausgewertet wird (wenn der Interpreter beim `&&` fehlt). Sie kann fehlschlagen, aber dann entsteht ausschließlich `normalization_failed`, nicht der beobachtete Code.

## 10. Concrete AI Eligibility Evaluation

`getAnswerInterpretationRule("building_type")` findet die aktive canonical text rule: `status=active`, `supported_normalized_kind=text`, Entity `project`, Semantic Mode `technical_property`. `BUILDING_TYPE_VALUES` enthält Schlüssel `einfamilienhaus`, `doppelhaushälfte`, `doppelhaushaelfte`, `reihenhaus`, `mehrfamilienhaus`, `wohnung`, `gewerbe`, `gewerbegebäude`, `gewerbegebaeude`, `sonstiges` und die zugehörigen kanonischen Werte.

Eligibility trimmt, lowercaset mit Locale `de-DE`, entfernt nur abschließende `.`, `!`, `?` und trimmt erneut. Der bekannte Satz wird daher:

```text
das ist ein freistehendes einfamilienhaus, in dem wir selbst wohnen
```

Dieser vollständige String ist kein Registry-Key. Bei der bewiesenen Normalized Answer und `information_key=building_type` liefert `isCustomerAnswerAiEligible` deterministisch **true**. Das ist **PROVEN als erwartetes Funktionsergebnis**. Ob die Funktion tatsächlich ausgewertet wurde, bleibt wegen JavaScript-Short-Circuit und fehlender Branch-Observability `NOT PROVABLE`.

Exact canonical matches bleiben providerfrei, weil Eligibility für vorhandene Keys `false` liefert. Der konkrete Freitext ist dagegen erwartbar providerfähig.

## 11. Reservation Authority Analysis

Aufrufstelle ist der AI-Branch in `processPersistentCustomerMessage`, nach erfolgreicher Normalization, Interpreter-Presence und true Eligibility und vor Interpreter/Provider. `reserveCustomerAnswerAiInferenceAttempt` validiert fünf IDs/Versionen lokal. Bei Erfolg ruft es `reserve_customer_answer_ai_inference_attempt` mit Command, Source Message, erwarteten Revisionen und Execution Owner auf.

Die SQL Authority verlangt service role, nicht-null Eingaben, vorhandenen/processing Customer-Answer-Command, gültigen Owner und Lease, gleiche Source Message, aktuelle Runtime-/Knowledge-Versionen sowie aktuelle Pending Interaction/Snapshot-Beziehungen. Sie lehnt bei Count ≥3 mit `attempts_exhausted` ab; andernfalls erhöht sie atomar auf 1, 2 oder 3 und gibt `reserved` zurück. Bei dem vorab gemeldeten Count 0 wäre die Count-Prüfung erfüllt; alle übrigen Vorbedingungen werden dennoch erst im RPC geprüft.

Lokale invalid input kann vor dem RPC `invalid_input` liefern. RPC-Transportfehler oder malformed response werden konservativ zu `command_not_found`; Ownership Loss setzt den Runner-Callback. Im Service werden exhausted Versuche in Technical Human Review überführt, Ownership Loss zu `interaction_not_current`, alle anderen Reservation-Fehler zu `persistence_failed`. **Keine Reservation-Vorbedingung kann `cycle_failed` erzeugen.** Daher beweist `cycle_failed`, dass entweder Reservation nicht betreten wurde oder sie erfolgreich war und danach ein deterministischer Cycle fehlschlug.

## 12. Complete `cycle_failed` Source Inventory

Produktive Vorkommen, bereinigt um Tests/Dokumentation:

1. `conversation-cycle-orchestration.ts` deklariert den äußeren Code und klassifiziert ihn `retryable`; es erzeugt ihn nicht.
2. `persistent-conversation-cycle-service.ts`, AI `no_match|ambiguous` branch: `runConversationCycleWithoutClaim(...)` schlägt fehl, Service ruft `failCustomerMessage(...,"cycle_failed")` auf und gibt äußeres `cycle_failed` zurück. Reservation und erfolgreicher Interpreter **müssen** hier zuvor erreicht worden sein.
3. Dieselbe Datei, allgemeiner Branch: `runConversationCycle(...)` schlägt ohne `requires_human_review` fehl; Service persistiert/returns `cycle_failed`. Dieser Branch ist sowohl ohne AI (fehlender Interpreter/Eligibility false) als auch nach erfolgreicher AI-`matched`-Klassifikation erreichbar.
4. `persistent-cycle-commit.ts` erlaubt `cycle_failed` als Wert für die Failure-RPC, erzeugt den Service-Code aber nicht.
5. Die effektiven Migrationen definieren `cycle_failed` als erlaubten Persistenzwert in `fail_customer_message_cycle`; sie erzeugen nicht den kontrollierten Service-Return.
6. `recoverable-cycle-runner.ts` propagiert `result.code`; `recovery-handler.ts` loggt ihn. Beide erfinden `cycle_failed` nicht.

Die exakte äußere Quelle ist somit `processPersistentCustomerMessage`, einer von zwei `if (!cycle.success)`-Branches. Welcher Branch und welcher interne Domain-Code (`invalid_cycle_context`, `cycle_state_version_mismatch`, `interpretation_failed`, Transition/Retry/Collection/Assessment/Planner/Template/Event/Invariant etc.) vorlag, wird verworfen und ist **NOT PROVEN**.

## 13. Primary vs Secondary Failure Analysis

### Primary cause

**NOT PROVEN.** Bewiesen ist ein deterministischer, nicht-review Cycle-Fehler nach erfolgreicher Normalization. Nicht bewiesen ist, ob er vor oder nach AI entstand. Kandidaten A–F:

| Möglichkeit | Urteil |
|---|---|
| A Interpreter fehlt | Möglich anhand Log; widerspricht der erwarteten Composition bei tatsächlich gelesenem `"true"`, aber konkrete Presence wird nicht beobachtet |
| B Interpreter da, Eligibility false | Für die bekannte Authority/Antwort durch Code ausgeschlossen; tatsächliche Auswertung bleibt unbeobachtet |
| C Normalization erreicht keinen AI-fähigen Answer | Durch `cycle_failed` plus bekannte Antwort/Authority ausgeschlossen |
| D früher controlled branch vor Reservation | Message/normalization early returns durch Code ausgeschlossen; fehlender Interpreter-Short-Circuit bleibt möglich |
| E Reservation versucht, Marker bleibt false | **Bewiesen möglich und Observability-seitig zwangsläufig**, weil Marker nie true wird |
| F AI erfolgreich, danach deterministischer Cycle-Fehler | Möglich; entspricht beiden `cycle_failed`-Quellen nach AI |

### Secondary `failure_persistence`

Der Wert `failure_persistence_succeeded=false` beweist **keine** fehlgeschlagene Persistierung. Beide `cycle_failed`-Branches rufen `failCustomerMessage` bereits auf, ignorieren dessen Boolean und geben nur den äußeren Fehler zurück. Der Runner führt für `cycle_failed` keinen zweiten Persistierungsversuch aus und setzt das Diagnosefeld im generischen Failure-Return konstant auf false. Der spezielle zweite Persistierungsversuch existiert nur für `result.code="persistence_failed"`.

Somit ist die behauptete Secondary Failure selbst **NOT PROVEN**. Falls der erste RPC real fehlschlug, mögliche Ursachen sind RPC-Fehler/malformed response, ungültige Inputform, Owner-/Lease-Verlust, Command nicht processing/terminal oder Command nicht gefunden. Welche davon zutraf, ist nicht beobachtet. Sie liegt zeitlich ausschließlich **nach** dem primären deterministischen Fehler und kann die AI-Reservation nicht verhindert haben.

## 14. OpenAI Reachability

**OPENAI REACHED IN CURRENT PRODUCTION RUN: NOT PROVABLE.** Im vorgesehenen AI-Pfad liegt die erfolgreiche Reservation zwingend vor dem Interpreter und dessen Provider-Aufruf; es gibt keinen Provider-Call, der die Reservation umgeht. Das geloggte Reservation-Feld kann wegen seiner konstanten Implementierung jedoch nicht als Beleg „vor Reservation“ verwendet werden. Deshalb wäre die Folgerung `OpenAI reached: NO` falsch.

## 15. Static/Test Reproduction Results

Die bestehenden fokussierten Suites decken Normalization, Registry/Interpretation, providerneutrale AI-Klassifikation, Productive Runtime, Persistent Service, Recoverable Runner und Data-Source Composition ab und liefen vollständig grün (7 Dateien, 78 Tests). Sie bestätigen unter anderem die jeweiligen Zweige, bilden aber weder den vollständigen Incident-Authority-Snapshot noch eine Production-DB/Provider-Ausführung ab.

Eine incident-exakte statische Evaluation ist möglich für Textnormalisierung und Eligibility: Text wird unverändert (nach trim) als `answered/text` normalisiert und ist kein exact Registry Key, daher erwartete Eligibility `true`. Eine vollständige Recovery-Reproduktion ohne Code-/Fixture-Änderung ist mit dem vorhandenen Harness nicht möglich, weil der konkrete Production Authority Context und der interne Domain-Fehlercode fehlen.

## 16. Root-Cause Verdict

**Root cause: NOT PROVEN.**

Engste verbleibende Failure Boundary: nach erfolgreicher Textnormalisierung und vor/innerhalb einem von zwei nicht-review-fehlgeschlagenen deterministischen Cycle-Aufrufen. Der aktuelle Log trennt die AI-Branch-Entscheidung, Reservation, Provider und die zwei Cycle-Aufrufe nicht; zwei als Tatsachen interpretierte Boolean-Felder sind lediglich konstante Defaultwerte.

Der konkret beweisbare Implementierungs-/Observability-Befund ist: `ai_attempt_reservation_reached` und `failure_persistence_succeeded` werden für diesen Resultpfad nicht gemessen. Dieser Befund erklärt, warum der Log keinen Reservation-Beleg zeigt, beweist aber nicht die fachliche Ursache des Cycle-Fehlers.

## 17. Minimal Future Repair Scope

Noch keine fachliche Reparatur ist gerechtfertigt. Ein separates Folgepaket sollte die kleinste privacy-safe Branch-Evidence genau in `processPersistentCustomerMessage`/Runner transportieren, ohne Answer-Text oder PII:

- Interpreter present (boolean) und Eligibility evaluated/result;
- Normalization success/error code;
- Reservation function entered, RPC invoked und controlled result code (keine Payload);
- Interpreter outcome class (`matched|no_match|ambiguous|failure_class`), ohne Modelltext;
- ausgewählter deterministic branch (`ordinary|without_claim`) und interner `ConversationCycleFailure.code`;
- Result des ersten `failCustomerMessage`-Aufrufs (`success|controlled/transport/validation`, optional safe RPC code), statt konstantem false.

Erst ein einzelner erneuter normaler Recovery-Lauf mit diesem Branch-Decision Event kann A/E/F und den exakten Cycle-Code unterscheiden. Keine Datenmutation, kein Reset und kein Customer Resend ist für diese Evidenz erforderlich. Danach wäre der minimale Repair Scope ausschließlich der nachgewiesene Branch; derzeit sind Anwendung, SQL und Deployment-Bedarf nicht feststellbar.

## 18. Production Decision Matrix

| Entscheidung | Verdict |
|---|---|
| Production feature gate = true | **PROVEN** (supplied Production-Evidence) |
| Acquisition reached | **YES** |
| Authority context loaded | **YES** |
| Normalization reached | **YES** |
| Normalization succeeded | **YES** |
| `customerAnswerInterpreter` present | **NOT PROVABLE** (statisch erwartet: yes) |
| `building_type` rule active | **YES** |
| Known free-text answer exact registry match | **NO** |
| AI eligibility expected | **YES** |
| AI eligibility actually evaluated | **NOT PROVABLE** |
| AI reservation reached | **NO ist nicht bewiesen; tatsächlich NOT PROVABLE** (der supplied Logwert lautet NO, ist aber konstant) |
| AI reservation RPC invoked | **NOT PROVABLE** |
| OpenAI reached | **NOT PROVABLE** |
| Deterministic `runConversationCycle` reached | **YES, entweder direkt oder innerhalb `runConversationCycleWithoutClaim`; konkrete Exportfunktion NOT PROVABLE** |
| Exact source of `cycle_failed` | `persistent-conversation-cycle-service.ts` / `processPersistentCustomerMessage` / einer der zwei `!cycle.success`-Branches; **konkreter Branch NOT PROVEN** |
| Primary root cause | **NOT PROVEN**; deterministischer non-review Cycle-Fehler, interner Code unbekannt |
| Secondary `failure_persistence` cause | **NOT PROVEN**; Logfeld ist konstant false, realer RPC-Erfolg wird verworfen |
| Application repair required | **NOT YET PROVEN** |
| SQL migration required | **NOT YET PROVEN** |
| Vercel Production deployment required for eventual repair | **NOT YET PROVEN** |
| Customer resend required | **NO für weitere Evidence; für eventuellen Repair NOT YET PROVEN** |

Hinweis zur vorgegebenen Zeile „AI reservation reached: YES/NO“: Der beobachtete Log enthält `false`, aber der aktuelle Code macht diesen Wert epistemisch ungültig. Ein sachlich korrektes Audit darf daraus kein tatsächliches **NO** ableiten; deshalb weist die Matrix ausdrücklich Logwert und Tatsachenstatus getrennt aus.

## 19. Files Inspected

- Routes/Trigger: `app/api/internal/conversation-cycles/recovery/route.ts`, `app/api/webhooks/whatsapp/route.ts`, `lib/server/whatsapp/ingestion.ts`, `lib/server/conversation/recovery-handler.ts`.
- Composition/Runner/Data Source: `productive-cycle-runtime.ts`, `recoverable-cycle-runner.ts`, `persistent-cycle-data-source.ts`, Context-Read und Commit Adapter.
- Orchestration/Domain: `persistent-conversation-cycle-service.ts`, `conversation-cycle-orchestration.ts`, `conversation-cycle.ts`, Normalization schemas/types/implementation, Question Template Registry, Answer Interpretation Registry.
- AI: `customer-answer-interpreter.ts`, classification operation/contracts and OpenAI adapter boundary.
- SQL: relevante Migrationen von 20260902, 20260908 und 20260909, insbesondere effektive Acquire/Discovery/Context/Failure/Reservation Authorities.
- Tests: alle sieben fokussiert ausgeführten Dateien aus Abschnitt 20 sowie deren Fixtures.
- Vorgeschichte: Audit-Artefakte AP-16-06-06D-6, -7, -8, -9, -10, -11 und -12.

## 20. Commands/Tests Executed

| Command | Result |
|---|---|
| `git rev-parse HEAD` | PASS; `1fd003535e0a52634d4a262b86018cd7e58afe11` |
| `git branch -avv` / `git log -15 --oneline --decorate` | PASS; Baseline/History geprüft |
| `rg -l` / `rg -n` und gezielte `sed`/`cat` Reads | PASS; Flow, alle produktiven `cycle_failed`-Vorkommen, Migrationen und Vorgänger-Artefakte inventarisiert |
| `npm test -- --run test/answer-normalization.test.ts test/answer-interpretation.test.ts test/ai-customer-answer-classification.test.ts test/productive-conversation-cycle-runtime.test.ts test/persistent-conversation-cycle-service.test.ts test/recoverable-conversation-cycle-runner.test.ts test/persistent-cycle-data-source-composition.test.ts` | PASS; 7 Dateien, 78 Tests |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| `git diff --check` | PASS |
