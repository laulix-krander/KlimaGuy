# AP-14-02-00 — Controlled User Role Change Audit

**Audit-ID:** `KG-AUDIT-2026-07-31-AP14-02-00-CONTROLLED-ROLE-CHANGE-V1`  
**Datum:** 2026-07-31  
**Branch:** `codex/audit-ap14-02-controlled-role-change`  
**Art:** ausschließlich Architektur-, Security- und UX-Analyse; keine Implementierung  
**Auditstatus:** **READY FOR OWNER DECISION**

## 1. Executive Summary und eindeutige Empfehlung

AP-14-01 hat die read-only Benutzerverwaltung unter `/admin/users` implementiert. Ihre Liste ist serverseitig nur für einen authentifizierten Benutzer mit vorhandenem, gültigem Adminprofil zugänglich. Die kanonische E-Mail stammt aus Supabase Auth, die Rolle aus `public.profiles`. Reviewer erhalten weder Navigation noch Listendaten. Die Anwendung bietet noch keine Rollenmutation; ein Admin kann Rollen derzeit nur außerhalb der unterstützten Anwendung beziehungsweise über SQL ändern. Aufgrund der breiten vorhandenen Profilpolicy kann ein Admin bei in der Zielumgebung vorhandenem Tabellen-UPDATE-Privileg außerdem einen nicht unterstützten direkten PostgREST-Aufruf ausführen.

Empfohlen wird **Variante C: dedizierte Server Action → schmaler Service mit normalem authentifiziertem Serverclient → eng signierte `SECURITY DEFINER`-RPC**. Nur die RPC trifft die endgültige Entscheidung und führt Rollenupdate und Erfolgs-Audit atomar aus. Eine transaktionsgebundene globale Advisory-Sperre für den Rollenwechsel, Zielzeilensperre, erneute Actorprüfung sowie Compare-and-set schützen den letzten Admin und konkurrierende Änderungen. Direkte Rollenupdates müssen im selben DB-Baseline-Paket wirksam geschlossen werden. Service Role und Supabase-Auth-Mutation sind weder erforderlich noch zulässig.

Die Owner-Entscheidungen werden nicht neu geöffnet: nur `admin ↔ reviewer`, niemals die eigene Rolle, niemals den letzten aktiven Admin herabstufen, keine freie Patch-Payload, keine direkte Clientmutation, keine Einladung und keine Deaktivierung.

## 2. Git-Baseline, Remote-Status und Prüfmethode

- Vor Beginn war der Arbeitsbaum sauber; `git status --short --branch` zeigte ausschließlich `## work`.
- Saubere lokale Baseline/Start-HEAD: `870e1a6d09288127425c64029d26a070e1799f57`.
- `git remote -v` lieferte keine Ausgabe. Es ist kein Remote konfiguriert. Deshalb waren `git fetch origin`, `git rev-parse origin/main` und `git merge-base HEAD origin/main` nicht möglich. Der saubere lokale HEAD wurde als Baseline verwendet; ob er exakt einem extern aktuellen `main` entspricht, kann ohne Remote nicht verifiziert werden.
- Die beiden verbindlichen AP-14-Grundlagen wurden vollständig gelesen. Vollständig geprüft wurden die AP-14-01-Seite, View, Read-Service, Auth-Read-Adapter, Permissions, Schemas, UI-Komponenten sowie alle Benutzerverwaltungs- und Navigationstests.
- Repositoryweit geprüft wurden sämtliche Migrationen und einschlägigen Service-/Server-Action-Muster, insbesondere Rollenmodell, `profiles`, `current_app_role()`, RLS/Grants, Trigger, `audit_log`, `SECURITY DEFINER`-RPCs, Zeilensperren, Compare-and-set-/Konfliktmuster, Feldschutztrigger und Auth-FKs.
- Es wurden keine echten E-Mail-Adressen, Benutzer-IDs oder personenbezogenen Production-Daten erhoben oder dokumentiert und auftragsgemäß keine Anwendungstests ausgeführt.

## 3. Verbindlicher aktueller Produkt- und Rollenstand

- **AP-14-01 READ-ONLY USER ADMINISTRATION IMPLEMENTED**
- **ROLE CHANGE NOT IMPLEMENTED**
- **REVIEWER INVITATION NOT IMPLEMENTED**
- **USER DEACTIVATION NOT IMPLEMENTED**
- **OVERALL PRODUCT NOT PRODUCTION READY**

Die Liste ist ausschließlich Admins zugänglich. E-Mail bleibt Auth-Datum; Rollenquelle ist ausschließlich `public.profiles`. Zulässig sind ausschließlich `admin` und `reviewer`. `canViewUserAdministration` ist implementiert und erlaubt nur `admin`. Eigene Rollenänderung ist für das MVP ausgeschlossen. Ein späterer Rollenwechsel mutiert nur `public.profiles.role`; Supabase Auth wird nicht mutiert. Benutzer ohne Profil und Benutzer mit ungültiger Rolle werden durch den normalen Rollenwechsel nicht repariert. Einladung und Deaktivierung bleiben ausgeschlossen.

