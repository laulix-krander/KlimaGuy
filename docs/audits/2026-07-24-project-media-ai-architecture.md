# Architektur-Audit: Projektmedien und spätere KI-Analyse

**Audit-ID:** `KG-AUDIT-2026-07-24-PROJECT-MEDIA-AI-V1`
**Audit-Datum:** 24.07.2026
**Geprüfter Branch:** `codex/audit-project-media-ai-architecture`
**Geprüfte Baseline:** Commit `a30e708` (lokaler Ausgangsstand; Merge von AP-11-Abschlussvalidierung)
**Status:** **DRAFT – NICHT ZUR IMPLEMENTIERUNG FREIGEGEBEN**
**Charakter:** ausschließlich Architektur-, Datenmodell-, Sicherheits- und Workflow-Audit; keine Implementierung

## 1. Executive Summary

AP-11 ist auf Code- und Architekturebene abgeschlossen. Die bestehende Projektbearbeitung ist feldgranular: Admins bearbeiten Stammdaten, Zusammenfassung und Human-Review-Flag; Admins und Reviewer bearbeiten Status und Projektklasse. Projektnotizen sind die einzige projektbezogene Kindtabelle. Aktive Projekte und Notizen werden konsequent über `deleted_at is null` adressiert. Die Anwendung verwendet authentifizierte Supabase-Clients mit Anon-Key und Session-Cookies, fachliche Services, zentrale Berechtigungshelfer und drei abgestufte Revalidation-Helfer.

Der geprüfte Stand enthält **keine** Projektmedien-Tabelle, keinen Storage-Bucket, keine Storage-Policy, keine Storage-Nutzung, keinen Datei-/Upload-Service und keine Upload- oder Medienkomponente. Projektbezogene Dateien können daher derzeit nicht gespeichert, zugeordnet, angezeigt oder heruntergeladen werden. „Storage-Vorbereitung“ im Projektziel ist keine vorhandene Medienfunktion.

Für ein erstes, bewusst kleines MVP empfiehlt dieses Audit:

1. noch **keine KI**, kein WhatsApp und keine automatische Angebotsableitung;
2. einen privaten Bucket `project-media`, nicht erratbare objektinterne UUID-Dateinamen und Pfade `projects/{project_id}/{media_id}/{stored_filename}`;
3. eine normalisierte Tabelle `project_media` als fachliche Quelle der Wahrheit, ohne redundantes `customer_id`;
4. JPEG, PNG, WebP und PDF als vorläufiges Format-Set, vorbehaltlich extern verifizierter MIME-, Größen- und Plattformlimits;
5. serverseitige Authentifizierung, Domainberechtigung und aktive Projektprüfung; Storage-Policies als zweite Barriere;
6. kurzlebige, erst nach Autorisierung serverseitig erzeugte Signed URLs;
7. Soft Delete des Metadatensatzes und einen kontrollierten, protokollierten späteren Purge des Storage-Objekts;
8. explizite Behandlung partieller DB-/Storage-Fehler über idempotente Zustände, Checksummen und Reconciliation;
9. zunächst Admin-only für alle mutierenden Medienoperationen. Reviewer-Lesezugriff kann aus der bestehenden Projekt-Lesearchitektur abgeleitet werden; Reviewer-Upload oder -Löschung ist dagegen **nicht** durch bestehenden Code entschieden und benötigt eine Product-Owner-Entscheidung.

Eine spätere KI-Stufe sollte Analyseaufträge versioniert, manuell gestartet und vollständig vom Medien-Lebenszyklus getrennt behandeln. Empfohlen wird eine hybride Struktur aus `project_analysis_runs`, `project_analysis_media` und normalisierten Findings plus schema-validiertem JSON-Snapshot. Modell-, Prompt-, Schema- und Eingabemedienversion müssen unveränderlich festgehalten werden. Jede Aussage ist als beobachteter Fakt, Schätzung, Vorschlag oder Unsicherheit zu kennzeichnen und mit Medien-/Seitenbelegen zu verbinden. `requires_human_review` bleibt zwingend; eine KI darf weder technische Fakten noch Angebotspositionen oder ein finales Angebot autonom freigeben.

**P0 vor jeder Implementierung:** Rollenentscheidung für Medienaktionen, private Zugriffskette einschließlich Storage-Policies, verbindlicher Upload-/Kompensationsablauf, validierte MIME-/Inhaltsprüfung, Lösch- und Aufbewahrungskonzept sowie Datenschutzentscheidung zu Originalen/EXIF. Das erste Folgepaket muss deshalb **AP-12-00 Medien-Domainregeln, Datenschutz- und Berechtigungs-Freeze** sein – nicht Migration, Bucket oder UI.

## 2. Scope, Methode und geprüfter Repository-Stand

### 2.1 Vollständig gelesene Referenzen

- `docs/audits/2026-07-24-ap11-final-validation.md`
- `docs/audits/2026-07-23-project-edit-audit.md`
- `docs/audits/2026-07-23-ap11-06-ux-audit.md`
- `docs/audits/2026-07-23-ap11-06-workflow-analysis.md`

Zusätzlich statisch geprüft wurden Projekt- und Kundenseiten, sämtliche Projekt-Services und -Actions, Domain-Typen/-Schemas/-Permissions, Supabase-Clients, alle drei Migrationen, Architektur-/Datenmodell-/Sicherheitsdokumentation und repositoryweite Treffer zu Storage, Dateien, Uploads, Medien, Buckets und Signed URLs. Es wurden keine Tests und keine externe Anbieterprüfung ausgeführt. Konkrete Anbieterlimits und Modellfähigkeiten sind daher nicht als Tatsachen behauptet.

### 2.2 Baseline-Einschränkung

Im bereitgestellten Checkout war kein Git-Remote konfiguriert und damit keine Referenz `origin/main` vorhanden. Der saubere lokale Branch `work` zeigte auf `a30e708`, den Merge der AP-11-Abschlussvalidierung; dieser Commit wurde als unveränderte Ausgangsbasis verwendet. Das ist im PR/Review gegen das tatsächliche Remote-`main` zu verifizieren. Der Audit-Branch wurde direkt davon erstellt.

### 2.3 Bestehende Tabellen

| Tabelle | Relevanter realer Stand |
|---|---|
| `profiles` | UUID = Auth-User-ID; `display_name`; Rolle `admin`/`reviewer`; Zeitstempel; RLS. |
| `customers` | UUID, Name/Kontakt, `created_by`, Zeitstempel, `deleted_at`; fachliche Haupttabelle mit Soft Delete. |
| `projects` | UUID; Pflicht-FK `customer_id`; `title`; Status; optionale Klasse; Installationsadresse/PLZ/Ort; Summary; `requires_human_review` default `true`; `created_by`; Zeitstempel; `deleted_at`. |
| `project_notes` | UUID; FK `project_id` mit DB-Cascade bei physischer Projektlöschung; Inhalt; `created_by`; Zeitstempel; nach Folgemigration `deleted_at`; aktive-projektabhängige RLS. |
| `audit_log` | UUID, Actor, Entitytyp/-ID, Action, JSONB-Metadaten, Erstellzeit; Clientrechte entzogen. Im geprüften Anwendungscode keine allgemeine Schreibintegration für Medien vorhanden. |

`projects` hat Indizes für aktive Statuslisten und aktive Kundenzuordnung sowie einen `updated_at`-Trigger. Das Datenmodell enthält keine Medien-, Datei-, Angebots- oder Analysetabelle.

### 2.4 Projektbezogene UI, Actions und Services

Die Projektdetailseite lädt genau ein nicht gelöschtes Projekt mit Kundendaten, danach nicht gelöschte Projektnotizen und deren Autorenprofile. Sie zeigt Stammdaten, Status, Klasse, Human Review, Installationsort, Zeitstempel, interne Zusammenfassung und interne Notizen.

| Fachbereich | Seite/Formular | Server Action | Service | Rollen laut Domain |
|---|---|---|---|---|
| Anlage | `/projects/new` | `createProjectAction` | `project-create-service.ts` | Admin |
| Stammdaten | Detail und `/edit` | `updateProjectCoreAction` | `project-update-service.ts` | Admin |
| Status | Detail | `updateProjectStatusAction` | `project-status-update-service.ts` | Admin, Reviewer |
| Klasse | Detail | `updateProjectClassAction` | `project-class-update-service.ts` | Admin, Reviewer |
| Zusammenfassung | Detail | `updateProjectSummaryAction` | `project-summary-update-service.ts` | Admin |
| Human Review | Detail | `updateProjectHumanReviewAction` | `project-human-review-update-service.ts` | Admin |
| Notiz anlegen | Detail | `createProjectNoteAction` | `project-note-create-service.ts` | Admin, Reviewer |
| Notiz bearbeiten | Detail | `updateProjectNoteAction` | `project-note-update-service.ts` | Admin alle; Reviewer eigene |
| Notiz soft-löschen | Detail | `deleteProjectNoteAction` | `project-note-delete-service.ts` plus RPC | Admin alle; Reviewer eigene |

Alle fachlichen Services authentifizieren, laden/validieren die Profilrolle, wenden Domain-Permissions an, validieren Eingaben und begrenzen Patches. Mutationen prüfen aktive Projekte. Die UI-Berechtigung ist damit nur Komfort, nicht einzige Sicherheitsbarriere. AP-11 dokumentiert verbleibende Unterschiede zwischen UI/Service/RLS und reale Production-Validierung; dieses Audit erweitert keine Rechte.

### 2.5 Soft Delete, RLS und Revalidation

