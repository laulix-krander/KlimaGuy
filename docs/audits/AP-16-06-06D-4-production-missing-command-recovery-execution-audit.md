# AP-16-06-06D-4 — Production Missing-Command Recovery Execution Audit

## 1. Executive verdict

**Audit status: ROOT CAUSE NOT YET PROVEN.**

The supplied Production evidence proves that the message is eligible under every
business predicate in `discover_missing_customer_answer_cycles(integer)`, that
the 06D-3A SQL submission completed, that a `main` Production route answered the
scheduler with HTTP 200, and that no command committed. It does **not** contain
the response body produced by that invocation. That body is the only existing
signal which distinguishes these two remaining branches:

1. missing-command discovery was represented as empty, either because PostgreSQL
   saw a non-`service_role` role, PostgREST returned an RPC error, or strict Zod
   validation rejected the response; or
2. discovery returned this message, but acquisition/claim or a later execution
   step returned a controlled failure which the handler counted and still
   answered with 200.

The **narrowest remaining failure boundary** is therefore the boundary from the
missing-command PostgREST RPC response through strict parsing and ordinary
acquisition/claim. Repository code proves a serious observability defect at that
boundary: an RPC `error` and an invalid response body are both silently converted
to `[]`; all item-level runner exceptions and controlled failures are reduced to
counters; and the summary is returned only in the HTTP response. This behavior
exactly permits HTTP 200, no command, no WhatsApp response, and no Vercel error.
It does not prove which of those alternatives occurred in Production.

The runtime is **configured in code** to use `SUPABASE_SERVICE_ROLE_KEY`, and one
client instance is shared by discovery, acquisition, context reads and commits.
The actual Production value, its key type/project, and the resulting database
`auth.role()` are **not proven** by repository state or by successful route
authentication. An absent URL/key would have thrown before discovery and yielded
500, so the observed 200 proves only that both variables were non-empty and that
the two discovery promises settled without a transport-level rejection. It does
not prove service-role identity.

**OpenAI reached in this incident: NOT PROVABLE.** Zero command rows means the
normal path cannot have passed acquisition, context loading, normalization and AI
attempt reservation, but a command could theoretically have been inserted and
rolled back with an enclosing database exception only inside acquisition. No
evidence proves that acquisition was invoked at all. In no remaining explanation
is OpenAI needed to explain the missing command.

## 2. Current-main baseline and scope

Audit date: 2026-09-09 UTC.

| Baseline item | Value |
|---|---|
| Current repository/merged `main` HEAD | `73c2bb098f3bc2e32b01efa3d34b2318f0fe64f9` |
| Checked-out branch at audit start | `work`, at the same `73c2bb0` merge |
| 06D-3 merge | `a5bb1402e1011ab9efbff689071deea354c9ecb5` — PR #192 |
| 06D-3 implementation | `02bdbbd` — `fix: reconcile production conversation cycle authority` |
| 06D-3A merge | `73c2bb098f3bc2e32b01efa3d34b2318f0fe64f9` — PR #193 |
| 06D-3A implementation | `e291051` — `fix production reconciliation type validation` |

There is no local branch named `main`; the checked-out merge history nevertheless
contains PR #192 followed by PR #193 and is the supplied current-main baseline.
The supplied deployment list proves that deployments of those PRs exist and that
the observed request was labelled Production/`main`. Neither repository history
nor the described Vercel screenshot proves the immutable deployment commit SHA.
Accordingly, current main implies the composition audited below, but byte-for-byte
identity of that specific deployment remains external evidence. There is no code
gate which disables missing-command discovery by environment, and the route is
explicitly `force-dynamic`, so repository code provides no stale route-cache
explanation.

Relevant reconciliation migrations are:

- `supabase/migrations/202609090001_production_cycle_schema_reconciliation.sql`;
- `supabase/migrations/202609090002_production_reconciliation_type_compatibility_fix.sql`.

The scheduler authority remains
`supabase/migrations/202609020004_productive_conversation_cycle_recovery.sql`.

Files/functions inspected directly:

