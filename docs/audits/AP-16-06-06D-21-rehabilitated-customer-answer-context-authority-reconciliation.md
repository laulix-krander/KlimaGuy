# AP-16-06-06D-21 — Rehabilitated customer-answer context authority reconciliation

## 1. Baseline SHA

Untersucht wurde der lokale aktuelle `main`-Merge-Stand `edac2556c95b681c09a844ddd3d8636d02959fcb` (Branch `work`, sauberer Ausgangsbaum). Historische Migrationen D-18 bis D-20 wurden nicht verändert.

## 2. Production Evidence

Der vorgegebene Production-Lauf beweist `candidate=true`, `attempted=true`, `succeeded=true`, `result_code=rehabilitated`. Die nachfolgende Acquisition war erfolgreich; erst `context_read` endete mit `failure_category=authority_rejected`, bevor Normalisierung, AI Eligibility, Result Lookup, Reservation oder deterministische Ausführung erreicht wurden.

## 3. Erfolgreicher D-20-Rehabilitation-Nachweis

D-20 repariert ausschließlich die tabellenlokale Feldauflösung des gemeinsamen Runtime-Triggers. Damit kann D-18 Recovery Pending, Recovery Snapshot, Runtime und denselben Command atomar persistieren. Der Production-Beleg schließt den früheren `runtime_update`/`42703`-Fehler aus.

## 4. `context_read authority_rejected`

`createPersistentCycleDataSource(...).claimCustomerMessage(...)` ruft bei einem Execution Context `acquire_customer_message_cycle_execution(target_message_id, execution_owner, lease_seconds)` auf. Nach validiertem non-terminalem Claim ruft dieselbe TypeScript-Funktion `loadCustomerMessageCycleAuthority(dependencies.read, command_id)` auf. Diese ruft `get_customer_message_cycle_context(target_command_id)` auf. Ein kontrollierter Fehler der RPC oder eine nachgelagerte Authority-Abweisung wird als `context_read / authority_rejected` klassifiziert.

## 5. Exakter Context-Read-Pfad

1. Recovery Runner erzeugt Owner und Lease.
2. `createPersistentCycleDataSource().claimCustomerMessage(messageId)` übergibt Message-ID, Owner und Lease an `acquire_customer_message_cycle_execution`.
3. D-18/D-20 rehabilitiert gegebenenfalls und D-17 übernimmt den normalen Claim. Die Acquisition liefert die Command-ID; Context-Felder werden nicht aus dem Acquisition-JSON vertraut.
4. `loadCustomerMessageCycleAuthority(read, command_id)` liest ausschließlich über `get_customer_message_cycle_context` neu aus der Datenbank.
5. Die RPC validiert Command, Conversation, Project, Runtime, Knowledge, Pending, Snapshot, Source/Prompt und rekonstruiert Knowledge, Collection, Retry, Effort und Evidence.
6. TypeScript validiert den strikt typisierten DTO, Snapshot-Domainvertrag sowie alle querliegenden Identitäts-, Revisions-, Knowledge-, Prompt- und reservierten ID-Bindungen.

## 6. Vollständiger Authority-Vertrag

