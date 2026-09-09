# AP-16-06-06D-10 — Existing Recovery Discovery 42703 Repair

## 1. Implementation status and baseline

Implementation status: **complete**. Baseline SHA: `301b029d3b0a150135730ccb8786d9e3d9f96f57`. Current main, artifacts 06D-7 through 06D-9, migrations through `202609090005`, original table migrations, and the productive recovery implementation were read first.

## 2. Confirmed Production evidence

After activation of 06D-9, existing-command discovery emitted `conversation_cycle_recovery_discovery_failure` with `discovery_source=existing_command`, `failure_category=rpc_error`, safe SQLSTATE `42703`, and the fixed PostgREST summary. The run returned HTTP 503 with zero discovered/attempted candidates, `recovery_degraded=true`, `existing_command_discovery_failed=true`, and `missing_command_discovery_failed=false`. This localizes the failure before claim, rehabilitation, or OpenAI.

## 3. Exact undefined column and cause

The exact undefined reference is **`s.outbound_text`**, where `s` is `public.conversation_interaction_snapshots`. The original table authority in `202609010001_planner_snapshot_persistence.sql` stores `rendered_interaction` JSON and the outbound message identity/sequence, but has no `outbound_text` column. Outbound text is stored under the linked message in `public.conversation_message_text.body`; `planner_snapshot_dto` only derives an `outbound_text` response property by joining that table. No migration through `202609090005` adds `conversation_interaction_snapshots.outbound_text`.

06D-9 treated the derived DTO property as a physical snapshot column in both discovery and the claim revalidation. Every other qualified discovery reference was checked against its exact migration-established table and exists. PostgreSQL accepts creation of this PL/pgSQL function body but resolves the SQL statement on execution, producing SQLSTATE 42703.

## 4. Why prior tests missed it

The 06D-9 migration tests asserted selected SQL strings and explicitly expected `mt.body=s.outbound_text`; they did not compile the complete query or validate alias-qualified references against migration-established physical columns. TypeScript fixtures also expose the derived `outbound_text` DTO property, which concealed the distinction between RPC output shape and table schema.

The new regression test derives physical columns from original `CREATE TABLE` and forward `ALTER TABLE ... ADD COLUMN` migration authority, extracts every qualified discovery reference for every alias, and rejects references absent from the corresponding table. Since this repository has no executable PostgreSQL test service/tooling, this is the strongest available schema-contract validation rather than another expected-string-only check. Focused behavioral tests additionally model all eligibility, exclusion, ordering, and limit branches.

## 5. Exact forward-only repair

Migration: **`supabase/migrations/202609090006_existing_recovery_discovery_undefined_column_repair.sql`**.

The migration replaces only `discover_recoverable_conversation_cycles(integer)` and `claim_customer_message_cycle(uuid)`. Both replace the nonexistent comparison:

```sql
mt.body = s.outbound_text
```

with the schema-backed equivalent used by snapshot creation authority:

```sql
mt.body = concat_ws(E'\n\n',
  s.rendered_interaction->>'primary_text',
  s.rendered_interaction->>'supporting_text',
  s.rendered_interaction->>'help_text'
)
```

The message text remains bound to `s.outbound_message_id` through the existing prompt/snapshot joins. Replacing claim too is necessary: otherwise discovery would emit the candidate and acquisition would invoke the same invalid 06D-9 claim predicate and fail before rehabilitation. No table alteration, incident DML, application change, or historical migration edit is included.

## 6. Discovery contract before and after

The SQL return contract is unchanged: `command_id uuid`, `source_message_id uuid`, `lease_expired_at timestamptz`, and `requires_technical_rehabilitation boolean`. Ordering, global clamped limit, and application parsing remain unchanged. The only predicate change is the physically valid expression of the same immutable snapshot-to-message text identity rule.

## 7. Rehabilitation and business authority preserved

Discovery still admits expired ordinary processing commands, ordinary `failed/persistence_failed` commands below ten attempts, and exactly-ten customer-answer failures with `technical_rehabilitation_count=0` and the rehabilitation marker. A command exhausted after the sole fresh epoch remains excluded. Claim still atomically consumes rehabilitation once, preserves monotonic lifetime attempts, and leaves acquisition fencing/accounting unchanged.

Open conversation/current project, awaiting-customer-answer runtime, active pending/unanswered interaction, conversation/runtime/knowledge revisions, current project knowledge, snapshot linkage, prompt/source type and ordering, text identity, and newer-answer exclusion all remain mandatory. Completed, Human Review, answered, stale, superseded, and second-epoch-exhausted work remain excluded.

## 8. Security preserved

Both replaced functions remain `SECURITY DEFINER` with fixed `search_path=public,pg_temp`, explicitly reject a non-service effective role, revoke execution from `public`, `anon`, and `authenticated`, and grant execution only to `service_role`. Discovery remains side-effect free.

## 9. Tests

Focused coverage validates every alias-qualified discovery column against migration schema authority; the exact absent snapshot column and replacement; ordinary processing and below-ceiling failure discovery; exactly-ten rehabilitation marking; post-rehabilitation exhaustion; completed/Human Review/answered/runtime-stale/knowledge-stale/newer-answer exclusion; deterministic ordering; global limit; service authorization and grants; unchanged parser/composition behavior; partial degradation; and claim/acquisition rehabilitation behavior. Typecheck, lint, focused suites, full Vitest, and diff checks are recorded in the final report.

## 10. Production activation and minimal verification

1. Activate `202609090006_existing_recovery_discovery_undefined_column_repair.sql` in Production.
2. Do not deploy Vercel; application code did not change.
3. Allow one scheduled recovery run.
4. Inspect one recovery summary and rehabilitation event.
5. Verify the WhatsApp conversation progresses.

No diagnostic SQL series, incident mutation, replacement command, state reset, or customer resend is required. Assuming business authority remains current, ordinary scheduled recovery is expected to discover and rehabilitate the existing generic eligible command automatically.

**Production migration required: YES**

**Vercel Production deployment required: NO**

**Existing exhausted command automatic rehabilitation expected: YES**

**Customer resend required: NO**

**OpenAI reached before repair: NO**