- `app/api/internal/conversation-cycles/recovery/route.ts` (`POST` export and
  route runtime controls);
- `lib/server/conversation/recovery-handler.ts`
  (`createConversationCycleRecoveryHandler`, `recoveryTokenMatches`);
- `lib/server/conversation/recoverable-cycle-runner.ts`
  (`discoverRecoverableConversationCycles`,
  `runPersistentCustomerMessageCycle`);
- `lib/server/conversation/productive-cycle-runtime.ts`
  (`createProductiveCycleRuntime`);
- `lib/server/conversation/persistent-cycle-data-source.ts`
  (`createPersistentCycleDataSource`, `claimCustomerMessage`);
- `lib/actions/persistent-conversation-cycle-service.ts`
  (`processPersistentCustomerMessage`);
- `lib/actions/persistent-cycle-context-read.ts`
  (`loadCustomerMessageCycleAuthority`);
- `lib/server/conversation/persistent-cycle-commit.ts` (owned commit, failure,
  AI reservation and deferral RPC adapters);
- the three migrations above, including current definitions of
  `discover_missing_customer_answer_cycles`,
  `discover_recoverable_conversation_cycles`,
  `acquire_customer_message_cycle_execution`, and
  `claim_customer_message_cycle`;
- installed `@supabase/supabase-js` request construction; and focused existing
  recovery/runtime tests.

The required 06D-2, 06D-3, and 06D-3A audit artifacts were read first. Their
already-repaired defects are not reopened by this audit.

## 3. Confirmed Production facts

The following are accepted as incident evidence:

- Conversation `ed8e842d-e6f4-4c5d-9305-e723d6f6794c`, current project
  `75de4d21-e54e-486e-9bff-e8deaace9e85`, is open.
- Inbound/customer/text message
  `9afad389-7d46-4aa2-9669-f7a82ead9854`, sequence 7, occurred at
  `2026-09-09 09:14:50+00` and was persisted at
  `2026-09-09 09:14:52.582553+00`. Its `reply_to_message_id` is null; that is not
  a discovery predicate.
- Prompt `c3ee55ca-63a1-4eaa-8931-ddfadfcad368` is sequence 6.
- Pending interaction `9732fe6a-81bf-4501-a1b6-88834bfe16ff` is active and
  pending for `building_type`, binds snapshot
  `39add45e-bdfb-41be-8f81-df119ece9362`, runtime revision 2, knowledge version
  1 and that prompt, and remains unanswered.
- The conversation/project/runtime/pending/knowledge/snapshot/message proof makes
  every current missing-discovery domain predicate true, including absence of an
  existing command.
- The submitted 06D-3A migration completed with `Success. No rows returned`.
- PRs #192 and #193 were merged/deployed and the observed Production deployment
  is newer than the recovery application change.
- Repeated `pg_net/0.20.4` POSTs to the exact route returned 200, including the
  189 ms invocation begun at 09:15 UTC; Vercel showed no warning/error/fatal.
- A later command lookup for the source message returned zero rows.
- A SQL Editor call to the discovery function returned zero rows, but that
  session's `auth.role()` was not established. Because the SQL function filters
  on `auth.role()='service_role'`, that result is not evidence about the runtime
  call.

## 4. Complete productive recovery call graph

In the table, “200 possible” means the current route can still return 200 after
that outcome; uncaught failures before response construction instead produce an
HTTP 500 platform response.

