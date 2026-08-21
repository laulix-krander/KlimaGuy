# AP-15-05-03-03-03-03-00 — Persistent Correction, Invalidation and Supersession Authority Audit

## 1. Audit Metadata

| Feld | Wert |
|---|---|
| Audit-ID | `KG-AUDIT-2026-08-21-AP15-05-03-03-03-03-00-PERSISTENT-CORRECTION-INVALIDATION-SUPERSESSION-V1` |
| Datum | 2026-08-21 |
| Paket | AP-15-05-03-03-03-03-00 |
| Baseline | Git `26d5ca45d194ca29cee2402fff228737b2eeee4d` auf Ausgangsbranch `work` |
| Zielbranch | `codex/audit-ap15-05-03-03-03-03-correction-authority` |
| Art | Audit und Architekturentscheidung; keine Implementierung |
| Status | **READY FOR OWNER DECISION** |

Vollständig gelesen wurden die verbindlichen Audits zur persistenten Knowledge-State-/Reviewed-Claim-Apply-Baseline und zur Media-Deletion-Dependency-Authority samt ihren nachgelagerten Baseline Results. Maßgeblich war jeweils der aktuelle Code: Migrationen `202608210001` bis `202608210007`, Evidence-Interpretation/-Observation, Mapping, Proposal/Review, persistenter Apply-Service, pure Knowledge-State-/Transition-Domain, Planner Evidence Context, Tombstones und Projection.

## 2. Scope

Dieses Paket entscheidet ausschließlich die spätere Authority für Evidence-, Observation-, Proposal- und Knowledge-Claim-Korrektur, Invalidierung, Ersetzung und Rücknahme. Es plant Datenautorität, Rollen, CAS, Idempotenz, atomare Anwendung, Effective-Claim-Ableitung und Delete-Dependency. Ausgeschlossen sind Migration, SQL, RPC, RLS-Implementierung, Mutation, UI, Offer/Execution, Delete-Unlock, Planner-/Readiness-/Missing-Änderung, WhatsApp, Vision, AI, Tests und `package.json`.

## 3. Current Persistent Pipeline

Produktiv persistent ist: `project_media → project_evidence → evidence_interpretation_runs → evidence_observations → evidence_claim_proposals → evidence_claim_reviews → project_knowledge_states → project_knowledge_claims → project_knowledge_claim_evidence → project_knowledge_transition_applications`. Media Lifecycle, Eligibility, recoverbarer Ready-Delete, Evidence Tombstones und authoritative Dependency Projection mit Completeness/Drift sind vorhanden.

Aktuelle relevante Fakten:

- `project_evidence.binding_status` erlaubt `bound`, `unclassified`, `binding_ambiguous`, `invalidated`; der bestehende Insert-Contract erzwingt derzeit `bound`. Es gibt keine Invalidierungs-Authority.
- Observations haben `status ∈ {recorded, invalidated}`, `invalidated_at`, `revision` und `supersedes_observation_id`; es gibt jedoch weder Correction-Workflow noch RPC, Actor-/Cycle-Guard oder kaskadierende Proposal-/Claim-Folgeautorität. Ein eigener `superseded`-Status fehlt.
- Proposals haben `pending_review`, `approved_apply_pending`, `applied`, `rejected`, `insufficient_evidence`, `conflict`, `stale`, `superseded`. Der bestehende Review setzt die fachlichen Review-Terminals; keine Correction-Authority terminalisiert abhängige Proposals als `superseded`.
- Claims und Claim Evidence sind append-only. Persistenter Apply unterstützt derzeit nur das geprüfte positive deskriptive Apply; keine persistente Korrektur/Retraktion.
- Die pure Engine kennt `claim_supersession_proposed`. Jeder neue Claim muss Evidence besitzen; Supersession verlangt 1:1 neue Claims und `superseded_claim_ids`, gleiche Entity/Property und einen existierenden Zielclaim.
- `getEffectiveClaims` entfernt einen Claim, wenn irgendein Claim dessen ID in `supersedes_claim_id` referenziert, oder wenn die Evidence des Claims vollständig `superseded`/`invalidated` ist. Persistierte Claim-Evidence-Status werden aktuell nicht durch eine Correction Authority geändert.
- Pure Reviewer Protection verhindert Supersession eines Claims mit Reviewer-Evidence oder `manually_corrected`; der persistente descriptive Apply blockiert außerdem fremde effektive nicht-deskriptive Zustände. Eine privilegierte Korrektur-Capability existiert nicht.
- Projection V1 führt `correction`, `offer`, `execution` bewusst als Missing Authorities und bleibt für evidence-bound Delete fail-closed.

## 4. Correction Problem

Eine damals korrekt gespeicherte Aussage über den damaligen Review darf nicht umgeschrieben werden, obwohl ihre fachliche Gültigkeit später enden kann. Observation-Invalidierung allein reicht nicht: Ein bereits angewendeter Claim bliebe ohne Knowledge-Transition effektiv. Ein Gegenwert `false` wäre fachlich verboten. Benötigt wird daher eine menschlich autorisierte, append-only und stale-safe Authority, die Historie und Provenienz erhält, offene Vorstufen terminalisiert und den effektiven Knowledge State entweder durch Ersatz oder wertlose Retraktion verändert.

## 5. Terminology

