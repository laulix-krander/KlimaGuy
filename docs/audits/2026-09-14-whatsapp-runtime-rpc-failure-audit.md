# Audit: WhatsApp Runtime-RPC-Fehler

**Datum:** 14. September 2026

**Baseline:** `8ecc7ef` (aktueller, mit `main` gemergter Repository-Stand bei Auditbeginn)

**Scope:** ausschließlich Audit; keine Runtime-, Datenbank-, Deployment- oder Production-Änderung

## 1. Executive Summary

Geprüft wurde die Arbeitshypothese, dass hinter `conversation_engine_resolution_failed` und `first_contact_recovery_discovery_failed` derselbe Auth-/RPC-Fehler liegen könnte, insbesondere ein von beiden SQL-Funktionen ausgelöstes `not_authorized`, weil `auth.role()` nicht `service_role` sieht.

**Ergebnis:** Eine gemeinsame Ursache ist **PLAUSIBLE**, aber nicht bewiesen. Beide produktiven Adapter bauen unabhängig voneinander denselben Typ Supabase-Client aus denselben beiden Environment-Variablen und rufen service-only PostgREST-RPCs auf. Beide verwerfen ein von Supabase zurückgegebenes Fehlerobjekt. Das gemeinsame Fehlerbild passt daher zu falscher, nicht zum Projekt passender oder am Deployment nicht wirksamer URL-/Key-Konfiguration, zu einem gemeinsamen Auth/Gateway-Problem oder zu PostgREST-Vertrags-/Schema-Cache-Problemen. Der Repository-Stand enthält aber keinen einzelnen alternativen gemeinsamen Fehlerpfad, der diese Ursachen gegenüber `auth.role()` eindeutig bevorzugt.

Die engere Behauptung „`auth.role()` ist in beiden RPCs nicht `service_role`“ ist **UNKNOWN / REQUIRES RUNTIME EVIDENCE** und in der vorgegebenen Skala damit **nur möglich**, nicht „wahrscheinlich“. Der Variablenname `SUPABASE_SERVICE_ROLE_KEY` beweist weder ihren Production-Wert noch die Paarung mit `NEXT_PUBLIC_SUPABASE_URL`. Die installierte `@supabase/supabase-js`-Version 2.114.0 sendet bei REST-Aufrufen den übergebenen Schlüssel als `apikey` und – sofern keine Session existiert – auch als Bearer-Fallback. Das beweist die vom Client erzeugten Header, aber nicht, welche Claims beziehungsweise Rolle der Production-Gateway daraus tatsächlich für PostgreSQL setzt (`node_modules/@supabase/supabase-js/src/lib/fetch.ts:24-31,77-95`; `node_modules/@supabase/supabase-js/src/SupabaseClient.ts:364-404,588-605`).

**Final Verdict: A — Die Diagnose-Instrumentierung ist jetzt der sinnvollste nächste Schritt.** Es gibt noch nicht genug Evidence für einen Auth-Fix, eine Funktionsänderung oder einen Deployment-Fix. Ein kleiner, PII-freier Patch sollte am jeweiligen RPC-Adapter zwischen zurückgegebenem RPC-Fehler und ungültigem Resultat unterscheiden und ausschließlich erlaubte SQLSTATE/PostgREST-Codes samt geschlossener Zusammenfassung ausgeben. Das vorhandene Muster `classifyAcquisitionRpcError` ist dafür wiederzuverwenden beziehungsweise eng analog anzuwenden, nicht eine neue Diagnosearchitektur (`lib/server/conversation/acquisition-rpc-diagnostics.ts:1-35`; `lib/server/conversation/persistent-cycle-data-source.ts:99-123`). Dieser Audit implementiert den Patch ausdrücklich nicht.

### Beweisgrade

Die Begriffe in diesem Dokument bedeuten verbindlich:

- **PROVEN:** direkt durch aktuellen Repository-Code oder die vom Auftraggeber gelieferte Production-Evidence belegt.
- **STRONG INFERENCE:** durch mehrere Belege stark gestützt, aber nicht direkt beobachtet.
- **PLAUSIBLE:** technisch möglich, noch nicht ausreichend belegt.
- **RULED OUT:** durch die aktuelle Evidence ausgeschlossen.
- **UNKNOWN / REQUIRES RUNTIME EVIDENCE:** mit Repository und bereitgestelltem Production-Katalog nicht entscheidbar.

## 2. Verifizierter aktueller Ablauf des WhatsApp-Requests

