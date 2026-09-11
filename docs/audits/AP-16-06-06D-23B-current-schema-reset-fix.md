# AP-16-06-06D-23B – Reset gegen das aktuelle Schema

## Produktionsfehler und Root Cause

Der produktive Commit der D-23-RPC brach mit PostgreSQL `42P01` für
`public.customer_answer_claim_evidence` ab, während die Vorschau erfolgreich war. Der Fehler lag hinter dem
`dry_run`-Return: D-23 hatte die drei isolierten AP-16-06-01D-Relationen
`customer_answer_claim_evidence`, `customer_answer_knowledge_claims` und
`customer_answer_knowledge_transitions` samt Triggern in den Mutationspfad übernommen. Diese Authority gehört nicht
zum tatsächlich bereitgestellten aktuellen Produktionsschema. Die aktuelle, vom D-22-Kontext gelesene
Knowledge-Authority sind die `project_knowledge_*`-Tabellen. Deshalb wird keine Legacy-Relation rekonstruiert und kein
dynamisches Schema-Discovery eingebaut; alle drei stale Referenzen werden gemeinsam entfernt.

## Vollständiger Objektabgleich

`ja` bedeutet: aus der bis D-23B geordneten Repository-Migrationshistorie nachweisbar erzeugt und danach weder
gelöscht noch umbenannt. Die drei mit `nein` markierten Legacy-Objekte sind ausschließlich als entfernte
D-23A-Referenzen dokumentiert und kommen in der finalen Function nicht mehr vor.

