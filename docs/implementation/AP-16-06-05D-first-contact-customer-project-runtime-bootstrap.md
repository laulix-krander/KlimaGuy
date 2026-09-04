# AP-16-06-05D — First Contact Customer, Project & Runtime Bootstrap (Retry)

## Ergebnis

**FOUNDATION READY.** Der ursprüngliche 05D-STOP war fachlich korrekt: Die damals zwingenden `created_by`-/`actor_id`-Fremdschlüssel konnten nicht durch `service_role` als Domain Actor erfüllt werden. AP-16-06-05D-A führte danach die stabile Authority `resolve_system_actor()` für **KlimaGuy System** (`klimaguy_system`) ein; A1/A2 ergänzten den reproduzierbaren Operator und die abschließende Verification. Der dokumentierte Production-Lauf auf `main` endete mit `verified`. Die konkrete Auth-UUID ist weder Bestandteil dieser Implementierung noch ihrer Tests.

## Customer-Schema und manueller Flow

Die additive Migration entfernt ausschließlich `NOT NULL` von `customers.first_name` und `customers.last_name`; vorhandene Zeilen werden nicht verändert. Der automatische Bootstrap schreibt beide Namen sowie E-Mail und Telefon explizit als `NULL` und erfindet weder Placeholder noch Transportdaten als Domainfakten. Der menschliche Create-Flow bleibt getrennt: `createCustomerSchema` sowie UI/Action verlangen weiterhin beide Namen und wurden nicht gelockert.

## Atomare Bootstrap-Authority

`bootstrap_first_contact_foundation(target_conversation_id uuid)` akzeptiert nur die persistierte interne Conversation-ID. Sie nimmt keine Actor-, Customer-, Projekt-, Telefon-, Nachrichten- oder Providerdaten an. Innerhalb derselben PostgreSQL-Transaktion löst sie zuerst den verifizierten System Actor über `resolve_system_actor()` auf. Nicht provisionierte und inkonsistente Actors enden geschlossen als `actor_unavailable` beziehungsweise `actor_invalid`.

Der Idempotency Anchor ist `conversation_transport_identities.id`. Exakt eine aktive Transportbindung muss die Conversation referenzieren. Die stabile Lock-Reihenfolge lautet:

1. aktive Binding-Anzahl und interne Transport-Identity ermitteln,
2. `conversation_transport_identities` mit `FOR UPDATE` sperren,
3. `conversations` mit `FOR UPDATE` sperren,
4. aktive Binding, Customer, Project, Knowledge State und Runtime kontrolliert nachsperren.

Damit serialisieren parallele Versuche auf derselben Transport Identity in der Datenbank. Die vorhandenen Unique-Constraints auf aktiver Transportbindung, Assignment-Revision/-Idempotency, Project Knowledge State und Conversation Runtime bleiben die abschließenden Concurrency-Barrieren.

## Customer- und Conversation-Binding

Eine vorhandene legitime Customer-Bindung der Transport Identity oder Conversation gewinnt. Fehlen beide, wird genau ein Customer mit unbekannten Namen und `created_by = KlimaGuy System` erzeugt. Danach sind nur `NULL → derselbe Customer` zulässig. Gegensätzliche non-null Bindings, gelöschte Customers oder eine andere Zuordnung liefern `conflict`; es gibt kein Reassignment. Der Conversation-Guard erlaubt die bisher verbotene Customer-Transition ausschließlich unter dem transaction-lokalen Marker der Bootstrap-Authority.

## Project und Assignment

Ohne `current_project_id` entsteht genau ein Project mit Titel **Neue Klimaanfrage**, `customer_id` des aufgelösten Customers und `created_by = KlimaGuy System`. Die bestehenden Defaults bleiben autoritativ: `status = new`, `requires_human_review = true`, `project_class = NULL`; Adresse, Summary und weitere Fakten bleiben leer. Ein Customer kann weiterhin beliebig viele Projekte besitzen; es gibt kein Customer-Unique-Constraint.

Assignment und Project-Erzeugung erfolgen in derselben RPC-Transaktion. Das Assignment erhält die nächste Conversation-Revision, `action = assigned`, eine transportidentitätsbasierte Idempotency Key und `actor_id = KlimaGuy System`. Ein vorhandenes Project wird nur wiederverwendet, wenn es aktiv, demselben Customer zugeordnet und durch die bestehende append-only Assignment-Provenance belegt ist. Ein fremdes Project oder fehlende Provenance endet fail-closed.

