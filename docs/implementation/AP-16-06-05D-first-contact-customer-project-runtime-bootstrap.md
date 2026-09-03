# AP-16-06-05D — First Contact Customer, Project & Runtime Bootstrap Authority

**Baseline:** `7b1f6e18ba8634e32bfcc45c1e2077da4ea433c1`  
**Datum:** 2026-09-03  
**Ergebnis:** **STOP — SYSTEM-ACTOR-AUTHORITY FEHLT**

AP-16-06-05D wurde vor jeder Schema- oder Codeänderung entsprechend der verbindlichen
STOP-Bedingung abgebrochen. Das Repository kann einen Actor mit der fachlichen Identität
„KlimaGuy System“ derzeit weder eindeutig modellieren noch sicher per Migration
provisionieren. Eine partielle Bootstrap-Authority wurde bewusst nicht implementiert.

## 1. Architecture Basis

Geprüft wurden die Audits AP-16-06-05A und AP-16-06-05C, der
Implementierungsvertrag AP-16-06-05B sowie die aktuellen Authorities für Auth/Profile,
Customers, Projects, Conversations, Transport, Knowledge State und Runtime.

Der modulare Monolith legt fachliche Transaktionen in PostgreSQL-RPCs und hält
Provider-/Service-Role-Komposition serverseitig. Diese Architektur könnte die übrige
Foundation in einer `security definer`-RPC atomar schließen, sobald eine legitime
System-Actor-Identity existiert.

## 2. Closed Product Decisions

Die vier Produktentscheidungen werden nicht neu interpretiert:

1. automatisch angelegte Customers haben `first_name = NULL` und `last_name = NULL`;
2. der Creator ist die persistente Domain-Identität „KlimaGuy System“, nicht
   `service_role` und nicht ein beliebiger Mensch;
3. der Projekttitel lautet exakt **„Neue Klimaanfrage“**;
4. Pre-Prompt-Nachrichten bleiben unveränderte, append-only Historie und werden nicht
   rückwirkend zu Answers.

Entscheidung 2 ist fachlich geschlossen, ihr notwendiger technischer
Provisioning-Contract fehlt aber im Repository.

## 3. Customer Nullable Name Contract

`public.customers.first_name` und `last_name` sind beide `text not null`.
Eine additive Migration könnte ausschließlich diese beiden `NOT NULL`-Constraints
entfernen, ohne Bestandszeilen umzuschreiben. Die manuellen Create-Schemas und Formulare
könnten weiterhin Namen verlangen; nullable Persistenz muss deren UX nicht abschwächen.
Es wurde keine entgegenstehende zentrale Invariante gefunden.

Diese sichere Teiländerung wurde wegen der STOP-Regel nicht isoliert committed. Es gibt
keine Placeholder-Namen und keine Defaults auf leere Strings.

## 4. System Actor Contract

Die maßgeblichen FKs sind eindeutig:

- `customers.created_by -> auth.users(id)`, `NOT NULL`;
- `projects.created_by -> auth.users(id)`, `NOT NULL`;
- `conversation_project_assignments.actor_id -> auth.users(id)`, `NOT NULL`;
- `audit_log.actor_id -> auth.users(id)`, nullable.

`public.profiles.id` referenziert ebenfalls `auth.users(id)`. Ein Profil ist damit keine
vom Auth-User unabhängige Domain Identity. `app_role` kennt nur `admin` und `reviewer`;
es gibt weder Actor-Klasse `system` noch stabile System-Identity-Tabelle oder
System-Actor-Key.

Die service-role JWT-Rolle erzeugt keine passende Zeile in `auth.users` und kann deshalb
nicht als FK-Wert oder Domain Actor dienen. Eine UUID, ein vorhandener Admin oder ein
Business Owner wären sachlich falsch und ausdrücklich verboten.

## 5. System Actor Provisioning

Die einzige vorhandene Auth-Anlage ist ein enger serverseitiger Reviewer-Invite. Jeder
neue `auth.users`-Datensatz löst außerdem einen Trigger aus, der zwingend ein
`profiles`-Profil mit Literalrolle `reviewer` anlegt. Der Flow modelliert einen Menschen,
benötigt eine E-Mail-Einladung und ist keine System-Actor-Provisionierung.

