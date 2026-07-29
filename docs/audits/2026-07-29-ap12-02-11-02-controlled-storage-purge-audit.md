# AP-12-02-11-02: Controlled Storage Purge Audit & Security Freeze

**Audit-ID:** `KG-AUDIT-2026-07-29-AP12-02-11-02-STORAGE-PURGE-V1`  
**Datum:** 29.07.2026  
**Branch:** `codex/audit-ap12-02-11-02-storage-purge`  
**Baseline:** `31d3580fe1cbdb5bdc69f79feb5d969a679efaa5` (sauberer lokaler HEAD)  
**Auditstatus:** **READY FOR OWNER DECISION**  
**Nicht erteilt:** **APPROVED FOR IMPLEMENTATION**, **Production Ready**

## 1. Auftrag, Nachweisgrenze und verbindliche Grundlagen

Dieses Dokument ist ausschließlich das Architektur-, Security- und Production-Gate-Audit für einen späteren kontrollierten physischen Purge **genau eines** bereits fachlich soft-gelöschten Orphan-Mediums. Es trifft eine Empfehlung, führt aber nichts aus.

Vollständig gelesen und als verbindlich berücksichtigt wurden `KG-DECISION-2026-07-29-AP12-02-08-ORPHAN-CLEANUP-V1`, `KG-AUDIT-2026-07-29-AP12-02-10-CONTROLLED-CLEANUP-V1`, die Production-Validierung, das Upload-HTTP-500-Audit, die Upload-Orchestrierung, die Daten-/Storage-Baseline und der Media-Domain-Freeze. Vollständig geprüft wurden außerdem UI, Action, Service, Permissions, Schemas, Migration und Tests von AP-12-02-11-01 sowie die Migrationen für `public.project_media`, `public.project_media_cleanup_items`, `public.audit_log`, Storage-Bucket/-Policies, Supabase-Clients, serverseitige Muster, Environment-Dokumentation und Architektur-/Security-Tests.

Im Checkout ist **kein Git-Remote konfiguriert**. `origin/main`, Fetch und Merge-Base-Abgleich waren daher nicht verfügbar. Der vor Arbeitsbeginn saubere lokale HEAD ist die Baseline; seine Gleichheit mit dem tatsächlichen Remote-`main` muss im Review außerhalb dieses Checkouts bestätigt werden.

Keine konkreten Production-IDs, Pfade, Originaldateinamen, Tokens, Secrets oder personenbezogenen Daten wurden erhoben oder dokumentiert. Eine aktuelle externe API-Verifikation war aus der Ausführungsumgebung nicht möglich; die spätere Umsetzung muss die dann aktuelle offizielle Supabase-JavaScript-Storage-`remove`-Dokumentation als Gate verifizieren.

## 2. Bestätigte Ausgangslage

- **UPLOAD FLOW PRODUCTION VALIDATED**
- **READ-ONLY ORPHAN INVENTORY IMPLEMENTED**
- **CLAIM AND SOFT DELETE IMPLEMENTED**
- **PHYSICAL STORAGE PURGE NOT IMPLEMENTED**
- **OVERALL AP-12 NOT PRODUCTION READY**
- Erfolgreich fachlich bereinigt bedeutet: `project_media.deleted_at IS NOT NULL`; genau ein gebundenes Cleanup-Item hat `cleanup_status = 'soft_deleted'`; dessen `completed_at` ist gesetzt; `source_upload_status` ist `pending` oder `failed`.
- Das physische Objekt bleibt im privaten Bucket `project-media`. Die UI sagt dies korrekt und behauptet keinen physischen Erfolg.
- `project_media.storage_bucket` ist per Constraint auf `project-media` festgelegt; `storage_path` ist DB-seitig gespeichert. Die Objekt-Policies erlauben `authenticated` nur enges `SELECT`/`INSERT`, nicht `UPDATE`/`DELETE`; ein Storage-`DELETE`-Grant beziehungsweise eine Storage-`DELETE`-Policy fehlt.
- Die vorhandenen Browser- und Server-Supabase-Clients verwenden URL und Anon-Key. Ein Service-Role-Client und ein Service-Role-Pfad im Browser existieren nicht.
- Der dokumentierte, aktuell ungenutzte Environment-Name ist bereits `SUPABASE_SERVICE_ROLE_KEY`.
- Es gibt keinen Scheduler, Cron, Batchjob oder physischen Purge.
- Einseitige manuelle Storage-Löschungen bleiben verboten. `ready`-Medien dürfen durch diesen Prozess niemals geclaimt oder entfernt werden.

## 3. Entscheidung in Kurzform