- **Evidence Invalidation:** Ein Evidence Asset/Binding darf für definierte fachliche Verwendung nicht länger Grundlage sein; das ist weder physischer Delete noch Tombstone.
- **Observation Invalidation:** Eine konkrete Observation wird nach menschlicher Entscheidung nicht mehr fachlich gültig, bleibt aber historisch lesbar.
- **Observation Supersession:** Eine neue Observation ersetzt eine ältere mit expliziter Kante; beide bleiben erhalten.
- **Proposal Rejection:** Der damalige Review verweigert Apply. Das ist keine spätere Korrektur.
- **Proposal Supersession:** Eine noch nicht angewendete Proposal-Version wird wegen neuer Interpretation/Invalidierung terminal überholt; vorhandene Reviews bleiben unverändert.
- **Claim Correction:** Kontrollierter Workflow, der die Effektivität eines bereits angewendeten Claims ändert.
- **Claim Supersession:** Ein neuer, evidenzbelegter Claim ersetzt über `supersedes_claim_id` einen alten Claim derselben Entity/Property.
- **Claim Invalidation:** Kein direktes Flag am Claim. Fachlich ist dies eine **Retraktion**, dokumentiert durch Correction/Application und berücksichtigt in Effective Claims.
- **Reviewer Correction:** Explizit menschlich autorisierte Correction eines bestehenden Knowledge-Zustands; nicht Proposal Review und nicht AI-Selbstkorrektur.

## 6. Positive-only Boundary

Die fünf erlaubten Properties `room_overview_context_observed`, `indoor_installation_area_observed`, `outdoor_installation_area_observed`, `line_route_context_observed`, `wall_penetration_context_observed` sind ausschließlich `boolean=true`, `epistemic_status=observed`, `knowledge_strength=descriptive_fact`. `false` bleibt verboten. Ein `unknown`-Claim ist ebenfalls kein fachlicher Gegenwert: Er behauptet eine neue Aussage und würde den bestehenden positive-only Registry-/Apply-Contract verwässern. Ohne Ersatz wird der alte Claim **retracted und nicht mehr effective**; danach bedeutet Abwesenheit des Claims descriptive unknown.

## 7. Existing Supersession Architecture

Die pure Engine akzeptiert Supersession nur als `claim_supersession_proposed`. Sie prüft State-Version, neue Version `N+1`, eindeutige Claim-/Evidence-IDs, vollständige 1:1-Supersession, vorhandenes Ziel, gleiche Entity/Property und Reviewer Protection. `supersedeClaim` hängt einen neuen Claim mit `supersedes_claim_id` an. `getEffectiveClaims` bildet global die referenzierten alten IDs und filtert sie aus; zusätzlich muss mindestens eine Claim Evidence aktiv sein. Mehrere neue Claims können theoretisch denselben alten Claim referenzieren; DB-FK sichert Projekt/State, aber kein eindeutiger Successor-/Cycle-Guard ist als vollständige Authority vorhanden. Durch die erforderliche neue Claim-/Evidence-Payload kann der bestehende Mechanismus einen Claim **nicht ohne Ersatzwert** entfernen. Das ist die ausdrückliche Lücke.

## 8. Architecture Variants

| Variante | Audit/History | CAS/Replay | Delete/Queries | MVP/Boundary | Urteil |
|---|---|---|---|---|---|
| A Mutable Rows | verliert damalige Wahrheit und Provenienz | schwer nachvollziehbar | scheinbar einfach, semantisch falsch | umgeht Review | ablehnen |
| B Flag überall | Historie bleibt teilweise | Statuskombinationen explodieren | viele verstreute Filter | dupliziert Semantik | ablehnen |
| C Correction Records | sehr gut | gut mit Idempotency | zentrale Authority | allein ändert Effective State nicht | Baustein |
| D reine Supersession | gut bei echtem Ersatz | Engine-Reuse | gut querybar | kann wertlose Retraktion nicht ausdrücken | unvollständig |
| E Hybrid | vollständig append-only | klare CAS-/Replay-Grenze | zentrale Dependency plus kanonische Effective-Ableitung | moderate, begrenzte MVP-Komplexität | **empfohlen** |

E ist auch für spätere Quality Events und Laurie Workflow verständlich. Vision/WhatsApp dürfen Kandidaten/Provenienz zuliefern, erhalten aber keine Apply-Authority.

## 9. Recommendation

**Hybrid E:** Evidence Binding wird invalidiert und neu gebunden, Observations werden mit vorhandenen Feldern invalidiert oder durch neue Observation superseded, nicht angewendete Proposals werden terminal `superseded`, Claims bleiben unverändert append-only. Ein zentraler `project_knowledge_corrections`-Record hält Entscheidung und Application. Replace nutzt den bestehenden `claim_supersession_proposed`-Pfad. Retract nutzt einen neuen kontrollierten Transition Type ohne neuen Property Claim und eine append-only Retraction-Application, die `getEffectiveClaims` berücksichtigt. Keine zweite Claim Engine, kein falscher/unknown Ersatz, keine in-place Claimmutation.

## 10. Evidence Invalidation

Zulässige Gründe: falsches Projekt, Target/Bild/Binding, nicht verwertbar, doppelte Transportkopie oder invalidierte Provenienz. Admin muss Projektzugehörigkeit, aktuellen Binding-Status, Revision, Tombstone/Media-State und Folgeabhängigkeiten sperrend prüfen. `invalidated` beendet nur die fachliche Verwendbarkeit; Blob, Media Row, Evidence Row, Interpretation und Audit bleiben. Tombstone bedeutet dagegen, dass das Original physisch nicht mehr verifizierbar ist.

## 11. Evidence Binding Correction

Empfehlung B: alte `project_evidence`-Row invalidieren und eine neue immutable Binding-Row für das korrekte Target/Purpose anlegen; die neue Row referenziert später optional die alte über typed Correction-Provenienz. Target/Purpose niemals in place ändern. Bei `wrong_project` keine cross-project Verschiebung: altes Binding im alten Projekt invalidieren und nach Berechtigungs-/Media-Ownership-Prüfung eine neue zulässige Evidence im Zielprojekt erzeugen; IDs und historische Projektgrenze bleiben wahr.

## 12. Observation Invalidation

