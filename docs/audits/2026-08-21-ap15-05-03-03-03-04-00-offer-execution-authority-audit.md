# AP-15-05-03-03-03-04-00 — Offer and Execution Authority Audit

## 1. Audit Metadata

- **Audit-ID:** `KG-AUDIT-2026-08-21-AP15-05-03-03-03-04-00-OFFER-EXECUTION-AUTHORITY-V1`
- **Datum:** 2026-08-21
- **Baseline:** `78ee6be048f8caae210e2f341a7719f127bfa9be`
- **Branch:** `codex/audit-ap15-05-03-03-03-04-offer-execution-authority`
- **Paket:** ausschließlich Audit/Architektur, keine Implementierung
- **Status:** **READY FOR OWNER DECISION**

## 2. Scope

Geprüft wurden der vollständige verbindliche Dependency-Authority-Audit einschließlich seiner Resultabschnitte, alle produktiven Migrationen, Projekt-Domainmodell, Schemas, Mapper, Permissions, Status-Service/-Action/-UI, Lifecycle-/Delete-Gates, Audit-Log und repositoryweite Treffer für Offer/Quote/Proposal/Price/Acceptance/Rejection/Expiry sowie Installation/Appointment/Job/Execution/Completion. Maßgeblich ist der aktuelle Code, nicht frühere Plansemantik.

Nicht Bestandteil sind Migration, SQL, RPC, RLS, Tabellen, Statusänderung, Projection-/Delete-/Lifecycleänderung, Retentionkonfiguration, UI, WhatsApp, Vision, AI, Tests oder `package.json`.

## 3. Current Persistent Pipeline

Produktiv persistent vorhanden sind `project_media`, `project_evidence`, Interpretation Runs, Observations, Claim Proposals und Reviews, project-scoped Knowledge State, Claims, Claim-Evidence, Transition Applications, Correction/Invalidation/Supersession, die abgeleitete Media Dependency Projection, Lifecycle/Eligibility, recoverable Ready-Media Delete und Evidence Tombstones. Die aktuelle Projection unterstützt Interpretation, Observation, Proposal Review, Claim Apply und Correction; ihre geschlossene Missing-Authority-Allowlist ist exakt `offer`, `execution`. Ein als `complete` bezeichneter Rebuild ist nur hinsichtlich unterstützter Quellen vollständig und meldet diese beiden Lücken weiterhin ausdrücklich. Evidence-bound Delete bleibt pauschal fail-closed.

## 4. Current Project State Model

Die einzige persistente grobe Workflowautorität ist `projects.status`, DB-Enum, TypeScript-Konstante und Zod-Enum mit exakt:

| Status | DB-persistent / fachliche aktuelle Bedeutung | Setter | erlaubte Service-/UI-Transitionen | CAS/Version | terminal / Reopen |
|---|---|---|---|---|---|
| `new` | ja; neue Projektakte | bei Create `new`, danach Admin oder Reviewer | `collecting_information`, `rejected`, `closed` | Statusvergleich, keine Revision | nein |
| `collecting_information` | ja; Informationssammlung | Admin oder Reviewer | `technical_review`, `rejected`, `closed` | wie oben | nein |
| `technical_review` | ja; technische Prüfung | Admin oder Reviewer | `collecting_information`, `quote_draft`, `human_review`, `rejected`, `closed` | wie oben | nein |
| `quote_draft` | ja; grobe Kennzeichnung Angebotsentwurf, kein Artefaktbeweis | Admin oder Reviewer | `technical_review`, `human_review`, `quote_sent`, `rejected`, `closed` | wie oben | nein |
| `human_review` | ja; menschliche Prüfung | Admin oder Reviewer | `technical_review`, `quote_draft`, `quote_sent`, `rejected`, `closed` | wie oben | nein |
| `quote_sent` | ja; manuell gesetzte grobe Behauptung „Angebot versendet“ | Admin oder Reviewer | `accepted`, `rejected`, `closed` | wie oben | nein; kein Rückweg zu Draft |
| `accepted` | ja; manuell gesetzte Annahmebehauptung, praktisch Beginn des Auftrags statt Ende des Gesamtprozesses | Admin oder Reviewer | `closed` | wie oben | nicht terminal im Projektprozess; kein Rückweg |
| `rejected` | ja; manuell gesetzte Ablehnungbehauptung | Admin oder Reviewer | `closed` | wie oben | fachlich no-order-nah, technisch nicht terminal |
| `closed` | ja; unspezifisch „abgeschlossen“ | Admin oder Reviewer | keine | wie oben | terminal; Reopen nicht erlaubt |

Der Server-Service lädt den aktuellen Status, validiert die TypeScript-Matrix und aktualisiert mit `WHERE status = currentStatus`; das ist ein enger Compare-and-swap auf den Statuswert, aber keine monotone Projectrevision. Die UI zeigt dieselbe Matrix. Die DB erzwingt nur die Enum-Allowlist, nicht die Transitionmatrix. RLS/Reviewer-Trigger lassen Reviewer den Status ändern; deshalb kann ein zulässiger direkter DB-Updatepfad die reine Service-Matrix umgehen. Statuswechsel erzeugen aktuell kein fachliches Audit-Event. `closed` vermischt No-order, allgemeines Beenden und potenziell ausgeführte Installation.

## 5. Current Offer Architecture

Es gibt keine eigenständige persistente Offer-/Quote-Entity, kein generiertes Angebotsdokument, keine Angebotspositionen/-preise, Version, Revision, Current-Offer-Zeiger, Supersession, Artifact-Persistenz, Versandproviderbestätigung oder Offer-Audit-History. `quote_draft`, `quote_sent`, `accepted` und `rejected` sind ausschließlich Werte von `projects.status`. Die Architektur-Dokumentation nennt Pricing Engine und Quote Generator nur als geplant; der README schließt Angebotskalkulation und PDF-Erstellung aus. Treffer „proposal“ gehören zur Evidence-Claim-Pipeline und sind keine Kundenangebote.

## 6. Terminology

- **Offer Draft:** interne Vorbereitung; noch kein erfolgreich persistiertes konkretes Angebotsartefakt.
- **Offer Created:** ein konkretes, unveränderlich identifizierbares Angebotsartefakt/eine Revision wurde erfolgreich persistent erzeugt.
- **Offer Sent:** dieses konkrete Angebot wurde nach bestätigtem Delivery-/Send-Erfolg übermittelt; Send-Intent genügt nicht.
- **Offer Open:** eine erstellte/versandte aktuelle Revision ist weder angenommen noch abgelehnt, abgelaufen oder superseded.
- **Offer Accepted:** verifizierte Annahme einer bestimmten aktuellen Offer-Revision.
- **Offer Rejected:** verifizierte Ablehnung einer bestimmten Offer-Revision.
- **Offer Expired:** expliziter terminaler Ablauf einer Offer-Revision, nur falls das Produkt später Ablaufsemantik besitzt.
- **Execution:** Vorbereitung/Durchführung der Leistung oder Montage nach Annahme.
- **Execution Active:** `not_started` oder `active`; Media kann noch erforderlich sein.
- **Execution Completed:** Admin-bestätigter fachlicher Abschluss der Leistung, nicht bloß Project-Closure.

## 7. Offer Created Proof

Heute beweist kein persistenter Zustand `offer_created`. Insbesondere beweisen weder geöffnete UI noch `quote_draft`, `quote_sent`, Zeitstempel, Projectstatus, Dateiname oder manuelle Annahme die erfolgreiche Erzeugung eines konkreten Artefakts. Künftig ist der kleinste akzeptable Beweis eine erfolgreich persistierte `project_offers`-Revision im Status `created` oder später, mit stabiler Artifact-Referenz/Integritätsnachweis aus demselben kontrollierten Erzeugungsvorgang. Ohne Artifact-Persistenz darf eine Transition nicht `created` setzen.

## 8. Offer Artifact Authority

Aktuell existiert kein Offer Row, Quote Row oder Generated Document. Empfohlen wird kein Angebotsengine-Neubau, sondern ein minimaler Lifecycle-Record, der eine konkrete Artefaktidentität referenziert. Ob das Artefakt als private Storage-Datei oder bestehender zukünftiger Document-Record persistiert wird, ist im Implementierungsaudit festzulegen. Der Offer-Record darf `created` erst atomar nach nachweislich erfolgreicher Artifact-Persistenz erreichen; bloßer Storage-Pfad ohne Existenz-/Integritätsbindung reicht nicht.

## 9. Offer Versioning

