# AP-13-02-02 — Signed URL Refresh on Open Audit

**Audit-ID:** `KG-AUDIT-2026-07-30-AP13-02-02-SIGNED-URL-REFRESH-V1`  
**Datum:** 2026-07-30  
**Branch:** `codex/audit-ap13-02-02-signed-url-refresh`  
**Art:** Architektur-, Security- und UX-Audit; ausschließlich Analyse und Dokumentation  
**Auditstatus:** **READY FOR OWNER DECISION**

## 1. Executive Summary

AP-13-01 und AP-13-02-01 sind implementiert. Die serverseitig geladene Galerie liefert Admin und Reviewer für aktive, fertige Projektmedien kurzlebige Signed View URLs; die Bild-Lightbox verwendet beim Öffnen jedoch weiterhin die bereits beim initialen Seitenrequest erzeugte URL. Nach deren 120 Sekunden TTL kann ein späteres Öffnen scheitern. Dass eine Karte zuvor sichtbar war, darf weder Verfügbarkeits- noch Autoritätsnachweis für einen späteren Zugriff sein.

Empfohlen wird **Variante B: eine kleine dedizierte Server Action für genau ein geöffnetes Medium**. Sie nimmt ausschließlich `project_id` und `media_id` über ein strikt unbekannte Schlüssel ablehnendes UUID-Schema an, authentifiziert erneut, prüft das aktive Profil und `canViewProjectMedia`, bindet Medium und aktives Projekt exakt, liest Bucket und kanonischen Pfad ausschließlich aus einer RLS-geschützten DB-Zeile und ruft danach die installierte Einzelmethode `createSignedUrl(path, 120)` auf. Die Antwort ist schmal; die URL existiert nur für die aktuelle Öffnung im lokalen React-State.

Die empfohlene Client-Insel öffnet die Bild-Lightbox direkt in einen lokalen Ladezustand. Ein monotoner Sequenzzähler verwirft verspätete Antworten nach Navigation oder Schließen. PDFs erhalten pro Aktivierung eine neue URL und werden über ein synchron zur Nutzeraktion geöffnetes, vom Opener getrenntes leeres Tab erst nach Erfolg navigiert. Keine Seite wird neu geladen oder revalidiert. Eine RPC, Migration, Service Role, Client-DB-/Storagequery, Public URL oder persistierte URL ist weder nötig noch empfohlen.

Dieses Audit erteilt **keine Implementierungsfreigabe**. Alle als offen gekennzeichneten Produktentscheidungen bleiben beim Owner.

## 2. Baseline, Remote-Status und Prüfmethode

- Der Arbeitsbaum war vor Beginn sauber; `git status --short --branch` zeigte `## work`.
- Saubere lokale Baseline und Ausgangs-HEAD: `8bf552a9f790e4be375797a77cc4ce85c0b7e42e`.
- Im Checkout ist **kein Remote konfiguriert**; `git remote -v` blieb leer. `git fetch origin`, `git rev-parse origin/main` und `git merge-base HEAD origin/main` waren deshalb nicht möglich.
- Mangels `origin/main` wurde der saubere lokale HEAD als Baseline verwendet. Ob er exakt einem externen aktuellen `main` entspricht, ist nicht verifizierbar; diese Einschränkung betrifft den Remotevergleich, nicht den statischen Codebefund.
- Vollständig gelesen wurden `2026-07-30-ap13-02-gallery-lightbox-audit.md` (Audit-ID `KG-AUDIT-2026-07-30-AP13-02-GALLERY-LIGHTBOX-V1`), `2026-07-30-ap13-00-project-media-gallery-audit.md` und `2026-07-30-ap12-core-production-validation.md`.
- Vollständig geprüft wurden Projektdetailseite, Galerie-Action/-Service/-DTO, Galerie-, Bild- und Lightbox-Komponenten, `canViewProjectMedia`, relevante Schemas, Galerie- und Lightbox-Tests, Supabase-Server-/Browserclients sowie vorhandene Action-, Service-, Revalidation-, Fehler- und Action-State-Muster.
- Repositoryweit geprüft wurden `createSignedUrl`/`createSignedUrls`/Public-URL-Nutzung, serverseitige Storage-Helper, RLS-/Storage-Grenzen, Mass-Assignment-/DTO-Grenzen und Client-/Server-Component-Grenzen.
- `package.json` deklariert `@supabase/supabase-js` mit `^2.45.4`; lokal installiert ist `2.111.0`. Die zugehörige installierte Storage-JS-Implementierung bietet die Einzelmethode `createSignedUrl(path, expiresIn, options?)` und die Batchmethode `createSignedUrls(paths, expiresIn, options?)`.
- Dieses Dokument enthält bewusst keine konkrete Signed URL, keinen Storagepfad, Token, reale ID, Dateinamen oder personenbezogene Daten.

