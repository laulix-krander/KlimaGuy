# AP-14-00 — User and Role Administration Architecture Audit

**Audit-ID:** `KG-AUDIT-2026-07-31-AP14-00-USER-ROLE-ADMINISTRATION-V1`  
**Datum:** 2026-07-31  
**Branch:** `codex/audit-ap14-00-user-role-administration`  
**Art:** ausschließlich Architektur-, Security- und UX-Analyse; keine Implementierung  
**Auditstatus:** **READY FOR OWNER DECISION**

## 1. Executive Summary

KlimaGuy authentifiziert heute interne Benutzer per Supabase Auth mit E-Mail und Passwort. Es gibt Login, Logout, cookiegebundene Sessionauflösung und Session-Refresh durch Middleware, aber weder Self-Signup noch Auth-Callback, Einladung, Benutzeranlage oder Benutzerverwaltung. Die Anwendungstabelle `public.profiles` ist über ihren UUID-Primärschlüssel direkt mit `auth.users(id)` verbunden. Sie enthält nur `display_name`, die Enum-Rolle `admin | reviewer` sowie Zeitstempel; insbesondere enthält sie **keine E-Mail und keinen Aktiv-, Sperr- oder Soft-Delete-Status**. Eine Profilanlage bei Auth-Signup ist nicht implementiert.

Die vorhandene Profil-RLS lässt einen Admin alle Profile lesen und mit einer breiten `FOR ALL`-Policy auch direkt ändern. Damit wäre eine reine Profilliste technisch lesbar, aber ohne E-Mail und ohne belastbaren Profilstatus fachlich unzureichend. Außerdem schützt die heutige direkte Profilmutation weder den letzten Admin noch Selbstsperrung oder konkurrierende Rollenwechsel und erzeugt kein Rollen-Audit. Sie ist deshalb **keine geeignete Mutationsarchitektur** für AP-14.

Empfohlen wird als kleinstes nächstes Paket **AP-14-01 Read-only User Administration**, jedoch erst nach einem kurzen **Decision Freeze zur Datenquelle**. Die fachlich vollständigere Standardempfehlung ist eine ausschließlich serverseitige, eng begrenzte Auth-Admin-Read-Grenze, welche eine paginierte Auth-Seite mit den passenden Profilen abgleicht und nur ein minimiertes DTO ausgibt. Sie darf keinen generischen privilegierten Client exportieren. Falls der Owner für AP-14-01 bewusst nur Profile ohne E-Mail und ohne verlässlichen Einladungsstatus akzeptiert, wäre eine normale Admin-RLS-Abfrage die noch kleinere Alternative; sie erfüllt das gewünschte Zielbild „E-Mail, Rolle, Status“ jedoch nicht.

Für spätere Rollenwechsel wird eine strikte Server Action mit fachlichem Service und einer atomaren, eng signierten `SECURITY DEFINER`-RPC empfohlen. Diese muss Authentifizierung und aktive Adminrolle erneut prüfen, Compare-and-set anwenden, Rollen-Allowlist erzwingen, eine globale Transaktions-/Advisory-Sperre für adminreduzierende Operationen verwenden, den letzten aktiven Admin schützen und das Audit in derselben Transaktion schreiben. Eine Clientzählung oder direkte Tabellenmutation reicht nicht.

Für den zweiten Reviewer-Account ist nach AP-14-01 und AP-14-02 ein Admin-Invite mit fest vorgegebener Rolle `reviewer` das beste Produktziel. `inviteUserByEmail` passt besser als `createUser`, weil der Empfänger über den E-Mail-Link Identität und Passwortfluss selbst abschließt. Das ist ausdrücklich **nicht** Teil dieses Audits und benötigt einen isolierten server-only Auth-Adapter, fest serverseitig bestimmte Redirect-URLs und Production Gates. Bis AP-14-03 umgesetzt und freigegeben ist, bleibt das Supabase Dashboard der kleinste manuelle Übergangsweg; Self-Signup existiert nicht.

## 2. Baseline, Remote-Status und Prüfmethode

- Vor Beginn war der Arbeitsbaum sauber: `git status --short --branch` zeigte nur `## work`.
- Lokale Baseline/Start-HEAD: `99f02a192de40c772825a5646d37c80ab6446d0c`.
- Vor Beginn war der lokale Branch `work`; für das Audit wurde der verlangte Branch angelegt.
- `git remote -v` lieferte keine Ausgabe. Es ist kein Remote konfiguriert; deshalb waren `git fetch origin`, `git rev-parse origin/main` und `git merge-base HEAD origin/main` nicht möglich. Der saubere lokale HEAD ist die Baseline. Ob er exakt dem extern aktuellen `main` entspricht, kann ohne Remote nicht verifiziert werden.
- Vollständig gelesen wurden die vier verbindlichen Audits zu AP-12 Core, Adminnavigation, AP-13 Gallery und Gallery-Produktionsvalidierung. Zusätzlich wurden die vorhandenen Audits, Architektur-/Security-/Datenmodelldokumente, sämtliche Migrationen sowie relevante Auth-, Supabase-, Rollen-, Admin-, Service- und Testdateien repositoryweit durchsucht und die einschlägigen Inhalte geprüft.
- Installierte Laufzeit statt nur Semver-Range geprüft: `@supabase/supabase-js` **2.111.0** und `@supabase/auth-js` **2.111.0**; `package.json` deklariert `@supabase/supabase-js` mit `^2.45.4` und `@supabase/ssr` mit `^0.6.1`.
- Die installierten Auth-Typen und Implementierung enthalten `supabase.auth.admin.inviteUserByEmail(email, options)` und `supabase.auth.admin.createUser(attributes)`. Die installierte Dokumentation im Quellcode stellt klar: Invite ist ein Admin-Einladungsflow, unterstützt dort kein PKCE; `createUser` sendet keine Bestätigungs-E-Mail, während Invite für eine E-Mail-Einladung vorgesehen ist.
- Der Abruf offizieller Supabase-Onlinedokumentation wurde versucht, war in dieser Umgebung jedoch mit HTTP 401 nicht erreichbar. Aussagen zur konkreten installierten API stützen sich daher auf Package-Code/-Typen; Redirect-, SMTP-, Site-URL- und Deploymentverhalten müssen vor AP-14-03 nochmals gegen die dann aktuelle offizielle Dokumentation und reale Supabase-Konfiguration validiert werden.
- Es wurden auftragsgemäß **keine Anwendungstests** ausgeführt.

## 3. Verbindliche Statusübernahme

- **AP-13 GALLERY AND MEDIA VIEWING FUNCTIONAL**
- **USER ADMINISTRATION NOT IMPLEMENTED**
- **ROLE MANAGEMENT NOT IMPLEMENTED**
- **REVIEWER INVITATION NOT IMPLEMENTED**
- **OVERALL PRODUCT NOT PRODUCTION READY**

Die Gallery-Produktionsvalidierung belegt Medienanzeige für den dabei tatsächlich verwendeten Zugang, aber noch keinen realen, getrennten Reviewer-Account. Dieses Audit hebt keine früheren Production Gates auf.

