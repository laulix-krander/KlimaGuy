# AP-13-00 — Project Media Gallery Architecture Audit

**Audit-ID:** `KG-AUDIT-2026-07-30-AP13-00-PROJECT-MEDIA-GALLERY-V1`  
**Datum:** 2026-07-30  
**Branch:** `codex/audit-ap13-00-project-media-gallery`  
**Art:** Architektur-, Security- und UX-Audit; ausschließlich Analyse und Dokumentation  
**Auditstatus:** **READY FOR OWNER DECISION**

## 1. Executive Summary

AP-12 Core Media Lifecycle ist Production-validiert: Upload Reservation, Upload Ticket, Direct Browser Upload und Finalisierung sowie Read-only Orphan Inventory, Claim, Soft Delete und der kontrollierte Einzelpurge wurden validiert. Die Admin-Navigation ist implementiert. Projektmedien können auf der Projektdetailseite hochgeladen werden, aber aktive Medien werden dort noch nicht als normale Galerie oder Liste angezeigt.

Das kleinste sichere Folgepaket ist **AP-13-01 — Read-only Project Media Gallery**. Empfohlen wird eine servergerenderte, projektspezifische Galerie mit einem dedizierten read-only Service, dem vorhandenen cookiegebundenen Supabase-Serverclient und den bestehenden RLS-Regeln. Sie lädt ausschließlich aktive `ready`-Medien eines bereits als aktiv bestätigten Projekts, sortiert mit `created_at DESC, id DESC` und begrenzt auf 50. Admin und Reviewer dürfen sehen; nur Admin darf in späteren Paketen mutieren. Eine neue RPC, Migration oder RLS-Änderung ist für diese Leseliste nicht erforderlich.

Für das MVP wird die in der installierten Storage-Bibliothek vorhandene Batch-API `createSignedUrls(paths, expiresIn)` als kleinste Strategie empfohlen: einmal je begrenzter Galerieabfrage, ausschließlich serverseitig, mit aus der Datenbank stammenden Pfaden und **120 Sekunden TTL**. Das ist eine technische Audit-Empfehlung; die TTL und weitere UX-Fragen bleiben ausdrückliche Owner-Entscheidungen. Die URLs werden weder persistiert noch geloggt. Wegen kurzlebiger URLs und fehlender Thumbnail-Pipeline werden normale responsive `<img>`-Elemente mit reservierter Bildfläche, `object-fit: cover`, nativem Lazy Loading und Kartenfallback empfohlen, nicht der Next.js-Image-Optimierungsproxy.

PDFs erhalten ausschließlich neutrale Dokumentkarten; es gibt kein Seitenrendering, keinen `iframe`, kein PDF.js, OCR oder Thumbnail. Ein Medium wird über eine kurzlebige View-URL angesehen, voraussichtlich in einem neuen Tab. Download-Disposition, eigener Downloadbutton und Lightbox bleiben Folgepakete.

## 2. Baseline, Remote-Status und Methode

- Vor Arbeitsbeginn war der Checkout sauber: `git status --short --branch` zeigte nur `## work`.
- Lokale Baseline und Ausgangs-HEAD: `c8c1ee1771ba0861673531d63540a8c0c0cde578`.
- Im Checkout ist **kein Git-Remote konfiguriert**; `git remote -v` blieb leer. Daher waren `git fetch origin`, `git rev-parse origin/main` und `git merge-base HEAD origin/main` nicht möglich.
- Gemäß Auftrag wird der saubere lokale HEAD als Baseline verwendet. Ob dieser Stand exakt einem externen aktuellen `main` entspricht, konnte ohne Remote nicht verifiziert werden und bleibt eine dokumentierte Einschränkung.
- Vollständig gelesen wurden die acht verbindlichen Audits zu AP-12 Core, Admin-Navigation, Production-Validierung, HTTP-500, Upload-Orchestrierung, Daten-/Storage-Baseline, Media-Domain-Freeze und der Projektmedien-/KI-Architektur.
- Vollständig statisch geprüft wurden Projektdetailseite und Uploadformular, Reservierungs-, Ticket- und Finalisierungsgrenzen, Domain-Permissions/-Mapper/-Schemas, Supabase-Server- und Browserclient, alle neun `project_media`-Migrationen, alle Projektmedien-Tests sowie bestehende Layout-, Card-, Grid-, Button-, Link-, Navigation-, Feedback- und responsive Muster.
- Die installierten Quellen von `@supabase/storage-js` wurden für die Signed-URL-API geprüft. Es wurde nicht anhand einer vermuteten API geplant.

## 3. Verbindliche Ausgangslage und Negativbestand

### 3.1 Bestätigter Stand

- **AP-12 CORE COMPLETED.** Der Core-Medien-Lifecycle ist Production-validiert.
- Reservation, kurzlebiges Uploadticket, direkter Browser-zu-Storage-Upload und atomare Finalisierung auf `ready` sind validiert.
- Read-only Orphan Inventory, einzelner Claim, Soft Delete und kontrollierter Einzelpurge sind validiert.
- Die rollenabhängige Admin-Navigation zur Medien-Inventur ist implementiert.
- Die Projektdetailseite ist eine dynamische Server Component. Sie validiert die Projekt-UUID, lädt nur ein aktives Projekt, ermittelt serverseitig Session/Profil/Rolle und zeigt Admins den vorhandenen Uploadbereich.
- Der Browser nutzt für den direkten Upload den Anon-Key plus Benutzersession, niemals einen Service-Role-Key.

### 3.2 Noch nicht vorhanden

