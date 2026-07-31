# AP-13-02-03 — Gallery Lightbox Regression and Production Validation

**Audit-ID:** `KG-AUDIT-2026-07-30-AP13-02-03-GALLERY-PRODUCTION-VALIDATION-V1`  
**Datum:** 2026-07-30  
**Branch:** `codex/audit-ap13-02-03-gallery-production-validation`  
**Art:** Abschluss-, Architektur- und Regressionsaudit mit Anleitung für den noch ausstehenden Production-Smoke-Test  
**Status:** **GALLERY AND LIGHTBOX — READY FOR PRODUCTION SMOKE TEST**

## 1. Scope, Baseline und Methode

Dieses Paket ist ausschließlich Analyse und Dokumentation. Vor Arbeitsbeginn war der Arbeitsbaum sauber; `git status --short --branch` zeigte nur `## work`. Der saubere lokale Ausgangs-HEAD `86145edec90ff73fc79aea4d791521a9e34cb16e` ist die Baseline.

Im Checkout ist kein Git-Remote konfiguriert: `git remote -v` blieb leer. Deshalb waren `git fetch origin`, `git rev-parse origin/main` und `git merge-base HEAD origin/main` nicht möglich. Ob die lokale Baseline exakt einem externen aktuellen `main` entspricht, konnte nicht verifiziert werden; auftragsgemäß wurde der saubere lokale HEAD als eingeschränkte Baseline verwendet.

Vollständig gelesen wurden:

- `docs/audits/2026-07-30-ap13-00-project-media-gallery-audit.md`;
- `docs/audits/2026-07-30-ap13-02-gallery-lightbox-audit.md`;
- `docs/audits/2026-07-30-ap13-02-02-signed-url-refresh-audit.md`;
- `docs/audits/2026-07-30-ap12-core-production-validation.md`.

Statisch vollständig geprüft wurden die Projektdetailseite, Galerie, Bildkarte, Lightbox, PDF-Control, Galerie-Action und -Service, Single-Media-Signed-URL-Action und -Service, Permission, Galerie- und Signed-URL-Schemas sowie die zugehörigen Galerie-, Signed-URL-, Lightbox-, PDF- und Architekturtests. Zusätzlich wurden Upload-Finalisierung und Projektseiten-Revalidation geprüft. Gemäß Auftrag wurden keine Anwendungstests ausgeführt.

Das Audit dokumentiert keine konkreten URLs, Objektpfade, Datei- oder Personennamen, Production-IDs, Tokens oder personenbezogenen Daten. In Testquellen verwendete künstliche Werte werden hier ebenfalls nicht wiedergegeben.

## 2. Ausgangslage

- **AP-13-01 Read-only Project Media Gallery ist implementiert.**
- **AP-13-02-01 Image Lightbox ist implementiert.**
- **AP-13-02-02-01 Single Media Signed URL Action ist implementiert.**
- **AP-13-02-02-02 Lightbox and PDF Refresh Integration ist implementiert.**
- Admin und Reviewer dürfen aktive `ready`-Medien aktiver Projekte sehen.
- Bilder erscheinen in einer responsiven Galerie; PDFs erscheinen als Dokumentkarten.
- Jede bewusste große Bildöffnung fordert eine neue Signed URL an. Jeder tatsächliche Bildwechsel fordert ebenfalls eine neue Signed URL an.
- PDFs fordern bei jeder Aktivierung eine neue Signed URL an und öffnen nach Erfolg in einem neuen Tab.
- Signed URLs werden nicht persistiert. Es gibt keine Public URLs.
- Es gibt keinen Downloadbutton, keine PDF-Einbettung und keine Medienmutation in der Galerie.

## 3. Ergebnisübersicht

Der vollständige read-only Galerie- und Öffnungsflow ist auf Code-, Architektur- und Regressionsebene konsistent und für einen gezielten manuellen Production-Smoke-Test bereit. Authentifizierung, Rollenprüfung, aktive Projektbindung, `ready`-/Soft-Delete-Grenze und exakte Medienbindung werden bei der Single-Media-Erneuerung serverseitig erneut geprüft. Große Bilder und PDFs verwenden nicht die initiale Karten-URL als Öffnungsziel.

