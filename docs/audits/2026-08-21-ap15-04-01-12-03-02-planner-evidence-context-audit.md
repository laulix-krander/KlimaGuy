# AP-15-04-01-12-03-02 — Review Regression and Planner Evidence Context

## Ergebnis

`DESCRIPTIVE EVIDENCE CONTEXT — IMPLEMENTED`

`TECHNICAL KNOWLEDGE SUBSTITUTION — PROHIBITED`

`DESCRIPTIVE FACT → TECHNICAL READINESS — PROHIBITED`

`DESCRIPTIVE FACT → TECHNICAL MISSING RESOLUTION — PROHIBITED`

`SEMANTIC EVIDENCE RE-REQUEST — BLOCKED WHEN CONTEXT ALREADY PRESENT`

`CROSS-TARGET OVER-DEDUPLICATION — PROHIBITED`

`HUMAN-REVIEWED DESCRIPTIVE FACT PLANNER CONTEXT — IMPLEMENTED`

`AUTO-APPLY — NOT IMPLEMENTED`

`REAL MEDIA BINDING — NOT IMPLEMENTED`

`PRODUCTION READY — NO`

## Evidence Context Contract und Mapping

Der strict Zod-Vertrag ist eine abgeleitete, immutable Planner-Sicht auf effektive, angewendete Claims. Die statische Registry bildet ausschließlich `room_overview_context_observed → room_overview`, `indoor_installation_area_observed → indoor_area_overview`, `outdoor_installation_area_observed → outdoor_area_overview`, `line_route_context_observed → line_route_context` und `wall_penetration_context_observed → core_drilling_context` ab. Nur Boolean `true`, `descriptive_fact` und `observed` werden wirksam.

## Knowledge-/Request-Grenze und Deduplizierung

Request History bleibt im `EvidenceRequestState`; fachlich bestätigter visueller Kontext wird ausschließlich aus dem effektiven Knowledge State abgeleitet. Der Evidence Planner prüft beide Signale getrennt. Ein exakt abgedecktes Target erhält den kontrollierten Grund `existing_descriptive_evidence_context`; andere Targets bleiben auswählbar.

## Information Gain, Dependencies und Revisit

Ein bereits abgedecktes konkretes Fototarget wird nicht erneut als `new_information_expected` beziehungsweise zusätzlicher Fotopfad bewertet. Der geschlossene Reason Code lautet `existing_descriptive_evidence_context`. Technische Dependencies verwenden unverändert technische Properties. Der Kontext erzeugt keinen Revisit, ändert keine Attempt-Grenze und führt keinen Human-Review-Fallback ein.

## Human Review, Replay und Idempotenz

Erst ein wirksam angewendeter Claim erscheint im Planner-Kontext. Reject, unzureichende Evidence, Konflikt oder stale Review erzeugen keinen solchen Claim. Die bestehende CAS-/Apply-Grenze bleibt maßgeblich; Apply-Replay erzeugt weder Claim noch State-Version oder Review-Revision erneut. Ableitung und Planung sind pure und bei identischen Eingaben deterministisch.

## Readiness, Missing Information und Safety Boundaries

Die Ableitung verändert keine Claims. Insbesondere erfüllt sie weder `indoor_unit_position_known`, `outdoor_unit_position_known`, `line_route_known`, `accessibility_known` noch `electrical_supply_known`. Missing Information und Readiness bleiben unverändert; Wanddurchführungskontext ist keine Bohrsicherheitsaussage und alle Site-Check-Grenzen bleiben bestehen.

## Simulator Inspector

Der bestehende Evidence Inspector zeigt vorhandene Kontexte separat und prominent „Keine technische Freigabe.“ Technische offene Informationen bleiben im bestehenden Inspector eigenständig sichtbar. Der kontrollierte Deduplizierungsgrund ist im Planner lesbar.

## Tests und verbleibende Grenzen

