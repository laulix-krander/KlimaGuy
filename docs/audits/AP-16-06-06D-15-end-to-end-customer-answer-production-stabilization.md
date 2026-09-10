# AP-16-06-06D-15 — End-to-End Customer Answer Production Stabilization

## 1. Implementation status and baseline

**Complete.** Baseline SHA: `b6b9b3e85d518e195c04469a66ae0da283e8bbaa`. The current branch was clean and equal to the locally available merged main history. Artifacts AP-16-06-06D-2 through D-14, productive application code, and migrations through `202609090008` were reviewed before repair.

## 2. Production evidence considered

The supplied answer, `building_type`, command `bbd0df13-47f1-4b68-a4ab-9d372611465f`, `failed/cycle_failed`, lifetime execution count 12, rehabilitation count 1, AI count 1, failure timestamp, enabled Production feature gate, and deployed D-14 trace were considered. Incident identity and customer text occur only here and in the exact regression test; neither is in product SQL/code or logs.

Evidence proves acquisition, context validation and one AI reservation. It does **not** include the D-14 request-local trace from the failing execution, so it cannot prove the provider outcome, deterministic branch, or internal `CycleErrorCode`.

## 3. Complete productive call graph and boundary proof

| Boundary | Input → output / authority | Controlled failure, side effect, retry/terminal rule |
|---|---|---|
| WhatsApp webhook | signed Cloud payload → parsed inbound event (`webhook.ts`, `parser.ts`) | Rejects invalid signature/schema; never logs body/PII. |
| Ingestion | provider identity/text → immutable Message/text and runtime bootstrap (`ingestion.ts`) | Transactional/idempotent provider binding; recovery handles committed inbound work. |
| Recovery route/runtime | scheduler secret → `recoverConversationCycles` | Bounded batch, source-local degradation, privacy-safe aggregate/item trace. |
| Discovery composition | existing + missing RPC rows → deduplicated message IDs | Each source validated independently; one source cannot mask the other. |
| Missing bootstrap / existing claim | message UUID → stable command/replay | Service-only, locks and revalidates conversation/runtime/pending/snapshot/message ordering. D-15 reopens only current `persistence_failed`/`cycle_failed`. |
| Acquisition | message + owner + lease → fenced processing command | Live foreign owner is busy; expired lease is reclaimable; increments diagnostic lifetime count without imposing a lifetime budget. |
| Context read | command UUID → strict authority DTO | Service-only; controlled authority codes; recursive PostgreSQL timestamp normalization; physical snapshot text is derived from rendered JSON. |
| Normalization | raw text + rendered answer contract → normalized answer | Deterministic; invalid answer remains terminal `normalization_failed`, without AI. |
| Registry/exact match | information key + normalized answer → canonical mapping | Exact `einfamilienhaus` is AI-free. Free sentence is not an exact key. |
| AI eligibility/reservation | active text rule → fenced reservation 1..3 | Reservation is atomic; provider use remains explicitly bounded to three. |
| Interpreter/OpenAI | minimized authority + normalized answer → matched/no_match/ambiguous or classified failure | Structured output revalidated; transient failures deferred; configuration/permanent/exhausted goes technical Human Review. No real provider in tests. |
| Deterministic cycle | context (+ validated canonical override) → generation/failure | Full schema/version/idempotency validation; matched uses claim path, no_match/ambiguous uses claimless path. Internal failure code stays in trace. |
| Commit/review/failure | prevalidated generation + owner → RPC result | Atomic knowledge/runtime/pending/outbound commit; stale/ownership conflicts do not mutate. Failure persistence is owner-fenced. |
| Planner/outbound | committed generation → next action, snapshot, outbound Message | Same commit transaction prevents DB success without scheduling the next internal outbound identity. |
| Delivery | outbound ID → claim/revalidate/dispatch/provider/result | Separate service-only lease/dispatch token; at most three actual provider sends; retry recovery and first-contact patterns remain intact. |

