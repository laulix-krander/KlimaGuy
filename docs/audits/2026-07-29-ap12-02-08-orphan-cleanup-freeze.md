# AP-12-02-08: Pending Orphan Cleanup Architecture & Security Freeze

**Decision-ID:** `KG-DECISION-2026-07-29-AP12-02-08-ORPHAN-CLEANUP-V1`
**Datum:** 29.07.2026
**Branch:** `codex/ap12-02-08-orphan-cleanup-freeze`
**Baseline:** `b8f464d4c1a70de9e2a510436c6edd776e2e48e2` (sauberer lokaler HEAD)
**Status:** **APPROVED FOR AP-12-02-09 PLANNING**
**Uploadstatus:** **UPLOAD FLOW PRODUCTION VALIDATED**
**Gesamtstatus:** **OVERALL AP-12 NOT PRODUCTION READY**

## 1. Zweck, Quellen und Baseline

Dieses Dokument friert ausschließlich fachliche Begriffe, Sicherheitsgrenzen und die Architektur eines späteren kontrollierten Orphan-Cleanups ein. Es implementiert und startet keinen Inventur-, Cleanup-, Reconciliation- oder Purgeprozess.

Vollständig geprüft wurden die Architektur- und Domain-Freeze-Dokumente vom 24.07.2026, die Daten-/Storage-Baseline vom 24.07.2026, die Upload-Orchestrierung vom 27.07.2026, das HTTP-500-Audit vom 28.07.2026, die Production-Validierung vom 29.07.2026 und das Production-Validation-Runbook. Ebenfalls vollständig geprüft wurden das aktuelle `public.project_media`-Modell samt Statusautomat, die sechs Medienmigrationen `202607270001` bis `202607290001`, die aktuellen Reservierungs-, Uploadticket- und Finalisierungs-Services und -Actions sowie die bestehenden Projektmedien-Migrationstests.

Im Checkout ist kein Git-Remote konfiguriert; insbesondere stehen weder `origin` noch `origin/main` für Fetch oder Merge-Base-Abgleich zur Verfügung. Deshalb ist der saubere lokale HEAD `b8f464d4c1a70de9e2a510436c6edd776e2e48e2` die verbindliche Arbeitsbaseline. Die Gleichheit mit dem tatsächlichen Remote-`main` muss außerhalb dieses Checkouts im Review verifiziert werden.

## 2. Bestätigte Ausgangslage

- Der Single-File-Upload wurde in Production erfolgreich validiert; der neue Erfolgsablauf endet mit `upload_status = ready`.
- Mehrere frühere Fehlversuche haben `pending`-Zeilen erzeugt. Zu nicht finalisierten Uploads existieren mindestens zwei frühere Storageobjekte.
- Einseitige manuelle Löschungen wurden bewusst unterlassen, damit DB und Storage nicht ohne kontrollierte Klassifikation weiter auseinanderlaufen.
- Es gibt derzeit weder Cleanup noch Reconciliation noch einen Purgeprozess.
- Normale Tabellen- und Storage-Lesepolicies sind `ready`-only; `pending`-Medien sind darüber nicht regulär sichtbar.
- Der Bucket `project-media` ist privat. Ein unmittelbarer öffentlicher Zugriff ist nicht bestätigt.
- Das aktuelle Risiko ist daher primär operativ und konsistenzbezogen, nicht ein bestätigter Public-Exposure-Vorfall.
- Dieses Dokument enthält bewusst keine Production-IDs, Originaldateinamen, Objektpfade oder personenbezogenen Daten.

## 3. Verbindliche Definitionen

Die Altersberechnung bezieht sich auf den vertrauenswürdigen DB-Zeitpunkt der Reservierung, für das MVP `created_at`. „Älter als 24 Stunden“ bedeutet, dass der Grenzzeitpunkt erreicht oder überschritten ist (`created_at <= trusted_now - 24 hours`); die Prüfung muss später innerhalb einer Mutation erneut erfolgen.