Es besteht eine klar begrenzte Datenminimierungsabweichung: Der initiale Galerie-Batch signiert technisch die DB-Pfade aller gültigen Galeriezeilen, also auch PDF-Zeilen. Die PDF-Komponente verwendet diese initiale URL niemals als Ziel, sondern fordert bei jedem Öffnen korrekt eine frische Single-Media-URL an. Damit entsteht kein Public-, Persistenz- oder Berechtigungsfehler; für die Aussage „initiale Batch-Signed-URLs ausschließlich für tatsächlich dargestellte Vorschauen“ ist die Implementierung jedoch weiter als nötig. Dies ist kein Blocker für den Smoke-Test, muss aber bei späterer Härtung berücksichtigt werden.

Ein tatsächlicher Production-Smoke-Test wurde in diesem Audit nicht durchgeführt. Der Status lautet daher ausdrücklich nicht **PRODUCTION VALIDATED**.

## 4. Architekturvalidierung

| Prüffeld | Ergebnis | Codebefund |
| --- | --- | --- |
| Galerie lädt serverseitig | bestätigt | Die async Projektdetailseite ruft den serverseitigen Galerie-Adapter auf und übergibt dessen DTO an die Darstellung. |
| Keine Client-Datenbankquery | bestätigt | Galerie, Lightbox und PDF-Control enthalten keine Supabase-Tabellenquery. |
| Keine Client-Storagequery | bestätigt | Die Client-Komponenten rufen nur die enge Server Action mit zwei IDs auf. |
| Nur aktuelle `project_id` | bestätigt | Projekt-ID stammt aus der validierten aktiven Projektseite; Listenquery filtert explizit darauf. |
| Nur `upload_status = ready` | bestätigt | Expliziter Queryfilter und RLS-Grenze; Single-Media-Query und Row-Schema prüfen erneut. |
| Nur `deleted_at IS NULL` | bestätigt | Expliziter Queryfilter; Single-Media-Query und Row-Schema prüfen erneut. |
| Maximal 50 Medien | bestätigt | `PROJECT_MEDIA_GALLERY_LIMIT = 50`, serverseitige `.limit(50)`-Abfrage. |
| Sortierung | bestätigt | Stabil `created_at DESC`, danach `id DESC`. |
| Admin/Reviewer | bestätigt | Beide Serverpfade validieren die Rolle und verwenden `canViewProjectMedia`; andere Rollen fail closed. |
| Keine Public URL | bestätigt | Kein `getPublicUrl`; ausschließlich private Signed-URL-Methoden. |
| Keine Service Role | bestätigt | Vorhandener cookiegebundener Serverclient unter Benutzersession; kein Service-Role-Key im Flow. |
| Batch-URLs für Karten | mit Abweichung | Bilder verwenden sie ausschließlich als kleine Preview. Der Batch signiert zusätzlich PDF-Zeilen, obwohl deren Control diese URL nicht verwendet. |
| Single-Media-Action für große Bilder/PDF | bestätigt | Beide Controls senden ausschließlich `project_id` und `media_id`. |
| TTL exakt 120 Sekunden | bestätigt | Galerie-Batch und Single-Media-Signing verwenden jeweils die Konstante 120; Erfolgs-DTO meldet 120. |
| Bucket/Pfad nur aus DB | bestätigt | Single-Media-Input akzeptiert weder Bucket noch Pfad; DB-Zeile und kanonisches Pfadschema werden validiert. Galeriepfade stammen aus validierten DB-Zeilen. |
| Keine URL-Persistierung | bestätigt | URLs leben nur im Serverergebnis beziehungsweise lokalen React-State; keine DB-, Browserstorage- oder Audit-Log-Schreiboperation. |
| Keine Revalidation bei URL-Erzeugung | bestätigt | Die Signed-URL-Action enthält weder `revalidatePath` noch Redirect/Refresh. |
| Keine Mutation | bestätigt | Galerie- und Öffnungspfade lesen und signieren ausschließlich. |

Die Upload-Finalisierung revalidiert nach erfolgreichem Wechsel auf `ready` die zentral bestimmten Projektmedienpfade, einschließlich der Projektdetailseite. Ein erfolgreicher Upload kann damit die serverseitige Galerie aktualisieren. Diese fachlich notwendige Upload-Revalidation ist getrennt von der read-only URL-Erzeugung; letztere revalidiert nichts.

## 5. Galerievalidierung

### 5.1 Darstellung und Metadaten