Adjacent contracts are now consistent: technical execution is controlled by current business authority, idempotency, owner leases and time backoff; it is no longer converted into permanent customer failure by a 10/20 scheduler counter.

## 4. Productive RPC contract matrix

All functions below use the exact argument names used by PostgREST. Productive machine authorities are `SECURITY DEFINER`, fixed `search_path=public,pg_temp`, and service-only (revoked from public/anon/authenticated). JSON authorities return controlled `{success,code,...}` objects; discovery returns typed tables.

| RPC | Signature / SQL output | TypeScript consumer checks | Tables / notable representation |
|---|---|---|---|
| claim | `claim_customer_message_cycle(target_message_id uuid) returns jsonb` | claim/replay discriminants, UUIDs, integer versions | command, conversation, runtime, pending, snapshot, source/prompt/text, knowledge; derived prompt text only |
| acquire | `acquire_customer_message_cycle_execution(target_message_id uuid, execution_owner uuid, lease_seconds integer) returns jsonb` | claim shape + ownership result | same command authority; owner UUID, timestamptz lease, integer count |
| context | `get_customer_message_cycle_context(target_command_id uuid) returns jsonb` | strict nested Zod plus timestamp normalization and snapshot validator | all cycle state tables; UUID arrays via `to_jsonb(uuid[])`; JSONB; nullable claim fields |
| reserve AI | `reserve_customer_answer_ai_inference_attempt(uuid,uuid,integer,integer,uuid) returns jsonb` | closed codes; attempt 1..3 | command/runtime/knowledge/pending, owner lease |
| defer AI | `defer_customer_message_ai_retry(uuid,uuid,uuid,text) returns jsonb` | deferred timestamp + attempt 1..2 | command lease; PostgreSQL timestamp accepted by parser |
| commit ordinary/claimless | `commit_customer_message_cycle(target_command_id uuid, commit_payload jsonb) returns jsonb` | strict success/failure shapes and locally validated payload | transactional knowledge, component states, runtime, pending, snapshot, outbound Message/text |
| business/technical review | `complete_customer_message_human_review(target_command_id uuid, review_payload jsonb) returns jsonb` | UUID/version result; ownership loss mapped | command/conversation/runtime/pending; no client reviewer authority |
| failure | `fail_customer_message_cycle(uuid,text,uuid) returns jsonb` | success receipt / ownership callback | command only; D-15 stores capped time backoff for technical codes |
| existing discovery | `discover_recoverable_conversation_cycles(result_limit integer) returns table(uuid,uuid,timestamptz,boolean)` | strict row, PostgreSQL timestamp parser | complete current business-authority joins; no DTO-only column |
| missing discovery | `discover_missing_customer_answer_cycles(result_limit integer) returns table(uuid,timestamptz)` | strict row/timestamp | inbound/current runtime/pending/snapshot and command absence |
| delivery claim/revalidate/authorize/result/recovery | UUID/token typed functions in `202609020005` and `202609030001/002` | closed delivery schemas | Message/text, binding/identity, delivery command, attempt, status; dispatch UUID fencing |

No overload ambiguity is introduced. No bytea crosses this path. Arrays are UUID arrays or JSON arrays. Nullable fields are retained only where SQL can produce null (replay outbound/pending IDs, optional evidence/review data). Grants and role behavior remain fail-closed.

## 5. Physical schema vs DTO and PostgREST findings

The recurring `s.outbound_text` class of defect existed because repository tests asserted selected strings rather than proving alias/table membership. D-15 adds a reusable migration-derived validator: it builds physical column sets from all `CREATE TABLE` and `ALTER TABLE ... ADD COLUMN` statements, scans alias-qualified references in every effective customer-answer/context/AI-commit/missing-discovery/delivery authority, and fails on a nonphysical column. It explicitly proves `outbound_text` is a derived snapshot DTO field.