## 4. Begriffe und getrennte Zustände

| Begriff | Bedeutung im Zielbild | Heutiger Nachweis |
| --- | --- | --- |
| **A. Supabase-Auth-Benutzer** | Datensatz in `auth.users`; trägt Auth-Identität, E-Mail und Providerzustand. | Existiert außerhalb des öffentlichen Schemas; die App liest aktuell nur den eigenen User über `auth.getUser()`. |
| **B. Anwendungsprofil** | Datensatz in `public.profiles`; fachliche Zugriffszuordnung. | Muss dieselbe UUID wie `auth.users.id` haben. Kann heute fehlen. |
| **C. Rolle** | Fachlicher Wert exakt `admin` oder `reviewer`. | TypeScript-Tupel, Zod-Enum und PostgreSQL-Enum stimmen überein. |
| **D. Eingeladener Benutzer** | Auth-Einladung/Auth-Datensatz, möglicherweise noch ohne aktive Session oder vollständiges Profil. | Kein App-Flow und kein modellierter Einladungsstatus vorhanden. |
| **E. Deaktiviertes Profil** | Fachlich gesperrter App-Zugriff, Auth-Benutzer bleibt grundsätzlich bestehen. | Nicht modellierbar: kein `active`, `disabled_at` oder `deleted_at` in `profiles`. |
| **F. Gelöschter Benutzer** | Physische/administrative Entfernung aus Supabase Auth. | Kein App-Flow. Wegen `profiles.id ... on delete cascade` würde das Profil mitgelöscht; andere Auth-FKs können eine Löschung dagegen blockieren/restringieren. |

Ein fehlendes Profil ist weder „eingeladen“ noch „deaktiviert“. Ein fehlender Auth-Benutzer ist nicht dasselbe wie ein deaktiviertes Profil. Die spätere UI und DTOs dürfen diese Zustände nicht synthetisch vermischen.

## 5. Aktuelle Authentifizierungs- und Sessionarchitektur

### 5.1 Vorhandene Flows

1. `/login` zeigt ein internes E-Mail-/Passwortformular und bezeichnet den Zugang ausdrücklich als ohne öffentliche Registrierung.
2. Die Server Action liest `email` und `password` aus `FormData` und ruft `signInWithPassword` auf. Fehler werden nur als `?error=1` weitergeleitet; die Seite wertet den Parameter derzeit nicht sichtbar aus.
3. Der Serverclient aus `lib/supabase/server.ts` verwendet URL und Anon-Key sowie Next-Cookies. Sessioncookies werden, soweit im Renderkontext möglich, geschrieben.
4. Die Middleware baut ebenfalls einen SSR-Serverclient, ruft `auth.getUser()` auf und überträgt aktualisierte Cookies in Request und Response.
5. Die Middleware schützt `/dashboard`, `/customers` und `/projects` nur auf Auth-Ebene. `/admin` ist weiterhin nicht Teil ihrer `protectedPath`-Liste. Fachservices der vorhandenen Medien-Inventur prüfen Auth, Profil, validierte Rolle und Permission selbst; das muss für Benutzeradministration ebenso gelten.
6. POST `/auth/logout` ruft `auth.signOut()` auf und leitet zu `/login`.

Nicht vorhanden sind: `signUp`, Magic Link/OTP, OAuth, Passwort-Recovery-UI, Auth-Callback-Route, Signup-Callback, Invite-Annahme-Route, Admin-Auth-Aufruf, Benutzeranlage, Einladung, Resend und Session-Revoke. Eine Site-URL oder Auth-Redirect-URL wird im Repository nicht konfiguriert; diese liegt gegebenenfalls extern im Supabase-Projekt/Deployment.

### 5.2 Fail-closed-Verhalten und Lücken

- Das `(app)`-Layout lädt bei vorhandenem Auth-User `profiles.role`, validiert mit `roleSchema` und gibt sonst `null` an `Nav`. Fehlendes Profil oder ungültige Rolle blendet damit die Adminnavigation aus.
- Das Layout selbst redirectet bei fehlendem/ungültigem Profil nicht und rendert allgemeine Links sowie Children weiter. Die Middleware prüft nur Auth, nicht Profil oder Rolle. Der eigentliche Schutz hängt daher pro Daten-/Mutationspfad von RLS und Service-Autorisierung ab.
- `current_app_role()` liefert bei fehlendem Profil keine Zeile/`NULL`; Vergleiche in RLS werden nicht wahr: fachliche DB-Zugriffe schließen dann grundsätzlich. Eine ungültige DB-Rolle kann wegen des PostgreSQL-Enums nicht normal gespeichert werden. Falls inkonsistente externe Daten die TypeScript-Grenze erreichen, lehnt Zod sie ab.
- Ein authentifizierter User ohne Profil kann heute die Shell und allgemeine URLs erreichen, erhält aber über rollenbasierte RLS/Services keinen fachlichen Zugriff. Das ist „Daten fail closed“, jedoch keine gute Accountstatus-UX.

## 6. Exaktes aktuelles Profil- und Rollenmodell

### 6.1 `public.profiles`

| Aspekt | Tatsächlicher Stand |
| --- | --- |
| Tabellenname | `public.profiles` (SQL unqualifiziert angelegt, im `public`-Schema) |
| Primary Key | `id uuid primary key` |
| Auth-Verbindung | `id references auth.users(id) on delete cascade`; 1:0/1-Verknüpfung über identische UUID |
| Felder | `id`, `display_name text`, `role app_role not null default 'reviewer'`, `created_at`, `updated_at` |
| Rollenconstraint | PostgreSQL-Enum `app_role` mit exakt `'admin','reviewer'`; kein separater CHECK nötig |
| E-Mail | Nicht vorhanden |
| Aktiv/Soft Delete | Kein `active`, `disabled_at`, `deleted_at` oder vergleichbares Feld |
| Zeitstempel | `created_at timestamptz not null default now()`, `updated_at timestamptz not null default now()` |
| Trigger | `profiles_updated before update`, ruft `set_updated_at()` auf |
| Indizes | Nur der implizite eindeutige Primary-Key-Index; kein Rollen-, Aktivitäts- oder Sortierindex |
| Signup-Anlage | Kein Trigger auf `auth.users`, keine Action, kein Callback und keine andere automatische Profilanlage |
| Explizite Grants | Keine `GRANT`-Anweisung für `profiles` in den Migrationen; ebenso kein explizites Tabellen-`REVOKE`. Die effektiven Plattform-/Schema-Defaults sind aus dem Repository allein nicht beweisbar und müssen in der Zielumgebung inventarisiert werden. RLS bleibt aktiviert. |

### 6.2 RLS und Funktionsauflösung

