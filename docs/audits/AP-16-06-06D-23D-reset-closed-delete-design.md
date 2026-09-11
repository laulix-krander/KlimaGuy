# 1. Executive root-cause summary

**Authority rule: PRODUCTION CATALOG > repository migration history.** For this reset, directly queried live-production relations, constraints, indexes, nullability and triggers are authoritative. If historical repository migrations disagree with an already collected production result, the production catalog wins; historical DDL may explain provenance but may not manufacture a reset dependency.

**Decision: NO-GO. Recommended option: A, pending a real PostgreSQL execution of the final closed strategy.**

Migration 0005 failed because it treated a nullable foreign-key detachment as intrinsically safe. It changed every target recovery snapshot into an apparent original before deletion. `one_original_snapshot_per_outbound` immediately enforces uniqueness of `outbound_message_id` for rows where `recovery_of_snapshot_id is null`; an original and its recovery intentionally share that outbound ID. The preparatory `UPDATE` therefore creates a forbidden intermediate state and raises `23505`. Trigger disabling and `SET CONSTRAINTS ALL DEFERRED` cannot defer an independent partial unique index. This is proved by `202609100003_legacy_ai_exhaustion_human_review_rehabilitation.sql:8-17` and `202609110005_fix_reset_snapshot_pending_cycle.sql:96-133`, and is fully reconstructed in AP-16-06-06D-23C.

Four historical repository relations are explicitly outside the production graph: live PostgreSQL inspection proved that `public.conversation_cycle_events`, `public.customer_answer_claim_evidence`, `public.customer_answer_knowledge_claims`, and `public.customer_answer_knowledge_transitions` do not exist in production. They are neither reset targets nor blockers. In particular, their historical DDL and triggers must not be added back to a production reset. This corrects the prior audit's authority inversion.

The right atomic design has three justified preparatory business-row updates: detach retained webhook receipt message references, detach the nullable command side of the transport staging cycle, and detach the nullable `project_knowledge_state_transitions` edges needed to linearize the real production Knowledge cycle. Snapshot, pending, message, claim, and observation lineage should remain intact and be removed through complete set-based deletes. PostgreSQL is expected to permit a self-referencing set to disappear in one `DELETE` statement because immediate constraints are checked at statement completion; however, no runnable PostgreSQL/Supabase tool exists in this environment and the exact graph has not been executed here. That behavior is therefore a required integration-test assertion, not acceptance evidence.

# 2. Complete mutation-surface inventory

This inventory was derived afresh from the complete effective function in `supabase/migrations/202609110005_fix_reset_snapshot_pending_cycle.sql`, not copied from an earlier audit.

## Scope reads

| Role | Tables read by 0005 |
|---|---|
| Target resolution/locking and exact-target checks | `conversation_transport_identities`; `conversations`; `conversation_transport_bindings`; `projects`; `conversation_messages`; `transport_message_bindings`; `conversation_project_assignments` |
| Dry-run counts | `customers`; `conversation_pending_interactions`; `conversation_interaction_snapshots`; `conversation_runtime_states`; `conversation_cycle_commands`; `customer_answer_ai_inference_results`; `customer_answer_execution_contexts`; `project_evidence`; `project_media`; `project_knowledge_claims`; `transport_webhook_receipts`, plus the four temporary scope tables |
| Subquery reads used by mutations | `transport_delivery_commands`, plus the four temporary scope tables |

The temporary scope tables are `reset_conversations`, `reset_projects`, `reset_messages`, and `reset_transport_bindings`. They are transaction-local planning objects, not durable domain tables.

## Durable tables mutated

0005 updates 5 tables and deletes from 48 tables:

* **UPDATE:** `conversation_pending_interactions`, `conversation_interaction_snapshots`, `transport_media_ingestion_commands`, `transport_webhook_receipts`, `project_knowledge_state_transitions` (five statements across five tables; the first pending statement changes two columns and the transition statement changes two columns).
* **DELETE — conversation/runtime:** `customer_answer_execution_contexts`, `customer_answer_ai_inference_results`, `conversation_runtime_states`, `conversation_cycle_commands`, `conversation_interaction_snapshots`, `conversation_pending_interactions`, `conversation_information_collection`, `conversation_retry_states`, `conversation_effort_states`, `conversation_evidence_request_states`, `conversation_runtime_commands`.
* **DELETE — transport/message:** `transport_media_staging_assets`, `transport_message_attachments`, `transport_media_ingestion_commands`, `transport_send_attempts`, `transport_delivery_events`, `transport_delivery_commands`, `transport_message_bindings`, `conversation_message_text`, `conversation_message_references`, `conversation_messages`, `conversation_transport_bindings`, `conversation_transport_identities`.
* **DELETE — conversation/project/customer:** `conversation_project_assignments`, `conversation_state_commands`, `conversations`, `customers`.
* **DELETE — project knowledge/evidence/media:** `project_knowledge_claim_retractions`, `project_media_dependencies`, `project_knowledge_claim_evidence`, `project_knowledge_corrections`, `project_knowledge_claims`, `project_knowledge_state_transitions`, `project_knowledge_states`, `evidence_claim_reviews`, `evidence_claim_proposals`, `evidence_observations`, `evidence_interpretation_runs`, `project_evidence_tombstones`, `project_media_deletion_attempts`, `project_media_cleanup_items`, `project_media_lifecycle`, `project_media_dependency_projection_state`, `project_execution_commands`, `project_offer_commands`, `project_evidence`, `project_media`, `project_executions`, `project_offers`, `project_notes`, `projects`.

