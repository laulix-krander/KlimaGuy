# AP-16-06-06D-23 — Safe Test Customer Reset

## 1. Baseline SHA

`e257d1597c8f463e822f44d434a1fe8c15f531e9`

## 2. Ziel

Eine explizit bestätigte Test-Transportidentität wird atomar vom fachlichen Customer-, Conversation- und Project-Zustand getrennt. Die nächste **neue** WhatsApp-Nachricht durchläuft danach unverändert den normalen Inbound- und First-Contact-Pfad.

## 3. Warum der alte Recovery-Fall nicht mehr als MVP-Test verwendet wird

Der Datensatz enthält Zustände mehrerer Runtime- und Recovery-Generationen (Pending Interactions, Snapshots, Commands, Human Review, Rehabilitation und D-22-Kontext). Er testet damit historische Reparaturpfade statt des aktuellen Happy Paths. D-23 rehabilitiert weder den alten Command noch verändert es Recovery-Logik.

## 4. WhatsApp Identity Resolution

Der Parser liefert `sender_scope`, `external_sender_identity` und `provider_message_id`. `persistWhatsAppInboundText` reicht diese ausschließlich serverseitig an `ingest_whatsapp_inbound_text` weiter. Die Root ist `conversation_transport_identities`; `(provider, sender_scope, external_identity)` ist eindeutig. Für WhatsApp ist `external_identity` die vom Provider gelieferte Absenderidentität. Die rohe Identität gelangt weder in Audit-Metadaten noch in Conversation DTOs.

## 5. Customer Creation / Lookup

Inbound legt zunächst die Transportidentität und eine unzugeordnete Conversation an. `bootstrap_first_contact_foundation` sperrt Identity und Conversation. Es verwendet den vorhandenen `identity.customer_id` beziehungsweise `conversation.customer_id`; fehlen beide, erzeugt es einen Customer und bindet beide atomar. Konfligierende Bindungen schlagen fehl.

## 6. Conversation Creation / Reuse

`ingest_whatsapp_inbound_text` sperrt die Identität und sucht deren genau eine aktive `conversation_transport_binding`. Eine offene Conversation wird wiederverwendet. Fehlt sie oder ist sie geschlossen, wird eine Conversation erzeugt und eine neue aktive Binding-Revision angelegt. Die Entscheidung liegt daher nicht an der Telefonnummer in `customers.phone`, sondern ausschließlich an der Transportidentität und ihrer aktiven Binding.

## 7. Project Creation / Reuse

First Contact erzeugt bei leerem `conversation.current_project_id` ein Project für den gebundenen Customer, setzt den Pointer über die Conversation Authority und schreibt `conversation_project_assignments`. Ein vorhandenes Project wird nur akzeptiert, wenn es nicht gelöscht ist, demselben Customer gehört und eine Assignment existiert.

## 8. Root Entity für Reset

Adressierungsroot ist exakt `(provider, sender_scope, external_identity)` in `conversation_transport_identities`. Löschroot ist die daraus fail-closed ermittelte einzelne Identity mitsamt ihrem einzelnen, nicht geteilten `customer_id`. UUIDs werden nicht vom Operator eingegeben oder im Repository gespeichert.

## 9. Vollständiger abhängiger Datenbaum

* **Identity:** `conversation_transport_bindings`, `transport_message_bindings`, `transport_delivery_commands`; Media-Ingestion-Tabellen können ebenfalls referenzieren und sind deshalb ein Stop-Gate.
* **Conversation:** `conversation_project_assignments`, `conversation_state_commands`, `conversation_messages` sowie Text/Reference-Zeilen; Runtime Header, Pending Interactions, Planner Snapshots, Runtime Commands, Cycle Commands/Events; Information Collection, Retry, Effort und Evidence Request State; Transport Delivery Commands/Attempts/Events.
* **Dauerhafte Answer-Historie:** `customer_answer_execution_contexts` (D-22), `customer_answer_ai_inference_results`, `customer_answer_knowledge_transitions`, Claims und Claim Evidence.
* **Project:** `project_knowledge_states`, State Transitions, Claims, Claim Evidence, Corrections und Retractions sowie `project_notes`.
* **Bewusst nicht automatisch löschbare unabhängige Daten:** Project Media einschließlich Storage, Project Evidence/Interpretations/Reviews/Tombstones, Offers und Executions. Falls irgendeine dieser Root-Kategorien existiert, stoppt D-23 vor der ersten Mutation.
* **Technische Historie:** `transport_webhook_receipts` und `audit_log`. Beide werden bewahrt; nur der nullable Product-FK des Receipts wird gelöst.

## 10. FK / Cascade / Restrict Analyse

Conversation Core, Runtime, Transport, Planner, AI und Knowledge verwenden nahezu durchgehend `ON DELETE RESTRICT`; ein Customer-Delete ist allein deshalb nicht ausreichend. Mehrere History-Tabellen besitzen zusätzlich Append-only-Trigger. Die neue Function ermittelt zuerst abgeschlossene ID-Mengen, validiert Ownership, verschiebt alle deferrable Zyklen ans Transaktionsende und suspendiert ausschließlich die namentlich bekannten History-Trigger. `ALTER TABLE`, FK-Lösung und Deletes sind Teil derselben Function-Transaktion: Ein Fehler rollt auch die Triggerzustände zurück. Normale Produkt-Autoritäten bleiben unverändert.

## 11. Deduplication / Provider Message Safety

