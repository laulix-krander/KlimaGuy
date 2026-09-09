# AP-16-06-06D-2 — Production Customer-Answer Cycle Bootstrap Failure Audit

## 1. Executive verdict

**Audit status: ROOT CAUSE NOT YET PROVEN.**

The narrowest provable failure boundary is the hand-off between successful
`ingest_whatsapp_inbound_text(...)` persistence and successful execution of
`acquire_customer_message_cycle_execution(...)`. The supplied Production facts
prove the message transaction committed, and prove that neither the command
bootstrap performed inside `claim_customer_message_cycle(...)` nor any later
cycle transition committed. They do **not** include the ingestion RPC's returned
`cycle_eligible` value, nor the runtime row from which that value was derived.
Consequently they do not prove that the webhook invoked the cycle runner.

There is nevertheless **proven, material Production schema drift**. Current
main requires 18 command-reservation/context columns introduced by
`202609010002_cycle_context_read_authority.sql`, `commit_payload_hash` introduced
by `202609020002_atomic_cycle_commit_failure_authority.sql`, and four execution
ownership/lease columns plus acquire/recovery authority introduced by
`202609020003_recoverable_conversation_cycle_runner.sql`. None of those columns
appears in the supplied exhaustive Production column inventory. Production has
only the original AP-16-03 command columns plus the manually added
`ai_inference_attempt_count`.

That drift is sufficient to prove the following conditional result: **if the
webhook received `cycle_eligible = true`, current main's very next productive
database call could not successfully complete against the observed schema.**
The runtime always calls `acquire_customer_message_cycle_execution`; that
authority is supplied by the missing `202609020003` migration and requires all
four absent execution columns. If a stale/manually installed copy of the
function exists, its call to `claim_customer_message_cycle` and its later lease
access share one database transaction, so a missing-column runtime error rolls
back the newly inserted command. If it does not exist, PostgREST rejects the RPC
before command creation. Both cases exactly explain “persisted message + pending
interaction + no command”, but repository and supplied facts do not distinguish
them and, more importantly, do not prove the route took the eligible branch.

**OPENAI REACHED: NO.** For this message, a provider call requires a successfully
acquired command and loaded authority. Zero command rows proves that neither the
normalization nor AI eligibility/reservation/provider boundaries could commit or
be reached through this code path.

**Production migration required for eventual repair: NOT YET DETERMINABLE.** A
forward-only migration will be required if the remaining read-only proof confirms
that Production should have entered the cycle branch and that the supplied schema
inventory describes the active database used by Vercel. No historical migration
must be edited or replayed blindly.

## 2. Current-main baseline

Audit start: 2026-09-09 (UTC).

| Baseline item | Recorded value |
|---|---|
| `main` HEAD | `f9d6787ddd20cca95e4019efc45ccdb93dc5381b` |
| Working HEAD at audit start | `f9d6787ddd20cca95e4019efc45ccdb93dc5381b` |
| Latest merge | `f9d6787` — merge PR #190, productive AI customer-answer classification |
| Productive AI implementation | `ef0d304` — `feat: integrate productive AI customer answer classification` |
| AI cycle authority merge | `4b282ec` — merge PR #189 |
| AI cycle authority implementation | `fe822e6` — `feat: add AI cycle completion authority` |

This audit inspected repository state directly. It did not substitute historical
audit summaries for current code.

### Exact runtime files/functions inspected

- `app/api/webhooks/whatsapp/route.ts`: route exports and runtime settings.
- `lib/server/whatsapp/webhook.ts`: `createWhatsAppWebhookHandlers`, especially
  `POST` and its recorded/duplicate and eligible/first-contact branches.
- `lib/server/whatsapp/ingestion.ts`: `persistWhatsAppInboundText`,
  `triggerPersistentMessageCycle`, and immediate delivery isolation.
- `lib/server/conversation/productive-cycle-runtime.ts`:
  `createProductiveCycleRuntime` and feature-gated interpreter wiring.
- `lib/server/conversation/recoverable-cycle-runner.ts`:
  `runPersistentCustomerMessageCycle` and
  `discoverRecoverableConversationCycles`.