- **PROJECT MEDIA GALLERY NOT IMPLEMENTED.** Es gibt keine aktive Medienliste und keine normale Galerie auf `/projects/{project_id}`.
- Es gibt keine Signed View- oder Signed Download URLs, keine Public URLs, keine Lightbox und keine PDF-Vorschau.
- Es gibt kein `sort_order`, keine Galerie-Sortierfunktion, keine Caption-Bearbeitung, keine Kategorieänderung in der Galerie und keine Drag-&-Drop-Verwaltung.
- Es gibt keine Thumbnail-/Derivatpipeline, Mehrfachauswahl, Favoriten, Batchaktionen, EXIF-Anzeige, OCR oder PDF-Seitenrendering.
- Es gibt keine KI-Analyse und keine WhatsApp-Medienintegration.
- Repositoryweit besteht keine fertige allgemeine Bild-/Dokumentdarstellung und keine Lightbox-/Dialogarchitektur. Eine externe Icon-Bibliothek ist nicht installiert; die aktuelle UI nutzt Text, Cards und Badges statt eines zentralen Icon-Systems.
- Es gibt keine globale Skeleton-Lösung oder projektspezifische `loading.tsx`.
- **OVERALL PRODUCT NOT PRODUCTION READY.** Die AP-12-Core-Validierung ist keine Freigabe des Gesamtprodukts oder dieser noch nicht implementierten Galerie.

Dieses Audit enthält bewusst keine konkreten Production-IDs, Objektpfade, Dateinamen, Tokens oder personenbezogenen Daten.

## 4. Ist-Architektur und UI-Befund

### 4.1 Projektseite, Layout und Navigation

Das gemeinsame `(app)`-Layout rendert die Navigation und danach ein `<main>` mit `max-w-6xl`, horizontal `px-4` und vertikal `py-8`. Die Projektdetailseite nutzt `space-y-6`; die Inhaltsbreite ist daher für ein Grid mit drei normalen Desktopspalten geeignet. Vier Spalten sind nur bei breiter tatsächlich verfügbarer Fläche sinnvoll, nicht als erzwungener Standard.

Die Projektseite zeigt nacheinander Erfolgsfeedback, Titel, Projektstammdaten, den Admin-only Upload-Card und interne Notizen. Reviewer erhalten derzeit keinen Upload-Card. Es gibt auf der Detailseite keinen Breadcrumb. Die globale Navigation verlinkt Dashboard, Kunden, Projekte und für Admins die Medien-Inventur; das ist kein Ersatz für die serverseitige Galerieautorisierung.

### 4.2 Wiederverwendbare visuelle Muster

- `Card`: weißer Hintergrund, Border, `rounded-xl`, `p-6`, kleiner Schatten.
- `Badge`: pillenförmige textliche Kennzeichnung mit neutralem, Warn- oder Erfolgston.
- Grid: bestehende Seiten wechseln typischerweise ab `md` auf zwei oder drei Spalten; Mobile bleibt einspaltig.
- Buttons und Links: teal als Primärfarbe, sichtbarer Text; Fokuszustände sind für die Galerie ausdrücklich zu ergänzen beziehungsweise zu verifizieren.
- Empty States: kurze deutsche Texte, teils in gestrichelten Karten.
- Fehler/Erfolg: rote beziehungsweise grüne neutrale Boxen mit `role="alert"` beziehungsweise `role="status"`.
- Datum wird mehrfach lokal mit `Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeStyle: "short" })` formatiert. Bytes werden nur in der Admin-Inventur lokal mit `Intl.NumberFormat` formatiert. Ein zentraler allgemeiner Datum-/Dateigrößen-Formatter existiert nicht; AP-13-01 soll einen kleinen gemeinsamen Formatter schaffen oder einen bereits bis dahin zentralisierten Formatter wiederverwenden, statt weitere Seitenduplikate einzuführen.

## 5. MVP-Scope und Rollenmatrix

### 5.1 Verbindlicher Scope für AP-13-01

- aktive `ready`-Medien genau eines aktiven Projekts;
- Admin und Reviewer sehen vorhandene aktive Medien;
- responsive Medienübersicht;
- JPEG, PNG und WebP als Bildkarten; PDF als neutrale Dokumentkarte;
- Kategorie, optionale Caption, Dateityp, Dateigröße und Uploadzeit;
- sicheres Ansehen über private Speicherung und kurzlebige autorisierte URL;
- feste serverseitige Sortierung und ein hartes Limit von 50;
- keine Mutationen.

### 5.2 Rollen und Defense in Depth

| Actor | Liste/Ansehen | Mutation in AP-13-01 | Spätere Mutation |
| --- | --- | --- | --- |
| Admin | ja, nur aktives Projekt und aktive `ready`-Medien | nein | nach separatem Audit möglich |
| Reviewer | ja, dieselbe technische Anzeigegrenze | nein | Kategorie, Caption, Delete und Sortierung ausdrücklich nein |
| `anon` | nein | nein | nein |
| nicht authentifiziert | nein | nein | nein |

Die Seite und der Service bleiben serverseitig geschützt; Client-Gating ist nur UX. Fehlende Session, fehlendes/ungültiges Profil, inaktives Projekt oder unzulässige Rolle müssen fail closed enden. Projekt- und Medien-ID werden gemeinsam gebunden. Ein Link oder eine vorhandene Storage-URL ist keine Autorisierung.

Aktuell existiert keine `canViewProjectMedia`-Permission. `canReserveProjectMediaUpload` und die Orphan-Permissions sind Admin-only und semantisch ungeeignet. AP-13-01 sollte daher die neue zentrale, sprechende Permission `canViewProjectMedia(role)` für `admin | reviewer` einführen und mit Permissiontests absichern. Sie ersetzt weder Tabellen-RLS noch Storage-RLS. Dieses Audit ergänzt sie nicht.

## 6. Datenquelle, RLS und Queryvertrag

### 6.1 Bestehende Tabellen- und Storage-Grenzen

