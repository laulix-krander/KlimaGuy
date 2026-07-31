# AP-14-03-00 — Reviewer Invitation Architecture, Security and UX Audit

**Audit-ID:** `KG-AUDIT-2026-07-31-AP14-03-00-REVIEWER-INVITATION-V1`
**Datum:** 2026-07-31
**Branch:** `codex/audit-ap14-03-reviewer-invitation`
**Art:** ausschließlich Audit und Dokumentation; keine Implementierung
**Status:** **READY FOR OWNER DECISION**
**Nicht:** `APPROVED FOR IMPLEMENTATION`
**Production-Status:** **NOT PRODUCTION READY**

## 1. Zweck

Dieses Audit plant die kleinste sichere Architektur, mit der ein gültiger Administrator später auf `/admin/users` eine zweite eigene E-Mail-Adresse **ausschließlich als Reviewer** einladen kann. Es bewertet die installierte Supabase-API, Auth-, Profil-, Rollen-, Redirect-, Fehler-, Datenschutz-, Audit- und UX-Grenzen. Es versendet keine Einladung und verändert weder Anwendung noch Datenbank oder Auth-Konfiguration.

## 2. Ausgangslage, Baseline und Prüfumfang

- AP-14-01 stellt eine read-only Benutzerverwaltung bereit. AP-14-02-01/02 stellen den kontrollierten Rollenwechsel als Migration, Service, Action und UI bereit.
- Start-HEAD und lokale Baseline waren `db41bc7f24569d95ae1aef1b704dbb7806e34057`; `git status --short --branch` zeigte vor Beginn nur `## work`.
- `git remote -v` lieferte keine Ausgabe. Es gibt kein `origin`; Fetch, `origin/main` und Merge-Base waren daher nicht verfügbar. Der saubere lokale HEAD ist die Baseline, seine Gleichheit mit einem externen `main` ist nicht verifizierbar.
- Vollständig geprüft wurden die drei verbindlichen AP-14-Audits, alle drei Dateien der Admin-Benutzerseite, Read-Adapter/-Service, Rollenwechsel-Service/-Action, Rollen-/Permission-/Schemaquellen, sämtliche repositoryweit vorhandenen Auth-, Login-, Logout-, Middleware- und Supabase-Client-Dateien, sämtliche Migrationen mit Bezug zu `profiles`, `audit_log` und `auth.users`, alle server-only Service-Role-Module, `package.json` und die tatsächlich installierten Supabase-Pakete/-Typen.
- Production-Beobachtung des Owners: genau ein Admin, kein Reviewer; die Benutzerliste funktioniert. `202607310001_user_role_change_rpc.sql` ist in Production noch nicht installiert. Das bleibt ein **separates AP-14-02-Production-Validation-Gate** und wird hier weder installiert noch verändert.
- Auftragsgemäß wurden keine Anwendungstests ausgeführt.

## 3. Verbindliche Owner-Entscheidungen

1. Der Workflow lädt ausschließlich Reviewer ein; `reviewer` wird serverseitig fest verdrahtet. Admin-Einladung, Clientrolle und freie Benutzeranlage mit Passwort sind ausgeschlossen.
2. Nur ein authentifizierter Benutzer mit vorhandenem, gültigem Adminprofil darf Seite und Action verwenden. Reviewer, fehlende Profile, ungültige Rollen und nicht authentifizierte Aufrufer werden abgewiesen.
3. Es bleibt ohne öffentliches Self-Signup. E-Mail bleibt in Supabase Auth, wird nicht in `public.profiles` gespiegelt und dient nur Einladung und Admin-Benutzerverwaltung.
4. Invite-Token, Link, Session, Providerantwort und rohe Authdaten gelangen weder zum Client noch in Logs oder Audit.
5. Ein eigener enger server-only Invite-Adapter wird geplant. Read-Adapter und Storage-Purge-Client werden weder zusammengelegt noch erweitert; kein generischer Adminclient wird exportiert.
6. Production verwendet ausschließlich Production-Supabase, serverseitigen Production-Key und eine freigegebene feste Production-URL. Preview-Invites sind nur mit vollständig getrennter Preview-Supabase-Umgebung erlaubt.
7. Bestehende Benutzer sind keine neuen Einladungen. Profilinkonsistenzen werden nicht still repariert, außer der Owner genehmigt die unten empfohlene atomare Profilanlage ausdrücklich als AP-14-03-01-Migration.

## 4. Aktuelle Autharchitektur

- Supabase Auth nutzt E-Mail/Passwort. `/login` ruft serverseitig `signInWithPassword({ email, password })` auf; `/auth/logout` ruft `signOut()` auf. Es existieren keine Signup-, Recovery-, Invite-Annahme-, Auth-Callback- oder Passwort-setzen-Routen.
- Der normale Serverclient und die Middleware verwenden `NEXT_PUBLIC_SUPABASE_URL`, Anon-Key und Cookies. Die Middleware aktualisiert über `getUser()` die Session und schützt `/dashboard`, `/customers`, `/projects`, aber nicht `/admin`; `/admin/users` autorisiert deshalb selbst im Page-/Service-Pfad.
- Das App-Layout liest das eigene Profil, validiert `role` und blendet Adminnavigation fail closed aus. Ein Auth-User ohne Profil kann jedoch weiterhin die App-Shell erreichen; fachliche RLS/Services schließen ihn aus. Für einen Invite-Flow ist diese inkonsistente UX nicht akzeptabel.
- Der vorhandene Auth-Read-Adapter ist `server-only`, erzeugt intern mit demselben `SUPABASE_SERVICE_ROLE_KEY` einen nicht persistierenden Client und exportiert nur paginiertes `listUsers`. Der Storage-Purge-Client ist eine andere privilegierte Grenze und ungeeignet.
- Derselbe vorhandene Secretwert kann später im getrennten Invite-Adapter verwendet werden: Secret-Wiederverwendung innerhalb desselben Supabase-Projekts ist technisch erforderlich/vertretbar, **Capability-Wiederverwendung ist es nicht**. Separate Dateien, Exporte, DTOs und Tests erhalten Least-Privilege auf Anwendungsebene. Es entsteht keine neue Environment-Variable und kein gemeinsamer Adminclient.

## 5. Aktuelle Profil-, Rollen- und Auditarchitektur

