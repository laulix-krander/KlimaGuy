# AP-12-02-00 – Audit „Project media upload orchestration“

**Audit-ID:** `KG-AUDIT-2026-07-27-AP12-02-00-UPLOAD-ORCHESTRATION-V1`

**Datum:** 27.07.2026

**Status:** **NICHT Production Ready**

**Charakter:** ausschließlich Architektur- und Sicherheitsaudit; keine Implementierung

## 1. Auftrag, Scope und Ergebnis

Dieses Audit untersucht ausschließlich den geplanten, manuellen Upload von Projektmedien auf Basis des aktuellen Repository-Stands. Verbindliche Grundlagen sind AP-12-00, AP-12-01 sowie die bereits vorhandenen Pakete AP-12-01-01 bis AP-12-01-04. Es ändert weder deren Domain-Freeze noch deren Datenbank- oder Storage-Verträge.

Das Ergebnis ist eine Zielarchitektur für AP-12-02: Der Upload ist ein zustandsbehafteter, DB-zuerst ausgeführter Prozess mit einer `pending`-Reservierung, einem exakt daran gebundenen privaten Storageobjekt und einer konditionalen Finalisierung nach `ready`. Eine echte Transaktion über PostgreSQL und Object Storage existiert nicht. Deshalb sind Idempotenz, Zustandsautomaten, Cleanup und Reconciliation keine optionalen Komfortfunktionen, sondern Sicherheits- und Konsistenzanforderungen.

Die bestehende Baseline ist dafür notwendig, aber nicht hinreichend. Insbesondere fehlen eine atomare Durchsetzung des Projektlimits, vertrauenswürdige Inhaltsprüfung, eine enge Finalisierung, Abbruch-/Retry-Semantik, Cleanup, Reconciliation, Monitoring und echte Integrationstests. Eine Uploadfreigabe für Production ist ausdrücklich **nicht** erteilt.

### 1.1 Nicht im Scope

Kein Download-/Signed-URL-Workflow, keine Medienbearbeitung, keine Vorschauen, kein OCR, keine KI, kein WhatsApp, keine automatische Kategorisierung und kein physischer Purge werden hier entworfen. Soft Delete für bereits `ready` gesetzte Medien bleibt der bestehende, getrennte fachliche Vorgang.

## 2. Verifizierter Ist-Stand

### 2.1 Fachlicher Freeze

- Zulässig sind ausschließlich JPEG, PNG, WebP und PDF aus `manual_upload`.
- Pro Vorgang gelten höchstens 20 Dateien, pro Projekt höchstens 100 aktive Dateien; Bilder sind auf 15.000.000 Bytes und PDFs auf 25.000.000 Bytes begrenzt. Diese Produktlimits bleiben vor technischer Umsetzung extern gegen die eingesetzten Plattformen zu verifizieren.
- Nur Admins dürfen hochladen. Reviewer dürfen aktive, fertige Medien nur lesen beziehungsweise herunterladen.
- Bucket und Pfade sind privat und dürfen keine Kundendaten oder Originaldateinamen enthalten.

### 2.2 Vorhandene technische Verträge

- `project_media` besitzt UUID, Projektbezug, kanonischen Bucket/Pfad, Original- und gespeicherten Dateinamen, MIME-/Medientyp, Bytegröße, Kategorie, Quelle, `uploaded_by`, Zeitstempel, Soft Delete und `upload_status`.
- Zulässige Zustände sind `pending`, `ready` und `failed`; technisch erlaubt sind nur `pending → ready` und `pending → failed`. `ready` und `failed` sind terminal.
- Reservierungen dürfen nur von einem authentifizierten Admin für ein aktives Projekt und mit `uploaded_by = auth.uid()` als `pending` eingefügt werden.
- Normale Tabellen-SELECTs und Storage-SELECTs sehen nur aktive `ready`-Medien aktiver Projekte.
- Ein Storage-INSERT ist nur für die angemeldete Person, den privaten Bucket und den exakt reservierten Pfad einer eigenen aktiven `pending`-Zeile zulässig.
- Storage-UPDATE und Storage-DELETE sind für normale Rollen nicht freigegeben. Ein Retry darf daher weder `upsert` noch Overwrite voraussetzen.
- Der bestehende Soft-Delete-RPC akzeptiert ausschließlich aktive `ready`-Medien und ist kein Abbruch- oder Cleanupmechanismus für Uploads.

### 2.3 Festgestellte Lücken der Baseline

