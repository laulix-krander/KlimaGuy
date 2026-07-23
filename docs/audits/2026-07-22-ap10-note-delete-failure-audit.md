# KG-AUDIT-2026-07-22-AP10-NOTE-DELETE-FAILURE-V1 – AP-10 Projektnotiz-Soft-Delete-Fehler

## 1. Audit-ID

- **Audit-ID:** KG-AUDIT-2026-07-22-AP10-NOTE-DELETE-FAILURE-V1
- **Referenz-Audit:** KG-AUDIT-2026-07-21-ADMIN-WORKFLOWS-V1
- **Status:** IMPLEMENTED – VALIDIERUNG IN PREVIEW/PRODUCTION AUSSTEHEND
- **Auftrag:** ausschließlich Diagnose; keine Reparatur, keine Migration, keine RLS-/Trigger-/Action-/UI-/Teständerung.

## 2. Datum

- **Datum:** 2026-07-22
- **Lokale Zeitzone der Ausführung:** Etc/UTC

## 3. Betroffener Produktionsstand

- **Repository:** laulix-krander/KlimaGuy
- **Basisbranch laut Auftrag:** main
- **Lokaler Arbeitsbranch für dieses Audit:** `codex/audit-ap10-note-delete-failure`
- **Baseline-Commit vor Audit:** `314356c Merge pull request #16 from laulix-krander/codex/implementiere-ap-08-projektnotizen-anlegen-budy2d`
- **Hinweis:** Ein fehlendes lokales Git-Remote `origin` wurde gemäß Auftrag nicht als Fehler bewertet.

## 4. Beobachtetes Verhalten

In Production wurde gemeldet:

1. Benutzer klickt bei einer Projektnotiz auf „Löschen“.
2. Die Bestätigung erscheint korrekt.
3. Benutzer klickt auf „Notiz löschen“.
4. Danach erscheint: „Die Notiz konnte nicht gelöscht werden. Bitte versuchen Sie es erneut.“
5. Die Notiz bleibt nach Reload sichtbar.
6. In Supabase steht `project_notes.deleted_at` weiterhin auf `NULL`.

## 5. Bestätigte Fakten

- Die Fehlermeldung entspricht exakt dem neutralen Fehlerpfad des Delete-Service nach der Supabase-Update-Abfrage.
- Der Client öffnet zuerst nur den Bestätigungszustand und submitet erst beim zweiten Klick.
- `note_id` und `project_id` werden in der Delete-Bestätigung als Hidden Inputs übertragen.
- Die Delete-Server-Action ruft den Delete-Service und danach nur bei Erfolg `revalidatePath()` und `redirect()` auf.
- Der Delete-Service führt vor dem Update Authentifizierung, Profilprüfung, Rollenvalidierung, aktive Projektprüfung, aktive Notizprüfung und Ownership-/Adminprüfung aus.
- Der konkrete Soft-Delete-Patch enthält ausschließlich `deleted_at` mit serverseitigem ISO-Zeitstempel.
- Die AP-09-Triggerfunktion erlaubt den Übergang `OLD.deleted_at IS NULL` → `NEW.deleted_at IS NOT NULL`.
- Die AP-09-Update-Policies enthalten in `WITH CHECK` keinen expliziten `deleted_at IS NULL`-Zwang; sie blockieren den Soft-Delete-Übergang nach Repository-Stand daher nicht über `WITH CHECK`.
- Die AP-09-SELECT-Policy macht soft gelöschte Notizen nach dem Update unsichtbar, weil sie `deleted_at IS NULL` verlangt.
- Der AP-10-Service verlangt jedoch direkt nach dem Update per `.select("id,project_id").single()` eine zurückgegebene Zeile. Diese Erwartung steht im Widerspruch zur SELECT-RLS für die neue, soft gelöschte Zeile.

## 6. Geprüfte Dateien

Vollständig geprüft wurden:

- `AGENTS.md`
- `docs/SECURITY.md`
- `docs/DATA_MODEL.md`
- `docs/audits/2026-07-21-admin-workflows-audit.md`
- `supabase/migrations/202607220001_project_notes_soft_delete_rls.sql`
- `app/(app)/projects/[id]/project-note-item.tsx`
- `app/(app)/projects/[id]/page.tsx`
- `lib/actions/projects.ts`
- `lib/actions/project-note-delete-service.ts`
- `lib/actions/project-note-update-service.ts`
- `lib/actions/project-note-create-service.ts`
- `lib/domain/schemas.ts`
- `lib/domain/permissions.ts`
- `test/project-note-update-delete.test.ts`
- `test/project-note-security.test.ts`

## 7. Vollständiger Ablauf vom Button bis Supabase