- Das semantische Medien-`ul` verwendet `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3` mit konsistentem Abstand. Mobile ist einspaltig, kleine Viewports wechseln auf zwei und große auf drei Spalten.
- Bild- und PDF-Darstellung sind nach `display_kind` getrennt. Nur Bilditems mit vorhandener initialer Preview-URL gelangen in die Lightbox-Bildliste; PDFs erhalten eine eigene Dokumentkarte.
- Jede Karte zeigt das zentrale deutsche Kategorie-Label als Badge, eine optionale Caption nur bei vorhandenem Wert, kontrollierten Dateityp, formatierte Dateigröße und deutsches Datum mit Zeitzone Europa/Berlin.
- Alt-Texte verwenden die Caption nach Trimming oder den neutralen Kategorienatz. Originaldateinamen werden nicht als Alt-Text oder Titel ausgegeben.
- Kartenbilder sind native, lazy geladene Bilder mit festen Dimensionen, `object-cover` und reserviertem `aspect-[4/3]`-Bereich.
- Ein Preview-Ladefehler ersetzt nur das Bild durch den neutralen Fallback „Vorschau konnte nicht geladen werden.“; die Kartenmetadaten bleiben erhalten.

### 5.2 Empty-, Fehler- und Rollenverhalten

- Ein leeres Ergebnis zeigt neutral „Noch keine Projektmedien vorhanden.“
- Nur Admin erhält im Empty State den Hinweis auf den vorhandenen Uploadbereich; Reviewer erhält keinen Mutationshinweis.
- Ein Gesamtfehler wird neutral als „Medien konnten nicht geladen werden.“ beziehungsweise „Zugriff nicht erlaubt.“ in einem `role="alert"` dargestellt. Providerdetails werden nicht ausgegeben.
- Bei exakt 50 gelieferten Zeilen weist die UI darauf hin, dass nur die neuesten 50 Medien angezeigt werden. Der Dienst kann bei exakt 50 Einträgen nicht unterscheiden, ob weitere Einträge existieren; `is_limited` bedeutet daher technisch „Limit erreicht“, nicht beweisbar „mehr vorhanden“.

### 5.3 Negativbestand

Die Galerie enthält keinen Delete- oder Downloadbutton, keine Metadaten-, Caption- oder Kategorie-Bearbeitung, keine Sortiersteuerung und keine Filter. Sie enthält keine Uploadfunktion für Reviewer und keine Medienmutation.

## 6. Lightboxvalidierung

- Die Lightbox-Bildliste wird ausschließlich aus `display_kind === "image"` mit vorhandener Preview gebildet; PDFs werden weder aufgenommen noch mitgezählt.
- Jede Bildpreview liegt in einem echten `button type="button"`. Maus/Klick, Enter und Leertaste öffnen die Ansicht; Enter/Leertaste werden explizit abgesichert.
- Der Dialog verwendet `role="dialog"`, `aria-modal="true"` und `aria-labelledby` mit dem zugänglichen sichtbaren Titel „Bildansicht Projektmedien“.
- Escape und der sichtbare Schließen-Button schließen. Ein Klick auf den Backdrop schließt; ein Klick innerhalb des Dialogcontainers nicht.
- Nach Portalmontage landet der Fokus auf dem Schließen-Button. Tab und Shift+Tab werden zwischen den fokussierbaren Dialogelementen eingeschlossen. Beim Schließen kehrt der Fokus per Animation Frame zum auslösenden Bildbutton zurück.
- Während der Öffnung ist der Body-Scroll gesperrt. Die übrigen direkten Body-Kinder werden `inert`; bestehende `inert`-Zustände und der vorherige Overflowwert werden beim Cleanup respektiert.
- Sichtbare Vor-/Zurück-Buttons und Pfeiltasten navigieren. Die Navigation ist nicht zyklisch; der jeweilige Randbutton ist deaktiviert.
- „Bild X von Y“, Kategorie und optionale Caption werden angezeigt.
- Die große Bilddarstellung nutzt `max-h-[65vh] max-w-full object-contain`, einen vollflächigen mobilen Dialog mit kleinen Safe-Area-Abständen und ab `sm` größeren Außenabständen. Das bewahrt Bilder auf kleinen und großen Viewports ohne Crop.
- Action-Loading („Vorschau wird vorbereitet …“), Bild-Loading („Bild wird geladen …“), Actionfehler mit manuellem Retry und Bildladefehler sind getrennte neutrale Zustände.

## 7. Signed-URL-Refresh-Validierung