| object_name | object_type | exists_currently | source_migration | used_in_d23_for | action |
|---|---|---:|---|---|---|
| customers | Relation | ja | `202607210001_initial_schema.sql` | Zielkunde zählen/löschen | keep |
| projects | Relation | ja | `202607210001_initial_schema.sql` | Kundenprojekte auswählen/löschen | keep |
| project_notes | Relation | ja | `202607210001_initial_schema.sql` | Projektnotizen löschen | keep |
| project_media | Relation | ja | `202607270001_project_media_table_baseline.sql` | destruktiver Stop-Gate | keep |
| project_evidence | Relation | ja | `202608210001_project_evidence_persistence.sql` | destruktiver Stop-Gate | keep |
| project_knowledge_states | Relation | ja | `202608210006_persistent_knowledge_state_apply.sql` | aktuelle Knowledge-State löschen | keep |
| project_knowledge_state_transitions | Relation | ja | `202608210006_persistent_knowledge_state_apply.sql` | aktuelle Knowledge-Historie löschen | keep |
| project_knowledge_claims | Relation | ja | `202608210006_persistent_knowledge_state_apply.sql` | aktuelle Claims löschen | keep |
| project_knowledge_claim_evidence | Relation | ja | `202608210006_persistent_knowledge_state_apply.sql` | aktuelle Claim-Evidence löschen | keep |
| project_knowledge_corrections | Relation | ja | `202608210008_persistent_correction_invalidation.sql` | Korrekturen löschen | keep |
| project_knowledge_claim_retractions | Relation | ja | `202608210008_persistent_correction_invalidation.sql` | Retraktionen löschen | keep |
| project_offers | Relation | ja | `202608230001_minimal_persistent_offer_authority.sql` | destruktiver Stop-Gate | keep |
| project_executions | Relation | ja | `202608230002_minimal_persistent_execution_authority.sql` | destruktiver Stop-Gate | keep |
| conversations | Relation | ja | `202608230004_persistent_conversation_message_authority.sql` | Konversation auswählen/löschen | keep |
| conversation_project_assignments | Relation | ja | `202608230004_persistent_conversation_message_authority.sql` | Ownership prüfen/Zuordnung löschen | keep |
| conversation_state_commands | Relation | ja | `202608230004_persistent_conversation_message_authority.sql` | Statushistorie löschen | keep |
| conversation_messages | Relation | ja | `202608230004_persistent_conversation_message_authority.sql` | Nachrichten zählen/löschen | keep |
| conversation_message_text | Relation | ja | `202608230004_persistent_conversation_message_authority.sql` | Nachrichtentext löschen | keep |
| conversation_message_references | Relation | ja | `202608230004_persistent_conversation_message_authority.sql` | Nachrichtenreferenzen löschen | keep |
| conversation_runtime_states | Relation | ja | `202608230005_persistent_conversation_runtime.sql` | Runtime löschen | keep |
| conversation_pending_interactions | Relation | ja | `202608230005_persistent_conversation_runtime.sql` | Pending-State löschen | keep |
| conversation_information_collection | Relation | ja | `202608230005_persistent_conversation_runtime.sql` | Collection-State löschen | keep |
| conversation_retry_states | Relation | ja | `202608230005_persistent_conversation_runtime.sql` | Retry-State löschen | keep |
| conversation_effort_states | Relation | ja | `202608230005_persistent_conversation_runtime.sql` | Effort-State löschen | keep |
| conversation_evidence_request_states | Relation | ja | `202608230005_persistent_conversation_runtime.sql` | Evidence-Request-State löschen | keep |
| conversation_runtime_commands | Relation | ja | `202608230005_persistent_conversation_runtime.sql` | Runtime-Commands löschen | keep |
| conversation_cycle_commands | Relation | ja | `202608230006_persistent_live_conversation_cycle.sql` | Cycle-Commands löschen | keep |
| conversation_transport_identities | Relation | ja | `202608230007_conversation_transport_persistence.sql` | Identität auflösen/löschen | keep |
| conversation_transport_bindings | Relation | ja | `202608230007_conversation_transport_persistence.sql` | Bindings auswählen/löschen | keep |
| transport_webhook_receipts | Relation | ja | `202608230007_conversation_transport_persistence.sql` | Tombstones behalten/FK lösen | keep |
| transport_message_bindings | Relation | ja | `202608230007_conversation_transport_persistence.sql` | Provider-Bindings löschen | keep |
| transport_delivery_commands | Relation | ja | `202608240002_whatsapp_outbound_delivery.sql` | Delivery-Commands löschen | keep |
| transport_send_attempts | Relation | ja | `202608240002_whatsapp_outbound_delivery.sql` | Delivery-Versuche zuerst löschen | keep |
| transport_delivery_events | Relation | ja | `202608240002_whatsapp_outbound_delivery.sql` | Delivery-Historie zuerst löschen | keep |
| transport_message_attachments | Relation | ja | `202608240003_whatsapp_media_safe_staging.sql` | Medien-Stop-Gate | keep |
| transport_media_ingestion_commands | Relation | ja | `202608240003_whatsapp_media_safe_staging.sql` | Medien-Stop-Gate | keep |
| conversation_interaction_snapshots | Relation | ja | `202609010001_planner_snapshot_persistence.sql` | Snapshots löschen | keep |
| conversation_cycle_events | Relation | ja | `202609020002_atomic_cycle_commit_failure_authority.sql` | Cycle-Events löschen | keep |
| customer_answer_ai_inference_results | Relation | ja | `202609100002_durable_ai_inference_retry_semantics.sql` | D-17-Ergebnisse löschen | keep |
| customer_answer_execution_contexts | Relation | ja | `202609100007_durable_customer_answer_execution_context.sql` | D-22-Kontexte löschen | keep |
| customer_answer_claim_evidence | Relation (stale D-23A) | nein (Production) | isolierte, nicht bereitgestellte `202609020001_customer_answer_knowledge_apply.sql` | Legacy-Evidence löschen | remove_stale_reference |
| customer_answer_knowledge_claims | Relation (stale D-23A) | nein (Production) | isolierte, nicht bereitgestellte `202609020001_customer_answer_knowledge_apply.sql` | Legacy-Claims löschen | remove_stale_reference |
| customer_answer_knowledge_transitions | Relation (stale D-23A) | nein (Production) | isolierte, nicht bereitgestellte `202609020001_customer_answer_knowledge_apply.sql` | Legacy-Transitionen löschen | remove_stale_reference |

### Trigger