Heute gibt es keine Versionierung, Supersession, „current offer“-Regel oder Media-Zuordnung. Künftig benötigt jedes Projekt fortlaufende, DB-eindeutige Versionen; genau eine nicht-terminale aktuelle Revision; `supersedes_offer_id` muss projektgleich auf die Vorgängerrevision zeigen. Eine Änderung mutiert kein versandtes Angebot in-place, sondern erzeugt eine neue Revision und setzt den Vorgänger kontrolliert auf `superseded`. Fake-Historie aus Projectstatus ist verboten.

## 10. Offer Sent Authority

`quote_sent` ist nicht vertrauenswürdig als Zustellbeweis: Es wird durch das allgemeine Select und dieselbe Status-Action manuell von Admin oder Reviewer gesetzt; weder konkretes Angebot noch Send-Intent, Provider, Send-Erfolg oder Delivery-ID werden persistiert. Künftig sind `intent_to_send` und `sent` zu trennen: Ein kontrollierter Send-Versuch darf erst nach Erfolg die konkrete Offer-Revision auf `sent` setzen. Manuelle externe Versandbestätigung wäre nur eine ausdrücklich modellierte, admin-only Bestätigung mit Kanal/Reason Code, nicht der heutige Projectstatus.

## 11. Accepted Authority

`accepted` wird heute ausschließlich als allgemeiner Projectstatus durch Admin oder Reviewer gesetzt; es gibt keine Customer Action, externe Bestätigung oder Bindung an eine Offer-Revision. Es ist daher keine belastbare Offer-Acceptance-Authority. Fachlich ist Acceptance terminal für den Offerprozess, aber eröffnet den Executionprozess; sie ist niemals Delete-Sicherheit.

## 12. Rejected / Closed

`rejected` ist eine manuelle Projektbehauptung ohne konkrete Offerbindung. `closed` besitzt nur das Label „Abgeschlossen“ und unterscheidet weder Angebot abgelehnt/no order, administrativ beendet, Auftrag storniert noch Installation abgeschlossen. `closed` allein reicht weder für Offer- noch Execution- oder Retention-Authority.

## 13. Reopen

Die tatsächliche Service-/UI-Matrix erlaubt weder `closed -> *`, `accepted -> zurück` noch `quote_sent -> quote_draft`; `accepted -> closed`, `rejected -> closed` sind erlaubt. Die DB besitzt jedoch keinen Transition-Constraint/RPC und normale authentifizierte Rollen haben Updatepfade, sodass die Matrix nicht die alleinige DB-Wahrheit ist. Künftig darf Reopen nur als kontrollierte fachliche Action erfolgen: neue Offer-Revision/Dependencies öffnen, Project koordinieren, Projection dirty markieren und auditieren. Bis dahin bleibt Reopen unsupported; jede erkannte Inkonsistenz fail-closed.

## 14. Offer Architecture Variants

| Variante | Wahrheit/Versionierung/Audit | Race/Kommunikation/Retention | MVP-Komplexität | Urteil |
|---|---|---|---|---|
| A Projectstatus allein | keine Artefakt- oder Revisionswahrheit | hohe Race- und False-Safe-Gefahr | klein | verwerfen |
| B Offer-Felder auf Project | ein Snapshot, schlechte Mehrrevisionen | schnell überladen; Historie schwach | klein-mittel | verwerfen |
| C `project_offers` | konkrete Revisionen und FKs | gute Send-/Acceptance-/Retention-Bindung | mittel | tragfähiger Kern |
| D nur Events | gute History, Current State/Constraints/Rebuild komplex | Eventreihenfolge und Projection anspruchsvoll | hoch | für MVP verwerfen |
| E Hybrid | Project = Grobworkflow, Offer Row = konkrete Wahrheit | atomar koordinierbar, WhatsApp-fähig, erklärbar | mittel | **empfohlen** |

## 15. Recommended Offer Architecture

Empfohlen ist E: `projects.status` bleibt grobe, abgeleitete/koordinierte Prozessanzeige; eine minimale `project_offers`-Authority beweist Artefakt und Lifecycle je Revision. Statusänderungen laufen nicht mehr als unabhängiges freies Select, sondern über kontrollierte Transitions, die Offer, Project, Dependencies und Audit atomar koordinieren. Die Authority ersetzt nicht Pricing oder Quote Generation.

## 16. Minimal Offer Authority

Minimal geplant: UUID `offer_id`, `project_id`, positive projektweit eindeutige `version`, geschlossener `status`, Artifact-Referenz plus erforderlicher Integritäts-/Persistenzbeweis, nullable projektgleicher `supersedes_offer_id`, `created_by`, Lifecycle-Zeitpunkte (`created_at`, `sent_at`, `accepted_at`, `rejected_at`, optional `expired_at`), monotone `revision`, `updated_at`; dazu Idempotency Key(s) an Actiongrenzen. Preis/Position/Text gehören ausdrücklich nicht in dieses Paket. `draft` darf vor Artifact-Erfolg existieren; `created` nicht.

## 17. Offer Status

Empfohlene geschlossene Allowlist: `draft`, `created`, `sent`, `accepted`, `rejected`, optional erst bei definierter Produktregel `expired`, sowie `superseded`. `accepted|rejected|expired|superseded` sind für diese Revision terminal. `created|sent` sind open; `draft` ist Preparation. Kein freier String. Falls Expiry im Implementierungspaket nicht fachlich definiert wird, `expired` noch nicht implementieren statt künstliche Semantik zu schaffen.

## 18. Offer Dependency

Kleine Taxonomie: `offer_preparation` und `offer_open`. Für Evidence-bound Media ist Preparation offen, solange keine aktuelle Offer-Revision die relevante Evidence abdeckt. `draft` hält Preparation offen. Ein korrekt erzeugtes Artefakt kann Preparation für die von dieser Revision abgedeckte Evidence schließen; `created|sent` hält `offer_open` offen. `rejected|expired` schließen Offer-Abhängigkeiten; `accepted` schließt Offer und öffnet Execution atomar; `superseded` schließt nur die alte Revision, während die neue Revision blockiert.

## 19. Media Used for Offer

A (alle Project Media) ist sicher, aber überbreit; B (alle Evidence-bound Media) passt zum aktuellen Deleteproblem; C (nur explizit verwendete Media) ist präzise, aber ohne lückenlose Relation gefährlich; D kombiniert konservative B-Defaultsemantik mit späterer expliziter Offer-Evidence-Relation. Empfehlung: MVP **B**; später **D**, sobald jede Erzeugung atomar eine vollständige Relation schreibt. Ungebundene Media folgen weiterhin eigenem Lifecycle, nicht automatisch Offer-Semantik.

## 20. Offer Preparation Dependency

Für das sichere MVP öffnet `offer_preparation` mit dem ersten aktiven Evidence Binding. Das ist die kleinste bereits persistente autoritative Semantik und verhindert eine Lücke vor `quote_draft` oder Generatorstart. Intelligence-/UI-Aufruf oder Projectstatus allein sind unnötig spät bzw. nicht artefaktgebunden. Nach Einführung vollständiger Usage-Relation kann die Abdeckung verfeinert werden.

## 21. Offer Created Closure

`Offer Created` erfüllt nur die Mindestanforderung „mindestens bis Angebotserstellung“ für Evidence, die nachweislich in/bei dieser Revision berücksichtigt wurde. Es schließt deren `offer_preparation`, nicht die gesamte Delete Eligibility. Gleichzeitig bleibt `offer_open` offen, bis Acceptance, Rejection oder definierte Expiry eintritt. Deshalb führt Offer Created allein nie zum Löschen.

## 22. Offer Open Retention

Solange die aktuelle Offer-Revision offen ist, bleiben alle Evidence-bound Project Media im konservativen MVP geschützt: Rückfragen, Nachkalkulation, Revision, Nachweis und Human Review können Originale benötigen. Terminaler Offerstatus schließt nur diesen fachlichen Blocker; Policy, Holds und weitere Authorities bleiben maßgeblich.

## 23. Accepted to Execution

Acceptance einer konkreten aktuellen Revision muss atomar `offer_open` schließen, Offer und Project auf accepted koordinieren, genau eine Execution in `not_started` erzeugen, `project_execution` öffnen, Projection dirty markieren und ein sanitisiertes Audit-Event schreiben. `accepted -> safe to delete` ist ausdrücklich verboten.

## 24. Current Execution Architecture

Es existiert keine persistente Installation-/Execution-/Appointment-/Job-/Work-Order- oder Completion-Entity. `installation_address` ist nur ein Project-Stammdatum; Knowledge-Entitytyp `installation` bezeichnet Fachwissen, nicht Auftragsausführung. `accepted` und `closed` sind die einzigen groben Statushinweise und beweisen weder Start, Abschluss noch Storno.

## 25. Execution Variants

