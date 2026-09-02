# AP-16-06-01F – PersistentCycleDataSource Composition

**Baseline:** `1aa223b53d931b5b21c0f8274378724f32e361be`

## 1. Architecture Basis

Die Komposition basiert auf den Audits AP-16-06-00/AP-16-06-01A und den Implementierungen AP-16-06-01B, C, D, DE und E. Maßgeblich ist der aktuelle `PersistentCycleDataSource`-Vertrag: Er beginnt mit der bereits vorhandenen Claim-Authority, lädt anschließend die vollständige Read Authority und stellt die drei getrennten E-Schreibgrenzen bereit.

## 2. Scope

`createPersistentCycleDataSource(...)` ist eine server-only Infrastructure-Factory. Sie komponiert vorhandene RPC-Sources und Adapter, ohne einen Runner, Trigger oder Side Effect beim Modulimport zu erzeugen.

## 3. Data Source Contract

Die Factory liefert ohne Cast einen vollständigen `PersistentCycleDataSource` mit `claimCustomerMessage`, `commitCustomerMessageCycle`, `failCustomerMessage` und `completeCustomerMessageWithHumanReview`. Claim bleibt enthalten, weil der bestehende Servicevertrag `processPersistentCustomerMessage(...)` eine interne Message-ID annimmt und Claim ausdrücklich über die Data Source aufruft.

## 4. AP-16-06-01C Read Integration

Nach einem kontrolliert validierten Claim übergibt die Data Source ausschließlich die erhaltene Command-ID an `loadCustomerMessageCycleAuthority(...)`. Sie führt keine eigene SQL-Lesekette, Snapshot-Rekonstruktion, Registry-Suche, Planung oder Darstellung aus. Read-Fehler werden geschlossen auf bestehende `CycleFailureCode`-Werte abgebildet; ohne vollständige Authority startet der Service keine Domain-Ausführung.

## 5. AP-16-06-01E Success Commit Integration

`commitCustomerMessageCycle` delegiert genau einmal an den E-Adapter gleichen Namens. Knowledge, Runtime, Pending Interaction, Snapshot, interne Outbound Message und Events werden nicht einzeln von der Data Source geschrieben.

## 6. AP-16-06-01E Failure Integration

`failCustomerMessage` delegiert ausschließlich an die E-Failure-Authority. Der bestehende geschlossene Vertrag erlaubt nur `normalization_failed`, `cycle_failed` und `persistence_failed`; freie Fehlertexte oder Customer-Inhalte werden nicht übernommen.

## 7. Human Review Integration

Der aktuelle Vertrag besitzt eine eigene Review-Methode. Diese delegiert ausschließlich an `completeCustomerMessageWithHumanReview(...)`. Human Review wird weder als technischer Failure noch als Success Commit simuliert.

## 8. Error Mapping

Claim- und Read-Antworten werden mit Zod validiert. RPC-Fehlerdetails, unbekannte Rows und unvollständige Authority werden als kontrolliertes `persistence_failed` beziehungsweise als der engste vorhandene, allow-gelistete Cycle-Fehler ausgegeben. Stale Runtime/Knowledge bleiben explizit; inkonsistente Bindungen werden nicht als freie DB-Texte weitergereicht. Die E-Adapter behalten ihre bereits etablierte kontrollierte Commit-, Failure- und Review-Abbildung.

## 9. Atomicity Preservation

Ein Success-Call entspricht genau einem Aufruf des atomaren E-Commit-Adapters. Es gibt keine Partial-Recovery und keinen separaten Knowledge-, Runtime-, Snapshot-, Pending- oder Outbound-Commit. Nach einem vollständig fehlgeschlagenen Success Commit kann ein aufrufender Service über den vorhandenen Vertrag separat `persistence_failed` terminalisieren; dieses Paket führt diesen Ablauf nicht selbst aus.

## 10. Idempotency Boundary

Die Data Source besitzt keinen Cache, keine Replay Map und erzeugt keine Idempotenzschlüssel. Sie validiert und reicht Claim-Replays sowie die DB-seitige Idempotenz der C/E-Authorities durch.

## 11. Service Role Boundary

Die Factory erhält eng typisierte RPC-Sources per Dependency Injection. Damit kann ein späterer serverseitiger Runner den zentral verwalteten Service-Role-Client einreichen, ohne dass dieses Modul einen weiteren Client, Schlüssel, Environment Contract oder Import-Side-Effect erzeugt. Das Modul bleibt durch `server-only` vor Client-Nutzung geschützt.

## 12. `processPersistentCustomerMessage` Compatibility

Der Factory-Rückgabetyp ist direkt `PersistentCycleDataSource`. Ein fokussierter Test weist sowohl die TypeScript-Zuweisung als auch die reale Ausführung eines deterministischen Cycle nach: Claim → C Load → Service → genau ein E Success Commit. Normalisierungsfehler und Cycle-Fehler gehen an die Failure Authority; Human Review ausschließlich an die Review Authority.

## 13. Tests

Der fokussierte Test enthält acht Tests für Contract Shape, vollständiges Load-Delegieren, fail-closed/sanitisiertes Read-Verhalten, Failure-Delegation, Service-/Success-Kompatibilität, Human Review, technische Failure-Codes und statische No-Recompute-/No-Partial-/Provider-Grenzen. Die bestehenden Tests für Read, Knowledge Apply, Contract Alignment, Atomic Commit/Failure, Persistent Service und Domain-Orchestrierung bleiben unverändert erhalten.

## 14. Explicitly Not Implemented

Nicht implementiert sind Migrationen oder RPCs, neue Domain-Semantik, ID-Erzeugung, erneute Normalisierung, erneutes Knowledge Apply, Replanning, Re-Rendering, produktiver Runner, Worker, Cron, Recovery Loop, Webhook-Wiring, WhatsApp Delivery/Send, Graph API, OpenAI, LLM oder Inference.

## 15. Handoff to Recoverable Conversation Cycle Runner

Das nächste Paket kann einen expliziten serverseitigen Runner für bereits eligible interne Message-IDs bauen, einen zentralen Service-Role-Client in diese Factory injizieren und `processPersistentCustomerMessage(...)` aufrufen. Dieses Folgepaket muss Ownership, Lease/Retry und Recovery definieren; Delivery bleibt weiterhin eine getrennte nachgelagerte Authority.