`public.project_media` besitzt bereits die benötigten Felder und einen partiellen Index auf `(project_id, created_at DESC, id)` für nicht gelöschte Medien. Die getrennten SELECT-Policies für Admin und Reviewer verlangen jeweils:

- authentifizierte Session;
- zentrale, gültige Profilrolle;
- `project_media.deleted_at IS NULL`;
- `project_media.upload_status = 'ready'`;
- ein zugeordnetes Projekt mit `projects.deleted_at IS NULL`.

Die Storage-SELECT-Policies spiegeln diese Grenze für den privaten Bucket und die exakte Datenbankzuordnung von Bucket/Pfad zu aktivem `ready`-Medium eines aktiven Projekts. `authenticated` besitzt `SELECT` auf Tabelle und Storageobjekten; `anon` besitzt keinen Zugriff. Reviewer haben keine Tabellenmutation. Admin-Tabellenupdates sind spaltenbegrenzt, aber gehören nicht in AP-13-01. Normale Rollen besitzen keinen physischen Storage-DELETE-Pfad.

### 6.2 Empfohlene Datenquelle

Eine direkte, **serverseitige** Tabellenabfrage auf `public.project_media` ist unter der Benutzersession sicher möglich, weil RLS bereits die Rollen-, Projektstatus-, Medienstatus- und Soft-Delete-Grenzen erzwingt. Trotzdem wird ein dedizierter read-only `Project-Media-Gallery-Service` empfohlen, nicht eine lange Inline-Query in der Page:

1. Eingabe mit `projectIdSchema` validieren.
2. Benutzer, Profil und Rolle serverseitig laden und `canViewProjectMedia` prüfen.
3. Aktives Projekt bestätigen; die Seite tut dies bereits, der Service soll jedoch nicht allein auf UI-Vorprüfung vertrauen.
4. Explizite Spaltenauswahl aus `project_media` mit `.eq("project_id", projectId)`, `.eq("upload_status", "ready")`, `.is("deleted_at", null)`, `.order("created_at", { ascending: false })`, zweitem stabilen `.order("id", { ascending: false })` und `.limit(50)`.
5. Jede Zeile gegen ein schmales externes Zod-Row-Schema validieren und in das Galerie-DTO mappen.

Die expliziten Filter sind trotz RLS notwendig: Least Data, lesbarer Fachvertrag, Indexnutzung und Schutz vor einer späteren Policyänderung. Es darf keine allgemeine, generische Medienquery und keine direkte clientseitige Tabellenabfrage geben. Eine Repository-Abstraktion oder generische Medienrepository-Schicht wäre für diesen einen Read-Use-Case unnötig.

**Keine neue RPC ist erforderlich.** Die vorhandene RLS genügt für den normalen Read-Pfad. Die bestehenden Orphan-/Pending-RPCs sind absichtlich enger Betriebs-/Uploadscope und dürfen nicht wiederverwendet oder erweitert werden. Es ist keine Migration und keine Policylockerung zu empfehlen.

## 7. DTO- und Validierungsgrenze

### 7.1 Basis-DTO

Empfohlenes schmales, serverseitig gemapptes Galerie-DTO:

```text
media_id
project_id
category
category_label
media_type
mime_type
file_size_bytes
caption
created_at
display_kind = image | pdf
```

`category_label` stammt ausschließlich aus `PROJECT_MEDIA_CATEGORY_LABELS`, `display_kind` aus der kontrollierten MIME-/Medientyp-Kombination. `caption` bleibt `string | null`. DB-/Providerwerte werden vor Ausgabe mit Zod validiert; unbekannte Kategorie, MIME oder inkonsistente Kombination failen kontrolliert statt mit einem freien Fallback sicherheitsrelevant umgedeutet zu werden.

### 7.2 URL-Hülle

Basis-Metadaten und URL-Erzeugung sollen logisch getrennt bleiben. Der interne Service darf für den Storage-Aufruf zusätzlich Bucket/Pfad halten, aber diese Felder nicht in das UI-DTO mappen. Nach erfolgreicher Autorisierung kann eine flüchtige View-Hülle `signed_view_url` und optional `signed_url_expires_at` an die konkrete servergerenderte Karte geben. `signed_url_expires_at` ist nur nötig, wenn eine kleine Clientinteraktion Ablauf/Erneuerung wirklich braucht; für reines SSR soll es entfallen.

Nicht ausgeben: `storage_bucket`, `storage_path`, `original_filename`, `stored_filename`, `uploaded_by`, `deleted_at`, nicht UI-relevanter `upload_status`, Kundenfelder, Auth-/Upload-/View-Tokens, Service-Role-Key, rohe Storageantworten oder Providerfehler. Originaldateinamen sind insbesondere weder Titel noch Alt-Text.

## 8. Signed-URL-Strategien und API-Prüfung

### 8.1 Verifizierte installierte API

Installiert ist `@supabase/storage-js` 2.111.0. Die lokalen offiziellen Typen/Quellen bieten:

- `createSignedUrl(path, expiresIn, { download?, transform?, cacheNonce? })`;
- `createSignedUrls(paths, expiresIn, { download?, cacheNonce? })`.

Beide verlangen laut eingebetteter Dokumentation Storage-`SELECT`; die Batchantwort liefert pro Pfad `signedUrl` oder einen Einzelfehler. Die Batchmethode unterstützt in der installierten Signatur keine Transformoption. `download` ist optional; für AP-13-01 wird es nicht gesetzt, weil Ansehen und Download getrennte Fachvorgänge sind.

### 8.2 Variante A — Einzel-URL je sichtbarem Medium beim Seitenrequest

