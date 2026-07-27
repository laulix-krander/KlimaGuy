# AP-12-01 – Datenmodell- und Storage-Baseline-Audit

**Audit-ID:** `KG-AUDIT-2026-07-24-AP12-01-DATA-STORAGE-V1`  
**Audit-Datum:** 24.07.2026  
**Arbeitsbranch:** `codex/audit-ap12-01-data-storage-baseline`  
**Geprüfte Baseline:** `aed1dee60f53cb7895f186739820e7dda00042d1`  
**Status:** **DRAFT – NICHT ZUR IMPLEMENTIERUNG FREIGEGEBEN**  
**Charakter:** ausschließlich Datenmodell- und Storage-Planung; keine Implementierung

## 1. Executive Summary

Das Repository besitzt drei chronologisch nummerierte Migrationen mit UUID-Primärschlüsseln, `timestamptz`-Zeitstempeln, einem generischen `set_updated_at`-Trigger, Soft Delete für fachliche Hauptdaten, partiellen Aktiv-Indizes, RLS und dem rollenauflösenden `SECURITY DEFINER`-Helper `current_app_role()`. Projektmedien und Storage sind noch nicht vorhanden.

Empfohlen wird eine kleine Tabelle `public.project_media` mit 16 Pflichtspalten und optionaler `caption`; `sort_order` und alle Verarbeitungs-/Extraktionsfelder werden verschoben. `customer_id` wird nicht dupliziert. Kontrollierte Textwerte mit benannten CHECK-Constraints passen für die noch veränderlichen Medienwerte besser als neue PostgreSQL-Enums oder Lookup-Tabellen. Der private Bucket heißt `project-media`; der Originalpfad lautet exakt `projects/{project_id}/originals/{media_id}/{stored_filename}` und enthält ausschließlich kontrollierte UUIDs und einen UUID-basierten Dateinamen.

Autorisierung muss stets DB-Zuordnung, aktives Profil, Rolle, aktives Projekt und aktives Medium prüfen; der Pfad allein genügt nie. Admins dürfen reservieren, finalisieren, erlaubte Metadaten ändern und soft-löschen; Reviewer lesen nur. Normale Rollen erhalten weder physischen Tabellen-DELETE noch Storage-UPDATE/-DELETE. Das MVP sollte serverseitig orchestriert **DB zuerst** arbeiten: `pending` reservieren, Objekt ohne Upsert hochladen, verifizieren, zu `ready` finalisieren; Fehler werden `failed`, anschließend kontrolliert bereinigt und reconciled. `uploading` und `deleted` sind keine separaten MVP-Statuswerte.

Für Soft Delete ist wegen feldgenauer, nicht umgehbarer Semantik eine kleine Admin-only RPC analog, aber enger als bei `project_notes`, empfehlenswert. Physischer Purge bleibt ein späterer idempotenter Betriebsprozess. Signed URLs entstehen ausschließlich serverseitig nach erneuter Autorisierung und mit extern zu verifizierender kurzer TTL. Vor Umsetzung bleiben Anbieterlimits, PDF-Darstellung, EXIF, Retention, Purge-Betrieb und echte Tenant-Isolation Production Gates.

## 2. Scope, Baseline und Referenzen

Vollständig gelesen wurden:

- Hauptaudit `KG-AUDIT-2026-07-24-PROJECT-MEDIA-AI-V1`;
- Domain-Freeze `KG-DECISION-2026-07-24-AP12-00-MEDIA-DOMAIN-V1`;
- AP-11-Abschluss `KG-AUDIT-2026-07-24-AP11-FINAL-V1`;
- sämtliche Migrationen unter `supabase/migrations`.

Der Checkout begann sauber auf Branch `work` bei `aed1dee60f53cb7895f186739820e7dda00042d1`. Es ist **kein Git-Remote konfiguriert**; deshalb waren `git fetch origin`, `origin/main`, dessen Commit und ein Merge-Base-Vergleich nicht verfügbar. Der saubere lokale HEAD ist die Audit-Baseline. **Review-Hinweis:** Vor Freigabe muss der Commit gegen das tatsächliche `origin/main` verifiziert werden; eine Übereinstimmung kann dieses Audit nicht behaupten.

Nicht untersucht oder ausgeführt wurden externe Anbieterprüfung, Datenbanklaufzeit, Tests und Production-Zugriffe. Anbieterabhängige Aussagen sind folglich als extern zu verifizieren markiert.

## 3. Bestehende Datenbankkonventionen

| Aspekt | Tatsächlicher Repository-Stand | Folgerung für `project_media` |
|---|---|---|
| Migrationen | `YYYYMMDDNNNN_beschreibung.sql`, derzeit je Datum ein fortlaufender Block | Folgepakete chronologisch und beschreibend benennen |
| Namen | unquotiertes `snake_case`; fachliche Tabellen im Plural, `project_notes` | Tabellenname `project_media` folgt dem bereits gefrorenen Singular-Sammelbegriff |
| UUID | `gen_random_uuid()` durch `pgcrypto`; Profil-ID entspricht `auth.users.id` | Medien-ID mit `gen_random_uuid()`, vor Upload reservierbar |
| Zeitstempel | `created_at`/`updated_at`: `timestamptz`, Pflicht, `now()`; fachliches `deleted_at` nullable | dasselbe Muster übernehmen |
| `updated_at` | generische Funktion `set_updated_at()` und tabellenspezifische Before-Update-Trigger | vorhandenen generischen Helper wiederverwenden |
| Soft Delete | `customers`, `projects`, nach Migration auch `project_notes`; Aktivabfragen nutzen `deleted_at is null` | Medium soft-löschen; Restore im MVP sperren |
| Foreign Keys | Auth-Akteure referenzieren `auth.users(id)`; Projekt-Notizen referenzieren Projekt mit Cascade; andere FKs ohne explizite Aktion | Actor direkt gegen `auth.users`; Medienprojekt nicht physisch kaskadieren |
| Enums | `app_role`, `project_status`, `project_class` für sehr stabile Kernwerte | veränderliche Medienkataloge als Text plus CHECK planen |
| CHECK/Text | Bestehende Migrationen haben keine Längen- oder CHECK-Constraints | für untrusted Dateimetadaten gezielt benannte CHECKs ergänzen, nicht fehlende Altstrenge kopieren |
| Indizes | benannte `*_idx`; zusammengesetzte und partielle Aktiv-Indizes | query-getriebenen partiellen Projektindex plus Pfad-Unique verwenden |
| RLS | auf allen fachlichen Tabellen aktiviert; Policies je Operation, sprechende Namen | vier Operationen getrennt; keine DELETE-Policy |
| Rollenprüfung | `current_app_role()` liest Profilrolle; Policies prüfen häufig zusätzlich `auth.uid()` | beides verwenden; Helper allein beweist kein aktives Profil jenseits vorhandener Zeile |
| Aktives Projekt | neue Notiz-Policies prüfen Projekt-Existenz und `projects.deleted_at is null` | bei jeder Medienoperation spiegeln |
| Ownership | `created_by = auth.uid()` bei Inserts; Reviewer-Notizen an Autor gebunden | `uploaded_by = auth.uid()`; keine Reviewer-Mutation |
| geschützte Felder | Notiz-Trigger blockiert ID/Projekt/Autor/Erstellzeit und Restore; Projekt-Trigger begrenzt Reviewerfelder | unveränderliche Medienfelder DB-seitig schützen |
| RPC | Soft-Delete-RPC für Notizen prüft Actor, Rolle, aktives Projekt, Zuordnung und Zustand | Medien-RPC als eigenständige engere Funktion planen |
| `SECURITY DEFINER` | Rollenhelper und Soft-Delete-RPC; expliziter `search_path` | nur bei begründetem RPC, minimal und mit `public, pg_temp` |
| Grants | Audit-Log vollständig für `anon`/`authenticated` entzogen; RPC erst revoked, dann nur `authenticated` granted | Medien-Purge nicht an normale Rollen; RPC explizit härten |
| Audit-Log | Client darf nicht direkt schreiben | Betriebsprozess protokolliert serverseitig, ohne PII/URLs |