- RLS ist aktiviert.
- Policy `profiles read own or admin`: SELECT, wenn `id = auth.uid()` oder `current_app_role() = 'admin'`.
- Policy `admins manage profiles`: `FOR ALL`, sowohl `USING` als auch `WITH CHECK` nur mit aktueller Adminrolle. Da `FOR ALL` auch SELECT umfasst, kann ein Admin alle Profilzeilen lesen.
- `current_app_role()` ist eine stabile SQL-`SECURITY DEFINER`-Funktion und liest die Rolle des Profils mit `id = auth.uid()`. Sie hat `search_path = public`, nicht den in neueren Migrationen verwendeten zusätzlich gehärteten `public, pg_temp`-Pfad. Ihre Execute-Grants werden in der initialen Migration nicht explizit eingeschränkt.
- Fehlendes Profil ergibt `NULL` und schließt rollenabhängige Policies. Es gibt kein Konzept „gelöschtes Profil“, weil das Feld fehlt. Physisches Löschen des Profils bewirkt daher denselben Fail-closed-Zustand wie nie angelegt.
- Die breite Admin-Policy erlaubt nach tatsächlichem Repositorystand direkte Browserupdates auf Profilfelder, einschließlich `role`, sofern die zugrunde liegenden Tabellenprivilegien in der Zielumgebung dies zulassen. Es gibt keinen Trigger/RPC-Schutz für letzten Admin, Selbständerung oder Audit. Diese Altgrenze muss vor Rollenmutation gehärtet werden.

### 6.3 Zentrale Rollenquellen

- `ROLES = ["admin", "reviewer"] as const` in `lib/domain/types.ts` ist die zentrale TypeScript-Allowlist und erzeugt `Role`.
- `roleSchema = z.enum(ROLES)` validiert externe Rollenwerte.
- `ROLE_LABELS`/`roleToLabel` mappt auf „Administrator“/„Prüfer“.
- Das Datenbank-Enum `app_role` enthält exakt dieselben Werte und ist DB-Quelle der Zulässigkeit.
- Permission-Utilities prüfen explizit Rollen. Admin-only sind unter anderem Kunden-/Projektkernmutationen, Human Review, Summary, Upload, Medien-Inventur/Claim/Purge; Admin und Reviewer dürfen Projektstatus/-klasse, Medienansicht und Notizen gemäß Ownership-Regeln.
- Navigation validiert die Profilrolle serverseitig im App-Layout und zeigt „Administration / Medien-Inventur“ nur über `canViewProjectMediaOrphanInventory(admin)`.
- Services laden üblicherweise den eigenen Profilwert, validieren ihn und prüfen die passende Permission. RLS verwendet `current_app_role()`.

Verbindliche Zielprinzipien: keine freie Rollenzeichenkette, keine Rollenentscheidung des Clients, keine Mass-Assignment-Payload, keine Rolle außerhalb der zentralen Allowlist und **kein direkter Browserupdate auf `profiles.role`**.

## 7. Ist-Berechtigungsgrenzen und Benutzerverwaltung

- Eine Benutzerverwaltungsroute, -navigation, -liste, -Action oder ein Service existiert nicht.
- Die einzige Adminnavigation ist „Administration“ mit „Medien-Inventur“ auf `/admin/project-media/orphans`.
- Reviewer sehen diese Gruppe nicht. Ungültige/fehlende Rolle sieht sie ebenfalls nicht.
- Reviewer dürfen fachlich Projektansichten, Gallery/Bilder/PDFs sowie begrenzte Reviewfelder und eigene Notizen nutzen; sie dürfen keine Admin-Medienoperationen oder Admin-Kernmutationen.
- Es existiert keine zentrale Permission für Benutzeradministration.
- Es existiert kein Signup-/Invite-/Create-Flow. Profile werden manuell außerhalb der Anwendung angelegt; der Seed enthält nur einen Kommentar. Folglich ist heute Dashboard/SQL-Administration nötig, um einen Auth-User samt Profil einzurichten oder Rollen kontrolliert zu ändern. Die App bietet keine Rollenänderung.
- Wegen der breiten bestehenden Profil-RLS könnte ein Admin technisch über einen selbst geschriebenen Browserquery fremde Rollen ändern; ein Benutzer kann als `reviewer` seine Rolle nicht selbst ändern, ein Admin kann seine eigene Rolle aber grundsätzlich direkt ändern. Das ist eine Sicherheitslücke für die geplante Verwaltung, nicht ein unterstützter Produktflow.

### Empfohlene neue Permissions (nur Planung)

Vier getrennte fachliche Permissions sind einer allgemeinen Permission vorzuziehen:

- `canViewUserAdministration`
- `canChangeUserRole`
- `canInviteReviewer`
- `canDeactivateUser` (erst nach AP-14-04)

Sie dürfen heute alle nur aktiven Admins erlauben, bleiben aber getrennt, weil Read, DB-Rollenmutation, privilegierte Auth-Mutation und Deaktivierung unterschiedliche Risiken und Release Gates haben. Die Navigationsgruppe wird aus sichtbaren autorisierten Kindzielen abgeleitet. Clientsichtbarkeit ersetzt nie Route-/Service-/RPC-Autorisierung. Nicht authentifiziert, fehlendes Profil, ungültige Rolle und künftig inaktives Profil müssen fail closed sein.

## 8. Read-only Benutzerliste und E-Mail-Datenquelle

### 8.1 Variantenbewertung

| Variante | Vorteile | Grenzen/Risiken | Urteil |
| --- | --- | --- | --- |
| **A. Direkte Admin-RLS-Abfrage `profiles`** | Kein Service Role; vorhandene Admin-SELECT-Policy; einfach, testbar, paginierbar. | Keine E-Mail, kein Aktiv-/Invite-/Last-Login-Status; Auth-only User unsichtbar; derzeit kein zusätzlicher Status. | Sicherste Minimaltechnik, aber erfüllt das gewünschte DTO nicht. Nur bewusst reduzierter AP-14-01-Scope. |
| **B. Enge SECURITY-DEFINER-RPC mit Join `profiles` ↔ `auth.users`** | DB-seitig paginierbar, konsistent joinbar, minimales Resultset, kein Service-Role-Key im Appprozess. | Definer braucht bewusst abgesicherten Zugriff auf Authschema; besonders sensible DB-Grenze, feste Search-Path/Grants/DTO nötig; Auth-Statussemantik bleibt sorgfältig zu definieren. | Least-privilege-fähig, aber neue DB-Architektur/Migration; für reine Liste möglich, nicht automatisch beste Gesamtgrenze für spätere Invites. |
| **C. Server-only Auth-Admin-Adapter plus Profilabgleich** | Kann Auth-E-Mail und sichere Authzustände lesen; gleiche fachliche Grenze kann später Invite unterstützen; rohe Authdaten bleiben serverseitig. | Service Role umgeht RLS; Auth-List-Pagination und Profilabgleich müssen korrekt sein; Risiko eines generischen Adminclients; DB- und Auth-Snapshot nicht atomar. | **Empfohlene vollständige Variante**, nur mit engem Read-Adapter und separater normaler Profilquery; Decision Freeze/Gates vor Umsetzung. |
| **D. Synchronisierte Admin-User-View/Spiegelung** | Schnelle einfache Query, DB-Pagination. | Doppelte E-Mail, Sync-/Änderungs-/Löschprobleme, zusätzliche PII und Migration; View kann RLS/Definer-Semantik überraschend machen. | Für MVP ablehnen. Kein Spiegeln ohne eigenen Bedarf/Sync-Design. |