| Bereich | Prädikate |
|---|---|
| Command | vorhanden; `customer_answer`; `processing`; Project/Prompt/Execution/Event-Reservierungen vollständig; ID entspricht Request; Source, Pending, erwartete Conversation-/Runtime-/Knowledge-Versionen bleiben bindend |
| Lease/Attempt | D-17 Acquisition setzt denselben Command auf `processing`, bindet `execution_owner_id`, eine nicht abgelaufene Lease und erhöht nur den technischen Observability-Counter; der Read mutiert oder verlängert dies nicht |
| Conversation/Project | Conversation offen; `revision = expected_conversation_revision`; `current_project_id = command.project_id` |
| Runtime | gleicher Conversation-/Project-Schlüssel; `awaiting_customer_answer`; `revision = expected_runtime_revision`; `active_pending_interaction_id = command.pending_interaction_id`; kein gelockerter Project-/Revision-Vertrag |
| Knowledge | Runtime und `project_knowledge_states.current_version` entsprechen `expected_knowledge_version` |
| Aktuelles Pending | ID entspricht Command und Runtime; `pending`; unbeantwortet; Conversation/Project, Runtime, Knowledge und Prompt entsprechen Command |
| Aktueller Snapshot | ID entspricht `pending.snapshot_id`; Pending/Conversation/Project, Runtime, Knowledge, Outbound Prompt, Sequenz und Rendertext stimmen |
| Source | exakt `command.source_message_id`; inbound Customer Text derselben Conversation; Text vorhanden; nach Prompt; keine neuere Customer-Inbound im Recovery-Zweig |
| Prompt | exakt derselbe Outbound System/AI Text; Conversation, Sequenz, Snapshot-Outbound und deterministisch rekonstruierter Text stimmen |
| Recovery | nur bei `legacy_ai_exhaustion_rehabilitated_at IS NOT NULL` und Semantik v2; aktuelles Pending/Snapshot müssen vollständige Recovery-Lineage tragen; Original Pending ist durch exakt Source beantwortet; Original Snapshot/Prompt/Conversation/Project/Knowledge sind identisch; Originalrevision ist exakt `expected_runtime_revision - 2` |
| DTO/Domain | Zod strict; Snapshot-Schema, ausgewählte Aktion, Rendervertrag, Knowledge-Version, Idempotency-Key und alle persistierten Folge-IDs stimmen |
| Effort | normal: Zeile auf `expected_runtime_revision`; rehabilitiert: zuerst ebenfalls aktuell, andernfalls ausschließlich nach vollständigem Recovery-Beweis Original-Pending-Revision |

`active_evidence_request_id` wird von D-18 nicht als aktive Authority übernommen und bleibt `NULL`; der Context-Read benötigt für den Customer-Answer-Zweig weiterhin eine aktive Pending Interaction. Command-Ausführungsversuch und Lease bleiben Eigentumsaufgabe der Acquisition/Commit-RPCs und werden durch den Read nicht abgeschwächt.

## 7. Exaktes fehlschlagendes Predicate

Die wirksame Funktion `public.get_customer_message_cycle_context(uuid)` führt aus:

```sql
select ... into effort
from public.conversation_effort_states
where conversation_id=cmd.conversation_id
  and project_id=cmd.project_id
  and runtime_revision=cmd.expected_runtime_revision;
...
if knowledge is null or effort is null then
  return jsonb_build_object('success',false,'code','authority_incomplete');
end if;
```

Erwartet wird nach Rehabilitation eine Effort-Zeile auf der neuen Command-Revision `N+2`. Tatsächlich liegt sie auf `N`: Das technische Human Review erhöht Runtime von `N` auf `N+1`, aktualisiert aber die Effort-Revision nicht. D-18/D-20 berechnet danach `next_revision=N+2`, versucht jedoch `conversation_effort_states ... runtime_revision=r.revision` (`N+1`) zu aktualisieren. Dieses Predicate trifft keine Zeile. Rehabilitation kann trotzdem erfolgreich committen, weil die Update-Anzahl nicht geprüft wird. Der Context Read sucht anschließend `N+2`, erhält `effort IS NULL`, liefert exakt `authority_incomplete`; TypeScript klassifiziert den kontrollierten Read-Fehler als `authority_rejected`.

## 8. Root Cause

D-18 hat für die Effort-Projektion fälschlich die bereits um eins fortgeschrittene Human-Review-Runtime-Revision als Quellrevision interpretiert. Der fachliche Effort-Zustand blieb dagegen unverändert auf der Customer-Answer-Ausgangsrevision. Dies ist kein Pending-, Acquisition-, OpenAI-, WhatsApp- oder Lease-Fehler.

## 9. Reparatur

Eine einzige forward-only Migration ersetzt ausschließlich `get_customer_message_cycle_context`. Normaler Context bleibt unverändert streng. Für einen markierten v2-rehabilitierten Command wird vollständige Original→Recovery-Lineage bewiesen. Nur wenn auf der aktuellen Revision keine Effort-Zeile existiert, liest die Funktion die Effort-Zeile der exakt gebundenen Original-Pending-Revision. Es gibt keine DML, keinen Resend, keine neue Message und kein künstliches Beantworten des Recovery Pending.

## 10. Normale vs. rehabilitierte Authority-Semantik

Normal: Source beantwortet das beim ursprünglichen Claim aktive Pending, und alle aktuellen Context-Komponenten liegen auf derselben Revision. Rehabilitiert: Das originale Pending bleibt immutable `answered_by_message_id = source_message_id`; das abgeleitete Recovery Pending bleibt `pending / unanswered` und ist die aktuelle Command-/Runtime-Authority. Source und Prompt bleiben unverändert. Die Ausnahme betrifft allein die revisionsgebundene Effort-Projektion und wird erst nach vollständigem Recovery-Lineage-Beweis aktiviert.