## Knowledge State und Runtime

Für das Project wird bei Bedarf der vorhandene eindeutige Knowledge-State-Header mit `current_version = 1` und `schema_version = 1` angelegt. Es entstehen keine Claims, Evidence, Proposals oder Transitions. Ein vorhandener State wird weder überschrieben noch zurückgesetzt.

Fehlt die Runtime, entstehen Header, leerer Effort State und append-only Initialize Command mit `revision = 1`, der tatsächlichen Knowledge-Version und `runtime_status = idle`; Pending Interaction und aktive Evidence Request bleiben `NULL`. Eine vorhandene Runtime desselben Projects gewinnt ausdrücklich — auch wenn sie fortgeschritten ist. Es gibt keinen Revision-, Status-, Pending- oder Knowledge-Rollback. Eine Runtime eines anderen Projects ist ein Konflikt.

## Partial Recovery, Result Contract und Rollback

Legitime Teilzustände (vorhandener Customer, bestehende korrekte Bindings/Project/Knowledge oder fehlende Runtime) werden innerhalb eines Aufrufs ergänzt. Die geschlossene Result-Union lautet `created`, `partial_completed`, `already_complete`, `conflict`, `actor_unavailable`, `actor_invalid`, `invalid_state` oder `persistence_failure`. Erfolge liefern nur interne Customer-/Project-/Conversation-IDs und Revisionen/Versionen. SQL- und Providerdetails werden nicht ausgegeben.

Da eine PL/pgSQL-Funktion in der aufrufenden PostgreSQL-Transaktion läuft und der Exception-Block einen fehlgeschlagenen Unterblock vollständig zurückrollt, kann ein später Fehler keinen neu erzeugten halben Customer-/Project-/Assignment-/Knowledge-/Runtime-Zustand committen. Widersprüche werden vor Mutation geprüft oder rollen mit dem Block zurück; sie werden nicht repariert.

## Audit und Security

Customer-, Project-/Assignment-, Knowledge- und Runtime-Erzeugung sowie der Abschluss schreiben append-only `audit_log`-Einträge. Metadaten enthalten nur interne IDs, Actor, Version/Revision und geschlossene Result Codes — keine Telefonnummer, Display Names, Nachrichtentexte oder Providerpayloads. Existing Assignment und Runtime Command Ledger bleiben erhalten.

Die RPC ist `SECURITY DEFINER`, verwendet den festen Search Path `public, pg_temp`, prüft zusätzlich `auth.role() = service_role`, revoket `public`, `anon` und `authenticated` und grantet nur `service_role`. Der server-only TypeScript-Adapter erstellt erst beim Funktionsaufruf einen Service-Role-Client, validiert Input und Result strikt mit Zod und mappt rohe Fehler auf `persistence_failure`.

## Pre-Prompt- und Duplicate-Vertrag

Bereits persistierte Pre-Prompt-Nachrichten bleiben unveränderte append-only Historie. Die Authority liest keinen Message Text und erzeugt weder Customer-Answer Command noch Question-/Prompt-ID, Claim Proposal oder Answer Binding. Mehrere Nachrichten und sowohl spätere `recorded`- als auch `duplicate`-Aufrufe können dieselbe Foundation replay-safe adressieren. Vor AP-16-06-05E bleibt die Runtime `idle` und damit `cycle_eligible = false`.

## Explizit nicht implementiert

Nicht enthalten sind Initial Prompt, Pending Interaction, Planner Snapshot/-Ausführung, Outbound Message, Delivery Command, Graph API, Webhook Wiring, Bootstrap Recovery Scheduler, OpenAI/LLM sowie Änderungen an Offer-, Pricing-, Review-, Evidence-, Delivery- oder Customer-Answer-Cycle-Authorities.

## Handoff an AP-16-06-05E

AP-16-06-05E kann auf den zurückgegebenen internen IDs und der persistenten Foundation aufbauen und den Initial Prompt in einer eigenen atomaren Authority committen. Erst dieses Folgepaket darf Runtime/Pending Interaction/Planner Snapshot/Outbound Prompt definieren; produktives Webhook Wiring und Recovery verbleiben danach bei 05F.