### 8.2 E-Mail-Befund und Empfehlung

Es gilt **Variante B der E-Mail-Ausgangslage**: Die Login-E-Mail stammt aus Supabase Auth; `public.profiles` speichert keine E-Mail. Kunden-E-Mails in `customers.email` sind fachlich fremde Daten und dürfen niemals zur Benutzeridentität umgedeutet werden.

Eine E-Mail-Spiegelung in `profiles` wird für AP-14 nicht empfohlen: Sie erhöht PII-Reichweite, benötigt Synchronisation bei E-Mail-Änderung, kann veralten und verdoppelt RLS-/Löschpflichten. Die Auth-Quelle bleibt kanonisch. Ein Admin-Read-DTO darf genau die normalisierte Auth-E-Mail liefern, keine Metadaten/Identitäten. Änderungen an der Auth-E-Mail müssen bei jedem neuen Listenabruf sichtbar werden; es gibt keinen Cache als Wahrheit.

### 8.3 Eindeutige Read-Empfehlung

Für das vollständige Produktziel: **Variante C**, aber zweigeteilt und eng:

1. Ein serverseitiger Orchestrierungsservice authentifiziert mit dem normalen cookiegebundenen Client, lädt und validiert das aktive Adminprofil und prüft `canViewUserAdministration`.
2. Ein separater `server-only` Auth-Read-Adapter exportiert höchstens eine Funktion wie „liste minimierte Auth-Benutzerseite“ mit harter Seitengröße ≤ 50. Er gibt intern nur ID, E-Mail, Auth-Erstellzeit und eng definierte, tatsächlich verifizierbare Einladungs-/Loginindikatoren zurück.
3. Profile werden mit dem normalen Admin-RLS-Client für genau diese IDs gelesen und serverseitig abgeglichen. Keine direkte Clientquery auf `auth.users`.
4. Der Service mappt ein schmales DTO; Auth-only User werden mit `profile_status: "missing"` sichtbar, nicht als Reviewer erfunden. Profil-only ohne Auth kann bei seitenweiser Auth-Primärliste nicht vollständig erkannt werden und braucht später einen gesonderten Konsistenzcheck.

Vor AP-14-01 muss der Owner festlegen, ob E-Mail/Auth-only-Sichtbarkeit zwingend ist. Ist sie zwingend, ist ein kurzer Decision Freeze für diese privilegierte Grenze erforderlich; AP-14-01 ist nicht automatisch „approved“. Ist eine reduzierte Liste ohne E-Mail akzeptiert, kann A service-role-frei beginnen.

## 9. Schlankes Admin-User-DTO und Pagination

Empfohlenes öffentliches Server→UI-DTO:

```text
user_id: UUID                // intern für Aktionen/Keys, nicht prominent darstellen
email: string | null         // nur aus Auth; null bei bewusstem Profil-only-Fall
role: "admin" | "reviewer" | null
profile_status: "active" | "missing" | "inconsistent"
created_at: ISO timestamp    // Semantik festlegen: bevorzugt Auth-created_at
updated_at: ISO timestamp | null // Profilstand für CAS
invitation_status?: "pending" | "accepted" // nur wenn offiziell belastbar abgeleitet
is_current_user: boolean
```

`active` darf beim heutigen Modell nur „Profil vorhanden und Rolle gültig“ bedeuten, **nicht** „nicht deaktiviert“, weil kein Deaktivierungsfeld existiert. Last Login bleibt zunächst weg; nur bei nachgewiesener Verfügbarkeit und fachlicher Freigabe ergänzen. Invitation Status bleibt weg, bis Auth-Semantik und API belastbar validiert sind.

Ausgeschlossen: Passwort-/`encrypted_password`, Confirmation-/Recovery-/Invite-Token oder -Link, Access-/Refresh-Token, rohe App-/User-Metadaten, Identities, Phone, Providerdetails, IP, rohe Authantwort, Service-Role-Key.

Pagination: serverseitig maximal 50 pro Seite; Seitengröße serverseitig clampen, nicht clientseitig vertrauen; keine unlimitierte Authliste. Stabil nach `created_at DESC, user_id DESC` darstellen. Da Auth Admin `listUsers` typischerweise Seitenparameter liefert, muss vor Implementierung geprüft werden, ob die installierte API die gewünschte stabile Sortierung garantiert; andernfalls darf kein falscher Cursorvertrag versprochen werden. Für wenige Nutzer ist Page-Navigation ausreichend. E-Mail-Suche und clientseitiges Laden aller Benutzer sind nicht MVP-Scope.

## 10. Kontrollierter Rollenwechsel

### 10.1 Eingabe und Schichten

Striktes Schema, ausschließlich:

- `target_user_id` als UUID;
- `target_role` als exaktes `admin | reviewer`;
- empfohlen `expected_current_role` **und/oder** `expected_updated_at` für Compare-and-set.

Das Objekt muss `.strict()` sein. Nicht akzeptieren: E-Mail, Actor-ID (kommt aus Session), Status, `deleted_at`, beliebige Profilfelder/Metadaten oder freie Strings.

Empfohlener Ablauf:

1. Server Action validiert nur Transportinput und liefert geschlossene UI-Ergebnisse.
2. Fachservice ermittelt Actor serverseitig, validiert dessen Profil und `canChangeUserRole`.
3. Eine eng signierte `SECURITY DEFINER`-RPC führt Autorisierung nochmals DB-seitig aus, lädt/lockt Zielprofil, prüft erwarteten Stand und Aktivität, schützt letzten Admin, ändert nur `role` und schreibt Audit atomar.
4. RPC hat festen gehärteten `search_path`, qualifizierte Objekte, kontrollierte Ownership, explizites `REVOKE`/enges `GRANT EXECUTE`, keine dynamische SQL und keine generische Patch-Signatur.
5. Service mappt stabile Codes. Erst nach bestätigtem Erfolg revalidieren; kein optimistisches UI.

Direkte RLS-geschützte Tabellenmutation wird abgelehnt: Die bestehende `FOR ALL`-Policy kennt keine globale Invariante, keine CAS-Semantik und kein atomisches Audit. Server Action + Service allein kann konkurrierende DB-Transaktionen nicht sicher serialisieren.

### 10.2 Letzter-Admin-Schutz

Verbindliche Invariante: Eine Rollenänderung, Profildeaktivierung/-löschung oder spätere gekoppelte Auth-Löschung darf nie null aktive Adminprofile hinterlassen.