1. **Empfohlen wird Variante B:** ein eng begrenzter server-only Service-Role-Adapter über die offizielle Supabase Storage API, eingebettet in einen Admin-only Einzelworkflow mit atomarem DB-Claim und atomarem DB-Abschluss.
2. Es wird **keine** Storage-`DELETE`-Policy für `authenticated` eingeführt. Der Browser erhält weder Storage-Delete-Recht noch Service Role, Bucket oder Pfad.
3. Das vorhandene Cleanup-Item wird um **separate Purgefelder einschließlich eines eigenen `purge_status`** erweitert. `cleanup_status`, `completed_at` und `upload_status` werden semantisch nicht für den physischen Schritt umgedeutet.
4. Claim und Abschluss erfolgen später durch zwei enge DB-Operationen; die Storageoperation läuft nie in SQL und nie durch direkte Mutation von `storage.objects`.
5. Manueller Einzelpurge darf unmittelbar nach bestätigt abgeschlossenem Soft Delete erfolgen. Ein automatischer Purge benötigt Retention, Leasing, eigenes Audit und Production Gate.
6. Der vorgeschlagene Schnitt ist sicher genug, **wenn und nur wenn** alle Gates dieses Dokuments umgesetzt und vom Owner freigegeben sind. Dieses Audit erteilt diese Freigabe noch nicht.

## 4. Architekturvarianten

| Variante | Bewertung | Entscheidung |
|---|---|---|
| **A – Storage-DELETE-Policy für authenticated Admins** | Selbst eine Adminpolicy verbreitert den privilegierten Pfad auf jede kompromittierte Adminsession und potenziell Browsercode. Bucket und Objektname sind Storage-API-Parameter; eine allgemeine Policy riskiert frei gewählte/manipulierte Pfade. Storage-RLS allein bildet Cleanup-Item, `completed_at`, Retryclaim und Abschluss nicht zuverlässig als einen gebundenen Workflow ab. Eine extrem enge DB-Join-Policy wäre komplex, bliebe browsererreichbar und könnte den Storage-Delete nicht mit dem DB-Abschluss atomar koppeln. `ready`-Schutz wäre policykritisch und jede Drift gefährlich. | **Verworfen.** Zu breit für einen eng gebundenen Einzelkandidaten; keine allgemeine Admin-DELETE-Policy. |
| **B – server-only Service-Role-Adapter, offizielle Storage API** | Secret bleibt serverseitig; Claim und Revalidierung binden das exakte DB-Objekt. Ein fester Bucket, genau ein DB-Pfad und genau ein `remove` begrenzen den Blast Radius. Keine generische Admin-API. Explizite Zustände ermöglichen Retry, Idempotenz und Logging. Benötigt strikte Bundle-, Secret-, Integration- und Production-Gates. | **Empfohlen für das erste Einzelpurgepaket.** |
| **C – separater privilegierter Worker/Betriebsjob** | Beste Isolation und später geeignet für Paging, kleine Batches, Leases/Locks, Backoff, Rate Limits, Monitoring und Alarmierung. Benötigt eigenes Secret, Deployment, Betriebsverantwortung, Scheduler/Kill Switch und deutlich mehr Komplexität. | **Spätere Batchausbaustufe**, nicht MVP. |
| **D – kein Purge, nur Retention** | Minimale unmittelbare technische Gefahr; privater Speicher bleibt konsistent fachlich unzugänglich. Dauerhaft wachsen Speicherverbrauch und Betriebskosten. Datenschutzrechtliche Löschpflichten und Provider-/Backup-Retention werden nicht technisch erfüllt oder nachgewiesen. | **Nur temporärer sicherer Freeze**, kein tragfähiger Dauerzustand ohne gesondert bestätigte Retention-/Löschentscheidung. |

## 5. Berechtigungs- und Servergrenze

### 5.1 Rollen

- Ausschließlich ein authentifizierter Benutzer mit vorhandenem aktivem Profil und zentral ermittelter Rolle `admin` darf einen Einzelpurge anstoßen.
- Reviewer, anonyme/nicht authentifizierte Benutzer und Benutzer ohne valides Profil enden vor Claim und Storagezugriff.
- UI-Sichtbarkeit ist keine Autorisierung. Action, fachlicher Service und DB-Claim revalidieren die Grenze.
- Der Client darf ausschließlich `media_id` und `project_id` als strikt validierte UUIDs senden. Kein Cleanup-Item, Status, Bucket, Pfad oder Patchobjekt wird als Autorität akzeptiert.

### 5.2 Empfohlene Zielstruktur

`UI → async Server Action → fachlicher Purge-Service → Claim-RPC → server-only Storage-Adapter → Abschluss-RPC → Revalidation`

