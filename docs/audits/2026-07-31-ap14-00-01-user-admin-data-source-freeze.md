# AP-14-00-01 — User Administration Data Source and Security Freeze

**Decision-ID:** `KG-DECISION-2026-07-31-AP14-00-01-USER-ADMIN-DATA-SOURCE-V1`

**Grundlagen-Audit:** `KG-AUDIT-2026-07-31-AP14-00-USER-ROLE-ADMINISTRATION-V1`

**Datum:** 2026-07-31

**Branch:** `codex/ap14-00-01-user-admin-data-source-freeze`

**Art:** verbindliche Owner-Entscheidung und Security-Freeze; ausschließlich Dokumentation

## 1. Entscheidung und Status

**Verbindliche Datenquellenentscheidung: Variante C.** AP-14-01 darf eine paginierte Auth-Seite ausschließlich über einen neuen, fachlich engen, `server-only` Auth-Read-Adapter lesen. Die zu diesen Auth-IDs gehörenden Profile werden getrennt mit dem vorhandenen authentifizierten Supabase-Serverclient unter bestehender RLS geladen. Erst ein dedizierter Read-only-Service darf beide minimierten Ergebnisse kontrolliert zusammenführen.

**APPROVED FOR AP-14-01 IMPLEMENTATION**

- **USER ADMINISTRATION DATA SOURCE FROZEN**
- **AUTH EMAIL REMAINS CANONICAL**
- **SERVICE ROLE REMAINS SERVER ONLY**
- **READ-ONLY USER ADMINISTRATION NOT YET IMPLEMENTED**
- **ROLE MANAGEMENT NOT IMPLEMENTED**
- **REVIEWER INVITATION NOT IMPLEMENTED**
- **OVERALL PRODUCT NOT PRODUCTION READY**

Diese Freigabe gilt nur für den in Abschnitt 16 begrenzten Read-only-Scope. Sie ist keine Freigabe für Mutation, Einladung, Rollenänderung, Deaktivierung oder Production.

## 2. Baseline, Remote-Status und Prüfmethode

- Der Arbeitsbaum war vor Beginn sauber; `git status --short --branch` zeigte nur `## work`.
- Saubere lokale Baseline und Start-HEAD: `c60bd6f600496b5a364210c532ccf68274c8930e`.
- Vor Beginn war der lokale Branch `work`; der verlangte Decision-Branch wurde davon erstellt.
- `git remote -v` lieferte keine Ausgabe. Es ist kein Remote konfiguriert. Daher waren `git fetch origin`, `git rev-parse origin/main` und `git merge-base HEAD origin/main` nicht möglich. Der saubere lokale HEAD ist verbindliche Baseline dieses Pakets; ob er exakt einem extern aktuellen `main` entspricht, ist ohne Remote nicht verifizierbar.
- Das Grundlagen-Audit wurde vollständig gelesen und als verbindlich behandelt. Erneut geprüft wurden insbesondere das initiale Schema und sämtliche Migrationen, Rollen-Typen/-Schemas/-Permissions, App-Layout und Navigation, Auth-/Supabase-Server- und Browserclients, Storage-Purge-Client/-Adapter, Environment-Konventionen, `audit_log`, RLS/Grants sowie installierte Supabase-Pakete, Quellen und Typdefinitionen.
- Es wurden keine echten E-Mail-Adressen, Benutzer-IDs, Tokens, Secret-Werte oder personenbezogenen Production-Daten erhoben oder dokumentiert.
- Auftragsgemäß wurden keine Anwendungstests ausgeführt.

## 3. Bestätigte Ausgangslage

