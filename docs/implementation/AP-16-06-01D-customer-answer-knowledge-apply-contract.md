# AP-16-06-01D – Customer-Answer Knowledge Apply Contract

## 1. Architecture Basis

Die Implementierung folgt AP-16-06-00, dem Authority Contract AP-16-06-01A sowie den persistierten Planner-Snapshots aus AP-16-06-01B und der Command-/ID-/Context-Authority aus AP-16-06-01C. Der bestehende Domain-Ablauf bleibt unverändert: `normalizeCustomerAnswer`, Interpretation und `applyStateTransitionProposal` entscheiden fachlich; Persistence validiert und übernimmt ausschließlich dieses Ergebnis.

## 2. Scope

Dieses Paket ergänzt einen isolierten, providerunabhängigen Knowledge-Apply-Baustein: drei append-only Tabellen, eine service-only RPC und einen strikt validierenden server-only Adapter. Es gibt keinen produktiven Aufruf aus einem Runner.

## 3. Customer Answer vs Reviewer Claim Boundary

Customer-Answer-Claims werden durch die deterministische Answer-Interpretation erzeugt und nach erfolgreichem Domain-Apply authoritative. Sie liegen ausschließlich in `customer_answer_knowledge_claims` mit `source_class = customer_answer`. Reviewergebundene descriptive Proposals, Reviews, Claims und deren Apply-RPC bleiben unverändert. Die neue RPC liest oder schreibt weder `evidence_claim_proposals` noch Review-Akteure oder Review-Ereignisse. Sie kann keine Freigabe vortäuschen.

## 4. Knowledge Apply Contract

Der Adapter akzeptiert nur ein strikt validiertes `StateTransitionProposal` zusammen mit dem dazu passenden erfolgreichen `StateTransitionApplyResult`. Die Datenbank leitet Project, Conversation, Source Message, erwartete Version und alle reservierten IDs aus dem gelockten Cycle Command ab. Sie führt weder Interpretation, Planner, Missing-Information-Berechnung noch Evidence-Planung aus.

## 5. Provenance

Transition und Claim binden `command_id`, internes `source_message_id`, `interpretation_id`, `transition_id`, `apply_id`, `claim_id`, Evidence-ID und Knowledge-Version. Customer-Message-Evidence muss auf die interne Source Message zeigen. Roher Text, Provider-ID und WhatsApp-Payload werden nicht kopiert.

## 6. Knowledge Version CAS

`command.expected_knowledge_version`, Proposal-Basisversion und gelockte `project_knowledge_states.current_version` müssen identisch sein. Genau ein Claim erzeugt genau den Sprung `+1`; ein autorisiertes No-Change bleibt auf derselben Version. Es gibt weder Merge noch Neuinterpretation.

## 7. ID Stability

Die RPC akzeptiert ausschließlich die in AP-16-06-01C reservierten Interpretation-, Transition-, Claim-, Customer-/System-Evidence- und Apply-IDs. Beim Retry wird keine UUID erzeugt.

## 8. Claim Persistence

Claims speichern nur typisierte fachliche Werte und ihre Zielbindung. Der Transition-Payload ist das strikt begrenzte Domain-Proposal ohne Raw Message Text. Historische Zeilen sind immutable. Diese technische Customer-Answer-Authority wird nicht als descriptive Reviewed Claim ausgegeben.

## 9. Evidence Boundary

`customer_answer_claim_evidence` ist ausschließlich Provenienz (`customer_message` oder `system_rule`). Sie erzeugt keine `project_evidence`, kein `evidence_claim_proposal`, keinen Reviewed Status und keine Evidence Truth. Andere Evidence-Klassen scheitern geschlossen.

## 10. Correction / Supersession

Eine Supersession darf nur eine vorhandene Customer-Answer-Claim-Authority desselben Projekts referenzieren, die noch nicht ersetzt wurde. Der Vorgänger bleibt immutable erhalten. Reviewer-/descriptive Claims können nicht über diese Relation ersetzt werden; deren bestehende Schutzgrenze bleibt unangetastet.

## 11. Idempotency

Command und Transition sind eindeutig. Ein byte-/JSON-semantisch identischer Replay gibt dieselbe Version und dieselben Claim-IDs zurück. Dieselben IDs mit anderem Payload ergeben `duplicate_conflict`; Version, Claim, Evidence und Supersession werden nicht erneut geschrieben.

## 12. Security

RLS ist auf allen neuen Tabellen aktiv; Browserrollen besitzen keine Rechte. Die `security definer` RPC hat einen festen `search_path`, prüft `service_role`, widerruft `public`, `anon` und `authenticated` und liefert nur allow-listed Codes. Es gibt kein Inhalts-Audit.

## 13. Partial Commit Prevention

Der Adapter ist nicht in `processPersistentCustomerMessage`, Webhooks, Worker oder Runner verdrahtet. Direkte Verwendung ist nur ein isolierter Authority-Test. Die Funktion bleibt innerhalb eines PostgreSQL-Statements transaktional und kann in AP-16-06-01E von der vollständigen Commit-Transaktion wiederverwendet beziehungsweise semantisch integriert werden. Dadurch entsteht in diesem Paket kein produktiver Knowledge-vor-Runtime-Partial-Commit-Pfad.

## 14. Tests

Fokussierte Tests prüfen strikte Adapter-Validierung, stabile IDs, CAS, Versionserhöhung, Replay-/Payload-Konflikt, Provenienz, separate Claim-Semantik, Supersession, Evidence-/Review-Schutz, RLS/RPC-Rechte und die Abwesenheit von Runtime-, Pending-, Outbound-, Command-Completion-, WhatsApp- und OpenAI-Mutationen.

## 15. Explicitly Not Implemented

Nicht enthalten sind vollständiger Cycle Commit, Runtime-/Retry-/Collection-/Effort-Mutation, Pending-Auflösung/-Erzeugung, Outbound Message, Cycle-Completion/Failure, Runner, WhatsApp Send, Delivery oder OpenAI. Normalized Answer und Raw Customer Text erhalten keine neue Persistenz.

## 16. Handoff to AP-16-06-01E

AP-16-06-01E muss diese Knowledge-Authority mit Runtime-Komponenten, vorheriger und nächster Interaction, Snapshot, interner Outbound Message, Events und terminalem Command-Ergebnis in **einer** CAS-geschützten Transaktion komponieren. Erst dort darf ein produktiver Commit-Pfad entstehen.