**Vorteile:** sehr einfache Zuordnung und individuelles Fehlerhandling; Transformoption der Einzel-API wäre technisch vorhanden.  
**Nachteile:** bis zu 50 zusätzliche sequenzielle oder parallele Storage-Aufrufe, N+1-Latenz, Lastspitzen und schwereres Teilfehlerhandling. Bei serieller Erzeugung ist ein relevanter Teil der TTL vor dem Rendern verbraucht. Parallele Erzeugung reduziert Ladezeit, erzeugt aber Burstlast. Jede URL bleibt Bearer-Zugriff bis Ablauf; Seiten-/Framework-Caching darf sie nicht überleben.  
**Bewertung:** sicher möglich, aber nicht die kleinste performante Wahl für bis zu 50 Karten.

### 8.3 Variante B — Liste ohne URLs, URL pro Medium bei Bedarf

**Vorteile:** kleinste Exposition, PDFs und nicht sichtbare Medien erhalten erst bei Klick eine URL; Ablauf beginnt nahe an der Nutzung; gute Basis für spätere Lightbox oder Downloadtrennung.  
**Nachteile:** Bildvorschauen benötigen dennoch pro sichtbarem Bild einen autorisierten Request; zusätzliche Action/Route, Clientzustand, Lade- und Fehlerfeedback pro Karte; Klick kann durch Popupblocker/zweistufiges Öffnen erschwert werden. Ohne Thumbnailquelle kann echtes Lazy Loading nicht gleichzeitig ohne URL und ohne Zusatzarchitektur erfolgen.  
**Bewertung:** besonders für PDFs und spätere Detailansichten datensparsam, aber für die geforderte direkte Bildvorschau im kleinsten Paket komplexer.

### 8.4 Variante C — Batch-Signed-URLs

**Vorteile:** offiziell in der installierten API vorhanden; ein Storage-Aufruf für die maximal 50 bereits autorisierten DB-Pfade; keine N+1-Aufrufe; per-Pfad-Fehler können auf Kartenfallbacks gemappt werden.  
**Nachteile:** alle angefragten Medien erhalten sofort eine URL, auch unterhalb des Viewports; ein Batchfehler betrifft die gesamte Vorschauphase; keine Transformoption in der installierten Batchsignatur; Ergebnis muss strikt anhand des zurückgegebenen Pfads der intern erwarteten Medien-ID zugeordnet werden. Pfade dürfen niemals aus Clientinput stammen.  
**Bewertung:** bei harter 50er-Grenze und direkter Bildvorschau die kleinste, am besten begrenzte MVP-Lösung.

### 8.5 Klare MVP-Empfehlung

**Variante C** für die begrenzte initiale Galerie, serverseitig und ohne `download`-Option. Der Service lädt und autorisiert zuerst die DB-Zeilen, bildet intern ausschließlich deren DB-Bucket/-Pfade, erzeugt genau einen Batch und mappt pro Medium nur die flüchtige View-URL. Ein einzelner URL-Fehler darf die Metadatenliste nicht verbergen, sondern erzeugt einen neutralen Kartenfallback. Variante B ist die bevorzugte Weiterentwicklung, falls Messungen zeigen, dass PDF-/Offscreen-URL-Minimierung oder URL-Erneuerung die Zusatzinteraktion rechtfertigt.

## 9. URL-Sicherheit und TTL

Verbindlich für jede spätere Implementierung:

- URL erst nach serverseitiger Authentifizierung, validierter Rolle und `canViewProjectMedia`;
- aktives Projekt, aktives `ready`-Medium, exakte Projekt-/Medienbindung;
- Bucket und Pfad ausschließlich aus der gerade autorisierten DB-Zeile;
- keine freie Clientpfadangabe und keine Signierung beliebiger Projektpfade;
- privater Bucket, keine Public URL und kein `getPublicUrl`;
- keine Persistenz in DB, Browserstorage, Audit-Log oder Analytics;
- keine URL, kein Token und kein Pfad in Fehlertexten oder normalen Logs;
- kein Service Role im Browser oder normalen Galeriepfad;
- nach Soft Delete keine neue URL; bereits ausgegebene URLs können bis zum Ablauf weiterwirken.

### TTL-Abwägung

| TTL | Vorteil | Nachteil |
| --- | --- | --- |
| 60 Sekunden | kleinste Leak-/Soft-Delete-Restzeit | bei 50 Originalbildern und mobilem Netz zu knapp; erneutes Öffnen scheitert eher |
| 120 Sekunden | guter Mittelweg für initiales Lazy Loading, Klick und kurze Netzverzögerungen | Browsercache/weitergegebene URL kann bis zu zwei Minuten wirken |
| 300 Sekunden | robust bei langsamem Mobilnetz und erneutem Öffnen | deutlich längeres Bearer-Fenster und größere Restwirkung nach Rechte-/Delete-Änderung |

**Technische MVP-Empfehlung: 120 Sekunden.** Die URL ist keine langfristige Freigabe und wird bei einem neuen autorisierten Seitenrequest neu erzeugt. 60 Sekunden sind für große Originale zu fragil, 300 Sekunden ohne gemessenen Bedarf zu lang. Die finale Auswahl zwischen 60, 120 und 300 Sekunden bleibt Owner- und Security-Abnahmeentscheidung.

## 10. Bilddarstellung

Für JPEG, PNG und WebP:

- semantische Bildkarte in einer Liste/einem Grid;
- Vorschaubereich mit fest reserviertem Seitenverhältnis, empfohlen `aspect-[4/3]`, um Layout Shift zu vermeiden;
- Bild füllt die Fläche mit `width: 100%`, `height: 100%` und `object-fit: cover`; keine Behauptung, dass dadurch ein echtes Thumbnail entsteht;
- `loading="lazy"` und sinnvolle `width`/`height`- beziehungsweise CSS-Größenreservation;
- Alt-Text aus Caption, wenn aussagekräftig, sonst neutral aus zentralem Kategorielabel, etwa „Projektmedium, Kategorie Fassade“; niemals ungeprüfter Originaldateiname;
- Caption und Kategorie liefern sichtbaren Kontext, aber der Alt-Text soll angrenzenden Text nicht unnötig wortgleich wiederholen; dekorative Bildverwendung ist hier nicht anzunehmen;
- pro Karte neutraler Fallback „Vorschau konnte nicht geladen werden“, Metadaten und sicherer erneuter Seitenaufruf bleiben nutzbar;
- keine EXIF-/GPS-Anzeige.