1. Supabase Auth ist und bleibt die einzige kanonische Quelle der Login-E-Mail.
2. `public.profiles` ist und bleibt die kanonische Quelle der Anwendungsrolle.
3. `public.profiles` enthält `id`, `display_name`, `role`, `created_at` und `updated_at`, aber keine E-Mail und keinen Aktiv-/Deaktivierungsstatus.
4. Für AP-14 wird keine E-Mail nach `public.profiles` gespiegelt.
5. Browser- und normale RLS-Abfragen dürfen `auth.users` nicht frei lesen.
6. Die spätere Liste ist ausschließlich für serverseitig bestätigte aktive Admins. Reviewer, Benutzer ohne Profil und Benutzer mit ungültiger Rolle dürfen weder Link noch Seite noch DTO erhalten.
7. `SUPABASE_SERVICE_ROLE_KEY` existiert als Repository-Konvention und wird bereits ausschließlich in einem `server-only` Storage-Remove-Client für den eng begrenzten Purge-Pfad gelesen. Die URL-Konvention ist `NEXT_PUBLIC_SUPABASE_URL`; der Secret-Name ist nicht public.
8. Der Storage-Purge-Client exponiert typseitig nur `storage.from(bucket).remove(paths)` und bleibt unverändert. Er wird kein Auth- oder generischer Adminclient.
9. Privilegiertes Auth-Lesen benötigt eine getrennte fachliche Adaptergrenze.
10. Benutzerliste, Rollenänderung und Einladung existieren noch nicht.

## 4. Verifiziertes Rollen-, Profil- und Datenbankmodell

- `public.profiles.id` ist UUID-Primärschlüssel und `references auth.users(id) on delete cascade`. Der kanonische Join ist damit exakt `auth.users.id = public.profiles.id` (1:0/1).
- `public.profiles.role` ist `app_role not null default 'reviewer'`; das PostgreSQL-Enum erlaubt exakt `admin` und `reviewer`.
- TypeScript definiert zentral `ROLES = ["admin", "reviewer"] as const`; `roleSchema = z.enum(ROLES)` validiert externe Rollenwerte. Keine freie Rollenzeichenkette ist zulässig.
- `current_app_role()` ist `stable security definer`, liest das Profil von `auth.uid()` und liefert bei fehlendem Profil `NULL`. Rollenabhängige Policies schließen dann fail closed.
- Die aktuelle Policy `profiles read own or admin` erlaubt das eigene Profil oder bei `current_app_role() = 'admin'` alle Profile. Die zusätzliche Policy `admins manage profiles` ist `FOR ALL` und umfasst ebenfalls SELECT.
- Damit kann ein authentifizierter Admin unter bestehender RLS alle für AP-14-01 benötigten Profile lesen. Für AP-14-01 ist keine RLS-Migration erforderlich.
- Die breite `FOR ALL`-Policy ist für spätere Rollenmutation ungeeignet, weil letzter Admin, Selbständerung, Konflikte und Audit fehlen. Sie ist vor AP-14-02 in einem eigenen Security-/Migrationspaket wirksam zu härten; diese bekannte Mutationslücke blockiert die reine AP-14-01-Leseimplementierung nicht.
- Explizite Tabellen-Grants oder -Revokes für `profiles` fehlen in den Migrationen. Die effektiven Zielumgebungs-Grants müssen vor Production inventarisiert werden. Die vorhandene RLS-Aussage basiert auf dem Repositoryschema und ersetzt diese Production-Prüfung nicht.
- `public.audit_log` hat RLS; `ALL` ist für `anon, authenticated` entzogen. Es enthält technische Actor-/Entity-IDs, Aktion, kontrollierbare JSON-Metadaten und Zeitstempel. AP-14-01 schreibt kein Audit. Spätere Events dürfen E-Mail nicht spiegeln, wenn eine technische Ziel-ID genügt.
- Das App-Layout lädt das eigene Profil mit dem normalen Serverclient, validiert `role` über `roleSchema` und übergibt andernfalls `null` an `Nav`. Aktuell gibt es nur die adminabhängige Navigation „Administration / Medien-Inventur“ und noch keine User-Administration-Permission.

## 5. Verbindliche Variantenbewertung

