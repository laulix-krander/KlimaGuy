# AP-13-02 — Gallery UX and Lightbox Audit

**Audit-ID:** `KG-AUDIT-2026-07-30-AP13-02-GALLERY-LIGHTBOX-V1`  
**Datum:** 2026-07-30  
**Branch:** `codex/audit-ap13-02-gallery-lightbox`  
**Art:** Architektur-, Security- und UX-Audit; ausschließlich Analyse und Dokumentation  
**Auditstatus:** **READY FOR OWNER DECISION**

## 1. Executive Summary

AP-13-01 hat die Read-only Project Media Gallery implementiert. Admin und Reviewer sehen auf der aktiven Projektdetailseite aktive `ready`-Medien. Bilder erscheinen als responsive, nativ lazy geladene `<img>`-Karten; PDFs als neutrale Dokumentkarten. Der dedizierte serverseitige Gallery-Service autorisiert Rolle und aktives Projekt, validiert externe Daten mit Zod, lädt höchstens 50 Medien in der Reihenfolge `created_at DESC, id DESC` und erzeugt ihre Signed View URLs in einem Batch mit 120 Sekunden TTL. Es gibt keine Public URLs und keine Galerie-Mutation.

Für die größere Ansicht wird **Variante B, eine kleine eigene Lightbox ausschließlich für Bilder**, technisch empfohlen. PDFs sollen weiterhin über eine frisch autorisierte Signed View URL in einem neuen Tab geöffnet werden. Der MVP umfasst weder PDF-Einbettung noch Download, Zoom, Rotation, Swipe, Metadatenbearbeitung oder Löschung und benötigt keine externe Abhängigkeit.

Die Galerie bleibt serverseitig geladen. Nur der eng begrenzte Interaktionsbereich wird eine Client Component: geöffnetes Bild, nicht zyklische Navigation, Schließen, Tastatur und Fokus. Eine URL-Erneuerung beim Öffnen wird wegen der kurzen TTL empfohlen, aber ausschließlich über eine schmale serverseitige Autorisierungsgrenze. Der Client darf nur die gebundene Medien-ID anfordern; Projektzuordnung, Rolle, aktives Projekt, `ready`, `deleted_at IS NULL`, Bucket und Pfad werden erneut serverseitig aus der Datenbank geprüft. Keine URL wird persistiert oder geloggt.

Alle fachlichen Empfehlungen dieses Audits bleiben Owner-Entscheidungen. Dieses Dokument erteilt **keine Implementierungsfreigabe**.

## 2. Baseline, Remote-Status und Auditmethode

- Vor Arbeitsbeginn war der Checkout sauber; `git status --short --branch` zeigte `## work`.
- Lokale Baseline und Ausgangs-HEAD: `c68e97cb89c0a9dea7607c02ad0e6e9b9eaf2a54`.
- Dieser Ausgangs-HEAD ist der Merge von AP-13-01 und wurde als sauberer lokaler aktueller Stand verwendet.
- Im Checkout ist **kein Git-Remote konfiguriert**; `git remote -v` blieb leer. Deshalb waren `git fetch origin`, `git rev-parse origin/main` und `git merge-base HEAD origin/main` nicht möglich.
- Ob die lokale Baseline exakt einem externen aktuellen `main` entspricht, konnte ohne Remote nicht verifiziert werden. Diese Einschränkung betrifft nur den Remotevergleich, nicht den dokumentierten lokalen Codebefund.
- Vollständig gelesen und als verbindlich behandelt wurden:
  - `docs/audits/2026-07-30-ap13-00-project-media-gallery-audit.md`;
  - `docs/audits/2026-07-30-ap12-core-production-validation.md`.
- Vollständig statisch geprüft wurden die Projektdetailseite, beide Galerie-Komponenten, der dedizierte Galerie-Service samt Supabase-Adapter, `canViewProjectMedia`, das Galerie-Zod-Schema und die Galerie-Tests.
- Repositoryweit geprüft wurden Dialog-/Modal-/Overlay-Muster, Client-Component-, Fokus- und Tastaturmuster, responsive Layouts, Icons, Bild- und Linkverwendung, Accessibility-Konventionen sowie `package.json` und die installierten UI-Abhängigkeiten.
- Dieses Audit dokumentiert keine Production-ID, keinen Storagepfad, Dateinamen, URL, Token und keine personenbezogenen Daten.

## 3. Verbindliche Ausgangslage

### 3.1 Implementierter Stand

- **AP-13-01 READ-ONLY GALLERY IMPLEMENTED.**
- Admin und Reviewer dürfen über `canViewProjectMedia` aktive Projektmedien sehen.
- Der Gallery-Service prüft serverseitig Session, validiertes Profil und Rolle sowie ein aktives Projekt.
- Die explizite Medienquery ist projektspezifisch, filtert `ready` und `deleted_at IS NULL`, sortiert `created_at DESC, id DESC` und begrenzt auf 50.
- Das strikte Galerie-Zod-Schema validiert UUIDs, Kategorie, kontrollierte MIME-/Medientypkombination, Dateigröße, Caption, Zeitpunkt, privaten Bucket und internen Pfad.
- Das UI-DTO enthält Metadaten und eine flüchtige Signed View URL, aber weder Bucket noch Pfad oder Originaldateiname.
- Signed View URLs werden serverseitig über einen Batch mit 120 Sekunden TTL erzeugt. Es wird keine Download-Disposition gesetzt.
- Bilder werden als responsive Karten mit reserviertem `4:3`-Bereich, `object-cover`, `loading="lazy"`, Alt-Text und lokalem Fehlerfallback dargestellt.
- PDFs werden als neutrale Dokumentkarten mit textlicher Kennzeichnung und sicherem Link dargestellt.
- Bestehende Bild- und PDF-Links öffnen in einem neuen Tab und verwenden `rel="noopener noreferrer"` sowie `referrerPolicy="no-referrer"`.
- Es gibt keine Public URL und keinen Downloadbutton.

### 3.2 Bewusst nicht implementierter Stand

- **LIGHTBOX NOT IMPLEMENTED.**
- Es gibt keine größere Ansicht innerhalb der Anwendung.
- Es gibt keine Vor-/Zurück-Navigation und keine Bildindexanzeige.
- Es gibt keine Tastatursteuerung für eine größere Ansicht.
- Es gibt kein Dialog-, Overlay-, Fokusfallen- oder Fokus-Rückgabemuster.
- Es gibt keinen Zoom, keine Rotation und keine Swipe-Gesten.
- Es gibt keine PDF-Vorschau, PDF-Einbettung oder PDF-Viewer-Abhängigkeit.
- Es gibt keine Caption- oder Kategorienbearbeitung.
- Es gibt keine Löschfunktion in der Galerie.
- **OVERALL PRODUCT NOT PRODUCTION READY.**

## 4. Repositorybefund zu UI, Clientgrenze und Accessibility

### 4.1 Dialog-, Modal- und Overlay-Muster

