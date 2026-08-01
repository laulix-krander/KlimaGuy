# AP-14-03-03-00 — Invite Acceptance & Password Setup Audit

**Datum:** 2026-08-01  
**Typ:** ausschließlich Audit und Dokumentation  
**Auditstatus:** **READY FOR OWNER DECISION**  
**Produktionsstatus:** **NOT PRODUCTION READY.**

## 1. Auftrag, Grenzen und belastbare Ausgangslage

Dieses Dokument plant die Annahme einer bereits erfolgreich versendeten Reviewer-Einladung und das erstmalige Setzen eines Passworts. Die bereits validierte Versand-, Auth-User-, Profiltrigger-, Reviewerrollen-, Benutzerlisten- und grundsätzliche Redirect-Kette wird nicht erneut untersucht.

Das Audit wertet ausschließlich die offizielle Supabase-Dokumentation und die im Projekt installierte offizielle JavaScript-Client-Version `@supabase/auth-js 2.111.0` aus. Es wurden keine Communitylösungen übernommen. Wichtig: Supabase dokumentiert mehrere zulässige E-Mail-Template-/Flow-Varianten. Deshalb werden nachfolgend **der gegenwärtige Standard-Invite-Flow** und **die für SSR empfohlene Token-Hash-Variante** getrennt beschrieben; ihre Parameter dürfen nicht vermischt werden.

### 1.1 Quellenbasis (nur offizielle Supabase-Quellen)

Stand dieses Audits sind insbesondere:

- [Admin: Invite a user by email](https://supabase.com/docs/reference/javascript/auth-admin-inviteuserbyemail)
- [Update a user](https://supabase.com/docs/reference/javascript/auth-updateuser)
- [Verify and log in through OTP](https://supabase.com/docs/reference/javascript/auth-verifyotp)
- [Exchange an auth code for a session](https://supabase.com/docs/reference/javascript/auth-exchangecodeforsession)
- [Password-based authentication](https://supabase.com/docs/guides/auth/passwords)
- [Email templates](https://supabase.com/docs/guides/auth/auth-email-templates)
- [Redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls)
- [Creating a Supabase client for SSR](https://supabase.com/docs/guides/auth/server-side/creating-a-client)
- [Next.js server-side auth guide](https://supabase.com/docs/guides/auth/server-side/nextjs)
- [Implicit flow](https://supabase.com/docs/guides/auth/sessions/implicit-flow)
- [PKCE flow](https://supabase.com/docs/guides/auth/sessions/pkce-flow)

Eine wortgetreue Production-URL einschließlich eines echten Geheimnisses wird aus Sicherheitsgründen weder erhoben noch in diesem Repository abgelegt. Das ist keine Erkenntnislücke hinsichtlich des Protokolls: Die exakte dokumentierte URL-Konstruktion steht in Abschnitt 2. Für eine Production-Freigabe ist zusätzlich ein kontrollierter Blackbox-Nachweis mit redigierten Werten erforderlich.

## 2. Supabase-Invite-Flow: URL, Parameter, Tokens und Session

### 2.1 Was `inviteUserByEmail` erzeugt

`supabase.auth.admin.inviteUserByEmail(email, { redirectTo })` legt den eingeladenen Benutzer an und versendet die konfigurierte **Invite user**-E-Mail. Die offizielle Invite-API unterstützt ausdrücklich **kein PKCE**, weil ein anderer Browser die Einladung annehmen kann als derjenige, der sie ausgelöst hat. Der in KlimaGuy gesetzte `redirectTo` wird serverseitig übergeben und muss in Supabase als zulässige Redirect-URL konfiguriert sein.

Die tatsächliche URL im E-Mail-HTML wird ausschließlich vom aktiven Supabase-E-Mail-Template bestimmt:

| Template-Variante | Exakte URL-Konstruktion | Geheimnis im Link |
|---|---|---|
| Supabase-Standard mit `{{ .ConfirmationURL }}` | Supabase setzt `ConfirmationURL` zu einem Auth-Verify-Endpunkt der Form `https://<project-ref>.supabase.co/auth/v1/verify?token=<opaque-token>&type=invite&redirect_to=<URL-encoded redirectTo>`. Nach erfolgreicher Verifikation antwortet Auth mit einem Redirect auf `redirectTo` und hängt die impliziten Sessionwerte im URL-Fragment an. | Ein einmalig zu verifizierender Invite-Token in `token`; danach Access- und Refresh-Token im Fragment der Ziel-URL. |
| Für SSR selbst gebauter Link mit `{{ .TokenHash }}` | Das Template verlinkt direkt auf eine eigene Bestätigungsroute, beispielsweise `https://app.example/auth/confirm?token_hash={{ .TokenHash }}&type=invite&next=/auth/invite`. Die eigene Route übergibt `token_hash` und `type` an `verifyOtp`. | Gehashter E-Mail-Token (`token_hash`), nicht Access-/Refresh-Token. Die nach `verifyOtp` entstandene Session wird in SSR-Cookies geschrieben. |

`{{ .RedirectTo }}` ist der an die Auth-Methode übergebene Redirect, `{{ .SiteURL }}` die konfigurierte Site URL, `{{ .TokenHash }}` der gehashte Verifikationstoken und `{{ .ConfirmationURL }}` der vollständig von Supabase erzeugte Bestätigungslink. Ein Template kann diese Variablen anders kombinieren. Daher ist **ohne Abgleich des aktiven Production-Templates keine andere konkrete URL-Behauptung zulässig**.

### 2.2 Standardlink: Klick und endgültige Browser-URL

Beim unveränderten `ConfirmationURL`-Template läuft der Klick so:

1. Der Browser fordert `/auth/v1/verify?token=…&type=invite&redirect_to=…` beim Supabase-Auth-Server an. Zu diesem Zeitpunkt existiert im Zielbrowser nicht allein durch den Klick schon eine KlimaGuy-Cookie-Session.
2. Supabase prüft und verbraucht den Invite-Link und leitet auf den erlaubten `redirectTo` um.
3. Die Ziel-URL hat bei Erfolg die dokumentierte implizite Form
   `REVIEWER_INVITE_REDIRECT_URL#access_token=…&refresh_token=…&expires_in=…&expires_at=…&token_type=bearer&type=invite`.
   Provider-Tokens sind für den E-Mail-Invite nicht zu erwarten. Fehler werden statt einer Session mit `error`, `error_code` und `error_description` zurückgeleitet.
4. Ein Browser-Supabase-Client mit `detectSessionInUrl: true` erkennt den impliziten Callback, validiert den Benutzer, persistiert die Session und entfernt das Fragment. **Erst dieser Verarbeitungsschritt** macht die Session im Client verfügbar. Weil URL-Fragmente nicht an den Server gesendet werden, kann eine Next.js Server Component die Fragmenttokens nicht einlesen und nicht selbst in Cookies umwandeln.

`detectSessionInUrl` genügt damit technisch für einen reinen Browser-/Implicit-Client, sofern der Client auf der Zielseite tatsächlich initialisiert wird und Sessionpersistenz korrekt eingerichtet ist. Eine bloße Server-rendered `/login`-Seite ohne initialisierten Browserclient genügt nicht.

### 2.3 Ist `exchangeCodeForSession` notwendig?

**Nein, nicht für `inviteUserByEmail`.** `exchangeCodeForSession(code)` gehört zum PKCE-Code-Flow. Die Invite-API unterstützt laut offizieller API-Dokumentation kein PKCE; der Standard-Invite-Redirect enthält daher keinen austauschbaren `code`. Ein Aufruf wäre nicht nur unnötig, sondern würde den falschen Flow modellieren.

Auch in der SSR-Token-Hash-Variante ist `exchangeCodeForSession` nicht die richtige API: Dort bestätigt die Route `token_hash` und den Typ `invite` mit `verifyOtp`. `verifyOtp` liefert Benutzer und Session; der SSR-Client schreibt die Session in Cookies.

### 2.4 Ist `setSession` notwendig?

**Nein, in keiner empfohlenen Variante.** Beim Implicit-Flow verarbeitet der Client die Fragmentwerte selbst. Beim SSR-Token-Hash-Flow erstellt `verifyOtp` die Session. `setSession({ access_token, refresh_token })` ist eine offizielle Low-Level-API für bereits vorhandene Tokenpaare, aber weder Invite-Verifikation noch Codeaustausch. Ein manueller Aufruf würde zusätzliche Tokenhandhabung schaffen und ist hier nicht erforderlich.

### 2.5 Offiziell bevorzugte Variante für diese Anwendung

Für eine Next.js-App mit `@supabase/ssr` empfiehlt die aktuelle Supabase-SSR-Dokumentation einen eigenen serverseitigen E-Mail-Bestätigungsendpunkt, ein angepasstes Template mit `token_hash` und die Verifikation durch `verifyOtp`; so kann die Session serverseitig als Cookie gesetzt werden. Das ist die empfohlene Zielvariante für KlimaGuy.

Die Standard-`ConfirmationURL`-/Implicit-Variante bleibt offiziell unterstützt, ist aber für die vorhandene cookie- und serverseitig geschützte App schlechter passend: Tokens erscheinen vorübergehend im Fragment, die Sessionannahme hängt von Clientinitialisierung ab, und die Serverroute sieht die Fragmentdaten nicht. `detectSessionInUrl` ist daher eine Erklärung des bestehenden Standardflows, **nicht** die Architekturentscheidung dieses Audits.

## 3. Erstes Passwort: offizielle API-Kette

Supabase kennt keine separate `setInitialPasswordForInvite()`-API. Ein eingeladener Benutzer setzt das erste Passwort offiziell als **angemeldeter Benutzer** über:

```ts
await supabase.auth.updateUser({ password: newPassword })
```

`updateUser` verlangt eine gültige Session. Diese entsteht vorher genau einmal durch eine der beiden zulässigen Annahmeketten:

- Standard/Implicit: Auth-Verify-Link → Fragment-Session → Browserclient verarbeitet sie über `detectSessionInUrl` → `updateUser`.
- Empfohlen/SSR: eigener Confirm-Endpunkt → `verifyOtp({ token_hash, type: "invite" })` → Cookie-Session → Passwortseite → `updateUser`.

API-Abgrenzung:

| API | Rolle im Invite-/Passwortflow |
|---|---|
| `updateUser({ password })` | **Ja.** Offizielle Passwortmutation des eingeloggten eingeladenen Benutzers. |
| `verifyOtp({ token_hash, type: "invite" })` | **Ja, in der empfohlenen SSR-Variante.** Verifiziert den Template-Token und erzeugt die Session. |
| `exchangeCodeForSession(code)` | **Nein.** Ausschließlich PKCE-Codeaustausch; Invite unterstützt kein PKCE. |
| `setSession({ access_token, refresh_token })` | **Nein.** Kein Verifikationsmechanismus und für beide beschriebenen Ketten redundant. |
| `detectSessionInUrl` | **Nur Standard/Implicit.** Verarbeitet das Fragment clientseitig; keine Passwortmutation. |
| `resetPasswordForEmail` | **Nicht zur Erstannahme.** Gehört zum späteren Recovery-Flow. |
| `reauthenticate`/Nonce | **Nicht regulär zur Erstannahme.** Secure Password Change kann für nicht kürzlich angemeldete Sessions eine Reauthentifizierung verlangen; die frisch verifizierte Invite-Session ist regulär aktuell. Das konkrete Projektsetting ist vor Production zu prüfen. |

Nach erfolgreichem `updateUser` muss die Session weiterhin anhand `getUser()` serverseitig validiert werden; fachliche Reviewerrechte kommen unverändert aus `public.profiles`, nicht aus dem Link oder aus User-Metadaten.

## 4. Architekturvergleich und Empfehlung

### 4.1 Sinnvolle Routenzuschnitte

| Variante | Vorteile | Nachteile/Risiken | Urteil |
|---|---|---|---|
| `REVIEWER_INVITE_REDIRECT_URL=/login` | Keine neue URL. | Loginformular erwartet ein bereits bekanntes Passwort; erklärt Annahme nicht; verarbeitet serverseitig kein Fragment; lädt zu falscher Eingabe oder Recovery ein. | **Ablehnen.** |
| Eine Route `/auth/invite` erledigt Bestätigung und Passwortformular | Kurze Navigation. | Vermischt tokenverarbeitenden GET und wiederholbare UI; Reload/Back/Fehler und Tokenbereinigung sind schwerer sauber zu trennen. | Möglich, aber nicht bevorzugt. |
| `/accept-invite` als öffentliche Seite | Verständlicher Produktname. | Bei Token-Hash braucht es trotzdem einen technischen Confirm-Handler; sonst verarbeitet die Seite Geheimnisse und UI gemeinsam. | Nur als Alias/UX-Seite sinnvoll. |
| `/set-password` | Klare UI-Aufgabe, wiederverwendbar. | Ohne vorgelagerten Confirm-Handler ist unklar, woher die Session kommt; generischer Name kann Invite und Recovery ungewollt vermischen. | Mit separatem Handler möglich. |
| `/auth/confirm` + `/auth/invite` | Technischer, serverseitiger einmaliger Tokenverbrauch getrennt von barrierearmer Passwort-UI; Cookie vor UI; Token wird aus der sichtbaren Ziel-URL entfernt. | Zwei Routen und Templateänderung erforderlich. | **Empfohlen.** |

### 4.2 Empfohlene Zielkette

1. Das Invite-Template verweist auf den HTTPS-Endpunkt `/auth/confirm` mit `token_hash`, fest erwartbarem `type=invite` und einem intern kontrollierten nächsten Pfad.
2. `/auth/confirm` akzeptiert ausschließlich die eng validierten Parameter, erlaubt als `next` ausschließlich `/auth/invite` (oder verwendet gar keinen frei gelieferten `next`-Parameter), ruft auf dem SSR-Client `verifyOtp` auf und leitet bei Erfolg ohne Tokenparameter auf `/auth/invite` weiter.
3. `/auth/invite` verlangt eine gültige Cookie-Session, bestätigt serverseitig `getUser()` sowie das Reviewerprofil und rendert das Formular zum erstmaligen Passwortsetzen.
4. Die Passwortmutation ruft für genau den authentifizierten Benutzer `updateUser({ password })` auf. Sie nimmt weder User-ID, E-Mail noch Rolle vom Client entgegen.
5. Erfolg wird bestätigt; anschließend führt eine serverseitig sichere Weiterleitung zum vorgesehenen Reviewer-Startpunkt. Eine ausdrückliche Ownerentscheidung muss den Zielpfad festlegen.

### 4.3 Entscheidung zu `REVIEWER_INVITE_REDIRECT_URL`

**Nicht länger `/login`.** Falls das gegenwärtige `ConfirmationURL`-Template vorerst bestehen bleibt, soll die Variable mindestens auf eine dedizierte `/auth/invite`-Seite zeigen, die den Browserclient sicher initialisiert und die Implicit-Session abwartet.

Für die empfohlene SSR-Architektur sollte die Bedeutung der Variable zusammen mit dem Template bewusst neu festgelegt werden: Der Link zielt direkt auf `/auth/confirm`; danach geht es auf `/auth/invite`. Je nach Template wird dafür `RedirectTo`, `SiteURL` oder eine feste, umgebungsspezifische App-Origin verwendet. Der Owner muss Template und Environmentwert als **eine atomare Konfigurationsentscheidung** freigeben. Ein bloßes Umstellen der Variable ohne Templateabgleich ist nicht freigegeben.

## 5. Geplante Passwortseite

### 5.1 Formular und Regeln

- Zwei beschriftete Passwortfelder: „Neues Passwort“ und „Passwort wiederholen“; beide `type="password"`, Autocomplete `new-password`.
- Optionaler, zugänglicher Ein-/Ausblenden-Schalter je Feld; der Wert darf nie geloggt, in URL/Analytics oder Server-Action-State zurückgespiegelt werden.
- Client- und serverseitig dasselbe Schema: nicht leer, beide Werte identisch, maximale Länge zur Missbrauchsbegrenzung und die in Supabase konfigurierte minimale Passwortlänge. Keine eigene Regel darf schwächer als das Provider-Setting sein.
- Supabase empfiehlt als Mindestlänge mindestens 8 Zeichen; das Dashboard unterstützt eine Mindestlänge und Anforderungen an Zeichengruppen. Die endgültige UI-Regel muss vor Umsetzung aus den Production-Settings erhoben werden. Keine erfundene Komplexitätsregel, keine stille Trunkierung, kein Passwortstärkemesser mit externer Übertragung.
- Optional ist Supabase Leaked Password Protection eine serverseitige Projekteinstellung; ihr Zustand ist ein Production Gate, keine Annahme dieses Audits.

### 5.2 Zustände

1. **Session wird geprüft:** neutraler Ladehinweis, Formular noch nicht interaktiv.
2. **Bereit:** Regeln dauerhaft sichtbar; Submit eindeutig „Passwort speichern“.
3. **Lokaler Validierungsfehler:** leere/abweichende/regelwidrige Felder feldnah und in einer Fehlerzusammenfassung.
4. **Speichern:** genau ein Request, Felder und Submit gesperrt, `aria-busy`, Status „Passwort wird gespeichert …“.
5. **Providerfehler:** neutraler, handlungsfähiger Text; keine Rohmeldung. Sessionfehler führt zum Invite-Fehlerzustand, nicht zum normalen Loginformular.
6. **Erfolg:** „Dein Passwort wurde gespeichert.“; keine erneute Passwortdarstellung. Die durch die Invite-Bestätigung vorhandene Session bleibt angemeldet; anschließend kontrollierte Weiterleitung.
7. **Link ungültig/abgelaufen/verbraucht:** keine Passwortfelder; Erklärung und Kontakt zum Administrator. Ein allgemeiner Recovery-Link darf nur angeboten werden, wenn der Owner den separaten Recovery-Flow freigibt.

## 6. Security-Analyse

| Fall | Bewertung | Geplante Behandlung |
|---|---|---|
| Token-Leak | Standardflow trägt Invite-Token in der Verify-URL und danach Access-/Refresh-Token im Fragment. Fragmente gehen nicht im HTTP-Referer an den Server, bleiben aber bis zur Bereinigung in Browserhistorie/Screenshots/Extensions sichtbar. Token-Hash-SSR vermeidet Sessiontokens in der App-URL. | HTTPS, keine Logs/Analytics auf Confirm-Route, sofortige serverseitige Verifikation, tokenfreie Weiterleitung, `Referrer-Policy: no-referrer`, keine Drittinhalte. |
| Replay | E-Mail-Verifikationstoken ist zur einmaligen Verifikation vorgesehen; Session-/Refresh-Token haben eigene Lebensdauer und Rotation. | Zweiter Verbrauch endet neutral als ungültig/verbraucht. Niemals `setSession` mit kopierten Werten. |
| Abgelaufener Link | Supabase lehnt die Verifikation ab; Ablauf hängt von Auth-Konfiguration ab. | Spezifischer neutraler Endzustand; kein automatischer Resend. Konkrete Production-Laufzeit vor Freigabe erfassen. |
| Mehrfaches Öffnen / Reload / Back | Nach erfolgreichem Verbrauch darf die UI ausschließlich von der Cookie-Session abhängen. Ein Reload von `/auth/invite` bleibt möglich; Back auf den Confirm-Link darf keine zweite Mutation auslösen. | PRG-artige tokenfreie Weiterleitung; Confirm-Fehler bei Replay neutral. |
| Mehrere Tabs | Ein Tab kann den Link zuerst verbrauchen; eine bereits etablierte Session kann über den gemeinsamen Browser-Cookiestand in anderen Tabs sichtbar werden. | Jeder Tab validiert Session und Benutzer neu; kein Erfolg nur anhand lokalen UI-State. |
| Fremde Session | Ein Invite-Link kann in einem Browser mit bereits angemeldetem anderen Benutzer geöffnet werden. Das darf niemals dessen Passwort ändern. | Vor Bestätigung bestehende Identität erfassen/abgrenzen; nach `verifyOtp` muss `getUser()` exakt den eingeladenen Benutzer ergeben. Bei Abweichung abbrechen und kontrolliertes Ab-/Ummelden verlangen. Keine Mutation vor Identitätsprüfung. |
| Bereits eingeloggter Benutzer | Gleiches Risiko wie fremde Session; auch bei derselben Identität kann Passwort bereits gesetzt sein. | Explizite Zustandsprüfung, klare Identitätsanzeige höchstens datensparsam, kein stilles Überschreiben. Owner entscheidet, ob dieselbe Identität fortfahren darf. |
| Invite eines bestehenden Benutzers | `inviteUserByEmail`-Verhalten und Versand wurden als validierter Vorscope ausgeschlossen; eine Invite-Annahmeroute darf kein vorhandenes Konto „reparieren“ oder Rollen ändern. | Providerfehler neutral behandeln; keine Profil-/Rollenmutation, kein Signup-Fallback. |
| Offene Weiterleitung | Freies `next` könnte Token-/Sessionkontext auf fremde Origins lenken. | Relative Ziel-Allowlist oder festes Ziel; keine frei gelieferte Origin. |
| Cache/Indexierung | Confirm- und Passwortseiten enthalten Authzustand. | `no-store`, `noindex`, keine CDN-Seitencaches für benutzerspezifische Antworten. |

## 7. Race Conditions und Recovery

| Race | Erwartetes Ergebnis | Recovery |
|---|---|---|
| Zwei Tabs verifizieren denselben Link | Genau ein Tokenverbrauch gewinnt; der andere erhält verbraucht/ungültig oder nutzt nach eigener Sessionprüfung die bereits etablierte Cookie-Session. | Kein Resend/Retry im Handler; Seite neu laden oder Admin kontaktieren. |
| Passwort zweimal gleichzeitig absenden | UI sperrt synchron; serverseitig bleiben zwei zeitnahe `updateUser`-Aufrufe möglich. Der Provider serialisiert Mutationen, praktisch könnte das zuletzt akzeptierte Passwort gewinnen. | Ein Request pro UI; nach Erfolg Session/User erneut validieren. Kein eigener DB-Lock vorsehen. E2E muss Providerverhalten erfassen. |
| Link doppelt anklicken | Wie Zwei-Tab-Fall; zweite Navigation darf keinen zweiten fachlichen Vorgang erzeugen. | Tokenfreie Zielseite und idempotente Zustandsdarstellung. |
| Bereits verwendeter Link | Verifikation schlägt fehl; eine vorhandene gültige Session darf nicht allein wegen des Replay-Fehlers gelöscht werden. | Wenn Identität eindeutig und Session gültig ist, direkt den passenden Zustand zeigen; sonst neutraler Fehler. |
| Ablauf zwischen Seitenaufruf und Submit | Access-Token kann ablaufen; ein gültiger Refresh-Token kann die Session aktualisieren. Fehlt die Session, scheitert `updateUser`. | SSR-Middleware/Clientrefresh, danach ein klarer Session-abgelaufen-Zustand; Passwortwerte löschen, kein automatisches Mutation-Retry. |
| Recovery nach abgelaufenem Invite | Passwort-Recovery setzt ein bestätigtes, bestehendes Konto und einen separat konfigurierten Recovery-Flow voraus; es ist kein Ersatz für ungeklärte Invite-Annahme. | Zunächst Admin-Kontakt/gezielter Resend als späteres Paket. Recovery nur nach eigenem Audit und Ownerfreigabe. |

Eine „Passwort bereits gesetzt“-Wahrheit wird nicht aus UI-State, `last_sign_in_at` oder Profildaten geraten. Falls das Produkt diesen Zustand unterscheiden muss, braucht es vor Implementierung einen belastbaren, providerseitig getesteten Zustandsvertrag.

## 8. UX- und Accessibility-Plan

- Mobile-first, einspaltig, mindestens 44 px große Ziele, keine horizontale Überläufe und Passwortregeln ohne Hoverabhängigkeit.
- Semantische Überschrift „Einladung annehmen“, kurze Erklärung „Lege dein Passwort für den Reviewer-Zugang fest.“ und keine interne Auth-Terminologie.
- Beim Laden bleibt der Fokus stabil; nach Abschluss der Sessionprüfung geht er auf die Überschrift oder das erste Feld. Bei Fehlern geht er auf die fokussierbare Fehlerzusammenfassung (`role="alert"`), die mit den Feldern verknüpft ist.
- `label`, `aria-describedby`, sichtbare Hinweise und programmatisch eindeutige Fehlermeldungen; Farbe nie als einziges Signal.
- Live-Status mit `role="status"`/`aria-live="polite"`; kein wiederholtes Screenreader-Announcement bei jedem Tastendruck.
- Nach Submit Fokus auf Erfolgsmeldung, kurze wahrnehmbare Bestätigung und keine überraschende Sofortnavigation. Danach eindeutig angekündigte Weiterleitung und ein manueller Link als Fallback.
- Fehlertexte unterscheiden handlungsrelevant: ungültig/abgelaufen/verbraucht, Sessionkonflikt, Passwortregel und temporärer Fehler. Sie zeigen nie Token, Provider-Rohtext, E-Mail-Existenz oder Stacktrace.
- Back Button und Reload zeigen einen aus Session und Serverwahrheit rekonstruierten Zustand, nicht alte Passwörter oder einen falschen Erfolg aus Client-State.

## 9. Testplan — keine Tests implementiert

### 9.1 Unit

- Queryschema für `token_hash`, exakt erlaubte `type`-Werte und feste/allowlist-basierte `next`-Ziele.
- Passwortschema: leer, Mindest-/Maximallänge, Production-Regel, Übereinstimmung, Unicode und keine Trunkierung.
- Mapper von Supabase-Fehlern auf geschlossene, neutrale UI-Zustände; keine Rohdetails.
- Zustandsautomat für Loading, Ready, Pending, Error und Success; Doppelsubmit-Gate.

### 9.2 Service-/Action-Vertrag

- `verifyOtp` genau einmal mit validiertem `token_hash` und `type: "invite"`; niemals `exchangeCodeForSession`, `setSession`, Admin-API oder Service Role.
- `getUser()` und Reviewerprofilprüfung vor Passwortmutation; fremde/fehlende Session fail closed.
- `updateUser` erhält ausschließlich `{ password }`; keine User-ID, Rolle, E-Mail oder Metadaten.
- Token, Passwort, Session und E-Mail erscheinen weder in Logs, Fehlerantworten noch Analytics.

### 9.3 UI

- Beide Felder, Labels, Autocomplete, Regeln, Mismatch, Pending-Sperre, Status, Fehlerzusammenfassung, Fokus und Success.
- Tastatur, Screenreader-Semantik, Zoom, Reduced Motion, schmale Mobile-Viewportgröße, Password-Manager und Back/Reload.

### 9.4 Auth-Integration

- Separates Testprojekt mit demselben Email-Template und denselben Auth-Settings wie Production.
- Reale Invite-Verifikation erzeugt Cookie-Session für exakt die eingeladene UUID; `updateUser` setzt das Passwort; anschließendes Passwortlogin funktioniert.
- Abgelaufener/verwendeter/manipulierter Token, falscher Typ, offener Redirect, fremde bestehende Session, Secure Password Change und Refresh-Verhalten.
- Sicherstellen, dass Standard-Implicit-Parameter nicht versehentlich an den SSR-Token-Hash-Handler geschickt werden und umgekehrt.

### 9.5 E2E

- E-Mail-Capture im isolierten Testsystem, Linkkonstruktion redigiert prüfen, Klick → Confirm → Passwort zweimal → Erfolg → Reviewer-Ziel → Logout → Login mit neuem Passwort.
- Doppelklick, zwei Tabs, paralleler Submit, Reload auf Confirm und Passwortseite, Back Button, verbrauchter Link, Ablauf und Mobile.
- Admin bleibt Admin; eingeladener Benutzer bleibt Reviewer; keine fremde Passwort-/Rollenmutation.

### 9.6 Production Validation

Nur mit einer dedizierten eigenen Testadresse, genehmigtem Wartungsfenster und ohne Token-/Passwortaufzeichnung:

1. Aktives Invite-Template, Site URL, Redirect-Allowlist, Invite-Ablauf, Mindestpasswort und Secure/Leaked Password Settings dokumentieren.
2. Redigierte Linkstruktur gegen die gewählte Variante prüfen; keine Geheimnisse in Screenshots, Tickets oder Logs.
3. Einmalige Annahme, Cookieentstehung, Passwortsetzung, Reviewerziel, Logout/Login und Berechtigung nachweisen.
4. Verbrauchter Link und Reload kontrolliert validieren; keine destruktiven Race-Tests mit realen Konten.
5. Monitoring auf PII-/Tokenfreiheit und Rollback der Template-/Redirectkonfiguration prüfen.

Keiner dieser Tests wird in diesem Audit ausgeführt oder implementiert.

## 10. Owner-Entscheidungen vor einem Implementierungspaket

1. **Flow:** empfohlener SSR-Token-Hash-Flow (`/auth/confirm` → `/auth/invite`) oder bewusst befristeter Implicit-Flow?
2. **Template/Redirect:** exakter Inhalt des Invite-Templates, Production-Origin, Redirect-Allowlist und atomare Umstellung von `REVIEWER_INVITE_REDIRECT_URL`.
3. **Passwortpolicy:** bestätigte Production-Mindestlänge, Zeichengruppen, Leaked Password Protection und Secure Password Change.
4. **Sessionkonflikt:** bestehende fremde Session zwingend abmelden/abbrechen; gleiche Identität fortfahren lassen oder ebenfalls neu starten?
5. **Erfolgsziel:** konkreter Reviewer-Startpfad und Dauer/Verhalten der Erfolgsmeldung.
6. **Ablauf/Recovery:** Admin-Kontakt, späterer Resend oder separat auditierter Recovery-Flow.
7. **Bereits gesetztes Passwort:** darf derselbe Invite-Kontext es erneut ändern oder wird der Fall abgewiesen?

## 11. Explizite Scope-Bestätigung

Dieses Paket ist **ausschließlich Audit und Dokumentation**. Es enthält:

- **keine Implementierung**,
- **keine neue Route**,
- **keine UI**,
- **keine Komponenten**,
- **keine Action**,
- **keine Services**,
- **keine Auth-Änderung**,
- **keine Migration**,
- **keine SQL**,
- **keine RPC**,
- **keine Trigger**,
- **keine RLS-Änderung**,
- **keine Grants**,
- **keine `package.json`-Änderung**,
- **keine Dependencies** und
- **keine Testimplementierung**.

Es werden insbesondere weder E-Mail-Template, Supabase-Auth-Konfiguration, `REVIEWER_INVITE_REDIRECT_URL`, Redirect-Allowlist noch Productiondaten verändert.

## 12. Abschluss

Die fachlich und technisch bevorzugte Richtung ist ein Supabase-SSR-konformer Invite-Flow mit eigenem serverseitigem `/auth/confirm`-Endpunkt, `verifyOtp` für `token_hash`/`invite`, cookiegebundener Session, separater `/auth/invite`-Passwortseite und `updateUser({ password })`. `/login`, `exchangeCodeForSession`, manuelles `setSession` und Rollen-/Profilmutation gehören nicht in diese Kette.

**Auditstatus: READY FOR OWNER DECISION**  
**Nicht: APPROVED FOR IMPLEMENTATION**  
**NOT PRODUCTION READY.**