- Jeder Bildbutton-Aufruf startet `requestSignedUrl` neu; erneut öffnen nach Schließen startet daher eine neue Actionanfrage.
- Die Actioneingabe enthält ausschließlich `project_id` und `media_id`. Das strikte Zod-Schema weist zusätzliche Bucket-, Pfad-, TTL-, Status- oder URL-Felder zurück.
- Die initiale Preview-URL wird nur an die kleine Kartenbildkomponente gegeben. Das große Bild wird erst nach erfolgreicher Action mit der neuen `signed_view_url` gerendert.
- Jeder gültige tatsächliche Bildwechsel ruft die Action erneut auf. Navigationsgrenzen werden ignoriert und erzeugen keine Anfrage.
- Bildwechsel, Retry und Schließen löschen die bisherige große URL; Schließen invalidiert zusätzlich die laufende Sequenz. Die Lightbox wird durch eine späte Antwort nicht erneut geöffnet.
- Die große URL liegt ausschließlich im lokalen `signedUrl`-State der Lightboxinstanz. Es gibt weder Local Storage noch Session Storage, Queryparameter, Deep Links oder globalen Cache.
- Es gibt keine URL-Ausgabe in Audit Log, Serverlog oder Clientlog. Die kontrollierten Fehlertexte enthalten keine Providerdetails.
- Kein Public-URL-Aufruf ist vorhanden.
- Ein monotoner Request-Sequenzzähler verwirft alte Antworten. Nur die aktuelle Sequenz darf State setzen; zusätzlich wird eine Erfolgsantwort mit abweichender Medien-ID neutral verworfen. Bild A kann dadurch Bild B nicht überschreiben.
- Der Actionfehler bietet „Erneut versuchen“ als bewussten manuellen Retry. Es gibt keine automatische Retryschleife.

## 8. PDF-Validierung

- PDFs sind nicht Bestandteil der Lightbox und werden als eigene Dokumentkarten dargestellt.
- Die initiale Galerie-URL wird dem PDF-Control nicht übergeben und niemals als Öffnungsziel verwendet.
- Jede zulässige Aktivierung ruft die Single-Media-Action mit genau Projekt- und Medien-ID auf.
- Vor dem ersten `await` wird synchron ein leeres `_blank`-Fenster mit `noopener,noreferrer` reserviert; `opener` wird zusätzlich explizit auf `null` gesetzt.
- Erst ein passender Actionerfolg navigiert das reservierte Fenster per `location.replace` auf die neue URL.
- Actionfehler oder eine abweichende Medien-ID schließen das reservierte Fenster und zeigen „Das Dokument konnte nicht geöffnet werden.“
- Ein Popupblocker wird neutral mit einem Hinweis zum Erlauben von Pop-ups gemeldet; in diesem Fall startet keine Action.
- Ein synchrones Ref-Guard verhindert Doppelsubmit schon vor dem React-Render. Der Button ist währenddessen disabled, trägt `aria-disabled="true"` und zeigt „Dokument wird geöffnet …“.
- Fehlerfeedback verwendet `role="alert"`.
- Es gibt keinen `iframe`, kein PDF.js, keine PDF-Einbettung und keinen Downloadbutton.

## 9. Race-Condition-Validierung

| Fall | Codeabsicherung | bestehender automatisierter Nachweis |
| --- | --- | --- |
| Schnelles Öffnen/Wechseln mehrerer Bilder | Jede Auswahl erhöht die lokale Sequenz; Portal und `inert` isolieren die aktive Lightbox. | Navigation und unmittelbar aufeinanderfolgendes Vor/Zurück sind getestet. Ein separater Mehrfachklick auf verschiedene Karten vor Portalmontage ist nicht gezielt simuliert. |
| Navigation während URL-Loading | Navigation bleibt aktiv, löscht alten State und startet eine neue Sequenz. | Getestet durch Navigation vor Auflösung der ersten Promise. |
| Schließen vor Actionantwort | Schließen erhöht die Sequenz und entfernt Dialog/URL/Fehler. | Getestet; späte Antwort öffnet nicht erneut. |
| Ältere Antwort nach neuerer | Sequenzvergleich verwirft sie vor jedem State-Update. | Getestet: Antwort für Bild A überschreibt Bild B nicht. |
| Erneutes Öffnen | Schließen löscht State; Öffnen ruft neu an. | Getestet über erhöhte Action-Aufrufzahl. |
| Doppelter PDF-Klick | synchrones `pendingRef` plus disabled Button. | Getestet: eine Action und ein Fenster. |
| Popupblocker | `window.open`-Nullfall endet vor Action. | Getestet. |
| PDF-Actionfehler | Fenster wird geschlossen; neutraler Fehler. | Getestet. |
| Bildladefehler vs. Actionfehler | getrennte States und Texte; Retry nur beim Actionfehler. | Beide Fehlerpfade sind separat getestet. |

