# AP-16-06-06D-16 — Production AI-Matched Interpretation Failure Repair

## 1. Implementierungsstatus

**IMPLEMENTIERT.** Die exakte Fehlerursache ist aus Repository-Authority beweisbar und wird mit einer forward-only Migration sowie einer serverseitigen semantischen DTO-Prüfung repariert. Zusätzlich wird der bereits vorhandene, begrenzte Interpretation-Fehlercode bis in den privacy-safe Recovery-Trace propagiert.

## 2. Baseline SHA

`a98d766fb5a2105bb1b2cd5a02082f9a07e77f24` (`Merge pull request #205 ... stabilisiere-end-to-end-kundenantworten`). Der Checkout enthält keinen lokalen `main`-Ref; dieser HEAD ist die vom Auftrag bereitgestellte CURRENT-main-Baseline und enthält D-13, D-14 und D-15.

## 3. Exakte Production-Evidence

Der als vertrauenswürdig vorgegebene D-14-Trace erreicht erfolgreich Normalisierung, Eligibility, Reservation (Attempt 2), AI-Aufruf und `matched`, tritt in `with_claim` ein und endet in `runConversationCycle` mit `interpretation_failed`; Failure-Persistierung gelingt. Damit liegen Provider, Gate, Reservation, Recovery-Discovery und Failure-Persistierung außerhalb der Root Cause.

## 4. Quellen von `interpretation_failed`

`runConversationCycle` besitzt genau eine Stelle, die diesen Cycle-Code erzeugt: `interpretNormalizedAnswer(...)` gibt `success:false` zurück und `requires_human_review` ist `false`. Human-Review-Interpretationsfehler werden separat zu `human_review_required`.

Unterhalb dieser Stelle liefert `interpretNormalizedAnswer` begrenzte Fehler aus folgenden geprüften Prädikaten:

| Prädikat | Erwarteter Input | Upstream-Quelle |
|---|---|---|
| Context-Zod schlägt fehl | vollständiger `InterpretationContext` | Context-RPC plus Service-Normalisierung/Override |
| Project/Conversation/State/Decision/Template-Binding weicht ab | identische Snapshot-, Command-, Knowledge- und Answer-Identitäten | `get_customer_message_cycle_context`, Snapshot, normalisierte Message |
| `idempotency_key !== conversation_id + ':' + decision_id + ':' + answer_id` | Domain-Idempotency-Key | **Context-RPC** |
| Application Status duplicate/already applied | `not_applied` oder nicht gesetzt | persistierter Cycle Context |
| Registry Rule fehlt bzw. Property/Entity passt nicht | Rule für Selected Action | Snapshot `selected_action` und Registry |
| Answer Outcome/Kind passt nicht zur Rule | `answered/text` für `building_type` | Normalisierung und Answer Contract |
| Text ist weder Alias noch erlaubter Canonical Override | Registry-Key oder Wert aus `canonical_values` | normalisierter Text bzw. servervalidierter AI-Wert |
| Numeric/Assumption/Evidence/Supersession/Contradiction-Prüfung scheitert | typgerechte, gebundene Inputs | Rule, State, reservierte IDs |

Für den Production-Trace passt eindeutig der Answer-Binding-Pfad: Alle vorherigen Boundary-Schritte sind erfolgreich, der AI-Wert besteht die Value-Allowlist, und der productive RPC erzeugte trotzdem einen anderen Idempotency-Key als der Interpreter verlangt.

## 5. Exakte Root Cause

Die aktive Productive-Context-Migration `202609090007` konstruierte `interpretation_inputs.idempotency_key` als `answer:<message UUID>`. `bindingFailure` fordert dagegen seit der Domain-Authority den durch `createInterpretationIdempotencyKey` definierten Wert `<conversation UUID>:<selected-action decision UUID>:<answer/message UUID>`. Beide Strings sind Zod-valide, daher bestand der RPC-DTO die strukturelle Prüfung. Erst `interpretNormalizedAnswer` traf exakt das Prädikat

```text
context.idempotency_key !== createInterpretationIdempotencyKey(
  context.conversation_id,
  action.decision_id,
  answer.answer_id
)
```

und lieferte `answer_binding_mismatch`; `runConversationCycle` kollabierte dies zu `interpretation_failed`.

## 6. Exact Match vs. AI Match

| Stage | Exact `einfamilienhaus` | AI-Freitext → `single_family_house` |
|---|---|---|
| normalisierter Text | `einfamilienhaus` | kompletter normalisierter Freitext |
| Registry Lookup | `canonical_values.einfamilienhaus` | serverseitige Value-Allowlist (`Object.values`) |
| Canonical Value | `single_family_house` | `single_family_house` |
| Interpretation Input | Text ohne Override | Text plus `canonical_value_override=single_family_house` |
| Claim Value | `single_family_house` | `single_family_house` |
| Property Value | `project.building_type=single_family_house` | `project.building_type=single_family_house` |

