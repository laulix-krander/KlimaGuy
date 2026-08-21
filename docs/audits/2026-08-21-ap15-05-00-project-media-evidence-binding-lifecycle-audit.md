# AP-15-05-00 — Project Media ↔ Evidence Binding and Customer Photo Lifecycle Audit

## 1. Audit Metadata

| Feld | Wert |
|---|---|
| Audit-ID | `KG-AUDIT-2026-08-21-AP15-05-00-PROJECT-MEDIA-EVIDENCE-BINDING-LIFECYCLE-V1` |
| Datum | 2026-08-21 |
| Branch | `codex/audit-ap15-05-project-media-evidence-lifecycle` |
| Baseline | `a9420426bdbbee0c87b9ea5b9fe152ca25392526` (`work`) |
| Remote | Im Repository ist kein Git-Remote konfiguriert. |
| Ergebnis | **READY FOR OWNER DECISION** |

## 2. Scope

Reines Architektur-/Lifecycle-Audit vor der ersten Bindung echter Kundenmedien. Vollständig geprüft wurden die maßgeblichen Evidence-, Observation-, Mapping-, Descriptive-Knowledge-, Human-Review-/Apply-, Planner-Context- und Synthetic-E2E-Ergebnisse, die aktuelle Domain unter `lib/domain/conversation-intelligence/**` sowie Project-Media-Schema, Migrationen, RLS, Storage, Upload, Galerie, Signed-URL-, Soft-Delete-, Orphan- und Purge-Pfade. Es wird nichts implementiert.

## 3. Current Conversation Intelligence Evidence Pipeline

Der synthetische Pfad ist implementiert: Customer Information → Information Gain → kontrollierter `EvidenceRequest` (`request_photo`/`request_multiple_photos`) → Request-Orchestrierung → `EvidenceAvailability` → immutable `EvidenceObservation` → statisches Observation-to-Claim-Mapping → `KnowledgeClaimProposal` → Human Review → kontrolliertes Apply → `PlannerEvidenceContext`. Request State, Observation State, Review State und Knowledge State sind derzeit pure/in-memory und nicht persistent.

Im synthetischen Adapter ist `evidence_id` noch gleich `request_id`; das ist Fixture-Orchestrierung, keine freigegebene Medienidentität. Observations binden UUIDs für Projekt, Conversation, Evidence und Request-Scope. Mapping erzeugt für exakt fünf freigegebene descriptive Properties ausschließlich `true`, `descriptive_fact`, `observed`; der Planner nutzt angewendete Claims nur als schwachen visuellen Kontext. Weder Observation noch Claim ersetzt technische Missing Information, Readiness, Site Check oder Angebotsfreigabe. Reale Media-, Message-, Storage- oder Provider-Bindung existiert nicht.

## 4. Existing Project Media Architecture

### Belegter Ist-Zustand

| Aspekt | Repository-Befund |
|---|---|
| Tabelle | `public.project_media`; für Orphan-Cleanup zusätzlich `public.project_media_cleanup_items` |
| Primärschlüssel | `project_media.id uuid default gen_random_uuid()`; Cleanup Item ebenfalls UUID |
| Projektbindung | `project_id uuid not null` FK auf `projects(id) ON DELETE RESTRICT`; später zusätzlich Unique `(project_id,id)` für zusammengesetzte Cleanup-FK |
| Bucket | privater Bucket `project-media`; DB-Check erzwingt diesen Namen |
| Pfad | `projects/{project_id}/originals/{media_id}/{stored_filename}`; Originalname ist nicht im Pfad |
| Dateiidentität | `stored_filename` ist eine weitere UUID plus erlaubte Endung; `(storage_bucket,storage_path)` unique |
| MIME | `image/jpeg`, `image/png`, `image/webp`, `application/pdf` |
| `media_type` | geschlossen `image | document`, mit MIME-Konsistenzcheck |
| `display_kind` | keine DB-Spalte; Gallery-DTO leitet `pdf` für PDF, sonst `image` ab |
| Kategorie | `indoor_area`, `outdoor_area`, `indoor_unit_location`, `outdoor_unit_location`, `pipe_route`, `electrical_connection`, `condensate_route`, `facade`, `roof`, `balcony`, `floor_plan`, `technical_document`, `customer_document`, `other` |
| Quelle | DB derzeit ausschließlich `manual_upload` |
| Actor | `uploaded_by uuid not null` FK auf `auth.users(id) ON DELETE RESTRICT`; Reservation verlangt aktuellen Admin |
| Zeit | `created_at`, `updated_at`, optional `deleted_at`; `updated_at`-Trigger vorhanden |
| Uploadstatus | `pending → ready | failed`, terminal durch Trigger geschützt |
| Upload | Admin reserviert zuerst DB-Zeile, erhält serverseitig ein Signed Upload Ticket, Browser lädt exakt an den reservierten Pfad mit `upsert:false`, SECURITY-DEFINER-Finalize prüft Storage-Objekt, Größe und MIME atomar gegen die Reservierung |
| Galerie | aktive `ready`-Zeilen, neueste 50; Admin und Reviewer; private Signed URLs für alle Galerieobjekte, TTL 120 Sekunden |
| Einzelansicht | serverseitige Auth-, Rollen-, Projekt-, Media-, Status- und kanonische Pfadprüfung; Signed URL TTL 120 Sekunden |
| Soft Delete | `soft_delete_project_media` nur Admin, nur aktive `ready`-Zeile, setzt `deleted_at`; kein Restore, kein physisches DB-DELETE für normale Rollen |
| Orphan Cleanup | nur `pending`/`failed`, mindestens 24 Stunden alt: atomarer Admin-Claim, Soft Delete, Cleanup Item und Audit Log |
| Storage Purge | nur zuvor geclaimte, soft-gelöschte `pending`/`failed`-Orphans; Admin claimt Token/Attempt in DB, enger server-only Service-Role-Adapter entfernt Objekt, Completion-RPC setzt `purged`, `retry_required` oder `failed` und auditiert |
| Ready-Media-Purge | **unbekannt/nicht belegt**; vorhandener physischer Purge schließt `ready` explizit aus |
| DB-Zeilen-Purge | **nicht belegt**; auch nach Storage Purge verbleiben `project_media` und Cleanup-Tombstone-artige Zeilen |
| EXIF/Transformation | keine Extraktion, Bereinigung, Orientierungskorrektur, Thumbnail- oder Derivatpipeline belegt |
| Conversation/Message | keine Spalten oder Beziehungen belegt |
| Evidence | keine Tabelle, persistente Evidence-ID oder Bindung belegt |

### RLS und Berechtigungsgrenze

`project_media` hat RLS. Authenticated darf SELECT/INSERT und spaltenbegrenzt `category`, `caption`, `upload_status` aktualisieren. Admin darf aktive Projekte lesen, pending Manual Uploads für sich reservieren und aktualisieren; Reviewer darf aktive `ready`-Medien lesen. Storage ist privat: Admin darf nur ein Objekt zu seiner bestehenden pending Reservation einfügen; Admin und Reviewer dürfen nur Objekte aktiver `ready`-Zeilen lesen. Es gibt keine normale Storage-UPDATE-/DELETE-Policy und keinen Tabellen-DELETE-Grant. Kunden haben im internen Rollenmodell keinen Zugriff.