- Kunden, Projekte und Projektnotizen besitzen `deleted_at`; aktive Lese- und Mutationspfade filtern darauf.
- Reviewer dürfen laut Projekt-Trigger nur Status und Klasse verändern; Admins haben breitere Projekt-Update-Rechte. Domain-Helfer sind enger und maßgeblich für die App-Pfade.
- Notizen schützen unveränderliche Felder; Wiederherstellung gelöschter Notizen ist blockiert. Die Soft-Delete-RPC prüft Actor, Rolle, Projekt und Notiz atomarer als ein freier Clientpatch.
- `getProjectDetailRevalidationPaths`: Projektdetail.
- `getProjectOverviewRevalidationPaths`: Projektliste plus Detail.
- `getProjectAndCustomerRevalidationPaths`: Projektliste, Detail und Kundendetail.
- Für Medien würde mindestens Detail revalidiert; wenn Medienanzahl/Vorschaubild später in Listen erscheint, ist gezielt der Overview-/Kundenumfang zu ergänzen, nicht pauschal alles.

### 2.6 Supabase-Client- und Storage-Iststand

Es existieren ein Browser-Client und ein Server-Client aus `@supabase/ssr`. Beide verwenden ausschließlich öffentliche URL/Anon-Key-Konfiguration; der Server-Client bindet die Session über Cookies. Es gibt keinen Service-Role-Client. Repositoryweit existiert kein produktiver Aufruf von `supabase.storage`, kein Bucketname, keine Storage-Migration/Policy, keine Signed-URL-Erzeugung, keine Datei- oder Uploadkomponente und kein Medienservice.

**Explizites Ergebnis:** Aktuell können **keine projektbezogenen Dateien oder Medien** gespeichert werden. Notizen sind Textdatensätze und kein Datei-Ersatz.

## 3. Empfohlene Medienarchitektur

### 3.1 Leitprinzipien

1. `project_media` ist fachliche Quelle der Wahrheit; ein Storage-Objekt allein gilt nie als freigegebenes Medium.
2. Storage bleibt privat; Zugriff folgt dem aktiven Projekt und einer expliziten Medienberechtigung.
3. Der Objektpfad trägt keine Kundennamen, Adressen, Originaldateinamen oder sonstige personenbezogene Daten.
4. Original, Vorschau und spätere KI-Derivate sind getrennte Objekte/Varianten mit nachvollziehbarer Herkunft.
5. Upload, Metadatenerfassung, Verarbeitung und Analyse sind getrennte Statusautomaten.
6. Clientwerte sind Hinweise; Größe, Inhalt, MIME, Projekt, Rolle und Pfad werden vertrauenswürdig serverseitig geprüft.
7. Keine Service Role im normalen Benutzerpfad. Falls ein späterer isolierter Worker sie zwingend benötigt, nur serverseitig, minimal, kurzlebig und mit eigener Autorisierungs-/Jobprüfung.
8. Kein JSON-Mass-Assignment: Eingaben werden per Zod geparst und in explizite Patches gemappt.

### 3.2 Storage-Struktur

**Empfehlung MVP:** ein privater Bucket `project-media`. Mehrere Buckets pro Kunde oder Projekt erhöhen Policy-, Deployment- und Betriebsaufwand ohne klare Isolation; die Isolation erfolgt über Pfad, Metadaten-FK, RLS/Storage-Policies und Authentifizierung.

Empfohlene Pfade:

```text
projects/{project_id}/{media_id}/original/{stored_filename}
projects/{project_id}/{media_id}/preview/{variant_id}.{extension}   # später
projects/{project_id}/{media_id}/pages/{page_number}/{variant_id}.webp # später
```

- `project_id` und `media_id` sind serverseitig validierte UUIDs.
- `stored_filename` ist eine neue UUID/zufällige ID plus kanonische Erweiterung, nicht der Originalname.
- `original_filename` bleibt nur als bereinigte Anzeige-Metadatei in der DB.
- Kollisionsschutz entsteht durch `media_id`, zufälligen Dateinamen, kein Overwrite/Upsert und eine Eindeutigkeitsbedingung auf `(storage_bucket, storage_path)`.
- `customer_id` gehört nicht in den Pfad: Kunden können umbenannt werden, Namen wären personenbezogen, und das Projekt besitzt bereits die verbindliche Kundenzuordnung.
- Der Bucket ist **nicht öffentlich**. Public URLs sind P0-unvereinbar mit Kundenfotos, Grundrissen und Dokumenten.

### 3.3 Signed URLs und Zugriff

- Signed URLs erst nach Authentifizierung, Rollenprüfung, aktivem Projekt und aktivem Medium serverseitig erzeugen.
- Kurze Ablaufzeit: als Startwert wenige Minuten; der genaue Wert ist vom Product Owner und nach UX-/Anbieterprüfung festzulegen.
- Keine Signed URL persistent in DB, Audit-Log, Analytics, Fehlertext oder KI-Ergebnis speichern.
- Downloadname aus bereinigtem Originalnamen setzen, ohne den Storagepfad offenzulegen.
- Keine Sammel-URLs für ein gesamtes Projekt ohne Einzelprüfung und Mengenlimit.
- KI-/Worker-Zugriff bevorzugt über kurzlebige, jobgebundene Leseberechtigung oder serverseitiges Streaming; niemals einen langlebigen Public-Link erzeugen.
- WhatsApp-Ingestion darf externe kurzlebige URLs nur zum Import verwenden; anschließend gilt das eigene private Storage.

### 3.4 Storage-Policies als spätere Pflicht

Ohne hier SQL zu entwerfen, müssen spätere Policies mindestens Bucket, UUID-Pfadform, angemeldeten Actor, vorhandenes nicht gelöschtes Projekt, Medienzeile und Rollenentscheidung koppeln. `select`, `insert`, `update` und `delete` sind getrennt zu modellieren. Ein nur namensbasierter Pfadcheck genügt nicht. Storage-Policies und Tabellen-RLS müssen dieselbe Domainentscheidung abbilden und durch negative Tests gegen fremde/gelöschte Projekte validiert werden.

## 4. Empfohlenes Datenmodell für Projektmedien

### 4.1 Tabellenname und Kernmodell

`project_media` ist gegenüber `project_files` vorzuziehen: Es umfasst Bilder und Dokumente, kann Derivate/Analysebezug ausdrücken und bleibt dennoch projektbezogen. „Media“ darf fachlich nicht auf Bilder verengt werden.

| Feld | Phase | Empfehlung/Begründung |
|---|---|---|
| `id uuid` | zwingend | Primärschlüssel; vor Upload erzeugt und Teil des Pfads. |
| `project_id uuid` | zwingend | FK auf Projekt; unveränderlich; aktive Elternprüfung. |
| `storage_bucket text` | zwingend | Explizit für Portabilität; serverseitige Konstante, nicht Clientfeld. |
| `storage_path text` | zwingend | Eindeutig, unveränderlich, ohne PII; serverseitig erzeugt. |
| `original_filename text` | zwingend | Bereinigter Anzeigename, längenbegrenzt; nie zur Pfadautorisierung. |
| `stored_filename text` | optional/redundant | Aus `storage_path` ableitbar; nur speichern, wenn Mapper/Operationen es benötigen. |
| `mime_type text` | zwingend | Verifizierter kanonischer Typ, nicht nur Browserangabe. |
| `file_size bigint` | zwingend | Verifizierte Bytes für Limits/Kosten. |
| `media_type` | zwingend | Normalisiert: zunächst `image`/`document`; nicht aus freiem JSON. |
| `category` | MVP zwingend | Normalisierte kontrollierte Kategorie, Default `other`; manuell änderbar nach Berechtigung. |
| `source` | zwingend | `web_upload`, später `whatsapp`, `internal_import`; kontrollierter Wert. |
| `upload_status` | zwingend | Technischer Uploadautomat. |
| `processing_status` | später | Separat, sobald Vorschauen/Metadatenverarbeitung existieren; nicht mit Upload vermischen. |
| `uploaded_by uuid` | zwingend | Auth-Actor; WhatsApp später ggf. System-/Ingestion-Actor plus separate Herkunft. |
| `created_at`, `updated_at` | zwingend | Nach bestehendem Muster; `updated_at` automatisiert. |
| `deleted_at` | zwingend | Fachliches Soft Delete; aktiver Defaultfilter. |
| `checksum` | MVP empfohlen | Serverseitig berechneter SHA-256 oder gleichwertig; Algorithmus mitführen oder normieren. |
| `width`, `height` | später/MVP optional | Nur verifiziert für Bilder; positive Integer. |
| `page_count` | später/MVP optional | Nur nach sicherer PDF-Prüfung; positive Integer. |
| `caption` | MVP optional | Bereinigter manueller Text, getrennte Permission/Maximallänge. |
| `sort_order` | später | Integer mit definierter Tie-Break-Sortierung; Race-Handling nötig. |
| `metadata jsonb` | später, eng | Nur schema-validierte technische Zusatzwerte; keine freien Clientobjekte. |

### 4.2 `customer_id` und nicht zu speichernde Werte

`customer_id` sollte **nicht** in `project_media` dupliziert werden: `projects.customer_id` ist Pflicht und die bestehende Architektur behandelt das Projekt als Aggregatwurzel. Redundanz erzeugt Drift, erschwert Kundenzuordnungsänderungen und eröffnet Mass-Assignment-/Mandantengrenzrisiken. Für Reporting wird über das Projekt gejoint. Falls spätere Unveränderlichkeits-/Aufbewahrungsanforderungen einen historischen Kundensnapshot verlangen, ist das eine eigene fachliche Entscheidung, kein MVP-Feld.