1. Das Limit von 100 aktiven Medien pro Projekt ist nicht konfliktfest reserviert. Ein bloßes vorheriges `count` plus anschließender Insert ist unter Parallelität falsch.
2. Bucket- und Tabellenchecks prüfen deklarierte Metadaten, nicht die tatsächlichen Bytes. Browser-MIME, Dateiendung und `File.size` sind nicht vertrauenswürdig.
3. Der allgemeine Admin-UPDATE-Pfad kann `pending` nach `ready` oder `failed` setzen, ohne dabei selbst Objektvorhandensein, tatsächliche Bytezahl, Magic Bytes, reservierenden Actor oder einen Idempotency-Schlüssel zu beweisen. Eine schmale Finalisierungsgrenze fehlt.
4. Es gibt keinen normalen Storage-DELETE-Pfad. Teilweise oder vollständig gespeicherte Objekte können nach Fehler oder Abbruch nicht durch den normalen Benutzerworkflow bereinigt werden.
5. `failed` ist terminal. Ein Retry kann nicht dieselbe Zeile reaktivieren; er braucht nach geklärtem Objektzustand eine neue Reservierung.
6. Für verwaiste `pending`-/`failed`-Zeilen, DB-Objekt-Divergenz und alte Storageobjekte fehlen Reconciler, Fristen, Alarmierung und Betriebsrunbook.
7. Eine Checksum beziehungsweise ein fachlicher Deduplizierungsschlüssel ist bewusst nicht vorhanden. Eindeutige Storagepfade verhindern Pfadkollisionen, aber nicht denselben Inhalt in mehreren Reservierungen.

## 3. Verbindliche Zielarchitektur

### 3.1 Vertrauensgrenzen

Der Browser ist für Dateiinhalt, Namen, MIME, Größe, Projektbezug, Kategorie, Status und Pfad nicht vertrauenswürdig. Clientvalidierung verbessert nur die UX. Jede sicherheitsrelevante Entscheidung wird serverseitig aus der authentifizierten Session und validierten Eingaben neu abgeleitet.

Empfohlen ist ein **serververmittelter Binärpfad** innerhalb des modularen Next.js-Monolithen: Der Server liest einen begrenzten Anfang beziehungsweise die erforderliche Struktur aus demselben Bytestrom, den er anschließend in Storage schreibt. Dadurch kann nicht Datei A geprüft und Datei B über einen getrennten Direktupload gespeichert werden. Ein Server Action Body ist für große Binärdaten und belastbaren Uploadfortschritt nicht die bevorzugte Transportgrenze; dafür ist später ein enger authentifizierter Route Handler oder ein nach externer Plattformprüfung gleichwertiger Streaming-Endpunkt vorzusehen. Kontrolloperationen bleiben Server Actions.

Ein direkter Browser-zu-Storage-Upload wäre nur nach einem gesonderten Design zulässig, das unvertrauenswürdige Objekte zunächst nicht lesbar hält, anschließend exakt diese gespeicherten Bytes serverseitig prüft und fehlgeschlagene Objekte privilegiert entfernt. Die aktuelle Baseline besitzt weder Quarantänepfad noch Cleanuprecht. Deshalb ist ein ungeprüfter Direktupload **nicht die Audit-Empfehlung**.

Keine normale Anwendungskomponente benötigt einen Service-Role-Key. Nutzergebundene Supabase-Clients und die bestehenden RLS-/Storage-Policies bleiben Defense in Depth. Falls später ein privilegierter Reconciler Objekte löschen muss, ist dies ein separater, serverseitiger Betriebsprozess mit engstem Scope, nicht der Uploadpfad.

### 3.2 Eine Datei ist eine Workflow-Einheit

Ein Mehrfachupload ist eine UI-Gruppe aus maximal 20 voneinander unabhängigen Dateiworkflows, keine verteilte Alles-oder-nichts-Transaktion. Jede Datei besitzt eigene Reservierung, Statusanzeige, Abbruchsignal, Fehlerklasse und Retryentscheidung. So kann eine gültige Datei erfolgreich enden, obwohl eine andere abgelehnt wird. Die Batch-Ebene fasst Resultate nur zusammen.

## 4. Geplanter Clientablauf

1. **Dateiauswahl:** Datei-Picker und optional Drag-and-drop akzeptieren mehrere Dateien. Die UI zeigt Originalname nur lokal beziehungsweise als bereinigten Anzeigewert, niemals als Storagepfad. Sie übermittelt eine explizite `projectId`, kontrollierte Kategorie und pro Datei einen clientseitigen Korrelationsschlüssel.
2. **Vorvalidierung:** Die UI prüft Anzahl, leere Dateien, deklarierte Typen und Bytegröße frühzeitig. Diese Prüfung ist nicht autoritativ und darf keine Serverprüfung ersetzen. Höchstens 20 Dateien werden in einen Vorgang aufgenommen.
3. **Queue:** Zulässige Kandidaten erhalten getrennte Queue-Einträge. Parallelität wird begrenzt, empfohlen zunächst zwei bis drei aktive Übertragungen; der endgültige Wert ist durch Lasttests festzulegen. Weitere Dateien warten lokal.
4. **Start:** Für jede Datei wird genau ein Orchestrierungsvorgang gestartet. Die UI darf `mediaId`, Pfad, Status oder Actor nicht selbst bestimmen. Wiederholtes Klicken wird lokal gesperrt, ist aber keine Sicherheitskontrolle.
5. **Progress:** Jede Datei zeigt mindestens `wartend`, `wird geprüft`, `wird hochgeladen`, `wird abgeschlossen`, `fertig`, `fehlgeschlagen` oder `abgebrochen`. Bytegenauer Fortschritt ist nur anzuzeigen, wenn der gewählte Transport ihn korrekt liefert; andernfalls keine erfundene Prozentzahl, sondern indeterminierter Fortschritt.
6. **Abbruch:** Ein `AbortController` beendet den Clientrequest bestmöglich. Abbruch bedeutet nicht, dass Server oder Storage sicher gestoppt wurden. Die UI zeigt zunächst „Abbruch wird geklärt“ und übernimmt erst das autoritative Serverresultat.
7. **Retry:** Nur retryfähige Transport-/Timeoutfehler erhalten „Erneut versuchen“. Vor dem Retry wird der alte Vorgang abgefragt beziehungsweise reconciled. Ein neuer Versuch darf niemals blind denselben Pfad überschreiben. Wegen terminalem `failed` ist nach bestätigtem Scheitern eine neue Reservierung erforderlich.
8. **Abschluss:** Erfolgreiche Einträge werden erst nach bestätigtem `ready` als Medium dargestellt. Die Projektansicht wird einmal nach dem Batch beziehungsweise gedrosselt aktualisiert, nicht bei jedem Progress-Event.