Die Service Role wird ausschließlich im `server-only` Purge-Client aus Umgebungsvariablen erzeugt und nur über den schmalen `removeReservedProjectMediaObject`-Adapter für einen validierten Bucket/Pfad verwendet. DB-Claim und Completion laufen mit dem eingeloggten Admin-Supabase-Client. Die Service Role ist weder Upload-, Galerie- noch generischer DB-Client.

### Fehler- und Reihenfolgegrenzen des Ist-Purge

Die Reihenfolge lautet: DB-seitiger Cleanup-Claim/Soft Delete → DB-seitiger Purge-Claim mit Token → physische Storage-Löschung → DB-Completion/Audit. Storagefehler werden in transient/retry, unauthorized oder permanent/invalid klassifiziert. Scheitert Completion nach erfolgreicher Storage-Löschung, bleibt `in_progress`; ein automatischer Lease-Recovery-/Reclaim-Pfad ist im Repository nicht belegt. `already_missing` ist im Completion-RPC vorgesehen, der aktuelle Adapter liefert diesen Wert jedoch nicht. Ein durch fehlgeschlagenen Upload entstandenes Objekt kann bis zum kontrollierten Cleanup orphaned bleiben. Evidence-Abhängigkeiten werden heute nirgends geprüft.

## 5. Terminology

- **Project Media:** autoritative DB-/Storage-Repräsentation des gespeicherten Original- bzw. Projektmediums; besitzt Projekt, Dateilifecycle und Zugriff.
- **Evidence Asset:** Intelligence-Repräsentation eines konkreten Mediums als mögliche Evidenz, ohne Bytes oder Locator.
- **Evidence Identity:** stabile, opaque interne UUID (`evidence_id`), unabhängig von Storage- und Provideridentitäten.
- **Evidence Request:** fachlicher Grund und gewünschte Views/Counts, warum Evidence angefordert wurde.
- **Evidence Availability:** request-/targetbezogener Zustand, ob Evidence fehlt, vorhanden aber unausgewertet oder unbrauchbar ist.
- **Evidence Observation:** immutable kontrollierter Befund dessen, was sichtbar festgestellt wurde; keine technische Freigabe.
- **Claim Proposal:** statisch erlaubter, noch nicht angewendeter fachlicher Aussagevorschlag.
- **Knowledge Claim:** nach kontrolliertem Review/Apply wirksame Aussage im Knowledge State.
- **Source Message:** persistierte interne eingehende Kundennachricht, über die ein Medium kam; Intelligence übernimmt nur deren opaque ID.

Keine dieser Entitäten wird zu einer universellen „Foto“-Struktur zusammengelegt.

## 6. Architecture Variants

Bewertung: `++` stark, `+` brauchbar, `0` gemischt, `-` schwach, `--` ungeeignet. MVP-Komplexität bewertet Einfachheit.

| Kriterium | A Media-ID = Evidence-ID | B separate Evidence-Tabelle | C nur opaque Media-Ref | D Evidence-Asset-Schicht | E Hybrid |
|---|---:|---:|---:|---:|---:|
| Integrität/Projektgate | 0 | + | 0 | ++ | ++ |
| Security/RLS | 0 | + | + | ++ | ++ |
| Delete/Retention/Tombstone | -- | + | - | ++ | ++ |
| WhatsApp/manueller Upload | - | + | 0 | ++ | ++ |
| mehrere Requests/Needs | - | + | 0 | ++ | ++ |
| Vision/Review/Re-Review | - | + | 0 | ++ | ++ |
| Audit/Provenienz | -- | + | - | ++ | ++ |
| Testbarkeit | 0 | + | + | ++ | ++ |
| MVP-Einfachheit | ++ | + | ++ | 0 | + |

A vermischt Medien- und Evidenzlifecycle. B ist sinnvoll, bleibt aber ohne klare Medienautorität und fachliche Binding-Schicht mehrdeutig. C kapselt Locator, kann jedoch Request-, Message-, Lifecycle- und Tombstone-Provenienz nicht ausreichend tragen. D ist das vollständige Zielmodell. **E wird empfohlen:** Project Media bleibt Medienautorität; eine persistente Evidence-Asset/-Binding-Schicht besitzt `evidence_id`, referenziert `project_media_id`, und Intelligence kennt nur opaque IDs und fachliche Bindungen. E ist praktisch D mit ausdrücklich unveränderter Project-Media-Autorität und einem schmalen MVP-Schnitt.

## 7. Recommendation

Zielkette: `project → conversation → source message → project media → evidence identity → optional evidence request → observation(s) → proposal(s) → review → claim(s)`.

Project ist Autorität für Medienbesitz; Conversation/Message sind Provenienz. `project_media_id + evidence_id` werden getrennt persistiert. Nicht jedes Project Media wird Evidence. Ungefragte Medien beginnen als unklassifizierter Kandidat. Ein Evidence Asset darf kontrolliert mehrere Target-/Purpose-Bindungen und ein Request mehrere Assets besitzen. Intelligence speichert niemals Bucket, Pfad, Signed-/Provider-URL, Provider-ID oder Bytes.

## 8. Evidence Binding Contract

Empfohlener strikter, versionierter Contract:

| Feld | Regel |
|---|---|
| `evidence_id` | required, interne UUID, immutable |
| `project_id` | required; mit Media/Conversation DB-seitig gleich erzwingen |
| `conversation_id` | required für Conversation-Evidence; interne Uploads brauchen explizite Zielconversation oder einen später separat definierten project-only Importpfad |
| `project_media_id` | required solange Original existiert; nach kontrolliertem Purge nullable nur zusammen mit Tombstone |
| `source_message_id` | required für `customer_whatsapp`/`customer_web`; optional/null für `internal_upload`; historische Imports nur mit rekonstruierter interner Message-ID |
| `evidence_request_id` | optional; niemals bei ungefragtem/ambigem Eingang erfinden |
| `evidence_target` | optional bis Klassifizierung, danach geschlossener bestehender Target Key |
| `purpose` | kontrollierte 1:N-Zuordnung; bestehende Purpose Codes wiederverwenden/erweitern nur per Audit |
| `source_channel` | geschlossene Source-Channel-Union |
| `source_actor_class` | bestehende Actor-Semantik; `customer` für Kundeneingang, `admin`/`reviewer` intern |
| `received_at` | Offset-Timestamp aus internem Eingang; nicht EXIF als Autorität |
| `binding_status` | `unclassified | bound | binding_ambiguous | rejected` (empfohlen) |
| `lifecycle_status` | getrennt vom fachlichen Binding; siehe Abschnitt 19 |
| Provenienz | Contract-/Revisionstempel und immutable Created-Timestamp; Korrekturen als Revision/Supersession |

Ausgeschlossen: Signed URL, Storage-Pfad/-Bucket, Provider-URL/-Token/-Payload, E-Mail, Telefonnummer, Adresse, Kundentext, Originaldateiname, Bytes und freie AI-Confidence.

## 9. Source Channels

Empfohlene geschlossene Startmenge: `internal_upload`, `customer_whatsapp`, `customer_web`, `historical_import`. Nur implementierte Adapter dürfen einen Wert erzeugen. Channel bezeichnet Transport/Ingress, Actor bezeichnet Ursprung; beides darf nicht vermischt werden. Kein Channel erweitert automatisch fachliche Berechtigung.

## 10. Project Binding

Cross-Project-Binding muss auf allen Ebenen unmöglich sein: Domain prüft alle IDs, Service lädt in Projektscope, DB verwendet zusammengesetzte Unique/FKs bzw. Constraint Trigger für `(project_id, project_media_id)`, `(project_id, conversation_id)`, Request und Message, RLS prüft aktives Projekt, und Binding plus Request-Update erfolgen atomar. Eine bloße unabhängige FK je ID reicht nicht. Project A Media für Project B wird fail closed abgewiesen und erzeugt keinerlei Knowledge-Effekt.