- **Server Action:** passend zum expliziten Einzelbutton und bestehenden Muster; schmale Eingabe und schmale Ergebniswerte. Sie enthält keine Storagelogik und serialisiert nie interne Targets.
- **Fachlicher server-only Service:** orchestriert Authentifizierung, Autorisierung, Claim, Adapter, normalisiertes Ergebnis und Abschluss. Diese eigene Grenze verbessert Unit-/Teilfehlertests und verhindert einen generischen Route-Endpunkt.
- **Route Handler:** für diesen formulargebundenen Einzelaufruf ohne Datei-Transport ohne Vorteil; ein öffentlicher HTTP-Endpunkt vergrößert CSRF-/Methoden-/Responsefläche. Nur nach eigenem Bedarf/Audit.
- Es gibt keinen Datei-Uploadtransport. Function-Timeouts bleiben relevant, weil Delete und DB-Abschluss getrennt sind; Recoveryzustände machen einen Timeout sicher retrybar. Die Plattformlaufzeit ist vor Production zu verifizieren.

## 6. Service-Role Security Freeze

### 6.1 Entscheidung und Environment

Bei unveränderten Policies wird `SUPABASE_SERVICE_ROLE_KEY` empfohlen. Der Name entspricht der bestehenden Repository-Dokumentation. Er darf nur als Sensitive Vercel Environment Variable existieren, niemals mit `NEXT_PUBLIC_` beginnen und hat **keinen Fallback auf den Anon-Key**. Fehlende Konfiguration führt vor Claim/Storagezugriff zu einem kontrollierten Start-/Konfigurationsfehler `purge_configuration_missing`.

### 6.2 Ausschließlich serverseitig

- Key nur in einem Modul mit `import "server-only"`; kein Import/Export über clientfähige Module, Barrels oder Client Components.
- Kein Key, Token oder Service-Role-Client in Browserbundle, Props, Actionresultat, Serialisierung, Error-Message, Log, Telemetrie oder Screenshot.
- Eigener Client nur für den Storageadapter; der fachliche DB-Claim bleibt an die Benutzer-Session und Actor-Identität gebunden. Keine generischen DB-Adminoperationen über den Service-Role-Client.

### 6.3 Enger Adaptervertrag

Vorgesehener Ort: `lib/server/project-media-storage-purge-adapter.ts` oder ein gleich enges server-only Modul. Der Adapter:

- kennt intern ausschließlich den festen Bucket `project-media`;
- akzeptiert genau **einen** serverseitig gelieferten, zuvor aus `project_media` gelesenen und validierten Objektpfad;
- führt genau eine offizielle Operation entsprechend `storage.from("project-media").remove([path])` aus;
- normalisiert nur `deleted`, `already_absent`, `transient_failure`, `permanent_failure` beziehungsweise `configuration_failure`.

Verboten sind beliebiger Bucket, Clientpfad, freie Pfadlisten, Prefix-/Wildcard-Delete, Bulk, Upload, Move, Copy, Signed/Public URLs, Downloads und generische Storage- oder DB-Administration. Weil manche Storage-APIs fehlende Objekte nicht eindeutig als Fehler melden können, muss „already absent“ in isolierten Integrationstests gegen die aktuell verwendete SDK-Version verifiziert und nötigenfalls durch eine eng gebundene serverseitige Existenzprüfung normalisiert werden; niemals durch Bucketscan.

### 6.4 Bundle- und Production-Schutz

Verbindliche Architekturtests prüfen `server-only`, Importgraph, fehlende Clientimporte, keinen Keynamen im Clientbundle, kein `NEXT_PUBLIC_SERVICE_ROLE`, keine Secret-/Pfadausgabe. Production bleibt gesperrt, bis Secret vorhanden, Scope/Verantwortung minimal, Zugriffsaudit und Rotation dokumentiert, Preview getrennt und ein kontrollierter Smoke-Test freigegeben sind.

## 7. Verbindliche Kandidaten-Revalidierung

Unmittelbar beim atomaren Claim muss serverseitig aus der DB bestätigt werden:

1. Request-`media_id` und Request-`project_id` sind valide und treffen dieselbe `project_media`-Zeile.
2. Projektbindung zwischen Medium, Cleanup-Item und Projekt ist konsistent.
3. `project_media.deleted_at IS NOT NULL`.
4. `project_media.upload_status IN ('pending','failed')`; `ready` ist ausdrücklich ausgeschlossen. Es gibt keinen aktiven Upload.
5. Genau das zugehörige Cleanup-Item existiert, hat `cleanup_status = 'soft_deleted'`, `completed_at IS NOT NULL` und `source_upload_status IN ('pending','failed')`.
6. Es gibt keinen früheren erfolgreichen Purgeabschluss.
7. `project_media.storage_bucket = 'project-media'`; der Pfad ist nicht leer, entspricht der künftig zentral validierten kanonischen Projekt-/Medienbindung und stammt ausschließlich aus `project_media`.
8. Weder Bucket noch Pfad werden vom Client angenommen oder anhand eines Originaldateinamens/Präfixes konstruiert.
9. Ein aktives Projekt ist für einen **Erstclaim** erforderlich. Wurde das Projekt nach fachlichem Soft Delete inzwischen soft-gelöscht, stoppt der Erstclaim für Owner-Review; ein bereits vor Projektlöschung stabil geclaimter Purge darf nur nach explizit dokumentierter Recoveryregel fortgesetzt werden.