Nicht speichern:

- Signed/Public URLs oder externe temporäre Download-URLs;
- unbereinigte absolute Clientpfade;
- Auth-Tokens, Anbieter-Keys oder komplette Requestheader;
- vom Client behauptete Rolle, `uploaded_by`, Projekt-/Kundenzuordnung außerhalb expliziter Allowlist;
- beliebige KI-Antworten im Medien-Metadatenfeld;
- EXIF-GPS ohne dokumentierten Zweck und Rechtsgrundlage;
- Base64-Dateiinhalt in PostgreSQL/JSON;
- Virenscan-/Sicherheitsstatus als frei setzbares Clientfeld.

### 4.3 Normalisierung und JSON

Normalisieren: Projekt, Actor, Quelle, Kategorie, Status, MIME, Objektpfad, Größe, Prüfsumme, Bilddimensionen, Seitenzahl und Analyseverknüpfungen. Tags können später über `media_tags` plus Zuordnungstabelle normalisiert werden, falls Suche/Reporting relevant wird.

JSON ist geeignet für seltene, versionierte technische Extraktionsdetails (z. B. Farbprofilklasse, Parserwarnungen), niemals für Autorisierung, Status, Projektzuordnung oder häufig gefilterte Felder. Jedes JSON-Schema braucht Versionsfeld, Größenlimit, Schlüssel-Allowlist und serverseitige Zod-Validierung. Blindes Verteilen eines Client-`metadata`-Objekts kann geschützte Schlüssel überschreiben, große Payloads einschleusen, PII verstecken und spätere Abfragen/Policies umgehen; daher explizite Mapper und keine JSON-Mass-Assignment-Patches.

## 5. Medienkategorien

### 5.1 Empfohlene kontrollierte Primärkategorie

Für das MVP genau eine manuelle Primärkategorie:

`interior`, `exterior`, `indoor_unit_location`, `outdoor_unit_location`, `routing`, `electrical`, `condensate`, `facade`, `roof`, `balcony`, `floor_plan`, `technical_document`, `customer_document`, `other`.

Die UI würde später deutsche Labels verwenden; gespeicherte stabile Codes bleiben sprachneutral. Kategorien beschreiben den fachlichen Hauptzweck, nicht durch KI vermeintlich erkannte Fakten.

### 5.2 Enum, Tags und Erweiterbarkeit

- **DB-Enum:** starke Integrität, aber jede Erweiterung benötigt Migration und kann Deployment erschweren. Für stabile Statuswerte sinnvoller als für wachsende Fachkategorien.
- **Check/Referenztabelle:** kontrolliert und erweiterbar. Eine Referenztabelle erlaubt Labels/Sortierung/Aktivierung, erhöht aber MVP-Aufwand. Audit empfiehlt zunächst zentrale Domainkonstante plus DB-Constraint; konkrete DB-Technik in AP-12-01 entscheiden.
- **Freie Tags:** flexibel, aber Schreibweisen, PII, Prompt-Injection-Text und schlechte Auswertbarkeit. Nicht als alleinige Klassifikation.
- **Kombination:** eine kontrollierte Primärkategorie plus später kontrollierte/kuratierte Mehrfach-Tags ist langfristig am besten.

Kategorie beeinflusst Medienauswahl und Rückfragen, darf jedoch weder KI-Analyse noch Angebotsgenerierung blind steuern. Eine Kategorie `indoor_unit_location` ist eine Nutzerabsicht, kein bestätigter Montageort. Automatische Kategorien müssen als Vorschläge mit Quelle, Konfidenz und menschlicher Bestätigung getrennt bleiben.

## 6. Sicherer End-to-End-Upload-Workflow

### 6.1 Empfohlener Sollablauf

1. Benutzer wählt eine oder mehrere Dateien; Client zeigt nur Komfortprüfung für erlaubte Endungen, deklarierte MIME, Anzahl und Größe.
2. Server authentifiziert Session; fehlende/ungültige Session endet neutral.
3. Server lädt Profil, validiert Rolle und wendet den noch festzulegenden `canUploadProjectMedia`-Helper an.
4. `project_id` wird als UUID validiert; Projekt wird mit `deleted_at is null` geladen. Kundenzuordnung wird daraus abgeleitet.
5. Anzahl-/Projektquota und parallele Uploadlimits werden geprüft.
6. Originalname wird auf Anzeigezweck bereinigt und begrenzt; Pfad und gespeicherter Name werden ausschließlich serverseitig aus UUIDs erzeugt.
7. Deklarierter MIME, Magic Bytes/Dateisignatur und tatsächliche Struktur werden geprüft; Endung allein zählt nie. Größe wird aus empfangenen Bytes/Storage-Metadaten geprüft.
8. Eine Medien-ID und idempotente Uploadoperation werden angelegt. Bevorzugtes Orchestrierungsmodell: DB-Reservierung mit `pending`, danach Upload, danach Finalisierung zu `ready`. Ein DB-First-Modell macht fehlende Objekte sichtbar und retrybar.
9. Upload erfolgt ohne Overwrite in privaten Bucket. Pfad ist eindeutig und an Reservierung gebunden.
10. Nach Upload werden verifizierte Größe, MIME und Checksumme gespeichert; Status wird nur per engem serverseitigem Patch finalisiert.
11. Bei Sicherheits-/Verarbeitungsstufe bleibt Objekt bis `ready` nicht normal abrufbar; ein späteres Quarantänemodell ist zu prüfen.
12. Fehler werden mit stabilem Fehlercode und Request-/Upload-ID, aber ohne Dateiinhalte, URL, Adresse oder Kundendaten behandelt.
13. Nach erfolgreicher Finalisierung wird nur der notwendige Pfad revalidiert (MVP: Projektdetail).
14. Die spätere Detailseite lädt aktive, `ready` Medienmetadaten. Signed URLs werden bedarfsgesteuert nach erneuter Autorisierung erzeugt.
15. Löschen ist eine eigene autorisierte Operation; keine implizite Löschung durch UI-Entfernen oder Projektstatus.

Client-Direktupload per kurzlebigem Uploadtoken kann später Bandbreiten-/Function-Limits reduzieren, erhöht aber die Komplexität der Vorprüfung und Finalisierung. Für kleine MVP-Dateien kann serverseitig orchestrierter Upload einfacher sein; diese Wahl ist nach realen Vercel-/Supabase-Limits extern zu verifizieren.

### 6.2 Fehler- und Kompensationsmatrix

| Fehlerfall | Erkennung und Empfehlung |
|---|---|
| Storage erfolgreich, DB-Finalisierung fehlgeschlagen | Reservierung bleibt `pending`/`failed`; Retry mit derselben ID; Reconciler prüft Objekt und finalisiert oder löscht es nach Frist. Nie still als Erfolg melden. |
| DB-Reservierung erfolgreich, Storage fehlgeschlagen | Status `failed`, technischer Code, sicherer Retry am selben Pfad nur wenn Objekt sicher fehlt; sonst Zustand prüfen. |
| DB-Eintrag „ready“, Storage fehlt | Darf im Sollablauf nicht entstehen; Reconciliation markiert inkonsistent/failed, Download liefert neutrale Fehlermeldung. |
| Doppelter Upload | Checksumme + Größe + Projekt vergleichen; als potenzielles Duplikat markieren. Nicht automatisch löschen, da identische Dateien fachlich mehrfach relevant sein können. |
| Abbruch/Timeout/Netzwerk | Idempotency-Key/Media-ID; unbekannten Ausgang nicht blind wiederholen; DB und Storage zuerst abgleichen. |
| MIME ungültig/manipulierte Endung | Vor Storage ablehnen oder Quarantäne löschen; deklarierte, erkannte und erlaubte Typen müssen konsistent sein. |
| Datei zu groß/Anzahl überschritten | Früh ablehnen; keine unvollständige Medienzeile außer bewusstem Fehlerprotokoll. |
| Beschädigte Datei | Parser-/Decodertest; `failed` mit nicht sensiblem Code; kein KI-Auftrag. |
| Parallele Uploads | Transaktionale Quota-/Statusprüfung, eindeutige IDs/Pfade, begrenzte Concurrency; sort order nicht aus „max+1“ ohne Konfliktschutz. |
| Projekt während Upload gelöscht | Finalisierung prüft Projekt erneut; Objekt nicht freigeben, Reservierung fehlschlagen und Cleanup einplanen. |
| Berechtigung entzogen | Jede Phase erneut serverseitig prüfen; bestehendes Uploadtoken kurz halten; keine Finalisierung allein aufgrund vorheriger Prüfung. |

## 7. Dateitypen und MVP-Limits

Konkrete Zahlen sind im Repository nicht festgelegt. Anbieter-, Framework- und Modelllimits müssen zum Implementierungszeitpunkt in offiziellen Quellen und in der Zielumgebung verifiziert werden.