Der Sequenzschutz ist eine Korrektheitsgrenze, kein Request-Abbruch: Bereits laufende Serverarbeit kann enden, ihr spätes Resultat wird jedoch nicht mehr übernommen. Das ist für diesen read-only Flow ausreichend.

## 10. Security-Regression

### 10.1 Rollen, Projekt und Medium

- Admin und Reviewer sind über `canViewProjectMedia` erlaubt.
- Nicht authentifizierte Benutzer, fehlende Profile und ungültige Rollen werden fail closed abgelehnt.
- Galerie und Single-Media-Service akzeptieren nur aktive Projekte; die Action prüft das Projekt bei jedem Öffnen erneut.
- Galeriequery und Single-Media-Query begrenzen auf `ready` und `deleted_at IS NULL`.
- Die Single-Media-Query bindet Medien-ID und Projekt-ID gemeinsam; das validierte Ergebnis muss exakt beide IDs wiedergeben.
- Das Row-Schema akzeptiert nur `project-media`, erlaubte JPEG-/PNG-/WebP-/PDF-MIME-Typen und die passende fachliche Medienart.
- Der Single-Media-Service validiert zusätzlich den kanonischen, an Projekt, Medium, gespeicherte UUID und MIME-Endung gebundenen DB-Pfad.
- Clientinput kann Bucket, Pfad, MIME-Typ, Status oder TTL nicht frei wählen.

### 10.2 Storage, URLs und Schreibgrenzen

- Der private Bucket wird unter der authentifizierten Benutzersession angesprochen; keine Service Role wird verwendet.
- Es gibt keine Public URL, URL-Persistierung, URL-Protokollierung oder freie Clientpfadangabe.
- Signing mutiert weder fachliche Tabellen noch Storageobjekte und erzeugt keine Revalidation.
- Dieses Paket und der geprüfte Galerie-/Öffnungsflow lockern keine RLS- oder Storage-Policy. Es gibt keine Migration, Policy- oder Grant-Änderung.
- Bereits ausgegebene Signed URLs bleiben bis zu ihrer kurzen Ablaufzeit Bearer-Zugriff. Neue Öffnungen prüfen jedoch den aktuellen Rollen-, Projekt-, `ready`-, Delete- und Bindungszustand erneut.

## 11. Bestehende Testabdeckung

### 11.1 Galerie-Service, Permission und DTO

`test/project-media-gallery.test.ts` prüft:

- zentrale Admin-/Reviewer-Permission und fail-closed für eine ungültige Rolle;
- serverseitiges schmales Galerie-DTO;
- einmalige Batchsignierung mit festem Bucket und 120 Sekunden;
- neutrale Behandlung ungültiger externer Rowdaten.

Die statisch geprüfte Query implementiert zusätzlich Projektfilter, `ready`, `deleted_at IS NULL`, stabile Sortierung und Limit 50. Für diese konkreten Querybuilder-Aufrufketten sowie den `is_limited`-Randfall existiert kein eigener granularer Unit-Test. Das Zod-Row-Schema validiert UUIDs, Kategorie, MIME-/Medienart, Größe, Caption, Datum, festen Bucket und nichtleeren Pfad; anders als das Single-Media-Schema prüft es den Galeriepfad nicht kanonisch.

### 11.2 Single-Media-Signed-URL

`test/project-media-signed-view-url.test.ts` prüft:

- das strikte Zwei-UUID-Schema und Ablehnung zusätzlicher Felder;
- Admin und Reviewer sowie Ablehnung ohne Authentifizierung, Profil oder gültige Rolle;
- aktives und exakt gebundenes Projekt;
- exakte Projekt-/Medienbindung, `ready`, nicht gelöscht, fester Bucket, erlaubte MIME-/Medienart;
- kanonischen DB-Pfad einschließlich Traversal-, Fremdprojekt-, Fremdmedium- und Endungsabweichungen;
- genau einen Single-Signing-Aufruf mit DB-Bucket, DB-Pfad und exakt 120 Sekunden;
- schmales Erfolgs-DTO und neutrale Signingfehler ohne URL;
- Action-Architektur ohne Public URL, Service Role, Batch, Revalidation, Redirect, RPC oder Browserstorage.