Contract, fünf Mappings, positive und negative Deduplizierung, technische Invarianten, Information Gain, Determinismus und inaktive Evidence werden durch Vitest regressiert. Der bestehende Human-Review-Test deckt Approval, Reject, Insufficient, stale und Replay ab. Es gibt weiterhin keine echten Medien, Uploads, Storage-/Datenbankbindung, Vision/OCR/KI, Auto-Apply, automatische Supersession oder technische Freigabe. Das kleinste Folgepaket ist eine rein synthetische, entity-spezifische End-to-End-Simulator-Fixture für alle fünf Review-Ausgänge ohne Erweiterung der Produktionskopplung.

## AP-15-04-01-12-03-03 Synthetic Review End-to-End Regression Result

Die Scenario Registry enthält `review_approval_e2e`, `review_reject_e2e`, `review_insufficient_e2e`, `review_conflict_e2e` und `review_stale_e2e`. Die Fixture nutzt feste UUIDs/Zeitpunkte und ausschließlich die öffentlichen Grenzen Planner → Request → Provided → Availability → Observation → Mapping → Human Review → State Transition Apply → Evidence Context → Information Gain → Planner.

Approval ist für alle fünf descriptive Properties verifiziert. Reject, Evidence Insufficient und Stale mutieren Knowledge, Readiness oder Technical Missing nicht. Replay ergibt `already_applied`, äquivalente Claims ergeben `no_change`. Request History bleibt vom Knowledge-derived Context getrennt. Outdoor Context blockiert nur `outdoor_area_overview`; Accessibility, Line Route und Electrical bleiben targetübergreifend offen. `outdoor_unit_position_known` bleibt ebenfalls offen.

### Entdeckter Contract-Blocker

Ein **valider** Conflict-E2E-Fall ist derzeit nicht konstruierbar: Das Knowledge-Claim-Schema erlaubt für jede descriptive Property ausschließlich `true`, `descriptive_fact` und `observed`. Jeder gültige aktive Claim derselben Entity/Property ist damit äquivalent und führt korrekt zu `no_change`; `false` wird vor dem vorhandenen `conflict_detected`-Reviewzweig vom Schema abgewiesen. Der Regressionstest dokumentiert dieses Fail-closed-Verhalten. Weder wurde ein ungültiger State eingeschleust noch die positive-only Property-Semantik erweitert. Die gültige Konfliktsemantik benötigt eine separate Produktentscheidung.

Der vorhandene Simulator stellt Reviewaktionen, deutsche Ergebnisnachrichten und strukturierte Inspectorwerte bereit; die Szenarioauswahl wurde minimal ergänzt. Echte Medien, Persistenz, Vision und WhatsApp bleiben außerhalb des Pakets.

`SYNTHETIC REVIEW END-TO-END REGRESSION — PARTIALLY IMPLEMENTED / CONFLICT CONTRACT BLOCKED`

`APPROVAL END-TO-END — VERIFIED`

`REJECT END-TO-END — VERIFIED`

`EVIDENCE INSUFFICIENT END-TO-END — VERIFIED`

`CONFLICT END-TO-END — BLOCKED BY POSITIVE-ONLY DESCRIPTIVE CLAIM CONTRACT`

`STALE REVIEW END-TO-END — VERIFIED`

`DESCRIPTIVE FACT → EVIDENCE CONTEXT — VERIFIED`

`DESCRIPTIVE FACT → TECHNICAL KNOWLEDGE — PROHIBITED`

`DESCRIPTIVE FACT → TECHNICAL READINESS — PROHIBITED`

`DESCRIPTIVE FACT → TECHNICAL MISSING RESOLUTION — PROHIBITED`

`REAL MEDIA — NOT IMPLEMENTED`

`PERSISTENCE — NOT IMPLEMENTED`

`VISION — NOT IMPLEMENTED`

`WHATSAPP — NOT IMPLEMENTED`

`OVERALL PRODUCT — NOT PRODUCTION READY`