| Format | MVP | Browser/Vorschau | Verarbeitung/KI | Risiken/Datenschutz |
|---|---|---|---|---|
| JPEG | ja | breit darstellbar | meist direkt nutzbar; Rotation/Kompression sinnvoll | EXIF einschließlich GPS, verlustbehaftet, sehr große Kamerabilder. |
| PNG | ja | breit darstellbar | direktes Bildformat | große Dateien, Metadaten/Chunks, Dekompressionsressourcen prüfen. |
| WebP | ja | moderne Browser | Anbieterfähigkeit extern prüfen; ggf. konvertieren | animierte Varianten/Decoderfälle begrenzen. |
| HEIC/HEIF | nein, später | uneinheitliche direkte Vorschau | Konvertierung/Decoder erforderlich; Modellfähigkeit extern prüfen | Container-/Patent-/Decoderkomplexität, Metadaten, große Originale. |
| PDF | ja, aber nur Dokumentanzeige im Medien-MVP | Browser kann häufig anzeigen; sichere eingebettete Darstellung prüfen | KI/PDF-Seiten erst spätere Stufe; Rendering/Textparser nötig | aktive Inhalte/Anhänge, viele Seiten, Scans, Metadaten, Parserangriffe. |
| TIFF | nein | schwach | Konvertierung nötig | Multi-Page, sehr groß, Decoderkomplexität. |
| DOCX | nein | keine native sichere Vorschau | Extraktion/Konvertierung | ZIP-basierter Container, Makro-/externe Referenzrisiken trotz DOCX. |
| CAD | nein | keine einheitliche Vorschau | spezialisierte Parser | proprietär, komplex, sensible Gebäudedaten. |
| ZIP | nein | keine Vorschau | Entpacken nötig | Zip Bomb, Pfadtraversal, verschachtelte/verschlüsselte Inhalte. |
| Video | nein | codecabhängig | Transcoding/hohe Kosten | sehr groß, lange Verarbeitung, Ton/weitere PII. |

**MVP-Format-Set:** JPEG (`image/jpeg`), PNG (`image/png`), WebP (`image/webp`) und PDF (`application/pdf`). Keine SVGs, HEIC, Office-, Archiv-, CAD- oder Videoformate. PDFs werden im ersten MVP gespeichert und kontrolliert heruntergeladen/angezeigt, aber nicht analysiert oder serverseitig gerendert.

**Vorläufige Guardrails, PO-Entscheidung erforderlich:** getrenntes Bild-/PDF-Größenlimit, Seitenlimit für spätere Verarbeitung, Dateien-pro-Projekt- und Upload-Batch-Limit, keine animierten Bilder, keine verschlüsselten PDFs. Zahlen werden nicht erfunden; sie sind in AP-12-00 produktseitig festzulegen und in AP-12-01 gegen Plattformlimits zu validieren.

## 8. Bild- und PDF-Vorverarbeitung

### 8.1 Sinnvolle Schritte vor KI

- Original unveränderlich erhalten **nur wenn** Aufbewahrung/Datenschutz dies erlauben; Derivate nie als Original ausgeben.
- Pixel- und Dimensionslimit zusätzlich zum Byte-Limit; gegen Dekompressionsbomben schützen.
- EXIF-Orientierung anwenden, danach GPS und nicht benötigte EXIF/XMP/IPTC-Daten aus Derivaten entfernen.
- Vorschau/Thumbnail mit fester Maximaldimension, sicherer Neucodierung und neutralem Dateinamen.
- Farbprofil in einen dokumentierten Standard konvertieren, ohne fachlich relevante Details unnötig zu verlieren.
- HEIC erst in späterer Stufe kontrolliert konvertieren.
- SHA-256-Checksumme über Originalbytes; Derivate erhalten eigene Checksummen und Herkunft.
- Duplikaterkennung zunächst exakt per Checksumme; perceptual hash nur später und nie als automatische Löschentscheidung.
- PDFs erst später: sichere Validierung, Seitenzählung, selektives Rendering, Text-Extraktion getrennt von Bildanalyse, Seitenbezug bewahren.

### 8.2 Ausführungsorte

| Ort | Vorteile | Nachteile/Empfehlung |
|---|---|---|
| Browser | reduziert Uploadgröße, unmittelbare Vorschau | Client ist nicht vertrauenswürdig; Original/EXIF-Kontrolle uneinheitlich; nie alleinige Sicherheitsverarbeitung. |
| Next.js/Vercel Function | nahe an Auth/Domain, einfacher MVP-Fluss | Memory-, Payload- und Laufzeitlimits; schwere Konvertierung/Mehrseiten-PDF riskant. Nur kleine synchrone Prüfungen. |
| Supabase Edge Function | nahe am Storage, asynchron anstoßbar | Runtime-/Bibliotheks-/Zeitlimits und Betriebsbeobachtung extern prüfen. |
| Separater Worker | robuste Queue, Isolation, Retries, ressourcenintensive Verarbeitung | zusätzliche Betriebsarchitektur; modularer Monolith darf nicht vorschnell zu Microservices zerlegt werden. Erst bei belegtem Bedarf. |
| Externer Bilddienst | spezialisierte Skalierung/Transformation | weitere Datenübermittlung, Vendor Lock-in, Kosten und AV-/Datenschutzprüfung. Nicht MVP-Default. |

Der Repository-Stand erzwingt keine endgültige Verarbeitungsplattform. Audit-Empfehlung: Medien-MVP ohne schwere Verarbeitung; AP-13 vor KI anhand gemessener Limits einen asynchronen Worker-/Edge-Entscheid treffen.

### 8.3 PDFs und Grundrisse später

- Einseitig/digital: Text und gerenderte Seite getrennt gewinnen; Quelle und Seitenzahl erhalten.
- Mehrseitig: harte Seiten-/Pixel-/Zeitlimits, Seitenauswahl vor Analyse, Checkpoint/Retry pro Seite.
- Scan: OCR-Ergebnis ist abgeleitet und unsicher; Sprache/Lesbarkeit dokumentieren.
- Grundriss: Maßstab nur als Fakt behandeln, wenn explizit lesbar und menschlich bestätigt; keine Maße aus Perspektive/Pixeln erfinden.
- Datenblatt: Texttabellen und Bilder mit Seitenbeleg; Produktdaten nicht automatisch auf Projekt übertragen.
- Handskizze: hohe Unsicherheit, keine automatische Maß-/Leitungslängenübernahme.
- Seitenvorschauen sind eigene Derivate mit Parent-Medium, Seitenzahl, Checksumme und Soft-Delete-/Purge-Kopplung.
- Verschlüsselte, beschädigte, extrem große, formular-/scriptlastige oder parserinkompatible PDFs werden kontrolliert abgewiesen/als failed markiert.
- PDF-Metadaten können Autoren, Pfade oder Organisationen enthalten und sind datenschutzrechtlich wie EXIF zu behandeln.

## 9. Löschkonzept

### 9.1 Fachliches Soft Delete

1. Actor authentifizieren, Rolle prüfen, aktives Projekt und aktives Medium laden.
2. Medienzeile einmalig `deleted_at` setzen; unveränderliche Zuordnung/Storagefelder schützen.
3. Gelöschtes Medium sofort aus Listen, Signed-URL-Ausgabe und neuen Analysen ausschließen.
4. Bereits existierende Signed URLs können bis Ablauf funktionieren; deshalb kurze TTL und P1-Hinweis im Löschdialog/Prozess.
5. Projektdetail revalidieren; Audit-Ereignis ohne sensible Dateiinhalte erfassen.
6. Analysen behalten einen nachvollziehbaren historischen Referenzstatus, dürfen aber gelöschte Medien nicht neu abrufen. Anzeige/Retention muss rechtlich geklärt werden.

### 9.2 Physischer Purge

Physische Löschung ist kein normaler UI-Schritt. Ein privilegierter, idempotenter Purge-Job entfernt nach definierter Aufbewahrungs-/Widerrufsfrist Original, Previews und Seitenartefakte, verifiziert deren Abwesenheit und markiert den Purgezustand. Fehler landen in einer manuellen Reconciliation-Liste. Admin bedeutet nicht automatisch „darf sofort physisch löschen“; dies ist eine Betriebs-/Datenschutzberechtigung.

Projekt-Soft-Delete darf Medien nicht sofort physisch löschen. Es sperrt Zugriff und startet gegebenenfalls eine Retentionfrist. Kunden-Soft-Delete ist bereits blockiert, wenn aktive Projekte existieren; für später gelöschte Aggregate braucht es dennoch ein explizites Kaskaden-/Retentionkonzept. Backups und Anbieterreplikate sind im Löschkonzept extern zu prüfen.

### 9.3 Verwaiste Objekte

Ein periodischer Reconciler vergleicht DB-Reservierungen und Storagepräfixe: Objekt ohne Zeile, Zeile ohne Objekt, lange `pending`/`uploading`, soft-gelöschte Medien nach Purgefrist und unvollständige Derivate. Automatische Löschung nur nach Sicherheitsfrist und wiederholter Bestätigung; sonst Dead-Letter/manuelle Prüfung.

## 10. Berechtigungsmatrix

Die existierende Architektur entscheidet nur Projekt-/Notizrechte. Es gibt **keine Medien- oder Analyserechte**. Daher erweitert dieses Audit nichts, sondern empfiehlt als sicheren Default Admin-Mutationen und vorhandene Projekt-Lesesichtbarkeit für Reviewer. Reviewer-Mutationen bleiben PO-offen.

| Aktion | Admin – Empfehlung | Reviewer – Empfehlung | Status der Entscheidung |
|---|---|---|---|
| Medien hochladen | ja | zunächst nein | Audit-Default; PO entscheidet Reviewer. |
| ansehen | ja, aktives Projekt/Medium | ja, analog Projektlesen | aus Projektlesemodell ableitbar, neu zu implementieren/prüfen. |
| herunterladen | ja | ja, wenn ansehen erlaubt | Signed URL nach Einzelprüfung. |
| kategorisieren | ja | zunächst nein | mutierend, nicht bestehend. |
| Anzeigename ändern | ja | nein | Storagepfad bleibt unverändert. |
| soft-löschen | ja | nein | analog Projekt-Hauptdaten, nicht analog eigene Notiz ohne Entscheidung. |
| physisch löschen | nur separater Betriebsprozess | nein | Datenschutz-/Retentionentscheidung. |
| Analyse starten/erneut starten | später Admin | nein | Kosten-/Datenschutzkontrolle. |
| Analyse ansehen | später Admin | später Reviewer-Lesen erwägen | PO entscheidet sensible Ergebnisse. |
| freigeben/verwerfen | Admin | Reviewer nein | Human-Review-Entscheidung und bestehendes Admin-only Human-Review-Muster. |
| Ergebnisse bearbeiten | keine KI-Antwort überschreiben; Admin erstellt Bestätigung/Korrektur | nein | Audit-Trail statt Mutation. |
| in Angebot übernehmen | später Admin, explizit pro Wert | nein | keine autonome Übernahme/Freigabe. |