1. `ProjectDetailPage` lädt aktive Notizen mit `.from("project_notes")`, `.eq("project_id", project.id)`, `.is("deleted_at", null)` und sortiert nach `created_at DESC`.
2. Pro Notiz berechnet die Seite `canDeleteNote` aus validierter Rolle, `authData.user?.id` und `note.created_by`.
3. `ProjectNoteItem` rendert bei `canDelete=true` den Button „Löschen“ mit `type="button"` und `onClick={() => setConfirmingDelete(true)}`.
4. Der erste Klick setzt nur React-State und öffnet den Bestätigungsblock.
5. Der Bestätigungsblock ist ein eigenes `<form action={deleteAction}>` mit Hidden Inputs `note_id` und `project_id`.
6. Der Button „Notiz löschen“ liegt innerhalb dieses Forms und ist `type="submit"`.
7. `useActionState(softDeleteProjectNoteAction, initialDeleteState)` bindet den Submit an die Server Action `softDeleteProjectNoteAction`.
8. `softDeleteProjectNoteAction` erstellt den normalen Supabase-Server-Client, baut den Mutations-Adapter und ruft `softDeleteProjectNoteWithDataSource(..., formDataToDeleteProjectNoteInput(formData))` auf.
9. `formDataToDeleteProjectNoteInput()` liest ausschließlich `note_id` und `project_id`.
10. Der Service lädt `auth.getUser()`, danach `profiles.role` für `user.id`.
11. Der Service validiert `role`, `note_id` und `project_id` mit Zod.
12. Der Service lädt das aktive Projekt aus `projects` mit `select("id")`, `eq("id", project_id)`, `is("deleted_at", null)`, `single()`.
13. Der Service lädt die aktive Notiz aus `project_notes` mit `select("id,project_id,created_by")`, `eq("id", note_id)`, `eq("project_id", project_id)`, `is("deleted_at", null)`, `single()`.
14. Der Service prüft `canSoftDeleteAnyProjectNote(role)` oder `canSoftDeleteOwnProjectNote(role, user.id, note.created_by)`.
15. Der Service erzeugt `patch = { deleted_at: new Date().toISOString() }`.
16. Der Adapter führt aus: `supabase.from("project_notes").update(patch).eq("id", note_id).eq("project_id", project_id).is("deleted_at", null).select("id,project_id").single()`.
17. Bei `error` oder fehlender/inkonsistenter Rückgabe wird die neutrale Fehlermeldung „Die Notiz konnte nicht gelöscht werden. Bitte versuchen Sie es erneut.“ zurückgegeben.
18. Nur bei Erfolg ruft die Server Action `revalidatePath(`/projects/${project_id}`)` und `redirect(`/projects/${project_id}?note_deleted=1`)` auf.

## 8. Client-Diagnose

- Der erste Klick auf „Löschen“ löst bewusst keinen Submit aus, weil der Button `type="button"` hat und nur `setConfirmingDelete(true)` ausführt.
- Der zweite Klick auf „Notiz löschen“ ist ein echter Submit, weil der Button innerhalb des Delete-Forms liegt und `type="submit"` besitzt.
- Es gibt im Delete-Submit-Button kein `onClick`, kein `preventDefault()` und keinen Zustandswechsel, der den Submit verhindert.
- Das Delete-Form enthält die passenden Hidden Inputs `name="note_id"` und `name="project_id"`.
- Das Delete-Form nutzt `action={deleteAction}`; `deleteAction` stammt aus `useActionState(softDeleteProjectNoteAction, initialDeleteState)`.
- Es gibt keine verschachtelten Forms zwischen Anzeige- und Delete-Form: Das Update-Form wird nur im `editing`-Zweig gerendert; das Delete-Form wird nur außerhalb dieses Zweigs bei `confirmingDelete` gerendert.
- Der Pending-State ist an `deletePending` gebunden und deaktiviert Submit/Abbrechen während des laufenden Submits.
- Nach einem Serverfehler bleibt `confirmingDelete` absichtlich `true`, sodass die Fehlermeldung im Bestätigungsblock sichtbar bleibt.
- Ergebnis: Der Client-Flow ist technisch konsistent und ruft nicht versehentlich die falsche Action auf.

## 9. Server-Action-Diagnose

- Tatsächlich aufgerufene Action: `softDeleteProjectNoteAction`.
- Feldmapping: `formDataToDeleteProjectNoteInput()` liest exakt `note_id` und `project_id`; diese Namen stimmen mit UI und `deleteProjectNoteSchema` überein.
- Vor dem Service entsteht nur dann ein Fehler, wenn die Action selbst nicht erreicht würde. Dafür gibt es im Code keinen Hinweis.
- `redirect()` wird ausschließlich nach `result.success === true` ausgeführt.
- `revalidatePath()` wird vor `redirect()` ausgeführt und nur auf dem Erfolgspfad.
- Die gemeldete Fehlermeldung kann nur aus `softDeleteProjectNoteWithDataSource()` zurückkommen, nachdem entweder Supabase beim Update `error` liefert oder keine gültige Rückgabezeile vorliegt.

## 10. Auth-/Profil-Diagnose