- `lib/server/conversation/persistent-cycle-data-source.ts`:
  `createPersistentCycleDataSource` and `claimCustomerMessage`.
- `lib/actions/persistent-conversation-cycle-service.ts`:
  `processPersistentCustomerMessage` and ordering of claim, normalization, AI,
  domain cycle, and commit.
- `lib/actions/persistent-cycle-context-read.ts`:
  `loadCustomerMessageCycleAuthority`.
- `lib/server/conversation/persistent-cycle-commit.ts`: attempt reservation,
  deferral, claimless commit, human review, commit, and failure RPC adapters.
- `app/api/internal/conversation-cycles/recovery/route.ts` and
  `lib/server/conversation/recovery-handler.ts`: recovery route, discovery loop,
  and HTTP summary behavior.
- `lib/server/ai/customer-answer-interpreter.ts` and
  `lib/server/ai/providers/openai/adapter.ts`: AI eligibility and provider call.

### Relevant tests inspected

- `test/whatsapp-webhook.test.ts`
- `test/persistent-cycle-data-source-composition.test.ts`
- `test/recoverable-conversation-cycle-runner.test.ts`
- `test/persistent-conversation-cycle-service.test.ts`
- `test/openai-structured-inference-adapter.test.ts`

## 3. Confirmed Production facts

The following are treated as observations, not reconstructed assumptions:

1. Conversation `ed8e842d-e6f4-4c5d-9305-e723d6f6794c` belongs to project
   `75de4d21-e54e-486e-9bff-e8deaace9e85`.
2. Outbound system text message
   `c3ee55ca-63a1-4eaa-8931-ddfadfcad368`, sequence 6, contains the delivered
   question “Um welche Gebäudeart handelt es sich?”.
3. Inbound customer text message
   `9afad389-7d46-4aa2-9669-f7a82ead9854`, sequence 7, was persisted at
   `2026-09-09 09:14:52.582553+00`; it follows the prompt and has no explicit
   reply binding.
4. Pending interaction `9732fe6a-81bf-4501-a1b6-88834bfe16ff` remains `pending`,
   targets `building_type`, expects text, runtime revision 2 and knowledge
   version 1, and binds prompt message sequence 6 plus snapshot
   `39add45e-bdfb-41be-8f81-df119ece9362`.
5. It has no `answered_by_message_id`, `answered_at`, supersession, or
   cancellation. The answer commit did not occur.
6. `conversation_cycle_commands` has **zero rows for the conversation**.
7. Its supplied exhaustive Production columns are exactly the original AP-16-03
   columns plus `ai_inference_attempt_count`; in particular they omit all
   reservation/context and execution lease columns expected by current main.
8. `202609080001_ai_cycle_attempt_claimless_technical_escalation_authority.sql`
   was run manually and `ai_inference_attempt_count` exists.
9. Webhook and recovery requests returned HTTP 200, but no subsequent outbound
   WhatsApp message arrived.

An HTTP 200 says only that the outer handler returned successfully. The webhook
deliberately catches cycle errors after persistence, and recovery reports per-item
results in a JSON summary while still returning 200.

## 4. Full productive call graph and evidence assessment

