# AP-16-06-06D-18 — Legacy AI Exhaustion Human-Review State Rehabilitation

## 1. Implementierungsstatus

**IMPLEMENTIERT.** D-18 ergänzt eine eng begrenzte, service-role-only und transaktionale Wiederherstellung für bereits durch den alten v1-`ai_attempts_exhausted`-Pfad terminalisierte Kundenantworten. Es gibt weder incident-spezifische DML noch eine Migration bestehender fachlicher Zeilen beim Deployment.

## 2. Baseline SHA

`8b865c5e6c0e5a3bd6ec544dfc9354b5fb8a63ab` (CURRENT-main-Arbeitsgrundlage, Merge von D-17).

## 3. Bestätigte Production-Evidence

Der gemeldete Command steht auf `customer_answer / human_review_required / ai_attempts_exhausted`, Semantik v1, ohne Rehabilitation, mit historischem AI-Zähler 3 und aktuellem Semantikzähler 0. Seine ursprüngliche Authority ist Runtime-Revision 2 / Knowledge-Version 1 / Pending Interaction `answered` durch exakt dieselbe Source Message. Die aktuelle Runtime ist `human_review`, Revision 3, Knowledge-Version 1 und hat keine aktive Pending Interaction. Es gibt keine neuere Kunden-Inbound-Message. Die konkreten Incident-UUIDs und der Antworttext werden bewusst nicht in Produktcode oder Migration aufgenommen.

## 4. Exakte D-17-Lücke und alter Human-Review-Effekt

D-17 kann eine v1-False-Exhaustion nur übernehmen, solange die ursprüngliche Authority weiterhin `awaiting_customer_answer`, gleiche Runtime-Revision und eine unbeantwortete aktive Pending Interaction ist. Der ältere technische Human-Review-Commit hatte jedoch bereits atomar (1) die ursprüngliche Pending Interaction durch die Source Message beantwortet, (2) die Runtime-Revision um eins erhöht, (3) Runtime auf `human_review` gesetzt, (4) die aktive Pending Interaction entfernt, (5) den Command mit dem technischen Grund terminalisiert und (6) ein Audit-Event `conversation_cycle_technical_human_review_requested` mit Command, Grund sowie Runtime-Vorher/Nachher-Version geschrieben. Deshalb war gerade die bereits terminalisierte Zielklasse für D-17 unsichtbar.

## 5. Eligibility- und Provenienzvertrag

D-18 verlangt gemeinsam und unter Locks:

- exakt `customer_answer`, `human_review_required`, `ai_attempts_exhausted`, Semantik v1 und noch keinen Rehabilitationszeitpunkt;
- offene Conversation mit unveränderter Revision und demselben aktuellen Projekt;
- eine vorhandene inbound/customer/text Source Message samt Textzeile und keine neuere Kunden-Inbound-Message;
- Runtime desselben Projekts in `human_review`, ohne aktive Pending/Evidence Authority, gleiche Knowledge-Version und exakt `expected_runtime_revision + 1 = result_runtime_revision = current revision`;
- unveränderte aktuelle Project-Knowledge-Version;
- ursprüngliche Pending Interaction `answered` durch **exakt** die Command-Source, mit ursprünglicher Runtime-/Knowledge-/Prompt-Bindung;
- unveränderten ursprünglichen Snapshot und keine neuere aktive Pending Interaction;
- das bestehende technische Human-Review-Audit-Event für genau diesen Command, Grund `ai_attempts_exhausted`, ursprüngliche Runtime-Revision und direkte Nachfolgerrevision.

Damit reichen `runtime_status=human_review` oder ein Result-Code allein ausdrücklich nicht. Nicht-AI-Review, Konfiguration/permanente Fehler, v2-Erschöpfung, fremde Antwort, neuere Inbound-Message, geschlossene Conversation, Projekt-/Knowledge-Wechsel, neue aktive Pending Interaction, stale Lineage sowie bereits abgeschlossene/rehabilitierte Commands bleiben ausgeschlossen. Ein manuell behandelter Fall verliert mindestens die unveränderte direkte Runtime-/Pending-/Conversation-Authority und wird ebenfalls ausgeschlossen.

