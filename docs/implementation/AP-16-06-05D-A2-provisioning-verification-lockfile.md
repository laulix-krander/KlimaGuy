# AP-16-06-05D-A2 – Provisioning Verification Closure & Reproducible Lockfile

## 1. A1 STOP Cause

Der A1-Precheck stoppte aus zwei Gründen: Nach einer erfolgreichen Registrierung gab der
Command unmittelbar `provisioned` zurück, ohne die persistierte Authority erneut zu
prüfen. Außerdem fehlte eine versionierte `package-lock.json` für ein reproduzierbares
`npm ci` im späteren Node-22-Operator.

## 2. Existing Provisioning Flow

Der bisherige Mutationspfad war `verify → Auth User finden/erzeugen → register →
provisioned`. Die initiale Verification schützte Replay und Konfliktfälle, bestätigte
aber nicht den nach der Mutation tatsächlich persistierten Gesamtzustand.

## 3. New Post-Registration Verification

Der Pfad ist nun `verify → Auth User finden/erzeugen → register → verify`. Nur ein
erfolgreiches Register-Resultat für die intern ermittelte UUID erreicht die zweite
Verification. Diese verwendet ausschließlich die bestehende Verification Boundary; es
gibt keinen zusätzlichen Auth-Create-Aufruf und keine Retry-Schleife.

## 4. Exact Identity Match

Die bestehende Authority verifiziert den festen Key `klimaguy_system` einschließlich
Registry, Auth-App-Metadata und Profilinvarianten. Zusätzlich muss die dabei gelieferte
`auth_user_id` exakt der UUID entsprechen, die der kontrollierte Create- oder
Recovery-Pfad registriert hat. Eine abweichende UUID endet fail-closed und wird nicht
repariert. Callende Stellen können keine UUID vorgeben.

## 5. Replay

Ein initiales `verified` bleibt ein geschlossener Replay-Erfolg als
`already_provisioned`. Dieser Pfad erzeugt keinen Auth User und keine Registry Row; seine
initiale Verification ist bereits die vollständige persistierte Prüfung.

## 6. Partial State Recovery

Ein Auth User wird nur bei exakt passender technischer E-Mail und
`app_metadata.system_actor_key = klimaguy_system` übernommen. Danach folgen Registration
und dieselbe abschließende Verification mit exaktem UUID-Match. Ein zweiter Auth User
wird nicht erzeugt.

## 7. Failure Semantics

Register-`conflict` endet unmittelbar als `conflict`; andere nicht erfolgreiche oder
unerwartete Registerzustände enden als `invalid_actor` beziehungsweise bei ungültigem
externem Resultat als `provisioning_failed`. Nach erfolgreicher Registration führen
`not_provisioned`, `invalid_actor`, `conflict`, malformed Results und ein UUID-Mismatch
aus der abschließenden Verification zu `provisioning_failed`. Es gibt keinen Erfolg und
keine automatische Reparatur.

## 8. Final Result Contract

Eine neue oder wiederaufgenommene Provisionierung liefert erst nach bestandener
Post-Registration-Verification `{ status: "verified", auth_user_id }`. Replay liefert
`already_provisioned`. Die geschlossene Union enthält daneben ausschließlich `conflict`,
`invalid_actor` und `provisioning_failed`; das mehrdeutige erfolgreiche `provisioned`
wurde aus dem Command-Result entfernt.

## 9. Script Exit Contract

`verified` und `already_provisioned` ergeben Exit-Code 0. `conflict`, `invalid_actor` und
`provisioning_failed` ergeben Exit-Code 1. Das Script serialisiert nur die geschlossene
Result-Union; Passwörter, Service-Role-Key, Tokens, Sessions und Providerfehler werden
nicht ausgegeben.

## 10. Lockfile Generation

`package-lock.json` wurde aus dem unveränderten `package.json` mit npm durch
`npm install --package-lock-only --ignore-scripts --no-audit --no-fund` erzeugt. Sie ist
weder manuell konstruiert noch aus einem anderen Projekt übernommen. Es wurden keine
Dependencies aktualisiert und kein anderes Package-Manager-Lockfile eingeführt.

## 11. Node/npm Versions

Die Lockdatei wurde unter Node `v22.22.2` mit dessen installiertem npm `11.4.2` erzeugt.
Sie verwendet `lockfileVersion: 3`, das vom geplanten Node-22-LTS-Setup unterstützt wird.

## 12. npm ci Reproducibility

Ein sauberer Installationslauf mit `npm ci` unter derselben Node-/npm-Kombination ist der
Abschlusscheck. Danach bleiben `package.json` und `package-lock.json` unverändert; das
Lockfile ist damit die reproduzierbare Installationsauthority des späteren Operators.

## 13. Tests

Die fokussierten Vitest-Tests decken Create, Register, den exakt einmaligen zusätzlichen
Verify-Aufruf, exakten UUID-Match, alle abschließenden Verify-Fehler, Replay, Partial
Recovery, Registerkonflikte, Exit-Codes und secret-freie Resultate ab. Zusätzlich werden
Gesamttests, Typecheck, Lint, `npm ci` und `git diff --check` ausgeführt.

## 14. Explicitly Not Implemented

Nicht enthalten sind ein GitHub-Actions-Workflow, Migrationen oder historische
Migrationsänderungen, neue Registry/RPC/Rollen/Auth-Authorities, direkte SQL-Inserts in
`auth.users`, Customer-/Project-/Runtime-Bootstrap, Initial Prompt, Delivery, Scheduler
und OpenAI.

## 15. Handoff Back to AP-16-06-05D-A1

Beide im A1-Precheck benannten Blocker sind geschlossen: Der Command bestätigt seinen
Mutationspfad selbst über die persistierte Authority, und `npm ci` besitzt eine
versionierte Lockfile. AP-16-06-05D-A1 kann nach den dokumentierten Abschlusschecks
wieder aufgenommen werden, ohne Verification im Workflow nachzubilden.
