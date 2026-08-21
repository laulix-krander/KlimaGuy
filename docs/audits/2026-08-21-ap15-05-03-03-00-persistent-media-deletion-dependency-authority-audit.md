# AP-15-05-03-03-00 — Persistent Media Deletion Dependency Authority Audit

## 1. Audit Metadata

| Feld | Wert |
|---|---|
| Audit-ID | `KG-AUDIT-2026-08-21-AP15-05-03-03-00-PERSISTENT-MEDIA-DELETION-DEPENDENCY-AUTHORITY-V1` |
| Datum | 2026-08-21 |
| Branch | `codex/audit-ap15-05-03-03-persistent-deletion-dependencies` |
| Baseline | `4f8b0d068387775166ada77efbe0d0732ec2b4ef` (`work`) |
| Paket | AP-15-05-03-03-00, ausschließlich Audit/Architektur |
| Ergebnis | **READY FOR OWNER DECISION** |

Vollständig zugrunde gelegt wurden die beiden verbindlichen Audits AP-15-05-00 und AP-15-05-03-00 einschließlich ihrer Ergebnisabschnitte AP-15-05-01, AP-15-05-02, AP-15-05-03-01 und AP-15-05-03-02. Zusätzlich wurden die aktuelle Project-Media-/Evidence-/Lifecycle-/Delete-Implementierung, alle Migrationen, Projectstatus und -actions sowie die komplette Conversation-Intelligence-Domain geprüft. Repository-Wahrheit wird von Zielarchitektur und Ownerentscheidungen getrennt.

## 2. Scope

Fragestellung: Welche kleinsten persistenten Autoritäten müssen existieren, damit ein Evidence-gebundenes Medium nicht mehr wegen unbekannter fachlicher Abhängigkeiten gesperrt ist? Das Ergebnis ist ein Plan, keine Freigabe zur Löschung und keine Implementierung. Nicht Gegenstand sind Retentiondauer, Customer-Deletion-Policy, WhatsApp-, Vision- oder Workspace-Implementierung.

## 3. Current Deletion Architecture

`project_media` ist die persistente Medien-/Locatorautorität. `project_evidence` gibt einem aktiven, fertigen Bild eine getrennte opaque Evidence-Identität; zusammengesetzte FKs halten es projektgleich. `project_media_lifecycle` hält Retention, Eligibility, Hold, Policy, Revision und seit AP-15-05-03-02 den Execution-State. Die Eligibility-RPC sperrt die Lifecyclezeile, liest Media und aktiven Projectstatus und blockiert jedes gebundene Evidence wegen unbekannter Offer-/Observation-/Proposal-/Review-/Correction-Autoritäten.

Die Ready-Delete-Claim-RPC sperrt in dieser Reihenfolge Projekt, Media, Lifecycle und aktiven Attempt. Sie verlangt `projects.status='closed'`, `ready`, physisch nicht absent, `deletion_eligible + eligible`, Policy, keinen Hold, passende Revision und derzeit ausdrücklich **kein** `bound` Evidence. Danach gilt: persistentes Intent/Lease → schmaler server-only Storage-Delete → Storage-Markierung → atomare DB-Completion. Completion erzeugt pro Evidence einen locatorfreien Tombstone, setzt Media absent/soft-deleted, Lifecycle `physically_deleted`, erhöht die Revision und schließt den Attempt. Reconciliation deckt unklare/fehlgeschlagene Zwischenzustände ab.

Galerie und Signed-URL-Pfad verlangen `ready`, aktiv und `physical_state=present`; Evidence-Binding verlangt zusätzlich Lifecycle `idle`. Pending/failed Orphan Cleanup ist eine separate Uploadhygiene-Pipeline und darf nicht als Ready-Media-Retentionautorität verwendet werden. Die physische Ausführung ist recoverbar, aber ihre fachliche Evidence-Freigabe bleibt korrekt fail-closed.

## 4. Current Dependency Matrix

Die Matrix beschreibt exakt Eligibility aus AP-15-05-03-01 und Claim aus AP-15-05-03-02. „DB“ meint den produktiven RPC-Pfad; der pure Contract besitzt zusätzlich abstrakte `offer_state`/`dependency_state`-Inputs, die heute keinen produktiven Adapter haben.

| Gate | Heutige Daten/Entscheidung | Autorität | persistent | Enforcement | unknown/fail-closed |
|---|---|---:|---:|---|---|
| Project state | `projects.status`; nur exakt `closed` passiert | ja, aber nur Project-Workflow | ja | DB Eligibility + Claim; Service-Transitionen | alle anderen blockiert; kein Reopen |
| Offer state | keine Offer-/Quote-Tabelle; pure Domain kennt abstrakt `unknown/open/closed` | nein | nein | DB setzt bei bound Evidence `offer_state_unknown`; Claim verbietet bound Evidence | ja / ja |
| Evidence binding | `project_evidence(project_id, project_media_id, binding_status)`; aktueller Insert nur `bound` | ja | ja | FK, checks, RLS, Eligibility/Claim query | bound führt heute zu unknown / ja |
| Observation state | immutable Domain-`EvidenceObservation`, Fixtures/Simulator | nein | nein | Zod/pure Domain; nicht Delete-DB | ja / ja |
| Proposal state | Domain-`KnowledgeClaimProposal`/Mappingresult | nein | nein | Zod/pure Domain; nicht Delete-DB | ja / ja |
| Review state | lokales `DescriptiveClaimReviewState`, vom Caller gelieferte Proposal-Liste | nein | nein | pure/synthetic, admin actor im Contract | ja / ja |
| Correction state | positive-only Konfliktresultate/Supersessionlogik, keine produktive Case-Autorität | nein | nein | pure/synthetic | ja / ja |
| Hold | `project_media_lifecycle.hold_status` | ja | ja | DB checks, CAS, Eligibility + Claim | kein Hold passiert; fehlende Lifecyclezeile blockiert |
| Lifecycle policy | `policy_version`, nur `customer_photo_retention_v1`; keine Dauer | State ja, Zeitpolicy nein | ja/ nein | DB check, Eligibility + Claim | null blockiert |
| Retention state | Lifecycle `protected/retention_pending/deletion_eligible/deletion_blocked` | ja | ja | DB check, CAS, Eligibility + Claim | nur `deletion_eligible` passiert |
| Eligibility snapshot | status + reason array | abgeleitet | ja | CAS-Evaluation; Claim revalidiert | stale Revision blockiert |
| Lifecycle revision | bigint, initial 1, CAS | ja | ja | Configure/Evaluate/Claim/Completion | mismatch blockiert |
| Execution/physical state | Lifecycle execution + Media physical state | ja | ja | locks, trigger, binding/read/claim/completion | pending/absent verhindern neue Bindung/URL |
| Deletion attempt | Attempt, token, status, lease, expected Revision | ja | ja | DB/RLS/RPC | aktive/stale Attempts kontrolliert |
| Tombstone | `project_evidence_tombstones` nach Completion | ja für Unverfügbarkeit | ja | DB FK/unique/RLS/completion | beweist keine frühere Dependency-Freigabe |

Wichtig: Der pure Evaluator kann `offer_state='closed'` und `dependency_state='closed'` bewerten; das ist nur ein Contract. Die produktive DB hat keine Quelle, die diese Werte für Evidence-bound Media legitim liefert. Die Claim-RPC ist strenger und lehnt jede aktive `bound`-Zeile unmittelbar ab. Fehlende Daten werden nirgends als `false` interpretiert.

## 5. Terminology