## 11. Retry nach bereits persistierter Rehabilitation

Nach dem beobachteten Context-Fehler persistiert `fail_customer_message_cycle` `failed / persistence_failed`, löscht den Owner und setzt eine Retry-Zeit/Lease-Grenze; es löscht weder Rehabilitationsmarker noch Recovery Pending/Snapshot/Runtime. Beim nächsten zulässigen Lauf liefert `rehabilitate_legacy_ai_exhaustion_human_review` `already_rehabilitated`; D-17 reclaimed denselben Command, setzt ihn auf `processing` und bindet einen neuen Owner/Lease. Der neue Context Read erkennt die bestehende Lineage. Es entstehen keine zweite Rehabilitation, keine neuen Recovery-Zeilen und keine Message-Inserts.

## 12. Security-/Authority-Invarianten

Conversation-/Project-Bindung, Current Project, Conversation-Revision, Runtime-Revision, Runtime Active Pending, Knowledge-Version, Prompt/Source/Sequence, Snapshot und keine-neuere-Inbound-Prüfung bleiben fail-closed. Beliebige alte Pendings sind nicht zugelassen: Nur die explizite, zweistufige D-18-Revision und beide Recovery-FKs werden akzeptiert. Die RPC bleibt ausschließlich `service_role`-ausführbar und gibt keine zusätzlichen Texte, IDs oder Providerdaten in Diagnostik aus.

## 13. AI-/Durable-Result-Semantik

Die Migration berührt weder `ai_inference_attempt_count` noch `current_semantics_ai_attempt_count`, Reservation oder Durable Result. v2-Acquisition, maximal drei echte Provider Attempts im normalen v2-Vertrag, der engere bestehende rehabilitierte Vertrag, Result-Reuse und downstream Retry bleiben unverändert. WhatsApp-Max-3 und technische Lifetime-Semantik werden nicht geändert.

## 14. Tests

Der neue Migrationstest modelliert den Production-Zustand, erfolgreiche bereits persistierte Rehabilitation, Acquisition-/Processing-Zustand und Context-Akzeptanz. Er beweist Source-Authority, immutable Original Pending, unbeantwortetes Recovery Pending, Snapshot-Lineage, Runtime/Command-Bindung, unverändertes Knowledge sowie Ablehnung falscher Lineage, Source, neuerer Inbound, Revision, Knowledge, Project und Conversation. Static checks beweisen außerdem Read-only-Verhalten und unveränderte AI-/WhatsApp-/Counter-Semantik. Bestehende Normalisierungs-, AI-Klassifikations-, Orchestrierungs- und building-type-E2E-Tests decken den unveränderten Downstream-Pfad ab.

## 15. Geänderte Dateien

- `supabase/migrations/202609100006_rehabilitated_customer_answer_context_authority_reconciliation.sql`
- `test/rehabilitated-customer-answer-context-authority-reconciliation-migration.test.ts`
- `docs/audits/AP-16-06-06D-21-rehabilitated-customer-answer-context-authority-reconciliation.md`

## 16. Migration

Production-Migration erforderlich: **JA**. Exakt: `supabase/migrations/202609100006_rehabilitated_customer_answer_context_authority_reconciliation.sql`. Keine historische Migration wurde editiert, keine incident-spezifische DML ist enthalten.

## 17. Production-Aktivierung

Migration regulär auf Production anwenden. Kein Kunden-Resend, Counter-Reset oder manueller Datenfix ist erforderlich. Danach den bestehenden Recovery Runner nach Ablauf/Erreichen seiner normalen Retry-Zeit erneut ausführen.

## 18. Erwarteter nächster Production-Recovery-Lauf

Discovery findet denselben bereits rehabilitierten Command; keine zweite Rehabilitation wird angelegt. Acquisition reclaimed ihn mit neuem Owner/Lease. Context Read lädt die Recovery Authority erfolgreich (`authority_context_loaded=true`), Normalisierung wird erreicht. Für den bekannten `building_type`-Fall kann danach die unveränderte D-17 AI-Acquisition bzw. Durable-Result-Wiederverwendung `matched` liefern; die deterministische Interpretation setzt `project.building_type=single_family_house`. Ein davon unabhängiger downstream Fehler wäre separat zu auditieren.