| # | File / function | Input → output | Gate and failure behavior | What Production proves |
|---:|---|---|---|---|
| 1 | `app/api/webhooks/whatsapp/route.ts`; exported `POST` | Meta HTTP request → delegated response | Node route delegates to the constructed handler. | HTTP evidence is consistent with invocation but does not identify event-level progress. |
| 2 | `lib/server/whatsapp/webhook.ts`; `POST` | Bounded, signed JSON → parsed events | Missing secret 503; oversized 413; invalid signature 401; malformed payload 400. Outer persistence/status error returns 500. | Persisted message proves authentication, parsing, and selection of this `inbound_text` event succeeded. |
| 3 | `lib/server/whatsapp/ingestion.ts`; `persistWhatsAppInboundText` | Provider transport fields and text → strict `{status, …, cycle_eligible}` | Calls `ingest_whatsapp_inbound_text`; RPC/schema parse errors throw. | Message persistence proves the RPC transaction committed and returned data accepted far enough for persistence; the supplied facts do not record its returned status/eligibility. |
| 4 | `202608240001_whatsapp_inbound_text_ingestion.sql`; `ingest_whatsapp_inbound_text` | Authenticated inbound transport event → receipt, binding, conversation, message, eligibility | A duplicate returns `status='duplicate'` and `cycle_eligible=false`. A new event inserts the message, then computes eligibility solely from an open/project-bound conversation and a matching runtime in `awaiting_customer_answer`. | New message existence proves persistence. It does not distinguish a first `recorded` result from a later duplicate webhook invocation, and does not prove runtime eligibility. |
| 5 | `lib/server/whatsapp/webhook.ts`; existing-cycle branch | `status='recorded' && cycle_eligible` → `triggerCycle({message_id,…})` | Only this conjunction invokes the customer-answer runner. Errors are swallowed because persistence is final. Duplicate results never invoke it. `!cycle_eligible` instead attempts first-contact eligibility/initialization, whose errors are also swallowed. | No supplied result or runtime row proves which branch ran. This is the last unproven precondition. |
| 6 | `lib/server/whatsapp/ingestion.ts`; `triggerPersistentMessageCycle` | Internal message UUID → cycle result, optional immediate delivery | Creates productive runtime and awaits runner. Failure propagates to the webhook's inner catch. | Not proven to have started. No delivery is expected when the runner fails. |
| 7 | `lib/server/conversation/productive-cycle-runtime.ts`; `createProductiveCycleRuntime` | server env → one service-role RPC source and optional AI interpreter | Missing Supabase URL/key throws. AI interpreter is added only when the feature flag equals literal `true`; provider is lazy. | Deployment facts indicate configuration intent, not successful construction. This occurs after branch selection. |
| 8 | `lib/server/conversation/recoverable-cycle-runner.ts`; `runPersistentCustomerMessageCycle` | message UUID → coarse runner result | Validates UUID, creates an owner/lease data source, then calls `processPersistentCustomerMessage`; catches all errors into `failed`. | Message UUID is valid. Entry remains unproven. |
| 9 | `lib/actions/persistent-conversation-cycle-service.ts`; `processPersistentCustomerMessage` | `{message_id}` → persistent cycle result | The **first side effect** is `source.claimCustomerMessage(message_id)`. It cannot normalize or evaluate AI before a claim authority is returned. | Zero commands proves this function did not get past a successful claim. |
| 10 | `lib/server/conversation/persistent-cycle-data-source.ts`; `claimCustomerMessage` | message UUID + owner/300-second lease → command authority/replay/error | With execution context (always supplied by this runner), calls `acquire_customer_message_cycle_execution`, not legacy `claim_customer_message_cycle` directly. RPC error maps to `persistence_failed`. A successful acquisition is followed by context read. | **First step that should create the command.** It cannot succeed on the observed schema. Whether it was invoked remains unproven. |
| 11 | `202609020003…sql`; `acquire_customer_message_cycle_execution` | message, owner, lease → claimed/replayed/busy JSON | Calls `claim_customer_message_cycle` in the same transaction, then reads/updates lease fields. An absent RPC fails before claim; absent referenced columns cause transaction rollback. | The four required fields are absent; therefore this current-main authority cannot complete. Zero rows is the expected rollback/no-call state. |
| 12 | `202609010002…sql`; `claim_customer_message_cycle` | source message → command/replay/failure | Locks message, conversation, runtime, active pending interaction and knowledge. Validates eligibility/version/snapshot/prompt order. Inserts a fully reserved `processing` command. | Supplied message/pending facts satisfy message semantics and ordering, but active runtime/current project/current knowledge values are not supplied. Its required command columns are absent. |
| 13 | `lib/actions/persistent-cycle-context-read.ts`; `loadCustomerMessageCycleAuthority` / SQL `get_customer_message_cycle_context` | command UUID → validated content/context authority | Requires an existing processing command and validates every binding/snapshot. | Zero commands proves this was not successfully reached. |
| 14 | `processPersistentCustomerMessage` continuation | authority → normalized answer | Re-checks inbound/customer/text and prompt order, then deterministically normalizes. | Not reached. |
| 15 | AI eligibility/reservation/provider | normalized answer → optional canonical override | Only after claim, context read, and normalization: feature gate/interpreter presence plus `isCustomerAnswerAiEligible`; then `reserve_customer_answer_ai_inference_attempt`; only a successful reservation precedes provider invocation. | Not reached; zero command makes reservation impossible. |
| 16 | domain cycle + commit | cycle result → atomic answer/runtime/outbound state | Commit/human-review authorities require owner lease and command CAS bindings. | Pending remains unanswered and no outbound exists, consistent with stopping before claim. |

