# AP-16-04-00 — WhatsApp Text Transport, Webhook Security and Delivery Architecture Audit

## 1. Audit Metadata

| Feld | Wert |
|---|---|
| Audit-ID | `KG-AUDIT-2026-08-23-AP16-04-00-WHATSAPP-TEXT-TRANSPORT-WEBHOOK-DELIVERY-V1` |
| Datum | 2026-08-23 |
| Branch | `codex/audit-ap16-04-whatsapp-text-transport` |
| Baseline | `67754c747c6ae1edc58dd94cf097a9b0e7a0b6ac` |
| Paket | AP-16-04-00, ausschließlich Audit/Architektur |
| Status | **READY FOR OWNER DECISION** |

## 2. Scope

Dieses Paket plant ausschließlich die Grenze zwischen WhatsApp-Texttransport und der bestehenden providerunabhängigen Conversation-Pipeline. Es implementiert weder Route, Meta API, Netzwerkaufruf, Secretintegration, Providerpersistenz, Telefonnummernpersistenz, Versand, Statusverarbeitung, Mediendownload, UI, Historical Import, Vision, LLM noch Tests und ändert keine Dependency oder `package.json`.

Untersucht wurden das vollständige AP-16-00-Dokument einschließlich AP-16-01/02/03-Resultaten, Conversation Authority, Runtime, persistenter Cycle-Service und Orchestrierung, Project-/Customer-Domain, Auth/Profile/Permissions, Routes, Environment-Konventionen, Audit/RLS/`SECURITY DEFINER`, server-only Adapter und Project-Media-Grenzen. Repositoryweit wurde nach WhatsApp, Meta, Webhook, Graph-Endpunkt, Telefon-/Provideridentitäten, Delivery/Status, Tokens, Secrets, Signaturen und Netzwerkaufrufen gesucht.

## 3. Current Internal Conversation Pipeline

Die Migrationen `202608230004`, `...005` und `...006` liefern providerunabhängige Conversation-/append-only Message-Authority, optionale Customer-/Project-Zuordnung, conversation-lokale Sequence, Runtime/Pending/Collection/Retry/Effort/Evidence State und idempotente Message-to-Cycle-Commands. AP-16-03 akzeptiert ausschließlich eine persistierte `message_id`, rekonstruiert Actor/Text/Binding serverseitig und erzeugt interne Outbound Message plus Pending Interaction atomar. `open` ist automatische Verarbeitungsbedingung; `paused`, `human_review`, `closed` bzw. unassigned blockieren den Cycle.

Knowledge, Planner, Templates und Normalisierung sind transportagnostisch. Interne Message-UUID und Sequence sind kanonisch; `occurred_at` ist Ereigniszeit, `created_at` DB-Zeit. Ein Transportstatus darf diese Authorities nicht umdeuten.

## 4. Existing Messaging / Provider Code

**Ergebnis: kein WhatsApp-Transportcode vorhanden.** Es gibt kein WhatsApp-/Meta-SDK, keinen Webhook, `graph.facebook`-Call, `phone_number_id`, `wa_id`, Provider-Message-Binding, Receipt, Delivery Command, Send Attempt, Delivery-/Read-Verarbeitung, Queue/Worker oder Live-/Historical-Ingestion. `fetch()` kommt nur in bereits vorhandenen, sachfremden Browser-/Test-/Script-Kontexten vor; server-only Adapter kapseln derzeit Supabase Auth/Storage, nicht WhatsApp.

`customers.phone` ist ein optionales freies Feld, weder normalisiert noch verifiziert oder eindeutig und daher keine Transport Authority. Treffer für „provider“ betreffen überwiegend Supabase Auth/Storage, Audittexte und negative Architekturtests. `.env.example` enthält nur öffentliche Supabase-Konfiguration; eine WhatsApp-Konfiguration existiert nicht. Vorhandene App-Routes sind Auth-/Uploadgrenzen und kein Webhook. Es existiert kein allgemeines Background-/Queue-System. Project Media verwendet private Storageobjekte, serverseitige signierte Zugriffe, kontrollierte Lifecycle-/Dependency-Authorities und erlaubt heute nur `manual_upload`; WhatsApp-Medien bleiben AP-16-05.

## 5. Official Provider Contract Verification

Am **2026-08-23** wurde ausschließlich der Zugriff auf offizielle Meta-Quellen versucht (`developers.facebook.com`, Cloud-API-, Webhook- und Graph-Webhook-Dokumentation). Der bereitgestellte Webzugriff antwortete `401 Unauthorized`; direkter HTTPS-Zugriff scheiterte am Umgebungstunnel mit `403 Forbidden`. Daher wurde **keine aktuelle WhatsApp Cloud API-Version verifiziert** und keine versionsabhängige Payloadstruktur als Tatsache festgeschrieben.

Folgende Punkte sind zwingende Implementierungsgates gegen die dann aktuelle offizielle Meta-Dokumentation: unterstützte und zu pinnende Graph/Cloud-API-Version; Verifikationsmethode und Challengeparameter; POST-Signaturheader, Algorithmus und exakt signierte Raw-Body-Bytes; Acknowledge-/Retry-Zeitfenster; Event-/Message-/Statusfelder und deren Identität/Scope; Providerzeitformat; Textlimits; Send-Request/-Response; unterstützte Statuswerte; Rate-Limit-/`Retry-After`-Semantik; sowie eine etwaige providerseitige Client-Referenz oder Reconciliation API. Die im Auftrag genannten Namen (etwa Verify Token, App Secret, `X-Hub-Signature`, `wa_id`) sind **Kandidaten, keine hier verifizierten Contracts**. Keine API-Feldannahme darf aus diesem Audit implementiert werden.

## 6. Terminology

| Begriff | Verbindliche Bedeutung |
|---|---|
| Transport Identity | Providergebundene, PII-haltige Kundenadresse; keine Customer-, Project- oder Conversation-Identität. |
| WhatsApp Business Sender Identity | Eigene sendende Business-/Phone-Identity, getrennt von Zielkontakt und Secret. |
| Provider Message ID | Opaque Meta/WhatsApp-Transportidentität; niemals interne Message-ID. |
| Webhook Event | Eine Provider Notification; Zustellung kann dupliziert oder ungeordnet sein. |
| Inbound Receipt | Persistierter, minimal extrahierter Empfangs-/Dedupezustand eines authentischen Events. |
| Internal Message | Providerunabhängige append-only AP-16-01-Message. |
| Outbound Delivery Command | Persistente Anweisung, eine existierende interne Outbound Message an ein Binding zu transportieren. |
| Send Attempt | Einzelner Provider-Sendeversuch eines Delivery Commands. |
| Delivery Status | Explizit gemappter Providertransportstatus. |
| Message Delivery | Technischer Transportzustand, keine fachliche/Knowledge-Aussage. |

## 7. Transport Architecture Variants

| Variante | Idempotenz/Debug | weitere Kanäle/Providerwechsel | Datenschutz | MVP-Aufwand | Urteil |
|---|---|---|---|---|---|
| A — Providerdaten auf `conversation_messages` | einfache Abfrage, aber vermischte Uniqueness und Mutation append-only Rows | schlecht | PII leakt in Core/DTO/RLS | klein scheinend | ablehnen |
| B — WhatsApp-spezifische Tabellen | gut für Meta-Details | Duplikation je Kanal, Wechsel teuer | isolierbar | mittel | nur Adapterrand |
| C — generischer Transport Binding Layer | klare Idempotenz/Bindings | sehr gut | eigene restriktive Grenze | mittel | Kernempfehlung |
| D — reine Eventtabellen | Replay/debugbar, aber Zustandsrekonstruktion/Exactly-once schwierig | flexibel | Payload-/Retentionrisiko | mittel bis hoch | nicht als Authority |
| E — Hybrid | generische Identity/Binding/Delivery Authorities plus providerspezifischer Parser/Attempt-Detail | sehr gut | PII getrennt, minimale Felder | mittel, stufbar | **empfohlen** |

## 8. Recommendation

**Variante E:** generische Transport Identity, Conversation Channel Binding, Provider Message Binding, Receipt, Delivery Command und Send Attempt; WhatsApp-spezifisch bleiben Authentifizierung, Payloadparser, Sendadapter und explizite Status-/Fehlermapper. Keine rohe Event-Sourcing-Autorität und keine Providerfelder im Conversation Core. Current-State und append-only technische Historie werden getrennt.

Inbound: authentifizieren → bounded parse zu canonical transport event → atomare Ingestion → interne Message → separater idempotenter AP-16-03-Trigger. Outbound: existierende interne Outbound Message → Delivery Command → unmittelbarer Eligibility-/Takeover-Recheck → Adapter → Attempt/Binding → Statusreconciliation. Nur Adapter greifen auf Netzwerk/Providercontract zu.

## 9. Provider-independent Core

`conversations`, `conversation_messages`, `conversation_runtime_states` und Project Knowledge State behalten fachliche Identität, Schema und Zuständigkeit. Provider-ID, Telefon, Receipt und Delivery State werden niemals deren Primärschlüssel, Sequence oder Knowledge-Provenienz. Delivery Events dürfen weder Runtime noch Planner, Retry State oder Knowledge mutieren.

## 10. Transport Identity

Geplant ist `conversation_transport_identities` (Name final im Implementation Freeze): UUID, Provider-Allowlist, opaque externe Kontaktidentität in kontrollierter Speicherform, optionaler `customer_id`, Status, `created_at`, `updated_at`; keine Project-FK. Zusätzlich gehört die Zuordnung Conversation↔Identity in ein eigenes Binding mit Sender Identity/Channel und Status.