| Variante | Bewertung |
|---|---|
| A `accepted/closed` | vermischt Annahme, Durchführung und beliebige Closure; nicht ausreichend |
| B Felder auf Project | klein, aber nullable Kombinationen/History und CAS werden unklar |
| C minimal `project_executions` | explizite Authority, klare FK/Revision/Terminalität; **empfohlen** |
| D Work Order | für Lifecycle ausreichend, aber aktuelles ERP-Overengineering |
| E später, bis dahin fail-closed | sicher, verzögert aber Final Gate; Fallback falls C nicht priorisiert wird |

## 26. Recommended Execution Architecture

Empfohlen ist ein minimaler, projektgebundener `project_executions`-Record, genau einer pro angenommener aktueller Auftragsentscheidung im MVP. Er autorisiert nur Execution Lifecycle für Media, keine Termine, Monteure, Material oder ERP. Ohne diese Authority bleibt Execution missing und Delete fail-closed.

## 27. Minimal Execution Authority

UUID `execution_id`, `project_id`, zwingende `accepted_offer_id` auf eine projektgleiche accepted Offer-Revision, geschlossener `status`, `started_at`, `completed_at`, `cancelled_at`, monotone `revision`, `created_by`/letzter Actor nach Auditkonzept, `created_at`, `updated_at` und Idempotency Key. Zeitpunkte müssen statuskonsistent sein; genau eine aktive Execution je Projekt/accepted Offer.

## 28. Execution Status

Geschlossene Allowlist: `not_started`, `active`, `completed`, `cancelled`. `not_started|active` blockieren. `completed|cancelled` sind terminal für diese Execution. Es gibt kein implizites Completed und keine freie Statuszeichenkette. Restart erfordert eine explizite neue/reaktivierte fachliche Transition mit erneuter Dependency, nicht Timestamp-Manipulation.

## 29. No-order Flow

Bei `rejected` oder fachlich definiertem `expired` darf **kein** Execution-Record entstehen. Die Execution-Authority ist dennoch nicht „fehlende Row = complete“: Der Projection-Evaluator darf `not_applicable` nur aus einer projektgleichen, terminalen, nicht accepted Offer-Authority plus Konsistenzregeln ableiten. Ein eigener `not_applicable`-Execution-Row ist unnötig und birgt Doppelwahrheit. Legacy/unklare Offerzustände bleiben incomplete.

## 30. Execution Cancelled

Nach Acceptance setzt nur eine kontrollierte Admin-Action `cancelled`, mit expected revision, Reason Code und Audit; sie schließt `project_execution`. Danach ist Media lediglich potenziell retentionfähig, niemals automatisch gelöscht. Offene Correction, Offer-Revision, Projectinkonsistenz, Hold oder Policy blockieren weiter.

## 31. Execution Completed

Im MVP bestätigt ausschließlich Admin die fachlich vollständig erbrachte Leistung. Completion setzt `completed_at`, Status und Revision atomar, schließt die Dependency, koordiniert Project `closed`, markiert Projection dirty und auditiert. Reviewer, AI, Zeitablauf, UI-Besuch oder `closed` allein dürfen Completion nicht setzen/beweisen.

## 32. Evidence During Execution

Konservatives MVP: sämtliche aktiven Evidence-bound Media des Projekts bleiben bei `not_started|active` geschützt, unabhängig vom Target. Bestehende operational/legal Holds sind zusätzliche stärkere Gates. Target-/Usage-selektive Freigaben sind erst nach explizit auditierter Vollständigkeit möglich.

## 33. New Media After Offer

Neue Evidence nach Offer Created/Sent ist niemals durch ein älteres Event abgedeckt. Ihr Binding öffnet eine neue `offer_preparation`-Dependency anhand konkreter Evidence-ID und Source-Revision/Relation. Zeitvergleich allein reicht nicht; er kann höchstens Inkonsistenz erkennen. Im konservativen MVP schützt ohnehin der offene Offer-/Execution-Prozess das gesamte Evidence-bound Set.

## 34. Offer Revision After Evidence

Erfordert neue Evidence eine Änderung, entsteht idempotent eine neue Draft/Offer-Version, die alte wird erst in kontrollierter Supersession terminal, und neue Preparation/Open Dependencies werden erzeugt. Es gibt keinen globalen Marker „Projekt hatte bereits ein Angebot“. Ein Gap zwischen Supersession und neuer Authority ist fail-closed und muss transaktional vermieden werden.

## 35. Media / Offer Relation

Eine spätere Relation `offer_evidence(offer_id, evidence_id, purpose, used_at)` mit projektgleichen zusammengesetzten FKs ist für präzise revisionsbezogene Abdeckung sinnvoll. Sie ist für das konservative MVP nicht zwingend: zunächst schützt jede Offer-/Execution-Phase alle Evidence-bound Media. Bevor selektive Löschung erlaubt wird, muss die Relation vollständig, atomar mit Artifact Creation und unveränderlich historisiert sein; sonst darf fehlende Relation nicht „unused“ bedeuten.

## 36. Conservative MVP Alternative

Empfohlen als erste sichere Implementierung: Alle Evidence-bound Media bleiben geschützt, solange Offer nicht terminal no-order oder eine accepted Execution nicht terminal ist und Project nicht konsistent `closed` ist. Vorteil: kleine, erklärbare, sichere Projection ohne lückenhafte Usage-Erfassung. Nachteil: längere/breitere Retention. Präzise Relation ist eine spätere Optimierung, keine Voraussetzung für die minimale Authority.

## 37. Product vs Retention State

Project, Offer und Execution liefern fachliche Source States/Dependencies. Sie setzen keine Lifecycle Eligibility und löschen nichts. Media Lifecycle bleibt Consumer Authority; Retention Policy, Holds, Customer Requests, Delete Claim und physischer Delete bleiben getrennte Verantwortlichkeiten.

## 38. Dependency Projection

Nach den Implementierungspaketen soll die Projection echte Source Rows/FKs für `offer_preparation`, `offer_open` und `project_execution` ableiten. Source-Transition und dirty marker sind transaktional; Rebuild ist deterministisch; Source revision wird verglichen. Erst wenn beide Authorityklassen unterstützt, konsistent und rebuilt sind, darf `missing_authority_types` leer sein. Unknown Type, Drift oder unvollständige Quellen bleiben blockierend.

## 39. Offer Missing Authority

Heute bleibt `offer` immer missing. Sie darf erst entfernt werden, wenn konkrete Offer-Source Rows, Artifact-Proof, geschlossene Transitionen, Legacy-Unknown-Behandlung, FK/Revision und deterministische Projection implementiert sind. Boolesche Project-/Lifecycleflags sind kein Ersatz.

## 40. Execution Missing Authority

Heute bleibt `execution` immer missing. Sie darf erst entfernt werden, wenn accepted Flows eine echte Execution erzeugen und no-order explizit aus sicherer Offerterminalität ableitbar ist. Keine Execution Row bedeutet bei accepted/legacy niemals completed.

## 41. Delete Eligibility

Der spätere finale Gate verlangt kumulativ: Correction Authority complete; Offer Authority complete; Execution Authority complete; Projection complete/aktuell; keine offenen Dependencies; konsistenter terminaler Projectstatus; Lifecycle eligible; kein Hold; konfigurierte Policy/Retention; kein konkurrierender Sourcewechsel. Dieses Audit ändert den bestehenden fail-closed Delete nicht.

## 42. Closed Project

Empfehlung für das MVP: `projects.status = closed` bleibt zusätzliche notwendige, aber niemals hinreichende Voraussetzung. Außerdem müssen Offer und Execution konsistent terminal sein (rejected/expired ohne Execution oder accepted plus completed/cancelled Execution). Ein Offer Rejected allein löst daher nicht sofort Eligibility aus; die kontrollierte no-order Action soll Project atomar schließen.

## 43. Accepted Project

Evidence-bound Delete bei Project `accepted` ist ausnahmslos verboten, auch wenn das Angebot erstellt/versandt wurde oder die Execution fälschlich completed meldet. Der inkonsistente Zustand muss zuerst kontrolliert koordiniert werden.

## 44. Project Completion

Execution `completed`, aber Project `accepted`, ist Inkonsistenz. Keine Authority „gewinnt“ zugunsten der Löschung; der Aggregat-Consistency-Check blockiert. Die Completion-Action soll beide atomar auf `completed`/`closed` bringen. Reconciliation ist admin-only und auditiert.

## 45. State Synchronization

Keine zwei unabhängigen Wahrheiten: Offer/Execution sind Detailautorität, Projectstatus ist koordinierter Grobworkflow. Fachliche DB-RPC/Transaktion sperrt Project und Aggregate, prüft erwartete Revisionen, mutiert Sources und Project, schreibt/markiert Projection und Audit gemeinsam. Freie Projectstatus-Selects für Offer-/Execution-relevante Transitionen müssen später durch Domain Actions ersetzt oder eingeschränkt werden. Consistency Checks liefern ausschließlich pass/fail-closed.