`public.profiles` besitzt `id uuid primary key references auth.users(id) on delete cascade`, optionales `display_name`, `role app_role not null default 'reviewer'`, `created_at` und `updated_at` jeweils `not null default now()`. `profiles_updated` setzt `updated_at` vor Updates. Das Enum enthält exakt `admin` und `reviewer`. Es gibt weder E-Mail noch Aktiv-/Invite-/Soft-Delete-Feld.

RLS ist aktiv. Eigene Profile oder alle Profile als Admin sind lesbar; die initiale breite Admin-Policy besteht. Die AP-14-02-Migration entzieht Browser-Updates und führt die kontrollierte Rollen-RPC ein, ist laut Owner aber noch nicht in Production installiert. Repositoryweit existiert **kein Trigger auf `auth.users`**, keine automatische Profilanlage und kein anderer Signup-/Callback-Profilpfad. Ein Profil kann wegen der FK nicht vor dem Auth-User angelegt werden; beim Löschen des Auth-Users wird es kaskadiert gelöscht.

`public.audit_log` enthält UUID, optionale Actor-FK, `entity_type`, optionale `entity_id`, `action`, `metadata jsonb` und Zeitpunkt. RLS ist aktiv; alle Rechte für `anon` und `authenticated` sind entzogen. Die Rollen-RPC schreibt Audit innerhalb ihrer DB-Transaktion. Ein Auth-Admin-HTTP-Aufruf und ein späterer separater DB-Aufruf teilen dagegen keine Anwendungstransaktion.

## 6. Tatsächlich installierte Supabase-API

`package.json` deklariert `@supabase/supabase-js ^2.45.4` und `@supabase/ssr ^0.6.1`; installiert sind `@supabase/supabase-js 2.111.0` und transitiv `@supabase/auth-js 2.111.0` (kein Lockfile vorhanden).

Die installierte Signatur lautet:

```ts
inviteUserByEmail(
  email: string,
  options?: {
    data?: object;
    redirectTo?: string;
  },
): Promise<UserResponse>
```

- `data` wird laut Typkommentar in `auth.users.user_metadata` gespeichert; es ist **keine** vertrauenswürdige Rollenquelle. Für die Empfehlung wird es nicht benötigt und sollte nicht gesendet werden.
- `redirectTo` bestimmt das Ziel nach Klick und muss serverseitig fest sein.
- `UserResponse` ist eine diskriminierte `{ data: { user }, error: null }`- bzw. `{ data: { user: null }, error: AuthError }`-Antwort. Die Implementierung POSTet an `/invite` mit `{ email, data }` und dem Redirect als `redirect_to` Queryparameter, fängt erkannte `AuthError` ab und gibt sie als `error` zurück; nicht als AuthError erkannte Laufzeit-/Netzfehler können werfen.
- Bei erfolgreicher Einladung ist der Auth-User bereits erzeugt; die dokumentierte User-Antwort enthält unter anderem UUID und mögliche Invite-/Confirmation-Zeitpunkte. Der Adapter darf daraus ausschließlich die verifizierte UUID und einen engen Erfolg ableiten und den Rest verwerfen.
- Die installierte API dokumentiert ausdrücklich, dass `inviteUserByEmail` kein PKCE unterstützt. `createUser` wäre server-only verfügbar, sendet aber keine Einladungs-E-Mail und ist wegen freier Passwortanlage nicht Ziel dieses Pakets.
- Existierende oder bereits eingeladene Benutzer, Provider-/SMTP-/Rate-Limit-Fehler und falsche Redirect-Konfiguration werden vom Auth-Server bestimmt. Die TypeScript-API garantiert dafür **keine geschlossene semantische Code-Menge**. Ohne Integrationstest gegen die konkrete installierte Serverversion dürfen weder Meldungstext noch HTTP-Status als dauerhafter fachlicher Vertrag geraten werden.

### 6.1 Zuverlässig erkennbare und nicht ableitbare Zustände

Zuverlässig sind nur: lokale Eingabe gültig/ungültig; Adapterkonfiguration vorhanden/fehlend; API-Erfolg mit validierter Auth-UUID; API-Fehler; und durch einen expliziten serverseitigen Vorabgleich ein Auth-User derselben normalisierten E-Mail. `listUsers` liefert `invited_at`, `confirmation_sent_at`, `email_confirmed_at`, `last_sign_in_at` im installierten `User`-Typ, der bestehende enge Read-Adapter verwirft diese jedoch absichtlich.

Nicht geraten werden dürfen: E-Mail-Zustellung, Linkbesitz, Linkgültigkeit, „pending“ nur aus `last_sign_in_at = null`, bestätigte Passwortsetzung, Aktivität, Ablauf, Replay, Providerinterner Invite-Status oder Ursache eines beliebigen Providerfehlers. `reviewer_invitation_pending` darf erst nach einem AP-14-03-01-Decision-Freeze aus explizit ausgewählten, serverseitig validierten Authfeldern abgeleitet werden. Bis dahin bleibt das Read-DTO `auth_status: "unknown"`. Eine enge Erweiterung etwa um `invited_unconfirmed` ist möglich, aber nur mit getesteter Wahrheitstabelle; „E-Mail zugestellt“ darf sie nie bedeuten.

## 7. Variantenvergleich