## 4. Verifizierter Ist-Zustand: Profil, Rolle, RLS, Grants und Trigger

### 4.1 Datenmodell und Auth-Verknüpfung

`public.profiles` besitzt `id uuid primary key references auth.users(id) on delete cascade`, `display_name`, `role app_role not null default 'reviewer'`, `created_at` und `updated_at`. Es gibt **kein** `active`, `disabled_at` oder `deleted_at`. Im heutigen Modell bedeutet „aktiver Admin“ deshalb: jedes tatsächlich vorhandene Profil mit gültigem DB-Wert `role = 'admin'`. Das ist eine Modellkonvention, keine Aussage über Auth-Session, Bann- oder Providerstatus.

Das PostgreSQL-Enum `public.app_role` (im initialen `public`-Kontext angelegt) enthält exakt `admin` und `reviewer`. TypeScript führt dieselbe geschlossene Allowlist über `ROLES`; `roleSchema = z.enum(ROLES)` validiert externe Werte. Ein ungültiger Rollenwert ist unter intaktem Enum/Constraint nicht regulär speicherbar. Dennoch müssen Service und RPC bei unerwarteten/inkonsistenten Daten fail closed arbeiten.

Die FK garantiert bei normal durchgesetzter referenzieller Integrität, dass ein vorhandenes Profil einen Auth-Benutzer hat; ein Auth-Benutzer ohne Profil ist dagegen möglich. Die Rollen-RPC muss daher nicht zusätzlich und privilegiert in `auth.users` lesen. Sie darf sich für ein vorhandenes Zielprofil auf die FK stützen, keine Auth-Admin-API aufrufen und kein fehlendes Profil erzeugen. Die Production-Validierung muss bestätigen, dass Constraint und FK intakt sind.

### 4.2 `current_app_role()`, RLS und direkte Mutationslücke

- `current_app_role()` ist `STABLE SECURITY DEFINER`, hat derzeit `search_path = public`, liest `profiles.role` für `auth.uid()` und liefert bei fehlendem Profil `NULL`. Die spätere neue RPC erhält den gehärteten festen Pfad `public, pg_temp`; eine Härtung der bestehenden Helperfunktion ist separat in der Migration bewusst zu prüfen.
- RLS ist für `profiles` aktiviert.
- `profiles read own or admin` erlaubt SELECT für die eigene Zeile oder alle Zeilen bei aktueller Adminrolle.
- `admins manage profiles` ist `FOR ALL` mit Adminprüfung in `USING` und `WITH CHECK`; sie umfasst SELECT, INSERT, UPDATE und DELETE. Es gibt keine spaltenbezogene Profil-UPDATE-Policy und keinen Profil-Feldschutztrigger.
- Repositorymigrationen enthalten weder explizite Tabellen-`GRANT`s noch Tabellen-`REVOKE`s für `profiles`. Die effektiven Plattformprivilegien sind deshalb aus Git allein nicht beweisbar und müssen in Production inventarisiert werden.

**Konkrete Bewertung:** Ein Reviewer kann über die vorhandenen Policies sein Profil lesen, aber nicht aktualisieren und sich daher nicht selbst zum Admin machen. Ein Admin erfüllt dagegen die breite `FOR ALL`-Policy auch für die eigene und fremde Profilzeile. Sofern `authenticated` in der realen DB ein Tabellen-UPDATE-Privileg besitzt (typischer Plattformdefault, aber im Repository nicht beweisbar), kann ein Admin über PostgREST beliebige freigegebene Profilspalten einschließlich `role` direkt ändern, sich selbst herabstufen, den letzten Admin entfernen und Audit/Compare-and-set umgehen. Die Policy allein erteilt zwar kein Tabellenprivileg; deshalb ist die Aussage für die Zielumgebung durch Grant-Inventar zu bestätigen.

AP-14-02-01 muss die direkte Rollenmutationsgrenze **zwingend schließen**, nicht nur eine sichere RPC hinzufügen: breite `FOR ALL`-Policy durch getrennte, eng benötigte Policies ersetzen und effektive Tabellenprivilegien so festlegen, dass normale Browserpfade kein `UPDATE(role)` besitzen. Da derzeit kein unterstützter Profilupdatepfad existiert, ist als MVP die vollständige Entziehung normalen Profil-UPDATEs am kleinsten. Falls später `display_name` editierbar werden soll, benötigt dies eine getrennte spaltenbezogene Freigabe plus Feldschutz; niemals ein freies Profilupdate. Keine Tabellen-Granterweiterung ist für die Rollen-RPC nötig.

