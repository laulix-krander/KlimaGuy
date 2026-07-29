# AP-12-02 – Production-Validierung des Projektmedien-Uploads und Planung des Pending-Orphan-Cleanups

**Audit-ID:** `KG-AUDIT-2026-07-29-AP12-02-PRODUCTION-VALIDATION-V1`  
**Audit-Datum:** 29.07.2026  
**Geprüfter Branch:** `codex/audit-ap12-02-production-validation`  
**Geprüfte Baseline:** lokaler Commit `0055394310e9775736b6085dfb68e1c828766285`  
**Charakter:** ausschließlich Analyse und Dokumentation  
**Auditstatus:** **UPLOAD FLOW PRODUCTION VALIDATED** / **OVERALL AP-12 NOT PRODUCTION READY**

## 1. Auftrag, Methode und Baseline

Dieses Audit dokumentiert ausschließlich die bestätigten Ergebnisse des erfolgreichen Production-Smoke-Tests für den Projektmedien-Upload und plant das kontrollierte Vorgehen für bereits beobachtete Pending-Orphans. Es implementiert und bereinigt nichts.

Vor der Bewertung wurden die Architektur- und Domain-Audits vom 24.07.2026, die Daten-/Storage-Baseline, das Upload-Orchestrierungs-Audit, das HTTP-500-Audit und das Production-Validierungs-Runbook vollständig gelesen. Ebenfalls vollständig statisch geprüft wurden das produktive Uploadformular, Reservierungs-, Ticket- und Finalisierungs-Action samt Services sowie alle sechs angegebenen Projektmedien-Migrationen.

Der Checkout war zu Beginn sauber und befand sich auf dem lokalen Branch `work` bei Commit `0055394310e9775736b6085dfb68e1c828766285`. Es war kein Git-Remote konfiguriert; insbesondere waren weder `origin` noch `origin/main` verfügbar. Deshalb konnten `git fetch origin`, `git rev-parse origin/main` und ein Merge-Base-Abgleich mit `origin/main` nicht ausgeführt werden. Gemäß Auftrag wurde der saubere lokale HEAD als Baseline verwendet. Die Übereinstimmung dieses lokalen Stands mit dem tatsächlichen Remote-`main` bleibt eine ausdrücklich dokumentierte Review-Einschränkung.

## 2. Bestätigte Production-Nachweise

Die folgenden Aussagen geben ausschließlich die tatsächlich bestätigten Ergebnisse wieder:

1. Die vier ursprünglichen AP-12-01-Migrationen wurden manuell und in korrekter Reihenfolge in Supabase ausgeführt.
2. Das read-only Production-Validation-SQL ergab **35 PASS**, **0 FAIL** und **1 WARN** für `migration_history`.
3. Diese einzige Warnung entstand ausschließlich, weil sich die Supabase-Migrationshistorie im SQL Editor nicht stabil auslesen ließ. Sie bezeichnet keinen fehlgeschlagenen fachlichen oder sicherheitsrelevanten Check.
4. Die Migrationen wurden ersatzweise durch ihre jeweilige erfolgreiche manuelle Ausführung bestätigt.
5. Die Direct-Upload-Helper `get_pending_project_media_upload` und `get_project_media_storage_object_metadata` existieren.
6. Beide Direct-Upload-Helper sind `SECURITY DEFINER`.
7. Die Finalisierungs-RPC `public.finalize_project_media_upload(target_media_id uuid, target_project_id uuid)` existiert.
8. Die Finalisierungs-RPC gibt `boolean` zurück, ist `SECURITY DEFINER = true` und verwendet `search_path = public, storage, pg_temp`.
9. `EXECUTE` ist für `authenticated`, `postgres` und `service_role` vorhanden.
10. Für `anon` besteht kein `EXECUTE`.
11. Für `PUBLIC` besteht kein `EXECUTE`.
12. Das aktuelle Vercel-Production-Deployment war aktiv und erfolgreich.
13. Der direkte Signed Upload zu Supabase Storage war erfolgreich.
14. Der frühere Binärtransport über Vercel, der HTTP 500 verursachte, wurde aus dem aktuellen Ablauf entfernt.
15. Die Datei wurde erfolgreich hochgeladen.
16. Die UI zeigte: **„Die Datei wurde erfolgreich hochgeladen.“**
17. Das Formular wurde nach dem Erfolg zurückgesetzt.
18. Die neue `project_media`-Zeile hat `upload_status = ready`, `mime_type = image/png` und `deleted_at = NULL`.
19. Das zugehörige Storageobjekt existiert im privaten Bucket `project-media`.
20. Sein Pfad ist UUID-basiert.
21. Der Originaldateiname erscheint nicht im Storagepfad.
22. Der erfolgreiche Upload durchlief vollständig Reservierung, direkten Upload und atomare Finalisierung.

Das Audit enthält bewusst keine vorhandenen IDs, Originaldateinamen oder personenbezogenen Daten.

