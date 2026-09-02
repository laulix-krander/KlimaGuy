# AP-16-06-02 – Recoverable Conversation Cycle Runner

## 1. Architecture Basis

Grundlage sind AP-16-06-00, AP-16-06-01A und die abgeschlossenen Pakete B, C, D, DE, E und F. Die bestehende Kette aus Claim, autoritativem Read, `processPersistentCustomerMessage(...)` und atomarem Commit bleibt maßgeblich.

## 2. Existing Stranding Problem

Ein Prozessabbruch nach `processing` ließ ein Command bisher dauerhaft liegen. Ein duplizierter Webhook kann die deduplizierte Inbound Message nicht erneut `cycle_eligible` machen.

## 3. Scope

Dieses Paket ergänzt ausschließlich serverseitige Lease-/Fencing-Authority, einen Runner für eine interne Message-ID und eine begrenzte Recovery Discovery. Es führt keine neue Domain-Semantik ein.

## 4. Lease Model

Ein Command besitzt einen opaken Owner, eine endliche Expiry, einen Attempt-Zähler und den letzten Startzeitpunkt. Die serverseitige Konstante beträgt fünf Minuten: Der aktuelle deterministische Cycle enthält keine externe Inference und ist kurz; fünf Minuten tolerieren normale DB-Latenz, bleiben aber endlich. Ein Heartbeat ist daher noch nicht erforderlich.

## 5. Execution Owner / Fencing

Jeder Runner-Versuch erzeugt eine neue UUID. Sie ist reine Infrastruktur-Ownership und ersetzt keine Command-, Message-, Transition-, Claim-, Event- oder sonstige Domain-ID. Success, Failure und Human Review vergleichen den aktuellen Owner unter Command-Row-Lock; ein alter Owner erhält `ownership_lost` und mutiert nichts.

## 6. Claim / Acquire Semantics

`acquire_customer_message_cycle_execution(...)` komponiert die bestehende Claim-Authority innerhalb derselben DB-Transaktion und setzt die Lease vor Rückgabe. Neue und nach bestehendem Vertrag reaktivierte Failed Commands werden atomar geleast. Terminale Replays bleiben terminal; eine gültige fremde Lease liefert `busy`.

## 7. Reclaim Semantics

Eine abgelaufene oder fehlende Lease darf unter Row Lock übernommen werden. Nur Owner, Expiry, Attempt Count und Startmetadaten ändern sich. Es gibt keine Max-Attempts-Policy; der Zähler dient Observability und späterer Recovery-Steuerung.

## 8. Stable Domain Authority on Reclaim

Reclaim erhält Command-ID, Source Message, reservierte Domain-IDs, CAS-Versionen und insbesondere `execution_at`. Es werden keine IDs neu reserviert und keine fachlichen Eingaben rekonstruiert.

## 9. Runner Flow

`runPersistentCustomerMessageCycle(...)` akzeptiert ausschließlich `message_id`, erzeugt den Owner, baut die leasegebundene Data Source und ruft `processPersistentCustomerMessage(...)` genau einmal auf. Ergebnisse sind geschlossen als `completed`, `human_review`, `already_terminal`, `failed`, `stale`, `busy` oder `ownership_lost` klassifiziert.

## 10. PersistentCycleDataSource Integration

Die bestehende Factory besitzt einen optionalen serverseitigen Execution Context. In diesem Modus führt ihre ohnehin vom Service aufgerufene Claim-Methode die Acquire-Authority aus. Dadurch gibt es weder externes Vor-Claiming noch doppeltes Claiming. Owner-Daten werden nur an Persistence-Adapter weitergereicht und verschmutzen keine Domain-Typen.

## 11. Success Commit Ownership

Der bestehende atomare Commit prüft den Owner nach dem Command Lock und vor Knowledge Apply oder jeder Runtime-Mutation. AP-16-06-01E-Atomizität und Replay-Hash bleiben erhalten.

## 12. Failure Ownership

Die dreiparametrige Failure-Authority verlangt den aktuellen Owner. Die alte unfenced Service-Role-Ausführung wird entzogen. Ein verlorener Owner setzt den von einem anderen Runner gehaltenen Command nicht auf `failed`.

## 13. Human Review Ownership

Die separate Review-Authority prüft denselben Owner innerhalb ihrer Transaktion. Sie erzeugt weiterhin weder Reviewer noch Approval und wird nicht als `cycle_failed` modelliert.

## 14. Recovery Discovery

`discover_recoverable_conversation_cycles(...)` liefert höchstens 100 processing Customer-Answer-Commands, deterministisch nach ältester Expiry/Start/Creation und Command-ID. Das Resultat enthält nur Command-ID, Source-Message-ID und Expiry, niemals Message-Inhalte oder Provider-Payloads.

## 15. Legacy Processing Commands

Bestehende processing Rows erhalten keinen Fake Owner und keinen Backfill. Eine NULL-Lease gilt explizit als recoverable legacy command. Reclaim verändert keine stabile Authority; der nachfolgende C-Read und die E-CAS-Prüfungen entscheiden weiterhin fail closed über Staleness.

## 16. At-Least-Once / Idempotency Model

Runner können physisch mehrfach gestartet werden; dies ist kein Infrastructure-exactly-once. Fachliche Idempotenz entsteht durch stabile Command Identity und Domain-IDs, Lease/Fencing, autoritativen Read, atomaren Commit und terminale Replay-Erkennung.

## 17. Security

Neue Funktionen sind `security definer`, haben `search_path=public,pg_temp`, widerrufen Public/Anon/Authenticated und gewähren nur `service_role`. Lease-Metadaten enthalten keine personenbezogenen Inhalte, Providerdaten oder Secrets.

## 18. Tests

Fokussierte Vitest- und statische Migrationschecks sichern endliche Ownership, genau einen Service-Aufruf, Busy-No-op, bounded/content-free Discovery, Reclaim/Attempt-Metadaten, dreifaches Fencing, Legacy-Recovery und Grants ab. Die vollständige Suite, Typecheck, Lint und Diff-Check bleiben Abschlussgates.

## 19. Explicitly Not Implemented

Nicht enthalten sind Webhook Full-Cycle Wiring, Scheduler/Cron/Worker, WhatsApp Send/Graph API, OpenAI/LLM/Inference, Heartbeats, Max-Attempts-Policy, Outbound Delivery, Replanning oder Re-Rendering im Runner. Historische Migrationen wurden nicht verändert.

## 20. Handoff to Productive Runtime Trigger

Ein Folgepaket kann einen expliziten produktiven Trigger oder Scheduler an `runPersistentCustomerMessageCycle(...)` und die Recovery Discovery anbinden. Cycle Execution und WhatsApp Delivery müssen dabei getrennte Retry-/Authority-Grenzen bleiben.