- Eine vorherige UI-/Servicezählung ist TOCTOU-anfällig und unzureichend.
- Eine reine Row-Lock-Prüfung nur des Zielprofils genügt nicht: Zwei verschiedene Adminzeilen könnten parallel herabgestuft werden.
- Empfohlen ist innerhalb derselben RPC-Transaktion ein transaktionsgebundener, namensstabiler PostgreSQL-Advisory-Lock für alle Operationen, die die aktive Adminmenge verändern. Alternativ müsste eine dedizierte Singleton-Guard-Zeile gelockt werden; eine solche existiert heute nicht. Danach Zielzeile `FOR UPDATE` sperren, aktive Admins unter derselben serialisierten Grenze zählen, CAS prüfen, mutieren und auditieren.
- Jeder spätere Deaktivierungs-, Profil-Soft-Delete- und Auth-Delete-Flow muss denselben Lock/Invariantenpfad nutzen. Auth Admin API und Postgres sind nicht gemeinsam transaktional; deshalb ist physische Auth-Löschung besonders ungeeignet fürs MVP und benötigt Saga-/Recovery-Design.
- Fehlendes/ungültiges Zielprofil schließt. Inkonsistente Auth-/Profilzustände dürfen keine Adminzählung „reparieren“ oder Rolle erfinden.

### 10.3 Selbständerung — Owner-Entscheidung

| Variante | Sicherheit/Recovery | UX/MVP | Bewertung |
| --- | --- | --- | --- |
| A: Eigenrolle erlaubt, wenn anderer aktiver Admin bleibt | Atomarer Schutz erforderlich; Fehlbedienung weiter möglich. Recovery durch anderen Admin. | Flexibel, mittlere Komplexität. | Später vertretbar. |
| B: Eigenrolle nie ändern | Stärkster Schutz gegen versehentliche Selbstsperrung; Änderung braucht anderen Admin. | Einfachstes MVP, bei nur einem Admin erwartbar blockiert. | **Technische MVP-Empfehlung.** |
| C: Eigene Herabstufung mit zweitem Admin + zusätzlicher Bestätigung | Gute Balance, aber Bestätigung ist kein DB-Schutz. | Beste spätere UX, mehr Zustände/Tests. | Nach MVP prüfen. |

Empfehlung, ausdrücklich keine Owner-Festlegung: In AP-14-02 zunächst **B**, während die RPC trotzdem letzten Admin atomar schützt. Später C nach realem Recovery-Konzept. Ein Dialog allein ist keine zusätzliche Sicherheitskontrolle.

## 11. Zweiter Reviewer: Signup, Invite, Create oder Dashboard

| Variante | Ist-Fit | Sicherheit/UX | Aufwand | Empfehlung |
| --- | --- | --- | --- | --- |
| A. Self-Signup, danach Rolle | Kein Signup vorhanden; Profil wird nicht automatisch angelegt. Zwischenzustand unklar. | Öffnet neue öffentliche Angriffsfläche; Default müsste reviewer sein. | Höher als angenommen. | Ablehnen fürs kleinste Paket. |
| B. Admin-Invite | Installierte API vorhanden; benötigt server-only Admin-Adapter, Mail-/Redirect-Konfiguration und zuverlässige Profilanlage. | Empfänger setzt über Mailflow fort; kein Passwort durch Admin; Rolle fest reviewer. Gute UX/Recovery, Invite-Link geheim halten. | Mittlerer, klar begrenzter AP-14-03-Scope. | **Produktziel-Empfehlung.** |
| C. `createUser` | Installierte API vorhanden; laut Package sendet sie keine Bestätigungsmail. | Admin müsste Passwort/Bestätigungszustand sicher lösen; erhöht Credential-/Recovery-Risiko. | scheinbar klein, sicher schwerer. | Für interaktive Reviewer ablehnen. |
| D. Supabase Dashboard, danach Profil/Rolle | Heute einziger realer Weg; keine App-Implementierung. | Operativ/manuell, fehleranfällig, SQL/Dashboard nötig, aber keine neue App-Privilege-Grenze. | Kleinster Übergangsweg. | Nur temporär bis AP-14-03. |

**Klare Paketempfehlung:** Nicht Einladung vorziehen. Erst AP-14-01, dann atomare AP-14-02-Rollenverwaltung, anschließend AP-14-03 Invite mit fixer Reviewerrolle. Der Hauptaccount bleibt Admin. Für den sofortigen manuellen Test ist D kleiner als neue unsichere Applogik.

### Invite versus direkte Anlage

- `inviteUserByEmail` akzeptiert in der installierten Admin-API Optionen einschließlich Redirect-/Datenoptionen; die konkrete Signatur muss beim Paket aus den installierten Typen fixiert werden. Der Client darf niemals `redirectTo` liefern; der Server wählt einen allowlist-basierten, umgebungsspezifischen Wert.
- Der Package-Hinweis, dass Invite kein PKCE unterstützt, verlangt eine bewusste serverseitige Callback-/Sessionstrategie. Aktuell existiert **keine** Auth-Callback-Route; AP-14-03 muss vor Implementierung klären, welche Supabase-Mailvorlage/Redirect-Route den gesetzten Passwort-/Sessionabschluss tatsächlich trägt.
- `createUser` sendet laut installierter API keine Bestätigungsmail. `email_confirm`/Passwort durch den Admin wäre für dieses Ziel schlechter, weil der Admin keine Nutzerpasswörter erzeugen oder sehen soll.
- Doppelte E-Mail und bereits ausstehende Einladung dürfen nicht anhand roher Providertexte an die UI geleakt werden. Enumeration-Risiken sind geringer in einer Admin-only-Oberfläche, trotzdem werden stabile neutrale Fachcodes verwendet.
- Neue Profile haben bereits DB-Default `reviewer`; dieser sichere Default ist richtig. Da es keinen Anlage-Trigger gibt, muss AP-14-03 atomare/kompensierbare Profilanlage separat entscheiden. **Nie automatisch admin.**

## 12. Service-Role-Grenze

### Ist-Zustand

`SUPABASE_SERVICE_ROLE_KEY` wird heute ausschließlich in einem `server-only` Client für den kontrollierten Storage-Purge gelesen. Der Client deaktiviert Sessionpersistenz/Refresh/URL-Erkennung und sein Typ exponiert nur `storage.from(bucket).remove(paths)`. Der darüberliegende Adapter begrenzt Bucket und Pfad. URL und Anon-Key sind `NEXT_PUBLIC_*`; der Service-Role-Key ist korrekt nicht public.

### Zielentscheidung

