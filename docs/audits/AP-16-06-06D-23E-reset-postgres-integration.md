# AP-16-06-06D-23E — Reset PostgreSQL integration

## Status and decision

**Integration status: PENDING. Migration 0006: PENDING.**

This change supplies the isolated real-PostgreSQL acceptance harness required by D-23D. At the time this audit was written, Codex could not observe a completed GitHub Actions run. Consequently, none of the engine assertions is represented as accepted evidence and no PASS is manufactured. There is no migration 0006, production RPC change, application change, deployment, or Production access in this PR.

## PostgreSQL and CI identity

- PostgreSQL image/version requested by CI: `postgres:16.4-alpine` (PostgreSQL 16.4).
- Workflow: `D-23E Reset PostgreSQL Integration`.
- Dedicated job/check: `reset-postgres-integration` / `PostgreSQL 16 / D-23D closed reset`.
- Command: `psql --set=ON_ERROR_STOP=1 --file=test/integration/reset-postgres/reset-postgres-integration.sql`.
- Isolation: the workflow invokes only this SQL harness. It neither invokes the repository Vitest suite nor depends on `test/openai-structured-inference-adapter.test.ts`.
- Workflow run evidence: **not available at audit authoring time**.

## Schema source and fixture strategy

The integration SQL builds a disposable `reset_it` schema rather than replaying repository migration history. The schema is a focused reconstruction of the production mutation surface catalogued in D-23D: restrictive FKs, the two deferred snapshot/pending cross-table FKs, immediate lineage self-FKs, the partial unique snapshot index, the transport staging cycle, the restrictive production `project_knowledge_*` cycle, receipt retention, and all 16 mutation-guard triggers disabled by the proposed reset.

The four relations confirmed absent from Production are intentionally absent here:

- `conversation_cycle_events`
- `customer_answer_claim_evidence`
- `customer_answer_knowledge_claims`
- `customer_answer_knowledge_transitions`

Two independent, production-shaped graphs are seeded. Fixture 1 is the reset target and fixture 2 is the control. Each covers root/customer ownership, project and conversation data, transport identity/binding, a reply-linked message graph, original/recovery pending and snapshot pairs, deferred cross-links, runtime/cycle/AI consumers, staging and delivery transport rows, retained webhook receipts, evidence/observation lineage, the production knowledge cycle, media lifecycle/dependencies, offers, executions, commands, and notes.

The D-23D algorithm exists only as the test-schema function `reset_it.reset_closed`. It preserves snapshot, pending, message, observation, and claim lineage through complete set-based deletes. Its only preparatory business-row updates are the three audited D-23D cuts: transport ingestion staging detachment, webhook receipt message detachment, and nullable knowledge-transition edge detachment. A test-only failure switch raises immediately after trigger disablement to exercise transactional rollback; it does not alter the algorithm before that point.

## Credibility gate: known 0005 failure

Before any D-23D reset call, the harness creates an original snapshot and a recovery snapshot with the same `outbound_message_id`, with only the recovery row pointing through `recovery_of_snapshot_id`. It then executes the old 0005 mutation verbatim for the target scope:

```sql
update conversation_interaction_snapshots
set recovery_of_snapshot_id = null
where conversation_id = uid('conversation', 1);
```

The harness accepts only `unique_violation` and explicitly verifies SQLSTATE `23505`. The named conflicting index is `one_original_snapshot_per_outbound`. Any unexpected success or different failure aborts the script before the proposed reset validation.

Observed result: **PENDING** until the dedicated GitHub Actions job completes.

## Acceptance assertions

| # | Required assertion | Harness evidence | Status |
|---:|---|---|---|
| 1 | Old 0005 mutation reproduces SQLSTATE 23505 | Exception block requires `returned_sqlstate = '23505'` against `one_original_snapshot_per_outbound`. | NOT RUN |
| 2 | Dry run succeeds, returns expected counts, and changes nothing | Exact JSON counts plus a digest of every durable fixture row and every user-trigger state before/after. | NOT RUN |
| 3 | Commit succeeds without 23503/23505 | `ON_ERROR_STOP=1`; the committed reset call aborts the job on every SQL error. | NOT RUN |
| 4 | Target customer removed | Target root count assertion. | NOT RUN |
| 5 | Target projects removed | Target project count assertion and restrictive FK closure. | NOT RUN |
| 6 | Target conversations removed | Target conversation count assertion and restrictive FK closure. | NOT RUN |
| 7 | Target message graph removed | Message, text/reference, reply lineage, transport/reference closure and post-reset table counts. | NOT RUN |
| 8 | Runtime/cycle/AI state removed | Runtime, cycle, inference, and execution-context scope checks. | NOT RUN |
| 9 | Pending interactions removed | Explicit target-scope assertion. | NOT RUN |
| 10 | Snapshots removed | Explicit target-scope assertion after real deferred-cycle and immediate-self-FK execution. | NOT RUN |
| 11 | Knowledge/evidence graph removed | Claim/evidence assertions and full per-table post-reset counts. | NOT RUN |
| 12 | Media/offer/execution reset surface removed | Full per-table post-reset counts under restrictive FKs. | NOT RUN |
| 13 | Transport reset surface removed | Delivery/ingestion assertions and full per-table post-reset counts. | NOT RUN |
| 14 | Webhook receipts survive | Target receipt ID and provider replay tuple must survive. | NOT RUN |
| 15 | Receipts have no invalid internal-message reference | Target receipt must be null; anti-join rejects any dangling surviving receipt reference. | NOT RUN |
| 16 | Complete control fixture remains intact | Control lineage/cycle sentinels plus exact expected counts for every fixture table. | NOT RUN |
| 17 | No dangling FK remains | Real immediate/deferred PostgreSQL enforcement at statement/commit plus assertion that every fixture FK is validated. | NOT RUN |
| 18 | Every intentionally disabled trigger is enabled after commit | Exactly 16 user triggers must exist and all must have `tgenabled = 'O'`. | NOT RUN |
| 19 | Deliberate post-disable failure restores data and triggers | Caught subtransaction failure; complete catalog/data digest equality and enabled-trigger assertion. | NOT RUN |
| 20 | Fresh lifecycle can reuse the same WhatsApp identity | Inserts fresh customer, project, conversation, identity/binding, inbound message, and payload with the exact prior external identity. | NOT RUN |

## Failure policy

`psql` runs with `ON_ERROR_STOP=1`; therefore a credibility-gate mismatch, assertion exception, FK/index/trigger rejection, or commit-time deferred-constraint error fails the dedicated check without continuing to a success marker. The harness prints the PostgreSQL error statement/context, SQLSTATE diagnostics for the known 0005 gate, and named assertion phase. If CI exposes a new D-23D failure, this audit must be updated with the exact failing statement, SQLSTATE, constraint/index/trigger, false assumption, and smallest conceptual correction. No constraint may be removed and no algorithm step may be redesigned merely to turn the check green.

## Final decision

**PENDING for migration 0006.** A green completed `PostgreSQL 16 / D-23D closed reset` job is required before this can become GO. A failing real-engine assertion makes migration 0006 NO-GO and must be recorded as evidence rather than patched outside a new reviewed design decision.
