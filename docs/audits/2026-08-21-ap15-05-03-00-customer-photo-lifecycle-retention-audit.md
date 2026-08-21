# AP-15-05-03-00 — Customer Photo Lifecycle, Retention, Deletion and Evidence Tombstone Audit

## 1. Audit Metadata

| Feld | Wert |
|---|---|
| Audit-ID | `KG-AUDIT-2026-08-21-AP15-05-03-00-CUSTOMER-PHOTO-LIFECYCLE-RETENTION-V1` |
| Datum | 2026-08-21 |
| Branch | `codex/audit-ap15-05-03-customer-photo-lifecycle` |
| Baseline | `604865903ed9a70a62a848c4885a619a3eeb6b7d` (`work`) |
| Remote | Im Repository ist kein Git-Remote konfiguriert. |
| Paket | ausschließlich Audit/Decision; keine Implementierung |
| Ergebnis | **READY FOR OWNER DECISION** |

## 2. Scope

Vollständig geprüft wurden das verbindliche AP-15-05-00-Audit einschließlich der Resultate AP-15-05-01 und AP-15-05-02, die aktuellen Project-Media-Migrationen und -Pfade, Evidence-Persistenz/Binding/Read/DTO/UI/Adapter, die synthetische Observation→Proposal→Human-Review→Apply-Pipeline, Planner Evidence Context sowie der tatsächlich vorhandene Project-/Angebotsstatus. Dieses Dokument legt fachliche und technische Entscheidungsgrenzen fest; es führt keine Frist und keine Änderung am Produkt ein.

## 3. Current Media / Evidence Architecture

`public.project_media` ist die Medienautorität: UUID, Projekt-FK `RESTRICT`, privater Bucket `project-media`, kanonischer Pfad `projects/{project_id}/originals/{media_id}/{stored_filename}`, Quelle ausschließlich `manual_upload`, Uploadstatus `pending | ready | failed`, `deleted_at` und immutable geschützte Identitäts-/Locatorfelder. Admins reservieren eine `pending`-Zeile, erhalten ein Signed Upload Ticket, laden mit `upsert:false`, und ein Security-Definer-Finalize prüft Storage-Objekt, MIME und Größe vor `ready`/`failed`. Galerie und Einzelansicht zeigen nur aktive `ready`-Medien; Admin und Reviewer erhalten nach Projektprüfung kurzlebige Signed URLs (120 Sekunden).

`public.project_evidence` besitzt eine separate opaque UUID `id`/`evidence_id` und bindet `(project_id, project_media_id)` per zusammengesetzter FK `ON DELETE RESTRICT`. Target, Purpose, Channel, Actor und Bindingstatus sind geschlossen; aktuell sind nur `internal_upload`, `admin` und Insertstatus `bound` zulässig. Nur Admins aktiver Projekte dürfen lesen/binden. Das Binding akzeptiert ausschließlich aktive `ready`-Bilder, ist pro Media/Target/Purpose idempotent, enthält keine Locator/PII und liefert an Intelligence nur opaque Identity, Target, Purpose und `available_unanalysed`. Die reale Admin-UX bindet Galerie-Bilder explizit; sie startet weder Retention noch Observation, Vision, Claim oder Readiness.

Evidence Request, Availability, immutable Observation, Observation-to-Claim-Mapping, Proposal, Review/Apply, Knowledge State und Planner Evidence Context sind synthetisch/in-memory. Der aktuelle Claimpfad erlaubt nur fünf positive schwache `descriptive_fact / observed`-Eigenschaften, erfordert kontrolliertes Admin-Review für Apply und gibt keine technische oder Angebotsfreigabe. Diese Objekte sind noch keine persistente Delete-Gate-Autorität.

Das autoritative Projektstatusmodell lautet exakt `new → collecting_information → technical_review → quote_draft/human_review → quote_sent → accepted/rejected → closed` mit den repositorydefinierten Rück-/Nebenübergängen. Eine separate Offer-/Quote-Tabelle, Offer-ID, Offerstatus oder Snapshot-Persistenz existiert nicht; `quote_draft` und `quote_sent` sind derzeit nur Projektstatus. `projects.deleted_at` existiert und aktive Reads filtern es, aber ein Project-Delete-/Archive-Service oder eine UI ist nicht belegt. Der Customer-Soft-Delete blockiert, solange aktive Projekte existieren. Ein Projektstatus allein darf daher noch keine belastbare Retentionentscheidung vortäuschen.

## 4. Existing Delete / Purge Architecture

| Frage | Belegter Ist-Zustand |
|---|---|
| Ready Soft Delete | RPC `soft_delete_project_media`: Admin, aktives Projekt, aktive `ready`-Zeile; setzt nur `deleted_at`. Keine Evidence-/Review-/Offer-Prüfung, kein Audit Event, kein Restore. |
| Ready-Delete-UI | Keine Action/Service/UI ruft diese RPC im Repository auf. Sie ist technisch ausführbar, aber nicht produktseitig orchestriert. |
| Orphan Cleanup | Admin-Inventar listet ausschließlich aktive `pending`/`failed`, die mindestens 24 Stunden alt sind. Claim sperrt Zeile, erstellt `project_media_cleanup_items`, setzt `deleted_at` und schreibt `orphan_soft_delete` ins `audit_log`. Kein Storage-Scan. |
| Orphan UI | Separate Adminseite mit Bestätigung für fachliches Bereinigen und danach physischen Purge. |
| Physischer Purge | Nur geclaimte, soft-gelöschte `pending`/`failed`-Orphans; `ready` ist mehrfach explizit ausgeschlossen. Tokenisierter DB-Claim, enger server-only Service-Role-Adapter, Storage `remove`, Completion-RPC. |
| DB Hard Delete | Kein normaler Tabellen-DELETE-Grant, keine DELETE-Policy und kein belegter Hard-Delete-Service. Media- und Cleanup-Zeilen bleiben nach Storage-Purge bestehen. Evidence-FK würde gebundene Media-Zeilen zusätzlich per `RESTRICT` schützen. |
| Fehler | Storagekonfiguration/transiente Fehler werden `retry_required`; 401/403 und sonstige Fehler terminal klassifiziert. Completionfehler nach erfolgreichem Storage-Delete ergeben für die Action `purge_retry_required`, während DB `in_progress` bleiben kann. Lease-Reclaim ist nicht belegt. Adapter meldet derzeit kein `already_missing`, obwohl die Completion-RPC es versteht. |
| Audit | Orphan-Soft-Delete, Purge-Claim und Purge-Completion/-Fehler werden auditiert. Ready-Soft-Delete selbst und Evidence Binding besitzen kein fachliches Audit Event. |

