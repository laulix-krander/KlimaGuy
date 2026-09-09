# AP-16-06-06D-3A — Production reconciliation type compatibility fix

## 1. Status and baseline

Implementation status: **complete**. The inspected baseline main SHA was
`a5bb1402e1011ab9efbff689071deea354c9ecb5`.

The historical 06D-3 audit and migration were read before implementation. The
historical migration `202609090001_production_cycle_schema_reconciliation.sql`
was left unchanged because it is merged and has already been submitted in
Production.

## 2. Production error and root cause

The exact reported failure was:

```text
ERROR: P0001:
incompatible conversation_cycle_commands columns: event_ids

CONTEXT:
PL/pgSQL function inline_code_block line 33 at RAISE
```

The historical validator joins `information_schema.columns` and compares
`data_type` with hand-written display strings. That happens to work for its
`uuid`, `timestamp with time zone`, `integer`, and `bytea` expectations, but it
is not correct for `event_ids`: the SQL-standard information schema reports an
array's `data_type` as `ARRAY`, not `uuid[]`. Consequently, the migration adds a
correct `uuid[]` column and then falsely rejects it.

## 3. Forward-only migration

New migration:
`202609090002_production_reconciliation_type_compatibility_fix.sql`.

It repeats the 06D-3 idempotent column additions, compatibility checks,
constraints, foreign keys, index, trigger authority, productive RPC definitions,
comments, revocations, and service-role grants. This deliberately produces the
same final schema and authority surface whether the earlier attempt left none,
some, or all of that surface. It performs no incident repair and contains no
incident UUID or business-data backfill.

## 4. Exact type-validation strategy

The validator now reads live, non-dropped user columns from
`pg_catalog.pg_attribute` for the exact
`'public.conversation_cycle_commands'::regclass`. It compares each column's
`atttypid` with `pg_catalog.to_regtype(expected_type)::oid` and checks required
non-nullability with `attnotnull`.

This is native type identity rather than a formatted or SQL-standard category:

- `uuid` resolves to the scalar UUID type OID;
- `uuid[]` resolves to the UUID array type OID, distinct from scalar `uuid`;
- `integer` resolves to PostgreSQL `int4` identity;
- `bytea` resolves to its exact binary-string type identity;
- `timestamp with time zone` resolves to PostgreSQL `timestamptz` identity.

Thus a correct `event_ids uuid[]` is accepted, `event_ids uuid` is rejected, and
materially different scalar, array, timestamp, integer, or binary types remain
rejected. `format_type` is unnecessary because no human-readable rendering is
compared. `udt_name` is also unnecessary because `atttypid` is the exact catalog
authority.

## 5. Transaction and partial-application reasoning

The reported exception arose in a `DO` statement after multiple preceding
`ALTER TABLE` statements. PostgreSQL rolls back the failing statement. When a
multi-statement query is delivered as one simple-query message without explicit
transaction control, PostgreSQL executes it as one implicit transaction, so the
batch rolls back. However, the repository cannot establish whether the Supabase
SQL Editor submitted this pasted script as one query message, split it into
statements, or wrapped it in an explicit transaction. If statements were split,
earlier DDL may already have committed even though the `DO` statement failed.

The repair therefore does not depend on either client behavior: `ADD COLUMN IF
NOT EXISTS`, catalog validation, normalized constraints, `CREATE INDEX IF NOT
EXISTS`, and `CREATE OR REPLACE FUNCTION` safely reconcile an absent, partial,
or complete 06D-3 surface. Genuine incompatible existing columns and invalid
counter data still fail loudly before productive functions are reinstalled. No
destructive type conversion or business-data mutation is attempted.

## 6. Recovery and authority invariants

The productive function definitions after the validator are byte-for-byte the
same as 06D-3. In particular,
`discover_missing_customer_answer_cycles(integer)` remains bounded,
deterministic, service-role-only, side-effect-free, and discovery-only. It does
not insert commands. Candidates continue through the existing application path
`runPersistentCustomerMessageCycle` →
`acquire_customer_message_cycle_execution` →
`claim_customer_message_cycle`. AI attempt authority remains constrained to
0–3. No Conversation Cycle, recovery, OpenAI, WhatsApp, pricing, or product
behavior changed.

## 7. Files changed

- `supabase/migrations/202609090002_production_reconciliation_type_compatibility_fix.sql`
- `test/production-reconciliation-type-compatibility-fix.test.ts`
- `docs/audits/AP-16-06-06D-3A-production-reconciliation-type-compatibility-fix.md`

Historical migration `202609090001_production_cycle_schema_reconciliation.sql`
was **not modified**.

## 8. Tests

Focused regression coverage checks the exact OID validator, the distinct
`uuid[]` expectation and scalar `uuid` rejection, all required type families,
counter nullability/range, identical post-validator schema/RPC authority,
service-role-only missing-message discovery, unchanged recovery SQL, and absence
of incident UUIDs. Validation results:

- `npm run typecheck`: passed.
- `npm run lint`: passed.
- focused Conversation Cycle, schema reconciliation, missing-command recovery,
  persistent-cycle, and AI authority suites: 47/47 tests passed.
- `npm test`: 1,230/1,231 tests passed. The one failure is the unchanged,
  pre-existing OpenAI isolation assertion against
  `lib/server/conversation/productive-cycle-runtime.ts`.
- `git diff --check`: passed.

No local PostgreSQL/Supabase execution harness is configured in this repository,
so catalog behavior is regression-tested structurally rather than by applying
the migration to a local database.

## 9. Production activation

1. Apply
   `supabase/migrations/202609090002_production_reconciliation_type_compatibility_fix.sql`
   to Production as one migration through the normal migration path.
2. Confirm successful completion and migration-history recording.
3. Allow the already-deployed scheduled recovery flow to discover and process
   eligible missing-command messages through normal acquisition/claim authority.
4. Do not manually insert commands or mutate pending interactions, runtime,
   knowledge, Conversations, messages, or outbound rows.

No application code changed in this package, so no new Vercel deployment is
required. An existing stranded message is expected to recover automatically
after schema activation if its eligibility state remains current.

**Production migration required: YES**

**Vercel Production deployment required: NO**

**Existing stranded message automatic recovery expected after successful activation: YES**