Repositoryweit existiert kein Dialog, Modal oder Overlay und keine Abstraktion für `role="dialog"`, `aria-modal`, Portal, Fokusfalle, Hintergrund-Inertheit, Escape oder Fokus-Rückgabe. Die zweistufigen Orphan-Aktionen sind Inline-Bestätigungen und kein übertragbares Dialogmuster. Eine spätere Lightbox darf deshalb eine **kleine lokale Lösung** erhalten; eine globale Dialogarchitektur wäre für diesen einzelnen Use Case verfrüht.

### 4.2 Client-Component-Muster

Client Components sind klein und interaktionsbezogen. Formulare halten lokalen Pending-/Fehlerzustand und delegieren geschützte Operationen an Server Actions. `ProjectMediaImage` hält nur den lokalen Bildfehlerzustand; Galerie, Page und Gallery-Service bleiben serverseitig. Das stützt eine schmale Client-Insel statt einer Umwandlung der gesamten Seite oder Galerie in eine Client Component.

Das Uploadformular zeigt bereits ein brauchbares Fokusprinzip: Feedback besitzt `tabIndex={-1}` und wird nach relevanten Ergebnissen programmgesteuert fokussiert. Eine allgemeine Fokusfalle oder Tastatursteuerung existiert jedoch nicht.

### 4.3 Responsive, Icons, Bilder und Links

- Das App-Layout ist auf `max-w-6xl` begrenzt und verwendet mobile Seitenabstände. Die Galerie ist einspaltig, ab `sm` zweispaltig und ab `lg` dreispaltig.
- Es gibt kein zentrales Iconsystem und keine Iconbibliothek. Die PDF-Karte nutzt ein lokales dekoratives SVG. Schließen und Navigation dürfen daher einfache lokale SVGs enthalten, müssen aber zusätzlich verständliche zugängliche Namen beziehungsweise sichtbaren Text erhalten.
- Es wird kein `next/image` verwendet. Die Galerie nutzt bewusst ein normales `<img>`, da Signed URLs kurzlebig sind und ein zusätzlicher Optimierungsproxy eine ungeklärte Token-/Cachegrenze erzeugen würde.
- Interne Navigation verwendet überwiegend `next/link`; Signed Storage URLs verwenden normale `<a>`-Elemente. Dieses Muster bleibt für PDFs passend.
- Vorhandene Galerie-Links besitzen sichtbare Fokus-Outlines. Formulare nutzen Labels, `aria-describedby`, `aria-invalid`, `aria-busy`, `role="alert"` und `role="status"` punktuell. Diese Konventionen sind für Lightboxstatus und Bedienfelder fortzuführen.

### 4.4 Installierte Abhängigkeiten

Installiert sind React/Next.js, Tailwind, Supabase, Zod, `clsx` und `tailwind-merge`; für Tests Testing Library/Vitest/jsdom. Es gibt weder Headless-Dialog-/Overlay-Paket noch Lightbox-, PDF-Viewer-, Fokusfallen- oder Iconbibliothek. Eine externe Lightbox würde eine neue `package.json`-Änderung, Bundle- und Supply-Chain-Fläche sowie Lizenz-/Wartungsprüfung verursachen. Für den eng begrenzten MVP ist das nicht gerechtfertigt.

## 5. Audit-Ziel und UX-Grundsatz

Gesucht ist die kleinste sichere und barrierearme Möglichkeit, ein Projektbild groß anzusehen, ohne die verifizierte Server-/RLS-Grenze zu verwässern. Das bedeutet:

1. Bilder dürfen innerhalb der Projektdetailansicht in einer modalen, nahezu viewportfüllenden Ansicht geöffnet werden.
2. PDFs bleiben Dokumente und öffnen in einem neuen Browser-Tab; sie werden nicht in eine Bildnavigation gezwungen.
3. Sicherheitsautorisierung und URL-Erzeugung bleiben serverseitig; der Browser verwaltet nur Darstellung und kontrollierte Medien-IDs.
4. Maus, Touch und Tastatur erhalten gleichwertige Bedienwege.
5. Der Umfang bleibt read-only und ohne neue Abhängigkeit.

## 6. Variantenvergleich

### 6.1 Variante A — Bilder und PDFs ausschließlich im neuen Browser-Tab

**Einfachheit:** Bestehendes Verhalten; kein Overlay, Fokusmanagement oder eigener Clientzustand. Der Browser rendert Bild/PDF und verwaltet seinen eigenen Tab.  
**Accessibility:** Native Links sind robust und gut per Tastatur bedienbar, sofern der neue Tab angekündigt wird. Ein unerwarteter Kontextwechsel kann jedoch insbesondere für Screenreader- und kognitive Nutzer verwirrend sein.  
**Mobile Nutzung:** Browserwechsel und Zurücknavigation sind browserabhängig; PDFs profitieren vom nativen Viewer, Bilder verlieren dagegen Galerie-Kontext und komfortable Sequenznavigation.  
**Signed-URL-Ablauf:** Auch hier muss eine beim Seitenrendern erzeugte 120-Sekunden-URL beim späteren Klick als potenziell abgelaufen gelten.  
**Browsernavigation:** Browser-Zurück beziehungsweise Tab-Schließen sind nativ. Es gibt keine app-interne Schließsemantik.  
**Clientzustand:** Keiner erforderlich.  
**Grenze:** Die Galerie-UX bleibt eingeschränkt; jedes Bild ist ein eigener Kontextwechsel, ohne Bildindex oder Vor/Zurück.

**Bewertung:** sicherste Minimalvariante, aber erfüllt das Ziel einer zusammenhängenden größeren Bildansicht nur unzureichend.

### 6.2 Variante B — Eigene kleine Lightbox nur für Bilder; PDFs im neuen Tab

**UX:** Bilder bleiben im Projektkontext, können groß mit `object-contain` angesehen und in stabiler Galeriereihenfolge durchlaufen werden. PDFs nutzen weiterhin den dafür geeigneten Browserviewer.  
**Fokus und Tastatur:** Erfordert korrekte Fokusfalle, initialen Fokus, Escape, Fokus-Rückgabe, Pfeiltasten und sichtbare Fokuszustände. Dieser Aufwand ist begrenzt, aber nicht optional.  
**Mobile:** Eine nahezu viewportfüllende, sichere `object-contain`-Ansicht ist klar besser als die kleine Karte; keine Swipe-Erkennung ist für den ersten Schritt nötig.  
**Signed-URL-Ablauf:** Eine frische URL beim Öffnen verbessert Zuverlässigkeit und erneuert zugleich serverseitig die Berechtigung.  
**Clientzustand:** Kleine lokale Zustandsmaschine für Medium, Lade-/Fehlerzustand, Index und auslösendes Element. Keine DB-/Storage-Abfrage im Browser.  
**Testaufwand:** Höher als A, aber klar begrenzt und mit Testing Library/jsdom sowie gezielter Browservalidierung abdeckbar.  
**Abhängigkeiten:** React und Browser-APIs genügen; keine externe Bibliothek erforderlich.