## 5. Command creation authority and exact eligibility contract

### 5.1 Ingestion eligibility (routing gate)

For a newly recorded inbound text, `ingest_whatsapp_inbound_text` returns
`cycle_eligible=true` exactly when:

```text
conversation.status = 'open'
AND conversation.current_project_id IS NOT NULL
AND EXISTS conversation_runtime_states row where
    runtime.conversation_id = conversation.id
    AND runtime.project_id = conversation.current_project_id
    AND runtime.runtime_status = 'awaiting_customer_answer'
```

For a duplicate receipt it unconditionally returns `cycle_eligible=false`.
Eligibility does not inspect pending interaction status, message sequence, text
content, feature gate, OpenAI key, or `reply_to_message_id`.

### 5.2 Claim/bootstrap eligibility (database authority gate)

Current `claim_customer_message_cycle` additionally requires:

1. source message exists;
2. open conversation with a current project;
3. matching runtime in `awaiting_customer_answer`;
4. message is inbound/customer/text;
5. runtime's `active_pending_interaction_id` identifies a `pending` interaction;
6. pending runtime revision equals runtime revision;
7. pending expected knowledge version equals both runtime knowledge version and
   `project_knowledge_states.current_version`;
8. pending snapshot is non-null;
9. pending prompt exists and inbound sequence is greater than prompt sequence.

The supplied case proves conditions 1, 4, 8, and 9, plus that the named pending
row is pending and internally matches the conversation/project. It does not prove
conditions 2–3 and 5–7 because current conversation/runtime/knowledge rows and the
active-pending pointer were not supplied. Thus the state **appears intended to be
cycle eligible but is not fully provable as eligible under current code**.

The exact bootstrap is not ingestion and is not an insert in TypeScript. It is:

```text
acquire_customer_message_cycle_execution(message, owner, lease)
  -> claim_customer_message_cycle(message)
       -> INSERT conversation_cycle_commands (... status='processing' ...)
  -> attach finite owner/lease
```

The first function that should ensure/create the row is
`claim_customer_message_cycle`, reached only through the productive acquisition
wrapper.

## 6. Migration dependency chain

The relevant forward history on current main is:

| Order | Migration | Authority introduced / changed |
|---:|---|---|
| 1 | `202608230004_persistent_conversation_message_authority.sql` | Creates `conversation_messages` and text side table, sequence/semantics constraints, append-only controls and RLS. |
| 2 | `202608230005_persistent_conversation_runtime.sql` | Creates runtime header and pending interaction tables, statuses, revisions, active-pending FK, guards and RLS. |
| 3 | `202608230006_persistent_live_conversation_cycle.sql` | **Creates `conversation_cycle_commands`** with the 17 original columns; adds pending `prompt_message_id`; creates legacy `claim_customer_message_cycle`. |
| 4 | `202608240001_whatsapp_inbound_text_ingestion.sql` | Creates atomic inbound text persistence and `cycle_eligible` derivation. It does not create a cycle command. |
| 5 | `202609010001_planner_snapshot_persistence.sql` | Adds pending snapshot/locale fields and snapshot persistence needed by later context validation. |
| 6 | `202609010002_cycle_context_read_authority.sql` | Adds **18 command fields**: `project_id`, `prompt_message_id`, `execution_at`, `correlation_id`, interpretation/transition/claim/evidence/apply/assessment/planner IDs, event IDs/start, and next-result reserved IDs; replaces claim to populate them; creates context read authority. |
| 7 | `202609020001_customer_answer_knowledge_apply.sql` | Adds knowledge transition/claim/evidence authority referencing commands. |
| 8 | `202609020002_atomic_cycle_commit_failure_authority.sql` | Adds `commit_payload_hash`, events, atomic commit/fail/human-review functions. |
| 9 | `202609020003_recoverable_conversation_cycle_runner.sql` | Adds `execution_owner_id`, `execution_lease_expires_at`, `execution_attempt_count`, `last_execution_started_at`; creates acquisition and command-only recovery discovery; fences failure/commit/review by ownership. |
| 10 | `202609020004_productive_conversation_cycle_recovery.sql` | Schedules the recovery HTTP route; adds no missing-command bootstrap. |
| 11 | `202609080001_ai_cycle_attempt_claimless_technical_escalation_authority.sql` | Adds `ai_inference_attempt_count`; replaces guard; creates AI reservation/retry functions; replaces commit/review authority for claimless and technical outcomes. It assumes orders 6, 8, and 9 already exist. |

