# AP-16-06-06D-3 — Production schema reconciliation repair

## 1. Status and baseline

Implementation status: **complete**. The inspected baseline SHA was
`e27285ad44c265a54a028dc26f996aff5803d60b`. The merged 06D-2 audit and the
current migration/runtime definitions were used as the incident and architectural
baseline.

## 2. Proven incident and root cause

Production persisted an eligible inbound customer text after the active prompt,
while the matching Pending Interaction, runtime revision, project binding, and
knowledge version remained current. No command bootstrap transaction committed.
Production lacked the context, atomic-commit, and execution-lease command schema
required by `acquire_customer_message_cycle_execution`; recovery only discovered
already-created processing commands. OpenAI was not reached and provider behavior
is outside this repair.

## 3. Drift and migration

New forward-only migration:
`202609090001_production_cycle_schema_reconciliation.sql`.

It reconciles these `conversation_cycle_commands` columns:

- context/reservation: `project_id`, `prompt_message_id`, `execution_at`,
  `correlation_id`, `interpretation_id`, `transition_id`, `claim_id`,
  `customer_evidence_id`, `system_evidence_id`, `apply_id`, `assessment_id`,
  `planner_decision_id`, `event_ids`, `next_evidence_request_id`,
  `next_pending_interaction_id`, `next_snapshot_id`, `next_outbound_message_id`,
  and `event_sequence_start`;
- atomic commit: `commit_payload_hash`;
- execution recovery: `execution_owner_id`, `execution_lease_expires_at`,
  `execution_attempt_count`, and `last_execution_started_at`;
- AI attempt authority: `ai_inference_attempt_count` with the unchanged range
  0–3.

The migration also reconciles defaults, non-null counter shape, both counter check
constraints, the project/prompt foreign keys, the partial processing index, and
the latest command-history trigger function. It validates critical catalog types
and nullability and existing counter values before installing functions, so an
incompatible partial shape fails loudly rather than being hidden by `IF NOT
EXISTS`.

The latest intended definitions are installed with `CREATE OR REPLACE` for:

- `claim_customer_message_cycle`;
- `get_customer_message_cycle_context`;
- `acquire_customer_message_cycle_execution`;
- `discover_recoverable_conversation_cycles`;
- `fail_customer_message_cycle`;
- `commit_customer_message_cycle`;
- `complete_customer_message_human_review`;
- `reserve_customer_answer_ai_inference_attempt`;
- `defer_customer_message_ai_retry`;
- the directly required `guard_cycle_command_history` trigger function.

All RPC grants remain service-role-only. Historical migrations are unchanged.

## 4. Stranded-message recovery

The new service-only, bounded RPC
`discover_missing_customer_answer_cycles(integer)` is side-effect-free. It
returns only source-message identities and a discovery timestamp, deterministically
ordered by message occurrence and UUID, capped at 100. Its joins and predicates
require inbound/customer/text semantics, an open project-bound Conversation, the
matching awaiting runtime, its active pending Pending Interaction, matching
runtime and knowledge revisions, a real snapshot and prompt, prompt ordering, no
answer consumption, and no existing customer-answer command.

The existing scheduler now composes existing-command discovery and missing-command
discovery. Every returned message identity is still sent to
`runPersistentCustomerMessageCycle`, whose data source calls
`acquire_customer_message_cycle_execution`, which calls
`claim_customer_message_cycle`. Discovery never inserts a command or mutates
business state.

Concurrency remains safe because discovery is only advisory and the existing
unique source-message/idempotency constraints plus locked claim/acquisition
transaction remain authoritative. Concurrent webhook and recovery calls can see
the same message, but cannot create two commands; a state that becomes stale
after discovery fails normal claim validation. Existing-command candidates take
priority and identities are de-duplicated within the bounded batch.

The recovery JSON summary now distinguishes existing-command discovery,
missing-command discovery, and successful/failed missing-command bootstrap. It
contains no message text or provider data.

## 5. Application changes

Minimal server-only changes were required in the recovery composition and summary.
No webhook, planner, domain-cycle, AI feature gate, provider, model, prompt,
timeout, retry, pricing, or outbound-delivery behavior changed.

## 6. Tests and validation

Regression coverage verifies the complete expected column/RPC surface, strict
partial-shape checks, unchanged AI range, bounded missing-command discovery
invariants, absence of direct command fabrication, composition through the
ordinary runner, existing-command recovery, de-duplication, and operational
summary fields. Existing runner, persistent cycle, data-source, AI authority, and
WhatsApp webhook suites were retained.

Validation completed:

- `npm run typecheck`: passed.
- focused Vitest run covering reconciliation, runner, recovery handler,
  persistent data source/service, AI authority, and WhatsApp webhook: 63 tests
  passed.
- `npm run lint`: passed.
- `npm test`: 1,227/1,228 tests passed; the pre-existing OpenAI isolation assertion fails against unchanged current-main `productive-cycle-runtime.ts`.

One unrelated current-main failure was observed as noted above. The repository has no configured local
PostgreSQL/Supabase migration harness, so executable database application was not
claimed; static tests explicitly validate critical schema shape and latest RPC
installation to address deferred PL/pgSQL field-resolution risk.

## 7. Activation and forward-fix considerations

Apply the new migration to Production, then deploy the server recovery composition.
The scheduled recovery invocation should discover the existing stranded message
on its next run if the proven eligibility state is still current, and bootstrap it
through normal acquisition/claim authority. No manual command, answered Pending
Interaction, knowledge, runtime, Conversation, or outbound row should be created.

This is forward-only. Do not roll back by removing columns/functions after new
commands use them. If activation reveals an unanticipated incompatible catalog
shape, the migration fails transactionally; inspect that shape read-only and ship
a new forward fix. Application rollback alone is safe before a missing candidate
is processed, but does not remove reconciled schema.

**Production migration required: YES**

**Vercel Production deployment required: YES**

**Existing stranded message automatic recovery expected: YES**