1. **Aktiver Upload:** `project_media`-Zeile mit `upload_status = pending`, `deleted_at IS NULL` und einem Alter unter 24 Stunden.
2. **Verwaiste Pending-Reservierung:** `project_media`-Zeile mit `upload_status = pending`, `deleted_at IS NULL`, einem Alter von mindestens 24 Stunden, ohne nachweislich laufenden Upload und ohne bereits erfolgreichen Finalisierungsvorgang.
3. **Failed-Orphan:** `project_media`-Zeile mit `upload_status = failed`, `deleted_at IS NULL` und einem Alter von mindestens 24 Stunden.
4. **DB-Orphan:** `project_media`-Zeile, zu deren exakter Kombination aus `storage_bucket` und `storage_path` kein Storageobjekt existiert. Der Begriff allein entscheidet noch keine Maßnahme; insbesondere bleibt ein `ready`-DB-Orphan geschützt.
5. **Storage-Orphan:** Storageobjekt im kanonisch geprüften `project-media`-Namensraum, für dessen exakte Bucket-/Pfadkombination keine `project_media`-Zeile existiert.
6. **Inkonsistentes Paar:** DB-Zeile und Storageobjekt existieren, aber Status, Bucket/Pfad, Größe, MIME-Metadaten oder Projekt-/Medienzuordnung widersprechen einander.
7. **Soft-gelöschtes Medium mit vorhandenem Storageobjekt:** `project_media.deleted_at IS NOT NULL`, während das exakt zugeordnete physische Objekt noch existiert.
8. **Purge-Kandidat:** zuvor fachlich soft-gelöschtes oder nach kontrollierter Klassifikation ausdrücklich als bereinigungsfähig freigegebenes Medium, das alle Retention-, Autorisierungs-, Alters- und Sicherheitsbedingungen für eine physische Entfernung erfüllt. Kandidatenstatus ist keine Löschanweisung.

„Kein laufender Upload“ und „keine erfolgreiche Finalisierung“ dürfen nicht nur aus einer clientseitigen Momentaufnahme abgeleitet werden. Das spätere Design muss belastbare serverseitige Zustände, Altersgrenze und eine erneute Compare-and-set-Prüfung verbinden.

## 4. Verbindliche MVP-Entscheidungen

Alle empfohlenen Entscheidungen werden ohne Abweichung übernommen:

1. Die Sicherheitsfrist für `pending` beträgt **24 Stunden**. Sie schafft deutlichen Abstand zu normalen Uploadlaufzeiten, schützt laufende Uploads, ist verständlich und prüfbar und kann nach einem späteren Audit konfigurierbar gemacht werden.
2. Die Frist für `failed` beträgt ebenfalls **24 Stunden**. Ein einzelner transienter Uploadfehler führt damit niemals sofort zur automatischen Löschung.
3. Reviewer erhalten keinen Zugriff. Eine normale Admin-UI erhält zunächst keinen physischen Cleanup. Ein späterer manueller Cleanup darf nur über einen kontrollierten Admin-Betriebsprozess oder einen eng begrenzten Admin-RPC-/Serverpfad erfolgen. Ein Service-Role-Key im Browser ist verboten.
4. Die verbindliche Reihenfolge lautet: **Inventur → Klassifikation → fachliches Soft Delete beziehungsweise explizite Markierung → physischer Storage-Purge → abschließende Reconciliation**. Inventur und Cleanup bleiben getrennte Arbeitspakete.
5. Eine aktive `project_media`-Zeile wird nie direkt physisch gelöscht.
6. Es gibt keine automatische Bereinigung ohne Altersgrenze und keine Bereinigung von `ready`-Medien.
7. Alte `pending`-Reservierungen werden nicht wiederverwendet. Ein erneuter Upload erhält eine neue Reservierung.
8. Das MVP bietet kein Restore verwaister Uploads.
9. Ein einzelner transienter Fehler löst keine automatische Entfernung aus.
10. Das bestehende Soft-Delete-RPC ist `ready`-only und damit ausdrücklich **kein** Cleanup-Pfad für `pending` oder `failed`; eine mögliche spätere Lösung wird hier nicht vorweggenommen.

## 5. Status- und Maßnahmenmatrix

