# AP-16-06-04B — WhatsApp Delivery Identity & Retry Authority

**Baseline:** `8e924673b4b2c7b29efeb84883bfddcde0a021e3`  
**Scope:** persistente Delivery-Identität, Retry-Fälligkeit, Provider-Attempt und Dispatch-Grenze; keine Recovery-Ausführung.

## 1. Architecture Basis

Grundlage sind die Audits AP-16-06-00 und AP-16-06-04A sowie die Implementierungen AP-16-06-01E, AP-16-06-02, AP-16-06-03 v2 und der WhatsApp-Delivery-Bridge-STOP-Audit. Conversation Cycle, interne Message-Persistenz, Transport-Delivery und Providerstatus bleiben getrennte Authorities.

## 2. Scope

Dieses Paket ergänzt genau eine additive Migration, einen streng validierten serverseitigen Adaptervertrag und den minimalen Identity-Handoff des bestehenden Cycle Runners. Der vorhandene Delivery-Baustein nutzt die neue Dispatch-Autorisierung; es wird kein produktiver Caller ergänzt.

## 3. Outbound Message Identity

`conversation_cycle_commands.outbound_message_id` beziehungsweise das persistente Commit-Ergebnis bleibt die einzige Übergabeidentität. Der Runner reicht ausschließlich diese vorhandene UUID für einen erfolgreichen Cycle durch. Es gibt keine Suche nach letzter Message, Text, Sequenz oder Conversation-Ende und keine neu erzeugte Message-ID.

## 4. Delivery Command Identity

Der vorhandene idempotente Insert bleibt erhalten. Zusätzlich garantiert ein partieller Unique Index höchstens einen WhatsApp-Delivery-Command je `internal_message_id`, unabhängig von später supersedeten Transportbindungen. Replay erkennt den vorhandenen Command konfliktfrei.

## 5. Retry Eligibility

Claim akzeptiert `pending` oder ausschließlich `failed + retryable + next_attempt_at <= now + attempt_count < 3`. `configuration`, `terminal`, `human_review_required`, `requires_reconciliation`, `delivery_ambiguous`, `blocked`, Provider-Acceptance und Zustellungszustände sind nicht automatisch sendbar. Nicht fällige und ausgeschöpfte Commands liefern geschlossene Ergebnisse.

## 6. Retry Classification

Die vorhandene Enum bleibt geschlossen. `rate_limited` und `transient_provider_error` müssen mit `retryable`, `ambiguous_send_result` mit `requires_reconciliation`, Auth-/Konfigurationsfehler mit `configuration` und Provider-/Destination-Ablehnungen mit `terminal` gekoppelt sein. Unzulässige Paare werden kontrolliert abgewiesen.

## 7. Retry Timing

`next_attempt_at` ist die persistente Timing-Authority. Transient erhält nach Attempt 1 eine Minute und nach Attempt 2 fünf Minuten. Rate Limit erhält standardmäßig fünf Minuten. Nach Attempt 3 sowie für Success, Ambiguous, Configuration und Terminal bleibt der Wert `null`. Ein `Retry-After`-Vertrag wurde nicht erfunden.

## 8. Attempt Semantics

Claim, Revalidation und lokale Konfigurationsprüfung erhöhen `attempt_count` nicht. Erst `authorize_whatsapp_outbound_dispatch` erhöht den Counter unmittelbar vor einem möglichen Provider-Side-Effect. Attempt 4 wird als `attempts_exhausted` abgewiesen. Der bestehende Graph-Aufruf liegt weiterhin erst hinter dieser Autorisierung.

## 9. Dispatch Marker

`dispatch_started_at`, `dispatch_attempt_number` und `dispatch_token` bilden einen vollständigen Marker. Marker, Counter-Increment und Attempt-Zeile entstehen in derselben RPC-Transaktion. Ein offener Marker verhindert eine zweite Autorisierung; Token-Replay erhöht den Counter nicht.

## 10. Pre-Dispatch vs Post-Dispatch

Ohne offenen Attempt/Dispatch-Marker ist ein lokaler Fehler sicher pre-dispatch und darf über die eigene Pre-Dispatch-Authority beendet werden. Ab persistiertem Marker ist ein Provider-Side-Effect konservativ möglich. Der Marker wird weder nach Erfolg noch nach Ambiguous gelöscht.

## 11. Ambiguous Safety Rule

`ambiguous_send_result` wird ausschließlich `delivery_ambiguous/requires_reconciliation`, erhält kein `next_attempt_at` und ist terminal für Automation. Ein Dispatch-Marker ohne Provider-ID-Beweis ist niemals allein wegen Zeitablauf resendbar.

## 12. Provider Success Binding

Completion muss Claim Token, Dispatch Token und Attempt-Nummer exakt treffen. Erst dann wird die vorhandene eindeutige `transport_message_bindings`-Authority geschrieben und der Command atomar `accepted_by_provider`. Stale Attempts und Binding-Konflikte liefern geschlossene Resultate.

## 13. Non-Retryable Failures

Konfiguration wird `blocked/configuration`; Provider-/Destination-Ablehnung wird `failed/terminal`; Ambiguous wird `delivery_ambiguous/requires_reconciliation`. Alle besitzen `next_attempt_at = null` und keine automatische Claim Eligibility.

## 14. Max Attempts

Es bleiben maximal drei autorisierte Provider Attempts. Ein retrybarer sicher abgelehnter dritter Attempt wird terminalisiert und erhält keinen vierten Dispatch.

## 15. Runner Result Identity Handoff

Ein erfolgreicher, nicht-human-review Cycle liefert optional die bereits vom persistenten Result erhaltene `outbound_message_id`. `null` wird nicht in eine UUID umgewandelt. Human Review, Failure, Busy, Stale und Ownership Lost erhalten keine erfundene Identity.

## 16. Security

Alle neuen beziehungsweise ersetzten RPCs sind `security definer`, besitzen `search_path=public,pg_temp`, prüfen `auth.role()='service_role'`, entziehen `public`, `anon` und `authenticated` die Ausführung und gewähren sie nur `service_role`. Adapterresultate enthalten weder Texte, Destinationen, Provider-Payloads, rohe DB-Fehler noch Secrets.

## 17. Tests

Fokussierte Tests sichern Command-Identity, fehlende Heuristiken, geschlossene Klassifikationen, persistentes Timing, Attempt-Zählpunkt, atomaren Marker, Replay, Max Attempts, stale Completion, Success Binding, Security und Scope-Grenzen. Runner-Tests sichern exakte UUID-Weitergabe und das Fehlen einer Fake-ID. Bestehende WhatsApp-, Webhook-, Cycle-, Commit- und Data-Source-Tests bleiben unverändert stark.

## 18. Explicitly Not Implemented

Nicht implementiert sind produktiver WhatsApp-Send-Caller, neuer Graph-API-Pfad, Delivery Lease/Reclaim/Fencing, Recovery Discovery, Recoverable Delivery Runner, Recovery Route, Scheduler, OpenAI, Replanning, Re-Rendering, Conversation-Reopen, neue Outbound Message bei Retry oder Änderungen historischer Migrationen.

## 19. Handoff to AP-16-06-04C

AP-16-06-04C kann Owner/Lease/Fencing und bounded Recovery Discovery ergänzen. Es muss expired pre-dispatch sicher reclaimen und expired dispatch-marked atomar nach `delivery_ambiguous` überführen. Die hier eingeführten Attempt-/Dispatch-Token bleiben dabei zusätzliche Completion-Fences; sie dürfen nicht durch Lease-Ablauf als Resend-Erlaubnis interpretiert werden.