1. Die App-Route delegiert an `createWhatsAppWebhookHandlers`; der Handler begrenzt den Body, prüft die Meta-Signatur vor dem JSON-Parsing und validiert das Event (`lib/server/whatsapp/webhook.ts:16-33,70-82`). **PROVEN**
2. Für einen Text persistiert `persistWhatsAppInboundText` zuerst Receipt, Identity/Binding, Conversation und Message über `ingest_whatsapp_inbound_text`. Sein eigener Supabase-Client liest dieselbe URL und denselben Service-Key und deaktiviert Refresh, Session-Persistenz und URL-Session-Erkennung (`lib/server/whatsapp/ingestion.ts:51-72`). **PROVEN**
3. Ein Duplicate endet vor Engine-Auflösung. Ein neu aufgezeichnetes Text-Event wird mit `conversation_id`, Provider, Sender-Scope und externer Identity an den Resolver gereicht (`lib/server/whatsapp/webhook.ts:100-109`). **PROVEN**
4. Der Resolver wählt für die angegebene Testidentität standardmäßig `mvp`, außer `KLIMAGUY_MVP_ENGINE_ENABLED` ist exakt `false`; die Identität ist im aktuellen Allowlisting exakt enthalten (`lib/domain/conversation-engine.ts:11-29`). **PROVEN**
5. Nur ein erfolgreich geparstes Resolver-Resultat entscheidet zwischen MVP-Dispatch und Legacy-/First-Contact-Pfad. Ein Resolverfehler liegt außerhalb der nachgelagerten best-effort-Catches, wird als HTTP 500 behandelt und ausschließlich mit dem kontrollierten Code geloggt (`lib/server/whatsapp/webhook.ts:104-132`). **PROVEN**
6. Der First-Contact-Recovery-Request ist ein separater interner Request. Nach Bearer-Secret-Prüfung ruft er genau einmal die Discovery auf; der Discovery-Aufruf selbst liegt außerhalb des per-item-`try/catch` und kann die Route vor einer Summary abbrechen (`lib/server/conversation/first-contact-recovery-handler.ts:20-50`). **PROVEN**

Die beiden beobachteten Fehler müssen deshalb nicht aus demselben Request oder derselben Transaktion stammen. Sie treffen aber zwei voneinander unabhängige serverseitige Aufrufe derselben Supabase-REST-Grenze. **PROVEN** für die Trennung; **PLAUSIBLE** für eine gemeinsame Infrastrukturursache.

## 3. Resolver-Pfad

### 3.1 TypeScript-Adapter und Request

`resolveProductiveConversationEngine` verlangt eine nichtleere URL und einen nichtleeren Key, erzeugt pro Aufruf einen neuen Client ohne persistierte Session und ruft dann `resolveConversationEngine` auf (`lib/server/conversation/conversation-engine-routing.ts:22-46`). Die exakten Parameter sind:

| PostgREST-Argument | Quelle | Bewertung |
|---|---|---|
| `target_conversation_id` | UUID aus dem bereits erfolgreichen Ingestion-Resultat | Für den vorgegebenen Zyklus **PROVEN** vorhanden; die produktive Übertragung im fehlgeschlagenen Call bleibt Runtime-Evidence. |
| `target_provider` | geparstes WhatsApp-Event, `whatsapp` | **PROVEN** im Code und in der Production-Evidence passend. |
| `target_sender_scope` | geparste Phone Number ID | **PROVEN** im Code; gegebener Wert stimmt mit aktivem Binding überein. |
| `target_external_identity` | geparster Sender | **PROVEN** im Code; gegebener Wert stimmt mit aktiver Identity überein. |
| `proposed_owner` | `selectConversationEngine(...)` | **PROVEN** nur `legacy` oder `mvp`; für die Testidentität standardmäßig `mvp`. |

Die Argumentnamen und Typen stimmen mit der aktuellen Repository-Funktion und laut bereitgestellter Production-Definition überein (`supabase/migrations/202609140005_whatsapp_runtime_rpc_contract_repair.sql:4-10`; `lib/server/conversation/conversation-engine-routing.ts:27-34`). **PROVEN**

### 3.2 SQL-Ausführung und verbleibende Fehlerstellen

Die aktuelle Sollfunktion prüft zuerst `auth.role()`, lädt und sperrt die Conversation, prüft das aktive Identity-Binding, setzt nur bei `NULL` die lokale Authority und aktualisiert dann `engine_owner`; anschließend liefert sie exakt zwei JSON-Felder (`supabase/migrations/202609140005_whatsapp_runtime_rpc_contract_repair.sql:11-28`). Laut bereitgestellter Production-Evidence entspricht die installierte Definition diesem Stand, der `service_role` besitzt `EXECUTE`, die Conversation existiert und genau das passende aktive Binding existiert. **PROVEN**

Trotzdem sind folgende Klassen zu unterscheiden:

- **Auth/Gateway:** `auth.role()` kann `not_authorized` auslösen, falls der effektive Request-Claim nicht `service_role` ist. `SECURITY DEFINER` ändert den Datenbank-Ausführungskontext auf den Funktions-Owner, ersetzt aber nicht den JWT-/Request-Claim, den `auth.role()` liest; gerade deshalb bleibt die explizite Funktionsprüfung wirksam. Ob Production den erwarteten Claim setzt, ist **UNKNOWN / REQUIRES RUNTIME EVIDENCE**.
- **PostgREST Function Resolution:** Falsches Projekt/URL, fehlende Funktion im tatsächlich angesprochenen Projekt, nicht aktualisierter Schema-Cache, eine abweichende/mehrdeutige Signatur oder Argumentvertragsdrift können einen zurückgegebenen PostgREST-Fehler erzeugen. Für den angegebenen Production-Katalog sind Definition und exakte Signatur **PROVEN**; dass genau dieser Katalog vom Runtime-URL-Wert adressiert wird, ist **UNKNOWN / REQUIRES RUNTIME EVIDENCE**.
- **Privileges:** `service_role` hat laut Production-Evidence `EXECUTE`; fehlendes `EXECUTE` ist daher für einen tatsächlich als `service_role` ausgeführten Call **RULED OUT**. Für eine andere effektive Rolle wäre ein Privilege-Fehler weiterhin nur Folge derselben Auth/Environment-Klasse.
- **Enum-Serialisierung:** Der Adapter sendet ausschließlich den String `mvp` oder `legacy`; beide sind Enumwerte (`lib/domain/conversation-engine.ts:1-3,20-29`; `supabase/migrations/202609130002_mvp_conversation_engine_routing.sql:1-2`). Ein clientseitig erzeugter ungültiger Enumwert ist **RULED OUT**. Eine falsche Production-Signatur ist laut Katalog ebenfalls **RULED OUT**.
- **Identity/Conversation:** `conversation_not_found` und `conversation_identity_mismatch` sind mit den bereitgestellten Daten für einen Call mit den dokumentierten Argumenten **RULED OUT**. Ein Argumentunterschied im realen Request ist ohne Requestdiagnose **UNKNOWN / REQUIRES RUNTIME EVIDENCE**.
- **Trigger:** Der Resolver setzt `app.conversation_engine_authority=allowed` transaktionslokal vor dem Update. Der bestätigte `conversation_engine_owner_guard` akzeptiert damit die Änderung. Der bestätigte `conversation_state_guard` prüft `current_project_id`, `status`, `revision`, Customer-/Creation-Felder, nicht ein isoliertes `engine_owner`-Update. Diese beiden Trigger als Ursache des reinen Updates sind **RULED OUT** (`supabase/migrations/202609130002_mvp_conversation_engine_routing.sql:10-19,40-43`).
- **Constraints/weitere Trigger:** `proposed_owner` ist ein gültiger Enumwert und die Änderung setzt nur diese Spalte. Aus Repository und geliefertem Katalog ist keine verletzte Constraint ersichtlich. Eine nicht mitgeteilte Production-Abweichung außerhalb der bestätigten Definitionen ist jedoch **UNKNOWN / REQUIRES RUNTIME EVIDENCE**, nicht pauschal ausgeschlossen.
- **`search_path`:** Die Funktion fixiert `public,pg_temp`, referenziert fachliche Tabellen explizit als `public.*` und nutzt `auth.role()` explizit schemagebunden (`supabase/migrations/202609140005_whatsapp_runtime_rpc_contract_repair.sql:10-25`). Ein normales Search-Path-Hijacking beziehungsweise die Auflösung der fachlichen Tabellen ist **RULED OUT**; das Vorhandensein/Verhalten des Production-`auth`-Schemas ist Teil der bestätigten laufenden Supabase-Plattform, aber nicht durch den Repo-Code allein bewiesen.
- **Race/Transaktion:** `SELECT ... FOR UPDATE` serialisiert konkurrierende Resolver für dieselbe Conversation. Der zweite Call liest nach dem ersten den gesetzten Owner und gibt ihn zurück; er flippt ihn nicht. Ein gleichzeitiges Lifecycle-/Binding-Update könnte zwischen Ingestion und Resolver die Identity-Prüfung scheitern lassen, ist für den beobachteten frischen Zustand aber nur **PLAUSIBLE** und erklärt nicht von selbst auch die read-only Recovery-Discovery (`supabase/migrations/202609140005_whatsapp_runtime_rpc_contract_repair.sql:14-26`).
- **Response-/Zod-Pfad:** Der Adapter mappt sowohl `error` als auch ein ungültiges Resultat auf denselben Namen. Ein valides SQL-Resultat ist `{ conversation_id: UUID, engine_owner: legacy|mvp }` und passt zum strikten Schema (`lib/server/conversation/conversation-engine-routing.ts:12-15,35-38`). Ein erfolgreiches SQL mit unerwartetem Gateway-/Result-Shape könnte daher denselben sichtbaren Resolverfehler erzeugen. Das ist **PLAUSIBLE**, aber wegen des exakten JSON-Vertrags weniger stark als ein zurückgegebener RPC-Fehler.
- **Transport exception:** Ein von `rpc(...)` geworfener Fetch-/Abort-/Clientfehler wird vom Adapter nicht in `conversation_engine_resolution_failed` umbenannt. Der Webhook würde ihn als `whatsapp_webhook_processing_failed` klassifizieren (`lib/server/conversation/conversation-engine-routing.ts:28-38`; `lib/server/whatsapp/webhook.ts:125-132`). Unter der Annahme, dass der beobachtete String exakt der Webhook-Code ist, ist eine reine geworfene Transportexception als unmittelbare Ursache dieses Codes **RULED OUT**.

`engine_owner = NULL` nach dem Versuch ist **STRONG INFERENCE** dafür, dass das Update nicht committed wurde. Es trennt jedoch einen Fehler vor dem SQL-Body, `not_authorized`, Identity-Fehler, Updatefehler und Rollback nicht voneinander.

## 4. First-Contact-Recovery-Pfad