Die Transport Identity ist langfristig optional an Customer, niemals direkt/dauerhaft an genau ein Project gebunden. Provider + Sender-Scope + externe Kontaktidentität müssen eindeutig auflösbar sein. Exakte Provideridentität ist Primary Authority; keine fuzzy Telefonnummernlogik. Falls E.164 zusätzlich benötigt wird, nur nach verifiziertem Contract und kontrollierter Parserbibliothek/Regel, niemals als geratenes Identitätsäquivalent.

## 11. Customer Mapping

A (exakter Match auf freies `customers.phone`) ist nicht zuverlässig; C (automatisches Customer-Anlegen) erzeugt ungeprüfte CRM-Daten; B allein verlangt manuelle Zuordnung. Empfehlung **D/Hybrid**: Identity separat anlegen, optional später kontrolliert einem Customer zuordnen. Ein konservativer exakter Kandidatentreffer darf höchstens Staff-Review unterstützen, nicht automatisch binden, bis Normalisierung/Verifikation eindeutig geregelt ist. Mehrere Projects eines Customer rechtfertigen nie Project-Autoselektion.

## 12. New Contact Flow

Authentisches neues Text-Event erzeugt idempotent Transport Identity, neue **unassigned** offene Conversation, aktives Channel Binding, Receipt, Provider Binding und interne Customer-Textmessage. Es erzeugt weder Customer noch Fake Project. Da AP-16-03 Runtime ein Project benötigt, startet kein Auto-Cycle; die Message bleibt History und wird kontrolliert zur Zuordnung/Human-Bearbeitung sichtbar.

## 13. Conversation Selection

Empfehlung: pro `(provider, sender_identity, transport_identity)` höchstens ein `active` Conversation Binding, per partiellem Unique Constraint und Lock geschützt. Existiert keines, entsteht eine unassigned Conversation. Keine „latest conversation/project“-Heuristik. Eine geschlossene Conversation wird nicht wiederverwendet oder implizit geöffnet; eine neue Conversation/Binding-Generation entsteht. Eine bekannte Customer-Zuordnung ändert diese Regel nicht.

## 14. Transport Binding

Separate Authority bindet `conversation_id`, `transport_identity_id`, `sender_identity_id`, Provider/Channel, `active|superseded|closed`, Zeitpunkte und Revision. Providerdaten stehen nicht auf Conversation. Aktivieren/Ersetzen geschieht atomar; historische Bindings bleiben nachvollziehbar. Outbound Destination stammt ausschließlich aus dem aktiven Binding, niemals aus Message-Text oder Customer-Telefonfeld.

## 15. Webhook Route

Geplante server-only Boundary, Pfad im Implementation Freeze festzulegen: `GET` ausschließlich für Provider-Verifikation, falls offiziell erforderlich; `POST` für Receipt. POST liest begrenzte Raw Bytes, authentifiziert vor JSON-Verarbeitung, validiert Envelope/Eventzahl, persistiert/dedupliziert und stößt Ingestion an. Route plant, normalisiert, interpretiert und schreibt kein Knowledge; sie ruft weder Cycle mit Payload noch Outbound Provider Send auf.

## 16. Webhook Verification

Verifikationsparameter und Challengeantwort müssen vor Implementierung offiziell bestätigt werden. Der server-only Verify Token wird mit kontrolliertem Vergleich geprüft, nie geloggt, persistiert oder an Client ausgeliefert. Fehlender/falscher Token failt ohne Challengeleak. Zeit-/HTTP-Semantik wird erst nach Contractverifikation festgeschrieben.

## 17. Webhook Authenticity

POST muss anhand des offiziell bestätigten Signaturvertrags über **exakte Raw-Body-Bytes** und server-only App Secret verifiziert werden, bevor Parsing/Persistenz stattfindet. Trusted Crypto Utility, korrektes Encoding, Length-Check und constant-time Vergleich; fehlende, malformed oder ungültige Signatur fail closed. Da Header/Algorithmus nicht erreichbar verifiziert wurden, sind sie Implementation Gate, nicht Auditbehauptung.

## 18. Receipt Authority

Minimale `transport_webhook_receipts`: UUID, Provider, Sender-Scope, dedupe identity/fingerprint, Eventkategorie-Allowlist, `received_at`, `processing_status`, optional interne Result-Bindings und geschlossene Failure Class. Keine Message-Texte, Telefonnummern, Tokens oder Rohpayloads. Invalid-signature Requests werden nicht als echte Receipts/Messages gespeichert; optional nur aggregierte Security-Metrik ohne Body/PII.

## 19. Raw Provider Payload

Varianten: A keine Persistenz; B kurzzeitig verschlüsselte technische Retention; C nur sanitisiert extrahierte Felder. **MVP-Empfehlung C ohne Rohpayload**. Extrahiert werden nur für Dedupe, Binding, Inhalt und Status zwingende Werte in ihren zuständigen Authorities. B benötigt vor Einführung Zweck, Verschlüsselungs-/Schlüsselowner, Zugriff, Löschjob und kurze feste Retention; derzeit nicht freigegeben.

## 20. Provider Event Idempotency

Message Event: verifizierte Provider Message ID im richtigen Provider+Sender-Scope ist primärer Dedupe-Key. Receipt-Fingerprint ist nur nach offiziell bestätigter Feldkanonisierung zulässig. Delivery: `(provider, sender_scope, provider_message_id, canonical_status[, verified_event_identity])`, niemals Timestamp allein. Unique Constraints plus Transaktion/Locks entscheiden Concurrent Replay. Duplicate liefert bestehendes Resultat und erzeugt weder zweite interne Message/Cycle/Outbound-Antwort noch unnötiges Audit.

## 21. Provider Message Binding

Separate Authority: UUID, `internal_message_id`, Provider, Sender-Scope, Provider Message ID, Direction, Transport Identity, optionale Providerzeit und DB-Zeit. Provider Message ID ist mindestens in `(provider, sender_identity)` eindeutig; ob Meta globale/Phone-Scope-Eindeutigkeit garantiert, ist offiziell zu verifizieren. Inbound Binding und interne Message entstehen atomar; outbound Binding wird nach bestätigter Providerannahme idempotent ergänzt. Keine ID wird geraten.

## 22. Inbound Text Mapping

Der WhatsApp-Parser extrahiert ausschließlich verifiziertes Text-Event zu canonical `{event_identity, contact_identity, sender_identity, provider_message_id, occurred_at?, text}`. Ingestion schreibt exakt denselben Text als `direction=inbound`, `actor_class=customer`, `kind=text`; keine Trim-/NLP-/Project-/Permission-/Promptinterpretation. Bestehendes internes 20.000-Zeichenlimit und verifizierte Providerlimits müssen fail-safe zusammengeführt werden; Oversize wird nicht still abgeschnitten.

## 23. Provider Timestamp

Nur ein offiziell verifiziertes, erfolgreich strikt geparstes Providerzeitfeld darf `occurred_at` setzen. `created_at` bleibt DB-Zeit. Fehlt/invalidiert die Providerzeit, ist die genaue Fallback-/Reject-Semantik vor Implementierung zu entscheiden; niemals bestimmt Providerzeit interne Sequence oder sortiert bestehende History rückwirkend um.

## 24. Inbound Atomicity

Eine enge server-only DB-Authority sperrt/erstellt in stabiler Reihenfolge Sender/Transport Identity, aktives Binding/Conversation, Receipt, Message Sequence, interne Message und Provider Message Binding; Unique/CAS schützt Replay. Idealerweise ist dies eine Transaktion. AP-16-03 gehört **nicht** in diese Transaktion. Rollback hinterlässt keine halb gebundene echte Message; ein persistiertes Message-Ergebnis bleibt selbst dann endgültig, wenn Cycle später scheitert.

## 25. AP-16-03 Trigger

Nach erfolgreichem Commit wird ausschließlich `processCustomerMessage({message_id})`/äquivalente interne Authority aufgerufen, niemals mit Webhookpayload. Unassigned, `paused`, `human_review` und `closed` werden persistiert, aber nicht automatisch verarbeitet. Cycle Failure bleibt im Cycle Command retrybar; Receipt ist `processed_to_message`. Webhook Replay darf nur dieselbe Message/Command-Autorität finden.

## 26. Webhook Response Timing

A synchroner vollständiger Cycle ist klein, aber timeout-/Replayanfällig; B persist+ack+kontrollierter Follow-up Worker entkoppelt Providerlatenz; C DB-Outbox ist robust, aber neue Infrastruktur. Repository enthält keinen Worker/Queue. **Kleinstes robustes MVP:** atomare Ingestion plus persistenter, claimbarer Follow-up/Outbox-Datensatz in derselben DB-Grenze, zeitnah ack; kontrollierter serverseitiger Runner darf zunächst einfach sein. Weder kompletter Cycle noch Send blockiert den Provider-Ack. Exakte Ack-Frist/Statuscodes bleiben offizielles Gate.

## 27. Outbound Architecture

AP-16-03 formuliert und persistiert die einzige kundenadressierte interne AI-Message. Transport erzeugt keinen Text. Ein Delivery Service übernimmt `internal_message_id`, löst aktives Binding/Identity, erzeugt idempotenten Command und gibt ihn an den WhatsApp-Textadapter. Netzwerk ist ausschließlich Adapterzuständigkeit.

## 28. Outbound Eligibility

In derselben kontrollierten Claim-/Pre-send-Grenze prüfen: Conversation `open`; nicht `paused`/`human_review`/`closed`; bei automatisiertem Actor kein Human Takeover; aktives WhatsApp-Binding und Sender Identity; Message gehört Conversation, ist `outbound/text`, zulässiger Actor und noch nicht erfolgreich/ambig transportiert; Command-Destination entspricht Binding. Unassigned Conversation/fehlendes Binding blockiert fail closed.