- **Dependency Authority:** Persistente, integritätsgeschützte Quelle, die zuverlässig und versioniert aussagt, ob ein konkreter fachlicher Prozess offen oder abgeschlossen ist.
- **Dependency Snapshot:** Zu einem Zeitpunkt abgeleitete, revidierbare Sicht auf Autoritäten; niemals ohne Vollständigkeitsnachweis selbst die Ursache der Wahrheit.
- **Media Dependency:** Ein fachlicher Prozess, der für Interpretation, Entscheidung, Korrektur, Angebot oder Ausführung noch auf das Originalmedium angewiesen ist.
- **Open Dependency:** Autoritativ offener Zustand; blockiert Löschung.
- **Closed Dependency:** Autoritativ terminaler Zustand; blockiert aus genau dieser Ursache nicht mehr. Andere Gates bleiben wirksam.
- **Unknown Dependency:** Autorität fehlt, Projektion ist unvollständig/stale oder Zustand ist nicht bestimmbar; blockiert Löschung.
- **Evidence Usage:** Projektgleiche, persistente Relation zwischen Evidence/Media und einer konkreten Intelligence-Verarbeitung samt Provenienz und Lifecycle.

## 6. Architecture Variants

Bewertung `++` stark, `+` gut, `0` gemischt, `-` schwach, `--` ungeeignet; MVP bezeichnet geringe Komplexität positiv.

| Kriterium | A Lifecycle-Flags | B Workflowtabellen | C nur Dependencytabelle | D Event Sourcing | E Hybrid |
|---|---:|---:|---:|---:|---:|
| Datenintegrität | -- | ++ | 0 | + | ++ |
| Explainability/Audit | - | ++ | + | ++ | ++ |
| Idempotenz/Replay | 0 | + | + | ++ | ++ |
| Race/CAS | - | + | + | + | ++ |
| RLS/FK | 0 | ++ | - bei polymorpher Quelle | + | ++ |
| Wartbarkeit | -- | + | 0 | - | + |
| WhatsApp/Vision | - | + | + | + | ++ |
| Reviewer Workflow | -- | ++ | - | 0 | ++ |
| Delete-Query/Recovery | + | 0 | ++ | - | ++ |
| MVP-Komplexität | ++ | + | + | -- | 0/+ |

**A** dupliziert Wahrheit im Lifecycle und macht dessen Flags ohne Ursprungsrecord unerklärbar. **B** besitzt richtige fachliche Autoritäten, kann im Delete-Claim aber viele Joins und Typregeln benötigen. **C** ist als einzige Wahrheit fachlich zu dünn und lädt zu ungesicherten `source_type + uuid`-Referenzen ein. **D** verlangt fehlerfreie Projektion/Rebuild, Eventreihenfolge und deutlich mehr Betriebsreife als vorhanden; aktuelle Events sind nur pure abgeleitete Objekte. **E** kombiniert B mit einer kleinen, rekonstruktierbaren Delete-Projektion und ist empfohlen.

## 7. Recommended Architecture

Empfohlen ist **Hybrid E**:

1. Fachliche Workflowtabellen sind primäre Autorität: Interpretation/Attempt, Observation, Proposal, Review/Apply und Correction; Offer/Execution nur nach separater Klärung des bestehenden Projectstatus.
2. `project_media_dependencies` ist eine kleine, DB-seitige, aus diesen Quellen deterministisch rekonstruierbare Projektion für effizientes `NOT EXISTS` im Delete-Claim.
3. Lifecycle ist Consumer und hält weiterhin Policy/Hold/Execution/Eligibility-Snapshot, niemals Intelligence-Wahrheit.
4. Eine Vollständigkeits-/Projektionsrevision muss belegen, dass alle relevanten Source-Records projiziert wurden. Fehlt sie oder ist sie stale, bleibt `dependency_state_unknown`.
5. Source-State und Projection-Änderung erfolgen in derselben DB-Transaktion. Rebuild/Consistency Check ist Recovery, nicht eine temporäre Freigabe.

## 8. Offer / Quote Authority

Es gibt **keine** persistente Quote- oder Offer-Entity, keine Offer-ID, Revision, Artefakt-/Generationserfolg, Acceptance-Zeile oder Offer-History. Einzig `projects.status` trägt die Werte `quote_draft`, `quote_sent`, `accepted`, `rejected`, `closed`. UI-Label und Statusname sind keine zusätzliche Autorität.

Der Service erlaubt `technical_review → quote_draft`, `quote_draft/human_review → quote_sent`, `quote_sent → accepted|rejected|closed`, `accepted|rejected → closed`. Statusupdates sind optimistisch mit `WHERE status=current`, aber ohne numerische Revision und ohne fachliches Offer-Record. Repositoryseitig bedeutet `quote_sent` nur, dass der Projectstatus so gesetzt wurde; es gibt keinen Nachweis, dass ein Angebot erfolgreich erzeugt, versioniert oder tatsächlich zugestellt wurde. Draft, created, sent, open, accepted, rejected/closed und superseded sind daher **nicht vollständig und nicht revisionssicher als Offer-Lifecycle unterscheidbar**. Supersession fehlt ganz.

## 9. Project Authority

`projects.status` ist persistent, enum-geschützt und für grobe Projektphasen autoritativ. `closed` ist in der Domain terminal (`[]`); ein Reopen ist über den kontrollierten Statusservice nicht erlaubt. DB-RLS erlaubt Admin-Updates jedoch allgemein und die Transitionmatrix ist nicht als DB-Trigger erzwungen; Reviewer besitzt ebenfalls eine allgemeine Update-Policy, deren Guard `status` nicht als verbotenes Feld nennt. Damit ist die Service-Semantik nicht dieselbe wie eine DB-erzwungene, revisionsfähige Project-Lifecycle-Autorität.

`accepted` ist repositoryseitig lediglich „Angenommen“ und kann nur nach `quote_sent` erreicht werden; es gibt keine Order-, Installation-, Execution- oder Completion-Entity. Es darf deshalb nicht als „Media sicher löschbar“ gelesen werden. Im aktuellen Gate blockiert es korrekt als `project_active`. Welche Montage-/Ausführungsabhängigkeit danach besteht, ist unknown.

## 10. Minimum Offer Retention Proof

Heute beweist **kein** Feld/Record „Angebot erfolgreich erstellt“. `quote_draft` beweist nur eine Phase, `quote_sent` nur einen manuell/programmatisch gesetzten Projectstatus. Weder Datei/Timestamp/UI noch der Name darf als Heuristik dienen. Vor Evidence-bound Delete ist daher eine Ownerentscheidung und ein separates kleines **Offer Authority Baseline** erforderlich, außer ein weiteres Audit definiert und DB-erzwingt `projects.status` neu als ausreichenden Beweis. Empfehlung: keine vorsorgliche große Offer-Tabelle, sondern zuerst Minimalcontract für Offer-ID/Revision, Erzeugungserfolg und geschlossenen/open Status bestimmen.

## 11. Evidence Interpretation Authority

Persistierbar ableitbar ist nur `available_unanalysed`: ein `bound` Evidence verweist auf ein fertiges, vorhandenes Media. Danach existiert keine produktive Auswertungsautorität.

Vergleich: (A) `project_evidence.interpretation_status` ist klein, vermischt aber wiederholte Attempts/Versionen mit Identity; (B) `evidence_interpretations` erklärt Attempt, Modell/Actor, Idempotenz und Terminalität; (C) Observations allein können „erfolgreich ohne Observation/insufficient/wrong target“ nicht beweisen; (D) generischer Processing State verliert fachliche Semantik. Empfehlung ist die kleinste sichere Variante **B**: eine schmale Interpretation-Run/-Usage-Autorität; keine Raw-Ausgabe. Sie unterscheidet mindestens pending, completed-with-observations, completed-without-observation/insufficient und invalidated/failed-retryable. Exakte Statusnamen sind Folgepaketentscheidung.

## 12. Observation Persistence

Observation-Persistenz ist erforderlich. Minimaler fachlicher Record:

- `observation_id`, `project_id`, `evidence_id` mit projektgleicher FK;
- kontrollierter `observation_type` und typed value entsprechend bestehenden Zod-/Registry-Contracts, kein beliebiges JSON;
- `evidence_quality`, `source_actor_class` (`admin|reviewer|ai` nach bestehendem Contract), `observed_at`;
- Workflowstatus, `supersedes_observation_id`/Invalidation-Referenz, `revision`, `created_at`, `updated_at`;
- Interpretation-/Idempotency-Provenienz, soweit zum Replay nötig.