- Derselbe Secret-**Wert** darf serverseitig für Auth-Administration verwendet werden, aber nicht derselbe generische oder storage-spezifische Clientexport.
- Den Storage-Client **nicht erweitern**: Seine Capability ist absichtlich `remove` und fachlich isoliert.
- Ein separater `server-only` Auth-Adapter darf maximal konkrete Funktionen exportieren, zunächst z. B. eine minimierte paginierte Read-Funktion, in AP-14-03 separat genau „Reviewer-Einladung senden“. Kein Export von `SupabaseClient`, `.auth.admin`, `createUser`, `deleteUser`, `updateUserById` oder beliebigen Adminmethoden.
- Auth-Read und Invite können selbst getrennte Adapter/Interfaces erhalten, damit AP-14-01 nicht versehentlich Mutation freischaltet.
- Importgraph-Tests müssen Client Components, Browserclient und öffentliche Barrel-Exports ausschließen. Argumente/Rückgaben werden DTO-validiert; rohe Antworten, Secrets, Links und Tokens werden weder serialisiert noch geloggt.
- Kein `NEXT_PUBLIC_SERVICE_ROLE`, kein Fallback auf Anon-Key, keine Ausgabe des Keynamens/-werts in UI/Logs. Fehlende Konfiguration schließt kontrolliert.

Diese Planung führt in AP-14-00 **keine** Service-Role-Verwendung oder Variable ein.

## 13. Profilanlage und Konsistenzfälle

Heute entstehen Profile weder durch Trigger noch Appflow automatisch. Das Auth→Profil-Fenster ist daher dauerhaft manuell und inkonsistenzanfällig.

| Fall | Sichere Behandlung |
| --- | --- |
| Auth-User vorhanden, Profil fehlt | Sichtbar als `profile_status: missing`, kein Appzugriff, keine erfundene Rolle; Admin-Reparatur erst eigenes enges Design. |
| Profil vorhanden, Auth-User fehlt | Inkonsistenz melden; kein aktiver Benutzer. Wegen FK normalerweise nur bei extern/defektem Zustand; Auth-Delete cascadiert Profil. |
| Rolle ungültig | DB-Enum verhindert normale Speicherung; Zod/RPC schließen dennoch. |
| Invite akzeptiert, Profil fehlt | Keine fachlichen Rechte; neutrale Account-nicht-freigeschaltet-UX; Audit/Recovery erforderlich. |
| Neues Profil | Immer Default `reviewer`; Admin nur durch separaten kontrollierten Rollenwechsel. |
| Parallele Invites | Idempotency/Providerkonflikt mappen; keine doppelten Profile. |
| Doppelte E-Mail/vorhandener User | Keine zweite Authidentität erzeugen; stabiler Code; bewusster Recovery-/Zuordnungsflow. |

Für AP-14-03 sind zwei Designs zu entscheiden: (1) Auth-Invite erzeugt User und ein Auth-DB-Trigger legt idempotent Reviewerprofil an, oder (2) enger serverseitiger Orchestrator legt nach erfolgreichem Invite das Profil an und kompensiert/markiert Teilerfolge. Da Auth Admin API und öffentliche DB nicht gemeinsam transaktional sind, darf Atomarität nicht behauptet werden. Ein Trigger ist konsistenter für alle Auth-Erstellwege, muss aber mit `SECURITY DEFINER`, festem Search Path, minimalen Metadaten und Fehler-/Rollbackverhalten separat auditiert werden.

## 14. Deaktivierung: nicht in den ersten Scope

| Zustand | Wirkung/Risiko |
| --- | --- |
| A. Profil fachlich deaktivieren/soft löschen | Heute nicht modellierbar. Additives Statusfeld plus Anpassung von `current_app_role()`, jeder RLS-Policy/Serviceprüfung, letzter-Admin-Lock, Audit und Recovery nötig. Aktive Session bleibt Auth-seitig bestehen, verliert aber fachlichen DB-Zugriff, wenn überall korrekt fail closed. |
| B. Auth-Benutzer bannen/sperren | Privilegierte Auth Admin API; Session-/Tokenwirkung und Revoke-Semantik müssen offiziell verifiziert werden. Profilhistorie bleibt, aber RLS darf nicht allein auf alte Session vertrauen. |
| C. Auth-Benutzer physisch löschen | Irreversibel; Profil cascadiert, andere FKs mit `restrict` können blockieren, Historie/Actorbezug betroffen; nicht transaktional mit App-DB. |
| D. Rolle entfernen | Nicht möglich: Rolle ist `NOT NULL app_role`; `reviewer` ist eine Berechtigung, keine Deaktivierung. |

Empfehlung: AP-14-01 Liste, AP-14-02 Rollen; **keine** physische Auth-Löschung, kein Ban/Session-Revoke und keine Deaktivierung. AP-14-04 muss das Datenmodell, alle RLS-Funktionen, Sessionwirkung, Historie, Datenschutz, Recovery und letzten Admin erneut auditieren. Das System besitzt heute keine sichere Deaktivierung.

## 15. Audit Logging

### 15.1 Eignung von `public.audit_log`

Vorhanden sind UUID-ID, nullable `actor_id` FK zu Auth, `entity_type`, nullable `entity_id`, `action`, freie `metadata jsonb` und `created_at`. RLS ist aktiviert und `ALL` ist für `anon, authenticated` revoked. Bestehende kontrollierte Medien-RPCs schreiben bereits direkt hinein; ein Browser kann es nicht direkt bearbeiten.

Das ist als append-only Ziel grundsätzlich brauchbar, aber noch nicht vollständig für User Admin:

- keine expliziten Outcome-/Error-Code-Spalten; diese müssten kontrolliert in `metadata` oder durch additive Migration modelliert werden;
- keine DB-Constraints für stabile Eventcodes/Metadataform;
- `actor_id on delete` hat kein explizites Verhalten (Standard `NO ACTION`), was physische Auth-Löschung blockieren kann und historisch bewusst bewertet werden muss;
- fehlgeschlagene DB-Transaktionen können ihr Audit in derselben Transaktion nicht behalten; Provider-Invitefehler liegen außerhalb Postgres und brauchen einen sicheren serverseitigen Auditwriter oder ein bewusstes separates Ereignisdesign;
- kein allgemeiner Clientgrant ist erwünscht; künftige Writes nur über enge RPC/privilegierte interne Grenze.

### 15.2 Geplante Ereignisse und Datenminimierung

Stabile Codes beispielsweise:

- `user_role_changed`
- `reviewer_invite_sent`, `reviewer_invite_resent`, `reviewer_invite_failed`
- `auth_user_created`, `user_profile_created`
- später `user_profile_deactivated`

Erlaubt: Actor-ID, Ziel-ID, alte/neue Rolle, Timestamp, Eventcode, Ergebnis, sanitiserter Fehlercode. Rollenänderung samt Erfolgsaudit atomar in derselben RPC. Providerfehler nur mit gemapptem Code; keine vollständige E-Mail, sofern Ziel-ID genügt.

Nie loggen: Passwort, Invite-/Confirmation-/Recovery-Link oder Token, Access-/Refresh-Token, Service-Role-Key, rohe Authantwort/Metadaten/Identitäten, Providerfehlertext, IP ohne Freigabe oder personenbezogene Production-Daten.

## 16. Admin-UI- und UX-Zielbild (nur Planung)

### 16.1 Navigation und Seite

Bestehendes Muster erweitern, nicht ersetzen:

```text
Administration
├── Medien-Inventur
└── Benutzer & Rollen
```