| Variante | Sicherheitsgrenze/Rollenbindung | Teilfehler, Idempotenz, Race/Recovery | Datenschutz/Betrieb/Preview | Testbarkeit, Migration/Auth-Konfiguration | Urteil |
| --- | --- | --- | --- | --- | --- |
| **A: Invite, dann Profil-Insert im Service** | Adapter kann fest einladen; Rolle beim Insert fest `reviewer`. Zwei privilegierte Grenzen. | Nicht atomar: Invite kann erfolgreich und Profil fehlgeschlagen sein. Retries treffen existierenden Auth-User; Kompensation durch Auth-Löschung wäre gefährlich. Per-E-Mail-Races bleiben. Reconciliation zwingend. | Keine E-Mail-Spiegelung möglich; Production/Preview trennbar. Inkonsistentes Loginfenster. | Keine zwingende Migration, aber komplexe Provider-Mocks und Recovery. | Für MVP ablehnen. |
| **B: Pending-Profil, dann Invite** | Profil kann ohne Auth-UUID nicht FK-konform entstehen; E-Mail müsste neu gespeichert oder anderes Pending-Modell geschaffen werden. | Profil-vor-Auth scheitert am FK bzw. hinterlässt neue Pending-PII; Einladung kann danach scheitern. Eigene Zustandsmaschine nötig. | Verdoppelt E-Mail/PII und Retention; Preview-Risiko steigt. | Neue Tabelle/Migration, RLS, Grants, Cleanup und Auth-Konfiguration nötig. | Ablehnen. |
| **C: Invite plus serverseitige Markierung, Auth-Trigger legt Profil an** | Ein gehärteter Auth-Insert-Trigger kann Profil **unbedingt mit Literal `reviewer`** anlegen. Keine Rolle aus Client- oder User-Metadaten. `public.profiles` bleibt kanonisch. | Auth-User und Profil entstehen in derselben Auth-DB-Transaktion; Triggerfehler rollt den User-Insert/Invite zurück. PK/FK machen UUID-Pfad idempotent; E-Mail-Eindeutigkeit bleibt Auth-Grenze. | Keine E-Mail-Spiegelung. Saubere Umgebungsgrenzen bleiben Pflicht. | AP-14-03-01-Migration und echte lokale/Preview-Auth-Integrationstests; Redirect/SMTP-Config nötig. Auswirkungen auf **jede** Auth-User-Anlage müssen geprüft werden. | **Empfehlung mit Owner-Freigabe.** |
| **D: Profil beim ersten bestätigten Login** | Login-Grenze müsste Invite und Rolle sicher erkennen; bis dahin existiert Auth ohne Rolle. | Langes Inkonsistenzfenster, Login-/Callback-Races, schweres Recovery. | Keine E-Mail-Spiegelung, aber schlechte UX und Monitoring. | Neue Callback-/Provisionierungsgrenze und ggf. Migration; komplexe Tests. | Ablehnen. |
| **E: Dashboard-Einladung** | Service Role bleibt aus App, aber Rollen-/Profilanlage ist manueller, nicht atomarer Operatorprozess. | Nicht idempotenter Runbook-Prozess; leicht vergessenes Profil, schwaches Audit/Recovery. | Dashboard zeigt PII; falsches Projekt/Redirect besonders riskant. | Wenig Code, aber manuelle Auth-/Profil-/Production-Validierung. | Nur expliziter, zeitlich begrenzter Notfall-/Bootstrapweg; kein Produktziel. |

## 8. Architekturentscheidung

**Empfohlen wird Variante C**, jedoch präziser als „Metadatenrolle“: `inviteUserByEmail` erzeugt den Auth-User; ein in AP-14-03-01 separat geprüfter, gehärteter Trigger auf `auth.users` legt im selben Datenbankvorgang `public.profiles(id, role)` mit der **SQL-Literalrolle `reviewer`** an. Der Trigger darf weder `raw_user_meta_data.role` noch frei gesetzte `data`-Felder auswerten. Eine serverseitige feste Markierung wäre nur als zusätzlicher Flow-Selektor denkbar, nie als Rollenwert; da `inviteUserByEmail` nur `data`/User-Metadaten und kein App-Metadatenfeld akzeptiert, ist auch dieser Selektor nicht ohne weitere Vertrauensanalyse freigegeben.

Vor Implementierung muss AP-14-03-01 entscheiden, ob ein unconditional Default-Reviewer-Trigger mit allen zulässigen Auth-Anlagewegen kompatibel ist. Da öffentliches Signup und freie App-Benutzeranlage verboten sind, ist dies das kleinste robuste Modell. Sollten andere administrative Auth-Anlagen erlaubt bleiben, braucht AP-14-03-01 eine DB-seitig beweisbare enge Flow-Grenze; andernfalls ist C blockiert und A darf nicht still als Ersatz umgesetzt werden.

Eine Anwendungstransaktion über den HTTP-Aufruf Auth Admin und einen separaten PostgREST-Profilinsert ist **nicht möglich**. Atomar wird C nur, weil der Auth-Insert-Trigger innerhalb der Auth-Datenbanktransaktion läuft. Die Aussage muss mit der konkreten lokalen/Preview-Supabase-Version getestet werden, nicht allein angenommen werden.

Recovery bleibt erforderlich: Vor jedem Invite enger Auth-Abgleich; nach Erfolg Read-after-write auf Auth-ID und exakt `profiles.role = reviewer`; bei Inkonsistenz `reviewer_profile_inconsistent`, kein automatisches Löschen, kein Rollenraten, kein erneuter Invite. Ein admin-only Reconciliation-Runbook inventarisiert Auth-only und (theoretisch) Profil-only Datensätze. Profil-only ist wegen FK normalerweise unmöglich, kann aber bei externen/defekten Adminoperationen geprüft werden. Reparatur oder Löschung erfordert eine separate Owner-Entscheidung.

## 9. Server-only Auth-Invite-Adapter

Zieldatei: `lib/server/user-administration-auth-invite-adapter.ts`.

- `import "server-only"`; `NEXT_PUBLIC_SUPABASE_URL` nur als Projekt-URL; `SUPABASE_SERVICE_ROLE_KEY` zwingend, kein Anon-Fallback.
- Interner Client: Sessionpersistenz, Auto-Refresh und URL-Sessionerkennung aus. Weder Client noch Auth-Admin-Objekt werden exportiert.
- Genau eine schmale Reviewer-Invite-Funktion; keine `listUsers`, `createUser`, Update-, Delete- oder Storage-Funktion. Der notwendige bestehende-Benutzer-Abgleich bleibt im vorhandenen Read-Adapter bzw. in einer später ausdrücklich verengten Read-Capability, nicht im Invite-Adapter.
- Input intern nur validierte normalisierte E-Mail; `redirectTo` stammt aus serverseitiger Konfiguration/Deployment-Entscheidung, nie aus Funktionsinput des Clients. `data` wird bevorzugt weggelassen.
- Output nur ein geschlossenes internes Ergebnis mit validierter Ziel-UUID oder sanitisiertem Fehlerklassifikator. Keine rohe `UserResponse`, E-Mail, Metadaten, Identitäten, Link, Token, Session, Redirectdetails, Providercode oder Providertext.
- Catch-/Mapping-Grenze behandelt sowohl `{ error }` als auch geworfene Fehler und loggt keine Fehlerobjekte. Konfigurationsfehler werden fachlich separat, aber ohne Secret-/URL-Ausgabe behandelt.