## 3. Verbindliche Ausgangslage

- **AP-13-01 READ-ONLY GALLERY IMPLEMENTED.**
- **AP-13-02-01 IMAGE LIGHTBOX IMPLEMENTED.**
- Admin und Reviewer dürfen aktive `ready`-Medien über `canViewProjectMedia` sehen.
- Projekt- und Medienzugriff werden im Gallery-Service serverseitig geprüft; die DB- und Storagezugriffe laufen über den authentifizierten Supabase-Serverclient und vorhandene RLS/Storage-Policies.
- Die Galerie lädt höchstens 50 aktive `ready`-Medien und erzeugt beim initialen Seitenrequest ihre Signed View URLs per `createSignedUrls` mit 120 Sekunden TTL.
- Das Gallery-DTO enthält `signed_view_url`, aber weder Bucket, Storagepfad noch Originaldateinamen. Das ist eine bestehende schmale Ausgabegrenze, keine Eingabeautorität.
- Die Lightbox verwendet derzeit genau die im Galerie-DTO enthaltene `signed_view_url`. Bleibt die Projektseite länger als 120 Sekunden geöffnet, kann sie beim späteren Öffnen abgelaufen sein.
- PDF-Karten verlinken derzeit ebenfalls die initial erzeugte URL in einen neuen Tab.
- **SIGNED URL REFRESH ON OPEN NOT IMPLEMENTED.** Es gibt weder gezielte Erneuerung beim Klick noch Fehler-Recovery durch eine neue URL.
- Es existiert keine Public URL. Signed URLs werden weder in DB noch Local Storage noch Session Storage gespeichert.
- Es existiert keine Client-Datenbankquery und keine Client-Storagequery.
- **OVERALL PRODUCT NOT PRODUCTION READY.**

## 4. Audit-Ziel und verbindlicher Scope

Ziel ist die kleinste sichere Architektur, die unmittelbar beim Öffnen **genau eines** Bildes oder PDFs eine neue kurzlebige View-URL erzeugt. In Scope sind Admin und Reviewer, aktives Projekt, exakt daran gebundenes aktives Medium, `upload_status = ready`, `deleted_at IS NULL`, erlaubter MIME-Type, privater Bucket, kanonischer DB-Pfad und read-only Anzeige.

Nicht in Scope sind Batch-Refresh, Hintergrundtimer, Nachbarbild-Preloading, Download-Disposition oder Downloadbutton, Medienmutation/-bearbeitung, Soft Delete, Zoom, PDF-Einbettung, PDF.js, Thumbnailpipeline, Metadatenbearbeitung, Deep Links, KI oder WhatsApp.

## 5. Architekturvarianten

### 5.1 Variante A — bestehende URL, bei Fehler gesamte Projektseite neu laden

**Vorteil:** geringster neuer Code; initial gültige oder gecachte Bilder können sofort erscheinen.  
**Nachteile:** schlechte und ungezielte UX. Ein Reload erneuert bis zu 50 URLs statt eines Mediums, lädt Projekt, Notizen und Galerie erneut, verliert Scrollposition und kann Fokus sowie Lightboxzustand zerstören. Ein PDF-Tab hat keinen sauberen Recoverypfad zur Ursprungskarte. Ablauf und echter Ladefehler bleiben schwer unterscheidbar. Die Berechtigung wird nicht gezielt zum Öffnungszeitpunkt geprüft.  
**Urteil:** nicht empfohlen.

### 5.2 Variante B — dedizierte Server Action für ein Medium

**Vorteile:** passt zur bestehenden Server-Action-/Servicearchitektur; Session, Profil, Rolle und Permission werden serverseitig geprüft. Eine strikte Zwei-ID-Eingabe verhindert freie Bucket-/Pfadwahl. Die enge DB-Abfrage bindet Projekt und Medium, bevor exakt ein Storageobjekt signiert wird. Das Ergebnis lässt sich als diskriminierte, schmale Action-Antwort testen und lokal in Lightbox/PDF-Control integrieren. Lade- und Fehlerzustände bleiben auf den aktivierten Gegenstand begrenzt.  
**Nachteile:** ein zusätzlicher Roundtrip pro Öffnung/Bildwechsel; Client benötigt Sequenzschutz und PDF-Popupbehandlung.  
**Urteil:** **eindeutige Empfehlung**.

### 5.3 Variante C — Route Handler

