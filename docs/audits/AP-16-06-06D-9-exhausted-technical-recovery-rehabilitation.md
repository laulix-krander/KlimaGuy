# AP-16-06-06D-9 — Exhausted Technical Recovery Rehabilitation

## 1. Implementation status and baseline

Implementation status: **complete**. Baseline SHA: `ccb5f13e7f99f7bb0acb0791f2165c836badcfa1`. Current main, the complete current discovery/claim/acquisition/failure path, and artifacts 06D-6, 06D-7, and 06D-8 were read before implementation.

## 2. Confirmed Production evidence and exclusion

The supplied Production command `bbd0df13-47f1-4b68-a4ab-9d372611465f`, source message `9afad389-7d46-4aa2-9669-f7a82ead9854`, conversation `ed8e842d-e6f4-4c5d-9305-e723d6f6794c`, project `75de4d21-e54e-486e-9bff-e8deaace9e85`, and Pending Interaction `9732fe6a-81bf-4501-a1b6-88834bfe16ff` retain the supplied current authority. The command is terminal only as `failed / persistence_failed`, with `execution_attempt_count=10` and `ai_inference_attempt_count=0`; the conversation remains open and the same unanswered Pending Interaction, runtime revision, and knowledge version remain current.

06D-7 discovery admitted a technical terminal failure only below ten executions. The supplied command was therefore excluded solely by the equality `execution_attempt_count=10`. These incident identities occur only in this evidence artifact, never in implementation TypeScript or SQL.

## 3. Rehabilitation and attempt-accounting model

The migration adds `technical_rehabilitation_count integer not null default 0`, constrained to `0..1`. There is exactly **one** automatic rehabilitation, and it is available only at exactly the original ten-attempt ceiling. This is the smallest useful bound: it gives repaired infrastructure one fresh ten-attempt epoch while making a persistently broken command terminal again after that epoch.

`execution_attempt_count` remains the monotonic lifetime total and is never reset. The current epoch count is derived under database authority as `execution_attempt_count - (technical_rehabilitation_count * 10)`. The rehabilitation count answers whether rehabilitation occurred and whether another is possible. Acquisition rejects an epoch count outside `0..9`, increments the lifetime total once, and returns the resulting epoch attempt count. `ai_inference_attempt_count` is neither read as technical authority nor changed/reset.

The safe forward-compatible default makes an existing ten-attempt row eligible without incident DML or destructive backfill. A newly rehabilitated existing row retains ten historical attempts; its first acquired execution becomes lifetime attempt 11 and epoch attempt 1. If failures persist, attempts 11 through 20 are the only fresh budget. A second rehabilitation is impossible by both the column constraint and claim predicates.

## 4. Discovery authority

`discover_recoverable_conversation_cycles(integer)` remains service-only, `SECURITY DEFINER`, fixed-search-path, deterministically ordered, side-effect free, and globally bounded at 100 (the application continues requesting its batch of ten). It now returns explicit `requires_technical_rehabilitation` instead of requiring application inference.

Ordinary expired processing work and persistence failures below ten remain discoverable. Exactly-ten `failed / persistence_failed / customer_answer` work with rehabilitation count zero is also discoverable, but only while joins prove the open/current conversation and project; awaiting runtime; active, pending, unanswered interaction; matching runtime and knowledge revisions; current project knowledge; valid linked snapshot; valid source/prompt direction, kind, actor, sequence, and text/snapshot identity; and absence of a newer inbound customer answer. Completed, Human Review, stale, non-persistence, superseded, answered, or authority-mismatched work does not enter the result.

## 5. Atomic claim/reopen authority

Discovery does not mutate. `claim_customer_message_cycle(uuid)` locks the conversation, runtime, active Pending Interaction, knowledge state, and existing command, then independently repeats current business-authority validation. It validates the source and prompt, snapshot linkage/content identity, message ordering, absence of a newer customer answer, command type/status/result, current project, command Pending Interaction, and command CAS revisions.

