# AP-12-02-10: Controlled Orphan Cleanup Architecture & Security Audit

**Audit-ID:** `KG-AUDIT-2026-07-29-AP12-02-10-CONTROLLED-CLEANUP-V1`  
**Grundlagenentscheidung:** `KG-DECISION-2026-07-29-AP12-02-08-ORPHAN-CLEANUP-V1`  
**Datum:** 29.07.2026  
**Branch:** `codex/audit-ap12-02-10-controlled-cleanup`  
**Baseline:** `8711740ae730adbe13744abcecb4cd20913133ea` (sauberer lokaler HEAD)  
**Auditstatus:** **READY FOR OWNER DECISION**  
**Freigabegrenze:** **NICHT APPROVED FOR IMPLEMENTATION; NICHT PRODUCTION READY**

## 1. Auftrag, Quellen und Nachweisgrenze

Dieses Paket ist ausschließlich Architektur-, Security- und Betriebsanalyse. Es plant einen späteren kontrollierten Cleanup, führt aber weder Klassifikation noch Mutation aus.

Vollständig gelesen wurden der verbindliche Orphan-Cleanup-Freeze, die Production-Validierung, das HTTP-500-Audit, die Upload-Orchestrierung, die Daten-/Storage-Baseline und der Media-Domain-Freeze. Vollständig geprüft wurden außerdem die drei AP-12-02-09-Implementierungsbereiche (Adminseite und View, Action und Service, Permission und Schema), die Inventur-RPC und ihre drei Tests. Ergänzend wurden sämtliche vorhandenen Migrationen, insbesondere alle sieben Projektmedien-Migrationen `202607270001` bis `202607290002`, sowie Uploadreservierung, Uploadticket, Finalisierung, UI und Soft Delete einschließlich zugehöriger Tests geprüft.