Bei Navigation oder Tab-Schließen warnt die UI bei laufenden Uploads, darf aber keinen sicheren Abbruch behaupten. Nach Rückkehr muss ein serverseitiger Statusabruf anhand nicht sensitiver Workflow-IDs den Zustand wiederherstellen; rein lokaler Zustand genügt nicht.

## 5. Geplanter Serverablauf

### 5.1 Authentifizierung und Autorisierung

Für jeden Einstieg und jede zustandsändernde Phase:

1. Session serverseitig laden; keine Actor-ID aus dem DTO übernehmen.
2. vorhandenes Profil und Rolle `admin` prüfen;
3. Projekt anhand validierter UUID laden, Existenz und `deleted_at IS NULL` prüfen;
4. bei Folgeaufrufen Medien-ID **und** Projekt-ID koppeln;
5. `uploaded_by`, aktuellen Status, aktives Medium und kanonischen Bucket/Pfad prüfen;
6. Fehler nach außen datensparsam vereinheitlichen, sodass fremde IDs nicht auf Existenz schließen lassen.

Autorisierung wird unmittelbar an der mutierenden Operation erneut geprüft. Eine erfolgreiche Prüfung bei Dateiauswahl oder Reservierung ist kein dauerhaftes Recht: Rolle oder Projekt können während des Uploads geändert beziehungsweise gelöscht werden.

### 5.2 Inhaltsprüfung

Der Server erzwingt harte Bytegrenzen während des Lesens und bricht bei Überschreitung ab. Er verlässt sich weder auf `Content-Length` noch Browser-MIME oder Endung. Aus den Bytes werden mindestens ermittelt:

- unterstützte Dateisignatur/Magic Bytes;
- tatsächlicher MIME-Typ aus einer eng versionierten Allowlist;
- notwendige Strukturplausibilität, insbesondere kein bloßes Präfix-Matching;
- tatsächlich gelesene Bytezahl;
- daraus serverseitig abgeleiteter `media_type` und die kanonische Endung.

Deklarierter MIME, erkannter MIME und erlaubte Endung müssen konsistent sein. Polyglotte, beschädigte, verschlüsselte oder parserkritische Dateien benötigen eine ausdrücklich definierte Ablehnungsregel. Für PDF ist vor Production festzulegen, welche Strukturprüfung ohne riskantes Rendering genügt. Dateiprüfungen laufen mit Zeit-, Speicher- und CPU-Grenzen. Inhalte, Originalnamen und personenbezogene Metadaten werden nicht geloggt.

### 5.3 Reservierung

Nach erfolgreicher Vorprüfung erzeugt der Server UUIDs, `stored_filename` und den kanonischen Pfad. Er normalisiert den Originalnamen zu begrenzten Anzeige-Metadaten, setzt `source = manual_upload`, `uploaded_by` aus der Session und `upload_status = pending`.

Die Reservierung muss in **einer Datenbanktransaktion** Projektaktivität, Adminberechtigung, Idempotency-Key und verfügbare Projektkapazität prüfen sowie genau eine Zeile anlegen beziehungsweise dasselbe Resultat eines identischen Replays zurückgeben. Ein `SELECT count(*)` im Service vor einem separaten INSERT ist verboten. Welche Sperrstrategie die Quote serialisiert, wird in AP-12-02-01 festgelegt und unter Parallelität getestet.

Die Reservierung darf erst erfolgen, wenn die verbindlichen Metadaten aus den tatsächlich zu speichernden Bytes bekannt sind, da geschützte Felder später nicht korrigiert werden können. Der Dienst darf Bytes dabei nicht unbeschränkt im Arbeitsspeicher puffern; konkrete Spooling-/Streaming- und Plattformgrenzen sind Production Gates.

### 5.4 Storage Upload

Der Server lädt exakt denselben geprüften Bytestrom mit `upsert = false` in den privaten Bucket auf den reservierten Pfad. Unmittelbar davor prüft er die Reservierung erneut. Storage darf nur genau einen Objekt-Create akzeptieren; ein Konflikt wird nicht durch Überschreiben „gelöst“.

