# AP-16-06-01E – Atomic Cycle Commit and Failure Authority

**Baseline:** `368753c2bf6ef1d318e3608d7db14aa86b042804`

## 1. Architecture Basis

Die Implementierung basiert auf AP-16-06-00, dem Authority-Audit AP-16-06-01A sowie den gemergten Paketen AP-16-06-01B, C, D und DE. Maßgeblich ist der aktuelle Domain-/Service-Vertrag: Domain-Code berechnet, Persistence validiert Identität/CAS und persistiert. Die Grenze ist server-only, providerunabhängig und Teil des modularen Monolithen.

## 2. Previous STOP Condition

Der erste E-Versuch wurde beendet, weil `ConversationCycleSuccess` Normalized Answer, Interpretation, `StateTransitionProposal` und originales `StateTransitionApplySuccess` verlor. Eine Commit-Implementierung hätte Claims, Provenienz und `changed` aus Diffs oder Events rekonstruieren müssen. Das wäre eine zweite Knowledge-Semantik gewesen.

## 3. AP-16-06-01DE Resolution

AP-16-06-01DE reicht die vier originalen Authorities bis `PersistentCycleCommit.cycle` durch. Der Adapter prüft ihre Bindungen und sendet sie unverändert an die Transaktion. Human Review besitzt eine separate fachliche Completion-Grenze; technische Failures sind auf `normalization_failed | cycle_failed | persistence_failed` begrenzt. Fünf Event-IDs reichen weiterhin: die aktuelle Ableitung erzeugt höchstens Interpretation, einen Claim, eine Supersession, ein semantisches Ereignis und Completion.

## 4. Scope

Enthalten sind eine additive Migration, der zentrale Success-Commit, eine inhaltsarme Failure-Authority, eine Human-Review-Completion und strikt validierende TypeScript-Adapter. Es wird kein produktiver Caller verdrahtet.

## 5. Atomic Commit Boundary

`commit_customer_message_cycle(uuid,jsonb)` ist genau ein PostgreSQL-Statement und damit genau eine Transaktion. Es führt Knowledge Apply, Runtime-/Komponentenmutation, vorherige Pending-Auflösung, optionale Snapshot-/Message-/Text-/Pending-Erzeugung, Domain Events und zuletzt Command Completion aus. Constraint-/Schreibfehler werden erneut geworfen; dadurch rollt PostgreSQL sämtliche fachlichen Mutationen zurück. Insbesondere wird keine Kette unabhängiger produktiver RPC-Commits ausgeführt.

## 6. Commit Contract

Der TypeScript-Adapter erhält `PersistentCycleCommit` mit dem vollständigen `ConversationCycleSuccess`. Er validiert IDs, Normalized Answer, Interpretation, Proposal, Apply Result, Collection, Retry, Effort, Evidence, maximal fünf Events und eine optionale bereits ausgewählte/gerenderte Interaktion mit bestehenden Zod-Schemas. Der RPC-Payload enthält ausschließlich die für Persistence erforderlichen bereits berechneten Authorities. Der Adapter plant, interpretiert, applied oder rendert nicht.

## 7. CAS / Locking

Die SQL-Authority entdeckt zunächst nur die Command-Bindungen und sperrt danach stabil Conversation, Runtime, Knowledge State, exakte Pending Interaction und Command. Geprüft werden Command-Status/-Typ, Source Message, Conversation/Project, exakte Pending-ID, Prompt Message, Snapshot, Runtime Revision, Knowledge Version sowie alle reservierten Knowledge-, Event- und Next-Interaction-IDs. Ein CAS-Fehler beendet die Funktion vor jeder Mutation; es gibt kein Reload und keinen automatischen Retry.

## 8. Knowledge Apply Integration

Die Transaktion ruft die bestehende AP-16-06-01D-Funktion intern mit dem originalen Proposal, Apply-ID und originalen `changed` auf. Das ist kein externer RPC-Commit: Der Aufruf läuft im selben PostgreSQL-Statement. Ein nicht erfolgreicher Apply beendet den äußeren Commit vor Runtime-Mutationen; eine SQL-Exception rollt auch den Knowledge-Anteil zurück. Claims, Customer-/System-Provenienz und Supersession bleiben ausschließlich in den AP-16-06-01D-Tabellen.

## 9. Runtime Commit

Runtime Revision wird genau einmal von der erwarteten Revision auf `+1` gesetzt. Knowledge Version ist exakt das Ergebnis des Knowledge Apply. Runtime Status und aktive Authority folgen dem bereits berechneten Cycle-Ausgang; SQL führt weder Readiness noch Planung aus. Information Collection, Retry, Customer Effort und Evidence Requests werden aus den resultierenden Komponenten persistiert.

## 10. Pending Interaction Lifecycle

Ausschließlich die am Command gebundene Pending Interaction wird als `answered` mit der gebundenen Source Message aufgelöst. Es gibt keine Suche nach „latest pending“. Eine neue Pending Interaction wird nur für eine vorhandene customer-answerable Selected/Rendered Interaction und ausschließlich mit den reservierten IDs angelegt.