## 29. Human Takeover Race

Claim und unmittelbar vor externem Call erfolgender Recheck müssen Conversation/Runtime-Revision oder Takeover-Generation binden. Wird zwischen interner Message-Erzeugung und Send `human_review` aktiviert, wird automatisierter Command `blocked`/`human_review`, ohne Providercall. Ein bereits laufender Netzwerkcall kann nicht zurückgenommen werden; deshalb Claim kurz halten, unmittelbar vorher prüfen und unvermeidbare In-flight-Race auditieren. Keine automatische Fortsetzung nach Review; Admintext braucht eigenen autorisierten Versandcontract.

## 30. Delivery Authority

`message_delivery_commands`: UUID, interne Message, Provider/Channel, Destination-Transport-Binding (nicht kopierte Nummer), Status, idempotency key, created/updated timestamps und optional letzte generische Failure Class. Unique `(internal_message_id, active_transport_binding_id, provider)` verhindert Doppelversand. Kein kopierter Content, Token oder Providerresponse.

## 31. Send Attempts

Append-only `message_delivery_attempts`: UUID, Command, fortlaufende Attempt Number, started/completed, Result Class, Retry Classification, optional Provider Message Binding und `ambiguous`-Kennzeichen. Keine Tokens, Zielnummer, Nachrichtentexte oder Rohantwort. Ein Lease/Claim verhindert parallele Attempts; terminale/ambigue Commands können nicht normal erneut geclaimt werden.

## 32. Delivery Status

Generische Allowlist: `pending`, `sending`, `accepted_by_provider`, `delivered`, `read`, `failed`, `blocked`, `unknown`. Providerstrings werden durch versionierten expliziten Adaptermapper übersetzt; unbekannte Werte bleiben `unknown`/unmatched und verändern nicht blind Current State. `failed` benötigt interne Failure Class, nicht Providertext.

## 33. Provider Acceptance vs Delivery

Erfolgreiche Send-HTTP-Antwort bedeutet höchstens `accepted_by_provider`, sofern der offizielle Responsecontract validiert und Provider Message ID gebunden wurde. Erst authentische Delivery-/Read-Webhooks belegen `delivered`/`read`. Weder Acceptance noch Delivery beweist inhaltliches Verstehen oder Antwort.

## 34. Outbound Idempotency

Stable Key ist interne Message + aktives Channel Binding + Provider. Unique Command, claim/lease und Attempts verhindern doppelte Worker-Ausführung. Providerseitige Idempotency/Client Reference darf nur genutzt werden, wenn offiziell bestätigt. Das System verspricht at-least-once Processing mit kontrollierter Ambiguität, nicht unhaltbares Exactly-once gegenüber einem externen Provider.

## 35. Send Timeout

Strategien: Provider-Clientreferenz (nur falls verifiziert) ist bevorzugt; Providerlookup/Reconciliation nur falls offiziell verfügbar; sonst markiert Timeout nach Requestübertragung `ambiguous_send_result`. **Kein blinder Retry.** Reconciliation wartet auf Binding/Statuswebhook bzw. nutzt verifizierten Lookup; ohne Beweis geht Command in kontrollierte Human Review. Timeout vor nachweislicher Übertragung darf nur anhand enger Adapterklassifikation retryable sein. „Provider accepted, response lost“ bleibt ambiguous bis Beweis.

## 36. Delivery Webhooks

Nach Authentifizierung/Receipt/Dedupe lösen Statusereignisse ausschließlich Provider Binding und Delivery Authority auf. `delivered`, `read`, `failed` verändern keine interne Message, Pending Interaction, Runtime, Question Retry, Planner oder Knowledge. Unbekannte Provider Message IDs werden als minimale unmatched technische Receipts für begrenzte Reconciliation behandelt oder nach Ownerentscheidung kontrolliert verworfen; niemals fuzzy gematcht.

## 37. Pending Interaction Exposure

A („immer pending“) verschleiert terminale Nichtzustellung; nur Delivery abzuwarten blockiert dagegen Antworten bei fehlendem Status. Empfehlung **B+C+D**: Pending Interaction bleibt fachlich aktiv, daneben eigener Transport-Exposure-Zustand `not_attempted|accepted_unconfirmed|delivered|failed|ambiguous`; `accepted_by_provider` markiert „attempted/exposed unknown“, nicht delivered. Retry bis sichere Acceptance nur bei eindeutig retryable Resultaten. Terminal/ambiguous Failure führt zu Transport-Human-Review, nicht zur automatischen Pending-Löschung. Inbound Antwort bleibt unabhängig vom Exposure autoritativ und darf die Pending Interaction beantworten.

## 38. Out-of-order Status

Fortschrittsrang für erfolgreiche States: `pending < sending < accepted_by_provider < delivered < read`. Duplikate sind no-op. Spätes `delivered` darf `read` nicht zurücksetzen. `failed` ist kein einfacher höherer Rang: es wird als Ereignis/Failure-Fact gespeichert und darf einen bereits nachgewiesenen `delivered/read`-State nicht rückwärts überschreiben; status-/error-spezifische Providersemantik wird explizit gemappt. CAS/locking schützt Send-Retry-vs-Webhook.

## 39. Unsupported Types

Text ist einziger MVP-Inhalt. Image wird authentifiziert, minimal als `deferred_media` klassifiziert und AP-16-05 überlassen—kein Download/Project Media. Document ist deferred; Audio führt kontrolliert in unsupported/human path; Video, Reaction, Sticker, Location und Contact sind unsupported. Parser crasht nicht, erzeugt aber keine falsche Textmessage. Es wurde kein freigegebenes Unsupported-Content-Template gefunden; daher versendet AP-16-04 keinen erfundenen Hinweis. Owner muss Verhalten/Template separat freigeben.

## 40. Media Boundary

AP-16-04 darf Typ und technische Receipt-Identität erkennen, aber weder Media-ID/URL/Token in Intelligence geben noch downloaden oder Project Evidence erzeugen. AP-16-05 muss offizielle autorisierte Downloadgrenze, Size/MIME, SSRF-Schutz, private Storage-, Lifecycle-, Project-Assignment- und Evidence-Binding-Regeln entwerfen. Niemals arbitrary URL `fetch`.

## 41. PII

Telefon/`wa_id`/externe Kontaktidentität sind PII und ausschließlich in Transport Identity/engem Adapterzugriff erlaubt, nicht in Claims, Observations, Proposals, Planner State, Runtime Reason Codes, Auditpayload, Media Dependency Projection oder normalen Conversation DTOs. Plaintext kann für tatsächlichen Versand nötig sein; Equality Lookup kann zusätzlich einen keyed Hash benötigen. Entscheidung erst mit Threat Model/KMS/Rotation. Keine selbst erfundene Kryptografie; vorhandenes Repository zeigt keine allgemeine Feldverschlüsselungsarchitektur.

## 42. Logging

Keine Telefonnummer, `wa_id`, Message Text, Provider Message ID (vorsorglich als transportbezogene PII/korrelierbarer Identifier), Raw Body, URL, Token, App/Verify Secret oder ungefilterte Providerantwort in Audit/Application Logs. Erlaubt: interne Conversation-/Message-/Receipt-/Command-UUID, geschlossene Status/Failure Class und Zeit. Invalid Signatures nur aggregiert/minimal; keine Body-Dumps. Providererrors werden vor Logging geschlossen gemappt.

## 43. Failure Classes

Inbound: `invalid_signature`, `malformed_event`, `unsupported_event`, `duplicate_event`, `identity_resolution_failed`, `conversation_resolution_failed`, `message_persistence_failed`. Outbound: `transport_configuration_error`, `provider_auth_error`, `provider_rate_limited`, `provider_transient_error`, `provider_permanent_error`, `ambiguous_send_result`, außerdem intern `eligibility_blocked`/`human_takeover`. Providertexte sind niemals fachliche Codes.

## 44. Retry

Transportklassifikation: `retryable`, `requires_reconciliation`, `terminal`, `configuration`, `human_review`. Sie ist strikt getrennt vom fachlichen Question Retry State. Begrenzte Attempts, exponentieller Backoff mit Jitter, Lease, Max-Age und kontrolliertes Dead-letter/Human Review; kein Tight Loop. Duplicate Receipt ist erfolgreicher no-op, kein Retryfehler.

## 45. Rate Limits

Der Adapter respektiert verifizierte providerseitige Retry-/Rate-Limit-Hinweise, begrenzt Parallelität pro Sender und global, nutzt Backoff/Jitter und stoppt bei Auth-/Konfigurationsfehler. Exakte Header/Codes sind noch nicht offiziell verifiziert und dürfen nicht geraten werden.

## 46. Environment Configuration

Nach offizieller Verifikation voraussichtlich server-only: Access Credential, Sender/Phone Number ID, Webhook Verify Token, App Secret und **explizit gepinnte API-Version**. Namen werden erst im Implementation Freeze festgelegt. Secrets stehen weder DB noch `NEXT_PUBLIC_*`, Clientbundle, DTO, Logs oder Audit; `.env.example` enthält nur leere dokumentierte Namen, nie Werte. Sender Identity-Metadaten dürfen als Authority referenziert werden, Credentials nie.

## 47. Sender Identity

MVP darf genau eine konfigurierte sendende Business Identity annehmen, muss dies explizit validieren. Schema/Uniqueness enthalten dennoch `sender_identity_id`, damit eingehende Identitäten, Provider Message IDs und Bindings nicht implizit an einen Env-Singleton gekoppelt werden und Multi-Number später ohne Coreumbau möglich ist.