Die Antwort des Storage-SDK ist kein ausreichender Integritätsbeweis. Vor Finalisierung ist das Objekt über vertrauenswürdige Metadaten beziehungsweise einen begrenzten serverseitigen Read-back zu verifizieren: Bucket, Pfad, Existenz, Bytezahl und – soweit technisch belastbar – derselbe Inhalt/MIME. Eine später eingeführte serverseitig berechnete SHA-256-Checksum könnte Reconciliation stärken, ist aber eine eigene Domainentscheidung und nicht Bestandteil dieses Audits.

### 5.5 Finalisierung

Finalisierung ist eine enge Compare-and-set-Operation. Sie darf `pending → ready` nur durchführen, wenn Session, Adminrolle, aktives Projekt, eigene Reservierung, Medien-/Projektkopplung, exakter Bucket/Pfad und verifiziertes Objekt weiterhin stimmen. Sie verändert keine anderen geschützten Metadaten.

Ein Replay derselben erfolgreichen Finalisierung gibt dasselbe fachliche Ergebnis zurück. Das ist mit dem heutigen terminalen Statusguard nur über einen dafür entworfenen engen Finalisierungspfad möglich; ein blindes zweites UPDATE ist kein geeignetes Protokoll. Ein anderes Objekt, ein anderer Actor oder ein geänderter Payload zum gleichen Idempotency-Key wird abgelehnt.

Nach `ready` liefert der Server ein minimales DTO ohne Signed URL. Erst jetzt darf Projektansicht/-liste gezielt revalidiert werden.

### 5.6 Fehlerabschluss, Rollback und Reconciliation

Es gibt keinen echten Rollback über DB und Storage. „Rollback“ bedeutet daher kompensierende, wiederholbare Schritte:

- Vor Objektanlage: Reservierung konditional `pending → failed` setzen.
- Nach möglicher Objektanlage: zunächst Objektzustand feststellen; Objekt privilegiert entfernen oder zur Reconciliation sperren, danach `pending → failed` setzen.
- Wenn Cleanup nicht bestätigt ist: nicht Erfolg melden und nicht blind `failed` behaupten; den Vorgang als intern „unklar“ behandeln, obwohl das heutige persistierte Modell dafür noch keinen eigenen Zustand besitzt. Genau diese Modelllücke ist vor Implementierung aufzulösen.
- Reconciler findet abgelaufene `pending`-Zeilen, `failed` mit Objekt, Objekt ohne gültige Zeile und `ready` ohne Objekt; er arbeitet idempotent, altersbegrenzt und auditierbar.

Der Reconciler loggt nur technische IDs, Zustandsklasse und Zeitpunkte, keine Dateinamen, Inhalte, Tokens oder Signed URLs. Destruktive Korrekturen benötigen ein freigegebenes Retention-/Cleanup-Runbook.

## 6. Reihenfolge, Atomarität und Idempotenz

| Schritt | Muss atomar sein? | Wiederholbar/idempotent? | Regel |
|---|---|---|---|
| Auth-, Rollen- und Projektprüfung | mit der folgenden DB-Mutation wirksam gekoppelt | ja | Vorprüfung allein verhindert keine Race Condition. |
| Inhaltsprüfung | gleicher Bytestrom wie Upload | deterministisch wiederholbar | Ressourcenlimits und Prüferversion festhalten. |
| Quotenprüfung + Reservierung | **ja, innerhalb DB** | ja über Idempotency-Key | Maximal 100 muss unter Parallelität gelten. |
| Storage-Create | nicht mit DB atomar | Create darf sicher wiedererkannt, aber nie überschrieben werden | Exakter reservierter Pfad, `upsert = false`. |
| Objektverifikation + Finalisierung | Finalisierungs-CAS muss atomar sein; Storageprüfung liegt davor | **ja** | `pending → ready`, Replay von ready liefert Erfolg nur bei identischer Zuordnung. |
| Fehler-Markierung | konditional atomar | ja | Nur eigener noch `pending`er Vorgang; niemals `ready → failed`. |
| Cleanup | nicht mit DB atomar | **ja** | Fehlendes Objekt gilt beim Delete als bereits bereinigt; fremde Pfade nie löschen. |
| Revalidation | nein | ja | ausschließlich nach bestätigter Zustandsänderung. |

Pro Datei gilt die feste Reihenfolge: authentifizieren → Projekt/Berechtigung prüfen → Bytes begrenzen und validieren → atomar reservieren → exakt reserviertes Objekt erstellen → Objekt verifizieren → konditional finalisieren → revalidieren. Storage vor DB-Reservierung ist unzulässig. `ready` vor verifiziertem Storage-Erfolg ist unzulässig.

## 7. Statusautomat und Recovery

```text
                     +--> ready (terminal, fachlich sichtbar)
pending -------------+
                     +--> failed (terminal, nicht sichtbar)
```

- **`pending`:** Reservierung existiert, aber es gibt noch keinen bewiesenen vollständigen und gültigen Upload. Der Zustand ist zeitlich begrenzt und im normalen Leseweg unsichtbar.
- **`ready`:** Objekt und reservierte Metadaten wurden verifiziert; das aktive Medium darf über die bestehenden Leseregeln sichtbar werden.
- **`failed`:** Upload oder sichere Finalisierung wurde endgültig verworfen. Der Zustand darf kein normal lesbares Objekt besitzen.

