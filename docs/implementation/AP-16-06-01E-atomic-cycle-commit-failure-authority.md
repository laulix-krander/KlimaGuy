# AP-16-06-01E – Atomic Cycle Commit and Failure Authority

## Status: STOP – prerequisite contract gap

**Baseline:** `a29559df69f8424fd27529a3dfacb7e269e9266a`

AP-16-06-01E was deliberately not partially implemented. The pre-implementation
check found that the current `ConversationCycleSuccess` drops authority that the
AP-16-06-01A atomic payload and the merged AP-16-06-01D knowledge authority both
require. Building the SQL commit from the remaining state diff or event payloads
would introduce a second knowledge interpretation and violates STOP conditions
1, 2 and 6 of this package.

## 1. Architecture Basis

The review used AP-16-06-00, AP-16-06-01A and the merged AP-16-06-01B/C/D
implementations. The current code takes precedence where it differs from the
audit. In particular, AP-16-06-01A requires `normalized_answer_result` and
`knowledge_transition` in `PersistentConversationCycleCommit`, while the current
service exposes only a reduced `PersistentCycleCommit` containing the terminal
`ConversationCycleSuccess`.

## 2. Scope

This document records the mandatory STOP and the smallest prerequisite change.
It adds no RPC, schema, migration, adapter, runner or runtime mutation.

## 3. Pre-implementation check (A–J)

### A. Actual `ConversationCycleSuccess`

The success value contains resulting Knowledge/Runtime components, planning and
render results, and events. It does **not** contain the successful
`InterpretationResult`, its `StateTransitionProposal`, or the successful
`StateTransitionApplyResult`.

### B. Mutations expected by `processPersistentCustomerMessage`

`processPersistentCustomerMessage` passes only command/source/pending IDs, two
expected revisions and `cycle` to `commitCustomerMessageCycle`. The normalized
answer is local and is not included in the commit input. Consequently the commit
adapter cannot construct the AP-16-06-01D input without interpreting the answer
again or deriving a proposal from result state.

### C. Failure data

The current data-source contract permits only `normalization_failed` and
`cycle_failed`. The orchestration allow-list also contains `persistence_failed`,
but the `failCustomerMessage` signature cannot persist it. Failure authority can
be implemented after the success contract is repaired, but implementing it alone
would be a partial AP-16-06-01E authority.

### D. AP-16-06-01D knowledge apply authority

The merged adapter requires a strictly matching `StateTransitionProposal` and
successful `StateTransitionApplyResult`. The RPC persists the proposal payload,
checks reserved IDs/provenance, and uses its `changed` bit for the exact 0-or-1
Knowledge-version transition. Neither object is available to the E commit caller.

### E. Persistent Runtime components

The repository persists the Runtime header, information collection, retry,
customer effort and evidence-request state. The success result carries these
components, so this part is classifiable.

### F. Pending lifecycle

The existing lifecycle is `pending`, `answered`, `superseded`, `cancelled`.
Customer-answer success can bind the exact previous Pending row to the source
message. Human-review handling remains separate because the current cycle emits
it as a failure rather than a success result.

### G. AP-16-06-01B activation

AP-16-06-01B atomically creates a snapshot, internal outbound message/text and
Pending Interaction while advancing Runtime. Its semantic checks can be invoked
inside a future outer PostgreSQL transaction, provided every non-success result
causes the outer transaction to abort rather than return after partial writes.

### H. Reserved IDs

AP-16-06-01C reserves the interpretation, transition, claim, evidence, apply,
assessment, planner decision, five events, next evidence request, next Pending,
next snapshot and next outbound IDs. The read mapper currently retains IDs used
inside `ConversationCycleContext`, but does not expose the three next-interaction
IDs on `CustomerMessageCycleAuthority`; the database can still derive them from
the locked command.

### I. Command states/result codes

The persisted command lifecycle supports `pending`, `processing`, `completed`,
`failed`, `stale` and `human_review_required`. Existing result kinds are
`completed_with_next_interaction`, `intermediate_break`, `evidence_request`,
`human_review`, `collection_stopped`, `stale`, `retry_required`,
`already_processed` and `failed`. No new strings are needed.

### J. Conversation events

The successful Domain cycle returns structured events. The current derivation
uses at most the five reserved event slots established by AP-16-06-01A/C. Events
alone are not a lossless replacement for the Knowledge proposal/apply contract.

## 4. Atomic Commit Boundary