`discoverRecoverableFirstContacts` begrenzt den Input auf `0..10`, erstellt denselben Typ Client aus denselben Environment-Namen und ruft `discover_recoverable_first_contacts({ target_limit })` auf (`lib/server/conversation/first-contact-recovery.ts:6-26`). Die SQL-Funktion ist read-only, verlangt ebenfalls `auth.role()='service_role'`, nutzt die bestätigten fachlichen Tabellen und liefert `conversation_id` plus einen von zwei statischen Actions (`supabase/migrations/202609130002_mvp_conversation_engine_routing.sql:68-82`). Laut Production-Evidence sind die verwendeten Tabellen/Spalten vorhanden und `service_role` hat `EXECUTE`. **PROVEN**

### Kann der benannte Fehler nach erfolgreicher SQL-Ausführung entstehen?

Für **exakt** `new Error("first_contact_recovery_discovery_failed")`: nur wenn Supabase `{ error: truthy }` zurückgibt (`lib/server/conversation/first-contact-recovery.ts:24-26`). Die nachfolgende `discoverySchema.parse(data)` ist keine `safeParse`-Zuordnung; sie wirft einen `ZodError`, nicht diesen generischen Fehlernamen. Deshalb gilt:

- Erfolgreiche SQL-Ausführung plus valides Resultat: benannter Fehler **RULED OUT**.
- SQL kann serverseitig erfolgreich/rein lesend gelaufen sein, aber PostgREST kann die Antwort danach nicht vertragsgemäß liefern und ein Fehlerobjekt zurückgeben: **PLAUSIBLE** im allgemeinen Sinn.
- Erfolgreicher RPC mit falschem Shape (kein Array, mehr als zehn Rows, ungültige UUID, unbekannte Action oder zusätzliche Felder): erzeugt einen Zod-Fehler, **nicht** den benannten Adapterfehler. Als Erklärung für den exakt beobachteten Namen **RULED OUT**, sofern die Production-Beobachtung die tatsächliche Exception und nicht eine äußere pauschale Klassifikation wiedergibt.

Der Handler fängt Discoveryfehler nicht und erzeugt selbst kein Mapping auf `first_contact_recovery_discovery_failed` (`lib/server/conversation/first-contact-recovery-handler.ts:31-50`). Diese Einschränkung macht die Beobachtung besonders wertvoll: Der konkrete Name ist **STRONG INFERENCE** für ein von Supabase zurückgegebenes RPC-Fehlerobjekt, nicht für Zod.

## 5. Gemeinsame Abhängigkeiten

Beide Pfade teilen:

1. die serverseitigen Environment-Namen `NEXT_PUBLIC_SUPABASE_URL` und `SUPABASE_SERVICE_ROLE_KEY`;
2. `createClient(url, key, { auth: { autoRefreshToken:false, persistSession:false, detectSessionInUrl:false } })`;
3. dieselbe installierte `@supabase/supabase-js`-/PostgREST-Implementierung;
4. denselben Supabase API-/Gateway-/PostgREST-Endpunkt, sofern die Environment-URL identisch und korrekt ist;
5. service-only `public`-RPCs mit einer expliziten `auth.role()`-Prüfung;
6. das Muster, ein zurückgegebenes strukturiertes Fehlerobjekt sofort in einen festen generischen Namen zu kollabieren.

Sie teilen **nicht** dieselbe SQL-Funktion, Argumentmenge, Resultform, Datenmutation oder Request-Transaktion. Resolver ist webhook-synchron und schreibt gegebenenfalls; Discovery ist ein separater interner Request und liest nur. **PROVEN**

Der beste gemeinsame Fehlerkorridor ist damit nicht spezifisch „`auth.role()`“, sondern **Environment → Supabase-Client-Header → API-Gateway/Auth → PostgREST/RPC-Auflösung**. Innerhalb dieses Korridors ist ein falscher effektiver Role-Claim ein Kandidat neben falscher Projektpaarung, ungültigem/rotiertem Key und gemeinsamem PostgREST-Fehler. **STRONG INFERENCE**

## 6. Bewertung der `auth.role()`-/`service_role`-Hypothese

### 6.1 Was die Client-Verwendung beweist

- Der aktuelle Resolver und die Discovery lesen **nur** `SUPABASE_SERVICE_ROLE_KEY`; es gibt keinen Anon-Fallback und keine Cookie-/SSR-Client-Injektion (`lib/server/conversation/conversation-engine-routing.ts:41-46`; `lib/server/conversation/first-contact-recovery.ts:14-25`). **PROVEN**
- Session-Persistenz, Auto-Refresh und URL-Erkennung sind deaktiviert. Der Code ruft weder `signIn...` noch `setSession` auf. **PROVEN**
- `supabase-js` 2.114.0 fragt vor jedem REST-Fetch nach einer Session; ohne Session setzt es `apikey` auf den Constructor-Key und nutzt diesen Key als `Authorization: Bearer ...`-Fallback. Neue `sb_secret_...`-Keys werden für normale REST-Aufrufe weiterhin durch diesen Wrapper behandelt; die Sonderoption, die einen neuen Key nicht als Bearer sendet, wird nur für Edge Functions gesetzt, nicht für `rest` (`node_modules/@supabase/supabase-js/src/lib/fetch.ts:24-31,58-95`; `node_modules/@supabase/supabase-js/src/SupabaseClient.ts:364-404,588-605`). **PROVEN**