Die physische Storage-Löschung betrifft nur den exakt validierten privaten Bucket/Pfad. Normale Rollen haben weder Storage-DELETE-Policy noch Project-Media-DELETE-Grant. Der Service-Role-Key existiert nur im server-only Remove-Client; dieser ist kein generischer DB-Admin-Client. Der vorhandene Orphan-Pfad ist Uploadhygiene und darf nicht auf `ready` erweitert werden.

## 5. Terminology

- **Media retention:** Zeitraum/Zweck, in dem Originalbytes und/oder aktive Media-Zeile logisch und physisch verfügbar bleiben.
- **Evidence retention:** Fortbestand der stabilen Evidence Identity und ihrer minimalen Provenienz, unabhängig von Originalbytes.
- **Observation retention:** Fortbestand strukturierter, nicht bildhaltiger Beobachtungen und ihres Reviewstatus.
- **Claim retention:** Fortbestand angewendeten fachlichen Wissens einschließlich Stärke, Review und Provenienzstatus.
- **Tombstone:** minimaler, PII-/inhalt-/locatorfreier Nachweis, dass Evidence existierte, deren Originalmedium kontrolliert nicht mehr verfügbar ist.
- **Deletion eligibility:** atomar zu entscheidende fachliche Erlaubnis, einen Löschworkflow zu beginnen; noch keine Löschung.
- **Deletion execution:** recoverable physische Storage-Entfernung und anschließende DB-Finalisierung.
- **Logical removal:** UI-/fachliche Inaktivität; weder gleichbedeutend mit Byte-Löschung noch DB-Hard-Delete.

## 6. Core Product Retention Requirement

**Empfehlung:** Relevantes kundenbezogenes Originalmedia, das als Evidence oder für ein Angebot genutzt wird, bleibt mindestens durch Informationssammlung, Interpretation, fachliche Review und erfolgreiche Angebotserstellung projektgebunden, autorisiert referenzierbar und physisch verfügbar. Normale Retention darf es davor nicht löschen. Jede noch offene fachliche Abhängigkeit blockiert unabhängig vom Zeitablauf. Es wird keine Tages-/Monatsfrist festgelegt.

Sonderfälle (`customer_request`, falsches/unzulässiges/irrelevantes Media, Abuse/Security, falsches Projekt) laufen nicht als normale Retention und benötigen einen priorisierten, auditierten Exception-Workflow. Sie dürfen offene Rechts-/Vertragsfragen nicht technisch vorentscheiden.

## 7. Architecture Variants

Bewertung `++` stark, `+` gut, `0` gemischt, `-` schwach, `--` ungeeignet; Komplexität bewertet Einfachheit.

| Kriterium | A Projektleben | B ab Upload | C Status | D Dependencies | E Hybrid |
|---|---:|---:|---:|---:|---:|
| Datenschutz/Datensparsamkeit | - | + | + | + | ++ |
| Nachvollziehbarkeit/Audit | + | 0 | + | ++ | ++ |
| Angebot/Order/Rückfrage | + | -- | + | ++ | ++ |
| Laurie Review/Re-Review | + | -- | + | ++ | ++ |
| Vision/WhatsApp | 0 | - | + | ++ | ++ |
| Quality Work | - | 0 | + | + | ++ (sanitisiert) |
| Recovery | 0 | 0 | + | + | ++ |
| technische Einfachheit | ++ | ++ | + | - | -- |

A speichert leicht unnötig lange; B ist fachlich blind; C scheitert an offenen parallelen Reviews und aktuell fehlender Offer-Entity; D kennt keinen sinnvollen Retentionstart nach Abschluss. **E wird empfohlen:** harte Dependencies plus autoritative Projekt-/spätere Offer-/Execution-Phasen, danach explizit konfigurierte Retention, kontrollierter Tombstone und getrennte physische Löschung. Die Mehrkomplexität ist wegen nicht-atomarem DB/Storage und Provenienz notwendig.

## 8. Recommended Lifecycle Model

Kein universeller Status. Ein Decision Service berechnet Eligibility aus Media-Ingestion, Evidence-Bindings, persistierten Usage-Dependencies, Project/Offer/Execution, Holds und versionierter Policy. Das Ergebnis wird per DB-Transaktion/CAS als Deletion Intent eingefroren. Der Worker löscht Storage eventual-consistent; Completion finalisiert Mediazustand und Tombstone idempotent. Binding allein ist kein ewiger Lock, offene/benötigte Verwendung schon. Ohne explizit konfigurierte Policy gilt fail closed: nicht löschen, aber als sichtbarer Konfigurationsfehler statt verborgenem „für immer behalten“.

## 9. Lifecycle Axes

Planungsnamen, keine Spalten:

1. **Ingestion:** bestehend `pending | ready | failed` (nicht in vorgeschlagene Namen umetikettieren).
2. **Evidence binding:** bestehend `unclassified | bound | binding_ambiguous | invalidated`; gegenwärtig persistierbar, aber Inserts praktisch nur `bound`.
3. **Usage/dependency:** abgeleitet/persistent autorisiert, etwa `unused | interpretation_open | review_open | offer_preparation | completed`; einzelne Dependency-Zeilen statt frei überschreibbarer Summary.
4. **Retention/deletion:** geplant `protected | retention_active | deletion_eligible | deletion_pending | deleted`, ergänzt um Hold/Failuredetails, nicht vermischt mit Uploadstatus.
5. **Physical state:** objekt vorhanden, Fehlen bestätigt, unbekannt/reconcile nötig; getrennt von fachlicher Löschung.

## 10. Hard Delete Gates

Delete ist zwingend blockiert bei: nicht finalisiertem/unklarem Mediazustand; offener Interpretation; noch fachlich zu bewertender Observation; offenem Proposal; offener Human Review; offener Correction/Supersession oder manueller Re-Review; laufender Offer Preparation bzw. noch nicht erfolgreich erzeugtem Angebot bei relevanter Evidence; fachlich/kommerziell offenem Angebot; aktivem Auftrag, solange Montage/Durchführung/Rückfrage/Dokumentation das Original benötigt; Storage/DB-Inkonsistenz vor geklärter Reconciliation; aktivem Legal/Operational Hold; unbekannter/nicht konfigurierter Policy; sowie jedem Cross-Project-/Dependency-Integritätskonflikt.