Ausgeschlossen: Bytes, Raw Image Data, Signed URL, Bucket/Pfad, Provider-URL/-Payload, E-Mail, Telefonnummer und sonstige PII. Eine Observation referenziert Evidence, nicht erneut das Originalmedium.

## 13. Observation Lifecycle

Bestehende Domainobservations sind immutable Befunde, besitzen aber keinen Workflowstatus. Nicht blind eine neue Liste übernehmen. Minimal muss die Autorität unterscheiden:

- processing/pending: offen;
- recorded und noch nicht vollständig gemappt/terminal klassifiziert: offen;
- mapped-to-proposal: Observation selbst kann geschlossen sein, Proposal übernimmt die offene Dependency;
- observation-only oder insufficient: nur geschlossen, wenn eine explizite terminale fachliche Entscheidung keinen Originalreview mehr verlangt;
- invalidated/superseded: terminal für diese Observation, History bleibt; eine offene Correction kann separat blockieren.

„Observation vorhanden“ ist weder automatisch offen noch geschlossen. Insbesondere `recorded` ohne Mappingausgang bleibt im MVP offen, bis der Ausgang atomar feststeht.

## 14. Proposal Persistence

Proposals müssen persistent sein, weil ein flüchtiges Proposal mit ausstehendem Human Review sonst im Delete-Gate unsichtbar wäre. Minimal: Proposal-ID, Project-ID, typed Claimfelder aus `KnowledgeClaimProposal`, Observation-Provenienz über eine projektgleiche Join-Tabelle, Workflowstatus, based-on/proposed Knowledge-Version, Mappingregelversion, Revision und terminale Zeitpunkte. Keine freien Claim-JSON-Blobs und keine duplizierten Media-Locators.

## 15. Proposal Lifecycle

Workflowstatus und Execution Result werden getrennt. Empfohlene Workflowklassen: `pending_review`, `approved_apply_pending`, `applied`, `rejected`, `insufficient_evidence`, `conflict`, `stale`, `superseded`. Namen bedürfen Folgepaket-Freeze.

- Offen: pending review, approved/apply pending, sowie conflict/stale, solange kein expliziter terminaler Resolution Record existiert.
- Terminal für den Proposal-Blocker: applied, rejected, insufficient evidence, superseded; andere Authorities können weiter blockieren.
- `no_change`, `already_applied`, `invalid_review_context`, `review_not_allowed`, `apply_failed` sind bestehende Ausführungsresultate. Sie dürfen nicht unbesehen als persistente Workflowstatus gelten; `apply_failed` bleibt offen/retryable, invalid context braucht Resolution statt „closed by error“.

## 16. Human Review Persistence

Produktive Review-Autorität ist erforderlich. Minimaler append-only Decision Record: `review_id`, `project_id`, `proposal_id`, interner `actor_id`, kontrollierte Actor Class/Action/Result, `reviewed_at`, `expected_proposal_revision`/expected Knowledge-Version, eigene Revision bzw. eindeutiger Idempotency-Key. Keine E-Mail, keine freie technische Freigabe, keine automatische Offerfreigabe. Aktueller Admin-only Domaincontract und typed Actions (`approve|reject|mark_evidence_insufficient`) sind Ausgangspunkt, nicht bereits Persistenz.

## 17. Review Lifecycle

Die Proposalautorität besitzt den aktuellen Reviewstatus; Reviewentscheidungen bleiben History. `pending_review` blockiert. `approved` schließt erst zusammen mit erfolgreichem atomarem Claim-Apply (`applied`), nicht schon bei Klick. `rejected` und `insufficient_evidence` können den Review-/Proposalblocker schließen, wenn Observation/Interpretation terminal ist. `conflict_detected`, `stale_state` und `apply_failed` bleiben offen oder eröffnen einen Resolution-/Correction-Fall. Ein Replay darf keine zweite Entscheidung/Claimmutation erzeugen.

## 18. Claim Apply Boundary

`approved + claim applied` schließt die Proposal-/Reviewabhängigkeit. Es macht das Medium nicht allein löschbar. Erforderlich bleiben: Interpretation/Observation terminal, keine Correction, Offer-/Project-/Execution-Gate sicher, Retention/Policy/Hold/Lifecycle sicher. Ein applied positive-only descriptive Claim darf nach Löschung mit Evidence-Tombstone-Provenienz fortbestehen; das Original muss nicht unbegrenzt nur wegen des Claims gespeichert werden.

## 19. Correction / Invalidation

Vor der ersten Freigabe Evidence-bound Media ist persistente Korrekturautorität erforderlich, mindestens um offen versus abgeschlossen zu unterscheiden:

- Evidence invalidated: Binding/Evidence ist fachlich unbrauchbar; laufende Usages müssen beendet/invalidiert werden.
- Observation invalidated: Observation terminal ungültig, abhängige Proposals werden atomar superseded/invalidated.
- Proposal superseded: terminale Proposalhistory.
- Claim correction open: eigener offener Case, blockiert Delete.
- Claim correction completed: Case terminal; korrigierter/supersedierter Knowledge-State und Dependencies atomar aktualisiert.

Ein bloßes `invalidated`-Flag auf Evidence ersetzt keinen laufenden Correction Case. Ohne Correction-Autorität bleibt Dependency unknown.

## 20. Positive-only Conflict Boundary

Die bestehenden descriptive Facts erzeugen ausschließlich positive `true`-Claims. Das bleibt bestehen. Widerspruch wird nicht als künstlicher `true vs false`-Claim modelliert, sondern durch Evidence-/Observation-Invalidation, eine neuere superseding Observation, Proposal-Supersession oder einen expliziten Claim-Correction-Workflow. Der offene positive-only Conflict-Blocker im Synthetic E2E ist damit eine echte fehlende Autorität, kein technischer Resultcode, der Delete erlauben darf.

## 21. Generic Media Dependency Projection

Empfohlen ist später `project_media_dependencies` als **abgeleitete** Delete-Projektion, beispielsweise mit `dependency_id`, `project_id`, `project_media_id`, optional `evidence_id`, geschlossenem Dependencytyp, `status`, `opened_at`, `resolved_at`, `source_version` und einer integritätsgesicherten Source-Referenz. Zweck: effiziente, erklärbare Claim-Prüfung und Adminsicht.

Die Projektion ist nie alleinige fachliche Wahrheit. Jeder Record muss entweder transaktional mit seiner Source geschrieben/aufgelöst oder deterministisch rekonstruiert werden. Ein Completeness Marker/Projection Revision bindet sie an Source-Versionen. Abweichung, unbekannter Typ oder fehlende Projektion führt zu unknown, niemals zu „keine Zeile = sicher“.

## 22. Dependency Types

Geschlossene MVP-Typen nur für tatsächlich vorhandene Source Authorities:

| Kandidat | Empfehlung |
|---|---|
| `evidence_interpretation` | ja, pending Interpretation/Mapping |
| `observation_review` | nur falls eine Observation direkt Review benötigt; sonst nicht neben Proposal doppeln |
| `claim_proposal_review` | ja |
| `claim_apply` | ja oder Teil des Proposaltyps bis `applied` |
| `claim_correction` | ja |
| `offer_preparation` | erst mit Offer Authority |
| `project_execution` | erst mit Execution Authority |

Nicht alle Kandidaten vorsorglich implementieren. Typregistrierung ist versioniert; unbekannte Types machen den Evaluator unvollständig/fail-closed.

## 23. Dependency Status

Projektion: `open | resolved | invalidated`. `resolved` bedeutet normal terminal, `invalidated` terminal durch ungültige Source; beide bleiben auditierbare History. `unknown` ist **kein** persistenter Erfolgsstatus. Unknown ist Evaluatorresultat bei fehlender/unvollständiger Autorität oder Projection-Drift.

## 24. FK Integrity

Alle Source-Records tragen `project_id`; zusammengesetzte Unique/FKs erzwingen `(project_id,evidence_id)`, `(project_id,observation_id)`, `(project_id,proposal_id)` und `(project_id,project_media_id)`. Cross-Project-Dependency muss in der DB unmöglich sein.