Es existiert nur `profiles_updated`, ein allgemeiner `BEFORE UPDATE`-Trigger auf `set_updated_at()`. Er setzt den Zeitstempel, schützt aber kein Feld. Es gibt keinen letzten-Admin-, Self-Change- oder Rollen-Audit-Trigger. Damit besteht für einen privilegierten Adminpfad ein Mass-Assignment-Risiko, sobald ein breites Profilobjekt an ein Tabellenupdate gelangt.

### 4.3 `public.audit_log` und vorhandene Muster

`audit_log` enthält UUID, optionale Actor-FK zu Auth, Entitytyp/-ID, Aktion, JSONB-Metadaten und Zeitstempel. RLS ist aktiviert; `ALL` ist `anon` und `authenticated` entzogen. Der Client kann es nicht direkt bearbeiten. Bestehende Definer-RPCs verwenden `auth.uid()`, prüfen `current_app_role()`, setzen einen festen `search_path` (neuere Muster: `public, pg_temp`), sperren betroffene Zeilen mit `FOR UPDATE`, schreiben Mutation und Audit in einer Transaktion und widerrufen `EXECUTE` vor gezieltem Grant an `authenticated`. Bestehende Konfliktmuster kombinieren Zustandsfilter/Compare-and-set, Zeilensperre und bei verlorener Vorbedingung einen geschlossenen Status beziehungsweise Transaktionskonflikt.

## 5. Architekturvarianten

| Variante | Security-/Parallelitätsprüfung | Audit und Grenze | Urteil |
| --- | --- | --- | --- |
| **A — direktes RLS-geschütztes `UPDATE profiles`** | RLS kann Actor/Admin und Self-Change zeilenbezogen prüfen, aber eine bloße Policy löst die globale letzter-Admin-Invariante und parallele Herabstufungen nicht sauber. Clientzählung ist wertlos. Breite/spaltenbezogene Grants bleiben kritisch. | Kein garantierter atomarer Auditschreibpfad; Browser erhält Mutationsfähigkeit. | **Ablehnen.** Heutige breite Policy genügt ausdrücklich nicht. |
| **B — Server Action/Service mit normalem Tabellenupdate** | Session, Permission und CAS-Filter sind möglich. Eine Servicezählung vor dem Update liegt jedoch außerhalb derselben serialisierten DB-Entscheidung: zwei Requests können denselben Adminbestand sehen und beide herabstufen. Zielzeilenfilter allein schützt verschiedene Zieladmins nicht. | Audit als zweiter Clientrequest kann fehlschlagen und einen erfolgreichen Wechsel ohne Audit hinterlassen. | **Ablehnen.** Die entscheidende Invariante ist nicht atomar. |
| **C — Server Action/Service mit enger Definer-RPC** | RPC prüft `auth.uid()`, Actorprofil/Adminrolle, Self-Change, Ziel, Allowlist, erwartete Rolle und letzten Admin erneut. Globale Transaktionssperre plus Zeilensperre serialisiert relevante Wechsel. | Update und sanitisiertes Audit laufen atomar; schmale Rückgabe und enge `EXECUTE`-Rechte; keine Tabellenmutationsfreigabe. | **Eindeutige Empfehlung.** Kleinste sichere Architektur. |
| **D — Service-Role-Profilupdate** | Umgeht RLS, vergrößert Blast Radius und macht korrekte Appprüfung zur einzigen Barriere. Für eine DB-eigene atomare Operation unnötig. | Audit/Locks müssten trotzdem neu gebaut werden; privilegierter Secretpfad ohne Nutzen. | **Ablehnen und vermeiden.** Keine Service Role für Rollenwechsel. |

## 6. Striktes Eingabeschema und zentrale Permission

Späteres Schema, beispielsweise `changeUserRoleSchema`, muss `.strict()` sein und **ausschließlich** enthalten:

```text
target_user_id: UUID
target_role: "admin" | "reviewer"
expected_current_role: "admin" | "reviewer"
```

Nicht zulässig sind `actor_id`, E-Mail, Profil-/Patchobjekte, `deleted_at`, `created_at`, frei setzbares `updated_at`, Auth-Metadaten, Service-Role-Daten oder andere Zusatzfelder. FormData ist in ein exakt whitelisted Objekt zu mappen; unbekannte Schlüssel werden nicht still übernommen. Der Actor stammt ausschließlich aus `auth.uid()`.

`expected_updated_at` wird für das MVP **nicht aufgenommen**. `expected_current_role` schützt genau die einzige durch diesen Workflow veränderbare sicherheitsrelevante Eigenschaft. Ein Zeitstempel würde auch fachlich fremde künftige Profiländerungen konfliktieren und API/UX vergrößern, ohne derzeit zusätzlichen Rollenschutz zu liefern. Neu bewerten, falls mehrere relevante Profilfelder gemeinsam mutiert werden.

