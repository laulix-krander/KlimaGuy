# AP-16-06-06D-12 — Rehabilitated Technical Epoch Retry Authority Repair

## 1. Implementation status and baseline

Implementation status: **complete**. Baseline SHA: `93437b34262190f7737b959f0235623ca78debed`. Current main, artifacts 06D-9 through 06D-11, and the effective discovery, claim, and acquisition definitions were read before implementation.

## 2. Confirmed Production evidence

The supplied Production sequence establishes that the command first exhausted its original technical epoch at `failed / persistence_failed`, lifetime attempt 10, rehabilitation count 0, and AI attempt count 0. Production then emitted `conversation_cycle_technical_failure_rehabilitated`, atomically consumed the sole rehabilitation, and acquired lifetime attempt 11. That execution failed during the subsequently repaired context RPC before AI. After 06D-11, a healthy scheduled discovery call returned zero candidates and no discovery degradation. The expected current logical state is therefore `failed / persistence_failed`, rehabilitation count 1, lifetime attempt 11, and AI attempt count 0, excluded by eligibility rather than an RPC error.

## 3. Exact discovery defect

The effective discovery failure branch required `technical_rehabilitation_count=0` and `execution_attempt_count<=10`. It admitted original-epoch failures and the attempt-10 transition candidate, but omitted ordinary failed retries at lifetime attempts 11 through 19 after rehabilitation count became 1. Thus the intended fresh ten-attempt epoch became effectively one attempt long whenever its first execution failed.

## 4. Exact claim defect

The effective claim authority reopened only rehabilitation-count-0 failures below lifetime attempt 10 or consumed rehabilitation at exactly attempt 10. Every rehabilitation-count-1 failed command reached `interaction_not_current`, including valid fresh-epoch attempts 11 through 19. Correcting discovery alone would therefore still not have allowed acquisition.

## 5. Correct epoch model

The lifetime `execution_attempt_count` remains monotonic. Current-epoch usage is derived as:

```text
epoch_attempts = execution_attempt_count - (technical_rehabilitation_count * 10)
```

Before acquisition, derived attempts 0 through 9 have budget. At lifetime attempt 10 with rehabilitation count 0, the one rehabilitation may be consumed. With rehabilitation count 1, lifetime attempts 10 through 19 map to fresh-epoch attempts 0 through 9. Lifetime attempt 20 maps to 10 and is exhausted. The count remains constrained to 0 or 1; no second rehabilitation exists.

AP-16-06-06D-9 introduced this intended model and correctly implemented derived acquisition accounting, but discovery and claim remained centered on the initial 0-to-1 rehabilitation transition. They permitted lifetime attempts 0 through 10 only at rehabilitation count 0 and omitted ordinary failed retries at attempts 11 through 19 with rehabilitation count 1.

## 6. Migration

Migration filename: **`supabase/migrations/202609090008_rehabilitated_technical_epoch_retry_authority_repair.sql`**. It is the sole new forward-only migration. It replaces only `public.discover_recoverable_conversation_cycles(integer)` and `public.claim_customer_message_cycle(uuid)`. It contains no incident-specific DML, attempt reset, rehabilitation reset, Pending Interaction mutation, table alteration, application change, or OpenAI-boundary change.

## 7. Discovery before and after

Before, failed persistence discovery required rehabilitation count 0 and lifetime attempts at most 10. After, it admits a retryable `failed / persistence_failed` command when the derived current epoch has attempts 0 through 9, plus the special original attempt-10/count-0 candidate that may consume rehabilitation. Only that special candidate returns `requires_technical_rehabilitation=true`; ordinary retries inside the already rehabilitated epoch return false.

The open/current conversation and project, awaiting runtime, active pending and unanswered interaction, revisions, current knowledge, snapshot linkage, prompt/source identity and ordering, reconstructed outbound text identity, command bindings, and no-newer-inbound-answer predicates remain unchanged. Discovery stays side-effect free, deterministic, and globally clamped to 100.

## 8. Claim before and after

Before, claim reopened count-0 attempts below 10 and consumed rehabilitation at count 0/attempt 10, rejecting everything else. After full business-authority revalidation and row locking, claim derives epoch attempts. Values 0 through 9 reopen normally without changing rehabilitation count. The exact original ceiling at count 0/attempt 10 still consumes rehabilitation once, changes the count to 1, and returns `technical_rehabilitated=true`. Count-1 attempts 10 through 19 reopen normally with `technical_rehabilitated=false`; count-1 attempt 20 and above are rejected.

## 9. Acquisition verification

`public.acquire_customer_message_cycle_execution(uuid, uuid, integer)` did **not** require replacement. Its effective 06D-9 definition already locks the command, preserves owner/lease fencing, derives current epoch attempts with the same formula, rejects values below 0 or at least 10, and increments the lifetime counter exactly once in the accepted update. The first rehabilitated acquisition changes lifetime attempt 10 to 11; a retry after the reported failure changes 11 to 12 without resetting history or consuming another rehabilitation.

## 10. Terminal protections

Completed, Human Review, stale, non-persistence, invalid-input, normalization, and cycle/business failures remain excluded. So do exhausted fresh epochs, superseded messages, answered interactions, closed or wrong-project conversations, stale runtime or knowledge authority, invalid snapshot/prompt/source relationships, outbound text mismatch, newer customer answers, and stale command identity/revision bindings.

## 11. Security and observability

Both replaced functions remain `SECURITY DEFINER`, use fixed `search_path=public,pg_temp`, explicitly reject any effective role other than `service_role`, revoke execution from `public`, `anon`, and `authenticated`, and grant execution only to `service_role`.

The claim receipt remains the observability authority. `technical_rehabilitated=true` occurs only on the initial count transition from 0 to 1, so the existing `conversation_cycle_technical_failure_rehabilitated` event is emitted once. A normal fresh-epoch retry returns false and leaves recovery summary field `technical_rehabilitated` at 0. No event, runner, provider, prompt, timeout, feature gate, matching behavior, or AI counter code changed.

## 12. Tests

Focused AP-16-06-06D-12 coverage models original attempts 1 through 9, the attempt-10 marker and one-time transition, first rehabilitated acquisition accounting, every failed fresh-epoch retry from 11 through 19, false rehabilitation markers during those retries, ordinary reopen without count changes, exactly-once lifetime increments, exhaustion at 20, impossibility of a second rehabilitation, terminal and stale-authority exclusions, newer-answer exclusion, service-only security, ordering, global limit, schema-backed outbound text, unchanged AI accounting, and absence of incident UUIDs. Existing 06D-9, 06D-10, 06D-11, claim/acquisition, recovery runner, and productive runtime suites remain part of validation.

## 13. Production activation

1. Activate migration `202609090008_rehabilitated_technical_epoch_retry_authority_repair.sql`.
2. Do not deploy Vercel because application code did not change.
3. Allow one scheduled recovery run.
4. Inspect one recovery summary/item event.
5. Verify the WhatsApp conversation progresses.

No diagnostic SQL series, customer resend, command mutation, attempt reset, or Pending Interaction mutation is needed. Assuming normal business authority remains current, scheduled recovery should rediscover the existing rehabilitated command under its remaining fresh-epoch budget. Processing then proceeds through ordinary context loading, normalization, and normal AI eligibility.

**Production migration required: YES**

**Vercel Production deployment required: NO**

**Existing rehabilitated command automatic retry expected: YES**

**Customer resend required: NO**

**OpenAI reached before repair: NO**

**OpenAI expected afterward: DEPENDS ON NORMAL ELIGIBILITY**