Für das Storage-Zielbild wurden die offiziellen Supabase-Grundsätze zugrunde gelegt: Objekte werden über die Storage API gelöscht; das Löschen nur der Metadatenzeile per SQL entfernt nicht zwingend das zugrunde liegende Objekt und ist nicht der unterstützte Objekt-Löschpfad. `remove()` benötigt eine `DELETE`-Policy auf `storage.objects`, wenn ein normaler JWT verwendet wird; ein korrekt serverseitig verwendeter Service-Role-Key umgeht RLS. Referenzen: [Supabase Storage Object Delete](https://supabase.com/docs/guides/storage/management/delete-objects), [JavaScript `remove()`](https://supabase.com/docs/reference/javascript/storage-from-remove), [Storage Access Control](https://supabase.com/docs/guides/storage/security/access-control) und [API Keys](https://supabase.com/docs/guides/api/api-keys). Diese Referenzen sind vor AP-12-02-11-02 erneut gegen den dann aktuellen Providerstand zu verifizieren.

### 1.1 Git- und Remote-Baseline

Der Ausgangsbranch `work` war sauber; der lokale Ausgangs-HEAD war `8711740ae730adbe13744abcecb4cd20913133ea`. Im Checkout ist kein Git-Remote konfiguriert. Deshalb waren `git fetch origin`, `git rev-parse origin/main` und ein Merge-Base-Vergleich mit `origin/main` nicht möglich. Der saubere lokale HEAD ist die Auditbaseline; ob er dem tatsächlichen aktuellen `main` entspricht, muss außerhalb dieses Checkouts im Review bestätigt werden.

## 2. Bestätigte Ausgangslage

- **UPLOAD FLOW PRODUCTION VALIDATED.** Der kontrollierte Uploadflow ist in Production validiert.
- **READ-ONLY ORPHAN INVENTORY IMPLEMENTED.** Die Admin-Inventur listet ausschließlich aktive `pending`-/`failed`-Kandidaten ab 24 Stunden, ist DB-getrieben, auf 50 Einträge pro Seite begrenzt und ausschließlich read-only.
- Inventur-UI und DTO zeigen keine Storagepfade, Originaldateinamen, URLs oder Tokens. Storagezustände werden bewusst nicht aufgelöst.
- Aus den verbindlichen Production-Nachweisen ist bekannt, dass mehrere frühere `pending`-Zeilen und zugehörige Storageobjekte existieren. Dieses Audit nennt keine IDs, Namen, Pfade, Tokens oder personenbezogenen Daten.
- Es gibt keine Cleanup-RPC, keine Storage-`DELETE`-Policy, keinen normalen Browserpfad mit Service Role, keinen Scheduler und keinen Purgeprozess.
- `project_media` erlaubt nur `pending`, `ready`, `failed`; der Trigger erlaubt nur `pending -> ready|failed`. Normale Lesewege sind `ready`-only. Die normale Soft-Delete-RPC akzeptiert ausschließlich aktive `ready`-Medien.
- Das Finalisierungs-RPC kann ein passendes, aktives `pending`-Medium atomar auf `ready` setzen. Genau deshalb darf ein späterer Cleanup nie auf einer alten Inventuraufnahme beruhen.
- Der private Bucket erlaubt normalen Rollen `SELECT` und `INSERT` unter engen Policies, aber kein `DELETE`. Service Role ist im heutigen Browser-/Uploadpfad nicht vorhanden.
- `audit_log` ist clientseitig nicht beschreibbar, besitzt aber nur Actor, Entity, Action, freies Metadata-JSON und Zeitpunkt; typisierte Workflow-, Retry- und Abschlussfelder fehlen.
- Einseitige manuelle DB- oder Storage-Löschungen bleiben verboten. **CLEANUP NOT IMPLEMENTED.**

## 3. Entscheidung in Kurzform

1. Fachliches Soft Delete und physischer Purge bleiben zwei getrennte, auditierte Schritte.
2. Das kleinste sichere erste Paket ist **Variante D**: ein einzelner Admin-Kandidat wird serverseitig revalidiert, per atomarem Compare-and-set geclaimt und fachlich soft-gelöscht; noch keine Storage-Mutation und keine Service Role.
3. Für den späteren Purge wird **Variante B** empfohlen: schmaler, kontrollierter Serverprozess mit atomarem DB-Claim, Storage-API-Aufruf und idempotentem DB-Abschluss. Variante C ist erst die spätere Batch-/Scheduler-Ausbaustufe.
4. Direkte Mutation von `storage.objects` aus einer SECURITY-DEFINER-RPC (**Variante A**) wird verworfen.
5. Operativer Zustand gehört in eine dedizierte `project_media_cleanup_items`-Struktur; `audit_log` ergänzt diese als unveränderlicher Security-Trail. Eine Run-Tabelle wird für Einzelcleanup nicht benötigt, aber vor Batchbetrieb ergänzt.
6. Für AP-12-02-11-02 ist bei unveränderten Storage-Policies ein ausschließlich serverseitiger Service-Role-Adapter die klare Empfehlung. Er wird in diesem Audit weder eingeführt noch freigegeben.

## 4. Architekturvarianten

| Variante | Sicherheit/Konsistenz | Teilfehler/Retry | Betriebsaufwand | Entscheidung |
|---|---|---|---|---|
| **A: eine SECURITY-DEFINER-RPC für DB und Storage** | Eine PostgreSQL-Funktion kann Tabellenmutationen atomar behandeln, aber nicht einen unterstützten Storage-API-Delete in dieselbe DB-Transaktion aufnehmen. Direkte Mutation von `storage.objects` behandelt nur Storage-Metadaten, kann Objektbestand und Provider-Metadaten auseinanderlaufen lassen und umgeht die Storage-API-Lebenszykluslogik. | Keine echte Transaktionsgrenze zwischen DB und Objektspeicher; API- und DB-Commit können nicht gemeinsam zurückgerollt werden. | Scheinbar klein, tatsächlich hohes Recovery- und Providerkompatibilitätsrisiko. | **Verworfen. Nicht offiziell betriebssicher.** Eine RPC darf DB-Claim/Abschluss leisten, aber nicht direkt physisch in `storage.objects` löschen. |
| **B: zweistufiger kontrollierter Serverprozess** | CAS-Claim in DB, Storage-Delete über offizielle API, terminaler DB-Abschluss. Autorisierung und Pfadableitung bleiben serverseitig. | Explizite Zustände machen jeden Schritt wiederaufnehmbar; bereits fehlendes Objekt ist behandelbar. | Mittlerer Aufwand; privilegierte Servergrenze und Production Gate erforderlich. | **Ziel für späteren physischen Purge.** Server Action oder Route Handler ist technisch möglich; entscheidend sind server-only Adapter, erneute Auth-Prüfung und kein frei adressierbarer generischer Delete-Endpunkt. Für einen UI-Einzelaufruf wird eine Server Action bevorzugt. |
| **C: privilegierter Job/Worker** | Sehr gute Trennung vom Browser; Secrets und Durchsatz lassen sich isolieren. | Claims, Paging, Backoff und Monitoring lassen sich robust ausbauen. | Höchster Anfangsaufwand; Scheduler, Alarmierung und Run-Steuerung nötig. | **Spätere Batchausbaustufe**, nicht erstes MVP. Geeignet für automatische Purges und Storage-Reconciliation nach eigenem Gate. |
| **D: nur Claim/fachliches Soft Delete** | Kleinste Privilegien und Angriffsfläche; aktiver Anwendungszugriff endet sofort, Objekt bleibt privat liegen. | Nur DB-Transaktion im ersten Paket; keine verteilte Teilfehlerklasse. | Niedrig; temporär mehr Storageverbrauch und nachgelagerter Betriebsbedarf. | **Empfohlen für AP-12-02-11-01.** Konsistenz ist bewusst „fachlich gelöscht, Objekt noch vorhanden“ und muss operativ sichtbar bleiben. |

Variante D ist kein Ersatz für Purge, sondern die sichere erste Hälfte. Danach folgt B; C darf B später anstoßen. A bleibt auch im Batchbetrieb ausgeschlossen.

## 5. Verbindliche Sicherheitsgrenzen

- Reviewer und anonyme Nutzer dürfen Cleanup weder sehen noch starten; ausschließlich aktive Adminprofile sind zugelassen.
- Die UI darf keine frei eingegebene Media-ID und niemals Bucket oder Pfad anbieten. Der Action-Request enthält nur die IDs des konkret dargestellten Einzelkandidaten; Besitz des Identifikators ist keine Berechtigung.
- Der Server lädt den Kandidaten unmittelbar vor jeder Mutation neu und klassifiziert ihn erneut. Er prüft Authentifizierung, aktives valides Profil, zentrale Adminpermission, exakte Media-/Projektbindung, Projektzustand, `upload_status IN ('pending','failed')`, `created_at <= statement_timestamp() - interval '24 hours'` und `deleted_at IS NULL`.
- `ready` ist vollständig ausgeschlossen. Status, Altersgrenze und `deleted_at` müssen Teil desselben atomaren CAS sein, nicht nur vorangehende Serviceprüfungen.
- Bucket und kanonischer Pfad stammen ausschließlich aus der geclaimten DB-Zeile. Clientwerte dafür werden nicht akzeptiert, gespiegelt oder bevorzugt. Weder Public URL noch Signed Download URL sind Cleanupmechanismen.
- Der Service-Role-Key ist im Browser, Clientbundle, DTO, Fehler, Telemetrie und Log verboten.
- Ein Inventurergebnis ist weder Claim noch Mutationsfreigabe. Alle Bedingungen werden bei Mutation erneut geprüft.
- Ein paralleler Finalisierungsversuch auf `ready` und ein Cleanup-Claim konkurrieren in DB. Nur genau eine CAS-Transition darf gewinnen. Ein Purge darf ausschließlich ein erfolgreich geclaimtes, weiterhin nicht aktives Item adressieren.
- Ein verspäteter Finalisierungsversuch darf eine beanspruchte/soft-gelöschte Zeile nicht reaktivieren; terminales `deleted_at` und Trigger-/RPC-Bedingungen müssen dies erzwingen.
- Keine fachliche Hauptzeile wird physisch gelöscht. Fehlerausgaben sind stabile Codes ohne rohe Supabase-/Storagefehler und ohne sensitive Metadaten.

## 6. Statusmodell und atomarer Claim

Das vorhandene Uploadstatusmodell reicht als Uploadautomat aus, aber nicht als mehrstufiger Cleanup-Workflow. Cleanupzustände dürfen nicht in `upload_status` gemischt werden: Uploadzustand und Bereinigungsfortschritt sind orthogonale Fakten.

| Option | Race-Schutz und Idempotenz | Übersicht, Retry, Audit | Komplexität/Migration | Constraint-/Triggerwirkung | Bewertung |
|---|---|---|---|---|---|
| **1. Nur `deleted_at` als Claim** | CAS auf Status, Alter und `deleted_at IS NULL` schützt den Erstclaim; erneuter Aufruf erkennt soft-gelöscht. Nach Storage-Teilfehlern fehlt jedoch ein eindeutiger operativer Schrittzustand. | Schwache Retry-/Fehlerübersicht; Ursache, Versuche und Purgeabschluss müssten indirekt rekonstruiert werden. | Kleine Migration/RPC-Anpassung; Trigger erlaubt terminales Setzen bereits für enges SECURITY DEFINER. | `upload_status` unverändert; bestehende Soft-Delete-Semantik bleibt, aber `deleted_at` trägt zu viele Bedeutungen. | Für reines AP-12-02-11-01 technisch möglich, als Grundlage des späteren Purge allein nicht ausreichend. |
| **2. Cleanupstatus auf `project_media`** | CAS ist möglich und Zustände sind sichtbar. | Retry gut abbildbar. | Migration, neue Spalte oder Erweiterung der Statusconstraint, Trigger und alle Mapper/Queries müssen angepasst werden. | Erweiterung von `upload_status` um Cleanupwerte vermischt Domänen; separate Spalte wäre besser, belastet aber Hauptzeile mit Workflowzustand. | Nicht empfohlen; insbesondere keine `cleanup_*`-Werte in `upload_status`. |
| **3. Cleanup-Run-/Item-Tabellen** | Eindeutiges Item pro Medium/aktiver Bereinigung, typisierte Zustände und Versuchszähler; Claim und Soft Delete können in einer DB-Transaktion/CAS gekoppelt werden. | Beste Wiederaufnahme, Monitoring und spätere Batches. | Höherer Migrations-, RLS-, Grant-, Trigger- und Testbedarf. Run-Tabelle ist beim Einzel-MVP verzichtbar. | Bestehende Uploadconstraint bleibt unverändert; neue Tabellen benötigen eigene Constraints, `updated_at`, RLS und keine direkten Clientmutationen. | **Empfohlen als `cleanup_items` + Audit; `cleanup_runs` erst vor Batch.** |
| **4. Nur `audit_log`, Medienzeile unverändert** | Ein Eventlog ist kein Lock; konkurrierende Aufrufe können beide fortfahren. JSON-Metadata darf keine Workflowquelle sein. | Ereignisse vorhanden, aber kein belastbarer aktueller Zustand oder atomarer Retry-Claim. | Anfangs klein, später fehleranfällige Rekonstruktion. | Keine Statuswirkung. | **Nicht ausreichend.** |

### Empfehlung

Eine dedizierte, serverseitig verwaltete `project_media_cleanup_items`-Zeile ist der technische Claim. Für den Erstclaim gelten eine Unique-/Partial-Unique-Invariante gegen mehrere aktive Items und eine atomare DB-Operation, die (a) Kandidat und Projekt unter Lock/CAS revalidiert, (b) ein Item mit stabiler UUID und Zustand `claimed` anlegt und (c) `project_media.deleted_at` setzt. Kein Client darf Cleanupstatus setzen. `upload_status` bleibt `pending|ready|failed`.

Für AP-12-02-11-01 darf das reduzierte Itemmodell die späteren Zustände vorbereiten: `claimed`/`soft_deleted`, später `purge_in_progress`, `purge_retry_required`, `completed`, `permanent_failure`. Konkrete Namen und Retention werden im Implementierungsaudit finalisiert. Eine `cleanup_runs`-Tabelle kommt erst mit Mehrfachkandidaten/Worker hinzu. Das ist geringfügig größer als nur `deleted_at`, verhindert aber, dass AP-12-02-11-02 später aus untypisiertem Audit-JSON operieren muss.

## 7. Soft Delete und physischer Purge

- Soft Delete beendet normale Anwendungszugriffe sofort. Das private Storageobjekt darf danach bis zum erfolgreichen Purge weiter bestehen.
- Purge ist ein eigener, ausdrücklich freizugebender Schritt. Er revalidiert das Cleanup-Item, die unveränderliche Medien-/Projektbindung und den terminalen Medienzustand. Ein aktives `ready`-Medium darf nie getroffen werden.
- Ein nicht vorhandenes Objekt ist bei passendem Claim ein idempotent behandelbarer Abschluss (`object_already_absent`), kein automatischer Fatalfehler.
- `public.soft_delete_project_media(uuid, uuid)` ist nicht wiederverwendbar: Es akzeptiert absichtlich nur `ready`, während Orphan-Kandidaten ausschließlich `pending|failed` sind. Eine Erweiterung würde normale Medienlöschung und Orphan-Klassifikation vermischen, die 24-Stunden-Grenze und Claimsemantik verwässern und die Angriffsfläche vergrößern.
- Empfehlung: eine **separate, admin-only Orphan-Claim-RPC** darf später ausschließlich die atomare DB-Transaktion ausführen. Die bestehende Ready-Soft-Delete-RPC bleibt unverändert. Der physische Storage-Adapter ist keine RPC und mutiert `storage.objects` nicht direkt.

## 8. Storage-Delete und Service Role

### 8.1 Unterstützter Pfad

Physisches Löschen erfolgt später ausschließlich über `supabase.storage.from(dbBucket).remove(dbPaths)` beziehungsweise die entsprechende offizielle Storage API. Direkte SQL-Deletes auf `storage.objects` sind ausgeschlossen: Sie bieten keine verlässliche, unterstützte Kopplung an die physische Objektentfernung und gefährden Storage-API-Metadatenkonsistenz. Zwischen Storage API und Postgres gibt es keine gemeinsame ACID-Transaktion; Claims und Recoveryzustände sind daher zwingend.

Mit dem heutigen Schema kann `authenticated` nicht löschen: Tabellenprivileg und `DELETE`-Policy fehlen. Eine neue engste Policy wäre technisch möglich, wenn ein serverseitiger Prozess den Benutzer-JWT weiterreicht; sie würde jedoch auch jedem kompromittierten Admin-Browser einen Storage-DELETE-Pfad eröffnen. Eine allgemeine „Admin darf Bucketobjekte löschen“-Policy wäre zu breit, weil Storage-RLS weder 24-Stunden-Claim noch zuverlässig den mehrstufigen Workflow und dessen Abschluss erzwingt. Für das MVP wird keine Storage-DELETE-Policy empfohlen.

### 8.2 Klare Service-Role-Entscheidung

**Für AP-12-02-11-02 wird bei unveränderten Policies ein Service-Role-Key empfohlen und ist praktisch erforderlich.** Ohne Service Role wäre die konkrete Alternative eine neue extrem enge Storage-`DELETE`-Policy plus authenticated JWT; diese erweitert aber absichtlich die Rechte normaler Rollen und wird für dieses System als weniger sicher bewertet.

Verbindliche Gates für einen späteren Service-Role-Einsatz:

- ausschließlich serverseitige Vercel-Environment-Variable;
- eigener `server-only` Storage-Delete-Adapter mit genau einer Operation und festem Bucket-Allowlisting;
- Verwendung ausschließlich nach erfolgreichem DB-Claim und erneuter Revalidierung; keine generische Datenbankmutation mit diesem Client;
- kein Import aus Client Components, keine Rückgabe an Clients, kein Logging von Key, Token, URLs, Pfaden oder rohen Providerfehlern;
- keine clientgewählte Bucket-/Pfadangabe; Adapter erhält aus der DB aufgelöste kanonische Targets;
- eigener Security-Test, Secret-/Bundle-Test, Integrationstest gegen isolierte Umgebung und eigener Production Gate;
- kein Einsatz vor expliziter Product-Owner-Freigabe.

Mehrere Objekte/Derivate werden nicht über Prefix-Delete erraten. Jedes physische Target benötigt eine explizite, DB-gebundene Item-/Derivative-Zuordnung und einen eigenen Schrittstatus. Das erste Purgepaket löscht genau das Original; Derivate folgen erst nach eigenem Datenmodellentscheid. „Nicht gefunden“ wird nur nach exakter Targetbindung als idempotent abwesend behandelt.

## 9. Verbindlicher idempotenter Ablauf

| Schritt | Eingabe und Berechtigung | Atomare Bedingung / CAS | Fehler und Retry | Abschlusszustand |
|---|---|---|---|---|
| **1. Auswahl** | Admin wählt genau einen sichtbaren Inventurkandidaten; Request nur `media_id`, `project_id`, optional erwartetes `updated_at`. | Keine Mutation; Inventur ist kein Claim. | Veraltete Ansicht wird in Schritt 3 neutral behandelt. | Nur lokale Auswahl. |
| **2. Authentifizierung** | Server liest Session, aktives Profil und zentrale Adminpermission. Reviewer/Anon scheitern. | Keine Clientrolle wird akzeptiert. | `cleanup_forbidden`; kein Retry ohne Berechtigungsänderung. | Keine Mutation. |
| **3. Re-Load/Klassifikation** | Server lädt anhand beider IDs; Bucket/Pfad bleiben intern. | Exakte Zuordnung, aktives/nachvollziehbares Projekt, `pending|failed`, mindestens 24 h, `deleted_at IS NULL`, optional erwartete Version. | Not found, falsches Projekt, jung, ready oder gelöscht: keine Mutation; erneute Inventur statt Blind-Retry. | Eligibility nur innerhalb der folgenden DB-Operation belastbar. |
| **4. Claim + Soft Delete** | Enges DB-RPC mit Actor aus `auth.uid()`, IDs und optional Version. | In **einer Transaktion**: Rolle erneut; Zeile locken/CAS; alle Schritt-3-Prädikate; genau ein Cleanup-Item anlegen; `deleted_at` setzen; Claim-/Soft-delete-Audit schreiben. `affected_rows = 1`. | Konkurrenz verliert mit `cleanup_conflict` oder erkennt dasselbe terminale Item als `cleanup_already_completed`. Retry lädt Zustand neu. | `project_media` fachlich gelöscht; Item `soft_deleted`/geclaimt. **AP-12-02-11-01 endet hier erfolgreich.** |
| **5. Purge-Revalidierung** | Nur AP-12-02-11-02-Serveradapter; Item-ID intern, kein Browserpfad zum Objekt. | Item ist geclaimt, nicht abgeschlossen; Medium/Projektbindung stimmt; `deleted_at IS NOT NULL`; ursprünglicher Status war `pending|failed`; nie aktives `ready`; Claim-Lease/Versuch wird atomar übernommen. | Konflikt oder unzulässiger Zustand: kein Delete, `cleanup_conflict`, manueller Review je nach Invarianzbruch. | Item `purge_in_progress`. |
| **6. Storage-API-Delete** | Exakter Bucket/Pfad ausschließlich aus DB-Snapshot/gebundener Targetzeile an engen Service-Role-Adapter. | Keine DB-Transaktion über API-Grenze; kein Prefix, keine URL. | Transient: Retry mit Backoff; verboten/invariant: terminale Störung; abwesend: behandelbarer Erfolg. | Ergebniscode `deleted`, `already_absent`, `transient_failure` oder `permanent_failure`. |
| **7. Ergebnis/Audit** | Sanitisiertes Ergebnis, Actor/Item/Attempt. | Append-only Audit; keine Secrets, Pfade oder rohen Fehler. | Audit-/DB-Schreibfehler nach Delete führt zu Retrybedarf, nie zur Reaktivierung. | Ereignis nachvollziehbar oder Item bleibt rekonstruierbar. |
| **8. DB-Abschluss** | Item-ID und erwarteter `purge_in_progress`-Stand. | CAS auf Item, Attempt/Lease und weiter soft-gelöschte Medienbindung. | Bei DB-Fehler bleibt retrybares Item; Wiederholung darf Storage erneut exakt löschen. | `completed` bei deleted/already absent, sonst `retry_required` oder `permanent_failure`. |
| **9. Retry** | Nur serverseitig auf demselben geclaimten, nicht abgeschlossenen Item. | Attempt-Zähler, Lease/Lock und CAS verhindern parallele Worker; abgeschlossene Schritte werden übersprungen. | Begrenzte Versuche, exponentieller Backoff/Jitter; danach manueller Review. | Kein neues Item und keine Aktivierung des Mediums. |
| **10. Reconciliation** | Separater read-only bzw. privilegierter Betriebsprozess. | Prüft DB-/Storage-Endzustand; erzeugt keine spontane Löschfreigabe. | Abweichung wird alarmiert und separat klassifiziert. | Nachweisbarer konsistenter oder reviewpflichtiger Zustand. |

## 10. Teilfehlermatrix

`Audit` bedeutet jeweils ein sanitisiertes Ereignis mit Actor/System, Item-/Medien-/Projekt-ID, stabilem Code, Zeitpunkt und Attempt, aber ohne Pfad, Dateiname, URL, Token oder Secret.

| Fall | Erwartete Mutation | Rückgabecode | Retry? | Audit-Log | Manueller Review |
|---|---|---|---|---|---|
| **A. Claim, Delete und Abschluss erfolgreich** | Claim/Soft Delete; Storageobjekt entfernt; Item terminal. | `cleanup_completed` | Nein | Claim, Delete, Abschluss | Nein |
| **B. Objekt bereits nicht vorhanden** | Claim bleibt; Item terminal als abwesend abgeschlossen. | `cleanup_completed` (Detail nur intern: already absent) | Nein | Claim, Abwesenheit, Abschluss | Nein, sofern exakte Bindung stimmt |
| **C. Storage-Delete transient fehlgeschlagen** | Kein DB-Rollback/Restore; Item `retry_required`, Attempt erhöht. | `cleanup_retry_required` | Ja, Backoff | Sanitiserter transienter Code | Nach ausgeschöpftem Budget |
| **D. Storage-Delete dauerhaft verboten** | Medium bleibt soft-gelöscht; Item `permanent_failure`. | `storage_delete_failed` | Nein bis Konfiguration behoben; danach expliziter Retry | Permission-/Providercode, keine Rohdaten | Ja, Security/Operations |
| **E. Delete erfolgreich, DB-Abschluss fehlgeschlagen** | Objekt weg; Item kann `in_progress` erscheinen. Nie Medium reaktivieren. | `cleanup_retry_required` | Ja; Delete ist wiederholbar, Missing gilt Erfolg | Attempt-/Persistenzfehler soweit schreibbar | Bei wiederholtem DB-Fehler |
| **F. Kandidat parallel `ready`** | Cleanup-CAS verliert; kein Claim, kein Delete. | `cleanup_conflict` | Nein; Inventur aktualisieren | Konflikt ohne Pfad | Nur bei unerklärtem Zustand |
| **G. Parallel soft-gelöscht** | Kein zweites Item. Bei identischem abgeschlossenem Item idempotent; sonst Konflikt. | `cleanup_already_completed` oder `cleanup_conflict` | Nur vorhandenes retrybares Item | Duplikat/Conflict | Bei fremder Ursache |
| **H. Jünger als 24 Stunden** | Keine Mutation. | `cleanup_not_eligible` | Nicht vor Ablauf; danach neue Revalidierung | Abgewiesener Versuch optional sicherheitsbezogen | Nein |
| **I. Falsche `project_id`** | Keine Mutation. | `cleanup_not_found` (keine Existenzoffenlegung) | Nein | Sanitisiertes Mismatch/Securityevent | Bei Häufung |
| **J. Fremde/manipulierte `media_id`** | Keine Mutation. | `cleanup_not_found` oder `cleanup_forbidden` ohne Enumeration | Nein | Securityevent | Bei Häufung |
| **K. Storagepfad stimmt nicht mit DB überein** | Clientpfad wird nie akzeptiert. Interne Target-Invarianz stoppt vor Delete; Item failure/review. | `cleanup_conflict` | Nein automatisch | Invariant-Code, kein Pfad | Ja |
| **L. Mehrfacher Retry desselben Items** | Nur offener Schritt wird übernommen; terminales Item unverändert. | `cleanup_completed`, `cleanup_already_completed` oder `cleanup_retry_required` | Nur wenn offen | Jeder Attempt korreliert | Nach Budget |
| **M. Zwei parallele Cleanup-Aufrufe** | Unique/CAS lässt genau einen claimen; zweiter mutiert nichts. | Gewinner passend; Verlierer `cleanup_conflict`/`cleanup_already_completed` | Verlierer lädt neu | Beide korreliert | Nein |
| **N. Projekt zwischen Inventur und Cleanup gelöscht** | Bei bereits gelöschtem Projekt kein Erstclaim; nach Claim bleibt Zuordnung nachvollziehbar und Item darf nach definierter Retention fortgesetzt werden, aber keine spontane Neueinstufung. | Vor Claim `cleanup_not_eligible`; nach Claim bestehendes Item gemäß Zustand | Nur geclaimtes Item | Projektzustandskonflikt | Ja vor Purge, bis Policy explizit bestätigt |
| **O. Storageobjekt ohne DB-Zeile** | Keine Mutation im Kandidaten-Cleanup. | `cleanup_not_found` | Nein in diesem Flow | Reconciliation-Fund | Ja; separates Paket, mindestens 7 Tage |

## 11. Berechtigungsmodell

### UI

- ausschließlich Admin; Reviewer sehen weder Einstieg noch Aktion;
- im ersten MVP nur ein Kandidat, kein Bulk-/Mass-Delete;
- explizite Bestätigung, keine technische Pfadeingabe;
- Sichtbarkeit ist Komfort, nicht Autorisierung.

### Server

- Session über vertrauenswürdige Auth-API, aktives Profil, zentrale Adminpermission;
- schmale Zod-validierte DTOs; keine Cliententscheidung über Rolle, Status, Alter, Projektzustand oder Pfad;
- Re-Load und CAS in der privilegierten DB-Grenze; Projekt-/Medienbindung wird doppelt (Service und Mutation) geprüft;
- Reviewer und Anon enden vor Daten-/Mutationszugriff.

### Privilegierter Storagepfad

- niemals Browser oder Clientbundle; Secrets ausschließlich serverseitig;
- eigene engste Adaptergrenze, fester Bucket und DB-abgeleitete Targets;
- Service Role wird weder zurückgegeben noch geloggt; auch Tokens, URLs, Pfade und rohe Fehler werden nicht geloggt;
- kein generischer „delete arbitrary object“-Service.

## 12. Audit Logging und Datenmodell

| Modell | Eignung |
|---|---|
| **A. Nur bestehendes `audit_log`** | Gut für unveränderliche Sicherheitsereignisse, aber unzureichend als Workflow: keine Run-/Item-Beziehung, keine typisierten Schritte, Leases, Attempts oder terminalen Zustände; freies JSON darf keine Autorisierungsquelle sein. |
| **B. `project_media_cleanup_runs`** | Sinnvoll für Batchparameter, Initiator, Beginn/Ende, Summen und Gesamtergebnis. Für genau einen manuellen Kandidaten im MVP unnötige Ebene. |
| **C. `project_media_cleanup_items`** | Notwendig für atomaren Claim, Media-/Projektbindung, Schrittzustand, Attempt, stabilen Fehlercode, Lease/Version und Abschluss. Direkte Clientrechte sind verboten; UUID, `updated_at`-Trigger, RLS und nachvollziehbare serverseitige Policies/Grants sind später Pflicht. |
| **D. Item/Run + `audit_log`** | Saubere Trennung: Tabellen halten den aktuellen operativen Zustand, `audit_log` hält relevante unveränderliche Security-/Fachereignisse. Beste Langzeitarchitektur. |

**MVP-Empfehlung:** `project_media_cleanup_items` plus bestehendes `audit_log`; noch keine Run-Tabelle, weil AP-12-02-11-01 ausschließlich Einzelkandidaten behandelt. Vor Batch/Worker wird `project_media_cleanup_runs` ergänzt und Items erhalten `run_id`. Audit-Events mindestens für abgewiesenen/erfolgreichen Claim, Soft Delete, Purgeversuch, bereits abwesendes Objekt, transienten/permanenten Fehler, Retry und terminalen Abschluss. Keine personenbezogenen oder Storage-sensitiven Metadaten.

## 13. API- und DTO-Grenzen

### Eingabe-Allowlist

- `media_id: uuid`
- `project_id: uuid`
- optional `expected_updated_at` oder eine opaque Version ausschließlich für Konfliktschutz

Nicht erlaubt sind Storagepfad, Bucket, Status, `uploaded_by`, `deleted_at`, MIME-Type, Dateigröße, Cleanupstatus oder beliebige Patchobjekte. Auch ein intern bekanntes Cleanup-Item darf nicht durch frei gewählte Clientpfade auf ein anderes Medium umgebunden werden.

### Stabile Rückgabecodes

`cleanup_completed`, `cleanup_already_completed`, `cleanup_not_eligible`, `cleanup_conflict`, `storage_delete_failed`, `cleanup_retry_required`, `cleanup_not_found`, `cleanup_forbidden`. AP-12-02-11-01 nutzt davon nur die DB-relevante Teilmenge und behauptet niemals einen Storage-Erfolg. Keine rohen Postgres-, Supabase- oder Storagefehler gehen an die UI; fachliche Nichtauffindbarkeit darf keine ID-Enumeration ermöglichen.

## 14. UI-Zielbild (nur Planung)

Erst AP-12-02-11 darf in der bestehenden Admin-Inventur eine Einzelkandidatenaktion ergänzen. Vorgesehen sind ein Button pro Kandidat, expliziter Bestätigungsdialog und eine klare Warnung, dass im späteren Gesamtablauf eine physische Datei entfernt werden kann. Kein Bulk-Cleanup. Während des Aufrufs ist die Aktion pending/gesperrt. Konflikte werden neutral dargestellt und führen zum Neuladen. Erfolg wird in AP-12-02-11-01 ausdrücklich als „fachlich entfernt/für Bereinigung vorgemerkt“, nicht als physisch gelöscht, bezeichnet. Beim späteren Purge gilt Erfolg erst nach terminalem DB-Abschluss; Retrybedarf darf keinen falschen Erfolg anzeigen. Technische Pfade, Providerdetails und Secrets bleiben unsichtbar.

## 15. Manueller Betrieb, Scheduler und Monitoring

Das erste Paket bleibt manuell ausgelöster Einzelcleanup. **Kein Scheduler in AP-12-02-11-01 oder als Nebenwirkung dieses Audits.** Das hält Blast Radius, Privilegien und Recovery klein.

Ein späterer Job nutzt ausschließlich bereits klassifizierbare beziehungsweise geclaimte Items, keyset-basiertes Paging mit stabiler Sortierung, kleine konfigurierbare Batches (Startwert höchstens 25, endgültiger Wert nach Lasttest), genau eine Claim-Lease pro Item, begrenzte Parallelität, Provider-Rate-Limits, exponentiellen Backoff mit Jitter und maximales Retrybudget. Er erfasst Metriken für offene/alte Claims, Erfolgsrate, transient/permanent failures und Laufdauer; Alarme gelten für festhängende Leases, wachsenden Backlog, Permissionfehler und wiederholte Abschlussfehler. Cron/Worker, Monitoring, Alarmierung und Kill Switch benötigen ein eigenes Architecture/Security/Production Gate.

## 16. Reine Storage-Orphans ohne DB-Zeile

Diese Klasse wird nicht mit `pending`-/`failed`-Cleanup vermischt. Sie besitzt keine DB-Zeile, aus der eine sichere Löschbindung abgeleitet werden könnte, und ist daher riskanter.

- frühestens ab mindestens sieben Tagen Objektalter und ausschließlich im exakt kanonischen Namensraum `project-media/projects/...` klassifizieren;
- Alter und Präfix allein autorisieren nie eine Löschung;
- keine sofortige Löschung und kein Scan in einem normalen Seitenrequest;
- separater privilegierter Reconciler mit keyset-/cursorbasiertem Paging, Begrenzung und kontrollierten Secrets;
- keine vollständige Bucketauflistung in der UI; nur datensparsame Reviewfälle;
- manuelle Reviewmöglichkeit und eigener Claim/Audit vor jeder späteren Entfernung;
- eigenes Folgepaket nach kontrolliertem DB-gebundenem Purge.

## 17. Kleinster sicherer Implementierungsschnitt

### AP-12-02-11-01 — Claim and Soft-Delete Orphan Candidate

Empfohlen nach ausdrücklicher Owner-Freigabe:

- genau ein aktiver Admin und ein Kandidat;
- nur `pending|failed`, mindestens 24 Stunden, `deleted_at IS NULL`;
- exakte Media-/Projektbindung und Projektzustand serverseitig;
- atomarer CAS-Claim, dediziertes Cleanup-Item und fachliches Soft Delete in einer DB-Transaktion;
- vollständiges sanitisiertes Audit Logging;
- bestehende Ready-Soft-Delete-RPC unverändert;
- kein Storagezugriff, keine Service Role, keine Storage-Mutation, kein Scheduler.

Der Implementierungsumfang braucht als Datenmodelländerung später selbstverständlich eine eigene Migration, RLS/Grants, Trigger und Tests; **dieses Audit implementiert davon nichts**.

### AP-12-02-11-02 — Controlled Storage Purge

Erst nach separater Implementierungsprüfung und expliziter Service-Role-/Storage-Delete-/Production-Freigabe: Variante B, offizieller Storage-API-Delete, engster server-only Adapter, Revalidierung, Claims/Leases, idempotenter Abschluss, Security- und Integrationstests. Scheduler und reine Storage-Orphans bleiben danach weitere Pakete.

## 18. Production Readiness und Owner-Entscheidungen

- **UPLOAD FLOW PRODUCTION VALIDATED**
- **READ-ONLY ORPHAN INVENTORY IMPLEMENTED**
- **CLEANUP NOT IMPLEMENTED**
- **OVERALL AP-12 NOT PRODUCTION READY**
- Auditstatus: **READY FOR OWNER DECISION**
- Nicht erteilt: **APPROVED FOR IMPLEMENTATION**
- Nicht erteilt: **Production Ready**

Der Owner muss vor AP-12-02-11-01 insbesondere Itemmodell, Projektlöschungsfall, Audit-Retention und UI-Wording bestätigen. Vor AP-12-02-11-02 sind zusätzlich Service Role, Secret-Verwaltung, Storage-API-Verhalten, bereits fehlende Objekte, Derivate, Providerlimits, Monitoring und Production Rollback/Kill Switch freizugeben.

## 19. Scope-Bestätigung

Dieses Paket enthält **ausschließlich Analyse und Dokumentation**. Es enthält ausdrücklich:

- keine Implementierung und keine UI-Änderung;
- keine Server Action und keinen Service;
- keine Tests und keine Teständerungen;
- keine Migration und keine SQL-Änderung;
- keine RPC und keine RLS-Änderung;
- keine Storage-Policy, Grants oder Bucketänderung;
- keine Service-Role-Einführung und keine Secrets;
- keine Löschung, keinen Cleanup und kein Soft Delete;
- kein Storage-Delete und keinen Purge;
- keinen Scheduler und keine Reconciliation-Ausführung;
- keine Medienliste und keine Signed Download URLs;
- keine KI und keine WhatsApp-Integration;
- keine `package.json`-Änderung.

Damit bestätigt das Audit ausdrücklich: **nur Audit; keine Implementierung; keine Löschung; keine Migration; kein SQL; keine RPC; keine RLS; keine Storage-Policy; keine Service Role; kein Cleanup; kein Storage-Delete; kein Scheduler.**