### `<img>` gegen Next.js `Image`

**Empfehlung für AP-13-01: normales `<img>`.** Kurzlebige, tokenisierte Supabase-URLs wechseln je Request. `next/image` würde zusätzlich eine Remote-Pattern-Konfiguration und den Next.js-Optimierungsproxy einbeziehen; dessen Abruf-/Cachezeit kann mit dem URL-Ablauf kollidieren und Token-URLs in Cachekeys/Proxyrequests tragen. Die installierte Batch-API bietet zudem keine Transformation. Ein normales Bild vermeidet diese zusätzliche Vertrauens- und Cachegrenze und nutzt Browser-Lazy-Loading direkt.

Das ist eine ehrliche MVP-Kompromissentscheidung: Der Browser lädt private Originale bis 15 MB. Spätestens bei gemessenen mobilen Problemen ist AP-13-05 für datensparsame, EXIF-bewertete Vorschauderivate erforderlich; dann kann `Image` neu bewertet werden.

## 11. PDF, Ansehen, Download und Lightbox

### 11.1 PDF im MVP

PDFs werden nicht gerendert. Die neutrale Dokumentkarte enthält:

- eine lokal vorhandene, zugänglich beschriftete PDF-Kennzeichnung (zunächst einfacher Text/kleines eigenes dekoratives SVG statt neuer Icon-Abhängigkeit);
- Kategorie-Badge;
- optionale Caption;
- Dateityp „PDF-Dokument“, formatierte Größe und Uploadzeit;
- Link „PDF sicher ansehen“ beziehungsweise eindeutig medientypspezifischen Linktext.

Kein eingebetteter `iframe`, PDF.js, OCR, Thumbnail oder Seitenrendering. Das private PDF wird nur über die autorisierte kurzlebige View-URL geöffnet. Bei neuem Tab sind `target="_blank"` und `rel="noopener noreferrer"` sowie Referrer-Verhalten zu prüfen; PDF-Inhalte selbst bleiben unvertrauenswürdig.

### 11.2 Ansehen versus Download

`Ansehen` und `Herunterladen` sind getrennte fachliche Operationen. AP-13-01 setzt bei `createSignedUrls` **keine** Downloadoption: Bildvorschau erscheint in der Galerie, Klick auf Bild/PDF darf die View-URL öffnen. Es gibt keinen expliziten Downloadbutton und keine erzwungene `Content-Disposition: attachment`. Dass ein Browser nach berechtigter Anzeige Speichern anbietet, kann technisch nicht verhindert werden und ist nicht mit einem eigenen Downloadworkflow gleichzusetzen.

Expliziter Download, Dateiname, Disposition, Auditbedarf, Rate Limit und erneute Einzelautorisierung gehören in **AP-13-06 Signed Download Audit**.

### 11.3 Lightbox

Keine Lightbox in AP-13-01. Eine eigene Dialog-, Fokusfallen-, Tastatur- und Mobilarchitektur wäre für das kleinste Read-only Paket unverhältnismäßig; vorhanden ist keine wiederverwendbare Lightbox. Bild- und PDF-Karten bieten stattdessen sicheres Öffnen, vorbehaltlich Owner-Entscheidung im neuen Tab. **AP-13-02** auditiert zuerst größere Ansicht, Fokus, Escape, Pfeiltasten, mobile Gesten und URL-Erneuerung.

## 12. Responsive Grid, Sortierung und Limit

### 12.1 Grid

Auf Basis des `max-w-6xl`-Layouts:

- Mobile: eine Spalte;
- kleine Tablets: zwei Spalten;
- Desktop: drei Spalten;
- sehr breite tatsächliche Inhaltsansicht: optional vier Spalten, nur wenn Karteninhalt und Fokusziele nicht gedrängt werden.

Empfohlen sind konsistente `gap-4` oder `gap-6`, volle Kartenbreite innerhalb der Zelle und gleich reservierte Medienflächen. Bild- und PDF-Karten erhalten vergleichbare Außenhöhe, ohne PDF eine Bildvorschau vorzutäuschen. Lange Captions werden visuell auf wenige Zeilen begrenzt; der vollständige Text bleibt semantisch/zugänglich, beispielsweise ohne destruktives Abschneiden im DOM oder in einer später auditierten Detailansicht. Ein `title`-Attribut allein reicht nicht.

- 1 Medium: keine künstliche Streckung über die gesamte Zeile.
- 2 Medien: stabil in ein beziehungsweise zwei Spalten.
- 10 Medien: normales Grid mit nativem Lazy Loading.
- 50 Medien: hart begrenzt, keine gleichzeitige unbeschränkte Vollabfrage; Originaldatenvolumen bleibt ein bekannter Performance-Risikopunkt.

### 12.2 Stabile Reihenfolge und Menge

MVP: `created_at DESC, id DESC`, neueste zuerst. Das zweite Kriterium macht gleiche Zeitstempel deterministisch. Es gibt kein `sort_order`, keine Drag-&-Drop-Sortierung und keine Migration nur für Reihenfolge.

Initial werden maximal **50 aktive Medien** serverseitig geladen. Das liegt unter dem Domainlimit von 100 aktiven Medien pro Projekt und verhindert die endlose Vollabfrage. AP-13-01 braucht noch keine Pagination oder Load-More-Clientarchitektur. Wenn mehr als 50 existieren, soll die UI neutral anzeigen, dass nur die neuesten 50 gezeigt werden. Cursorpagination mit `(created_at, id)` ist die geeignete spätere Erweiterung; Offsetpagination ist bei parallelen Uploads weniger stabil.