Bestehende Row bleibt bestehen; `status=invalidated`, `invalidated_at`, `revision+1` werden ausschließlich im Correction-Workflow gesetzt. Kanonische fachliche Zustände sind active (`recorded` und nicht durch Successor überholt), invalidated und superseded (abgeleitet durch eine gültige Successor-Kante; kein zweites Flag nötig). Keine Löschung, keine Änderung von Typ/Wert/Target.

## 13. Observation Supersession

Neue Observation verwendet das vorhandene `supersedes_observation_id`. Nur gleiche Projekt-/fachliche Scope-Familie, existierendes aktives Ziel, keine Self-Kante, höchstens ein aktiver direkter Successor und keine Verzweigung. Der Server traversiert die Kette unter Lock und verhindert Cycles; zusätzlich sollen FK/Unique-Constraints die lokale Form sichern. Eine neue Interpretation/Evidence darf die neue Observation tragen; die alte wird semantisch superseded, nicht gelöscht.

## 14. Observation Actor Boundary

MVP ausschließlich Admin via `canCorrectEvidenceObservation`; später Reviewer mit eigener Capability. Customer, AI und unprivilegierter Systemprozess dürfen nicht anwenden. AI darf nur eine neue Observation oder Correction Candidate liefern. `actor_class` des Correction Records bezeichnet den tatsächlichen menschlichen Autorisierer.

## 15. Proposal after Observation Invalidation

`pending_review` und `approved_apply_pending` werden in derselben Transaktion terminal `superseded`, Revision erhöht, mit Correction referenziert und sind danach weder review- noch applybar. `conflict`/`stale` können ebenfalls terminal superseded werden, falls noch offen geführt; `rejected`, `insufficient_evidence`, `applied` bleiben historische Terminals. Ein angewendetes Proposal wird nie zurückgeschrieben; sein Claim erfordert getrennte Correction.

## 16. Applied Claim after Observation Invalidation

Die Observation-Transaktion ermittelt abhängige angewendete Claims. Sie darf diese nicht still entwerten. Sie öffnet/bindet eine `claim_retracted`- oder `claim_superseded`-Correction; bis zur menschlich autorisierten atomaren Knowledge-Anwendung bleibt diese open und blockiert Delete. Im MVP kann Admin Observation und erforderliche Claim Correction als einen orchestrierten Workflow entscheiden, aber die Authorities und Audit-Ereignisse bleiben getrennt.

## 17. Positive-only Claim Correction

Kein `true vs false`. Replace erzeugt nur dann einen neuen zulässigen `true`-Claim, wenn dieser eine fachlich andere, aber dieselbe Entity/Property betreffende, gültige Erkenntnis mit eigener Evidence repräsentiert; für die fünf Flags ist ein gleicher `true`-Ersatz meist Provenienz-/Quality-Ersatz. Retract entfernt den alten Claim aus Effective Claims ohne neuen Wert. `invalidated_at` am Claim und synthetisches `unknown` werden abgelehnt.

## 18. Correction without Replacement

Empfehlung: `claim_retraction_proposed` als kontrollierter, claimloser State Transition mit exakt einer `retracted_claim_id`; persistente Correction Application ist der append-only Beleg. Effektive Ableitung erhält die Menge erfolgreich retracted Claim IDs und filtert sie zusätzlich zu superseded/inaktiver Evidence. Abwesenheit ist „kein aktiver Claim“; kein Wissen wird erfunden.

## 19. Claim Validity

Statusspalte am Claim wäre Mutation; bloße Supersession kann Retraktion nicht; bloße Evidence-Invalidierung vermischt Provenienz- und Claimentscheidung. Minimal sicher ist eine typed Correction/Application-Relation, deren ausschließlich erfolgreich angewendete Retraktionen Teil der kanonischen Effective-Claim-Ableitung sind. Kein separates generisches `project_knowledge_claim_invalidations` im MVP, sofern `project_knowledge_corrections` Zielclaim, Action, Terminalstatus und eindeutige Application vollständig trägt.

## 20. Reviewer Protection

Bestehender Schutz bleibt Default Deny. Admin darf normale AI-/Admin-Observation-Claims korrigieren. Ein reviewer-authored oder `manually_corrected` Claim erfordert **stärkere** `canCorrectReviewerProtectedKnowledgeClaim`-Capability; bloßes Admin-Sein reicht nicht. Später darf ein Reviewer nur mit dieser Capability erneut korrigieren, nicht allein aufgrund Autorenschaft. AI Candidate kann anzeigen, nie anwenden. Jede Override-Entscheidung wird explizit auditiert; keine stille Wiederverwendung des normalen Apply-Pfads.

## 21. Capability Model

Geplant: `canInvalidateEvidence`, `canCorrectEvidenceObservation`, `canCorrectKnowledgeClaim`, zusätzlich `canCorrectReviewerProtectedKnowledgeClaim`. Im MVP werden die ersten drei ausschließlich durch bestehende App-Rolle Admin erfüllt; die stärkere Capability ist owner-seitig explizit zu vergeben beziehungsweise zunächst nicht verfügbar. Später capability-basierter Reviewer, keine neue DB-Rolle. Customer hat keinen internen Read/Write-Zugriff.

## 22. Correction Record

`project_knowledge_corrections`: UUID `id`, `project_id`, geschlossener `correction_type`, genau ein typed Target (`evidence_id`, `observation_id`, `proposal_id` oder `claim_id`), `actor_id`, `actor_class`, `action`, `reason_code`, `status`, `expected_target_revision`, `expected_state_version`, eigene `revision`, opaque servergebundener `idempotency_key`, optional `replacement_*_id`/`transition_application_id`, `correction_rule_version`, `created_at`, `applied_at`/`resolved_at`. Check-Constraints erzwingen Ziel/action/status-Kombinationen. Keine Property, kein Value, kein Storage Locator, keine Conversation-ID-Erfindung und im MVP kein Freitext als Autorität.