**Bewertung:** bestes Verhältnis aus Nutzwert, Sicherheit, Accessibility und beherrschbarem Umfang.

### 6.3 Variante C — Lightbox für Bilder und eingebettete PDF-Anzeige

**Komplexität:** Ein `iframe` oder PDF.js erzeugt einen zweiten Dokument-/Viewer-Lifecycle mit eigener Lade-, Fehler-, Fokus-, Tastatur-, Zoom- und Mobilsemantik.  
**Security:** Unvertraute PDF-Inhalte, Viewerfähigkeiten, `iframe`-Attribute/Sandbox, Referrer, Browserunterschiede und zusätzliche Angriffs-/Patchfläche müssten separat bewertet werden.  
**Mobile:** Eingebettete Browser-PDF-Viewer sind inkonsistent, auf kleinen Viewports häufig schwer bedienbar und konkurrieren mit der Lightboxnavigation.  
**URL-Ablauf:** Eine kurzlebige URL kann während Initialisierung, Seitenwechseln oder Nachladen des Viewers ablaufen. Wiederherstellung ist komplexer als ein erneutes Öffnen im Browserviewer.  
**Performance:** Große PDFs bis 25 MB und gegebenenfalls PDF.js erhöhen Netz-, Parsing-, Speicher- und Bundlekosten.  
**MVP-Grenze:** PDF-Seitenvorschau, Suchfunktion, Downloadverhalten und Viewer-Accessibility würden den reinen Bild-Use-Case deutlich überschreiten.

**Bewertung:** für das MVP zu groß und ohne eigenständiges PDF-Security-/UX-Audit nicht vertretbar.

### 6.4 Variante D — Externe Lightbox-Bibliothek

**Bestehende Abhängigkeiten:** Keine passende Bibliothek ist installiert.  
**Bundlegröße:** Zusätzliches Client-JavaScript und CSS für Funktionen, die der MVP nicht benötigt.  
**Accessibility:** Eine Bibliothek kann gute Defaults liefern, entbindet aber nicht von Fokus-, Screenreader-, Mobile- und Regressionstests. Nicht jede Lightbox implementiert Dialogsemantik korrekt.  
**Wartung und Lizenz:** Versionspflege, Supply Chain, Next-/React-Kompatibilität und Lizenzprüfung kämen neu hinzu.  
**Repositorywirkung:** Zwingende `package.json`-/Lockfile-Änderung, obwohl der benötigte Funktionsumfang klein ist.  
**Rechtfertigung:** Erst bei wesentlich größerem Funktionsbedarf wie Gesten, Zoom, Animationen oder komplexen Medienformaten neu bewerten.

**Bewertung:** für diesen MVP nicht gerechtfertigt.

### 6.5 Eindeutige Audit-Empfehlung

**Variante B**: eine lokale, kleine und abhängigkeitsfreie Lightbox ausschließlich für Bilder; PDFs in einem neuen Tab. Kein PDF-Viewer, Download, Zoom, Rotation, Swipe, Metadatenediting oder Delete. Diese Empfehlung ist eine Vorlage für die Owner-Entscheidung, keine eigenmächtige Produktfreigabe.

## 7. Empfohlener MVP-Scope

**In Scope nach Owner-Freigabe:**

- nur Bilder in der Lightbox;
- lokaler Clientzustand;
- Fokusmanagement und Fokusfalle;
- Schließen-Button und Escape;
- nicht zyklische Vor-/Zurück-Buttons und Pfeiltasten;
- Anzeige „Bild X von Y“;
- `object-contain`, Alt-Text, Kategorie und optional vorhandene Caption;
- gezieltes Loading und neutrale Fehler;
- PDFs über frische sichere Signed URL in neuem Tab;
- keine externe Abhängigkeit.

**Nicht im MVP:** PDF-Einbettung, PDF.js, Downloadbutton, Zoom, Rotation, automatische Animation, Swipe-Gesten, Originaldateinamen, EXIF/GPS, Caption-/Kategorieänderung, Löschung, Sortiermutation, Deep Link und KI.

## 8. Signed-URL-Ablauf

### 8.1 Ist-Risiko

Die beim Serverrendern in Batchform erzeugte URL lebt 120 Sekunden. Sie reicht häufig für das initiale Lazy Loading, aber nicht zuverlässig für einen Klick nach längerem Lesen der Projektseite. Ein Bild kann bereits aus dem Browsercache sichtbar sein, während ein erneutes Laden der großen Ansicht über dieselbe URL scheitert. Bei PDFs ist derselbe späte Klick betroffen. Eine TTL-Verlängerung würde das Bearer-Fenster vergrößern, ohne die Berechtigung zum Öffnungszeitpunkt neu zu prüfen.

### 8.2 Vergleich der Ablaufvarianten

#### A — Vorhandene URL direkt verwenden

**Vorteile:** keine neue Servergrenze, sofortige Anzeige bei gültiger URL, kleinster Implementierungsumfang.  
**Nachteile:** nach 120 Sekunden unzuverlässig; keine erneute Rollen-, Projekt- oder Medienprüfung beim Öffnen; Fehlerursache „abgelaufen“ ist vom generischen Bildfehler schwer unterscheidbar. Browsercache kann das Problem inkonsistent verdecken.  
**Eignung:** als kurzzeitiger Fallback oder isolierter erster UI-Schritt möglich, nicht als robuste Endarchitektur empfohlen.

#### B — Bei jedem Öffnen eine neue Signed URL über eine schmale Server Action erzeugen

**Vorteile:** Ablauf beginnt nutzungsnah; Rolle, aktives Projekt, aktives `ready`-Medium und exakte Bindung werden unmittelbar vor Ausgabe neu geprüft; nur das aktuelle Medium wird signiert.  
**Nachteile:** zusätzlicher Roundtrip, lokaler Loading-/Fehlerzustand und eine neue, sorgfältig getestete Server Action im späteren Implementierungspaket. Popupblocker müssen beim asynchronen PDF-Öffnen berücksichtigt werden.  
**Eignung:** beste zuverlässige und sicherheitsorientierte Lösung.

#### C — Galerie bei Ablauf komplett neu laden

**Vorteile:** nutzt den bestehenden Batchpfad.  
**Nachteile:** erneuert unnötig bis zu 50 URLs, verliert lokalen Zustand/Scrollposition, erzeugt globales Seitenloading und löst das Popup-/Klickproblem unnötig grob.  
**Eignung:** nicht empfohlen.

### 8.3 Klare Empfehlung

**Variante B: neue URL bei jedem Öffnen nur für das aktuelle Medium.** Die spätere schmale Server Action akzeptiert ausschließlich eine validierte Medien-ID; eine frei mitgegebene `project_id`, Bucketangabe oder Pfadangabe darf niemals Autoritätsquelle sein. Serverseitig werden Session, `canViewProjectMedia`, aktives Projekt über die DB-Zuordnung des Mediums, `ready`, `deleted_at IS NULL`, exakte Medien-/Projektbindung und privater Bucket/Pfad aus der Datenbank geprüft. Erst danach wird eine einzelne Signed View URL mit der bestehenden 120-Sekunden-TTL erstellt.