## 48. Project Assignment

Transport leitet Project niemals aus Nachricht, Telefonnummer, Customer-„latest Project“ oder Providerpayload ab. Project Assignment bleibt AP-16-01 Authority mit Revision/History. Unassigned Conversation ist gültiges Ingestionresultat; erst kontrollierte Staff-Zuordnung und Runtimeinitialisierung erlauben Automation.

## 49. Conversation State

`open+assigned+runtimefähig` kann Cycle auslösen. `paused`/`human_review`: inbound History und Ack bleiben erfolgreich, Auto-Cycle bleibt blockiert. `closed`: keine Message in alte Conversation pressen; unter Identity-/Binding-Lock neue unassigned Conversation/Binding-Generation, kein implicit reopen. Assignment-vs-Inbound wird durch Lock/Revision konsistent serialisiert; Ingestion errät bei Race kein Project.

## 50. Webhook Security

TLS/Hosting vorausgesetzt: Raw-Body Authenticity vor Parsing; fail closed; enge Methoden/Content-Type; Request-/Eventlimits; keine Sessionannahme; Replay über DB-Uniqueness; Secrets nur serverseitig; neutrale Antworten; keine Providerdetails; Security Monitoring ohne PII. GET-Verifikation und POST-Authentizität sind getrennte Contracts.

## 51. Prompt Injection

WhatsApp-Text ist untrusted Data. Der Adapter kann daraus niemals Project/Customer Binding, Actor, Permission, Tool Invocation, Providerkonfiguration, Env-Key oder Codepfad ableiten. Er schreibt exakten Text in die Message Authority; erst die bestehende strikt gebundene AP-16-03-Domain verarbeitet ihn. Kein direkter Planner-/Knowledge-Aufruf aus Webhook.

## 52. Payload Limits

Vor JSON-Parse gilt ein konservatives Raw-Byte-Limit; danach Limits für Envelope-Einträge, Events, Textlänge und Verschachtelung. Werte werden nach offiziell verifizierten realen Maxima plus internen Grenzen festgelegt und getestet. Oversize/malformed failt kontrolliert ohne Payloadpersistenz; ein Batch darf nicht unbounded Transaktionen/Logs erzeugen.

## 53. Provider Schema Validation

Providerspezifische Zod-Schemas bleiben im Adapter. Envelope erlaubt unbekannte additive irrelevante Felder (`passthrough`/gezielte Picks), während für jede unterstützte Eventvariante die minimal benötigten Werte strikt typisiert, bounded und discriminated sind. Canonical Transport Event ist ein separates striktes internes Schema. Fehlende/inkompatible Pflichtfelder failen sicher; keine Defaults erfinden Provideridentität, Status oder Zeit.

## 54. API Versioning

Kein `latest`. Die bei Implementierung offiziell unterstützte Version wird als validierte server-only Konstante/Konfiguration gepinnt, in Adaptertests dokumentiert und über bewusste Upgradepakete geändert. **Geprüfte Version in diesem Audit: keine, wegen gesperrtem offiziellen Dokumentationszugriff.** Webhookparser verlangt nur verifizierte minimale Felder und toleriert additive Felder; breaking Drift wird `malformed/unsupported`, nicht geraten.

## 55. Transport DTO

Conversation-/Message-/Runtime-/Knowledge-DTOs bleiben unverändert und enthalten kein Transport-PII. Separate Admin-only Transport DTOs geben standardmäßig maskierte Identität, interne UUIDs, Channel, Status und Zeiten aus; kein Secret, Text, Raw Payload oder unmaskierte Nummer ohne ausdrücklich freigegebenen Use Case.

## 56. Read Boundary

Transportdebug ist Admin-only. Reviewerzugriff ist zunächst **nicht** freigegeben; er benötigt konkreten Arbeitszweck und minimiertes DTO. Normaler Chat Inspector zeigt keine Telefonnummer/Provider Message ID. Reads sind bounded/keyset-paginiert und auditierbar, ohne Audit selbst mit PII anzureichern.

## 57. Adapter Interface

Keine Mega-Abstraction. Drei enge Ports: `WebhookAuthenticator.verify(rawBytes, headers)`, `WhatsAppWebhookParser.parse(rawBytes) -> CanonicalTransportEvent[]`, `TextTransportSender.send(command) -> Accepted|Rejected|Ambiguous`. Verifikation und Parsing bleiben getrennt. Fake Adapter ist für deterministische Implementationstests sinnvoll; er darf keine Productionkonfiguration fallbacken.

## 58. Inbound Service

Provider Adapter übersetzt authentisches Payload in canonical Events. Providerunabhängiger Ingestion Service akzeptiert nur dieses strikte DTO, persistiert Receipt/Identity/Binding/Message atomar und gibt interne `message_id` plus Cycle-Eligibility zurück. Er besitzt keine NLP-/Planner-/Knowledge-Logik.

## 59. Outbound Service

Delivery Service akzeptiert nur `internal_message_id`, löst Authority/Binding, legt Command an und claimt Attempt. Adapter erhält exakt kontrollierten Zielwert/Text und Senderkonfiguration, sendet und liefert geschlossenes Resultat. Statusreconciler arbeitet nur auf Receipt/Provider Binding/Delivery.

## 60. Network Boundary

Nur WhatsApp-Adapter darf die gepinnte offizielle Providerbasis aufrufen. Conversation-, Runtime-, Planner-, Knowledge- und Ingestion-Domain rufen kein externes Netzwerk. Host-/Pfadbildung ist allowlisted; keine URL aus Customercontent/Event wird angefordert.

## 61. Server-only Boundary

Adapter, Secretloader, Webhook-Ingestion-Repository, Sender und Reconciler tragen `server-only` und werden nicht aus Client-/shared UI-Modulen exportiert. Kein Access Token oder Secret darf serialisiert werden. Webhook besitzt keine User Session.

## 62. Service Privilege

Webhook braucht eine enge Machine-Authority. Empfehlung: spezifische `SECURITY DEFINER`-RPCs mit festem `search_path`, vollständiger Contractvalidierung, minimalen Grants ausschließlich an einen server-only Supabase-Service-Client; keinen generischen Service-Role-Client durch Services reichen. Falls Service Role technisch nötig ist, entsteht der Client nur im schmalen Adapterrepository und kann ausschließlich freigegebene RPCs aufrufen. Domain Scope (Sender, Identity, Conversationstatus, FK, Sequence, Uniqueness) wird in der DB-Authority erneut validiert.

## 63. RLS

Alle Transporttabellen: RLS enabled, `anon`/`authenticated` keine Mutation. Receipt/Attempt/Command direkt grundsätzlich nicht browserlesbar. Admin erhält nur minimierte Read-RPCs; Transport Identity Klartext separat und restriktiver. Reviewer zunächst kein PII-Read. Definer-Funktionen rekonstruieren keine Browserrolle für Webhook, sondern sind explizite interne Entry Points, mit fixed `search_path`, Revokes, Allowlists, Locks/CAS und sanitisiertem Audit.

## 64. Historical Import Boundary

Historical Import hat eigene Provenienz und löst keinen Live-Binding-/Cycle-/Deliveryanspruch aus. Alte Provider IDs können erst nach eigener Validierung optional als Importmetadaten übernommen werden; sie aktivieren weder Live Transport Identity noch Conversation Binding. Kein WhatsApp-Binding wird aus Chattext erfunden.

## 65. Failure Matrix

Legende: „Receipt“ meint authentisches minimales Receipt; Audit ist immer PII-/textfrei.

| Fall | Provider Receipt | interne Authority | Retry/Idempotenz | Kundensicht | Audit | Domain Effect |
|---|---|---|---|---|---|---|
| A valid text, unknown contact | neu/processed | Identity+unassigned Conversation+Message+Binding | Unique Identity/Event | keine Autoantwort | IDs/result | History, kein Cycle |
| B known active Conversation | neu/processed | genau eine Inbound Message | Provider-ID dedupe | Cycle später möglich | IDs/result | AP-16-03 per Message |
| C duplicate webhook | vorhandenes Replay | unverändert | no-op | keine Duplikate | kein Duplikataudit | keiner |
| D same Provider Message twice | Replay/Conflict fail closed | eine Message/Binding | Unique Provider ID | einmal | einmal | höchstens ein Cycle |
| E invalid signature | kein echtes Receipt | keine Message | nicht retrybar lokal | neutraler Fehler | optional aggregiert | keiner |
| F malformed event | failure Receipt nur nach Auth | keine Message | terminal/Provider replay möglich | keine | class only | keiner |
| G image | `deferred_media` | keine Text-/Media Message | AP-16-05 | kein erfundener Text | class/ID | keiner |
| H audio | unsupported | keine Textmessage | human path | noch zu entscheiden | class/ID | keiner |
| I unassigned | processed | Message in unassigned Conversation | Cycle nicht claimen | keine Autoantwort | result | Assignment nötig |
| J human_review | processed | Message History | kein Auto-Cycle | Staff bearbeitet | IDs/result | Runtime unverändert |
| K paused | processed | Message History | kein Auto-Cycle | keine Autoantwort | IDs/result | Runtime unverändert |
| L closed | processed | neue unassigned Conversation/Binding | creation dedupe | keine implizite Fortsetzung | IDs/result | alter Thread unverändert |
| M Message persisted, Cycle fails | processed-to-message | Message+Cycle Failure | Cycle separat gleicher Command | ggf. keine Antwort | cycle class | Message bleibt |
| N Cycle succeeds, unsent | processed | interne Outbound+Pending+Delivery pending | Sender claimbar | noch nichts transportbestätigt | IDs/status | fachlicher Cycle committed |
| O API success | n/a | Attempt+Binding `accepted` | kein normaler Resend | Annahme, nicht Delivery | IDs/status | kein Knowledgeeffekt |
| P API 429 | n/a | Attempt rate_limited | bounded Backoff gemäß Contract | verzögert | class/timing | keiner |
| Q timeout before response | n/a | ambiguous sofern Übertragung möglich | reconciliation, kein blind retry | unbekannt | class | keiner |
| R accepted, response lost | Statusreceipt später/unmatched möglich | ambiguous bis Binding/Reconcile | kontrolliert | evtl. einmal zugestellt | class | keiner |
| S duplicate worker | n/a | derselbe Command/Lease | no-op | keine zweite Frage | optional no-op metric | keiner |
| T delivered webhook | processed | Delivery→delivered | idempotent | zugestellt belegt | status | keiner |
| U read webhook | processed | Delivery→read | idempotent/monoton | gelesen belegt | status | keiner |
| V failure webhook | processed | Failure Fact/ggf. failed | klassifiziert | nicht als zugestellt behaupten | class | Human path ggf. |
| W out-of-order status | processed | monotones Maximum/Eventfacts | CAS/no regression | keine Rückstufung | nur reale Änderung | keiner |
| X unknown Provider ID | unmatched Receipt | keine Messagezuordnung | reconcile/terminal | unbekannt | receipt/class | kein Guessing |
| Y takeover before send | n/a | Command blocked | kein Auto-Retry | kein AI-Send | IDs/status | Review bleibt |
| Z auth misconfiguration | n/a | configuration Failure | stop/alert, kein Loop | keine Zustellung | class only | keiner |

