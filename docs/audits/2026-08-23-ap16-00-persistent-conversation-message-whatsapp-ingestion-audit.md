# AP-16-00 — Persistent Conversation, Message and WhatsApp Ingestion Architecture Audit

## 1. Audit Metadata

| Feld | Wert |
|---|---|
| Audit-ID | `KG-AUDIT-2026-08-23-AP16-00-PERSISTENT-CONVERSATION-MESSAGE-WHATSAPP-INGESTION-V1` |
| Datum | 2026-08-23 |
| Branch | `codex/audit-ap16-00-conversation-message-whatsapp-ingestion` |
| Baseline | `e840fa15e8e8fecde265bad4ab86742d97a3b925` |
| Paket | AP-16-00, ausschließlich Audit/Architektur |
| Status | **READY FOR OWNER DECISION** |

## 2. Scope

Untersucht wurden die vollständige Repositorystruktur, alle Migrationen, App-Routes und Server Actions, Auth/Profile/Rollen, Audit Logging, Projects/Customers, Project Media, Project Evidence, persistente Interpretation/Observation/Claim/Knowledge-/Offer-/Execution-Autoritäten sowie die gesamte Conversation-Intelligence-Domain einschließlich Cycle, Events, Planner, Templates, Normalisierung, Interpretation, Collection-, Retry-, Effort- und Evidence-Request-State und Simulator.

Das Ergebnis ist ausschließlich ein Zielbild für kanonische Conversations/Messages, persistente Live-Laufzeit, WhatsApp-Randadapter, Medienübergabe und historische Imports. Keine in diesem Dokument genannte Tabelle, Route, Policy oder Funktion ist durch AP-16-00 implementiert.

## 3. Current Repository State

Persistiert sind `customers`, `projects`, `project_media`, `project_evidence`, Interpretations/Observations, Claim-Proposals/Reviews, project-scoped Knowledge State/Claims, Korrektur/Invalidierung, Offer und Execution sowie Lifecycle-/Delete-Autoritäten. `customers` enthält optional `email` und `phone`; jedes Project hat genau einen verpflichtenden `customer_id`. Rollen sind `admin` und `reviewer`; fachliche Tabellen nutzen RLS, und `audit_log` ist für `anon`/`authenticated` direkt gesperrt.

Conversation Intelligence ist ein umfangreicher, strikt validierter, transportagnostischer TypeScript-Domainkern. Seine `conversation_id` ist bislang lediglich ein übergebener UUID-Domainwert. Der Admin-Simulator hält Messages, Interaction, Collection/Retry/Effort/Evidence-Request und Cycle-Fortsetzung in React-/Fixture-State. Reload oder Prozessneustart verliert diesen Gesprächslauf. Conversation-Events werden deterministisch abgeleitet, aber nicht gespeichert. Es gibt keine Messaging-Route und keinen externen Provider-Call.

## 4. Current Conversation Authority

**Audit Result: NOT IMPLEMENTED.** Es existieren weder Tabelle noch Repository/Service für eine Conversation, keine Project-Conversation-FK, kein Status, keine Revision, kein Assignment und keine persistente Sequenz. Domainobjekte tragen synthetische `conversation_id`; das macht sie nicht zu einer Authority. Der Simulator ist ausdrücklich lokale, flüchtige Demonstration.

## 5. Current Message Authority

**Audit Result: NOT IMPLEMENTED.** Der UI-lokale Typ `Message` in `simulator-view.tsx` und `RawCustomerAnswer` sind keine persistente Message Authority. Es fehlen kanonische Inhalte, Richtung/Actor, Unveränderlichkeit, Source-Message-Binding, Provider-Binding, Zustellung und Idempotenz. `customer_message` erscheint als Claim-Quellklassifikation, nicht als FK auf eine Message-Tabelle.

## 6. Current Contact Authority

Eine minimale **Customer Authority** existiert: `customers(id, first_name, last_name, email, phone, …)` mit Soft Delete; Projects referenzieren Customer verpflichtend. Sie ist noch keine messaging-taugliche Contact-/Identity-Authority: Telefonnummern sind freie optionale Texte, nicht normalisiert/verifiziert/eindeutig, und es gibt keine getrennte Transport Identity. AP-16 soll deshalb `customers` als fachliche Person/Organisation wiederverwenden und nur eine schmale, separate Contact-Transport-Identity ergänzen; keine parallele CRM-Personentabelle.

## 7. Existing WhatsApp / Messaging Code

Es existiert **kein** WhatsApp-/Meta-SDK, Webhook, Provider-Adapter, Inbound-/Outbound-Service, Delivery-Tracking, `message_id`-Unique-Constraint, Messaging-Queue oder historische Importstrecke. Telefonnummern existieren ausschließlich am Customer und in Customer-UI/-Actions/-Schemas/Tests. Messagingähnlich sind nur der synthetische Admin-Simulator, gerenderte Question-/Evidence-Templates und transportagnostische Domainwerte. Auth-Callback/Logout-Routes sind keine Webhooks. Alle Live-Kommunikation ist synthetisch beziehungsweise noch nicht vorhanden.

## 8. Terminology

| Begriff | Verbindliche Bedeutung |
|---|---|
| Conversation | Kanonischer providerunabhängiger Kommunikationskontext; optional einem Project/Customer zugeordnet. |
| Message | Persistierte kanonische, append-only Nachricht innerhalb genau einer Conversation. |
| Provider Message | Meta-/WhatsApp-Transportobjekt am Adapterrand; niemals interne Identität. |
| Inbound Message | fachliche Richtung Kunde → System, unabhängig vom technischen Importer. |
| Outbound Message | fachliche Richtung System/Admin → Kunde. |
| Message Delivery State | rein technischer Transportzustand; ohne Knowledge-Wirkung. |
| Source Message | opaque interne `message_id`, auf die Antwort, Evidence oder Korrektur zurückgeführt wird. |
| Conversation Assignment | kontrollierte Zuordnung/Rezuordnung einer Conversation zu einem Project. |
| Contact Identity | interne Kundenidentität (`customers.id`), getrennt vom Kanal. |
| Transport Identity | providergebundene Adresse, etwa WhatsApp-Telefonidentität/Provider-ID. |
| Historical Import | kanonischer Import alter Chats ohne Live-Webhook und ohne Live-Cycle. |

## 9. Conversation Architecture Variants

| Variante | Leads/mehrere Projekte | Historie/weitere Kanäle | Datenschutz, Replay, Tests | MVP-Aufwand | Urteil |
|---|---|---|---|---|---|
| A — Conversation direkt im Project | erzwingt voreilig Project; 1:1 ist zu eng | schlechte Import-/Channel-Grenze | einfache FK, aber falsche Authority | klein | ablehnen |
| B — Contact Thread | Leads möglich; Projektkontext bei mehreren Projects mehrdeutig | brauchbar für Historie | Telefon darf nicht Thread-Key sein | mittel | allein unzureichend |
| C — Provider Thread als Authority | bindet Fachmodell an WhatsApp | Anbieterwechsel/Webchat schlecht | Provider-Replay leakt in Domain | scheinbar klein | ablehnen |
| D — Generic Messaging Layer | unassigned und N:1 Project möglich | sehr gut | klare Idempotenz, isoliert testbar | mittel | gute Basis |
| E — Hybrid | interne Conversation/Message plus Contact, optionale Project-FK und separate Transport-Bindings | sehr gut | beste PII-/Replay-/Providergrenze | mittel, gestuft lieferbar | **empfohlen** |

## 10. Recommendation

**Variante E:** providerunabhängige Conversation- und append-only Message-Authority, vorhandener Customer als Contact Authority, separate Transport Identities/Bindings, optionale Project-Zuordnung, versionierte Runtime-State-Zeilen und idempotente Processing Commands. WhatsApp bleibt ein schmaler serverseitiger Adapter. Architektur der Persistenz: current-state rows plus append-only Messages/Assignment-History/technische Versuche; kein vollständiges Event Sourcing.

Conversation History ist niemals Knowledge Base. Domainorchestrierung erhält nur kanonische, validierte User-Inputs und opaque IDs. Durable Knowledge entsteht weiterhin ausschließlich durch vorhandene kontrollierte Claim-/Review-/Apply-Pfade.

## 11. Project Binding