| Variante | Prüfung | Entscheidung |
| --- | --- | --- |
| **A — nur `public.profiles` unter RLS** | Kein privilegiertes Secret und vorhandener Admin-SELECT; aber keine E-Mail, Auth-Benutzer ohne Profil unsichtbar und deshalb fachlich unvollständige Adminsicht. | Abgelehnt für das beschlossene DTO. |
| **B — `SECURITY DEFINER`-RPC über `auth.users` und Profile** | Könnte DTO und Pagination DB-seitig begrenzen, benötigt aber Migration, bewusst privilegierten Zugriff auf das interne Auth-Schema, gehärteten Search Path/Grants und feste DTO-Signatur. Erhöhte Definer- und Auth-Schema-Kopplung; zusätzliche Wartungsgrenze. | Für AP-14-01 abgelehnt. Keine RPC/Migration erforderlich. |
| **C — enger server-only Auth-Read-Adapter + normale Profilquery + Service-Join** | Offizielle Admin-API liefert Auth-Identität/E-Mail paginiert; Profile bleiben unter normaler RLS; Adapter und DTO sind testbar; keine Migration/RPC. Risiken des Service-Role-Secrets und der breiten Auth-Antwort werden durch isolierte Capability und sofortiges Whitelisting begrenzt. Snapshots sind nicht atomar; Inkonsistenzen werden sichtbar statt repariert. | **Ausgewählt und eingefroren.** |
| **D — synchronisierte öffentliche Benutzertabelle** | Doppelte E-Mail-/PII-Haltung, Synchronisation, Trigger, Lösch-/Änderungsdrift, Migration und zusätzliche RLS-Komplexität ohne MVP-Notwendigkeit. | Abgelehnt. |

Variante C erfüllt das gewünschte Listenbild mit der kleinsten neuen privilegierten Capability. Sie bewahrt Auth als E-Mail-Wahrheit, Profile als Rollen-Wahrheit und normale Profil-RLS. Die spätere Einladung erhält ausdrücklich einen anderen Adapter; Variante C genehmigt keine Wiederverwendung als Mutationsclient.

## 6. Prüfung der installierten offiziellen Auth-Admin-API

### 6.1 Version und Aufruf

- `package.json` deklariert `@supabase/supabase-js` als `^2.45.4`; tatsächlich installiert sind `@supabase/supabase-js` **2.111.0** und `@supabase/auth-js` **2.111.0**.
- Die installierte Quelle dokumentiert `createClient(url, secretKey)` mit anschließendem `supabase.auth.admin.listUsers(...)` als serverseitigen Admin-Aufruf und warnt ausdrücklich vor einem Service-Role-Key im Browser.
- Der künftige Client muss `autoRefreshToken: false`, `persistSession: false` und `detectSessionInUrl: false` setzen, entsprechend der bereits verwendeten server-only Secret-Konvention.

### 6.2 Signatur, Pagination, Antwort und Fehler

- `listUsers(params?: PageParams)` unterstützt ausschließlich optionale numerische Parameter `page` und `perPage`. Intern werden sie als Queryparameter `page` und `per_page` versendet.
- Ohne Parameter nennt die installierte TSDoc 50 Benutzer als Default. AP-14-01 verlässt sich nicht auf diesen Default, sondern setzt validierte Werte explizit.
- Erfolg: `{ data: { users: User[], aud: string, nextPage, lastPage, total, ... }, error: null }`.
- Auth-Fehler: `{ data: { users: [] }, error: AuthError }`. Nicht als AuthError erkannte Ausnahmen können geworfen werden. Beides muss an der Adaptergrenze neutral auf einen geschlossenen Fachfehler gemappt werden.
- Die Clientimplementierung liest `x-total-count` und `link`-Header für Pagination. Diese Metadaten dürfen minimiert übernommen werden; `aud` wird nicht benötigt und nicht weitergegeben.
- Die Methode hat keinen Feldselektor. Der Provider liefert ein vollständiges `User`-Objekt. „Minimalfelder lesen“ bedeutet deshalb: nur `id`, `email` und `created_at` sofort an der server-only Adaptergrenze auswählen; rohe User-Objekte nie exportieren, serialisieren, cachen oder loggen.
- Die Methode akzeptiert in den installierten Typen keinen Sortierparameter. Eine providerübergreifend stabile globale Sortierung nach `created_at` kann deshalb durch den Client nicht angefordert werden. AP-14-01 darf die einzelne erhaltene Seite deterministisch nach `created_at DESC, id DESC` darstellen, darf daraus aber keine snapshotstabile globale Reihenfolge behaupten. Seitengrenzen können sich bei paralleler Auth-Anlage verschieben. Das ist für die kleine read-only MVP-Liste akzeptiert und muss transparent getestet werden; eine stärkere Cursor-/Sortiergarantie benötigt ein separates Folgeaudit statt einer Vermutung.

### 6.3 Verfügbare und freigegebene Felder/Zustände

