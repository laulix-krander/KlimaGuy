# AP-16-06-06D-7 — Customer-Answer Context RPC Repair and Technical Resume

## 1. Implementation status and baseline

Implementation status: **complete**. Baseline SHA: `28808f7f8badf186c7edaa2930d4199ed2b17d2e`.
Current main and artifacts 06D-2, 06D-3, 06D-3A, 06D-4, 06D-5, and 06D-6 were read before implementation.

## 2. Confirmed Production evidence

The scheduled recovery acquired command `bbd0df13-47f1-4b68-a4ab-9d372611465f` for the documented source message, then emitted `stage=context_read`, `failure_category=rpc_error`, `authority_context_loaded=false`, `ai_attempt_reservation_reached=false`, and `failure_persistence_succeeded=true`. This proves discovery, acquisition, and ownership succeeded and localizes the incident to the PostgREST invocation of the context RPC. Incident UUIDs and the supplied customer text occur only in this implementation artifact, never in application code or SQL.

## 3. Exact PostgREST/RPC root cause

Every effective definition of `get_customer_message_cycle_context`—the original `202609010002`, reconciliation `202609090001`, and compatibility replacement `202609090002`—declared a PL/pgSQL variable named `body`, then executed:

```sql
select body into body from public.conversation_message_text where ...;
```

With PL/pgSQL's default variable/column conflict behavior, unqualified `body` can refer to both the local variable and the table column. PostgreSQL raises SQLSTATE **`42702` (`ambiguous_column`)** when execution reaches that statement. The same defect was repeated for the prompt text read. This is the exact code-proven database-contract failure matching the productive `context_read / rpc_error` boundary. It is not a timestamp parser, discovery, scheduler, credential, acquisition, lease, AI, or business-state failure.

Acquisition succeeds because `acquire_customer_message_cycle_execution` and `claim_customer_message_cycle` do not execute either ambiguous text query. Only the subsequent context function reads `conversation_message_text.body`, so its transaction fails independently after ownership has already committed.

## 4. RPC contract and schema compatibility

Before and after, the sole exposed signature is `public.get_customer_message_cycle_context(target_command_id uuid) returns jsonb`; the TypeScript RPC call uses the exact argument name `target_command_id`. There are no defaults or repository-defined overloads. It remains `LANGUAGE plpgsql`, `SECURITY DEFINER`, with fixed `search_path=public,pg_temp`. Execute is revoked from `public`, `anon`, and `authenticated` and granted to `service_role`. The repaired body additionally raises SQLSTATE `42501` for a non-service effective role rather than masking it as `command_not_found`.

The RPC reads the command, conversation, runtime, pending interaction, snapshot, source/prompt messages and text, project knowledge state/claims/evidence, information collection, retry, effort, and evidence-request state. It constructs strict command, source-message, pending-interaction, snapshot, and cycle-context JSON. Its UUID reservations, `uuid[] event_ids` cardinality, `timestamptz` execution/occurrence fields, snapshot/rendered interaction JSON, knowledge versions, ownership-independent processing status, and all referenced columns are compatible with the post-`202609090001`/`002`/`003` reconciled authority. `event_ids` uses `to_jsonb(uuid[])`; no bytea/hash serialization enters this read. No obsolete enum, reservation, execution-owner, or stale knowledge/pending field was found in the context payload.

The repair qualifies both expressions as `mt.body`, retaining the local variables only as destinations. Return shape and strict timestamp normalization/validation remain unchanged.

## 5. Files changed

- `supabase/migrations/202609090004_customer_answer_context_rpc_repair.sql`
- `lib/actions/persistent-cycle-context-read.ts`
- `lib/actions/persistent-conversation-cycle-service.ts`
- `lib/domain/conversation-cycle-orchestration.ts`
- `lib/server/conversation/persistent-cycle-data-source.ts`
- `lib/server/conversation/recoverable-cycle-runner.ts`
- `lib/server/conversation/recovery-handler.ts`
- focused context, recovery-log, and migration tests
- this artifact

Historical migrations were not edited. Migration filename: **`202609090004_customer_answer_context_rpc_repair.sql`**.

## 6. Safe RPC observability and failure classification

The context adapter retains a bounded safe code only when it matches an uppercase/alphanumeric SQLSTATE/PostgREST form. It maps codes to fixed summaries: authorization/configuration, function/schema-cache, database-contract, transient database/transport, or unknown RPC error. It never retains the vendor message, details, hint, payload, stack, message text, headers, or credentials. Controlled JSON authority rejections and strict response-validation failures remain distinct categories.

The diagnostics propagate through the data source, orchestration result, and runner. `conversation_cycle_recovery_item_failure` conditionally includes `safe_rpc_code` and `safe_rpc_summary`; the known failure would therefore identify `42702 / database_contract_error` in one structured event.

## 7. Technical-failure resume semantics

The previous claim function reopened every `failed` command, while discovery selected only `processing` rows. That combination both stranded terminal failures and was too broad if invoked directly. The new authority is explicit and bounded:

- recovery discovery includes failed customer-answer commands only when `result_code='persistence_failed'` and `execution_attempt_count < 10`;
- ordinary claim locks and fully revalidates the open conversation, current runtime, pending interaction, knowledge version, snapshot, and prompt ordering before reopening;
- claim reopens only that same bounded persistence-failure class, clears its technical terminal marker, and retains all stable command/reservation IDs;
- acquisition then establishes a fresh owner/lease and increments the attempt counter, preserving fencing;
- completed, stale, Human Review, normalization, cycle, invalid-input, and other non-persistence failures cannot be reopened;
- repeated discovery/claim is idempotent and the ten-attempt ceiling prevents an unbounded poison loop.

No incident-specific DML, manual row reset, Pending Interaction mutation, command recreation, customer resend, or destructive business mutation is required. The existing failed answer is expected to be found by ordinary recovery, provided its authoritative business state remains current and its attempt count is below the bound.

## 8. Tests and boundaries

Focused tests cover the exact RPC signature, service-only grant and explicit rejection, qualified column reads, reconciled table/column references, strict PostgreSQL timestamp normalization, valid authority parsing, safe RPC classifications, diagnostic propagation/logging, absence of sensitive content, bounded failed-command discovery/resume, closure of completed/stale/Human Review/non-retryable commands, processing lease discovery, and absence of incident IDs. Existing service/runner tests preserve normalization, exact-match AI-free behavior, normal AI eligibility/reservation, and ownership fencing.

The OpenAI provider, model, prompt, feature gate, timeout, retry logic, and matching semantics were not changed. OpenAI was not reached before repair. After repair it is reachable only if ordinary normalization and existing eligibility require fallback; exact matches remain AI-free.

## 9. Production activation and verification

1. Activate `202609090004_customer_answer_context_rpc_repair.sql`.
2. Deploy the Vercel Production application.
3. Allow one scheduled recovery cycle.
4. Inspect its single structured item/summary event.
5. Verify the existing answer progresses and the ordinary WhatsApp response is delivered.

If context read still fails, the item event now supplies the safe RPC class/code without another broad SQL investigation.

**Production migration required: YES**

**Vercel Production deployment required: YES**

**Existing customer answer automatic resume expected: YES**

**OpenAI expected to become reachable after repair: DEPENDS ON NORMAL ELIGIBILITY**