Empfehlung **B: Conversation zunächst unassigned**. Weder automatische Project-Erzeugung noch eine neue Lead-Entity ist für den ersten Schnitt gerechtfertigt. Automatisches Assignment ist nur zulässig, wenn die Contact Identity belastbar ist und exakt ein aktives, fachlich passendes Project existiert; sonst fail closed und Admin-Zuordnung beziehungsweise kontrollierte Klärungsfrage. Project-Erzeugung bleibt ein späterer expliziter Workflow mit den bestehenden Pflichtfeldern und Human-Review-Defaults.

## 12. Conversation / Project Cardinality

Ein Project darf **mehrere Conversations** über Zeit/Kanäle besitzen; eine Conversation hat zu einem Zeitpunkt höchstens ein Project. Ein Customer kann mehrere Projects und mehrere Conversations besitzen. Reassignment ist selten, admin-only, revisions-/CAS-gesichert und mit append-only Assignment-History zu auditieren; alte Messages werden nicht umgeschrieben. Eine Conversation mit fachlich vermischten Projects muss getrennt oder Human Review zugeführt werden.

## 13. Contact Authority

`customers` bleibt interne Contact Identity. AP-16 benötigt keine zweite allgemeine `contacts`-Tabelle, wohl aber eine minimale `customer_transport_identities`-Authority für `customer_id`, `provider`, normalisierten/geschützten Provider-Identifier, Verifikations-/Statusdaten und Zeitpunkte. Eindeutigkeit und Matching-Policy sind Ownerentscheidungen. Der sichtbare freie `customers.phone`-Wert darf nicht als sichere WhatsApp-Identität oder Project-Schlüssel gelten.

## 14. Transport Identity

Transport Identity wird serverseitig aufgelöst und getrennt von Conversation/Knowledge gespeichert. Wo möglich werden normalisierte Werte geschützt oder ein keyed lookup digest plus verschlüsselter Sendewert verwendet; Klartextzugriff ist auf den Transportdienst begrenzt. Provider-Identifier und Telefonnummer erscheinen weder in Domain-State noch Audit-Metadaten.

## 15. Conversation Contract

Minimaler Vertrag: `id UUID`, `project_id UUID NULL`, `customer_id UUID NULL`, `channel` geschlossener Wert (`whatsapp`, später `webchat`/`email`), `status`, `revision >= 0`, `created_at`, `updated_at`, optional `closed_at`. Keine Provider-Payload, Telefonnummer, Message-Inhalte oder Runtime-Blob in dieser Zeile. FKs, aktive-Project-Prüfung und Assignment-Befehl kapseln Mutation.

## 16. Conversation Status

Geschlossen: `open`, `paused`, `human_review`, `closed`. `paused` ist kontrollierter Kunden-/Operator-Break, `human_review` blockiert automatischen Versand, `closed` beendet den Thread, nicht das Project. Statuswechsel sind CAS-gesichert. Es gibt keine Spiegelung der Project-Statusmaschine.

## 17. Message Contract

Minimal: `id UUID`, `conversation_id UUID`, `direction` (`inbound`, `outbound`, `internal`), `message_kind` (`text`, `image`, `document`, `system_notice`, `internal_note`, `unsupported`), `actor_class` (`customer`, `system`, `admin`, `reviewer`, `importer`), `occurred_at`, `created_at`, `reply_to_message_id NULL`, `content_revision=1`, optional Tombstonezeit/-grundcode. Transportdaten liegen nicht in der Message. `occurred_at` darf Provider-/Importzeit ausdrücken; `created_at` bleibt DB-Ingestzeit.

## 18. Message Content

Keine freie Provider-JSONB-Authority. Empfohlen sind typisierte 1:1-Inhaltstabellen: `conversation_message_text(message_id, body)`, `conversation_message_media(message_id, project_media_id NULL, content_role, ingest_status, failure_reason)`; Dokumente nutzen Media-Inhalt mit `media_kind=document`. `system_notice`/`internal_note` erhalten kontrollierten Text und sind nie transportfähig. Strikte Constraints verhindern mehrere Contentvarianten. Unsupported speichert nur Typ-/Reason-Code, nicht rohe Payload.

## 19. Customer Text

Kanonischer Kundentext bleibt für History in der Textinhaltstabelle und ist PII. Er wird nicht in Claim-/Evidence-/Planner-/Audit-Payloads kopiert. Answer/Interpretation/Claim-Provenienz referenziert ausschließlich die opaque `source_message_id`; eine spätere FK darf Tombstone-Weiterbestand via restrict/nullable snapshot ID nach Policy sichern.

## 20. Message Immutability

Inbound Messages sind nach Commit append-only. Keine Textkorrektur in place, auch nicht durch Admin. Korrektur erfolgt als neue administrative Annotation/Correction-Message mit Referenz; Löschung ist ein policy-gesteuertes Tombstone/Redaction-Verfahren, das Identität und opaque Provenienz erhält. Outbound-Inhalt wird vor erstem Send Attempt eingefroren.

## 21. Provider Binding

`conversation_transport_bindings`: `id`, `conversation_id`, `provider`, `transport_identity_id`, optional providerseitiger Thread-/Business-Identifier, `status(active|superseded|revoked)`, Zeitpunkte, Revision. Interne Conversation-ID bleibt Primary Identity. Ein aktives Binding muss provider-/account-/identity-spezifisch eindeutig sein.

## 22. Provider Message Binding

`message_transport_bindings`: `id`, `message_id`, `provider`, `provider_account_key`, `provider_message_id`, `transport_direction`, `provider_occurred_at`, `delivery_state`, `delivery_revision`, Zeitpunkte. Unique mindestens `(provider, provider_account_key, provider_message_id)`; außerdem höchstens ein aktives Binding je Message/Provider-Richtung. Delivery-Updates ändern nur diese Relation.

## 23. Webhook Idempotency

Authentifizierte Provider-Events erhalten eine stabile Event-Dedupe-ID; Message-Events verwenden vorrangig die providerweit gescopte Message-ID. Ein Unique-Insert von Binding/Ingestion-Receipt entscheidet Gewinner. Replay liefert Erfolg aus bestehendem Zustand und erzeugt weder zweite Message noch zweiten Processing Command. Processing Command hat Unique `source_message_id`; Cycle-Apply nutzt zusätzlich vorhandene Transition-/Apply-Idempotenz und State-Version. Outbound hat eine stabile interne Message-ID als idempotenten Send-Key. Damit entstehen bei Replay keine doppelten Claims oder Antworten.

## 24. Webhook Event Types

Normalizer unterscheidet `inbound_message`, `delivery_status`, `read_status`, `failure` und `unsupported_event`. Nur `inbound_message` kann eine interne Message erzeugen. Delivery/read/failure aktualisieren monoton das passende Transport-Binding beziehungsweise Attempt; unbekannte Events werden ohne Inhalt als kontrollierter Receipt-Status abgeschlossen.

## 25. Webhook Authenticity

GET-Verifikation und POST-Signaturprüfung sind Adapteraufgaben. Signatur wird gegen die unveränderten Raw-Body-Bytes geprüft, bevor JSON-Normalisierung oder DB-Mutation erfolgt. App Secret, Access Token und Verify Token sind ausschließlich serverseitige Environment-Secrets. Fehlerantworten und Audit enthalten weder Secret noch Body; externe Daten werden strikt mit Zod validiert.

## 26. Transport Adapter

Inbound: `WhatsApp webhook adapter → authenticity/schema normalization → canonical ingestion service → Conversation/Message persistence → processing command → domain orchestration`. Outbound: `domain result/template renderer → canonical outbound Message → outbox/send attempt → WhatsApp adapter`. Conversation Intelligence importiert keine Meta-Typen, URLs, Tokens oder SDKs; der Adapter formuliert keinen Text neu.

## 27. Inbound Processing

Reihenfolge und Transaktionsgrenzen:

1. Webhook authentifizieren und strikt parsen (außerhalb Fachtransaktion).
2. Provider-Event-Receipt per Unique-Key deduplizieren.
3. Transport Identity serverseitig auflösen/anlegen.
4. Conversation Binding finden oder Conversation unassigned erzeugen.
5. Interne Message plus Provider-Binding atomar persistieren.
6. Project Binding prüfen; Ambiguität stoppt Fachverarbeitung.
7. Message Kind normalisieren; Media ggf. als separaten Command markieren.
8. Processing Command idempotent anlegen und pro Conversation sperren.
9. Cycle/Runtime-/Domainresultat in einer DB-Transaktion anwenden.
10. Kontrollierte Outbound Message und Pending Interaction in derselben Fachtransaktion erzeugen.
11. Outbox-Worker sendet außerhalb der DB-Transaktion.
12. Send Attempt/Provider-Binding speichern; verlorene HTTP-Antwort wird reconciled, nicht blind als neue Message gesendet.