`ready` und `failed` bleiben terminal; Retry erzeugt eine neue Reservierung. Es gibt kein Restore und keine Rückkehr nach `pending`. Ein bloßer Client-Timeout ändert noch keinen Status.

Der vorhandene Dreizustandsautomat kann den technischen Zwischenfall „Objekt möglicherweise vorhanden, Ergebnis unbekannt“ nicht ausdrücken. Vor Umsetzung muss AP-12-02-01 entscheiden, ob ein getrenntes, streng typisiertes Orchestrierungs-/Attempt-Modell benötigt wird oder ob Lease, Ablaufzeit und Reconciler den Zustand ohne Aufweichung von `project_media` sicher abbilden. Freie Statusstrings oder das Umdeuten von `failed` sind unzulässig.

Recovery-Regeln:

- alte `pending`-Reservierung ohne Objekt: nach Lease/Frist `failed`;
- `pending` mit vollständig verifiziertem Objekt: sichere Finalisierung nach erneuter Autorisierung oder privilegierte Reconciliation;
- `failed` mit Objekt: Objekt nach Runbook entfernen, Zeile terminal belassen;
- `ready` ohne Objekt: P0-Alarm und keine automatische Neuerstellung aus unbekannter Quelle;
- Objekt ohne Zeile: niemals aus dem Pfad fachlich „adoptieren“, sondern quarantänisieren/entfernen;
- gelöschtes Projekt während Upload: nicht finalisieren, Objekt bereinigen und Reservierung fehlschlagen lassen.

## 8. Fehlerfallmatrix

| Fehlerfall | Erwartetes Verhalten | Retry |
|---|---|---|
| DB-Reservierung erfolgreich, Storage fehlgeschlagen | kein `ready`; bei sicher nicht vorhandenem Objekt `failed`, sonst Reconciliation | neue Reservierung erst nach Klärung |
| Storage erfolgreich, DB-Finalisierung fehlgeschlagen | `pending` bleibt unsichtbar; Status lesen und identische Finalisierung idempotent wiederholen; bei dauerhafter Ablehnung Cleanup | ja, niemals erneut hochladen/überschreiben |
| Storage erfolgreich, DB-Zeile fehlt | sollte durch DB-zuerst plus Storage-Policy verhindert werden; als P0-Orphan alarmieren und bereinigen, nicht adoptieren | nein |
| DB `ready`, Storage fehlt | Finalisierungsprotokoll verletzt; P0-Alarm, Zugriff verweigern, manuell untersuchen | kein automatischer Reupload |
| Timeout vor bekannter Antwort | Erfolg oder Fehler nicht raten; Status und Objekt serverseitig feststellen | erst danach |
| Clientabbruch vor Reservierung | keine persistente Wirkung | normaler Neustart |
| Clientabbruch nach Reservierung | Server stoppt bestmöglich; mögliche Teilwirkung reconciliieren | neue Reservierung nach Klärung |
| Netzwerkfehler während Upload | Byteübertragung abbrechen; mögliches Objekt/Teilobjekt feststellen; kein `ready` | kontrolliert |
| doppelte Anfrage/Replays | gleicher Key + gleicher Fingerprint liefert denselben Versuch; gleicher Key + anderer Payload wird abgelehnt | idempotent |
| gleiche Datei zweimal bewusst gewählt | fachlich derzeit erlaubt; separate IDs/Pfade, Warnung höchstens UX | ja |
| parallele Uploads | begrenzte Workerzahl; atomare Projektquote; jede Datei unabhängig | ja |
| Projekt/Rolle während Upload entzogen | Finalisierung verweigern, Objekt bereinigen; keine Sichtbarkeit | nein bis neue Berechtigung |
| Pfadkollision | nie upserten; Konflikt untersuchen, neue Reservierung nur nach gesichertem Zustand | kontrolliert |

## 9. Security Review

### 9.1 Magic Bytes, MIME und Dateistruktur

- Browser-MIME und Dateiendung sind Hinweise, keine Beweise.
- Nur eine serverseitige Allowlist mit deterministischer Signatur-/Strukturprüfung darf `mime_type`, `media_type` und kanonische Endung bestimmen.
- Einfaches Magic-Byte-Matching allein reicht für Container-/Polyglot-Risiken nicht. Die konkrete, gepflegte Prüfbibliothek, deren Versionierung und Fehlermodus sind in AP-12-02-02 festzulegen.
- Keine Vorschau oder Parserausführung im Uploadprozess. PDF wird nicht gerendert; Bildmetadaten werden nicht fachlich extrahiert.

### 9.2 Größe und Ressourcen

- Bytezahl während des Streams zählen und bei 15.000.000 beziehungsweise 25.000.000 Bytes hart abbrechen.
- Deklarierte Länge, tatsächliche Länge, DB-Metadaten und Objektmetadaten müssen übereinstimmen.
- Batchlimit 20, Projektlimit 100 und serverseitige Parallelitäts-/Rate-Limits gelten gemeinsam.
- Schutz gegen Slow Uploads, Request-/Idle-Timeouts, Speichererschöpfung und zu viele gleichzeitige Requests ist erforderlich.

### 9.3 Dateiname und Pfad