## 46. CAS

Offer und Execution erhalten monotone `revision`; jede mutable Transition verlangt `expected_revision`. Project benötigt für Aggregattransaktionen entweder eine eigene Revision oder mindestens locked-row plus expected current status; empfohlen ist explizite Revision, weil Statusvergleich gleichwertige Zwischenänderungen nicht erkennt. Projection bindet Source Revision; stale Actions schlagen ohne Partial Commit fehl.

## 47. Atomicity

Insbesondere Acceptance ist eine Transaktion: aktuelle Offer-Revision validieren/sperren, accepted setzen, Project accepted setzen, genau eine Execution `not_started` erzeugen, Offerdependency schließen, Executiondependency öffnen/Projection dirty setzen und Audit schreiben. Analog koordinieren Create+Artifact, Send-Erfolg, Reject/Expire, Supersede, Start, Complete/Cancel und Reopen jeweils Source/Project/Projection/Audit. Delete Claim sperrt/revalidiert dieselben Aggregate in fester Lock-Reihenfolge.

## 48. Idempotency

Create, Send, Accept, Reject, Supersede, Start, Complete und Cancel benötigen servererzeugte/scoped Idempotency Keys und eindeutige DB-Constraints. Gleiches Event mit gleicher Nutzlast liefert den bestehenden Erfolg; abweichende Nutzlast oder stale revision liefert Konflikt. Doppelte Acceptance erzeugt weder zweite Execution noch zweite Revision; doppelte Completion erzeugt keine zweite Audit-Wirkung.

## 49. Actor Boundary

Künftige Offer-/Execution-Transitions sind im MVP admin-only. Der heutige Reviewer darf Projectstatus ändern, ist aber ausdrücklich kein Offer-/Execution-Owner; seine Rechte müssen für authority-relevante Statuspfade entkoppelt werden. AI darf weder Offer freigeben/versenden/annehmen noch Execution starten/abschließen. Customer erhält keine direkten internen Tabellenrechte.

## 50. Customer Acceptance Future

Spätere WhatsApp-Acceptance erfordert persistente Conversation/Message-Identität, verifizierte Zuordnung des Kunden zum Projekt und konkreten Angebot, Replay-/Idempotency-Schutz, Authentizitäts-/Providerbeleg und kontrollierte serverseitige Acceptance-Transition. Sie ist ausdrücklich nicht Teil dieses Pakets.

## 51. Manual Status Changes

Aktuell kann Admin oder Reviewer die in der Matrix sichtbaren Ziele frei auswählen; das setzt `quote_sent`, `accepted`, `rejected` ohne Offer-Beweis und ohne Audit. Zudem schützt die DB die Transitionmatrix nicht. Empfehlung: Grobstatusänderungen ohne Authoritywirkung dürfen kontrolliert bleiben; `quote_draft|quote_sent|accepted|rejected|closed` werden künftig nur von fachlichen Offer-/Execution-/Closure-Services gesetzt. Kein generisches Select darf Detailauthority simulieren.

## 52. Audit Events

Zu planen sind `offer_created`, `offer_sent`, `offer_accepted`, `offer_rejected`, optional `offer_expired`, `offer_superseded`, `execution_started`, `execution_completed`, `execution_cancelled`. Metadaten enthalten nur Actor-ID, Project-/Offer-/Execution-ID, Version/Revision before/after, Result/Reason Code und Zeitpunkt; keine Kundendaten, Preise, Angebotsinhalte, Nachrichten, Dateinamen, URLs oder Media bytes. Replay/Conflict wird strukturiert und sanitisiert protokolliert.

## 53. RLS / Permissions

Admin liest/schreibt nur über kontrollierte Actions/RPCs. Reviewer darf gegebenenfalls project-scoped lesen, aber nicht transitionieren; Customer hat keine direkten Rechte. Keine neue DB-Rolle. Tabellen: RLS enabled, keine anon Grants, minimale authenticated SELECT-Spalten/Policies, Mutationen vorzugsweise ausschließlich über fixed-search-path RPCs; Audit-Log bleibt nicht direkt client-editierbar.

## 54. Existing Project Migration

Bestehende Projectstatus dürfen nicht in erfundene Offer-/Execution-History backfilled werden. Empfehlung: A als Default (`unknown`, fail-closed), B als explizite admin-only Reconciliation und C ausschließlich dort, wo ein echtes persistentes Artifact/Send-/Acceptance-/Completion-Beweismittel maschinell und kontrolliert verifiziert werden kann. Eine Statuszeile allein ist nie C.

## 55. Unknown Legacy State

Legacy `quote_sent`, `accepted`, `rejected` oder `closed` ohne Source Authority führt zu Offer/Execution incomplete und blockiert Delete. Reconciliation erzeugt nachvollziehbare Authority ab jetzt oder dokumentiert verifizierte historische Belege; sie darf keine Rückdatierung aus Vermutung erzeugen.

## 56. Retention Duration

Keine Dauer wird festgelegt oder konfiguriert. Terminale Offer-/Executiondependency bedeutet nur, dass dieser fachliche Zweck beendet ist. Policy muss später separat versioniert und konfiguriert sein, bevor Eligibility entstehen kann.

## 57. Customer Deletion Request

Ein Customer Request ist ein separater, noch nicht implementierter Workflow mit Identitätsprüfung, gesetzlichen/operativen Ausnahmen und Audit. Er setzt Offer-/Executionwahrheit nicht außer Kraft und darf nicht mit normaler Retention vermischt werden.

## 58. Media Holds

Bestehende operational/legal Holds haben Vorrang. Terminaler Offer-/Execution-/Projectstatus hebt einen Hold niemals auf. Nur die separate kontrollierte Hold-Authority darf ihn ändern.

## 59. Failure Matrix

| Fall | Source Authority | Dependency / Projection | Delete? | sichere Transition / Audit |
|---|---|---|---|---|
| A no offer | keine | preparation open; vollständig erst mit Offermodell | blockiert | Draft/Create; `offer_created` erst mit Artifact |
| B offer draft | Offer draft | preparation open | blockiert | Artifact erzeugen |
| C offer created | konkrete Revision+Artifact | preparation resolved, offer_open open | blockiert | Send/terminal; `offer_created` |
| D sent/open | konkrete sent Revision | offer_open open | blockiert | Accept/Reject/Expire; `offer_sent` |
| E rejected | rejected Offer | Offer terminal; Execution N/A ableitbar; Project muss closed | bis konsistent closed/alle Gates blockiert | atomare no-order Closure; `offer_rejected` |
| F expired | nur bei definierter Expiry-Authority | wie rejected | bis konsistent closed/alle Gates blockiert | Expire/close; `offer_expired` |
| G accepted | accepted Offer | Offer resolved, Execution open | blockiert | atomar Execution erzeugen; `offer_accepted` |
| H accepted, Execution fehlt | Offer accepted, Source fehlt | incomplete/inconsistent | blockiert | reconcile/create atomar; Audit conflict/reconcile |
| I Execution not started | Execution | project_execution open | blockiert | Start/Cancel; ggf. `execution_started`/cancelled |
| J Execution active | Execution | project_execution open | blockiert | Complete/Cancel |
| K Execution completed | Execution | execution resolved; Project closed erforderlich | blockiert bis alle Gates; danach nur potenziell eligible | atomare Complete+close; `execution_completed` |
| L Execution cancelled | Execution | execution resolved; Project closed erforderlich | wie K | Cancel+close; `execution_cancelled` |
| M Project closed/no-order | Project + terminal rejected/expired Offer | Offer resolved, Execution explicitly N/A | nur bei kompletter Projection/übrigen Gates | no-order close Audit |
| N Project reopened | kontrollierte neue Source fehlt/entsteht | neue dependencies; währenddessen incomplete/open | blockiert | neue Offerrevision + dirty; Reopen Audit |
| O neue Evidence nach created | Evidence Binding neuer Revision | preparation neu open | blockiert | neue Offerrevision/Usage |
| P neue Evidence nach sent | Evidence Binding neuer Revision | preparation/open neu bzw. weiter open | blockiert | supersede + neue Revision |
| Q Offer superseded | alte+neue Offer | alt resolved, neu preparation/open | blockiert | atomare Supersession; `offer_superseded` |
| R Execution completed, Project accepted | widersprüchliche Sources | inconsistent/incomplete | blockiert | admin reconciliation, kein Auto-Winner |
| S Legacy quote_sent ohne Offer | nur Projectstatus | Offer/Execution missing | blockiert | verifizierte Reconciliation oder unknown |
| T duplicate accept | Idempotency/CAS | exakt eine Execution; Projection unverändert korrekt | während Execution blockiert | existing result oder conflict; kein Doppel-Audit |

