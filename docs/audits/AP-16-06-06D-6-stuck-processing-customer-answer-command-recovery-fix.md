# AP-16-06-06D-6 — Stuck Processing Customer-Answer Command Recovery Fix

## 1. Implementation status and baseline

Implementation status: **complete**. Baseline SHA: `20102b656690c3ab575612490ad04aa821ea0281`.
Current main and the 06D-2, 06D-3, 06D-3A, 06D-4 and 06D-5 artifacts were read before implementation.

## 2. Confirmed Production evidence

The supplied incident command `bbd0df13-47f1-4b68-a4ab-9d372611465f` exists for source message `9afad389-7d46-4aa2-9669-f7a82ead9854`, is `processing`, has no result/failure/outbound identity, and has zero AI attempts. One real recovery run discovered and attempted exactly that existing command and returned controlled `failed`; it was not busy, stale, ownership-lost, terminal, review, unexpected, or complete. Incident identities occur only in this artifact.

## 3. Exact root cause and failing stage

The exact code-provable path is **context authority response validation after successful acquisition**:

1. Existing discovery returns the source message.
2. The runner creates a fresh owner with a 300-second lease.
3. `acquire_customer_message_cycle_execution` calls the idempotent claim, locks the existing processing command, protects a different unexpired owner, and otherwise writes the new owner/lease and increments `execution_attempt_count`. A null or expired lease is reclaimable. A command created by missing-command discovery has no special identity and is reclaimed identically.
4. `get_customer_message_cycle_context` returns a `jsonb` authority containing PostgreSQL `timestamptz` values. PostgreSQL JSON text can use `YYYY-MM-DD HH:mm:ss...+00`, while the application fed the response directly into nested strict Zod datetime schemas requiring RFC 3339 form.
5. The valid authority was therefore reduced to `authority_incomplete` / `persistence_failed` before normalization and AI reservation.
6. `claimCustomerMessage` then discarded the already-known command identity. `processPersistentCustomerMessage` consequently returned a failure without `command_id`.
7. The runner can call `fail_customer_message_cycle` only when a failure includes `command_id`; it skipped terminal persistence and returned coarse `kind=failed`. The owned command stayed `processing`, later became discoverable when its lease expired, and repeated forever.

This precisely produces `existing_command_discovered=1`, `attempted=1`, `failed=1`, a non-terminal processing command, and zero AI attempts. Acquisition was reached and succeeded; context authority was reached but rejected at application validation; normalization and OpenAI were not reached.

## 4. Five-second signature

The repository contains no five-second cycle lease, application acquisition wait, context timeout, retry sleep, or pre-AI abort. The cycle lease is 300 seconds, the recovery start budget is 45 seconds, and the OpenAI timeout is downstream of attempt reservation. Approximately 5.04 seconds is therefore incidental database/platform request latency, not a causal application timer established by current main.

## 5. Repair and authority contracts

### Database authority before/after

No SQL change is needed. Current authority already safely reclaims `processing` commands whose lease is null or expired and rejects a different owner while its lease remains active. `fail_customer_message_cycle` remains owner- and lease-fenced and is terminal/idempotent. No Production row is mutated by this package and no historical migration is edited.

### Application contract before/after

Before, context RPC errors and invalid response shapes both became `authority_incomplete`, and the acquired command identity and stage disappeared. Failure finalization returned `void`, so callers could not distinguish successful persistence from a failed RPC/ownership response.

After, PostgreSQL-shaped timestamps are converted to RFC 3339 **only when they match a bounded timestamp pattern**, followed by the unchanged strict Zod validation. Context failures retain safe categories (`rpc_error`, `response_validation_error`, `authority_rejected`). The data source retains the acquired command identity and stage. The runner persists a controlled post-acquisition technical failure through the existing fenced failure authority and records whether that persistence actually succeeded. Active ownership, claim authority, retry limits, AI eligibility, exact matching, planner behavior and business semantics are unchanged.

A deterministic invalid authority no longer creates an invisible infinite processing loop. If the terminalization RPC fails, the item event explicitly reports `failure_persistence_succeeded=false`; the lease remains bounded and ordinary recovery can retry rather than silently claiming terminal persistence.

## 6. Observability before/after

Before, the handler saw only `kind=failed`. After, every controlled failed item emits `conversation_cycle_recovery_item_failure` with stage, safe failure category/result code, acquisition/context/AI-reservation booleans, and failure-persistence outcome. It includes no message text, IDs, raw RPC payload, stack, authorization header, or provider/WhatsApp/Supabase credential.

## 7. Files changed

- `lib/actions/persistent-cycle-context-read.ts`
- `lib/actions/persistent-conversation-cycle-service.ts`
- `lib/domain/conversation-cycle-orchestration.ts`
- `lib/server/conversation/persistent-cycle-data-source.ts`
- `lib/server/conversation/persistent-cycle-commit.ts`
- `lib/server/conversation/recoverable-cycle-runner.ts`
- `lib/server/conversation/recovery-handler.ts`
- focused tests for context read, data-source composition and runner recovery
- this artifact

Migration filename: **none**.

## 8. Tests

Focused coverage verifies PostgreSQL timestamp normalization followed by strict validation; acquisition RPC and context RPC/validation classification; retained command identity; successful and failed terminal persistence; busy/ownership/stale/terminal distinctions already covered by the runner/runtime suites; lease reclaim/null lease/concurrent owner SQL authority; bounded and side-effect-free discovery; AI reservation/exact-match/maximum-attempt semantics in the existing service and AI suites. Typecheck, lint, focused suites, broader practical tests and `git diff --check` are recorded in the final implementation report.

## 9. Production activation and short verification

1. Deploy Vercel Production (no migration).
2. Allow one scheduled recovery cycle.
3. Inspect its one structured item/summary log.
4. Verify the command result and ordinary WhatsApp outcome.

No resend and no manual business-row repair are required. The current answer remains subject to ordinary normalization and AI eligibility; if it is AI-eligible, reservation/provider execution becomes reachable naturally. Any subsequent provider failure is a new, visible downstream authority state.

**Production migration required: NO**

**Vercel Production deployment required: YES**

**Existing processing command automatic recovery expected: YES**

**OpenAI expected to become reachable after repair: DEPENDS ON NORMAL ELIGIBILITY**