### 6.2 Was daraus nicht folgt

Die Verwendung einer Variable dieses Namens bedeutet **nicht automatisch und zweifelsfrei**, dass PostgreSQL `auth.role()='service_role'` sieht. Der Repo-Code kann nicht beweisen:

- dass der Production-Wert tatsächlich ein aktueller Service-Role-/Secret-Key und nicht ein falscher, abgeschnittener, rotierter oder andersartiger Wert ist;
- dass URL und Key zum selben Supabase-Projekt gehören;
- dass das beobachtete Deployment den auditierten Commit und die erwartete Environment-Version nutzt;
- wie Production-Gateway/PostgREST den konkreten Legacy-JWT- oder neuen Secret-Key validiert und in Request-Claims übersetzt;
- welchen `auth.role()`-Wert der konkrete fehlgeschlagene Call tatsächlich hatte.

Ein nichtleerer falscher Wert passiert die einzige App-Prüfung. Bei falscher URL kann sogar ein anderer realer Supabase-Katalog erreicht werden. **PROVEN** für die Lücke im Code; **UNKNOWN / REQUIRES RUNTIME EVIDENCE** für den Production-Zustand.

### 6.3 Einstufung

Die Hypothese ist **nur möglich / UNKNOWN / REQUIRES RUNTIME EVIDENCE**. Dass zwei service-only RPCs gleichzeitig fehlschlagen, macht sie plausibel. Dass derselbe Client-Key auch andere serverseitige WhatsApp-RPCs nutzt und die Text-Ingestion im selben frischen Zyklus erfolgreich war, spricht als **STRONG INFERENCE** gegen einen vollständig ungültigen URL-/Key-Pfad, beweist aber `service_role` für die beiden Calls nicht: Der Ingestion-Erfolg könnte bei einer anderen Function-/Grant-Struktur, anderem Deploymentzeitpunkt oder anders klassifiziertem Effekt entstanden sein; zudem liegt kein Rohfehler dieses Calls vor. Deshalb wäre „wahrscheinlich“ Scheinsicherheit und „widerlegt“ ebenfalls falsch.

`SECURITY DEFINER` widerlegt die Hypothese nicht. Es erlaubt der Funktion Zugriffe mit den Rechten ihres Owners, während die explizite `auth.role()`-Prüfung weiterhin den authentifizierten Request-Claim kontrolliert. **PROVEN** durch die Funktionsreihenfolge und Semantik des vorhandenen Contracts; der konkrete Production-Claim bleibt unbekannt.

## 7. Alternative Root-Cause-Kandidaten

| Kandidat | Bewertung | Begründung |
|---|---|---|
| Falscher/rotierter/abgeschnittener Key oder URL-Key-Projekt-Mismatch | **PLAUSIBLE** | Beide Adapter teilen die Environment-Werte; nur Nichtleere wird geprüft. Erklärt beide RPC-Fehler besser als resolver-spezifische Daten. |
| Runtime adressiert nicht den geprüften Production-Katalog | **PLAUSIBLE** | `NEXT_PUBLIC_SUPABASE_URL` ist Deploymentzustand; Repository und Katalogabzug beweisen ihre Verbindung nicht. |
| Effektiver Claim ist nicht `service_role` / SQL wirft `not_authorized` | **PLAUSIBLE; UNKNOWN / REQUIRES RUNTIME EVIDENCE** | Exakt gemeinsame Prüfung beider Funktionen; Rohcode/Message wurde vernichtet. |
| Gemeinsamer PostgREST-Schema-Cache oder Function-Resolution-Fehler | **PLAUSIBLE** | Beide sind RPCs; bestätigte Katalogdefinitionen schließen Runtime-Cache/angesprochenes Projekt nicht aus. Unterschiedliche Funktionen machen einen identischen Signaturfehler weniger naheliegend. |
| Supabase/API-Netzwerkstörung | **RULED OUT** als geworfene Fetch-Rejection für die exakten Namen; HTTP-/Gateway-`error` **PLAUSIBLE** | Echte Fetch-Rejections werden von diesen Adaptern nicht umbenannt. Ein HTTP-/Gateway-Fehler, den PostgREST-js als `{error}` liefert, bleibt dagegen möglich. |
| Resolver-Result ist ungültig, Discovery hat unabhängigen RPC-Fehler | **PLAUSIBLE, aber keine gemeinsame Ursache** | Resolvername deckt Zod und RPC ab; Discoveryname deckt nur RPC-`error` ab. Benötigt zwei Ursachen. |
| Gemeinsame Zod-/Result-Shape-Ursache | **RULED OUT** für die exakten beiden Namen | Discovery-`parse` wirft `ZodError`; nur Resolver mappt Parsefehler auf den generischen Namen. |
| Gemeinsamer fachlicher Daten-/Lifecycle-Fehler | **PLAUSIBLE**, aber schwach gestützt | Discovery ist read-only und filtert Kandidaten; Resolver prüft eine einzelne aktive Identity. Bestätigte Dependencies und Daten erklären keinen gemeinsamen Exceptionpunkt. |