**Retentionentscheidung:** Für einen explizit bestätigten manuellen Einzelpurge ist nach abgeschlossenem Soft Delete kein zusätzlicher Altersabstand erforderlich. Die frühere 24-Stunden-Orphanfrist wurde bereits beim fachlichen Claim erzwungen. Jede Automatisierung benötigt dagegen eine eigene, owner-bestätigte Retentionfrist und ein eigenes Gate. Provider-Backups und rechtliche Retention bleiben externe Entscheidungen.

## 8. Datenmodellentscheidung

| Option | Race/Retry/Idempotenz | Trennung/Übersicht | Aufwand und Entscheidung |
|---|---|---|---|
| **A – `cleanup_status` um Purgezustände erweitern** | CAS und Retry möglich. | Vermischt abgeschlossenes fachliches Soft Delete mit physischem Lebenszyklus; `completed_at` würde mehrdeutig. | Klein, aber semantisch riskant; **nicht empfohlen**. |
| **B – separate `project_media_purge_items`** | Beste Isolation, eigene Unique-/Attempt-/Lease-Semantik und Batchausbau. | Sehr klare Trennung, aber zweite 1:1-Workflowtabelle und mehr RLS/FKs/Joins. | Für Derivate/mehrere Ziele oder komplexen Worker später sinnvoll; für Original-Einzelpurge **noch zu groß**. |
| **C – bestehendes Cleanup-Item plus separate Purgespalten** | Atomarer CAS, Attempts, Retry und eindeutige Media-Bindung auf bestehender Unique-Invariante. | Fachlicher `cleanup_status = soft_deleted` bleibt unverändert; eigener `purge_status` und eigene Zeit-/Fehlerfelder sind klar. | **Empfohlenes MVP.** Additive Migration und Constraints nötig, aber keine neue Tabelle. |
| **D – nur `audit_log`** | Kein Lock, kein belastbarer aktueller Zustand, keine sichere Idempotenz. | Freies JSON wäre fälschlich Workflowquelle. | **Verworfen.** |

Empfohlen werden später mindestens `purge_status` mit geschlossenem Automaten (`not_started`, `in_progress`, `retry_required`, `purged`, `failed`), `purge_claimed_at`, `purge_completed_at`, `purge_attempt_count`, `last_purge_error_code` und eine opaque Claim-/Attempt-Kennung oder Version. Constraints koppeln Zeit-/Fehlerfelder an Zustände, Zähler ist nicht negativ, `purged` hat Abschlusszeit, und genau ein Cleanup-Item je Medium bleibt bestehen. `upload_status` bleibt unverändert. `completed_at` bleibt ausschließlich Abschluss des fachlichen Soft Delete. RLS bleibt aktiv; Browserrollen erhalten keine direkten Tabellenmutationen.

## 9. Atomarer Purge-Claim

Eine spätere `SECURITY DEFINER`-RPC `claim_project_media_storage_purge(target_media_id uuid, target_project_id uuid)` ist geeignet, sofern sie einen festen `search_path`, explizite Revoke/Grant-Regeln, `auth.uid()`, zentrale Adminrolle und Row Lock/CAS verwendet.

Sie muss alle Bedingungen aus Abschnitt 7 in derselben atomaren Mutation prüfen, ausschließlich `soft_deleted`, `not_started|retry_required` akzeptieren, den Attempt erhöhen, eine stabile Claimkennung/-version und `purge_status = in_progress` setzen und parallele Aufrufe verhindern. `purged` liefert idempotent `purge_already_completed`; ein bereits aktiver Claim liefert `purge_conflict`. Sie führt keine Storageoperation in SQL aus und akzeptiert keinen Bucket/Pfad.

