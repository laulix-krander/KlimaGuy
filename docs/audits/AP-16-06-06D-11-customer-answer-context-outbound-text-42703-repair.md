# AP-16-06-06D-11 — Customer-Answer Context `outbound_text` 42703 Repair

## 1. Implementation status and baseline

Implementation status: **complete**. Baseline SHA: `48943ebf9db1d3d399906346c4700c25fae4f398`. Current main, the effective context-read authority, physical schema migrations, and artifacts 06D-7, 06D-9, and 06D-10 were read before implementation.

## 2. Confirmed Production evidence

After activation of 06D-10, scheduled Production recovery discovered the existing command, rehabilitated it once, acquired it, and established ownership. The same invocation then failed at `context_read` with `failure_category=rpc_error`, SQLSTATE `42703`, `authority_context_loaded=false`, `ai_attempt_reservation_reached=false`, and successful failure persistence. The summary reported one existing command discovered, one attempt, one technical rehabilitation, one failure, and no discovery degradation. Thus discovery, 06D-9 rehabilitation, claim, acquisition, ownership, and failure persistence are healthy; failure is isolated to execution of the context RPC before normalization or OpenAI.

Production has consumed rehabilitation count 1 and lifetime attempt 11. This repair does not reset either value. Ordinary recovery retains attempts 12–20 in the one fresh epoch.

## 3. Exact remaining undefined column and invalid references

The effective `public.get_customer_message_cycle_context(uuid)` from `202609090004_customer_answer_context_rpc_repair.sql` used `s` as a `%rowtype` value from `public.conversation_interaction_snapshots`, but referenced the nonexistent physical field `s.outbound_text` twice:

```sql
prompt_body <> s.outbound_text
```

and:

```sql
'outbound_text', s.outbound_text
```

The first attempted to enforce prompt/snapshot text identity; the second attempted to populate the returned snapshot DTO. Either reference resolves only when the PL/pgSQL statement executes and causes SQLSTATE 42703.

## 4. Physical schema authority and exact replacement

`202609010001_planner_snapshot_persistence.sql` establishes all physical snapshot columns: `id`, `pending_interaction_id`, `conversation_id`, `project_id`, `runtime_revision`, `knowledge_state_version`, `outbound_message_id`, `outbound_message_sequence`, `snapshot_schema_version`, `selected_action`, `rendered_interaction`, and `created_at`. It establishes no `outbound_text` column. That migration stores physical outbound text as `public.conversation_message_text.body`, linked by `message_id=s.outbound_message_id`, and its activation authority proves immutable text identity with:

```sql
concat_ws(E'\n\n',
  s.rendered_interaction->>'primary_text',
  s.rendered_interaction->>'supporting_text',
  s.rendered_interaction->>'help_text'
)
```

The new function computes this expression once in `rendered_outbound_text`, compares `prompt_body` against that variable, and emits the DTO property `snapshot.outbound_text` from the same variable. It neither adds a snapshot column nor weakens prompt identity.

The regression maps every alias-qualified reference for `cmd`, `c`, `r`, `p`, `m`, `pm`, `s`, `mt`, `ks`, `kc`, and `ke` to columns derived from physical `CREATE TABLE` and `ALTER TABLE ... ADD COLUMN` migration authority. All snapshot references listed above are physical columns; no other derived DTO property is read as a snapshot field.

## 5. Why 06D-10 did not repair context read

06D-10 deliberately replaced only discovery and claim, the two authorities reached by the then-observed failure path. Its schema-contract test extracted and validated the discovery query, while a separate assertion checked claim's known bad text reference. It did not inspect the independently defined context-read function. Consequently discovery and claim adopted the schema-backed `rendered_interaction` reconstruction, but the same DTO/physical-schema confusion survived in the effective context RPC and became visible only after recovery advanced beyond acquisition.

The 06D-11 regression extends that migration-derived schema-contract technique to every alias-qualified physical-column reference in context read. Together, the 06D-10 and 06D-11 coverage protects discovery, claim, and context read rather than relying only on expected SQL fragments or TypeScript DTO fixtures.

## 6. Migration and context RPC contract

Migration filename: **`supabase/migrations/202609090007_customer_answer_context_outbound_text_repair.sql`**. It is the sole new forward-only migration and replaces only `public.get_customer_message_cycle_context(target_command_id uuid) returns jsonb`.

Before and after, the function accepts exactly one UUID named `target_command_id` and returns JSONB. It remains PL/pgSQL, `SECURITY DEFINER`, with fixed `search_path=public,pg_temp`, explicit effective-role rejection, revocation from `public`, `anon`, and `authenticated`, and execution granted only to `service_role`.

All business authority remains unchanged: customer-answer/processing command state, current conversation/project/runtime/knowledge authority, active pending interaction, snapshot linkage, source and prompt validity, ordering, command/context identities, stable reservations and event IDs, and planner/snapshot consistency. The migration contains no DML, incident UUID, destructive mutation, recovery change, or table alteration.

## 7. Returned DTO and application compatibility

The JSON shape is unchanged. In particular, `snapshot.outbound_text` remains present and equals the immutable reconstructed snapshot text. Only its SQL source changes from an invalid physical-field access to the established reconstruction. The current TypeScript/Zod parser continues to accept valid acquired processing-command context JSON, including PostgreSQL-style timestamp strings normalized before strict validation. No TypeScript application code changed.

## 8. Recovery, rehabilitation, and OpenAI boundaries

The migration does not alter discovery, claim, acquisition, lease/owner fencing, `technical_rehabilitation_count`, rehabilitation bounds, lifetime `execution_attempt_count`, epoch accounting, missing/existing discovery composition, partial-degradation behavior, failure persistence, or scheduler behavior. The existing rehabilitated command remains generically recoverable during its remaining fresh-epoch budget.

Structured inference provider, OpenAI adapter, model, prompt, timeout, feature gate, retries, matching semantics, and AI counters are unchanged. OpenAI was not reached before repair. After activation, processing reaches normalization and reaches OpenAI only if normal eligibility requires it.

## 9. Tests

Focused SQL regression covers the absent physical column, all alias-qualified schema references, one-time reconstruction from `rendered_interaction`, prompt identity, preserved DTO property/value, signature, service-only authorization, returned context shape, read-only migration behavior, and absence of incident UUIDs. Existing context adapter tests cover successful authority parsing, Zod compatibility, strict cross-binding, and PostgreSQL timestamp normalization. Existing 06D-9, 06D-10, recoverable-runner, and productive-runtime suites cover rehabilitation, discovery/claim, retry, normalization, AI boundaries, and ownership fencing. Full validation results are reported in the implementation commit/final report.

## 10. Production activation

1. Activate `202609090007_customer_answer_context_outbound_text_repair.sql`.
2. Do not deploy Vercel because application code did not change.
3. Allow one scheduled recovery run.
4. Inspect one recovery item and summary event.
5. Verify that the WhatsApp conversation progresses.

No customer resend, command mutation, state reset, incident-specific DML, or additional diagnostic SQL series is required.

**Production migration required: YES**

**Vercel Production deployment required: NO**

**Existing rehabilitated command automatic retry expected: YES**

**Customer resend required: NO**

**OpenAI reached before repair: NO**

**OpenAI expected afterward: DEPENDS ON NORMAL ELIGIBILITY**