## 10. Redirect-Flow und Passwortsetzung

**Entscheidung:** eine neue dedizierte Invite-Annahme-/Passwort-setzen-Route ist vor Produktfreigabe nötig; die bestehende `/login`-Route allein reicht nicht. Ein direkter Loginredirect erklärt weder Invite-Session noch Passwortsetzung. Eine klassische serverseitige Code-Callback-Route darf nicht blind geplant werden, weil die installierte Invite-API PKCE ausdrücklich nicht unterstützt. Der Supabase-Standardflow kann den Verifikationslink verarbeiten, benötigt danach aber ein kontrolliertes Ziel, das die entstandene Invite-Session erkennt, ein Passwort setzen lässt und anschließend zum Login bzw. Dashboard führt. Die genaue Hash-/Token-/Sessionmechanik muss AP-14-03-01 gegen die reale Auth-Konfiguration und die installierte Clientversion testen.

- Der Client übermittelt **keine URL**. Der Service/Adapter wählt genau eine feste URL je Deploymentklasse aus einer fail-closed serverseitigen Zuordnung. Freie `Origin`, `Host`, `Referer`, Formwerte oder Queryparameter sind keine Quelle.
- Production: exakte freigegebene HTTPS-Production-Domain plus dedizierter Pfad; keine Wildcard-/Preview-Domain. Die konkrete Domain ist im Repository nicht belegt und muss der Owner als Deployment-Gate festlegen.
- Preview: ausschließlich separate Preview-Supabase-Instanz, separates Secret, eigene enge Allowlist und feste Preview-Domain. Bei Production-Supabase ist Invite deaktiviert/fail closed.
- Local: nur lokale Supabase-Instanz oder ausdrücklich freigegebene Testinstanz; feste Loopback-URL/Port in deren Allowlist.
- Die exakten Ziele müssen in Supabase Auth Redirect Allowlist stehen. Eine nicht freigegebene/falsch konfigurierte URL darf nicht auf einen stillen Default als Erfolg vertrauen; Integrationstest und Read-after-write führen zu `reviewer_invitation_configuration_error` oder neutralem Fail.
- Invite-Link wird vom Provider per E-Mail gesendet, nicht von der App erzeugt/angezeigt. Beim Klick verifiziert Supabase den Invite und leitet zum festen Ziel. Dort muss ohne gesetztes Passwort ausschließlich der Set-password-Flow angeboten werden; erst erfolgreiches `updateUser({ password })` und eine gültige Rolle erlauben den normalen App-Übergang.
- Abgelaufene, manipulierte oder wiederverwendete Links erhalten eine neutrale Fehlerseite mit Rückweg zu `/login`; kein Token und keine Providerursache wird dargestellt. Fragmente dürfen nicht an Analytics/Logs weitergegeben werden; Querytoken sind zu vermeiden bzw. vor Telemetrie zu redigieren.

## 11. Profilanlage, feste Reviewerrolle und Konsistenz

1. Auth erzeugt bei erfolgreichem Invite synchron einen Auth-User und eine UUID.
2. Der genehmigungspflichtige AP-14-03-01-Trigger legt innerhalb desselben Vorgangs `profiles.id = new.id`, `role = 'reviewer'::app_role` an. Defaults setzen `created_at`/`updated_at`; keine E-Mail wird kopiert.
3. Profil-PK/FK verhindert Duplikate und verwaiste Profile; Auth-E-Mail-Eindeutigkeit verhindert regulär zwei Auth-User derselben kanonischen Adresse. Welche E-Mail-Kanonisierung der Auth-Server verwendet, darf die App nicht nachbauen oder raten.
4. Die App normalisiert nur nach bestehendem Muster: `trim`, für die fachliche Vergleichs-/Invite-Grenze konsistente Kleinschreibung nach AP-14-03-01-Tests; keine provider-spezifische Punkt-/Plus-Alias-Normalisierung. Der tatsächlich an Auth gesendete Wert und der Vorabgleich müssen identisch normalisiert sein.
5. Ein bestehender Auth-User mit gültigem Reviewerprofil ergibt `reviewer_already_exists`; ein belastbar als unbestätigter Invite klassifizierter Auth-User `reviewer_invitation_pending`; bestehender Admin oder andere Konflikte `reviewer_invitation_conflict`; Auth-/Profilabweichung `reviewer_profile_inconsistent`. Es wird nicht erneut eingeladen oder umgerollt.
6. Nach Invite wird Auth-ID/Profil konsistent gelesen. Fehlendes oder nicht-Reviewer-Profil ist kein Erfolg. Login-/App-Grenzen müssen zusätzlich fail closed ein gültiges Profil verlangen und bei fehlendem Profil eine neutrale Accountstatusseite statt der normalen Shell liefern.
7. Invite-Replay ändert die Rolle nie. Eine bestätigte Invite-Session erhält ausschließlich die bereits kanonische Profilrolle; Metadata kann sie nicht erhöhen.

## 12. Permission

Die bereits im Decision Freeze vorgesehene eigene Permission `canInviteReviewer(role: Role | null): boolean` ist in AP-14-03-01 zu ergänzen und erlaubt nur `role === "admin"`. Sie ist nicht durch `canViewUserAdministration` oder eine generische Benutzerverwaltungspermission zu ersetzen. Page-Sichtbarkeit, Service und Action prüfen unabhängig: keine Session → forbidden; kein Profil → forbidden; Zod-ungültige Rolle → forbidden; Reviewer → forbidden; Admin → erlaubt. „Aktiv“ ist heute kein Profilfeld; bis ein solches Modell existiert, bedeutet gültig/aktiv: vorhandenes kanonisches Profil mit gültiger Adminrolle und nicht anderweitig gesperrte Auth-Session.

## 13. Eingabeschema