`canChangeUserRole` ist **noch nicht implementiert**; vorhanden ist nur `canViewUserAdministration`. AP-14-02-01 ergänzt die getrennte zentrale Permission ohne neue Rollenklasse. Sie gibt nur für eine bereits extern validierte Rolle `admin` wahr. Nicht authentifiziert, Reviewer, fehlendes Profil und ungültige Rolle werden vor RPC-Aufruf abgelehnt. Diese Serviceprüfung verbessert Defense in Depth und UX, ersetzt aber nie die RPC-Prüfung.

## 7. Empfohlenes RPC-Zielbild

Additive, eng signierte Funktion entsprechend dem realen Enumtyp:

```text
public.change_user_profile_role(
  target_user_id uuid,
  target_role public.app_role,
  expected_current_role public.app_role
)
```

### 7.1 Prüf- und Transaktionsreihenfolge

1. Parameter-NULLs und geschlossene Rollenwerte ablehnen (das Enum ist zusätzliche DB-Allowlist).
2. `actor_id := auth.uid()` ausschließlich serverseitig bestimmen; fehlende Authentifizierung fail closed.
3. Eine konstante, dokumentierte **transaktionsgebundene PostgreSQL Advisory-Sperre** für den Namensraum „user profile role changes“ erwerben. Sie muss von jeder späteren Rollenmutations-RPC verwendet werden, nicht nur bei Herabstufungen.
4. Actorprofil laden und sperren beziehungsweise im serialisierten Abschnitt erneut lesen; es muss existieren und exakt `admin` sein. `actor_id = target_user_id` immer mit `self_role_change_blocked` ablehnen, auch bei mehreren Admins.
5. Zielprofil anhand exakt `target_user_id` mit `FOR UPDATE` laden. Fehlend → `user_profile_missing`; vorhandene Rolle außerhalb der geschlossenen Domäne → `user_role_invalid` (unter intaktem Enum nur Defense in Depth/Recovery-Trennung).
6. Aktuelle Rolle muss exakt `expected_current_role` entsprechen. Sonst keine Mutation und `user_role_conflict`.
7. Ist `target_role` identisch mit aktueller Rolle, stabilen idempotenten Erfolg `no_change`/`changed=false` liefern: kein UPDATE, kein `updated_at`-Touch, kein Auditduplikat.
8. Bei `admin → reviewer` im selben Advisory-Lock-Abschnitt alle vorhandenen gültigen Adminprofile zählen. Da es kein Aktivfeld gibt, zählen genau vorhandene Profile mit `role='admin'`. Nur wenn nach der Änderung mindestens ein anderer Admin verbleibt, darf fortgefahren werden; sonst `last_admin_protected`.
9. Enges Compare-and-set-UPDATE ausschließlich von `role`, gefiltert auf Ziel-ID und `role = expected_current_role`. Betroffene Zeilen ungleich eins → Konflikt, keine Mutation.
10. In derselben Funktion/DB-Transaktion genau ein sanitisiertes Erfolgsereignis schreiben. Schlägt der Auditinsert fehl, muss die gesamte Transaktion einschließlich Rollenupdate scheitern.
11. Nur einen geschlossenen fachlichen Status und erlaubte Identifikatoren/Rollen zurückgeben; keine DB-Ausnahme- oder Providerdetails.

Die Advisory-Sperre ist MVP-tauglicher als eine neue Guard-Tabelle/-Zeile: keine zusätzliche persistente Struktur und korrekte Serialisierung verschiedener Zielzeilen. Eine bloße Zielzeilensperre plus Zählung ist unzureichend, weil zwei verschiedene Adminzeilen parallel gesperrt werden können. Ein Tabellenlock wäre korrekt, aber unnötig grob und schwerer mit normalen Zugriffen zu betreiben. Eine Guard-Zeile wäre ebenfalls korrekt und sichtbarer, benötigt aber eine neue Tabelle/Singleton-Lifecycle. Empfehlung: konstante `pg_advisory_xact_lock`-Sperre **vor** Actor-/Zielentscheidung und Adminzählung; konsistente Sperrreihenfolge verhindert Deadlocks.

### 7.2 Letzter-Admin-Invariante und Sonderfälle

**Atomare Invariante:** Nach jeder erfolgreich geänderten Rolle existiert mindestens ein vorhandenes Profil mit gültiger Rolle `admin`.