## 3. Production-Smoke-Test-Ergebnis

**AP-12-02 Upload Production-Smoke-Test: PASS**

| Prüfbereich | Ergebnis |
|---|---|
| Datenbankbaseline | **PASS** |
| RLS und Grants | **PASS** |
| privater Bucket | **PASS** |
| Storage-Policies | **PASS** |
| Uploadreservierung | **PASS** |
| Uploadticket | **PASS** |
| direkter Browserupload | **PASS** |
| Objektverifikation | **PASS** |
| atomare Finalisierung | **PASS** |
| UI-Erfolgsmeldung | **PASS** |
| Formularreset | **PASS** |
| neuer DB-Status `ready` | **PASS** |
| Storageobjekt vorhanden | **PASS** |

Damit ist der konkrete Single-File-Ablauf in Production nachgewiesen: DB-first-Reservierung, reservierungsgebundenes Ticket, direkter Browser-zu-Storage-Upload, Verifikation des gebundenen Objekts und atomare Statusänderung nach `ready`. Der PASS erweitert den Scope nicht auf Medienanzeige, Download, Cleanup oder die übrigen AP-12-Funktionen.

## 4. Beobachtete Pending-Orphans

In Production wurde neben mindestens einer neuen erfolgreichen `ready`-Zeile folgende reale Altsituation beobachtet:

- Mehrere frühere Uploadversuche hinterließen `project_media`-Zeilen mit `upload_status = pending`.
- Mindestens zwei frühere Storageobjekte mit jeweils ungefähr 3 MB existieren.
- Diese Rückstände entstanden während früherer fehlgeschlagener Reservierungs-, Transport- und Finalisierungsphasen.
- Die beobachteten Pending-Zeilen besitzen `deleted_at = NULL`.
- Die normalen ready-only-Lesepolicies machen Pending-Medien für die reguläre Anzeige unsichtbar.
- Die zugehörigen Storageobjekte belegen dennoch weiterhin Speicherplatz.
- Es gibt noch kein automatisches Cleanup, keine Reconciliation und keinen physischen Purgeprozess.

Die Rückstände dürfen nicht durch einseitige Handarbeit auseinandergerissen werden: Alte Dateien dürfen nicht einzeln aus Storage gelöscht werden, solange die zugehörigen Datenbankzeilen unkoordiniert bestehen bleiben. Ebenso dürfen Datenbankzeilen nicht einzeln gelöscht werden, solange ihre Storageobjekte bestehen. Datenbank- und Storagezustand müssen später gemeinsam durch einen kontrollierten, idempotenten Vorgang behandelt werden. Dieses Audit nimmt keinerlei Löschung oder Zustandsänderung vor.

## 5. Orphan-Risikobewertung

### P0 – aktuell kein bestätigter unmittelbarer Zugriffsvorfall

- Pending-Medien sind über den normalen Leseweg nicht lesbar; damit ist kein unmittelbarer unautorisierter Zugriff bestätigt.
- Der Bucket ist nicht öffentlich.
- Es besteht keine Public URL.
- Es besteht kein anonymer Zugriff.

Diese Einordnung bedeutet nicht, dass Orphans akzeptabler Dauerzustand sind, sondern nur, dass aus den bestätigten Nachweisen kein akuter P0-Datenzugriff folgt.

### P1 – kontrolliert zu schließen

- unnötiger Storageverbrauch;
- wachsende Anzahl verwaister Pending-Zeilen;
- mögliche spätere Verwechslung mit aktiven Uploads;
- fehlende Betriebsübersicht;
- fehlende Altersgrenze;
- fehlende sichere Bereinigungslogik;
- mögliche DB-/Storage-Inkonsistenz durch nur einseitige manuelle Löschung.

### P2 – nach sicherem Grundprozess ausbauen

- Kennzahlen und Monitoring;
- automatische Reconciliation;
- Batch-Bereinigung;
- Retention und physischer Purge.

## 6. Cleanup-Zielbild – Planung, keine Implementierung

1. Der Prozess ist ausschließlich für Admins oder einen separaten privilegierten Betriebsprozess zugänglich.
2. Kandidaten dürfen nur Zeilen mit `upload_status = pending` oder `failed`, `deleted_at IS NULL` und einem Alter oberhalb einer noch festzulegenden Sicherheitsfrist sein. Zusätzlich müssen das Projekt aktiv oder nachvollziehbar gelöscht, ein aktueller Upload ausgeschlossen und ein erfolgreiches `ready`-Medium ausgeschlossen sein.
3. Der erste technische Schritt ist ausschließlich eine read-only Inventur.
4. Erst danach folgt ein kontrollierter Reconciliation-Schritt mit einer expliziten Statusmatrix für:
   - DB-Zeile vorhanden / Storageobjekt vorhanden;
   - DB-Zeile vorhanden / Storageobjekt fehlt;
   - Storageobjekt vorhanden / DB-Zeile fehlt;
   - bereits soft-gelöscht;
   - bereits physisch entfernt.