- Originalnamen trimmen/normalisieren, Kontrollzeichen und Pfadseparatoren ablehnen, auf 255 Zeichen begrenzen und ausschließlich escaped als Text ausgeben.
- Storagefilename und Pfad ausschließlich serverseitig aus UUID, erkanntem Typ und kanonischer Endung erzeugen.
- Keine Namen, Adressen oder sonstige PII im Pfad; keine Unicode-/Traversal-Normalisierung aus Clientpfaden übernehmen.
- Pfade sind Locator, niemals Autorisierungsbeweis.

### 9.4 Race Conditions, Replay und Manipulation

- Quotenprüfung und Insert müssen serialisiert werden; Finalisierung nutzt Compare-and-set.
- Ein hochentropischer, benutzergebundener Idempotency-Key erhält zusätzlich einen serverseitig gebildeten Request-Fingerprint. Keys laufen aus und sind nicht global zwischen Benutzern wiederverwendbar.
- Medien-ID, Projekt-ID, Kategorie, reservierte Metadaten und Actor werden bei jedem Schritt gekoppelt. Mass Assignment ist verboten.
- Kein `upsert`, kein clientbestimmter Bucket/Pfad, kein Status aus dem Client und kein Vertrauen in versteckte Formularfelder.
- CSRF-/Origin-Schutz des späteren HTTP-Endpunkts, Session-Cookies, SameSite-Strategie und Requestgrößenbegrenzung müssen explizit getestet werden.
- Fehlermeldungen dürfen weder fremde Projekt-/Medienexistenz noch Storagepfade, Originalnamen, Tokens oder interne Policytexte offenlegen.

## 10. Später notwendige Schnittstellen

Die folgenden Namen beschreiben Verantwortlichkeiten, nicht bereits freigegebene Implementierungsdetails.

### 10.1 Server Actions und Transport

| Geplante Grenze | Verantwortung |
|---|---|
| `reserveProjectMediaUploadAction` | kleines Kontroll-DTO validieren, Session/Projekt/Admin prüfen und atomare Reservierung anstoßen; nur erforderlich, falls Reservierung vom Binärrequest getrennt wird |
| authentifizierter Upload-Route-Handler | begrenzten Binärstream empfangen, Inhalt prüfen, reservieren/zuordnen, Storage-Create ausführen und Abschluss koordinieren |
| `finalizeProjectMediaUploadAction` | nur falls technisch getrennt: enge idempotente Objektverifikation und Finalisierung; niemals Clientbehauptung „Upload fertig“ übernehmen |
| `getProjectMediaUploadStatusAction` | autorisierten Zustand für Timeout, Wiederaufnahme und Abbruchklärung liefern |
| `cancelProjectMediaUploadAction` | best effort; noch `pending`en eigenen Versuch sperren und Cleanup einplanen, niemals `ready` zurückrollen |
| `retryProjectMediaUploadAction` | alten Zustand klären und gegebenenfalls neue Reservierung erzeugen; kein Status-Reset |

Binärdaten dürfen nicht mehrfach zwischen Actions serialisiert werden. Ob Reservierung und Upload in einem Request oder als kurzlebiges Uploadticket getrennt werden, ist anhand offizieller, zum Implementierungszeitpunkt aktueller Next.js-, Hosting- und Supabase-Grenzen extern zu verifizieren.

### 10.2 Services

- `project-media-upload-orchestration-service`: Ablauf und Zustandsentscheidungen, ohne UI-Abhängigkeit.
- `project-media-reservation-service`: Authz-nahe atomare Quoten-/Idempotenzreservierung.
- `project-media-content-validation-service`: Bytegrenzen, Signatur, MIME, Struktur und kanonische Dateiendung.
- `project-media-storage-service`: ausschließlich privates Create ohne Upsert sowie Objektverifikation; keine freie Pfad-API.
- `project-media-finalization-service`: enge Compare-and-set-Finalisierung und Fehlerabschluss.
- `project-media-reconciliation-service`: privilegierter, separater Betriebsprozess für alte/inkonsistente Versuche.
- bestehende zentrale Project-Revalidation als einzige Cache-Invaliderungsgrenze erweitern, statt verstreute Pfade zu verwenden.

Servicefunktionen erhalten bereits validierte, typisierte Werte. Supabase-Fehler werden in wenige datensparsame Domainfehler übersetzt; rohe Fehler und Datei-Metadaten werden nicht geloggt.

### 10.3 DTOs und Zod-Schemas

Mindestens erforderlich sind:

- `ProjectMediaUploadIntentDto`: Projekt-ID, kontrollierte Kategorie, clientseitiger Idempotency-Key; kein Actor, Pfad, Bucket oder Status.
- `ProjectMediaReservationDto`: servererzeugte Medien-/Attempt-ID, erlaubter Ablauf und opaker Korrelationswert; interner Pfad nur soweit der Transport ihn zwingend benötigt.
- `ProjectMediaUploadResultDto`: Medien-ID, Projekt-ID und kontrollierter Ergebniscode; keine Signed URL.
- `ProjectMediaUploadStatusDto`: sicherer öffentlicher Workflowstatus und retryfähig ja/nein; keine internen Storagefehler.
- `ProjectMediaUploadErrorDto`: stabiler Fehlercode, deutsche generische Meldung und optional feldbezogene Fehler; keine PII.
- interne typisierte Werte für `DetectedMediaType`, `ValidatedFileSize`, `CanonicalStoredFilename`, `ReservedStoragePath` und `UploadAttemptState`.