Empfohlene Route: `/admin/users`, passend zur vorhandenen `/admin/project-media/orphans`-Struktur. Link nur bei `canViewUserAdministration`; Route und Datenservice prüfen unabhängig serverseitig. `/admin` sollte zusätzlich in den Middleware-Authscope, aber Middleware ersetzt nie Fachautorisierung.

Read-only Tabelle: E-Mail, Rollenbadge, klar definierter Profilstatus, erstellt am, später Aktionen. Technische IDs nur intern/bei Supportbedarf, keine Rohdaten/Secrets/Tokens. Leere-, Lade- und Fehlerzustände barrierearm und deutschsprachig.

### 16.2 Rollenwechsel

- Rolle als verständlicher Badge; kontrolliertes Select oder Dialog aus fixer Allowlist.
- Explizite Bestätigung; Warnung bei Admin-Herabstufung und gesondert bei eigener Rolle.
- Pending, Doppelsubmit-Schutz, kein optimistisches Umschalten.
- Erfolg: „Die Benutzerrolle wurde aktualisiert.“
- Konflikt: „Die Rolle wurde zwischenzeitlich geändert. Bitte lade die Benutzerliste neu.“
- Letzter Admin: „Der letzte aktive Administrator kann nicht zum Reviewer herabgestuft werden.“
- Allgemein: „Die Benutzerrolle konnte nicht aktualisiert werden.“
- Keine SQL-/Providerdetails. Nach Erfolg Serverdaten neu laden.

### 16.3 Einladung

- E-Mail-Input mit Label/Fehlerzuordnung; Zielrolle im MVP nicht auswählbar, fest `reviewer`.
- Keine Admin-Einladung im MVP; Redirect ausschließlich serverseitig aus Umgebungs-Allowlist.
- Bestätigung, Pending, Doppelsubmit-Schutz; kein Invite-Token/Link im Ergebnis.
- Bestehende E-Mail, ausstehender Invite und Providerfehler neutral/stabil mappen.
- Erfolg: „Die Reviewer-Einladung wurde versendet.“
- Resend erst nach Owner-Entscheidung und Rate-Limit/Statusnachweis.

## 17. Race Conditions und Konfliktregeln

| Race/Inkonsistenz | Erforderliche Behandlung |
| --- | --- |
| Zwei Admins ändern dieselbe Rolle | CAS auf `expected_updated_at`/Rolle und Zielzeilenlock; zweiter erhält `user_role_conflict`, kein Last-Write-Wins. |
| Eigene Rolle wird parallel geändert | Actorrolle innerhalb RPC neu lesen/locken; nicht auf vorherige Serviceantwort vertrauen. |
| Zwei letzte Admins werden parallel herabgestuft | Gemeinsamer transaction-level Advisory Lock/Guard-Zeile plus Zählung innerhalb Lock. |
| Ziel wird parallel deaktiviert | Rollen-/Deaktivierungsoperationen teilen denselben Lock/CAS; inaktives Ziel schließen. |
| Auth-User wird zwischenzeitlich gelöscht | FK/fehlendes Profil mappen; keine Rolle neu anlegen; Auth-/DB-Grenze kompensierbar gestalten. |
| Invite doppelt gesendet | Serveridempotenz soweit API erlaubt, belastbare Statusprüfung, Rate Limit und `invite_already_pending`; niemals beide als neue User behandeln. |
| Invite wird bei offener Liste angenommen | Liste ist Snapshot; Refresh zeigt neuen Zustand; Aktionen validieren aktuellen Serverzustand. |
| Profil fehlt | `user_profile_missing`, kein stilles Defaulten auf reviewer im Read-/Role-Change-Pfad. |
| Rolle inzwischen geändert | CAS schlägt neutral mit `user_role_conflict` fehl. |

Empfohlen ist `expected_updated_at` plus optional `expected_current_role`; Timestampgenauigkeit muss DB-seitig exakt verglichen werden. Security-relevante Rollenänderungen dürfen nie Last-Write-Wins sein.

## 18. Geschlossene Fehlercodes

Mindestens folgende fachliche Allowlist planen:

- `user_admin_forbidden`
- `user_not_found`
- `user_profile_missing`
- `user_role_invalid`
- `user_role_conflict`
- `last_admin_protected`
- `self_role_change_blocked`
- `invite_already_exists`
- `invite_already_pending`
- `invite_failed`
- `user_admin_failed`

Optional getrennt: `user_admin_configuration_missing`, `user_profile_inactive`, `user_admin_page_invalid`. Unbekannte SQL/Auth-Fehler werden serverseitig auf `user_admin_failed` gemappt. Keine rohen Supabase-, SQL-, Provider- oder PII-Details in Client oder Logs.

## 19. Production-, Preview- und Local-Gates

### Production

- Echte, kontrollierte zweite eigene E-Mail; korrekte Supabase Site URL, erlaubte Redirect URLs und Mailtemplate/-zustellung vor Invite.
- Service-Role-Secret ausschließlich server-only/sensitive; kein Browserbundle, Log, Preview-Leak oder Anon-Fallback.
- Hauptaccount bleibt Admin; atomarer letzter-Admin-Schutz vor jeder Adminreduzierung.
- Zuerst Read-only-Smoke-Test, dann Rollen-RPC, erst danach Invite-Gate.
- Kontrollierter End-to-End-Test mit zweitem Reviewer und getrennten Browserkontexten.

### Preview

- Keine Production-Einladungen und keine Production-Service-Role-Nutzung ohne vollständig isoliertes Preview-Supabase-Projekt.
- Invite standardmäßig deaktiviert; nicht lediglich Button ausblenden, sondern serverseitiges Environment Gate.
- Preview-Redirect-Domains explizit allowlisten; keine vom Client gelieferte URL.

### Local

- Lokale Supabase-Instanz und lokaler Mailcatcher/Teststrategie; niemals Production-Key oder echte Production-E-Mail.
- Auth-/Profil-Inkonsistenzen und Inviteannahme reproduzierbar testen.

## 20. Reales Reviewer-Testziel

1. Hauptaccount bleibt `admin`.
2. Zweite eigene E-Mail wird dauerhaft `reviewer`.
3. Admin bleibt im normalen Browser angemeldet.
4. Reviewer meldet sich parallel in Inkognito oder zweitem Browser an.
5. Reviewer sieht erlaubte Projektansichten, Gallery, Bilder und PDFs.
6. Reviewer sieht nicht: Adminnavigation, Benutzerverwaltung, Upload, Rollenänderung, Cleanup, Purge oder andere Adminaktionen.
7. Direkte Aufrufe von `/admin/users`, `/admin/project-media/orphans` und Admin-Actions bleiben serverseitig gesperrt. Navigation allein gilt nicht als Test der Autorisierung.

## 21. Spätere Teststrategie (in diesem Paket nicht ausgeführt)

### Benutzerliste

- Admin erlaubt; Reviewer, unauthentifiziert, fehlendes/inaktives/ungültiges Profil abgelehnt.
- DTO exakt/schmal; Auth-only/Profil-only-Konsistenzfälle; max. 50, stabile Pagination.
- Keine Secrets, Tokens, Metadaten, Identities oder rohen Authantworten.