5. Fachliches Soft Delete bleibt vom physischen Purge getrennt.
6. Physischer Storage-Delete und Datenbankbereinigung werden ausschließlich als koordinierter, wiederholbarer und idempotenter Vorgang gestaltet.
7. Es gibt keinen Service-Role-Pfad im Browser.
8. Es gibt keinen normalen Admin-UI-Direktdelete eines Storageobjekts.
9. Es gibt keinen automatischen Cleanup ohne verbindliche Altersgrenze.
10. Aktive oder gerade laufende Pending-Uploads werden niemals bereinigt.

Das Zielbild ist keine Freigabe zur Umsetzung. Berechtigungen, Race-Condition-Schutz, Wiederanlauf, Audit Logging und die exakte Statussemantik müssen vor jeder Implementierung separat eingefroren und geprüft werden.

## 7. Offene Product-Owner-Entscheidungen

Keine der folgenden Entscheidungen wird in diesem Audit eigenmächtig final festgelegt:

- Ab welchem Alter gilt `pending` als verwaist?
- **Empfohlener Ausgangspunkt ausschließlich zur Diskussion:** 24 Stunden.
- Werden `failed`-Zeilen gleich behandelt wie `pending`?
- Soll zuerst nur eine read-only Orphanliste implementiert werden?
- Soll Cleanup manuell ausgelöst oder zeitgesteuert werden?
- Wer darf Cleanup starten?
- Soll die DB-Zeile soft-gelöscht oder nach physischem Purge vollständig entfernt werden?
- Wie werden fehlende Storageobjekte behandelt?
- Wie werden Storageobjekte ohne DB-Zeile behandelt?
- Welche Audit- und Betriebsprotokolle sind erforderlich?
- Welche Retention gilt für Originale und fehlgeschlagene Uploads?

## 8. Empfohlene Folgepakete

### AP-12-02-08 – Pending Orphan Cleanup Architecture & Security Freeze

Ausschließlich Audit/Decision zu Altersgrenze, Statusmatrix, Berechtigungen, Reconciliation, Soft Delete versus physischem Purge, Idempotenz, Audit Logging und Betriebsprozess.

### Danach: AP-12-02-09 – Read-only Pending Orphan Inventory

Nur Anzeige beziehungsweise read-only Diagnose; keine Bereinigung.

### Danach: AP-12-02-10 – Controlled Orphan Cleanup

Erst nach einem eigenen Security Review und den Entscheidungen aus AP-12-02-08.

### Parallel oder danach: AP-12-03 – Project Media List Architecture Audit

Ausschließlich Audit vor Medienliste, autorisierter Anzeige, Signed Download URLs, Vorschau, PDF-Behandlung und Soft-Delete-UI. Daraus folgt ausdrücklich noch keine Implementierung einer Medienliste.

**Unmittelbar nächster Schritt ist ausschließlich: AP-12-02-08 Pending Orphan Cleanup Architecture & Security Freeze.**

## 9. Differenzierte Production-Readiness

### Production-ready im validierten Scope

- Single-File-Upload durch Admin;
- private Speicherung;
- DB-first-Reservierung;
- direkter reservierungsgebundener Upload;
- atomare Finalisierung;
- `ready`-Status;
- grundlegende Rollen- und RLS-Grenzen.

### Noch nicht Production-ready

- automatische Orphanbereinigung;
- Reconciliation;
- physischer Purge;
- Galerie;
- Download;
- Signed Download URLs;
- Medienliste;
- Soft-Delete-UI;
- Malwareprüfung;
- serverseitige Magic-Byte-Prüfung des gespeicherten Objekts;
- EXIF-Entscheidung;
- Retention;
- Multi-Tenant-Betrieb;
- KI;
- WhatsApp.

Der Auditstatus lautet deshalb bewusst nicht pauschal „Production-ready“:

**UPLOAD FLOW PRODUCTION VALIDATED**  
**OVERALL AP-12 NOT PRODUCTION READY**

## 10. Scope-Bestätigung

Dieses Arbeitspaket umfasst ausschließlich Analyse und Dokumentation. Es enthält:

- keine Implementierung;
- keine UI und keine UI-Änderung;
- keine Server Actions;
- keine Services;
- keine Tests und keine Teständerungen;
- keine Migration;
- keine SQL-Änderung;
- keine RLS-Änderung;
- keine Storage-Policy-Änderung;
- keine Grants;
- keine Bucketänderung;
- keine Löschung;
- kein Cleanup;
- keine Reconciliation;
- keinen Purge;
- keine Medienliste;
- keine Signed Download URL;
- keine Galerie;
- keine KI;
- keine WhatsApp-Integration;
- keine `package.json`-Änderung.

Es wurde ausschließlich `docs/audits/2026-07-29-ap12-02-production-validation.md` neu erstellt. Anwendungstests wurden wegen des reinen Dokumentationsscopes ausdrücklich nicht ausgeführt.