## 6. Runtime-Rekonstruktion

Die Runtime wird **nicht** zurückgesetzt. Aus `human_review / N / active=null` entsteht `awaiting_customer_answer / N+1 / active=recovery_pending_id`; die Knowledge-Version bleibt gleich. Auch der aktuelle Effort-State wird auf die neue Runtime-Revision fortgeschrieben, damit der bestehende Context-Read dieselbe konsistente Authority sieht.

## 7. Pending-Interaction- und Snapshot-Rekonstruktion

Die ursprüngliche beantwortete Pending Interaction und ihr Snapshot bleiben unverändert und auditierbar. D-18 fügt je eine abgeleitete Recovery-Pending-Interaction und einen abgeleiteten Recovery-Snapshot ein. Neue selbstreferenzierende Lineage-Spalten und eindeutige Indizes erlauben pro Original höchstens einen Nachfolger. Der Snapshot übernimmt validierte Planner-/Render-Semantik und bindet weiterhin dieselbe vorhandene Prompt Message; hierfür wird die frühere globale Outbound-Snapshot-Eindeutigkeit auf originale Snapshots begrenzt, während Recovery-Snapshots über ihre eindeutige Original-Snapshot-Lineage kontrolliert werden. Es entstehen weder eine neue Inbound- noch eine neue Prompt-Message und kein kopierter Kundentext.

## 8. Command-Design und D-17-Integration

Der bestehende Command wird kontrolliert fortgeführt; es entsteht kein Successor-Command. Die Trigger-Ausnahme erlaubt ausschließlich den vollständigen D-18-Übergang mit neuer Pending-/Runtime-Authority, Semantik v2, unveränderter Knowledge-/Prompt-/Source-/Command-Identität, unverändertem historischen AI-Zähler und aktuellem Semantikzähler 0. Danach ruft Acquisition die unveränderte D-17-Acquisition auf. D-17 erlaubt damit genau einen korrigierten v2-AI-Acquire, persistiert dessen validiertes provider-neutrales Ergebnis dauerhaft und verwendet es bei Downstream-Retries wieder. Der historische `ai_inference_attempt_count=3` bleibt unverändert; es wird kein Ergebnis erfunden und kein Provider-Limit erhöht.

## 9. Human-Review- und Audit-Historie

Es existiert keine separate aktive Review-Queue-Tabelle in diesem Pfad. Actionability lag in Command- und Runtime-Status; beide werden atomar aus dem aktiven Review-Zustand herausgeführt. Das ursprüngliche technische Review-Audit-Event wird weder verändert noch gelöscht. Ein neues `legacy_ai_exhaustion_human_review_rehabilitated`-Audit-Event hält Command/Conversation/Projekt, Original- und Recovery-Pending-Identität, Runtime-Vorher/Nachher, Knowledge-Version, historischen Attempt-Zähler und den begrenzten Result-Code fest. Damit bleibt die Sequenz „Antwort → v1 Attempts → technische Eskalation → Human Review → D-18 → v2 Retry → durable Result → deterministischer Commit“ wahrheitsgetreu.

## 10. Concurrency und Fencing

Die RPC sperrt zuerst den stabil über die Source Message gefundenen Command, danach Conversation, Runtime und Original-Pending. Nur ein Worker kann den v1/null-Rehabilitationszustand sehen und die durch Unique-Indizes zusätzlich geschützte Recovery-Lineage erzeugen. Der Gewinner rekonstruiert, stellt v2 her und erwirbt anschließend im selben äußeren Datenbank-Call die normale D-17-Lease. Ein wartender Worker sieht anschließend `already_rehabilitated` und anschließend D-17 `busy`/Replay. Es gibt dadurch keine zwischen Transaktionen sichtbare Command/Runtime/Pending-Divergenz und keine doppelte Pending Interaction, Inference, Claim- oder Outbound-Erzeugung.

## 11. Zustandsmatrix