## 60. Race Conditions

| Race | erforderliche Kontrolle |
|---|---|
| Offer create vs neue Evidence | Project/Evidence coverage lock oder serialisierte Cutoff+Relation; neue Evidence öffnet sicher eigene Dependency |
| Offer send vs neue Evidence | Send gilt nur konkreter Revision; neue Evidence bleibt un-covered/open |
| Accept vs Delete Claim | gemeinsame Lock-Reihenfolge, Authority-Revalidation; Acceptance/Execution gewinnt oder Delete schlägt ohne Sourceänderung fehl |
| Reject vs Delete Claim | Project/Offer/Media/Lifecycle unter Locks; Delete erst nach terminaler konsistenter Projection |
| Execution start vs Delete Claim | Start darf bei claimed/deleting Media nicht committen; Delete revalidiert Execution |
| Execution complete vs Delete Claim | Completion allein reicht nicht; Project/Projection/Policy atomar/revalidiert |
| Project reopen vs Delete Claim | Reopen markiert dependencies vor Freigabe; claimed Delete verhindert Reopen oder wird abgebrochen |
| Supersession vs Lifecycle evaluation | neue Revision und dirty marker atomar; stale Projection blockiert |
| zwei Accept Actions | Offer revision CAS + unique accepted/current Execution + Idempotency |
| zwei Completion Actions | Execution revision CAS + Idempotency; genau ein Zustands-/Audit-Effekt |

## 61. Minimal Authority Recommendation

Kleinstes notwendiges persistentes Modell sind zwei kleine Aggregate: `project_offers` für konkrete Artifact-/Revision-/Lifecyclewahrheit und `project_executions` für accepted-to-terminal Execution. Zunächst keine Offer-Positionen, Preise, Termin-/Monteur-/Materialverwaltung und keine verpflichtende `offer_evidence`-Relation. Projectstatus allein ist für beide Authorities unzureichend.

## 62. Package Split

Empfohlen ist die sichere Reihenfolge:

1. **AP-15-05-03-03-03-04-01 — Minimal Offer Authority**: Artifact proof, Version/Supersession, CAS/Idempotency, admin transitions, Legacy unknown.
2. **AP-15-05-03-03-03-04-02 — Minimal Execution Authority**: accepted atomar, Execution Lifecycle, Project consistency, no-order semantics.
3. **AP-15-05-03-03-03-04-03 — Projection Integration / Final Delete Gate**: echte typed Sources, Rebuild/Drift, Missing Authorities empty, finaler Gate.

Trennung ist sinnvoll: Artifact/Offer und Ausführung haben andere Wahrheiten/Races; ein gemeinsames Paket würde Review und Rollback vergrößern.

## 63. Final Delete Gate

Implementierungsreihenfolge: (1) Offer Authority, (2) Execution Authority, (3) Projection rebuild, (4) Missing Authorities exakt leer, (5) keine offenen Dependencies, (6) finale Eligibility-Integration mit Project/Lifecycle/Hold/Policy, (7) kontrollierter realer Test. Der Claim muss unter Locks aktuelle Source revisions, Projection und Eligibility nochmals prüfen. Keine Freigabe in diesem Audit.

## 64. Lifecycle UI Boundary

Erst nach den Authorities darf eine Admin-UI Gründe wie Offer offen, Execution aktiv, Correction offen, retention eligible, deletion pending und tombstoned aus der echten Projection anzeigen. Keine UI und kein UI-Schattenstatus jetzt.

## 65. WhatsApp Boundary

WhatsApp Media Ingestion/Customer Actions folgen erst nach Lifecycle-/Offer-/Execution-Authority. Nachrichten müssen später persistiert, verifiziert, projekt-/offerbezogen und replay-safe sein. Keine WhatsApp-Änderung jetzt.

## 66. Vision Boundary

Vision folgt danach und besitzt niemals Offer-, Pricing-, Acceptance-, Execution- oder Delete-Autorität. Sie darf nur kontrollierte Interpretation/Observation-Vorschläge liefern. Keine Vision-/AI-Änderung jetzt.

## 67. Owner Decisions

| # | Entscheidung | Empfehlung |
|---:|---|---|
| 1 | Reicht `projects.status` für Offer? | nein |
| 2 | Standalone Offer Authority? | ja, minimal hybrid |
| 3 | Artifact erforderlich? | ja für `created` |
| 4 | Beweis `offer_created`? | persistierte konkrete Revision + erfolgreich persistiertes Artifact |
| 5 | `quote_sent` vertrauenswürdig? | nein, heute manuell/ungebunden |
| 6 | Versionierung? | positive projectweite Version + Revision CAS |
| 7 | Supersession? | explizit, projektgleicher Vorgänger |
| 8 | neue Evidence öffnet neu? | ja |
| 9 | Media-to-Offer Relation? | später für Präzision; MVP konservativ ohne |
| 10 | offenes Offer schützt Media? | ja, alle Evidence-bound im MVP |
| 11 | accepted schließt Offer? | ja |
| 12 | accepted öffnet Execution? | ja, atomar |
| 13 | Projectstatus für Execution ausreichend? | nein |
| 14 | separate Execution Authority? | ja |
| 15 | Executionstatus? | `not_started|active|completed|cancelled` |
| 16 | no-order Semantik? | keine Execution Row; N/A nur aus sicher rejected/expired Offer ableiten |
| 17 | completed? | admin-bestätigt, timestamp+revision, Project atomar closed |
| 18 | cancelled? | admin-only terminal, kein Auto-Delete |
| 19 | Project closed Voraussetzung? | ja zusätzlich im konservativen MVP |
| 20 | Reopen? | nur kontrollierte neue Revision/Dependencies; aktuell unsupported |
| 21 | Synchronisierung? | eine DB-Transaktion/controlled RPC, Checks fail-closed |
| 22 | CAS? | ja, monotone Offer-/Executionrevision und Project-Erwartung |
| 23 | Acceptance atomar? | ja inklusive Execution/Projection/Audit |
| 24 | Idempotenz? | ja, scoped Keys + Unique Constraints |
| 25 | Transitions admin-only? | ja im MVP |
| 26 | Reviewer? | read ggf. project-scoped, kein Owner/Writer |
| 27 | Customer Acceptance? | später verifiziert über Message/Identity Boundary |
| 28 | Legacy Projects? | unknown/fail-closed |
| 29 | Backfill? | nur kontrolliert bei echtem Beleg; sonst Reconciliation |
| 30 | Legacy unknown fail-closed? | ja |
| 31 | Hold precedence? | Hold ist stärker |
| 32 | minimales Modell? | `project_offers` + `project_executions` |
| 33 | kombiniert oder getrennt? | drei getrennte Pakete |
| 34 | exakte Delete-Voraussetzung? | alle Authorities/Projection vollständig und konsistent, keine offenen Dependencies, Project closed, Lifecycle eligible, kein Hold, Policy konfiguriert, atomare Revalidation |

## 68. Future Tests

- Migration/DB: Offer-/Execution-Persistenz, closed enums, Artifact-FK/Proof, projektgleiche FKs, Version uniqueness, Supersession und Timestampchecks.
- Domain: Offer-/Execution-Transitionen, no-order, Acceptance, Completion/Cancel, Project-Konsistenz.
- CAS/Replay: stale revisions, doppelte Create/Send/Accept/Reject/Supersede/Start/Complete/Cancel; genau eine Execution/ein Effekt.
- Evidence: neue Evidence nach Created/Sent, neue Revision, superseded Offer, konservative projektweite Abdeckung.
- Legacy: jeder alte Status bleibt unknown ohne Beleg; kontrollierter Backfill/Reconciliation.
- Projection/Delete: echte typed Dependencies, deterministic rebuild, drift/missing fail-closed und alle genannten Races.
- Security: RLS/Grants, Admin write, Reviewer höchstens read, Customer/AI keine Authority, sanitisiertes Audit.

## 69. Production Gates

- Keine Löschung, bevor Offer Authority bekannt ist; keine bei offenem Offer.
- Keine Löschung in accepted Project, bei `not_started|active` Execution oder inkonsistentem Project/Offer/Execution-Aggregat.
- Neue Evidence darf niemals durch ein altes Created/Sent Event abgedeckt erscheinen; Revisionen/Supersession sind explizit.
- Legacy unknown, Missing Authority, Projection drift/rebuild und unbekannte Zustände bleiben fail-closed.
- CAS, Idempotenz, atomare Source-/Project-/Projection-/Audit-Transitions und Delete-Revalidation sind produktiv nachgewiesen.
- Kein Customer Direct DB Right, keine Reviewer-/AI-Workflowautorität, keine automatische Angebotsfreigabe.
- Sanitisiertes Audit, RLS, typed/projectgleiche FKs und Hold-Vorrang sind nachgewiesen.
- Keine Retentiondauer wird angenommen; Policy muss separat konfiguriert sein.