## 11. Conversation Binding

Das Medium gehört primär dem Projekt und kann dessen Lebenszyklus über mehrere Conversations überdauern. Evidence dokumentiert genau die Conversation, in der es einging bzw. fachlich gebunden wurde. Bei mehreren Conversations darf eine zweite Conversation nicht still als Ursprung gesetzt werden; Wiederverwendung braucht eine explizite neue fachliche Binding-/Usage-Zuordnung zum selben Evidence Asset, während ursprüngliche Provenienz unverändert bleibt. Conversation muss dasselbe Projekt besitzen.

## 12. Source Message Binding

Für WhatsApp und Customer Web ist eine persistierte interne eingehende `message_id` verpflichtend: Reihenfolge, Replay, Idempotenz und Matching sind sonst nicht auditierbar. Intelligence dupliziert keinen Nachrichtentext. Interner manueller Upload darf `source_message_id=null` tragen, aber benötigt Actor und Auditkontext. Das bestehende Conversation Event kennt bereits opaque `message_id`, eine persistente Message-/Media-Relation ist jedoch nicht belegt und muss separat entstehen.

## 13. Evidence Request Matching

`latest open request` allein wird verworfen. Priorität: (1) explizite interne Correlation, wenn Transport/UX sie zuverlässig liefert; (2) genau ein kompatibler offener Request innerhalb derselben Conversation mit kontrolliertem Conversation-State-/Target-/View-Gate; (3) kontrollierte Heuristik darf nur Kandidaten vorschlagen; (4) Human Correction. Mehrere plausible Requests, verspätete Medien, inkompatible Views oder fehlende Korrelation ergeben `binding_ambiguous` bzw. `unclassified`, nicht Confidence. Ein abgeschlossener Request wird nicht wieder geöffnet; ein neues Asset kann unclassified oder in einem expliziten Late-Response-Review landen.

## 14. Unsolicited Media

Pfad: inbound media → interne Message → Project Media → Evidence Asset `unclassified` ohne Request/Target/Purpose → kontrollierte Klassifizierung → optional Bindings. Kein Need wird automatisch erfüllt, keine Observation erzeugt und kein Knowledge State mutiert.

## 15. Multi-purpose Media

Ein Evidence Asset kann über separate fachliche Usage-/Binding-Zeilen mehrere Purposes/Targets unterstützen, etwa Raumübersicht, Innenbereich und Zugänglichkeitskontext. Jede Zuordnung benötigt eine erlaubte Target/Purpose-Kombination, Actor/Audit und eigene Statussemantik. Eine Zuordnung impliziert keine andere; Observation Target Gates bleiben wirksam. Das Original wird nicht dupliziert.

## 16. Multi-media Requests

Request → 1..N Evidence Assets ist eine Join-Beziehung. `minimum_count`, `maximum_count`, `required_views`, `provided_count` und Completion werden requestbezogen aus gültigen, nicht duplizierten Bindings abgeleitet. `provided_count` allein erfüllt den Request nicht: Views, Usability und fachliche Regeln zählen. Gleiche Transportlieferung wird idempotent ignoriert; absichtlicher Resend bleibt eigenes Media/Asset, bis fachlich klassifiziert. Alternative Winkel sind explizite Views, nicht „mehr ist besser“.

## 17. Provider Identity Boundary

`provider message/media ID → Connector/Transport-Idempotency Store → interne message_id / project_media_id → evidence_id`. Provider-IDs dürfen nur im engen Connector-/Ingress-Layer, geschützt und retentionbegrenzt, existieren. Conversation Intelligence sieht ausschließlich interne IDs. Abgelaufene Provider-URLs sind Transportfehler und nie Provenienz.

## 18. Idempotency

Ein enger Ingestion-Key bindet Provider, Source Channel, Provider Message ID, Provider Media ID und internen Conversation-/Project-Scope; Unique Constraints verhindern denselben Webhook zweimal. Der Key ist Transportidentität, nicht Domainautorität. Gleicher Provider-Key mit anderem Project/Conversation-Scope ist Security Conflict. Content-Hash-Deduplizierung ist nicht Teil des MVP. Wiederholung nach partiellem Fehler setzt denselben Ingestion-Workflow fort, statt neue Media-/Evidence-IDs anzulegen.

## 19. Customer Photo Lifecycle

Empfohlen sind getrennte Achsen statt einer überladenen Statusliste:

- **Ingestion:** `receiving | stored | ingestion_failed`.
- **Binding:** `unclassified | bound | binding_ambiguous | rejected`.
- **Use:** aus offenen Observation/Proposal/Review/Offer-Abhängigkeiten abgeleitet, nicht als frei gesetzter Status.
- **Retention:** `retained | deletion_eligible | deletion_pending | tombstoned`.

Projekt-/Offerstatus (`collecting_information`, `technical_review`, `quote_draft`, `human_review`, `quote_sent`, `accepted`, `rejected`, `closed`) bleibt autoritativ im Project/Offer-Modell und wird nicht im Asset kopiert. „under_review“, „used_for_offer_preparation“, „offer_created“, „project_active“, „closed_no_order“ sind abgeleitete Lifecycle-Phasen/Gates. `received` entspricht erfolgreichem internen Eingang, `bound` bleibt fachliche Achse, `deleted` wird als `tombstoned` plus physischer Zustand modelliert.

## 20. Minimum Retention Boundary

Ein relevantes Kundenfoto muss mindestens durch Informationssammlung, Interpretation, fachliche Review und Angebotserstellung projektgebunden, autorisiert abrufbar und referenzierbar bleiben. Zusätzlich blockieren ein offenes Angebot und jede offene Observation-/Proposal-/Review-/Offer-Preparation-Abhängigkeit die Löschung. Dieses Audit setzt bewusst keine Tages-/Monatsfrist. Frist, Rechtsgrundlage, Beginn und Löschpflicht benötigen Owner-/Datenschutzfreigabe.

## 21. Offer Lifecycle

- **Angebot offen:** keine vorzeitige Löschung relevanter Evidence.
- **Angenommen/Projekt aktiv:** Retention kann Montageplanung, Rückfragen, Durchführung und Nachweis umfassen; Zweck und Endpunkt sind Ownerentscheidung.
- **Nicht angenommen/geschlossen ohne Auftrag:** keine unbegrenzte Default-Retention; nach Ablauf freigegebener Frist und geschlossenen Abhängigkeiten löschbar.
- **Angebot erstellt, aber Review offen:** weiterhin blockiert.

Das Produkt benötigt eine eindeutige Offer-Entity/-Statusautorität; eine solche Bindung der Medien ist im geprüften Media-Modell nicht belegt.

## 22. Open Review Deletion Gate

Vor Soft Delete und erneut vor physischem Purge muss ein dedizierter Lifecycle Service atomar prüfen: offene/noch relevante Observation, Proposal, Review, Offer Preparation oder offenes Angebot. Ist eine Bedingung wahr, Ergebnis `deletion_blocked_open_dependency`; keine Storage-Aktion. Observation „open“ benötigt im Folgepaket präzise Semantik, da die heutige Observation immutable, aber nicht persistent workflow-statusbehaftet ist.

## 23. Media Deletion