Die browserfähige Rückgabe enthält höchstens Cleanup-Item-ID, Medium-ID, Projekt-ID, Purgestatus und stabilen Code. Der Pfad darf nicht in das Actionresultat gelangen. Bevorzugt liefert die RPC das interne Target nur an den innerhalb derselben Server-Action laufenden Service; alternativ liest ein separater `server-only` Helper nach dem Claim anhand Cleanup-Item-ID plus Claimkennung den gebundenen Pfad. In beiden Fällen bleibt der Wert im Serverprozess und wird vor Adapteraufruf nochmals auf festen Bucket und Bindung geprüft. Ein clientseitig direkt aufrufbarer Pfad-Read ist verboten.

## 10. Atomarer Purge-Abschluss

Eine zweite enge RPC, beispielsweise `complete_project_media_storage_purge(target_cleanup_item_id uuid, target_media_id uuid, target_project_id uuid, target_claim_token uuid, purge_result text, sanitized_error_code text)`, ist erforderlich. Eine Claimkennung ist enger als nur die drei IDs und verhindert, dass ein alter Attempt einen neuen überschreibt.

- Aufruf ausschließlich durch den server-only Purge-Service nach normalisiertem Storageergebnis; **nicht direkt durch den Client**.
- Benutzer-Actor/Admin und erwartete Claimkennung beziehungsweise ein explizit autorisierter interner Serverprozess werden geprüft; die Service Role darf nicht pauschal fachliche Autorisierung ersetzen.
- Nur der passende Zustand `in_progress` wird abgeschlossen. `deleted` und kontrolliert bestätigtes `already_absent` setzen `purged` und `purge_completed_at`.
- Transiente Fehler setzen `retry_required`; dauerhafte/invariante Fehler setzen `failed` oder bleiben reviewpflichtig. Nur geschlossene, sanitiserte Codes werden gespeichert.
- `purged` ist idempotent und liefert `purge_already_completed`. Kein roher Storagefehler, Pfad oder Bucket erscheint im Audit.
- Falls Storage erfolgreich war, aber Abschluss scheitert, bleibt der Claim recoveryfähig. Der Retry darf denselben exakten Delete wiederholen; ein dann fehlendes Objekt schließt erfolgreich ab.

## 11. Verbindlicher idempotenter Ablauf

1. Admin öffnet die Inventur; später zeigt eine getrennte Ansicht/Aktion nur fachlich bereinigte Kandidaten.
2. Admin wählt genau einen Kandidaten und bestätigt explizit.
3. Server Action validiert nur beide IDs; Service authentifiziert und autorisiert erneut.
4. Claim-RPC lädt DB-Zustand erneut, revalidiert alle Invarianten und claimt atomar.
5. Service erhält festen Bucket und DB-Pfad ausschließlich innerhalb der Servergrenze.
6. Server-only Adapter ruft genau einmal die aktuell offizielle Supabase Storage API, geplant `storage.from('project-media').remove([path])`, auf.
7. Adapter normalisiert das Ergebnis; keine Rohantwort verlässt ihn.
8. Abschluss-RPC setzt bei Delete oder bestätigter Abwesenheit `purged` und `purge_completed_at`, sonst `retry_required`/sanitisierten Fehlercode.
9. Erst der bestätigte DB-Abschluss führt zu UI-Erfolg und Revalidation.
10. Bereits fehlendes Objekt ist bei korrekter DB-Bindung idempotenter Erfolg; mehrfacher Aufruf nach Abschluss liefert `purge_already_completed` und führt keinen weiteren Storage-Delete aus.
11. Kein `ready`-Medium kann geclaimt oder gelöscht werden.

## 12. Teilfehlermatrix

`Ja*` bedeutet nur nach vollständig erfolgreichem Claim/Revalidation. „Audit“ enthält ausschließlich IDs/Zustände/Codes, nie Pfad oder Rohfehler.