## 23. Correction Types

Geschlossene V1-Allowlist: `evidence_invalidated`, `observation_invalidated`, `observation_superseded`, `proposal_superseded`, `claim_retracted`, `claim_superseded`. Proposal-Supersession kann als Folgeaktion derselben Correction entstehen, braucht aber einen eindeutig referenzierbaren typed Application-Eintrag. Keine freien Strings.

## 24. Correction Reasons

Geschlossene V1-Allowlist: `wrong_project`, `wrong_target`, `wrong_evidence_binding`, `observation_incorrect`, `interpretation_error`, `reviewer_correction`, `duplicate_evidence`, `superseded_by_better_evidence`, `provenance_invalidated`. Server validiert zulässige Reason/Type-Kombinationen. MVP ohne Freitext; spätere Notiz ist nicht-autoritativ, PII-bereinigt und separat geschützt.

## 25. CAS

Evidence/Observation/Proposal werden per Row Lock plus erwarteter `revision` und aktuellem Status geprüft. Claim Correction bindet `expected_state_version`, Zielclaim muss gerade effective sein, und Correction `revision/status` muss passen. Replace prüft neue Observation/Evidence-Revisions. Stale führt zu terminalem/erneut entscheidbarem `stale`-Result ohne State-Effekt; Client lädt neu und öffnet mit neuer Idempotency neu. Keine Anwendung auf stale State.

## 26. Atomicity

Claim Correction läuft in einer serverseitigen DB-Transaktion: Idempotency/Correction locken oder erzeugen; Projekt/Actor/Target/Evidence laden; aktuelle State-Version und Effektivität prüfen; Reviewer Protection prüfen; pure Transition deterministisch bauen/validieren; persistente State Apply mit CAS; Retraktion/Supersession wirksam machen; Correction terminalisieren; betroffene Dependency Projection dirty markieren; sanitisiertes Audit schreiben. Jeder Fehler rollt fachliche Mutation, Version, Dirty und Audit gemeinsam zurück; ein terminal failure event darf nur in einer separaten eindeutig idempotenten Failure-Aufzeichnung entstehen.

## 27. State Transition Reuse

Replace verwendet unverändert die Semantik von `claim_supersession_proposed` und die persistente Apply-Authority muss künftig diesen servererzeugten erlaubten Pfad unterstützen. Correction erzeugt keine freie Transition-Payload vom Client. Retraction wird als neuer kontrollierter Transition-Typ in derselben pure Engine modelliert; somit keine zweite Correction Claim Engine.

## 28. Retraction Transition

Empfehlung A plus notwendige Effective-Semantik: neuer Typ `claim_retraction_proposed`, keine Claim-/Evidence-Proposals, genau ein aktueller `retracted_claim_id`, Correction/Application-ID und Reason aus Allowlist. Anders als heutige no-change Transitions ist dies eine **State-Änderung** und erzeugt `N+1`. Die persistente Correction Application liefert die Retraction-Menge. Option C (separat berücksichtigen) ist die Persistenzdarstellung, aber ihre Anwendung bleibt durch die Engine autorisiert.

## 29. Knowledge Versioning

Replace und Retract ändern Effective Knowledge: `N → N+1`. Observation-/Evidence-/Proposal-only Correction ohne effektiven Claim-Effekt lässt Knowledge Version unverändert. Rejected, no-change und Replay: `N → N`. Eine Correction darf nicht mehrere Versionen für denselben atomaren fachlichen Effekt verbrauchen.

## 30. Idempotency

Server bindet einen opaken Schlüssel eindeutig an `(project_id, correction_type, target_id, action)` und speichert Request-Fingerprint/Rule-Version. Gleicher Schlüssel und gleicher Fingerprint liefert gespeichertes Ergebnis; anderer Fingerprint ist Conflict. Replay erzeugt weder zweite Correction noch Transition/Application, Version, Dirty-Mutation oder Audit. Unique Constraints sichern Correction-Key und Transition/Application-Key.

## 31. Review History Boundary

Proposal Reviews bleiben append-only: „damals approved/rejected“. Kein Review wird überschrieben oder rückdatiert. Correction dokumentiert separat „später korrigiert“ samt Actor, Grund, erwarteter Revision/Version und Result. Correction ist niemals ein weiteres Review derselben Row.

## 32. New Evidence Boundary

Neue/bessere Evidence darf Observation, Proposal oder Correction Candidate auslösen. Im MVP korrigiert sie keinen angewendeten Claim automatisch; ein Mensch entscheidet retract/replace/reject/no-change. Quality oder Aktualität gewinnt nie automatisch.

## 33. AI Boundary

AI darf Inkonsistenzen erkennen, neue typed Observations erzeugen und einen nicht-autorisierenden Candidate vorschlagen. AI darf keine Evidence/Observation/Proposal/Claim-Invalidierung anwenden, keinen reviewed Claim entwerten und Reviewer Protection nicht umgehen.

## 34. Correction Dependency

Künftig ist jeder Correction Source Record eine Projection-Quelle. `open`/`applying`/retryable-stale erzeugt `claim_correction` open; `applied`, `rejected`, `no_change` löst sie. Terminal `failed` ist nur resolved, wenn keine fachliche Entscheidung mehr offen ist; retryable failure bleibt open. Source-ID, Typ, Projekt, Media-/Evidence-Ableitung und Status müssen vollständig und drift-prüfbar sein.

## 35. Media Delete Boundary

Eine offene Correction blockiert Delete für jedes Originalmedium, das für Entscheidung/Provenienz benötigt wird. Correction und Delete Claim locken dieselbe Media-Lifecycle-/Projection-Grenze; weder Eligibility Snapshot noch Projection darf zwischen Prüfung und Apply veralten. Terminal resolved entfernt nur diese Dependency, niemals andere Authorities.