Der installierte `User`-Typ enthält sicher `id: string` und `created_at: string`; `email?: string` und `last_sign_in_at?: string` sind optional. Außerdem typisiert er unter anderem `invited_at`, `confirmation_sent_at`, `confirmed_at`, `email_confirmed_at`, `deleted_at`, Metadaten, Identitäten, Telefon und Sperrinformationen.

Für AP-14-01 werden ausschließlich freigegeben:

- `id` → `user_id`;
- `email`, nach Validierung; fehlt sie, wird keine Ersatzidentität aus Metadaten/Identities/Telefon geraten und die Zeile erhält `auth_status: unknown`;
- `created_at`, nach Datumsvalidierung.

`last_sign_in_at` ist zwar installiert typisiert, aber optional und für das minimale fachliche Ziel nicht erforderlich. Es wird in AP-14-01 **nicht freigegeben**. Die vorhandenen optionalen Invitation-/Confirmation-Felder beweisen ohne verifizierte Providerzustandssemantik keine geschlossene, überschneidungsfreie Klassifikation. Daher gibt AP-14-01 weder `active`, `invited` noch `unconfirmed` als behaupteten Auth-Status aus. Der einzige zulässige Wert ist zunächst `unknown`. Gelöschte Benutzer können nicht verlässlich als Listenbestand garantiert werden; es wird weder ihre Sichtbarkeit noch ihr Zustand erfunden. Eine belastbare Statusklassifikation ist ein separates Folgepaket nach Prüfung der dann aktuellen offiziellen Providerdokumentation und realen Konfiguration.

## 7. Eingefrorene server-only Auth-Read-Adaptergrenze

Zielpfad: `lib/server/user-administration-auth-read-adapter.ts`.

Der spätere Adapter:

- beginnt mit `import "server-only"`;
- liest nur `NEXT_PUBLIC_SUPABASE_URL` gemäß bestehender URL-Konvention und `SUPABASE_SERVICE_ROLE_KEY`;
- besitzt keinen Anon-Key-Fallback und keine neue Environment-Variable;
- wird niemals aus Client Components, Browserclient, öffentlichen Barrels oder Clientnähe importiert;
- erstellt intern einen privilegierten Client mit deaktivierter Sessionpersistenz/-erneuerung/URL-Erkennung;
- exportiert weder diesen Client noch `SupabaseClient`, `.auth.admin`, freie Tabellenabfragen oder dynamische Adminmethoden;
- gibt Keyname/-wert, Authrohobjekte und Providerfehler weder aus noch loggt/serialisiert sie;
- exportiert für AP-14-01 ausschließlich sinngemäß `listAuthUsersForAdministration({ page, perPage })`;
- validiert `page` als Integer ≥ 1 und `perPage` als Integer 1–50, setzt Standard 25 und kappt nicht still, sondern lehnt ungültige Eingaben ab;
- mappt sofort auf minimierte Read-Zeilen und minimale Paginationmetadaten;
- bietet keine Auth-Mutation, Anlage, Einladung, Passwortänderung, Löschung, Bann-, Rollen-, Storage- oder Datenbankfunktion.

Die direkte Admin-API ist nur Implementierungsdetail dieses Adapters. Beliebige Aufrufer erhalten keine Admin-Capability. Autorisierung als aktiver Admin muss vor jedem Adapteraufruf serverseitig im dedizierten Service erfolgt sein; der Adapter ersetzt diese fachliche Prüfung nicht.

## 8. Profil-Datenquelle und RLS-Entscheidung

- Profile werden nach bestätigter serverseitiger Session und `canViewUserAdministration` über den vorhandenen authentifizierten `lib/supabase/server.ts`-Client gelesen.
- Der Service lädt für die aktuelle Auth-Seite exakt die passenden Profile anhand ihrer IDs; kein Service-Role-Profilzugriff und keine E-Mail-Erwartung aus `profiles`.
- Jede Rolle wird an der Trust Boundary mit `roleSchema`/zentraler Allowlist validiert. Ungültige Rollen sind fail closed, ergeben keine Permission und werden als `invalid_role` dargestellt.
- Die bestehende Admin-SELECT-RLS erlaubt alle Profile. **Profil-RLS genügt für die Auth-zentrierte AP-14-01-Liste.** Es ist weder eine Policy-Aufweichung noch eine Migration vor AP-14-01 nötig.
- Production Gate bleibt die Inventarisierung effektiver Grants. Sollte die Zielumgebung trotz Repository-RLS die Abfrage verhindern, stoppt AP-14-01 neutral. Das kleinste nachgelagerte Security-Paket wäre eine explizite, ausschließlich authentifizierten aktiven Admins gewährte SELECT-Policy/-Grant-Inventarisierung; nicht der Einsatz von Service Role für Profile.