Empfehlung **D, status-/retentionabhängig**: Ein reviewer-approved descriptive Claim darf nach Ende der zulässigen Originalretention bestehen bleiben, sofern ein minimaler Tombstone und Provenienzstatus erhalten bleiben. Vorher sperren Retention und offene Prozesse. Nicht reviewte/ungeklärte Ableitungen dürfen keinen fortdauernden Knowledge-Effekt rechtfertigen. Datenschutzorientierte Löschung darf technisch möglich bleiben; permanente Medienhaltung allein wegen eines schwachen Claims wird nicht empfohlen.

## 24. Tombstones

Minimal: `evidence_id`, ehemals gebundene interne `project_media_id` (als Wert oder nullable nach definierter FK-Strategie), `deleted_at`, geschlossener `deletion_reason`, `source_type/source_channel`, `provenance_status=evidence_tombstoned`, optional Contract-Version. Kein Pfad, Bucket, URL, Provider-ID, Hash, Dateiname, PII oder Kundentext. Die Notwendigkeit, `project_media_id` pseudonymisiert weiterzuführen, ist Datenschutzentscheidung; Evidence Identity bleibt für Claims stabil.

## 25. Observation After Delete

Reviewer-bestätigte oder für Audit benötigte descriptive Observations dürfen immutable bestehen, wechseln aber auf `evidence_tombstoned`; Original-Re-Review ist unmöglich. Offene, unreviewte Observations blockieren Delete. Nicht mehr zweckgebundene Roh-/AI-Observations können nach definierter Policy gelöscht oder invalidiert werden. Reviewer Correction bleibt als eigene immutable Entscheidung mit Reason/Supersession erhalten und darf nicht in die ursprüngliche Observation umgeschrieben werden.

## 26. Claim After Delete

Ein angewendeter schwacher descriptive Claim kann bestehen bleiben, wenn Review, Zweckbindung und Retention Policy dies erlauben; seine Provenienz zeigt zwingend `evidence_tombstoned`. UI und spätere Regeln dürfen ihn nicht als re-reviewbares Original darstellen. Claims ohne freigegebene fortdauernde Rechts-/Fachgrundlage werden invalidiert/superseded, nicht heimlich entfernt oder auf `false` gesetzt.

## 27. Safety Evidence Retention

Die Architektur muss Retention Class/Purpose später differenzieren können. Safety-/Technical Claims können strengere Originalverfügbarkeit, Review und Löschgates benötigen als descriptive Facts. Dieses Audit führt weder solche Claims noch Fristen ein; bestehende Site-Check- und technische Grenzen bleiben vollständig bestehen.

## 28. Existing Purge Architecture

Der heutige Purge ist nur Orphan-Hygiene für alte `pending`/`failed`-Uploads. Er soft-deletet zuerst DB-Metadaten, claimt dann einen tokenisierten Attempt, löscht Storage per engem Service-Role-Adapter und komplettiert/auditiert den DB-Status. Er löscht keine DB-Zeile und keine `ready`-Medien. Für reale Evidence braucht es davor: Evidence-Dependency-Gate, Retention-Entscheidung, Tombstone-Transition und einen separaten Ready-Media-Lifecycle-Purge; bestehender Orphan-Purge darf nicht einfach erweitert werden. Retry/Lease Recovery, Objekt-fehlt-Erkennung und Recovery nach erfolgreicher Storage-Löschung aber fehlgeschlagener Completion müssen explizit werden.

## 29. FK/Delete Semantics

| Variante | Bewertung |
|---|---|
| `RESTRICT` solange Binding existiert | starke Integrität/Re-Review, blockiert aber datenschutzgebotene Löschung ohne Transition |
| `SET NULL` | löschfähig, aber ohne Tombstone/Lifecycle zu leicht provenance-arm |
| nur logical delete | auditierbar, löscht Bytes nicht und ist keine vollständige Datenschutzlöschung |
| dedicated lifecycle service | koordiniert Gates, Tombstone, Storage und Recovery; höhere, notwendige Komplexität |

Empfehlung: zunächst zusammengesetzte FK mit `RESTRICT`; Löschung ausschließlich über dedizierten Lifecycle Service, der in einer DB-Transaktion Binding/Tombstone kontrolliert, danach Storage eventual-consistent purgt. Nach Tombstone darf die Media-Referenz gemäß freigegebener Policy `SET NULL`/entkoppelt werden, während `evidence_id` stabil bleibt. Keine direkte SQL-/Client-Löschung.

## 30. RLS

Spätere Evidence-Tabellen erhalten RLS. Admin und Reviewer dürfen projektgebundene interne Evidence gemäß vorhandener Rollen/Capabilities sehen; keine neue Rolle. Mutationen (Klassifizierung, Review, Lifecycle) benötigen getrennte Policies/RPCs/Server-Gates, nicht pauschalen Tabellenzugriff. Kunden erhalten über die interne App keinen direkten Media-/Evidence-Zugriff; WhatsApp läuft über Transport. Policies müssen Project-, Conversation- und zusammengesetzte Media-Bindung prüfen und Tombstones/gelöschte Medien standardmäßig aus Views ausschließen.

## 31. Service Role

Die bestehende Service Role bleibt ausschließlich im engen server-only Storage-Remove-Adapter. Sie wird nicht zum Evidence Admin Client. Falls WhatsApp-Ingestion privilegierten Storagezugriff braucht, entsteht ein separater server-only Adapter mit exakt Download/Insert/Finalize-relevanten Operationen, validiertem Bucket/Pfad und eigener Fehlerklassifikation; keine generische Service-Role-Abstraktion.

## 32. Signed URLs

Signed URLs sind kurzlebige, autorisierte View-/Transportwerte (heute 120 Sekunden) und werden ausschließlich on demand nach Projekt-/Rollen-/Media-Prüfung erzeugt. Intelligence, Bindings, Observations, Claims, Audit Logs und Tombstones speichern sie niemals. Gleiches gilt für Signed Upload Tokens.

## 33. Original Integrity

Das eingegangene Original soll unverändert in `originals` bleiben. Keine Vision-, Orientierungs- oder Optimierungsoperation überschreibt es. Thumbnails, redigierte oder Vision-optimierte Kopien sind getrennte, abgeleitete Assets mit eigener Identity, Purpose, Retention und Provenienz oder werden temporär verarbeitet. Die aktuelle Ablage benennt `originals`, garantiert aber keine byteweise Integrity-/Derivatpolitik; diese ist noch zu implementieren.

## 34. Metadata/EXIF Privacy

GPS EXIF und unnötige Geräte-, Zeit- oder Identitätsmetadaten dürfen nicht in die Intelligence Domain gelangen. Orientierung darf als erforderliche technische Metainformation normalisiert/verarbeitet werden, ohne Original zu verändern; `received_at` stammt nicht aus EXIF. Ob EXIF im unveränderten Original rechtlich behalten oder beim Ingest in einem getrennten Original/Arbeitsderivat entfernt wird, ist Owner-/Datenschutzentscheidung. Keine Gesichtserkennung oder Identitätsanalyse. Kein EXIF in Logs, Claims oder Metriken.

## 35. Duplicate Media

Unterschieden werden: duplicate Webhook (idempotent, kein neues Objekt), identischer Inhalt über neue Nachricht (möglicherweise absichtlicher Resend, eigenes Ingress-Ereignis) und bewusst alternative Winkel. Zunächst nur Provider-Idempotency. Keine automatische perceptual/cryptographic image-hash-Deduplizierung ohne Zweck-, Risiko-, Retention- und Privacy-Audit.