`transport_webhook_receipts` is deliberately updated, never deleted: its provider replay key survives as a deduplication tombstone.

## Trigger state mutations

0005 disables and later enables exactly these 16 named triggers:

1. `customer_answer_execution_contexts_immutable`
2. `cycle_command_history_guard`
3. `runtime_header_guard`
4. `planner_snapshot_immutable`
5. `pending_interaction_guard`
6. `runtime_commands_append_only`
7. `transport_delivery_events_append_only`
8. `conversation_message_text_append_only`
9. `conversation_message_references_append_only`
10. `conversation_messages_append_only`
11. `conversation_assignments_append_only`
12. `conversation_state_commands_append_only`
13. `project_knowledge_claim_evidence_append_only`
14. `project_knowledge_claims_append_only`
15. `project_knowledge_transitions_append_only`
16. `evidence_claim_reviews_append_only`

The executed functions are, respectively: `reject_customer_answer_execution_context_mutation`, `guard_cycle_command_history`, `guard_runtime_identity`, `reject_planner_snapshot_change`, `guard_runtime_identity`, `reject_append_only_change` (six named triggers use this shared function), and `prevent_knowledge_append_only_mutation` (the final four knowledge/review triggers use this function). These are all `BEFORE UPDATE OR DELETE` guards. Separate enabled update triggers remain relevant to preparatory updates: `pending_message_binding -> guard_runtime_message_binding`, `transport_media_ingestion_updated -> set_updated_at`, and no trigger is defined on `transport_webhook_receipts` (`202608230005_persistent_conversation_runtime.sql:80-103`; `202608240003_whatsapp_media_safe_staging.sql:64-66`).

# 3. Constraint/index/trigger matrix

Legend: relationship columns are nullable unless marked **NN**; all confirmed production-domain FKs are immediate, non-deferrable `ON DELETE RESTRICT` unless explicitly stated otherwise. Primary keys and ordinary non-unique lookup indexes cannot make these deletes fail and are omitted. Checks/unique keys are listed when an update touches their columns or where they encode a material invariant. `auth.users` outbound references survive because actor/user rows are not deleted. Repository DDL is used only where it is consistent with the supplied production catalog.