Es gibt im Repo **keinen anderen einzelnen gemeinsamen Fehlerpfad**, der `auth.role()` bereits klar besser erklärt. Es gibt vielmehr einen breiteren gemeinsamen Auth/API/PostgREST-Korridor. Ohne den verworfenen Fehlercode ist keine Rangfolge zwischen dessen Kandidaten beweisbar. **PROVEN** für den Codegraph; **UNKNOWN / REQUIRES RUNTIME EVIDENCE** für die konkrete Ursache.

## 8. Welche Kandidaten bereits ausgeschlossen sind

Unter der Voraussetzung der gelieferten Production-Evidence und der dokumentierten Testargumente sind ausgeschlossen:

- fehlende Production-Funktion oder falsche Production-Signatur von `resolve_conversation_engine_owner`: **RULED OUT**;
- fehlendes `EXECUTE` für die tatsächlich effektive `service_role`: **RULED OUT**;
- fehlende genannte Tabellen/Spalten der Discovery: **RULED OUT**;
- `conversation_state_guard` als Blocker eines reinen `engine_owner`-Updates: **RULED OUT**;
- `conversation_engine_owner_guard` als Blocker nach dem lokalen Authority-Setzen: **RULED OUT**;
- ungültige clientseitige Enum-Serialisierung: **RULED OUT**;
- `conversation_not_found` beziehungsweise `conversation_identity_mismatch`, **wenn** der Runtime-Call exakt die gelieferten Werte trug: **RULED OUT**;
- ein Discovery-Zod-Fehler als direkte Quelle des exakten Strings `first_contact_recovery_discovery_failed`: **RULED OUT**;
- ein einziger gemeinsamer Zod-Shape-Fehler für beide sichtbaren Strings: **RULED OUT**;
- eine nachgelagerte MVP-, First-Contact-Initialisierungs-, Delivery- oder KI-Stufe als Ursache des Resolverfehlers: **RULED OUT**, weil Engine-Auflösung vorher scheitert.

Nicht ausgeschlossen sind nicht beobachtete Runtime-Argumentabweichungen, Gateway-/Auth-Verhalten, URL-/Key-Mismatch, Schema-Cache und andere vom Supabase-Fehlerobjekt benannte PostgREST-/SQL-Klassen.

## 9. Welche Runtime-Evidence aktuell fehlt

Für eine Entscheidung fehlen mindestens, jeweils **ohne** Secret, PII, SQL-Text, Message, Details oder Hint zu erfassen:

1. der kontrolliert klassifizierte `error.code`/SQLSTATE beziehungsweise PostgREST-Code beider fehlgeschlagenen Calls;
2. die Unterscheidung `rpc_error` gegen `response_validation_error` beim Resolver;
3. eine sichere Klassifikation, ob der Code `P0001` (explizite PL/pgSQL-Exception), `42501` (Privilege), `PGRST...` (Function/API contract) oder eine HTTP/Gateway-Klasse ist;
4. ein sicherer, nicht reversibler Deployment-Konfigurationsbefund „URL vorhanden, Key vorhanden, erwarteter Key-Typ“, ohne Werte oder Fingerprints zu loggen;
5. Bestätigung, dass das aktive Deployment genau Baseline und Environment-Scope/-Version verwendet;
6. falls der Fehler `P0001` ist, eine **geschlossene** Unterklassifikation der statischen Funktionsfehler (`not_authorized`, `conversation_not_found`, `conversation_identity_mismatch`) ohne rohe Message oder Identitäten;
7. beim Resolver die separate Klassifikation eines validen RPC-Erfolgs mit ungültigem Zod-Shape.

Ein direkter Production-Credential-Test, Workflow-Dispatch oder Credential-Umweg ist dafür weder Bestandteil noch Empfehlung dieses Audits.

## 10. Bewertung des vorgeschlagenen Diagnose-Patches

Ein kleiner Diagnose-Patch ist **ausreichend als sinnvoller nächster Schritt**, aber nur bei enger Gestaltung:

- Fehler an den beiden bestehenden Adaptergrenzen klassifizieren; keine neue Schicht und keine fachliche Semantik.
- Supabase `error.code` nur nach einem strikten Format-/Allowlist-Vertrag übernehmen und in eine statische Zusammenfassung mappen.
- Niemals `message`, `details`, `hint`, Stack, Cause, Argumente, URLs, IDs, Telefonnummern, Inhalte oder das Error-Objekt loggen.
- Resolver-`rpc_error` und `response_validation_error` als getrennte geschlossene Stufen behandeln. Discovery hat diese Trennung durch seinen heutigen Control Flow bereits technisch, benötigt aber eine kontrollierte sichtbare Klassifikation.
- Genau eine Sink pro fehlgeschlagenem Invocation; keine doppelten Logs in Adapter, Webhook und Recovery-Handler.
- Keine SQL-Funktionsänderung, Migration, Production-Abfrage, Proof-/Harness-/Gatekeeper-Schicht oder neue Runtime-Architektur.

