# KlimaGuy MVP Lifecycle PostgreSQL Proof

- **PostgreSQL:** 16.4 (dedicated GitHub Actions service `postgres:16.4`)
- **Baseline commit:** `2ce9516`
- **Schema strategy:** fresh database; a platform-only Auth/Storage compatibility bootstrap is followed by every repository migration in filename order except the three Supabase scheduler migrations listed below. The lifecycle test uses repository authorities and creates no replacement domain schema.
- **Excluded platform schedulers:** `202609020004_productive_conversation_cycle_recovery.sql`, `202609030002_productive_whatsapp_delivery_recovery.sql`, and `202609040003_productive_first_contact_recovery.sql`. Stock PostgreSQL does not provide Supabase's `pg_cron`/`pg_net`; these migrations do not define or replace the three authorities exercised here.
- **Authorities exercised:** `public.transition_conversation_status`, `public.ingest_whatsapp_inbound_text`, and `public.bootstrap_first_contact_foundation`.
- **Drift evidence:** CI records `pg_get_functiondef`, Binding `pg_get_indexdef`, and Binding/Conversation `pg_get_constraintdef` output in the `klimaguy-lifecycle-postgres-evidence` artifact.

## Assertions

| # | Result | Evidence |
|---:|:---:|---|
| 1 | PASS | Stable Identity exists. |
| 2 | PASS | Exactly one active Binding exists before close. |
| 3 | PASS | Conversation N is open before close. |
| 4 | PASS | Supported transition authority closes N. |
| 5 | PASS | Close deletes zero historical rows. |
| 6 | PASS | OLD receipt survives close. |
| 7 | PASS | NEW-WAMID is accepted. |
| 8 | PASS | N remains closed. |
| 9 | PASS | N is never reopened. |
| 10 | PASS | B-N becomes superseded/historical. |
| 11 | PASS | Exactly one new active Binding exists. |
| 12 | PASS | Binding revision is R+1. |
| 13 | PASS | Conversation N+1 is created. |
| 14 | PASS | N+1 is open. |
| 15 | PASS | NEW-WAMID Message belongs only to N+1. |
| 16 | PASS | Stable Customer CUST-1 is reused. |
| 17 | PASS | First Contact creates fresh P-N+1 for CUST-1. |
| 18 | PASS | P-N+1 differs from unchanged P-N. |
| 19 | PASS | N retains P-N. |
| 20 | PASS | N+1 points to P-N+1. |
| 21 | PASS | OLD-WAMID replay is a duplicate/no-op and leaves N+1/P-N+1 unchanged. |
| 22 | PASS | Replay creates zero Messages. |
| 23 | PASS | Replay creates zero Conversations. |
| 24 | PASS | Replay creates zero Projects. |
| 25 | PASS | Replay creates zero Runtime/Cycle commands. |
| 26 | PASS | Replay creates zero outbound delivery work. |
| 27 | PASS | NEW-WAMID-2 reuses N+1/P-N+1 without N+2. |
| 28 | PASS | Follow-up preserves active Binding and revision. |
| 29 | PASS | No physical delete is used. |
| 30 | PASS | All FK/constraint checks commit successfully. |

## Decision

**LIFECYCLE PROOF: PASS**

No lifecycle failure or SQLSTATE was observed. Step 2 may proceed only after this proof PR is reviewed and merged; this PR does not begin or implement Step 2.