## 36. Historical Chats

Separater `historical_import`-Adapter. Evidence nur bei bekannter und DB-geprüfter Projekt-, Conversation- und Source-Zuordnung, zulässiger Datenschutzgrundlage und rekonstruierbarem fachlichem Scope. Fehlende Message-/Request-Korrelation bleibt unclassified. Altmedien erzeugen keine automatische Observation, Claim-, Knowledge-State- oder globale Lernmutation.

## 37. Knowledge Base Boundary

Kundenfoto ist projektgebundene Evidence, niemals globale Knowledge Base. Ein zukünftiger Weg lautet: Evidence → Human Review → bereinigter Quality Case → Expert Rule Candidate → separate Freigabe → versionierte Knowledge Rule. Original, PII und projektspezifische IDs werden nicht in eine globale Regel übernommen. Kein Foto→Regel-Automatismus.

## 38. Metrics Boundary

Später zulässig sind aggregierte technische Prozessmetriken wie requested-photo-provided rate, unusable-evidence rate, request-to-observation rate, proposal-approval rate und photo-re-request rate. Keine Kundenprofile, keine personenbezogene Analyse, keine Media-/Provider-ID, kein Bildinhalt und keine PII in Metrics. Mindestgruppengrößen/Retention sind vor Produktion festzulegen.

## 39. Positive-only Conflict Boundary

Die fünf aktuellen descriptive Properties sind positive-only Boolean Facts. Gültig sind ausschließlich `true`, `descriptive_fact`, `observed`; ein valider `false`-Claim ist nicht freigegeben. Daher ist ein klassischer True-vs-False-Conflict derzeit nicht konstruierbar. Media Binding löst oder erweitert diese Semantik ausdrücklich nicht. Separates Correction-/Invalidation-/Supersession-Audit soll `observation_invalidated`, `evidence_superseded`, `claim_corrected` und `newer_evidence_replaces_provenance` prüfen. `false` wird nicht künstlich als „Gegenteil gesehen“ eingeführt.

## 40. WhatsApp Future Path

Ziel: WhatsApp inbound message → interne Conversation Message → enger Media Download → Project Media Reservation/Finalize → Evidence Asset/Binding → heutige Pipeline. Customer-visible Questions/Evidence Requests bleiben transportagnostisch. Meta URLs/IDs/Tokens enden im Connector. Keine Meta API oder WhatsApp-Integration in diesem Paket.

## 41. Internal Upload Future Path

Ein Admin wie Laurie kann vorhandenes, `ready` Project Media explizit als Evidence klassifizieren. Channel `internal_upload`, Actor `admin`, Source Message optional null, Projekt/Conversation erforderlich, Request optional. Der existierende Upload wird nicht automatisch Evidence; Klassifizierung und Purpose/Target werden kontrolliert auditiert.

## 42. Atomicity

Storage und PostgreSQL können nicht gemeinsam ACID sein. Sequenz: DB-Reservation/Ingestion-Record → Storage Upload/Download → DB-Transaktion, die Media `ready`, Evidence Binding und optional Request-Binding/`provided_count` gemeinsam validiert/erzeugt. Request darf erst `provided` werden, wenn ein nutzbares, projektgleiches Asset gebunden ist; bei Ambiguität bleibt er offen. Recovery reconciled Reservation gegen Storage. Löschung: DB Gate+Tombstone/claim atomar, Storage eventual consistent, Completion atomar/idempotent. Jeder Schritt hat stabile Workflow-ID, begrenzten Retry und auditierbaren Status.

## 43. Failure Matrix

| Fall | Erwarteter Status | Retry | Human Review | Cleanup | Knowledge-Effekt |
|---|---|---|---|---|---|
| A Upload ok, Binding-DB fehlgeschlagen | Media `ready`, Evidence `ingestion_failed/unbound` | DB idempotent | nur bei Korrelation | Reconcile; nicht sofort löschen | keiner |
| B DB Record, Storage fehlgeschlagen | `pending/ingestion_failed` | Upload/Download begrenzt | nein | später Orphan-Cleanup | keiner |
| C WhatsApp Download fehlgeschlagen | Ingestion `download_failed`, Message bleibt | solange Provider abrufbar | ggf. Operator/Nachfrage | keine Fake-Media-Zeile ready | keiner |
| D Duplicate webhook | vorhandener Workflow zurückgegeben | idempotenter Replay | nein | keine Duplikate | keiner zusätzlich |
| E Project mismatch | `rejected/security_conflict` | nein | Security/Operator | Quarantäne/kein Binding | keiner |
| F Conversation mismatch | `rejected/binding_ambiguous` | nur korrigierter Scope | ja | Media projektgebunden behalten | keiner |
| G Request abgeschlossen | unclassified/late candidate | nein gegen alten Request | ggf. | keine | keiner |
| H mehrere offene Requests | `binding_ambiguous` | nach Entscheidung | ja/Nachfrage | keine | keiner |
| I Media nach Timeout | `late/unclassified` | nicht automatisch reopen | ggf. | policybasiert | keiner |
| J ungefragtes Media | `unclassified` | n/a | Klassifizierung optional | retentionbasiert | keiner |
| K Delete bei open Review | `deletion_blocked_open_dependency` | nach Abschluss | ja | keine Storage-Aktion | unverändert |
| L Storage delete fehlgeschlagen | `deletion_pending/retry_required` oder `failed` | transient ja | permanent Operator | DB Tombstone/Claim behalten | Provenienz tombstoned erst nach Policyphase |
| M DB delete/Completion fehlgeschlagen | Workflow `in_progress/recovery_required` | idempotent | Operator nach Limit | Storage-Zustand reconciliieren | keine zusätzliche Mutation |
| N Observation, Media fehlt | `evidence_missing`/Incident, dann Tombstone | Recovery prüfen | ja bei offenem Review | Orphan-/Incident-Reconcile | kein Auto-Apply |
| O Claim, Media tombstoned | Claim plus `evidence_tombstoned` | nein | Re-Review unmöglich anzeigen | Policybasiert | Claim nur nach freigegebener Regel aktiv |
| P Provider URL abgelaufen | `download_failed_terminal` | Refresh nur Connector-fähig | ggf. neue Anfrage | keine Provider-URL persistieren | keiner |

## 44. Owner Decisions