**Vorteile:** expliziter HTTP-Endpunkt; geeignet, falls künftig Nicht-React-Clients oder eine bewusst versionierte HTTP-API benötigt werden. HTTP-Status und Header könnten direkt modelliert werden.  
**Nachteile:** zusätzliche öffentliche API-Oberfläche samt Methoden-, Content-Type-, Origin-/CSRF- und Requestgrenzen. GET wäre wegen URL-Ausgabe und Cache-/Historienrisiken ungeeignet; POST müsste explizit `Cache-Control: no-store`, Auth, Body-Limit und dieselben Validierungen erhalten. Das dupliziert Infrastruktur gegenüber dem vorhandenen Server-Action-Muster, ohne aktuellen Consumer-Vorteil. Eine Server Action beseitigt Autorisierungspflichten zwar nicht, hält die Oberfläche aber enger.  
**Urteil:** derzeit unnötig; nur bei künftig unabhängigem HTTP-Consumer neu bewerten.

### 5.4 Variante D — alle URLs regelmäßig im Hintergrund erneuern

**Vorteil:** häufig bereits gültige URL beim Klick.  
**Nachteile:** unnötige Storageaufrufe für bis zu 50, meist ungenutzte Medien; Aktivität in Hintergrundtabs; überlappende Timer und Antworten; ablaufende ungenutzte URLs; komplexer Lifecycle und größeres Missbrauchspotenzial. Rollen-/Projektänderungen werden zwischen Intervallen nicht zuverlässig abgebildet.  
**Urteil:** klar ablehnen.

### 5.5 Entscheidungsvorlage

**Variante B — Client-Lightbox/PDF-Control → dedizierte async Server Action → dedizierter read-only Signed-URL-Service → bestehender authentifizierter Supabase-Serverclient → RLS-geschützte Einzelabfrage → `createSignedUrl` mit DB-Pfad → schmale Antwort.** Keine Migration, RPC, Service Role oder Client-Storagequery.

## 6. Eingabe-, Mass-Assignment- und Antwortgrenze

### 6.1 Eingabe

Das spätere Schema ist ein `z.object({ project_id: UUID, media_id: UUID }).strict()`. Zulässig sind ausschließlich:

- `project_id`;
- `media_id`.

Fehlende oder ungültige UUIDs werden neutral abgelehnt. Durch `.strict()` werden zusätzliche Schlüssel abgelehnt, insbesondere `storage_bucket`, `storage_path`, Signed URL, TTL, MIME-/Medientyp, Uploadstatus, `deleted_at`, `uploaded_by`, beliebige Patchfelder oder verschachtelte/arbiträre Objekte. Der Client kann weder Bucket, Pfad noch TTL bestimmen. Das Schema soll als eigenes, gezielt getestetes Inputschema an der Action-/Servicegrenze liegen; kein ungeprüftes Objekt wird an Supabase weitergereicht.

### 6.2 Schmale Antwort

Empfohlen ist eine diskriminierte Struktur:

```ts
| { success: true; media_id: string; signed_view_url: string; expires_in_seconds: 120 }
| { success: false; code: "invalid_input" | "not_authenticated" | "not_authorized" | "unavailable" | "signing_failed"; error: string }
```

`expires_in_seconds` ist informativ und serverbestimmt; alternativ kann es entfallen, wenn kein Clientverhalten davon abhängt. Nicht ausgegeben werden Bucket, Pfad, Original-/gespeicherter Dateiname, `uploaded_by`, Providerantwort/-fehler, Tokenbestandteile, Authinformationen oder Kundendaten. Fehler enthalten niemals eine URL. Codes sind kontrollierte UI-Mappings, keine detaillierten Existenzorakel.

## 7. Server-, Datenbank- und Storagegrenze

Die Sicherheit darf nicht davon abhängen, dass das Medium zuvor in der Galerie sichtbar war. Jede Anfrage prüft erneut und fail-closed, in dieser Reihenfolge:

1. strikte Eingabe und gültige `project_id`/`media_id`;
2. `supabase.auth.getUser()` und damit Authentifizierung;
3. vorhandenes aktives/auswertbares Profil, `roleSchema` und gültige Rolle;
4. `canViewProjectMedia(role)` — derzeit Admin oder Reviewer, keine neue Rolle/Permission;
5. aktives Projekt (`projects.id = project_id`, `deleted_at IS NULL`);
6. enge einzelne Medienabfrage mit `id = media_id` **und** `project_id = project_id`;
7. `upload_status = ready` und `deleted_at IS NULL`;
8. `storage_bucket = project-media`;
9. erlaubte Kombination aus Bild-MIME (`image/jpeg`, `image/png`, `image/webp`) oder PDF (`application/pdf`) und Medientyp;
10. extern gelesene DB-Zeile per Zod validieren und kanonischen Pfad prüfen: bestehendes Format `projects/{project_id}/originals/{media_id}/{stored_filename}`; dafür nur die notwendigen internen Spalten selektieren;
11. erst danach `supabase.storage.from("project-media").createSignedUrl(dbPath, 120)`.