## 9. Kontrollierte Zusammenführung und Inkonsistenzen

Der dedizierte Read-only-Service verbindet ausschließlich serverseitig über `auth.users.id = public.profiles.id`:

| Fall | Darstellung und Wirkung |
| --- | --- |
| A. Auth-Benutzer + gültiges Profil | `profile_status: active`; validierte Rolle `admin` oder `reviewer`. |
| B. Auth-Benutzer ohne Profil | `profile_status: missing`, `role: null`; sichtbar als „Profil fehlt“, aber kein Anwendungszugriff. |
| C. Profil ohne Auth-Benutzer | `profile_status: auth_user_missing`, `email: null`; fachlich inkonsistent, aber nicht Teil der Auth-zentrierten ersten Seite. |
| D. Profil mit ungültiger Rolle | `profile_status: invalid_role`, `role: null`; fail closed. |
| E. aktiver Admin | Nur gültiges Profil mit Rolle `admin`; darf nach separater Session-/Permissionprüfung die Liste sehen. |
| F. aktiver Reviewer | Gültiges Profil mit Rolle `reviewer`; darf Liste, Link und DTO nicht sehen. |

Es gibt keine automatische Reparatur, Profilanlage, Rollenvergabe oder Bereinigung. Auth und Postgres sind kein atomarer gemeinsamer Snapshot; bei zwischenzeitlichen Änderungen wird die Zeile als Inkonsistenz oder beim nächsten Refresh korrekt dargestellt.

AP-14-01 ist bewusst **Auth-Benutzer-zentriert**. Es lädt nur Profile für IDs der aktuellen Auth-Seite. Ein Profil ohne Auth-Benutzer außerhalb dieser Seite kann damit nicht vollständig erkannt werden. Wegen FK mit `ON DELETE CASCADE` ist dieser Fall im normalen Schema ohnehin nicht erwartbar, aber externe/defekte Zustände dürfen nicht als unmöglich behauptet werden. Eine vollständige bidirektionale Diagnose über alle Profile ist ein separates Diagnose-Folgepaket; AP-14-01 behauptet keine Vollständigkeit dafür.

## 10. Verbindliches schmales AP-14-01-DTO

```text
AdminUserDto = {
  user_id: UUID
  email: validierte E-Mail | null
  role: "admin" | "reviewer" | null
  profile_status: "active" | "missing" | "invalid_role" | "auth_user_missing"
  auth_status: "unknown"
  created_at: validierter ISO-Zeitstempel
  is_current_user: boolean
}
```

`auth_user_missing` ist für die gemeinsame fachliche DTO-Allowlist reserviert, wird aber in der Auth-zentrierten AP-14-01-Seite nicht erzeugt. `last_sign_in_at` gehört nicht zum freigegebenen AP-14-01-DTO. Falls eine Auth-Zeile keine validierbare E-Mail oder kein valides Erstelldatum enthält, darf der Service keine Ersatzdaten aus sensitiveren Feldern bilden; er behandelt das Ergebnis als Inkonsistenz beziehungsweise neutralen Ladefehler nach einem später festzulegenden strikten Schema.

Ausgeschlossen sind insbesondere Passwort-/Hashfelder, Confirmation-/Recovery-Tokens, Access-/Refresh-/Provider-Tokens, `raw_app_meta_data`, `raw_user_meta_data`, `app_metadata`, `user_metadata`, `identities`, Telefon, IP-Adressen, Auth-URLs, Invite-Links, Service-Role-Key, `aud`, rohe Auth-Antworten und alle vorsorglich durchgereichten internen Felder.

## 11. E-Mail-Datenschutz