Geplant ist ein `z.object({ email: ... }).strict()` mit ausschließlich `email`: String, `trim()`, repositorykonsistente Normalisierung, gültiges E-Mail-Format, sinnvoll maximal **254 Zeichen**. Leere/fehlende oder ungültige E-Mail ist ungültig. Zusätzliche Felder werden abgelehnt, insbesondere `role`, `redirect_url`/Callback, `actor_id`, `password`, `metadata`, `user_metadata`, `app_metadata`, Adminflag, Profilobjekt oder Invite-Token. Der Client kann damit weder Rolle noch Redirect noch Actor bestimmen.

## 14. Service- und Action-Zielbild

`lib/actions/reviewer-invitation-service.ts` soll später: (1) strikt validieren, (2) Session laden, (3) Profil laden/validieren, (4) `canInviteReviewer` prüfen, (5) mit engem Auth-Read bestehende Benutzer/zulässige Invite-Indikatoren prüfen, (6) Reviewer als Konstante erzwingen, (7) feste Deployment-Redirect-URL wählen, (8) engen Invite-Adapter aufrufen, (9) atomare Profilanlage per Read-after-write bestätigen, (10) nur echten Erfolg sanitisiert auditieren und (11) ein geschlossenes fachliches Resultat liefern. Keine PII-/Providerlogs, kein stilles Repair.

`lib/actions/reviewer-invitation.ts` soll nur den Service delegieren. Keine eigene Auth-Admin-Logik, Rolle oder freie URL; kein Redirect. `revalidatePath("/admin/users")` nur bei bestätigtem `reviewer_invited`, nicht bei pending/Fehler. Die UI darf den Service/Adapter nie direkt importieren.

## 15. Geschlossene Resultatcodes und neutrale UI-Texte

| Code | Deutscher UI-Text |
| --- | --- |
| `reviewer_invited` | „Die Reviewer-Einladung wurde gesendet.“ |
| `reviewer_already_exists` | „Für diese E-Mail-Adresse besteht bereits ein Reviewer-Zugang.“ |
| `reviewer_invitation_pending` | „Für diese E-Mail-Adresse besteht bereits eine Einladung.“ |
| `reviewer_invitation_forbidden` | „Du darfst keine Reviewer einladen.“ |
| `reviewer_invitation_invalid_email` | „Bitte gib eine gültige E-Mail-Adresse ein.“ |
| `reviewer_invitation_conflict` | „Für diese E-Mail-Adresse kann keine neue Reviewer-Einladung erstellt werden.“ |
| `reviewer_invitation_configuration_error` | „Die Einladungsfunktion ist derzeit nicht korrekt konfiguriert.“ |
| `reviewer_invitation_failed` | „Die Einladung konnte nicht gesendet werden. Bitte versuche es später erneut.“ |
| `reviewer_profile_inconsistent` | „Der Benutzerzugang ist unvollständig. Bitte nicht erneut einladen und die Administration prüfen.“ |

Nur `reviewer_invited` ist Erfolg. Providercodes/-texte, Existenzdetails außerhalb der Adminseite, Links und Rohfehler bleiben serverseitig. „Gesendet“ bedeutet Provider-API-Erfolg, nicht garantierte Zustellung.

## 16. Idempotenz, Doppelsubmit und Race Conditions

- UI deaktiviert beim ersten Submit sofort; Service akzeptiert trotzdem keine Client-Idempotenzbehauptung.
- Vorabgleich über Auth-Read reduziert Wiederholungen, ist aber kein Lock. Zwei parallele Requests können beide „nicht vorhanden“ sehen. Auths E-Mail-Eindeutigkeit/Invite-Endpunkt ist die autoritative Race-Grenze: höchstens einer darf als bestätigter Erfolg gelten; der andere wird nach Fehler durch erneutes enges Lesen als pending/already/conflict klassifiziert, nur wenn die Zustandsregeln dies beweisen.
- Ein Prozesslokal-Lock ist in serverlosen Deployments unzureichend. Ein DB-Lock kann den externen Auth-HTTP-Aufruf nicht sicher atomar umschließen. Für MVP sind Auth-Eindeutigkeit, Read-after-error und keine automatische Wiederholung die tragfähige Idempotenzgrenze. Falls der Provider parallele Invites mehrfach mailt, ist vor Production eine persistente serverseitige Invite-Command-/Idempotency-Grenze als eigene Migration zu entscheiden.
- Rate Limit: UI-Doppelsubmitschutz plus serverseitiges Limit pro Actor und normalisierter Zieladresse, ein kleiner Burst und Cooldown; konkrete Werte müssen mit Supabase-/SMTP-Limits im Production Gate festgelegt werden. Keine unbegrenzten Retries. Wiederholte forbidden/invalid-Versuche werden ohne PII-Inhalt sicherheitsseitig messbar gemacht, aber nicht mit Roh-E-Mail geloggt.

## 17. Teilfehlermatrix

| Situation | Fachliches Ergebnis | Recovery/Verbot |
| --- | --- | --- |
| Auth-Invite erfolgreich, Trigger-/Profilanlage fehlgeschlagen | Unter C muss die Auth-Transaktion fehlschlagen; falls Auth dennoch sichtbar ist: `reviewer_profile_inconsistent`. | Kein zweiter Invite, kein Auto-Delete; Reconciliation/Owner-Runbook. |
| Profil vorhanden, Invite fehlgeschlagen | Unter C regulär unmöglich; vorhandenes Profil ohne passenden Auth-User verletzt FK. | Als schwere Inkonsistenz inventarisieren; keine stille Reparatur. |
| Einladung bereits vorhanden | Nur bei belastbarer Auth-Wahrheit `reviewer_invitation_pending`. | Keine Resend-Funktion im MVP; neutral anzeigen. |
| Benutzer existiert bereits | Reviewerprofil: `reviewer_already_exists`; Admin/fehlendes/abweichendes Profil: conflict/inconsistent. | Nie als neue Einladung behandeln, nie Rolle ändern. |
| E-Mail ungültig/Zusatzfelder | `reviewer_invitation_invalid_email`. | Kein Provideraufruf, kein Audit-Erfolg. |
| Provider-/SMTP-/Netzfehler | `reviewer_invitation_failed`. | Keine Rohdetails; Read-after-error bevor ein Retry erlaubt wird. |
| Secret/URL fehlt oder Redirect falsch | `reviewer_invitation_configuration_error`. | Fail closed; Deployment korrigieren, keinen Defaultredirect verwenden. |
| Wiederholter Submit | UI blockiert; serverseitig Vorabgleich/Rate Limit. | Höchstens erster bestätigter Erfolg; keine automatische Wiederholung. |
| Parallele Einladung derselben E-Mail | Auth-Eindeutigkeit entscheidet; nachlesen und eng klassifizieren. | Nie zwei Erfolge behaupten; Providerverhalten im Integrationstest prüfen. |
| Auditinsert nach erfolgreichem Invite scheitert | Auth und App-Audit sind nicht transaktional koppelbar. | Einladung nicht löschen; operativer `audit_pending`-Alarm/Reconciliation nötig, Client erhält keinen falschen Retry-Anreiz. Owner muss entscheiden, ob Erfolg trotz Auditstörung angezeigt wird. |
| Nicht freigegebener/abgelaufener/replayed Link | neutrale Invite-Fehlerseite. | Kein neuer Invite aus öffentlicher Route, kein Tokenlog. |