Netzwerk und Project-Media-Storage können nicht atomar mit PostgreSQL sein; sie verwenden explizite Attempt-Zustände und Recovery.

## 28. Pending Interaction

`conversation_pending_interactions` ist Live-Pflicht: `id`, `conversation_id`, `project_id`, `outbound_message_id`, `decision_id`, `action_type`, `template_key`, `template_version`, `knowledge_state_version`, `conversation_revision`, `continuation_kind`, `status`, `created_at`, `answered_at`, optional `answer_message_id`. Status: `pending`, `answered`, `superseded`, `cancelled`; `expired` erst nach Owner-Policy, nie per erfundener Heuristik. Pro Conversation höchstens eine antworterwartende aktive Interaction. Ein Text wird nur unter Lock und passender Version als `RawCustomerAnswer` gebunden.

## 29. Multiple Inbound Messages

Beide Messages werden verlustfrei append-only gespeichert und erhalten je einen Command. MVP verarbeitet Commands nach DB-Ingestreihenfolge seriell pro Conversation. Die erste kann die Pending Interaction konsumieren; die zweite wird gegen den danach aktuellen Zustand neu klassifiziert und niemals automatisch derselben Frage zugeordnet. Falls semantisch nicht eindeutig: neutral bestätigen und Human Review/Replan.

## 30. Serialization

MVP: kurze DB-Transaktion mit `SELECT … FOR UPDATE` auf Conversation, Prüfung von `revision`, ältestem offenen Command und Runtime-Versionen; danach atomischer CAS-Increment. Kein globaler Lock und keine zwingende externe Queue. Command-Zustände `pending`, `processing`, `completed`, `failed_retryable`, `failed_terminal` plus Lease/attempt count erlauben Recovery. Human-Takeover und Assignment laufen über denselben Conversation-Lock.

## 31. Out-of-order Events

Providerzeit dient Anzeige/Korrelation, nie dem Zurücksetzen von Runtime-State. Fachverarbeitung folgt persistierter Command-Reihenfolge; alte Message, die vor aktueller Pending Interaction occurred ist, beantwortet diese nicht. Delivery-State folgt einer erlaubten monotonen Transition/Reconciliation, nicht blind dem Timestamp. Verspätete Messages bleiben History und werden bei möglicher Fachrelevanz replanned/human-reviewed.

## 32. Outbound Idempotency

Eine fachliche Antwort erzeugt genau eine interne Outbound-Message mit stabiler UUID und Outbox-Eintrag, atomar zum Cycle-Ergebnis. Jeder Retry referenziert dieselbe Message und denselben logischen Send-Key; Attempts sind append-only. Timeout nach Providerannahme führt zuerst zu Statusabfrage/Provider-ID-Reconciliation. Niemals wird zur Wiederholung eine neue Kundenfrage gerendert.

## 33. Delivery State

Transportzustände: `created`, `queued`, `sent_to_provider`, `delivered`, `read`, `failed`. `failed` besitzt kontrollierten Reason/Retryability-Code; Attempts bleiben separat. Nur erlaubte monotone Übergänge, wobei verifizierte Providerkorrektur separat auditiert wird. Delivery State verändert weder Knowledge, Pending-Answer-Semantik noch Project-/Offer-/Execution-Authority.

## 34. Human Takeover

Planner `request_human_review`, Kundenwunsch, Ambiguität oder Unsupported-Fall setzt Conversation persistent auf `human_review`, superseded/cancelled offene AI-Interaktionen kontrolliert und blockiert AI-Outbox-Erzeugung/-Versand. Bereits queued AI-Nachrichten müssen unter demselben Status-Gate vor Send erneut geprüft werden. Admin/Reviewer-Zuständigkeit folgt expliziter Capability, nicht Actor-Text.

## 35. Human Reply

Manuelle Antwort wird kanonische Outbound-Message mit tatsächlichem `actor_class=admin|reviewer`, Actor-ID in geschützter Authority und normalem Delivery-Workflow. Sie darf nicht als System-/AI-Message erscheinen und konsumiert eine Pending Interaction nur durch expliziten Admin-Befehl.

## 36. Resume

Resume ist expliziter admin-only CAS-Befehl nach Prüfung von Project, Runtime, offenen Commands und Interactions. Er setzt `human_review|paused → open`, erzeugt gegebenenfalls einen neuen Planner-Command und auditiert opaque IDs/Revisionen. Eine Adminnachricht oder neue Kundenmessage resumed niemals automatisch.

## 37. Internal Notes

Internal Notes sind `direction=internal`, `message_kind=internal_note`, nicht transportfähig und nie in der Outbox selektierbar. Bestehende `project_notes` bleiben Project-Notizen und werden nicht still als Conversation Messages umgedeutet. Inhalte gehören nicht ins Audit.

## 38. Media Inbound

Nur nach sicherem Project Assignment: Provider Media Reference → kurzlebiger serverseitiger Download → bestehender Project-Media-Reservation/Upload/Finalize-Pfad → kanonisches `project_media` → `project_evidence`-Binding → bestehende Evidence-/Review-Pipeline. Message-Media-Inhalt referenziert danach opaque `project_media_id`; Ingestion allein erfüllt keinen Need und erzeugt keine Observation/Claim.

## 39. Media Before Project

Vergleich: (A) Project erzwingen ist fachlich verfrüht; (C) unassigned Media Authority dupliziert Project Media; (D) provisional Project verfälscht das Modell. **MVP-Empfehlung B: enges temporäres Inbound-Staging**, verschlüsselt/zugriffsbeschränkt, status- und fristpolicygebunden, ohne Domain-/Evidence-Wirkung. Download darf alternativ bis Assignment aufgeschoben werden, solange Providerverfügbarkeit belastbar ist. Owner/Legal müssen Staging-Retention entscheiden; kein `project_media` ohne Project.

## 40. Provider Media Boundary

Download-URL und Token existieren nur im Arbeitsspeicher des serverseitigen Adapters beziehungsweise kurzlebiger Secret-geschützter Job-Payload, nicht in Domain-DB, `project_media`, Evidence, Claims oder Audit. Dateiname, MIME, Caption und Metadaten sind untrusted und streng validiert; keine Instruktionswirkung.

## 41. Customer Photo Persistence

Nach erfolgreichem Finalize ist das Original reguläres `project_media`. Es übernimmt vorhandene Lifecycle-, Retention-Eligibility-, Dependency-Projection-, Evidence-Tombstone- und recoverable Delete-Gates. Es gibt keinen WhatsApp-Bucket und keine zweite Retention Engine. Message-Tombstone und Media-Retention bleiben getrennte Policies.

## 42. Evidence Request Matching

Eine Pending Evidence Interaction besitzt explizite `request_id`, Conversation/Project, Decision-/Template-/Knowledge-Version und erwartete Target-/View-/Count-Spezifikation. Inbound Media wird unter Conversation-Lock durch ausdrückliche Kundenkorrelation (Reply-to, kontrollierter Prompt-Kontext oder Adminzuordnung) gebunden. „Latest open request“ allein ist verboten. Unsicherheit ergibt unclassified Candidate/Human Review.

## 43. Multiple Photos

Persistenter Request hält `minimum_count`, `maximum_count`, Required Views, optional Bundle und einzelne `conversation_evidence_request_items(message_id, project_media_id, target/view classification, status)`. `provided_count` wird aus akzeptierten Items abgeleitet. Completion erst nach kontrollierter Zuordnung/Validierung, nicht beim bloßen Empfang; weitere Bilder bleiben Kandidaten. Vorhandene Evidence-Request-Domain wird erweitert, nicht ersetzt.

## 44. Unsolicited Photos

Bei eindeutigem Project dürfen sie `project_media` werden und als `unclassified` Evidence Candidate gebunden werden. Sie erfüllen keine Planner-Anforderung, erhöhen keine Readiness und erzeugen keine technische Aussage. Bei unassigned/mehrdeutigem Project bleiben sie Staging plus Human Review.