Die URL bleibt flüchtige Antwort, wird nicht persistiert, nicht geloggt und nicht in Fehlerdetails aufgenommen. Für PDFs sollte das neue Tab synchron als leeres, sicher kontrolliertes Fenster aus der Benutzeraktion geöffnet oder eine serverseitige Navigation gewählt und erst nach erfolgreicher Antwort auf die URL gesetzt werden; andernfalls kann der Browser den asynchronen `window.open`-Aufruf blockieren. Bei Fehler ist ein gegebenenfalls vorab geöffnetes leeres Tab zu schließen und das Feedback in der Ursprungskarte zu zeigen.

Diese Empfehlung bestätigt, dass **AP-13-02-02 — Signed URL Refresh on Open** fachlich erforderlich ist. Im vorliegenden Audit wird keine Server Action und keine URL-Änderung umgesetzt.

## 9. Client-/Server-Component-Grenze

### 9.1 Empfohlene Struktur

```text
Server Component: Projektdetailseite
  → bestehender read-only Gallery-Service
  → bestehende servergerenderte Galerie und schmales DTO
  → kleine Client-Insel für Bildtrigger und Lightboxzustand
      → geöffnetes Bild / Index
      → Loading / neutraler Fehler
      → Schließen / Vor / Zurück
      → Tastatur / Fokus / Scroll-Sperre
      → Refresh-Anfrage nur mit validierter media_id

Schmale Server Action (separates Folgepaket)
  → Session + validierte Rolle + canViewProjectMedia
  → Medium aus DB samt Projektbindung laden
  → aktives Projekt + ready + deleted_at IS NULL
  → Bucket/Pfad ausschließlich aus DB
  → einzelne kurzlebige Signed View URL
```

Die Galerie darf nicht vollständig clientseitig neu geladen werden. Der Client erhält keine Datenbankquery, Storagequery, Service Role, Bucket- oder Pfadangabe. Das bestehende DTO kann Metadaten und die initiale URL für die Karte behalten; für den Refresh braucht der Client nur `media_id`. `project_id` im vorhandenen DTO darf niemals alleinige Autorisierungsgrundlage werden.

### 9.2 Zustandsmodell

Empfohlen sind explizite lokale Zustände `closed`, `loading`, `ready` und `error`. Der aktuell ausgewählte Bildindex wird getrennt von der URL gehalten. Ein monotoner Requestbezug oder Abbruchmechanismus verhindert, dass eine langsamere alte Antwort nach schneller Navigation das falsche Bild setzt. Bei Navigation wird nicht zuerst die alte URL unter dem neuen Titel angezeigt.

## 10. Fokusmanagement und Hintergrund

Verbindliche Planung für eine spätere Umsetzung:

1. Der echte Bildtrigger ist ein `<button type="button">` oder ein gleichwertig semantischer, tastaturfähiger Trigger; Enter und Leertaste funktionieren dadurch nativ.
2. Vor dem Öffnen wird das auslösende Element als Rückkehrziel gehalten.
3. Nach Mount der Lightbox landet der Fokus auf dem Schließen-Button oder auf dem Dialogcontainer mit `tabIndex={-1}`; bevorzugt ist der sinnvoll zuerst erreichbare Schließen-Button.
4. Der Dialog besitzt `role="dialog"`, `aria-modal="true"`, einen über `aria-labelledby` verbundenen zugänglichen Titel und bei Bedarf eine Beschreibung.
5. Tab und Shift+Tab zirkulieren ausschließlich durch aktive Lightboxbedienelemente. Deaktivierte Vor-/Zurück-Buttons werden korrekt übersprungen.
6. Der Hintergrund wird für Pointer, Tastatur und Screenreader nicht interaktiv. Eine robuste lokale Umsetzung nutzt native `inert`-Semantik am App-Hintergrund, wo unterstützt, plus geeignete modale Struktur; nicht nur einen visuellen Backdrop oder `aria-hidden` ohne Fokusunterbindung.
7. Escape schließt aus jedem Lightboxzustand, soweit keine untergeordnete Interaktion existiert.
8. Beim Schließen wird der Fokus auf genau den auslösenden Bildtrigger zurückgegeben. Ist dieser nicht mehr im DOM, wird ein stabiler Galerie- oder Abschnittsfokus als Fallback verwendet.
9. Ein Bildlade- oder URL-Fehler entfernt den Dialog nicht und verschiebt den Fokus nicht. Schließen und Retry bleiben erreichbar.
10. Dokument-Scroll wird während der Lightbox kontrolliert gesperrt und beim Schließen vollständig wiederhergestellt; die visuelle Scrollposition darf nicht springen.

Da kein Repositorymuster existiert, soll die Lösung lokal bei der Galerie bleiben. Keine globale Dialogarchitektur ist Bestandteil des MVP.

## 11. Tastatursteuerung

- **Enter/Leertaste:** öffnet über den semantischen Bildbutton.
- **Escape:** schließt die Lightbox und gibt Fokus zurück.
- **Pfeil links:** wählt das vorherige Bild, sofern vorhanden.
- **Pfeil rechts:** wählt das nächste Bild, sofern vorhanden.
- **Tab/Shift+Tab:** bleibt im Overlay und folgt einer logischen Reihenfolge.
- **Home/End:** nicht erforderlich im MVP; keine unbeabsichtigte zusätzliche Tastaturkonvention.
- Pfeiltasten dürfen nicht reagieren, wenn das Ereignis aus einem späteren Texteingabefeld käme; solche Felder gehören ohnehin nicht zum MVP.
- PDFs öffnen über normale Links und erhalten keine Lightbox-Tastatursteuerung.
- Alle Trigger und Buttons erhalten sichtbare Fokuszustände. Ein Icon allein reicht nicht; zugängliche Namen lauten beispielsweise „Vorheriges Bild“, „Nächstes Bild“ und „Großansicht schließen“.
- Während URL-Erneuerung kann Navigation gegen Doppelrequests deaktiviert werden; Escape und Schließen bleiben immer aktiv.

## 12. Vor-/Zurück-Navigation

- Die Navigationsliste enthält **nur Bilder**. PDFs werden übersprungen.
- Die Reihenfolge bleibt exakt die serverseitige Galeriereihenfolge `created_at DESC, id DESC`; keine clientseitige Neusortierung.
- Audit-Empfehlung für den MVP: **nicht zyklisch**. Am Anfang ist „Vorheriges Bild“, am Ende „Nächstes Bild“ deaktiviert; kein überraschender Sprung.
- Sichtbare und zugängliche Anzeige: **„Bild X von Y“**. Sie aktualisiert sich mit der Auswahl; unnötig aggressive Live-Ansagen sind zu vermeiden. Falls `aria-live` verwendet wird, nur `polite` und auf den kurzen Index begrenzt.
- Buttons und Pfeiltasten lösen dieselbe kontrollierte Navigationsfunktion aus.
- Kein Preload aller Bilder und kein Nachbarbild-Preload im ersten Paket.
- Keine Swipe-Geste im ersten Paket. Touchnutzer erhalten ausreichend große Pfeilbuttons.