### 11.3 Lightbox, Fokus, Tastatur und Navigation

`test/project-media-image-lightbox.test.tsx` prüft:

- echten Bildbutton, Öffnung per Enter und Leertaste;
- Dialogsemantik, zugänglichen Titel, Metadaten, Zähler und nicht verwendete Preview-URL für das große Bild;
- initialen Fokus, Body-Scroll-Lock, Escape, Fokus-Rückgabe;
- Backdrop-Schließen versus Innenklick;
- Fokusfalle für Tab/Shift+Tab;
- sichtbare und Pfeiltasten-Navigation in stabiler, nicht zyklischer Reihenfolge;
- Ausschluss von PDFs und korrekten reinen Bildzähler;
- Action-Loading, Bildladefehler, kontrollierten Actionfehler und manuellen Retry;
- Sequenzschutz bei Navigation, Schließen, später Antwort und Wiederöffnung.

Die `inert`-Attributsetzung und Wiederherstellung werden im Test nicht ausdrücklich behauptet, sind aber direkt im geprüften Effect implementiert. Ebenso gibt es keinen separaten Viewport-/CSS-Renderingtest; responsive Klassen werden statisch validiert und gehören in die visuelle Production-Abnahme.

### 11.4 PDF-Neutab

`test/project-media-pdf-open-control.test.tsx` prüft:

- synchrone Fensterreservierung mit `noopener,noreferrer` und expliziter Opener-Trennung;
- Pendingtext, `aria-disabled`, Doppelsubmit-Schutz und ausschließliches Zwei-ID-Input;
- Navigation des reservierten Tabs erst nach künstlichem Actionerfolg;
- Schließen bei Actionfehler und neutrales Feedback;
- Popupblocker ohne Actionaufruf.

### 11.5 Testisolierung und Architekturgrenzen

- Die Komponenten mocken die Server Action; Service-Tests verwenden injizierte `vi.fn()`-Datenquellen. Es erfolgen keine echten Netzwerk-, Datenbank- oder Storageaufrufe.
- Signed URLs in Tests sind ausschließlich künstliche, nicht auflösbare Testwerte.
- Die geprüften Galerie-/Lightbox-/PDF-/Signed-URL-Tests verwenden keine Snapshots.
- Architekturtests lesen Quelltext und prüfen unter anderem Public-URL-, Service-Role-, Revalidation-, RPC- und Browserstorage-Negativgrenzen.
- Uploadtests bestätigen die direkte Signed-Upload-Orchestrierung. Die Finalisierungs-Action revalidiert nach Erfolg die Projektdetailseite; URL-Erzeugung tut dies ausdrücklich nicht.

### 11.6 React-`act(...)`-Hinweise

Bei bisherigen React-Komponentenläufen sind `act(...)`-Hinweise bekannt. Sie sind keine Testfehler und ändern die fachlichen Assertions oder den bestandenen Teststatus nicht. Sie zeigen jedoch, dass einzelne asynchrone State-Updates in einer späteren Testhärtung vollständiger mit `act`, `waitFor` oder usernaher Interaktion synchronisiert werden sollten. Der Punkt bleibt ausdrücklich als technischer Restpunkt bestehen und darf nicht mit einer Production-UI-Störung gleichgesetzt werden.

In diesem Audit wurden die Tests auftragsgemäß nicht erneut ausgeführt; daher wurde weder eine neue Warnungszahl erhoben noch behauptet, dass die Hinweise verschwunden seien.

## 12. Production-Smoke-Test

Keine Browser-DevTools sind im normalen Erfolgsfall erforderlich; ebenso keine SQL-Prüfung.

1. Als Admin ein aktives Projekt mit mindestens zwei Bildern und einem PDF öffnen.
2. Prüfen, dass die Galerie sichtbar ist.
3. Ein Bild öffnen.
4. Vor/Zurück, Escape und erneutes Öffnen prüfen.
5. Die Projektseite länger als 120 Sekunden offen lassen und danach ein Bild öffnen.
6. Das PDF öffnen und das neue Tab prüfen.
7. Als Reviewer dasselbe Projekt öffnen und die reine Lesesicht prüfen.