- Die vollständige E-Mail ist für diese eng begrenzte Admin-Benutzerverwaltung fachlich erforderlich, um insbesondere den zweiten eigenen Reviewer-Account eindeutig zuzuordnen.
- Sie ist nur nach serverseitig bestätigter aktiver Adminrolle sichtbar. Reviewer und andere fail-closed-Fälle erhalten keine Liste und keine E-Mail.
- Sie wird nicht nach `public.profiles`, öffentliche Projekt-/Kunden-DTOs oder `audit_log` gespiegelt, sofern die technische Ziel-ID genügt.
- Sie wird nicht in URLs, Queryparameter, Clientlogs, Serverlogs oder Fehlerdetails aufgenommen.
- AP-14-01 enthält keine E-Mail-Suche oder -Filterung und keine clientseitige Gesamtliste.

## 12. Pagination

- Serverseitig, Standard **25** Benutzer pro Seite, hartes Maximum **50**.
- `page` ist validierter Integer ≥ 1; `perPage` ist validierter Integer 1–50. Keine freie oder still gekappte Eingabe über 50.
- `listUsers({ page, perPage })` wird immer explizit aufgerufen; keine unlimitierte Liste.
- Nur die empfangene Seite wird serverseitig zusammengeführt und deterministisch nach `created_at DESC, user_id DESC` präsentiert. Weil die installierte API keinen Sortierparameter hat, ist dies keine Garantie stabiler Auth-Seitenmitgliedschaft bei parallelen Anlagen.
- Profile werden per ID nur für diese Auth-Seite geladen. Paginationmetadaten stammen minimiert aus der Auth-Antwort; keine clientseitige Gesamtliste.
- Profile ohne Auth-Benutzer werden nicht in eine Auth-Seite hineingemischt und beeinflussen deren Pagination nicht. Ihre vollständige Diagnose folgt separat.
- Keine E-Mail-Suche im ersten Paket.

## 13. Eingefrorene Permissions

Spätere zentrale, getrennte Funktionen:

- `canViewUserAdministration`
- `canChangeUserRole`
- `canInviteReviewer`
- `canDeactivateUser`

| Zustand | Liste sehen | später Rolle ändern | später Reviewer einladen | deaktivieren |
| --- | ---: | ---: | ---: | ---: |
| gültiger aktiver `admin` | ja | ja, erst AP-14-02 | ja, erst AP-14-03 | nein, nicht AP-14-01 bis -03 |
| gültiger `reviewer` | nein | nein | nein | nein |
| ungültige Rolle | nein | nein | nein | nein |
| kein Profil | nein | nein | nein | nein |
| nicht authentifiziert | nein | nein | nein | nein |

„Aktiv“ bedeutet im heutigen Modell Auth-User plus gültiges Profil; ein eigenes Deaktivierungsfeld existiert noch nicht. Clientnavigation ist niemals Autorisierung. Route, Service und Datenzugriff prüfen unabhängig serverseitig.

## 14. Service-Role-Trennung und Konfigurationsfehler

### 14.1 Capability-Trennung

Der Storage-Purge-Client bleibt unverändert. Verboten sind seine Erweiterung um `auth.admin`, ein generisch exportierter Service-Role-/Adminclient, freie Service-Role-Tabellenabfragen, Clientimporte, dynamische Adminmethoden und Logs mit Auth-Daten oder Secret. Erlaubt sind nur derselbe bestehende Environment-Variablenname, ein neuer getrennter `server-only` Auth-Read-Adapter und dessen exakt begrenzte Read-Methode.

### 14.2 Fail-closed-Verhalten

| Fehler | Späteres Verhalten |
| --- | --- |
| `SUPABASE_SERVICE_ROLE_KEY` fehlt | Vor Auth-Aufruf kontrolliert abbrechen; kein Anon-Fallback. |
| Supabase-URL fehlt | Vor Clienterstellung kontrolliert abbrechen. |
| Secret ungültig | Auth-Providerfehler intern auf geschlossenen neutralen Fachfehler mappen. |
| Auth-Admin-API-/Netzwerkfehler | Keine Teilliste als vollständig ausgeben; neutral abbrechen. |
| Profilqueryfehler | Keine Rollen raten und keine Auth-only-Liste als erfolgreich ausgeben; neutral abbrechen. |
| inkonsistentes Resultat | Nur die definierten Statuswerte verwenden; keine Reparatur oder Defaultrolle. |

