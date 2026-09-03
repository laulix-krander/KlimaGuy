# AP-16-06-05D-A – System Actor Provisioning & Domain Identity Authority

## 1. Architecture Basis

KlimaGuy bleibt ein modularer Monolith. PostgreSQL ist die Authority für Registry, CAS,
Profilkompatibilität, Verifikation und Auflösung. Ein einmaliger Node-Operator-Command ist
die einzige Provisioning-Oberfläche. Es gibt keinen HTTP-Endpunkt und keine Browser-API.

## 2. 05D STOP Cause

`customers.created_by`, `projects.created_by` und
`conversation_project_assignments.actor_id` referenzieren `auth.users(id)`. Vor diesem
Paket existierte weder eine echte technische Auth Identity noch eine stabile Registry.
`service_role` ist eine Ausführungs-Authority und ausdrücklich kein Domain Actor.

## 3. System Actor Product Decision

Der eigene technische Domain Actor heißt **KlimaGuy System**. Seine Attribution ist von
der technischen Autorisierung getrennt. Kein Admin, Reviewer, angemeldeter Benutzer oder
heuristisch ausgewählter Auth User ersetzt ihn.

## 4. `auth.users` Contract

Eine echte Identity wird ausschließlich durch die in `@supabase/supabase-js` 2.x lokal
vorhandene, serverseitige `auth.admin.createUser` API erzeugt. Die Migration schreibt
nicht in `auth.users`. Die erzeugte UUID ist ein Ergebnis und wird nur in der Registry
persistiert. `app_metadata.system_actor_key` bindet die Auth Identity an den stabilen Key.

## 5. `profiles` Contract

Der bestehende globale Trigger erzeugt weiterhin jedes neue Profil zunächst als
`reviewer`. Erst die service-only Registrierung darf einen durch Auth-App-Metadata
markierten Benutzer zu `system` konvertieren und setzt den Anzeigenamen. Ein zusätzlicher
Trigger sperrt danach normale Updates und Deletes; er schützt auch den Partial State vor
Registrierung. Normale neue Benutzer bleiben Reviewer, bestehende Admins bleiben Admins.

## 6. Role Model

`app_role` und der kontrollierte TypeScript-/Zod-Parser kennen additiv `system`.
Menschliche Role-Change-Eingaben bleiben auf `admin | reviewer` beschränkt. Sämtliche
bestehenden Berechtigungsfunktionen prüfen positive menschliche Rollen, sodass `system`
keine Browser- oder Reviewer-Berechtigung erhält.

## 7. Registry Schema

`system_actor_registry` enthält nur `system_actor_key`, die eindeutige
`auth_user_id`, `created_at` und `verified_at`. Der Key ist Primary Key, die Auth UUID ist
unique und hat einen `ON DELETE RESTRICT` Foreign Key zu `auth.users`. RLS ist aktiv; für
Browserrollen existieren weder Tabellenrechte noch Policies.

## 8. Stable Actor Key

Der einzige zugelassene Key ist `klimaguy_system`. Er ist deterministisch, nicht geheim,
nicht personenbezogen und keine UUID. Der Anzeigename ist niemals Lookup-Authority.

## 9. Provisioning Boundary

`npm run provision:system-actor` ist ein expliziter, einmaliger server-only Command. Er
benötigt die bestehenden `NEXT_PUBLIC_SUPABASE_URL`- und
`SUPABASE_SERVICE_ROLE_KEY`-Contracts sowie `SYSTEM_ACTOR_PROVISIONING_EMAIL`. Es gibt
keine dauerhaft erreichbare Provisioning Route.

## 10. Supabase Admin API Boundary

Der Adapter nutzt `createClient` mit deaktivierter Session-Persistenz und danach
`client.auth.admin.createUser`. Ein kryptografisch zufälliges Einmalpasswort (48 Bytes)
wird nur im Prozess erzeugt, unmittelbar an Auth übergeben, nie zurückgegeben, gespeichert
oder geloggt. Es wird keine Login-Funktion für den Actor angeboten.

## 11. Registration

`register_system_actor(stable_actor_key, target_auth_user_id)` akzeptiert ausschließlich
`service_role`. Es prüft Key, Auth-Existenz und App-Metadata sowie ein kompatibles
Reviewer-/System-Profil, setzt die technische Rolle, registriert die UUID und schreibt
einen secret-freien Audit-Eintrag. Ungültige Kandidaten werden geschlossen abgelehnt.

## 12. CAS / Idempotency

Ein transaction-scoped Advisory Lock serialisiert den stabilen Key. Eine identische
Bindung wird verifiziert; eine andere UUID liefert `conflict` und überschreibt nichts.
Primary-Key- und Unique-Constraints bilden die letzte Concurrency-Barriere.

## 13. Verification

`verify_system_actor` prüft Registry, Auth Row, exaktes App-Metadata und Profilrolle.
Fehlende Registrierung liefert `not_provisioned`, Inkonsistenz `invalid_actor`. Die
Antwort enthält höchstens Status und interne Auth UUID, niemals Auth-Daten oder Secrets.