Zyklizität, Bildindex und Swipe bleiben trotz dieser technischen Empfehlung ausdrückliche Owner-Entscheidungen.

## 13. Öffnen und Schließen

- Bildkarte: ein klar benannter Button wie „Bild groß ansehen“; das Vorschaubild darf Teil dieses Buttons sein. Die bisherige Ankündigung „öffnet neuen Tab“ entfällt nur bei Bildern, sobald die Lightbox freigegeben ist.
- PDF-Karte: verständlicher Link „PDF sicher ansehen (öffnet neuen Tab)“ bleibt getrennt.
- Schließen erfolgt mindestens über einen gut erreichbaren Schließen-Button und Escape.
- Klick auf den Backdrop kann optional schließen, darf aber nicht der einzige Schließweg sein. Audit-Empfehlung: im MVP nur dann zulassen, wenn `event.target === event.currentTarget`, damit Klicks auf Inhalt nie versehentlich schließen; Owner entscheidet.
- Browser-Zurück schließt bei lokalem MVP-Zustand nicht zwingend. Das wird sichtbar nicht als Hauptschließweg beworben.
- Nach jedem Schließen Fokus-Rückgabe und vollständiges Cleanup von Listenern, Scroll-Sperre und temporärem Zustand.

## 14. Mobile Darstellung

- Der Dialog nutzt nahezu die volle dynamische Viewportfläche (`dvh` statt allein `vh`, mit Fallback), ohne horizontale Überbreite.
- Sichere Außenabstände berücksichtigen `env(safe-area-inset-top/right/bottom/left)` sowie einen kleinen Mindestabstand.
- Schließen bleibt im oberen sicheren Bedienbereich gut erreichbar und hat ein ausreichend großes Touchziel.
- Bildfläche nutzt `object-contain`, damit das vollständige Bild sichtbar bleibt. Maximalbreite und -höhe richten sich nach verbleibendem Viewport nach Header/Caption/Navigation.
- Caption und Metadaten besitzen eine begrenzte, vertikal scrollbar bleibende Zone. Der Gesamtinhalt darf bei kleinem Landscape-Viewport scrollen, ohne horizontales Scrollen.
- Controls liegen vorzugsweise in separaten Leisten oder kontrastreichen Flächen und nicht dauerhaft über wichtigen Bildbereichen.
- Pfeilbuttons bleiben auf Touchgeräten erreichbar. Keine Hover-only-Funktion.
- Keine Swipe-Geste im ersten Paket; sie würde Konflikte mit Browsernavigation, Scrollen und Zoomgesten sowie zusätzlichen Testaufwand erzeugen.
- Orientierung, kleine Höhen und Bildschirmtastatur sind in Browserchecks zu berücksichtigen, obwohl keine Eingabefelder geplant sind.

## 15. Bilddarstellung und Metadaten

- Große Darstellung als normales `<img>` mit `object-contain`, begrenzter maximaler Breite/Höhe und neutralem, kontrastreichem Hintergrund.
- Es wird jeweils nur das aktuelle Originalbild geladen; zulässige Originale können bis 15 MB groß sein.
- Alt-Text übernimmt die bestehende Regel: aussagekräftige Caption, sonst neutrales zentrales Kategorielabel; niemals Originaldateiname.
- Kategorie ist textlich sichtbar. Eine vorhandene Caption kann vollständig beziehungsweise in einer scrollbar begrenzten Fläche angezeigt werden und wird nur als Text gerendert.
- Datum ist optional und eine Owner-Entscheidung. Falls angezeigt, wird der bestehende deutsche, explizit auf `Europe/Berlin` gesetzte Formatter wiederverwendet; keine rohe ISO-Zeit.
- Dateigröße oder MIME-Typ sind für die große Bildansicht nicht erforderlich, dürfen aber nicht durch freie Providerwerte ersetzt werden.
- Keine Originaldateinamen, Storagepfade, EXIF-Daten, GPS-Koordinaten, Zoom- oder Rotationsfunktion.
- Keine automatische Animation. Falls eine kleine Transition später gewählt wird, muss `prefers-reduced-motion` berücksichtigt werden; sie ist für den MVP unnötig.

## 16. PDF-Verhalten

Empfohlenes und enges Verhalten:

- PDF-Karte öffnet eine **beim Klick frisch serverseitig autorisierte** Signed View URL in einem neuen Tab.
- Der Link-/Buttontext kündigt PDF und neuen Tab verständlich an.
- Zieltab verwendet die Sicherheitswirkung von `noopener`; der resultierende Linkpfad beziehungsweise das kontrollierte Öffnen erhält äquivalentes `noopener noreferrer` und `no-referrer`-Verhalten.
- Kein PDF in der Lightbox, kein `iframe`, kein PDF.js, keine Seitenvorschau und kein Downloadbutton.
- Die Signed-URL-Erneuerung folgt derselben engen Medien-ID- und DB-Bindung wie bei Bildern.
- Der Browser darf nach berechtigter Ansicht eigene Viewer-/Speicherfunktionen anbieten; das ist keine implementierte Downloadfunktion.

## 17. Loading und Fehlerzustände

### 17.1 Loading

- URL-Erneuerung erzeugt nur einen lokalen Ladezustand für die aktuelle Lightbox beziehungsweise PDF-Karte.
- In der Lightbox bleibt ein formstabiler neutraler Bildbereich mit Ladeindikator; `aria-busy="true"` markiert den betroffenen Bereich.
- Schließen und Escape bleiben aktiv. Vor/Zurück und Retry werden während einer unklaren URL-Antwort sinnvoll deaktiviert, um überholende Requests zu verhindern.
- Der Ladeindikator besitzt zugänglichen Text wie „Bild wird geladen“; reine Bewegung ist nicht ausreichend.
- URL-Loading und tatsächliches `<img>`-Loading sind getrennte Phasen. Ein leerer `src` oder vorzeitiges `onError` darf nicht fälschlich „Bild konnte nicht geladen werden“ auslösen.
- Kein globales Seitenloading, keine vollständige Galerie-Revalidation und kein Skeleton-Neuaufbau aller Karten.

### 17.2 Neutrale Fehlerzuordnung

| Situation | Clienttext |
| --- | --- |
| unbekannter/sonstiger Öffnungsfehler | „Medium konnte nicht geöffnet werden.“ |
| abgelaufene oder nicht mehr nutzbare Vorschau | „Die Vorschau ist abgelaufen. Bitte erneut versuchen.“ |
| gelöscht, nicht `ready` oder nicht mehr vorhanden | „Das Medium ist nicht mehr verfügbar.“ |
| fehlende Session/Rolle/Projektberechtigung | „Zugriff nicht erlaubt.“ |
| URL gültig, Bilddecoder/Netzabruf scheitert | „Bild konnte nicht geladen werden.“ |