Einziger nutzerseitiger Allgemeintext: **„Die Benutzerverwaltung konnte nicht geladen werden.“** Keine Secret-/Konfigurationsdetails, Providertexte, Tokens oder Authrohantwort. Logging darf nur einen sanitisierten stabilen Fehlercode ohne E-Mail, Authrohfelder oder Secret enthalten; personenbezogene Daten werden nicht geloggt.

## 15. Finalisierte Owner-Entscheidungen

1. **Eigene Rolle ändern:** Nein. Ein Admin darf die eigene Rolle im MVP nicht verändern.
2. **Andere Benutzer zu Admin machen:** Ja, später ausschließlich über AP-14-02 mit atomarem Konflikt- und letztem-Admin-Schutz. Keine Implementierungsfreigabe hier.
3. **Admin-Einladung:** Nein, nicht im MVP-Invite-Paket.
4. **Reviewer-Einladung:** Ja, AP-14-03 lädt ausschließlich Reviewer ein.
5. **Zweiter eigener Account:** Zielbild ist Admin-Invite an die zweite eigene E-Mail mit festem Reviewerprofil; „Admin-Invite“ bezeichnet den durch einen Admin ausgelösten Flow, nicht die Zielrolle Admin.
6. **Self-Signup:** Kein primärer AP-14-MVP-Weg.
7. **E-Mail-Spiegelung:** Nein.
8. **Deaktivierung:** Nicht AP-14-01 bis AP-14-03; eigenes Audit erforderlich.
9. **Letzter Admin:** Atomarer Schutz ist für AP-14-02 zwingend.
10. **Preview-Einladungen:** Serverseitig deaktiviert, sofern keine vollständig getrennte Preview-Supabase-Umgebung existiert.
11. **Auth-Benutzer ohne Profil:** In AP-14-01 sichtbar als „Profil fehlt“, soweit durch die Auth-Seite gefunden; kein Zugriff.
12. **Profil ohne Auth-Benutzer:** Keine automatische Bereinigung und nicht zwingend Teil der ersten paginierten MVP-Liste; vollständige Diagnose ist ein Folgepunkt.

Keine bestehende Produktregel widerspricht dem Self-Role-Change-Verbot. Diese Entscheidungen ändern weder Daten noch Berechtigungen im Repository.

## 16. Kleinstes nächstes Implementierungspaket: AP-14-01

**AP-14-01 — Read-only User Administration**

- Admin-only Route `/admin/users` und Adminnavigation „Benutzer & Rollen“;
- serverseitige Authentifizierung, gültiges Profil und `canViewUserAdministration`;
- enger `server-only` Auth-Read-Adapter;
- begrenzte Auth-Benutzerseite, Standard 25, maximal 50;
- normale RLS-geschützte Profilabfrage für die Auth-Seiten-IDs;
- kontrollierter Join und schmales DTO;
- Anzeige von E-Mail, validierter Rolle, Profilstatus und Auth-Erstelldatum;
- kein letzter Login im ersten Paket;
- deutschsprachiger Empty State und neutrale Fehler;
- keine Mutation, Rollenänderung, Einladung oder Deaktivierung;
- keine Migration und keine RPC, weil bestehende Profil-RLS für diesen authzentrierten Read-Scope genügt.

Die breite bestehende Profil-Mutationspolicy wird in AP-14-01 nicht benutzt und nicht geändert. AP-14-02 muss sie vor Rollenänderung separat härten.

## 17. Grenzen AP-14-02 und AP-14-03

### AP-14-02 — Controlled Role Change

- separates Audit beziehungsweise das vorhandene Audit als verbindliche Grundlage;
- eigener Rollenwechsel-Service und striktes Schema;
- atomare, eng signierte RPC mit Compare-and-set/Lock;
- letzte-Admin-Invariante und atomarer Konfliktschutz;
- keine Selbständerung;
- Audit Logging ohne E-Mail, wenn Ziel-ID genügt;
- bestehende direkte Profilrollenmutation schließen;
- keine Auth-Admin-Mutation.

### AP-14-03 — Reviewer Invitation