Only a `failed / persistence_failed / customer_answer` command at exactly ten attempts with rehabilitation count zero can take the rehabilitation branch. The same transaction increments the count to one, clears the technical terminal marker, and returns an explicit rehabilitation receipt. `acquire_customer_message_cycle_execution` then uses the existing command row lock and owner/lease fencing, verifies the fresh epoch budget, takes the lease, and increments the lifetime attempt. Concurrent claims serialize on the locked command, so only the first can consume the one generation; a different live owner remains `busy`.

The ordinary below-ceiling technical reopen is unchanged in meaning. Completed, stale, Human Review, normalization/input/cycle/non-persistence failures, stale authority, exhausted second epoch, and superseded messages remain closed. Stable command and reserved domain identities are retained.

## 6. Observability and application contract

The recovery row parser accepts the explicit discovery marker. More importantly, the acquisition response—not discovery—is the authoritative source for observability after atomic revalidation. The data source reports a bounded receipt to the runner. The handler emits `conversation_cycle_technical_failure_rehabilitated` with only rehabilitation count, previous total attempt count, fresh epoch budget, and fixed reason `exhausted_persistence_failure_rehabilitated`. It emits no IDs, message text, RPC payload, headers, credentials, or database details. `conversation_cycle_recovery_summary.technical_rehabilitated` distinguishes actual rehabilitations from ordinary recoveries.

Normal post-acquisition processing is unchanged. Exact registry matches remain AI-free; AI reservation is reached only through normal normalization/eligibility. Provider, model, prompt, timeout, retries, feature gate, and AI limits were not modified.

## 7. Files changed

- `supabase/migrations/202609090005_exhausted_technical_recovery_rehabilitation.sql`
- `lib/server/conversation/persistent-cycle-data-source.ts`
- `lib/server/conversation/recoverable-cycle-runner.ts`
- `lib/server/conversation/recovery-handler.ts`
- `test/exhausted-technical-recovery-rehabilitation-migration.test.ts`
- `test/persistent-cycle-data-source-composition.test.ts`
- `test/recoverable-conversation-cycle-runner.test.ts`
- `test/productive-conversation-cycle-runtime.test.ts`
- this artifact

Migration filename: **`202609090005_exhausted_technical_recovery_rehabilitation.sql`**. It is one forward-only migration after `202609090001` through `202609090004`, uses a generic safe default and constraint, atomically replaces affected RPCs, restores service-only grants, and contains no incident DML.

## 8. Tests

Focused migration, discovery, acquisition/data-source, technical failure, recovery handler/runner, service/runtime, AI-boundary, and prior reconciliation suites cover ordinary retry continuity; equality-at-ceiling discovery; explicit marker; atomic rehabilitation; monotonic total attempts; fresh epoch budget; exactly-once generation; maximum exhaustion; terminal/review/non-persistence exclusion; runtime/Pending Interaction/answered/revision/knowledge/snapshot/source supersession guards; side-effect-free bounded discovery; ownership fencing; privacy-safe logs; existing-command priority; unchanged AI accounting; exact-match bypass; and normal AI reservation reachability. Full Vitest, typecheck, lint, and diff checks are recorded in the final report.

## 9. Production activation and verification

1. Activate `202609090005_exhausted_technical_recovery_rehabilitation.sql`.
2. Deploy Vercel Production.
3. Allow one ordinary scheduled recovery run.
4. Inspect one recovery summary and its rehabilitation event.
5. Verify the existing WhatsApp conversation progresses.

No customer resend, incident-specific endpoint, SQL diagnosis series, or manual row mutation is required. Assuming the supplied business authority remains current at claim time, the existing exhausted command will be discovered and rehabilitated automatically. OpenAI was not reached before rehabilitation (`ai_inference_attempt_count=0`); afterward it is reached only if ordinary normalization and eligibility require fallback.

**Production migration required: YES**

**Vercel Production deployment required: YES**

**Existing exhausted Production command automatic rehabilitation expected: YES**

**Customer resend required: NO**

**OpenAI reached before rehabilitation: NO**

**OpenAI expected afterward: DEPENDS ON NORMAL ELIGIBILITY**