### Required A–J answers

**A.** `202608230006_persistent_live_conversation_cycle.sql` creates
`conversation_cycle_commands`.

**B.** `202609020003_recoverable_conversation_cycle_runner.sql` adds
`execution_owner_id` and `execution_lease_expires_at` (and also
`execution_attempt_count` and `last_execution_started_at`).

**C.** Current SQL functions referencing ownership/lease fields are
`acquire_customer_message_cycle_execution`,
`discover_recoverable_conversation_cycles`, the three-argument
`fail_customer_message_cycle`, `commit_customer_message_cycle`,
`complete_customer_message_human_review`,
`reserve_customer_answer_ai_inference_attempt`, and
`defer_customer_message_ai_retry`. Current TypeScript supplies owner identity via
the acquisition, commit, review, fail, reservation and deferral adapters.

**D.** Yes. `202609080001` directly reads `cmd.execution_owner_id`, reads
`cmd.execution_lease_expires_at`, updates `execution_lease_expires_at`, and its
replacement commit/review functions also require numerous `202609010002` and
`202609020002` fields.

**E.** Yes, as observed. PostgreSQL can store PL/pgSQL function bodies whose
record-field and embedded SQL resolution is deferred until execution. The
migration's first `ALTER TABLE` independently succeeds and adds the AI count.
`CREATE OR REPLACE FUNCTION` does not prove every field referenced through a
`%ROWTYPE` record exists or that every embedded statement has executed.

**F.** The AI count column/check/comment and function catalog definitions can be
created. Runtime access such as `cmd.execution_owner_id`,
`cmd.execution_lease_expires_at`, `cmd.project_id`, or updates to absent fields
fails when the affected statement/function executes. This also explains “SQL
Editor success” without proving a usable authority chain.

**G.** Yes. The exhaustive Production command-column inventory proves at least
`202609010002`, `202609020002`, and `202609020003` are not reflected in the table
schema used by the observation. This is stronger than merely noticing the two
lease fields.

**H.** The exact execution prerequisite missing is
`supabase/migrations/202609020003_recoverable_conversation_cycle_runner.sql`. It
provides all four execution columns, recoverable index, acquisition wrapper,
command recovery discovery, owner-fenced failure, and owner-fenced commit/review.
However it itself depends on the also-unreflected
`202609010002_cycle_context_read_authority.sql` and
`202609020002_atomic_cycle_commit_failure_authority.sql`; the former provides the
reserved command identity/context fields and replacement claim/read authority,
and the latter provides commit hash/events/base commit authorities.

**I.** Other required migrations are `202609010001` (the observed pending
`snapshot_id` suggests at least its table alteration exists), `202609020001`, and
`202609020004`. Their complete Production presence is not established by the
supplied command-column inventory. The eventual repair audit must inventory
functions/tables/signatures before selecting a forward migration; filename-level
migration history alone is insufficient after manual partial execution.

**J.** Yes. Applying only `202609080001` creates a partially upgraded and
internally inconsistent schema: it exposes the AI count and catalog functions but
does not provide the command reservation columns, commit hash, execution lease,
acquisition, or recovery prerequisites required to run them.

## 7. Production schema drift matrix

“Observed?” uses only supplied Production facts; “unknown” is not treated as
absence.