## 14. Resolution

`resolve_system_actor()` nimmt keine Parameter an und löst ausschließlich
`klimaguy_system` auf. Vor Verwendung wird derselbe vollständige Verification Contract
ausgeführt. Ein späterer Bootstrap-Caller kann daher keine alternative Actor UUID
einschleusen.

## 15. Crash Recovery

Auth-Erzeugung und Registry-Transaktion können nicht atomar sein. Vor jedem Create wird
deshalb nach der exakt deployment-konfigurierten technischen E-Mail gesucht. Findet ein
Retry den Partial State mit passendem App-Metadata, registriert er diese UUID und erzeugt
keinen zweiten User. Abweichendes Metadata liefert `conflict`. E-Mail-Uniqueness in Auth
verhindert auch bei einem Race zwei identische technische Identities; nach einem
Create-Konflikt wird der Command erneut ausgeführt und nimmt den Partial State auf.

## 16. Concurrency

Gleiche Registrierungen konvergieren unter Lock auf eine Registry Row. Bei verschiedenen
UUIDs gewinnt exakt eine Insert-Authority; die andere erhält `conflict`. Es gibt weder
Update noch Upsert, das eine Bindung ersetzen könnte.

## 17. Attribution vs Authorization

`service_role` autorisiert Provisioning und spätere serverseitige Komposition. Die
Registry-UUID ist ausschließlich die fachliche Attribution für `created_by`/`actor_id`.
Die Rolle `system` gewährt keine interaktive Anwendungsberechtigung.

## 18. User Administration Safety

Die vorhandene Liste kann die technische Rolle kontrolliert darstellen; das UI zeigt
keine Role-Change-Aktion dafür. Zod blockiert `system` als menschliche Role-Change-Eingabe,
und der DB-Trigger blockiert Update/Delete unabhängig vom UI. Reviewer-Einladungen setzen
kein System-App-Metadata und können deshalb keinen System Actor erzeugen. Es existiert
kein allgemeiner Auth-Delete-Flow im Repository.

## 19. Security

Alle drei Authorities sind `SECURITY DEFINER`, besitzen den festen Search Path
`public, pg_temp`, prüfen `auth.role() = 'service_role'`, revoken `public`, `anon` und
`authenticated` und granten nur `service_role`. Registry-RLS ist aktiv. Resultate und
Command-Ausgabe sind geschlossene Zod-Unions. Providerfehler werden nicht durchgereicht.

## 20. Deployment State Before Provisioning

Migration deployed + noch kein Command-Lauf ist ein legitimer Zustand.
`resolve_system_actor()` liefert dann fail-closed `not_provisioned`; es gibt keinen
Fallback Actor. AP-16-06-05D darf in diesem Zustand nicht produktiv aktiviert werden.

## 21. Deployment State After Provisioning

PASS bedeutet: genau eine Registry Row, vorhandene echte Auth Row, Profilrolle `system`,
passendes App-Metadata sowie `verified` aus Verification/Resolution. Erst dieser PASS
gibt AP-16-06-05D wieder frei.

## 22. External Provisioning Requirements

**EXTERNAL PROVISIONING REQUIRED.** Das Deployment muss einmalig einen nicht
personenbezogenen, für diese Supabase-Instanz eindeutigen technischen E-Mail-Identifier
als `SYSTEM_ACTOR_PROVISIONING_EMAIL` konfigurieren und danach
`npm run provision:system-actor` in einer geschützten Server-/Operator-Umgebung ausführen.
Der Wert ist kein Credential, darf aber keine echte Mitarbeiteradresse sein. Das
Repository erfindet bewusst keine reale Maildomain. Der Command nutzt die unterstützte
Supabase Admin API, registriert deren nicht-sensitive Auth UUID und muss mit
`provisioned`, `already_provisioned` oder `verified` enden; anschließende Verification
muss `verified` liefern.

## 23. Tests

Vitest deckt Role Parsing und fail-closed Permissions, Create/Replay/Partial-State-
Recovery, geschlossene secret-freie Outputs sowie den statischen SQL-Contract für
Uniqueness, CAS, RLS, Grants, fixed Search Paths, paramaterlose Resolution und
Profilschutz ab. Es werden keine Netzwerk- oder Live-Auth-Tests ausgeführt.

## 24. Explicitly Not Implemented

Nicht enthalten sind Customer-/Project-/Conversation-/Knowledge-/Runtime-Bootstrap,
nullable Customer-Namen, Assignment, Initial Prompt, Pending Interaction, Planner
Snapshot, Webhook Wiring, Delivery, Scheduler und OpenAI. Historische Migrationen bleiben
unverändert.

## 25. Handoff Back to AP-16-06-05D

Nach Migration, erfolgreichem einmaligem Command und `verified`-PASS darf 05D
`resolve_system_actor()` innerhalb seiner service-only DB-Komposition verwenden. 05D
darf keine Actor UUID als Input annehmen und keinerlei Ersatzheuristik einführen.