| Table/group | Outbound FK and nullability | Material inbound FK | Unique/check/index invariant | DELETE/UPDATE trigger |
|---|---|---|---|---|
| `customers` | `created_by` **NN** -> `auth.users` (default NO ACTION) | `projects.customer_id` **NN**; nullable `conversations.customer_id`; nullable `conversation_transport_identities.customer_id`, all RESTRICT | PK; active partial index only | `customers_updated -> set_updated_at` on UPDATE |
| `projects` | `customer_id` **NN** -> customer (default NO ACTION); `created_by` **NN** -> user | Every project-scoped runtime, conversation assignment/current project, snapshot, evidence/media/knowledge, offer/execution, customer-answer table listed below uses RESTRICT | PK; active partial indexes; status checks | `projects_updated`; reviewer/status and execution close guards fire only UPDATE |
| `conversations` | nullable customer/project -> parents RESTRICT; `created_by` **NN** -> user | All conversation runtime/message/transport/cycle/customer-answer/context tables use RESTRICT | unique `(created_by,creation_command_key)`; revision/key checks | `conversations_updated`, `conversation_state_guard`, UPDATE only |
| `conversation_messages` | conversation **NN** RESTRICT; nullable self `reply_to_message_id` RESTRICT | text/reference; pending answer/prompt; evidence resolved message; cycle source/prompt; snapshot outbound (deferred FK); delivery/media; bindings/receipt; execution context, all RESTRICT | `(conversation,sequence)`, `(conversation,idempotency)`; direction/content/self checks | append-only BEFORE UPDATE/DELETE |
| `conversation_message_text`; `conversation_message_references` | message **NN** RESTRICT | none | PK; body length | append-only BEFORE UPDATE/DELETE |
| `conversation_project_assignments`; `conversation_state_commands` | conversation/project/user **NN** RESTRICT as applicable | none | per-conversation revision/idempotency; action/key checks | append-only BEFORE UPDATE/DELETE |
| `conversation_runtime_states` | conversation PK and project **NN** RESTRICT; nullable active pending/evidence RESTRICT, **DEFERRABLE INITIALLY DEFERRED** | none | runtime/revision/knowledge checks | updated-at plus `runtime_header_guard` BEFORE UPDATE/DELETE |
| `conversation_pending_interactions` | conversation/project **NN**, answer/prompt nullable -> message; snapshot nullable -> snapshot **DEFERRABLE INITIALLY DEFERRED**; nullable self recovery RESTRICT non-deferrable | snapshot.pending **NN** deferred; cycle pending; AI inference pending; execution-context original pending, all RESTRICT | partial unique pending per conversation; partial unique snapshot; partial unique recovery original; action/status/answer checks | `pending_interaction_guard` BEFORE UPDATE/DELETE; `pending_message_binding` BEFORE INSERT/UPDATE |
| `conversation_interaction_snapshots` | conversation/project **NN**; pending **NN** and outbound **NN**, both RESTRICT **DEFERRABLE INITIALLY DEFERRED**; nullable self recovery RESTRICT non-deferrable | pending.snapshot deferred; execution-context original snapshot RESTRICT | `pending_interaction_id` unique; partial unique original outbound; partial unique recovery original; positive/version/JSON/size checks | immutable BEFORE UPDATE/DELETE |
| information/retry/effort/evidence-request states | conversation/project **NN** RESTRICT; evidence request has nullable message RESTRICT | runtime active evidence deferred | per-key uniqueness/positive/status checks, active-evidence partial unique | evidence request has updated-at and binding UPDATE triggers; others none material to DELETE |
| `conversation_runtime_commands` | conversation **NN** RESTRICT | none | `(conversation,idempotency)` and command checks | append-only BEFORE UPDATE/DELETE |
| `conversation_cycle_commands` | conversation/source message **NN**; project/prompt/pending are nullable in effective production DDL, all RESTRICT | inference results and execution contexts, both RESTRICT | customer-answer/source and processing/conversation partial uniques; attempt/status checks | history guard BEFORE UPDATE/DELETE |
| `customer_answer_ai_inference_results` | command PK; source message, conversation, project, pending **NN**, all RESTRICT | none | attempt/result and JSON checks | immutable behavior is not defined by a table trigger in its create migration |
| `customer_answer_execution_contexts` | command PK; conversation/project/source/prompt/pending/snapshot all **NN** RESTRICT | none | source unique; `(pending,source)` unique; positive/JSON/authority checks | immutable BEFORE UPDATE/DELETE |
| `conversation_transport_identities` | nullable customer RESTRICT | conversation bindings, message bindings, delivery commands, ingestion commands all **NN** RESTRICT | unique provider/scope/external identity; one active identity partial unique; length/status checks | updated-at UPDATE trigger |
| `conversation_transport_bindings` | conversation/identity **NN** RESTRICT | delivery commands **NN** RESTRICT | one active binding per identity partial unique; revision/status shape | none |
| `transport_message_bindings` | message/identity **NN** RESTRICT | attachments/ingestion **NN**; delivery command/event nullable references, RESTRICT | message unique; provider replay triple unique; length checks | none |
| `transport_webhook_receipts` | nullable `internal_message_id` RESTRICT | none | provider/scope/event unique; length checks; no index predicate references message ID | none |
| `transport_delivery_commands` | message/conversation/binding/identity **NN**; provider binding nullable, RESTRICT | send attempts **NN**; delivery events nullable, RESTRICT | `(provider,binding,message)` unique; attempt and sending/claim checks | updated-at UPDATE trigger |
| `transport_send_attempts`; `transport_delivery_events` | command **NN** / nullable; event provider binding nullable, RESTRICT | none | attempt unique; receipt-like delivery-event unique and length checks | events append-only BEFORE UPDATE/DELETE |
| `transport_message_attachments` | source message and provider binding **NN** RESTRICT | none | each FK separately unique; media/caption checks | none |
| `transport_media_ingestion_commands` | source message/binding/identity/conversation **NN**; project media nullable; staging asset nullable, RESTRICT | staging asset.ingestion command **NN** RESTRICT | source, binding, staging each unique; status/staging/completion, claim, attempt, failure checks | updated-at BEFORE UPDATE |
| `transport_media_staging_assets` | ingestion command/conversation/source message **NN** RESTRICT | command.staging asset nullable RESTRICT | ingestion/source/storage path unique; storage-state timestamp/size/type checks | none |
| `project_media` | project **NN** RESTRICT; uploader user **NN** | evidence/lifecycle/dependencies/cleanup/deletion/tombstone and nullable ingestion command all RESTRICT | `(project,id)` unique; active object/storage uniqueness and lifecycle checks | updated-at plus protected-field/delete-safety guards; physical delete guard requires inspection in integration schema |
| media lifecycle/cleanup/deletion/tombstone/projection | project/media/evidence/attempt **NN** RESTRICT as applicable | dependency rows point to lifecycle-related authorities only indirectly | active deletion partial unique; claim-token and media keys unique; extensive state-shape checks | updated-at and lifecycle/deletion guards are UPDATE-only in repository DDL |
| evidence runs/observations/proposals/reviews | composite project/evidence/run/observation/proposal **NN** RESTRICT; observation has nullable self supersession; review actor user | corrections and knowledge transitions refer inward | semantic/active partial uniques and lifecycle checks | reviews append-only; other update triggers set updated_at |
| `project_knowledge_states` | project **NN** unique RESTRICT | transitions and claims composite RESTRICT | project unique; positive version/schema checks | updated-at UPDATE trigger |
| `project_knowledge_state_transitions` | state/proposal/review; actor; nullable correction and target claim, all RESTRICT | claims.source transition and retractions.transition RESTRICT | proposal and idempotency unique; transition type/result/version checks do not reference correction/target-claim columns | append-only BEFORE UPDATE/DELETE |
| `project_knowledge_claims` | state/source transition **NN**; nullable self supersession RESTRICT | claim evidence, corrections, transitions, retractions, media dependencies RESTRICT | claim composite identities; active semantic and successor partial uniques; typed-value/self checks | append-only BEFORE UPDATE/DELETE |
| claim evidence/retractions/corrections | multi-parent project/claim/evidence/transition/replacement references RESTRICT | media dependencies may refer to corrections | uniqueness and strict correction target-shape checks | claim evidence append-only; corrections updated-at; no production retraction guard was supplied or used by 0005 |
| offers/executions and commands | project **NN**; execution offer composite; commands respective parent, all RESTRICT | media dependencies reference offer/execution | one-open/one-active partial uniques; state/idempotency checks | lifecycle/update guards; command tables are not append-only guarded in their create DDL |
| `project_notes` | project **NN** **ON DELETE CASCADE**; creator user **NN** | none | active partial index only | protected-fields UPDATE guard; updated-at |