Zod-Schemas validieren alle Action-/Route-Eingaben, UUIDs, Kategorie-Allowlist, Idempotency-Key-Format und Batchgrenze. Dateiinhalt benötigt zusätzlich Streaming-/Magic-Byte-Validierung; Zod allein genügt nicht. Antwortschemas verhindern versehentliche Ausgabe interner Spalten.

### 10.4 Revalidation

- Revalidation ausschließlich nach bestätigtem Übergang zu `ready` oder einer fachlich sichtbaren Änderung.
- Mindestens Projekt-Detail und relevante Projekt-/Medienliste über zentrale Konstanten invalidieren.
- Kein Revalidate bei Progress, bloßer Reservierung, abgebrochenem Request oder unverändertem Replay.
- Fehler bei Revalidation machen den Upload nicht rückgängig; die Action meldet fachlichen Erfolg und die UI kann explizit refreshen.

## 11. Empfohlene Arbeitspakete

### AP-12-02-01 – Upload Reservation

- Orchestrierungs-/Attempt-Modell und Idempotency-Vertrag entscheiden.
- Projektlimit 100 atomar und parallelitätssicher reservieren.
- enge Admin-/Projekt-/Actor-Prüfung sowie Lease-/Ablaufsemantik schaffen.
- Race-, Replay-, Quoten- und Negativtests zuerst spezifizieren.

### AP-12-02-02 – Storage Upload

- serververmittelten, ressourcenbegrenzten Binärtransport festlegen;
- Magic-Byte-/MIME-/Strukturprüfung implementieren und versionieren;
- exakt reserviertes privates Create ohne Upsert sowie Objektverifikation;
- Plattformlimits, Timeouts, Abbruch, Rate Limits und Cleanuppfad klären.

### AP-12-02-03 – Upload Finalization

- enge idempotente Finalisierung und Fehlerabschluss;
- Actor-/Projekt-/Objektbindung unmittelbar in der Mutation;
- Reconciler, Lease-Ablauf, Orphan-Erkennung, Monitoring und Runbook;
- zentrale Revalidation nur nach bestätigtem Erfolg.

### AP-12-02-04 – Upload UI

- barrierearme deutsche Mehrfachauswahl und Queue;
- belastbarer per-Datei-Fortschritt, Abbruch, Retry und Wiederaufnahme;
- keine Sicherheitsentscheidung im Client und keine falsche Erfolgsmeldung;
- Fokus-, Tastatur-, Screenreader- und Navigationstests.

### AP-12-02-05 – Regression Tests

- vollständige Unit-, Integrations-, Browser-, RLS-/Storage- und Failure-Injection-Matrix;
- echte private Storage-Uploads in isolierter Testumgebung;
- Parallelitäts-, Last-, Timeout-, Replay-, Manipulations- und Reconciliationtests;
- Regression gegen Soft Delete und Reviewer-/Anon-Negativfälle.

Die Pakete sind strikt in dieser Reihenfolge umzusetzen. AP-12-02-04 darf erst beginnen, wenn das Serverprotokoll stabil ist. AP-12-02-05 ergänzt Tests fortlaufend und schließt die Ende-zu-Ende-Freigabe ab; sicherheitskritische Tests dürfen nicht bis zum Schluss verschoben werden.

## 12. Risikoregister

### P0 – blockiert Implementierung beziehungsweise Production

| Risiko | Gate |
|---|---|
| MIME-Spoofing oder Speicherung anderer Bytes als geprüft | gleicher serververmittelter Bytestrom, robuste Signatur-/Strukturprüfung, Objektverifikation |
| Projektquote unter parallelen Reservierungen überschritten | atomare DB-Reservierung mit Concurrency-Test |
| `ready` ohne belastbaren Objektbeweis | enge Finalisierung mit Actor-, Projekt-, Pfad-, Status- und Objektprüfung |
| Storage-/DB-Teilfehler erzeugt zugängliche oder ewige Orphans | Cleanuprecht, Reconciler, Lease, Alarmierung und Runbook |
| Replay/Timeout erzeugt Doppelobjekte oder falschen Status | persistenter Idempotenzvertrag und statusbasierte Wiederaufnahme |
| Privilegierter Schlüssel gelangt in normalen Pfad/Client | user-bound Pfad; privilegierter Reconciler strikt separat und serverseitig |
| echte Mandantennutzung ohne Tenant-Isolation | bestehendes AP-12-00-P0-Gate bleibt unverändert |

### P1 – vor Production zu schließen

- aktuelle Hosting-, Request-, Streaming-, Supabase-, Storage- und SDK-Limits offiziell verifizieren;
- PDF-Prüftiefe, Polyglot-/beschädigte Dateien und sichere Ablehnungsregeln festlegen;
- EXIF-/GPS-Entscheidung, Retention, Rechtsgrundlage, Betroffenenrechte und Backup-Löschung extern klären;
- Rate Limits, maximale Parallelität, Lease-Dauer, Retrybudget und Reconciler-SLA festlegen;
- CSRF/Origin, Sessionablauf während Upload und Informationsleck-freie Fehler testen;
- Metriken und Alarmierung ohne PII sowie Betriebsverantwortung etablieren;
- Browser-/Mobilnetz-Abbruch, langsame Verbindungen und 25-MB-PDFs Ende-zu-Ende testen.

