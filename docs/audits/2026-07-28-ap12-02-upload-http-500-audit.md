# Project media upload HTTP 500 audit

| Feld | Wert |
|---|---|
| Audit-ID | `KG-AUDIT-2026-07-28-AP12-02-UPLOAD-500-V1` |
| Datum | 2026-07-28 |
| Baseline | Deployment nach AP-12-02-HF-01; Reservierung im Browser erfolgreich, tatsächlicher Uploadrequest mit HTTP 500 |
| Status | **NICHT Production Ready** |

## Scope und Methode

Dieses reine Fehleraudit analysiert den Stand der Upload-Clientkomponente, der drei Server Actions, des Storage-Uploadservices, `next.config.ts`, der in `package.json` deklarierten Next.js-/Supabase-Versionen, der installierten Next.js-Version 15.5.22, `middleware.ts`, der vorhandenen Vercel-relevanten Konfiguration sowie der AP-12-Audits und des Production-Runbooks. Im Repository existiert keine `vercel.json` oder sonstige projektspezifische Vercel-Limitkonfiguration. `next.config.ts` exportiert ein leeres `NextConfig`; insbesondere ist kein `serverActions.bodySizeLimit` gesetzt.

Zur Anbieterbaseline wurden die offiziellen Dokumentationsziele für [Next.js `serverActions.bodySizeLimit`](https://nextjs.org/docs/app/api-reference/config/next-config-js/serverActions), [Vercel Functions limits](https://vercel.com/docs/functions/limitations), [Supabase Standard Uploads](https://supabase.com/docs/guides/storage/uploads/standard-uploads) und [Supabase Signed Upload URLs](https://supabase.com/docs/reference/javascript/storage-from-createsigneduploadurl) herangezogen. Der Dokumentationsabruf war in der Auditumgebung durch den Netzwerk-Proxy gesperrt; die konkreten Grenzwerte sind deshalb vor einem Architektur-Freeze nochmals live in den offiziellen Seiten und gegen den tatsächlich verwendeten Vercel-Plan zu bestätigen. Die nachfolgende Bewertung verwendet die dokumentierten Baselines: Next.js Server Actions standardmäßig 1 MB Request Body und Vercel Functions 4,5 MB Request/Response Body. Dezimale Produktbytes und Plattformangaben dürfen nicht ohne Grenztest gleichgesetzt werden.

Keine Tests, Builds, Live-Requests oder Production-Logs wurden ausgeführt beziehungsweise verändert. Die Diagnose beruht auf statischer Ablauf- und Konfigurationsanalyse sowie dem gemeldeten Network-Symptom.

## Symptom und rekonstruierter Ablauf

1. Die Clientkomponente validiert lokal genau eine Datei. Sie erlaubt JPEG/PNG/WebP bis 15.000.000 Bytes und PDF bis 25.000.000 Bytes.
2. Sie ruft zuerst `reserveProjectMediaUploadAction` nur mit Metadaten auf. Der Server erzeugt `mediaId`, Storagepfad und `pending`-Zeile. Da der Browser danach den Uploadrequest sendet, muss die Reservierungs-Action erfolgreich geantwortet haben.
3. Danach erzeugt der Browser ein neues `FormData` mit exakt `media_id`, `project_id` und dem binären `file` und übergibt es an `uploadReservedProjectMediaAction`. **Dieser Server-Action-Request überträgt die vollständige Datei vom Browser an die Next.js-/Vercel-Function.** Seine Wire-Größe ist mindestens die Dateigröße plus Multipart-/React-Server-Action-Metadaten, Feldnamen, IDs, Boundary und Header; sie ist nicht exakt allein aus `File.size` bestimmbar und stets größer als die Nutzdatei.
4. Erst nachdem Next.js/Vercel den Request angenommen und Server-Action-FormData deserialisiert haben, kann die Action `createClient()` aufrufen, `Object.fromEntries(formData.entries())` bilden und den Uploadservice ausführen.
5. Der Service prüft Session, Profil/Adminrolle, aktives Projekt, Reservierung, Actor, `pending`, Bucket, Dateigröße, Browser-MIME und die ersten zwölf Magic Bytes. Erst danach lädt der serverseitige Supabase-Client dieselbe Datei mit `upsert: false` in den privaten Bucket.
6. Nur bei erfolgreichem Upload ruft der Client `finalizeProjectMediaUploadAction` mit IDs, aber ohne Datei, auf. Beim beobachteten Fehler wird dieser Schritt nicht erreicht.

Der UI-`catch` setzt exakt die beobachtete generische Meldung, wenn der Server-Action-Promise verworfen wird, etwa weil Transport, Body-Parsing oder Action-Runtime vor einer strukturierten Serviceantwort scheitern. Ein normales `{ success: false }` des Services würde dagegen im unmittelbar davorliegenden Zweig als kontrollierte Antwort verarbeitet. Der sichtbare HTTP 500 statt eines strukturierten Servicefehlers ist daher ein starkes Indiz für einen Fehler vor dem Service oder einen ungefangenen Runtimefehler außerhalb seines neutralen Mappings.

## Wahrscheinlichste Ursache

Für jede Datei oberhalb der effektiven 1-MB-Grenze ist die wahrscheinlichste unmittelbare Ursache das nicht konfigurierte Next.js-Server-Action-Body-Limit. Das leere `next.config.ts` lässt den 1-MB-Default aktiv. Der vollständige Datei-Body überschreitet diese Grenze einschließlich Protokolloverhead, bevor der Service seine eigene 15-/25-MB-Prüfung ausführen kann. Je nach Next.js-/Hosting-Fehlerabbildung kann der Client dabei einen verworfenen Server-Action-Aufruf und Network HTTP 500 sehen, statt den neutralen Domainfehler `file_too_large`.

Das Symptom allein beweist die Schicht noch nicht: Dateigröße, Responsebody/-header und Vercel Function-Logs fehlen. Bei Dateien oberhalb der Vercel-Grenze ist zusätzlich beziehungsweise nach einer Next.js-Erhöhung das unveränderliche Function-Request-Limit ein harter Kandidat. Ein sehr kleiner Upload unter 1 MB würde hingegen die Body-Limit-Hypothese widerlegen und insbesondere den nachfolgend beschriebenen `pending`-Reservierungsread oder einen Runtimefehler priorisieren.

Zusätzlich besteht nach Erreichen des Services ein separater logischer Blocker: `getReservation` liest die `pending`-Zeile über den normalen `project_media`-SELECT-Pfad, während die AP-12-Policies normale SELECTs bewusst auf `ready` beschränken. Das würde kontrolliert als `reservation_missing` zurückkehren, nicht typischerweise als unkontrollierter HTTP 500. Dieser Befund erklärt daher nicht den gemeldeten Transportstatus, muss aber vor einem erfolgreichen Ende-zu-Ende-Upload in einem eigenen Arbeitspaket sicher gelöst werden; eine Policy-Aufweichung ist keine Audit-Empfehlung.

## Fehlerhypothesenmatrix

| Hypothese | Erwartetes Browserverhalten | Erwartete Network-Antwort | Erwarteter Servicefehler | Wahrscheinlichkeit beim aktuellen Symptom | Kleinster sicherer Bestätigungstest |
|---|---|---|---|---|---|
| Server-Action-Body-Limit (Default 1 MB) | Reservierung gelingt; Upload springt in UI-`catch`; keine Finalisierung | Fehler vor/bei Action-Deserialisierung; je nach Deployment 500 beziehungsweise Payload-/Body-Fehler statt strukturierter Action-Antwort | keiner, Service wird nicht erreicht | **sehr hoch**, sofern Testdatei über effektiv 1 MB | Datensparsam dieselbe gültige PNG-Struktur einmal deutlich unter 1 MB und einmal knapp über 1 MB hochladen; Status, Responsegröße und neutrale Request-ID notieren, keine Namen/Pfade loggen |
| Vercel-Function-Request-Limit (dokumentierte Baseline 4,5 MB) | Reservierung gelingt; großer Upload bricht vor Action/Service ab | typischerweise Plattform-Payload-Fehler (häufig 413/`FUNCTION_PAYLOAD_TOO_LARGE`), durch Server-Action-Protokoll eventuell nur generischer Fehler sichtbar | keiner | **hoch** für Dateien über 4,5 MB; HTTP 500 allein weniger spezifisch | Nach live verifiziertem Planlimit gestufte Testdateien deutlich unter und über 4,5 MB verwenden und Vercel Request-/Invocation-Metadaten ohne PII vergleichen |
| Runtime-/Serialisierungsfehler | Upload-Promise verworfen; generische UI-Meldung | 500; Function Invocation kann begonnen haben | keiner, falls vor Service; sonst ungefangene Exception | **mittel**, besonders bei Datei unter 1 MB | gültige sehr kleine PNG-Datei senden und ausschließlich korrelierte Vercel Runtime-Fehlerklasse/Stackposition prüfen; keine Datei-/Pfaddaten protokollieren |
| Supabase-Storage-Policy | Action und Service laufen bis `upload`; UI erhält kontrollierte Meldung | erfolgreiche Server-Action-HTTP-Antwort mit `{ success:false, code:"storage_upload_failed" }` | `storage_upload_failed` (oder `storage_conflict` bei 409) | **niedrig** für unkontrollierten 500 | kleine gültige Datei nutzen und vorhandene strukturierte Action-Antwort prüfen; Supabase Policy-Ablehnung anhand neutralem Status korrelieren |
| Storage-SDK-Fehler | wie Policyfehler, sofern SDK einen Fehlerwert liefert; 500 nur bei unerwartetem Throw | normalerweise 200-artige Action-Antwort mit strukturiertem Fehler; bei Throw 500 | `storage_upload_failed`, sofern `result.error` | **niedrig bis mittel** | kleine gültige Datei; Invocation prüfen, ob `upload()` einen Ergebnisfehler liefert oder wirft, ohne Payload/Dateiname/Pfad zu loggen |
| MIME-/Magic-Byte-Ablehnung | kontrollierte Fehlermeldung nach Serviceausführung | strukturierte Server-Action-Antwort, kein unkontrollierter 500 | `browser_mime_mismatch` oder `file_signature_mismatch` | **niedrig** | kleine Datei mit absichtlich abweichendem MIME beziehungsweise Header schicken und auf den erwarteten neutralen Code prüfen |
| Reservierungszugriff | Reservierung entsteht; Uploadservice findet `pending` über ready-only SELECT nicht | strukturierte Server-Action-Antwort, sofern Transport klein genug | `reservation_missing` | **hoch als nachgelagerter Funktionsfehler**, aber **niedrig als Erklärung für HTTP 500** | gültige Datei deutlich unter 1 MB senden und Action-Antwort auf `reservation_missing` prüfen; Policies unverändert lassen |
| Session-/Authproblem | Reservierung wäre bei derselben Session gewöhnlich bereits gescheitert; Sessionverlust zwischen Requests möglich | strukturierte Server-Action-Antwort | `not_authenticated`, `profile_unavailable` oder `not_authorized` | **niedrig** | kleine Datei in derselben Session senden, Responsecode prüfen und nur User-ID-freie Auth-Zustandsklasse korrelieren |

## Plattformlimitvergleich

| Grenze | Repository-/Plattformstand | Verhältnis zum Wire-Request | Eignung für Produktlimit |
|---|---|---|---|
| Next.js Server Action | kein `serverActions.bodySizeLimit`; Default 1 MB | Datei plus FormData-/Action-Overhead muss darunter bleiben | weder 15-MB-Bild noch 25-MB-PDF kompatibel |
| Vercel Function | keine Repo-Konfiguration hebt die dokumentierte 4,5-MB-Requestgrenze auf | gesamte eingehende Server-Action-Nutzlast zählt; sichere Dateiobergrenze muss merklich darunter liegen | weder 15 MB noch 25 MB kompatibel |
| Produkt: Bild | exakt 15.000.000 Bytes | Wire-Request ist größer als 15.000.000 Bytes | nicht über den aktuellen Function-Requestpfad erreichbar |
| Produkt: PDF | exakt 25.000.000 Bytes | Wire-Request ist größer als 25.000.000 Bytes | nicht über den aktuellen Function-Requestpfad erreichbar |
| Supabase Bucket | 25.000.000 Bytes laut AP-12-Baseline | gilt für Storageobjekt, nicht für Next.js-Transportoverhead | Storageziel passt nominell; exakte Grenze ist separat live zu validieren |

Eine bloße Erhöhung von `serverActions.bodySizeLimit` kann nur den Next.js-Default verschieben. Sie hebt das Vercel-Function-Limit nicht auf und kann die eingefrorenen 15-/25-MB-Grenzen daher in Production nicht vollständig ermöglichen. Ein Server Route Handler auf derselben Vercel-Function umgeht die Function-Requestgrenze ebenfalls nicht. Außerdem erhöhen großzügige Bodylimits Speicher-, Parsing-, Timeout- und Missbrauchsrisiken.

## Pending-Orphan-Risiko

Der Uploadrequest wird ausschließlich nach erfolgreicher Reservierungsantwort erstellt. Beim beobachteten HTTP 500 ist deshalb bereits eine `project_media`-Zeile im Status `pending` möglich und anhand des beschriebenen Ablaufs sogar zu erwarten. Scheitert der Body vor Action-/Serviceausführung, erfolgt weder Storage-Upload noch Finalisierung. Jeder erneute Formularversuch erzeugt eine neue serverseitige `mediaId` und damit eine weitere `pending`-Reservierung. Auch ein erfolgreicher Storage-Upload mit anschließendem Abbruch könnte ein Objekt plus `pending`-Zeile hinterlassen.

Es gibt weiterhin weder automatisches Cleanup noch Reconciliation oder automatischen Retry. Dieses Audit löscht nichts. Bestehende `pending`-Zeilen und mögliche Objekte müssen kontrolliert und datensparsam in Production inventarisiert werden.

## Variante A – begrenzter Übergangsfix über Server Actions

Variante A erhöht `serverActions.bodySizeLimit` nur auf eine bewusst unterhalb des **live verifizierten** Vercel-Requestlimits liegende Obergrenze und synchronisiert UI-, Schema-/Service- und Produktkommunikation auf eine kleinere tatsächlich transportierbare Dateigrenze. Wegen Multipart-/Server-Action-Overhead darf die Dateigrenze nicht exakt 4,5 MB betragen; ohne gemessenen Overhead ist keine seriöse Maximalzahl festzulegen. Als konservativer Ausgangspunkt für ein separates Experiment käme höchstens etwa 4.000.000 Datei-Bytes infrage, erst nach Grenz-, Speicher-, Timeout- und Missbrauchstests und Planverifikation.

Das widerspricht den eingefrorenen 15-/25-MB-Produktlimits und wäre daher nur eine ausdrücklich freizugebende Übergangslösung mit reduzierter Funktionalität. Sie benötigt konsistente Client- und Servergrenzen, deutsche UX-Kommunikation, exakte Boundarytests, Production-Smoke-Tests sowie Monitoring ohne PII. Nur `next.config.ts` auf 25 MB zu setzen wäre weder sicher noch auf Vercel funktionsfähig. Diese Variante wird in diesem Audit nicht implementiert.

## Variante B – direkter autorisierter Browser-zu-Supabase-Storage-Upload

Für unveränderte 15-/25-MB-Produktlimits muss der Binärstrom die Vercel Function als eingehenden Request umgehen. Technisch passend ist ein direkter Upload des Browsers in den privaten Supabase Storage, während DB-first erhalten bleibt:

1. Die bestehende serverseitige Reservierung authentifiziert Actor/Projekt, erzeugt unveränderbare UUID und kanonischen Pfad und persistiert `pending`.
2. Der Browser erhält keine freie Pfadwahl. Er lädt ausschließlich an den reservierten Bucket/Pfad, autorisiert entweder über die bestehende authentifizierte Supabase-Session plus exakt reservierungsgebundene Storage-INSERT-Policy oder über eine kurzlebige, einmalig/eng reservierungsgebundene Uploadfreigabe. Ein `service_role` gehört niemals in diesen Pfad.
3. Das Objekt bleibt privat und als `pending` normal unsichtbar. Anschließend prüft ein serverseitiger Kontrollschritt Actor, Projekt, Reservierung, Objektvorhandensein, tatsächliche Größe, MIME und gespeicherte Bytes und finalisiert ausschließlich das geprüfte Objekt auf `ready`.
4. Fehlgeschlagene oder abgebrochene Uploads benötigen idempotente Wiederaufnahmeentscheidung, Cleanup/Reconciliation und Schutz gegen Überschreiben, Replay, Pfadtausch und parallele Finalisierung.

Diese Variante ist kein kleiner Transporttausch. Die aktuelle Sicherheitsentscheidung „dieselben Bytes vor dem Speichern per Server prüfen“ würde verändert: Ein Direktupload speichert zunächst unvertrauenswürdige Bytes. Daher sind ein Quarantäne-/`pending`-Modell, serverseitige Prüfung **der tatsächlich gespeicherten Bytes**, niemals Browser-MIME als Wahrheit, deny-by-default-Lesbarkeit, objektgebundene Autorisierung, Ablauf/Replay-Schutz und kontrolliertes Cleanup zu frieren. Zu prüfen sind außerdem CORS, CSRF-/Sessionmodell, Upload-Token-Leakage, Supabase Standard-vs.-resumable Upload für Größen/Netzqualität, Overwrite-Konflikte, Größenlimits, Rate Limits und mobile Abbrüche.

Die vorhandene Storage-INSERT-Policy ist laut AP-12 bereits an authentifizierten Admin, aktive `pending`-Reservierung, Actor und exakten Bucket/Pfad gekoppelt; das ist eine wertvolle Basis, aber kein Ersatz für ein neues End-to-End-Security-Review. Falls Signed Upload URLs gewählt werden, sind sie kurzlebige Bearer-Credentials, dürfen nicht persistiert oder geloggt werden und benötigen einen ausdrücklich gefrorenen Scope. Policies, Grants oder Migrationen werden durch dieses Audit weder geändert noch vorweggenommen.

## Klare Empfehlung und kleinstes nächstes Arbeitspaket

**Empfehlung: Variante B ist die technisch korrekte Zielarchitektur für die unveränderten 15.000.000-/25.000.000-Byte-Produktlimits.** Variante A kann diese Limits auf Vercel nicht erfüllen und ist höchstens nach fachlich freigegebener temporärer Limitreduktion vertretbar. Vor Implementierung von Variante B ist zwingend ein eigener Architektur- und Security-Freeze erforderlich, weil Transportautorisierung, Prüfung gespeicherter Bytes, Quarantäne, Cleanup und bestehende AP-12-Entscheidungen zusammen geändert beziehungsweise präzisiert werden müssen.

Das kleinste nächste Arbeitspaket ist **`AP-12-02-HF-02 – Upload Transport Architecture & Security Freeze`**, ausschließlich Analyse/Decision Record, ohne Code. Es soll:

- die aktuellen offiziellen Next.js-, Vercel-Plan- und Supabase-Limits mit Abrufdatum belegen;
- mit einer kleinen Datei unter 1 MB die Body-Limit-Schicht und den separaten ready-only-Reservierungsread datensparsam bestätigen;
- authentifizierte RLS-gebundene Standard-/resumable Uploads gegen reservierungsgebundene Signed Upload URLs entscheiden;
- den exakten Autorisierungs-, Token-, Bucket-/Pfad-, Quarantäne-, Byteprüfungs-, Finalisierungs-, Retry- und Cleanupvertrag frieren;
- notwendige Policy-/Migration-/Service-/UI-/Testpakete trennen und Rollout/Rollback definieren;
- die kontrollierte Production-Inventur möglicher `pending`-Orphans aufnehmen.

Erst danach sollte ein kleines Implementierungspaket den gewählten Transport umsetzen. Der separate `pending`-Read-Befund ist dabei explizit zu lösen, ohne normale SELECT-Policies aufzuweichen.

## Production-Readiness-Auswirkung

Der Uploadpfad ist für die eingefrorenen Produktgrößen nicht mit den aktuellen Next.js-/Vercel-Transportgrenzen kompatibel. Reservierungen können ohne Objekt entstehen, Wiederholungen können Orphans vervielfachen, und selbst nach Behebung des Transportlimits blockiert voraussichtlich der normale ready-only SELECT die `pending`-Reservierung im Uploadservice. Bis Ursache und Architektur bestätigt, Orphans kontrolliert geprüft, der gewählte Pfad implementiert und mit echten Browser-/Production-Grenztests validiert sind, gilt:

**Auditstatus: NICHT Production Ready.**

## Ausdrückliche Scope-Bestätigung

Dieses Arbeitspaket enthält ausschließlich diese neue Auditdatei. Es implementiert nichts und ändert weder `next.config.ts`, UI, Server Actions, Services, Schemas, Produktlimits, Migrationen, SQL, RLS, Storage-Policies, Bucket, `package.json` noch Tests. Es erhöht kein `bodySizeLimit`, führt keinen direkten Clientupload und keine Signed Upload URL ein, verwendet kein `service_role` und ergänzt keine Logs mit Dateinamen, Storagepfaden oder Secrets. Es wurden keine Tests ausgeführt.

## AP-12-02-HF-02 Direct Upload Transport Result

HF-02 entfernt den Binärtransport durch die Next.js Server Action und damit durch die Vercel Function. Nach der serverseitigen DB-first-Reservierung prüft eine enge Ticket-Action Authentifizierung, aktives Adminprofil, aktives Projekt sowie die eigene, aktive `pending`-Reservierung. Bucket und kanonischer Pfad stammen ausschließlich aus dieser Reservierung. Das kurzlebige Signed-Upload-Ticket wird weder persistiert noch geloggt; der Browser verwendet es mit `uploadToSignedUrl` für den direkten Upload in den privaten Bucket und ohne Upsert.

Vor `pending → ready` liest ein enges, authentifiziertes SQL-Helper-RPC ausschließlich Metadaten des exakt reservierten Storage-Objekts. Finalisiert wird nur bei identischem Bucket, Pfad, Byteumfang und Content-Type sowie weiterhin aktivem Projekt, eigener aktiver Reservierung und `pending`; das Statusupdate bleibt Compare-and-set. Die additive Migration `202607280001_project_media_direct_upload_helpers.sql` ist erforderlich, weil normale Tabellen- und Storage-SELECT-Policies `pending` absichtlich verbergen. Sie öffnet keine SELECT-, INSERT-, UPDATE- oder DELETE-Policy und gewährt weder `anon` noch `PUBLIC` Zugriff.

Der tote `uploadReservedProjectMediaAction`, sein Binär-Uploadservice und die ausschließlich darauf bezogenen Tests wurden entfernt. Frühere fehlgeschlagene Versuche können weiterhin `pending`-Orphans hinterlassen; das Runbook enthält nur eine read-only Diagnose. Es gibt keine automatische Bereinigung.

Verbleibende Security Gates sind eine Prüfung der tatsächlich gespeicherten Magic Bytes ohne vollständigen Download durch Vercel, Quarantäne-/Malwareprüfung, kontrollierte Reconciliation und Cleanup/Purge. Die frühere Vor-Speicher-Magic-Byte-Prüfung ist nach Entfernung des Vercel-Binärpfads ausdrücklich nicht mehr aktiv. Build, vollständige Vitest-Suite, Typecheck, Lint und Diff-Prüfung wurden lokal ausgeführt; ein erneuter Production-Smoke-Test bleibt erforderlich.

**Auditstatus: NICHT Production Ready.**

## AP-12-02-HF-03 Atomic Finalization RPC Result

Der Production-Smoke-Test belegt, dass der direkte Signed Upload bereits vollständig erfolgreich war: Der Browser-PUT an Supabase Storage endete mit **HTTP 200**, lieferte den an die Reservierung gebundenen Pfad `projects/{project_id}/originals/{media_id}/{uuid}.png` zurück und verwendete `X-Upsert: false`. Erst der anschließende Statuswechsel endete weiterhin als `finalization_conflict`. Ursache war der direkte PostgREST-Update-/Return-Pfad des Adapters, der nach dem Update eine sichtbare `ready`-Zeile erwartete.

HF-03 ersetzt ausschließlich diesen Pfad durch `public.finalize_project_media_upload(uuid, uuid) returns boolean`. Die `SECURITY DEFINER`-Funktion verwendet den festen `search_path` `public, storage, pg_temp`, verlangt `auth.uid()` und die zentrale Adminrolle und ermittelt sämtliche übrigen Werte serverseitig. In derselben atomaren Compare-and-set-Anweisung bindet sie Medien- und Projekt-ID, `uploaded_by`, aktive Projekt- und Medienzeilen, Status `pending`, Bucket `project-media`, exakten Objektpfad sowie die in `storage.objects.metadata` gespeicherten Werte `size` und `mimetype`. Sie setzt ausschließlich `upload_status = 'ready'`; ihr Boolean wird aus der tatsächlich aktualisierten Zeilenzahl abgeleitet.

Die Ausführung wird zunächst für `PUBLIC`, `anon` und `authenticated` entzogen und danach ausschließlich `authenticated` gewährt; die Funktion selbst weist Nicht-Admins ab. Es wurden weder Tabellen-Grants noch RLS- oder Storage-Policies erweitert. Der Adapter übergibt nur Medien- und Projekt-ID an die RPC, mappt ausschließlich `data === true` ohne RPC-Fehler auf das bestehende schmale Erfolgsresultat und behandelt `false` oder einen RPC-Fehler weiterhin als `finalization_conflict`. Revalidierung erfolgt nur nach diesem Erfolg.

Das physische Objekt des fehlgeschlagenen Production-Versuchs existiert bereits; der zugehörige `project_media`-Datensatz bleibt wahrscheinlich `pending`. HF-03 implementiert bewusst weder automatische Bereinigung noch Wiederverwendung dieses alten Versuchs. Der erneute Browser-Smoke-Test muss eine neue Reservierung verwenden.

Die neue Migration und der Adapter sind durch statische Migrations- und Service-/Adaptertests für Signatur, Rückgabe, Autorisierung, Objektbindung, Metadatenvergleich, Compare-and-set, Grants, ausgeschlossenen destruktiven beziehungsweise offenen SQL-Scope, RPC-Ergebnismapping und erfolgsgebundene Revalidierung abgesichert. Build, vollständige Testsuite, Typecheck, Lint und Diff-Prüfung wurden lokal erfolgreich ausgeführt. Bis der erneute Browser-Smoke-Test erfolgreich ist, bleibt der Status:

**Auditstatus: NICHT Production Ready.**