## 70. Scope Confirmation

Es wurde ausschließlich diese eine Auditdatei erstellt. Keine Migration, DB-, SQL-, RPC-, RLS-, Offer-, Execution-, Projectstatus-, Projection-, Delete-, Lifecycle-, Retention-, UI-, WhatsApp-, Vision- oder AI-Implementierung; kein Test und keine `package.json`-Änderung. Insbesondere wurden keine Offer Authority, keine Execution Authority und kein Delete Unlock implementiert. Anwendungstests wurden entsprechend der Vorgabe nicht ausgeführt.

## 71. Status

**READY FOR OWNER DECISION**

`PERSISTENT CORRECTION AUTHORITY — IMPLEMENTED`

`AUTHORITATIVE MEDIA DEPENDENCY PROJECTION — IMPLEMENTED`

`OFFER AUTHORITY — NOT COMPLETE`

`EXECUTION AUTHORITY — NOT COMPLETE`

`FINAL EVIDENCE-BOUND DELETE GATE — NOT IMPLEMENTED`

`RETENTION DURATION — NOT CONFIGURED`

`CUSTOMER DELETION REQUEST WORKFLOW — NOT IMPLEMENTED`

`WHATSAPP — NOT IMPLEMENTED`

`VISION — NOT IMPLEMENTED`

`OVERALL PRODUCT — NOT PRODUCTION READY`

# AP-15-05-03-03-03-04-01 — Minimal Persistent Offer Authority Result

## Migration und Offer Authority

Die additive Migration `202608230001_minimal_persistent_offer_authority.sql` führt `public.project_offers` als konkrete, persistente und project-scoped Lifecycle-Authority ein. Sie enthält ausschließlich Identität, positive projektweit eindeutige `offer_version`, monotone CAS-`revision`, geschlossenen Lifecycle, Supersession, Actor und Lifecycle-Zeitpunkte. Es wurden weder Preise/Positionen noch PII, Dokumentfelder, Storage-Referenzen oder Execution modelliert. UUID und Project-FK verwenden `ON DELETE RESTRICT`; Offer History besitzt keinen Hard-Delete-Pfad.

## Offer Identity, Versioning und Statuses

Jede fachliche Revision ist eine neue Row. Die erste Version ist `1`; kontrollierte Supersession erstellt `N+1`, erhält die alte Row als `superseded` und erzwingt projektgleichen, älteren Vorgänger, kein Self-Link, keinen Zyklus und höchstens eine nicht-superseded aktuelle Revision. Die Allowlist lautet exakt `draft`, `created`, `sent`, `accepted`, `rejected`, `superseded`; `expired` wurde mangels Produktsemantik nicht erfunden. Terminale Revisionen können nicht reaktiviert werden.

## Created Proof und Sent Semantics

`created` beweist in diesem MVP ausschließlich, dass eine konkrete persistente Offer-Revision durch den kontrollierten serverseitigen Schritt als Angebotsversion materialisiert wurde. Es beweist ausdrücklich **kein PDF, kein Dokumentartefakt und keine Datei**. Da weiterhin keine echte Artifact Authority existiert, wurde weder ein Dateiname noch eine Storage-/UI-Heuristik als Authority verwendet. `sent` ist eine admin-bestätigte interne Versandhandlung für diese konkrete Revision und ausdrücklich **kein Provider Delivery Receipt und keine Zustellgarantie**.

## Acceptance, Rejection und Supersession

Nur `sent -> accepted|rejected` ist zulässig. Acceptance ist in diesem Paket eine administrative Admin-Handlung, kein Customer-authenticated Flow; Rejection ist analog Offer-gebunden. Beide koordinieren Offer und Project atomar, erzeugen jedoch keine Execution. Supersession ist nur aus `created|sent` möglich, setzt den Vorgänger terminal und erstellt atomar einen neuen Draft.

## Project Coordination und Actor Boundary

Draft koordiniert `quote_draft`, Sent `quote_sent`, Acceptance `accepted`, Rejection `rejected`; Supersession koordiniert zurück zu `quote_draft`. Project Row und aktuelle Offer Row werden gesperrt und innerhalb derselben RPC-Transaktion geprüft/geändert. Ein DB-Guard und der allgemeine Server-Service verweigern freie offerrelevante Statusänderungen. Offer-Mutationen sind über die zentrale Capability `canManageProjectOffers` und erneut in jedem SECURITY-DEFINER-Einstieg Admin-only. Reviewer darf projektbezogen lesen, aber nicht mutieren; Customer und AI besitzen keine Authority.

## CAS, Idempotency, Atomicity und Audit

Jede Mutation verlangt die erwartete Offer-Revision (Create zusätzlich den erwarteten Projectstatus); stale Eingaben brechen ohne Partial Commit ab. Project-scoped eindeutige Command Keys machen Create/Created/Sent/Accept/Reject/Supersede replay-safe. Replay liefert denselben schmalen DTO-Zustand und erzeugt weder zweite Version noch Revision oder Auditzeile. Offer, Projectstatus, Command, Projection-dirty und sanitisiertes Audit werden in einer DB-Transaktion geschrieben. Events sind `offer_draft_created`, `offer_created`, `offer_sent`, `offer_accepted`, `offer_rejected`, `offer_superseded`; Metadaten enthalten nur Actor-/Project-/Offer-ID, Version, Revision, Status und Zeitpunkt.

## New Evidence Behavior und Dependency Projection

Die V3-Erweiterung ergänzt source-spezifisch `project_offer_id` sowie `offer_preparation` und `offer_open`; eine generische UUID ohne typisierten FK ist nicht zulässig. Für jede Evidence-bound Media eines Projekts wird konservativ dieselbe aktuelle Offer-Revision projiziert: Draft hält Preparation offen; Created/Sent halten Offer Open; Accepted/Rejected lösen beide. Supersession löst die alte Quelle und der neue Draft öffnet Preparation erneut. Eine Offer-Mutation sowie neue Evidence markieren die Projection `rebuild_required`.

Es gibt bewusst keine `offer_evidence`-Relation. Deshalb gilt eine alte Created-/Sent-Revision niemals als präziser Nachweis, dass spätere Evidence berücksichtigt wurde: während eines offenen Offerprozesses bleiben alle Evidence-bound Project Media geschützt; neue Evidence bleibt durch den projektweiten offenen Offerblocker und die dirty/rebuild-Grenze fail-closed. Das ist konservativ und kein finaler Delete Unlock.

Nach vollständigem Rebuild darf `offer` nur dann aus `missing_authority_types` verschwinden, wenn eine echte aktuelle `project_offers`-Row existiert. Ohne Row bleibt `offer` missing. `execution` bleibt immer missing. Der bestehende Evidence-bound Delete bleibt daher unabhängig vom terminalen Offerstatus blockiert.

## Legacy Projects

Es gibt keinen Backfill. Legacy Projects in `quote_draft`, `quote_sent`, `accepted`, `rejected` oder `closed` ohne Offer Row bleiben Offer Authority unknown/incomplete und fail-closed. Eine Statuszeile wird nicht in erfundene Historie umgedeutet. Eine spätere admin-only Reconciliation ist nicht Bestandteil dieses Pakets.

## RLS, Grants, DTO und Read Service

RLS ist auf Offers und internen Commands aktiv. Nur projektbezogene Staff-Reads sind erlaubt; Customer erhält keine Policy. `anon` und `authenticated` haben keine Tabellenmutation, insbesondere kein UPDATE/DELETE. Nur die engen fixed-search-path RPCs sind für `authenticated` ausführbar und bestimmen Actor, ID, Version, Revision, Status und Zeitpunkte serverseitig. Der strikte DTO enthält nur Offer-/Project-ID, Version, Revision, Status, Lifecycle-Zeitpunkte und optionalen Vorgänger. Der Read Service lädt aktuelle Revision und History mit einer project-scoped Listenabfrage ohne N+1.

## Tests und Remaining Limits

Migrationstests prüfen Tabelle/FKs, Allowlist, positive Revision, project/version uniqueness, Current-Index, Supersession/Self/Cycle, RLS/Grants, kein DELETE und die Abwesenheit von Preis-, PII-, Artifact- und Executionmodell. Domain-/Servicetests prüfen Capability, geschlossene Transitionen, Dependency Mapping, DTO-Grenze, CAS/Replay- und Atomicity-Verträge. Bestehende Status-, Evidence-, Correction-, Knowledge-, Projection-, Lifecycle- und Ready-Delete-Suites bleiben Regression Gates.