The response audit found existing recursive normalization correctly converts PostgreSQL JSON timestamptz (`space`, short offset) before strict RFC3339 Zod parsing. Discovery has a dedicated PostgreSQL timestamp schema. UUID, integer, Boolean, nullable, JSONB, array and enum boundaries match the effective SQL. No new response mismatch was found.

## 6. AI and deterministic-cycle findings

Static and test proof for the known sentence:

1. text normalization succeeds as `answered/text`;
2. normalized lookup text is not an exact registry key;
3. active `building_type` text rule makes it AI eligible;
4. reservation succeeds in the fake at attempt 1;
5. fake `matched/single_family_house` passes the server canonical allow-list;
6. `runConversationCycle` succeeds, applies a reported `building_type` claim, answers the interaction, plans/renders the next action, and supplies the atomic commit payload.

Exact `einfamilienhaus` remains provider-free. `no_match` and `ambiguous` run the no-claim state machine; transient provider errors retain bounded deferral; configuration/permanent/exhausted inference retains technical Human Review.

All internal cycle errors capable of the previous external `cycle_failed` are: `invalid_cycle_context`, `cycle_state_version_mismatch`, `interpretation_failed`, transition/retry/collection/effort/event/missing/readiness/assessment/planner/template failures, `cycle_version_invariant_failed`, and `cycle_already_processed` (review-required codes take the review boundary). Either claim branch can emit the subset reached by that branch.

### Exact current `cycle_failed` cause

**NOT PROVABLE from the supplied Production evidence.** The one reserved AI attempt narrows the failure to reservation-success followed by provider/interpretation and deterministic processing, but the pre-D-14 execution did not preserve provider outcome, selected branch or internal cycle code. Repository reproduction proves the expected matched case succeeds and therefore rules out an inherent defect in this sentence/canonical mapping. Inventing a more specific cause would be unsafe. The exact operational defect that stranded it *is* proven: the coarse `cycle_failed` result was persisted terminally while discovery only admitted bounded `persistence_failed` rows.

## 7. Defects found and repairs made

1. **Dead state:** execution emitted `failed/cycle_failed`, while discovery never recognized it. D-15 includes current-authority `cycle_failed` in generic discovery and claim.
2. **Arbitrary lifetime lockout:** the 10-attempt epoch plus one rehabilitation turned infrastructure/software defects into permanent customer loss. D-15 removes epoch checks from claim, discovery and acquisition. The monotonic count remains diagnostic only.
3. **Poison-loop pacing:** removing a ceiling without pacing would hot-loop. Owner-fenced failure now assigns exponential time backoff, minimum 30 seconds and maximum one hour; recovery requires it to be due. Batch limits, current-authority joins and lease fencing remain.
4. **Schema-test gap:** a reusable alias-to-physical-column validator now covers the productive SQL authorities, including outbound delivery.
5. **Known-case coverage gap:** the exact German sentence now proves AI reservation, canonical revalidation, deterministic claim creation and next-action rendering.

No historical migration was edited, no incident DML exists, no authorization/idempotency rule was weakened, and OpenAI/provider semantics were not changed.

## 8. Retry policy before/after and state/dead-state matrix

Before: technical execution consumed ten attempts, could receive one ten-attempt rehabilitation epoch, then was irreversibly excluded; `cycle_failed` was immediately excluded at any count. After: provider HTTP inference remains bounded at 3 and delivery dispatch remains bounded at 3; scheduler execution has no customer lifetime ceiling. Owner/lease fencing prevents concurrency, atomic commands prevent duplicates, capped exponential time backoff prevents hot loops, and current business-authority joins stop stale work.