| Fall | Feststellung | Verbindliche Maßnahme |
|---|---|---|
| A | `pending`, jünger als 24 h, Objekt fehlt | Aktiver beziehungsweise noch nicht sicher verwaister Upload; keine Löschung, nur Diagnose. |
| B | `pending`, jünger als 24 h, Objekt vorhanden | Keine Löschung; Upload oder Finalisierung könnte noch laufen. |
| C | `pending`, mindestens 24 h, Objekt fehlt | DB-Orphan; nach bestätigter Klassifikation Kandidat für fachliches Soft Delete/Markierung; kein Storage-Delete erforderlich; protokollierbarer Abschlusszustand. |
| D | `pending`, mindestens 24 h, Objekt vorhanden | Verwaistes Paar; DB-Zuordnung zuerst verifizieren, dann kontrollierter separater Storage-Purge und fachliches Soft Delete/Markierung; vollständig idempotent. |
| E | `failed`, mindestens 24 h, Objekt fehlt | Nach Klassifikation fachliches Soft Delete/Markierung möglich; Ergebnis protokollieren. |
| F | `failed`, mindestens 24 h, Objekt vorhanden | Kontrollierter Storage-Purge plus fachlicher Abschluss; idempotent und auditierbar. |
| G | `ready`, Objekt vorhanden | Normaler aktiver Medienbestand; niemals Orphan-Cleanup. |
| H | `ready`, Objekt fehlt | Kritische Inkonsistenz; keine automatische Löschung oder Statusänderung; Reconciliation-Warnung und manuelle Prüfung. |
| I | DB-Zeile fehlt, Objekt vorhanden | Storage-Orphan; nicht allein anhand des Pfads löschen; kanonischen Namensraum und mindestens 7 Tage Alter prüfen; separater privilegierter Purgeprozess. |
| J | `deleted_at` gesetzt, Objekt vorhanden | Retention-/Purge-Kandidat; nicht in normaler Liste sichtbar; physischer Purge bleibt separat und benötigt seine Gates. |
| K | `deleted_at` gesetzt, Objekt fehlt | Bereits physisch entfernt oder inkonsistent; bei passendem DB-Zustand idempotent als abgeschlossen behandelbar und protokollieren. |

Zusätzlich gilt: Metadatenabweichungen sind ein inkonsistentes Paar und werden nicht automatisch „repariert“ oder gelöscht. Fälle unter 24 Stunden bleiben unabhängig von einem transienten Fehler Diagnosefälle.

## 6. Idempotenz und Race-Sicherheit

- Jeder einzelne Schritt und der Gesamtablauf müssen sicher wiederholbar sein.
- Ein bereits fehlendes Storageobjekt darf den Gesamtlauf nicht abbrechen; sein Schritt endet als „bereits abwesend“.
- Eine bereits soft-gelöschte DB-Zeile muss nicht erneut verändert werden. Ein physisch bereits entferntes Objekt gilt bei passendem terminalem DB-Zustand als Erfolg.
- Teilfehler werden schrittweise protokolliert und gezielt retrybar; ein Retry überspringt nachweislich abgeschlossene Schritte.
- Parallel gestartete Versuche dürfen niemals ein inzwischen `ready` gewordenes Medium löschen.
- Jede DB-Mutation braucht serverseitiges Compare-and-set, das unmittelbar in der Mutation mindestens ID/Projektzuordnung, erwarteten Ausgangsstatus, `deleted_at IS NULL` und die Altersgrenze erneut prüft. Vor einem Storage-Purge ist die aktuelle DB-Klassifikation erneut vertrauenswürdig zu prüfen.
- Der Objektbezug erfolgt exakt über Bucket und kanonischen Pfad, nicht über unscharfe Präfixe oder Originaldateinamen.
- Clientseitige Vorprüfungen, UI-Zustände und frühere Inventurergebnisse sind niemals alleinige Sicherheitsgrundlage.
- Die konkrete Strategie für Locking, atomare Claims, Transaktionsgrenzen und Storage-/DB-Teilfehler bleibt zwingender Gegenstand von AP-12-02-10.

## 7. Berechtigungsmodell

### Reviewer

- dürfen keine technische Orphan-Inventur sehen;
- dürfen weder Cleanup noch Purge starten;
- erhalten keine Bucket-Auflistung oder internen Storagezustände.

### Admin