Schwachstellen älterer Baseline-Policies – etwa breite Projekt-SELECTs – werden nicht als neue Medienkonvention übernommen. Maßgeblich sind die gehärteten aktiven-Projekt-Prüfungen der späteren Notizmigration und der AP-12-00-Freeze.

## 4. Empfohlene Tabelle und Feldmatrix

### 4.1 Minimaler MVP-Kern

Pflicht sind genau 16 Spalten: `id`, `project_id`, `storage_bucket`, `storage_path`, `original_filename`, `stored_filename`, `mime_type`, `file_size_bytes`, `media_type`, `category`, `source`, `upload_status`, `uploaded_by`, `created_at`, `updated_at`, `deleted_at`. `caption` ist die einzige zusätzlich empfohlene nullable MVP-Spalte. `sort_order` wird verschoben.

| Feld | Typ / Null / Default | Constraint und Bedeutung | Phase | Änderbarkeit / Sicherheit |
|---|---|---|---|---|
| `id` | `uuid`, NOT NULL, UUID-Default | Primärschlüssel; vor Upload erzeugt | MVP | nie änderbar; Pfadanker |
| `project_id` | `uuid`, NOT NULL, kein Default | FK auf `projects.id` | MVP | nie änderbar; zentrale Autorisierungsgrenze |
| `storage_bucket` | `text`, NOT NULL, Default `project-media` | exakt `project-media`, nicht leer | MVP | Default ist Defense in Depth; nie clientseitig änderbar |
| `storage_path` | `text`, NOT NULL, kein Default | 1–512 Zeichen, kanonisches Pfadmuster; zusammen mit Bucket unique | MVP | nie änderbar; niemals allein autorisieren |
| `original_filename` | `text`, NOT NULL, kein Default | nach Bereinigung 1–255 Zeichen; keine Steuerzeichen/Pfadseparatoren | MVP | optionaler Admin-Anzeigename; kann PII enthalten, nicht loggen |
| `stored_filename` | `text`, NOT NULL, kein Default | UUID plus kanonische Endung, höchstens 64 ASCII-Zeichen | MVP | servergeneriert, unveränderlich |
| `mime_type` | `text`, NOT NULL, kein Default | erkannter Typ aus exakter Allowlist | MVP | nach Finalisierung unveränderlich; sicherheitskritisch |
| `file_size_bytes` | `bigint`, NOT NULL, kein Default | positiv; typabhängige Produktlimits zusätzlich | MVP | verifiziert, nie clientseitig änderbar |
| `media_type` | `text`, NOT NULL, kein Default | exakt `image` oder `document`, konsistent zu MIME | MVP | abgeleitet, unveränderlich |
| `category` | `text`, NOT NULL, Default `other` | exakte Kategorien-Checkliste | MVP | bewusster Fallback; Admin darf bei aktivem Medium ändern; keine technische Aussage |
| `source` | `text`, NOT NULL, Default `manual_upload` | im MVP exakt `manual_upload` | MVP | serverseitig gesetzt und unveränderlich; zukünftige Quellen nicht aktivieren |
| `upload_status` | `text`, NOT NULL, `pending` | exakt `pending`, `ready`, `failed` | MVP | nur Orchestrator; nicht freies Metadatenupdate |
| `uploaded_by` | `uuid`, NOT NULL, kein Default | FK `auth.users(id)`; beim Insert zwingend `auth.uid()` | MVP | unveränderlich; Auditzuordnung |
| `created_at` | `timestamptz`, NOT NULL, `now()` | Erstellzeit | MVP | unveränderlich |
| `updated_at` | `timestamptz`, NOT NULL, `now()` | generischer Trigger aktualisiert | MVP | automatisch |
| `deleted_at` | `timestamptz`, NULL | NULL aktiv, Zeitwert soft-gelöscht | MVP | nur Admin-Soft-Delete-Pfad; kein Restore |
| `caption` | `text`, NULL, NULL | höchstens 1.000 Zeichen; leer zu NULL | MVP empfohlen | Admin änderbar; nur Text rendern, nie HTML/Autorisierung/KI-Automatik |
| `sort_order` | `integer`, NULL, kein Default | falls später: nicht negativ | später | parallele Reorder-Konflikte; kein MVP-Nutzen belegt |
| `processing_status` | `text`, NULL, kein Default | erst mit realer Verarbeitung | später | separater Automat, nicht Uploadstatus |
| `width` | `integer`, NULL, kein Default | später positiv, nur Bilder | später | nur serverseitig erkannt |
| `height` | `integer`, NULL, kein Default | später positiv, nur Bilder | später | nur serverseitig erkannt |
| `page_count` | `integer`, NULL, kein Default | später positiv, nur PDF | später | nur sicherer Parser setzt Wert |
| `checksum` | `text`, NULL, kein Default | später Algorithmus und Format explizit | später | nur serverseitig berechnen; nicht autorisieren |
| `metadata` | `jsonb`, NULL, kein Default | kein allgemeines Feld im MVP | später/konkreter Bedarf | hohes Mass-Assignment-, PII- und Drift-Risiko |

`caption` wird sofort empfohlen, weil AP-12-00 Anzeigename/Caption als Admin-Metadaten vorsieht und die eng begrenzte Spalte keine Sortier- oder Prozessmaschine erfordert. `sort_order` wird mangels UI-/Query-Bedarf verschoben; stabile Anzeige nutzt zunächst `created_at`, dann `id`.

### 4.2 Keine redundante Kundenzuordnung

`projects.customer_id` ist bereits Pflicht-FK. Medienzugriff läuft natürlich `project_media.project_id → projects.id → projects.customer_id`; die RLS muss das aktive Projekt ohnehin prüfen. Ein zusätzlicher Join ist für projektweise Medienlisten kein relevanter Nachteil, während dupliziertes `customer_id` bei Projektumbuchung auseinanderlaufen und eine zweite manipulierbare Autorisierungsdimension schaffen würde. Revalidation folgt zunächst nur dem Projektdetail; spätere Kunden-/Listenaggregate werden über bestehende Projektbeziehungen abgeleitet.

**Empfehlung:** kein `customer_id` in `project_media`, auch mit Blick auf spätere Mandantenfähigkeit. Ein künftiges `tenant_id` muss als durchgängiges, separat auditiertes Isolationsmodell eingeführt werden und darf nicht durch redundante Kunden-IDs simuliert werden.

## 5. Wertemodelle und Constraints

### 5.1 Kategorie

Ein benannter CHECK-Constraint soll exakt zulassen: `indoor_area`, `outdoor_area`, `indoor_unit_location`, `outdoor_unit_location`, `pipe_route`, `electrical_connection`, `condensate_route`, `facade`, `roof`, `balcony`, `floor_plan`, `technical_document`, `customer_document`, `other`.

- **CHECK empfohlen:** entspricht der kleinen, fest gefrorenen MVP-Allowlist und lässt spätere kontrollierte Migrationen zu.
- **PostgreSQL-Enum nicht empfohlen:** Kategorien wachsen wahrscheinlicher als die bestehenden Kernrollen/-status; Erweiterung und Rollback wären schwerer.
- **Lookup-Tabelle nicht empfohlen:** Labels, Aktivierung oder Administration sind im MVP nicht gefordert; zusätzliche RLS/FKs wären unnötig.

### 5.2 Quelle

Der erste Constraint erlaubt **nur** `manual_upload`. Die dokumentierten Zukunftswerte `whatsapp`, `email`, `api`, `ai_generated`, `import` werden nicht vorab zugelassen, weil dies unfertige Ingestionspfade technisch aktivieren könnte. Jede Erweiterung benötigt Migration und eigenes Sicherheits-/Domainpaket.

### 5.3 MIME und Medientyp