SQLSTATE allein identifiziert `not_authorized` nicht zwingend: Das heutige `raise exception 'not_authorized'` verwendet typischerweise die allgemeine PL/pgSQL-Klasse `P0001`, die auch andere explizite Raises nutzen. Deshalb soll der Patch SQLSTATE zuerst die große Klasse beweisen. Eine kontrollierte Unterklassifikation darf nur statische, vorab erlaubte Messages aus genau diesen RPCs erkennen und muss rohe Texte verwerfen. **STRONG INFERENCE**

## 11. Kleinster empfohlener nächster Schritt

Nach diesem Audit ein **separater**, schmaler Diagnose-PR:

1. Das vorhandene `classifyAcquisitionRpcError`-Muster als Ausgangspunkt verwenden: fünfstelligen Code validieren, nur Allowlist-Summaries erzeugen, rohe Felder niemals propagieren (`lib/server/conversation/acquisition-rpc-diagnostics.ts:1-35`).
2. Für Resolver und First-Contact-Discovery einen eng benannten gemeinsamen Klassifikator nur dann extrahieren, wenn beide exakt dieselbe sichere Taxonomie benötigen; andernfalls denselben kleinen Pattern lokal anwenden. Keine generische Telemetrieplattform.
3. Die zwei Adapter sollen `rpc_error` von `response_validation_error` unterscheiden. Der Resolver muss seinen heutigen Doppelgebrauch desselben Fehlernamens auflösen; Discovery soll Zod weiterhin getrennt behandeln.
4. Der bestehende Webhook-Sink darf ausschließlich geschlossene Felder ausgeben. Für die Recovery-Route ist genau ein entsprechender top-level Sink nötig, weil der Handler Discovery derzeit ungefangen propagiert.
5. Unit-Tests müssen Code-Allowlist, unbekannten Code, PII-Canaries in `message/details/hint`, Resolver-Shape-Fehler und Discovery-Shape-Fehler beweisen.
6. Erst einen erneuten natürlichen Production-Zyklus beobachten. Danach ist ein konkreter Fix gerechtfertigt: Auth/Deployment nur bei entsprechender Evidence, Function/Cache nur bei PostgREST-Evidence, Resultvertrag nur bei Validation-Evidence.

Dies ist **kein** Vorschlag, den Patch im Audit-PR zu implementieren.

## 12. Hypothesentabelle

| Hypothese | Evidence | Beweisgrad | Konsequenz |
|---|---|---|---|
| Beide Fehler können dieselbe Ursache haben. | Gleiche Env-Namen, Client-Konfiguration, REST-Grenze, service-only Prüfung und Fehlerkollaps. | **PLAUSIBLE** | Gemeinsam diagnostizieren, nicht zwei Fixes raten. |
| Beide Fehler sind bewiesen `not_authorized`. | Beide SQL-Funktionen prüfen `auth.role()`, aber beide TS-Adapter verwerfen den Rohfehler. | **UNKNOWN / REQUIRES RUNTIME EVIDENCE** | Kein Auth-Fix ohne kontrollierten Runtime-Code. |
| `SUPABASE_SERVICE_ROLE_KEY` garantiert `auth.role()='service_role'`. | Variablenname und Client-Header sind belegbar; Wert, Projektpaarung und Gateway-Claims nicht. | **RULED OUT** als Garantie | Deployment-/Claim-Zustand nicht aus Quellcode behaupten. |
| Der installierte Client sendet den Constructor-Key bei REST. | `apikey` plus Bearer-Fallback ohne Session in 2.114.0; RPC nutzt `rest`. | **PROVEN** | Clientcode ist plausibel korrekt, Production-Key bleibt unbekannt. |
| Resolver-Argumentnamen entsprechen Production. | Adapterargumente und bestätigte Funktionssignatur stimmen exakt überein. | **PROVEN** | Statische Argumentvertragsdrift ist ausgeschlossen. |
| Resolver-Enum ist ungültig. | Auswahl liefert ausschließlich `legacy|mvp`, passend zum Enum. | **RULED OUT** | Kein Enum-Fix. |
| Resolver scheitert am aktiven Binding. | Gelieferte Conversation hat genau ein passendes aktives Binding. | **RULED OUT**, falls Runtime-Argumente exakt sind | Nur bei Diagnose einer Argument-/Race-Abweichung erneut prüfen. |
| `conversation_state_guard` blockiert `engine_owner`. | Bestätigter Trigger prüft andere Spalten; Owner-Guard erhält lokale Authority. | **RULED OUT** | Keine Triggeränderung. |
| Discovery scheitert an fehlender Tabelle/Spalte. | Alle konkret verwendeten Dependencies sind laut Production-Evidence vorhanden. | **RULED OUT** | Keine Reparaturmigration. |
| Discovery-SQL war erfolgreich, Zod erzeugte den benannten Fehler. | `.parse` läuft nach dem expliziten Error-Mapping und wirft `ZodError`. | **RULED OUT** für den exakten Namen | Diagnose muss dennoch Shape-Fehler separat sichtbar machen. |
| Falsche URL-/Key-Paarung erklärt beide Fehler. | Beide lesen dieselben unvalidierten Production-Werte; tatsächliche Werte unbekannt. | **PLAUSIBLE** | Sicher klassifizieren, nicht Credentials auslesen/loggen. |
| PostgREST Function-/Schema-Cache erklärt beide. | Beide Calls passieren dieselbe RPC-Grenze; Katalog allein beweist Cache/Runtimeziel nicht. | **PLAUSIBLE** | `PGRST...`-Code würde gezielte Untersuchung erlauben. |
| Reine Netzwerkexception erzeugt beide exakten Namen. | Geworfene RPC-Exceptions werden nicht von den Adapter-`if(error)`-Mappings erfasst. | **RULED OUT** bei exakt beobachteten internen Namen | HTTP-/Gateway-Fehler als `{error}` bleibt möglich. |
| Tests beweisen den echten Service-Role-Pfad. | Resolver-, Recovery- und Webhook-Tests injizieren `vi.fn()`; Migrationstests suchen SQL-Text. | **RULED OUT** | Bestehende Tests können Production Auth/Gateway nicht entdecken. |
| Ein sicherer Diagnose-Patch ist der kleinste nächste Schritt. | Mehrere plausible Klassen sind heute absichtlich ununterscheidbar; vorhandenes sicheres Muster existiert. | **STRONG INFERENCE** | Separater Diagnose-PR, danach Evidence-basierten Fix wählen. |