## Production authority boundary

The supplied live-catalog results establish that the four historical relations named in section 1 are absent. Consequently they have no production FKs, indexes, checks, or triggers to add to this matrix. The production Knowledge authority on this reset surface is exclusively the `project_knowledge_*` graph listed above. Their appearance in old repository migrations is not evidence of a live dependency.

# 4. Current 0005 mutation safety matrix

“Safe” means safe against the supplied production catalog plus consistent repository-visible invariants, provided the stated prerequisite target sets are complete. “Unproven” means real PostgreSQL execution is still required or an effective production invariant has not been exercised.

| Current exact mutation/purpose | Relationship/invariant and prerequisite | Intermediate evaluation | Verdict and DDL proof |
|---|---|---|---|
| DELETE execution contexts | Removes deepest references to command/message/pending/snapshot | Guard disabled; no child known | **SAFE**, `202609100007:4-41` |
| DELETE AI inference results | Removes command/message/pending references | no intermediate update | **SAFE**, `202609100002:9-28` |
| DELETE runtime states | Removes deferred active pending/evidence refs | guard disabled; target runtime set complete | **SAFE**, `202608230005:6-17,77-84` |
| DELETE cycle commands | Removes pending/message/project refs | execution contexts and AI inference results are deleted first | **SAFE**, subject to the final production integration fixture |
| UPDATE pending SET `snapshot_id=NULL,recovery_of_pending_interaction_id=NULL` | Breaks deferred cross-cycle and non-deferred self lineage | removes rows from both partial unique indexes; nullable; pending binding trigger still evaluates message binding, guard disabled | **SAFE but unnecessary** in repository DDL; real fixture still required, `202609010001:22-30`; `202609100003:2-6` |
| UPDATE snapshots SET `recovery_of_snapshot_id=NULL` | Attempts to break self lineage | immediately inserts recovery rows into `one_original_snapshot_per_outbound`; immutable guard disabled but index active | **UNSAFE (known 23505)**, `202609100003:8-17` |
| DELETE snapshots | Removes deferred pending/message and non-deferred self graph | needs contexts gone and complete same-table target; snapshot guard disabled | **UNPROVEN** until same-statement self-FK fixture passes |
| DELETE pending | Removes self graph and parent rows for snapshot/cycle/AI/context | prior rows gone/deferred; guard disabled | **UNPROVEN** until same-statement self-FK fixture passes |
| DELETE information/retry/effort/evidence-request | Removes conversation/project/message runtime leaves | runtime state gone before evidence request | **SAFE**, `202608230005:36-68,77-78` |
| DELETE runtime commands | Conversation leaf | append-only trigger disabled | **SAFE**, `202608230005:70-85` |
| UPDATE ingestion command to failed, null staging/completion, default failure/retry | Breaks command/asset RESTRICT cycle | updated-at fires; unique staging entry removed; `status='staged'` equivalence remains true on both false sides; allowed failure code | **SAFE** for the exact assignment, `202608240003:20-45,64-66` |
| DELETE staging assets | Removes asset side of cycle and message/conversation refs | requires command staging FK detached | **SAFE**, same proof |
| DELETE transport attachments | Removes message/binding refs | none | **SAFE**, `202608240003:8-16` |
| DELETE ingestion commands | Removes message/binding/identity/conversation refs | staging assets gone | **SAFE**, `202608240003:20-65` |
| DELETE send attempts | Removes command refs | none | **SAFE**, `202608240002:23-27` |
| DELETE delivery events | Removes command/binding refs | append-only guard disabled | **SAFE**, `202608240002:29-37` |
| DELETE delivery commands | Removes transport/message refs | attempts/events gone | **SAFE**, `202608240002:8-22` |
| UPDATE webhook receipts SET `internal_message_id=NULL` | Preserves receipt replay tuple, detaches message | nullable; unique key/checks exclude message; no trigger | **SAFE**, `202608230007:39-50` |
| DELETE message bindings | Removes message/identity refs | delivery/media references already gone | **SAFE**, `202608230007:52-63` |
| DELETE message text/references | Removes message children | guards disabled | **SAFE**, `202608230004:44-54,65-72` |
| DELETE messages in one statement | Removes nullable self replies | all confirmed external inbound rows are deleted/detached first; self-FK same-statement behavior not run here | **UNPROVEN**, `202608230004:33-50` |
| DELETE assignments/state commands | Removes conversation/project leaves | guards disabled | **SAFE**, `202608230004:18-31,65-72` |
| DELETE conversation transport bindings | Removes conversation/identity refs | delivery commands gone | **SAFE**, `202608230007:25-37` |
| DELETE conversations | Parent removal | all confirmed production conversation children precede it | **SAFE**, subject to complete target scope |
| DELETE claim retractions | Removes correction/claim/transition leaf references before the Knowledge cycle is cut | no production DELETE guard is present in 0005's confirmed trigger surface | **SAFE**, subject to the final integration fixture, `202608210008:51-59` |
| DELETE media dependencies | Removes media/evidence/offer/execution/correction refs | complete project set required | **SAFE**, `202608210007:21-45` plus later typed sources |
| DELETE knowledge claim evidence | Removes claim/evidence refs | append-only disabled | **SAFE**, `202608210006:58-79` |
| UPDATE transitions SET `correction_id=NULL,target_claim_id=NULL` | Breaks `knowledge_transition_correction_fkey` and `knowledge_transition_target_claim_fkey` | both columns are nullable; the transition checks constrain transition type/result/version, not the nullness of these two edges; unique indexes do not use either column; append-only guard is disabled | **SAFE by the supplied production graph and consistent DDL; integration test still required**, `202608210008:11-49` |
| DELETE corrections | Removes multi-parent correction rows | transitions currently detached; dependencies gone | **SAFE after complete child deletion**, `202608210008:16-49` |
| DELETE claims in one statement | Removes self-supersession and transition/state refs | claim evidence/retractions/dependencies gone; transition target refs detached; corrections that target/replacement-reference claims deleted first | **UNPROVEN only for same-statement claim self-FK behavior** |
| DELETE transitions | Removes state/proposal/review/correction refs | claims/retractions gone; guard disabled | **SAFE after closed children**, `202608210006:16-28`; `202608210008:47-58` |
| DELETE knowledge states | Removes project parent | transitions/claims/snapshots/runtime gone | **SAFE**, `202608210006:3-12` |
| DELETE reviews/proposals/observations/runs | Evidence chain leaf-to-root | correction/transition refs already gone; observation self-set complete | **UNPROVEN** solely for same-statement observation self-FK; otherwise ordered correctly, `202608210004:4-47`; `202608210005:4-42` |
| DELETE evidence tombstones, deletion attempts, cleanup, lifecycle, projection | Clears media/evidence/project blockers | listed multi-parent predecessors complete | **SAFE** under repository DDL, `202607290003:5-38`; `202608210002:2-30`; `202608210003:56-99`; `202608210007:6-19` |
| DELETE execution/offer commands | Removes execution/offer children | dependencies already gone | **SAFE**, `202608230001:32-45`; `202608230002:31-45` |
| DELETE project evidence then media | Removes RESTRICT graph | all confirmed production knowledge/evidence/media dependents gone | **SAFE** |
| DELETE executions then offers | Offer/execution hierarchy | dependencies/commands gone; executions precede offers | **SAFE**, `202608230001:4-45`; `202608230002:6-45` |
| DELETE project notes | CASCADE-capable child explicitly removed | guards are UPDATE-only | **SAFE**, `202607210001:8`; `202607220001:99` |
| DELETE projects | Project parent | all confirmed production project children precede it | **SAFE**, subject to complete target scope |
| DELETE transport identity | Identity parent | all known bindings/commands gone | **SAFE** if selected identity is the only target-owned identity, `202608230007:9-63` |
| DELETE customer | Ultimate target | project/conversation/identity rows must be gone; exact shared-identity validation applies | **SAFE**, subject to the complete transaction passing |