Eine direkte, enge, RLS-geschützte `public.project_media`-Einzelabfrage mit dem authentifizierten Serverclient genügt. Bestehende Tabellen-RLS lässt Admin/Reviewer ohnehin nur aktive `ready`-Zeilen aktiver Projekte lesen; explizite Filter und Servicevalidierung sind zusätzliche, verständliche Defense-in-Depth. Die aktive Projektprüfung kann als eigene enge Abfrage oder durch eine explizite gebundene Relation erfolgen, muss semantisch aber im Service sichtbar bleiben. Die Storage-SELECT-Policies spiegeln Admin/Reviewer, privaten Bucket, `ready`, nicht gelöscht und aktives Projekt.

**Keine neue RPC und keine Migration sind nötig.** Eine Service Role würde die vorhandene RLS umgehen und ist ausdrücklich ausgeschlossen. Es ist keine generische Medienquery und keine Query im Client vorzusehen.

Vorhandene serverseitige Storage-Helper betreffen privilegiertes Purging und sind für eine View-URL weder fachlich noch sicherheitstechnisch wiederzuverwenden. Der Gallery-Adapter zeigt bereits den korrekten authentifizierten Storagezugriff; der neue Service benötigt lediglich einen schmalen Einzel-Adapter.

## 8. Installierte Signed-URL-Methode und TTL

### 8.1 API-Befund

Die tatsächlich installierte Supabase-JavaScript-/Storage-JS-Version `2.111.0` unterstützt `createSignedUrl(path, expiresIn, options?)`. Für genau ein Medium ist diese offiziell typisierte Einzelmethode vorzuziehen; `createSignedUrls` bleibt nur für die bestehende initiale Galerie relevant. Bucket und Pfad kommen ausschließlich aus der validierten DB-Zeile. Es wird weder `getPublicUrl` noch `download`/Download-Disposition verwendet.

### 8.2 TTL-Abwägung

| TTL | Bewertung |
| --- | --- |
| 60 Sekunden | Kleinstes Bearer-Fenster, aber knapp für bis zu 15 MB große Originalbilder, langsames Mobilnetz, asynchronen Roundtrip und Start eines PDF-Tabs. Erhöht vermeidbare Ablauf-/Retryfehler. |
| 120 Sekunden | Ausgewogener Zeitraum für Roundtrip, große Bilder und PDF-Tabstart; bestehende Domainkonstante und bereits validierter Ausgangspunkt. Die URL wird nutzungsnah erzeugt und nicht persistiert. |
| 300 Sekunden | Robustere lange Transfers, vergrößert aber das Bearer-Fenster deutlich. Da jede Wiederöffnung gezielt neu signiert werden kann, ist der Mehrwert für den MVP gering. |

**Technische Empfehlung: 120 Sekunden beibehalten.** Der Abruf muss innerhalb der TTL begonnen werden; ein Browser/Provider kann laufende Range-/Folgeanfragen dennoch unterschiedlich behandeln. Deshalb bleibt gezielte Neuerzeugung bei erneuter Öffnung der Recoverypfad, nicht eine pauschale Verlängerung. Der Client darf die TTL nicht setzen. Eine spätere Änderung erfolgt nur über eine serverseitige Konstante und nach Messung realer 15-MB-/Mobil- und PDF-Fälle.

## 9. Bild-Lightbox und Navigation

### 9.1 Öffnung

1. Nutzer aktiviert den bestehenden semantischen Bildbutton.
2. Die Lightbox öffnet unmittelbar, hält Fokus-/Dialogsemantik stabil und zeigt lokalen Loadingzustand ohne alte große URL.
3. Die Client-Insel sendet nur `project_id` und `media_id` an die Action.
4. Nach erfolgreicher Neuprüfung und Signierung wird nur die zur aktiven Requestsequenz und Medien-ID passende URL angezeigt.
5. Bei Fehler bleibt die Galerie unverändert; die Lightbox zeigt neutrales lokales Feedback.
6. Schließen bleibt während Loading möglich. Beim Schließen werden URL und Fehler aus dem State entfernt und der Sequenzzähler ungültig gemacht; Fokus kehrt zum Trigger zurück.
7. Eine späte Antwort darf weder den Dialog erneut öffnen noch State eines geschlossenen Dialogs sichtbar machen.