Die Servergrenze liefert stabile interne Fehlercodes und diese neutralen Texte, niemals rohe Providerfehler. Kein Fehler enthält URL, Bucket, Pfad, Token, Dateiname, Production-ID oder personenbezogene Daten. Bei Fehler bleiben Titel, Schließen und Retry fokussierbar; andere Galerieelemente werden nicht zerstört. Wiederholen löst eine neue autorisierte URL-Erzeugung aus, nicht bloß denselben abgelaufenen `src`.

## 18. Browserhistory und Deep Links

### 18.1 Varianten

**Rein lokaler Zustand:** kleinste Implementierung, keine URL mit Medien-ID, kein serverseitiger Routingzustand und kein zusätzlicher Historyeintrag. Browser-Zurück schließt nicht automatisch; Neuladen schließt die Lightbox. Kein Direktlink.  
**Queryparameter `media={id}`:** Back kann schließen und Direktlinks sind denkbar, aber Medien-ID erscheint in URL/History, Initialautorisierung und ungültige Zustände werden komplexer, und jeder Bildwechsel kann History aufblasen.  
**Eigene Route:** sauberer Direktlink und native Browsernavigation, aber zusätzliche Route, Loading-/Fehlerseite, Autorisierungs- und Cachearchitektur. Für eine kleine modale Ansicht unverhältnismäßig.  
**History API ohne Deep Link:** könnte Back zum Schließen nutzen, erfordert aber Popstate-/Cleanup-Logik und schafft einen indirekten Navigationsvertrag ohne echte adressierbare Ressource.

### 18.2 MVP-Empfehlung

Lokaler Clientzustand, keine eigene Route, kein Queryparameter und kein Deep Link. Browser-Zurück schließt nicht zwingend; Schließen-Button und Escape sind die verbindlichen Wege. Vorteile sind minimale Datenexposition und Komplexität. Nachteile sind fehlende Teilbarkeit, kein Wiederherstellen nach Reload und eine möglicherweise nicht erwartungsgemäße Zurück-Taste. Ob Browser-Zurück dennoch schließen soll, bleibt eine Owner-Entscheidung und wäre ein separates History-Inkrement.

## 19. URL-, Referrer- und Cacheverhalten

- Signed URLs werden nicht in DB, Audit-Log, Analytics, Local Storage oder Session Storage persistiert.
- Sie werden nicht als Queryparameter der KlimaGuy-Seite und nicht in einen Deep Link übernommen.
- Keine Ausgabe in Server-/Clientlogs oder Fehlertelemetrie.
- Keine statisch generierte oder langlebig gecachte Lightbox; autorisierte Darstellung bleibt dynamisch und benutzerspezifisch.
- Die frische URL lebt nur im lokalen React-Zustand und im `src`/PDF-Ziel bis Schließen, Navigation oder Ablauf. Beim Wechsel wird die alte Referenz verworfen.
- `referrerPolicy="no-referrer"` bleibt für direkte Storageabrufe sinnvoll. Browserentwicklertools und Netzwerk-History können eine URL technisch sichtbar machen; das ist eine unvermeidbare Restwirkung berechtigter Anzeige.
- Der Browser-/CDNcache kann bereits geladene Bytes auch nach URL-Ablauf halten. TTL verhindert neue autorisierte Abrufe nicht rückwirkend und widerruft keinen vorhandenen Clientcache.
- Bei Ablauf wird neu autorisiert und neu signiert; TTL wird nicht durch Persistenz oder clientseitige Wiederverwendung verlängert.
- Kein Preload-Link, Service Worker Cache oder sonstiger persistenter Clientcache für Lightboxmedien.

## 20. Accessibility-Vertrag

Eine spätere Umsetzung muss mindestens erfüllen:

- `role="dialog"` und `aria-modal="true"`;
- zugänglicher, stabil zugeordneter Dialogtitel;
- Schließen-Button mit sichtbarem Text oder eindeutigem `aria-label`;
- Vor-/Zurück-Buttons mit „Vorheriges Bild“/„Nächstes Bild“, nicht allein Pfeilsymbol;
- sichtbarer und zugänglicher Bildindex „Bild X von Y“;
- sinnvoller Alt-Text ohne Originaldateiname;
- initialer Fokus, vollständige Fokusfalle und zuverlässige Fokus-Rückgabe;
- Escape zum Schließen;
- semantischer Bildbutton, dadurch Enter/Leertaste nativ;
- Hintergrund nicht interaktiv;
- Status/Fehler mit passendem `role="status"`/`role="alert"`, ohne wiederholte oder sensible Ansagen;
- Information nicht nur durch Farbe oder Icon;
- ausreichende Kontraste, Touchziele und sichtbare Fokuszustände;
- `prefers-reduced-motion`; keine automatische Animation notwendig;
- DOM-Reihenfolge entspricht visueller Reihenfolge;
- kein Fokusverlust bei URL-, Bild- oder Navigationsfehlern.

Manuelle Prüfung mit Tastatur und mindestens einem verbreiteten Screenreader ergänzt Komponententests; jsdom allein kann reale Fokus-, Inert-, Scroll- und Browserviewersemantik nicht vollständig validieren.

## 21. Performance

- Zulässige Originalbilder sind bis 15 MB groß. Die Galerie lädt bereits Originale als lazy Vorschauen; es gibt weiterhin keine Thumbnail-/Derivative-Pipeline.
- Eine Lightbox über die gleiche Originalressource kann bei gültigem Browsercache ohne erneuten Volltransfer erscheinen, darf darauf aber nicht vertrauen. Eine frische signierte URL kann je nach Cachekey/CDN-Verhalten einen erneuten Abruf verursachen.
- Mobile Netze machen Loading, Retry und ein bewusst einzelnes aktuelles Bild notwendig.
- Keine Vorab-Signierung oder kein Preloading aller großen Lightboxbilder.
- Im ersten Paket wird nur das aktuelle Bild geladen. Kein Vorladen von Nachbarbildern, bis Messdaten einen Nutzen gegenüber Datenvolumen zeigen.
- Keine Bildtransformation und kein spontaner Next.js-Optimierungsproxy im Lightboxpaket.
- Datensparsame Thumbnails/Derivate bleiben ausdrücklich **AP-13-05**. Falls mobile Messungen unvertretbare Ladezeit oder Datenmenge zeigen, ist AP-13-05 vor breitem Rollout vorzuziehen.
- URL-Refresh erzeugt einen zusätzlichen kleinen Server-/Storage-Signaturroundtrip pro Öffnen beziehungsweise Navigation. Das ist gegenüber dem Originaltransfer gering und sicherheitlich sinnvoll.

## 22. Security-Vertrag

Verbindlich für alle späteren Pakete:

