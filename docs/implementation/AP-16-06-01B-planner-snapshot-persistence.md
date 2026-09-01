# AP-16-06-01B – Planner Snapshot Persistence

## 1. Architekturgrundlage

Die Implementierung folgt ausschließlich dem Authority Contract aus `AP-16-06-01A` und der Runtime-Readiness-Analyse `AP-16-06-00`. `SelectedNextAction` entsteht in `planNextAction`; `RenderedCustomerInteraction` entsteht danach in `renderQuestionTemplate` innerhalb des deterministischen Conversation-Cycle-Ablaufs. Vor diesem Paket existierten die providerunabhängige Message Authority, `conversation_pending_interactions` und der Runtime-Header, aber keine Operation zur vollständigen atomaren Aktivierung einer beantwortbaren Interaction.

## 2. Vorherige Lücke

Die Pending-Zeile enthielt nur reduzierte Action-Bindungen und einen Prompt-Verweis. Candidate-ID, Planner-Entscheidungsdetails, Score, Fallbacks, Reason Codes, gerenderte Struktur und vollständiger Answer Contract fehlten. Ein Answer-Pfad hätte diese Daten aus aktuellem Code rekonstruieren müssen und damit eine verbotene zweite Authority geschaffen.

## 3. Snapshot-Modell

`conversation_interaction_snapshots` ist eine immutable 1:1-Relation zur Pending Interaction. Relationale Felder tragen ausschließlich Identität, CAS und Lookup: Conversation, Project, resultierende Runtime Revision, Knowledge Version, Outbound Message und Message Sequence. Zwei begrenzte JSONB-Felder enthalten den vollständigen `SelectedNextAction` und `RenderedCustomerInteraction`. `snapshot_schema_version = 1` ist unabhängig von Template- und Knowledge-Versionen.

Die TypeScript-Grenze validiert beide JSON-Dokumente strikt mit den bestehenden Zod-Schemas. Sie prüft zusätzlich Identity-, Template-, Answer-Contract- und Customer-Visibility-Bindungen. Der Loader akzeptiert nur Version 1 und prüft auch die redundanten relationalen Bindungen; er verwendet weder Defaults noch Registry, Planner oder Renderer.

## 4. Snapshot Creation Boundary

Nach `SelectedNextAction → renderQuestionTemplate → RenderedCustomerInteraction` ruft der serverseitige Adapter die ausschließlich für `service_role` freigegebene RPC `activate_planner_interaction_snapshot` auf. Eine Transaktion schreibt in dieser Reihenfolge:

1. Snapshot mit reservierten IDs,
2. interne providerunabhängige Outbound Message und exakt zusammengesetzten Text,
3. Pending Interaction mit `snapshot_id` und identischem `prompt_message_id`,
4. Runtime Transition auf `awaiting_customer_answer` und Revisionserhöhung.

Die RPC erzeugt keinen Transport- oder Provider-Datensatz. Ein Replay derselben reservierten Snapshot-/Pending-/Message-IDs liefert nur bei byte-/JSON-semantisch identischer Authority denselben Snapshot; Abweichungen scheitern geschlossen.

## 5. Persistierte Authorities

- vollständiger `SelectedNextAction`, einschließlich Candidate-ID, Entity/Information/Assumption/Template-Bindung, Answer Type, Fallbacks, Reasons, Priority, Progression, Dependency, Eligibility, Revisit, Information Gain und Score,
- vollständiger `RenderedCustomerInteraction`, einschließlich aller gerenderten Textsegmente, Examples, Options, vollständigem Answer Contract und Visibility,
- Snapshot-, Pending-, Conversation-, Project-, Outbound-Message- und Sequence-Identität,
- resultierende Runtime Revision, Knowledge Version und Snapshot-Schema-Version,
- exakt kundenadressierter Message Body als bestehende Message Authority.

## 6. Bewusst derived oder nicht persistiert

Nicht gewählte Candidates, Feature-Inputs, Renderparameter, Missing Information, Readiness, Assessment, Raw Customer Text, normalisierte Antworten, Providerdaten, Telefonnummern, Secrets, AI-Ausgaben und Stacktraces sind kein Bestandteil des Snapshots. Accessibility Text bleibt im strukturierten Render-Snapshot, wird aber nicht als sichtbarer Message Body dupliziert. Der Body ist deterministisch `primary_text`, optional `supporting_text` und optional `help_text`, getrennt durch Leerzeilen.

## 7. Binding- und CAS-Grenzen

Die Datenbank leitet Project und aktuelle Knowledge Version aus gelockter Conversation/Runtime/Knowledge Authority ab. Sie prüft erwartete Runtime Revision, Activatability, alle Action-/Render-Identitäten, Template, Answer Type, Customer Visibility, Message Text und reservierte IDs. Cross-Conversation, Cross-Project, stale Runtime/Knowledge, fremde Message und Replay-Konflikte werden abgelehnt. Der Caller kann keine davon abweichende Project- oder Versionsauthority setzen.

## 8. Legacy-Verhalten

Die additive Migration konstruiert keine historischen Snapshots. `snapshot_id` bleibt für bestehende Pending-Zeilen nullable. `get_planner_interaction_snapshot` gibt für eine solche Legacy-Zeile `null` zurück; der TypeScript-Loader klassifiziert dies als `snapshot_missing`. Der neue deferred Runtime-Guard verlangt bei jeder neuen Aktivierung von `awaiting_customer_answer` einen vollständig gebundenen Snapshot. Es gibt keinen Fallback, keine Default-Ergänzung und kein Replanning.

## 9. Immutability

Snapshot-Zeilen besitzen einen Trigger, der jedes `UPDATE` und `DELETE` verwirft. RLS ist aktiv; Browserrollen erhalten keinerlei Mutationsrecht. Pending-/Message-FKs verwenden `ON DELETE RESTRICT`. Lifecycle-Änderungen bleiben ausschließlich an der bestehenden Pending-/Runtime-Authority, während die historische Frage unverändert bleibt.

## 10. Tests

Gezielte Vitest-Tests decken den vollständigen Feld-Roundtrip, Answer Contract, Planner-Entscheidungsfelder, strikte Schema-/Versionsvalidierung, Cross-Binding, Legacy-Fail-Closed, direkten Snapshot-Load sowie Migration, RLS, Immutability, Reihenfolge, CAS, Message-Text-Gleichheit, Replay und inhaltsarme Audit-Grenze ab. Die Gesamtsuite, Typecheck, Lint und `git diff --check` bilden die Abschlussvalidierung.

## 11. Ausdrücklich nicht implementiert

Nicht enthalten sind vollständiger Cycle-Context-Read, ID-Reservierung des Customer-Answer-Cycles, Customer-Answer-Ausführung/-Commit, Knowledge Apply, Failure Worker, Recovery, Scheduler, WhatsApp Delivery/Graph API sowie OpenAI/LLM. `processPersistentCustomerMessage` wird nicht verdrahtet.

## 12. Übergabe an AP-16-06-01C

AP-16-06-01C kann den Snapshot über `get_planner_interaction_snapshot` beziehungsweise `loadPlannerInteractionSnapshot` ohne Replanning oder Re-Rendering laden. Die spätere Claim-/Context-Authority muss weiterhin ihre Command-Reservierungen und sämtliche übrigen Context Authorities ergänzen und Legacy `snapshot_missing` terminal/fail-closed behandeln.