# 5. Proposed closed atomic delete algorithm

This is a design, not migration SQL. Every phase occurs in one transaction after the existing service-role, confirmation, provider, exact identity, customer-sharing, conversation-ownership, and assignment/project-ownership validations. Acquire the target identity row lock, materialize immutable target-ID sets, and defer all deferrable constraints. Do not alter lineage/business state merely to make later deletes easier.

1. **Build and validate a closed scope.** Materialize customer, identity, conversations, projects, messages, transport bindings, cycle commands, snapshots, pending rows, evidence, claims, and all other production parent IDs. Preserve 0005's exact identity-row lock and reject any inbound row whose project/conversation/customer ownership is outside the target sets.
2. **Dry run boundary.** Count every production table in the closed graph and retained receipts. Return before any trigger DDL or durable mutation. A dry run must not execute `SET CONSTRAINTS`, disable triggers, or update rows.
3. **Disable only the 16 confirmed deletion guards already named by 0005.** Updated-at and validation triggers need not be disabled when their table is only deleted. Trigger state changes are transactional; any error rolls them back. No replacement invariant is required because exact closed scope and one transaction make the administrative delete all-or-nothing.
4. **Delete deep AI/runtime consumers.** Delete execution contexts and AI inference results, then runtime states and cycle commands. This removes every confirmed production inbound reference to snapshot/pending/message nodes. Delete information, retry, effort, evidence-request, and runtime-command rows in child-safe order.
5. **Delete snapshot/pending graph without updates.** With all external consumers gone and the two cross-table FKs deferred, issue one complete-set snapshot delete and one complete-set pending delete while preserving both recovery lineage columns and snapshot.pending. The statement order may be snapshots then pending, with deferred pending.snapshot temporarily pointing at deleted snapshots; final validation sees neither set. The reverse deferred edge likewise resolves by transaction end. Both self-reference sets must be complete.
6. **Detach and delete transport staging.** Perform the audited ingestion-command update from section 7. Delete staging assets, attachments, ingestion commands, send attempts, delivery events, and delivery commands; their current append-only event guard is disabled.
7. **Preserve receipt tombstones.** Set `transport_webhook_receipts.internal_message_id` to null only for target messages. Do not change provider, sender scope, event identity, status, timestamps, or failure data. Delete message bindings only after every delivery/media reference is gone.
8. **Delete message graph.** Delete text and reference payload rows, then delete the complete message set in one statement so all target-local reply self-references disappear together. This occurs only after cycle, runtime, transport, receipt, and snapshot references are gone.
9. **Delete conversation leaves and conversations.** Delete assignments, state commands, transport bindings, then conversations. All confirmed production inbound references are now gone.
10. **Linearize and delete the real production Knowledge graph.** First delete `project_knowledge_claim_retractions`, which reference corrections, claims, and transitions. Delete media dependencies and claim evidence. Then update target `project_knowledge_state_transitions` to set nullable `correction_id` and `target_claim_id` to null, breaking exactly `knowledge_transition_correction_fkey` and `knowledge_transition_target_claim_fkey`. This leaves no changed-column unique/index predicate or CHECK invariant. Delete corrections next, removing their `target_claim_id` and `replacement_claim_id` references to claims. Delete all target claims in one set-based statement, preserving `supersedes_claim_id` until deletion; this also removes `knowledge_claim_transition_fkey` references to transitions. Delete transitions, then knowledge states. The original production cycles are thus explicitly cut on the nullable transition edges rather than by modifying claim lineage.
11. **Delete the remaining project graph.** Delete reviews, proposals, complete-set observations, interpretation runs, media tombstones/attempts/cleanup/lifecycle/projection, execution/offer commands, evidence, media, executions, offers, notes, and finally projects in the verified order.
12. **Delete identity and customer parents.** Delete the exact identity, then the exact customer. Retained receipts have no remaining product FK.
13. **Re-enable every disabled trigger before return.** Transaction rollback protects trigger state on exceptions. Assert zero remaining rows for every disposable target table and assert receipt rows still exist with null internal message ID.