Direktes Öffnen mit Loading ist gegenüber „erst nach Erfolg einblenden“ empfohlen: unmittelbares Feedback, stabiler Fokus und explizit schließbarer Vorgang. Es bleibt eine Owner-Entscheidung.

### 9.2 Vor/Zurück

- Die bestehende, serverbestimmte Bildreihenfolge und der Bildindex bleiben maßgeblich; PDFs zählen nicht mit.
- Jeder tatsächlich ausgewählte neue Bildindex startet genau eine frische, mediengebundene Anfrage. Alte URL, Lade- und Fehlerzustände werden vorher zurückgesetzt.
- Keine Vorab-Signierung der Nachbarn, keine zyklische Navigation.
- Navigation während Loading darf kontrolliert möglich bleiben: sie invalidiert die alte Anfrage und lädt das Ziel. Das reagiert schneller als ein Lock; Doppelauslösung desselben Zieles wird verhindert.
- Innerhalb derselben erfolgreichen Anzeige desselben Bildes darf die aktuelle URL wiederverwendet werden, etwa solange kein Bildwechsel und kein Schließen erfolgt. Zurücknavigation nach Auswahl eines anderen Bildes gilt als neuer Bildwechsel und lädt frisch.
- Nach Schließen und erneutem Öffnen wird immer eine neue URL angefordert; kein sitzungsübergreifender URL-Cache.

## 10. PDF-Integration

Empfohlenes Verhalten:

1. Nutzer aktiviert die PDF-Control; diese setzt lokal Pending und verhindert Doppelklick.
2. Noch synchron innerhalb der vertrauenswürdigen Nutzeraktion wird ein neutrales leeres Tab/Fenster geöffnet, damit Popupblocker den späteren asynchronen Schritt nicht verwerfen.
3. Der Code trennt den Opener sofort (`newWindow.opener = null`). Wo `window.open`-Features genutzt werden, sind `noopener,noreferrer` zu verlangen; da einige Browser bei `noopener` keinen steuerbaren `WindowProxy` liefern, muss die konkrete Implementierung browserübergreifend getestet werden. Keine Ziel-URL wird in Queryparametern transportiert.
4. Die Action erhält ausschließlich beide IDs. Erst bei Erfolg wird `location` des gehaltenen Fensters auf die neue Signed URL gesetzt.
5. Bei Fehler wird das leere Fenster geschlossen und in der Ursprungskarte „Das Dokument konnte nicht geöffnet werden.“ gezeigt. Liefert `window.open` sofort `null`, wird die Anfrage nicht blind in eine Retryschleife geschickt, sondern ein neutraler Hinweis zum blockierten Öffnen angezeigt.

Eine erst nach dem `await` ausgeführte `window.open(url)`-Variante ist popupblockeranfälliger. Normale Navigation im aktuellen Tab wäre technisch einfacher und sicher vom Popupblocker unabhängig, verlässt aber Projektkontext und Pending-/Fehleroberfläche. Für das gewünschte neue Tab ist daher das synchron reservierte, sofort vom Opener getrennte Fenster die zuverlässigste Empfehlung. Kein `iframe`, PDF.js oder Downloadbutton.

## 11. Loading- und Fehlerzustände

### 11.1 Bild

- lokaler Status `loading | ready | error`, gekoppelt an Medien-ID und Sequenz;
- „Vorschau wird erneuert …“ oder bestehendes „Bild wird geladen …“ für die Actionphase, ohne globales Seitenloading;
- Schließen stets möglich; Vor/Zurück kontrolliert wie oben;
- niemals alte URL unter Metadaten eines neuen Bildes;
- Actionfehler und anschließender `<img>`-Ladefehler getrennt behandelbar, aber beide ohne technische Details.

### 11.2 PDF

- lokale Beschriftung **„Dokument wird geöffnet …“** als Empfehlung;
- Control während Pending deaktivieren und `aria-busy`/Statussemantik verwenden;
- Doppelklick/Doppelsubmit verhindern;
- bei Fehler neutrales Feedback in der Karte, kein globales Loading.

### 11.3 Stabile deutsche Fehlermappings

- generisch: „Das Medium konnte nicht geöffnet werden.“
- nicht mehr aktive/gebundene Zeile: „Das Medium ist nicht mehr verfügbar.“
- Auth-/Permissionfehler: „Der Zugriff ist nicht erlaubt.“
- transienter Signatur-/Providerfehler: „Die Vorschau konnte nicht erneuert werden.“
- PDF-Control: „Das Dokument konnte nicht geöffnet werden.“