- Der Service lädt den authentifizierten Benutzer über `auth.getUser()`.
- Danach wird `profiles.role` mit `eq("id", user.id).single()` geladen.
- `roleSchema` akzeptiert nur die in der Domain definierten Rollen `admin` und `reviewer`.
- Fehlende Authentifizierung würde „Sie müssen angemeldet sein.“ liefern.
- Fehlendes Profil oder ungültige Rolle würde „Ihr Benutzerprofil konnte nicht überprüft werden.“ liefern.
- Die beobachtete Meldung ist nicht der Auth-/Profilfehler, sondern der spätere neutrale Update-Fehler.
- Ein produktiver Auth-/Profilfehler ist für genau diese Meldung daher nicht die Hauptursache.

## 11. Berechtigungsdiagnose

- `canSoftDeleteAnyProjectNote(role)` gibt ausschließlich für `admin` `true` zurück.
- `canSoftDeleteOwnProjectNote(role, actorId, noteCreatedBy)` gibt ausschließlich für `reviewer` und exakt gleiche Strings `actorId === noteCreatedBy` `true` zurück.
- UI und Service verwenden dieselbe Parameterreihenfolge: Rolle, authentifizierte Benutzer-ID, `note.created_by`.
- Es gibt keinen UUID-Parser im Helper selbst; die Werte werden als Strings verglichen. Das ist passend, weil Supabase `auth.uid()` und `created_by` als UUID-Strings liefert.
- Ein Admin fällt nicht versehentlich in den Own-Note-Pfad, weil `canSoftDeleteAnyProjectNote("admin")` bereits `true` ist.
- Die UI-Berechtigung entspricht der Service-Berechtigung: Admin alle aktiven Notizen, Reviewer eigene aktive Notizen.
- Ein Ownership-Fehler würde „Sie sind nicht berechtigt, diese Notiz zu löschen.“ liefern und passt nicht zur beobachteten Meldung.

## 12. Projektabfrage-Diagnose

- Tabelle: `projects`.
- Select: `id`.
- Filter: `eq("id", project_id)` und `is("deleted_at", null)`.
- Rückgabe: `single()`.
- Fehler-/No-Row-Behandlung: Der Service wertet nur `data` aus; bei fehlendem Projekt kommt „Das Projekt wurde nicht gefunden oder ist nicht mehr verfügbar.“.
- Da die beobachtete Meldung erst beim Update-Pfad entsteht, ist die Projektabfrage für den gemeldeten Fehler offenbar erfolgreich durchlaufen worden.
- RLS-Lesbarkeit: Die initiale `projects read`-Policy erlaubt Admin/Reviewer projektseitig grundsätzlich SELECT; zusätzlich filtert die App aktive Projekte.

## 13. Notizabfrage-Diagnose

- Tabelle: `project_notes`.
- Select: `id,project_id,created_by`.
- Filter: `eq("id", note_id)`, `eq("project_id", project_id)`, `is("deleted_at", null)`.
- Rückgabe: `single()`.
- Fehler-/No-Row-Behandlung: Bei fehlender oder nicht projektzugehöriger Notiz kommt „Die Notiz wurde nicht gefunden oder ist nicht mehr verfügbar.“.
- Die Notiz-ID stammt in der UI aus `note.id`, das zuvor aus der Datenbank geladen wurde.
- `project_id` stammt in der UI aus `project.id`, das ebenfalls aus der Datenbank geladen wurde.
- `created_by` wird vor der Ownership-Prüfung serverseitig aus der aktiven Notiz geladen; der Client kann ihn nicht beeinflussen.
- Da die beobachtete Meldung erst beim Update-Pfad entsteht, ist die aktive Notiz für den Service offenbar sichtbar und die Vorabprüfung erfolgreich.

## 14. Update-Diagnose

Konkrete Supabase-Abfrage des Soft Delete:

```ts
const patch = { deleted_at: new Date().toISOString() };
supabase
  .from("project_notes")
  .update(patch)
  .eq("id", note_id)
  .eq("project_id", project_id)
  .is("deleted_at", null)
  .select("id,project_id")
  .single();
```

- **Payload:** ausschließlich `deleted_at`.
- **Zeitstempel:** serverseitiger ISO-String aus `new Date().toISOString()`.
- **Filter:** `id = note_id`, `project_id = project_id`, `deleted_at IS NULL`.
- **Returning:** `.select("id,project_id")` fordert eine Rückgabezeile an.
- **Cardinality:** `.single()` verlangt exakt eine Rückgabezeile.
- **Fehlerauswertung:** `error` führt zur neutralen Löschfehlermeldung.
- **Datenprüfung:** fehlende `deletedNote.id` oder abweichende `deletedNote.project_id` führen zur neutralen Löschfehlermeldung.
- **Count:** Es wird kein `count` verwendet.
- **Keine Hard Deletes:** Es wird kein `.delete()` verwendet.
- **Diagnose:** Die Update-Abfrage koppelt Persistenz und Rückgabe an eine Rückgabezeile, die nach erfolgreichem Soft Delete durch die SELECT-RLS nicht mehr sichtbar ist. Dadurch ist der Service mit der AP-09-SELECT-Policy inkompatibel.