Rows intentionally surviving: webhook receipt tombstones and their provider deduplication tuple; `auth.users`/system actors; audit entries already present (they carry no declared domain FK in the initial schema); storage objects are outside the SQL graph and need an explicit operational policy if physical test media exists. No non-target domain row may be updated or deleted.

# 6. Snapshot/pending solution specifically

The closed snapshot/pending subgraph is:

* `pending.snapshot_id -> snapshot.id`, nullable, RESTRICT, DEFERRABLE INITIALLY DEFERRED.
* `snapshot.pending_interaction_id -> pending.id`, **NOT NULL**, unique, RESTRICT, DEFERRABLE INITIALLY DEFERRED.
* `snapshot.recovery_of_snapshot_id -> snapshot.id`, nullable, RESTRICT, immediate/non-deferrable.
* `pending.recovery_of_pending_interaction_id -> pending.id`, nullable, RESTRICT, immediate/non-deferrable.
* Snapshot outbound message is **NOT NULL**, RESTRICT, DEFERRABLE INITIALLY DEFERRED.

The proposed solution is to delete the complete snapshot set in one statement and the complete pending set in one statement without changing `snapshot.recovery_of_snapshot_id`, `snapshot.pending_interaction_id`, `pending.snapshot_id`, or `pending.recovery_of_pending_interaction_id`. Before those statements, delete execution contexts, inference results, runtime headers, and cycle commands, which are the external inbound consumers. Defer the cross-table constraints. After both statements, the deferred graph has no surviving endpoint.

For the immediate self-FKs, PostgreSQL statement semantics are expected to accept deletion of referencing and referenced siblings in a single set-based statement: there is no surviving row at statement completion. The repository already relies on this idea for message replies and claim supersession, but its tests are static and are not proof (`202609110005:154-156,173-174`). No local `psql`, Supabase CLI, or Docker executable was found, and web documentation lookup was unavailable in this environment. Accordingly:

* **Proved from repository DDL:** exact FK direction, nullability, deferrability, unique indexes, trigger guards, and the 23505 path.
* **Not yet acceptance-proved:** actual execution of both immediate recovery self-FKs plus the deferred two-table cycle with original/recovery rows in the same transaction.

The integration test in section 8 must prove this before implementation approval. If same-statement self-delete unexpectedly fails, nulling the recovery columns remains unacceptable; the schema would need a deliberately deferrable/cascade administrative boundary instead.

# 7. Audit of every remaining preparatory UPDATE

The redesigned plan rejects the two snapshot/pending detachments and retains the three production-graph detachments that can be shown not to violate an intermediate invariant.

