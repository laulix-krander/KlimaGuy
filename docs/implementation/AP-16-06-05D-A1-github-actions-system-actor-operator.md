# AP-16-06-05D-A1 – GitHub Actions System Actor Operator

## 1. Purpose

Dieses Paket stellt den vorhandenen einmaligen Operator-Command für den **KlimaGuy
System** Actor über einen ausschließlich manuell gestarteten GitHub-Actions-Workflow
bereit. Der Workflow ist nur eine geschützte Ausführungsoberfläche; er enthält keine
Provisioning-Domainlogik.

## 2. Architecture Basis

KlimaGuy bleibt ein modularer Monolith. PostgreSQL, die vorhandenen service-only RPCs,
`scripts/provision-system-actor.ts`, die Provisioning-Domain und ihr Supabase-Adapter
bleiben die Authorities. Der Workflow ruft ausschließlich die bestehende npm-
Schnittstelle auf und bildet weder Auth-, Registry- noch Verifikationslogik nach.

## 3. A1 Original STOP

Der ursprüngliche A1-Precheck stoppte, weil dem Command die abschließende Verification
nach Registration und dem Repository eine versionierte npm-Lockdatei fehlten. Daher
wurde damals bewusst kein ausführbarer Workflow angelegt.

## 4. A2 Closure

AP-16-06-05D-A2 schloss beide Blocker. `package-lock.json` ist die reproduzierbare
Installationsauthority für `npm ci`. Der bestehende Command führt nun
`verify → create/recover → register → verify → verified` aus und prüft beim Abschluss
den exakten UUID-Match. Ein Fehler der finalen Verification endet fail-closed.

## 5. Workflow File

Der Operator ist in `.github/workflows/provision-system-actor.yml` unter dem exakten
Namen **Provision KlimaGuy System Actor** definiert.

## 6. `workflow_dispatch` Only

Der einzige Trigger ist `workflow_dispatch`. Push, Pull Request, Schedule, Release,
Deployment, `workflow_run` und `repository_dispatch` lösen keinen Lauf aus. Es gibt keine
automatische Ausführung und keine automatische Branch-Manipulation.

## 7. Confirmation Guard

Der erforderliche String-Input `confirmation` muss exakt `PROVISION` sein. Der Vergleich
ist weder case-insensitive noch trim-basiert. Jede abweichende Eingabe beendet den Job
vor Secret-Preflight, Checkout, Dependency-Installation und Supabase-Zugriff mit
`Confirmation must equal PROVISION.`

## 8. Required Repository Secrets

Der Secret-Contract besteht ausschließlich aus den vorhandenen Repository Secrets:

- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SYSTEM_ACTOR_PROVISIONING_EMAIL`

Es gibt kein Actor-ID- oder Actor-UUID-Secret und kein viertes Production Secret.

## 9. Secret Preflight

Unmittelbar nach dem Confirmation Guard prüft ein eigener Step ausschließlich, ob jede
der drei Variablen nicht leer ist. Bei einem fehlenden Wert endet er mit
`Missing required secret: <NAME>`. Er gibt keinen Wert aus und erreicht weder Checkout
noch `npm ci` oder Provisioning.

## 10. Permissions

Der Workflow setzt nur `permissions: contents: read`. Checkout persistiert keine Git-
Credentials. Write Permissions, OIDC und ein GitHub Environment werden nicht verwendet.

## 11. Runner

Der technische Job `provision-system-actor` läuft auf `ubuntu-latest`.

## 12. Node/npm Contract

Die offizielle `actions/setup-node` Action richtet Node 22 ein. A2 validierte die
Lockdatei mit Node `v22.22.2` und npm `11.4.2`; ein Patch-Pinning ist nicht erforderlich.
Der npm-Cache verwendet ausschließlich `package-lock.json` als Dependency-Pfad und
enthält keine Secret-Werte.

## 13. `npm ci`

Dependencies werden reproduzierbar und ausschließlich mit `npm ci` installiert. Der
Workflow führt weder `npm install`, Updates noch Dependency-Reparaturen aus.

## 14. Provisioning Command

Der Provisioning-Step führt ausschließlich `npm run provision:system-actor` aus und
reicht nur die drei erforderlichen Secrets als Environment weiter. Sein Exit-Code wird
nicht verändert, verschluckt oder mit `continue-on-error` übergangen.

## 15. Final Verification Contract from A2

Die finale Verification gehört vollständig zum vorhandenen Command. Nach Create oder
Recovery folgt Registration, danach eine erneute Verification mit exaktem UUID-Match;
erst dann entsteht `verified`. Im Workflow-YAML gibt es kein zweites Verify, keinen
direkten RPC-Aufruf und keine alternative Verification Authority.

## 16. Accepted Success Results

Akzeptierte Production-Ergebnisse sind ausschließlich:

- `{"status":"verified", ...}` für eine neu angelegte oder wiederaufgenommene Identity,
- `{"status":"already_provisioned", ...}` für einen bereits vollständig verifizierten
  Actor.

Beide Kategorien ergeben über den Script-Contract Exit-Code 0 und damit Job Success.

## 17. Failure Results

`conflict`, `invalid_actor` und `provisioning_failed` ergeben Exit-Code 1 und Workflow
Failure. Dann gilt **STOP**: nicht blind erneut ausführen und keine manuelle DB-Reparatur
improvisieren. Zuerst ist die Ursache anhand der vorhandenen Authority zu untersuchen.

## 18. Concurrency

Die feste Concurrency-Gruppe `provision-klimaguy-system-actor` mit
`cancel-in-progress: false` verhindert parallele Provisioning-Läufe. Ein laufender Job
wird nicht zugunsten eines neuen manuellen Laufs abgebrochen.

## 19. Timeout

Der Job besitzt `timeout-minutes: 10` und schlägt bei Überschreitung geschlossen fehl.

## 20. Secret Safety

Der Workflow enthält keine Secret-Literale, loggt keine Secret-Werte und erzeugt weder
Environment-Dumps, Shell-Traces, Artifacts noch Step Summaries. Er nutzt kein `curl`,
kein SQL, keine direkte Auth Admin API und keine secret-abhängigen Cache Keys. Das
bestehende Script darf nur seine geschlossene technische JSON-Resultatkategorie ausgeben.

## 21. Operator Runbook

Nach Merge erfolgt der manuelle Lauf exakt so:

GitHub Repository
→ Actions
→ Provision KlimaGuy System Actor
→ Run workflow
→ Branch: main
→ confirmation: PROVISION
→ Run workflow

Danach:

Workflow Run öffnen
→ provision-system-actor Job öffnen
→ Provisioning Step öffnen

## 22. First Production Run

Der erste echte Production-Lauf wird ausschließlich vom Product Owner nach Merge
gestartet. Erwartet wird `{"status":"verified"}` oder die repository-konforme
geschlossene JSON-Darstellung dieses Status. Falls der Actor bereits korrekt existiert,
ist `{"status":"already_provisioned"}` erwartet. Beide Ergebnisse sind **PASS**, sofern
der Job erfolgreich ist, kein nachfolgender Verification Error auftritt und kein Secret
offengelegt wurde.

## 23. Replay Run Semantics

Ein Replay prüft zuerst die persistierte Authority. Ist der Actor bereits korrekt
provisioniert, erzeugt der Command weder Auth User noch Registry Row und liefert
`already_provisioned`. Bei `conflict`, `invalid_actor` oder `provisioning_failed` gilt
auch im Replay **STOP**.

## 24. Explicitly Not Implemented

Nicht enthalten sind neue Provisioning-, Auth-, Registry-, RPC- oder Recovery-Logik,
Migrationen, SQL, Customer-/Project-/Conversation-/Knowledge-/Runtime-Bootstrap,
Initial Prompt, Pending Interaction, Planner Snapshot, WhatsApp Wiring, Delivery,
Recovery Scheduler und OpenAI. Keine historische Migration wurde verändert.

## 25. Handoff to System Actor Production Verification

Der System Actor gilt als produktiv provisioniert, wenn der Workflow Job erfolgreich
endet, der Command `verified` oder `already_provisioned` liefert, kein nachfolgender
Verification Error vorliegt und kein Secret offengelegt wurde. Erst nach diesem Gate darf
AP-16-06-05D wieder aufgenommen werden; dessen Bootstrap muss weiterhin die bestehende
System-Actor-Authority verwenden und darf keine Actor UUID als Input akzeptieren.