Eine SQL-Migration darf nicht blind eine interne Supabase-Auth-Zeile samt
providerabhängigen Pflicht-, Credential- und Metadatenfeldern konstruieren. Die aktuelle
Migrationsebene besitzt auch keinen freigegebenen, stabilen extern provisionierten
Auth-User, den sie anhand einer vertrauenswürdigen Domain-Kennung auflösen könnte.
Damit ist eine replay-safe Anlage von „KlimaGuy System“ in diesem Paket nicht sicher.

### Kleinster notwendiger Folgecontract

Vor einer erneuten AP-16-06-05D-Implementierung ist ein separates, ausdrücklich
autorisiertes **System Actor Provisioning** nötig:

1. Das Datenmodell erhält eine persistente System-Actor-Registry mit stabilem,
   eindeutigem fachlichem Key (zum Beispiel `klimaguy_system`) und FK auf
   `auth.users(id)`. Die Registry ist service-only, RLS-geschützt und erlaubt pro Key
   exakt eine Identity.
2. Der Auth-User wird einmalig über eine dokumentierte Supabase-Auth-Admin-
   Provisioning-Grenze erzeugt, nicht durch direkten SQL-Insert in `auth.users`, nicht
   per Reviewer-Einladung und nicht mit einer im Repository hardcodierten UUID.
3. Eine enge serverseitige Registrierungs-/Verifikations-Authority übernimmt nur die
   zurückgegebene Auth-UUID, verifiziert die tatsächliche Auth-Existenz und bindet sie
   per CAS an den stabilen Registry-Key. Ein anderer bereits gebundener Wert führt zu
   Conflict; Replay mit demselben Wert ist erfolgreich.
4. Der globale Auth-Insert-Trigger darf diesen technischen User nicht irreführend als
   Reviewer-Domainprofil darstellen. Dafür ist eine explizite Actor-/Profile-
   Modellentscheidung erforderlich (System-Actor ohne menschliche Rolle oder ein
   separates Actor-Modell). Frei steuerbare User-Metadaten dürfen keine Rolle verleihen.
5. Die spätere Bootstrap-RPC löst `created_by`/`actor_id` ausschließlich über den
   stabilen Registry-Key auf und scheitert geschlossen, wenn Registrierung, Auth-Row
   oder Actor-Klassifikation fehlen bzw. inkonsistent sind.

So wird keine beliebige Admin-ID konfiguriert oder hardcodiert. Erst dieser Contract
macht die bereits entschiedene Systemidentität migrations- und deploymentsicher.

## 6. Transport Identity Idempotency

`conversation_transport_identities.id` ist der korrekte interne Anker. Die Tabelle hat
eine Provider-/Scope-/External-Identity-Unique-Constraint und ein nullable
`customer_id`. Die spätere RPC muss die Identity anhand ihrer internen UUID `FOR UPDATE`
locken; Telefonnummer, Display Name und Nachrichtentext dürfen keine Suchheuristik sein.

## 7. Customer Bootstrap

Nach geschlossenem System-Actor-Provisioning kann die Transaktion bei leerer
Identity-Bindung genau einen Customer mit beiden Namen `NULL` und dem aufgelösten
System-Actor als `created_by` anlegen. Eine vorhandene Identity-Bindung gewinnt. Wegen
des STOP wurde weder Schema noch Customer-Create-Authority verändert.

## 8. Customer Bindings

Die Transport Identity besitzt `customer_id`; die Conversation besitzt ebenfalls
`customer_id`. Der Conversation-Guard behandelt `customer_id` derzeit als immutable,
auch nachdem die WhatsApp-Ingestion eine Conversation mit nullable Customer angelegt
hat. Eine spätere zentrale RPC muss daher eine eng begrenzte Authority-Mutation für den
einmaligen `NULL -> authoritative customer`-Übergang ergänzen und beide gelockten Rows
in derselben Transaktion binden. Zwei unterschiedliche non-null Werte müssen als
Conflict enden und dürfen nie überschrieben werden.