## 15. RLS-Diagnose

### SELECT-Policy

`project notes read active` ist eine permissive SELECT-Policy für aktive Notizen:

- `auth.uid() is not null`
- `current_app_role() in ('admin', 'reviewer')`
- `deleted_at is null`
- aktives zugehöriges Projekt existiert (`projects.deleted_at is null`)

Auswirkung: Nach einem Soft Delete ist die neue Zeile wegen `deleted_at IS NOT NULL` nicht mehr über SELECT sichtbar.

### INSERT-Policy

`project notes insert active` erlaubt Inserts nur, wenn:

- Benutzer authentifiziert ist,
- Rolle `admin` oder `reviewer` ist,
- `created_by = auth.uid()` gilt,
- `deleted_at is null` gilt,
- das zugehörige Projekt aktiv ist.

### Admin-UPDATE-Policy

`project notes update active admin`:

- `USING`: authentifizierter Admin und alte/zu updatefähige Zeile ist aktiv (`deleted_at is null`).
- `WITH CHECK`: authentifizierter Admin und zugehöriges Projekt ist aktiv.
- Wichtig: `WITH CHECK` verlangt nicht `deleted_at is null`. Der Übergang auf einen Soft-Delete-Zeitstempel ist nach Repository-Policy für Admins erlaubt.

### Reviewer-UPDATE-Policy

`project notes update own active reviewer`:

- `USING`: authentifizierter Reviewer, `created_by = auth.uid()` und alte/zu updatefähige Zeile ist aktiv (`deleted_at is null`).
- `WITH CHECK`: authentifizierter Reviewer, `created_by = auth.uid()` und zugehöriges Projekt ist aktiv.
- Wichtig: `WITH CHECK` verlangt nicht `deleted_at is null`. Der Übergang auf einen Soft-Delete-Zeitstempel ist nach Repository-Policy für eigene Reviewer-Notizen erlaubt.

### Bewertung der AP-09-Policies

- Die Update-Policies blockieren `NULL → Zeitstempel` nicht durch `WITH CHECK`.
- Die SELECT-Policy blendet die Zeile nach `deleted_at`-Setzung korrekt aus.
- Die Kombination ist für ein normales UPDATE ohne Return-Representation geeignet, aber nicht für einen Service, der unmittelbar die aktualisierte Zeile per `.select(...).single()` zurückverlangt.
- Es wurden nur die Legacy-Policies `notes read`, `notes insert`, `notes update` gedroppt. Im Repository sind keine anderen alten `project_notes`-Policies definiert. Falls Production zusätzliche alte Policies enthält, ist das nur per Runtime-SQL feststellbar.

## 16. Trigger-Diagnose

Triggerfunktion: `prevent_project_note_protected_field_updates()`.

- Blockiert Änderungen an `id`, `project_id`, `created_by`, `created_at` mit `IS DISTINCT FROM`.
- Blockiert Änderungen an `deleted_at` nur dann, wenn `OLD.deleted_at IS NOT NULL` und `NEW.deleted_at IS DISTINCT FROM OLD.deleted_at`.
- Erlaubt damit `OLD.deleted_at IS NULL` und `NEW.deleted_at IS NOT NULL`.
- Erlaubt auch `OLD.deleted_at IS NULL` und `NEW.deleted_at IS NULL` für Inhaltsupdates.
- Blockiert Restore `OLD.deleted_at IS NOT NULL` → `NEW.deleted_at IS NULL`.
- Blockiert Änderung des Löschzeitpunkts `OLD.deleted_at IS NOT NULL` → anderer Zeitstempel.
- Interaktion mit `project_notes_updated`: Der vorhandene `updated_at`-Trigger darf `updated_at` ändern; der Schutztrigger prüft `updated_at` nicht. Die Reihenfolge ist für `deleted_at` nicht ursächlich.

Zustandsmatrix für `deleted_at`:

| OLD.deleted_at | NEW.deleted_at | Triggerbewertung |
| --- | --- | --- |
| `NULL` | `NULL` | erlaubt |
| `NULL` | Zeitstempel | erlaubt, gewünschter Soft Delete |
| Zeitstempel | gleicher Zeitstempel | erlaubt |
| Zeitstempel | `NULL` | blockiert, Restore |
| Zeitstempel | anderer Zeitstempel | blockiert, Änderung gelöschter Notiz |

## 17. Testlückenanalyse

