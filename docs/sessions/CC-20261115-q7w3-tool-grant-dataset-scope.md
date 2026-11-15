# CC-20261115-q7w3 — an approval now records the scope it approved

Phase 2b of the dataset picker. Phase 1 was the measurement, Phase 2a the request side, this is
the grant side.

## What this closes

Phase 2a gave a tool request two fields, `environment` and `read_datasets`, and a catalog
endpoint to pick datasets from. The grant recorded neither. So a builder picked datasets, Ali
reviewed them, and the approval wrote the tool name and dropped the scope: **a narrow production
request and a wide one produced the identical grant row.** The picker was a form field with
nowhere to go.

## What production actually looks like

Measured 15 Nov 2026, read-only SELECTs:

| Fact | Value |
|---|---|
| `agent_domain_tool_grants` | **0 rows**, 10 columns, neither new column present |
| `agent_domain_tool_request_details` | **0 rows** |
| `agent_domain_change_requests` | 1 row, not a tool request |
| `dataset_registry` | **633** datasets |
| **Phase 2a's columns in production** | **ABSENT** |

That last row is the one worth keeping. **PR #4049 merged at 11:44 AM CT today and its columns are
not in production**, because the DDL runs at backend boot and prod has not rebuilt. Merged is not
deployed, and the check cost one read-only query. Had I assumed, I would have written "the request
table carries an environment" into a comment on the strength of a merge commit.

The 0 rows are why `environment` could arrive `NOT NULL` with no default rather than as a
nullable afterthought. Separately, `agentToolGovernanceService.ts` records that 31 agents hold 136
entries in `tools_granted` with **0** rows in the grant ledger — every holding in production today
is ungoverned, so there is no existing grant whose scope this had to backfill.

## The design decisions worth arguing with

### 1. The cited request is a CEILING, not the source

The grant's scope is passed in by the caller and checked against the request, rather than derived
from the request. Deriving would be shorter and would make an over-wide grant impossible instead
of refused.

Two reasons against it. `changeRequestId` is documented in this subtree as **provenance, not
authority** — "nothing in `acceptToolGrant` judges it" — and deriving the scope from it would
quietly make it authority. And an approver narrowing what was asked for is a real approval action;
deriving makes narrowing impossible. So the ceiling is a check, and `assignExistingToolService`
passes the request's own declaration through, which the service then independently re-reads and
compares.

That redundancy is the same move as the read-back diff already in this file's production path, for
the reason that file states: *"A test that does that proves the paths the test drives."*

**Be honest about reachability.** No caller today can trip `grant_environment_exceeds_request` or
`grant_datasets_exceed_request`, because the one caller that cites a request copies the scope
verbatim. One ceiling refusal IS reachable right now: a HALF-APPLIED Phase 2a deploy, where
`ADD COLUMN` ran and `SET NOT NULL` did not, leaves the detail row with a null environment, and
`grant_request_scope_unreadable` refuses rather than writing a permission that does not say where
it applies.

### 2. Datasets are a ceiling on PRODUCTION only

Ali's 4 Nov ruling — sandbox-wide read is fine, narrow only for production — means an empty
`read_datasets` on a sandbox request is **the absence of a ceiling, not a ceiling of zero.**
Treating it as zero would refuse every sandbox grant that named a table, which is the common case,
and the picker would have made the product worse.

On production the same empty list means the opposite and falls out of the same subset rule with no
special case: a production request declaring no datasets declared no database reads, so anything
named on the grant is outside what was reviewed.

Environment is **ranked**, not compared for equality, which is the same ruling in the other
dimension: a sandbox grant against a production request is a narrowing and accepted; the reverse
is refused.

### 3. A refusal I considered and DROPPED

The request side refuses `production_reads_unscoped` when a production tool declares reads and
names no datasets. The grant side has no equivalent, deliberately: the grant has no `reads` list,
so there is no signal distinguishing "this tool reads no table" from "this tool reads everything".
Inventing a check on that would refuse correct grants — `send_email` in production names no
dataset and should not have to. Adding a rule with no information behind it is the 2a mistake
pointed at a different field.

### 4. The ranks are written out, not derived from the enum's order

`new Map(TOOL_ENVIRONMENTS.map((e, i) => [e, i]))` is shorter and wrong: it makes the danger order
a side effect of declaration order, so alphabetising that tuple — a change with no apparent
behaviour — inverts the refusal. Ranks are stated, and a test asserts every member of
`TOOL_ENVIRONMENTS` has one.

## Eight new named refusals

`grant_environment_missing`, `grant_environment_unknown`, `grant_dataset_roster_absent`,
`grant_datasets_not_catalogued`, `grant_request_scope_unreadable`,
`grant_environment_exceeds_request`, `grant_datasets_exceed_request`,
`grant_scope_conflicts_with_recorded`.