## 45. Documents

Dokumente dürfen nach Project Assignment als `project_media` übernommen werden, bleiben `unclassified`/human-review. Document Request/Interpretation ist derzeit deferred; kein OCR, keine automatische technische Interpretation und kein Claim. Gefährliche/unerlaubte Dateitypen werden abgewiesen.

## 46. Audio

MVP: als `unsupported` klassifizieren, keine Speech-to-Text-/AI-Verarbeitung. Je nach Owner-/Retentionentscheidung entweder minimaler Message-Record ohne Binärpersistenz oder kontrolliertes Project-unassigned Staging für Human Review. Neutraler Hinweis beziehungsweise Takeover; keine automatische Semantik.

Video folgt derselben MVP-Grenze: unsupported/human review, keine Analyse. Keine parallele dauerhafte Medienablage.

## 47. Unsupported Types

Sticker, Reaction, Location und Contact Card werden strikt normalisiert: Reaction optional als informational Transportevent ohne Cycle; übrige Typen `unsupported` mit geschlossenem Reason-Code. Pipeline crasht nicht. Kein Kundendatensatz, Project, Claim oder Toolaufruf entsteht aus Location/Contact-Payload. Ein neutraler, idempotenter Hinweis darf als kontrolliertes Template gesendet werden.

## 48. Conversation Events

Die bestehenden zehn Cycle-Events sind Domainresultate mit Sequenz/Correlation/State-Version, heute nicht persistent. Später können sie append-only für fachliche History gespeichert werden, atomar zum Cycle-Apply und unique nach Event-/Cycle-ID. Sie sind **nicht Runtime Authority**; Conversation, Processing Command, Pending Interaction und State-Zeilen bleiben maßgeblich. Transport-/Delivery-Events gehören nicht in dieselbe Eventtaxonomie.

## 49. Processing Authority

`conversation_processing_commands` ist die kleine replay-safe Orchestrierungsauthority: `id`, `conversation_id`, `source_message_id`, `command_kind`, `status`, `attempt_count`, `expected_conversation_revision`, `cycle_id NULL`, `result_code`, Lease-/Zeitfelder. Unique `(source_message_id, command_kind)`. Feinere Phasen (`received`, `normalized`) gehören in Ingestion Receipt/Message; Command deckt `pending/processing/cycle_completed/outbound_generated/failed` ab, ohne riesige Workflow-State-Machine.

## 50. Exactly-once Boundary

Keine Exactly-once-Behauptung. Ziel ist **at-least-once Transport + idempotente Persistence + serialisierte/idempotente Domainanwendung + transactional Outbox + replay-safe Delivery**. Externe Providerannahme und lokale DB können nie eine gemeinsame Transaktion bilden.

## 51. Error Recovery

| Fehlergrenze | Persistenter Zustand | Recovery |
|---|---|---|
| Webhook valide, DB fällt aus | kein Receipt/keine Message | non-2xx; Provider-Retry, gleicher Dedupe-Key |
| Message persistiert, Cycle fällt aus | Message + `failed_retryable` Command | Lease-/Backoff-Retry unter Lock; keine neue Message |
| Cycle erfolgreich, Outbound-Persistenz fällt aus | durch gemeinsame Fachtransaktion Rollback; sonst unzulässiges Design | denselben Command wiederholen |
| Outbound persistiert, Meta-Send fällt aus | Outbox + failed Attempt | technischer Retry derselben Message |
| Meta akzeptiert, Antwort geht verloren | Attempt `unknown`/queued | Provider-Reconciliation; gleicher Send-Key, keine neue Message |
| Media geladen, Finalize fällt aus | Staging/ingest Attempt, kein Ready-Media-Fake | Cleanup oder idempotenter Finalize-Retry mit gleicher Media-Identity |

## 52. Retry Separation

Transport Retry zählt Send-/Download-/Webhook-Attempts und verändert kein Kunden-Effort. Fachlicher Question Retry bleibt die bestehende information-key-/entity-scoped Retry-Domain und muss persistent werden. Namen, Tabellen und Metriken sind strikt getrennt; ein HTTP-Fehler darf niemals als Kunden-Unknown oder Frageversuch zählen.

## 53. Project Assignment

Automatic nur bei nachweislich unambiguous, aktivem Customer/Project und Owner-freigegebener Matching-Regel. Sonst admin-only Assignment. Command prüft erwartete Conversation-Revision, Project/Customer-Konsistenz und aktive Zustände; History hält `from_project_id`, `to_project_id`, Actor, Reason-Code, Zeit, Revisionen. Messages bleiben immutable. Reassignment invalidiert/superseded stale Pending Interactions und erzwingt Replan/Human Review.

## 54. Multiple Projects

Telefonnummer/Transport Identity allein wählt nie zwischen mehreren Projects. Conversation bleibt unassigned/paused; Kunde kann über kontrollierte, nicht frei autorisierende Auswahl Kontext liefern, finale Zuordnung erfolgt anhand sicherer IDs/Policy oder Admin. Fail closed, kein Claim/Media-Finalize/Cycle im falschen Project.

## 55. New Customer

Neue Transport Identity darf zunächst Conversation ohne Customer/Project erzeugen. Customer/Project wird erst durch separaten kontrollierten Workflow angelegt/verknüpft. Für den MVP ist Admin-Onboarding zulässig; keine neue Lead-CRM-State-Machine. Ein automatisierter Minimalflow wäre ein eigenes Owner-freigegebenes Paket und muss bestehende Project-Pflichtfelder/Human Review respektieren.

## 56. Privacy

Message Content und Transport Identity sind personenbezogen: Datenminimierung, getrennte Zugriffsflächen, RLS, server-only Ingestion, kein Content-Logging, keine Client-Providerdaten, eingeschränkte Exporte und explizite Retention-/Deletion-Policy. Such-/Supportansichten dürfen nur notwendige Inhalte offenlegen. Keine Telefonnummer in Claims, Observations, Proposals, Planner/Collection/Retry/Effort, Media Dependency oder Audit.

## 57. Message Retention

Keine Frist wird erfunden. Owner/Legal entscheiden Zweck, Frist, Litigation-/Contract-Holds und getrennte Regeln für Live Messages, technische Provider-Receipts, Staging, Imports und Project Media. Conversation-Message-Retention ist nicht Project-Media-Retention und darf deren Delete Gates nicht umgehen.

## 58. Deletion Boundary

Spätere Redaction/Tombstone entfernt oder sperrt Content policygemäß, lässt Message-ID, minimale Richtung/Zeit/Status und erlaubte opaque Provenienz bestehen. Authoritative Claims können nach Policy fortbestehen, müssen aber einen `source_unavailable`-/Tombstone-Zustand sichtbar machen. Keine Cascade-Löschung fachlicher Knowledge-History; keine Implementierung in AP-16-00.

## 59. Audit Logging

Nur opaque Conversation/Message/Project/Command/Attempt/Assignment-IDs, Actor-ID, Action, Status-/Reason-Code, Revision und Zeitpunkt. Verboten: Telefonnummer, Name, Text/Caption, Dateiname, Media-/Download-URL, rohe Payload, Header/Signatur, Provider-Token, Prompt. Direkter Clientzugriff auf `audit_log` bleibt gesperrt.

## 60. RLS

Alle neuen fachlichen Tabellen erhalten RLS. Admin darf zugeordnete und unassigned Conversations gemäß expliziter Capability lesen/verwalten; Reviewer nur ausdrücklich freigegebene project-/conversation-scoped Review-Fälle und keine Transport-Identities/Secrets. Customer hat keinen direkten Supabase-Zugriff; `anon` erhält keine Tabellenrechte. Child-Policies prüfen Conversation/Project aktiv und Actorrolle, statt nur eine UUID-FK zu vertrauen.

## 61. Service Privilege

Webhook besitzt keine User Session. Empfehlung: schmale server-only DB-Funktionen/RPCs beziehungsweise dedizierte Ingestion-Rolle mit exakt Insert/Update-Rechten für Receipt, Transport Binding, Conversation/Message und Command—nicht ein generischer Service-Role-Client in Domain-/UI-Code. Falls Service Role technisch unvermeidbar ist, nur in einem isolierten Adapter mit strikten Inputs, nie an den Client und ohne beliebige Tabellenoperationen.

## 62. Provider Secrets

