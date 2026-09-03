# AP-16-06-04C – WhatsApp Delivery Lease, Reclaim & Recovery Discovery

**Baseline:** `c0257af21b4be783b44b74419db61bb7bc02b0a9`

## 1. Architecture Basis

Grundlage sind der verbindliche Crash-Contract AP-16-06-04A, die Identity-/Retry-Authority AP-16-06-04B, der Recoverable Conversation Cycle Runner AP-16-06-02, der produktive Runtime-/Recovery-Trigger AP-16-06-03 v2 und der Delivery-Bridge-STOP-Audit. Der aktuelle Command-, Attempt-, Binding-, Adapter- und Reconciliation-Code wurde gegen diese Verträge geprüft. Die acht Delivery-Statuswerte bleiben unverändert.

## 2. Scope

Dieses Paket ergänzt ausschließlich persistente Delivery-Execution-Ownership, atomare Fences, sicheren Reclaim, post-dispatch Ambiguous-Finalisierung und bounded Discovery. Eine additive Migration ersetzt den alten Claim durch genau eine Acquire-Grenze und erweitert die bestehenden Delivery-Mutationen um Owner-/Lease-Fencing.

## 3. Delivery Execution Lease

`execution_owner_id`, `execution_lease_expires_at`, `execution_attempt_count` und `last_execution_started_at` bilden die Delivery-spezifische Execution-Authority. Eine vollständige Owner-/Expiry-Constraint verbietet halbe Leases. Die Lease-Dauer ist zentral auf 60 Sekunden festgelegt; der bestehende Graph-Timeout von höchstens 15 Sekunden lässt die im Audit bestätigte Marge. Es gibt keinen Heartbeat.

## 4. Execution Owner

Jede Execution verwendet eine neue opaque UUID. Sie ist weder Message-, Command-, Dispatch- noch Provider-ID. Acquire speichert sie atomar; alle nachfolgenden Mutationen vergleichen sie unter Command-Lock.

## 5. Provider Attempt vs Execution Attempt

`execution_attempt_count` zählt ausschließlich Acquire/Reclaim zur Infrastrukturbeobachtung. Acquire, Reclaim und Discovery verändern `attempt_count` nicht. Nur die atomare Dispatch-Autorisierung erhöht den Provider-Attempt und erzeugt den offenen `transport_send_attempts`-Datensatz.

## 6. Acquire Eligibility

`acquire_whatsapp_delivery_execution(...)` erzeugt den eindeutigen Command weiterhin idempotent aus der autoritativen Outbound-ID. Erwerb ist nur für `pending`, fälliges `failed/retryable` unter drei Provider-Attempts oder nachweislich pre-dispatch abgelaufenes `sending` zulässig. Geschlossene Resultate unterscheiden `acquired`, `busy`, `already_terminal`, `not_due`, `retry_not_allowed`, `ambiguous` und `attempts_exhausted` sowie Capability-/Inputfehler.

## 7. Busy

Eine fremde oder gleiche noch gültige Lease liefert `busy`. Dabei erfolgen weder Revalidation, Dispatch, Attempt-Increment, Marker-Änderung noch Retry-Mutation.

## 8. Pre-Dispatch Reclaim

Nur ein abgelaufenes `sending` mit vorhandenem früherem Owner, ohne Dispatch-Marker und ohne offenen Send-Attempt ist reclaimbar. Command-ID, Outbound-ID, Delivery-/Retry-State, Provider-Attemptzahl und Marker bleiben erhalten; Owner, Expiry, Execution Count und Startzeit werden erneuert.

## 9. Post-Dispatch Recovery

Ein abgelaufenes `sending` mit Dispatch-Marker oder offenem Attempt wird niemals als `SAFE_TO_RUN` klassifiziert. `finalize_expired_whatsapp_delivery_ambiguous(...)` sperrt den Command, bestätigt Expiry, Marker/Attempt-Konsistenz und das Fehlen eines Provider-Bindings und erzeugt keinen Provider-Side-Effect.

## 10. Delivery Ambiguous Transition

Die Finalisierung schreibt `delivery_ambiguous`, `requires_reconciliation`, `next_attempt_at = null`, beendet den offenen Attempt als `ambiguous` und räumt die Execution Lease. Sie erhöht keinen Attempt und erzeugt keinen Dispatch-Marker. Ein bereits bestehendes Provider-Binding oder ein akzeptierter/zugestellter/gelesener Status gewinnt immer.

## 11. Ownership Fencing