| # | File / function | Exact input → output | Auth and failure behavior | Incident evidence |
|---:|---|---|---|---|
| 1 | `202609020004…sql`; cron body | Every five minutes, Vault base URL + `/api/internal/conversation-cycles/recovery`, `{}`, bearer Vault secret → `net.http_post` request id | Scheduler has database privileges to read Vault. A missing/nonmatching Vault row creates no HTTP request. | A route request exists, so URL/secret rows selected and `pg_net` sent it. |
| 2 | route `POST` → `createConversationCycleRecoveryHandler()` | POST request → handler response | Node runtime, forced dynamic, 60 s maximum; no cacheable GET. | Exact route, Production and `main` observed. |
| 3 | `recoveryTokenMatches` | `Authorization: Bearer <vault value>` + Vercel `CONVERSATION_CYCLE_RECOVERY_SECRET` → boolean | Missing/blank server secret returns 503; malformed/mismatched bearer returns 401, before runtime. Constant-time digest comparison is used. | 200 proves this invocation passed token validation. It proves equality, not freshness by any independent standard. |
| 4 | `createProductiveCycleRuntime` | `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, optional AI flag → `{discovery, runner}` | Missing URL/key throws and is not caught by handler. One `createClient` is made with session persistence, refresh and URL detection disabled. | 200 proves non-empty variables and no synchronous construction exception. It does not prove their values. |
| 5 | `discoverRecoverableConversationCycles` existing RPC | limit 10 → RPC `discover_recoverable_conversation_cycles({result_limit:10})` → `{data,error}` | Shared Supabase client. Ordinary PostgREST `error` becomes `[]`; invalid strict array/row or >10 rows contributes no candidates. Promise rejection escapes and yields 500. | Under current code, 200 proves this promise settled, not that it succeeded. |
| 6 | same, missing RPC | limit 10 → RPC `discover_missing_customer_answer_cycles({result_limit:10})` → `{data,error}` | Always called after existing RPC settles. Same silent error/parse fallback. Function itself selects only when database role is `service_role`. | Under current code, 200 proves invocation settled. Its data/error/parse branch is unknown. |
| 7 | merge/de-duplicate/limit | parsed existing rows followed by parsed missing rows → at most 10 `{source_message_id, discovery_kind}` | Existing rows have priority. Missing duplicate IDs are omitted. Final slice is 10. No exception for invalid RPC body. | Unknown because response summary is unavailable. Existing candidates could consume all 10, although the 189 ms duration and facts do not prove that. |
| 8 | recovery handler loop | each candidate message UUID, sequentially → result counter | A 45 s start budget can stop later items. Runner exceptions are caught and counted as `unexpected_error`; controlled runner results are counted. No error is logged. 200 remains possible. | Unknown whether this message appeared in the bounded batch or was attempted. |
| 9 | `runPersistentCustomerMessageCycle` | `{message_id}` + runtime runner → one coarse result kind | Invalid UUID returns `failed`. It creates random owner/300 s lease; all orchestration exceptions become `failed` (or `ownership_lost`). 200 remains possible. | UUID is valid; entry is not proven. |
| 10 | `processPersistentCustomerMessage` | validated message identity → persistent result | First action is `source.claimCustomerMessage`. No normalization/AI/domain action precedes it. | Not proven reached. |
| 11 | `claimCustomerMessage` | message UUID, generated owner UUID, lease 300 → RPC `acquire_customer_message_cycle_execution({target_message_id,execution_owner,lease_seconds})` | Same client. RPC error or unexpected JSON maps to `persistence_failed`, then runner `failed`; no log; route 200. Controlled busy/stale also become counters. | Not proven invoked. |
| 12 | SQL `acquire_customer_message_cycle_execution` | exact three arguments → claimed/replay/busy JSON | Requires `auth.role()='service_role'`; otherwise controlled `message_not_found`. Calls claim in the same DB transaction, locks resulting command, assigns owner and lease. Database exception rolls the transaction back and PostgREST returns an error. | 06D-3A defines matching schema/function, but live invocation is unproven. A database error would leave zero command rows and be hidden upstream. |
| 13 | SQL `claim_customer_message_cycle` | `target_message_id` → failure/replay/new processing command JSON | Security definer, but acquisition checks caller role first. Locks message, conversation, runtime, command, pending and knowledge; validates the supplied predicates; INSERT creates the command with reserved IDs. | Current facts satisfy its domain gates. No row proves no successful acquisition transaction committed. |
| 14 | context read and rest of cycle | command id → strict authority → normalization, optional AI reservation/provider, domain cycle and commit | Read RPC errors/shape failures map to controlled failures. Later adapters similarly reduce RPC errors to domain results. A command would normally remain (processing/failed) after a later separate-RPC failure; zero rows points more strongly to pre-acquisition or acquisition rollback. | Not proven reached. |

## 5. Service-role/auth-context analysis

### A–F. Client identity and propagation

`createProductiveCycleRuntime` imports `createClient` directly from
`@supabase/supabase-js`, reads the public URL from
`NEXT_PUBLIC_SUPABASE_URL`, and reads the server credential from the
server-only `SUPABASE_SERVICE_ROLE_KEY`. It does not use an anon/publishable
environment variable. It creates exactly one client and exposes one thin
`source.rpc` adapter. That same object is assigned to `discovery`, `runner.claim`,
`runner.read`, and `runner.commit`; thus existing discovery, missing discovery,
acquisition/claim, context read and all commits use the same key and auth path.

The installed SDK adds the configured key as `apikey`; with no user session it
also uses the configured key as the PostgREST authorization fallback. The
application supplies no custom authorization header, access-token callback,
cookie client, or per-request session which could replace it. Disabling refresh,
persistence and URL session detection prevents browser-session mutation; it does
not promote a key to service role.

This proves what credential the code *selects*, not what Vercel stored. HTTP 200
proves the environment values were present. It does not prove that the value
named `SUPABASE_SERVICE_ROLE_KEY` is the active service-role credential for the
same project URL, nor that PostgreSQL evaluated `auth.role()` as `service_role`.
No runtime assertion records that fact.

### G–H. Failure visibility and wrong-key behavior

The adapter returns Supabase `{data,error}` without throwing on an ordinary
PostgREST error. Discovery explicitly changes any non-null `error` to `[]`, and
does not log the error code/message. A wrong anon/publishable credential can be
denied EXECUTE because grants were revoked, producing an RPC error which becomes
`[]`; if execution is nevertheless available, the SQL `auth.role()` predicate
produces zero rows. With no other candidates, either path yields `discovered:0`,
no runner invocation, no command, no Vercel log, and HTTP 200. Therefore the
observed symptom is exactly compatible with wrong role, but does not prove it.

A network/fetch rejection differs: it rejects the awaited promise, is not caught
by discovery or the handler, and should produce 500 rather than the observed
current-code 200.

## 6. Discovery composition and response validation

Both RPCs are unconditionally awaited in order: existing first, missing second.
Each receives the handler batch size 10, although the reusable function permits
1–100 and falls back to 100 for an invalid caller limit. Existing candidates are
appended first; a set de-duplicates missing candidates by source-message UUID;
missing candidates fill only the remaining slots; a final slice preserves the
bound.

The existing row schema is strict:

```text
{ command_id: UUID, source_message_id: UUID, lease_expired_at: ISO datetime }
```

The missing row schema is strict:

```text
{ source_message_id: UUID, discovered_at: ISO datetime }
```

These field names and UUID types exactly match the SQL return table. A normal
Supabase/PostgREST `timestamptz` JSON value is a string accepted by Zod's ISO
datetime parser when formatted with a supported offset. The known SQL shape is
therefore compatible. However, strict parsing rejects extra/missing/null fields,
unsupported timestamp formatting, a non-array response, or more rows than the
requested limit. `safeParse` is used, and a failed parse is simply not appended.
Thus an unexpected shape can silently erase all candidates and still return 200.
Repository evidence supplies no live response body, so schema mismatch is
possible but not established.

## 7. Scheduler authentication analysis

The migration schedules one job named `conversation-cycle-recovery` every five
minutes. Its SQL joins Vault secrets named `KLIMAGUY_PRODUCTION_BASE_URL` and
`CONVERSATION_CYCLE_RECOVERY_SECRET`, validates a basic HTTPS host shape and a
non-empty secret, then constructs `Authorization: Bearer <secret>` and JSON `{}`.
It does not read a Supabase service-role key.

The application compares that bearer with its independently configured Vercel
variable of the same name. A current-handler 200 conclusively proves that the
request passed both the non-empty-secret and exact-token checks; there is no
authenticated 200 shortcut before runtime construction and discovery. It does
not prove a separate notion of “current”: it proves only that Vault and Vercel
held equal values at request time. Nor does scheduler authentication establish
the separate database client's service role.

## 8. Supabase RPC error-handling analysis

| Failure at missing discovery | SDK/adapter result | Composition result | Route/log result |
|---|---|---|---|
| Function absent or stale PostgREST schema cache | ordinary PostgREST `error` | `[]` | 200 if no uncaught failure; no application log |
| EXECUTE permission denied / wrong database role | `error`, or empty data if SQL can run but role predicate is false | `[]` | same |
| Wrong argument/signature / stale function signature | PostgREST `error` | `[]` | same |
| Database exception | PostgREST `error` | `[]` | same |
| Malformed/unexpected successful body | `error:null`, failed `safeParse` | `[]` | same |
| Transport/fetch rejection | rejected promise | not mapped | uncaught; expected 500 |

Acquisition errors are also hidden, but one layer later: its adapter returns
`persistence_failed`, the runner returns `failed`, and the handler increments a
counter. Context-read parse/RPC errors similarly map to `authority_incomplete`
and then failure. No layer logs error metadata. This makes 200 evidence of
handler completion, not successful work.

## 9. PostgREST/function-signature analysis

Current SQL defines exactly
`public.discover_missing_customer_answer_cycles(result_limit integer default
100)` and grants `execute` only to `service_role` after revoking
`public`, `anon`, and `authenticated`. The JS invocation key is exactly
`result_limit`, so it matches PostgREST named-argument dispatch; it supplies 10
and does not rely on the default. The return fields are exactly
`source_message_id uuid` and `discovered_at timestamptz`, matching JS field names
and expected scalar serialization.

Neither reconciliation migration explicitly issues `NOTIFY pgrst,
'reload schema'`. Repository code cannot prove the managed Supabase/PostgREST
instance's schema-cache refresh timing after DDL. A stale cache can make a newly
created or changed RPC unavailable/signature-mismatched at the API boundary;
that condition would be returned as a PostgREST error and current code would hide
it. Whether Supabase automatically refreshed the cache for this Production DDL
requires live evidence and is not inferred here.

The reported direct SQL call establishes PostgreSQL function visibility to that
SQL session, but not PostgREST cache visibility and not service-role results.

## 10. Acquisition/claim analysis

The successful 06D-3A script contains the required context/reservation,
`commit_payload_hash`, ownership/lease and AI-attempt columns, validates their
catalog types/nullability, and reinstalls the current functions. On the supplied
activation fact, repository intent is therefore that required columns and RPCs
exist. This audit has no contradictory live catalog evidence and does not
reclassify the repaired schema defects as unresolved.

TypeScript sends the acquisition signature exactly as SQL declares it:

- `target_message_id`: incident message UUID;
- `execution_owner`: a fresh UUID;
- `lease_seconds`: 300 (within SQL's 30–900 range).

Acquisition first verifies service role and arguments, then calls claim. Claim's
first insert is the command creation point. Acquisition subsequently locks the
command and writes owner/lease metadata in the same PostgreSQL RPC transaction.
An exception after INSERT rolls back the entire RPC, leaving zero rows; PostgREST
returns an error, TypeScript maps it to `persistence_failed`, the runner maps it
to `failed`, and the handler still returns 200. A controlled pre-insert claim
failure likewise creates no row. Those behaviors fit the incident, but the
current supplied predicates rule out the known domain failures and there is no
summary proving acquisition was reached.

After a committed acquisition, context read is a separate RPC. A failure there
would ordinarily leave the processing command committed, not erase it. The
observed zero rows therefore localizes the incident to no acquisition, a
controlled pre-insert result, or acquisition transaction rollback—not OpenAI,
domain planning, commit, or WhatsApp delivery.

## 11. Recovery summary and observability

The handler constructs all required counters: `discovered`,
`existing_command_discovered`, `missing_command_discovered`,
`missing_command_bootstrap_succeeded`, `missing_command_bootstrap_failed`,
`attempted`, each result kind (`completed`, `human_review`, `failed`, `busy`,
`stale`, `ownership_lost`, `already_terminal`), `unexpected_error`, and
`budget_exhausted`.

Current application code emits this object only as the response JSON. It does
not log it, persist it, attach it to an audit row, or return it to another
application service. The cron SQL ignores the request id after submitting
`net.http_post`. Vercel request logs show status/duration but, on the supplied
evidence, not the response body. `pg_net` may retain HTTP responses in its
extension-owned response relation according to the installed extension's runtime
configuration, but retention/content for this Production project is not proven
by repository code. The summary is therefore effectively invisible in the
evidence currently available.

The smallest durable observability improvement is one privacy-safe structured
server log per recovery invocation containing the existing numeric summary plus
sanitized discovery-stage status categories (`ok`, `rpc_error`, `parse_error`)
for each RPC—never message IDs, message text, keys, or raw database errors. That
single event would distinguish auth/schema/cache/shape discovery failure from
acquisition failure without business-data mutation. This is a recommendation,
not implemented here.

## 12. Root-cause determination

**ROOT CAUSE NOT YET PROVEN.**

Established current-code path, proven eligibility, successful scheduler auth and
zero commands satisfy all conditions before productive discovery. The missing
Production response summary prevents identification of the exact failing branch.
The strongest code finding is the silent loss of both discovery RPC errors and
parse errors, compounded by swallowed runner failures. That is a proven
observability defect and a fully matching mechanism, but not proof that an error
occurred rather than a false-role empty result or acquisition failure.

### One single smallest Production diagnostic step

Run **one read-only SQL query** in the Supabase SQL Editor to retrieve the most
recent retained `pg_net` response whose JSON body contains the recovery summary
key `missing_command_discovered`:

```sql
select
  id,
  status_code,
  created,
  content::jsonb as recovery_summary