Falls Product Owner Reviewer-Upload erlaubt, müssen eigene Domainhelper, engste Services, RLS/Storage-Policies und Actor-Audit folgen. Reviewer-Löschung sollte nicht automatisch daraus folgen.

## 11. Datenschutz und Sicherheit

Dies ist keine Rechtsberatung. Rechtsgrundlage, Informationspflicht, Auftragsverarbeitung, Drittlandübermittlung, Betroffenenrechte, Aufbewahrung und Löschung müssen vor Production rechtlich/datenschutzrechtlich extern geprüft werden.

| Risiko | Schutzempfehlung |
|---|---|
| Gesichter, Kennzeichen, Adressen | Uploadhinweise/Datenminimierung; Zugriff nur projektbezogen; spätere Redaction prüfen; keine Logs/Prompts ohne Notwendigkeit. |
| Grundrisse/Gebäudetechnik | als besonders sensible Projektdaten behandeln; private URLs, Least Privilege, Exportkontrolle. |
| EXIF-GPS/Seriennummern | Derivate bereinigen; Originalspeicherung und EXIF-Retention explizit entscheiden; GPS standardmäßig nicht in DB/Prompt. |
| Kundendokumente | Kategorien allein reichen nicht; zulässige Dokumenttypen/Zwecke festlegen, Malware-/Inhaltsprüfung. |
| Anbieterübermittlung an KI | Opt-in/Zweck, Vertrag, Region, Retention/Training und Unterauftragnehmer extern prüfen; nur ausgewählte Derivate senden. |
| KI-Prompts/Rohantworten | keine unnötigen Namen/Adressen/IDs; Rohantwort standardmäßig nicht dauerhaft speichern; strukturierte validierte Ergebnisse minimieren. |
| Export | autorisierter projektbezogener Export, protokolliert, ohne langlebige Links; Analyse-/Löschstatus mitführen. |
| Logging | IDs/Fehlercodes statt Namen, Dateinamen, URLs, Bilder, Prompt/Rohantwort; Zugriff/Retention für Logs. |
| Mandantentrennung | aktuelles Modell hat kein `tenant_id`; vor Mehrmandantenbetrieb P0-neues Tenantmodell auf allen Tabellen/Pfaden/Policies/Jobs. Projekt-ID allein ist dann nicht ausreichend. |

Signed URLs sind Bearer-Geheimnisse: Weitergabe erlaubt Zugriff bis Ablauf. Sie gehören nicht in Clientpersistenz, Referrer, Logs oder externe Prompts. Caching-/Headerverhalten ist zu prüfen. Rate Limits, CSRF-/Origin-Überlegungen für mutierende Endpunkte, Content-Disposition, sichere Vorschau (insbesondere PDF) und Browser-Sandboxing sind Teil einer späteren Security-Abnahme.

## 12. Spätere KI-Analyse-Architektur

### 12.1 Workflow

1. Berechtigter Admin wählt ausschließlich aktive, `ready` Medien bewusst aus.
2. System erstellt unveränderlichen Analyseauftrag mit Projekt, Actor und Idempotency-Key.
3. Eingabemedien werden über Zuordnungstabelle samt Checksumme/Version eingefroren.
4. `analysis_version`, Anbieter, Modellname/-version (soweit verfügbar), Promptversion und Schema-Version werden festgehalten.
5. Datenschutz-/Kosten-/Mengen-Guard prüft Auswahl; keine automatische Ausführung bei Upload.
6. Worker erhält nur notwendige, kurzlebig zugängliche Derivate/Seiten, keine Public URLs.
7. Antwort wird gegen ein striktes versioniertes Zod/JSON-Schema validiert; unbekannte Felder werden nicht blind gespeichert.
8. Rohantwort wird standardmäßig nicht persistent gespeichert. Falls Debug-/Compliance-Bedarf dies ändert: verschlüsselt, zugriffsbeschränkt, kurz befristet und rechtlich geprüft.
9. Strukturierter Snapshot und normalisierte Findings werden gespeichert; jede Aussage enthält Typ, Unsicherheit und Evidenzreferenz.
10. Kosten-/Nutzungsmetadaten ohne Promptinhalt werden erfasst, soweit Anbieter sie verlässlich liefert.
11. Status wird `needs_review`; `requires_human_review` ist unveränderlich wahr für KI-Ergebnisse.
12. Admin prüft, korrigiert über separate Reviewentscheidungen, genehmigt oder verwirft. Original-KI-Ausgabe wird nie überschrieben.
13. Wiederholung erzeugt einen neuen Run mit `supersedes_analysis_id`; kein Update-in-place.
14. Ein Angebotsentwurf kann später ausschließlich bestätigte Werte einer explizit verknüpften freigegebenen Analyseversion vorschlagen.

Keine Analyse darf automatisch ein finales Angebot freigeben, Preise berechnen, technische Sicherheit bestätigen oder fehlende Maße zu Fakten machen.

### 12.2 Empfohlenes Analyse-Datenmodell

**Nicht Teil des Medien-MVP; Empfehlung für AP-13:**

`project_analysis_runs`:

- UUID, `project_id`, kontrollierter Status;
- monotone fachliche `analysis_version` je Projekt;
- `model_provider`, `model_name`, `model_version`/Snapshotbezeichner;
- `prompt_version`, `schema_version`;
- `created_by`, `started_at`, `completed_at`, `failed_at`;
- `reviewed_by`, `reviewed_at`, Reviewentscheidung/Kommentar getrennt;
- `error_code`, sanitisiertes `error_message`;
- `requires_human_review` immer wahr;
- `supersedes_analysis_id`, `deleted_at`;
- optionale Kosten-/Usage-Zahlen mit Einheit/Quelle, keine erfundenen Werte.

`project_analysis_media`:

- Run-ID, Media-ID, optionale Seitenzahl/Derivat-ID, Eingabereihenfolge, Checksumme zum Analysezeitpunkt;
- Eindeutigkeit verhindert unbemerkte Dopplung; keine bloße `input_media_ids`-JSON-Liste als alleinige Relation.

`project_analysis_results` (ein Snapshot je Run):

- `structured_result jsonb`, `schema_version`, Validierungsstatus, Erstellzeit;
- optional verschlüsselter/retentionsbegrenzter Rohantwortverweis, nicht standardmäßig `raw_response` in der Haupttabelle;
- kein einzelnes globales `confidence`, wenn Findings unterschiedliche Unsicherheit haben.

`project_analysis_findings` (später oder bereits bei Angebotsintegration):

- UUID, Run, Findingtyp, Klassifikation (`observed`, `estimated`, `suggested`, `unknown`), strukturierter Wert/Einheit, Confidence/Unsicherheitsgrund, Human-Review-Status, Reviewer, Evidenzreferenz, superseded/corrected-Verweis;
- wiederholt vorkommende Räume, Risiken, Positionen und Fragen werden normalisiert und vergleichbar.

**Bewertung:** Nur normalisierte Tabellen machen variable Ergebnisdetails schwer evolvierbar; nur JSON erschwert Berechtigung, Evidenz, Vergleich und sichere Angebotsübernahme. Die hybride Lösung hält Run-/Medien-/Review-/Findingidentität normalisiert und bewahrt einen unveränderlichen schema-versionierten Snapshot. Modell-, Prompt- und Schemawechsel erzeugen immer neue Runs. Kostenkontrolle verwendet Quoten, Idempotenz und Concurrency-Guards.

### 12.3 Statusmodell Analyse

MVP der KI-Stufe: `draft -> queued -> processing -> needs_review -> approved|rejected`; `queued|processing -> failed`; erneuter Lauf erzeugt neuen Datensatz; ein freigegebener älterer Run kann `superseded` werden, bleibt auditierbar. `completed` ist als technisches Synonym zu unpräzise; empfohlen wird nach erfolgreicher Modellantwort direkt `needs_review`. Abbruchstatus `cancel_requested`/`cancelled` erst ergänzen, wenn Ausführung ihn verlässlich unterstützt.

Nur ein aktiver (`queued`/`processing`) Run gleicher Analyseart pro Projekt, sofern Product Owner parallele Varianten nicht ausdrücklich benötigt. Unique-/Lock-/Idempotenzstrategie verhindert Doppelklicks. Retry desselben technischen Attempts darf keine neue fachliche Version erzeugen; bewusste Reanalyse schon.

## 13. Strukturiertes Analyseergebnis

### 13.1 Empfohlene Hülle

```text
schema_version
analysis_scope
input_references[]       (media_id, optional page, checksum)
observations[]           (direkt sichtbar, Evidenz, Unsicherheit)
rooms[]                  (Bezeichnung; Größe nur als bestätigt/geschätzt/unbekannt)
installation_candidates[]
routing_estimates[]
requirements_and_risks[]
missing_information[]
recommended_questions[]
overall_uncertainty
review_state             (immer pending bis Mensch entscheidet)
```