## 36. Tombstone Boundary

Nach Tombstone sind historische Observation-Invalidierung und Knowledge-Retraktion aufgrund bereits autorisierter Fakten oder anderer verfügbarer Evidence zulässig. Ein neuer Original-Review, neue Original-Observation oder Behauptung erneuter Bildprüfung ist verboten. Wo Originalprüfung erforderlich ist, endet/bleibt Correction mit `source_media_unavailable`; sie bleibt open, sofern weiterhin fachliche Entscheidung nötig ist. Tombstone/manifestierte Metadaten ersetzen keine Bildsichtung.

## 37. Offer / Execution Boundary

Keine Offer-/Execution-Authority wird entworfen oder implementiert. Beide bleiben Missing Authorities. Correction-Daten dürfen keine Offer-/Execution-Entscheidung vortäuschen.

## 38. Readiness

Die fünf deskriptiven Claims haben `technical_readiness_effect=none`. Retract/Replace ändert Technical Readiness nicht. Dieses Paket ändert weder Registry noch Readiness-Berechnung.

## 39. Missing Information

Deskriptive Correction löst oder erzeugt keine Technical Missing Information. Kein Missing-/Planner-Regelpaket wird geändert.

## 40. Planner Evidence Context

Planner Evidence Context muss später ausschließlich aus kanonisch effective Claims abgeleitet werden. Nach Retraktion darf etwa `outdoor_installation_area_observed` nicht mehr als vorhanden erscheinen; nach gültigem Replace erscheint nur der Successor. Das ist eine Folge der Effective-Ableitung, keine neue Plannerregel. Readiness und Technical Missing bleiben unverändert.

## 41. Quality Metrics Boundary

Die Authority ermöglicht später messbare, einzeln definierte Ereignisse: approved-then-corrected, Observation invalidated, Claim retracted, Reviewer disagreement, AI Observation corrected. Keine pauschale „AI Accuracy“, keine Metrik und kein Scoring in diesem Paket.

## 42. Laurie Workflow

Später zeigt ein gemeinsamer Workspace Evidence, Observation, Proposal/Review, effective/historical Claim und Correction-Verlauf. Fachliche Aktionen heißen „Beobachtung korrigieren“, „Claim zurückziehen“, „Durch neue Erkenntnis ersetzen“. UI verbirgt technische IDs/Status im Normalfall, zeigt Konsequenzen und verlangt explizite Bestätigung; dieses Paket baut keine UI.

## 43. Historical Chats

Importiertes historisches Knowledge verwendet dieselbe project-scoped Correction Authority und dieselbe Reviewer Protection/Effective-Ableitung. Keine Legacy Correction Engine und keine Importimplementierung.

## 44. Conversation Provenance

Spätere additive, nullable und validierte Conversation-/Message-Referenzen dürfen eine neue Customer Message, neues Foto oder Laurie Review belegen. Knowledge bleibt project-scoped. Keine Pflichtreferenz, keine Fake Conversation-/Message-ID und keine freie Payload als Autorität.

## 45. Retraction Architecture

| Variante | Append-only/Engine | Query/Replay | Planner/Audit | Empfehlung |
|---|---|---|---|---|
| A Claim `invalidated_at` | mutiert Claim, umgeht Engine | einfach, aber Race-anfällig | Audit verteilt | ablehnen |
| B `claim_invalidations` | append-only | querybar | zweite unspezifische Authority | nur falls Correction-Tabelle unzureichend |
| C Supersession zu unknown | formal append-only | Engine-Reuse | erfindet Semantik | verbieten |
| D Supersession ohne Replacement | heutiges Modell kann das nicht | Sonderkante | begrifflich irreführend | ablehnen |
| E Correction Application + Effective Derivation | append-only, Engine autorisiert | CAS/idempotent und klar | entfernt Planner Context, bestes Audit | **empfohlen** |

E benötigt eine kleine Migration und Engine-/Effective-Erweiterung im Folgepaket, wahrt aber pure Engine, Reviewer-Schutz und Replay besser als Claimmutation.

## 46. Database Strategy

Minimal eine zentrale Tabelle `project_knowledge_corrections` plus Constraints/Indizes und Relation zur bestehenden Transition Application. Kein separates `project_knowledge_claim_invalidations`, solange terminal angewendete `claim_retracted`-Corrections eindeutig und performant als Retraction-Set abfragbar sind. Evidence-/Observation-/Proposal-Status bleiben in ihren bestehenden Tabellen und werden nur durch die Authority kontrolliert verändert. Projection Source Integrity referenziert Correction-ID statt Audit-Log.

## 47. Observation Persistence Reuse

Vorhanden sind `status(recorded|invalidated)`, `invalidated_at`, `revision`, `supersedes_observation_id`. Damit ist keine Paralleltabelle nötig. Folgepaket ergänzt Authority, Constraints für projekt-/scope-korrekte Kanten, Unique-Successor/Cycle-Guards und kanonische Active-Ableitung; ein physisches `superseded`-Statusfeld ist nicht nötig.

## 48. Evidence Persistence Reuse

`binding_status=invalidated` ist bereits vorgesehen, aber bestehende Classified-Binding-Checks und RPCs sind auf `bound` zugeschnitten. Folgepaket muss kontrollierte Invalidierung samt Revision/CAS, immutable Neubinding und abhängige Folgen ergänzen. Kein Target/Purpose-Update in place.

## 49. Proposal Supersession

`superseded` existiert bereits, wird derzeit aber nicht durch eine Correction Authority gesetzt. Künftig terminalisiert der serverseitige Workflow pending/apply-pending Proposal bei ungültiger/überholter Observation atomar, erhöht Revision und referenziert die Correction. Nur Admin-Capability; AI/Client darf Status nicht direkt setzen. Applied Proposal bleibt `applied`; dessen Claim wird separat korrigiert.