## 18. Audit Logging und Datenschutz

Für bestätigten Erfolg ist `action = reviewer_invited` vorgesehen: `actor_id`, sicher validierte Ziel-Auth-ID als `entity_id`, `entity_type = profile` oder eine vor Implementierung festgelegte enge Konstante, sanitisiertes Ergebnis `reviewer_invited`, Zeitpunkt. Die vollständige E-Mail ist **nicht erforderlich** und kommt nicht ins Audit. Ein normalisierter Hash wird für MVP ebenfalls nicht eingeführt, weil das Modell ihn nicht braucht und eine neue Hash-/Pepper-/Kollisionsarchitektur unverhältnismäßig wäre.

In der Admin-UI darf die Auth-E-Mail gemäß bestehendem Read-only DTO angezeigt und im Eingabefeld verarbeitet werden. In Server-/Browser-/Platformlogs erscheinen weder volle E-Mail noch FormData, Link, Token, Secret, Providerantwort, Metadaten, Identitäten, Passwort, Redirect-Token oder Sessiondaten. Fehlerobjekte werden nicht geloggt; Telemetrie enthält nur Code, Actor-ID soweit zulässig, Ziel-UUID soweit sicher und Zeitpunkt. Adapteroutputs sind strukturell so minimiert, dass versehentliches Logging keine Tokens/Providerdetails enthalten kann. E-Mail-Queryparameter und URL-Fragmente sind verboten; `Referrer-Policy`, Analytics-Redaktion und Error-Tracker-Scrubbing sind Production Gates.

## 19. UI-Zielbild und Accessibility

Kleine Admin-only Erweiterung auf `/admin/users`: Button „Reviewer einladen“, explizit bestätigtes Formular mit Label „E-Mail-Adresse“, Hinweis „Es können ausschließlich Reviewer eingeladen werden“, Pendingtext „Einladung wird gesendet …“, Doppelsubmitschutz, Erfolg und neutrale Fehler. Kein Rollen-Select, keine Adminoption, Passwortvergabe, Deaktivierung oder Linkanzeige. Reviewer erhalten weder Control noch nutzbare Action.

Das Eingabefeld erhält korrekt verknüpftes Label, `type="email"`, `autocomplete="email"`, `inputMode="email"` und verständliche Fehlerzuordnung. Während Submit: Form/Region `aria-busy`, Submit tatsächlich `disabled` plus konsistentes `aria-disabled`. Pending/Erfolg über `role="status"`/Live-Region, Fehler über `role="alert"`. Nach Fehler Fokus auf Feld/Fehlerzusammenfassung; nach Erfolg Fokus auf Erfolgstatus und danach sinnvoll zurück zum Invite-Button. Vollständige Tastaturbedienung, sichtbarer Fokus, kein farballeiniges Feedback. Explizite Bestätigung muss tastatur- und screenreader-tauglich sein.

## 20. Production-, Preview- und Local-Gates

### Production

1. Production-Supabase-Projekt und serverseitiger Production-Service-Role-Key; kein Clientimport/Leak.
2. Owner legt exakte feste HTTPS-Production-Domain/Invite-Route fest; nur diese steht in der Auth Redirect Allowlist.
3. Auth-Trigger/Migration aus AP-14-03-01 installiert und gegen reale Auth-Version validiert; SMTP/E-Mail-Provider, Templates, Ablauf und Rate Limits geprüft.
4. Zweite **eigene** Test-E-Mail verwenden: Admin lädt ein, Mail empfangen, Link einmal öffnen, Passwort setzen, als Reviewer einloggen.
5. Auth-User und genau ein Profil vorhanden; `role = reviewer`; E-Mail nicht in Profil/Audit; Invite-Token nirgends geloggt.
6. Adminnavigation verborgen; Gallery/Medienansicht erlaubt; Reviewer-Mutationen abgelehnt; ursprünglicher Admin unverändert. Wiederverwendung/abgelaufener Link und paralleler Doppelsubmit negativ testen.
7. Read-only Liste zeigt Ziel-E-Mail, Reviewerprofil und nur einen freigegebenen engen Authstatus. Ohne freigegebene Semantik bleibt `auth_status = unknown`.

### Preview

Keine Production-Invites. Nur vollständig getrennte Preview-Supabase-Instanz mit getrenntem Secret, SMTP/Testmailbox, fester Preview-URL und eigener Redirect-Allowlist; keine echte Kunden-E-Mail. Bei fehlender Trennung ist die Funktion deaktiviert/fail closed.

### Local

Nur lokale Supabase-Umgebung oder ausdrücklich freigegebene Testumgebung, lokale Testmailbox und feste freigegebene Loopback-URL. Niemals Production-Service-Role-Key oder reale Kunden-E-Mail.

### Separates AP-14-02-Gate

Die Production-Migration `202607310001_user_role_change_rpc.sql` ist laut Owner derzeit nicht installiert. Das betrifft AP-14-02 Production Validation. AP-14-03 installiert, verändert oder umgeht diese Migration nicht heimlich; Reviewer-Invite-Freigabe hebt dieses separate Gate nicht auf.

## 21. Spätere Teststrategie (keine Tests in diesem Paket)