Jeder Eintrag benötigt stabile ID, Typ, Wert plus Einheit falls anwendbar, epistemische Klasse, Confidence nur als kalibrierter Hinweis, Unsicherheitsgrund, Evidenz (`media_id`, Seite/Region soweit möglich), `requires_human_confirmation` und optional Reviewerentscheidung. Ein fehlender Wert ist `unknown`, nicht Null mit impliziter Bedeutung.

### 13.2 Fachliche Felder und Einstufung

| Bereich | Einstufung und Übernahmeregel |
|---|---|
| erkannte Räume | Beobachtung/Vorschlag; Raumidentität und Vollständigkeit menschlich bestätigen. |
| Raumgröße | nur Fakt bei lesbarem, verifiziertem Maß; sonst Schätzung mit Methode/Spanne oder unbekannt. |
| Innen-/Außengeräteposition | Vorschlag, nie Tatsache; Statik, Herstellerregeln, Schall, Abstände und Genehmigungen menschlich prüfen. |
| Leitungslänge/Höhenunterschied | Schätzung, Einheit/Spanne/Evidenz; nie ungeprüft kalkulationswirksam. |
| Kernbohrung | Vorschlag/Risiko; Material, Leitungen, Statik/Brandschutz unbekannt – zwingend Fachprüfung. |
| Kondensatführung/Stromversorgung | Beobachtung plus Vorschlag; technische Eignung zwingend vor Ort prüfen. |
| Fassade/Dach/Gerüst/Hebetechnik | Risiko-/Aufwandsvorschlag; Arbeitsschutz, Statik, Zugang und Genehmigung menschlich. |
| erkennbare Risiken | Beobachtung oder Hypothese mit Schweregrad und Evidenz; keine Sicherheitsfreigabe. |
| fehlende Fotos/Maße | nachvollziehbare Gap-Liste; gut für Rückfragen, aber menschlich priorisieren. |
| Kundenfragen | Vorschläge; vor Versand redaktionell und datenschutzrechtlich prüfen. |
| Installationsaufwand | qualitative Schätzung; keine autonome Preis-/Zeit-/Personalzusage. |
| Sicherheitsunsicherheit | zwingendes Feld; hohe/unklare Unsicherheit blockiert Übernahme. |
| Analysehinweise | begrenzt, strukturiert, keine unkontrollierte Prompt-/HTML-Ausgabe. |
| menschliche Freigabe | ausschließlich Actor/Time/Decision außerhalb KI-Payload; KI darf sie nie setzen. |

Fakten stammen aus bestätigten Projekt-/Kundendaten oder klar lesbarer Evidenz, nicht aus Modellkonfidenz. Alle aus Bildern abgeleiteten technischen Aussagen bleiben bis Review Schätzungen/Vorschläge.

## 14. Human-Review-Architektur

- KI-Snapshot bleibt unveränderlich; Review erzeugt Entscheidung/Korrektur mit Actor und Zeit.
- Genehmigung erfolgt pro Finding oder explizit für eine versionierte Gesamtheit; „Analyse approved“ darf unsichere Einzelwerte nicht verdecken.
- Rollenentscheidung: Audit empfiehlt Admin-only, passend zum bestehenden Admin-only `requires_human_review` und zur Angebotsverantwortung.
- Rejection verlangt keinen sensiblen Freitext, aber kontrollierten Grund; neue Analyse ist neuer Run.
- Angebotsübernahme referenziert Run-ID, Finding-ID und Reviewrevision. Nachträgliche Reviewänderung erzeugt Revision statt Historienüberschreibung.
- Modellstatus `needs_review` und Projektfeld `requires_human_review` sind nicht synonym: ersteres gehört zum Run, letzteres zum Projektworkflow. KI darf das Projektfeld nicht abschalten.

## 15. WhatsApp-Vorbereitung

WhatsApp ist später nur eine Ingestion-Quelle derselben `project_media`-Domain, kein zweites Mediensilo. Quellenspezifische Daten gehören in eine eng begrenzte normalisierte Ingestiontabelle, z. B. `project_media_external_sources`, nicht frei ins Medien-JSON:

- Provider, externe Media-ID, Message-ID, pseudonymisierte/interne Conversation-/Chatreferenz, Empfangszeit;
- Downloadstatus, Attempts, nächster Retry, letzter sanitiserter Fehler;
- deklarierter und erkannter MIME, bereitgestellter Originalname;
- Senderreferenz nur soweit nötig, keine Telefonnummer in Logs/Pfaden;
- verknüpfte Media-ID, Zuordnungsstatus zu Kunde/Projekt und menschlicher Zuordner.

Externe Download-URLs laufen ab und werden nie als dauerhafte `storage_path` gespeichert. Ingestion lädt zeitnah, authentifiziert den Provider-Callback, prüft Größe/Signatur/Inhalt, berechnet Checksumme und kopiert in privates eigenes Storage. Deduplizierung nutzt Provider+Media-ID, Message-ID und Checksumme, löscht aber nicht automatisch fachlich relevante Wiederholungen. Abruf-Retry ist begrenzt; nach Ablauf `failed`/manuelle Wiederaufnahme.

Automatische Projektzuordnung ist P0-ausgeschlossen, bis Identitäts-, Einwilligungs- und Konfliktregeln fachlich geklärt sind. Audit empfiehlt menschliche Zuordnung; algorithmische Treffer höchstens Vorschlag. Automatische Kategorie ebenfalls nur Vorschlag. Einwilligung, Informationspflicht, Aufbewahrung, Providerübermittlung und Telefonnummernverarbeitung sind extern datenschutzrechtlich zu prüfen.

## 16. Schnittstelle zum späteren Angebotsgenerator

Ein Angebotsgenerator darf ausschließlich eine versionierte, freigegebene Reviewrevision lesen. Mögliche Vorschläge sind bestätigte Raumreferenzen, bestätigte Standortkandidaten, bestätigte Leitungslängen-/Bohrungs-/Zugangsannahmen, dokumentierte Risiken und offene Rückfragen. Selbst bestätigte Werte bleiben Eingaben/Vorschläge; Angebotsersteller entscheidet.

Zwingend menschlich zu bestätigen: Maße, Mengen, Gerätepositionen, Bohrungen, Elektro-/Kondensatannahmen, Höhenarbeiten, Zugänglichkeit, Risiken und jede kalkulationsrelevante Annahme. Nicht automatisch übernehmen: Preise, Rabatte, Vertrags-/Haftungstext, Sicherheitsfreigaben, personenbezogene Bilddetails, Modellkonfidenz als Fachwert, ungeprüfte Freitexte oder Daten eines superseded Runs.

Eine spätere Angebotsversion speichert `source_analysis_run_id`, Reviewrevision und einzelne Finding-Referenzen samt übernommenem Wert. Beim Entwurf wird geprüft: Run `approved`, nicht gelöscht, nicht superseded, Eingabemedien nicht nach Analyse fachlich ersetzt und Analyse nicht älter als relevante Projektänderungen. Abweichungen des Menschen werden als Angebotsentscheidung protokolliert; Analyse wird nicht rückwirkend überschrieben. Keine automatische finale Angebotsfreigabe.

## 17. Statusmodelle für Medien

### 17.1 MVP

Empfohlen: `pending -> uploading -> ready`; `pending|uploading -> failed`; `ready|failed -> deleted`. Wenn DB-Reservierung und Upload in einem synchronen Schritt sicher gekapselt werden, kann `uploading` intern bleiben. `uploaded` und `processing` sind erst sinnvoll, wenn nach Upload eine verpflichtende Validierungs-/Derivatphase existiert.

Später: `uploaded -> processing -> ready|failed`; optional `quarantined`, `purge_pending`, `purged` als Sicherheits-/Betriebszustände. `deleted` sollte fachlich aus `deleted_at` abgeleitet und nicht als unabhängig driftender Status doppelt gespeichert werden.

Zulässige Übergänge sind serverseitig zentral. `failed -> pending/uploading` nur als kontrollierter Retry derselben Reservierung; `deleted` ist terminal fachlich. Parallelität wird per Status-/Versionsfilter und eindeutigem Pfad behandelt. Ein abgebrochener Client bedeutet nicht automatisch fehlgeschlagen – erst Storageabgleich.

## 18. Kosten, technische Limits und Missbrauchsschutz

| Risiko | MVP-Schutz |
|---|---|
| viele/große Bilder/PDFs | pro Datei, Batch, Projekt und Actor begrenzen; Pixel-/Seitenlimit; früh ablehnen. |
| Bandbreite/Signed URLs | kurze TTL, Rate Limit, Lazy Loading, Thumbnails später, keine URL-Vorproduktion. |
| Storage/Derivate | Quota, Lifecycle/Purge, Derivatzählung, Reconciliation. |
| Vercel-Funktionslimits | kein ungemessener großer Buffer/CPU-Transform; Uploadarchitektur gegen Zielplan testen. |
| Supabase-Limits | Bucket-/Objekt-/Egress-/Signed-URL-/Function-Limits vor AP-12 extern offiziell verifizieren. |
| KI-Modell-/Tokenkosten | nicht im Medien-MVP; manuelle Starts, Medien-/Seitenlimit, Budget pro Projekt/Zeitraum, Kostenschätzung/Bestätigung. |
| wiederholte/parallele Analysen | Idempotenz, eine aktive Analyseart je Projekt, Cooldown/Quota, Admin-only. |
| Retries | exponentielles Backoff, maximale Attempts, keine unendlichen Schleifen, Dead Letter. |
| Missbrauch | Auth, Rollen/RLS, Rate Limits, Quoten, Sicherheitsprüfung, Audit, keine Service-Role-Umgehung. |