| UPDATE | Nullability/index/check/trigger audit | Decision |
|---|---|---|
| Pending `snapshot_id=NULL, recovery_of_pending_interaction_id=NULL` | Both nullable. Nulling removes rows from `one_pending_per_planner_snapshot` and `one_recovery_pending_per_original`, so it cannot create duplicates. `pending_message_binding` still runs but reads/validates only `answered_by_message_id`; identity guard is disabled. Nevertheless it destroys lineage and is unnecessary if complete-set deletes work. | **Remove from design.** |
| Snapshot `recovery_of_snapshot_id=NULL` | Nullable FK, but predicate column of `one_original_snapshot_per_outbound`; changes a recovery into a second indexed original while original survives. Immutable trigger disabling does not disable index maintenance. | **Remove; categorically unsafe.** |
| Ingestion command: `status='failed', staging_asset_id=NULL, completed_at=NULL`, fill failure/retry defaults | Columns permit these values. `configuration_error` is an allowed failure code; `terminal` is an allowed enum value; removing staging ID cannot violate its unique constraint. The check `(status='staged')=(staging_asset_id is not null and completed_at is not null)` becomes `false=false`; claim equivalence is untouched. `set_updated_at` is the only trigger and its timestamp side effect is harmless immediately before delete. Scope must include all commands referencing target staging assets, not merely conversation IDs. | **Retain, after integration fixture.** This is the nullable side of a non-deferrable cross-table RESTRICT cycle. |
| Receipt `internal_message_id=NULL` | Nullable FK; unique key is `(provider,sender_scope,provider_event_identity)` and all checks concern string lengths/status, not message ID. No table trigger. The update removes, rather than adds, an FK/index relationship and leaves replay identity intact. | **Retain.** This is required because receipts intentionally survive. |
| Knowledge transition `correction_id=NULL,target_claim_id=NULL` | Production confirms both nullable RESTRICT edges: `knowledge_transition_correction_fkey` to corrections and `knowledge_transition_target_claim_fkey` to claims. Neither column participates in a production unique key, partial-index predicate, NOT NULL condition, or transition CHECK. The append-only transition guard is disabled. The update breaks the outward transition edges; retractions are deleted first, corrections then delete their own claim edges, claims delete their `knowledge_claim_transition_fkey` edges, and transitions can finally be deleted. | **Retain, subject to the complete real-PostgreSQL fixture.** |

No other durable UPDATE appears in 0005. Trigger `ALTER TABLE` operations are catalog-state mutations, separately covered in sections 2 and 5.

# 8. Real PostgreSQL integration-test plan

## Environment finding

The repository has Vitest scripts but no database integration script in `package.json`. In this container, `command -v psql`, `command -v supabase`, and `command -v docker` returned no executable. Therefore this audit could not run PostgreSQL or Supabase locally. Regex/order tests are expressly not acceptance evidence.

## Required harness

Before any reset migration is approved, CI or a developer environment must provision a disposable real PostgreSQL/Supabase database whose catalog faithfully reproduces the authoritative production catalog; blindly applying historical repository migrations is insufficient where they are known to diverge. Query `pg_constraint`, `pg_index`, `pg_trigger`, and `pg_proc` to snapshot that effective catalog. The catalog assertion must fail when a production inbound FK to a reset parent is absent from the declared reset graph. Run the RPC under the actual service-role JWT/database role and in a separate transaction per test.

## Required fixture

Create all required `auth.users`/system actor, customer, project, conversation, identity/binding, inbound answer and outbound prompt messages, payload rows, provider message binding, webhook receipt, runtime state, evidence request as applicable, cycle command, inference result, and execution context. Create:

* original pending interaction and original snapshot;
* recovery pending interaction whose `recovery_of_pending_interaction_id` points to the original;
* recovery snapshot whose `recovery_of_snapshot_id` points to the original;
* original and recovery snapshots with the same `outbound_message_id`;
* both pending.snapshot and snapshot.pending links, with deferred constraints used during fixture creation;
* message reply self-reference, observation/claim supersession self-reference, transport delivery/media rows, the command/staging-asset cycle, and the production project-Knowledge cycle with:
  * `project_knowledge_claims.source_transition_id -> project_knowledge_state_transitions.id`;
  * `project_knowledge_state_transitions.correction_id -> project_knowledge_corrections.correction_id`;
  * `(project_knowledge_state_transitions.project_id,target_claim_id) -> (project_knowledge_claims.project_id,claim_id)`;
  * correction `target_claim_id` and `replacement_claim_id` -> claims where applicable; and
  * retraction `correction_id`, `(project_id,claim_id)`, and `transition_id` -> correction, claim, and transition.

Also create a control customer graph with deliberately similar IDs/metadata but no ownership relation to prove isolation.

## Assertions