| # | Entscheidung / Varianten | Empfehlung | Risiko | Status |
|---:|---|---|---|---|
| 1 | Media-ID vs separate Evidence-ID | separate opaque UUID | Lifecycle-Kopplung sonst | `recommended` |
| 2 | Medienautorität | Project Media bleibt autoritativ | doppelte Locatorautorität | `recommended` |
| 3 | Binding transient/persistent | persistent, versioniert | Replay/Audit sonst unmöglich | `recommended` |
| 4 | Message bei WhatsApp optional/required | required intern | Matching/Idempotenzverlust | `recommended` |
| 5 | Request required/optional | optional | unsolicited sonst unmöglich | `recommended` |
| 6 | unsolicited reject/auto/unclassified | unclassified candidate | falsche Need-Zuordnung | `recommended` |
| 7 | ein Media/ein vs mehrere Needs | mehrere kontrollierte Usages | Overbinding | `recommended` |
| 8 | Request ein vs mehrere Media | 1:N mit View-/Count-Regeln | Count-Fehlschluss | `recommended` |
| 9 | ambiguous latest/heuristic/review | geschlossener ambiguous + Review/Nachfrage | Fehlbindung | `recommended` |
| 10 | Project nur Service vs DB-enforced | zusammengesetzt DB-enforced + Gates | Cross-project Leak | `recommended` |
| 11 | Conversation Autorität | Provenienz required, Project Media bleibt project-owned | Multi-chat-Verwechslung | `recommended` |
| 12 | Provider-ID Domain/Transport | nur Transport/Idempotency | Lock-in/Leak | `recommended` |
| 13 | Original mutable/immutable | immutable | Re-Review/Manipulation | `recommended` |
| 14 | EXIF/GPS behalten/strip/Derivat | minimal, nie Intelligence; genaue Originalpolicy festlegen | Datenschutz vs Integrität | `owner_required` |
| 15 | Mindestretention bis Angebot | ja inkl. offenem Angebot/Review | vorzeitige Löschung | `recommended` |
| 16 | aktiver Auftrag Retention | zweck-/statusabhängig bis definierter Abschluss | unbegrenzt vs Nachweisverlust | `owner_required` |
| 17 | No-order Retention | begrenzte Frist ab terminalem Status | Datenschutz | `owner_required` |
| 18 | Open Review Delete | blockieren | nicht re-reviewbar | `recommended` |
| 19 | Claim nach Delete | reviewer-approved/statusabhängig mit Tombstone | schwache Provenienz | `owner_required` |
| 20 | Observation nach Delete | reviewed/auditrelevant mit tombstoned Status; offene blockieren | Datenschutz/Audit | `owner_required` |
| 21 | Tombstone | minimal, PII-/URL-frei | Provenienzverlust | `recommended` |
| 22 | FK | RESTRICT + Lifecycle Transition + nullable Tombstone-Ref | Löschdeadlock/Komplexität | `recommended` |
| 23 | Purge | eigener Evidence-aware Ready-Media-Pfad | Ist-Purge ist nur Orphan | `recommended` |
| 24 | Service Role | enge getrennte Adapter | Privilegienausweitung | `recommended` |
| 25 | Signed URLs in Evidence | strikt verboten | Tokenleck/Expiry | `recommended` |
| 26 | Historical Media | separater kontrollierter Import | Scope/Datenschutz | `owner_required` |
| 27 | Conflict/Invalidation | separates Paket | positive-only Contract | `recommended` |
| 28 | nächstes Paket | AP-15-05-01 Persistence Baseline | WhatsApp/Vision zu früh | `recommended` |

## 45. Recommended Packages

1. **AP-15-05-01 — Project Media ↔ Evidence Persistence Baseline:** Tabellen/Contracts, opaque IDs, zusammengesetzte Project Integrity, RLS, Repository; keine WhatsApp/Vision.
2. **AP-15-05-02 — Internal Real Media Evidence Binding:** vorhandenes manuelles `ready` Project Media kontrolliert in Pipeline; keine automatische Interpretation.
3. **AP-15-05-03 — Customer Photo Lifecycle and Retention Implementation:** erst nach Owner-/Datenschutzentscheidungen, inklusive Gates/Tombstone/Ready-Purge-Recovery.
4. **AP-15-05-04 — WhatsApp Media Ingestion Audit:** Connector, Message-Persistenz, Idempotency, Provider-Retention und Failure Recovery; Implementation danach separat.
5. **separates Correction/Invalidation/Supersession Audit:** vor konfliktbehafteter Re-Review-Automation.
6. **AP-15-06-00 — Vision Adapter Audit:** erst nach realer Binding- und Lifecycle-Baseline; Vision Implementation nochmals separat.

Die Nummerierung kollidiert mit keinem im geprüften Stand belegten AP-15-05-Paket.

## 46. Future Tests

Später erforderlich: strikte Contracts/Extra-Field-Rejection; Project-, Conversation-, Message- und Request-Binding; unsolicited; mehrere Assets/Requests/Purposes/Views; provided-count/completion ohne Count-Automatismus; duplicate Webhook/idempotency; Cross-Project/Conversation rejection auf Domain, Service, FK und RLS; Admin/Reviewer und kein Kundenzugriff; Storage-/DB-Partial-Failures und Recovery; Orphan-/Ready-Purge; Tombstones; Open-Review-/Offer-Delete-Gates; Claim/Observation nach Delete; Signed-URL-/Path-/Provider-/PII-Ausschluss; Source Channels/Actors; Retention-Transitions; Original-Integrity/Derivate/EXIF; Historical Imports; positive-only Invalidation-Grenze; kein Vision-Import und keine WhatsApp-Abhängigkeit im Core; kein Knowledge-Effekt aus Ingestion/Binding/Failure.

## 47. Production Gates

1. Ownerentscheidungen 14, 16, 17, 19, 20 und 26 samt Datenschutz/Rechtsgrundlage abgeschlossen.
2. AP-15-05-01 mit Migration, zusammengesetzten Integritätsconstraints, RLS und negativen Cross-Project-Tests separat implementiert/reviewed.
3. Persistente Conversation-/Message-Autorität und WhatsApp-Idempotency vor Kundeningress.
4. Evidence-aware Delete Gate, Tombstone, Retention Scheduler/Owner, Ready-Media-Purge und Recovery getestet.
5. Kein generischer Service-Role-Client; Secrets ausschließlich serverseitig.
6. Signed URLs/Storage-/Providerdaten/EXIF/PII strukturell aus Intelligence ausgeschlossen.
7. Original-/Derivat-/Metadata-Policy freigegeben.
8. Human Review vor Claim Apply; kein Auto-Apply, keine technische Freigabe, keine automatische Angebotsfreigabe.
9. Positive-only Correction/Invalidation/Supersession separat entschieden.
10. WhatsApp-Audit und erst danach Connector-Implementation; Vision-Audit und erst danach Vision.
11. Betriebsmonitoring für stuck ingestion/purge/reconciliation ohne PII.

## 48. Scope Confirmation

Ausdrücklich ausschließlich Audit und diese eine Dokumentationsdatei. Keine echte Medienbindung, Persistenzänderung, DB-/Migration-/SQL-/RPC-/RLS-Änderung, Storageänderung, Project-Media-Änderung, Upload-, Delete-/Purge-Änderung, WhatsApp/Meta, Vision/OCR, KI, UI, Server Action, Service, Tests, Dependency oder `package.json`-Änderung. Keine Anwendungstests wurden ausgeführt.

## 49. Status

**Auditstatus: READY FOR OWNER DECISION**

`SYNTHETIC EVIDENCE PIPELINE — IMPLEMENTED`

`SYNTHETIC HUMAN REVIEW/APPLY — IMPLEMENTED`

`PLANNER DESCRIPTIVE EVIDENCE CONTEXT — IMPLEMENTED`

`REAL PROJECT MEDIA ↔ EVIDENCE BINDING — NOT IMPLEMENTED`

`PERSISTENT EVIDENCE IDENTITY — NOT IMPLEMENTED`

`CUSTOMER PHOTO LIFECYCLE — NOT IMPLEMENTED`

`CUSTOMER PHOTO RETENTION POLICY — NOT FINALIZED`

`MEDIA TOMBSTONES — NOT IMPLEMENTED`

`WHATSAPP MEDIA INGESTION — NOT IMPLEMENTED`

`VISION — NOT IMPLEMENTED`

`POSITIVE-ONLY DESCRIPTIVE CONFLICT SEMANTICS — DEFERRED TO CORRECTION/INVALIDATION AUDIT`

`OVERALL PRODUCT — NOT PRODUCTION READY`

## AP-15-05-01 Project Media ↔ Evidence Persistence Baseline Result