Die Granularität darf kein Existenzorakel erzeugen: falsche Projektbindung, gelöscht, pending/failed, falscher Bucket/Pfad und nicht sichtbare Zeile können gemeinsam als nicht verfügbar abgebildet werden. Keine Providerfehler, URLs, Pfade, Buckets, Tokens oder SQL-Texte gelangen in UI, Action-State oder Logs.

## 12. Race Conditions und verbindliches Verhalten

Ein kleiner monotoner Request-Sequenzschutz (`requestSequenceRef`) in der vorhandenen Client-Insel ist gegenüber einer neuen State-Library empfohlen:

- **Schnelle Bildklicks/Bildnavigation:** Jede gültige Auswahl erhöht die Sequenz. Nur Antwort mit aktueller Sequenz **und** aktueller Medien-ID darf URL/Fehler setzen.
- **Schließen vor Antwort:** Schließen erhöht/invalidiert die Sequenz, entfernt URL/Fehler und öffnet nie durch eine Antwort erneut.
- **Ältere Antwort nach neuerer:** wird vollständig ignoriert; insbesondere nicht als URL des neuen Bildes verwendet.
- **Doppelter PDF-Klick:** synchrones Pending-Guard plus deaktivierte Control erlaubt höchstens eine Anfrage und ein reserviertes Fenster pro Medium.
- **Medium inzwischen gelöscht/pending/failed oder falschem Projekt zugeordnet:** neue enge DB-Abfrage liefert keinen zulässigen Datensatz; kein Signing, neutrale Nicht-verfügbar-Meldung.
- **Projekt inzwischen deaktiviert oder Rolle/Profil geändert:** erneute DB-/Auth-/Permissionprüfung lehnt ab; vorhandene Galerieansicht ist keine Autorität.
- **Transientes Signingproblem:** genau ein neutraler Fehler; keine automatische oder ungebremste Retryschleife. Ein optionaler expliziter Retry ist eine Owner-Entscheidung und erzeugt eine neue autorisierte Anfrage.

`AbortController` kann Netzarbeit bei Server Actions nicht zuverlässig als Sicherheitsgrenze beenden und ersetzt niemals das Verwerfen später Ergebnisse. Falls die konkrete React/Next-Schnittstelle künftig ein Abortsignal sauber unterstützt, kann es Ressourcen sparen; für Korrektheit genügt der lokale Sequenzschutz. Eine zufällige Request-ID wäre möglich, ein monotoner lokaler Zähler ist kleiner und ausreichend.

## 13. Rate Limits und Missbrauchsschutz

Der MVP benötigt nach heutigem Befund **kein neues explizites anwendungsseitiges Rate Limit**:

- maximal 50 sichtbare Medien, aber nur ein Storage-Signing pro bewusster Öffnung/Bildwechsel;
- keine freie Pfad-/Bucket-/TTL-Wahl;
- Authentifizierung, aktives Profil, Rolle, Permission, Projekt-/Medienbindung und RLS pro Request;
- Doppelsubmit-Schutz für PDF und gleiche Pending-Auswahl;
- keine Batchsignierung pro Klick, Hintergrundaktualisierung oder automatische Retryschleife.

Das verhindert keinen absichtlich skriptenden berechtigten Nutzer, begrenzt aber die unbeabsichtigte Verstärkung und hält die erzeugten URLs auf autorisierte Objekte beschränkt. Provider-/Plattformquoten und Server-Telemetrie sollten nach Einführung beobachtet werden, jedoch ohne URLs, Pfade, IDs oder personenbezogene Daten zu loggen. Bei nachgewiesenem Missbrauch ist ein serverseitiges, identitätsgebundenes Limit ein separates Security-Paket; fail-closed und eine neutrale Meldung sind dann erforderlich. Doppelsubmit plus per-request Authorization sind für die erste Grenze ausreichend, vorbehaltlich Owner-Entscheidung.

## 14. Caching, Persistenz und Logging

Verbindliche Zielregeln:

- keine Signed URL in DB, Audit Log, Local Storage oder Session Storage;
- keine URL in Server-/Clientlog, Fehlermeldung, Analytics, Queryparametern oder Deep Links;
- keine Public URL und keine statische Cache-Persistenz;
- kein globaler React-/Data-Library-Cache;
- URL nur im lokalen React-State der aktuellen Öffnung; beim Bildwechsel ersetzen, beim Schließen und Unmount entfernen;
- Action/Service read-only und dynamisch pro Aufruf; keine Next-Cache-Memoisierung der Antwort.

