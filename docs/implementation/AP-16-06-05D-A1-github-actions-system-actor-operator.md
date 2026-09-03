# AP-16-06-05D-A1 – GitHub Actions System Actor Operator

## 1. Purpose

Dieses Paket sollte den vorhandenen einmaligen Operator-Command für den **KlimaGuy
System** Actor über einen ausschließlich manuell gestarteten GitHub-Actions-Workflow
zugänglich machen. Der Repository-Precheck hat jedoch zwei fehlende Contracts ergeben.
Deshalb wird in diesem Paket bewusst kein ausführbarer Workflow angelegt.

## 2. Architecture Basis

KlimaGuy bleibt ein modularer Monolith. PostgreSQL, die vorhandenen RPCs und der
serverseitige Provisioning-Code bleiben die einzigen Authorities. Ein Workflow dürfte
nur die bestehende npm-Schnittstelle aufrufen und weder Domain-, Auth- noch
Verifikationslogik nachbilden.

## 3. Existing Provisioning Authority

Die vorhandene Authority besteht aus:

- `npm run provision:system-actor`,
- `scripts/provision-system-actor.ts`,
- `lib/server/system-actor-provisioning.ts`,
- `lib/server/system-actor-supabase-adapter.ts` und
- `supabase/migrations/202609030003_system_actor_identity_authority.sql`.

Sie benötigt genau `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` und
`SYSTEM_ACTOR_PROVISIONING_EMAIL`. Es wurde kein weiterer Environment- oder
Secret-Contract festgestellt.

## 4. Manual `workflow_dispatch` Only

Der vorgesehene Workflow dürfte ausschließlich `workflow_dispatch` verwenden. Push,
Pull Request, Merge, Schedule, Deployment, Release, `repository_dispatch` und
`workflow_run` dürften keinen Lauf auslösen. Wegen der unten dokumentierten
STOP-Bedingungen wurde der Workflow noch nicht angelegt.

## 5. Confirmation Guard

Vor jeder Supabase-Kommunikation müsste ein erforderlicher Input `confirmation` exakt
mit `PROVISION` verglichen werden. Jede andere Eingabe müsste den Job kontrolliert
beenden, ohne Secrets zu binden oder Provisioning auszuführen.

## 6. Required GitHub Repository Secrets

Der spätere Provisioning-Step darf ausschließlich diese vorhandenen Repository Secrets
erhalten:

- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SYSTEM_ACTOR_PROVISIONING_EMAIL`

Insbesondere darf keine konfigurierbare Actor-UUID eingeführt werden.

## 7. Secret Safety

Ein späterer Workflow darf nur die Existenz der drei Variablen prüfen. Er darf keine
Werte, Environment-Dumps, Command-Line-Argumente mit Secrets, Artifacts oder Secret-
abhängige Cache Keys erzeugen. `env`, `printenv`, `set`, `set -x` und Debug-Ausgaben der
Providerantwort sind ausgeschlossen.

## 8. Permissions

Der vorgesehene GitHub-Token-Contract ist ausschließlich `contents: read`. Checkout
müsste persistierte Git-Credentials deaktivieren. Schreibrechte und OIDC sind nicht
erforderlich.

## 9. Execution Steps

Nach Auflösung der STOP-Bedingungen wären die Schritte: Confirmation prüfen, Repository
auschecken, Node 22 einrichten, `npm ci` ausführen, die Existenz der drei Secrets prüfen
und ausschließlich `npm run provision:system-actor` starten. Der Exit-Code des Commands
darf nicht verändert oder verschluckt werden.

Aktuell fehlt jedoch `package-lock.json` im Repository. Damit ist das verbindlich
geforderte reproduzierbare `npm ci` nicht möglich. Ein Workflow darf nicht auf
`npm install` ausweichen und auch nicht selbst eine Lockdatei zur Laufzeit erzeugen.

## 10. Result Contract

Die geschlossenen Erfolgsresultate sind `provisioned`, `already_provisioned` und
`verified`. Die geschlossenen Fehlerresultate umfassen `conflict`, `invalid_actor` und
`provisioning_failed`; das Script setzt dafür einen fehlschlagenden Exit-Code.

## 11. Concurrency

Ein späterer Workflow muss die feste Concurrency-Gruppe
`provision-klimaguy-system-actor` mit `cancel-in-progress: false` verwenden, damit zwei
manuelle Läufe nicht absichtlich parallel provisionieren.

## 12. Timeout

Der spätere Job muss auf zehn Minuten begrenzt werden und auf `ubuntu-latest` laufen.

## 13. Operator Runbook

Nach Auflösung der STOP-Bedingungen, Implementierung und Merge lautet der UI-Ablauf:

GitHub Repository → Actions → Provision KlimaGuy System Actor → Run workflow → Branch
`main` → `confirmation = PROVISION` → Run workflow.

Danach: Run öffnen → Provisioning Step prüfen.

Dieses Runbook ist noch **nicht ausführbar**, weil in diesem Paket aus Sicherheitsgründen
kein Workflow angelegt wurde.

## 14. Expected Success Results

Akzeptiert werden `provisioned`, `already_provisioned` oder `verified` nur dann, wenn der
Command vor seinem erfolgreichen Prozessende selbst den abschließenden Verification-
Contract erfüllt. Danach gilt: System Actor Provisioning erfolgreich.

## 15. Expected Failure Results

Bei `conflict`, `invalid_actor` oder `provisioning_failed` gilt: **STOP**. Der Operator
darf den Command nicht wiederholt blind ausführen. Fehlende Secrets müssen ausschließlich
mit `Missing required secret: <NAME>` gemeldet werden, ohne deren Inhalte auszugeben.

## 16. Explicitly Not Implemented

Nicht implementiert sind ein GitHub-Actions-Workflow, neue Provisioning-, Auth-, Registry-
oder RPC-Logik, eine Migration, SQL, direkter Zugriff auf `auth.users`, Customer-,
Project-, Conversation-, Knowledge-, Runtime- oder Initial-Prompt-Bootstrap, WhatsApp
Wiring, Delivery, Scheduler und OpenAI. Keine historische Migration wurde verändert.

## 17. Production Handoff

### STOP 1: abschließende Verification fehlt im Command

`provisionSystemActor` führt zu Beginn `boundary.verify()` aus. Falls noch keine Registry-
Bindung existiert, erzeugt beziehungsweise übernimmt der Command die Auth Identity und
ruft `boundary.register(authUserId)` auf. Liefert die Registrierung `provisioned`, wird
dieses Resultat unmittelbar zurückgegeben. Es folgt kein erneuter Aufruf von
`boundary.verify()` und damit keine abschließende Prüfung, dass Registry, Auth Row,
App-Metadata und Profilrolle nach der Mutation gemeinsam `verified` ergeben.

Der bestehende Implementierungsvertrag verlangt zugleich nach dem einmaligen Command
eine anschließende Verification mit dem Ergebnis `verified`. Somit erfüllt ein
erfolgreiches `provisioned` des aktuellen Commands allein den geforderten Post-Run-
Verification-Contract nicht. Eine zweite Verifikationsimplementierung im Workflow wäre
eine unzulässige neue Authority. Der kleinste fehlende Contract ist daher: Der bestehende
Operator-Command muss nach einer erfolgreichen Registrierung über seine vorhandene
Boundary erneut `verify()` ausführen, ausschließlich ein exakt zur registrierten UUID
passendes `verified` akzeptieren und andernfalls geschlossen fehlschlagen.

### STOP 2: reproduzierbarer Dependency-Install fehlt

Im geprüften Baseline-Commit ist keine `package-lock.json` versioniert. Der kleinste
fehlende Deployment-Contract ist eine zum vorhandenen `package.json` gehörende,
versionierte npm-Lockdatei, damit der vorgeschriebene Schritt `npm ci` auf GitHub Actions
ausgeführt werden kann.

### Nächste Freigabeprüfung

Nach separater Behebung beider Contracts müssen die Authority-Tests nachweisen, dass ein
Create-/Recovery-Pfad abschließend verifiziert und bei abweichender oder fehlgeschlagener
Verification fail-closed endet. Erst danach darf das kleine manuelle Operator-Paket den
Workflow mit Confirmation Guard, Secret-Preflight, minimalen Permissions, Concurrency
und Timeout ergänzen. Production Provisioning wurde bei dieser Prüfung nicht ausgeführt.