App Secret, Access Token und Verify Token liegen ausschließlich in serverseitiger Secret-Konfiguration, nicht in Domainwerten oder DB-Tabellen. Rotation/fehlende Konfiguration führt fail closed. Logs, Errors, Audit und Tests nutzen keine echten Secrets.

## 63. Historical Chats

Importpfad: `legacy transcript → strict import parser → canonical Conversations/Messages → import provenance → optional analysis candidates → human review`. Dasselbe Schema, keine Legacy-Message-Engine. Imports bekommen separaten Channel/Binding-/Batchkontext und starten standardmäßig weder Live-Cycle noch Outbox.

## 64. Historical Import Actor

Message `direction` und fachlicher `actor_class` bewahren Originalrolle (customer/admin/system soweit belegbar). Technischer Importer wird separat in `historical_import_batches/items(imported_by, source_type, source_record_key)` protokolliert, nicht als ursprünglicher Sender ausgegeben. Unsichere Richtung bleibt Importfehler/Human Review.

## 65. Historical Knowledge Extraction

Kein automatisches authoritative Knowledge. Zulässige Zukunftskette: Import → isolierte Analysis Candidates mit Source-Message-IDs → Laurie/Admin-Review → bestehender strukturierter Knowledge-/Correction-/Quality-Workflow. Keine Claims beim Import, kein Live-Planner und kein Prompt-Dump.

## 66. Quality Learning

Kanonische Messages ermöglichen später Question Effectiveness, Unknown-/Retry-/Takeover-/Correction-Raten und Offer-Outcome-Korrelation. Dieses Audit implementiert weder Metrics noch Tracking-Schema. Auswertungen benötigen Zweck-/Zugriffs-/Retentionentscheidung und dürfen keine Message-Inhalte in Metrikpayloads kopieren.

## 67. Laurie Workflow

Späterer read-only Zusammenhang: Conversation → Source Message/Evidence → AI-Decision → Proposal/Claim → Correction → Outcome. Laurie kann daraus kontrolliert Rule Update, Knowledge Entry oder Regression Case vorschlagen. Diese Artefakte sind eigene reviewbare Authorities und ändern nie rückwirkend die Message.

## 68. Free-text Knowledge

Freitext aus alten/live Chats ist keine Runtime-Regel und wird nicht ungefiltert in Prompts geladen. Fachwissen geht später über versionierte Registry/Rule-Proposal, Review, Tests und Freigabe. Message-Retention und Regelherkunft bleiben nachvollziehbar getrennt.

## 69. Prompt Injection

Customer Text ist ausschließlich untrusted User Content. Er kann keine System Instruction, Runtime Configuration, Rolle/Permission, Project-ID, Claim Property, SQL/DB Query oder Toolauthority setzen. Alle Aktionen entstehen aus geschlossenem Planner/Template/Schema, serverseitigem Auth-Kontext und erlaubten Mappings. LLM-Ausgabe wäre später untrusted Proposal, nie direkte Mutation.

## 70. Attachment Injection

Dateiname, Caption, EXIF, OCR-Text, MIME-Behauptung, Dokumentinhalt und Provider-Metadaten sind untrusted Daten ohne Instruktionswirkung. Server prüft tatsächlichen Dateityp/Größe, neutralisiert Namen und trennt Analyse von Berechtigungen/Tools. Keine Attachmentdaten in Audit oder Runtime-Konfiguration.

## 71. Outbound Template Boundary

Die bestehende Question Template Registry und Evidence-Request-Templates bleiben fachliche Source. Orchestrierung speichert gerenderten, versiongebundenen Text als Outbound Message; WhatsApp Adapter versendet exakt diesen Inhalt und darf nicht umformulieren, Preise ergänzen oder Folgefragen wählen.

## 72. LLM Future Boundary

Ein künftiger Rewrite ist nur hinter kontrolliertem Meaning-/Template-Contract, Längen-/Safety-Validation und Human-/Policy-Gates zulässig. Er erhält keine Secrets/Toolauthority und darf semantische Optionen, Preis, Project/Permission oder Entscheidung nicht verändern. Nicht Bestandteil AP-16.

## 73. Runtime State

Conversation-Zeile bleibt klein. Separate current-state Authorities referenzieren Knowledge-Version und halten Collection, Retry, Effort sowie Evidence Requests; Pending Interaction/Processing Commands sind eigene relationale Zeilen. Jede Authority hat Revision, Project/Conversation-Kompositintegrität und Zeitpunkte. Keine freie giant JSONB-State-Ablage.

## 74. Collection State

Persistieren normalisiert als `conversation_collection_items` plus `conversation_runtime_states(collection_revision, knowledge_state_version, …)`, mit geschlossenem `information_key/entity_type/status/path/revisit` Contract. Dies erlaubt Constraints, gezielte CAS-Updates und Tests. Ein versionierter, streng schematisierter JSON-Snapshot wäre nur Übergang, nicht freie Erweiterungsfläche.

## 75. Retry State

`conversation_retry_items` pro Information-Key/Entity speichert fachliche Attempts, last meaning/reason, Revision/Zeit. Aktualisierung atomar zum Cycle. Dadurch überlebt Retry den Neustart und Provider-Retry kann ihn nicht erhöhen.

## 76. Customer Effort

Kleine 1:1-State-Zeile speichert `consecutive_technical_questions`, Block-/Break-Information und Revision gemäß bestehendem strikt validierten Contract. Update atomar mit Plannerresultat. Neustart darf die Vier-Fragen-Grenze nicht zurücksetzen.

## 77. Evidence Request State

`conversation_evidence_requests` plus Items bindet Request an Conversation, Project, Planner Decision, Pending Interaction, Knowledge-/Template-Version, Target/Bundle/Views/Counts und Status. `project_evidence` bleibt Evidence Authority; die Request-Zeile referenziert nach Klassifikation die resultierende Evidence/Media opaque. Kein automatisches technisches Need-Fulfillment.

## 78. Decision Versioning

Answer-Bindung verlangt dieselbe Conversation/Project-ID, aktive Interaction, `decision_id`, `template_version`, erwartete `knowledge_state_version` und passende Conversation-Revision. Stale Antwort bleibt Message, konsumiert aber nichts: Command endet `requires_replan` oder `human_review`, und nur kontrollierte neue Interaction kann entstehen.

## 79. Intermediate Result

Intermediate Result wird echte Outbound Message plus Pending Interaction `continuation_kind=effort_break`; Runtime speichert zugrunde liegenden Stop/Decision-/Knowledge-Version. Es setzt keine fachliche Antwort voraus und startet nicht heimlich einen weiteren Block.

## 80. Continue Semantics

MVP-Empfehlung: Zwischenstand senden und auf explizites, kontrolliertes „Weiter“ (Button/Keyword-Contract) warten. Dieses bindet sich wie eine Answer an die Continuation Interaction; danach verwendet Orchestrierung die bestehende explizite Continuation-Funktion. Kein automatischer nächster Block und kein verstecktes Endlosfragen. Owner kann später einen klar angekündigten Auto-Continue-Policyflow separat freigeben.

## 81. Customer Stop

`stop`, `später`, `kein Interesse` werden zunächst nur über geschlossenen Intent-/Admin-Contract erkannt, nicht freie ungeprüfte NLP. `später` → `paused`; eindeutiger Stop → Conversation `closed` oder Human Review nach Policy. Projectstatus wird nicht automatisch geändert. Pending Interactions werden cancelled und Outbox-Gate greift.

## 82. Human Escalation

Expliziter Mitarbeiterwunsch setzt sofort `human_review`, blockiert AI und erzeugt idempotenten Review-Command/Notification. Keine weitere AI-Frage. Unsichere Erkennung failt Richtung Human Review, nicht autonomer Fortsetzung.

## 83. Price Request

Verbindlicher Preiswunsch geht an vorhandene Offer-/Human-Review-Authority. Messaging Adapter berechnet/formuliert keinen Preis und gibt kein Angebot frei. Nur kontrolliert autorisierte Offer-Daten dürfen über ein separates Template versendet werden.

## 84. Conversation Close

`closed` ist nicht `projects.status=closed`. Neue Message zu geschlossener Conversation erzeugt entweder nach Policy eine neue Conversation oder einen expliziten reopen Command unter Lock; niemals stille Statusänderung. Project closed/deleted führt fail closed/Human Review und keine automatische Wiederöffnung.