| Command state/result | Business/lease/AI authority | Intentional outcome |
|---|---|---|
| absent | current unanswered inbound after prompt | missing discovery; atomic bootstrap/acquire |
| processing | live foreign lease | busy, no duplicate |
| processing | expired/no lease, current | rediscover/acquire |
| processing | AI retry lease in future | not due |
| failed / `persistence_failed` or `cycle_failed` | current; retry time due | rediscover/reopen with stable IDs |
| failed / normalization/invalid business result | any | terminal; not retried |
| AI count 1..2 transient | deferred lease | retry when due |
| AI count 3 or permanent/config | current | technical Human Review |
| completed | any | replay terminal; no duplicate |
| human_review_required | any | terminal pending humans |
| stale/current-authority mismatch/superseded answer | any | stale/terminal, excluded |

### Final recovery model

`pending answer → processing → success` atomically applies knowledge, answers Pending Interaction and creates the next outbound identity. Business review and AI technical review go to Human Review. Retryable technical failure goes to failed-with-due-time and returns to processing under the same IDs. Stale/invalid business input stays terminal. Scheduler attempts consume no customer budget; only actual AI/provider and WhatsApp dispatch attempts are bounded. Leases, idempotency, due-time backoff, bounded batches and current-authority checks prevent concurrent duplication and tight infinite loops.

## 9. Missing-command and outbound/delivery audit

Missing discovery has the correct signature/argument, explicit service-role rejection, service-only grant, physical message/runtime/pending/knowledge/snapshot references, command-absence predicate, typed timestamptz response and matching parser. It is healthy in repository authority; partial source degradation remains resilience, not normal operation.

Ordinary/claimless commit creates Message/text, snapshot, Pending Interaction and runtime progression in the same database transaction; a successful DB cycle therefore cannot silently omit its internal outbound work. Delivery creation is idempotent on internal outbound identity. Revalidation and dispatch tokens fence provider calls; failed retryable deliveries have due-time recovery and a bounded three-dispatch provider budget. No WhatsApp semantics changed.

## 10. Remaining unproven Production items

Only live-environment facts cannot be statically proven: whether Production applies migration `202609090009`, whether Vercel deploys this commit, the actual provider proposal for the incident, and the post-deploy WhatsApp acceptance/delivery. One normal recovery and one D-14 trace are sufficient; no SQL diagnostic chain or resend is needed.

## 11. Files changed, tests, and activation

Files changed:

- `supabase/migrations/202609090009_end_to_end_customer_answer_stabilization.sql`
- `test/customer-answer-sql-schema-contract.test.ts`
- `test/end-to-end-customer-answer-stabilization-migration.test.ts`
- `test/persistent-conversation-cycle-service.test.ts`
- this artifact

Migration filename: **`202609090009_end_to_end_customer_answer_stabilization.sql`**.

Validation gates: focused normalization/registry/AI/service/runtime/recovery/data-source/context/commit/review/migration/delivery/webhook tests, the new known-case regression and schema validator, typecheck, lint and diff check pass. Full `npm test` ran 1,300 tests: 1,299 passed; the sole failure is the pre-existing OpenAI-isolation assertion that `productive-cycle-runtime.ts` must not mention `OPENAI_API_KEY`, while current main intentionally reads that gate there. D-15 does not modify that file or weaken the assertion.

Production activation and exact one-run verification:

1. Apply the single forward-only migration.
2. Deploy the Vercel application.
3. Allow one ordinary recovery run after the command's backoff is due.
4. Inspect one privacy-safe D-14 trace (reservation/provider/branch/internal code/persistence measurements).
5. Verify command success, one next outbound identity, one eligible delivery command and WhatsApp progression; a repeated recovery must replay/omit rather than duplicate.

**Production migration required: YES**

**Vercel Production deployment required: YES**

**Existing failed Production command automatic recovery expected: YES**

**Customer resend required: NO**

**OpenAI behavior changed: NO**

**Technical execution lifetime limit retained: NO**

New safety model: current business authority + stable idempotency identities + owner/lease fencing + bounded exponential scheduler backoff; AI/provider attempt limit remains exactly 3 and WhatsApp dispatch attempt limit remains exactly 3.