## 13. Kategorie, Caption, Typ, Größe und Datum

- Kategorie ausschließlich aus den bestehenden 14 Codes in `PROJECT_MEDIA_CATEGORIES` und den zentralen deutschen `PROJECT_MEDIA_CATEGORY_LABELS`; keine lokale Kopie, freie oder KI-generierte Kategorie.
- Kategorie als textliches `Badge`, nicht nur Farbe. Filter ist kein MVP-Bestandteil.
- Caption ist nullable. Vorhandene Caption wird escaped als Text angezeigt; keine HTML-Interpretation. Fehlt sie, wird kein künstlicher Titel oder leerer reservierter Block erzwungen. Ein neutraler Text ist nur sinnvoll, wenn die Kartenstruktur ihn für Verständlichkeit benötigt.
- Lange Caption visuell begrenzen, den vollständigen Inhalt aber zugänglich halten. Keine Bearbeitung in AP-13-01.
- Typ als verständlicher Text: JPEG-Bild, PNG-Bild, WebP-Bild oder PDF-Dokument; nicht allein rohe MIME-Zeichenfolge.
- Bytes zentral und deutsch verständlich in KB/MB formatieren, mit dokumentierter dezimaler Einheit passend zu den bestehenden dezimalen Limits. Keine rohe Bytezahl als primäre UI.
- Datum zentral mit `de-DE`, mittlerem Datum und kurzer Uhrzeit; keine rohen ISO-Zeitstempel. Browser-/Serverzeitzone ist bewusst zu entscheiden, damit SSR-Hydration und betriebliche Bedeutung konsistent bleiben.

## 14. Empty, Loading, Fehler und Success

### Empty State

Gemeinsamer Text: **„Noch keine Projektmedien vorhanden.“** Admin darf zusätzlich auf den bereits sichtbaren Uploadbereich hinweisen. Reviewer erhalten keinen Uploadhinweis und keine Handlungsaufforderung, die sie nicht ausführen dürfen. Empty bedeutet nur erfolgreich geladene leere Liste, nie einen verschluckten Fehler.

### Loading

Kleinste konsistente Lösung: Gallery als Server Component ohne Client-Ladezustand für die gesamte Galerie; Bilder laden nativ lazy. Für AP-13-01 ist kein separater Suspense-Boundary/Skeleton zwingend. Falls reale Messungen die DB-/Batch-Signierung als spürbar langsam zeigen, kann lokal um die Galerie ein `Suspense` mit 1–3 formstabilen Skeletonkarten ergänzt werden, ohne die ganze Seite zur Client Component zu machen. PDF-Karten benötigen keinen Bildladezustand.

### Fehler

Neutrale, deutsche Zustände:

- „Medien konnten nicht geladen werden.“ für Listenfehler;
- „Vorschau konnte nicht geladen werden.“ pro Bildkarte;
- „Medium ist nicht mehr verfügbar.“ bei verschwundenem/gelöschtem Medium;
- „Zugriff nicht erlaubt.“ bei fehlender Berechtigung, ohne Existenz fremder IDs zu bestätigen;
- „Sicherer Zugriff konnte nicht erstellt werden.“ statt rohem Signed-URL-/Providerfehler.

Listenfehler und Zugriffsfehler dürfen nicht als Empty State erscheinen. Kartenfehler sollen andere Karten nicht blockieren. Meldungen verwenden bestehende Alert-/Statusmuster, enthalten aber niemals Supabase-Fehler, Bucket, Pfad, URL, Token, Dateiname oder Kundendaten. Ein Galerie-Success-Banner ist beim normalen Lesen unnötig; der bestehende Uploaderfolg bleibt zuständig.

## 15. Caching, Ablauf und Revalidation

- Die Finalisierungs-Action revalidiert bereits nach **erfolgreicher** Finalisierung gezielt `/projects/{project_id}`. Eine Galerie auf dieser Seite muss danach das neue `ready`-Medium sehen; bei Fehler erfolgt keine Revalidation.
- Die Projektdetailseite nutzt den cookiegebundenen Serverclient und benutzerspezifische Authdaten. Sie darf mit Signed URLs nicht statisch generiert oder als benutzerübergreifende Ausgabe gecacht werden.
- Galerie-Metadaten können nur innerhalb des autorisierten dynamischen Requests geladen werden. Signed URLs dürfen insbesondere nicht in `unstable_cache`, langlebigen Route-Caches, persistentem Clientcache oder vorgerendertem HTML über ihre TTL hinaus liegen.
- Vor AP-13-01 ist das tatsächliche Storage-/CDN-`Cache-Control`-Verhalten der signierten Originalantworten im Browser zu verifizieren. TTL begrenzt neue autorisierte Netzabrufe, löscht aber nicht garantiert bereits im Browsercache liegende Bytes.
- Bei Ablauf erzeugt ein neuer autorisierter Seitenrequest neue URLs. Automatische URL-Erneuerung im Client ist nicht Teil des kleinsten Pakets. Eine abgelaufene Vorschau fällt neutral aus; kein Token wird in Fehlermeldungen dargestellt.
- Soft Delete und Rollenentzug verhindern neue URLs sofort, können eine bereits ausgegebene URL aber nicht vor deren Ablauf zurückrufen. Das begründet die kurze TTL.

## 16. Datenschutz und Security-Restmodell