1. Nur authentifizierte Admins und Reviewer über die zentrale `canViewProjectMedia`-Permission.
2. Zugeordnetes Projekt ist aktiv (`deleted_at IS NULL`).
3. Medium ist `ready` und `deleted_at IS NULL`.
4. Medien-ID und Projekt werden serverseitig über dieselbe DB-Zeile exakt gebunden; keine frei behauptete Zuordnung.
5. Bucket und Pfad stammen ausschließlich aus der nach RLS/Filter autorisierten DB-Zeile.
6. Keine freie Clientpfadangabe, keine Signierung eines Client-Buckets und keine generische Signier-Action.
7. Bestehender cookiegebundener Benutzerclient und RLS; keine Service Role im Browser oder normalen Lightboxpfad.
8. Private Speicherung; kein `getPublicUrl` und keine Public URL.
9. Signed URL nicht persistieren, loggen, auditieren oder an KI/Analytics weitergeben.
10. Keine Providerfehler, URLs, Pfade, Tokens oder Dateinamen im Clientfehler.
11. Keine Mutation: kein Upload, Update, Delete, Sortieren, Caption-/Kategorieediting oder Downloadworkflow.
12. Rollenentzug, Soft Delete oder Projektdeaktivierung verhindern jede neue URL. Eine bereits ausgegebene URL bleibt als Bearer-Link bis Ablauf und möglicherweise als Browsercache-Restwirkung bestehen.

Eine Server Action ist kein Ersatz für RLS. Sie braucht explizite Defense-in-Depth-Filter und externe Zod-Validierung. Eine Medien-ID gilt als kontrollierbarer Bezeichner, nicht als Geheimnis oder Berechtigungsnachweis.

## 23. Teststrategie für spätere Implementierung

Dieses Audit führt keine Tests aus und ändert keine Tests. Die spätere Strategie soll gezielt abdecken:

### 23.1 Permission und serverseitige Autorisierung

- Admin erlaubt;
- Reviewer erlaubt;
- nicht authentifiziert verweigert;
- fehlende oder ungültige Rolle fail closed;
- inaktives/fremdes Projekt verweigert;
- pending/failed/deleted/fremdes Medium verweigert;
- exakte Medien-/Projektbindung;
- Bucket und Pfad nur aus DB, ignorieren beziehungsweise verwerfen freie Clientfelder;
- kein Service Role, keine Public URL, kein Logging der Signed URL;
- Ergebnis/Fehler enthalten keine internen Pfade oder Providerdetails.

### 23.2 Lightbox-Komponente

- öffnet nur Bildtrigger;
- PDF wird nie in der Lightbox gerendert;
- Schließen-Button und Backdropentscheidung;
- Escape schließt;
- initialer Fokus und Fokus-Rückgabe zum exakten Auslöser;
- Tab/Shift+Tab bleiben im Overlay;
- Hintergrund nicht fokussierbar/interaktiv;
- Pfeilnavigation in Bildreihenfolge und Überspringen von PDFs;
- Anfang/Ende nicht zyklisch und korrekte deaktivierte Controls;
- Bildindex für 1 und mehrere Bilder;
- Kategorie, Caption und Alt-Text;
- URL-Loading getrennt von Bildloading;
- neutraler URL-, Ablauf- und Bildfehler;
- Retry fordert eine neue URL an;
- Escape/Schließen bleiben im Fehler-/Loadingzustand nutzbar;
- schnelle Navigation zeigt keine überholte URL/Metadaten;
- Cleanup von Listenern, Scroll-Sperre und Fokus bei Unmount.

### 23.3 Signed-URL-Refresh

- pro Öffnen nur aktuelles Medium signiert;
- bestehende TTL-Konstante 120 Sekunden;
- erneute URL-Erzeugung bei Navigation und Retry;
- abgelaufene initiale URL wird nicht blind wiederverwendet;
- keine freie `project_id`, Bucket- oder Pfadautorität;
- keine Persistenz und keine Mutation;
- stabile neutrale Fehlercodes für nicht verfügbar, nicht erlaubt, abgelaufen/erneut versuchen und generischen Fehler.

### 23.4 PDF

- öffnet neues Tab;
- verständlicher Linktext und Ankündigung des neuen Tabs;
- `noopener noreferrer`/äquivalente sichere Fensterbeziehung und `no-referrer`;
- sichere URL-Erneuerung beim Klick;
- Popupblocker-/Fehlerpfad hinterlässt kein leeres Tab;
- keine Einbettung, kein `iframe`, kein PDF.js und kein Downloadbutton.

### 23.5 Architektur- und Regressionchecks

- Galerie bleibt serverseitig geladen;
- keine Client-Datenbankquery und keine Client-Storagequery;
- keine Service Role;
- keine Mutation;
- keine neue externe Abhängigkeit und keine `package.json`-Änderung;
- keine Lightbox- oder PDF-Viewer-Bibliothek;
- Browserchecks für Tastatur, Screenreader, mobile Viewports/Safe Areas, Landscape, Scroll-Sperre, langsames Netz, 15-MB-Bild, Ablauf und Browsercache;
- bestehende Admin-/Reviewer-Galerie, Sortierung, Lazy Loading und PDF-Karte regressionsfrei.

## 24. Kleine Folgepakete

### AP-13-02-01 — Image Lightbox

Nur Bilder, lokaler Clientzustand, Dialogsemantik, Fokusmanagement, Escape, nicht zyklische Pfeilnavigation, Bildindex und mobile `object-contain`-Darstellung. Keine neue Abhängigkeit, keine PDF-Einbettung und keine Mutation. Die konkrete Nutzung der vorhandenen URL ist bis AP-13-02-02 als zeitlich begrenzte Zwischenstufe zu kennzeichnen; keine TTL-Verlängerung.

### AP-13-02-02 — Signed URL Refresh on Open

Schmale serverseitige Einzelautorisierung und URL-Erneuerung für das aktuelle Bild beziehungsweise PDF. Nur validierte Medien-ID als Clientinput, erneute Rollen-/Projekt-/Statusprüfung, Bucket/Pfad aus DB, lokales Loading und neutrale Fehler. Keine Mutation.

Das Audit bestätigt dieses Paket als erforderlich. Für einen produktiv nutzbaren Lightboxfluss sollen AP-13-02-01 und AP-13-02-02 gemeinsam abgenommen werden; die Trennung dient kleiner Reviewbarkeit, nicht dem dauerhaften Betrieb mit ablaufenden Initial-URLs.

### AP-13-02-03 — Lightbox Regression and Production Validation

Gezielte automatisierte Regressionen und reale Browser-/Accessibility-/Mobil-/TTL-/Cachevalidierung. Keine Mutation. Erst dieses Paket kann die Annahmen gegen die Zielumgebung prüfen; es macht das Gesamtprodukt nicht automatisch production-ready.

## 25. Offene Owner-Entscheidungen

Keine der folgenden Entscheidungen wird durch dieses Audit eigenmächtig final gesetzt. Die technische Empfehlung steht jeweils in Klammern:

1. Lightbox ausschließlich für Bilder? (**ja**)
2. PDFs im neuen Tab? (**ja**)
3. Vorhandene Signed URL oder Erneuerung beim Öffnen? (**Erneuerung je Öffnen**)
4. Escape schließt? (**ja**)
5. Pfeiltasten für Vor/Zurück? (**ja**)
6. Zyklische Navigation? (**nein, Anfang/Ende deaktivieren**)
7. Bildindex „Bild X von Y“? (**ja**)
8. Caption in der Lightbox? (**ja, wenn vorhanden**)
9. Kategorie in der Lightbox? (**ja, textlich**)
10. Datum in der Lightbox? (**optional; für kleinsten Scope nein**)
11. Mobile Swipe-Gesten jetzt oder später? (**später**)
12. Soll Browser-Zurück die Lightbox schließen? (**im lokalen MVP nein; später separat bewerten**)
13. Keine externe Bibliothek? (**ja**)
14. Soll ein Backdrop-Klick schließen? (**optional; niemals einziger Schließweg**)
15. Ist die unoptimierte Originalbilddarstellung bis AP-13-05 für den begrenzten internen MVP akzeptabel? (**nur mit Messung/Validierung**)

Owner-Freigabe dieser Punkte ist Voraussetzung für Implementierung; **READY FOR OWNER DECISION** bedeutet ausdrücklich nicht `APPROVED FOR IMPLEMENTATION`.

## 26. Kleinstes nächstes Paket und Status

**Kleinstes nächstes Paket:** **AP-13-02-01 — Image Lightbox**.

Empfohlene Reihenfolge:

1. AP-13-02-01 — Image Lightbox;
2. AP-13-02-02 — Signed URL Refresh on Open;
3. AP-13-02-03 — Lightbox Regression and Production Validation.

**AP-13-01 READ-ONLY GALLERY IMPLEMENTED**  
**LIGHTBOX NOT IMPLEMENTED**  
**OVERALL PRODUCT NOT PRODUCTION READY**  
**AUDITSTATUS: READY FOR OWNER DECISION**

## AP-13-02-01 Image Lightbox Implementation Result

AP-13-02-01 ergänzt die bestehende serverseitig autorisierte Read-only-Galerie ausschließlich um eine lokale Client-Insel für JPEG-, PNG- und WebP-Bilder. Die Insel erhält nur `media_id`, `category_label`, `caption`, `signed_view_url` und einen kontrollierten `alt_text`; sie führt keine Datenbank-, Storage- oder sonstige Clientquery aus. Projektdetailseite, Gallery-Service, Berechtigungsprüfung und sortiertes Galerie-DTO bleiben serverseitig und unverändert.

- Bildkarten verwenden semantische Buttons mit sichtbarem Fokuszustand und öffnen nativ per Maus, Enter oder Leertaste. PDF-Karten bleiben außerhalb der Client-Insel unverändert als klar bezeichnete Dokumentkarten mit `target="_blank"` und `rel="noopener noreferrer"`; PDFs werden weder eingebettet noch in Bildindex oder Navigation aufgenommen.
- Das portalisierte Overlay besitzt `role="dialog"`, `aria-modal="true"`, einen zugänglichen Titel und sichtbare Schließen-, Vorheriges-Bild- und Nächstes-Bild-Buttons. Escape und ein direkter Klick auf den abgedunkelten Hintergrund schließen; Klicks innerhalb des Dialogs schließen nicht.
- Beim Öffnen wird der auslösende Bildbutton gespeichert und der Schließen-Button fokussiert. Eine lokale Tab-/Shift-Tab-Fokusfalle hält den Fokus im Dialog. Der Hintergrund wird mit `inert` deaktiviert, der Body-Scroll unter Bewahrung des vorherigen Werts gesperrt und beim Schließen wiederhergestellt; anschließend kehrt der Fokus zum Auslöser zurück.
- Pfeil links/rechts und die sichtbaren Buttons navigieren ausschließlich in der bereits übergebenen Bildreihenfolge. Die Navigation ist nicht zyklisch; die jeweilige Randaktion ist korrekt deaktiviert. Der Text `Bild X von Y` zählt ausschließlich Bilder.
- Das große Bild verwendet einen viewportbegrenzten `object-contain`-Bereich. Mobile Safe-Area-Abstände, ausreichend große Bedienelemente und ein begrenzt scrollbarerer Captionbereich erhalten Schließen, Navigation und Metadaten auf kleinen wie großen Viewports erreichbar. Kategorie und vorhandene Caption werden angezeigt; fehlende Captions erzeugen keinen Platzhalter und ein Datum wird nicht wiederholt.
- Während eines Bildabrufs erscheint ein neutraler lokaler Ladezustand. Ein Ladefehler ersetzt den Bildbereich durch `Das Bild konnte nicht geladen werden.`; Dialog, Navigation und Schließen bleiben bedienbar und es werden weder URL noch Providerdetails ausgegeben.
- Verwendet wird ausschließlich die bereits im Galerie-DTO vorhandene `signed_view_url`. Es gibt keinen Signed-URL-Refresh, keine Server Action, keinen neuen Service, keine Persistierung und keine neue externe Abhängigkeit.
- Gezielte Vitest-/Testing-Library-Tests decken Dialogsemantik, Bildbutton-Tastaturzugang, Öffnen/Schließen, Fokus und Fokusfalle, Scrollsperre, Hintergrundklick, nicht zyklische Button-/Pfeilnavigation, Bildindex und Reihenfolge, Caption vorhanden/fehlend, Alt-Text, Lade-/Fehlerzustand sowie die fortbestehende PDF-Abgrenzung ab.

**IMAGE LIGHTBOX IMPLEMENTED**

**SIGNED URL REFRESH ON OPEN NOT IMPLEMENTED**

**PDF LIGHTBOX NOT IMPLEMENTED**

**OVERALL PRODUCT NOT PRODUCTION READY**

## 27. Scope-Bestätigung

Dieses Paket ist **ausschließlich Analyse und Dokumentation**. Es enthält ausdrücklich:

- keine Implementierung;
- keine UI-Änderung;
- keine Komponente;
- keine Lightbox;
- keinen Dialog und kein Overlay;
- keine Server Action;
- keinen Service;
- keine Tests, Teständerungen oder Anwendungstest-Ausführung;
- keine Migration;
- keine SQL-Änderung;
- keine RPC;
- keine RLS-Änderung;
- keine Storage-Policy;
- keine Signed-URL-Erzeugung oder -Änderung;
- keine Public URL;
- keinen Download;
- keine PDF-Einbettung;
- keine neue externe Abhängigkeit;
- keine `package.json`-Änderung;
- keine KI;
- keine WhatsApp-Integration.

Alle genannten Komponenten, Actions, Zustände und Tests sind ausschließlich eine Planung für spätere, separat freizugebende Pakete. In diesem Paket wurde nur diese Auditdatei erstellt.