## 66. Race Conditions

| Race | Verbindliche Kontrolle |
|---|---|
| Duplicate Webhook concurrently | Receipt-/Provider-ID Unique Constraint; ein Gewinner, Replay liest Resultat. |
| Zwei Inbound Texte concurrently | Identity/Binding lock; je Message neue DB-Sequence; Providerzeit sortiert nicht. AP-16-03 lässt höchstens eine aktuelle Antwort wirken. |
| Inbound während Outbound Send | Authorities unabhängig; Inbound bleibt gültig, auch ohne Delivery Event; Sequence/Prompt Gate entscheidet fachlich. |
| Human Takeover vs Send | Claim bindet Revision, unmittelbarer Pre-call Recheck; vor Call blockieren, in-flight als unvermeidbare Race beobachten. |
| Assignment vs Inbound | Conversation/Binding/Assignment-Revision in stabiler Lockordnung; kein Text-/Latest-Project Guessing. |
| Close vs Inbound | Binding+Conversation lock; entweder vorher in offen persistiert oder danach neuer Thread, nie in closed erzwingen. |
| Identity Creation | Unique `(provider,sender,external identity lookup)` plus upsert/lock. |
| Send Retry vs Delivery Webhook | Command/Attempt lock und monotone State Machine; delivered/read stoppt Retry. |
| Timeout vs Reconciliation | ambiguous state atomar vor Freigabe; nur Reconciler/Human darf entscheiden. |
| Customer mit mehreren Projects | Identity bindet kein Project; aktives Conversation Binding plus kontrollierte Assignment Authority. |

## 67. Owner Decisions

| # | Entscheidung | Audit-Empfehlung |
|---:|---|---|
| 1 | Provider-independent Identity? | Ja, generische Authority; Provideradapter am Rand. |
| 2 | bestehendes Customer Phone Matching? | Nicht automatisch; höchstens exakter Reviewkandidat nach separatem Contract. |
| 3 | Unknown Contact erzeugt Conversation? | Ja, idempotent unassigned. |
| 4 | Unknown Contact erzeugt Customer? | Nein. |
| 5 | Eine aktive WhatsApp Conversation je Identity? | Ja, pro Provider+Sender+Identity. |
| 6 | Closed erzeugt neue Conversation? | Ja; kein implicit reopen. |
| 7 | phone/wa_id storage form? | Providerwert kontrolliert in PII-Authority; genaue Form nach Contract. |
| 8 | Hash lookup? | Prüfen mit Threat Model/KMS; keyed, nicht selbst erfunden. |
| 9 | Raw Payload? | Nein; nur minimale extrahierte Felder. |
| 10 | Raw Retention? | Keine im MVP. |
| 11 | Signature? | Pflicht, raw body, fail closed; Details offiziell verifizieren. |
| 12 | API version? | Explizit pinnen; Version noch nicht verifiziert. |
| 13 | sync vs ack? | Persist+ack, Cycle/Send separat. |
| 14 | Worker/outbox jetzt? | Kleine DB-Outbox/claimable follow-up, kein neues Queuesystem. |
| 15 | Provider Message uniqueness? | Provider+Sender-Scope; offiziellen Scope bestätigen. |
| 16 | Delivery Command? | Eigene persistente Authority. |
| 17 | Send Attempt? | Separate append-only Authority. |
| 18 | Outbound idempotency? | Internal Message+aktives Binding+Provider unique. |
| 19 | Ambiguous Timeout? | Reconcile/Human, niemals blind retry. |
| 20 | Pending Exposure? | Separater Transport-Exposure-State; Pending bleibt fachlich aktiv. |
| 21 | Delivery/read model? | explizit gemappt und monoton. |
| 22 | Failed Delivery? | Transport retry/reconcile, terminal → Human Review; kein Knowledgeeffekt. |
| 23 | Takeover check? | Claim plus unmittelbarer Pre-send-Recheck. |
| 24 | Unsupported response? | Kein Text bis kontrolliertes Template freigegeben. |
| 25 | Unassigned Auto-Cycle? | Nein. |
| 26 | Staff PII rights? | Admin-only minimal; Reviewer zunächst nein. |
| 27 | Service privilege? | Enge server-only RPC/Repository-Grenze, kein frei gereichter Service Client. |
| 28 | Single Sender MVP? | Ja, explizit; Schema senderfähig. |
| 29 | Retry/backoff? | begrenzt, jitter, Providerhinweise nach Verifikation, Dead-letter/Human. |
| 30 | Logs/privacy? | Nur interne IDs/Allowlistcodes; kein Content/Transport-PII/Raw Body. |
| 31 | Implementation split? | AP-16-04-01 inbound persistence, danach -02 outbound/reconcile. |
| 32 | Media AP-16-05? | Ja, vollständig getrennt. |

Alle Empfehlungen bleiben **Ownerentscheidungen**, keine Implementierungsfreigabe.

## 68. Implementation Split

### AP-16-04-01 — WhatsApp Transport Persistence & Inbound Text Ingestion

Transport/Sender Identities und Conversation Binding; Provider Message Binding; minimale Receipts; offiziell verifizierte GET-/POST-Authentifizierung; bounded Parser; atomare Textingestion; DB-Follow-up/Message-ID-Grenze zu AP-16-03; RLS/Privilege/PII-DTOs. Keine Send API und keine Medien.

### AP-16-04-02 — WhatsApp Outbound Delivery & Status Reconciliation

Delivery Commands, Attempts, Eligibility/Takeover Race, gepinnter Sendadapter, Provider Binding nach Acceptance, Retry/Ambiguous Reconciliation sowie authentische Delivery/Read/Failure-Events und monotone States.

### AP-16-05 — WhatsApp Media Ingestion

Erst danach: autorisierter Download, SSRF-/Size-/MIME-Gates, Project Media/Lifecycle/Evidence. **Kleinstes nächstes Paket ist AP-16-04-01**; Transport Persistence nicht nochmals davor abspalten, weil Identity/Receipt/Message-Atomicity gemeinsam definiert und getestet werden müssen.

## 69. Future Tests

- offizielle GET-Verifikation und POST-Signatur über unveränderte Raw Bytes; missing/malformed/invalid fail closed;
- Payloadschema, additive Felder, malformed/oversize/event-count Limits und unsupported Typen;
- concurrent duplicate Receipt, Identity Creation und Provider Message Dedupe;
- Unknown Contact/unassigned und bekannte aktive Conversation; closed/paused/human-review;
- exakter unveränderter Text, DB-Sequence statt Providerzeit und Provider-ID-Isolation;
- genau ein AP-16-03-Trigger per Message und persistierte Message trotz Cycle Failure;
- Delivery Command/Attempt/Lease, Takeover Pre-send, duplicate Worker und keine Contentkopie;
- accepted vs delivered/read, monotone out-of-order/duplicate Status und unknown Provider ID;
- rate limit/backoff, timeout/ambiguous reconciliation und kein blinder Retry;
- PII-/Audit-/Log-/DTO-Isolation, Secret-Scan, RLS/Grants/Definer-`search_path`;
- Fake Adapter und Nachweis: kein Providerwert in Runtime, Planner, Knowledge oder Media Dependency Projection.

## 70. Production Gates

- Ungültige/fehlende Signatur erzeugt niemals Receipt als echte Message oder interne Message.
- Duplicate Webhook/Provider Replay erzeugt niemals zweite Message, Cycle oder Outbound Response.
- Provider IDs werden niemals interne Message IDs; Telefon/`wa_id` gelangt nie in Knowledge.
- Message Text gelangt nie in Audit/Logs; Secrets nie in DB/Logs/Client.
- Unknown/mehrdeutige Project-Zuordnung failt sicher; keine Latest-Project-Heuristik.
- Human Takeover blockiert automatisierten Send unmittelbar vor Netzwerkcall.
- Outbound Retry kann bei Timeoutambiguität nicht blind eine Kundenfrage duplizieren.
- Provider Acceptance, Delivery und Read bleiben getrennt; Status ist monoton/idempotent.
- Delivery Events mutieren niemals Knowledge/Runtime/Planner/Question Retry.
- Provider API-Version und alle Webhook-/Sendcontracts sind offiziell verifiziert und gepinnt.
- Nur server-only Adapter greift auf Netzwerk zu; kein arbitrary URL fetch/Media Download.
- Request-/Event-/Textlimits, Backoff, Reconciliation, Alerting und Kill Switch sind freigegeben.
- RLS, minimale Definer-Grants, Machine Privilege und Admin-only PII Read sind nachgewiesen.
- AP-16-04-01/-02 Tests, Typecheck/Lint/Migrationtests und Production Validation passieren vor Live-Freigabe.