## 13. Erwartete Production-Ergebnisse

- Die Galerie lädt ohne sichtbaren technischen Fehler.
- Bilder erscheinen; PDFs erscheinen als Dokumentkarten.
- Die Lightbox öffnet und die nicht zyklische Navigation funktioniert.
- Fokusführung, Fokus-Rückgabe und Escape funktionieren.
- Nach mehr als 120 Sekunden öffnet ein Bild weiterhin erfolgreich, weil beim Öffnen eine neue URL angefordert wird.
- Das PDF öffnet nach der frischen Anfrage in einem neuen Tab.
- Reviewer kann die Medien ansehen und sieht keine Medienmutationen.
- Es werden keine technischen Fehlerdetails sichtbar.
- Es wird keine Public URL verwendet.

## 14. Bekannte Restpunkte

Ausschließlich folgende relevante Folgepunkte bleiben außerhalb dieses Pakets:

- visuelle Production-Abnahme;
- bekannte React-`act(...)`-Testhinweise und mögliche spätere Testhärtung;
- expliziter Download als eigener, autorisierter Fachflow;
- Caption-/Kategorie-Bearbeitung;
- normale Soft-Delete-UI;
- Thumbnail-/Derivative-Pipeline;
- Zoom;
- mobile Swipe-Gesten;
- PDF-Vorschau;
- Galerie-Design-Feinschliff;
- KI;
- WhatsApp.

Die unnötige initiale Batchsignierung der nicht als Preview verwendeten PDF-Zeile kann im Zuge einer späteren URL-Datenminimierung geprüft werden. Sie ist kein neues Backend-Core-Thema und kein Blocker für den manuellen Smoke-Test.

## 15. Statusentscheidung

Code, Tests und Architektur sind mit der dokumentierten, nicht blockierenden PDF-Batch-Datenminimierungsabweichung konsistent genug für den gezielten manuellen Production-Smoke-Test. Eine visuelle oder reale Production-Abnahme wird durch dieses statische Audit nicht vorweggenommen.

**GALLERY AND LIGHTBOX**  
**READY FOR PRODUCTION SMOKE TEST**

**AP-13-01 READ-ONLY GALLERY IMPLEMENTED**

**AP-13-02-01 IMAGE LIGHTBOX IMPLEMENTED**

**AP-13-02-02 SIGNED URL REFRESH IMPLEMENTED**

**OVERALL PRODUCT NOT PRODUCTION READY**

Ausdrücklich nicht gesetzt: **PRODUCTION VALIDATED**.

## 16. Nächster Schritt

Nach dem tatsächlichen manuellen Smoke-Test ausschließlich:

**AP-13-02-03-01 — Gallery and Lightbox Production Validation Result**

Dies ist ein kleiner Dokumentationsschritt, der nur die tatsächlich beobachteten Production-Ergebnisse festhält. Danach folgt:

**AP-13-03 — Media Metadata Editing Audit**

Dieses Audit ist vor jeder Caption- oder Kategorieänderung erforderlich.

## 17. Scope-Bestätigung

Dieses Arbeitspaket enthält ausschließlich Analyse und Dokumentation und erstellt nur diese Auditdatei. Es enthält ausdrücklich:

- keine Implementierung;
- keine UI-Änderung;
- keine Komponentenänderung;
- keine Server Action;
- keinen Service;
- keine Tests oder Teständerungen und keine Testausführung;
- keine Migration;
- keine SQL;
- keine RPC;
- keine RLS-Änderung;
- keine Storage-Policy;
- keine Signed-URL-Änderung;
- keine Public URL;
- keinen Download;
- keine PDF-Einbettung;
- keine `package.json`-Änderung;
- keine KI;
- keine WhatsApp-Integration.

## 18. Abschlusschecks

Vor dem Commit werden `git diff --check` und `git status --short --branch` ausgeführt. Nach dem Commit werden zusätzlich `git diff-tree --no-commit-id --name-status -r HEAD`, `git rev-parse HEAD` und `git log -1 --pretty=%s` ausgeführt. Erwarteter und verbindlicher Änderungsumfang ist ausschließlich:

`docs/audits/2026-07-30-ap13-02-03-gallery-production-validation.md`

Anwendungstests werden wegen des reinen Audit-Scope nicht ausgeführt.