- Zwei parallele Herabstufungen werden global serialisiert; die zweite sieht den neuen Bestand und wird nötigenfalls als letzter Admin abgelehnt.
- Versuchen zwei Admins, sich gegenseitig herabzustufen, kann der erste zulässige Wechsel gelingen. Der zweite Request liest danach sein Actorprofil erneut als Reviewer und endet `user_role_forbidden`.
- Eine parallele Ernennung wird ebenfalls durch denselben Lock serialisiert. Danach kann eine Herabstufung den neu ernannten Admin mitzählen; davor nicht. Beide Reihenfolgen halten die Invariante.
- Fehlende Profile zählen nicht; ungültige Rollen zählen nicht. Ein Auth-User ohne Profil wird weder Actor noch Ziel noch Admin. Es erfolgt keine Reparatur.
- Sollte später ein Aktiv-/Soft-Delete-Modell ergänzt werden, muss die Invariante vor dessen Einführung angepasst werden; derzeit darf kein nicht existentes Aktivkriterium erfunden werden.

### 7.3 Rückgabeform

`returns boolean` ist zu informationsarm: verboten, Konflikt, letzter Admin und fehlendes Profil wären nicht neutral unterscheidbar. Eine reine Erfolgstabelle ohne geschlossene Fehlersemantik verleitet zu SQL-Fehlertext-Mapping. Empfohlen ist **genau eine schmale Tabellenzeile mit geschlossenem `status_code`** und nullable fachlichen Feldern:

```text
status_code: changed | no_change | user_role_forbidden | user_profile_missing |
             user_role_invalid | user_role_conflict | last_admin_protected |
             self_role_change_blocked | user_role_change_failed
target_user_id: UUID | null
old_role: admin | reviewer | null
new_role: admin | reviewer | null
changed: boolean
```

Der Service mappt `changed`/`no_change` auf die vereinbarte Discriminated Union. `user_not_found` bleibt ein Servicecode für einen sicher belegbaren fehlenden Auth-Benutzer in einem anderen kontrollierten Kontext; der normale Rollenpfad liest Auth nicht privilegiert. Für ein nicht existentes Ziel in der RPC ist `user_profile_missing` präzise. Unerwartete SQL-/Providerdetails werden ausschließlich zu `user_role_change_failed` normalisiert.

## 8. Self-Change, Compare-and-set und Idempotenz

- `auth.uid() = target_user_id` wird ausnahmslos abgelehnt: `self_role_change_blocked`; „Du kannst deine eigene Rolle nicht ändern.“ Die UI-Deaktivierung ist nur Komfort, nicht Sicherheitsgrenze.
- Das Update darf nur bei `profiles.role = expected_current_role` erfolgen. Abweichung: keine Mutation, `user_role_conflict`; „Die Rolle wurde zwischenzeitlich geändert. Bitte lade die Benutzerliste neu.“ Keine vorherige Clientzählung und kein Last-Write-Wins.
- `target_role = aktuelle Rolle` wird als idempotenter Erfolg `changed=false`/`no_change` behandelt. Das ist retry-freundlich, berührt weder Zeile noch Zeitstempel, erzeugt kein Auditduplikat und revalidiert nicht. Es ist weder Sicherheitskonflikt noch ungültige Eingabe.

## 9. Audit Logging

Erfolgreiche echte Änderungen erzeugen in derselben DB-Transaktion genau ein Ereignis:

- `action = 'user_role_changed'`;
- `actor_id = auth.uid()`;
- `entity_type` stabil, beispielsweise `user_profile`;
- `entity_id = target_user_id`;
- Metadaten ausschließlich alte Rolle, neue Rolle, Ergebnis `changed` und stabiler Statuscode; Zeitpunkt über `created_at`/ein gemeinsames `statement_timestamp()`.

Keine E-Mail, Auth-Tokens, Passwörter, Schlüssel, Providerfehler, rohe Supabaseantwort oder personenbezogene Metadaten. `no_change`, Verbote, Konflikte, Self-Change, letzter-Admin-Schutz und Validierungsfehler erzeugen in diesem MVP kein Rollenänderungs-Erfolgsereignis; insbesondere kein irreführendes `user_role_changed`. Ein späteres Security-Attempt-Log wäre ein getrenntes, rate-limit-/datenschutzgeprüftes Konzept. Es darf niemals einen erfolgreichen Rollenwechsel ohne Audit geben.

## 10. `EXECUTE`- und Tabellenrechte

Die Migration muss für die exakte Signatur zuerst `REVOKE EXECUTE ... FROM PUBLIC, anon, authenticated` und danach ausschließlich `GRANT EXECUTE ... TO authenticated` setzen. Das anfängliche Revoke von `authenticated` verhindert geerbte/alte Zustände vor dem expliziten Grant. Die Funktion prüft intern trotzdem `auth.uid()` und die aktuelle Adminrolle.

Keine Tabellen-Granterweiterung, kein direktes `UPDATE(role)` für Browserpfade. AP-14-02-01 muss effektive Grants inventarisieren und direkte Rollenmutation durch Policy-/Grant-Härtung schließen. Production Gate: `authenticated` kann die RPC ausführen, `anon`/`PUBLIC` nicht; ein Reviewer erhält von der RPC dennoch fachlich `user_role_forbidden`; direkte Profilrollenupdates scheitern für jeden normalen Browserpfad.