| Fall | Claim? | Storage? | DB-Abschluss | Stabiler Code | Retry? | Review? | Audit-Log |
|---|---:|---:|---|---|---:|---:|---|
| A Claim, Delete, Abschluss erfolgreich | Ja | Ja* | `purged`, Zeit gesetzt | `purge_completed` | Nein | Nein | Claim, Delete, Abschluss |
| B Objekt bereits nicht vorhanden | Ja | Ja*, Ergebnis absent | `purged`, Zeit gesetzt | `purge_storage_object_missing` intern, UI-Erfolg | Nein | Nein bei korrekter Bindung | Claim, Abwesenheit, Abschluss |
| C Delete transient fehlgeschlagen | Ja | versucht | `retry_required`, Attempt/Code | `purge_retry_required` | Ja, begrenzt | Nach Budget | Claim, Attempt, Code |
| D Delete dauerhaft verboten | Ja | versucht | `failed` | `purge_storage_failed` | Erst nach Konfigurationsfix | Ja Security/Ops | Claim, sanitiserter Permissioncode |
| E Delete erfolgreich, Abschluss-RPC fehlschlägt | Ja | Ja | bleibt `in_progress`/recoveryfähig | `purge_retry_required` | Ja | Bei Wiederholung | Claim; Persistenzfehler soweit möglich |
| F Abschluss-Retry nach erfolgreichem Delete | vorhandener Claim | exakter Retry darf absent ergeben | `purged` | `purge_completed` | Nein danach | Nein | Retry, absent, Abschluss |
| G zwei parallele Aufrufe | genau einer | nur Gewinner | Gewinner normal; Verlierer unverändert | `purge_conflict` | Verlierer lädt neu | Nein | Gewinner + Konflikt |
| H bereits `purged` | Nein/neutrales idempotentes Ergebnis | Nein | unverändert | `purge_already_completed` | Nein | Nein | Wiederholung optional |
| I Cleanupstatus nicht `soft_deleted` | Nein | Nein | unverändert | `purge_not_eligible` | Nein | Bei Invarianzbruch | Ablehnung |
| J `deleted_at` wieder NULL/inkonsistent | Nein | Nein | unverändert | `purge_conflict` | Nein automatisch | Ja | Invarianzcode |
| K `upload_status = ready` | Nein | Nein | unverändert | `purge_not_eligible` | Nein | Ja bei Cleanup-Item | Security/Invarianz |
| L falsche `project_id` | Nein | Nein | unverändert | `purge_not_found` | Nein | Bei Häufung | Enumeration-sicher |
| M manipulierte `media_id` | Nein | Nein | unverändert | `purge_not_found`/`purge_forbidden` | Nein | Bei Häufung | Securityevent |
| N DB-Pfad fehlt/ungültig | Nein | Nein | Claim nicht setzen oder `failed` bei nachträglicher Drift | `purge_conflict` | Nein automatisch | Ja | Invarianzcode, kein Pfad |
| O Bucket ungleich `project-media` | Nein | Nein | wie N | `purge_conflict` | Nein | Ja | Invarianzcode |
| P Service-Role-Secret fehlt | Nein; Konfiguration vor Claim prüfen | Nein | unverändert | `purge_configuration_missing` | Nach Konfiguration | Ja Ops | Code, kein Secret |
| Q Service-Role-Secret ungültig | Ja möglich | Versuch scheitert | `failed`/`retry_required` gemäß Klassifikation | `purge_storage_failed` | Nach Rotation/Fix | Ja Security | sanitiserter Authcode |
| R Vercel-Timeout nach Delete vor Abschluss | Ja | möglicherweise erfolgreich | bleibt recoveryfähig | beim Retry `purge_retry_required` → `purge_completed` | Ja | Bei festhängendem Claim | Claim, später Retry/Abschluss |
| S Projekt inzwischen gelöscht | Erstclaim Nein; bestehender Claim nur definierte Recovery | Nein beim Erstclaim | unverändert/reviewpflichtig | `purge_not_eligible`/`purge_conflict` | Nur Owner-bestätigte Recovery | Ja | Projektzustandskonflikt |
| T Storageobjekt ohne DB-Zeile | Nein | Nein | keine Mutation | `purge_not_found` | Nein in diesem Flow | Ja, separates Audit | Reconciliation-Fund |

## 13. Geschlossene Ergebnis- und Fehlercodes

Öffentliche/fachliche Menge: `purge_completed`, `purge_already_completed`, `purge_not_eligible`, `purge_conflict`, `purge_forbidden`, `purge_not_found`, `purge_retry_required`, `purge_storage_failed`, `purge_configuration_missing`, `purge_failed`.

`purge_storage_object_missing` ist ein sanitisiertes internes Audit-/Adapterergebnis und wird bei korrektem DB-Zustand terminal zu `purge_completed`; es darf nicht als falscher Fehler erscheinen. Weitere Providertexte werden auf diese geschlossene Menge abgebildet. Keine rohen Supabase-/Storagefehler, Pfade, URLs, Tokens oder Secrets gehen an UI oder Audit.

## 14. Audit Logging

`project_media_cleanup_items` ist die operative Wahrheit; `public.audit_log` ist der unveränderliche Security-/Fachtrail. Zusammen genügen sie für den manuellen Einzelpurge, sofern die empfohlenen typisierten Purgefelder umgesetzt werden. `audit_log` allein genügt nicht; eine Run-Tabelle ist erst vor Batchbetrieb nötig.

Zu protokollieren sind Actor-ID/Rolle, vertrauenswürdiger Zeitpunkt, Cleanup-Item-ID, Medium-ID, Projekt-ID, sanitiserter Ausgangszustand, Claim/Attempt, normalisiertes Storage-Delete-Ergebnis, Abschlusszustand, Retry-Zähler und stabiler Fehlercode. Abgewiesene Securityversuche werden enumeration-sicher protokolliert; nicht jeder harmlose Wiederholungsaufruf muss ein Alarm sein.