## 85. Multiple Channels

Interne Contracts sind provider-/kanalunabhängig; Transport-Bindings kapseln WhatsApp. Webchat/Email können später Adapter ergänzen. MVP implementiert trotzdem nur WhatsApp-first und vermeidet vorgezogene channelübergreifende Routinglogik.

## 86. Persistence Architecture Variants

| Variante | Bewertung |
|---|---|
| A — giant Conversation JSON | einfache Writes, aber schlechte Constraints/CAS/RLS/Migrationen; ablehnen |
| B — alles normalisiert | beste Integrität, aber Tabellenfetisch und hohe MVP-Kopplung |
| C — Event Sourcing | mächtig, für vorhandenen modularen Monolithen unnötig komplex |
| D — Current-State + append-only Messages/Events | klare Runtime und History; empfohlen |
| E — Hybrid | **empfohlen:** D plus kleine normalisierte Hot-State-Items und technische Attempts/Outbox |

## 87. Minimal Tables

Gestuft, nicht gleichzeitig:

**AP-16-01 Pflicht:** `conversations`, `conversation_messages`, `conversation_message_text`, `conversation_message_media` (Contract/nullable Media erst ohne Ingestion), `conversation_assignment_history`. Customer wird wiederverwendet.

**AP-16-02:** `conversation_runtime_states`, `conversation_pending_interactions`, `conversation_collection_items`, `conversation_retry_items`, `conversation_evidence_requests`/Items; Effort kann in der schmalen Runtime-Zeile liegen.

**AP-16-03/04/06:** `conversation_processing_commands`, optional persistente `conversation_domain_events`, `customer_transport_identities`, `conversation_transport_bindings`, `provider_event_receipts`, `message_transport_bindings`, `message_send_attempts`/transactional outbox.

**Später:** enges media staging; `historical_import_batches/items`. Keine neue allgemeine Contact-Tabelle.

## 88. Package Split

1. **AP-16-01 — Persistent Conversation & Message Authority:** Tabellen/Contracts, Customer-/optionales Project-Binding, Immutability, Assignment-History, RLS; kein Provider.
2. **AP-16-02 — Persistent Live Runtime & Pending Interaction:** Runtime, Collection/Retry/Effort/Evidence Request, versionierte Pending/Continuation.
3. **AP-16-03 — Replay-safe Live Cycle Orchestration:** Processing Commands, Conversation-Lock/CAS, atomic Cycle/Outbound-Erzeugung; In-memory/fake transport.
4. **AP-16-04 — WhatsApp Webhook & Text Ingestion Adapter:** Authenticity, Receipts, Transport Identities/Bindings, inbound Text; noch kein Outbound-Netzversand.
5. **AP-16-05 — Outbound WhatsApp Delivery & Retry:** Outbox, Attempts, Reconciliation, Delivery Events. Dies muss vor Media liegen, damit Text-/Fehlerantworten belastbar sind.
6. **AP-16-06 — WhatsApp Media Ingestion → Project Media:** Download/Staging, Finalize, Request-Korrelation, Unsupported-Medien.
7. **AP-16-07 — Historical Chat Import Audit/Baseline:** Importbatches, Dedupe, kein Live-Cycle/Knowledge-Apply.

Jedes Implementierungspaket benötigt eigene Ownerfreigabe und Migration/RLS/Tests. Media kann erst nach Project-/Message-/Runtime-/Outbound-Grundlage sicher kundenwirksam werden.

## 89. Minimal First Package

**AP-16-01 ist der kleinste nächste Schnitt:** providerunabhängige Conversation + append-only Message Persistence Baseline, vorhandener Customer, optionale Project-FK, Assignment-History, strikte Contentverträge, RLS/Permissions/Repositories und Tests. Explizit kein WhatsApp, Provider-Binding, Live-Cycle, automatische Project-Erzeugung oder Media-Ingestion.

## 90. Failure Matrix

Legende: „Audit“ bedeutet stets nur opaque IDs/Status/Revision, niemals Content/Telefon/URL.

| Fall | Authority / persistenter State | Retry & Idempotenz | Sichtbar / Human / Audit |
|---|---|---|---|
| A new inbound text, no conversation | Receipt creates Transport Binding, unassigned Conversation, Message, one Command | unique Provider-ID | neutrale Eingangsbestätigung oder Assignment-Hinweis; Human bei Bedarf; created IDs |
| B duplicate webhook | Receipt/Message Binding unique | return existing; no Cycle/Claim/Outbound | keine doppelte Nachricht; kein neuer Audit-Fachakt |
| C conversation without project | Conversation+Message, Command blocked_unassigned | after assignment same Command/replan | keine Fachinterpretation; Admin assignment; reason |
| D known customer, one project | verified Identity + single eligible Project assignment | assignment CAS | normale kontrollierte Fortsetzung; assignment revision |
| E known customer, multiple projects | remains unassigned/paused | no blind retry/match | Klärung/Human; ambiguity code |
| F pending question answered | Message consumes exact Pending row under lock | unique source Message/Command | next controlled response; no Human; decision IDs |
| G stale answer | Message retained, Pending unchanged/superseded | replan once, no state mutation | neutral clarification/Human; stale version code |
| H two answers rapidly | two Messages/Commands, serialized | first consumes; second re-evaluated | second not reused; Human if ambiguous; revisions |
| I message persisted, cycle fails | failed_retryable Command | same command under lease/backoff | delayed/neutral status if policy; Human after terminal; failure code |
| J cycle succeeds, outbound creation fails | atomic transaction rolls back Cycle/State | repeat same Command | no partial visible send; transaction result |
| K outbound send timeout | Message+Outbox+unknown Attempt | reconcile/retry same message/send-key | no duplicate question; operator on uncertainty; attempt status |
| L duplicate outbound retry | one Message, multiple Attempts | provider/idempotency key + binding unique | one customer message; duplicate attempt code |
| M inbound requested image | exact Pending Request + staged/finalized Project Media + Request Item | Message/media finalize IDs unique | receipt/completion only after match; Human if view unclear; opaque IDs |
| N unsolicited image | Project Media + unclassified candidate | same Provider Message/Media identity | acknowledge without Need fulfillment; optional review; classification code |
| O image before Project assignment | Message + restricted staging/ingest attempt | resume after assignment; cleanup policy | assignment needed; Human; no Media URL in Audit |
| P unsupported audio | unsupported Message/reason | no interpretation retry | neutral template + Human option; reason code |
| Q Human takeover | Conversation human_review, Interactions superseded, AI Outbox gated | idempotent status command | Mitarbeiterhinweis; assigned reviewer; revision |
| R Intermediate Result | outbound Message + continuation Pending + Effort state | stable decision/message IDs | Zwischenstand, wartet auf „Weiter“; no Human normally; versions |
| S Customer stop | Message + paused/closed Conversation, Pending cancelled | idempotent intent command | Stopbestätigung; Project unchanged; status revision |
| T old provider event arrives late | Message/Delivery binding with provider time | no backward state; command chronology checks | History/possible clarification; Human if relevant; late code |
| U Conversation reassignment | Assignment History + revision, Pending superseded | CAS, no Message rewrite | Admin-visible; mandatory review/replan; from/to opaque IDs |
| V Project closed but new message | Message, Command blocked_project_state | no auto reopen | Human/neutral contact; Project unchanged; reason |
| W historical imported message | canonical Message + Import Item, no Live Command | batch/source key unique | import report only; optional review; batch IDs |
| X imported message duplicate | existing Import Item/Message | unique batch/source fingerprint policy | counted as duplicate, no Claims/Outbound; result code |

## 91. Race Conditions

| Race | Control / fail-closed result |
|---|---|
| two inbound Messages | per-Conversation row lock, oldest pending Command, revision CAS |
| inbound vs outbound | outbound send-time status/revision gate; inbound committed first can supersede Pending/AI send |
| inbound vs Project assignment | same Conversation lock; losing command replans on new revision |
| inbound image vs Evidence Request | exact Request/Interaction version under lock; otherwise unclassified |
| Human takeover vs AI cycle | same lock plus send-time human-review gate; AI Outbox cancelled/suppressed |
| Project close vs inbound | Project state rechecked inside command transaction; blocked/Human Review |
| Offer state change vs inbound | Offer version read in orchestrator; stale price/offer response forbidden/replanned |
| webhook replay during processing | Receipt/Message/Command unique; one lease owner; replay returns accepted |
| send retry after provider delivery | binding/delivery reconciliation before retry; same logical Message key |
| historical import vs live Message | separate provenance and unique scoped external identity; import never starts live Cycle; collision reviewed |