### Implementierte Baseline

Die additive Migration `202608210001_project_evidence_persistence.sql` ergänzt `public.project_evidence`. `public.project_media` bleibt unverändert die einzige Medien- und Storage-Autorität. Jede klassifizierte semantische Bindung besitzt eine von `project_media_id` getrennte, DB-generierbare UUID `id` (im Contract `evidence_id`). Conversation-, Source-Message- und Evidence-Request-Spalten wurden bewusst nicht angelegt: Die zugehörigen Entitäten sind weiterhin in-memory und wären keine belastbare FK-Autorität.

Die einzelne Baseline-Tabelle repräsentiert eine klassifizierte Evidence-Usage-Identity aus Media, Target und Purpose. Ein Medium kann deshalb über weitere Zeilen andere zulässige Target-/Purpose-Verwendungen erhalten, ohne das Original zu duplizieren. Eine normalisierte Asset-plus-Usage-Aufteilung wird erst mit persistenter Conversation-/Request-Provenienz nötig; dieses Paket führt keine semantisch falsche freie Purpose-Liste ein.

### Integrität und Vertrauensgrenzen

- Die zusammengesetzte FK `(project_id, project_media_id) → project_media(project_id, id) ON DELETE RESTRICT` verbietet Cross-Project-Bindings in der Datenbank und verhindert stilles Löschen gebundener Medien. Die bereits vorhandene Unique-Grenze von `project_media(project_id,id)` wird wiederverwendet.
- Target und Purpose verwenden exakt die geschlossenen Conversation-Intelligence-Keys. DB-Checks sichern beide Allowlists; das strict Zod-Schema prüft zusätzlich die bestehende Target-/Purpose-Kompatibilität aus dem Registry-Contract.
- `source_channel` ist in diesem Paket ausschließlich `internal_upload`, `source_actor_class` ausschließlich `admin`. Beides wird serverseitig gesetzt. Keine Providerfelder oder zukünftigen, noch nicht integrierten Channels werden vorgetäuscht.
- Die fachliche Statusallowlist lautet `bound | unclassified | binding_ambiguous | invalidated`; die aktuelle Insert-Grenze gestattet absichtlich nur explizit klassifiziertes `bound`. Retention- oder Projektlifecycle wurde nicht in diese Achse aufgenommen.
- Eine Unique Constraint auf `(project_id, project_media_id, evidence_target, purpose)` und Vorab-/Konflikt-Re-Read liefern das idempotente Ergebnis `already_bound`. Andere gültige Target-/Purpose-Kombinationen bleiben möglich.
- RLS ist aktiviert und fail closed. Ausschließlich authentifizierte Admins mit gültigem Profil und aktivem Projekt dürfen lesen/einfügen; Reviewer erhalten in diesem MVP keine Binding- oder Evidence-Lesepolicy. Es gibt keine anon/customer Policy.
- Grants sind explizit auf `SELECT, INSERT` für `authenticated` begrenzt; `public`, `anon` und `authenticated` werden vorher vollständig revoked. Es gibt weder UPDATE- noch DELETE-Grant und keine Service Role.

### Servergrenze, Eligibility und Contract

Die schmale Server Action und ihr testbarer Service authentifizieren den User, validieren Profil und zentrale Capability `canBindProjectMediaAsEvidence`, prüfen aktives Projekt, Media-Existenz, Projektgleichheit sowie Eligibility. Ausschließlich aktive, nicht soft-gelöschte `ready`-Bilder werden gebunden; `pending`, `failed`, gelöschte Medien und PDFs/Dokumente werden abgewiesen. Input ist strict und enthält nur `project_id`, `project_media_id`, `evidence_target`, `purpose`; ID, Actor, Channel und Status bleiben serverbestimmt. DB/RLS wiederholen die wesentlichen Projekt- und Media-Gates.

Das schmale DTO enthält ausschließlich `evidence_id`, Projekt-/Media-ID, Target, Purpose, Channel, Actor-Klasse, Binding-Status und Erstellzeit. Storage-Pfad, Bucket, Signed URL, Uploadtoken, Dateiname, Providerdaten, Metadaten und PII sind strukturell ausgeschlossen. Der kontrollierte Intelligence-Adapter gibt nur opaque `evidence_id`, Target, Purpose und `available_unanalysed` weiter. Dieser Availability-Wert bedeutet ausschließlich: ein validiertes, vorhandenes `ready`-Bild wurde explizit klassifiziert. Er löst keine Analyse aus.

### Knowledge-/Audit-Grenze

Binding erzeugt keine Observation, Claim Proposal, Claim, Missing-Resolution, Knowledge-State-Mutation oder Readinesssteigerung. Es gibt keine automatische Interpretation. Ein atomarer Audit-Log plus Evidence-Insert würde eine zusätzliche RPC erfordern; um das Paket nicht zu verbreitern und keinen irreführend nicht-atomaren Audit zu schreiben, bleibt fachliches Audit Logging einem separaten RPC-/Workflow-Paket vorbehalten. Die stabile Evidence-ID und serverseitige Actor-Klasse schaffen dafür die spätere Basis, ersetzen aber kein Audit Event.

### Tests und verbleibende Grenzen

Migration-/Architekturtests prüfen Tabelle, UUID-PK, zusammengesetzte Cross-Project-FK, `RESTRICT`, Checks, Indizes, Unique Binding, RLS, Policies, Grants und das Fehlen von Storage-/Signed-URL-Feldern. Schema-, Capability-, Service-, DTO- und Adaptertests prüfen strict Input, Target-/Purpose-Kompatibilität, Injection-Abwehr, Admin-only, Projekt-/Media-Fehler, Cross-Project-Rejection, Eligibility, Idempotenz, neutrale DB-Fehler, exakte DTO Keys, `available_unanalysed` und das Ausbleiben von Knowledge-/Readiness-Mutationen und verbotenen Integrationen.

Weiterhin nicht vorhanden sind persistente Conversation-/Message-/Request-Bindings, unclassified Ingestion, Customer Channels, Audit-RPC, Retention, Tombstone, Ready-Media-Purge, Observation-/Claim-Persistenz, WhatsApp und Vision. Das nächste kleinste Paket ist AP-15-05-02 für die kontrollierte interne Binding-UX bzw. deren expliziten Workflow, ohne automatische Interpretation.

### Status

`PROJECT MEDIA ↔ EVIDENCE PERSISTENCE — IMPLEMENTED`

`PERSISTENT EVIDENCE IDENTITY — IMPLEMENTED`

`CROSS-PROJECT EVIDENCE BINDING — PROHIBITED`

`SIGNED URL IN EVIDENCE DOMAIN — PROHIBITED`

`REAL MEDIA OBSERVATION — NOT IMPLEMENTED`

`CUSTOMER SOURCE MESSAGE BINDING — NOT IMPLEMENTED`

`EVIDENCE REQUEST PERSISTENT BINDING — NOT IMPLEMENTED`

`CUSTOMER PHOTO RETENTION — NOT IMPLEMENTED`

`WHATSAPP INGESTION — NOT IMPLEMENTED`

`VISION — NOT IMPLEMENTED`

`OVERALL PRODUCT — NOT PRODUCTION READY`

## AP-15-05-02 Internal Real Media Evidence Binding Result

### UI Placement

Die bestehende Project-Media-Galerie wurde pro Bildkarte um eine kleine Inline-Evidence-Sektion unter den bestehenden Medienmetadaten erweitert. Bild-Lightbox und PDF-Open-Control bleiben unverändert; es gibt keine neue Seite und keine Observation-/Analyse-Aktion.