| object_name | object_type | exists_currently | source_migration / Tabelle | used_in_d23_for | action |
|---|---|---:|---|---|---|
| customer_answer_execution_contexts_immutable | Trigger | ja | `202609100007…` / `customer_answer_execution_contexts` | Delete erlauben | keep |
| cycle_events_append_only | Trigger | ja | `202609020002…` / `conversation_cycle_events` | Delete erlauben | keep |
| cycle_command_history_guard | Trigger | ja | `202608230006…` / `conversation_cycle_commands` | Delete erlauben | keep |
| runtime_header_guard | Trigger | ja | `202608230005…` / `conversation_runtime_states` | Delete erlauben | keep |
| planner_snapshot_immutable | Trigger | ja | `202609010001…` / `conversation_interaction_snapshots` | Delete erlauben | keep |
| pending_interaction_guard | Trigger | ja | `202608230005…` / `conversation_pending_interactions` | Delete erlauben | keep |
| runtime_commands_append_only | Trigger | ja | `202608230005…` / `conversation_runtime_commands` | Delete erlauben | keep |
| transport_delivery_events_append_only | Trigger | ja | `202608240002…` / `transport_delivery_events` | Delete erlauben | keep |
| conversation_message_text_append_only | Trigger | ja | `202608230004…` / `conversation_message_text` | Delete erlauben | keep |
| conversation_message_references_append_only | Trigger | ja | `202608230004…` / `conversation_message_references` | Delete erlauben | keep |
| conversation_messages_append_only | Trigger | ja | `202608230004…` / `conversation_messages` | Delete erlauben | keep |
| conversation_assignments_append_only | Trigger | ja | `202608230004…` / `conversation_project_assignments` | Delete erlauben | keep |
| conversation_state_commands_append_only | Trigger | ja | `202608230004…` / `conversation_state_commands` | Delete erlauben | keep |
| project_knowledge_claim_evidence_append_only | Trigger | ja | `202608210006…` / `project_knowledge_claim_evidence` | Delete erlauben | keep |
| project_knowledge_claims_append_only | Trigger | ja | `202608210006…` / `project_knowledge_claims` | Delete erlauben | keep |
| project_knowledge_transitions_append_only | Trigger | ja | `202608210006…` / `project_knowledge_state_transitions` | Delete erlauben | keep |
| ca_evidence_append_only | Trigger (stale D-23A) | nein (Production) | isolierte `202609020001…` / fehlende Relation | Legacy-Delete erlauben | remove_stale_reference |
| ca_claims_append_only | Trigger (stale D-23A) | nein (Production) | isolierte `202609020001…` / fehlende Relation | Legacy-Delete erlauben | remove_stale_reference |
| ca_transitions_append_only | Trigger (stale D-23A) | nein (Production) | isolierte `202609020001…` / fehlende Relation | Legacy-Delete erlauben | remove_stale_reference |

Die verwendeten Filter-/Join-Spalten wurden an ihren jeweiligen `CREATE TABLE`-Definitionen geprüft. Die
Restrict-Abhängigkeiten werden Kind-vor-Eltern abgearbeitet: D-22/D-17 vor Cycle, Runtime/Snapshot/Pending vor
Messages, Send-Attempts/Events vor Delivery-Commands, Delivery vor Provider-Bindings, Message-Inhalte und Bindings
vor Messages, Conversation-Historien vor Conversations sowie Knowledge-Kinder vor States/Projects. Ergebnis der
finalen Prüfung: **0 nicht existente Relations, 0 nicht existente Trigger und 0 unbekannte verwendete Spalten**.

## Finale Reset-Semantik und Änderungen

Die öffentliche Signatur, Service-Role-Prüfung, Bestätigung, Identitäts-/Ownership-Stop-Gates und Preview-Counts
bleiben unverändert. `dry_run=true` endet weiterhin vor jeder persistenten Mutation. Beim Commit werden D-22- und
D-17-Zustand, aktuelle Conversation/Cycle/Runtime/Knowledge-Zustände, Transportzustände, Conversations, Projects,
Identity und Customer in FK-sicherer Reihenfolge gelöscht. Webhook Receipts bleiben als Provider-Dedup-Tombstones
erhalten; lediglich ihr Message-FK wird gelöst. Entfernt wurden ausschließlich die drei stale Legacy-Relationen und
deren drei Trigger-Suspensionen.

## Migration und Tests

Die einzige neue forward-only Migration ist
`supabase/migrations/202609110002_fix_safe_test_customer_reset_current_schema.sql`. Sie ersetzt per
`CREATE OR REPLACE FUNCTION` dieselbe RPC. Der Vitest-Abgleich extrahiert sämtliche direkten `public.*`-Relationen
und Trigger der finalen Function, weist ihre Erstellung und Trigger-Zuordnung in der Migrationshistorie nach, prüft
auf spätere Drops/Renames, verbietet alle drei stale Namen und schützt Dry-Run-, Commit-, Signatur- und
Service-Role-Contract. Die bestehenden Operator-Tests bleiben Bestandteil des vollständigen Testlaufs.

**Production-Migration erforderlich: JA.**

Danach ist der einzige manuelle Ablauf:

1. `/admin/test-customer-reset` öffnen.
2. Preview ausführen.
3. Counts prüfen.
4. Commit ausführen.
5. Bei Erfolg keine weitere Reset-Diagnose durchführen.
6. Eine komplett neue WhatsApp-Nachricht senden.
7. Fresh-MVP-E2E testen.