- Originale bleiben im privaten Bucket; keine Public URL.
- Keine Originaldateinamen in Galerie oder Alt-Text, solange keine ausdrückliche Freigabe vorliegt.
- Keine EXIF- oder GPS-Anzeige und keine Ableitung solcher Daten. Die unveränderte Originalspeicherung bedeutet nicht, dass EXIF datenschutzrechtlich freigegeben ist.
- Kanonische Storagepfade enthalten laut DB-Constraint nur technische UUID-Struktur und keinen Kunden-/Originaldateinamen; die UI gibt sie dennoch nicht aus.
- Signed URLs sind zeitlich begrenzte Bearer-Zugänge. Screenshots, lokales Speichern, Browsercache und Weitergabe während der TTL bleiben Clientrisiken.
- Nach berechtigter Anzeige existiert kein technischer Schutz gegen absichtliches Speichern. Das Human-, Rollen- und organisatorische Berechtigungsmodell bleibt maßgeblich.
- Keine URL oder Mediendaten in KI-Prompts, Analytics oder fremde Systeme. Keine KI-Ausgabe und keine WhatsApp-Integration in diesem Paket.
- Keine personenbezogenen Daten in Logs. Technische Fehler werden nur mit stabiler Fehlerklasse und erforderlichen pseudonymen IDs beobachtbar gemacht; keine Dateinamen, Pfade oder URLs.

## 17. Performance-Einschätzung

Originalbilder dürfen bis 15.000.000 Bytes groß sein; PDF bis 25.000.000 Bytes. Ohne Thumbnail-Pipeline kann eine Galerie mit vielen Originalbildern langsam und auf mobilen Datentarifen teuer sein. Eine 50er-Liste kann theoretisch mehrere hundert MB Bildtraffic repräsentieren. `loading="lazy"` reduziert initiale Abrufe, verhindert aber Browser-Prefetch/Scrolltraffic nicht garantiert und reduziert die Objektgröße nicht.

Batch-Signierung vermeidet bis zu 50 Signaturrequests, nicht die anschließenden Objektrequests. Die harte 50er-Grenze begrenzt Metadaten und URLs, nicht Egress. Direkte Originaldarstellung ist als kleiner funktionaler MVP vertretbar, **wenn** AP-13-01 ehrlich als unoptimiert markiert, mobil gemessen und nicht als Performance-ready bezeichnet wird. Bei inakzeptabler Ladezeit oder Datenmenge ist AP-13-05 vor weiterem Rollout erforderlich. Keine spontane Image-Transformation oder Thumbnail-Pipeline darf ohne eigenes Architektur-, Datenschutz-, Cache- und Cleanup-Audit eingebaut werden.

## 18. Accessibility

- eigener Abschnitt mit sinnvoller `<h2>` wie „Projektmedien“ unter der eindeutigen Projekt-`h1`;
- semantisches `<ul>`/`li` oder gleichwertig klar bezeichnetes Grid, nicht eine Folge unverbundener `div`-Elemente;
- sinnvolle Alt-Texte ohne Originaldateiname; Caption/Kategorie nicht verwirrend doppeln;
- gesamte Öffnen-Funktion als echter Link, per Tastatur erreichbar, mit deutlich sichtbarem Fokus;
- Linktext nennt Aktion und Typ, nicht nur „Öffnen“ oder ein alleinstehendes Icon;
- PDF textlich als Dokument kennzeichnen; Information nie nur über Farbe;
- Kategorie-Badge besitzt lesbaren Text;
- Fehlerstatus mit `role="alert"`, Status nur bei dynamischer relevanter Änderung; keine unnötige Screenreader-Ansage für statischen Inhalt;
- Touchziele ausreichend groß, DOM-/visuelle Reihenfolge identisch, Responsive Layout ohne horizontales Scrollen;
- neuer Tab im zugänglichen Namen oder Begleittext ankündigen, falls der Owner diese Variante wählt.

## 19. Teststrategie für AP-13-01 (nur Planung)

Dieses Audit führt keine Tests aus und ändert keine Tests. Das spätere Paket soll mindestens abdecken:

1. **Permissiontests:** `canViewProjectMedia` für Admin/Reviewer wahr; unzulässige/fehlende Rolle fail closed; Mutationspermissions unverändert Admin-only.
2. **Zod-/Mappertests:** erlaubte Row, alle 14 Kategorien/Labels, MIME zu `display_kind`, nullable/limitierte Caption, unbekannte oder inkonsistente externe Werte abgelehnt, internes Storagefeld nie im DTO.
3. **Servicetests:** Auth, Profil, Rolle, aktives Projekt; Query enthält Projekt-ID, `ready`, `deleted_at IS NULL`, beide Orders und Limit 50; Fehler werden neutral; keine generische Query/RPC.
4. **RLS-/Migration-Regression:** bestehende Admin-/Reviewer-SELECT- und Storage-SELECT-Regeln bleiben an aktives Projekt, aktives `ready`-Medium und exakte Zuordnung gebunden; anon/pending/failed/deleted/fremde Kombination negativ. Keine neue Migration.
5. **Signed-URL-Service:** Pfade nur aus DB; ein Batch, TTL-Konstante, kein `download`, max. 50, per-Pfad-Zuordnung, Batch-/Teilfehler neutral, keine URL in Logs/Resultatfehlern, kein Service Role.
6. **UI-Komponententests:** Bilder/PDF gemischt, 0/1/2/10/50, Admin-/Reviewer-Empty-State, Caption null/lang, Kategorie/Typ/Größe/Datum, Alt-Text, Lazy Loading, Linktext, neuer Tab/`rel` sofern entschieden, Kartenfallback.
7. **Browser-/Integrationtests:** echte private URL unter Admin und Reviewer, anon abgelehnt, Ablauf nach TTL, Soft Delete verhindert neue URL, Cache-/Referrer-Verhalten, langsames Mobilnetz und große Originale.
8. **Revalidationtest:** erfolgreiche Finalisierung revalidiert exakt die Projektseite und neues Medium erscheint; Fehler revalidiert nicht.