## 11. Server-Action- und Service-Zielbild

### 11.1 Server Action

Dedizierte `async` Server Action, beispielsweise `changeUserRoleAction`:

- akzeptiert nur `FormData` oder ein enges Objekt und extrahiert exakt die drei freigegebenen Felder;
- erstellt den bestehenden cookiegebundenen Supabase-Serverclient;
- delegiert vollständig an den Service; enthält weder Rollenlogik, Adminzählung noch E-Mail-Verarbeitung;
- ruft ausschließlich nach `success && changed` `revalidatePath('/admin/users')` auf;
- revalidiert nicht bei `no_change` oder Fehlern und erzwingt keinen Redirect.

### 11.2 Service

Dedizierter Service, beispielsweise `lib/actions/user-role-change-service.ts`, mit schmaler testbarer Grenze:

```text
getUser()
getProfile(actorId)
changeRoleAtomically(target_user_id, target_role, expected_current_role)
```

Der Service validiert zuerst das strikte Schema, dann Session, Profilrolle über `roleSchema` und `canChangeUserRole`, und delegiert an die RPC. Er darf keine Auth-Admin-API, keine Service Role und kein direktes Tabellenupdate verwenden. Die lokale Vorprüfung liefert schnelle neutrale UX; die RPC wiederholt alle sicherheitskritischen Prüfungen gegen den aktuellen Transaktionszustand.

### 11.3 Stabile Action-/Service-Resultate

```text
{ success: true, target_user_id, old_role, new_role, changed: true }
{ success: true, target_user_id, old_role, new_role, changed: false }
{ success: false, code: <geschlossener Fehlercode>, message: <neutrale UI-Meldung> }
```

Geschlossene Fehlercodes: `user_role_forbidden`, `user_not_found`, `user_profile_missing`, `user_role_invalid`, `user_role_conflict`, `last_admin_protected`, `self_role_change_blocked`, `user_role_change_failed`. Keine E-Mail, DB- oder Providerdetails in der Rückgabe.

## 12. UI-/UX-Zielbild für `/admin/users`

Nur Zeilen mit `profile_status = active`, gültiger Rolle und `is_current_user = false` erhalten „Rolle ändern“. Eigener Benutzer, fehlendes Profil und ungültige Rolle sind sichtbar, aber nicht änderbar; ein verständlicher Text erklärt den Grund. Die bestehende Rolle bleibt als ausgeschriebenes deutsches Badge sichtbar.

Empfohlen ist ein Button „Rolle ändern“ und ein expliziter, tastaturbedienbarer Inline- oder Dialog-Schritt. Er benennt Quelle und Ziel eindeutig. Bei `Administrator → Reviewer` erscheint eine besondere Warnung. Kein Select mutiert sofort, kein optimistisches Update. Während Pending sind Submit und erneutes Öffnen gegen Doppelsubmit gesperrt; Text: „Wird aktualisiert …“.

Verbindliche Meldungen:

| Zustand | Exakter Text | Semantik |
| --- | --- | --- |
| Erfolg | „Die Benutzerrolle wurde aktualisiert.“ | `role="status"` |
| Keine Änderung | „Die Benutzerrolle ist bereits aktuell.“ | `role="status"` |
| Selbständerung | „Du kannst deine eigene Rolle nicht ändern.“ | `role="alert"` |
| Letzter Admin | „Der letzte Administrator kann nicht zum Reviewer herabgestuft werden.“ | `role="alert"` |
| Konflikt | „Die Rolle wurde zwischenzeitlich geändert. Bitte lade die Benutzerliste neu.“ | `role="alert"` |
| Fehlendes Profil | „Für diesen Benutzer ist kein gültiges Profil vorhanden.“ | `role="alert"` |
| Allgemeiner Fehler | „Die Benutzerrolle konnte nicht aktualisiert werden.“ | `role="alert"` |

Das Formular führt `aria-busy`; Pending-Buttons erhalten sowohl `disabled` als auch `aria-disabled`. Buttontexte nennen die beabsichtigte Aktion verständlich. Fokus verbleibt nach Fehler beim Dialog/Formular beziehungsweise wandert zur fokussierbaren Fehlermeldung, ohne Kontextverlust. Dialog/Bestätigung ist vollständig per Tastatur bedienbar und besitzt sinnvolle Fokusführung. Rollenstatus wird nie nur durch Farbe vermittelt; Labels lauten „Administrator“ und „Reviewer“.

## 13. Revalidation

Nur nach bestätigtem `changed=true`: `revalidatePath('/admin/users')`. Keine Revalidation bei Verbot, Konflikt, letztem Admin, Self-Change, allgemeinem Fehler oder `no_change`. Keine Revalidation von Projekten, Kunden oder Medien. Kein Redirect; die Action-Rückgabe steuert die lokale Meldung.