## 71. Scope Confirmation

Ausdrücklich bestätigt: **ausschließlich Audit**; kein Webhook implementiert; keine Meta API; kein Netzwerkcode; keine Providerpersistenz; keine Phone Identity Persistence; kein WhatsApp Text Ingestion; kein WhatsApp Outbound; keine Delivery Processing; kein Media Download; keine WhatsApp Image Processing; kein Historical Import; keine UI; keine Vision; kein LLM; keine Tests; keine Migration; keine `package.json`-Änderung. Exakt diese eine neue Auditdatei ist Gegenstand des Pakets.

## 72. Status

**Auditstatus: READY FOR OWNER DECISION**

- **PERSISTENT CONVERSATION AUTHORITY — IMPLEMENTED**
- **PERSISTENT MESSAGE AUTHORITY — IMPLEMENTED**
- **PERSISTENT LIVE RUNTIME — IMPLEMENTED**
- **PERSISTENT MESSAGE-TO-CYCLE ORCHESTRATION — IMPLEMENTED**
- **WHATSAPP TRANSPORT ARCHITECTURE — AUDITED**
- **WHATSAPP TRANSPORT IDENTITY — NOT IMPLEMENTED**
- **WHATSAPP WEBHOOK AUTHENTICATION — NOT IMPLEMENTED**
- **WHATSAPP WEBHOOK INGESTION — NOT IMPLEMENTED**
- **WHATSAPP TEXT INGESTION — NOT IMPLEMENTED**
- **WHATSAPP OUTBOUND DELIVERY — NOT IMPLEMENTED**
- **WHATSAPP DELIVERY RECONCILIATION — NOT IMPLEMENTED**
- **WHATSAPP MEDIA INGESTION — NOT IMPLEMENTED**
- **HISTORICAL CHAT IMPORT — NOT IMPLEMENTED**
- **VISION — NOT IMPLEMENTED**
- **LLM CUSTOMER CONVERSATION — NOT IMPLEMENTED**
- **OVERALL PRODUCT — NOT PRODUCTION READY**

# AP-16-04-01 — WhatsApp Transport Persistence & Inbound Text Ingestion Result

## Result and Official Contract Verification

**Result: PARTIALLY IMPLEMENTED / META-SPECIFIC WORK BLOCKED BY THE MANDATORY CONTRACT GATE.** On 2026-08-23, before writing Meta-specific code, access was attempted exclusively through official Meta developer documentation for:

- `https://developers.facebook.com/docs/graph-api/webhooks/getting-started`
- `https://developers.facebook.com/docs/graph-api/webhooks/getting-started/webhooks-for-whatsapp`
- `https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks`
- `https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks/payload-examples`

The official documentation endpoint returned `401 Unauthorized`. Consequently no current Graph API version, verification parameters, challenge response, signature header/algorithm, exact raw-body contract, inbound envelope/message/contact/timestamp/text fields, Provider Message ID scope, or HTTP acknowledgement/retry expectation could be verified. No value was inferred from memory or secondary sources. No Meta API version is claimed or configured.

## Migration and transport authorities

Migration `202608230007_conversation_transport_persistence.sql` adds only the separable provider-independent persistence layer. Its closed provider enum contains `whatsapp`, but no Meta wire field is mapped to it.

- `conversation_transport_identities` isolates opaque external identity and sender scope as PII, permits only a nullable later-controlled Customer binding, has no Project FK, uses the repository `updated_at` trigger, and uniquely protects `(provider, sender_scope, external_identity)` against identity races.
- `conversation_transport_bindings` relates an internal Conversation to a Transport Identity. A partial unique index permits one active binding per identity; explicit superseded history and positive revision replace any “latest conversation” heuristic. No closed-Conversation reopen or resolution operation is exposed.
- `transport_webhook_receipts` contains only event identity, kind, received time, processing status, optional internal Message result, and failure code. It has no raw body or text column. Its provider/sender-scope/event key can deduplicate once a verified adapter supplies opaque values.
- `transport_message_bindings` keeps Provider Message identity separate from internal Message UUID, binds inbound direction, Transport Identity and Provider occurrence time, and scopes uniqueness by provider plus opaque sender scope. This conservative scope makes no claim about Meta global uniqueness.

All four tables have RLS enabled and all privileges are revoked from `public`, `anon`, and `authenticated`. No browser RPC or generic service-role client was added. Normal Conversation DTOs remain provider-free, Reviewer/Customer reads gain no PII, and the future webhook must use a narrow server-only transaction/RPC.

## Contracts, PII, audit and failure codes

Strict provider-independent TypeScript contracts close provider, authority states, inbound direction, all requested failure codes, and the technical retry classifications. The receipt DTO excludes provider event identity, sender identity, text, payload, and secrets. The narrow future admin projection accepts only a redacted identity and rejects external identity.

No audit event is emitted because there is no authenticated webhook event yet. Future sanitized events must contain only internal receipt/identity/conversation/message UUIDs, result/status, and timestamps—never phone/`wa_id`, sender scope, Provider Message ID, customer text, raw payload, or secrets.

## Verification route, signature, raw body, parser and inbound text

In accordance with the STOP rule there is no GET verification route, POST webhook route, request-size constant, raw-body reader, signature utility, Meta parser, Meta canonical-event mapper, unsupported-media classifier, secret/environment variable, ingestion transaction, unknown-contact Conversation creation, trusted Message recording call, or AP-16-03 invocation. Invalid signatures cannot create Messages because no webhook entry point exists; valid WhatsApp requests also cannot yet be ingested.

Unknown contacts are not matched to `customers.phone`; no fake Customer or Project is created or guessed. Closed, unassigned, paused, and human-review behavior is not executed by transport code. Sequence remains solely the existing Message Authority's responsibility. The future AP-16-03 boundary remains internal `message_id` only; Provider payload must never enter it.

The webhook acknowledgement boundary remains undecided until the official expectation can be read. No queue/worker, provider fetch, outbound send, delivery/read state, media download, Project Media, Storage integration, Vision, LLM, historical import, or UI was added. `package.json` and the lockfile are unchanged.

## Tests, race conditions and remaining limits

Focused tests cover closed schemas, strict DTO PII rejection, the four Authorities, identity/message/receipt uniqueness, one-active-binding race protection, RLS, revoked browser grants, no raw-payload persistence, and no Provider columns on Conversation/Message Core. Verification, signature, parser, HTTP, Message ingestion, replay-to-Message and AP-16-03 trigger tests are intentionally absent rather than encoding an unverified contract.

The next smallest package is the remainder of AP-16-04-01 after official Meta documentation becomes accessible: document the verified version/contract first, then raw-body verification and parsing, followed by one narrow atomic persistence boundary and the existing AP-16-03 `message_id` trigger.

## AP-16-04-01 Status

PERSISTENT CONVERSATION AUTHORITY — IMPLEMENTED

PERSISTENT MESSAGE AUTHORITY — IMPLEMENTED

PERSISTENT LIVE RUNTIME — IMPLEMENTED

PERSISTENT MESSAGE-TO-CYCLE ORCHESTRATION — IMPLEMENTED

WHATSAPP TRANSPORT IDENTITY — IMPLEMENTED (PROVIDER-INDEPENDENT PERSISTENCE ONLY)

WHATSAPP CONVERSATION TRANSPORT BINDING — IMPLEMENTED (PROVIDER-INDEPENDENT PERSISTENCE ONLY)

WHATSAPP WEBHOOK RECEIPT AUTHORITY — IMPLEMENTED (PROVIDER-INDEPENDENT PERSISTENCE ONLY)

WHATSAPP PROVIDER MESSAGE BINDING — IMPLEMENTED (PROVIDER-INDEPENDENT PERSISTENCE ONLY)

WHATSAPP WEBHOOK VERIFICATION — NOT IMPLEMENTED; OFFICIAL CONTRACT NOT ACCESSIBLE

WHATSAPP WEBHOOK SIGNATURE VALIDATION — NOT IMPLEMENTED; OFFICIAL CONTRACT NOT ACCESSIBLE

WHATSAPP TEXT INGESTION — NOT IMPLEMENTED; OFFICIAL CONTRACT NOT ACCESSIBLE

WHATSAPP → INTERNAL MESSAGE BOUNDARY — NOT IMPLEMENTED

WHATSAPP → AP-16-03 TRIGGER — NOT IMPLEMENTED

WHATSAPP OUTBOUND DELIVERY — NOT IMPLEMENTED

WHATSAPP DELIVERY RECONCILIATION — NOT IMPLEMENTED

WHATSAPP MEDIA INGESTION — NOT IMPLEMENTED

HISTORICAL CHAT IMPORT — NOT IMPLEMENTED

VISION — NOT IMPLEMENTED

LLM CUSTOMER CONVERSATION — NOT IMPLEMENTED

OVERALL PRODUCT — NOT PRODUCTION READY

# AP-16-04-02 — WhatsApp Outbound Delivery & Status Reconciliation Result

## Official Meta Contract Verification

