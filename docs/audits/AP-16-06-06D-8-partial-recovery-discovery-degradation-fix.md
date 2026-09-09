# AP-16-06-06D-8 — Partial Recovery Discovery Degradation Fix

## 1. Implementation status and baseline

Implementation status: **complete**. Baseline SHA: `927fef00bde2622890b95de6e2f455f3156ac78b`.
Current main and the required 06D-5, 06D-6, and 06D-7 artifacts were read before implementation.

## 2. Confirmed Production evidence

After 06D-7 activation, an authenticated scheduled Production request reached `/api/internal/conversation-cycles/recovery`, but returned HTTP 503 because missing-command discovery produced `rpc_error` while an existing persistence-failed customer-answer command was independently known to be recoverable. Its safe summary was `PostgREST RPC returned an error`, and no safe code was available through the formerly inspected top-level field.

## 3. Exact composition defect

The composer awaited and validated existing-command discovery, then awaited and validated missing-command discovery, throwing at either failure. Consequently, a later missing-command failure discarded valid existing-command candidates before `runPersistentCustomerMessageCycle`, while an earlier existing-command failure prevented missing-command discovery from running at all. Two independent recovery classes were therefore coupled into one all-or-nothing operation.

## 4. Files changed and migration

- `lib/server/conversation/recoverable-cycle-runner.ts`
- `lib/server/conversation/recovery-handler.ts`
- `test/recoverable-conversation-cycle-runner.test.ts`
- `test/productive-conversation-cycle-runtime.test.ts`
- this artifact

Migration filename: **none**. No SQL or historical migration was changed.

## 5. Discovery result model before and after

Before, discovery returned only a candidate array or threw one `RecoveryDiscoveryError`. After, it returns candidates plus an explicit result for each named source. Each result is either `success` with its validated candidates or `failure` with a typed `RecoveryDiscoveryError`, source, `rpc_error`/`response_validation_error`, bounded safe code, and safe summary. RPC promise rejections are also contained and classified per source. A failure is never represented as an empty successful list.

The merge still places existing-command candidates first, preserves each RPC's deterministic order, de-duplicates by `source_message_id`, and applies one global bounded limit. A healthy source can use the available capacity when the other source fails.

## 6. Partial-degradation and HTTP semantics

When both sources succeed, all selected candidates follow the existing sequential execution path. When one source fails and the other supplies at least one candidate, the healthy candidates are processed and the route returns HTTP 200 with `recovery_degraded=true` and per-source failure flags. This preserves the bounded persistence-failure resume introduced by 06D-7 and the healthy missing-command bootstrap path.

When no candidates are available and either or both sources failed, the route returns HTTP 503 with the fixed public discovery error and safe aggregate fields. Both healthy and empty remains a normal idle HTTP 200. Item execution semantics and the 45-second start budget are unchanged.

## 7. Safe observability and RPC code extraction

`conversation_cycle_recovery_discovery_failure` remains and is emitted once for every failed source. A productive partial run additionally emits `conversation_cycle_recovery_discovery_degraded` with the failed source/classification, safe code/summary, healthy candidate count, and total processed count. `conversation_cycle_recovery_summary` now includes degradation and both source-failure booleans.

Safe code extraction now checks only known bounded structural positions: top-level `code`, `error.code`, `cause.code`, then top-level `status`/`statusCode`. Strings must match a short alphanumeric/code-token allowlist; finite numeric status values are converted safely. Messages, details, hints, arbitrary nesting, RPC payloads, customer text, identifiers, headers, stacks, and credentials are never copied.

## 8. Missing-command RPC root cause finding

The underlying productive missing-command RPC error **did not become code-provable**. The current SQL authority has the expected signature, explicit service-role check, grants, return columns, bounded ordering, and unchanged business predicates after migrations 202609090001 through 202609090004. Migration 202609090004 repairs the context RPC and does not replace or invalidate missing discovery. The Production error alone is insufficient to justify a speculative SQL migration.

## 9. Tests

Focused regression coverage verifies healthy composition, each source's RPC and validation degradation, candidate continuation in either direction, explicit 503 with no healthy candidates, both failures, healthy idle behavior, existing priority, de-duplication, global bounds, degraded summary fields, privacy-safe structured events, supported safe-code wrappers, unknown-code non-disclosure, ordinary existing-command execution, and healthy missing-command bootstrap. Existing migration tests retain the bounded persistence-failure discovery/claim authority established by 06D-7.

Typecheck, lint, focused recovery/runtime/data-source/context/migration suites, broader practical tests, and `git diff --check` are recorded in the final implementation report.

## 10. Production activation and verification

1. Deploy the Vercel Production application; no migration is required.
2. Allow one scheduled recovery cycle.
3. Inspect its recovery summary and, if applicable, one degradation event.
4. Verify the existing technical-failure command progresses and WhatsApp replies normally.

A still-failing missing-command source remains visible but no longer blocks a healthy existing-command recovery run; its independent root cause can be isolated separately.

**Production migration required: NO**

**Vercel Production deployment required: YES**

**Existing technical-failure command automatic recovery expected: YES**

**Missing-command recovery fully healthy after this package: NOT PROVEN**