## 14. Race-Condition- und Ergebnis-Matrix

| Fall | Erwartete Mutation / Code | Audit | Revalidation | UI-Meldung |
| --- | --- | --- | --- | --- |
| **A. Admin ändert Reviewer zu Admin** | Genau ein CAS-Update; `changed` | genau ein `user_role_changed` | ja | „Die Benutzerrolle wurde aktualisiert.“ |
| **B. Admin ändert anderen Admin zu Reviewer; weiterer Admin bleibt** | Genau ein CAS-Update; `changed` | genau ein Erfolgsereignis | ja | Erfolgsmeldung |
| **C. Letzter Admin soll Reviewer werden** | keine Mutation; `last_admin_protected` | keines | nein | „Der letzte Administrator kann nicht zum Reviewer herabgestuft werden.“ |
| **D. Eigene Rolle soll geändert werden** | keine Mutation; `self_role_change_blocked` | keines | nein | „Du kannst deine eigene Rolle nicht ändern.“ |
| **E. Rolle zwischen Laden und Absenden geändert** | keine Mutation; `user_role_conflict` | keines | nein | Konfliktmeldung mit Neuladeaufforderung |
| **F. Zwei Admins ändern denselben Benutzer parallel** | Advisory-/Zeilensperre serialisiert; erster valider Request `changed`, zweiter je nach Payload `user_role_conflict` oder bei bereits gleichem erwarteten/gewünschten Zustand `no_change` | nur für die eine echte Änderung | nur erster `changed` | Erfolg; danach Konflikt oder „bereits aktuell“ |
| **G. Zwei verbleibende Admins werden parallel herabgestuft** | global serialisiert; höchstens eine Herabstufung, andere `last_admin_protected` oder nach eigener zwischenzeitlicher Herabstufung `user_role_forbidden` | nur für echte Änderung | nur für echte Änderung | Erfolg; Schutz- oder allgemeine Forbidden-Meldung |
| **H. Zielprofil fehlt** | keine Mutation; `user_profile_missing` | keines | nein | „Für diesen Benutzer ist kein gültiges Profil vorhanden.“ |
| **I. Zielrolle ungültig** | Schema/Enum lehnt ab; `user_role_invalid` | keines | nein | allgemeine Fehlermeldung |
| **J. Actorrolle zwischen Seitenladen und RPC geändert** | RPC liest aktuell erneut; keine Mutation; `user_role_forbidden` | keines | nein | allgemeine Fehlermeldung ohne Rollen-/Providerdetails |
| **K. RPC direkt mit manipulierten IDs aufgerufen** | Actor bleibt `auth.uid()`; Self-ID wird blockiert, fremde/fehlende Ziele kontrolliert; ansonsten nur zulässiger Adminwechsel. Passender geschlossener Code | nur bei tatsächlich autorisierter echter Änderung | Action wird umgangen, daher keine App-Revalidation | direkter Caller erhält nur schmalen Status; normale UI mappt wie oben |

Bei F gilt: Haben beide Requests denselben `expected_current_role` und unterschiedliche Zielrollen, verliert einer CAS. Wenn der zweite nach der ersten Änderung exakt die nun aktuelle Rolle als Erwartung und Ziel enthält, ist er ein idempotentes `no_change`; ein stale identischer Request bleibt wegen abweichender Erwartungsrolle Konflikt. Keine Variante ist Last-Write-Wins.

## 15. Spätere Teststrategie (in diesem Audit nicht ausgeführt/implementiert)

### 15.1 Schema und Permission

- Gültige UUID und beide gültigen Rollen; ungültige UUID/Rollen, fehlende Felder und Zusatzfelder.
- Freie Patch-Payload, E-Mail und Actor-ID als Zusatzfeld werden strikt abgelehnt.
- `canChangeUserRole`: Admin wahr; Reviewer, nicht authentifiziert/null, fehlendes Profil und ungültige Rolle fail closed. Externe Rolle wird vor Permission validiert.

### 15.2 RPC/Migration

- Exakte Signatur/Enumtypen, `SECURITY DEFINER`, fester `search_path = public, pg_temp`, keine dynamische SQL.
- `auth.uid()`, vorhandenes Actorprofil, aktuelle Adminrolle, Self-Change-Verbot und manipulierte IDs.
- Zielzeilenlock, konsistente Advisory-Xact-Lock-Nutzung, atomarer letzter-Admin-Schutz einschließlich paralleler Transaktionen.
- `expected_current_role`, ausschließlich `role`-Update, idempotentes `no_change`, CAS-Konflikt.
- Auditinsert in derselben Transaktion; erzwungener Auditfehler rollt Rollenupdate zurück; keine sensiblen Metadaten.
- Geschlossene Allowlist/Statuscodes; `EXECUTE` nur `authenticated`, nicht `anon`/`PUBLIC`; interne Adminprüfung bleibt aktiv.
- Keine Tabellen-Granterweiterung, direkte Rollenupdates geschlossen, keine Service Role, keine Auth-Mutation.