Nicht implementiert sind echtes Offer Artifact/PDF, Provider Receipt, Customer Acceptance, Execution Authority, finale Delete-Freigabe, Retentiondauer, WhatsApp, Vision, AI und Storageänderung. Das nächste kleinste Paket ist die separat auditierte Minimal Execution Authority; erst danach kann ein eigenes Paket Projection und finalen Delete Gate untersuchen.

## Status

`PERSISTENT OFFER AUTHORITY — IMPLEMENTED`

`OFFER REVISION AUTHORITY — IMPLEMENTED`

`OFFER CREATED AUTHORITY — IMPLEMENTED`

`OFFER SENT LIFECYCLE — IMPLEMENTED`

`OFFER ACCEPTED / REJECTED LIFECYCLE — IMPLEMENTED`

`LEGACY OFFER HISTORY AUTO-BACKFILL — NOT IMPLEMENTED`

`EXECUTION AUTHORITY — NOT IMPLEMENTED`

`EXECUTION MISSING AUTHORITY — STILL BLOCKING`

`FINAL EVIDENCE-BOUND DELETE GATE — NOT IMPLEMENTED`

`RETENTION DURATION — NOT CONFIGURED`

`WHATSAPP — NOT IMPLEMENTED`

`VISION — NOT IMPLEMENTED`

`OVERALL PRODUCT — NOT PRODUCTION READY`

# AP-15-05-03-03-03-04-02 — Minimal Persistent Execution Authority Result

## Migration und Execution Authority

Die additive Migration `202608230002_minimal_persistent_execution_authority.sql` führt `public.project_executions` als kleine persistente Lifecycle-Authority ein. Der Record enthält UUID, Project- und Accepted-Offer-Bindung, positive monotone Revision, Actor, Creation-Command-Identität, Lifecycle-Zeitpunkte sowie `created_at`/`updated_at`. Termine, Kundendaten, Preise, Material, Mitarbeiter, Arbeitszeiten, Rechnungen, Freitext und Work-Order-Semantik sind ausdrücklich nicht modelliert. History wird nicht gelöscht.

## Offer Binding, Statuses und Creation

Ein zusammengesetzter FK erzwingt dasselbe Project; ein deferred Integrity Trigger akzeptiert ausschließlich die aktuelle persistente `project_offers`-Revision im Status `accepted`. `draft`, `created`, `sent`, `rejected` und `superseded` können keine Execution tragen. Pro accepted Offer ist durch Unique Constraint exakt eine Execution möglich. Die geschlossene Allowlist lautet exakt `not_started`, `active`, `completed`, `cancelled`; Timestamp-Checks schließen widersprüchliche Kombinationen aus.

Die bestehende kontrollierte `sent -> accepted`-Transition erzeugt über einen transaktionalen Acceptance-Trigger genau eine `not_started` Execution. Offer, Project, Execution, Projection-dirty und Audit liegen damit in derselben RPC-Transaktion; ein Insert-/Consistency-Fehler rollt Acceptance vollständig zurück. Replay trifft die persistierte Offer-Command-Antwort und erzeugt weder zweite Execution noch Auditwirkung. Es gibt keine manuelle Creation-RPC und keinen Legacy-Backfill.

## No-order Semantik

`sent -> rejected` erzeugt keine Execution. Nur eine echte aktuelle rejected Offer Authority ohne Execution beweist `execution not applicable`; das allgemeine Fehlen einer Row beweist niemals Completion. Legacy `projects.status=accepted|rejected|closed` ohne Offer bleibt unknown, incomplete und fail-closed.

## Start, Completion, Cancellation und Project Coordination

Admin-only RPCs erlauben ausschließlich `not_started -> active`, `active -> completed` sowie `not_started|active -> cancelled`. Completion und Cancellation koordinieren Project `accepted -> closed` atomar. Ein Trigger und der allgemeine Projectstatus-Service sperren das freie `accepted -> closed`, damit `closed` Execution Completion nicht imitieren kann. Terminale Executions können weder gestartet noch zurückgesetzt werden; Reopen bleibt unsupported.

## Consistency, CAS, Idempotency und Atomicity

Jede Mutation sperrt Project, accepted Offer und Execution, validiert Offer-/Project-/Execution-Invarianten, verlangt `expected_revision` und erhöht bei genau einer echten Transition `N -> N+1`. Stale Revisionen, illegale Transitionen sowie widersprüchliche Project-/Offerzustände brechen fail-closed ab; es gibt kein Auto-Rebase. Project-scoped Command Keys machen Start, Complete und Cancel replay-safe: Replay liefert das vorhandene DTO ohne neue Revision oder Auditzeile. Creation besitzt zusätzlich eine deterministische Acceptance-Command-Bindung und Unique Constraints.

## Actor Boundary und Capability

Die zentrale Capability `canManageProjectExecution` ist ausschließlich für Admin wahr und semantisch unabhängig von Offer- und Delete-Capabilities. Jeder fixed-search-path SECURITY-DEFINER-Einstieg ermittelt Actor und Rolle intern über `auth.uid()`/`current_app_role()`. Reviewer hat nur project-scoped Read, Customer und AI erhalten keine Authority; es wurde keine neue Rolle eingeführt.

## Projection Integration und Missing Authorities

Projection V4 ergänzt `project_execution` als echten Source-Typ mit source-spezifischem `project_execution_id`-FK. `not_started|active` projizieren offen, `completed|cancelled` resolved. Accepted Offer plus passende konsistente Execution oder rejected Offer ohne Execution entfernen `execution` aus `missing_authority_types`. Dadurch kann ein vollständig autoritativer New Flow `missing_authority_types=[]` erreichen. Accepted Offer ohne Execution, Legacy ohne Offer, Statuswidersprüche, falsche Offerbindung und neue Evidence nach terminaler Execution bleiben incomplete/missing und fail-closed. Jede Execution-Mutation markiert die Projection `rebuild_required`.

Neue Evidence während `not_started|active` erhält beim Rebuild die offene projektweite Execution Dependency. Neue Evidence nach Completion/Cancellation ist fachlich ungewöhnlich und wird anhand des Source-Zeitpunkts als Inkonsistenz behandelt, bis ein späteres Lifecycle-Paket sie kontrolliert bewertet. Holds bleiben stärker als terminale Execution.

## Delete Boundary und Retention

Dieses Paket ändert weder Ready-Delete-Claim noch Lifecycle Eligibility und implementiert ausdrücklich **keinen finalen Evidence-bound Delete Unlock**. Selbst leere Missing Authorities und keine offenen unterstützten Dependencies reichen weiterhin nicht für Delete. Terminal bedeutet nur, dass die Execution Dependency geschlossen ist; es wurde keine Retentiondauer konfiguriert.

## RLS, Grants, Audit, DTO und Read Service

RLS ist für Execution und interne Commands aktiv. Authenticated Staff darf project-scoped lesen; direkte Browser-INSERT/UPDATE/DELETE und normaler Hard Delete sind nicht gewährt. Nur die schmalen Start-/Complete-/Cancel-RPCs sind ausführbar. Audit Events sind `project_execution_created`, `project_execution_started`, `project_execution_completed`, `project_execution_cancelled`; Metadaten enthalten nur Actor-, Project-, Execution- und Offer-UUID, vorherigen/resultierenden Status, Revision und Zeitpunkt, keine PII oder Angebotsinhalte.

Das strikte DTO enthält ausschließlich Execution-/Project-/Accepted-Offer-ID, Status, Revision und Lifecycle-/Systemzeitpunkte. Der project-scoped Read Service lädt die aktuelle MVP-Execution ohne Customerdaten; eine spätere History-Ansicht ist nicht vorweggenommen.

## Tests

Migrationstests prüfen Tabelle, FKs/Offerintegrität, Uniqueness, Status-/Revision-/Timestamp-Constraints, Creation/Atomicity, RLS/Grants, Audit, typed Projection und Abwesenheit von PII/ERP/Delete-Unlock. Domain- und Servicetests prüfen Capability, Matrix, DTO, Admin Boundary, offene/gelöste Dependencies, No-order, Missing Authority und Inkonsistenz. Offer-, Status-, Correction-, Knowledge-, Projection-, Lifecycle- und Ready-Delete-Tests bleiben unveränderte Regression Gates.

## Remaining Limits

Nicht implementiert sind Scheduling, Kalender, Monteure/Teams, Arbeitszeiten, Material, Rechnungen, Work Orders, Customer Portal/Acceptance, WhatsApp, Vision, AI, Storageänderungen, Retentiondauer, Reopen sowie der finale Evidence-bound Delete Gate. Das nächste kleinste Paket ist die separat auditierte Final-Gate-/Lifecycle-Integration mit atomarer Delete-Revalidation; es darf keine der hier dokumentierten fail-closed Grenzen implizit aufheben.

