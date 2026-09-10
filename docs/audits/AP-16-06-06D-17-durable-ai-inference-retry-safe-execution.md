# AP-16-06-06D-17 — Durable AI Inference Result + Retry-Safe Execution

## 1. Implementierungsstatus und Baseline
**IMPLEMENTIERT.** Baseline SHA: `c8ad6654ebe41034367057522408cfcc07c2ec81`. D-14, D-15 und D-16 sowie Reservation, Context, Commit, Recovery und Human Review wurden vor der Änderung geprüft.

## 2. Production-Evidence und Root Cause
Der belegte Command stand nach 15 technischen Ausführungen und drei AI-Reservationen auf `human_review_required / ai_attempts_exhausted`, obwohl der D-14-Trace bereits ein valides `matched` vor einem nachgelagerten `interpretation_failed` bewies. Das erfolgreiche Ergebnis lebte nur im Request; jede technische Wiederholung reservierte deshalb erneut. Ein Anwendungs-/DB-Fehler wurde fälschlich zu AI-Erschöpfung.

## 3. Dauerhaftes Modell und Authority Binding
`customer_answer_ai_inference_results` enthält genau eine providerneutrale erfolgreiche Klassifikation je Command: Command-, Source-, Conversation-, Project-, Pending-, Decision-, Runtime-, Knowledge- und Information-Key-Bindings, Semantik-/Schema-Version, Attempt, Outcome, optionalen Canonical Value und Zeitpunkte. RLS ist aktiv, Tabellen- und RPC-Zugriff ist service-role-only. Prompt, Kundentext, rohe Providerantwort und Provider-Metadaten werden nicht gespeichert.

Lookup und Insert validieren den processing Command, Owner/Lease, alle Identitäten und Revisionen sowie die aktuelle unbeantwortete Pending Interaction. `matched` wird erst nach Server-Allowlist-Prüfung gespeichert und beim Reuse nochmals gegen die aktuelle Registry validiert; `no_match` und `ambiguous` werden ohne Canonical Value gespeichert.

## 4. Sequenz und Retry-Semantik
Nach Normalisierung und Eligibility erfolgt Lookup vor Reservation. Bei Fund bleiben Reservation und Interpreter aus; der gespeicherte matched- oder claimless Pfad geht direkt in den deterministischen Cycle. Ohne Fund folgen Reservation, Provider, strukturierte/Allowlist-Prüfung, durable Persistierung und erst dann der Cycle. Scheitern Cycle oder Commit später, bleibt das Resultat erhalten und wird beliebig oft unter D-15-Backoff wiederverwendet.

Vorher bedeutete der Zähler praktisch „AI plus nachgelagerte Wiederholungen“. Nachher zählt eine Reservation nur eine neue Provider-Akquisition. Das Limit bleibt drei. Ein vorhandenes erfolgreiches Resultat kann nicht durch nachgelagerte Retries zu `ai_attempts_exhausted` werden.

## 5. Legacy-Exhaustion-Rehabilitation und Schutz
Die Migration markiert bestehende Commands als Semantik v1 und neue als v2. Discovery nimmt ausschließlich aktuelle `customer_answer / human_review_required / ai_attempts_exhausted` mit v1, fehlender vorheriger Rehabilitation, offener Conversation, exakt gebundener Runtime/Pending Authority und ohne neuere Inbound-Antwort auf. Acquisition führt einmalig nach v2 über, ohne den historischen Zähler zurückzusetzen. Weil historische Ergebnisse nicht erfunden werden, ist genau **eine** frische v2-Akquisition erlaubt. Genuine v2 Exhaustion, Business Review, Configuration/Permanent Failure, stale/superseded und completed bleiben ausgeschlossen.

## 6. Outcome- und Failure-Verhalten
`matched` speichert nur einen erlaubten Canonical Value und erzeugt nach Reuse denselben Claim. `no_match`/`ambiguous` bleiben claimless und lassen Information offen. Provider-Time-outs ohne erfolgreiches Resultat reservieren weiterhin höchstens drei reale Versuche. D-15-Lease/Fencing und exponentieller Backoff bis eine Stunde bleiben unverändert.

## 7. State-/Dead-State-Matrix
| AI Result | Command/Code | Authority | Recovery |
|---|---|---|---|
| keines, Attempts frei | processing/technischer Retry | aktuell | neue Inferenz erlaubt |
| valide durable | failed/cycle_failed | aktuell | Reuse, kein Provider |
| valide durable | failed/persistence_failed | aktuell | Reuse, kein Provider |
| keines, drei echte v2-Fehler | Human Review/ai_attempts_exhausted | aktuell | ausgeschlossen |
| keines, falsche v1-Erschöpfung | Human Review/ai_attempts_exhausted | aktuell | einmalige Semantik-Rehabilitation |
| beliebig | beliebig | stale/superseded | kein Reuse/Recovery |
| historisch | completed | beliebig | terminaler Replay |

Es existiert kein Zustand, in dem ein valides durable Resultat eine neue Provider-Reservation verlangt.

## 8. Schema/RPCs und Dateien
Migration: `supabase/migrations/202609100002_durable_ai_inference_retry_semantics.sql`. Neu sind Tabelle, Versionsfelder, service-only Lookup/Persist-RPCs, v2-Reservation und eng begrenzte Discovery/Acquisition-Rehabilitation. Anwendung: Orchestration-Trace/Service, Commit-Adapter, Data-Source, Runner-Defaults. Tests: Service-E2E für bekannten Satz und beide claimless Outcomes sowie Migration-/Authority-Verträge. Dieses Artefakt dokumentiert die Aktivierung.

## 9. Tests und Production-Aktivierung
Typecheck, Lint, Diffcheck, fokussierte Service/Runner/Runtime/Schema/D-15/D-16/D-17-Suites und vollständiges Vitest sind Abschlussgates.

Aktivierung: (1) genau diese Migration anwenden, (2) Vercel deployen, (3) einen geplanten Recovery-Lauf zulassen, (4) einen strukturierten Trace auf Lookup/Reuse/Persist, übersprungene Reservation/Provider und Cycle/Commit prüfen, (5) nächste Outbound Identity und WhatsApp-Fortschritt verifizieren. Kein Resend, keine manuelle Mutation, kein Counter-Reset.

## 10. Explizite Antworten
- **Production migration required: YES**
- **Vercel Production deployment required: YES**
- **Existing ai_attempts_exhausted Production command automatic recovery expected: YES**, sofern die dokumentierte aktuelle Authority weiterhin gilt.
- **Customer resend required: NO**
- **AI inference limit retained: YES**
- **Maximum real provider attempts: 3** (Legacy-Rehabilitation erlaubt genau einen neuen v2-Versuch.)
- **Downstream technical retry consumes new AI attempt: NO**
- **OpenAI behavior changed: NO**