Keine Preisberechnung, KI-Ausgabe oder automatische Freigabe wird Teil dieser Tests.

## 20. Empfohlene Zielarchitektur

```text
Server Component auf /projects/{project_id}
  → dedizierter read-only Project-Media-Gallery-Service
    → Auth + validiertes Profil + canViewProjectMedia
    → aktives Projekt
    → bestehender authentifizierter Supabase-Serverclient
    → RLS-geschützte, explizite ready-Medienquery (max. 50)
    → Zod-Row-Validierung und schmales Basis-DTO
    → schmaler serverseitiger Signed-URL-Helper (Batch, 120 s)
  → servergerenderte semantische Galerie
    → normale lazy Bilder und PDF-Karten
    → kleine Clientkomponente nur bei tatsächlich notwendiger Interaktion
```

Diese Struktur passt zum modularen Monolithen, hält Auth/DB/Storage serverseitig und vermeidet eine generische Repository-Schicht. Page und Service dürfen denselben bereits erstellten Serverclient über eine schmale Data-Source-Grenze verwenden, um doppelte Auth-/Clienterzeugung zu vermeiden; die fachliche Autorisierung bleibt dennoch im Service explizit. Die UI erhält keine internen Pfade. Eine ganze Galerie-Client-Component ist nicht erforderlich.

## 21. Kleine Folgepakete

### AP-13-01 — Read-only Project Media Gallery

Aktive `ready`-Medien für Admin und Reviewer; feste Sortierung; maximal 50; Bild- und PDF-Karten; Kategorie, Caption, Größe und Datum; sichere kurzlebige Ansicht. Keine Mutation, Lightbox, expliziter Download, benutzerdefinierte Sortierung oder Delete.

### AP-13-02 — Gallery UX and Lightbox Audit

Zuerst Audit; danach gegebenenfalls größere Bildansicht, Fokus-/Tastaturnavigation und mobile Darstellung.

### AP-13-03 — Media Metadata Editing Audit

Vor Caption-, Kategorie- oder Reihenfolgeänderungen; einschließlich Konflikt-/Mass-Assignment-/Reviewergrenzen.

### AP-13-04 — Project Media Soft-Delete UI Audit

Vor normaler Medienlöschung in der Projektansicht; bestehende RPC und Restwirkung ausgegebener URLs bewerten.

### AP-13-05 — Thumbnail and Derivative Architecture Audit

Vor optimierten Vorschaubildern; Decoder, EXIF, Datenschutz, Cache, Lifecycle und Cleanup entscheiden.

### AP-13-06 — Signed Download Audit

Vor explizitem Downloadbutton; Einzelautorisierung, Disposition, Dateiname, TTL, Rate Limits und Auditbedarf entscheiden.

**Kleinstes nächstes Paket:** eindeutig **AP-13-01 — Read-only Project Media Gallery**. Der Status dieses Audits ist **READY FOR OWNER DECISION**, nicht `APPROVED FOR IMPLEMENTATION` und nicht `Production Ready`.

## 22. Offene Owner-Entscheidungen

Die folgenden Punkte sind trotz technischer Empfehlungen nicht eigenmächtig final festgelegt:

1. Soll ein Bildklick im neuen Tab öffnen oder erst mit einer späteren Lightbox angeboten werden?
2. Soll AP-13-01 PDFs ausschließlich als Dokumentkarte anzeigen?
3. Welche Signed-URL-TTL wird freigegeben: 60, auditseitig empfohlene 120 oder 300 Sekunden?
4. Sollen neueste Medien zuerst erscheinen (`created_at DESC, id DESC`)?
5. Sollen maximal 50 Medien auf der ersten Ansicht erscheinen?
6. Soll Caption direkt sichtbar oder erst in einer späteren Detailansicht vollständig erscheinen?
7. Soll die formatierte Dateigröße angezeigt werden?
8. Soll die Kategorie als Badge erscheinen?
9. Soll Reviewer dieselben Anzeigeinformationen wie Admin sehen?
10. Soll ein expliziter Downloadbutton im ersten Paket fehlen?
11. Soll die Galerie direkt unter dem Uploadbereich stehen oder an einer anderen Stelle der Projektseite? Dabei muss sie für Reviewer auch ohne Uploadbereich logisch positioniert sein.
12. Soll bei mehr als 50 Medien nur ein Hinweis erscheinen oder bereits serverseitiges Load More geplant werden?
13. Ist die unoptimierte Originalbilddarstellung für den ersten begrenzten MVP akzeptabel, oder muss AP-13-05 vorgezogen werden?

## 23. Scope-Bestätigung und Status

Dieses Paket ist **ausschließlich Analyse und Dokumentation**. Es enthält:

- keine Implementierung und keine UI-Änderung;
- keine Komponente, Server Action oder Service;
- keine Tests, Teständerungen oder Anwendungstest-Ausführung;
- keine Migration, SQL-Änderung oder RPC;
- keine RLS-Änderung, Storage-Policy, Grants oder Bucketänderung;
- keine Signed URL und keine Public URL;
- keinen Download und keine Lightbox;
- keine Thumbnail-Pipeline;
- keine Sortierung beziehungsweise Sortierfunktion;
- keine Metadatenbearbeitung und keine Soft-Delete-UI;
- keine KI und keine WhatsApp-Integration;
- keine `package.json`-Änderung.

Es wurde **keine Galerie implementiert**. Die beschriebenen URLs, Services, DTOs, Komponenten und Tests sind ausschließlich Planung.

**AP-12 CORE COMPLETED**  
**PROJECT MEDIA GALLERY NOT IMPLEMENTED**  
**OVERALL PRODUCT NOT PRODUCTION READY**  
**AUDITSTATUS: READY FOR OWNER DECISION**