- dürfen später eine datensparsame, read-only Orphan-Inventur sehen und Kandidaten prüfen;
- dürfen im MVP nicht direkt beliebige Storageobjekte löschen;
- dürfen einen späteren manuellen Cleanup nur über einen eng kontrollierten, erneut autorisierenden Server-/RPC-Pfad auslösen;
- erhalten durch diese Entscheidung keine neuen Tabellen-, Storage- oder Ausführungsrechte.

### Service Role

- ist in Browserpfaden und Clientcode verboten und darf nie als Clientsecret ausgeliefert werden;
- kommt allenfalls für einen separaten Betriebsjob nach eigenem Security Review und Least-Privilege-Entscheidung infrage;
- wird für AP-12-02-09 und AP-12-02-10 weder eingeführt noch automatisch vorausgesetzt.

UI-Sichtbarkeit ersetzt keine Autorisierung. Ein späterer privilegierter Pfad muss Authentifizierung, zentrale Rolle, Kandidatenzustand, Alter und Objektzuordnung innerhalb seiner vertrauenswürdigen Grenze prüfen.

## 8. Audit Logging

Ein späterer Cleanup muss pro Lauf und pro betroffenem Medium mindestens erfassen:

- Cleanup-Run-ID;
- Actor-ID/Rolle oder eindeutig bezeichneten Systemprozess;
- Zeitpunkt;
- Medium-ID und Projekt-ID;
- Ausgangsstatus;
- DB-Zustand vorhanden/fehlend;
- Storagezustand vorhanden/fehlend;
- Klassifikationsentscheidung;
- geplante und tatsächlich ausgeführte Schritte;
- Ergebnis jedes Schritts;
- stabilen, nicht sensitiven Fehlercode;
- Retry-Zähler;
- terminalen Abschlussstatus.

Nicht protokolliert werden Signed Tokens, Auth-Tokens, vollständige URLs, Secrets, Dateiinhalte, unnötige Kundendaten oder Originaldateinamen, sofern diese nicht nach einem eigenen Datenschutzentscheid zwingend erforderlich sind. Auch Fehlertexte dürfen diese Daten nicht indirekt aufnehmen.

Das bestehende `audit_log` (`actor_id`, `entity_type`, `entity_id`, `action`, freies `metadata`, `created_at`; keine direkten Clientrechte) kann einzelne hochrangige Cleanup-Ereignisse aufnehmen. Für einen mehrstufigen, retrybaren Lauf fehlen jedoch typisierte Run-Identität, Run-/Item-Beziehung, Schrittstatus, Retry- und Abschlusssemantik. **Freeze-Entscheidung:** Es ist nicht allein als ausreichendes Ablaufmodell freigegeben. AP-12-02-10 muss entscheiden, ob `audit_log` als unveränderlicher Sicherheits-Audit-Trail ergänzt und eine dedizierte Cleanup-Run-/Item-Struktur für operative Zustände benötigt wird. Freies JSON darf keine Autorisierungs- oder Workflowquelle werden. In diesem Paket wird keine Struktur implementiert.

## 9. Retention und Purge

- Orphan-Erkennung für `pending` und `failed` beginnt bei **24 Stunden**; vor Ablauf gibt es ausschließlich Diagnose.
- Fachliches Soft Delete oder eine äquivalente explizite Markierung ist erst nach bestätigter Orphan-Klassifikation zulässig.
- Physischer Purge ist stets ein nachgelagerter, getrennter und auditierter Schritt.
- `ready`-Medien werden durch diesen Prozess niemals automatisch entfernt. Die Retention normaler `ready`-Originale ist nicht Gegenstand dieser Entscheidung.
- Reine Storage-Orphans ohne DB-Zeile benötigen **mindestens 7 Tage** Alter sowie Namensraum- und Zuordnungsprüfung. Die längere Frist berücksichtigt die höhere Unsicherheit, schützt vor Race Conditions und verzögerter DB-Sichtbarkeit und ermöglicht manuelle Prüfung.
- Die 7-Tage-Grenze allein autorisiert keine Löschung.
- Backup-Löschung, Provider-Verhalten und rechtliche Retention bleiben externe Production Gates und müssen vor einer Purge-Freigabe separat entschieden werden.