- Die AP-10-Unit-Tests mocken die Update-Kette so, dass `.update(...).select(...).single()` nach dem Soft Delete eine sichtbare Zeile `{ id, project_id }` zurückgibt.
- Dieses Mock-Verhalten ist gegenüber echter Supabase-RLS unrealistisch, weil die SELECT-Policy soft gelöschte Zeilen nicht mehr sichtbar macht.
- `test/project-note-security.test.ts` prüft Migration und Policies textbasiert, führt aber keine echte RLS-Update-Operation gegen PostgreSQL/Supabase aus.
- Es fehlt ein Integrationstest, der als Admin/Reviewer ein echtes `UPDATE project_notes SET deleted_at = now() ... RETURNING id, project_id` beziehungsweise Supabase `.update().select().single()` unter RLS ausführt.
- Triggerverhalten wird nur anhand des Migrationstexts geprüft; der Trigger läuft in den Tests nicht.
- Der Client-Formsubmit wird nicht in einem Browser-/Server-Action-Integrationstest ausgeführt.
- Deshalb konnten 155 Tests grün sein, obwohl die reale Kombination aus Soft Delete, SELECT-RLS und Return-Representation fehlschlägt.

## 18. Eindeutige Hauptursache

Die eindeutige technische Hauptursache im Repository ist die Inkompatibilität zwischen AP-10-Delete-Service und AP-09-SELECT-RLS:

- AP-10 setzt `deleted_at` und verlangt anschließend durch `.select("id,project_id").single()` die aktualisierte Zeile zurück.
- AP-09 erlaubt das Soft-Delete-UPDATE, macht die aktualisierte Zeile aber über die SELECT-Policy `deleted_at is null` sofort unsichtbar.
- Der Service interpretiert die fehlende/fehlerhafte Rückgabezeile als fehlgeschlagenen Löschvorgang und zeigt die neutrale Fehlermeldung an.

Wichtige Einschränkung: Der Auftrag meldet zusätzlich, dass `deleted_at` in Production weiterhin `NULL` bleibt. Der Repository-Stand erklärt sicher die Fehlermeldung durch die Return-Representation/RLS-Kollision. Ob Production das UPDATE zusätzlich vollständig zurückrollt oder ob dort eine abweichende Policy/Triggerdefinition angewendet ist, kann ohne Runtime-Zugriff nicht abschließend bewiesen werden. Dafür sind die SQL-Prüfungen in Abschnitt 24 erforderlich.

## 19. Mögliche Nebenursachen

Falls `deleted_at` in Production nachweislich niemals gesetzt wird, bleiben neben der Repository-Hauptursache diese abzugrenzenden Runtime-Ursachen:

1. Production hat zusätzliche oder abweichende UPDATE-Policies mit `WITH CHECK (deleted_at is null)` oder restriktiven Policies.
2. Production hat eine abweichende Triggerfunktion, die `deleted_at`-Änderungen bereits bei `OLD.deleted_at IS NULL` blockiert.
3. Production hat die AP-09-Migration nicht exakt in dem im Repository liegenden Stand angewendet.

Diese Nebenursachen sind nicht durch Codeänderungen zu beheben, sondern zuerst durch Datenbankdiagnose zu bestätigen oder auszuschließen.

## 20. Sicherheitsauswirkung

- Es entsteht keine Hard-Delete-Möglichkeit.
- RLS wird nicht umgangen; der normale authentifizierte Supabase-Server-Client wird verwendet.
- Die neutrale Fehlermeldung vermeidet Datenbankdetails im UI.
- Das Risiko liegt in Verfügbarkeits-/Workflow-Störung, nicht in einer offensichtlichen Rechteausweitung.
- Eine falsche Reparatur mit Service-Role-Key oder breiter SELECT-Policy für gelöschte Notizen würde dagegen ein Sicherheitsrisiko schaffen.

## 21. Datenintegritätsauswirkung

- Bei der gemeldeten Production-Wirkung bleiben Notizen aktiv, weil `deleted_at` `NULL` bleibt.
- Dadurch werden fachlich zu löschende interne Notizen weiterhin angezeigt.
- Es gibt keinen Datenverlust durch Hard Delete.
- Wiederholtes Klicken kann denselben Fehler reproduzieren, solange die Ursache besteht.

## 22. Empfohlene minimale Reparatur

Minimaler Hotfix für ein separates, freigegebenes Arbeitspaket:

- Delete-Service so ändern, dass er nicht die nach dem Soft Delete durch SELECT-RLS unsichtbare Zeile zurückverlangt.
- Statt `.select("id,project_id").single()` eine Update-Strategie verwenden, die den Erfolg über eine RLS-kompatible Methode bestimmt, z. B. `update(..., { count: "exact" })` ohne Return-Representation und Auswertung `count === 1`, oder eine dedizierte serverseitige RPC, die atomar und RLS-konform soft löscht.
- `project_id` für Redirect/Revalidation aus der validierten Eingabe verwenden, nicht aus einer nach Soft Delete zurückgegebenen Zeile.
- Zusätzlich Production-RLS/Trigger mit den SQL-Prüfungen aus Abschnitt 24 abgleichen, bevor der Hotfix deployed wird.

## 23. Ausdrücklich nicht empfohlene Reparaturen