Ein einzelnes polymorphes `source_type + source_record_id` besitzt keinen echten FK und wird verworfen. Bessere Optionen: (1) je Dependencytyp nullable typed FK mit Check „genau eine“; (2) typisierte Projection-Untertabellen; (3) eine gemeinsame, fachlich neutrale `workflow_dependency_sources`-Identity, die jede Source transaktional besitzt. Für das kleine MVP ist Option 1 am erklärbarsten; bei mehr Typen Option 3 auditieren. Evidence-ID ist nullable nur für projectweite Offer/Execution-Dependencies, Media/Project bleiben required.

## 25. Events vs State

Die heutigen Conversation Events werden pure aus einem Applyresultat abgeleitet und sind nicht persistent. Für das MVP sind Workflowtabellen aktuelle Autorität; Events dienen später als append-only Audit/History und Integrationsausgang. Event Sourcing als Primärautorität würde Reihenfolge, Rebuild, Versionierung und Betriebsmechanik voraussetzen, die das Repository nicht besitzt. Delete darf nicht durch Replay eines Eventstreams zur Laufzeit entschieden werden.

## 26. Idempotency

Keine exactly-once-Behauptung. Persistente Operationen brauchen scopegebundene Idempotency Keys/Unique Constraints: Interpretationrun, Observation ingestion, Mappingproposal, Reviewcommand und Apply. Duplicate delivery liefert denselben Record bzw. no-change; Payloadkonflikt unter gleichem Key ist ein Fehler. Replay nach Partial Failure setzt den Workflow fort. Stale Versions werden per CAS abgelehnt und neu geplant, nicht überschrieben.

## 27. Atomicity

Notwendige Transaktionsgrenzen:

1. Interpretation starten + offene Interpretation-Dependency.
2. Observation(s) persistieren + Interpretation-Ausgang + Mappingstatus/Dependency.
3. Proposal persistieren + Observation terminal/übergeben + offene Proposal-Dependency.
4. Review decision + Proposalterminalität/Apply-pending unter CAS.
5. Approval + Claimtransition + Proposal `applied` + Dependency resolved (wenn Apply synchron bleibt); andernfalls Approval lässt `claim_apply` offen.
6. Correction öffnen/abschließen + betroffene Source-/Claim-/Dependencytransition.
7. Offer Preparation öffnen, bevor Media gelesen wird; Offer-Erfolg/Terminalität + Dependencytransition.

Kein Source-Commit darf erfolgreich sein, während die zugehörige offene Dependency fehlt. Storage bleibt wie heute ein recoverbarer Side Effect, nicht Teil einer erfundenen globalen Transaktion.

## 28. CAS / Revision

Interpretation, Observation, Proposal/Reviewaggregate, Correction und später Offer/Execution erhalten monotonische Revisionen. Review verlangt expected Proposal- und Knowledge-Version; Apply erhöht die autoritative Knowledge-Version genau einmal. Projection `source_version` muss der Source-Revision entsprechen. Delete Claim verwendet die aktuelle Lifecycle-Revision **und** revalidiert aktuelle Authorities/Projection-Vollständigkeit unter Lock. CAS schützt vor stale Worker/Reviewer; Idempotency schützt Replay, beides ist nötig.

## 29. Delete Claim Integration

Zielquery DB-seitig und set-basiert, keine Service-N-Schleife:

1. Projekt, Media, Lifecycle sperren; aktuellen Project-/Offer-/Executionstate lesen.
2. Physical/Execution, Policy, Hold, Retention, Eligibility und Revision revalidieren.
3. Evidence-Projektgleichheit und Authority-/Projection-Vollständigkeit prüfen.
4. `NOT EXISTS (authoritative open dependency for project_media_id)`.
5. Erst dann Attempt/Execution Intent atomar setzen.

Die Eligibility-RPC bleibt Snapshot/Explainability; Claim vertraut ihr nicht allein. Bis Offer und Intelligence Authorities vollständig sind, bleibt der bestehende `bound Evidence => reject`-Fallback erhalten.

## 30. Delete vs Observation Race

Beide Pfade sperren dieselbe Lifecycle-/Media-Ausführungsgrenze in definierter Reihenfolge. Processing Start prüft `physical_state=present`, `deletion_execution_state=idle`, aktives Evidence und eröffnet seine Dependency in derselben Transaktion. Gewinnt Delete zuerst, ist `deletion_pending` gesetzt und Processing wird abgewiesen. Gewinnt Processing, sieht Claim die offene Dependency und wird abgewiesen. Vision darf niemals erst Bytes lesen und später Dependency registrieren.

## 31. Delete vs Proposal Race

Proposal Creation prüft unter derselben Grenze Media/Evidence und übernimmt atomar die offene Dependency von Interpretation/Observation. Bei `deletion_pending|absent` darf kein neues Proposal gestartet werden. Bereits applied Knowledge bleibt unabhängig vom Original bestehen; es erzeugt nicht still ein neues Media-Dependency.

## 32. Delete vs Review Race

Pending Review blockiert. Review und Claim sperren Proposal/Dependency sowie Media-Gate in kanonischer Reihenfolge und verwenden CAS. Gewinnt Reviewabschluss, sieht Claim danach terminal oder Apply-pending; Apply-pending blockiert. Gewinnt Claim nach zuvor sicher terminalem Workflow, ein verspäteter Review-CAS darf kein Originalreview mehr eröffnen. Kein last-write-wins.

## 33. Delete vs Offer Race

Offer Preparation muss seine persistente Offer-/Media-Dependency **vor** Mediaabruf/Generation atomar eröffnen. Gewinnt es zuerst, blockiert Claim. Gewinnt Claim zuerst, sieht Offer Start `deletion_pending` und startet nicht. Ein nachträglicher Projectstatuswechsel allein ist kein sicherer Schutz.

## 34. Project Reopen

Die kontrollierte Domainmatrix erlaubt Reopen aus `closed` nicht. Gleichwohl erzwingt die DB diese Matrix nicht vollständig; direkte erlaubte Updates könnten Status verändern. Delete Claim liest/sperrt deshalb weiterhin den aktuellen Projectrecord. Soll Reopen produktiv möglich werden, braucht es einen expliziten Transitionrecord/CAS und muss vor neuem Processing prüfen, ob Original bereits tombstoned ist. Keine Annahme „einmal closed, immer safe“ außerhalb derselben Claimtransaktion.

## 35. Terminal Dependencies

Terminale Workflowrecords bleiben History; offene Projectionrows dürfen auf `resolved|invalidated` wechseln oder nach sicherer Historisierung aus einem partiellen Open-Index verschwinden. Delete prüft ausschließlich offene Dependencies plus Completeness. Terminal bedeutet nur: dieser eine Grund blockiert nicht mehr.

## 36. Tombstone Boundary

Nach physischem Delete bleiben `project_evidence`, Media-Metadatenzeile und `project_evidence_tombstones`. Spätere Observations/Claims referenzieren Evidence und erkennen über Tombstone/Media physical state `evidence_tombstoned`; sie benötigen keine zusätzliche direkte Media-FK und speichern keinen Locator. Bereits terminale/applied Knowledge-Provenienz kann bestehen. Offene Dependencies hätten Completion verhindert und dürfen nicht durch Tombstone „gelöst“ werden.

## 37. Re-review After Tombstone

Eine neue Originalprüfung ist bei `absent` unmöglich. Workspace/Service liefert explizit `source_media_unavailable`/`evidence_tombstoned`, zeigt keinen stillen Signed-URL-Fallback und lässt keine Reviewaction zu, die Originalsicht voraussetzt. Korrektur auf Basis neuer Evidence kann als neuer Workflow entstehen; das alte Original wird nicht als verfügbar dargestellt.

## 38. Retention Duration Boundary

Dieses Audit definiert keine Tage, Monate, Friststarts oder Rechtsgrundlage. Dependencyabschluss beantwortet „fachlicher Prozess offen?“, Retention Policy beantwortet „darf jetzt gelöscht werden?“. Beides bleibt getrennt; `customer_photo_retention_v1` enthält heute keine Dauer und blockiert keine fehlende Owner/Legal-Konfiguration weg.