No commit boundary was added. In particular, AP-16-06-01D and AP-16-06-01B were
not chained as independent external RPC commits. The required future boundary
remains one PostgreSQL transaction containing all pre-commit locks/CAS checks,
Knowledge apply, Runtime and component writes, previous/next Pending lifecycle,
snapshot/message/text, events and terminal command completion.

## 5. Commit Payload blocker

The smallest safe prerequisite is a focused Domain/orchestration contract update
that makes the already-computed successful interpretation proposal and apply
result available without recomputation. The recommended shape is to extend
`ConversationCycleSuccess` with immutable, schema-validated
`knowledge_transition: { proposal, apply_result }` and to pass the normalized
answer result required by AP-16-06-01A through the commit mapper (without storing
raw customer text). This must preserve the existing reserved IDs and prove exact
proposal/apply matching with the AP-16-06-01D schemas.

This is not a request to reconstruct those values from `knowledge_state`, events,
or planner output. Such reconstruction would be new Knowledge semantics.

## 6. Knowledge Apply Integration

Blocked: AP-16-06-01D cannot receive its required proposal/apply pair from the
current E input. Calling its RPC before the cycle commit is forbidden, and
re-running interpretation/apply in the adapter or SQL is equally forbidden.

## 7. Runtime Commit

Classifiable but intentionally not implemented in isolation. Runtime must not be
committed without the unavailable Knowledge authority.

## 8. Pending Interaction Lifecycle

Classifiable but intentionally not implemented in isolation. The previous
Pending resolution and any next Pending must share the final transaction.

## 9. Planner Snapshot Integration

Classifiable but intentionally not implemented in isolation. No replanning or
re-rendering was introduced.

## 10. Internal Outbound Message

Classifiable but intentionally not implemented in isolation. No message, provider
identifier, delivery command or outbound network call was added.

## 11. Domain Events

Five reservations are sufficient for the current event derivation. No event
table was added because events must roll back with the blocked full commit.

## 12. Command Completion and CAS boundaries

The command retains Conversation, Runtime, Knowledge, Pending, prompt, source
message, snapshot and reserved-ID authority. These checks are implementable, but
command completion must remain last in the same transaction and therefore was
not added separately.

## 13. Replay / Idempotency

The command and reserved IDs provide the planned replay identity. Payload-conflict
proof is incomplete until the missing Knowledge proposal/apply values are present
in the strictly validated payload; no weaker hash or state-diff heuristic was
introduced.

## 14. Failure Authority

No standalone failure RPC was added because this package explicitly requires the
complete success and failure authorities together. A follow-up implementation
must allow-list `normalization_failed`, `cycle_failed`, and (if retained by the
existing orchestration contract) `persistence_failed`; store no exception text;
and never overwrite terminal success.

## 15. Human Review / No Change

`runConversationCycle` currently returns `human_review_required` as a
`ConversationCycleFailure`, not a `ConversationCycleSuccess`, while AP-16-06-01A
describes a terminal human-review commit boundary. The prerequisite contract
update must explicitly map this existing failure result to command-only/review
state behavior without inventing Pending resolution or Knowledge apply.

No-change also needs the original apply result: the resulting version equality
alone cannot prove the validated AP-16-06-01D `changed` decision and proposal
identity.

## 16. Security

No authority or grant was added. There is no new customer-content duplication,
audit metadata, stacktrace, provider data, secret, browser mutation path or AI
boundary.

## 17. Tests

The repository validation suite may be run against this documentation-only STOP.
Atomicity tests cannot honestly be added before an atomic RPC exists; static tests
claiming transactionality would not prove the requested behavior.

## 18. Explicitly Not Implemented

- atomic success commit or failure RPC
- database migration, tables, columns, policies or grants
- TypeScript commit/failure adapter
- productive runner, webhook composition, worker, scheduler or recovery loop
- WhatsApp send/delivery bridge or provider IDs
- OpenAI, LLM or inference integration
- replanning, re-rendering or answer reinterpretation
- changes to historical migrations

## 19. Handoff / smallest required re-audit

Create a narrow **AP-16-06-01D/E contract-alignment prerequisite** covering only:

1. retention of `StateTransitionProposal` and successful
   `StateTransitionApplyResult` in `ConversationCycleSuccess`;
2. retention/passing (not separate persistence) of the normalized-answer result
   required by the audited commit payload;
3. explicit human-review mapping, since it is currently a cycle failure;
4. widening the failure adapter input to the already allow-listed
   `persistence_failed` category if that category remains required.

After that focused alignment, AP-16-06-01E can implement one additive migration,
one success RPC, one failure RPC, strict server-only adapters and genuine
transaction/replay/CAS tests. AP-16-06-01F remains the subsequent composition
package.