- Keine Service-Role-Key-Umgehung für normale Notizlöschung.
- Keine Lockerung der SELECT-Policy, die soft gelöschte Notizen für normale App-SELECTs wieder sichtbar macht.
- Keine Hard Deletes.
- Kein Entfernen des Schutztriggers.
- Kein Entfernen von `deleted_at IS NULL` aus der Notizliste.
- Keine Speicherung von ungeprüften Client-Werten wie `deleted_at`, `created_by` oder Rolle.
- Keine automatische Restore-Funktion als Nebenprodukt.

## 24. Vorgeschlagenes Hotfix-Arbeitspaket

**AP-10-HF-01 – RLS-kompatibles Projektnotiz-Soft-Delete**

Ziel:

- Soft Delete von Projektnotizen ohne Return-Representation auf eine nach dem Update nicht mehr SELECT-sichtbare Zeile umstellen.
- Keine Änderung an UI-Texten außer falls für Fehlerfälle explizit freigegeben.
- Keine Service-Role-Nutzung.
- Regressionstests für RLS-/Return-Representation-Lücke ergänzen.

Runtime-Prüfungen zur Abgrenzung der Production-Ursache:

```sql
select policyname, permissive, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename = 'project_notes'
order by policyname;
```

```sql
select tgname, pg_get_triggerdef(oid) as trigger_definition
from pg_trigger
where tgrelid = 'public.project_notes'::regclass
  and not tgisinternal
order by tgname;
```

```sql
select pg_get_functiondef('public.prevent_project_note_protected_field_updates()'::regprocedure);
```

Manueller Test als betroffener Benutzer in einer nicht-produktiven Kopie oder Preview-Datenbank:

```sql
-- Erwartung mit Repository-Policies: UPDATE ist erlaubt; RETURNING kann wegen SELECT-RLS keine aktive Zeile liefern.
update public.project_notes
set deleted_at = now()
where id = '<note_id>'::uuid
  and project_id = '<project_id>'::uuid
  and deleted_at is null
returning id, project_id, deleted_at;
```

## 25. Benötigte Regressionstests

- Unit-Test, der beim Delete-Update `error`/keine Rückgabezeile durch SELECT-RLS simuliert und sicherstellt, dass der Service-Erfolg nicht von `.single()` auf einer soft gelöschten Rückgabe abhängt.
- Test, dass der Delete-Service einen exact-count-Erfolg von `1` akzeptiert und `0` als neutralen Fehler behandelt.
- Test, dass `revalidatePath` und `redirect` nach Soft Delete weiterhin den validierten `project_id` verwenden.
- Migrationstext- oder Integrationstest, der sicherstellt, dass UPDATE-`WITH CHECK` für Soft Delete nicht `deleted_at IS NULL` verlangt.
- Echte Supabase/PostgreSQL-RLS-Integration: Admin löscht fremde aktive Notiz; Reviewer löscht eigene aktive Notiz; Reviewer kann fremde Notiz nicht löschen; gelöschte Notiz ist nicht mehr SELECT-sichtbar.
- Optional Browser-/Server-Action-Test für den zweistufigen Delete-Formsubmit.

## 26. Manuelle Smoke-Tests

- Als Admin: aktive fremde Projektnotiz löschen; Erfolgsmeldung sehen; Reload zeigt Notiz nicht mehr; DB zeigt `deleted_at IS NOT NULL`.
- Als Reviewer: eigene aktive Projektnotiz löschen; Erfolgsmeldung sehen; Reload zeigt Notiz nicht mehr; DB zeigt `deleted_at IS NOT NULL`.
- Als Reviewer: fremde Notiz darf keinen Delete-Button zeigen und manipulierte FormData muss serverseitig abgelehnt werden.
- Gelöschte Notiz darf nicht über normale Projektdetailseite erscheinen.
- Zweiter Löschversuch auf bereits gelöschte Notiz muss neutral fehlschlagen.

## 27. Merge-Gates

Für das spätere Hotfix-Paket erforderlich:

- `npm install`
- `npm run typecheck`
- `npm run lint`
- `npm test`
- `npm run build`
- `git diff --check`
- SQL-Abgleich der Production-/Preview-Policies und Trigger gegen den erwarteten Stand.
- Manuelle Smoke-Tests aus Abschnitt 26.

Für dieses Diagnose-Audit wurden die Baseline-Gates ausgeführt und waren erfolgreich; es wurden keine Code-, Test-, Migrations-, RLS- oder Triggeränderungen vorgenommen.

## 28. Rollback-Strategie

- Dieses Audit enthält nur Dokumentation. Rollback: den Audit-Commit revertieren oder die Datei `docs/audits/2026-07-22-ap10-note-delete-failure-audit.md` entfernen.
- Für den späteren Hotfix: Anwendungscode-Commit revertieren, falls die Änderung nur den Service betrifft.
- Falls eine spätere Datenbankänderung freigegeben wird, muss der Rollback über eine neue Gegenmigration erfolgen; angewendete Migrationen nicht aus der Historie löschen.
- Vor jeder Datenbank-Gegenmigration prüfen, ob bereits soft gelöschte Notizen existieren, damit keine fachlichen Löschmarkierungen verloren gehen.