Revalidation, Dispatch-Autorisierung, pre-dispatch Failure und Provider Completion prüfen Owner und Lease in derselben SQL-Transaktion vor jeder fachlichen Mutation. Ein ersetzter oder abgelaufener Owner erhält `ownership_lost`; rohe Datenbankfehler werden im TypeScript-Adapter nicht weitergegeben.

## 12. Dispatch Authorization Fencing

Erst gültiger Owner, gültige Lease und ein Command ohne offenen Attempt erlauben das Increment, den Dispatch-Marker und die Attempt-History. Ownership-Verlust verändert weder Attemptzahl noch Marker.

## 13. Completion Fencing

Completion verlangt gültigen aktuellen Owner und Lease sowie exakte Attempt-Nummer und Dispatch-Token. Der Audit verlangt eine gültige Lease für jede Mutation; eine nach Expiry zurückkehrende Response verliert daher Ownership und darf einen inzwischen kontrolliert ambiguous Command nicht überschreiben. Die 60-/15-Sekunden-Grenze verhindert dies im normalen MVP-Ablauf; ein Prozessstau fällt sicher in manuelle Reconciliation.

## 14. Legacy Sending Commands

Bestehende `sending`-Zeilen werden nicht mit Fake Owner oder Fake Lease backfilled. Ohne Owner ist ihre historische Send-Phase nicht beweisbar. Acquire liefert deshalb fail-closed `ambiguous`; Discovery klassifiziert sie als `FINALIZE_AMBIGUOUS`, und die Recovery-Authority führt sie kontrolliert in manuelle Reconciliation über.

## 15. Recovery Discovery

`discover_recoverable_whatsapp_deliveries(...)` liefert ausschließlich fällige unowned Pending-/Retry-Commands und abgelaufene beziehungsweise Legacy-`sending`-Commands. Aktive Leases sowie accepted, delivered, read, blocked, ambiguous, terminale und noch nicht fällige Arbeit bleiben ausgeschlossen. Die Ordnung ist stabil nach fachlichem Due-/Expiry-Zeitpunkt, `created_at` und UUID.

## 16. Recovery Action Types

Die DB entscheidet geschlossen zwischen `SAFE_TO_RUN` und `FINALIZE_AMBIGUOUS`. Das Ergebnis enthält nur Delivery-Command-ID, Outbound-Message-ID und Action. Das Hard-Limit ist fünf, auch bei einem höheren Caller-Limit. Text, Telefonnummer, Destination, Provider-Payload und Secrets fehlen.

## 17. Security

Alle sieben neuen oder ersetzten RPCs sind `security definer`, besitzen `search_path=public,pg_temp`, prüfen explizit `service_role`, sind für `public`, `anon` und `authenticated` revoked und ausschließlich für `service_role` granted. RLS und die bestehende append-only Attempt-/Audit-Grenze bleiben erhalten. Es werden keine personenbezogenen Daten geloggt.

## 18. Tests

Fokussierte Vitest-Verträge prüfen Lease-Felder/-Dauer, Execution-/Provider-Attempt-Trennung, geschlossene Acquire-Ergebnisse, Busy, pre-dispatch Reclaim, post-dispatch Finalisierung, Binding-Vorrang, Fencing, Legacy-Fail-Closed, Discovery-Limit/-Ordnung/-Datenminimierung, RPC-Sicherheit und Scope-Grenzen. Bestehende Delivery-, Cycle-Runtime-, Recoverable-Runner- und Webhook-Tests bleiben unverändert maßgeblich.

## 19. Explicitly Not Implemented

Nicht implementiert sind ein produktiver WhatsApp-Send, ein neuer Graph-Caller, ein Recoverable Delivery Runner, eine Recovery Route, Scheduler/`pg_cron`/`pg_net`/Vault, OpenAI, Replanning, Re-Rendering, neue Outbound Messages, Conversation-Cycle-Reopen oder Heartbeat. Keine historische Migration wurde verändert.

## 20. Handoff to AP-16-06-04D

AP-16-06-04D kann die geschlossenen Adaptergrenzen zu einem Recoverable WhatsApp Delivery Runner orchestrieren: pro Execution neue Owner-UUID, Acquire, fenced Revalidation, Konfigurationsprüfung, Dispatch-Autorisierung, vorhandener Graph-Adapter und fenced Completion. Discovery-Actions dürfen nicht im Runner aus Raw Fields rekonstruiert werden; `FINALIZE_AMBIGUOUS` verwendet ausschließlich die Recovery-Authority und sendet nie.