## 9. Project Bootstrap

Projects benötigen `customer_id`, `title` und `created_by`. `status` defaultet auf
`new`, `requires_human_review` auf `true`, und `project_class` ist nullable. Nach dem
Provisioning-Contract kann die Foundation diese vorhandenen Defaults nutzen und darf
keine Klasse oder weitere Fakten erfinden.

## 10. Project Title

Der einzige zulässige Bootstrap-Titel ist exakt **„Neue Klimaanfrage“**. Er enthält
weder Telefonnummer noch Namen, Transportidentität oder andere PII.

## 11. created_by

Customer und Project müssen dieselbe über die System-Actor-Registry aufgelöste echte
`auth.users.id` verwenden. Die technische `service_role` bleibt ausschließlich
Aufruf-Authority und wird niemals als Domain Actor gespeichert. Genau diese legitim
auflösbare ID fehlt derzeit und löst den STOP aus.

## 12. Project Assignment

Die bestehende Assignment-History ist append-only und verlangt `actor_id`. Initiales
Assignment erhöht die Conversation-Revision nach der bestehenden CAS-Semantik und muss
eine einzelne Provenance-Zeile erzeugen. Project Create, `current_project_id` und
Provenance müssen in derselben Foundation-RPC liegen; eine globale
One-Project-per-Customer-Regel ist unzulässig.

## 13. Knowledge State Foundation

`project_knowledge_states` erlaubt genau einen Header je Project und startet durch
Defaults bei `current_version = 1`, `schema_version = 1`. Der Header kann ohne Claims,
Evidence, Answers oder Fake Facts legitim angelegt werden. Die Unique-Constraint auf
`project_id` liefert die notwendige Idempotenz.

## 14. Runtime Foundation

Der Runtime-Contract bestätigt eine initiale Revision `1`, Knowledge-Version `1`, den
Defaultstatus `idle` und leere aktive Pending-/Evidence-Referenzen. Der bestehende
Initializer erfordert derzeit einen angemeldeten Admin und einen vorhandenen
Knowledge-State-Header; die künftige service-only Foundation-RPC muss dieselbe
Initialsemantik intern anwenden, nicht den Admin-Initializer vortäuschen. Fortgeschrittene
Runtime-Zeilen dürfen beim Replay nicht zurückgesetzt werden.

## 15. Transaction Boundary

Ohne STOP müssten Customer Create/Reuse, beide Customer-Bindings, Project
Create/Reuse, Assignment, Knowledge Header, idle Runtime, Ledger und Audit in genau
einer PostgreSQL-Transaktion erfolgen. Ein Fehler muss alles zurückrollen. Eine
TypeScript-Sequenz aus Einzelmutationen wäre wegen Orphan- und Crash-Risiko unzulässig.

## 16. Locking / Concurrency

Die spätere RPC muss zuerst die Transport Identity und danach die Conversation in
stabiler Reihenfolge `FOR UPDATE` sperren. Alle Bindings werden nach Erwerb der Locks
erneut gelesen. Project, Knowledge und Runtime werden ebenfalls unter denselben
Transaktionslocks geprüft. DB-Constraints/Ledger schließen Replays und Parallelität;
App-Layer-Locks reichen nicht.

## 17. Replay / Idempotency

Replay derselben internen Transport Identity und Conversation muss dieselben Customer-
und Project-IDs liefern. Vorhandene vollständige Foundation ergibt
`already_bootstrapped`; sicher ergänzte historische Teilzustände ergeben
`completed_existing_foundation`. Abweichende Bindings ergeben `conflict`. Raw SQL-
Fehler und Transportdaten dürfen den geschlossenen Result-Vertrag nicht verlassen.

## 18. Partial Existing States