Zusätzlich blockieren `deletion_pending` und ein fremder gültiger Worker-Claim konkurrierende Starts. Ein aktives Binding ohne offene oder retentionrelevante Verwendung blockiert nicht automatisch ewig.

## 11. Collection Phase

In `new` und `collecting_information` bleibt relevantes Media geschützt. Ungebundenes, erkennbar irrelevantes Media darf erst nach Klassifizierungs-/Exception-Entscheidung und eigener Policy eligible werden. Eine noch ausstehende Einordnung ist kein stiller Löschgrund.

## 12. Interpretation Phase

Von Beginn einer Evidence Interpretation bis zu einem terminalen, persistierten Ergebnis bleibt das Original geschützt. `available_unanalysed` ist noch kein Interpretationsstart und aktuell weder Retentiontimer noch langfristiger Lock; das Binding setzt ohne beschlossene Policy keinen Timer.

## 13. Review Phase

`technical_review`, `human_review` und jede tatsächlich offene Observation-/Proposal-/Correction-Review blockieren relevante Medien. Projektstatus allein genügt nicht: Dependency muss pro Evidence/Media verfolgbar sein und vor Eligibility terminal geschlossen oder invalidiert sein.

## 14. Offer Preparation

In `quote_draft` sowie während tatsächlicher Offer-Erzeugung ist relevante Evidence geschützt. „Angebot noch nicht erzeugt“ blockiert nur Media, das für diesen Prozess relevant ist; es macht ungebundene Galerieaufnahmen nicht pauschal unlösbar. Erfolg muss später von einer autoritativen Offer-Entity/Snapshot-ID kommen, nicht nur von einem UI-Ereignis.

## 15. Offer Open

`quote_sent` ist im Ist-Modell die einzige Annäherung an „Angebot offen“. Empfehlung: relevante Evidence bleibt geschützt, solange das Angebot fachlich/kommerziell offen oder das Projekt dafür aktiv ist. Eine separate Offer-Entity mit eindeutigen terminalen Zuständen ist vor automatischer Retention erforderlich; keine erfundenen Offerstatus werden hier autoritativ gemacht.

## 16. Order Accepted

`accepted` startet **keine** Löschfrist. Das Original bleibt geschützt, solange Montagevorbereitung, Durchführung, technische Rückfragen, vereinbarte Leistung oder Dokumentation es benötigen. Ein späterer autoritativer Execution-/Abschlusszustand soll den Retentionstart auslösen; `closed` allein ist ohne Abschlussart und Dependencies zu mehrdeutig. Zweck/Endpunkt: Owner-/Legal-Decision.

## 17. No Order

Repositorykonform bildet `rejected` eine Nichtannahme ab; `closed` verrät den Grund nicht. Geplante abgeleitete Phase `offer_closed_no_order` (kein neuer autoritativer Status) entsteht nur aus eindeutig terminaler Angebotsentscheidung. Dann: offene Prozesse schließen/invalidieren → Retention nach expliziter Policy → Eligibility → Delete Workflow. Keine unbegrenzte Default-Retention, aber auch keine konkrete Frist in diesem Audit.

## 18. Project Aborted

Vor Angebot abgebrochen bedeutet nicht sofort löschen. Zuerst offene Interpretationen, Observations, Proposals, Reviews und Corrections kontrolliert schließen/invalidieren; keine dangling Proposals. Danach darf ein eindeutig dokumentierter Abort die separate Policy starten. `closed` allein unterscheidet Abort, Auftragsschluss und No-order nicht; ein späterer Decision Source/Reason ist erforderlich.

## 19. Unbound Media

Ungebundenes Project Media trägt keine Evidence-Retention allein durch Galeriezugehörigkeit. Es braucht trotzdem Projekt-/Zweck-, Kundenrequest-, Hold- und offene Klassifizierungsgates. Kürzere, explizite Retention kann zulässig sein. Alle Galerieaufnahmen automatisch zu Evidence zu erklären wird verworfen.

## 20. Evidence-bound Media

Für jedes aktive Binding werden alle Dependencies aggregiert. Binding allein schützt mindestens bis abgeschlossener Klassifizierung und produktseitiger Mindestgrenze, aber nicht ewig. Observation vorhanden/offen, Proposal offen, Review/Correction offen und Offer-/Execution-Relevanz blockieren. Reviewed/applied Claim kann nach Retentionende mit Tombstone fortbestehen. Mehrere Bindings: eine einzige blockierende Verwendung blockiert das gemeinsame Original.

## 21. Open Observation

Eine Observation ohne abgeschlossene fachliche Bewertung blockiert, sofern das Original für Review/Re-Review nötig ist; für die aktuelle Pipeline ist dies die sichere Defaultannahme. Später muss ein persistierter terminaler Observationstatus die Abhängigkeit schließen. Das bloße Vorhandensein einer terminal reviewed/invalidated Observation ist kein ewiger Gate.

## 22. Open Proposal

**Verbindliche Empfehlung: `open proposal → deletion blocked`.** Sonst müsste Laurie ohne Originalevidence entscheiden. Erst persistiertes Apply, Reject, Insufficient oder kontrolliertes Invalidieren schließt das Gate; ein in-memory verschwundenes Proposal ist keine verlässliche Schließung.

## 23. Open Review

Offene Human Review und manuelle Re-Review blockieren. Das gilt auch bei bereits erzeugtem Angebot und unabhängig von abgelaufener Zeitretention. Reviewstart gegen `deletion_pending` muss atomar scheitern oder den Delete Intent vor Storage-Löschung kontrolliert abbrechen; kein Review darf auf bereits versprochene Originalverfügbarkeit bauen.

## 24. Rejected / Insufficient Evidence

`rejected` und `insufficient_evidence` schließen Proposal/Review, beseitigen aber nicht automatisch die Mindestgrenze bis Angebot, falls das Bild zum laufenden Angebotsprozess gehört. Danach ist nur kurze, konfigurierbare Nachvollziehbarkeitsretention zu prüfen; kein automatischer Langzeitschutz. Wrong-target/invalid/Abuse und Kundenrequest laufen über Sondergründe. Ergebnis und Grund bleiben strukturiert nachvollziehbar.

## 25. Applied Descriptive Claims