## 39. Customer Deletion Boundary

Customer Deletion Request bleibt ein separater Policy-/Legal-Workflow mit möglichen Holds, gesetzlichen/vertraglichen Overrides und eigener Auditspur. Er wird nicht als normaler Dependencytyp oder normale Action Reason freigeschaltet. Dieses Audit ändert daran nichts.

## 40. WhatsApp Boundary

Vor WhatsApp-Medieningestion müssen in Reihenfolge mindestens existieren: persistente Conversation → persistente inbound Message/Transport-Idempotency → Project Media Reservation/Storage/Finalize → Evidence Identity/Binding → Processing/Interpretation-Dependency. Dieselbe Transaktion kann DB-Schritte koppeln; Storage/Webhook brauchen recoverbare Zustände. Intelligence erhält nur interne IDs. Ohne Messagepersistenz sind Replay, Duplicate Delivery und Provenienz nicht sicher; daher keine WhatsApp-Ingestion vorher.

## 41. Vision Boundary

Vor Vision: persistente Evidence Identity, Analysis Eligibility, Interpretation/Processingstatus, Observationpersistenz und Lifecycle-/Executiongate. Start registriert Dependency atomar und lehnt Evidence/Media bei `deletion_pending`, `absent`, `deletion_failed` ohne kontrollierte Recovery, tombstoned oder invalidated ab. Visionausgabe wird validiert und nicht ungeprüft gespeichert; keine Signed URL, Raw Image Data oder Locator in Workflowrecords.

## 42. Reviewer Workspace Boundary

Lauries späterer Workspace liest dieselben Authorities, keine UI-Schattenzustände: Evidence + Verfügbarkeit/Tombstone, Interpretation, typed Observation/Quality, Proposal/Provenienz, Reviewstatus/History, Claim-Effekt/Knowledge-Version, Correction und erklärbare offene Dependencies. Actions verwenden expected revisions und interne Actor-ID. Bei fehlendem Original erscheint `source_media_unavailable`; keine erneute Freigabe auf unsichtbarer Quelle.

## 43. Quality Boundary

Persistente Review-/Correctionhistory kann später strukturierte Quality Cases und Metriken speisen. Metrics sind nicht Teil dieses Audits. Produktoptimierung verwendet minimierte strukturierte Fälle/Reason Codes, nicht unbegrenzte Originalfotoretention. Keine PII oder Rohmedien werden in Qualityrecords kopiert.

## 44. Minimal MVP Authority

Bevor Evidence-bound Media erstmals sicher eligible werden kann, ist exakt erforderlich:

1. schmale persistente Interpretation/Usage-Autorität, die auch „terminal ohne Observation“ beweist;
2. persistente typed Observations mit terminaler Mapping-/Invalidationsemantik;
3. persistente typed Proposals und Human-Review/Claim-Apply-State;
4. persistente open/completed Correction-Autorität;
5. abgeleitete, vollständigkeitsgeprüfte Media-Dependency-Projektion und atomare Sourcewrites;
6. minimaler persistenter Offer-Erzeugungs-/Open-/Terminalnachweis sowie geklärte Executionsemantik nach `accepted`;
7. DB-Claim-Integration mit locks/CAS/`NOT EXISTS`, while keeping unknown fail-closed.

Nicht erforderlich für dieses erste sichere Fenster: WhatsApp, Vision, Workspace, Metrics, Event Sourcing, konkrete Retentiondauer-Implementierung oder eine umfassende Angebotsdokumentverwaltung. Allerdings bleibt reale Löschung ohne freigegebene Retentionpolicy weiterhin blockiert.

## 45. Failure Matrix

„Authority“ bezeichnet Ist oder benötigten Zielrecord. `U` = unknown. Project/Offer/Policy/Hold können unabhängig immer blockieren.

| Fall | Persistente Authority heute / benötigt | offene Dependency? | Delete blockiert? | U? | Required next state |
|---|---|---:|---:|---:|---|
| A Evidence bound, no interpretation | Evidence ja; Interpretation fehlt | ja (fail-closed) | ja | ja | Interpretation atomar starten oder explizit terminal klassifizieren |
| B Interpretation pending | benötigt: Interpretation | ja | ja | heute ja | terminaler Interpretationausgang |
| C completed, no Observation | fehlt; Interpretationterminalgrund nötig | bis explizit insufficient/no-observation terminal | ja | heute ja | validierter terminaler Grund oder Observation |
| D Observation recorded, no Proposal | Observation fehlt; Mappingausgang nötig | ja | ja | heute ja | Proposal oder terminal `observation_only/insufficient/invalidated` |
| E Proposal pending review | Proposal/Review fehlen | ja | ja | heute ja | terminale Reviewentscheidung |
| F Proposal rejected | persistente terminale Decision fehlt | nein für Proposal; andere möglich | heute ja | ja | Source Authorities terminal + Projection resolved |
| G Evidence insufficient | persistente terminale Decision fehlt | nein nur wenn kein Re-review offen | heute ja | ja | explizit terminalisieren/Policy; sonst Review offen |
| H approved, Claim apply pending | Apply-Autorität fehlt | ja | ja | heute ja | Claim atomar apply oder Resolution |
| I Claim applied | Knowledge nur in-memory; Authority fehlt | nein für Proposal | heute ja | ja | persistenter Apply + keine Correction + sichere Offer/Project Gates |
| J Correction opened | Correction fehlt | ja | ja | heute ja | Correction abschließen |
| K Correction completed | Correction fehlt | nein für Correction | heute ja | ja | atomarer corrected Knowledge-/Dependency-State |
| L Original tombstoned | Tombstone vorhanden | keine neue Originaldependency zulässig | bereits gelöscht | nein für availability | `source_media_unavailable`; neue Evidence für neue Review |
| M Offer draft | nur `projects.quote_draft` | ja | ja | Offersemantik ja | Offer Authority: generation success/terminal |
| N Offer created | kein beweisender Record | unbekannt/offen | ja | ja | persistenter Offer-Erzeugungserfolg + Status |
| O Offer sent/open | nur `quote_sent`, keine Offerentity | ja | ja | Detail ja | accepted/rejected/closed Authority |
| P Offer accepted | nur `accepted`; Execution fehlt | ja/unknown execution | ja | ja | persistente Executionterminalität/Ownerregel |
| Q Project closed no order | `closed`, aber no-order/Offerbeweis fehlt | Offer unknown | ja bei Evidence | ja | Offer terminal no-order Authority |
| R Project reopened | Service verbietet; DB nicht vollständig | bei Reopen neu bewerten | Claim muss blockieren | semantisch ja | explizite Reopen-Autorität + aktueller locked Gate |

## 46. Owner Decisions

Status: `recommended` = Architekturentscheidung empfohlen; `owner_required` = Produktsemantik fehlt; `followup_freeze` = Detail im Folgepaket festzuschreiben.