- **Schema:** gültige E-Mail, Trim/Normalisierung, max. Länge, ungültig/fehlend; Zusatzfelder einschließlich `role`, `redirect_url`, `metadata` abgelehnt.
- **Permission:** Admin erlaubt; Reviewer, fehlende Session, fehlendes Profil, ungültige Rolle abgelehnt.
- **Adapter:** installierte Signatur; feste Redirect-URL; kein Clientredirect; keine Token-/Link-/Rohdaten; Config-/Providerfehler; bestehender Benutzer und paralleler Invite; server-only und kein generischer Client.
- **DB/Auth:** Trigger legt exakt Reviewerprofil atomar an, Zeitstempel/UUID/FK korrekt; Triggerfehler rollt Invite zurück; keine Metadata-Rollenerhöhung; vorhandener Auth-/Profilfall; Parallelität und Replay. Migration, RLS und Grants explizit testen.
- **Service:** Erfolg, feste Reviewerrolle, already/pending/conflict, Profil-/Authteilfehler, Read-after-error, neutrale geschlossene Codes, Audit nur bei echtem Erfolg, kein Secret/Link/Providerdetail.
- **UI:** nur Admin sieht Invite; E-Mail, Bestätigung, Pending, Doppelsubmit, Fokus, Erfolg/Fehler; kein Rollen-Select/Admin/Passwort/Link.
- **Architektur:** getrennte Adapter; kein Client-Service-Role-Import, kein Storage-Purge-Reuse, kein Public Signup, keine freie Passwortvergabe, keine E-Mail-Spiegelung, keine Environment- oder `package.json`-Änderung.
- **Production E2E:** ausschließlich die zweite eigene Adresse nach den Gates in Abschnitt 20; ursprünglichen Admin vor/nachher verifizieren.

## 22. Offene Risiken und Owner-Entscheidungen

1. Variante C und die Auswirkung eines unconditional Reviewer-Triggers auf jeden künftig erlaubten Auth-Anlageweg müssen ausdrücklich freigegeben und real integriert getestet werden.
2. Exakte Production-Domain, Invite-Route, Auth-Allowlist, SMTP, Linkablauf und Passwortsetzmechanik sind nicht im Repository belegt.
3. Die installierte Client-API garantiert keine stabile fachliche Fehlerklassifikation für existing/pending; die reale GoTrue-Version muss vermessen werden. Nicht beweisbare Fälle bleiben conflict/failed/unknown.
4. `auth_status` bleibt bis zu einer engen Wahrheitstabelle `unknown`; Zustellung und Passwortzustand dürfen nie geraten werden.
5. Auth-Invite und App-Audit sind nicht gemeinsam transaktional; Audit-Outage/Reconciliation braucht eine Owner-Entscheidung.
6. Ein persistentes Rate-Limit/Idempotency-Ledger könnte eine zusätzliche Migration und PII-arme Schlüsselstrategie benötigen; konkrete Limits fehlen noch.
7. `/admin` ist nicht middlewaregeschützt. Page/Service bleiben autoritativ; eine spätere Middleware-Härtung ist nicht Teil dieses Pakets.
8. AP-14-02 Production-RPC bleibt separat offen; Gesamtprodukt ist nicht Production Ready.

## 23. Folgepakete

- **AP-14-03-01 — Reviewer Invitation Database and Auth Baseline:** Owner-Decision-Freeze abschließen; sichere Profil-Trigger-Migration, explizite RLS/Grants, Permission, striktes Schema, enger Invite-Adapter, feste Deployment-Redirect-Grenze, Invite-Annahme/Passwortarchitektur, Service/Action, Audit/Reconciliation und Unit-/Integrationstests. Falls sichere Profilanlage eine Migration verlangt, liegt sie ausschließlich hier.
- **AP-14-03-02 — Reviewer Invitation UI:** kleine Admin-only UI auf `/admin/users`, Accessibility, Pending/Doppelsubmit, neutrale Resultate und UI-Tests.
- **AP-14-03-03 — Reviewer Invitation Production Validation:** getrennte Umgebungen/Allowlist/SMTP prüfen und den kompletten zweiten-eigenen-E-Mail-Flow samt Rollen-/Zugriffs-/Log-Negativtests validieren.

Keine Folgearbeit ist durch dieses Audit bereits zur Implementierung freigegeben.

## 24. Scope-Bestätigung

Dieses Paket enthält **ausschließlich dieses Auditdokument**. Es enthält keine Einladung, Benutzeranlage, Implementierung, UI-Änderung, Server Action, Service, Auth-Adapter, Migration, SQL-/RPC-/RLS-/Grant-/Auth-Konfigurationsänderung, Service-Role-Änderung, Environment-Variable, E-Mail, Teständerung, `package.json`-Änderung oder externe Abhängigkeit. Es implementiert weder KI noch WhatsApp.

**Auditstatus: READY FOR OWNER DECISION.**
**Ausdrücklich nicht: APPROVED FOR IMPLEMENTATION.**
**Nicht Production Ready.**

## AP-14-03-01 Reviewer Invitation Database and Auth Baseline Result

AP-14-03-01 implementiert ausschließlich die Datenbank-, Auth-, Adapter-, Service- und Action-Baseline. Die additive Migration `202607310002_reviewer_invitation_profile_trigger.sql` installiert einen `AFTER INSERT`-Trigger auf `auth.users`. Seine `SECURITY DEFINER`-Funktion hat den festen `search_path = public, pg_temp` und fügt nur `NEW.id` sowie das SQL-Literal `'reviewer'::public.app_role` in `public.profiles` ein. Sie liest weder E-Mail noch User-/App-Metadaten, führt kein Update, Upsert oder Backfill aus und scheitert bei einem unerwarteten Primärschlüsselkonflikt zusammen mit dem Auth-Insert. `EXECUTE` ist `PUBLIC`, `anon` und `authenticated` entzogen; PostgreSQL führt die Funktion als Trigger dennoch aus, weil ein Triggeraufruf keine direkte Funktions-EXECUTE-Berechtigung des aufrufenden Browserroles voraussetzt. Es wurden keine Policy und keine Tabellenrechte ergänzt.

Der Trigger gilt bewusst für jeden künftig eingefügten Auth-Benutzer: neue Auth-Anlagen erhalten standardmäßig ein Reviewerprofil. Anwendungscode enthält weiterhin weder Self-Signup noch Admin-Einladung oder freie `createUser`-Anlage. Eine spätere Admin-Ernennung bleibt ausschließlich dem kontrollierten AP-14-02-Rollenwechsel vorbehalten. Der initiale Admin und alle bestehenden Auth-Benutzer/Profile bleiben unverändert; es gibt keinen Backfill und keine Rollenreparatur.

