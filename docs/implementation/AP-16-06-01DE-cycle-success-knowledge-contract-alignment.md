# AP-16-06-01DE – Cycle Success / Knowledge Apply Contract Alignment

## 1. Architecture Basis

Dieses Paket folgt AP-16-06-00, dem Authority Contract AP-16-06-01A, den Planner-Snapshots aus AP-16-06-01B, der Cycle-Context-Read-Authority aus AP-16-06-01C, dem Customer-Answer-Knowledge-Apply-Contract aus AP-16-06-01D und dem dokumentierten STOP von AP-16-06-01E. Der vorhandene deterministische Pfad – Normalisierung, Interpretation, Proposal, Apply, Planung und Rendering – bleibt die einzige fachliche Authority.

## 2. AP-16-06-01E STOP Condition

AP-16-06-01E wurde korrekt gestoppt, weil `ConversationCycleSuccess` das bereits angewendete `StateTransitionProposal`, das zugehörige `StateTransitionApplyResult` und die normalisierte Antwort nicht bis zur Commit-Grenze trug. Der reduzierte Zustand hätte den späteren Adapter zu einer unzulässigen Rekonstruktion oder erneuten Domain-Ausführung gezwungen. Human Review wurde außerdem pauschal als `cycle_failed` behandelt.

## 3. Lost Authority Before This Package

Vor diesem Paket blieben nach `runConversationCycle` nur resultierender Knowledge-/Runtime-Zustand, Assessment, Planner-/Render-Ergebnisse und Events erhalten. Proposal, Apply Result und Normalized Answer gingen verloren. Events oder Versionsdifferenzen sind kein Ersatz für diese Authorities: Sie beweisen weder die vollständigen Claims und Evidence-Bindungen noch das originale `changed`-Ergebnis.

## 4. Updated Success Contract

`ConversationCycleSuccess` enthält nun zusätzlich den vorhandenen `NormalizedCustomerAnswer`, das erfolgreiche `InterpretationResult`, das exakt angewendete `StateTransitionProposal` und das erfolgreiche `StateTransitionApplySuccess`. Resultierender Knowledge State, Runtime-Komponenten, Next Action, gerenderte Interaktion, Evidence Request und Events bleiben unverändert vorhanden. Es wurde keine parallele Success-Struktur und keine Persistence-Semantik in der Domain eingeführt.

## 5. StateTransitionProposal Preservation

`runConversationCycle` gibt dieselbe Proposal-Objektreferenz zurück, die aus dem erfolgreichen Interpretation Result stammt und unmittelbar an `applyStateTransitionProposal` übergeben wurde. Es gibt keine zweite Interpretation, Proposal-Generierung, Event-Heuristik oder Diff-Rekonstruktion.

## 6. StateTransitionApplyResult Preservation

Das erfolgreiche Originalresultat von `applyStateTransitionProposal` wird unverändert als `state_transition_apply_result` weitergegeben. Damit bleiben `changed`, Apply-/Transition-/Interpretation-IDs, vorherige und neue Knowledge-Version, angewendete Claim-IDs, Supersession-IDs und der resultierende Knowledge State autoritativ verfügbar. Insbesondere bleibt `changed: false` explizit und wird nicht aus Versionsgleichheit abgeleitet.

## 7. Normalized Answer Authority

Der persistenzrelevante bestehende Domain-Typ `NormalizedCustomerAnswer` wird weitergereicht. Der technische Success-Wrapper der Normalisierung wird nicht dupliziert. Der Service kopiert keinen zusätzlichen Raw-Message-Text in den Commit DTO; der kanonische Text verbleibt an der bestehenden Message-Text-Grenze.

## 8. Human Review Mapping