| # | Entscheidung | Varianten | Empfehlung | Risiko | Status |
|---:|---|---|---|---|---|
| 1 | Workflowtabellen vs Flags | Flags / Tabellen | Tabellen | duplizierte Wahrheit | recommended |
| 2 | generische Projection | nein / ja | ja, klein | Querykomplexität vs Drift | recommended |
| 3 | Authority der Projection | primär / derived | derived | unerklärbare Löschung | recommended |
| 4 | Observation persistent | nein / ja | ja | unsichtbare Arbeit | recommended |
| 5 | Proposal persistent | nein / ja | ja | Pending Review unsichtbar | recommended |
| 6 | Review persistent | nein / ja | ja | keine Decision Authority | recommended |
| 7 | Correction vor Delete | später / vorher | vorher minimal | bekannte Konflikte gelöscht | recommended |
| 8 | Events authority | primär / History | Workflowstate primär | MVP-Overengineering | recommended |
| 9 | Offer authority ausreichend | Projectstatus / separater Minimalrecord | heute nicht ausreichend; kleines Baselinepaket | Angebotserfolg unbelegt | owner_required |
| 10 | Projectstatus ausreichend | ja / nur Grobgate | nur Grobgate | Offer/Execution vermischt | recommended |
| 11 | `accepted` aktive Execution | safe / active / unknown | unknown, blockieren | Montagemedia verloren | owner_required |
| 12 | `closed` reopen | nie / explizit | Domain heute nie; Produktentscheidung dokumentieren/DB-enforcen | Race/unerwartete Reaktivierung | owner_required |
| 13 | Observation ohne Proposal | closed / open | open bis terminaler Mappingausgang | still verlorener Befund | recommended |
| 14 | rejected schließt Review | nein / ja | ja, Proposalblocker | andere Dependencies übersehen | recommended |
| 15 | insufficient schließt Proposal | immer / nie / explizit terminal | explizit terminal, kein offenes Re-review | blinde Löschung vs Endloshaltung | followup_freeze |
| 16 | applied Claim schließt Media dependency | nie / allein / mit anderen Gates | nur diesen Workflow; andere Gates bleiben | Endloshaltung/vorzeitig | recommended |
| 17 | open Correction blockiert | nein / ja | ja | nicht re-reviewbar | recommended |
| 18 | Tombstone erlaubt Claimretention | nein / reviewed Claims | reviewed/applied ja | Provenienzschwächung | owner_required |
| 19 | Re-review nach Tombstone | still / unavailable / neue Evidence | unavailable; neue Evidence | Phantomreview | recommended |
| 20 | Claim `NOT EXISTS` | Service loop / DB | DB + completeness | Race/N+1 | recommended |
| 21 | FK design | polymorph / typed / common source | typed MVP, common source später prüfen | dangling/cross-project | followup_freeze |
| 22 | CAS/versioning | optional / überall | überall fachlich mutable | stale write | recommended |
| 23 | Source+Dependency write | eventual / transaction | transaction | Gate-Lücke | recommended |
| 24 | Vision bei deletion state | erlauben / blockieren | blockieren | Analyse nach Claim | recommended |
| 25 | WhatsApp Message first | optional / required | required | Replay/Provenienz | recommended |
| 26 | Workspace same records | UI state / Authority | Authority | Schattenwahrheit | recommended |
| 27 | Quality same history | separate raw / Reviewhistory | minimierte Reviewhistory | Medienzweckausweitung | recommended |
| 28 | erstes Paket | alles / Observation baseline | Interpretation/Observation baseline | zu großer Commit | recommended |
| 29 | Offer package nötig | nein / kleines Baseline | ja, Zeitpunkt vor Delete integration | Evidence bleibt sonst unknown | owner_required |
| 30 | erste sichere Eligibility | irgendein Terminal / alle Authorities safe | alle relevanten Source Dependencies terminal, Offer/Execution safe, Projection complete, Lifecycle/Policy passes | premature delete | recommended |

## 47. Recommended Packages

Repositorybefund verlangt, die Offersemantik früh zu klären, aber nicht alles in einen Commit zu legen:

1. **AP-15-05-03-03-01 — Persistent Evidence Interpretation / Observation Baseline:** Interpretationusage, typed Observation, lifecycle/processing start gate, Idempotenz/CAS; noch keine Deletefreigabe.
2. **AP-15-05-03-03-02 — Persistent Claim Proposal, Human Review & Correction Baseline:** typed Proposal, Review/Apply, minimal Correction/Invalidation, Knowledge-Version; noch keine Deletefreigabe.
3. **AP-15-05-03-03-OA-00 — Offer/Execution Authority Decision Audit** (klein, vor Implementierung): definiert, ob Projectstatus gehärtet werden kann oder ein Minimalrecord nötig ist; klärt `accepted`, no-order und Reopen. Keine vorsorgliche große Offer-Tabelle.
4. **AP-15-05-03-03-03 — Persistent Media Dependency Projection:** typed FKs, completeness/rebuild, transaktionale Sourceprojektion; Gate bleibt zunächst dark/fail-closed.
5. **AP-15-05-03-03-04 — Offer/Project Authority + Delete Gate Integration:** erst nach Ownerfreeze; DB `NOT EXISTS`, Locks/Races, Eligibility/Claim integration und Production Validation.

Falls OA-00 DB-erzwungen belegt, dass ein gehärteter Projectstatus alle erforderlichen Offer-/Executionaussagen trägt, entfällt eine neue Offer-Entity; das Integrationspaket nutzt diese Authority. Andernfalls implementiert es nur den freigegebenen Minimalrecord.

## 48. Future Tests

Später, nicht in diesem Audit:

- Migration/DB: Observation-/Interpretation-/Proposal-/Review-/Correction-Schemas, closed enums, updated triggers, FKs, projectgleich, RLS/Grants.
- Domain: typed values, positive-only Mapping, terminal/open Semantik, rejected/insufficient/conflict/stale/apply failure.
- Idempotenz: identischer Replay no-change; gleicher Key mit anderem Payload conflict; WhatsApp/Vision duplicate delivery.
- CAS: stale Interpretation, Observation, Proposal, Review, Apply, Correction, Projection und Lifecycle Revision.
- Atomarität: Source+Dependency rollback gemeinsam; Review+Apply+Resolution; Correction; Offer Preparation.
- Projection: rebuild deterministisch, missing/stale/unknown type fail-closed, typed FK, kein Cross-Project.
- Delete Gate: pending processing/review/correction/offer blockiert; terminale Kombination passiert nur bei complete Projection/Offer/Project/Policy.
- Concurrency: Delete-vs-Observation/Proposal/Review/Offer, zwei Deleteworker, Projectstatuswechsel/Reopen.
- Tombstone: applied Claim bleibt, Originalreview meldet unavailable, keine Signed URL; neue Evidence erlaubt neuen Workflow.
- Vision: Start bei deletion_pending/absent/invalidated/tombstoned abgewiesen.
- WhatsApp: Message vor Media/Evidence, duplicate Providerdelivery idempotent.
- Security/Privacy: keine URL, Locator, Bytes, Raw Output oder PII in Workflow/Projection/Audit.

## 49. Production Gates

1. No evidence-bound delete with unknown dependencies.
2. No delete with pending interpretation/observation processing.
3. No delete with pending review or claim apply.
4. No delete with pending correction.
5. No delete during offer preparation or open offer.
6. No delete while active/accepted project may need media; Executionsemantik freigegeben.
7. Dependency records are transactional with authoritative source records or transactionally rebuilt before use.
8. Cross-project dependency is DB-impossible; no unprotected polymorphic source UUID.
9. Delete Claim revalidates current dependencies, completeness, Offer/Project, Policy/Hold, lifecycle Revision and execution state under lock.
10. Processing Start rejects `deletion_pending`, `absent`, invalidated or tombstoned media/evidence.
11. Tombstone/unavailability is visible to re-review; no silent Originalreview.
12. No Signed URL, Storage locator or Provider URL in workflow/dependency records.
13. No raw customer media/AI payload duplicated into workflow/dependency/quality records.
14. CAS, idempotency, duplicate/replay and stale-work behavior are integration-tested; no exactly-once claim.
15. Offer creation success and terminal/no-order state have an owner-approved persistent proof.
16. Retention duration/legal policy and Customer Deletion remain separately approved gates.

## 50. Scope Confirmation

Es wurde ausschließlich diese Auditdatei erstellt. Keine Implementierung, Migration, DB-/SQL-/RPC-/RLS-Änderung, UI, Server Action, Service, Observation-/Proposal-/Review-/Correction-Persistenz, Offer-/Project-/Lifecycle-/Delete-/Storageänderung, WhatsApp-, Vision- oder AI-Änderung, kein Test und keine `package.json`-Änderung. Keine Anwendungstests wurden ausgeführt.

## 51. Status

**Auditstatus: READY FOR OWNER DECISION**

`REAL PROJECT MEDIA EVIDENCE BINDING — IMPLEMENTED`

`MEDIA LIFECYCLE / ELIGIBILITY — IMPLEMENTED`

`RECOVERABLE READY MEDIA DELETION — IMPLEMENTED`