- Customer vorhanden, Project fehlt: Customer wiederverwenden und Foundation ergänzen.
- Customer und passendes Project vorhanden, Runtime fehlt: Foundation ergänzen.
- idle Runtime vorhanden: idempotenter Erfolg.
- fortgeschrittene Runtime vorhanden: unverändert wiederverwenden.
- widersprüchliche Customer-Bindings: Conflict.
- Project gehört einem anderen Customer: Conflict.

Es findet keine destructive repair oder automatische Reassignment-Heuristik statt.

## 19. Audit / Provenance

Audit und Assignment-Provenance müssen interne IDs, Result und Revision enthalten,
aber weder Nachrichtentext noch Telefonnummer oder Providerpayload. `audit_log.actor_id`
kann technisch nullable sein; die Produktentscheidung verlangt für die hier erzeugten
Domainobjekte und ihre Provenance dennoch den legitimen System Actor. Replays dürfen
keine erneute Creation behaupten.

## 20. Pre-Prompt Message Semantics

Inbound Messages einschließlich „Hallo“ und mehrerer schnell folgender Texte bleiben
unverändert append-only. Die Foundation erzeugt keine `customer_answer`-Commands,
Prompt-/Question-IDs, Claim Proposals oder nachträglichen Zuordnungen. `cycle_eligible`
bleibt vor dem Initial Prompt legitim `false`.

## 21. Security

Die spätere RPC muss `security definer` mit festem `search_path = public, pg_temp`
verwenden. `PUBLIC`, `anon` und `authenticated` erhalten kein Execute-Recht; nur
`service_role` wird berechtigt. Result und Audit enthalten nur interne IDs und
geschlossene Codes, keine PII, Texte, Providerdaten, Token oder Secrets.

Der System Actor darf weder aus Browserinput noch aus einer frei gesetzten Environment-
UUID stammen. Die RPC muss ihn serverseitig über den eindeutigen Registry-Key auflösen.

## 22. Tests

Wegen des vorgeschriebenen STOP wurden keine AP-16-06-05D-Implementierungstests
hinzugefügt: Tests für eine nicht vorhandene oder illegitime Actor-Authority würden eine
halbe Foundation festschreiben. Die vorhandenen Repository-Suites bleiben unverändert.
Nach dem Provisioning-Folgepaket sind sämtliche im AP-16-06-05D-Auftrag genannten
Nullability-, Actor-, Race-, Binding-, Project-, Assignment-, Knowledge-, Runtime-,
Message-, Atomicity-, Security- und Scope-Grenzen umzusetzen.

## 23. Explicitly Not Implemented

Es wurden keine Migration, RPC, Customer-/Project-/Conversation-Mutation, TypeScript-
Adapter oder Productive Factory implementiert. Ebenfalls unverändert bleiben Initial
Prompt, Pending Interaction, Planner Snapshot, Outbound Message, Delivery Command,
Webhook-Wiring, Graph Sender, Recovery, Scheduler, OpenAI und LLM. Keine historische
Migration wurde verändert.

## 24. Handoff to AP-16-06-05E

**Nicht bereit für AP-16-06-05E.** Zuerst ist das kleinste Folgepaket
**System Actor Provisioning & Domain Identity Authority** umzusetzen und produktseitig
zu autorisieren. Danach muss AP-16-06-05D vollständig erneut aufgenommen werden. Erst
eine erfolgreiche, atomare 05D-Foundation darf an die Initial-Prompt-Authority 05E
übergeben werden.

## STOP-Begründung

Betroffen sind unmittelbar die `auth.users`-FKs von Customer, Project und Assignment
sowie die auf `admin | reviewer` begrenzte Profile-/Rollenstruktur. Die vier
Produktentscheidungen bestimmen zwar, **welcher** Actor fachlich erforderlich ist, sie
stellen aber weder eine gültige Auth-Identity noch eine sichere Provisioning-Grenze und
eindeutige persistente Auflösung bereit. Eine Implementation könnte daher nur
`auth.users` blind manipulieren, eine Fake-/Admin-UUID verwenden oder die `NOT NULL`-FKs
umgehen. Alle drei Varianten sind verboten. STOP-Bedingung 1 ist erfüllt; entsprechend
wurde keine halbe Bootstrap-Authority implementiert.