| Object / column / function | Expected on current main | Introduced by | Observed in Production | Consequence if absent |
|---|---:|---|---|---|
| `conversation_messages` base row/sequence/semantics | Yes | `202608230004` | Yes | Inbound cannot persist; not this failure. |
| `conversation_message_text` | Yes | `202608230004` | Indirectly yes (visible text) | Context/normalization cannot load answer. |
| `conversation_runtime_states` base header and active pending fields | Yes | `202608230005` | Unknown | Eligibility false or claim rejected. |
| `conversation_pending_interactions` base fields | Yes | `202608230005` | Yes | No answer authority. |
| pending `prompt_message_id` | Yes | `202608230006` | Yes | Prompt-order gate rejects. |
| pending `snapshot_id`, `locale` | Yes | `202609010001` | Yes | Context read rejects. |
| `conversation_cycle_commands` base columns | Yes | `202608230006` | Yes | No command ledger. |
| 18 reservation/context command columns | Yes | `202609010002` | **No, per exhaustive list** | Current claim insert/context/commit cannot operate. |
| `commit_payload_hash` | Yes | `202609020002` | **No** | Current commit authority cannot operate. |
| four execution owner/lease/attempt columns | Yes | `202609020003` | **No** | Productive acquire/recovery/fenced writes cannot operate. |
| `ai_inference_attempt_count` | Yes | `202609080001` | Yes | AI attempt reservation unavailable without it. |
| `ingest_whatsapp_inbound_text(text,text,text,timestamptz,text)` | Yes | `202608240001` | Proven callable by persistence | Missing would prevent the observed inbound row. |
| `claim_customer_message_cycle(uuid)` current definition | Yes | `202609010002` replacement | Unknown | Acquisition cannot bootstrap a fully reserved command. |
| `get_customer_message_cycle_context(uuid)` | Yes | `202609010002` | Unknown | Acquired command cannot enter normalization. |
| `acquire_customer_message_cycle_execution(uuid,uuid,integer)` | Yes | `202609020003` | Unknown; prerequisite columns absent | Runtime RPC fails or stale definition rolls back. |
| `discover_recoverable_conversation_cycles(integer)` | Yes | `202609020003` | Unknown; prerequisite columns absent | Recovery discovers nothing or RPC fails (adapter maps errors to empty). |
| `commit_customer_message_cycle(uuid,jsonb)` | Yes | `202609020002`, replaced by `020003` and `080001` | Unknown | Answer/outbound cannot commit. |
| `fail_customer_message_cycle(uuid,text,uuid)` | Yes | `202609020003` | Unknown | Owner-fenced failure cannot persist. |
| AI reservation/deferral functions | Yes when AI enabled | `202609080001` | Catalog existence unknown; migration reported success | Would fail at runtime without lease fields. |

## 8. Recovery analysis

Recovery **cannot heal this exact state**.

`discover_recoverable_conversation_cycles` selects only rows already in
`conversation_cycle_commands` with `status='processing'`, command type
`customer_answer`, a source message, and a null/expired lease. It never scans
`conversation_messages`, never joins pending interactions to find unanswered raw
messages, and never invokes claim/bootstrap for a message without a command.

The recovery handler then iterates only returned command rows and passes each
`source_message_id` back through the ordinary runner. With zero commands,
discovery returns zero work even in a complete schema. With the observed missing
lease schema/function, the discovery adapter converts an RPC error into an empty
array; the route still returns HTTP 200 with a summary. Therefore:

- recovery discovers already-created commands only;
- there is no existing recovery authority to bootstrap a command from a raw
  persisted message plus pending interaction;
- webhook command-bootstrap failure creates a durable **recovery gap**;
- recovery HTTP 200 is not work-item success evidence.

## 9. OpenAI boundary conclusion

**OPENAI REACHED: NO.**

Current ordering is:

```text
inbound persistence
→ route eligibility branch
→ acquire execution
→ claim/bootstrap command
→ context authority read
→ deterministic normalization
→ feature gate + answer-specific AI eligibility
→ atomic AI attempt reservation
→ lazy OpenAI adapter construction/provider call
→ domain cycle
→ atomic terminal commit
```