Vorläufige MVP-Limits müssen klein sein, werden aber hier nicht numerisch erfunden. Product Owner legt Nutzungsgrenzen fest; Engineering verifiziert die kleineren technisch zulässigen Grenzen gegen aktuelle Vercel-/Supabase-Dokumentation und Lasttests. Gleiches gilt später für Modellinput, Token, Dateiformate und Anbieterpreise.

## 19. Observability und Fehlerbehandlung

- Korrelation: `request_id`, `media_id`, optional `upload_attempt_id`, später `analysis_id`/`analysis_attempt_id`.
- Stabile fachliche Codes, z. B. `MEDIA_FORBIDDEN`, `PROJECT_INACTIVE`, `MEDIA_TYPE_UNSUPPORTED`, `MEDIA_TOO_LARGE`, `MEDIA_STORAGE_FAILED`, `MEDIA_FINALIZE_FAILED`, `ANALYSIS_SCHEMA_INVALID`, `ANALYSIS_PROVIDER_TIMEOUT`, `ANALYSIS_REVIEW_REQUIRED`.
- Nutzertexte deutsch, neutral und handlungsorientiert; interne Details nur geschützt.
- Logfelder: Zeit, Operation, Phase, Status, Dauer, Actor-ID falls erforderlich/pseudonymisiert, Providerstatus, Modell-/Prompt-/Schemaversion, Usage-Zahlen. Keine Namen, Telefonnummern, Dateiinhalte, Originaldateinamen, Storage-/Signed URLs, Prompts oder Rohantworten.
- Retry nur für klassifizierte transiente Fehler; Validierungs-/Berechtigungsfehler nie automatisch.
- Dead Letter für lange Pendingzustände, erschöpfte Upload-/Analyse-Retries, DB-/Storage-Divergenz und Purgefehler; manuelle Wiederaufnahme mit Auditspur.
- Metriken: Uploaderfolg/-dauer, Fehlercodes, verwaiste Objekte, gespeicherte Bytes, Signed-URL-Fehler; später Analysedauer, Schemafehler, Reviewquote, Usage/Kosten. Keine PII-Labels.

## 20. MVP-Abgrenzung und Stufenplan

### Stufe 1 – sichere Projektmedien

- private Supabase-Storage-Baseline;
- mehrere Medien je aktivem Projekt;
- JPEG, PNG, WebP, PDF;
- kontrollierte manuelle Primärkategorie;
- Admin-Upload/-Metadaten/-Soft-Delete; Reviewer zunächst Lesen/Download entsprechend Projektzugriff;
- Metadatenliste/Galerie auf Projektdetailseite und kurzlebige Signed URLs;
- idempotenter Upload, MIME-/Größenprüfung, Reconciliation und Löschkonzept;
- keine schwere Bild-/PDF-Verarbeitung.

**Nicht Stufe 1:** HEIC/TIFF/Office/CAD/ZIP/Video, freie Tags, OCR, PDF-Seitenrendering, EXIF-Anzeige, automatische Kategorien, KI, WhatsApp, automatische Rückfragen, Angebotsentwurf, Preis/Kalkulation, physische Sofortlöschung, Public URLs, Mehrmandantenbetrieb.

### Stufe 2 – manuelle KI-Analyse

Manuell durch Admin gestartete, begrenzte Analyse ausgewählter Bildderivate; versioniertes Schema/Prompt/Modell; strukturierte Findings; zwingendes Admin-Review; Reanalyse als neue Version; keine automatische Angebotsgenerierung oder -freigabe. PDF-Analyse nur als eigenes freigegebenes Teilpaket nach sicherem Rendering.

### Stufe 3 – Ingestion und Assistenz

WhatsApp-Medien über dieselbe Domain, menschliche Projektzuordnung, später assistierte Rückfragen und kontrollierter Angebotsentwurf aus bestätigten Findings. Automatik erst nach Datenschutz-, Kosten-, Qualitäts- und Production-Validierung.

## 21. Priorisiertes Risikoregister

### P0 – blockiert sichere Implementierung

| Risiko | Konsequenz / notwendige Auflösung |
|---|---|
| unautorisierter Zugriff / öffentliche URLs | privater Bucket, konsistente Tabellen-RLS/Storage-Policies, serverseitige Einzelprüfung und kurze Signed URLs vor jedem MVP. |
| ungeklärte Admin-/Reviewer-Rechte | AP-12-00 muss jede Aktion festlegen; keine implizite Ableitung aus Notizrechten. |
| MIME-Spoofing und schädliche Dateien | Signatur-/Strukturprüfung, Limits und sichere Vorschauarchitektur definieren. |
| inkonsistente DB-/Storage-Zustände / verwaiste Objekte | idempotenter Reservierungs-/Finalisierungsworkflow plus Reconciler/Purge. |
| Soft Delete vs. physische Löschung/Aufbewahrung | fachliches, betriebliches und rechtlich geprüftes Löschkonzept vor Kundendaten. |
| personenbezogene Daten und EXIF-GPS | Original-/EXIF-/Anbieterübermittlungsentscheidung und Datenschutzprüfung. |
| fehlende Human Review / KI-Halluzination | KI-Stufe technisch blockieren, bis unveränderliches Review-/Freigabemodell existiert. |
| Mandantentrennung | aktuelles System ist nicht mehrmandantenfähig; vor mehreren Betrieben Tenantmodell durchgängig einführen. |

### P1 – vor Production zu lösen

| Risiko | Schutz |
|---|---|
| große Dateien/PDFs und Dekompressionsangriffe | Byte-, Pixel-, Seiten-, Batch- und Projektlimits; Timeouts. |
| Signed-URL-Leakage | TTL, keine Logs/Persistenz, sichere Header/Referrer/Caches. |
| parallele Uploads/Analysen | Idempotenz, Locks/Unique-Regeln, Concurrency-/Quota-Grenzen. |
| veraltete Analyseversionen | immutable Runs, supersedes, Projekt-/Medienversionsprüfung bei Übernahme. |
| Prompt-/Schema-/Modelldrift | alle Versionen speichern; strikte Validierung; neue Runs statt Mutation. |
| Kostenexplosion/Retry-Schleifen | Admin-only, Budgets/Quoten, Attemptlimit, Backoff, Dead Letter. |
| sensible Rohantworten | standardmäßig nicht speichern; Ausnahme mit Retention/Verschlüsselung/Rechtsprüfung. |
| WhatsApp-Medienablauf | zeitnaher Import, begrenzter Retry, eigenes Storage, manueller Fehlerpfad. |
| Projekt-/Kunden-Soft-Delete-Kaskade | Zugriff sofort sperren; Purge und Analysehistorie konsistent behandeln. |

### P2 – später optimierbar

- perceptual Duplicate Detection und kuratierte Tags;
- optimierte Thumbnails/Farbprofile/Delivery-Caches;
- feinere Findingnormalisierung und Analysevergleich;
- automatisierte, aber weiterhin bestätigungspflichtige Kategorie-/Rückfragevorschläge;
- dedizierter Worker/externer Bilddienst nach gemessenem Bedarf;
- feinere Kostenprognose und Qualitätsmetriken.

## 22. Offene Produktentscheidungen

Legende: **Code** = bereits entschieden; **Audit** = sichere Empfehlung; **PO** = fachlich zu entscheiden; **Extern** = rechtlich/datenschutzrechtlich beziehungsweise anhand aktueller Anbieterlimits zu prüfen.

| Entscheidung | Einordnung | Empfehlung |
|---|---|---|
| Reviewer dürfen hochladen? | PO; nicht Code | zunächst nein; erst explizites Recht nach Bedarf. |
| Reviewer dürfen löschen? | PO; nicht Code | nein; Uploadrecht würde Löschrecht nicht implizieren. |
| Reviewer ansehen/downloaden? | Code-Basis + PO | analog bestehendem Projektlesen ja, sofern Projekt aktiv; sensible Kategorien ggf. später feiner. |
| MVP-Dateitypen? | Audit + PO | JPEG, PNG, WebP, PDF. |
| maximale Dateigröße? | PO + Extern | kleine getrennte Grenzen für Bilder/PDF; Technik offiziell verifizieren. |
| maximale Dateien je Projekt/Batch? | PO + Extern | niedrige Quoten festlegen und messbar machen. |
| Originale dauerhaft? | PO + Extern | nur zweckgebunden; Retention statt „dauerhaft“, Original für Belegbarkeit zunächst befristet erhalten. |
| EXIF entfernen? | Audit + Extern | aus Derivaten ja; Original-EXIF nur befristet/geschützt nach Rechtsprüfung, GPS nicht separat speichern. |
| HEIC? | Audit | nicht MVP; später kontrollierte Konvertierung. |
| PDF sofort? | Audit + PO | Speicherung/Download ja; Analyse/Rendering nein. |
| manuelle Kategorien? | Audit | ja, eine kontrollierte Primärkategorie. |
| KI automatisch starten? | Audit | nein. |
| wer startet/restartet KI? | PO; Audit | Admin-only. |
| wer gibt KI frei/verwirft? | Code-Basis + PO; Audit | Admin-only; bestehendes Human-Review-Recht ist Admin-only. |
| Rohantwort speichern? | PO + Extern; Audit | standardmäßig nein; validierten Snapshot speichern. |
| Retention Medien/Analysen/Backups/Logs? | PO + Extern | vor Production verbindlich definieren. |
| WhatsApp automatisch Projekt zuordnen? | Audit + Extern | nein; höchstens Vorschlag, Mensch bestätigt. |
| Daten in Angebot übernehmen? | PO; Audit | nur einzeln bestätigte, versionierte Findings; nie Preise/Sicherheit/ungeprüfte Freitexte. |
| physische Löschung durch Admin-UI? | PO + Extern; Audit | nein, separater kontrollierter Purge. |
| Multi-Tenant geplant? | PO | vor zweitem Betrieb entscheiden; dann eigenes P0-Architekturpaket. |