Der Browser-/Netzwerkcache eines bereits geladenen Bildes oder PDFs ist eine technisch unvermeidbare Restwirkung außerhalb des React-State. `referrerPolicy="no-referrer"` bei bildfähigen Elementen/Links und sichere Opener-Trennung reduzieren Weitergabe, heben aber die Bearer-Eigenschaft bis zum Ablauf nicht auf. Das begründet kurze TTL und Nichtpersistenz.

## 15. Revalidation

Signed-URL-Erzeugung mutiert keine fachlichen oder gecachten Daten. Deshalb:

- kein `revalidatePath` für Projektdetailseite, Projektübersicht oder Kundenseite;
- keine Nutzung der vorhandenen Revalidation-Utilities;
- kein `redirect`, Router-Refresh oder vollständiger Seitenreload.

Die Action ist read-only. Revalidation würde unnötig neue Galerie-URLs und Datenrequests erzeugen und lokalen Fokus/Dialogzustand gefährden.

## 16. Permission und Client-/Server-Grenze

`canViewProjectMedia` ist fachlich passend und erlaubt exakt Admin/Reviewer. Es wird im dedizierten Service nach validiertem Profil erneut verwendet; keine neue Rolle oder Permission ist erforderlich. Clientseitige Sichtbarkeit, übergebene Galerieitems und eine vormals gültige Signed URL ersetzen keine Autorisierung.

Die Projektdetailseite, der initiale Gallery-Service und die Galerie-Datenquelle bleiben Servercode. Nur die bestehende Lightbox-/PDF-Interaktionsinsel hält lokalen Zustand und ruft die Action auf. Es gibt weder Supabase-Browserquery noch direkte Storagequery im Client. Interne DB-Felder bleiben hinter dem Service-Mapper; nur das schmale Erfolgs-DTO überquert die Grenze.

## 17. Geplante Teststrategie (keine Tests in diesem Audit)

### 17.1 Schema

- gültige UUID-Paare akzeptieren;
- fehlende und ungültige IDs ablehnen;
- zusätzliche Felder strikt ablehnen;
- Bucket, Pfad, TTL und beliebige Objekte nicht als Eingabe akzeptieren.

### 17.2 Permission/Auth

- Admin und Reviewer erlaubt;
- nicht authentifiziert, fehlendes Profil und ungültige Rolle abgelehnt;
- `canViewProjectMedia` serverseitig tatsächlich aufgerufen.

### 17.3 Service/Adapter

- aktives Projekt erlaubt, gelöschtes Projekt abgelehnt;
- Medium exakt an Projekt gebunden; falsche `project_id` abgelehnt;
- nur `ready`; pending, failed und deleted abgelehnt;
- nur erlaubte MIME-/Medientypkombinationen;
- Bucket exakt `project-media`;
- kanonischer Pfad und Pfad ausschließlich aus DB;
- `createSignedUrl` exakt einmal mit DB-Pfad und 120 Sekunden;
- RLS-geschützter authentifizierter Client, keine Service Role/RPC;
- schmale Erfolgsantwort; neutraler Fehler und keine URL bei Fehler.

### 17.4 Lightbox

- Loading beim Öffnen und neue URL wird erst nach Erfolg verwendet;
- Schließen während Loading; späte Antwort öffnet nicht erneut;
- Navigation lädt pro neuem Bild neue URL;
- ältere Antwort überschreibt neues Bild nicht;
- Fehlerzustand ohne Veränderung der Galerie;
- erneutes Öffnen nach Schließen erzeugt neue Anfrage;
- URL wird beim Schließen aus State entfernt;
- Fokusfalle/-rückgabe und Schließen bleiben während Pending stabil.

### 17.5 PDF

- neue URL vor Zielnavigation, lokaler Pendingzustand;
- Doppelklick verhindert;
- neues Tab synchron reserviert und sicher vom Opener getrennt;
- Erfolg navigiert nur das reservierte Tab;
- Fehler/Popupblocker schließt beziehungsweise behandelt das leere Fenster und zeigt neutrale Meldung;
- keine PDF-Einbettung.

### 17.6 Architekturregression

- keine Client-DB-/Storagequery, freie Pfad-/Bucketangabe oder Public URL;
- keine Migration, RPC, Service Role, URL-Persistierung oder Revalidation;
- keine `package.json`-Änderung.

Unit-/Componenttests sollen Datenquellen und Actionfunktion mocken; eine gezielte manuelle Browservalidierung soll Popupblocker, Fokus, schnelles Navigieren, Mobilnetz und echte 15-MB-/PDF-Ladevorgänge prüfen. Diese Strategie ist nur Planung; im Audit wurden und werden keine Anwendungstests ausgeführt oder geändert.