1. Capture table counts and hashes/selected immutable columns; call `dry_run=true`; assert success and byte-for-byte no durable mutation, including trigger enabled state.
2. Call the proposed committed reset in a transaction and commit. Any exception fails the test; explicitly report SQLSTATE, thereby proving no `23503` or `23505` occurred.
3. Assert zero target `customers`, `projects`, `conversations`, messages, all runtime rows, cycle commands, answer contexts/inference results, snapshots, pending rows, transport disposable rows, project evidence/media/knowledge, offers/executions, and identity/binding rows.
4. Assert the control customer graph is unchanged.
5. Assert target webhook receipts survive with the exact provider/sender/event unique tuple and `internal_message_id IS NULL`.
6. Assert every disabled trigger is enabled after success. Force a mid-reset failure in a separate negative test and assert rollback also restores trigger state and all rows.
7. Replay the same provider event and prove deduplication uses the surviving receipt rather than creating a new message.
8. Create a second fresh customer lifecycle for the same WhatsApp external identity/sender scope, ingest a new message, create project/conversation/runtime/pending/snapshot, and run at least one outbound/answer cycle. This proves identity uniqueness and stale product FKs do not prevent reuse.
9. Run the reset twice where the second call has a newly created, freshly resolved identity; separately assert a repeated call against the already deleted old identity returns the specified not-found error without mutation.

Static Vitest tests may check function text, scope completeness declarations, forbidden lineage updates, and receipt preservation, but they supplement rather than replace this suite.

# 9. Option A vs B vs C comparison

| Option | Probability of working | MVP effort | Maintenance | Repeat fresh WhatsApp customer | Non-test data risk |
|---|---|---|---|---|---|
| **A. Correct targeted RPC** | High if the production-derived graph and exact recovery/Knowledge fixtures pass | Lowest incremental effort; the known cycles have explicit candidate cuts/order | High: every production FK/trigger/index change requires graph review | Good; retains provider tombstones and permits identity recreation | Medium-low with exact locks/ownership validation; hand-written omissions remain the general maintenance risk |
| **B. Test-data ownership/root cascade boundary** | High after one careful schema conversion; simpler repeated deletion thereafter | Medium/high because existing tables, lineage, retention exceptions, and backfill must change | Low/medium: new disposable tables attach to one root; receipts remain outside | Excellent | Lowest for surgical production-like reset if ownership is mandatory and cascades are database-owned |
| **C. Recreate dedicated test tenant/environment** | Highest when test traffic is fully isolated | Operationally medium; may be lowest if environment recreation already exists, but it does not exist in this repository | Low database-graph maintenance; higher environment/secret/endpoint operations | Excellent in a truly dedicated sender/environment | Lowest, but only if physically/administratively isolated; unsuitable for one test customer in a shared production-like environment |

# 10. Recommended path

Choose **Option A for the MVP**, conditionally. It remains less work than retrofitting a root discriminator/cascade architecture or provisioning a dedicated environment, and exact-target plus service-role validation already exists. The production Knowledge SCC now has an explicit candidate cut and delete order, and the four absent historical relations impose no work. Do not implement 0006 until the complete proposed strategy—including snapshot/pending set deletes, self-reference set deletes, all three retained detachments, tombstone retention, and a fresh lifecycle—passes the real PostgreSQL fixture.

If the same reset will be maintained across several more schema increments, reconsider **B**: a mandatory test-data root with database-owned cascades and receipts outside that root may become materially simpler than continually extending a giant function. Choose **C** only when the WhatsApp sender and whole database environment can genuinely be dedicated and recreated; it is operational isolation, not a fix for shared-environment deletion.

# 11. Exact remaining unknowns, if any

1. **Real execution of set-based self-deletes.** Expected PostgreSQL behavior for snapshot recovery, pending recovery, message reply, claim supersession, and observation supersession has not been exercised against the exact production-shaped fixture.
2. **Real execution of the deferred snapshot/pending cycle.** The two deferred cross-table deletes plus immediate recovery self-FKs must succeed together at commit without `23503` or `23505`.
3. **Real execution of the production Knowledge cut.** The confirmed cycle edges are: claim `source_transition_id -> transition.id`; transition `correction_id -> correction.correction_id`; transition `(project_id,target_claim_id) -> claim(project_id,claim_id)`; correction target/replacement claim edges -> claims; and retraction edges -> correction/claim/transition. The candidate update/order is closed on paper, but must prove that the transition detachment passes every live CHECK/index/trigger and that the subsequent deletes pass.
4. **Effective constraint/index/trigger execution.** The complete fixture must prove every preparatory update and delete against the live-equivalent catalog, and prove every required guard is restored after both success and rollback.
5. **Local execution availability.** No local PostgreSQL, Supabase CLI, or Docker command is installed in this environment, so none of the execution unknowns above was replaced by an actual engine test.

# 12. GO / NO-GO for implementing migration 0006

## **NO-GO**

The corrected production-derived plan has no legacy-table coverage blocker. It identifies the unsafe snapshot update, preserves snapshot/pending lineage, explicitly cuts the real Knowledge cycle on nullable transition edges, and preserves receipt tombstones. Nevertheless one acceptance blocker remains: **the complete final strategy has not run on a real PostgreSQL instance against the exact production-shaped fixture.** That single integration blocker contains concrete assertions for the deferred snapshot/pending cycle, every immediate self-FK set delete, the Knowledge detachment/order, all triggers/checks/indexes, tombstone retention, isolation, rollback, and the second fresh lifecycle.

Migration 0006 may move to implementation only after the section 8 real-PostgreSQL integration test passes. Static migration tests alone cannot change this decision.