## 50. Persistent Correction Flow

1. Admin erkennt falschen descriptive Claim und startet mit Idempotency-Key.
2. Server erzeugt/lockt Correction `open`.
3. Zielclaim, Claim Evidence, Observation, Evidence/Media und State werden geladen/gelockt.
4. Expected State/Target/Correction Revision wird geprüft.
5. Current Effectiveness und Reviewer Protection werden geprüft.
6. Admin wählt servererlaubt `retract` oder `replace`.
7. Pure Engine validiert Retraction oder bestehende Supersession.
8. Persistent Apply schreibt mit State CAS atomar `N+1`.
9. Correction wird `applied` (oder kontrolliert terminal/no-change/rejected).
10. Betroffene Projection wird dirty.
11. Sanitisiertes Audit wird einmal geschrieben.
12. Planner Evidence Context ist aus dem korrigierten Effective State neu ableitbar.

## 51. Replace Flow

Neue gültige Evidence → neue Observation → menschlich freigegebenes Proposal → servererzeugter neuer Claim. Dieser referenziert `supersedes_claim_id`, stimmt in Projekt/Entity/Property überein, trägt eigene aktive Evidence und geht über `claim_supersession_proposed`. Alter und neuer Claim sowie Reviews bleiben historisch. Kein in-place Update.

## 52. Retract Flow

Ohne belastbaren Ersatz autorisiert Admin `claim_retracted`. Der neue claimlose Transition-Typ bindet aktuellen Claim/State, Reviewer-Schutz und Correction-ID; erfolgreiche Application erhöht State-Version und macht Zielclaim über die Correction-Retraction-Menge ineffective. Kein `false`, kein `unknown`, kein leerer Fake Claim.

## 53. Conflict Flow

Widersprüchliche neue Evidence öffnet Human Review/Correction und blockiert gegebenenfalls Delete. Es gibt weder automatische Supersession noch „höhere Quality gewinnt“. Reviewer kann nach Prüfung replace, retract, reject oder no-change wählen; bis dahin bleibt bestehender effective State sichtbar, ergänzt um klaren offenen Konflikt/Correction-Kontext.

## 54. Failure Matrix

Abkürzungen: **KV** Knowledge-Version, **Dep** Correction Dependency.

| Fall | Persistente Authority | State-Mutation / KV | Dep / Retry / Review / Audit |
|---|---|---|---|
| A pending Proposal, Observation invalidiert | Observation Correction + Proposal-Folgeapplication | Observation invalidated, Proposal superseded; KV gleich | resolved nach atomarem Apply; kein Retry außer stale; Admin; beide Events |
| B approved_apply_pending invalidiert | wie A, Apply sperren | Proposal superseded; KV gleich | resolved; stale neu laden; Admin; invalidation/supersession |
| C applied Claim, Observation invalidiert | Observation + Claim Correction | Observation invalidated, Claim retract/replace; KV N+1 | open bis Claim-Apply; Admin; getrennte Events |
| D applied Claim Evidence invalidiert | Evidence + Claim Correction | Evidence invalidated; Claim nicht automatisch, dann N+1 | open; Human Decision; provenance + claim event |
| E Claim ohne Ersatz | `claim_retracted` | Effective entfernt; N+1 | resolved; CAS retry via reload; protected check; retracted |
| F Claim durch neue Observation ersetzt | Observation Supersession + `claim_superseded` | neuer Claim; N+1 | resolved; stale reload; Human Review; superseded |
| G reviewer-protected Claim | Correction Record | zunächst keine; KV gleich | open/rejected; stärkere Capability; override/rejection Audit |
| H zwei Correction Tabs | Idempotency + State/Correction CAS | genau eine N+1 | loser stale/no-change; reload; einmaliger Audit |
| I Correction vs Apply | State/Proposal/Claim locks + CAS | genau eine Reihenfolge; max. ein Effekt/Version je Operation | loser stale; Admin; beide Outcomes auditierbar |
| J Correction vs Delete | Correction Source + Lifecycle/Projection lock | kein Knowledge-Verlust | open blockiert Delete; Retry nach rebuild; Audit |
| K Correction vs neue Observation | Observation revision/successor uniqueness | keine stille Ersetzung; KV nur bei Claim-Effekt | loser stale; Human entscheidet; Audit |
| L stale State-Version | Correction CAS | keine; KV N | open/retryable oder terminal stale nach Contract; reload; failed/stale |
| M Replay nach Timeout | gespeicherte Idempotency | gespeichertes Result; KV unverändert | gleicher Status; sicherer Replay; kein zweites Audit |
| N Original vorher tombstoned | Tombstone + Correction | nur historische Invalidation/Retract via andere Authority; KV ggf. N+1 | `source_media_unavailable` wenn Review nötig; Human; failed event |
| O Target Binding falsch | Evidence invalidation + neue Binding Row | abhängige Proposals terminal; Claim ggf. N+1 | open bis Folgen geklärt; Admin; binding/invalidation Audit |
| P Evidence dupliziert | Evidence invalidation | Duplicate invalidated, Claims nur nach Human Decision; KV ggf. gleich | resolved wenn keine Claimfolge; reason `duplicate_evidence`; Audit |
| Q Correction rejected | Correction | keine; KV N | resolved; kein Retry gleicher Request; Human; rejected |
| R Correction no-change | Correction | keine; KV N | resolved; Replay stabil; Human; no-change einmal auditieren |

## 55. Race Conditions