### P2 – bewusst nachgelagert

- Checksum-basierte Duplicate Detection und nutzerseitige Duplikatwarnung;
- resumable/chunked Upload, sofern durch echte Nutzungsdaten erforderlich;
- Vorschaubilder, Derivate, Sortierung und zusätzliche technische Metadaten;
- Komfort-Wiederaufnahme über Geräte hinweg.

## 13. Production Gates und erforderliche Tests

## **NICHT Production Ready**

Vor Production fehlen mindestens:

1. abgeschlossene AP-12-02-01 bis AP-12-02-05 mit Review;
2. atomare Quoten-/Idempotenzreservierung und dokumentierte Parallelitätsstrategie;
3. serverseitige Magic-Byte-, MIME-, Struktur- und echte Größenprüfung;
4. enge, idempotente Finalisierung statt allgemeinem Statusupdate;
5. sicherer Abbruch-, Retry-, Cleanup- und Reconciliationprozess;
6. verifizierte aktuelle Plattformlimits und Last-/Timeoutbudget;
7. Monitoring, Alarmierung und nichtdestruktives Betriebsrunbook;
8. externe Datenschutz-/Retention-/EXIF-Freigabe;
9. Staging-Nachweis mit privatem Bucket, realen Admin-/Reviewer-/Anon-Sessions und getrennten Umgebungen;
10. dokumentierter Rollback/Feature-Kill-Switch, der neue Uploads und Finalisierung sperrt, ohne Daten zu droppen.

Später zwingend erforderliche Tests:

- Zod- und Domain-Unit-Tests für DTOs, Defaults, Mapper, Allowlisten und Fehlermapping;
- Magic-Byte-/MIME-Testkorpus mit gültigen, falsch benannten, abgeschnittenen, leeren, beschädigten und polyglotten Kandidaten;
- exakte Grenztests bei 0, 15.000.000/15.000.001 und 25.000.000/25.000.001 Bytes;
- Batchgrenzen 20/21 und Projektquote 99/100/101 einschließlich paralleler Reservierungen;
- Auth-/Rollenmatrix für Admin, Reviewer, anonym, fehlendes Profil, gelöschtes Projekt, fremde IDs und Rollenwechsel;
- RLS-/Storage-Negativtests für freie Pfade, fremde Reservierung, `pending`, `failed`, Soft Delete, Overwrite, UPDATE und DELETE;
- Failure Injection an jeder Grenze: DB vor/nach Insert, Storage vor/nach Create, Finalisierung, Revalidation und Cleanup;
- Timeout-, Abbruch-, Offline-, Retry-, Replay- und doppelter Klick-Test;
- Reconcilerfälle `pending` ohne/mit Objekt, `failed` mit Objekt, `ready` ohne Objekt und Objekt ohne Zeile;
- Browser-E2E für Mehrfachupload, begrenzte Parallelität, Progress, Abbruch, Retry, Navigation und barrierearme Statusansagen;
- Last-/Ressourcentests für maximale Dateien und Parallelität, ohne PII in Logs;
- Regression für bestehendes Soft Delete: keine neue URL/Sichtbarkeit nach Löschung und kein Upload-Cleanup über die fachliche RPC.

Statische Migrationstests allein sind dafür nicht ausreichend. Die Production-Freigabe benötigt echte Integration mit PostgreSQL, Auth und privatem Storage in einer isolierten, production-nahen Umgebung.

## 14. Abschlussbericht

| Feld | Ergebnis |
|---|---|
| Audit-ID | `KG-AUDIT-2026-07-27-AP12-02-00-UPLOAD-ORCHESTRATION-V1` |
| Branch | `work` |
| Commit | Audit-Abschlusscommit dieses Arbeitspakets; konkrete Hashreferenz im Git-/PR-Abschlussbericht |
| PR | nach dem Audit-Abschlusscommit über `make_pr` erstellt |
| geänderte Dateien | ausschließlich `docs/audits/2026-07-27-ap12-02-upload-orchestration.md` |
| Scope | Architektur-/Sicherheitsaudit der Project-Media-Upload-Orchestrierung |
| Empfehlung nächstes Arbeitspaket | **AP-12-02-01 – Upload Reservation**; keine Storage- oder UI-Implementierung vor dessen Freigabe |

### Scope-Bestätigung

- keine Implementierung;
- keine Migration;
- kein SQL;
- keine RLS;
- keine Trigger;
- kein Storage Upload;
- keine UI;
- keine Server Actions;
- keine Services;
- keine Tests;
- keine OpenAI- oder WhatsApp-Arbeit;
- keine `package.json`-Änderung;
- **nur Audit**.

Dieses Dokument beschreibt spätere Bausteine ausschließlich als Anforderungen. Es erstellt keinen dieser Bausteine und erteilt keine Implementierungs- oder Productionfreigabe.