Ein erfolgreich reviewed und angewendeter `descriptive_fact / observed`-Claim darf nach Ende aller Gates und freigegebener Mediaretention bestehen bleiben. Seine Evidence-Provenienz wechselt auf tombstoned/media unavailable; Original-Re-Review ist sichtbar unmöglich. Der Claim darf dadurch weder stärker noch zur technischen/site-verified Aussage werden.

## 26. Future Strong Claims

Retention Class/Policy muss Claimstärke und Zweck später unterscheiden: descriptive observation ist nicht `site_verified` technical/safety decision. Stärkere Claims können strengere Originalretention oder ein Verbot des Fortbestands ohne Original benötigen. Dieses Paket implementiert und erfindet keine stärkere Claimlogik.

## 27. Observation After Delete

Varianten: A immer löschen verliert Audit; B immer behalten verletzt potenziell Datensparsamkeit; C nur fachlich genutzt/reviewed behalten ist guter MVP; D nach Observation Class ist das erweiterbare Ziel. **Empfehlung D mit C als Baseline:** reviewed/applied-relevante strukturierte Observations dürfen zweckgebunden bleiben, offene müssen vor Delete beendet sein, irrelevante/unreviewed werden policybasiert invalidiert/gelöscht. Keine Rohbilddaten; Provenienz zwingend `evidence_tombstoned`, Re-Review unavailable.

## 28. Claim After Delete

A Mitlöschen verliert fachlichen Stand; B immer behalten ignoriert Zweck; C nur reviewed/applied ist für heutige Claims angemessen; D strength-/policybasiert ist Ziel. **Empfehlung D, aktuelle Baseline C:** nur kontrolliert reviewed/applied Claims dürfen fortbestehen, mit Tombstone-Provenienz. Unreviewte Proposals sind keine Claims und müssen vor Delete terminal sein; unzulässige Claims werden invalidiert/superseded, nicht still entfernt.

## 29. Reviewer Correction

Öffnet Laurie eine Correction, bleibt das Original bis terminaler Correction/Supersession geschützt. Correction ist immutable neue Entscheidung mit Reason und Bezug, keine Mutation der ursprünglichen Observation. Beginnt Deletion bereits, darf keine neue Correction mit Original-Re-Review starten; UI muss unavailable zeigen oder Delete vor Storageschritt CAS-kontrolliert abbrechen. Keine Correction wird hier implementiert.

## 30. Tombstone Contract

Minimal geplant: `evidence_id`, `former_project_media_id` als historischer UUID-Wert, `deleted_at`, geschlossener `deletion_reason_code`, `provenance_status=evidence_tombstoned`, geschlossener `media_unavailable_reason`, `lifecycle_decision_source` (Policy/Customer/Admin/Incident plus referenzierbare interne Decision-ID) und `policy_version`. Kein Bildinhalt, PII, Originaldateiname, Caption, EXIF, URL, Signed Token, Bucket, Pfad, Provider-ID oder Hash.

Empfehlung: zunächst Media-DB-Zeile behalten und nur Bytes physisch löschen; damit bleibt `(project_id, project_media_id)` samt `RESTRICT` intakt und `former_project_media_id` kann ohne FK-Auflösung referenziert werden. Tombstone ist Evidence-/Lifecycle-Zustand, nicht Storagelocator. Ein späterer DB-Archival-Purge darf die UUID als wertbasierte historische Referenz in einer dedizierten Tombstone-Struktur behalten, muss zuvor FK kontrolliert auf Tombstone-Provenienz überführen. Keine SHA-/perceptual Hashes ohne separat belegten Idempotenz-/Compliance-Zweck.

## 31. Deletion Reasons

Geschlossene Startcodes: `retention_expired`, `project_closed`, `customer_request`, `invalid_media`, `wrong_project`, `duplicate_transport`, `admin_cleanup`. Decision Source und Reason sind getrennt; Details gehören in referenzierte Audit-/Case-Daten, nicht freie autoritative Strings. Codes brauchen versionierte Domain-/DB-Allowlist und dürfen keine PII kodieren.

## 32. Customer Deletion Request

Eigener priorisierter Workflow: Anfrage/Identitäts- und Scopeprüfung erfassen; betroffene Media/Evidence ermitteln; offene fachliche/vertragliche Dependencies und zulässige Aufbewahrung prüfen; Owner/Legal-Entscheidung dokumentieren; zulässige Löschung als `customer_request` ausführen; blockierte/teilweise Erfüllung nachvollziehbar kommunizieren; jede Transition auditieren. Das ist kein normaler Schedulerlauf. Keine Rechtsberatung oder Frist wird behauptet; Rechtsgrundlage, Pflichtaufbewahrung, Antwort und Belegumfang sind **Owner/Legal Decision Required**.

## 33. Physical vs Logical Deletion

A DB-first riskiert locator-/recoverylose Bytes; B Storage-first riskiert DB, die fälschlich Verfügbarkeit verspricht; C Lifecycle→Storage→Tombstone ist brauchbar; **D transactional intent + eventual reconcile wird empfohlen** als präzisierte C-Variante:

1. Transaktion sperrt Media/Dependencies, revalidiert Eligibility, schreibt versionierten Intent/Claim und verhindert neue Nutzung.
2. Worker löscht exakt ein validiertes Storageobjekt über engen Adapter.
3. Completiontransaktion bestätigt Physical State, finalisiert Tombstone/Media-Lifecycle und Audit.
4. Reconciler behebt partielle Zustände; DB-Hard-Delete ist separater späterer Archivschritt.

Storage und PostgreSQL sind nicht gemeinsam atomar. UI-unsichtbar, fachlich inaktiv, `deletion_pending`, physisch gelöscht, DB-Row gelöscht und Evidence tombstoned bleiben getrennte Zustände.

## 34. Ready-Media Purge

Neuer separater **Evidence-aware Ready Media Lifecycle / Purge Service**: Kandidatenermittlung aus expliziter Policy; atomare Eligibility-/Dependency-/Projectprüfung; Deletion Intent mit Policyversion; enger Storage Delete; Tombstone/Completion; Retry/Lease/Reconciliation; auditierte Admin-/Worker-Capability. Der bestehende `pending`/`failed`-Orphan-Purge bleibt unverändert. Kein generischer Service-Role-Client, kein direkter Client-Delete und keine Wiederverwendung des Orphan-Cleanup-Items als fachliches Evidence-Modell.

## 35. Failure Recovery