- eigener, getrennter `server-only` Auth-Invite-Adapter; kein Ausbau des Read-Adapters;
- Zielrolle serverseitig fest `reviewer`, keine Admin-Einladung;
- Redirect-URL ausschließlich serverseitig aus einer Allowlist;
- keine Token-, Link- oder Authrohobjekt-Rückgabe;
- sichere, separat entschiedene Profilanlage/Konsistenzstrategie;
- eigener Production-Smoke-Test mit zweiter eigener E-Mail, Passwort-/Bestätigungsflow und getrennten Browserkontexten.

## 18. Verbindlich geplante Tests für AP-14-01

Keine dieser Prüfungen wird in diesem Decision-Paket implementiert oder ausgeführt.

### Permissions

- Admin erlaubt; Reviewer und nicht Authentifizierte abgelehnt.
- Fehlendes Profil und ungültige Rolle abgelehnt.

### Auth-Adapter

- `server-only`; nur URL und Service-Role-Konfiguration; kein Clientimport.
- Page validiert, Standard 25, maximal 50.
- Keine Auth-Mutation und kein generischer Clientexport.
- Ergebnis enthält keine Tokens, Metadaten, Identities, Telefon oder rohe Antwort.
- Fehlende Konfiguration, AuthError und geworfener Providerfehler werden neutral.

### Profilabfrage

- Vollständiges Admin-SELECT unter RLS; Reviewer abgelehnt.
- Rollenvalidierung, fehlendes Profil, ungültige Rolle; kein E-Mail-Feld erwartet.

### Zusammenführung/DTO

- Auth + gültiges Profil; Auth ohne Profil; ungültige Rolle; aktueller Benutzer.
- Schmales exaktes DTO, `auth_status: unknown`, kein `last_sign_in_at`, keine vertraulichen Felder.
- Deterministische Sortierung innerhalb der Seite und dokumentiertes Snapshotverhalten.

### UI

- Adminnavigation, Tabelle, Pagination, Empty State, Fehlerzustand.
- Keine Rollenaktion, Einladung oder Deaktivierung.
- Reviewer sieht Link nicht und wird bei direkter URL serverseitig abgelehnt.

### Architektur

- Kein Service-Role-Key/Keyname im Clientbundle; kein `NEXT_PUBLIC_SERVICE_ROLE`.
- Storage-Purge-Client unverändert; kein generischer Adminclient.
- Keine Clientquery auf `auth.users`, E-Mail-Spiegelung, Migration/RPC oder `package.json`-Änderung.

## 19. Production-Gates

### AP-14-01

- `SUPABASE_SERVICE_ROLE_KEY` ist als sensibles Production-Secret sicher vorhanden; effektive Grants sind inventarisiert.
- Auth-Read-Adapter ausschließlich `server-only`; kein Clientbundle-Treffer und kein Clientimport.
- Admin kann die Liste öffnen; Reviewer erhält keinen Link und direkte Reviewer-URL wird serverseitig abgelehnt.
- E-Mail nur für Admin; Standard 25, maximal 50; keine unlimitierte/clientseitige Gesamtliste.
- Keine Mutation; keine Secrets, Tokens, Metadaten oder Authrohantworten im Netzwerk-DTO/Log.
- Neutrale Fehler geprüft; Hauptaccount bleibt Admin.

### Zusätzlich erst für AP-14-03

- vollständig getrennte Preview-Umgebung oder Preview-Invite serverseitig aus;
- zweite eigene E-Mail, kontrollierte Einladung und verifizierter Passwort-/Bestätigungsflow;
- gültiges Reviewerprofil;
- paralleler Login in Inkognito oder zweitem Browser;
- Hauptaccount weiterhin Admin.

## 20. Scope-Bestätigung

Dieses Paket ist **ausschließlich Entscheidung und Dokumentation**. Es enthält ausdrücklich:

- keine Implementierung;
- keine UI-Änderung, Navigation oder Komponenten;
- keine Server Action, keinen Service und keinen Adapter;
- keine Migration, SQL-Änderung, RPC, RLS-Änderung oder Grants;
- keine Benutzerliste;
- keine Supabase-Auth-Mutation, Benutzeranlage oder Einladung;
- keine Rollenänderung oder Deaktivierung;
- keine Tests, Teständerungen oder ausgeführten Anwendungstests;
- keine Environment-Variable oder Secret-Änderung;
- keine `package.json`-Änderung.

Geändert wird ausschließlich `docs/audits/2026-07-31-ap14-00-01-user-admin-data-source-freeze.md`.