| Race | Ordnung / erwartetes Ergebnis |
|---|---|
| Apply vs Correction | Proposal, State und Claim sperren; Commit-Reihenfolge entscheidet, loser erhält stale und lädt neu. |
| Correction vs Delete Claim | gemeinsamer Media-/Projection-Lock; open Correction vor Delete Snapshot, Delete vor Correction verhindert Original-Review. |
| Correction vs Observation Invalidation | Observation Revision + Correction Target Lock; genau eine gültige Folge, zweite idempotent/stale. |
| Correction vs new Review | Proposal Revision/Status locken; invalidated Observation kann nie neu approved/applyable werden. |
| zwei Corrections gleicher Claim | current-effectiveness + State CAS + maximal eine open Correction pro Target/Action-Familie. |
| Correction vs Reviewer Correction | stärkere Capability und gleicher CAS; keine Priorität allein durch Actor-Label. |
| Correction vs Evidence Tombstone | Evidence/Media Lifecycle locken; Tombstone gewinnt → kein Original-Review, Correction gewinnt → Delete blockiert bis terminal. |
| Correction vs Projection Rebuild | Source-Commit markiert dirty in derselben Transaktion; Rebuild liest konsistent und versioniert, Drift bleibt fail-closed. |

## 56. Reviewer Protection Matrix

| Source Claim/Evidence | Admin Correction | Reviewer Correction (später) | AI Candidate |
|---|---|---|---|
| AI Observation / active AI Evidence | mit normaler Correction-Capability zulässig | mit Capability zulässig | Kandidat, nie Apply |
| Admin Observation / project_media | mit normaler Capability zulässig | mit Capability zulässig | Kandidat, nie Apply |
| Customer/System Claim | nur sofern Property-Contract Correction erlaubt; Human Review | ebenso capability-basiert | Kandidat, nie Apply |
| Reviewer Evidence oder `manually_corrected` | **deny** ohne stärkere Override-Capability | **deny** ohne stärkere Override-Capability, auch eigener Claim | Hinweis erlaubt, nie Apply |
| bereits reviewer-korrigierter Claim | gleiche starke Protection bei jeder weiteren Korrektur | gleiche starke Protection | Kandidat, nie Apply |

## 57. Audit Events

V1 plant `evidence_invalidated`, `observation_invalidated`, `observation_superseded`, `knowledge_correction_opened`, `knowledge_claim_retracted`, `knowledge_claim_superseded`, `knowledge_correction_rejected`, `knowledge_correction_failed`. Payload nur Actor-ID/-Class, Project-/Target-/Correction-/Transition-ID, Reason/Result, Revision/State-Version und Timestamp. Keine PII, Raw Image Data, Storage Locator, freie fachliche Payload oder Raw AI-Ausgabe.

## 58. RLS / Permissions

Folgepaket: RLS auf Correction-Tabelle, authenticated Admin read über aktives Projekt; keine direkten Inserts/Updates/Deletes, ausschließlich Security-Definer-RPC mit `auth.uid`, App-Rolle und Capability-Prüfung. MVP Admin-only. Reviewer später capability-basiert, AI no apply, Customer kein interner Zugriff. Keine neue DB-Rolle und kein Service-Role-Key im Client.

## 59. Delete Gate Result

Nach implementierter und in Projection integrierter Authority kann **nur** `correction` aus `missing_authority_types` verschwinden. `offer` und `execution` bleiben missing. Deshalb bleibt evidence-bound Delete auch dann fail-closed, bis diese Authorities und Final Gate Integration vollständig sind. Dieses Audit ändert weder Projection noch Gate.

## 60. Minimal Implementation Package

Empfohlen: **AP-15-05-03-03-03-03-01 — Persistent Correction / Invalidation Baseline** mit Correction Authority, Evidence-/Observation-Invalidierung soweit für Authority nötig, Observation-/Proposal-Supersession, Claim-Retraction, Claim-Replacement via bestehender Supersession, CAS, Idempotency, Reviewer Protection, Projection Integration und Tests. Keine UI.

## 61. Follow-up Packages

1. AP-15-05-03-03-03-03-01 Correction Authority Baseline.
2. AP-15-05-03-03-03-04-00 Offer / Execution Authority Audit.
3. Implementierung der daraus freigegebenen minimalen Offer-/Execution-Authority.
4. Final Evidence-bound Delete Gate Integration.
5. Lifecycle/Admin UI einschließlich Laurie Workflow.
6. WhatsApp Media Ingestion Audit.
7. Vision Adapter Audit.

## 62. Owner Decisions

Status aller Punkte: **OPEN — READY FOR OWNER DECISION**.