## 13. Tests und ihre Beweisgrenzen

Die relevanten Tests beweisen Domain-/Adapterverträge, nicht die echte Production-Authentisierung:

- `conversation-engine-routing.test.ts` injiziert ein `rpc`-Mock und testet Auswahl, Persistenzresultat und Argumente; `createClient`, Header, Gateway und PostgreSQL laufen nicht (`test/conversation-engine-routing.test.ts:15-23`). **PROVEN**
- `whatsapp-runtime-rpc-contract-repair.test.ts` injiziert ebenfalls ein erfolgreiches beziehungsweise fehlerhaftes `rpc`-Mock und prüft SQL als Text. Es wendet keine Migration auf eine Datenbank an und ruft keinen Service-Role-Pfad auf (`test/whatsapp-runtime-rpc-contract-repair.test.ts:6-50`). **PROVEN**
- `first-contact-recovery.test.ts` ersetzt Discovery und Runner vollständig durch Mocks; es testet Handlerauth, Budget und Summary, nicht Supabase-Auth (`test/first-contact-recovery.test.ts:8-59`). **PROVEN**
- `first-contact-recovery-migration.test.ts` macht ausschließlich String-Prüfungen an einer historischen Migration (`test/first-contact-recovery-migration.test.ts:4-21`). **PROVEN**
- `whatsapp-webhook.test.ts` injiziert Persistence und Resolver. Der Test für Enginefehler erzeugt den generischen Fehler selbst und bestätigt nur sichere Log-/HTTP-Semantik (`test/whatsapp-webhook.test.ts:162-190`). **PROVEN**
- Der vorhandene Diagnose-Test beweist, dass `message/details/hint` nicht weitergegeben und nur Codes/statische Stages übernommen werden; er ist das relevante Sicherheitsvorbild (`test/legacy-rehabilitation-acquisition-diagnostics.test.ts:5-31`). **PROVEN**

Damit würden alle vorhandenen relevanten Tests auch dann grün bleiben, wenn Vercel einen falschen Key, eine falsche URL oder einen Gateway-Claim ohne `service_role` verwendete. **PROVEN**

## 14. Final Verdict

### Entscheidung: **A — Die Diagnose-Instrumentierung ist jetzt der sinnvollste nächste Schritt.**

Die gemeinsame Auth-/RPC-Hypothese ist technisch kohärent, aber die vorliegenden Beweise tragen keinen konkreten Fix. Der Sourcecode beweist, dass beide Adapter denselben privilegierten Clientaufbau beabsichtigen und dass `supabase-js` den Key am REST-Request anbringt. Er beweist weder den Deploymentwert noch den vom Production-Gateway erzeugten Claim. Gleichzeitig sind mehrere statische Verdachtsmomente bereits ausgeschlossen: Signatur, relevante Production-Dependencies, Service-Role-Grant, Enumwerte und die bekannten Trigger. Übrig bleibt ein schmaler, aber immer noch mehrdeutiger Korridor aus Auth/Environment, Gateway/PostgREST-Auflösung und – nur beim Resolver – Resultvalidierung.

Gerade weil der First-Contact-Fehlername einen zurückgegebenen RPC-Fehler stark nahelegt, ist die nächste Information mit sehr kleinem Risiko zu gewinnen: sicher allowgelisteter Code plus feste Stufe. Das bestehende Acquisition-Muster zeigt bereits, wie SQLSTATE sichtbar gemacht werden kann, ohne personenbezogene Daten oder rohe Datenbanktexte zu loggen. Eine neue Migration, eine Änderung der RPC-Auth-Prüfung, ein Trigger-Fix oder eine Vercel-Konfigurationsänderung wäre dagegen derzeit spekulativ.

**Stop-Bedingung dieses Audits:** Es gibt **keine** Production-/Runtime-Änderung, keine Migration und keinen Fix in diesem PR. Nach dem Audit-PR ist zu stoppen; Diagnose-Instrumentierung gehört in einen späteren, separat freigegebenen PR.