### Permission und Eligibility

Die Server Component leitet die Sichtbarkeit ausschließlich aus der zentralen Capability `canBindProjectMediaAsEvidence` ab. Damit sieht nur ein Admin die Action; Reviewer sehen sie nicht. Die Galerie liefert ausschließlich aktive `ready`-Medien, und die UI rendert den Flow zusätzlich nur für `media_type=image`/`display_kind=image`. Der wiederverwendete Binding Service prüft serverseitig erneut authentifizierten Actor, Profil, Capability, aktives Projekt, Media-Existenz, Projektgleichheit, `ready`, Bildtyp und fehlendes `deleted_at`. Pending/failed, PDFs, gelöschte Medien und Cross-Project-Manipulationen bleiben fail closed.

### Read Boundary

Eine schmale serverseitige Projekt-Read-Grenze lädt alle Evidence-Zeilen eines Projekts in genau einer Query, validiert jede externe Zeile mit dem vorhandenen DTO-Schema und gruppiert anschließend serverseitig nach `project_media_id`. Die Admin-only Read Policy der Persistence Baseline wird nicht erweitert; Reviewer erhalten im MVP weder Read noch Binding. An den Client gehen ausschließlich die schmalen Evidence DTOs. Storagefelder, PII, Dateinamen und Signed URLs sind kein Bestandteil dieses Contracts; es gibt keine N+1-Clientschleife.

### Target/Purpose und Multiple Bindings

Target-Optionen werden direkt aus den aktiven Einträgen der zentralen foto-fähigen `EVIDENCE_TARGET_REGISTRY` abgeleitet. Purpose-Optionen stammen aus deren jeweiliger geschlossener `purpose_codes`-Kompatibilität. Ein einzelner Purpose wird kontrolliert automatisch gesetzt; mehrere Purposes werden in einem geschlossenen Select angeboten. Bereits vorhandene identische Kombinationen werden nicht erneut angeboten, andere gültige Bindings desselben Bildes bleiben möglich. Alle vorhandenen Bindings erscheinen als getrennte kleine Evidence-Einträge mit deutschen Registry-Labels und ohne technische IDs.

### Confirmation, Action und Payload

Der Flow ist zweistufig: Auswahl und anschließend die explizite Bestätigung „Bild als Evidence verwenden?“. Sie wiederholt Target und Purpose sowie den Hinweis „Das Bild wird dadurch noch nicht technisch ausgewertet.“ und bietet Abbrechen beziehungsweise „Als Evidence binden“. Eine sehr schmale, an den vertrauenswürdigen Projektkontext der Server Component gebundene Action validiert den strict Client-Input und ergänzt `project_id` serverseitig, bevor sie ausschließlich die vorhandene AP-15-05-01-Binding-Grenze aufruft. Der Client sendet exakt `project_media_id`, `evidence_target` und `purpose`; Evidence-ID, Actor, Rolle, Channel, Status, Locator und Medientyp bleiben serverbestimmt.

### Pending, Success, Already Bound und Errors

Eine synchrone Ref-Sperre verhindert Doppelsubmits vor dem React-Render. Während des Requests sind Controls disabled und `aria-disabled`, der Container trägt `aria-busy`, und „Evidence wird gebunden …“ wird als Status angekündigt. Erfolg lautet „Bild wurde als Evidence gebunden. Noch nicht technisch ausgewertet.“; idempotentes Replay lautet neutral „Dieses Bild ist für diesen Zweck bereits als Evidence gebunden.“. Auth-, Profil-, Permission-, Input-, Not-found-, Eligibility-, Persistence- und Cross-Project-Ergebnisse werden auf geschlossene neutrale deutsche UI-Texte gemappt; Provider-/SQL-Details werden nicht dargestellt.

### Availability, Accessibility und Mobile

Jedes persistierte Binding wird als „Vorhanden – noch nicht ausgewertet“ (`available_unanalysed`) angezeigt. Die UI erklärt prominent: „Die Evidence-Bindung ist keine technische Bewertung oder Freigabe.“ Sichtbare Labels, native Selects und Buttons, Fokus-Ringe, Disabled-/ARIA-Zustände, `role=status`, `role=alert`, Fokus-Rückgabe nach Abbruch und fokussierbarer Erfolgsstatus bilden die Accessibility-Grenze. Controls stapeln mobil und besitzen mindestens 44 Pixel Touchhöhe; ab `sm` werden Aktionsbuttons platzsparend nebeneinander dargestellt.

### Project Media Regression und Intelligence Boundary

Galerie, sichere Preview-URLs, Bild-Lightbox, PDF-Open-Control, Upload/Finalize und bestehende Orphan-/Purge-Pfade wurden nicht fachlich verändert. Insbesondere existiert keine Storage-Mutation und keine Änderung des PDF-Controls. Das Binding erzeugt ausschließlich persistentes `project_evidence` und dessen `available_unanalysed`-Darstellung. Es erzeugt keine Observation, Interpretation, Claim, Knowledge-State-Mutation, Planneränderung oder Readinesssteigerung und startet weder Vision noch KI.

### Tests

Fokussierte UI-Tests decken Admin-/Reviewer-Sichtbarkeit, Bild/PDF-Grenze, aktive Target-Optionen, Purpose-Kompatibilität und automatische Einzelauswahl, Bestätigung, Abbruch/Fokus, exakten Payload, synchrone Pending-Sperre, Erfolg, Already-bound, geschlossene Fehler, mehrere Bindings und Availability-Label ab. Read-/Architekturtests decken Admin-only, Reviewer-Deny gemäß bestehender Read Policy, Projektscope, Single Read/Grouping, schmale DTO-Keys und das Fehlen von Storage-, PII-, Service-Role-, Signed-URL- und Fetch-Capabilities ab. Bestehende Persistence-Tests sichern Cross-Project, Eligibility, Idempotenz und Intelligence-/Knowledge-Grenzen; fokussierte Gallery-, Lightbox-, PDF-, Signed-URL-, Finalize- und Purge-Tests sichern Project-Media-Regressionen.

### Remaining Limits

Keine neue Migration wurde benötigt. Weiterhin nicht implementiert sind automatische Observation, Vision/OCR/AI, WhatsApp-/Customer-Ingestion, persistente Conversation-/Message-/Request-Provenienz, Retention, Tombstones, Evidence-aware Ready-Purge, Claims, Knowledge-Mutation und Readinesswirkung. Das nächste kleinste Paket bleibt die separat owner-/datenschutzabhängig zu entscheidende Customer-Photo-Lifecycle-/Retention-Grenze; vor deren Freigabe darf kein Scope vorgezogen werden.

### Status

`INTERNAL REAL MEDIA EVIDENCE BINDING UX — IMPLEMENTED`

`ADMIN-ONLY REAL MEDIA BINDING — IMPLEMENTED`

`REAL PROJECT MEDIA → PERSISTENT EVIDENCE — IMPLEMENTED`

`REAL EVIDENCE AVAILABILITY — AVAILABLE_UNANALYSED`

`AUTOMATIC OBSERVATION — NOT IMPLEMENTED`

`VISION ANALYSIS — NOT IMPLEMENTED`

`WHATSAPP INGESTION — NOT IMPLEMENTED`

`CUSTOMER PHOTO RETENTION — NOT IMPLEMENTED`

`OVERALL PRODUCT — NOT PRODUCTION READY`