### Rollenwechsel

- Admin→Reviewer, Reviewer→Admin (nur falls Owner erlaubt), letzter Admin, eigene Rolle, Parallelkonflikt.
- Ungültige Zielrolle/UUID, zusätzliche Felder, fehlender User/Profil, inaktives Ziel.
- CAS, gemeinsamer Lock, atomarer Auditdatensatz, keine freie Patch-Payload und kein direkter Browserupdate.

### Einladung

- Gültige/ungültige E-Mail, zusätzliche Felder abgelehnt, Rolle unveränderlich reviewer.
- Vorhandener User, pending Invite, paralleler/resend Invite, Provider-/Konfigurationsfehler.
- Kein Token/Link/Authrohobjekt zurück, kein Secret im Client, serverseitige Redirect-Allowlist.

### Architektur

- Kein Service-Role-Key/Keyname im Clientbundle, kein generischer Adminclientexport, server-only Importgraph.
- Keine Clientquery `auth.users`, keine Clientrollenmutation, keine offene RLS-Policy, kein `NEXT_PUBLIC_SERVICE_ROLE`.
- Keine Auth-Tokens/PII in DTO/Logs; Audit-Log nicht clientbeschreibbar.

### Production

- Zweiter eigener Reviewer: Invite/Passwortabschluss, Login und validierte Rolle.
- Keine Adminnavigation/-URLs/-Mutationen; erlaubter Projekt-/Gallery-Lesezugriff.
- Hauptadmin bleibt handlungsfähig. Kein Production-Test vor Gates.

## 22. Offene Owner-Entscheidungen mit technischer Empfehlung

| Entscheidung | Empfehlung, keine Vorwegnahme |
| --- | --- |
| Darf Admin sich selbst herabstufen? | AP-14-02 zunächst nein; später C mit zweitem Admin + DB-Schutz prüfen. |
| Darf Admin andere zu Admin machen? | Nur bewusst freigeben; wenn ja ausschließlich atomare RPC, Bestätigung und Audit. |
| Admin-Einladung im MVP? | Ausschließen. AP-14-03 lädt ausschließlich Reviewer ein. |
| Einladungsrolle fest reviewer? | Ja, serverseitig fest; kein Rollenfeld vom Client. |
| Self-Signup oder Admin-Invite? | Admin-Invite; Self-Signup existiert nicht und erweitert Angriffsfläche. |
| E-Mail in `profiles` spiegeln? | Nein, Auth als kanonische Quelle, sofern kein späterer belegter Sync-Bedarf. |
| Liste aus Auth oder nur Profilen? | Vollständiges Ziel: Auth-Read + Profile; minimal ohne E-Mail: Profile. Decision Freeze vor AP-14-01. |
| User ohne Profil sichtbar? | Ja als `missing`, ohne Rolle/Zugriff; wichtig für Recovery. |
| Deaktivierung schon AP-14? | Nein; eigenes AP-14-04-Audit. |
| Letzten Admin atomar schützen? | Ja, zwingend, nicht optional; Owner entscheidet nur Mechanik/Scope. |
| Invite erneut senden? | Nicht MVP; später nur mit Statusnachweis/Rate Limit/Audit. |
| Suche in Benutzerliste? | Nicht MVP; zunächst paginiert ≤ 50. |
| Preview-Invites deaktivieren? | Ja, außer vollständig isolierter Preview-Umgebung. |
| Profilstatusmodell ergänzen? | Erst AP-14-04; heute keine Spalte erfinden. |
| Wie entsteht Invite-Profil? | Separater Decision Freeze: idempotenter Auth-Trigger bevorzugt prüfen vs. kompensierbarer Orchestrator. |

## 23. Kleine Folgepakete

### AP-14-01 — Read-only User Administration

- Admin-only Route `/admin/users` und Navigation „Benutzer & Rollen“.
- Begrenzte serverseitige Liste (max. 50), E-Mail/Rolle/Status nur gemäß Datenquellenentscheidung.
- Keine Mutation, Einladung oder Deaktivierung.
- **Vorbedingung:** kurzer Decision Freeze A vs. C; privilegierter Adapter nur, wenn E-Mail/Auth-only-Sichtbarkeit beschlossen und Security Gates spezifiziert sind.

### AP-14-02 — Controlled Role Change

- Striktes Schema; getrennte Adminpermission; Server Action + Service.
- Atomare CAS-RPC, gemeinsamer letzter-Admin-Lock, Self-Change-Regel und atomisches Audit.
- Vorher bestehende direkte Profilrollenmutation wirksam schließen; keine Einladung.

### AP-14-03 — Reviewer Invitation

- Zweite E-Mail, Zielrolle serverseitig fest `reviewer`.
- Enger server-only Auth-Invite-Adapter; kein Admin-Invite, `createUser`, Token oder Link im Ergebnis.
- Profilanlage-/Recoveryentscheidung, Redirect-/Mail-/Production Gates.

### AP-14-04 — User Deactivation Audit

- Erst später erneut Audit; Statusmodell, RLS, Sessions, Recovery, letzter Admin, Audit und Datenschutz gemeinsam bewerten.

## 24. Kleinstes nächstes Paket und Freigabegrenze

**Empfehlung: AP-14-01 — Read-only User Administration**, jedoch mit einem kleinen vorgeschalteten **Decision Freeze zur Datenquelle**. Grund: Das heutige `profiles` kann sicher über Admin-RLS gelesen werden, enthält aber weder E-Mail noch Aktiv-/Invite-Status. Das verlangte vollständige Listenbild ist ohne neue privilegierte Auth-Read-Grenze oder neue DB-Architektur nicht ehrlich darstellbar. Dieses Audit empfiehlt Auth als E-Mail-Wahrheit und einen engen server-only Adapter, genehmigt ihn aber nicht ungefragt.

**Auditstatus: READY FOR OWNER DECISION**  
Nicht `APPROVED FOR IMPLEMENTATION`.  
Nicht `Production Ready`.

## 25. Scope-Bestätigung

Dieses Paket enthält **ausschließlich Analyse und Dokumentation**. Es enthält ausdrücklich:

- keine Implementierung, UI-Änderung, Navigation oder Komponenten;
- keine Server Action und keinen Service;
- keine Migration, SQL-Änderung, RPC, RLS-Änderung oder Grants;
- keine Supabase-Auth-Mutation, Benutzeranlage, Einladung oder Rollenänderung;
- keine Deaktivierung;
- keine Tests oder Teständerungen und keine ausgeführten Anwendungstests;
- keine Service-Role-Einführung oder -Änderung;
- keine Environment-Variable, Secrets oder personenbezogenen Production-Daten;
- keine `package.json`-Änderung;
- keine KI und keine WhatsApp-Integration.

Geändert wird ausschließlich `docs/audits/2026-07-31-ap14-00-user-role-administration-audit.md`.