## 23. Empfohlene Arbeitspakete

Für jedes Paket gilt: keine Scope-Mitnahme aus Folgepaketen, explizite negative Berechtigungs-/Soft-Delete-Prüfung und Production-Validierung in produktionsgleicher Umgebung.

### AP-12 – Projektmedien

| AP | Ziel / Abhängigkeiten | Erlaubt; ausgeschlossen | Risiken, Tests, Migration, Production-Validierung |
|---|---|---|---|
| **AP-12-00 Domain-, Datenschutz- und Permission-Freeze** | PO-Entscheidungen, Kategorien, Formate/Limits, Status/Transitions, Retention; Basis AP-11 | Domainkonzept/Doku, später Konstanten/Schemas/Permissiontests; **kein** Bucket/UI/Upload | P0 Rechte/PII; Tests für Defaults, Rollen, Status, Schema; keine Migration; Security-/DS-Abnahme. |
| **AP-12-01 Datenmodell und Storage-Baseline** | nach 12-00; `project_media`, privater Bucketkonfigurationsplan | Migration für Tabelle/Constraints/Trigger/RLS-Aktivierung und deklarative Bucket-Baseline im genehmigten Folgeauftrag; keine UI/KI | FK/Redundanz/Pfade; Migration-/RLS-Strukturtests; ja; Staging-Migration/Rollback/Privatheit. |
| **AP-12-02 Storage-Policies & Security Harness** | 12-01 | engste Storage-Policies und negative Integrationstests; kein Upload-UI | Cross-project/gelöschtes Projekt/Path spoof; mögliche Policy-Migration; echte Admin/Reviewer/anon-Tests. |
| **AP-12-03 Upload-Orchestrierung** | 12-00–02 | Service/Action oder Route gemäß Entscheidung, MIME/Größe, idempotente Zustände; keine Galerie/KI | Teilfehler/Timeout/Concurrency; Service-/Integrationtests; evtl. Statusmigration nur falls 12-01 unvollständig; reale Uploadfehler. |
| **AP-12-04 Upload-UI** | 12-03 stabil | barrierearmes deutsches Formular, Progress/Fehler; keine Verarbeitung/KI | Doppelclick/Abbruch; Komponenten-/Action-State-/Browsertests; keine Migration; Browser/Admin/Reviewer. |
| **AP-12-05 Medienliste, Vorschau und Download** | 12-02–04 | Detailseitenliste/Galerie, Signed URLs, sichere PDF-Darstellung | URL-Leak/Cache/a11y; Permission-/Expiry-/Browsertests; keine Migration; reale URL-TTL/Download. |
| **AP-12-06 Metadaten und Kategorien** | 12-00, 12-05 | Caption/Kategorie/Sortierung gemäß Freeze, enges Mapping | Mass Assignment/Parallelität; Zod/Permission/Conflict; ggf. Kategorieconstraintmigration; Rollenabnahme. |
| **AP-12-07 Soft Delete & Purge/Reconciliation** | 12-01–06, Retentionentscheidung | Soft-Delete-Service, Zugriffssperre, separater Reconciler/Purge | Leaks/Orphans/Backups; Idempotenz/Race/Failuretests; ggf. Purgestatusmigration; Storage-/DB-Fehlersimulation. |
| **AP-12-08 PDF-/Dateidarstellung** | 12-05, Securityentscheidung | sichere Anzeige/Icons/Download; optional erst später Preview-Pipeline | Parser/aktive Inhalte/große PDFs; Browser-/Securitytests; Derivatemigration nur bei Preview; reale PDFs. |
| **AP-12-09 Medien-Regression & Production-Abnahme** | alle AP-12 | End-to-end/RLS/Storage/Soft-delete/Observability-Härtung; keine Features | Rollen/Leaks/Last; vollständige Tests, keine fachliche Migration; Staging/Production-Checklist. |

### AP-13 – KI-Analyse (erst nach produktionsreifem AP-12)

| AP | Ziel / Abhängigkeiten | Erlaubt; ausgeschlossen | Risiken, Tests, Migration, Production-Validierung |
|---|---|---|---|
| **AP-13-00 KI-Domain-, Datenschutz- und Kosten-Freeze** | AP-12-09 | Findingklassen, Rollen, Retention, Budgets, Anbieterentscheidung; kein API-Call | Halluzination/PII/Kosten; Schema-/Permissiontests; keine Migration; externe Datenschutz-/Anbieterprüfung. |
| **AP-13-01 Analyseauftrags- und Versionsmodell** | 13-00 | Runs/Mediarelations/Status/Idempotenz/RLS | Parallelität/Audit; Transition-/RLS-/Migrationtests; ja; Staging-Concurrency. |
| **AP-13-02 Strukturiertes Ergebnisschema** | 13-00/01 | versioniertes Zod-Schema, Fixtures/Validatoren; kein Provider | Schema-Drift/JSON-Mass-Assignment; adversariale Schema-/Größentests; ggf. Resulttabelle; Validierung realer anonymisierter Beispiele. |
| **AP-13-03 Medien-/PDF-Derivatpipeline** | AP-12, 13-00 | ausgewählte sichere Bildderivate; PDF separat freigeben | EXIF/Decoder/Timeout; Golden-/Security-/Resource-Tests; ggf. Derivatemodell; gemessene Limits. |
| **AP-13-04 Manuell gestartete Analyse** | 13-01–03 | Adminstart, Provideradapter, Queue/Retry, strukturierte Validierung | PII/Kosten/Timeout; Mock-/Contract-/Failuretests; ggf. Attempts; kontrollierter Stagingcall. |
| **AP-13-05 Ergebnisdarstellung** | 13-02/04 | Evidenz/Unsicherheit/Version sichtbar; keine Freigabe | falsche Sicherheit/XSS; a11y-/escaping-/permissiontests; keine Migration; Fachreview. |
| **AP-13-06 Human Review & Korrekturen** | 13-05 | immutable Entscheidungen/Revisionen, approve/reject | fehlende Granularität/Überschreiben; Rollen/Audit/Concurrency; wahrscheinlich Reviewmigration; Doppelreview-Abnahme. |
| **AP-13-07 Versionierung & Angebots-Read-Contract** | 13-06 | supersedes, stale checks, nur bestätigte Findings; keine Angebotslogik/Preise | veraltete Werte; Versions-/Mutationstests; mögliche Referenzmigration; Fachabnahme. |
| **AP-13-08 Kosten, Retry, Dead Letter & Observability** | 13-04 | Quoten, Attempts, manuelle Wiederaufnahme, Metriken | Schleifen/PII-Logs; Failure-/Loadtests; ggf. Usagefelder; Chaos-/Quota-Abnahme. |
| **AP-13-09 KI-Regression & Production Gate** | alle AP-13 | Security/Qualität/Human-Review/Runbook; keine Automatisierung | Halluzination/Drift; kuratierte Regression, RLS, Last; keine fachliche Migration; formale Go/No-Go-Abnahme. |

### AP-14 – spätere Integrationen

- **AP-14-00 WhatsApp-Ingestion-Domain und Datenschutz-Freeze** vor jedem Providercall.
- **AP-14-01 idempotente externe Medien-Ingestion** mit eigenem Status/Retry und menschlicher Zuordnung.
- **AP-14-02 assistierte Rückfragen** nur aus geprüften Gaps, vor Versand bestätigt.
- **AP-14-03 Angebotsentwurf-Adapter** nur aus freigegebenen, nicht veralteten Findings; Preise und Freigabe außerhalb KI.

## 24. Klare Empfehlung für das erste Implementierungspaket

**Als nächstes ausschließlich AP-12-00 umsetzen.** Ziel ist ein verbindlicher, testbarer Freeze von Medien-Domainregeln und Permissions: Rollenmatrix, Format-/Mengen-/Größenlimits, Kategorien, Statusübergänge, Original-/EXIF-/Retentionentscheidung, Signed-URL-TTL-Ziel, Löschverantwortung und Datenschutz-Gate. Erst danach darf AP-12-01 Datenmodell/Bucket-Baseline beginnen.

AP-12-00 darf noch keinen Bucket, keine Migration, keine Storage-Policy, keinen Uploadservice und keine UI enthalten. Diese Reihenfolge verhindert, dass irreversible Storage-/Datenentscheidungen vor Rollen-, Datenschutz- und Löschklärung getroffen werden.

## 25. Audit-Abschluss und Negativbestätigung

Dieses Audit hat ausschließlich Architektur geplant. Es enthält keine Implementierung, keine UI-Änderung, keine Komponente, keine Server Action, keinen Service, keinen Test und keine Testausführung, keine Migration, kein SQL, keine RLS-/Trigger-/Storage-Policy-Änderung, keinen Bucket, keine Bild-/PDF-Verarbeitung, keinen OpenAI-/WhatsApp-Aufruf, keine Angebots-/Preislogik, kein Refactoring und keine `package.json`-Änderung. Bestehende Auditdateien wurden nicht verändert.

**Status: DRAFT – NICHT ZUR IMPLEMENTIERUNG FREIGEGEBEN**