`canInviteReviewer` erlaubt nur `admin` und lehnt `reviewer`, `null` sowie ungültige Werte fail closed ab. `inviteReviewerSchema` akzeptiert strikt ausschließlich eine getrimmte, nicht leere, syntaktisch gültige E-Mail mit höchstens 254 Zeichen. Rolle, Actor, Redirect, Passwort und Metadaten sind keine Eingabefelder.

Der neue server-only Auth-Invite-Adapter besitzt genau eine Invite-Capability. Er verlangt `NEXT_PUBLIC_SUPABASE_URL`, den ausschließlich serverseitigen `SUPABASE_SERVICE_ROLE_KEY` und `REVIEWER_INVITE_REDIRECT_URL`; es gibt keinen Anon-Fallback und keinen exportierten Adminclient. Production akzeptiert ausschließlich HTTPS. Außerhalb Production ist HTTP nur für Loopback erlaubt. Die URL wird weder aus Browserdaten abgeleitet noch zurückgegeben oder geloggt. Der Adapter verwendet die installierte Signatur `inviteUserByEmail(email, { redirectTo })` von `@supabase/auth-js 2.111.0`, sendet keine Metadaten und reduziert Erfolg unmittelbar auf eine validierte Auth-UUID beziehungsweise Fehler auf `configuration` oder `provider`.

Die Bestandsprüfung erweitert ausschließlich den bestehenden server-only Read-Adapter um eine exakte E-Mail-Prüfung, die niemals Authobjekte oder E-Mail-Daten zurückgibt. Mangels installierter `getUserByEmail`-Methode verwendet sie `listUsers` seitenweise mit 50 Einträgen und einem statischen Maximum von 10.000 Benutzern; die Provider-Eindeutigkeit bleibt danach die autoritative Race-Grenze. Es wurde keine Mutation zum Read-Adapter ergänzt. Bereits gefundene Benutzer ergeben `reviewer_already_exists`. Ein nicht zuverlässig klassifizierbarer Providerfehler — einschließlich eines parallelen Duplicate-Races — wird neutral auf `reviewer_invitation_conflict` abgebildet; `reviewer_invitation_pending` wird mangels beweisbarer Providersemantik nicht erfunden. Es gibt keinen Retry und keine automatische Rollenänderung.

Der testbare Service validiert Eingabe, Session, Actorprofil und Rolle, prüft die dedizierte Permission, führt Bestandsprüfung und genau einen Adapteraufruf aus und bestätigt danach für die zurückgegebene UUID ein Profil mit Rolle `reviewer`. Fehlendes oder abweichendes Profil ergibt `reviewer_profile_inconsistent`; es gibt keinen Profilinsert, keine Reparatur und keine Rollenmutation im Service. Die Action akzeptiert typisiert nur `{ email }`, verwendet den authentifizierten Cookie-Serverclient und injiziert die engen Datenquellen. Sie enthält keine eigene Rollenentscheidung, Auth-Admin-Methode, Clientrolle, Clientredirect-URL oder Weiterleitung. Nur `reviewer_invited` revalidiert `/admin/users`; alle anderen Codes revalidieren nicht. Es wurde keine UI-Datei geändert.

Nach bestätigtem Reviewerprofil schreibt die Action über die eng signierte RPC `record_reviewer_invitation_audit(uuid)` das Ereignis `reviewer_invited`. Die RPC bezieht den Actor aus `auth.uid()`, prüft erneut Adminrolle und Reviewerziel und schreibt nur Actor-ID, Ziel-ID, Action, `result_code` und Zeitpunkt. E-Mail, Link, Token, Providerdaten, Auth-Metadaten, Session, Passwort und Redirect fehlen. Auth-HTTP-Aufruf, Profiltrigger und Audit-RPC bilden keine gemeinsame Anwendungstransaktion. Ein Auditfehler versendet nicht erneut und wird kontrolliert neutral behandelt; Recovery bleibt ein manueller separater Betriebsfall.

Die Servicegrenze verwendet die geschlossenen Codes `reviewer_invited`, `reviewer_already_exists`, `reviewer_invitation_forbidden`, `reviewer_invitation_invalid_email`, `reviewer_invitation_conflict`, `reviewer_invitation_configuration_error`, `reviewer_invitation_failed` und `reviewer_profile_inconsistent` mit stabilen deutschen Meldungen. `reviewer_invitation_pending` ist als Meldungsvertrag vorhanden, wird aber ohne verlässliche Erkennung nicht erzeugt. Antworten enthalten keine E-Mail, URL, Links, Tokens, Session- oder Providerdetails.

Gezielte Vitest-Tests decken Schema-Allowlist und Trimming, Länge/Fehlerfälle, Permission, Admin-Erfolg, Auth-/Profil-/Rollenverbote, Bestandsfund, Duplicate-Konflikt, Konfiguration, Profilkonsistenz, fehlenden Retry sowie statische Trigger-, Adapter- und Action-Sicherheitsmerkmale ab. `package.json`, Rollenwechsel-RPC, UI und Storage-Purge-Client bleiben unverändert.

Die feste Redirect-URL kann erst auf einen vollständigen Invite-Annahme-/Passwort-setzen-Flow zeigen, wenn AP-14-03-02 beziehungsweise ein freigegebenes Folgegate diese UX und die reale Supabase-Redirect-/SMTP-Konfiguration implementiert und validiert. AP-14-03-01 baut keine halbfertige Route oder Passwort-UI. Laut aktualisierter Nutzerangabe wurde `202607310001_user_role_change_rpc.sql` inzwischen manuell im Production-Supabase-Projekt ausgeführt; dieses Paket installiert, verändert oder dupliziert sie nicht.

**REVIEWER INVITATION DATABASE AND AUTH BASELINE IMPLEMENTED**

**REVIEWER INVITATION UI NOT IMPLEMENTED**

**REVIEWER INVITE ACCEPTANCE AND PASSWORD FLOW NOT PRODUCTION VALIDATED**

**USER DEACTIVATION NOT IMPLEMENTED**

**OVERALL PRODUCT NOT PRODUCTION READY**