The last is the one that makes the rest honest. `findOrCreate` returns the existing row and does
not rewrite it, so a re-grant asking for a wider scope would have returned **200 with a row that
did not match it** — the worst of the three possible outcomes. It is refused instead.

## Three defects found while building, not after

1. **The scope gate suppressed its own refusals.** `judgeScope` gated its later checks on the
   SHARED issue list, so an unrelated approver refusal silenced every scope refusal and a caller
   who fixed their approver would meet the scope problem for the first time on the resubmit. That
   is the half-truth this file's own header rules out. Fixed with a local list merged at the end.
2. **A `TypeError` where a refusal belonged.** `cleanDatasets` threw on a non-array. Two of the
   three lists it judges come out of **JSONB columns, which the model types and the database does
   not** — a column declared `string[]` in Sequelize can hold `"leads"`. Iterating that surfaced
   as a 500, which teaches a caller the endpoint is broken rather than what is wrong with the
   grant. Now coerced, and every direction of that coercion fails closed.
3. **An assertion passing for the wrong reason, again.** The nullability probe is also a read of
   `information_schema.columns`, so one mock branch answered both — and because that branch
   returns qualified names while the check looks for a bare `environment`, the invariant was green
   on a coincidence. It would have gone on passing with `SET NOT NULL` deleted. This is the
   identical defect found in Phase 2a; the pattern is now worth watching for wherever two probes
   share a table name.

## Verification

- `jest --testPathPattern "agentDomain|toolRequest|toolGrant|assignExisting|datasetCatalog|agentRegistrySeed|seedTool|mgmtSection"` —
  **102 suites passed, 2,088 tests passed**, 55 skipped.
- `tsc --noEmit`, backend's own TypeScript 5.9.3 — **exit 0**. Control errors planted in both the
  contract and the service produced **exactly 2** errors, one per file, and both restores were
  byte-identical. The repo root carries 4.9.5, which cannot parse zod v4's `.d.cts`; the root
  binary is the wrong gate.
- `node scripts/checkTestTypecheck.js` — the report-only gate that typechecks TEST files, which
  `backend/tsconfig.json` excludes. Run because five test files were edited heavily.
- **FREE POSITIVE CONTROL:** adding the required field broke the suite immediately with **52
  failures across 4 suites**, which proves it exercises the grant path rather than passing by
  default.
- **NINE mutation tests, all caught:**
  1. environment ceiling comparison inverted — 3 failures
  2. `ENVIRONMENT_RANK` values swapped so production looks safer — 4 failures
  3. the dataset ceiling applied to sandbox too, discarding Ali's ruling — 1 failure
  4. an unreadable cited request treated as no ceiling (`null` collapsed into `undefined`) — 1
  5. the re-grant widening check deleted — 3 failures
  6. the `cleanDatasets` JSONB guard removed — 1 failure
  7. `ALTER COLUMN environment SET NOT NULL` deleted — 1 failure
  8. scope issues merged into the shared list — caught, but by DUPLICATION rather than
     suppression, so it did not prove what it was meant to
  9. so the precise form was run: gate the later checks on the shared list while keeping the local
     array. **Exactly one test failed — the one written for it.**
- **An over-broad assertion of my own, caught by its own failure.** The first draft forbade
  `environment TEXT NOT NULL` anywhere in the DDL and failed on the `CREATE TABLE`, where that
  declaration is exactly right for a database that does not have the table yet. Scoped to the
  ALTER. An assertion that fires on correct code is worse than none, because the tempting fix is
  to weaken the DDL until the test goes quiet.

## Not done here

- **NOTHING ENFORCES THE SCOPE AT RUNTIME.** This is the important one.
  `agentEffectiveAccessService.ts` has no dataset awareness at all — verified by grep, not
  assumed. A grant now RECORDS which datasets it covers and no code consults that record before a
  tool reads a table. Recording and enforcing are two phases and only the first is done.
- **No frontend.** Neither the 2a picker endpoint nor these two fields render anywhere. A builder
  filing or an admin granting through the API can use them today; one working through a screen
  cannot.
- **Widening a live grant has no path.** It is refused by name and the sentence says so. A real
  widening is a separate decision with its own authority, the same position this subtree takes on
  revocation.
- **The backfill of the ~125 cleanly-resolvable declarations.** Still deferred, still for the same
  reason: machine-derived dataset ids are a permanent factual claim in a capability record, and
  the resolver's other 76% of output was rejected as unreliable.
- **The scoped read role Quincy and Kes actually need.** Three phases in, a dataset read is now
  requestable AND recordable, and the ai-ops surfaces are still unreachable without admin. That
  is the thing Quincy asked for, and I have promised it in writing with no date.
- **Kesetebirhan Delele has still not been contacted.**