## 11. Planner Snapshot Integration

Für die nächste answerable Interaction werden vollständiger `SelectedNextAction` und `RenderedCustomerInteraction` unverändert als Schema-v1-Snapshot gespeichert. Decision, Candidate-/Template-/Answer-Contract-, Runtime- und Knowledge-Bindungen werden gegen Command und Result geprüft. Es gibt keinen Registry Lookup, kein Replanning und kein Re-Rendering.

## 12. Internal Outbound Message

Eine nächste answerable Interaction erzeugt atomar genau eine interne `conversation_messages`-Zeile, deren ID am Command reserviert ist. Sie enthält keine Provider Message ID und keine Delivery Authority.

## 13. Domain Events

`conversation_cycle_events` ist eine neue append-only/RLS-geschützte Tabelle. Der Commit akzeptiert höchstens die fünf Command-Reservierungen, prüft Slot/Sequence, Project, Conversation und Correlation und speichert nur das schema-validierte, inhaltsarme Domain-Payload. Customer Message Text wird nicht in Event-Metadaten kopiert.

## 14. Command Completion

Erst nach allen anderen Writes wird das Command `completed`. Gespeichert werden nur Result-Code, resultierende Revisionen, optionale interne Outbound-ID, Payload-Hash und Completion-Zeit. Der Hash enthält keine neue Fachauthority; er ist ausschließlich der exakte Replay-/Conflict-Beweis des validierten Commit-Payloads.

## 15. Replay / Idempotency

Bei terminalem Success wird der kanonische JSONB-Payload-Hash verglichen. Identischer Replay liefert die vorhandenen Result-IDs und Revisionen. Ein abweichender Payload liefert `duplicate_conflict`; keine bestehende Authority wird überschrieben und keine zweite Version, Claim, Pending, Message, Snapshot oder Event-Zeile erzeugt.

## 16. No-Change

Nur `StateTransitionApplySuccess.changed` bestimmt den Knowledge No-Change. AP-16-06-01D erhöht in diesem Fall die Knowledge Version nicht und erzeugt keinen Claim. Der äußere Commit kann dennoch Runtime-Komponenten, Pending-Auflösung, nächste Interaction und Events atomar persistieren.

## 17. Human Review

`complete_customer_message_human_review` ist von Success Commit und technischem Failure getrennt. Es prüft Command, Source Message, exakte Pending Authority und CAS, resolved die beantwortete Pending Interaction, setzt Runtime/Command auf Human Review und erzeugt weder Knowledge Apply noch Claim, Reviewer, Approval, descriptive Claim oder Outbound Message.

## 18. Failure Authority

`fail_customer_message_cycle` erlaubt ausschließlich `normalization_failed`, `cycle_failed` und `persistence_failed`. Identischer Failure-Replay ist idempotent; Success, Stale und Human Review werden nie überschrieben. Gespeichert werden nur Code und Timestamp, keine Exception, Stacktrace, SQL-Details oder Message-Inhalte. Nach einem vollständig zurückgerollten Success-Commit kann der Service diese separate technische Grenze für `persistence_failed` verwenden.

## 19. Security / Data Minimization

Alle drei RPCs sind `security definer` mit festem `search_path=public,pg_temp`, prüfen `service_role`, widerrufen `public`, `anon` und `authenticated` und gewähren nur `service_role` Execute. Events haben RLS und Browserrollen keine Mutation. Es werden keine Telefonnummern, Raw WhatsApp Payloads, Tokens, Provider IDs, OpenAI-Daten, Exceptions oder Customer Message Contents in Command, Failure oder Events dupliziert.

## 20. Tests

Der fokussierte Test deckt Adaptervalidierung, originale Domain-Authorities, kontrollierte Fehlerabbildung, Lock/CAS-Bindungen, AP-16-06-01D-Komposition, Runtime-Komponenten, Pending/Snapshot/Outbound/Event-Reihenfolge, Replay/Conflict, Event-Slots, Rollback-Verhalten, Failure-Allowlist/-Idempotenz, Human-Review-/Security- und No-Recompute-Grenzen ab. Vollsuite, Typecheck, Lint, Diff-Check und statische Migrationschecks werden zum Abschluss ausgeführt.

## 21. Explicitly Not Implemented

Nicht implementiert sind produktiver Runner, Webhook-zu-Cycle-Komposition, Worker, Lease/Reclaim, Scheduler, Cron, Recovery, WhatsApp Delivery/Send, Graph API, Provider Adapter/IDs, OpenAI, LLM, AI SDK, Language Rewrite, Replanning, Re-Rendering, erneute Normalisierung oder erneutes Domain Knowledge Apply.

## 22. Handoff to AP-16-06-01F

AP-16-06-01F kann Claim, AP-16-06-01C Authority Load, `processPersistentCustomerMessage` und diese drei Adapter an einer expliziten produktiven Ausführungsgrenze komponieren. Dabei muss ein vollständig zurückgerollter Success-Commit erst danach separat als `persistence_failed` terminalisiert werden. Delivery bleibt eine nachgelagerte, unabhängige Authority.