`EVIDENCE TOMBSTONES — IMPLEMENTED`

`PERSISTENT OBSERVATION AUTHORITY — NOT IMPLEMENTED`

`PERSISTENT CLAIM PROPOSAL AUTHORITY — NOT IMPLEMENTED`

`PERSISTENT HUMAN REVIEW AUTHORITY — NOT IMPLEMENTED`

`PERSISTENT CORRECTION AUTHORITY — NOT IMPLEMENTED`

`AUTHORITATIVE DELETE DEPENDENCY PROJECTION — NOT IMPLEMENTED`

`EVIDENCE-BOUND MEDIA DELETE — FAIL-CLOSED WHILE DEPENDENCIES UNKNOWN`

`RETENTION DURATION — NOT CONFIGURED`

`WHATSAPP MEDIA INGESTION — NOT IMPLEMENTED`

`VISION — NOT IMPLEMENTED`

`OVERALL PRODUCT — NOT PRODUCTION READY`

# AP-15-05-03-03-01 — Persistent Evidence Interpretation and Observation Baseline Result

## Ergebnis und Migration

Die additive Migration `202608210004_persistent_evidence_interpretations.sql` führt getrennte, locatorfreie Autoritäten für Interpretation Runs und typed Observations ein. Runs besitzen geschlossene Status-/Result-Code-Checks, `synthetic_observation_v1`, Revision und Zeitpunkte. Observations speichern die bestehende Observation-Type-, Value-, Quality-, Actor- und Interpretation-Status-Semantik verlustfrei in kontrollierten Spalten; Rawpayloads existieren nicht.

## Integrität, Gates und Idempotenz

Zusammengesetzte FKs erzwingen Project→Evidence und Project/Evidence→Run→Observation in derselben Projektdomäne. Start und Recording sperren Evidence, Media und Lifecycle. Nur aktive `bound` Evidence auf `ready`, physisch `present`, logisch aktiv und Lifecycle `idle` ist zulässig; Tombstone, Delete Claim, `absent` und fehlendes Original werden fail closed als `source_media_unavailable` abgewiesen. Ein partieller Unique Index erlaubt pro Evidence/Interpretationsversion nur einen aktiven Run und Start-Replay liefert diesen Run. Ein partieller semantischer Observation-Index verhindert aktive Duplikate.

Target Binding verwendet im TypeScript-Contract die bestehende `TARGET_OBSERVATION_REGISTRY`; die RPC besitzt dieselbe geschlossene Defense-in-depth-Prüfung. Quality bleibt exakt `sufficient_for_observation|partially_sufficient|insufficient|wrong_target|obstructed|ambiguous|invalid`, ohne Confidence. Der Contract ist für `admin|reviewer|ai` vorbereitet, produktive RPC-Ausführung rekonstruiert aber ausschließlich den angemeldeten Admin. Mehrere Observations pro Run sind zulässig. Revision 1 ist die CAS-Baseline; Invalidation/Supersession sind schemafähig, ohne Correction Workflow oder automatische „neueste gewinnt“-Regel.

## Completion, Dependency und Race

`pending|in_progress` ist eine offene Interpretation-Dependency. Explizite Completion validiert Observation-Anzahl; `completed`, `insufficient_evidence` und `invalidated` schließen nur diese Interpretation-Dependency. Fachliches `insufficient_evidence` ohne Observation bleibt strikt von technischem `failed` getrennt. Eine persistente Observation bleibt wegen noch fehlender Proposal-/Review-/Correction-Autoritäten für Media Delete fail closed. Es gibt noch keine `project_media_dependencies`-Projektion und keine Freigabe Evidence-gebundener Löschung. Gegenseitige Row Locks mit Lifecycle/Media verhindern Start nach Delete Claim; ein aktiver Run ist deterministisch als zukünftiger Delete-Blocker ableitbar.

## RLS, Grants, Audit, DTO und Read Service

Beide Tabellen haben RLS. Authenticated erhält nur `SELECT`; Admin-Lesen ist projekt-/aktivitätsgebunden. Mutation erfolgt ausschließlich über `SECURITY DEFINER` RPCs mit festem `search_path`, `auth.uid()` und intern bestimmter Rolle. Es gibt weder allgemeines `ALL` noch direktes Update/Delete. Auditaktionen `interpretation_started`, `observation_recorded`, `interpretation_completed`, `interpretation_insufficient` und `interpretation_failed` enthalten nur opaque IDs, Result, Revision und Timestamp. Strikte schmale DTOs und ein project-scoped Read Service laden Runs und Observations in zwei mengenbasierten Queries ohne Media-ID oder Locator.

## Tests und verbleibende Grenzen

Vitest prüft geschlossene Contracts, Version, Quality, canonical Target Binding, Tabellen/FKs/Indizes, Active-Run- und Duplicate-Schutz, Locks, Physical-/Tombstone-Gates, RLS/Grants, fixed search path, Auditaktionen und Architekturausschlüsse. Bestehende Observation-, Mapping-, Evidence-, Lifecycle-, Tombstone-, Ready-Delete- und Planner-Regressionen bleiben unverändert. Nicht enthalten sind Vision/KI, Storage-Lesen, Signed URLs, Claim-Proposal-, Review-, Apply- oder Correction-Persistenz, Planner-/Readiness-Änderungen, WhatsApp und die authoritative Dependency Projection.

**PERSISTENT EVIDENCE INTERPRETATION AUTHORITY — IMPLEMENTED**

**PERSISTENT OBSERVATION AUTHORITY — IMPLEMENTED**

**REAL MEDIA OBSERVATION RECORDING — IMPLEMENTED**

**AUTOMATIC VISION INTERPRETATION — NOT IMPLEMENTED**

**PERSISTENT CLAIM PROPOSAL AUTHORITY — NOT IMPLEMENTED**

**PERSISTENT HUMAN REVIEW AUTHORITY — NOT IMPLEMENTED**

**PERSISTENT CORRECTION AUTHORITY — NOT IMPLEMENTED**

**AUTHORITATIVE MEDIA DEPENDENCY PROJECTION — NOT IMPLEMENTED**

**EVIDENCE-BOUND DELETE — STILL FAIL-CLOSED BEYOND INTERPRETATION**

**WHATSAPP — NOT IMPLEMENTED**

**VISION — NOT IMPLEMENTED**

**OVERALL PRODUCT — NOT PRODUCTION READY**

# AP-15-05-03-03-02 — Persistent Claim Proposal and Human Review Baseline Result

## Migration, Proposal Authority und Contract

Die additive Migration `202608210005_persistent_evidence_claim_review.sql` führt `evidence_claim_proposals` als aktuelle Workflowautorität und `evidence_claim_reviews` als getrennte append-only Entscheidungshistorie ein. Ein Proposal bindet Project, Evidence, Interpretation Run und konkrete Observation über einen zusammengesetzten FK. Es enthält nur Entity, eine der fünf bestehenden deskriptiven Properties, den typisierten Boolean-Wert `true`, `boolean`, `observed`, `descriptive_fact`, Mapping Rule Version 1, Status, Revision und Zeitpunkte. Raw Media, Locator, URL, Prompt, Providerdaten, Kundentext und PII werden nicht gespeichert.

Die geschlossene langlebige Statusmenge lautet `pending_review | approved_apply_pending | applied | rejected | insufficient_evidence | conflict | stale | superseded`. Technische Resultcodes bleiben davon getrennt. Der semantische Unique Key aus Observation, Mappingversion, Entity und typisiertem Claim verhindert doppelte pending Proposals; Replay liefert die bestehende Row und verändert deren Revision nicht.

## Proposal Creation, Mapping Reuse und Integrität

Der serverseitige Service authentifiziert den Actor, prüft die zentrale getrennte Capability und ruft ausschließlich den bestehenden puren `proposeKnowledgeClaimFromObservation(...)` Mapper auf. Nur dessen `claim_proposal` darf die atomare RPC-Grenze erreichen. Observation-only, Human-Review-ohne-Claim, Site Check, bad evidence, falsches Target und unsupported Resultate erzeugen keine Proposal Row. Die RPC rekonstruiert Observation, Evidence, Target und Media selbst; ihre explizite Fünfer-Allowlist ist Defense in Depth und keine zweite frei aufrufbare Claim Engine. Clientinput ist ausschließlich `observation_id`; Property, Wert, Strength, Epistemik, Project, Evidence und Actor kommen nie vom Client.

