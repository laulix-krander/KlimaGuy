# AP-16-06-06D-5 — Productive Recovery Discovery Reliability Fix

## 1. Status and baseline

Implementation status: **complete**. The inspected baseline SHA was
`7a1410e65f0134412085f6c54a08cb44227d3a3f`. The required 06D-2, 06D-3,
06D-3A, and 06D-4 artifacts were read before current-main implementation was
inspected.

## 2. Confirmed incident evidence

Production message `9afad389-7d46-4aa2-9669-f7a82ead9854` is persisted for
Conversation `ed8e842d-e6f4-4c5d-9305-e723d6f6794c`; Pending Interaction
`9732fe6a-81bf-4501-a1b6-88834bfe16ff` remains pending and no source-message
command exists. Production has activated `202609090002`, and every current
missing-discovery business predicate was independently true. A retained real
scheduled response was HTTP 200 with both discovery counters and `attempted`
zero. Thus invocation and authentication worked and the failure was before
candidate execution.

No incident identity is present in application code or SQL. It appears here only
to retain the supplied evidence.

## 3. Exact defects and root-cause finding

Current main converted either RPC's non-null PostgREST error to `[]`. It also
used `safeParse` but consumed only successful results, silently discarding an
invalid strict response as zero rows. Therefore technical failures produced an
idle-looking HTTP 200.

The SQL functions were `SECURITY DEFINER`, executable only by `service_role`,
but additionally filtered with `auth.role()='service_role'`. The grants normally
cause an unauthorized PostgREST error; if execute authority were ever inherited
or accidentally granted, the role predicate instead returned an empty success.
That defense-in-depth behavior was not fail-visible.

A specific cause of the retained Production zero result **did not become
code-provable**. Current main proves the masking defects, but retained output
cannot distinguish the formerly hidden RPC and response-validation branches.
This repair makes the next run self-identifying and also removes the silent SQL
authorization branch.

## 4. Files changed

- `lib/server/conversation/recoverable-cycle-runner.ts`
- `lib/server/conversation/recovery-handler.ts`
- `lib/server/conversation/productive-cycle-runtime.ts`
- `supabase/migrations/202609090003_recovery_discovery_authorization_failure.sql`
- `test/recoverable-conversation-cycle-runner.test.ts`
- `test/productive-conversation-cycle-runtime.test.ts`
- `test/recovery-discovery-authorization-migration.test.ts`
- this artifact

Migration: `202609090003_recovery_discovery_authorization_failure.sql`.
Historical migrations were not edited.

## 5. RPC contract before and after

Both RPCs retain parameter name `result_limit`, default 100, clamp 1–100,
deterministic ordering, the same UUID/timestamptz return columns, service-role
execute grant, `SECURITY DEFINER`, fixed search path, and side-effect-free
selection. Missing discovery still returns `source_message_id, discovered_at`;
existing discovery still returns `command_id, source_message_id,
lease_expired_at`. Discovery performs no command or business-state mutation.

The functions move from SQL to PL/pgSQL only to assert authority. An authorized
service-role caller reaches the unchanged query and may legitimately receive
zero rows. Any other effective role raises controlled SQLSTATE `42501` instead
of satisfying a false `WHERE` predicate and looking empty. Revocations and
service-role-only grants remain in force; security was not weakened.

## 6. Application error semantics

Before, RPC error and malformed response both became `[]`, then HTTP 200. After,
`RecoveryDiscoveryError` classifies the source as `existing_command` or
`missing_command` and category as `rpc_error` or
`response_validation_error`. RPC diagnostics retain only a bounded safe code and
a fixed summary; raw error detail and payload are not logged. Validation
failures retain only top-level shape, safe row count, and bounded Zod issue
paths/codes.

The recovery handler catches discovery failure, emits one classified structured
error event, returns HTTP 503 with a fixed public error code, and starts no
candidate. Legitimate empty discovery remains HTTP 200. Valid candidates retain
the ordinary path `runPersistentCustomerMessageCycle` →
`acquire_customer_message_cycle_execution` → `claim_customer_message_cycle`.
The acquisition/claim and OpenAI boundaries are unchanged.

## 7. Service-role and response-contract findings

The productive runtime constructs one server-only Supabase client from
`NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` and shares it across
discovery, claim, read, and commit. Configuration now rejects absent or
whitespace-only values before any operation. It does not decode, inspect, or log
the credential and adds no introspection request. A wrong/non-service credential
is made explicit by the database authority and fail-visible adapter.

PostgREST serializes PostgreSQL `timestamptz` as a JSON string, and valid values
can use PostgreSQL's space separator, fractional seconds, and `+00` offset rather
than RFC 3339's `T` and `+00:00`. The former `z.string().datetime()` contract was
therefore unnecessarily narrow and is a code-proven potential parser mismatch.
The new schema still requires a string, an explicit UTC/offset suffix, and a
parseable instant, while accepting realistic
`2026-09-09 12:00:00.123456+00`. Rows and arrays remain strict and bounded.

## 8. Observability

Every successful authenticated scheduled invocation emits
`conversation_cycle_recovery_summary` with all aggregate discovery, execution,
bootstrap, outcome, unexpected-error, and budget counters. A technical discovery
failure emits `conversation_cycle_recovery_discovery_failure` with only source,
category, bounded safe code, and safe summary. Neither event includes message
content, arbitrary RPC payloads, authorization headers, service-role/OpenAI/
WhatsApp credentials, or stack traces. No vendor was added.

## 9. Tests

Focused tests cover legitimate empty and valid missing discovery, existing and
missing RPC failures, both malformed response types, realistic timestamptz,
side-effect-free discovery, ordinary runner flow, processing-command recovery,
HTTP 503 discovery failure, safe structured failure logging, aggregate summary
logging, explicit SQL authorization failure, service-only grants, bounds, and
absence of SQL mutation. Typecheck, lint, focused suites, broader practical
suites, and whitespace validation were run as recorded in the implementation
report. Typecheck, lint, `git diff --check`, and the 61-test focused run passed.
The broad run completed with 1,237/1,239 passing. Its two unrelated existing
failures were the already-documented OpenAI isolation assertion against the
unchanged provider wiring in `productive-cycle-runtime.ts`, and a reviewer
invitation UI focus assertion; neither failure intersects this recovery change.

## 10. Production activation and short verification

1. Activate `202609090003_recovery_discovery_authorization_failure.sql`.
2. Deploy the Vercel Production application.
3. Allow or trigger one normal recovery run.
4. Inspect its one structured summary/failure event and HTTP response.
5. Verify the existing source message now has its normal command and resulting
   response; if discovery fails, the single event supplies its safe source,
   category, and code without further broad diagnostics.

Provided its already-proven state remains current, the stranded message should
be discovered generically and enter ordinary acquisition/claim. No resend,
manual command, or Pending Interaction mutation is required.

**Production migration required: YES**

**Vercel Production deployment required: YES**

**Existing stranded message automatic recovery expected: YES**