| Zustand | Ergebnis |
|---|---|
| v1 False Exhaustion + Runtime weiterhin `awaiting_customer_answer` | bestehende D-17-Rehabilitation |
| v1 False Exhaustion + Runtime `human_review` + Original-Pending beantwortet durch dieselbe Source | D-18-Rehabilitation, dann D-17 |
| v2 echte `ai_attempts_exhausted` | terminales Human Review |
| fachliches / nicht-AI Human Review | terminal |
| neuere Kunden-Inbound-Message | ausgeschlossen |
| andere `answered_by_message_id` | ausgeschlossen |
| Runtime-/Projekt-/Knowledge-Authority geändert | ausgeschlossen |
| neue aktive Pending Interaction | ausgeschlossen |
| Audit-Provenienz fehlt oder passt nicht | ausgeschlossen |
| bereits rehabilitiert | Discovery ausgeschlossen; Acquisition Replay/Busy |

## 12. Geänderte Dateien

- `supabase/migrations/202609100003_legacy_ai_exhaustion_human_review_rehabilitation.sql`
- `lib/server/conversation/persistent-cycle-data-source.ts`
- `lib/server/conversation/recoverable-cycle-runner.ts`
- `lib/server/conversation/recovery-handler.ts`
- `test/legacy-ai-exhaustion-human-review-rehabilitation-migration.test.ts`
- `test/recoverable-conversation-cycle-runner.test.ts`
- `test/productive-conversation-cycle-runtime.test.ts`
- dieses Audit-Artefakt

## 13. Migration

**`supabase/migrations/202609100003_legacy_ai_exhaustion_human_review_rehabilitation.sql`** ist die einzige forward-only D-18-Migration. Sie enthält Schema-Lineage, Trigger-Guard, dedizierte RPC, Discovery und Acquisition-Komposition; sie führt keine Bestandsdatenänderung aus.

## 14. Tests

Die D-18-Vertragstests prüfen Signatur, Return-Shape, RLS-nahe Grants, Service-Role-Check, Locks, Idempotenz, exakte terminalisierte Authority, negative Review-Klassen, monotone Revision, unveränderte historische Interaktion, abgeleitete eindeutige Lineage, unveränderte Attempt-Zähler, fehlende Message-Duplikation und fehlende Incident-IDs. Bestehende D-15/D-16/D-17-, Context-, Commit-, Recovery-, Schema- und bekannte Building-Type-Regressions decken anschließend den normalen v2-Durable-Result- und deterministischen Claim/Planner/Outbound-Pfad ab. Die ausgeführten Gates und Resultate stehen im Abschlussbericht.

## 15. Production-Aktivierung

1. Die eine D-18-Migration anwenden.
2. Vercel Production deployen lassen.
3. Einen normalen geplanten Conversation-Cycle-Recovery-Lauf abwarten.
4. Einen strukturierten, privacy-safe Recovery-Trace prüfen.
5. WhatsApp-Fortschritt verifizieren.

Kein Resend, kein manuelles Command-Update-SQL und kein Counter-Reset.

## 16. Erwarteter One-Run-Trace

Discovery meldet `legacy_human_review_rehabilitation_candidate=true`. Acquisition meldet `legacy_human_review_rehabilitation_attempted=true`, `...succeeded=true` und Result-Code `rehabilitated`. Danach zeigen die bestehenden D-17-Felder Result-Lookup ohne Treffer, genau eine Reservation/Provider-Ausführung, persistiertes Durable Result, den deterministischen `with_claim`-Pfad, erfolgreichen Building-Type-Commit, nächste Planner-Interaktion und Outbound-Fortschritt. Der Endzustand ist nicht Human Review. Trace und Logs enthalten keinen Kundeninhalt.

## 17. Explizite Betriebsantworten

- **Production migration required: YES**
- **Vercel Production deployment required: YES**
- **Existing terminalized ai_attempts_exhausted Production command automatic recovery expected: YES**
- **Customer resend required: NO**
- **Original inbound message reused: YES**
- **Historical ai_inference_attempt_count reset: NO**
- **Human Review history deleted: NO**
- **OpenAI behavior changed: NO**