`mime_type` speichert ausschließlich den serverseitig anhand von Dateisignatur/Inhalt erkannten kanonischen Wert: `image/jpeg`, `image/png`, `image/webp` oder `application/pdf`. `media_type` ist die fachliche Gruppierung: die drei Bild-MIMEs erfordern `image`, PDF erfordert `document`. Ein kombinierter Konsistenz-CHECK verhindert widersprüchliche Paare.

Browser-MIME, Dateiendung und Dateiname sind untrusted Hinweise. Der Server prüft Signatur und Struktur mit einer zum Implementierungszeitpunkt ausgewählten, gepflegten Methode; MIME-Spoofing darf nicht durch bloßen Headervergleich passieren. Bei abweichender Endung zählt der erkannte Inhalt: entweder kontrolliert ablehnen oder den gespeicherten UUID-Namen mit kanonischer Endung bilden; niemals den Inhalt aufgrund der Endung umdeuten. Der erkannte MIME-Wert wird persistiert, der behauptete Browserwert nicht als Wahrheit.

### 5.4 Größe

Die DB erzwingt immer `file_size_bytes > 0`. Zusätzlich wird ein MIME-abhängiger CHECK für die gefrorenen Produktlimits empfohlen: Bilder höchstens 15 × 1.000.000 Bytes, PDF höchstens 25 × 1.000.000 Bytes, wobei die genaue MB-/MiB-Definition vor Umsetzung extern/fachlich bestätigt werden muss. Dieselben Grenzen müssen vor Upload serverseitig gelten.

Der DB-CHECK ist Defense in Depth gegen umgangene Services. Seine Änderung benötigt zwar eine Migration, doch Produktlimitänderungen sind sicherheits-/kostenrelevant und sollten reviewbar sein. Das Bucketlimit kann nur das globale Maximum (25 MB nach bestätigter Bytezahl) abbilden; die MIME-spezifische Grenze bleibt Server plus DB.

### 5.5 Dateinamen und Pfad