| Fall | Desired state / Retry | Lock/CAS und Audit | User-visible effect |
|---|---|---|---|
| A eligible, Storage scheitert | `deletion_pending/retry_required`; transient begrenzt retry, permanent Operator | Intent/Attempt-Token bleibt; Fehlercode auditieren | nicht als verfügbar zeigen; „Löschung ausstehend“ |
| B Storage weg, DB finalize scheitert | `recovery_required`, Storage als unbekannt/weg reconciliieren, Completion idempotent wiederholen | gleicher Token; kein neuer Deleteentscheid | kein View/Vision; nicht „aktiv“ behaupten |
| C Tombstone, Storage existiert | inkonsistent; Delete wiederholen, erst dann physical completion | Tombstonephase/physical flag CAS; Incident audit | unavailable/deletion pending |
| D Worker wiederholt | vorhandenes completed Ergebnis oder denselben Attempt liefern | Idempotency key + Claimtoken | keine doppelte Wirkung |
| E Objekt schon weg | nach verifizierter Pfadidentität `already_missing`, tombstonen/finalisieren | Audit unterscheidet Incident vs idempotent replay | unavailable; ggf. Incidenthinweis |
| F Binding verschwindet | Transaktionale FK-/Dependencyversion entscheidet; vor Intent neu prüfen | Row locks/CAS; unerwartetes Verschwinden Incident | Delete abweisen oder sicher fortsetzen |
| G neuer Review während Delete | Reviewstart bei Intent blockieren; vor Storage darf autorisiert Intent canceln | gegenseitige CAS-Gates | „Original wird gelöscht/nicht verfügbar“ |
| H Projektstatus ändert sich | vor Intent aktuelle Version; nach Intent nur schützende Änderung darf vor Storage canceln, sonst neuer Decisionlauf | Projectversion im Snapshot | Statusänderung ggf. wartet/re-evaluiert |
| I Policy ändert sich | bestehender Intent trägt Version; vor Storage bei strengerer Policy re-evaluieren; abgeschlossene Löschung nicht rückgängig | Policyversion CAS/audit | klarer Policy-/Pendingstatus |
| J mehrere Media je Request | pro Asset; Request bleibt erfüllt nur wenn fachlich zulässig, sonst unavailable/re-open nur kontrolliert | Request-/Bindingversion; keine Count-Heuristik | zeigt betroffenes Asset und Re-Reviewgrenze |

## 36. Race Conditions

Delete vs neues Binding/Observation/Proposal/Review/Offer Generation/Project Activation/Customer Request sowie zwei Worker werden persistent gelöst: eine DB-Transaktion sperrt Media und relevante Dependency-/Lifecyclezeilen, vergleicht Version/Status, schreibt genau einen Intent; alle Erzeuger neuer Dependencies prüfen `deletion_pending/deleted` in derselben Transaktion und fail closed. Offer Generation und Project Activation müssen eine schützende Dependency vor Start atomar etablieren. Customer Request erhält Priorität, umgeht aber keine Legal Holds. Worker claimen per Lease/Token/CAS; Completion akzeptiert nur aktuellen Token. Eligibility wird unmittelbar vor physischem Delete erneut geprüft. Cross-Project-IDs werden in DB zusammengesetzt validiert.

## 37. Database Strategy

| Variante | Bewertung |
|---|---|
| A Felder in `project_media` | einfacher Mediazustand, aber Policy-/Attempt-/Historie überlädt Hauptzeile |
| B allgemeine Lifecycle-Tabelle | gute Historie, benötigt klare 1:1-Autorität |
| C nur `project_evidence` | falsch für ungebundenes Media und mehrere Bindings |
| D separate `media_retention_state` | klare Policy/Workflowautorität, braucht Media Summary/Constraints |
| E Hybrid | **empfohlen:** media-level deletion/physical state plus separate Retention-/Attempt-Historie; Evidence-/Observation-/Proposal-/Review-/Offer-Dependencies fachlich getrennt |

AP-15-05-03-01 soll minimal persistenten Media-Lifecycle/Eligibility-State und Dependency-Contract schaffen, ohne Bytes zu löschen. Detailtabellen versus wenige Mediafelder bleibt Ownerentscheidung; keine Spalte wird hier angelegt.

## 38. FK Strategy

Die zusammengesetzte Evidence→Media-FK `ON DELETE RESTRICT` bleibt zunächst zwingend. Empfohlener erster physischer Löschpfad löscht Storagebytes, soft-/lifecycle-finalisiert aber die Media-Zeile nicht per Hard Delete; Binding und Projectintegrität bleiben erhalten, Evidence wird tombstoned. Erst ein separates späteres Archival-Purge darf DB-Media löschen, nachdem alle Evidence-Referenzen atomar in dedizierte Tombstone-Referenzen überführt oder entkoppelt wurden. `SET NULL` ohne Tombstone und direktes Cascade werden verworfen. Somit kein dangling FK und keine kontrolllose RESTRICT-Aufhebung.

## 39. Soft vs Hard Delete

- **UI unsichtbar:** aktive Gallery filtert bereits `deleted_at`; künftig Lifecycle-aware.
- **Fachlich inaktiv:** Binding/Usage terminal oder invalidated; nicht gleich Media gelöscht.
- **Storage physisch gelöscht:** Originalbytes fehlen; verifizierter Physical State.
- **DB Media Row gelöscht:** nicht für ersten Workflow empfohlen; eigener Archival-Purge.
- **Evidence Tombstone:** stabile Provenienz bei unavailable Original; kein Alias für alle obigen Zustände.

Die vorhandene Ready-Soft-Delete-RPC ist ohne Dependencygate nicht als Lifecycleworkflow freigegeben.

## 40. EXIF / Privacy

Varianten A unverändertes Original inkl. EXIF, B Strip beim Ingest, C unverändertes Original plus sanitized derivative, D channelabhängig. **Empfehlung C als technische Zielrichtung, Status `owner_legal_required`:** immutable Original für begrenzte, zweckgebundene Re-Review-Retention; Analyse/Vision nutzt ein getrenntes minimiertes Derivat ohne unnötiges EXIF. Ob selbst das gespeicherte Original EXIF enthalten darf und wie Ingresskanäle abweichen, entscheidet Owner/Datenschutz. Aktueller Upload wird nicht geändert. Intelligence, Logs, Claims und Metrics übernehmen niemals EXIF/GPS; `received_at` stammt nicht daraus.

## 41. Original Integrity

