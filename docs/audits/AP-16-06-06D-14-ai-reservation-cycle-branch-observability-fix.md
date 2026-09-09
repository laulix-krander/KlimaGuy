# AP-16-06-06D-14 — AI Reservation and Deterministic Cycle Branch Observability Fix

## 1. Implementation status

**Complete.** This is an application-only observability repair. It does not change customer-answer decisions, AI eligibility, attempt limits, feature-gate semantics, OpenAI integration, persistence authority, or recovery budgets.

## 2. Baseline SHA

Baseline: `311de47c4168a42ba2d3a9afe7eca81f6355c957` (the current merged AP-16-06-06D-13 history available on branch `work`; no separate local `main` ref exists).

## 3. Production evidence motivating the package

The latest supplied Production recovery item reached discovery, rehabilitation, claim, acquisition, and context read, then returned controlled `cycle_failed`. Its `ai_attempt_reservation_reached=false` and `failure_persistence_succeeded=false` values were fixed runner defaults rather than measurements. The recovery summary reported one discovered and attempted existing command, zero completions/reviews, one failure, and no discovery degradation. Production was separately verified with `AI_CUSTOMER_ANSWER_CLASSIFICATION_ENABLED=true`; the known `building_type` free text is statically AI-eligible.

## 4. Exact observability defect

`processPersistentCustomerMessage` discarded branch progression, the internal `ConversationCycleFailure.code`, and the Boolean returned by its failure authority calls. The runner then constructed failure diagnostics with constant false reservation/persistence fields. Consequently the same event could not distinguish absent interpreter, ineligibility, reservation/provider progress, either deterministic branch, or successful failure persistence.

## 5. Trace model

A request-local `CustomerAnswerCycleExecutionTrace` now accompanies internal cycle results. It contains explicit boundary booleans plus nullable bounded outcomes: `interpreter_present`, normalization reached/succeeded, eligibility evaluated/result, reservation attempted/succeeded/result code/attempt, interpreter invoked/succeeded/outcome/failure class, deterministic invocation/branch/success/failure code, and failure-persistence attempted/succeeded. It is result metadata only and is not written into a domain table or customer response.

## 6. Interpreter-presence measurement

Presence is initialized at the productive service boundary from `Boolean(customerAnswerInterpreter)`, i.e. from the actual argument supplied to `processPersistentCustomerMessage`, not from the environment setting.

## 7. Normalization measurement

`normalization_reached` changes immediately before the sole `normalizeCustomerAnswer` call; `normalization_succeeded` receives its actual discriminant. Existing normalization failure behavior and code remain unchanged.

## 8. Eligibility measurement

The existing short-circuit was expanded without changing its logic. Eligibility is evaluated exactly when an interpreter exists; its actual Boolean is recorded. With no interpreter it remains explicitly unevaluated and nullable.

## 9. Reservation measurement

The trace marks the boundary immediately before `reserveCustomerAnswerAiInferenceAttempt`, records the returned success discriminant and bounded authority code, and preserves attempt 1, 2, or 3 only for `reserved`. Reservation errors retain their existing product mapping.

## 10. Interpreter measurement

Invocation is marked immediately before the actual interpreter call. The returned success discriminant is recorded; successful proposals retain only `matched`, `no_match`, or `ambiguous`, and failures retain only the existing bounded `AiInferenceFailureClass`. Provider messages, prompts, payloads, and answers are absent.

## 11. Deterministic branch measurement

Immediately before each call the trace records `with_claim` for `runConversationCycle` or `without_claim` for `runConversationCycleWithoutClaim`, and marks invocation. The actual success discriminant is retained for both branches.

## 12. Internal cycle failure-code propagation

On either deterministic failure the existing bounded `CycleErrorCode` is copied into `deterministic_cycle_failure_code` before the external result continues to map to `cycle_failed`. No domain code was invented and the product result is unchanged.

## 13. Actual failure persistence measurement

The service marks each existing normalization/cycle failure call immediately before `failCustomerMessage` and stores its returned Boolean. For the runner's existing `persistence_failed` terminalization, the runner likewise marks the actual call and actual return. Calls, persisted codes, retry behavior, and count are unchanged.

## 14. Privacy constraints

The recovery event spreads only the closed trace model: Booleans, nullable bounded enums, attempt 1–3, existing reservation result codes, existing AI failure classes, and existing cycle error codes. It contains no answer/normalized text, prompt, provider request/response, arbitrary exception message, stack, credentials, authorization data, WhatsApp identifier, or raw RPC payload. No incident UUID was added.

## 15. Files changed

- `lib/domain/conversation-cycle-orchestration.ts`: request-local trace contract and internal result metadata.
- `lib/actions/persistent-conversation-cycle-service.ts`: actual boundary measurements and trace propagation.
- `lib/server/conversation/recoverable-cycle-runner.ts`: trace propagation and measured runner persistence outcome.
- `lib/server/conversation/recovery-handler.ts`: privacy-safe trace fields in the existing controlled failure event.
- `test/persistent-conversation-cycle-service.test.ts`: branch, known-answer, reservation, failure-code, persistence, and success coverage.
- `test/recoverable-conversation-cycle-runner.test.ts`: actual true/false terminalization measurements.
- `test/productive-conversation-cycle-runtime.test.ts`: propagated recovery log and privacy regression.
- This artifact.

## 16. Tests

Focused coverage includes interpreter absent/present, non-eligible bypass, the supplied `building_type` free text, successful and controlled-failure reservation, interpreter invocation/outcomes, both deterministic branches and internal failure codes, normalization failure, true/false persistence, human review/non-persistence behavior, successful cycle behavior, recovery propagation, and log privacy. Typecheck, lint, focused recovery/classification/normalization/registry/runtime suites, full Vitest, and `git diff --check` are the completion gates.

## 17. Production activation

Deploy the application to Vercel Production. No SQL migration or data mutation is required. The feature gate remains an exact comparison with `"true"` and is not changed or defaulted.

The known command was reported within the rehabilitated fresh epoch rather than at its attempt-20 ceiling. This package neither consumes nor extends a budget outside normal execution. If it independently reaches the existing ceiling before deployment, the ordinary generic recovery authority will correctly exclude it; no incident-specific DML is introduced by this package.

## 18. Exact next Production verification

1. Deploy Vercel Production.
2. Allow **one** ordinary scheduled recovery run.
3. Inspect **one** `conversation_cycle_recovery_item_failure` event if controlled failure recurs (or the ordinary success result if it completes).
4. Read the explicit trace to determine interpreter presence, eligibility, reservation/provider progression, deterministic branch/internal code, and actual failure-persistence result.

No SQL diagnosis series, customer resend, manual command mutation, retry reset, or budget extension is required.

## 19–23. Explicit activation and behavior answers

**Production migration required: NO**

**Vercel Production deployment required: YES**

**Customer resend required: NO**

**Does this package change customer-answer semantics: NO**

**Does this package change OpenAI behavior: NO**