## AP-10-HF-01 Implementation Result

- **Implementierungsstatus:** IMPLEMENTED – VALIDIERUNG IN PREVIEW/PRODUCTION AUSSTEHEND.
- **Baseline-Commit:** `523b177 Merge pull request #17 from laulix-krander/codex/fuhre-diagnose-audit-zum-soft-delete-durch`.
- **Supabase-JS-Version:** tatsächlich installiert ist `@supabase/supabase-js` `2.110.8`; die installierten `@supabase/postgrest-js`-Typen unterstützen `update(values, { count: "exact" })`.
- **Bisherige fehlerhafte Abfrage:** Der Delete-Service setzte `deleted_at` und forderte anschließend über `.select("id,project_id").single()` eine Return-Representation an.
- **Neue Abfrage:** Der Delete-Service führt `update({ deleted_at }, { count: "exact" })` mit den unveränderten Filtern `id`, `project_id` und `deleted_at IS NULL` aus.
- **Entfernte Return-Representation-Abhängigkeit:** Der Soft-Delete-Pfad verlangt nach dem UPDATE keine anschließend durch SELECT-RLS unsichtbare gelöschte Notizzeile mehr.
- **Erfolgsprüfung:** Der Erfolg wird ausschließlich über den exakten UPDATE-Count bestimmt.
- **Verhalten bei `count = 1`:** Der Service meldet Erfolg und gibt die validierte Notiz-ID sowie die zuvor bestätigte Projekt-ID zurück.
- **Verhalten bei `count = 0`:** Der Service meldet „Die Notiz wurde nicht gefunden oder ist nicht mehr verfügbar.“ und täuscht keinen Erfolg vor.
- **Verhalten bei `count = null`:** Der Service behandelt den Erfolg als nicht nachweisbar und gibt die neutrale Löschfehlermeldung zurück.
- **Datenbankfehler:** Rohe Supabase-/SQL-Fehler werden nicht weitergereicht; der Service gibt „Die Notiz konnte nicht gelöscht werden. Bitte versuchen Sie es erneut.“ zurück.
- **Unveränderte RLS-Regeln:** Es wurde keine Migration geändert oder erstellt; SELECT-, INSERT- und UPDATE-Policies bleiben unverändert.
- **Unveränderte Triggerregeln:** Es wurde keine Triggerfunktion und kein Trigger geändert.
- **Neue Regressionstests:** Die AP-10-Delete-Tests prüfen exact-count-Erfolg, `count = 0`, `count = null`, neutrale Datenbankfehler, ausschließliches `deleted_at`-Payload, serverseitigen Zeitstempel, Filter auf `id`, `project_id`, `deleted_at IS NULL`, keine Hard Deletes und keinen Post-Update-SELECT im Soft-Delete-Pfad.
- **Merge-Gates:** Typecheck, Lint, Unit Tests, Build und `git diff --check` wurden nach der Implementierung ausgeführt.
- **Bekannte Einschränkungen:** Preview-/Production-Smoke-Tests müssen gegen die echte Supabase-Umgebung noch ausgeführt werden; Unit Tests verwenden keine Produktions-Supabase-Instanz.
- **Rollback:** Commit `Fix AP-10 project note soft delete under RLS` revertieren; dadurch wird der vorherige Return-Representation-basierte Soft-Delete-Pfad wiederhergestellt.

## AP-10-HF-02 Implementation Result