The provider is lazily imported/called only inside the interpreter after a
successful attempt reservation. A reservation requires an existing acquired
command. Production has no command for the conversation. The configured API key
and enabled feature flag therefore cannot explain the missing bootstrap row and
must not be blamed for this incident.

## 10. Root-cause standard and smallest next proof

### What is proven

1. Persistence committed before the failure.
2. No claim/bootstrap transaction committed.
3. Current main uses owner/lease acquisition as the first cycle database call.
4. The observed Production table lacks that acquisition's required schema and
   also lacks earlier context/commit prerequisites.
5. Recovery cannot manufacture the missing command.
6. AI is downstream and was not reached.

### Why the exact root cause is not yet declared

The supplied evidence does not prove the runtime state at ingestion, and hence
does not prove `cycle_eligible=true` or invocation of the affected acquisition
RPC. A false eligibility result (including a runtime/project mismatch) would
also yield a persisted message and no command, before schema drift is exercised.
The observed pending row alone is not the runtime's active-pending pointer.

### Single smallest next Production proof step

Run this complete, read-only query against the same Production database used by
the Vercel deployment. It uses only repository-defined base columns and returns
one compact row reproducing the ingestion eligibility predicate while exposing
the claim gates not already supplied:

```sql
select
  c.status as conversation_status,
  c.current_project_id,
  r.project_id as runtime_project_id,
  r.runtime_status,
  r.revision as runtime_revision,
  r.knowledge_state_version,
  r.active_pending_interaction_id,
  p.status as active_pending_status,
  p.runtime_revision as pending_runtime_revision,
  p.expected_knowledge_state_version,
  ks.current_version as project_knowledge_version,
  (
    c.status = 'open'
    and c.current_project_id is not null
    and r.conversation_id is not null
    and r.project_id = c.current_project_id
    and r.runtime_status = 'awaiting_customer_answer'
  ) as cycle_eligible_now
from public.conversations c
left join public.conversation_runtime_states r
  on r.conversation_id = c.id
left join public.conversation_pending_interactions p
  on p.id = r.active_pending_interaction_id
left join public.project_knowledge_states ks
  on ks.project_id = r.project_id
where c.id = 'ed8e842d-e6f4-4c5d-9305-e723d6f6794c'::uuid;
```

Interpretation is deliberately narrow:

- If `cycle_eligible_now` is true and the active pending/revision/knowledge values
  match the supplied pending interaction, the remaining precondition is proven;
  the missing prerequisite authority/schema at acquisition is then the proven
  cause and the package is ready for a forward-only repair design.
- If false or mismatched, the exact rejecting field identifies an earlier routing
  or runtime-authority boundary; investigate why that state existed at
  `09:14:52+00` before attributing the incident to acquisition drift.

No write RPC, replay, new WhatsApp message, row edit, conversation deletion, or
destructive repair is appropriate as the proof step.

## 11. Conditional repair scope (not authorized in this audit)

Because exact root cause is not yet proven, no repair design is approved. If the
query proves the eligible branch, a subsequent repair package should inventory
actual Production functions and construct **one idempotent forward-only
migration** that reconciles the missing `202609010002`, `202609020002`, and
`202609020003` table/function authority (plus any other inventory-confirmed
prerequisites) without rewriting migration history. It must also explicitly
decide how to recover already-persisted eligible messages, because current
recovery is command-only. Application changes are not automatically implied:
current main already calls the intended acquire authority.

The eventual work must preserve command idempotency, lock order, runtime and
knowledge CAS checks, pending/prompt/snapshot validation, owner fencing, bounded
AI attempts, and human-review behavior. It must not manually mutate the affected
business rows as the primary fix.

## 12. Explicit exclusions

This audit makes and recommends no:

- pricing changes;
- offer-authority changes;
- planner redesign;
- renderer redesign;
- WhatsApp delivery redesign;
- OpenAI prompt or model redesign (neither is relevant before command acquire);
- destructive Production repair;
- deletion of the affected Conversation;
- manual answer/pending/command row fabrication;
- additional test message before the failure boundary is proven.

No application code, migration, product behavior, or tests were changed by this
audit. The sole repository artifact is this report.