Die eindeutige Provider-Event-ID liegt in `transport_webhook_receipts(provider, sender_scope, provider_event_identity)`. Diese Receipt-Zeilen werden **nicht** gelöscht. Ihr nullable `internal_message_id` wird vor dem Product-Delete gelöst. Eine alte Provider-ID kann deshalb nicht erneut eingefügt und nicht als neue Nachricht verarbeitet werden; der bestehende Ingest-Duplicate-Zweig kann nach einem Reset keinen alten Message-Kontext mehr liefern und schlägt geschlossen fehl. Eine neue Provider-ID wird normal akzeptiert. `transport_message_bindings` werden dagegen gelöscht, weil sie Identity und Product Message per Restrict koppeln und nicht die erste Dedup-Barriere sind.

## 12. Reset Strategy

Eine einzelne forward-only Migration installiert `reset_test_transport_customer`. Preview und Reset verwenden dieselbe Identitätsauflösung und dieselben Stop-Gates. Die Function löscht keine Daten über frei zusammengesetzte SQL-Fragmente, sondern feste Tabellen in geprüfter Reihenfolge.

## 13. Security

Die Function ist `SECURITY DEFINER`, setzt einen festen `search_path`, prüft zusätzlich `auth.role() = 'service_role'`, verlangt den exakten Bestätigungstext `RESET TEST CUSTOMER` und entzieht `public`, `anon` und `authenticated` sämtliche Rechte. Es gibt keine Route, UI oder Client-Exposition. Preview gibt nur Counts aus, keine Identität, Texte oder Inhalte.

## 14. Exact Reset Operation

Zuerst Preview, dann genau ein Commit-Aufruf mit denselben drei Identity-Werten:

```sql
select public.reset_test_transport_customer(
  'whatsapp', '<SENDER_SCOPE>', '<EXTERNAL_TEST_IDENTITY>',
  'RESET TEST CUSTOMER', true
);

select public.reset_test_transport_customer(
  'whatsapp', '<SENDER_SCOPE>', '<EXTERNAL_TEST_IDENTITY>',
  'RESET TEST CUSTOMER', false
);
```

Beide Aufrufe müssen über einen Service-Role-Admin-Kontext erfolgen. Counts und Stop-Gates sind vor dem Commit zu prüfen. Identitätswerte dürfen nicht in Shell-History, Tickets oder Logs kopiert werden.

## 15. Was bewusst NICHT gelöscht wird

* `transport_webhook_receipts`: Dedup-Tombstones gegen alte Provider Events.
* `audit_log`: unveränderliche technische/fachliche Nachvollziehbarkeit; es enthält nach Design keine externe Identity und keine Nachrichtentexte.
* `auth.users`, `profiles`, `system_actor_registry`: unabhängige Benutzer/System-Actor-Daten.
* Alle Daten anderer Customers.
* Storage-/Media-, Evidence-, Offer- oder Execution-Daten: deren Existenz führt stattdessen zum vollständigen Rollback/Stop.

## 16. Fresh-Message Behavior danach

Nach erfolgreichem Reset existieren weder Identity noch aktive Binding, Customer, Conversation, Project oder deren Laufzeit-/Answer-Historie. Eine neue Provider Message ID erzeugt daher eine neue Receipt, neue Identity und neue ungebundene Conversation. First Contact erzeugt Customer, Project, Knowledge/Runtime und Initial Prompt über den unveränderten Produktpfad.

## 17. Tests

`safe-test-customer-reset-migration.test.ts` sichert Identity-Adressierung, Service-Role/Bestätigung, Dry Run, Ownership-/Independent-Data-Stop-Gates, die vollständige Conversation-State-Liste, Transaktionsmechanik und Receipt-Erhalt statisch ab. Die bestehenden WhatsApp-Webhook-, Inbound-Migrations-, First-Contact- und Gesamttests decken den unveränderten New-Inbound-Pfad ab. Eine echte Datenbank-E2E-Ausführung bleibt Teil des Operator-Schritts nach Deployment; Repository-Tests starten keine Supabase-Instanz.

## 18. Changed Files

* `supabase/migrations/202609110001_safe_test_customer_reset.sql`
* `test/safe-test-customer-reset-migration.test.ts`
* `docs/audits/AP-16-06-06D-23-safe-test-customer-reset.md`

## 19. Production Migration erforderlich

Ja: `supabase/migrations/202609110001_safe_test_customer_reset.sql`.

## 20. Exact Operator Step

1. Migration deployen.
2. Mit Service Role den Preview-Aufruf aus Abschnitt 14 ausführen.
3. Sicherstellen, dass exakt ein Customer selektiert ist, Counts plausibel sind und kein Stop-Gate ausgelöst wird.
4. Genau einmal denselben Aufruf mit `dry_run = false` ausführen.
5. Keine alte Nachricht erneut senden; von derselben Testnummer eine **neue** Nachricht mit neuer Provider Message ID senden.

## 21. Expected Fresh E2E

Neue WhatsApp-Nachricht → Receipt/Message-Persistierung → neue Identity/Conversation → First-Contact-Customer → neues Project/Knowledge/Runtime → erste Frage/Delivery → natürliche Antwort → D-22 Context und AI Interpretation → Knowledge-/Project-Zustand → nächste Frage. Alte Recovery Commands, Human Review, Planner Snapshots und durable AI-/Answer-Zustände sind nicht mehr erreichbar, weil sie gelöscht wurden.