Original Customer Media ist immutable. Thumbnail, Orientation, Sanitization und Vision Outputs sind getrennte Derivate mit eigener Identity/Purpose/Retention oder temporär. Sie überschreiben niemals `originals`. Retention darf das Original kontrolliert löschen, aber nicht vorher verändern. Byte-Hashing wird nicht allein für Tombstone/Tracking eingeführt.

## 42. Offer Provenance

Ein späterer Offer Snapshot sollte relevante technische Entscheidungen/Claim-IDs und deren Evidence-Provenienz referenzieren, nicht Bilder, URLs oder Storagepfade einbetten. Ein offener Offer-Snapshot blockiert notwendige Originale; nach terminalem Lifecycle können reviewed Claims und Tombstones die fachliche Historie tragen. Konkrete Vertragsdokumentation und erforderliche Claim-/Evidence-Retention sind Owner/Legal-Entscheidungen. Keine Offeränderung erfolgt.

## 43. Quality / Metrics

Quality Work rechtfertigt keine unbegrenzte Originalaufbewahrung. Langfristige Produktverbesserung nutzt bevorzugt separat freigegebene, sanitizierte strukturierte Quality Cases ohne Original, PII, Provider-/Media-ID oder Projektbezug. Aggregierte Prozessmetriken ersetzen Bilder; Zweck, Mindestgruppe und Retention sind separat festzulegen.

## 44. Historical Chats

Historische Imports benötigen eigene Purpose-, Consent-/Rechtsgrundlagen-, Provenienz- und Retentionprüfung. Sie erhalten nicht automatisch den Schutz-/Aktivstatus laufender Projekte, erzeugen keine automatische Evidence/Observation/Claims und bleiben bei unklarer Zuordnung unclassified bzw. ausgeschlossen.

## 45. WhatsApp Boundary

Vor WhatsApp Media Ingestion müssen persistente Evidence Binding (vorhanden), Retention State, atomarer Delete Gate, Provider-Media-Idempotency und persistentes Source-Message-Binding vorhanden sein. Zusätzlich braucht der Connector seinen engen Download-/Storageadapter und Transportretention. Provider-ID/URL/Token gelangt nie in Intelligence/Tombstone. Dieses Audit entscheidet Lifecycle, nicht Connector; WhatsApp bleibt nicht implementiert.

## 46. Vision Boundary

Vision darf nur starten, wenn Media physisch vorhanden, `ready`, aktiv/nicht `deletion_pending`, korrekt projektgebunden, als Evidence verfügbar und gemäß Purpose/Privacy zur Analyse zugelassen ist. Der Job muss Media-/Lifecycleversion atomar claimen. Beginnt Deletion, starten keine neuen Jobs; laufende Jobs müssen vor Persistierung nochmals prüfen und dürfen keine Ausgabe ungeprüft speichern. Vision bleibt nicht implementiert.

## 47. Legal / Policy Boundary

Dieses Audit erfindet keine deutsche/EU-, handels-/steuerrechtliche, Vertrags- oder produktspezifische Frist. Technisch zu entscheiden sind Policyversion, Start Event, Retention Class, Holds, Eligibility, Workflow und Audit. Rechtsgrundlage, konkrete Dauer, Pflichtaufbewahrung, Kundenrequestantwort und Angebots-/Vertragsdokumentation sind getrennt **Owner/Legal Decision Required**. Eine konkrete Retentionkonfiguration ist Production Gate; fehlende Konfiguration darf weder heimlich löschen noch als akzeptierte unbegrenzte Retention gelten.

## 48. Owner Decisions

Statuswerte: `recommended` = Audit empfiehlt, Owner muss freigeben; `owner_required`/`owner_legal_required` = keine Produktentscheidung getroffen.

| # | Varianten | Empfehlung | Risiko | Status |
|---:|---|---|---|---|
| 1 | A–E Lifecycle | E Hybrid | blindes Löschen/Endlosretention | `recommended` |
| 2 | bis Angebot ja/nein | ja für relevante Fotos | Angebot ohne Evidence | `recommended` |
| 3 | offenes Angebot Gate | ja | Rückfrage/Nachweisverlust | `recommended` |
| 4 | aktiver Auftrag Gate | zweckgebunden ja | Montageverlust vs Endlosretention | `owner_required` |
| 5 | No-order Retentionstart | terminal eindeutig ja | ewige Bilder | `owner_legal_required` |
| 6 | Abort Retentionstart | nach Dependencyabschluss ja | dangling Review | `owner_legal_required` |
| 7 | offene Observation | blockiert, wenn Review Original braucht | Review ohne Original | `recommended` |
| 8 | offenes Proposal | immer blockiert | Laurie entscheidet blind | `recommended` |
| 9 | offene Review | immer blockiert | Re-Review unmöglich | `recommended` |
| 10 | Offer Preparation | relevante Media blockiert | fehlerhaftes Angebot | `recommended` |
| 11 | insufficient langfristig | nur kurze explizite Policy, nicht automatisch | Audit vs Datensparsamkeit | `owner_legal_required` |
| 12 | rejected langfristig | wie 11 | unnötige Speicherung | `owner_legal_required` |
| 13 | applied descriptive Claim bleibt | ja, reviewed + Tombstone | schwächere Reprüfbarkeit | `owner_required` |
| 14 | Observation bleibt | reviewed/used, class-/policybasiert | Audit vs Datenschutz | `owner_legal_required` |
| 15 | Tombstone | ja | Provenienzverlust | `recommended` |
| 16 | Tombstone-Inhalt | Minimalcontract §30 | PII/Locatorleck | `recommended` |
| 17 | RESTRICT | zunächst behalten | Löschdeadlock bei Hard Delete | `recommended` |
| 18 | Media soft vs hard | Storage löschen, DB-Zeile zunächst behalten; Hard Delete separat | Metadatenretention | `owner_legal_required` |
| 19 | Storage vor DB Hard Delete | Intent → Storage → Finalize; Hard Delete später | Partial Failure | `recommended` |
| 20 | Lifecycle-Tabelle/Felder | Hybrid, Detaildesign in -01 | Überladung/Drift | `recommended` |
| 21 | Ready Purge | separater Service | Orphanpfad unsicher | `recommended` |
| 22 | Deletion Audit | verpflichtend | nicht nachweisbar | `recommended` |
| 23 | Customer Request | eigener Workflow | Rechts-/Vertragskonflikt | `owner_legal_required` |
| 24 | EXIF | Original + sanitized derivative als Ziel; final Legal | Privacy/Integrität | `owner_legal_required` |
| 25 | Original immutable | ja | Manipulation/Re-Review | `recommended` |
| 26 | Quality Cases | sanitisiert statt Originaldauerhaltung | Zweckentfremdung | `recommended` |
| 27 | Vision bei pending | blockiert | Analyse gelöschter Bytes | `recommended` |
| 28 | WhatsApp Reihenfolge | erst Lifecycle Baseline | unkontrollierter Ingress | `recommended` |
| 29 | konkrete Fristen | separates Owner/Legal-Paket, explizite Konfiguration | erfundene/fehlende Frist | `owner_legal_required` |
| 30 | nächstes Paket | AP-15-05-03-01, nur State/Gates | vorzeitige physische Löschung | `recommended` |