Observation muss `recorded`, passend zum Project/Evidence/Run, qualitativ `sufficient_for_observation`, fachlich `observed` und positiv sichtbar sein. Row Locks auf Observation, Evidence, Media und Lifecycle schließen Proposal-vs-Delete und Proposal-vs-Invalidation. Tombstone, logisch gelöschtes oder physisch abwesendes Medium sowie nicht-idle Delete Lifecycle enden fail closed als `source_media_unavailable`. Cross-Project-Bindungen werden über zusammengesetzte FKs auch in der Datenbank verhindert.

## Review Authority, Actions, CAS und History

Der schmale Reviewcommand enthält ausschließlich `proposal_id`, `expected_proposal_revision` und `approve | reject | mark_evidence_insufficient`. Die produktive Grenze rekonstruiert `auth.uid()` und erlaubt im MVP ausschließlich Admin; AI, Customer, System und Reviewer erhalten keine Review-/Apply-Capability. Review speichert Actor UUID und Actor Class, jedoch keine E-Mail oder freie Notiz und dupliziert keinen Claim Payload.

Proposal Lock plus Expected Revision bildet die CAS-Grenze. Jede echte Statusänderung erhöht die Revision genau einmal; stale oder terminal wird nicht rebased. Der Unique Replay Key `(proposal, proposal_revision, action)` liefert für einen erkennbaren identischen Netzwerk-Replay dieselbe Review Row ohne zweite Entscheidung oder Revision. Review Rows sind durch Trigger sowie fehlende UPDATE-/DELETE-Grants append-only. Eine spätere freie Re-Review terminaler Proposals ist im MVP nicht erlaubt.

`approve` bestätigt ausschließlich, dass der bestehende schwache deskriptive Proposal später kontrolliert angewendet werden darf. Es ändert weder Property/Wert noch `descriptive_fact` oder `observed`, und endet bei `approved_apply_pending`. `reject` setzt terminal `rejected`, ohne Observation, Evidence oder Knowledge zu mutieren und ohne die Observation als falsch zu bezeichnen. `mark_evidence_insufficient` setzt terminal `insufficient_evidence`, ohne Löschen, technischen Fortschritt oder automatische Fotoanforderung.

## Apply Decision und Boundary

**Variante B:** Im Repository existiert weiterhin nur der pure/in-memory `KnowledgeState`; es gibt keine produktive persistente Knowledge-State-Autorität. Deshalb wurde keine neue Knowledge-Datenbankarchitektur und keine direkte Claimmutation eingeführt. Approval endet kontrolliert bei `approved_apply_pending`; ein separates späteres Paket muss die bereits vorhandene `KnowledgeClaimProposal → StateTransitionProposal → applyStateTransitionProposal(...)` Engine an eine echte persistente State-Autorität anbinden. Auto-Apply ist ausdrücklich ausgeschlossen.

## Dependency-, Delete- und Race-Semantik

`pending_review` und `approved_apply_pending` sind offene persistente Proposal-/Review-Media-Dependencies. `rejected`, `insufficient_evidence` und künftig `applied` schließen nur diese Workflowstufe. Die bestehende pauschale Evidence-Sperre für Ready-Media-Delete bleibt unverändert und fail closed: Correction-, Offer-/Execution-Authority und authoritative Dependency Projection fehlen weiterhin. Es gibt absichtlich noch keinen finalen `NOT EXISTS dependencies` Gate und keine verfrühte Evidence-bound Deletefreigabe.

Proposal Creation und Review sperren dieselben Media-/Lifecycle-Bindungen, prüfen Tombstones und verlieren gegen einen bereits gewonnenen Delete Claim. Review prüft zusätzlich die Observation erneut; eine nach Proposal-Erzeugung invalidierte Observation kann nicht approved werden. Concurrent Review wird durch Proposal Row Lock, CAS und Replay-Key serialisiert. Es erfolgt in diesen Pfaden keine Storage-Löschung.

## RLS, Grants, Audit, DTOs und Read Service

Beide Tabellen haben RLS. Authenticated besitzt ausschließlich projektbezogenes Admin-SELECT; INSERT/UPDATE/DELETE sind nicht direkt erteilt. Mutation erfolgt über `SECURITY DEFINER` RPCs mit festem `search_path`, internem Actor/Rollencheck und serverseitiger Rekonstruktion. Normaler DELETE ist nicht verfügbar.

Atomare Proposal-/Review-RPCs schreiben Proposal beziehungsweise Review, Workflowstatus und sanitisiertes Audit gemeinsam. Aktionen sind `claim_proposal_created`, `claim_proposal_replayed`, `claim_review_approved`, `claim_review_rejected`, `claim_review_evidence_insufficient` und `claim_apply_pending`. Metadaten enthalten nur Actor-, Project-, Evidence-, Observation-, Proposal-/Review-UUID, Resultcode, Revision und Timestamp. `claim_applied` wird nicht vorgetäuscht.

Strict Zod DTOs liefern Proposal-ID, Evidence-ID, Observation-ID, Property, typisierten Wert, Epistemik, Strength, Status, Revision und Zeitpunkte beziehungsweise Review-ID, Proposal-ID, Action, Result, Actor Class und Reviewed-at. Der project-scoped Read Service lädt Proposals und Reviews in zwei mengenbasierten parallelen Queries ohne N+1, Media-ID, Locator oder Authdetails.

## Tests und verbleibende Grenzen

Vitest deckt geschlossene Payloads/Statuses, alle fünf Properties, Strength-/Epistemic-Grenzen, getrennte Admin-Capabilities, Tabellen, zusammengesetzte FKs, Cross-Project-Schutz, semantische Proposal- und Review-Replay-Keys, Append-only Trigger, RLS, Grants, Indizes, Locks, CAS, Invalidation/Tombstone/Delete-Races, Auditaktionen und Architekturausschlüsse ab. Die bestehenden persistenten Interpretation-/Observation-, Mapping-, synthetischen Review-/Transition-, Evidence-, Lifecycle-, Ready-Delete-, Planner-Context- und Synthetic-E2E-Regressionen bleiben unverändert.

Nicht implementiert bleiben Knowledge Apply, Correction/Observation Correction, automatische Supersession, Dependency Projection, finaler Evidence Delete Gate, Offer-/Execution Authority, Planner-/Readiness-/Missing-Änderungen, Retention, UI, Vision/KI, WhatsApp, Storage-/Signed-URL-Zugriffe und Auto-Apply. Das nächste kleinste sichere Paket ist ein gesondertes Audit der produktiven Knowledge-State-Persistenz und Apply-Transaktionsgrenze; nicht eine versteckte Erweiterung dieses Baselines.

**PERSISTENT EVIDENCE INTERPRETATION AUTHORITY — IMPLEMENTED**

**PERSISTENT OBSERVATION AUTHORITY — IMPLEMENTED**

**PERSISTENT CLAIM PROPOSAL AUTHORITY — IMPLEMENTED**

**PERSISTENT HUMAN REVIEW AUTHORITY — IMPLEMENTED**

**AUTO-APPLY — NOT IMPLEMENTED**

**PERSISTENT KNOWLEDGE APPLY — DEFERRED**

**PERSISTENT CORRECTION AUTHORITY — NOT IMPLEMENTED**

**AUTHORITATIVE MEDIA DEPENDENCY PROJECTION — NOT IMPLEMENTED**

**OFFER / EXECUTION AUTHORITY — NOT COMPLETE**

**EVIDENCE-BOUND DELETE — STILL FAIL-CLOSED**

**VISION — NOT IMPLEMENTED**

**WHATSAPP — NOT IMPLEMENTED**

**OVERALL PRODUCT — NOT PRODUCTION READY**