- **Status:** IMPLEMENTED – VALIDIERUNG IN PREVIEW/PRODUCTION AUSSTEHEND.
- **Bestätigte Production-Policydefinitionen:** Die UPDATE-Policies `project notes update active admin` und `project notes update own active reviewer` erlauben weiterhin Admin-Updates auf aktive Notizen beziehungsweise Reviewer-Updates auf eigene aktive Notizen. Ihre WITH-CHECK-Bedingungen verlangen authentifizierte Benutzer, passende Rolle, aktives zugehöriges Projekt und für Reviewer `created_by = auth.uid()`, aber kein `deleted_at IS NULL` für den neuen Zeilenzustand.
- **Bestätigtes Triggerverhalten:** `prevent_project_note_protected_field_updates()` erlaubt den Übergang `OLD.deleted_at IS NULL` zu `NEW.deleted_at IS NOT NULL` und blockiert Änderungen an bereits soft gelöschten Notizen sowie Restore-Versuche.
- **Verbleibende technische Ursache:** Der direkte PostgREST-/Supabase-UPDATE-Pfad kollidiert mit der normalen SELECT-RLS, weil die aktualisierte Zeile nach Setzen von `deleted_at` nicht mehr unter `project notes read active` sichtbar ist. Die normale SELECT-Policy bleibt unverändert und zeigt nur aktive Notizen.
- **Neue RPC:** `public.soft_delete_project_note(target_note_id uuid, target_project_id uuid)` wurde in `supabase/migrations/202607230001_project_note_soft_delete_rpc.sql` ergänzt und gibt `boolean` zurück. `true` bedeutet genau eine soft gelöschte Zeile, `false` ist die neutrale Antwort für unbekannte, fremde, projektfremde oder bereits gelöschte Notizen.
- **Security-Definer-Schutz:** Die Funktion ist `SECURITY DEFINER`, setzt `search_path = public, pg_temp`, verwendet keine dynamischen SQL-Anweisungen und gibt keine Notizinhalte zurück.
- **Rollenprüfung:** Die Funktion prüft `auth.uid()` und `public.current_app_role()` intern und erlaubt ausschließlich `admin` und `reviewer`.
- **Ownership-Prüfung:** Admins dürfen jede aktive Notiz eines aktiven Projekts soft löschen. Reviewer dürfen ausschließlich eigene aktive Notizen soft löschen, geprüft über `project_notes.created_by = auth.uid()`.
- **Aktive Projekt-/Notizprüfung:** Die Funktion prüft `projects.id = target_project_id`, `projects.deleted_at IS NULL`, `project_notes.id = target_note_id`, `project_notes.project_id = target_project_id` und `project_notes.deleted_at IS NULL`.
- **Verändertes Feld:** Die RPC setzt ausschließlich `project_notes.deleted_at = statement_timestamp()`. Der bestehende `updated_at`-Trigger bleibt unverändert aktiv; die Funktion ändert keine Inhalte, Besitzer, IDs oder Erstellzeitpunkte.
- **Funktionsberechtigungen:** `PUBLIC` erhält keine Ausführung (`REVOKE ALL`), `authenticated` erhält `EXECUTE`; `anon` erhält keine Berechtigung.
- **Anwendungsintegration:** Der Delete-Service behält Authentifizierung, Profilprüfung, Rollenvalidierung, aktive Projektprüfung, aktive Notizprüfung und Ownership-Prüfung bei und ruft danach `supabase.rpc("soft_delete_project_note", { target_note_id, target_project_id })` statt eines direkten `project_notes`-Soft-Delete-UPDATEs auf.
- **Erfolgs-/Fehlerverhalten:** RPC `true` liefert Service-Erfolg und der bestehende Action-Pfad führt weiter zu `revalidatePath` und Redirect mit `note_deleted=1`. RPC `false` liefert „Die Notiz wurde nicht gefunden oder ist nicht mehr verfügbar.“. Datenbankfehler liefern neutral „Die Notiz konnte nicht gelöscht werden. Bitte versuchen Sie es erneut.“; rohe PostgreSQL-/Supabase-Fehler werden nicht angezeigt.
- **Tests:** Die Unit-Tests prüfen den RPC-Namen, die ausschließlich erlaubten RPC-Argumente, das Fehlen eines clientseitigen `deleted_at`, Erfolg bei `true`, neutrale Meldungen bei `false` und DB-Fehlern, unveränderte Admin-/Reviewer-Regeln, Regressionsschutz gegen direkten Soft-Delete-UPDATE und fehlenden Hard Delete. Die Migrationstests prüfen `SECURITY DEFINER`, festen `search_path`, Auth-/Rollen-/Ownership-/Aktivitätsprüfungen, ausschließliche `deleted_at`-Änderung, keine Hard Deletes, keinen Restore, keine Notizinhalte, Berechtigungen und unveränderte SELECT-Policy.
- **Merge-Gates:** Typecheck, Lint, Vitest, Build und `git diff --check` sind vor Merge auszuführen. Zusätzlich ist zu prüfen: genau eine neue Migration, keine bestehende Migration geändert, keine SELECT-Policy gelockert, keine RLS-Erweiterung für gelöschte Notizen, kein Hard Delete, keine Wiederherstellung, kein Service-Role-Key, keine neue npm-Abhängigkeit und keine Notizinhalte in Logs oder RPC-Rückgaben.
- **Preview-/Production-Validierung:** Ausstehend. Manuell zu prüfen: Migration anwenden; Funktionseigenschaften und Grants in Supabase kontrollieren; als Admin fremde und eigene aktive Notiz löschen; als Reviewer eigene aktive Notiz löschen; als Reviewer fremde Notiz ablehnen; bereits gelöschte Notiz liefert neutral `false`; normale Notizliste zeigt gelöschte Notizen weiterhin nicht; Hard Delete und Restore bleiben blockiert.
- **Rollback:** Anwendungscode-Commit zurücksetzen. Die Datenbankfunktion nach Anwendung der Migration ausschließlich über eine neue freigegebene Gegenmigration entfernen; angewandte Migrationen niemals löschen oder nachträglich verändern. Bestehende soft gelöschte Notizen bleiben erhalten; es werden keine Daten gelöscht.