| # | Entscheidung / Varianten | Empfehlung | Hauptrisiko | Status |
|---:|---|---|---|---|
| 1 | A–E Correction-Architektur | Hybrid E | mehrere Authorities inkonsistent orchestriert | OPEN |
| 2 | Evidence flag/relation/delete | bestehendes Binding invalidieren, Correction belegt | Status ohne Folgen | OPEN |
| 3 | Observation mutate/delete/status | vorhandene Invalidierung mit CAS | unkontrollierte Direktmutation | OPEN |
| 4 | Observation Feld/Relation | vorhandenes `supersedes_observation_id`, harte Guards | Cycle/Verzweigung | OPEN |
| 5 | Proposal reject/stale/superseded | offene abhängige Proposals `superseded` | Apply-Race | OPEN |
| 6 | Claim mutate/supersede/retract | append-only Replace oder Retraction | zweite Engine | OPEN |
| 7 | Retract ohne Ersatz | claimlose Retraction Application | Effective Query Drift | OPEN |
| 8 | Claim status/Invalidation Record | keine Statusmutation; typed Correction | Query-Komplexität | OPEN |
| 9 | neuer Transition Type | `claim_retraction_proposed` | Schema-/Apply-Erweiterung | OPEN |
| 10 | `getEffectiveClaims` | Retraction-Set berücksichtigen | Planner sieht Altclaim | OPEN |
| 11 | positive-only false | bleibt strikt verboten | Fake-Widerspruch | OPEN |
| 12 | unknown replacement | nicht für Correction; Abwesenheit = unknown | Semantikvermischung | OPEN |
| 13 | MVP Actor | Admin-only | zu breite Admin-Override-Rechte | OPEN |
| 14 | Reviewer später | separate Capabilities | Rollenexplosion | OPEN |
| 15 | Reviewer Protection | starke Override-Capability, default deny | stille Umgehung | OPEN |
| 16 | Idempotency | opaque key + gebundener Fingerprint | Key-Reuse | OPEN |
| 17 | State CAS | Expected State Version + current effective | Lost Update | OPEN |
| 18 | Correction Revision | eigene positive Revision + Target Revision | stale Workflow | OPEN |
| 19 | tombstoned Source | historische Retract möglich, Original-Review verboten | vorgetäuschte Sichtung | OPEN |
| 20 | open Correction/Delete | open blockiert benötigte Medien | fälschlicher Delete | OPEN |
| 21 | applied Correction/Dependency | applied/rejected/no-change resolved; dirty | vorzeitiges Resolve | OPEN |
| 22 | Binding Correction | invalidate + neue Row | Provenienzverlust | OPEN |
| 23 | wrong project | keine Verschiebung; getrennte neue Evidence | Cross-project Leak | OPEN |
| 24 | Audit Events | geschlossene sanitisierten V1 Events | PII/Locator Leak | OPEN |
| 25 | Reason Codes | geschlossene V1-Allowlist | freie Semantik | OPEN |
| 26 | Freitext | MVP keiner als Authority | PII/uneinheitliche Gründe | OPEN |
| 27 | Planner Context | nur corrected Effective Claims | stale Context | OPEN |
| 28 | Readiness | unverändert | Scope Creep | OPEN |
| 29 | Missing | unverändert | technische Semantik verfälscht | OPEN |
| 30 | Quality | erst spätere definierte Events/Metriken | pauschale AI Accuracy | OPEN |
| 31 | Laurie Records | dieselben Authority Records | UI-Schattenzustand | OPEN |
| 32 | nächstes Paket | AP-15-05-03-03-03-03-01 Minimalumfang | zu großer MVP | OPEN |

## 63. Future Tests

Folgepaket muss Domain-, Migration-/RPC- und Projection-Tests planen für Evidence Invalidation; Observation Invalidation/Supersession und Cycle/Branch; Proposal Supersession; Claim Retract/Replace; `N+1` versus no-change; stale CAS; Replay/Fingerprint; two-tab race; Reviewer Protection und Override; Apply/Delete/Tombstone-Races; `source_media_unavailable`; Projection dirty/rebuild/drift; Planner Evidence Context removal; unveränderte Readiness/Missing; Verbot von false/unknown descriptive Correction; keine direkte Client-Mutation; keine PII/Locator-Payload.

## 64. Production Gates

- [ ] Keine in-place Claimmutation; vollständig append-only History.
- [ ] Kein `false` und kein künstliches `unknown` als positive-only Correction.
- [ ] Stale Correction wird ohne State-Effekt abgelehnt.
- [ ] Reviewer-protected Claim ist default-deny und Override explizit.
- [ ] Correction ist persistent idempotent; Replay erzeugt nichts doppelt.
- [ ] Correction und Knowledge-State CAS sind atomar; effektiver Effekt ist `N+1`.
- [ ] Open Correction blockiert Delete; resolved wird ausschließlich aus integrer Source projiziert.
- [ ] Applied Correction markiert Projection in derselben Transaktion dirty.
- [ ] Planner Context verwendet ausschließlich corrected Effective State.
- [ ] Keine Original-Media-Neusichtung nach Tombstone.
- [ ] Keine AI-Selbstkorrektur reviewed Claims.
- [ ] Keine freie Property/Value/Reason-Payload vom Client.
- [ ] Keine Storage Locator, PII oder Raw Image/AI Data in Correction/Audit.
- [ ] Offer und Execution vollständig, bevor evidence-bound Delete freigegeben wird.

## 65. Scope Confirmation

Dieses Ergebnis ist **ausschließlich Audit und Dokumentation**. Es implementiert keine Correction, Invalidierung oder Supersessionänderung; erzeugt keine false descriptive Claims; ändert weder Migration/DB/SQL/RPC/RLS noch Claim/State Transition/Projection/Delete/Offer/Planner/Readiness/Missing; baut keine UI, WhatsApp-, Vision- oder AI-Funktion; führt keine Anwendungstests aus und ändert `package.json` nicht.

## 66. Status

**Auditstatus: READY FOR OWNER DECISION**

- **PERSISTENT KNOWLEDGE STATE AUTHORITY — IMPLEMENTED**
- **PERSISTENT REVIEWED DESCRIPTIVE CLAIM APPLY — IMPLEMENTED**
- **AUTHORITATIVE MEDIA DEPENDENCY PROJECTION — IMPLEMENTED**
- **PERSISTENT CORRECTION AUTHORITY — NOT IMPLEMENTED**
- **PERSISTENT EVIDENCE INVALIDATION AUTHORITY — NOT IMPLEMENTED**
- **PERSISTENT OBSERVATION INVALIDATION AUTHORITY — NOT IMPLEMENTED**
- **PERSISTENT CLAIM RETRACTION — NOT IMPLEMENTED**
- **PERSISTENT CLAIM CORRECTION / SUPERSESSION — NOT IMPLEMENTED**
- **POSITIVE-ONLY FALSE CLAIMS — PROHIBITED**
- **OFFER AUTHORITY — NOT COMPLETE**
- **EXECUTION AUTHORITY — NOT COMPLETE**
- **EVIDENCE-BOUND DELETE — STILL FAIL-CLOSED**
- **WHATSAPP — NOT IMPLEMENTED**
- **VISION — NOT IMPLEMENTED**
- **OVERALL PRODUCT — NOT PRODUCTION READY**