## 49. Recommended Packages

1. **AP-15-05-03-01 — Media Lifecycle & Deletion Eligibility Baseline:** versionierte Contracts, DB-State, Dependencymodell, atomare Gates/CAS, Audit-Intent und Policy-Konfigurationsgrenze; **keine physische Löschung**.
2. **AP-15-05-03-02 — Evidence Tombstone & Ready Media Deletion Workflow:** Tombstone, enger Ready-Storage-Adapter, Intent/Worker/Completion, `already_missing`, Lease/Retry/Reconciliation, Audit; kein DB-Hard-Delete im ersten Schnitt.
3. **AP-15-05-03-03 — Lifecycle UI / Admin Visibility:** Dependencies, Eligibility, Holds, Customer-Request-Case und Recovery sichtbar; keine unkontrollierte Delete-Schaltfläche.
4. **AP-15-05-04 — WhatsApp Media Ingestion Audit:** erst nach -01/-02-Baseline; Connectorimplementation separat.
5. **AP-15-06-00 — Vision Adapter Audit:** erst nach Lifecycle und WhatsApp-Audit; Implementation separat.
6. Separat vor starker Re-Review-Automation: Correction/Invalidation/Supersession und Offer-/Execution-Persistenzautorität.

## 50. Future Tests

Später mit Vitest plus Migration-/DB-Integration: strict lifecycle schemas und geschlossene States/Reasons; Policyversion/fehlende Policy; Eligibility für jeden autoritativen Projektstatus und spätere Offerstatus; offene Interpretation/Observation/Proposal/Review/Correction/Offer Preparation; applied Claim; insufficient/rejected; unbound und multiple Evidence Bindings; mehrere Media pro Request; no premature deletion; Customer Request/Hold; CAS bei Status-/Policywechsel; zwei Worker; Storagefehler, DB-Completionfehler, already missing, Retry/Lease/Reconcile; Tombstone-Minimalkeys und verbotene URL/Locator/PII; Re-Review unavailable; RLS/Grants/Admin-Capability; kein Reviewer/Client-Delete; enger Service-Role-Adapter; Cross-Project-Delete unmöglich; Vision/Delete- und WhatsApp/Delete-Races. In diesem Audit wurden keine Tests geändert oder ausgeführt.

## 51. Production Gates

1. Keine Evidence-relevante normale Löschung vor erfolgreicher Angebotserstellung.
2. Offene Observation/Proposal/Review/Correction und Offer Preparation blockieren.
3. Offenes Angebot und benötigte Evidence eines aktiven Auftrags blockieren gemäß freigegebener Policy.
4. Keine dangling Evidence-FK; Cross-Project-Deletion unmöglich.
5. Kein Signed URL, Locator, EXIF oder PII in Lifecycle/Tombstone/Audit.
6. Storage-Delete und DB-State recoverable, reconciled und idempotent; Worker Lease/CAS.
7. Verpflichtendes Audit Event für Decision, Claim, Attempt, Ergebnis und Recovery ohne PII.
8. Kein generischer Service-Role-Client; enger server-only Remove-Adapter.
9. Customer-Request-Pfad und Legal Holds dokumentiert/freigegeben.
10. Retention Policy mit Version, Start Event und konkreter Owner/Legal-Freigabe explizit konfiguriert.
11. Kein versteckter indefinite-retention Default; fehlende Policy sichtbar/fail closed.
12. Evidence-/Claim-/Observation-Verhalten nach Tombstone freigegeben und getestet.
13. Vision startet nicht bei `deletion_pending`; WhatsApp erst nach Lifecycle-Baseline.
14. Monitoring für stuck Attempts/Reconciliation ohne personenbezogene Logs.

## 52. Scope Confirmation

Ausdrücklich ausschließlich Audit und diese exakt eine neue Dokumentationsdatei. Keine Migration, DB-Änderung, SQL, RPC, RLS, Project-Media-/Evidence-/Storage-/Upload-/Delete-/Purge-Änderung, UI, Action, Service, Test, Retentiontimer, Scheduler, Queue, WhatsApp, Vision, KI, Dependency oder `package.json`-Änderung. Keine Anwendungstests wurden ausgeführt.

## 53. Status

**Auditstatus: READY FOR OWNER DECISION**

`REAL PROJECT MEDIA EVIDENCE BINDING — IMPLEMENTED`

`CUSTOMER PHOTO LIFECYCLE — NOT IMPLEMENTED`

`RETENTION POLICY — NOT FINALIZED`

`DELETION ELIGIBILITY — NOT IMPLEMENTED`

`OPEN REVIEW DELETE GATE — NOT IMPLEMENTED`

`EVIDENCE TOMBSTONES — NOT IMPLEMENTED`

`READY MEDIA PHYSICAL PURGE — NOT IMPLEMENTED`

`CUSTOMER DELETION REQUEST WORKFLOW — NOT IMPLEMENTED`

`WHATSAPP MEDIA INGESTION — NOT IMPLEMENTED`

`VISION — NOT IMPLEMENTED`

`OVERALL PRODUCT — NOT PRODUCTION READY`

# AP-15-05-03-01 — Media Lifecycle and Deletion Eligibility Baseline Result

## Migration und Lifecycle Contract

`202608210002_project_media_lifecycle_eligibility.sql` führt `public.project_media_lifecycle` als getrennte, locatorfreie Entscheidungsautorität ein. Media bleibt in `project_media`, Evidence in `project_evidence`. UUID, `project_id`, eindeutige `project_media_id`, zusammengesetzter Project/Media-FK `RESTRICT`, Revision, Zustände, Policyversion und Zeitstempel bilden die Identity. Cross-Project-Binding und Duplikate scheitern in der DB.