Human Review kann im bestehenden Domain-Modell entweder als `ConversationCycleFailure` mit `requires_human_review: true` oder nach einem erfolgreichen Apply als `ConversationCycleSuccess` mit `cycle_status: human_review_required` auftreten. Beide sind kontrollierte fachliche terminale Ausgänge. Der Persistent Service leitet beide eindeutig an die explizite Data-Source-Grenze `completeCustomerMessageWithHumanReview` weiter und wandelt sie nicht in `cycle_failed` um. Dabei werden weder Review Actor noch Approval erzeugt; der deterministische Success Commit und der technische Failure-Pfad werden nicht aufgerufen.

## 9. Failure Contract

`failCustomerMessage` akzeptiert ausschließlich die geschlossene Union `normalization_failed | cycle_failed | persistence_failed`. Normalisierungs- und echte Domain-Ausführungsfehler bleiben kontrollierte technische Failures. Freie Exception-Texte sind nicht Teil des DTO. `persistence_failed` ist damit für die in AP-16-06-01E vorgesehene kontrollierte Failure-Authority typisiert, ohne eine Failure RPC zu implementieren.

## 10. PersistentCycleDataSource Commit Input

`PersistentCycleCommit.cycle` trägt jetzt die vollständige erfolgreiche Domain-Authority einschließlich Normalized Answer, Interpretation, Proposal und Apply Result bis zu `commitCustomerMessageCycle`. Der separate `PersistentCycleHumanReview` trägt nur Command-, Source-Message- und Pending-Identity sowie den originalen kontrollierten Domain-Ausgang. Es gibt keine Supabase Row, SQL-Spaltennamen, generischen Payloads, WhatsApp-Provider-Daten oder OpenAI-Typen in diesen Verträgen.

## 11. ID Stability

Interpretation-, Transition-, Claim-, Evidence- und Apply-IDs stammen weiterhin ausschließlich aus dem in AP-16-06-01C geladenen Context. Der Success Contract reicht sie unverändert durch. Das Paket erzeugt keine UUID und ersetzt keine reservierte ID.

## 12. No-Recomputation Guarantee

Die Commit-Vorbereitung liest ausschließlich den einmal erzeugten Cycle Success. Sie ruft weder Interpretation noch `applyStateTransitionProposal`, Planner oder Renderer erneut auf. Knowledge-Diffs und Events werden nicht zur Rekonstruktion verwendet. Der Service normalisiert einmal und führt den Cycle einmal aus, bevor er das Ergebnis unverändert an die passende Data-Source-Grenze weitergibt.

## 13. Tests

Fokussierte Vitest-Tests prüfen Proposal-/Apply-Referenz und -Identitäten, Normalized Answer, Interpretation-/Transition-/Claim-/Evidence-/Apply-IDs, explizites No Change samt fortgesetztem Planner Result, den separaten Human-Review-Ausgang ohne Actor/Approval/Commit/Failure sowie allow-listed Normalisierungs- und Cycle-Failures. Ein Architekturtest sichert ab, dass die Persistenzvorbereitung Apply, Interpretation, Planung und Rendering nicht erneut ausführt und keine UUID erzeugt.

## 14. Explicitly Not Implemented

Nicht enthalten sind Migrationen, Tabellen, SQL, atomare Cycle-Commit-RPC, Failure-RPC, konkrete Data-Source-Implementierung, neue Knowledge-Persistence, Runner, Worker, Cron, Recovery, Webhook-Wiring, Outbound Delivery, WhatsApp Send, Provider IDs, OpenAI, LLM oder Inference.

## 15. Handoff Back to AP-16-06-01E

AP-16-06-01E kann auf dieser Grenze den vollständigen atomaren Commit implementieren. Der Adapter soll die vorhandenen Domain-Authorities ausschließlich strikt validieren und gemeinsam mit Runtime, Pending Lifecycle, Snapshot, interner Outbound Message, Events und terminalem Command-Ergebnis in einer CAS-geschützten PostgreSQL-Transaktion persistieren. Human Review benötigt den nun separaten terminalen Contract; weder der Success Commit noch ein technischer Failure darf dafür simuliert werden.