### 15.3 Service und Action

- Authentifizierung, fehlendes/ungültiges Profil, Permission und exakte RPC-Argumente.
- Stabile Fehlercodes, keine Providerdetails, keine E-Mail, kein direktes Profilupdate und keine Auth-Admin-Nutzung.
- Action enthält keine Rollen-/Zähllogik; Revalidation nur bei `changed=true`, weder Redirect noch fremde Pfade.

### 15.4 UI und Architekturregression

- Aktion nur für gültiges Fremdprofil; eigener User, fehlendes Profil und ungültige Rolle nicht änderbar.
- Explizite Bestätigung, Warnung bei Admin-Herabstufung, Pending, `aria-busy`, disabled/`aria-disabled`, Doppelsubmit und Fokus.
- Erfolg, `no_change`, Konflikt, letzter Admin, Self-Change, neutraler Fehler; keine optimistische Rollenanzeige.
- Keine direkte Browserrollenmutation, Service Role, Auth-Mutation oder E-Mail im Wechsel; keine `package.json`-Änderung.

## 16. Kleinstes Implementierungspaket und Folgepakete

**Eindeutige Empfehlung: drei getrennte Gates; erst AP-14-02-01 nach Owner-Freigabe.** DB-Invariante und serverseitige Grenze müssen vor UI existieren. Production-/Parallelitätsvalidierung wird nicht mit UI-Fertigstellung gleichgesetzt.

1. **AP-14-02-01 — Role Change Database and Service Baseline:** additive Migration; enge RPC; Advisory-/Zeilensperren; letzter-Admin- und Self-Change-Schutz; CAS; Audit; `EXECUTE`; Schließen direkter Rollenmutation; striktes Schema; `canChangeUserRole`; Service und Server Action; Tests; **keine UI-Änderung**.
2. **AP-14-02-02 — Role Change UI:** Integration in `/admin/users`, Bestätigung, Pending, Accessibility, Meldungen und Revalidation; keine weitere DB-Änderung.
3. **AP-14-02-03 — Regression and Production Validation:** Migrations-/Grant-Inventar, reale Rollen- und Race-Gates, Auditnachweis und Regression; keine Einladung/Deaktivierung.

## 17. Production-Gates (keine Production-Ausführung in diesem Audit)

- [ ] Freigegebene Migration in Production ausgeführt; exakte RPC vorhanden.
- [ ] RPC ist `SECURITY DEFINER`, besitzt festen `public, pg_temp`-Search-Path und keine dynamische SQL.
- [ ] `EXECUTE` ausschließlich für `authenticated`; `anon` und `PUBLIC` ausgeschlossen; interne Adminprüfung bestätigt.
- [ ] Effektive Profil-RLS und Grants inventarisiert; direkte Rollenmutation für normale Browserpfade geschlossen; keine Tabellen-Granterweiterung.
- [ ] Hauptaccount bleibt Admin; kontrollierter zweiter Zielbenutzer vorhanden.
- [ ] Reviewer → Admin erfolgreich; Audit korrekt und ohne E-Mail/PII-Zusatzdaten.
- [ ] Admin → Reviewer nur bei mindestens zwei Admins erfolgreich.
- [ ] Letzter-Admin- und Self-Change-Test ohne Mutation erfolgreich.
- [ ] Zwei parallele Herabstufungen lassen mindestens einen Admin bestehen.
- [ ] Reviewer-Direktaufruf und manipulierte Actor-ID abgelehnt; Actor stammt aus `auth.uid()`.
- [ ] Audit-Fehler verhindert/rollt Rollenmutation zurück.
- [ ] Keine Supabase-Auth-Mutation und keine Service Role im Rollenwechselpfad.

## 18. Offene Owner-Entscheidung und nächster Schritt

Die Architektur ist klar und die bevorzugte Variante C wird empfohlen. Der Status ist **READY FOR OWNER DECISION**, ausdrücklich nicht „APPROVED FOR IMPLEMENTATION“ und nicht „Production Ready“.

Nächster Schritt erst nach Owner-Freigabe:

**AP-14-02-01 — Role Change Database and Service Baseline**

## 19. Scope-Bestätigung

Dieses Paket enthält ausschließlich Analyse und Dokumentation. Es enthält **keine Implementierung, keine UI-Änderung, keine Rollenänderung, keine Server Action, keinen Service, keine Migration, keine SQL-Änderung, keine RPC, keine RLS-Änderung, keine Grants, keine Auth-Mutation, keine Profilmutation, keine Tests oder Teständerungen, keine Service-Role-Änderung/-Nutzung, keine Environment-Variable, keine `package.json`-Änderung, keine Einladung und keine Deaktivierung**.