- `original_filename`: Unicode nach definierter Normalisierung; trimmen; 1–255 Zeichen; NUL, C0/C1-Steuerzeichen, `/`, `\`, `.`/`..` als alleinige Namen und bidi-kritische Steuerzeichen ablehnen. Nur Anzeige-Metadatum, niemals Pfad/Autorisierung. UI und Logs müssen mögliche Kundendaten minimieren.
- `stored_filename`: serverseitig `{zufällige_uuid}.{jpg|png|webp|pdf}`, lowercase, höchstens 64 Zeichen, keine vom Client übernommenen Bestandteile und kein Upsert.
- `storage_path`: serverseitig aus bekannten Segmenten, 1–512 Zeichen, keine leeren Segmente, Backslashes, Traversalsegmente, führenden/trailing Slash oder Steuerzeichen. DB validiert die kanonische Grundform; vollständige UUID-/Zuordnungsprüfung erfolgt serverseitig und in Policies.

### 5.6 Benannte Constraint-Matrix für das Folgepaket

Die Namen sind Planungsbestandteil, noch keine SQL-Implementierung. Sie folgen dem vorhandenen lesbaren `snake_case`-Stil und vermeiden anonyme, schwer zu diagnostizierende Regeln.

| Geplanter Name | Betroffene Felder | Exakte fachliche Aussage |
|---|---|---|
| `project_media_pkey` | `id` | jede Medien-ID ist global eindeutig und nicht NULL |
| `project_media_project_id_fkey` | `project_id` | verweist auf ein vorhandenes Projekt; physisches Löschen wird eingeschränkt |
| `project_media_uploaded_by_fkey` | `uploaded_by` | verweist auf einen vorhandenen Auth-Benutzer; physisches Löschen wird eingeschränkt |
| `project_media_storage_location_key` | `storage_bucket`, `storage_path` | jede Bucket-/Objektpfadkombination ist eindeutig |
| `project_media_storage_bucket_check` | `storage_bucket` | ausschließlich `project-media` |
| `project_media_storage_path_check` | `storage_path` | nicht leer, maximal 512 Zeichen, kanonische segmentierte Grundform ohne Traversal/Steuerzeichen |
| `project_media_original_filename_check` | `original_filename` | bereinigt, 1–255 Zeichen, keine Pfad- oder Steuerzeichen |
| `project_media_stored_filename_check` | `stored_filename` | UUID-basierter ASCII-Name mit exakt zur MIME-Allowlist passender kanonischer Endung |
| `project_media_mime_media_type_check` | `mime_type`, `media_type` | nur die vier MIME-Werte und jeweils konsistente Gruppe `image`/`document` |
| `project_media_file_size_check` | `file_size_bytes`, `mime_type` | positiv und innerhalb des nach externer Byteklärung festgeschriebenen MIME-Limits |
| `project_media_category_check` | `category` | exakt die 14 eingefrorenen MVP-Kategorien |
| `project_media_source_check` | `source` | ausschließlich `manual_upload` |
| `project_media_upload_status_check` | `upload_status` | ausschließlich `pending`, `ready`, `failed` |
| `project_media_caption_check` | `caption` | NULL oder maximal 1.000 Zeichen; Leerstring wird bereits im Service zu NULL normalisiert |

Für `deleted_at` ist kein eigener Werte-CHECK erforderlich: NULL beziehungsweise ein realer `timestamptz` bildet den Zustand vollständig ab. Für `uploaded_by = auth.uid()` und aktive Projekte sind Policies/RPCs zuständig, nicht statische CHECK-Constraints. `(project_id, id)` erhält bewusst weder Unique Constraint noch zusätzlichen Index.

## 6. Foreign Keys und Löschverhalten

| Beziehung | Empfehlung | Begründung |
|---|---|---|
| `project_id → public.projects.id` | NOT NULL, `ON DELETE RESTRICT` | Projekte werden fachlich soft-gelöscht. Physisches Cascade könnte DB-Metadaten entfernen, während Storageobjekte bleiben; Restrict erzwingt kontrollierten Purge. |
| `uploaded_by → auth.users.id` | NOT NULL, `ON DELETE RESTRICT` | entspricht `created_by`; Auditzuordnung darf nicht still auf NULL fallen oder Medien kaskadieren. Auth-User-Löschung benötigt vorab einen geregelten Retention-/Anonymisierungspfad. |

Eine FK zu `profiles` wird nicht empfohlen: Das Repository bindet `created_by` direkt an `auth.users`, Profile werden mit Auth-Usern kaskadiert, und ein Profil ist Autorisierungszustand statt dauerhafter Actor-Ursprung. `CASCADE` ist für Medien wegen externer Storageobjekte ungeeignet; `SET NULL` widerspricht der gefrorenen Nachvollziehbarkeit.

## 7. Indizes und Eindeutigkeit

### MVP-Indizes

1. Primärschlüssel auf `id`.
2. Unique Constraint auf `(storage_bucket, storage_path)`; er ist zugleich der erforderliche Lookup-Index und verhindert Objektkollisionen.
3. Partieller Listenindex auf `(project_id, created_at DESC, id)` nur für `deleted_at IS NULL`; deckt aktive Projektlisten und stabile Tie-Break-Sortierung ab.
4. Optional erst bei realem Reconciliation-Query: partieller Index auf `(upload_status, updated_at)` für nicht gelöschte, nicht fertige Datensätze.

Nicht im MVP separat indizieren: `project_id` (vom partiellen Listenindex abgedeckt), `uploaded_by`, `created_at`, `category`, `deleted_at`, `sort_order`. Diese Felder haben aktuell kein eigenständiges selektives Query-Muster. Schreibkosten und Indexpflege überwiegen. Ein Statusindex wird erst mit einem tatsächlich betriebenen Reconciler angelegt.

`(project_id, id)` braucht keine Unique-Bedingung: `id` ist global eindeutig. Services und Policies müssen beide Werte trotzdem vergleichen, um Zuordnungsfehler zu verhindern; dafür genügt der Primärschlüssel plus Projektprädikat.

## 8. Upload-Statusmodell

MVP-Werte: `pending`, `ready`, `failed`.

| Zustand | Bedeutung | erlaubter Übergang |
|---|---|---|
| `pending` | autorisierte DB-Reservierung; Objekt darf fehlen oder gerade übertragen werden | `ready`, `failed` |
| `ready` | Objekt vorhanden, Größe/MIME/Pfad verifiziert und normal zugreifbar | kein technischer Rücksprung; Soft Delete separat |
| `failed` | Upload/Verifikation/Finalisierung endgültig für diesen Versuch fehlgeschlagen | kontrollierter Retry über neue Reservierung oder eng definiertes Zurücksetzen |

`uploading` ist bei direktem/signed Upload weder transaktional noch zuverlässig: Browserabbruch und Timeout hinterlassen den Wert. `pending` plus Zeitstempel bildet denselben Reconciliation-Bedarf ehrlich ab. `deleted` wird nicht dupliziert; `deleted_at` ist die fachliche Quelle. Parallele Uploads erhalten unabhängige Medien-UUIDs. Idempotency Keys sind im Servicepaket zu planen, nicht als unkontrolliertes MVP-Metadatum.

`processing_status` wird verschoben, weil MVP weder Thumbnail, OCR, PDF-Rendering noch KI-Verarbeitung enthält.

## 9. Updated-at und geschützte Felder

`updated_at` ist sinnvoll für Konflikterkennung, Pending-Timeout und Reconciliation. Der vorhandene generische `set_updated_at()`-Trigger ist die klare Repository-Konvention und wird im Tabellenpaket wiederverwendet; explizite Serviceupdates wären uneinheitlich und umgehbar.

DB-seitig unveränderlich nach Erstellung: `id`, `project_id`, `storage_bucket`, `storage_path`, `stored_filename`, `mime_type`, `file_size_bytes`, `media_type`, `source`, `uploaded_by`, `created_at`. Nur der Orchestrator darf `upload_status` entlang erlaubter Übergänge ändern. Normale Admin-Metadatenupdates umfassen ausschließlich `category` und `caption`; ein späteres `sort_order` wäre separat. Dies verhindert Mass Assignment trotz breiter UPDATE-Rechte.

## 10. Storage-Pfad und Objektmodell

**Exakte MVP-Empfehlung:** `projects/{project_id}/originals/{media_id}/{stored_filename}`.

Segmente 2 und 4 sind kanonische UUIDs aus geprüften DB-Datensätzen; `stored_filename` ist eine weitere UUID plus kanonische Endung. Nicht enthalten sind Kunde, Adresse, Originalname, E-Mail, Telefon oder sonstige PII. Das zusätzliche Segment `originals` macht Varianten explizit und policiesicherer als `projects/{project_id}/{media_id}/{stored_filename}`.

Spätere, noch nicht freigegebene Namespaces:

- `projects/{project_id}/derivatives/{media_id}/{variant_id}.{extension}`;
- `projects/{project_id}/pages/{media_id}/{page_number}/{variant_id}.webp`.

Media-ID plus zufälliger gespeicherter Name und Unique-Pfad schützen vor Kollision; Upload nutzt niemals Overwrite. Soft Delete verändert den Pfad nicht. Reconciliation kann Projekt-ID und Media-ID syntaktisch extrahieren, muss aber anschließend die DB-Zuordnung prüfen. Purge behandelt Original und alle bekannten Derivate. Keine Policy darf allein aus einem gültig aussehenden Pfad Berechtigung folgern.

## 11. Bucket-Baseline `project-media`

- **Privat:** zwingend; Public Access und Public URLs verboten.
- **MIME-Allowlist:** JPEG, PNG, WebP, PDF als Bucket-Defense-in-Depth; aktuelle technische Unterstützung extern verifizieren.
- **Bucket-Dateigröße:** wenn technisch verlässlich, global 25 MB gemäß bestätigter Bytekonvention; Bildlimit zusätzlich Server/DB. Konkrete Anbietersemantik extern verifizieren.
- **Erstellung:** bevorzugt deklarativ in einer kleinen, idempotenten Migration, sofern die eingesetzte Supabase-Version die Storage-Schemaverwaltung offiziell unterstützt; andernfalls kontrolliertes, versioniertes Betriebsrunbook. Entscheidung vor AP-12-01-03 extern verifizieren.
- **Idempotenz:** vorhandenen Bucket nur bei exakt kompatibler privater Konfiguration akzeptieren; Drift nicht still überschreiben.
- **Grants/Eigentümer:** keine Eigentümermanipulation ohne offizielle Supabase-Vorgabe; `anon` keine Objektzugriffe, `authenticated` nur explizite Policies, Service Role nicht im normalen Apppfad.
- **Umgebungen:** getrennte Supabase-Projekte/Buckets pro Local, Preview und Production; niemals Production-Bucket für Preview. Gleiche logische ID ist bei getrennten Projekten möglich.
- **Rollout:** Bucket und Policies vor erstem Upload gemeinsam verifizieren; kein Zeitfenster mit Public Access.
- **Rollback:** Policies zunächst schließen; neue Uploads stoppen; Bucket mit Objekten nicht destruktiv löschen. Metadaten/Objekte erhalten und kontrolliert reconciliieren.

## 12. RLS-Spezifikation für `project_media`

RLS ist zwingend aktiviert. Jede Policy prüft `auth.uid()`, ein vorhandenes Profil über `current_app_role()`, das aktive Elternprojekt und die Medien-Projekt-Zuordnung.

| Operation/Rolle | Spezifikation |
|---|---|
| SELECT Admin/Reviewer | Nur Rollen `admin`/`reviewer`; Medium `deleted_at` NULL; zugeordnetes Projekt vorhanden und `deleted_at` NULL. `ready` für normalen Konsum; `pending`/`failed` nur Admin-Betriebsansicht über getrennten serverseitigen Pfad. |
| INSERT Admin | Actor authentifiziert und Admin; aktives Projekt; `uploaded_by = auth.uid()`; Bucket/Pfad/Quelle/Status/Defaults exakt serverbestimmt; `deleted_at` NULL. Reviewer und anon ausgeschlossen. |
| UPDATE Admin | USING: aktives Medium in aktivem Projekt und Admin. WITH CHECK wiederholt Rolle, Projekt, Zuordnung und erlaubten Zustand. DB-Guard/enge RPC verhindert geschützte Felder und illegale Statuswechsel. |
| UPDATE Reviewer | keine Policy. |
| DELETE alle normalen Rollen | keine Policy; physischer DELETE nicht über normale App-Rolle. |

Eine breite UPDATE-Policy allein verhindert kein Mass Assignment. Erforderlich sind explizite Servicepatches **und** DB-seitige Schutzlogik beziehungsweise funktionsgebundene Mutationen. `WITH CHECK` muss das aktive Projekt erneut prüfen; nur `USING` genügt nicht. Service Role umgeht RLS und darf nur in einem isolierten, erneut autorisierenden Betriebsprozess eingesetzt werden, nie als bequemer Benutzerpfad.

Geplante sprechende Policy-Namen: `project media read active`, `project media insert active admin` und `project media update active admin`. Es gibt bewusst keine Reviewer-Mutationspolicy und keine physische DELETE-Policy. Die Namen lehnen sich an `project notes read active` beziehungsweise die operationsbezogenen vorhandenen Policy-Namen an.

## 13. Storage-Policy-Spezifikation

| Operation | Admin | Reviewer | Zusätzliche Bedingungen |
|---|---|---|---|
| SELECT | ja | ja | privater Bucket; authentifiziertes aktives Profil; Pfad wird zu vorhandener `ready`, aktiver Medienzeile und aktivem Projekt aufgelöst; exakte Bucket-/Pfadübereinstimmung |
| INSERT | ja | nein | nur reserviertes `pending`-Medium des Actors, aktives Projekt, exakt reservierter Pfad, kein Overwrite |
| UPDATE | nein im normalen MVP | nein | Objektüberschreiben vermeiden; eine neue Datei erfordert neue Reservierung |
| DELETE | nein im normalen MVP | nein | ausschließlich späterer privilegierter Purgeprozess |

Bucket-ID und alle Pfadsegmente müssen exakt geprüft werden. Die Projekt-ID im Pfad wird gegen `project_media.project_id` und das aktive Projekt validiert; die Media-ID gegen die reservierte Zeile. Ein Objekt ohne DB-Zeile erhält keinen normalen SELECT. Ein DB-Datensatz ohne Objekt wird nicht `ready`.

Storage-Policies sind **nicht ausreichend**: Sie können Dateisignatur, fachliche Quoten, vollständige Zustandsübergänge, Caption-Allowlist, Cleanup oder Signed-URL-Ausgabe nicht allein sicher orchestrieren. Uploadreservierung, Inhaltsprüfung, Finalisierung und Downloadfreigabe benötigen serverseitige Orchestrierung. Direkter Browserupload kann später über eine eng begrenzte Signed-Upload-Freigabe erfolgen; die Autorisierung bleibt serverseitig.

Geplante Policy-Namen auf `storage.objects`: `project media objects read active` und `project media objects insert reserved admin`. UPDATE und DELETE bleiben ohne normale Policy. Vor der Implementierung ist anhand der dann aktuellen offiziellen Storage-Dokumentation zu verifizieren, welche Tabellen-/Funktionszugriffe Policies benötigen und ob dafür zusätzliche minimale Grants erforderlich sind; pauschale Grants auf fachliche Tabellen werden nicht empfohlen.

## 14. Transaktions- und Fehlergrenzen

PostgreSQL und Object Storage teilen keine atomare Transaktion.

### Empfohlener MVP-Ablauf: B – DB zuerst

1. Server authentifiziert Actor, lädt aktives Profil/Rolle und aktives Projekt, prüft Projektquote.
2. Server erkennt/validiert Inhalt, Größe und kanonischen MIME-Typ soweit vor dem Upload technisch möglich.
3. Server erzeugt Media-ID, gespeicherten Namen und Pfad und reserviert eine `pending`-Zeile mit unveränderlichen Metadaten.
4. Upload erfolgt exakt an den reservierten Pfad ohne Upsert. Für große Dateien kann ein kurzlebig signierter Upload genutzt werden, aber nur nach Reservierung.
5. Server beziehungsweise kontrollierter Finalizer prüft Objekt-Existenz, Größe, Typ und Pfad erneut.
6. Bedingtes Update von `pending` auf `ready`; nur danach ist normaler SELECT/Signed Download möglich.
7. Bei Uploadfehler wird `failed` gesetzt. Falls ein Objekt teilweise/vollständig existiert, wird ein idempotenter Cleanup-Auftrag erfasst; Fehlerdetails enthalten keine PII.
8. Retry erzeugt bevorzugt eine neue Reservierung; kein unkontrolliertes Overwrite. Reconciler findet alte `pending`-/`failed`-Zeilen und verwaiste Objekte, klassifiziert und bereinigt nach Retention.

**A – Storage zuerst** wird abgelehnt: INSERT-Policy und Autorisierung hätten keine fachliche DB-Reservierung; Orphans wären der Normalfall. **C – Signed Upload plus Finalisierung** ist ein Transportdetail und mit DB-zuerst kombinierbar; allein ist es kein Konsistenzmodell. Für MVP ist serverseitig orchestriertes DB-zuerst maßgeblich, mit signed Transport nur falls Plattformlimits dies erfordern.

Finalisierung muss idempotent sein: bereits `ready` plus identisches Objekt ist Erfolg; abweichendes Objekt ist Sicherheitsfehler. Timeout bedeutet nicht automatisch fehlgeschlagenen Upload und wird durch Reconciliation geklärt. Quoten brauchen konfliktfeste Durchsetzung im späteren Service-/DB-Paket.

## 15. Soft Delete

- Nur Admin darf soft-löschen; Reviewer nie.
- Das MVP erlaubt kein Restore. Ein gesetztes `deleted_at` darf nicht zurückgesetzt werden.
- Normaler SELECT, Signed-URL-Erzeugung und Storage-SELECT verlangen aktives Medium und aktives Projekt.
- Objekt und mögliche Derivate bleiben zunächst erhalten; `upload_status` bleibt historisch unverändert, statt zusätzlich `deleted` zu werden.
- Nach Soft Delete sind keine Caption-, Kategorie-, Sortier- oder Statusupdates durch normale Rollen erlaubt.
- Soft Delete verändert weder Kategorie, Caption noch eine spätere Sortierung.

**Empfehlung: kleine Admin-only `SECURITY DEFINER`-RPC statt freiem UPDATE von `deleted_at`.** Anders als eine normale Caption-/Kategorieänderung muss die Aktion atomar Actor, Adminrolle, aktives Projekt, exakte Projekt-Medien-Zuordnung, aktives Medium und fehlendes Restore prüfen. Das entspricht dem bewährten Notizprinzip, ist aber enger: Reviewer-Eigentum spielt keine Rolle. Die Funktion erhält nur Media-ID und Project-ID, setzt ausschließlich `deleted_at`, hat festen `search_path`, wird für Public revoked und nur für `authenticated` ausführbar. Tabellen-/Storage-Policies bleiben zusätzlich erforderlich. Die endgültige RPC-Entscheidung wird in einem separaten Paket reviewt.

## 16. Physischer Purge – spätere Architektur

Kein UI-Flow und keine normale Adminberechtigung. Nach extern festgelegter Aufbewahrungsfrist verarbeitet ein privilegierter, serverseitiger Worker oder kontrollierter manueller Betriebsjob ausschließlich soft-gelöschte Medien.

Empfohlene Reihenfolge: DB-Zeile sperren/als Purgeauftrag erfassen, Storageoriginal und bekannte Derivate idempotent löschen, Nichtvorhandensein verifizieren, erst danach DB-Datensatz physisch entfernen oder einen dauerhaften Purge-Nachweis behalten. **Storage zuerst** verhindert eine DB-lose, nicht mehr auffindbare Datei. Fehlendes Objekt gilt nach Abgleich als idempotenter Erfolg; fehlende DB-Zeile löst Reconciliation statt blindem Pfad-Delete aus.

Retries brauchen stabilen Jobschlüssel, Backoff und Dead-Letter/Betriebsalarm. Protokolliert werden IDs, Zustand, Zeit und neutraler Fehlercode, niemals Originalname, Inhalt oder Signed URL. Service Role ist nur in diesem isolierten Prozess vertretbar, serverseitig und mit eigener Eingabevalidierung; Alternativen sind eine eng begrenzte DB-Funktion plus Storage-Adminprozess. Cron, Edge Function oder manueller Job bleibt offen, bis Volumen/Betrieb geklärt sind. Backup-Löschung und Retention sind extern-rechtliche Gates; ein App-Purge beweist keine sofortige Backupentfernung.

## 17. Signed-URL-Modell

Ein serverseitiger Endpoint/Service:

1. authentifiziert die Session;
2. validiert aktives Profil und Rolle (`admin`/`reviewer`);
3. lädt Projekt und Medium anhand beider IDs;
4. verlangt aktives Projekt, aktives `ready`-Medium, korrekte Zuordnung, privaten Bucket und exakten gespeicherten Pfad;
5. erzeugt genau dann eine kurzlebige URL.

Die **konkrete TTL ist extern gegen aktuelle Supabase- und UX-Anforderungen zu verifizieren**; Audit-Empfehlung ist wenige Minuten, ohne hier einen verbindlichen Wert festzulegen. URL nie persistieren oder loggen; keine dauerhafte Cachefreigabe, keine Analytics-/Fehlerweitergabe. Abgelaufene URLs werden nach vollständiger erneuter Prüfung neu erzeugt.

Inline-Anzeige und Download sind getrennte Intents mit sicheren `Content-Disposition`-/Dateinamen. Bilder dürfen nur nach Inhaltsprüfung inline erscheinen. PDF-Inline-Anzeige benötigt vor Production ein eigenes Sicherheitskonzept (Sandboxing, aktive Inhalte, Header); bis dahin Download als konservativer Default. Cache-Control soll private/no-store-orientiert sein, ist aber mit tatsächlichem Storage-/CDN-Verhalten extern zu verifizieren. Bereits ausgegebene URLs können bis Ablauf wirken, weshalb kurze TTL entscheidend ist.

## 18. Caption, Sortierung, Checksum und JSON

### Caption

Sofort als nullable Textspalte, maximal 1.000 Zeichen, Leerwert zu NULL. Nur Admin, aktives Medium; keine HTML-Interpretation, keine Sicherheitsentscheidung und keine automatische KI-Nutzung. Ausgabe immer als Text/escaped, wodurch gespeicherte XSS-Payloads nicht aktiv werden dürfen.

### Sortierung

Später. Ohne Drag-and-drop-Anforderung genügt `created_at DESC, id`. Nullable oder Defaultwerte würden bereits Reorder-, Deduplizierungs- und Parallelitätsregeln erzwingen. Bei späterer Einführung: nichtnegative Werte, stabile Tie-Breaks und transaktionaler Reorder; keine unnötige Unique-Bedingung pro Projekt.

### Checksum

Später, vorzugsweise SHA-256 serverseitig oder in vertrauenswürdigem Worker berechnet und mit festem Algorithmus/Format. Browserhash allein ist untrusted und kostet Clientressourcen. Kein Unique Constraint: dieselbe Datei darf in verschiedenen oder bewusst mehrfach im selben Projekt vorkommen; Hash kann zudem als Korrelationsmerkmal wirken. Erst mit konkretem Reconciliation-/Deduplizierungsbedarf einführen.

### Metadata JSON

Kein allgemeines `metadata jsonb` im MVP. Es eröffnet Mass Assignment, Schema-Drift, unkontrollierte PII/EXIF/KI-Rohantworten und schwer prüfbare Limits. Konkrete spätere technische Werte erhalten bevorzugt typisierte Spalten; nur ein versioniertes, größenbegrenztes, servervalidiertes JSON-Schema rechtfertigt später JSONB.

## 19. Rollout und Rollback

### Reihenfolge

1. Tabelle, Constraints, FKs, Trigger/Schutz und minimale Indizes ohne Produktzugriff.
2. RLS aktivieren, Grants härten und Tabellen-Policies negativ validieren.
3. Privaten Bucket idempotent bereitstellen und Storage-Policies ausrollen; Public-Status verifizieren.
4. Soft-Delete-RPC separat ausrollen und Rechte prüfen.
5. Erst nach Production-/Preview-Verifikationsmatrix den späteren Service aktivieren.

Migrationen zuerst in lokaler/Preview-Umgebung, dann kontrolliert Production. Bucket-/Policy-Drift muss Deployment stoppen. Smoke Checks erfolgen mit echten Admin-, Reviewer- und anonymen Sessions sowie fremden/gelöschten IDs. Preview und Production verwenden getrennte Projekte und Objekte.

### Nichtdestruktiver Rollback

Bei Sicherheitsfehlern zuerst Upload/URL-Ausgabe deaktivieren und Policies deny-by-default schließen. Keine Tabelle und keinen nichtleeren Bucket droppen. Rückmigrationen entfernen höchstens neu gewährte Zugriffe/Funktionen, nicht Daten. Bereits hochgeladene Dateien werden inventarisiert und reconciled; DB-/Storage-Zuordnungen bleiben für Reparatur erhalten. Constraintlockerungen/-verschärfungen erfordern vorherige Datenprüfung. Production-Rollback ist durch manuelle Objekt-, Policy-, Grant- und Public-Access-Prüfung abzuschließen.

## 20. Manuelle Verifikationsmatrix für Folgepakete

| Actor/Zustand | SELECT | INSERT | Metadaten-UPDATE | Soft Delete | physischer DELETE / Storagemutation |
|---|---:|---:|---:|---:|---:|
| Admin, aktives Projekt/Medium | ja | ja | ja, nur Kategorie/Caption | ja per engem Pfad | nein |
| Reviewer, aktiv | ja | nein | nein | nein | nein |
| nicht authentifiziert | nein | nein | nein | nein | nein |
| soft-gelöschtes Projekt | nein | nein | nein | nein | nein |
| soft-gelöschtes Medium | nein; keine Signed URL | n/a | nein | idempotent neutral | nein |
| fremde Projekt-/Medienkombination | nein | nein | nein | nein | nein |

Zusätzlich manuell verifizieren:

- Bucket ist nicht public; Public URL und anonymer Objektzugriff scheitern.
- Reviewer kann weder direkten Tabellen- noch Storagepfad manipulieren.
- Admin kann nur exakt reservierten Pfad hochladen; fremde Projektpfade und Overwrite scheitern.
- `pending`/`failed` erhält keinen normalen Download; nur `ready`.
- Soft Delete sperrt neue Signed URLs sofort.
- Ein syntaktisch gültiger UUID-Pfad ohne passende aktive DB-Zeile bleibt unzugänglich.
- DB-ohne-Objekt, Objekt-ohne-DB, Timeout, Retry und parallele Uploads werden reconciled.
- Normale Rollen können weder Tabellenzeile noch Storageobjekt physisch löschen.
- Caption wird als Text, nicht HTML, dargestellt.

Diese Matrix ist Planung; in AP-12-01 wurden keine Tests ausgeführt.

## 21. Priorisiertes Risikoregister

### P0 – vor Implementierung/Production zu schließen

| Risiko | Gegenmaßnahme/Gate |
|---|---|
| öffentlicher/falsch konfigurierter Storage | privater Bucket, deny-by-default, Public-/Anon-Negativtest |
| RLS-/Storage-Policy-Lücke | gleiche DB-Wahrheit, getrennte Operationspolicies, negative Rollen-/Zuordnungstests |
| Pfad als alleinige Autorisierung | aktive Medienzeile, Projekt und Profil zwingend prüfen |
| MIME-Spoofing | serverseitige Signatur-/Strukturprüfung; erkannte MIME persistieren |
| DB-/Storage-Inkonsistenz | DB-zuerst, Zustände, idempotente Finalisierung/Cleanup/Reconciliation |
| unklarer Soft Delete/Purge | RPC-basierte Sperre und separater privilegierter Retention-Prozess |
| Tenant-Isolation | vor Multi-Tenant-Betrieb eigenes durchgängiges Tenant-Audit/-Modell |

### P1 – vor Production verbindlich entscheiden

- Produkt-, Plattform- und Bucket-Dateigrößenlimits einschließlich MB/MiB;
- konkrete Signed-URL-TTL, Cache-/Referrer-Verhalten und Rate Limits;
- sichere PDF-Inline-Darstellung;
- EXIF-Behandlung des Originals und der Derivate;
- verwaiste Dateien, Reconcilerbetrieb und Alarmierung;
- parallele Uploads, Projektquote und Retry-Idempotenz;
- Caption-XSS durch konsequente Textausgabe;
- nichtdestruktiver Migrationsrollback und Policy-Drift;
- rechtliche Retention und Backup-Löschung.

### P2 – bewusst verschoben

- benutzerdefinierte Sortierung;
- Checksums und Duplicate Detection;
- Vorschauen, PDF-Seiten und sonstige Derivate;
- zusätzliche strukturierte Metadaten.

## 22. Offene Entscheidungen mit Audit-Empfehlung

| Offener Punkt nach AP-12-00 | Audit-Empfehlung |
|---|---|
| Signed-URL-TTL | wenige Minuten; exakten Wert in Anbieter-/UX-Prüfung festlegen |
| Bucket-Dateigrößenlimit | globales verifiziertes 25-MB-Maximum, sofern technisch zuverlässig; MIME-Limits zusätzlich Server/DB |
| Caption | sofort als nullable, begrenzter Text |
| Sortierung | später |
| Checksum | später, erst bei Reconciliation-/Deduplizierungsbedarf |
| Processing-Status | später, weil keine MVP-Verarbeitung existiert |
| Soft Delete | eigene enge Admin-RPC statt frei patchbarem `deleted_at` |
| Bucket-Erstellung | bevorzugt idempotente Migration, aber offizielle Support-/Ownership-Vorgaben extern verifizieren; sonst kontrolliertes Runbook |
| Purge-Ausführung | zunächst kontrollierter manueller Betriebsjob; Cron/Edge Worker erst mit Volumen und Monitoring |
| Preview/Development | getrennte Supabase-Projekte mit jeweils privatem gleichnamigem Bucket; nie Production teilen |
| EXIF Original | unverändertes Original bis zur externen Datenschutzentscheidung; keine Extraktion/Nutzung/Weitergabe |
| PDF Inline | bis Sicherheitsprüfung Download als Default |

## 23. Kleine, separat reviewbare Folgepakete

1. **AP-12-01-01 – Tabelle, Constraints, FKs und minimale Indizes:** nur `project_media`, generischer Updated-at-Trigger und Schutz unveränderlicher Felder; Migration plus DB-Verifikation.
2. **AP-12-01-02 – Tabellen-RLS und Grants:** RLS-Aktivierung, SELECT/INSERT/UPDATE-Spezifikationen, kein DELETE; Rollen-/Aktiv-/Zuordnungsmatrix.
3. **AP-12-01-03 – Privater Bucket und Storage-Policies:** nach offizieller Anbieterprüfung; idempotente Baseline und vier getrennt geprüfte Operationen.
4. **AP-12-01-04 – Soft-Delete-RPC:** kleine Admin-only Funktion, Revokes/Grant und negative Restore-/Reviewerprüfungen.
5. **AP-12-01-05 – Production-/Umgebungsvalidierung:** Grants, Public-Status, Policy-Drift, Preview/Production, Rollback-Smoke-Matrix.
6. **AP-12-02 – Upload-/Download-Orchestrierung:** erst danach; DB-Reservierung, Inhaltsprüfung, Finalisierung, Signed URLs, Retry und Reconciliation ohne UI.

**Klare Empfehlung für das erste Implementierungspaket:** ausschließlich AP-12-01-01. Es darf weder Bucket noch Storage-Policy, Uploadservice oder UI enthalten. Vor Start müssen Bytekonvention und die Frage geklärt sein, ob der typabhängige Größen-CHECK bereits mit den extern verifizierten Produktlimits festgeschrieben werden kann.

## 24. Audit-Abschluss und Scope-Bestätigung

Dieses Audit hat ausschließlich die Datenmodell- und Storage-Baseline geplant. Es enthält und veranlasst keine Anwendungscodeänderung, UI, Komponente, Server Action, Service, Test oder Testausführung, Migration, ausführbares SQL, RLS-Implementierung, Trigger-Implementierung, Storage-Bucket, Storage-Policy oder `package.json`-Änderung. Bestehende Audit-/Decision-Dateien wurden nicht geändert.

**Status: DRAFT – NICHT ZUR IMPLEMENTIERUNG FREIGEGEBEN**

## AP-12-01-01 Implementation Result

- **Migration:** `supabase/migrations/202607270001_project_media_table_baseline.sql` erstellt `public.project_media` mit exakt den 16 freigegebenen Pflichtspalten und der nullable `caption`; `customer_id`, Sortierung, Checksummen, Metadaten sowie Verarbeitungs-, KI- und WhatsApp-Felder fehlen bewusst.
- **Integrität:** Benannte Constraints begrenzen Bucket, Kategorien, Quelle, Uploadstatus, Medien- und MIME-Typen, deren Konsistenz, positive und MIME-abhängige dezimale Dateigrößenlimits, Original- und gespeicherte Dateinamen, MIME/Endung, den aus Projekt-ID, Medien-ID und gespeichertem Dateinamen gebildeten Storagepfad, dessen Eindeutigkeit sowie die Caption-Länge.
- **Beziehungen und Index:** Benannte Foreign Keys auf `public.projects(id)` und `auth.users(id)` verwenden jeweils `ON DELETE RESTRICT`. Der einzige zusätzliche Index ist `project_media_active_project_created_idx` auf `(project_id, created_at DESC, id) WHERE deleted_at IS NULL`; die Bucket-/Pfad-Eindeutigkeit wird durch den Unique Constraint getragen.
- **Zeitstempel und Feldschutz:** Der vorhandene generische `public.set_updated_at()`-Mechanismus wird über `project_media_updated` wiederverwendet. Ein tabellenspezifischer Guard schützt Identitäts-, Storage-, Datei-, Herkunfts- und Erstellungsfelder sowie vorerst `deleted_at`. Er erlaubt beim Uploadstatus nur `pending → ready` oder `pending → failed`; `ready` und `failed` sind terminal.
- **RLS und Grants:** RLS ist als sichere Zwischenstufe bereits ohne fachliche Policies aktiviert. Alle Tabellenrechte für `anon` und `authenticated` sind widerrufen; AP-12-01-02 ergänzt später ausschließlich die geprüften Anwendungspolicies und -grants. Es gibt keine normale physische DELETE-Policy und keine breit offene Policy.
- **Bewusst verschoben:** Bucket und Storage-Policies, Soft-Delete-RPC und Restore, Upload-/Downloadorchestrierung, Signed URLs, Services, Actions, UI, Kategorienverwaltung, KI und WhatsApp bleiben außerhalb dieses Pakets. Die Bucket-ID ist nur Metadatum, und der Storagepfad begründet keine Autorisierung.
- **Tests:** `test/project-media-migration.test.ts` prüft statisch Spalten und Ausschlüsse, Defaults, Schlüssel, Allowlist- und Konsistenzconstraints, Dateigrenzen, Pfad-/Dateinamenschutz, Trigger, Feld- und Statusschutz, Minimalindex sowie den deny-by-default Zustand ohne fachliche oder Storage-Policies. Abschlusslauf: Build erfolgreich; 20 Vitest-Dateien mit 238 Tests erfolgreich; Typecheck und Lint erfolgreich.

## AP-12-01-02 Implementation Result

- **Migration:** `supabase/migrations/202607270002_project_media_rls_and_grants.sql` bestätigt RLS für `public.project_media` und ergänzt ausschließlich die Tabellenrechte und fachlichen Policies dieses Arbeitspakets.
- **Grants und Revokes:** `PUBLIC`, `anon` und `authenticated` werden zunächst sämtliche Tabellenrechte entzogen. `authenticated` erhält anschließend nur `SELECT`, `INSERT` und spaltenbezogenes `UPDATE` auf `category`, `caption` und `upload_status`; UUID-Primärschlüssel benötigen keine Sequenzrechte. `DELETE`, `TRUNCATE`, `REFERENCES`, `TRIGGER` und `ALL PRIVILEGES` werden nicht gewährt.
- **SELECT:** `project media select active admin` und `project media select active reviewer` verlangen Auth-Session, vorhandenes Rollenprofil über `current_app_role()`, aktives Projekt, aktives Medium und `upload_status = 'ready'`. Pending-/Failed-Betriebsabfragen bleiben einem später auditierten serverseitigen Pfad vorbehalten.
- **INSERT:** `project media insert active admin` erlaubt ausschließlich Admin-Reservierungen in aktiven Projekten mit `uploaded_by = auth.uid()`, `deleted_at IS NULL`, Bucket `project-media`, Quelle `manual_upload` und Status `pending`; Tabellenconstraints bleiben zusätzliche Defense in Depth.
- **UPDATE:** `project media update active admin` prüft vor und nach dem Update Adminrolle, aktives Projekt und aktives Medium. Der Spaltengrant begrenzt Patches auf Kategorie, Caption und Uploadstatus; der bestehende Guard schützt unveränderliche Felder, `deleted_at` und die ausschließlich erlaubten Übergänge `pending → ready/failed`.
- **Abgrenzung:** Reviewer besitzen keinerlei Mutation, `anon` keinerlei Zugriff und normale Rollen weder eine DELETE-Policy noch ein direktes Soft Delete. Die enge Soft-Delete-RPC folgt erst in AP-12-01-04. `service_role` umgeht RLS und ist ausdrücklich kein Browser- oder normaler Anwendungspfad.
- **Bewusst verschoben:** Es wurden kein Bucket, keine `storage.objects`- oder sonstige Storage-Policy, keine Upload-/Downloadorchestrierung und keine Signed-URL-, Service- oder UI-Logik ergänzt.
- **Tests:** Die statischen Migrationstests prüfen RLS-Zustand, Least-Privilege-Grants, Rollen-/Profil-, Projekt-, Medien- und Statusbedingungen aller Policies sowie das Fehlen von Reviewer-Mutationen, DELETE, offenen Policies, Storage-Objekten, Buckets und RPCs. Abschlussprüfung: Build, Vitest, Typecheck, Lint und `git diff --check` erfolgreich.

## AP-12-01-03 Implementation Result

- **Migration und Bucket:** `supabase/migrations/202607270003_project_media_bucket_and_storage_policies.sql` legt `project-media` idempotent als privaten Bucket an beziehungsweise bestätigt gezielt dessen erwartete Konfiguration. `public` bleibt `false`; die exakte MIME-Allowlist ist JPEG, PNG, WebP und PDF. Das von der vorhandenen Supabase-Bucketstruktur unterstützte globale Limit ist auf `25_000_000` Bytes gesetzt. Die engere Bildgrenze bleibt zusätzlich Tabellenconstraint und Aufgabe der späteren Servervalidierung; die Allowlist ersetzt keine Magic-Byte-/Inhaltsprüfung.
- **Storage-INSERT:** `project media storage insert active admin` gilt nur für `authenticated`, eine vorhandene Auth-Session und die Adminrolle. Der enge `SECURITY DEFINER`-Helper `can_insert_project_media_storage_object` ist erforderlich, weil normale Tabellen-SELECT-Policies `pending`-Reservierungen absichtlich verbergen. Er verlangt die vorab bestehende aktive `pending`-Zeile, `uploaded_by = auth.uid()`, den exakten Bucket-/Pfadabgleich und ein aktives Elternprojekt. Ein freier syntaktisch korrekter Pfad reicht nicht aus.
- **Storage-SELECT:** `project media storage select active admin` und `project media storage select active reviewer` erlauben der jeweiligen authentifizierten Profilrolle nur exakt zugeordnete, aktive `ready`-Medien aktiver Projekte. Pending-, failed-, soft-gelöschte und nicht reservierte Objekte bleiben im normalen Pfad unsichtbar; Reviewer sind nicht auf `uploaded_by` eingeschränkt.
- **Least Privilege:** Vor der gezielten Freigabe werden Objektprivilegien für `PUBLIC`, `anon` und `authenticated` entzogen; `authenticated` erhält ausschließlich `SELECT` und `INSERT` auf `storage.objects`. Es existieren keine Storage-UPDATE- oder Storage-DELETE-Policy und keine entsprechenden Grants. `service_role` umgeht RLS, ist kein normaler Benutzerpfad, darf nie im Browser liegen und benötigt keine zusätzliche Policy.
- **Bewusst verschoben:** Dieses Paket enthält keine Upload-/Downloadorchestrierung und keine Signed-URL-Erzeugung. Eine spätere serverseitige Zugriffserteilung muss Authentifizierung, Rolle, aktives Projekt, aktives `ready`-Medium und den exakten Bucket-/Pfadabgleich erneut prüfen. Finalisierung folgt in AP-12-02; Teilfehler, fehlgeschlagene Uploads und verwaiste Objekte benötigen später Cleanup/Reconciliation.
- **Tests:** Die statischen Migrationstests decken private und idempotente Bucketkonfiguration, exakte MIME- und Größenlimits, Least-Privilege-Grants, alle drei Operationspolicies, DB-Reservierung, Rollen-, Actor-, Status-, Soft-Delete-, Projekt- und Pfadbedingungen sowie das Fehlen anonymer, öffentlicher, offener, UPDATE-/DELETE- und sonstiger scopefremder Storagepfade ab. Die Production- und echte Uploadvalidierung bleiben separate Gates; der Auditstatus wird dadurch nicht pauschal auf Production-ready gesetzt.

## AP-12-01-04 Implementation Result

- **Migration und RPC:** `supabase/migrations/202607270004_project_media_soft_delete_rpc.sql` ergänzt `public.soft_delete_project_media(target_media_id uuid, target_project_id uuid) returns boolean` als `SECURITY DEFINER` mit festem `search_path = public, pg_temp` und vollständig qualifizierten Tabellenreferenzen.
- **Rollenmatrix:** Eine vorhandene Auth-Session (`auth.uid()`) und die zentrale Rolle `public.current_app_role() = 'admin'` sind zwingend. Reviewer, anonyme Aufrufer sowie fehlende oder inaktive Profile erhalten keine Ausnahme und kein erfolgreiches Soft Delete.
- **Projekt-, Medien- und Statusprüfung:** Beide UUID-Parameter müssen gesetzt sein. Der finale UPDATE-Filter koppelt Medien-ID und Projekt-ID ausdrücklich, verlangt ein aktives Medium im abgeschlossenen Status `ready` und prüft per `EXISTS` dasselbe aktive Elternprojekt. `pending` und `failed` bleiben späterer Reconciliation beziehungsweise einem privilegierten Betriebsprozess vorbehalten.
- **Idempotenz und Race Conditions:** Bereits gelöschte, fremd zugeordnete, nicht bereite oder zu einem gelöschten Projekt gehörende Medien werden nicht aktualisiert; die RPC gibt `false` zurück. Alle Bedingungen stehen in der finalen Datenbankoperation, und der boolesche Rückgabewert wird aus deren tatsächlicher Zeilenanzahl abgeleitet.
- **Enges Update und Feldschutz:** Die RPC setzt ausschließlich `deleted_at = statement_timestamp()`. Der Feldschutz behält alle unveränderlichen Felder und Statusübergänge bei, blockiert jede Änderung einer bereits gelöschten Zeile und damit Restore. Der normale `authenticated`-Pfad besitzt weiterhin keinen `UPDATE(deleted_at)`-Grant; nur die eng autorisierte Definer-RPC kann den Übergang von aktiv zu gelöscht ausführen.
- **EXECUTE-Rechte:** EXECUTE wird zunächst `PUBLIC`, `anon` und `authenticated` entzogen und anschließend ausschließlich `authenticated` gewährt. Eigentümer-/`postgres`- und plattforminterne `service_role`-Fähigkeiten sind keine normalen Benutzer- oder Browserpfade; Tabellenrechte wurden nicht erweitert.
- **Storage-Auswirkung und Abgrenzung:** Die RPC verändert `storage.objects` nicht und führt keinen physischen Purge aus. Das Objekt bleibt bestehen, verliert aber automatisch den normalen Lesezugriff, weil die unveränderten Storage-SELECT-Policies ein zugeordnetes `ready`-Medium mit `project_media.deleted_at IS NULL` verlangen. Restore, Storage-Delete, Reconciliation und Signed URLs wurden nicht implementiert.
- **Tests:** Die statischen Migrationstests prüfen Signatur, Boolean-Rückgabe, Definer/search_path, Authentifizierung, Admin-only-Rolle, aktive Projekt-/Medienzuordnung, `ready`, das einzelne Updatefeld, Idempotenz/Zeilenanzahl, Restore- und Direktänderungsschutz, Revokes/Grant sowie das Fehlen physischer Deletes, Storage-Mutationen, neuer Grants und Policies. Der Abschlusslauf war für Build, 20 Vitest-Dateien mit 256 Tests, Typecheck, Lint und Diff-Prüfung erfolgreich; dies setzt den Auditstatus nicht pauschal auf Production-ready.