## 10. Read-only Reconciliation-Zielbild

Obwohl die Aufgabenbeschreibung von vier Ergebnisgruppen spricht, benennt sie sieben. Der Freeze übernimmt alle **sieben** getrennten Gruppen, damit keine Information verloren geht:

- `consistent_ready`: aktive `ready`-Zeile und exakt passendes Objekt;
- `consistent_non_ready`: aktive `pending`-/`failed`-Zeile und passend vorhandenes beziehungsweise dem erwarteten Zustand entsprechend fehlendes Objekt, jeweils mit Alter/Klassifikation;
- `db_missing_object`: DB-Zeile ohne Objekt;
- `object_missing_db`: Objekt ohne DB-Zeile;
- `metadata_mismatch`: beide Seiten vorhanden, aber Bucket/Pfad, Größe, MIME oder Zuordnung widersprüchlich;
- `deleted_with_object`: soft-gelöschte Zeile mit Objekt;
- `deleted_without_object`: soft-gelöschte Zeile ohne Objekt.

AP-12-02-09 bleibt reine Inventur ohne Mutation. Der spätere Reconciler nutzt feste Paging-Grenzen und stabile Cursor/Sortierung, läuft als begrenzter Betriebsprozess oder Hintergrundjob und führt keine vollständige Bucket-Vollsuche in einem normalen Seitenrequest aus. Seine Ausgabe ist datensparsam und enthält keine Tokens, URLs, Inhalte oder unnötige Dateinamen/Kundendaten. Normale Benutzer und Reviewer erhalten keine unkontrollierte Storageauflistung. Erkennung und Mutation bleiben getrennt; ein Inventurergebnis ist kein dauerhafter Lösch-Claim.

## 11. Verbindlicher Schnitt der Folgepakete

### AP-12-02-09 — Read-only Pending Orphan Inventory

Nur Admin, read-only, `pending`/`failed` ab 24 Stunden, DB- und Storagezustand, keine Mutation, keine Löschung, keine Service Role im Browser, gezielte Tests und eigener Auditbezug.

### AP-12-02-10 — Controlled Orphan Cleanup Audit

Ausschließlich Audit vor Implementierung. Es entscheidet RPC versus Betriebsjob, Storage-Delete-Berechtigung, Transaktionalität/Claims, Teilfehler, Audit Logging, Retry, Reconciliation und Purge einschließlich externer Gates.

### AP-12-02-11 — Controlled Orphan Cleanup Implementation

Implementierung erst nach ausdrücklicher Freigabe von AP-12-02-10; Umfang und Sicherheitsnachweise ergeben sich aus diesem Audit.

### AP-12-03 — Project Media List Architecture Audit

Kann nach AP-12-02-09 oder parallel erfolgen, beginnt aber ebenfalls mit einem Audit. Es ist kein Teil des Cleanup-Pfads.

## 12. Unmittelbar nächster Schritt

Der einzige empfohlene nächste Schritt ist **AP-12-02-09 — Read-only Pending Orphan Inventory**. Noch keine Cleanup-Implementierung, keine Löschung, keine RPC, kein Scheduler und kein Purge.

## 13. Scope-Bestätigung und Freigabegrenze

Dieses Arbeitspaket ist ausschließlich ein Decision-, Architektur- und Security-Freeze. Es enthält ausdrücklich:

- keine Implementierung, UI, Server Action oder Services;
- keine Tests und keine Teständerungen;
- keine Migration oder SQL-Änderung;
- keine RPC-, RLS-, Storage-Policy-, Grants- oder Bucketänderung;
- keine Löschung, keinen Cleanup, keine Reconciliation-Ausführung und keinen Purge;
- keinen Scheduler und keine Service-Role-Einführung;
- keine Medienliste, Signed Download URLs oder Galerie;
- keine KI- oder WhatsApp-Integration;
- keine `package.json`-Änderung.

Die Entscheidung ist **APPROVED FOR AP-12-02-09 PLANNING**, ausdrücklich nicht „Production Ready“. Der Uploadablauf bleibt **UPLOAD FLOW PRODUCTION VALIDATED**; AP-12 insgesamt bleibt **OVERALL AP-12 NOT PRODUCTION READY**.