from net._http_response
where status_code = 200
  and content is not null
  and content::jsonb ? 'missing_command_discovered'
order by created desc
limit 1;
```

This is one observation and performs no recovery or business mutation. A row
with `missing_command_discovered = 0` localizes the failure to service-role/RPC
error/response parsing (which current summary unfortunately cannot further
separate). A positive value with `missing_command_bootstrap_failed > 0` proves
discovery and localizes it to acquisition/claim or subsequent execution; zero
`attempted` with `budget_exhausted=true` instead proves batch/budget starvation.
If no row is retained, that single result also proves the existing summary is not
available through retained `pg_net` evidence and the recommended durable event
is the next safe repair prerequisite.

## 13. Smallest safe eventual repair package

Do not change business rules or backfill the incident. First obtain the single
summary observation above. Then ship the narrow package selected by it:

1. **Always needed for reliable diagnosis:** stop silently conflating discovery
   errors/parse failures with empty successful results; expose sanitized stage
   outcomes and the existing summary in one structured server log, with no PII or
   secrets. Preserve HTTP semantics deliberately rather than leaking raw errors.
2. **If missing discovery is zero due to auth/configuration:** correct the Vercel
   server credential/project pairing and add a fail-closed service-role readiness
   check. This is configuration/application deployment work, not a database
   migration unless live evidence instead identifies grants/signature/cache DDL.
3. **If missing discovery is positive but bootstrap fails:** use the same single
   event to retain the sanitized acquisition result class, then issue the minimal
   forward-only function/schema repair only if a live database incompatibility is
   proven. Do not replay historical migrations or insert commands manually.

No model, prompt, pricing, planner, quotation, WhatsApp-delivery, Pending
Interaction, or historical-message behavior belongs in this package.

## 14. Required explicit determinations

**Production migration required for eventual repair: NOT YET DETERMINABLE**

**Vercel Production deployment required for eventual repair: NOT YET DETERMINABLE**

**OpenAI reached in this incident: NOT PROVABLE**

The first two answers depend on the one retained summary: an incorrect Vercel
credential or application observability fix requires deployment but no migration;
a proven live RPC/grant/signature authority defect may require a forward-only
migration; an acquisition result may select either. Current facts do not justify
choosing one.