Die Pfade unterscheiden sich vor Interpretation bewusst in Provenance/Input. Der Registry-Consumer akzeptiert für Exact Match einen Alias-Key und für den Override ausschließlich einen erlaubten Canonical Value. Sie konvergieren vor Claim-Erzeugung auf denselben Canonical Value; der Paartest schützt dies.

## 7. Production Context vs. D-15-Testfixture

Die D-15-Service-Fixture setzte den Key mit `createInterpretationIdempotencyKey(...)` korrekt und konnte deshalb den bekannten Satz vollständig erfolgreich rechnen. Der reale Adapter übernahm den vom SQL-RPC erzeugten, strukturell gültigen, aber semantisch falschen `answer:<id>`-Key. Selected Action, `building_type`, Entity `project`, Property `building_type`, Text-Kind und Canonical-Override sind dagegen kompatibel. Diese einzelne Fixture/Productive-Differenz erklärt widerspruchsfrei Test-Erfolg und Production-Fehler.

## 8. Reparatur

1. Die neue Migration ersetzt ausschließlich die Context-RPC-Definition und erzeugt den Key aus `cmd.conversation_id`, `s.selected_action.decision_id` und `m.id` in exakt der Domain-Reihenfolge.
2. Der TypeScript-Context-Adapter validiert den abgeleiteten Key nun zusätzlich semantisch. Ein zukünftiger Zod-valider Contract-Drift wird an der Authority-Grenze geschlossen abgewiesen.
3. `ConversationCycleFailure` bewahrt den vorhandenen `InterpretationErrorCode`; Service und Recovery-Trace propagieren ihn als `interpretation_failure_code`. Die Werte stammen aus einer geschlossenen Allowlist und enthalten keine Kundenantwort oder Providerdaten.
4. Canonical Override, AI-Reservation, Provider/Modell/Prompt/Timeout/Attempt-Limit, Claimless Semantik und Retry-Authority bleiben unverändert.

## 9. Geänderte Dateien

- `lib/domain/conversation-intelligence/conversation-cycle.ts` und `conversation-cycle-types.ts`
- `lib/domain/conversation-cycle-orchestration.ts`
- `lib/actions/persistent-conversation-cycle-service.ts`
- `lib/actions/persistent-cycle-context-read.ts`
- `lib/server/conversation/recoverable-cycle-runner.ts`
- `supabase/migrations/202609100001_interpretation_idempotency_contract_repair.sql`
- relevante Service-, Context-, Runtime- und Migrationstests
- dieses Audit-Artefakt

## 10. Migration

`supabase/migrations/202609100001_interpretation_idempotency_contract_repair.sql` (forward-only). Historische Migrationen wurden nicht geändert; es gibt keine incident-spezifische DML oder IDs.

## 11. Verstärkte Regressionen

Der bekannte Freitextfall prüft Reservation, AI `matched`, Canonical-Revalidierung, erfolgreichen with-claim Cycle, `single_family_house` Claim, Planner/Outbound und Commit. Der neue Paartest vergleicht ihn mit `einfamilienhaus`. Context-Adapter-Tests verwenden die produktive RPC-Antwortform, prüfen den Domain-Key und weisen den früheren, lediglich strukturell validen SQL-Key ab. Bestehende `no_match`-/`ambiguous`-Tests schützen den claimless Pfad.

## 12. Recovery-Verhalten

D-15-Backoff und Discovery wurden nicht verändert. Nach Migration und Deployment wird der bestehende `cycle_failed` Command bei fälligem `retry_at` wiedergefunden. Context Read rekonstruiert dann den korrekten Key; kein manueller Reset und kein Customer Resend sind nötig.

## 13. Tests

Die zielgerichteten sieben Suites bestanden mit **71/71 Tests**. Typecheck und Lint bestanden. Der vollständige Lauf bestand mit **1303/1304 Tests**; ausschließlich der bereits an der unveränderten Productive-Runtime vorhandene OpenAI-Isolationstest widerspricht dem dort bereits bestehenden lazy Adapter-Import. Der Providerpfad wurde in diesem Paket gemäß Scope nicht verändert.

## 14. Production-Aktivierung

Zuerst die neue Supabase-Migration anwenden, danach den geänderten TypeScript-Code nach Vercel Production deployen. Der bestehende Recovery-Runner übernimmt anschließend automatisch.

- **Production migration required: YES**
- **Vercel Production deployment required: YES**
- **Existing cycle_failed command automatic recovery expected: YES**
- **Customer resend required: NO**
- **OpenAI path itself healthy: YES**