Locks bleiben kurz; externe Provider-/Storage-Netzaufrufe finden nie unter DB-Row-Lock statt.

## 92. Owner Decisions

| # | Entscheidung | Empfehlung / noch offen |
|---:|---|---|
| 1 | providerunabhängige Conversation Authority | ja |
| 2 | Message Authority | ja, append-only |
| 3 | Contact Authority | `customers` wiederverwenden + schmale Transport Identities |
| 4 | Conversation vor Project | ja, unassigned |
| 5 | Project automatisch erzeugen | nein im MVP |
| 6 | Cardinality | Project 1:N Conversations; Conversation 0..1 Project |
| 7 | Reassignment | admin-only, CAS + History + Replan |
| 8 | mehrere Projects | fail closed, keine Telefonwahl |
| 9 | Message immutability | ja; Korrektur/Redaction separat |
| 10 | rohe Provider-Payload behalten | standardmäßig nein |
| 11 | Provider-Payload-Dauer | Owner/Legal; minimaler Receipt ohne Content empfohlen |
| 12 | Customer-Text-Retention | **offen: Owner/Legal** |
| 13 | Pending Interaction persistent | ja, Pflicht |
| 14 | Collection State persistent | ja, normalisierte Items |
| 15 | Retry State persistent | ja, getrennt von Transport |
| 16 | Effort State persistent | ja |
| 17 | Evidence Request State persistent | ja |
| 18 | Serialization | DB row lock + revision CAS + Commands |
| 19 | Webhook-Idempotenz | Provider Event/Message Unique-Key |
| 20 | Outbound-Idempotenz | interne Message + Outbox/Attempts/Reconciliation |
| 21 | Delivery States | sechs geschlossene Transportstates |
| 22 | Human Takeover persistent | Conversation status + Outbox gate |
| 23 | Resume | nur expliziter admin-only Befehl |
| 24 | Intermediate Continue | auf explizites „Weiter“ warten |
| 25 | unsupported Media | persistierter Reason, neutral/Human; kein Crash |
| 26 | Audio | MVP unsupported, kein STT |
| 27 | unsolicited Photo | Project Media, unclassified, kein Need-Effekt |
| 28 | Media vor Project | enges temporäres Staging; Retention **offen** |
| 29 | WhatsApp Download Adapter | server-only, kurzlebige URL/Token |
| 30 | historische Chats gleiches Schema | ja |
| 31 | historische Auto-Knowledge-Extraction | nein |
| 32 | Prompt-Injection-Grenze | User Content ohne Authority |
| 33 | künftige LLM-Grenze | nur kontrollierter Meaning-/Template-Contract |
| 34 | Message Retention | **offen: Owner/Legal** |
| 35 | RLS | alle Tabellen; kein Customer/anon Direct Access |
| 36 | server-only Privilegien | minimaler Ingestion-RPC/Rolle, Service Role vermeiden |
| 37 | erstes Paket | AP-16-01 Conversation/Message Baseline |
| 38 | Sequenz | AP-16-01 → 02 → 03 → 04 → 05 → 06 → 07 |

Vor Implementierung zusätzlich explizit festzulegen: Verschlüsselungs-/Lookupverfahren für Transport Identity, technische Provider-Receipt-Retention, Staging-Retention, Reviewer-Sichtbarkeit, Reopen-Policy und Schwelle für automatische Single-Project-Zuordnung.

## 93. Future Tests

- Strikte Zod-Schemas/Extra-Field-Rejection für Conversation, Message, Provider-Normalisierung und Commands.
- Conversation-Persistenz, optionale Project-/Customer-Bindung, N:1-Cardinality, Assignment/Reassignment-CAS.
- Inbound-/Outbound-Unveränderlichkeit, Reply-to und Tombstone-Provenienz.
- Duplicate Provider Message/Event, concurrent Replay und imported duplicate.
- Zwei Inbound Messages/Commands, Lock/Lease/CAS und out-of-order Providerzeit.
- Pending-Interaction-Binding mit Conversation/Decision/Template-/Knowledge-Version; stale Answer ohne Mutation.
- persistenter Collection-/Retry-/Effort-State über Neustart und technische Retry-Trennung.
- Evidence Request/mehrere Photos/Views/Bundle, unsolicited und pre-Project staging.
- Outbox/Send Attempts, Timeout nach Providerannahme, Duplicate Retry und monotone Delivery States.
- Human Takeover vs Cycle/Send, explizites Resume, Stop und Intermediate Continue.
- Provider-Media-URL/Telefon/Content-Isolation aus Knowledge, Audit, Logs und Projection.
- Historical Import wahrt Richtung/Actor, startet keinen Live-Cycle und erzeugt keine Claims.
- RLS-/Grant-Matrix für admin/reviewer/anon/customer/server ingestion, Cross-Project-Verweigerung.
- Webhook Verification, Raw-Body-Signatur, ungültige Schema/Signatur, Secret-/Error-Redaction.

## 94. Production Gates

- Provider-Replay kann keine zweite interne Message erzeugen.
- Message-/Command-Replay kann keinen zweiten Claim/Cycle-Apply erzeugen.
- Outbound-Retry kann keine zweite Kundenfrage erzeugen; unbekannte Providerannahme ist reconciliable.
- Stale Answer mutiert keinen aktuellen State und konsumiert keine neue Interaction.
- Telefon/Provider-ID gelangt nie in Knowledge, Observation, Proposal, Planner, Projection oder Audit.
- Customer Text/Caption/Dateiname gelangt nie in Audit oder technische Logs.
- Payload, Download-URL und Token gelangen nie in Domain/Project Media/Evidence.
- Project-Ambiguität und mehrere Projects fail closed.
- Mehrere Inbound-Verarbeitungen sind pro Conversation serialisiert.
- Human Takeover blockiert AI-Erzeugung und Send auch bei Race.
- Inbound Media nutzt bestehendes Project Media/Finalize/Lifecycle/Delete; kein paralleler Storage.
- Requested Photo wird explizit korreliert; unsolicited erfüllt keinen Need.
- Historische Imports erzeugen keine authoritative Claims und keinen Outbound.
- Prompt/Attachment Injection kann Rollen, Permissions, Project, Properties oder Tools nicht ändern.
- RLS/Grants sind auf allen neuen Tabellen aktiv und Cross-Project getestet.
- Provider-Secrets und privilegierte Ingestion bleiben server-only/minimal.
- Partial Failures besitzen persistente, idempotente Recovery ohne Inhaltslogging.
- Owner/Legal haben Message-, Receipt- und Staging-Retention vor Production entschieden.

## 95. Scope Confirmation

AP-16-00 erzeugt ausschließlich diese Auditdatei. Es implementiert **keine** Migration, Conversation-/Message-/Contact-Persistenz, WhatsApp-/Meta-API, Webhook-Route, Outbound-Send, Media-Download/-Ingestion, Project-Erzeugung, historischen Import, LLM, Vision, UI, Tests oder Dependency. `package.json` bleibt unverändert. Anwendungstests werden auf ausdrückliche Anweisung nicht ausgeführt.

## 96. Status

**Auditstatus: READY FOR OWNER DECISION**

| Authority / Capability | Status |
|---|---|
| PERSISTENT PROJECT AUTHORITY | **IMPLEMENTED** |
| PERSISTENT PROJECT MEDIA AUTHORITY | **IMPLEMENTED** |
| PERSISTENT EVIDENCE AUTHORITY | **IMPLEMENTED** |
| PERSISTENT KNOWLEDGE AUTHORITY | **IMPLEMENTED** |
| PERSISTENT OFFER AUTHORITY | **IMPLEMENTED** |
| PERSISTENT EXECUTION AUTHORITY | **IMPLEMENTED** |
| PERSISTENT CONVERSATION AUTHORITY | **NOT IMPLEMENTED — ARCHITECTURE AUDITED** |
| PERSISTENT MESSAGE AUTHORITY | **NOT IMPLEMENTED — ARCHITECTURE AUDITED** |
| PERSISTENT LIVE CONVERSATION RUNTIME STATE | **NOT IMPLEMENTED — ARCHITECTURE AUDITED** |
| WHATSAPP WEBHOOK INGESTION | **NOT IMPLEMENTED** |
| WHATSAPP TEXT INGESTION | **NOT IMPLEMENTED** |
| WHATSAPP MEDIA INGESTION | **NOT IMPLEMENTED** |
| WHATSAPP OUTBOUND DELIVERY | **NOT IMPLEMENTED** |
| HISTORICAL CHAT IMPORT | **NOT IMPLEMENTED** |
| AUTOMATIC HISTORICAL KNOWLEDGE EXTRACTION | **NOT IMPLEMENTED** |
| VISION | **NOT IMPLEMENTED** |
| LLM CUSTOMER CONVERSATION | **NOT IMPLEMENTED** |
| OVERALL PRODUCT | **NOT PRODUCTION READY** |