## Status

`PERSISTENT OFFER AUTHORITY — IMPLEMENTED`

`PERSISTENT EXECUTION AUTHORITY — IMPLEMENTED`

`OFFER → EXECUTION BINDING — IMPLEMENTED`

`EXECUTION CAS — IMPLEMENTED`

`EXECUTION IDEMPOTENCY — IMPLEMENTED`

`CORRECTION AUTHORITY — IMPLEMENTED`

`AUTHORITATIVE MEDIA DEPENDENCY PROJECTION — IMPLEMENTED`

`CORRECTION MISSING AUTHORITY — RESOLVED`

`OFFER MISSING AUTHORITY — RESOLVED FOR AUTHORITATIVE NEW-FLOW PROJECTS`

`EXECUTION MISSING AUTHORITY — RESOLVED FOR AUTHORITATIVE NEW-FLOW PROJECTS`

`LEGACY PROJECT AUTHORITY — FAIL-CLOSED`

`FINAL EVIDENCE-BOUND DELETE GATE — NOT IMPLEMENTED`

`RETENTION DURATION — NOT CONFIGURED`

`WHATSAPP — NOT IMPLEMENTED`

`VISION — NOT IMPLEMENTED`

`OVERALL PRODUCT — NOT PRODUCTION READY`

# AP-15-05-03-03-03-04-03 — Final Evidence-bound Delete Gate Integration Result

## Final Authority Matrix

| Authority | Final gate | Fail-closed condition |
|---|---|---|
| Project/Media | project-scoped, ready, present, active | mismatch, missing, soft-deleted, non-present |
| Lifecycle | configured policy, explicit `deletion_eligible`, no hold, idle execution, CAS revision | missing policy, non-eligible retention, hold, active attempt, stale revision |
| Projection | V1 snapshot under lock, `complete`, no drift, no rebuild, empty missing authorities, zero open dependencies | every other state |
| Correction | current correction source rows revalidated under lock | pending, stale or failed |
| Offer | current non-superseded Offer revalidated under lock | missing/legacy or draft/created/sent |
| Execution | accepted Offer requires its current completed/cancelled Execution | missing, not_started, active, inconsistent |
| No-order | rejected Offer, no Execution, closed Project | Execution present or inconsistent Project |

## Eligibility Contract

`evaluateProjectMediaDeletionEligibility` remains a deterministic closed union (`eligible` or controlled blocked result). The persistent evaluator is Admin-only and atomically persists the decision, projection snapshot and sanitized audit event. It grants eligibility only when every gate succeeds. A no-change replay returns the existing lifecycle row. A changed authority is evaluated again and can re-block the lifecycle; eligibility is not irreversible.

## Project Terminal Gate and Flows

`projects.status='closed'` is necessary but never sufficient for bound Evidence. A no-order flow additionally requires the current Offer to be `rejected` and Execution to be not applicable (no Execution row). A completed-order flow requires the current Offer to be `accepted`, its project-scoped Execution to be `completed`, and the Project closed. `cancelled` is equally terminal for this deletion dependency. Offer `draft`, `created` or `sent` is open. Execution `not_started` or `active` is open. Missing Offer/Execution authority and legacy closed Projects remain fail-closed.

## Correction, Projection, and Dependencies

The gate consumes Correction Authority rather than creating it. Pending, stale, or failed corrections linked by the authoritative projection block. Only projection completeness `complete` is accepted; missing, incomplete, drifted, rebuild-required, version/revision-stale projections block. Any `missing_authority_types` entry or any effective open dependency blocks. Resolved and invalidated history remains persistent and is not interpreted as generic success.

New Evidence or a new Correction marks the existing projection rebuild-required through the existing authority triggers. Evidence created after terminal Offer/Execution is additionally detected by the existing rebuild consistency rule. Thus old terminal state cannot be inherited without a fresh complete authoritative projection.

## Lifecycle CAS and Re-blocking

Evaluation checks the expected lifecycle revision and binds successful eligibility to `projection_version` plus `source_revision`. Controlled re-evaluation changes a stale eligible snapshot back to blocked. No browser-supplied reason or authority status is accepted.

## Delete Claim Revalidation and TOCTOU

The existing Ready-Media claim now invokes the same final gate while Project, Media, Lifecycle, projection, dependency and relevant source rows are locked. It compares the current projection version/revision to the eligibility snapshot. A new correction, Evidence/projection dirty event, Offer revision/state inconsistency, Execution change, open dependency, hold, physical-state change, lifecycle CAS mismatch, or active attempt rejects the claim atomically and writes `media_deletion_claim_rejected_by_final_gate`. This removes reliance on a stale persisted `eligibility_status`.

## Bound vs Unbound, Holds, and Policy

Evidence-bound media is enabled only for fully authoritative eligible flows. Legacy/unknown bound media remains closed. The prior unbound-media rule remains scoped to active, ready/present media in a closed Project and is not unnecessarily tightened by Offer/Execution requirements. Operational and legal holds always win. `customer_photo_retention_v1` must be configured and retention must already be explicitly `deletion_eligible`; no duration, timer, scheduler, or customer request flow is introduced.

## Physical Delete Boundary, Tombstones, and History

The gate performs no Storage operation and no hard delete. After claim, the established recoverable path remains `claimed/storage_delete_pending → storage delete adapter → completion_pending → Evidence tombstone → absent`. Tombstones are created only during completion. Knowledge Claims, Observations, Proposals, Reviews, Corrections, resolved dependencies and provenance history are retained; original-media rereview continues to encounter `source_media_unavailable` after tombstoning.

## RLS, RPC Security, and Audit

RLS and table grants are unchanged. The new helper is not executable by clients. Admin-only evaluator and claim RPCs use `SECURITY DEFINER`, fixed `search_path`, `auth.uid()`, project scope, server-derived statuses, deterministic locks, and no client locator/reason authority. Eligibility mutation plus `media_deletion_eligibility_granted`/`media_deletion_eligibility_blocked` is atomic. Claim validation, attempt transition, and audit remain atomic. Audit metadata contains only actor/project/media UUIDs, lifecycle revision, projection version/revision, result, closed reason codes and timestamp—never PII or Storage paths.

## Tests

Pure tests cover authoritative rejected/no-order, completed and cancelled execution success; open Offers; active Execution; correction; missing authorities; every projection failure state; stale lifecycle/projection CAS; active attempts; legacy bound failure; and unbound regression. Migration contract tests cover source/projection locks, claim-time revalidation, audit, security, and absence of a second Storage or hard-delete capability. Existing lifecycle, deletion/tombstone, projection, Offer, Execution, Correction, Knowledge and Evidence suites remain regression gates.

## Remaining Limits

No retention duration, automatic scheduler, customer deletion request workflow, hard delete, new Storage architecture, WhatsApp, Vision, AI, Planner, or readiness feature is implemented. Physical deletion still depends on the existing server-only adapter and recovery semantics. Legacy projects require a separate explicit reconciliation package; they are intentionally not inferred safe.

## Status

- **PERSISTENT CORRECTION AUTHORITY — IMPLEMENTED**
- **PERSISTENT OFFER AUTHORITY — IMPLEMENTED**
- **PERSISTENT EXECUTION AUTHORITY — IMPLEMENTED**
- **AUTHORITATIVE MEDIA DEPENDENCY PROJECTION — IMPLEMENTED**
- **PROJECTION COMPLETENESS / DRIFT — IMPLEMENTED**
- **FINAL EVIDENCE-BOUND DELETE ELIGIBILITY GATE — IMPLEMENTED**
- **FINAL DELETE CLAIM REVALIDATION — IMPLEMENTED**
- **EVIDENCE-BOUND READY MEDIA DELETE — ENABLED ONLY FOR FULLY AUTHORITATIVE ELIGIBLE FLOWS**
- **LEGACY EVIDENCE-BOUND DELETE — FAIL-CLOSED**
- **ACTIVE OFFER DELETE — PROHIBITED**
- **ACTIVE EXECUTION DELETE — PROHIBITED**
- **OPEN CORRECTION DELETE — PROHIBITED**
- **HOLD BYPASS — PROHIBITED**
- **RETENTION DURATION — NOT CONFIGURED**
- **AUTOMATIC RETENTION SCHEDULER — NOT IMPLEMENTED**
- **CUSTOMER DELETION REQUEST WORKFLOW — NOT IMPLEMENTED**
- **WHATSAPP — NOT IMPLEMENTED**
- **VISION — NOT IMPLEMENTED**
- **OVERALL PRODUCT — NOT PRODUCTION READY**