Nicht protokolliert werden Service-Role-Key, Auth-/Signed Tokens, URLs, Storagepfad, Originaldateiname, Dateiinhalt, Kundendaten, rohe Storageantworten oder Providerfehlermeldungen. Audit-Events dürfen nicht direkt vom Client geschrieben oder als Workflow-/Autorisierungsquelle verwendet werden.

## 15. UI-Security-Freeze (nur Zielbild)

- Button nur für bereits fachlich bereinigte Kandidaten: **„Physische Datei endgültig entfernen“**.
- Expliziter Bestätigungsdialog: **„Die physische Datei wird dauerhaft aus dem privaten Speicher entfernt. Dieser Vorgang kann nicht rückgängig gemacht werden.“**
- Kein Bulk, kein Bucketfeld, kein freier Pfad, keine technischen Details.
- Pending: **„Wird endgültig entfernt …“**
- Erfolg erst nach DB-Abschluss: **„Die physische Datei wurde endgültig entfernt.“**
- Retry: **„Die physische Datei konnte noch nicht vollständig entfernt werden. Der Vorgang kann sicher erneut versucht werden.“**
- Konflikt: **„Das Medium ist nicht mehr für den Purge geeignet.“**
- Doppelabsenden wird gesperrt; kein optimistisches Entfernen und kein falscher Erfolg zwischen Storage-Delete und Abschluss.

## 16. Preview-, Local- und Production-Grenzen

### Production

Purge bleibt deaktiviert, bis Migration/Constraints/RLS/Grants/RPCs vollständig angewendet, Vercel-Secret geprüft, Deployment erfolgreich, SDK-Verhalten verifiziert, Verantwortlichkeit/Rotation/Zugriffsaudit dokumentiert und Kill-Switch/Recoveryrunbook vorhanden sind. Danach genau ein kontrollierter Kandidat: vorher DB `soft_deleted` und Objekt vorhanden verifizieren; explizit über UI bestätigen; danach Objektabwesenheit, Item `purged`, Audit-Log und unveränderten `ready`-Bestand prüfen.

### Preview

Standardmäßig kein Production-Bucketzugriff und kein Production-Service-Role-Key. Purge nur mit eigener isolierter Preview-Supabase-Umgebung und eigenem Secret; andernfalls Funktion hart deaktiviert. Preview darf nie versehentlich auf Production zurückfallen.

### Local

Nur lokale Supabase-Instanz und lokales Testsecret; niemals Production-Key. Integrationstests erzeugen und entfernen ausschließlich synthetische, isolierte Einzelobjekte.

## 17. Secret Management

- Nur Vercel Environment Variables, als Sensitive; nur Production, wenn Preview nicht vollständig getrennt ist.
- Niemals committen, loggen, serialisieren, screenshotten oder über Chat/PR teilen.
- Minimaler Personenkreis und dokumentierte Zuständigkeit; Zugriffsaudit vor Freigabe.
- Rotation nach jedem Offenlegungsverdacht sowie dokumentierter regulärer Rotationsprozess.
- Kein `NEXT_PUBLIC_`, kein Browserimport, kein Anon-Key-Fallback. Fehlende Konfiguration stoppt kontrolliert vor Claim.
- Das vorliegende Paket setzt oder liest kein Secret und führt keine Service Role ein.

## 18. Verbindlicher Testplan für die spätere Umsetzung

### Migration/DB

- Purgefelder/-status, State- und Zeitconstraints, Attempt/Claimversion, Unique-Medienbindung, `updated_at`-Trigger;
- RLS aktiv, keine direkten Clienttabellenrechte, minimale Grants, feste `search_path`- und SECURITY-DEFINER-Grenzen;
- Claim-/Abschluss-RPC, Adminprüfung, falsche IDs, Projektbindung, `soft_deleted`/`completed_at`, `pending|failed`, expliziter `ready`-Ausschluss, Parallelität und idempotente Endzustände.

### Service

- Admin; Reviewer; nicht authentifiziert; fehlendes/invalides Profil; falsche IDs; Status-/Projektkonflikte; bereits purged;
- Objekt fehlt; transienter/permanenter Storagefehler; fehlendes/ungültiges Secret; Abschlussfehler; Timeoutmodell; Retry nach bereits erfolgreichem Delete; keine Rohfehlerausgabe.

### Architektur/Security