Ownerfreigabe dieses Audits ist noch keine Production- oder Gesamtimplementierungsfreigabe. Der nächste beantragbare Scope ist ausschließlich AP-16-01.

# AP-16-01 — Persistent Conversation & Message Authority Result

## Migration und Authorities

Die additive Migration `202608230004_persistent_conversation_message_authority.sql` implementiert `conversations`, die append-only `conversation_messages` mit getrennten typisierten Text-/Referenzinhalten sowie `conversation_project_assignments`. Interne UUIDs sind die einzige Conversation- und Message-Identität. Conversation enthält ausschließlich optionale Customer-/aktuelle Project-Bindung, den geschlossenen Status `open|paused|human_review|closed`, positive Revision und Zeitpunkte; initial gelten `open` und Revision `1`.

Customer und Project werden über die vorhandenen Authorities mit `ON DELETE RESTRICT` referenziert. Unassigned Conversations sind gültig. Ein Project kann mehrere Conversations haben, eine Conversation höchstens ein aktuelles Project. Initial Assignment und admin-only Reassignment sind atomar, CAS-gesichert und schreiben unveränderliche History (`assigned|reassigned`); direktes Umschreiben des aktuellen Projects wird durch einen Guard verhindert. Statuswechsel folgen ausschließlich der kleinen freigegebenen Matrix, nutzen `expected_revision`, erhöhen nur bei Änderung die Revision und öffnen `closed` niemals implizit wieder.

## Message Contract, Inhalt und History

Messages haben opaque UUID, conversation-lokal eindeutige positive `sequence`, geschlossene Direction (`inbound|outbound|internal`), Kind (`text|image_reference|document_reference|system_notice|internal_note`), Actor (`customer|admin|reviewer|system|ai`), getrennte `occurred_at`/`created_at` und optionales Reply. Die kanonische Reihenfolge ist `sequence`; gleiche Zeitpunkte bleiben deterministisch. Text ist unverändert, nicht leer und auf 20.000 Zeichen begrenzt. Semantische Bild-/Dokumentreferenzen tragen ausschließlich eine opaque interne UUID, keine Datei, URL oder Media-/Storage-Bindung. Es gibt keine freie Content-/Provider-JSONB-Autorität.

Row-Guards verhindern UPDATE/DELETE an Messages, Text-/Referenzinhalt und Assignment-History. Replies müssen existieren, derselben Conversation angehören und dürfen keine Self-Reference sein. Normale Aufzeichnung in `closed` ist gesperrt. Internal Notes sind zwingend `internal`; Direction/Actor-Constraints verhindern die Interpretation als Kundenversand. Der öffentliche Staff-Input besitzt kein Actor-Feld und erlaubt weder inbound noch historische `occurred_at`; ein separat typisierter trusted server/import-ready Contract ist nicht als Browser-/Provider-Action exponiert.

## Idempotenz, Audit und sichere Grenzen

Conversation Creation, Assignment und Message Recording besitzen gescopte Command-/Idempotency-Keys. Identischer Replay liefert das vorhandene DTO, erzeugt keine zweite Sequence und keinen zweiten Audit-Eintrag; Konflikte failen geschlossen. Audit-Aktionen sind `conversation_created`, `conversation_project_assigned`, `conversation_status_changed` und `conversation_message_recorded`. Metadaten enthalten nur Actor-, Conversation-, optionale Project-/Message-ID, Kind/Direction, Revision/Sequence und Zeitpunkt — niemals Text, Customerdaten, Telefon, E-Mail, URL oder Transportdaten.

RLS ist auf allen sechs Tabellen aktiv. Direkte Rechte werden vollständig entzogen; authenticated erhält ausschließlich scoped Read der Current-/Message-/Content-Projektion und explizit freigegebene Admin-RPCs. Unassigned Conversations sind admin-only; Reviewer lesen nur projectgebundene Conversations. Es gibt keine Customer-/anon-Rechte und keine direkten Message-Inserts, -Updates oder -Deletes. SECURITY-DEFINER-Funktionen nutzen einen festen `search_path`, `auth.uid()`, rekonstruierte Rollen und servergenerierte IDs/Sequence.

## DTOs, Read Service und Pagination

Strikte Zod-Verträge (Zusatzfelder abgelehnt) decken Conversation, Message, discriminated Content, Create, Assignment, Status, Staff-/Trusted-Record, DTOs, geschlossene Error Codes und Result Union ab. DTOs enthalten keine Transportdaten. Der Read Service lädt genau eine zugängliche Conversation oder höchstens 100 Messages über `sequence > cursor`, sortiert nach Sequence; keine unbounded History, Timestamp-Pagination oder N+1-Abfrage.

## Provider-, Knowledge- und Import-Grenze

Conversation/Message enthalten keinen Channel, Provider, Provider-Identifier, Telefonnummer, Transportpayload oder Delivery State. Provider-Bindings bleiben Folgepaket. Persistenz löst keinen Cycle, Planner, Normalizer, Knowledge-/Evidence-/Claim-Write oder Outbound-Versand aus. Die Trennung von `occurred_at` und `created_at` sowie opaque Message Identity ist für einen späteren kontrollierten historischen Import vorbereitet; es gibt jetzt weder Import API noch Importflag oder automatische Knowledge Extraction.

## Tests und verbleibende Grenzen

Contracttests prüfen Striktheit, UUID/Timestamps/Revision/Sequence, Allowlisten, exakten Text, Staff-/Actor-Grenze, Internal Notes, trusted historische Zeit und Keyset-Aufruf. Migrationstests prüfen Tabellen, Idempotenz, CAS, Reply-Scope, Append-only-Guards, Closed Gate, RLS/Grants, Admin-only Unassigned Read, Audit-PII-Isolation, Providerfeld-Abwesenheit und Pagination. Runtime-, Pending-, Transport-, Delivery-, Media-, Import-, AI-/Vision-, UI- und Retention-Entscheidungen bleiben ausdrücklich außerhalb dieses Pakets.

## AP-16-01 Status

- **PERSISTENT CONVERSATION AUTHORITY — IMPLEMENTED**
- **PERSISTENT MESSAGE AUTHORITY — IMPLEMENTED**
- **PROVIDER-INDEPENDENT MESSAGE IDENTITY — IMPLEMENTED**
- **APPEND-ONLY CUSTOMER MESSAGE HISTORY — IMPLEMENTED**
- **CONVERSATION / PROJECT ASSIGNMENT — IMPLEMENTED ACCORDING TO APPROVED MVP SCOPE**
- **PERSISTENT LIVE CONVERSATION RUNTIME STATE — NOT IMPLEMENTED**
- **PERSISTENT PENDING INTERACTION — NOT IMPLEMENTED**
- **PERSISTENT COLLECTION / RETRY / EFFORT STATE — NOT IMPLEMENTED**
- **WHATSAPP WEBHOOK INGESTION — NOT IMPLEMENTED**
- **WHATSAPP TEXT INGESTION — NOT IMPLEMENTED**
- **WHATSAPP MEDIA INGESTION — NOT IMPLEMENTED**
- **WHATSAPP OUTBOUND DELIVERY — NOT IMPLEMENTED**
- **HISTORICAL CHAT IMPORT — NOT IMPLEMENTED**
- **AUTOMATIC HISTORICAL KNOWLEDGE EXTRACTION — NOT IMPLEMENTED**
- **VISION — NOT IMPLEMENTED**
- **LLM CUSTOMER CONVERSATION — NOT IMPLEMENTED**
- **OVERALL PRODUCT — NOT PRODUCTION READY**