## 18. Offene Owner-Entscheidungen

| Entscheidung | Technische Empfehlung (keine Vorwegnahme) |
| --- | --- |
| TTL weiterhin 120 Sekunden? | Ja; beste Balance aus 15-MB-/Mobil-/PDF-Robustheit und kurzem Bearer-Fenster. |
| Neue URL bei jedem Öffnen? | Ja; Berechtigung und Ablauf nutzungsnah erneuern. |
| Neue URL bei jedem Bildwechsel? | Ja; exakt ein aktuell ausgewähltes Medium signieren. |
| Innerhalb derselben Anzeige wiederverwenden? | Ja, solange dasselbe Bild in derselben ununterbrochenen Öffnung aktiv bleibt; nach Wechsel/Rückkehr oder Schließen frisch laden. |
| PDF synchrones leeres Fenster? | Ja, synchron reservieren, Opener sofort trennen, nach Erfolg navigieren; Browsermatrix testen. |
| PDF-Loadingtext? | „Dokument wird geöffnet …“. |
| Retrybutton bei Fehler? | Optionaler expliziter Einzel-Retry ist vertretbar; keine automatische Wiederholung. Für das kleinste UI-Paket zunächst einen Retrybutton nur bei validiertem lokalen Fehler erwägen. |
| Lightbox direkt öffnen und laden? | Ja; unmittelbares Feedback, stabiler Fokus, jederzeit schließbar. |
| Navigation während Loading? | Ja, aber neue Auswahl invalidiert alte Anfrage und Pending für dasselbe Ziel ist geschützt. |
| Explizites MVP-Rate-Limit? | Nein, zunächst Doppelsubmit-Schutz und vollständige Autorisierung pro Request; Nutzung beobachten und separates Paket nur bei Evidenz. |

Keine dieser Empfehlungen ist ohne Owner-Entscheidung als Produktfreigabe gesetzt.

## 19. Empfohlene Folgepakete

### AP-13-02-02-01 — Single Media Signed URL Action

- striktes Zwei-UUID-Schema;
- Admin/Reviewer und `canViewProjectMedia`;
- genau ein Medium, aktives Projekt, `ready`, nicht gelöscht;
- DB-validierter Bucket/Pfad und Einzel-`createSignedUrl` mit 120 Sekunden;
- schmale Antwort;
- keine UI-Änderung außer erforderlicher Testbarkeit.

### AP-13-02-02-02 — Lightbox and PDF Refresh Integration

- lokales Lightbox-Loading;
- Sequenz-/Race-Condition-Schutz und Bildwechsel;
- PDF-Öffnung, Doppelsubmit-/Popupbehandlung;
- neutrale Fehler;
- keine weitere Backendänderung.

### AP-13-02-03 — Lightbox Regression and Production Validation

- automatisierte Regression und gezielte Browser-/Produktionsvalidierung der freigegebenen Architektur.

## 20. Kleinstes nächstes Paket und Status

Eindeutig kleinstes nächstes Paket: **AP-13-02-02-01 — Single Media Signed URL Action**. Es schafft zuerst die testbare Securitygrenze, ohne Race-/Popup-/Lightboxänderungen mit dem Backend in ein Paket zu koppeln.

- **AP-13-01 READ-ONLY GALLERY IMPLEMENTED**
- **AP-13-02-01 IMAGE LIGHTBOX IMPLEMENTED**
- **SIGNED URL REFRESH ON OPEN NOT IMPLEMENTED**
- **OVERALL PRODUCT NOT PRODUCTION READY**
- **Status: READY FOR OWNER DECISION**

Nicht: **APPROVED FOR IMPLEMENTATION**. Nicht: **Production Ready**.

## 21. Scope-Bestätigung

Dieses Paket enthält **ausschließlich Analyse und Dokumentation**. Es enthält:

- keine Implementierung, UI- oder Komponentenänderung;
- keine Server Action und keinen Service;
- keine Tests oder Teständerungen;
- keine Migration, SQL-, RPC-, RLS- oder Storage-Policy-Änderung;
- keine Signed-URL-Änderung und keine Public URL;
- keinen Download und keine PDF-Einbettung;
- keine Service Role;
- keine `package.json`-Änderung;
- keine KI und keine WhatsApp-Integration.

Die einzige in diesem Arbeitspaket erstellte Datei ist `docs/audits/2026-07-30-ap13-02-02-signed-url-refresh-audit.md`.