Prüfdatum: **2026-08-24**. Als ausschließliche Providerquellen wurden die offiziellen Meta-Seiten zur [Cloud API Messages Reference](https://developers.facebook.com/docs/whatsapp/cloud-api/reference/messages), zu [Cloud API Webhooks](https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks), zu [Webhook Payload Examples](https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks/payload-examples) und zum [Graph API Changelog](https://developers.facebook.com/docs/graph-api/changelog/) adressiert. Der bereitgestellte Web-Connector antwortete erneut mit `401 Unauthorized`. Deshalb übernimmt die Implementierung nur den im Auftrag verifizierten Grundvertrag und pinnt konservativ **`v25.0`**; die Konfiguration akzeptiert weder `latest`, einen versionslosen Pfad noch eine andere Version. Vor Produktion muss der Owner `v25.0` noch einmal im offiziellen Meta-Dashboard des konkreten Accounts bestätigen. Nicht verifizierte optionale Statuswerte, Provider-Retry-Header oder eine sichere Provider-Idempotency-Key-Semantik werden nicht angenommen.

Der enge Adapter sendet `POST https://graph.facebook.com/v25.0/{Phone-Number-ID}/messages` mit serverseitigem `Authorization: Bearer …` und exakt `{messaging_product:"whatsapp",recipient_type:"individual",to,type:"text",text:{body}}`. `to` stammt ausschließlich aus der aktiven Transport Identity; `body` ist exakt die persistierte interne Textmessage. Die kontrollierte Success-Projektion übernimmt ausschließlich `messages[0].id`. Raw Response, Fehlertext, Token, Destination und Text verlassen diese Grenze nicht.

## Outbound Authority, Eligibility und Pre-send Revalidation

Migration `202608240002_whatsapp_outbound_delivery.sql` ergänzt `transport_delivery_commands`, `transport_send_attempts` und append-only/deduplizierte `transport_delivery_events`. Der Command kopiert weder Text noch Telefonnummer, sondern bindet interne Message, Conversation, aktives Binding und Transport Identity. `(provider, transport_binding_id, internal_message_id)` ist eindeutig. Die Provider-ID bleibt in der wiederverwendeten `transport_message_bindings`-Authority mit `direction=outbound`; die interne Message-UUID bleibt kanonisch.

Der service-only Claim nimmt ausschließlich `internal_message_id`. Er sperrt Message, Conversation, Binding, Identity und Command, akzeptiert nur bestehende `outbound`/`text` Messages mit kundenseitig zulässigem Actor, fordert aktive WhatsApp-Bindung/Identity und prüft `open`. Interne Notes, inbound Messages, paused, human_review und closed failen vor Netzwerkzugriff. Wenn `prompt_message_id` eine Pending Interaction bindet, müssen deren `pending`-Status sowie der aktive Runtime-Link noch bestehen. Direkt vor `fetch()` wird dieselbe Conversation-/Binding-/Pending-Grenze unter dem persistenten Claim-Token erneut geprüft. Damit blockiert ein Human Takeover oder Supersede zwischen Cycle und Send die alte automatische Frage.

Claim-Token und Row Locks verhindern zwei parallele bekannte Sends. Maximal drei Attempts sind schematisch möglich; dieses Paket enthält jedoch weder Scheduler noch automatische Retryloop. Replay in `sending`, `accepted_by_provider`, `delivered`, `read`, `delivery_ambiguous` oder `blocked` führt keinen zweiten Netzwerkcall aus. Die Destination wird nie aus Customer/Project/Message-Inhalt geraten. Senderkonfiguration besteht ausschließlich serverseitig aus `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID` und `WHATSAPP_GRAPH_API_VERSION=v25.0`; Webhook Verify Token und App Secret bleiben getrennt.

## Provider Acceptance, Attempts, Ambiguity und Recovery

Ein valider HTTP-Success mit WhatsApp Message ID bedeutet nur `accepted_by_provider`. Er bedeutet weder `delivered` noch `read`. Completion bindet die Provider-ID idempotent an die interne outbound Message, finalisiert den Attempt und setzt `accepted_at`. Ein DB-Completionfehler nach bekanntem Provider-Success wird als `delivery_completion_requires_reconciliation` nach außen begrenzt; die Orchestrierung sendet nicht automatisch erneut.

401/403 werden `provider_auth_error/configuration`, 429 `rate_limited/retryable`, eindeutige HTTP-5xx `transient_provider_error/retryable` und andere Ablehnungen `provider_rejected/terminal`. Ein Throw/Timeout/Connection Reset nach Beginn des Requests ist dagegen `ambiguous_send_result/requires_reconciliation` und setzt `delivery_ambiguous`; darauf folgt kein blinder Resend. Externe Netzwerksideeffects sind nicht mit der DB atomar und dieses Paket behauptet ausdrücklich kein Exactly-once. Das Ziel ist höchstens ein kontrollierter Send bei bekanntem Zustand plus manuelle/folgende Reconciliation bei Ambiguität.

Attempts speichern nur interne Command-ID, monotone Nummer, Zeiten, kontrollierte Result-/Failure-Klasse und gegebenenfalls Provider Message ID. Auditaktionen `whatsapp_delivery_attempt_started|completed|failed` enthalten ausschließlich interne UUIDs, Nummer und Resultklasse – keine Destination, keinen `wa_id`, keinen Text, Token, Phone Number ID oder Raw Response.

## Status Webhooks und monotone Reconciliation

Die bestehende, HMAC-authentifizierte POST-Route und derselbe additive Parser verarbeiten nun `value.statuses[]`. Die strikte Projektion erlaubt nur `sent`, `delivered`, `read`, `failed`, Provider Message ID, Sender Scope, Providerzeit und optional den numerischen Fehlercode. Providerfehlertexte und Raw Payload werden nicht persistiert. Unbekannte Statuswerte failen geschlossen als malformed; die Domain-Allowlist wird nicht dynamisch erweitert.

`sent` mappt auf `accepted_by_provider`, `delivered` auf `delivered`, `read` auf `read`, `failed` auf `failed`. Die Aggregation ist semantisch monoton: `read` wird durch delivered/sent nicht zurückgestuft, delivered nicht durch sent; failed nach delivered/read überschreibt einen bestätigten höheren Zustand nicht. Jeder deduplizierte Fakt bleibt in `transport_delivery_events`; ein identisches Statusereignis mutiert effektiv nur einmal. Matching ist ausschließlich `(whatsapp, sender_scope, provider_message_id, direction=outbound)`. Eine unbekannte Provider-ID wird als `matched=false` aufbewahrt, niemals fuzzy zugeordnet; eine inbound Provider Binding Collision verändert keinen Delivery Command. Statusupdates reopen keine geschlossene Conversation, lösen keinen Planner/Cycle aus und mutieren weder Runtime noch Pending Interaction noch Knowledge.

## Exposure, RLS, Privilege, PII und Limits

Transport Exposure bleibt ausschließlich Delivery Authority: Pending Interaction kann fachlich weiter bestehen, obwohl Send fehlgeschlagen oder ambig ist. Provider Acceptance, Delivery und Read sind getrennte Zustände; eine inbound Kundenantwort bleibt unabhängig von fehlenden Delivery Events für AP-16-03 autoritativ. Alle drei Tabellen haben RLS; `public`, `anon` und `authenticated` besitzen keine direkten Rechte. Nur die vier engen `SECURITY DEFINER`-RPCs sind für `service_role` ausführbar, und der privilegierte Client verlässt das jeweilige server-only Modul nicht.

Tests decken exakten Endpoint/Header/Body/Text/Destination, Success, Replay, Revalidation/Takeover, fehlende Konfiguration, Auth, Rate Limit, 5xx, Timeout-Ambiguität, Statusprojektion, RLS, Eindeutigkeit, outbound-only Matching und monotone SQL-Matrix ab. Inbound Webhook-, Transport- und vollständige Regression-Suite bleiben unverändert. Nicht enthalten sind Media Download, Project Media Ingestion, Vision, LLM, Historical Import, UI, Scheduler oder neue Dependency.

## AP-16-04-02 Status

WHATSAPP TRANSPORT IDENTITY — IMPLEMENTED

WHATSAPP INBOUND TEXT INGESTION — IMPLEMENTED

WHATSAPP OUTBOUND DELIVERY AUTHORITY — IMPLEMENTED

WHATSAPP TEXT SEND ADAPTER — IMPLEMENTED

WHATSAPP PROVIDER MESSAGE OUTBOUND BINDING — IMPLEMENTED

WHATSAPP SEND ATTEMPT AUTHORITY — IMPLEMENTED

WHATSAPP DELIVERY STATUS AUTHORITY — IMPLEMENTED

WHATSAPP SENT RECONCILIATION — IMPLEMENTED

WHATSAPP DELIVERED RECONCILIATION — IMPLEMENTED

WHATSAPP READ RECONCILIATION — IMPLEMENTED

WHATSAPP FAILED RECONCILIATION — IMPLEMENTED

OUT-OF-ORDER DELIVERY STATUS REGRESSION — PROTECTED

OUTBOUND MESSAGE REPLAY — IDEMPOTENT

AMBIGUOUS NETWORK SEND — REQUIRES RECONCILIATION

HUMAN TAKEOVER PRE-SEND CHECK — IMPLEMENTED

PROVIDER ACCEPTANCE ≠ CUSTOMER DELIVERY — ENFORCED

DELIVERY STATUS → KNOWLEDGE MUTATION — PROHIBITED

WHATSAPP MEDIA INGESTION — NOT IMPLEMENTED

HISTORICAL CHAT IMPORT — NOT IMPLEMENTED

VISION — NOT IMPLEMENTED

LLM CUSTOMER CONVERSATION — NOT IMPLEMENTED

OVERALL PRODUCT — NOT PRODUCTION READY

Das nächste kleinste Paket ist eine kontrollierte **Outbound-Reconciliation-/Operations-Grenze** für ambige Completion und explizit freigegebene Retries; weiterhin ohne automatische Fachfrage, Scheduler oder Media.

# AP-16-04-01-01 — WhatsApp Webhook & Inbound Text Completion Result

## Result and provider contract sources

**Result: IMPLEMENTED for authenticated inbound WhatsApp text only.** The contract supplied for this package was previously verified against Meta's official Webhooks and WhatsApp Cloud API documentation (`developers.facebook.com/docs/graph-api/webhooks/getting-started`, `.../webhooks-for-whatsapp`, `developers.facebook.com/docs/whatsapp/cloud-api/webhooks` and `.../payload-examples`). This package does not call Graph API, does not claim an outbound API version, and adds no Graph-version configuration.

GET `/api/webhooks/whatsapp` accepts only `hub.mode=subscribe`, the configured `hub.verify_token`, and a non-empty `hub.challenge`. A successful request returns the challenge as plain text with HTTP 200; wrong/missing values fail closed with 403. The verify token is read only from the server environment.

POST requires `X-Hub-Signature-256` in the exact `sha256=<64 lowercase hex>` form. Node Crypto computes HMAC-SHA256 with the server-only Meta App Secret and compares equal-length digests with `timingSafeEqual`. Missing, malformed, modified-body, wrong-secret, and invalid signatures return 401 before JSON parsing, receipt claim, identity resolution, or Message creation.

## Raw body, size and acknowledgement boundary

The Node.js Route Handler consumes `Request.body` as bounded `Uint8Array` chunks. HMAC validation is performed over those original bytes; only after successful authentication are those same bytes decoded as strict UTF-8 and parsed once as JSON. It never verifies a reserialized object. `1 MiB` is an explicit conservative internal application security ceiling, **not a Meta contract limit**. `Content-Length` is rejected early where present and streamed bytes are independently counted, so chunked input cannot bypass the bound.

Neither raw body, signature, secret, Provider Message ID, sender scope, external identity nor customer text is logged or persisted outside its dedicated minimal transport/message authority. The route returns no payload, stack, or internal failure detail. It acknowledges after synchronous durable transport ingestion. A subsequent AP-16-03 command-claim failure does not roll back or duplicate the Message; no new queue/worker and no exactly-once claim were introduced.

## Parser and canonical event

The server-only adapter tolerates additive provider fields and walks every `entry[]`, every `changes[]`, and every `messages[]`. It recognizes only `object=whatsapp_business_account`, `change.field=messages`, `value.metadata.phone_number_id` as sender/business scope, and the documented message fields `from`, `id`, `timestamp`, `type`, plus **exactly** `text.body` for text. Epoch seconds are checked and converted to UTC ISO time. The strict canonical output contains only provider, Provider Message ID, external sender identity, sender scope, provider occurrence time, `message_type=text`, and unchanged text.

Classification is closed: `inbound_text`, `media_deferred`, `unsupported_message_type`, `non_message_event`, and `malformed`. Status events are recognized as non-message/deferred to AP-16-04-02. Image, document, audio, video, and sticker are deferred without fetch, Storage, Project Media, invented response, or Message creation. A malformed relevant message rejects the request; legitimate unsupported/additive events are safely acknowledged.

## Atomic ingestion, identity and conversation resolution

Migration `202608240001_whatsapp_inbound_text_ingestion.sql` adds one service-role-only `SECURITY DEFINER` workflow. One database transaction claims the Receipt by `(whatsapp, sender_scope, provider_message_id)`, race-safely resolves/creates the Transport Identity by the existing unique key, locks/resolves the active Binding, optionally creates an open Conversation, appends the internal Customer text Message with the next database sequence, creates the Provider Message Binding, completes the Receipt, and emits sanitized audit rows.

Unknown senders create only `customer_id=null` Transport Identity, unassigned `project_id=null` Conversation, active Binding, and Message. No Customer is created and no phone, latest Project, latest Conversation, content, or other heuristic selects a Project. A known identity may carry only its already-authoritative Customer binding. If an active Binding points at a closed Conversation, it is superseded and a new open, project-unassigned Conversation is created; old history is unchanged and the old Conversation is never reopened.

Inbound text becomes exactly one provider-independent `conversation_messages` UUID with `direction=inbound`, `actor_class=customer`, `message_kind=text`, unchanged `conversation_message_text.body`, and provider UTC time as `occurred_at`. `created_at` remains database time. Sequence comes exclusively from the locked Conversation Message authority and is independent of Provider ID and timestamp. Provider ID remains only in `transport_message_bindings`; no Provider column was added to Conversation Core.

## Dedupe, replay and AP-16-03

Receipt and Provider Message uniqueness both use the existing conservative provider plus sender-scope semantics. Exact and concurrent replay serialize at the database unique constraint and return the already-created internal Message UUID; they create no second Identity, active Binding, Message, Provider Binding, or cycle trigger. Two distinct IDs create two Messages even at the same provider timestamp, with unique monotonic internal sequence values.

After commit, the application may invoke AP-16-03 only when the atomic result says the Conversation is open, project-bound, has a matching Runtime, and is awaiting a customer answer. The trigger receives the strict object `{ message_id: <internal UUID> }` and nothing from the provider event. Unassigned, paused, human-review, closed, or non-processable Conversations still retain the Message but run no cycle. AP-16-03's existing command uniqueness remains the final replay/recovery authority. A cycle failure does not delete the Message or reopen transport ingestion.

## Privilege, RLS, PII, secrets and audit

The existing transport RLS and revoked browser grants remain unchanged. The new RPC is executable only by `service_role`; its client is constructed and retained inside one server-only adapter, never exported as a generic privileged client. Browser actions, UI, Reviewer PII reads, and normal Conversation DTOs were not expanded. Transport-created Conversations allow a null human creator; the immutable-identity trigger was correspondingly hardened to `IS DISTINCT FROM` semantics.

Only `WHATSAPP_WEBHOOK_VERIFY_TOKEN` and `WHATSAPP_META_APP_SECRET` were added to the environment example. They never enter a DTO, database, audit row, response, or log. Sanitized audit actions are `whatsapp_webhook_received`, `whatsapp_webhook_replayed`, `whatsapp_inbound_text_recorded`, `whatsapp_transport_identity_created`, and `whatsapp_conversation_bound`, containing only internal UUIDs, result codes, and timestamps. Transactional database failures roll back all partial ingestion and do not attempt an unsafe second raw-payload audit write.

The closed transport failure vocabulary contains verification, missing/invalid signature, size, malformed/unsupported, duplicate, identity/conversation/message/provider-binding, cycle, and configuration failures, separate from question retry semantics and classified as `retryable`, `requires_recheck`, `terminal`, or `configuration`.

## Tests and remaining limits

Focused tests cover verification GET, raw-byte HMAC success/failure/mutation/malformed/missing cases, exact Unicode/newline text, provider timestamp, additive fields, multiple entries/changes/messages, all deferred media types, status/non-message/unsupported/malformed/unexpected object, invalid-signature isolation, strict message-ID-only cycle invocation, duplicate suppression at the handler boundary, and persistence despite cycle failure. Migration regression checks cover atomic ordering, service-only grant, dedupe constraints, PII/audit isolation, closed-conversation supersession, no Project heuristic, and no Provider columns in Core. Full AP-16-01/02/03, authority, runtime, transport, permission, typecheck, lint, test, and build gates remain required.

Remaining limits are intentional: no outbound send, delivery/read reconciliation, provider network call, media fetch/download, Storage or Project Media, historical import, UI, Vision, LLM customer conversation, Graph API version, queue/worker, or production-readiness claim. The next smallest package is **AP-16-04-02 — WhatsApp Outbound Delivery & Status Reconciliation** with a newly verified outbound/versioned Meta contract.

## AP-16-04-01-01 Status

WHATSAPP TRANSPORT IDENTITY — IMPLEMENTED

WHATSAPP CONVERSATION TRANSPORT BINDING — IMPLEMENTED

WHATSAPP WEBHOOK RECEIPT AUTHORITY — IMPLEMENTED

WHATSAPP PROVIDER MESSAGE BINDING — IMPLEMENTED

WHATSAPP WEBHOOK VERIFICATION — IMPLEMENTED

WHATSAPP WEBHOOK SIGNATURE VALIDATION — IMPLEMENTED

WHATSAPP TEXT PAYLOAD PARSING — IMPLEMENTED

WHATSAPP INBOUND TEXT INGESTION — IMPLEMENTED

WHATSAPP → INTERNAL MESSAGE BOUNDARY — IMPLEMENTED

WHATSAPP → AP-16-03 TRIGGER — IMPLEMENTED

DUPLICATE WHATSAPP MESSAGE REPLAY — IDEMPOTENT

UNKNOWN WHATSAPP CONTACT → UNASSIGNED CONVERSATION — IMPLEMENTED

PROJECT GUESSING FROM TRANSPORT IDENTITY — PROHIBITED

WHATSAPP OUTBOUND DELIVERY — NOT IMPLEMENTED

WHATSAPP DELIVERY RECONCILIATION — NOT IMPLEMENTED

WHATSAPP MEDIA INGESTION — NOT IMPLEMENTED

HISTORICAL CHAT IMPORT — NOT IMPLEMENTED

VISION — NOT IMPLEMENTED

LLM CUSTOMER CONVERSATION — NOT IMPLEMENTED

OVERALL PRODUCT — NOT PRODUCTION READY