- `server-only`-Marker und Importgraph; kein Clientimport; kein `NEXT_PUBLIC`-Service-Role-Key; kein Secret/Keyname oder Wert im Clientbundle/Fehler;
- kein Storagepfad/Bucket aus Clientdaten; fester Bucket und Einzelelementliste; keine authenticated Storage-DELETE-Policy und kein DELETE-Grant;
- keine direkte `storage.objects`-Mutation, Public/Signed Download URL, freie URL, Bulk, Prefixdelete, Scheduler/Cron oder generische Adminoperation.

### Integration

- lokaler/isolierter Preview-Bucket; erfolgreicher Einzelpurge; bereits fehlendes Objekt; Retry nach Delete-/Abschluss-Teilfehler; paralleler Aufruf; abschließender DB-Zustand und Audit.

### Production Gate

- Migration angewendet; Environment Variable vorhanden; Vercel Deployment erfolgreich; genau ein kontrollierter Kandidat;
- vorher DB `soft_deleted`, Objekt vorhanden, keine `ready`-Zeile; UI-Bestätigung;
- danach Objekt fehlt, Cleanup-Item `purged`, Audit vorhanden und kein `ready`-Medium betroffen.

Diese Tests sind geplant, nicht in diesem Audit implementiert oder ausgeführt.

## 19. Scheduler-, Batch- und Worker-Grenze

Das erste Purgepaket enthält **keinen Scheduler, Cron oder Batch**, sondern ausschließlich manuellen Einzelpurge. Jede Automatisierung benötigt ein eigenes Architektur-/Security-/Production-Audit und eine bestätigte Retentionfrist. Dieses Folgeaudit muss Batchgröße (konservativer Startwert höchstens 25 erst nach Lasttest), keyset Paging, Claim-Leases/Expiry, Locks/CAS, begrenzte Parallelität, Provider-Rate-Limits, exponentiellen Backoff mit Jitter, Retrybudget/Dead Letter Review, Monitoring, Alerting, Kill Switch und Kostenkontrolle festlegen. Ein Worker erhält ein eigenes minimales Secret und keine Browserkopplung.

## 20. Reine Storage-Orphans

Objekte ohne `project_media`-Zeile bleiben vollständig ausgeschlossen. Sie benötigen ein eigenes späteres Audit, mindestens sieben Tage Alter, einen separaten privilegierten Reconciler mit Paging und Review sowie einen eigenen Claim-/Auditnachweis. Kein Scan oder Delete in einem normalen Seitenrequest, keine Vermischung mit DB-gebundenem Purge und niemals Löschung allein wegen Alter oder passend wirkendem Pfadmuster/Präfix.

## 21. Kleinste sichere Folgeimplementierung

Nach ausdrücklicher Owner-Entscheidung wird empfohlen:

### AP-12-02-11-02-01 — Single Controlled Storage Purge

- genau ein bereits fachlich soft-gelöschter Kandidat, Admin-only;
- atomarer Purge-Claim auf erweitertem Cleanup-Item;
- server-only Service-Role-Adapter, fester Bucket, DB-gebundener Einzelpfad;
- physische Entfernung ausschließlich über offizielle Supabase Storage API;
- atomarer, idempotenter DB-Abschluss und vollständiges sanitisiertes Audit Logging;
- kein Bulk, Scheduler, Cron, Worker, Derivate-/Prefixdelete oder reine Storage-Orphans;
- keine allgemeine Storage-`DELETE`-Policy für `authenticated`.

Vor der Implementierung muss der Owner ausdrücklich Service-Role-Einsatz, Datenmodell/Claimtoken, Projektlöschungs-Recovery, Missing-Object-Normalisierung, Secret-/Previewgrenzen, Audit-Retention und Production-Smoke-/Kill-Switch-Verfahren entscheiden. Deshalb bleibt der Status **READY FOR OWNER DECISION**.

## 22. Scope-Bestätigung

Dieses Paket enthält **ausschließlich Analyse und Dokumentation**. Es enthält ausdrücklich:

- keine Implementierung, keine UI-Änderung, keine Server Action und keinen Service;
- keine Tests oder Teständerungen;
- keine Migration, keine SQL-Änderung, keine RPC und keine RLS-Änderung;
- keine Storage-Policy, Grants oder Bucketänderung;
- keine Service Role, Environment Variable oder Secrets;
- keine Storage-Löschung, keinen Purge, Cleanup oder Soft Delete;
- keinen Scheduler, Cron, Batch oder Reconciliation-Ausführung;
- keine Signed URLs und keine Public URLs;
- keine KI und keine WhatsApp-Integration;
- keine `package.json`-Änderung.

Damit wird ausdrücklich bestätigt: **nur Audit; keine Implementierung; keine Service Role; keine Secrets; keine Migration; kein SQL; keine RPC; keine Storage-Policy; keine Storage-Löschung; kein Purge; kein Scheduler.**