Retention ist geschlossen: `protected | retention_pending | deletion_eligible | deletion_blocked`. Eligibility ist geschlossen: `eligible | blocked | policy_not_configured | dependency_state_unknown | media_not_ready | media_already_logically_deleted | project_state_blocks | offer_state_blocks | evidence_dependency_blocks | lifecycle_state_blocks`. Hold ist `none | operational_hold | legal_hold`; jeder Hold blockiert. Policy ist nur `customer_photo_retention_v1` oder nicht gesetzt und bezeichnet keine Dauer. Ohne Policy gilt `retention_policy_missing`.

Geschlossene Reasons: `media_not_ready`, `media_failed`, `media_pending`, `media_soft_deleted`, `lifecycle_missing`, `retention_policy_missing`, `retention_not_completed`, `project_active`, `offer_state_unknown`, `offer_open`, `offer_preparation_open`, `evidence_dependency_open`, `observation_dependency_unknown`, `proposal_dependency_unknown`, `review_dependency_unknown`, `correction_dependency_unknown`, `legal_or_operational_hold`, `cross_project_mismatch`, `unsupported_media_state`.

## Revision/CAS, Transitionen und Audit

Initialisierung ist per Unique Constraint und `ON CONFLICT DO NOTHING` idempotent. Konfiguration und Evaluation verlangen `expected_revision`; echte Änderungen erhöhen `N → N+1`, identische Aufrufe bleiben `N → N`. Die Admin-RPC erlaubt nur die vier Baseline-Retentionstates und drei Holdstates. Sie kennt kein `deletion_pending`, `deleted` oder `tombstoned`. Geänderte Konfiguration und Evaluation schreiben atomar strukturierte Events in `audit_log`; physischer DB/Storage-Audit bleibt AP-15-05-03-02 vorbehalten.

## Eligibility, Unbound Media und Evidence-bound Media

`evaluateProjectMediaDeletionEligibility` ist pure und deterministisch: keine Mutation, Uhr, Zufall, DB, Fetch oder Environment. Sie bewertet Cross-Project-Integrität, Uploadstatus, Soft Delete, Lifecycle/Policy/Hold, Project-/Offerzustand, Evidence und Dependencies und löscht nichts.

Ungebundenes aktives `ready`-Media erbt keine synthetischen Intelligence-Dependencies. Es benötigt dennoch `closed`, explizite Policy, Hold `none`, `deletion_eligible` und erfolgreiche Evaluation. Es startet keinen Timer.

Für gebundene Evidence fehlen produktive Observation-/Proposal-/Review-/Correction-Autoritäten und eine eigenständige Offer-Entity. Deshalb liefert die persistente Evaluation fail-closed `dependency_state_unknown` samt `offer_state_unknown` und Unknown-Dependency-Reasons. Ein offenes Angebot blockiert im puren Contract mit `offer_open`; `quote_draft`, `quote_sent` und `accepted` blockieren zusätzlich als nicht-`closed` mit `project_active`. `closed` ersetzt für Evidence weder Offer-/Execution-Nachweis noch Retentionentscheidung. Es wurden keine Fake-Dependency-Tabellen ergänzt.

## Permission, RLS, Grants, Read Service und DTO

Read und Mutation sind Admin-only; Reviewer erhalten keine Lifecycle-Capability. RLS verlangt authentifizierten Admin und aktives Projekt. Direkte Tabellenrechte werden vollständig widerrufen und nur SELECT an `authenticated` erteilt; kein INSERT/UPDATE/DELETE-Grant, keine anon/public-Mutation, keine neue Rolle und kein Service-Role-Client. Mutationen laufen nur über eng validierte Admin-RPCs.

Der Server-Read prüft Auth, Rolle und Project Scope. Sein strict DTO enthält nur `project_media_id`, Retention-/Eligibility-/Reason-/Hold-Zustand, Policyversion, Revision und `updated_at`: keine Storagepfade, Signed URLs, Tokens, Providerdaten oder PII.

## Bestehendes Soft Delete, Orphan Boundary und Tests

Die bestehende Ready-Media-Soft-Delete-RPC wurde aus Safety-Gründen minimal gehärtet: `deleted_at` kann nur bei passender Lifecycle-Zeile mit `deletion_eligible`/`eligible`, Policy und ohne Hold gesetzt werden. Es gibt keine neue Produkt-UI und keine physische Löschung. `pending`/`failed` Orphan Cleanup und dessen bestehender enger Purge bleiben unverändert und unabhängig.

Fokussierte Tests prüfen Registry/Schema/DTO, UUID/FK/Unique/RLS/Grants, Permission, Idempotenz/CAS, Soft-Delete-Härtung, Eligibility-Gates, Unknown Fail-Closed, Purity/Determinismus und verbotene Capabilities. Relevante Evidence-, Gallery-, Finalization-, Orphan-, Purge-, Signed-URL- und Conversation-Regressionen wurden ausgeführt.

## Remaining Limits

Keine persistente Offer-Entity, Execution-Autorität oder produktiven Observation-/Proposal-/Review-/Correction-Dependencies: Evidence-bound Media kann deshalb noch nicht grün werden. Keine Retentiondauer, Scheduler, Queue, Deletion Intent/Worker, Storage-Reconciliation, Tombstones oder Customer-Request-Ausführung. Nächstes kleinstes, erst nach Merge separat freizugebendes Paket ist AP-15-05-03-02 für einen kontrollierten CAS-basierten Deletion-Workflow.

`MEDIA LIFECYCLE PERSISTENCE — IMPLEMENTED`

`DELETION ELIGIBILITY — IMPLEMENTED`

`FAIL-CLOSED UNKNOWN DEPENDENCY GATE — IMPLEMENTED`

`RETENTION POLICY DURATION — NOT CONFIGURED`

`OPEN REVIEW DELETE GATE — MODELED FAIL-CLOSED WHERE PERSISTENCE IS UNAVAILABLE`

`READY MEDIA PHYSICAL DELETE — NOT IMPLEMENTED`

`EVIDENCE TOMBSTONES — NOT IMPLEMENTED`

`READY MEDIA PURGE WORKER — NOT IMPLEMENTED`

`CUSTOMER DELETION REQUEST WORKFLOW — NOT IMPLEMENTED`

`WHATSAPP MEDIA INGESTION — NOT IMPLEMENTED`

`VISION — NOT IMPLEMENTED`

`OVERALL PRODUCT — NOT PRODUCTION READY`
