# CC-20261114-v4n8 — a tool request can now name the data it wants

Phase 2a of the dataset picker. Phase 1 was the measurement; this is the request side.

## What asked for it

Quincy's L1 run ended on a request for read access to two rooms, and the answer was that there is
no read-only grant to give him: every `/api/admin/ai-ops/*` route sits behind one `requireAdmin`.
Ali's follow-up was the general form of the same problem:

> there are a lot of agents that will need access to certain data. They will need to get access to
> it, see it, understand and build based on that data. How can we add this to our tool proposal
> process to make it much easier to request data sets that they need for their tools.

He then chose **B** (wire `reads[]` to the catalog *and* backfill the existing declarations) and
**A** on the 239 whole-database declarations (sandbox-wide read is fine; narrow only for
production).

## What production actually looks like

Measured 14 Nov 2026, read-only SELECTs:

| Fact | Value |
|---|---|
| `dataset_registry` | **633** datasets, all scanned, all with semantic types |
| `agent_domain_tool_request_details` | **0 rows** |
| `agent_domain_tool_grants` | **0 rows** |
| `environment` / `read_datasets` columns | **neither existed** |
| Tool declarations across 444 capability records that are pure data reads | **784 of 1,459 (53.7%)** |

Two rows there decided the design. Both tables being empty means a newly **required** field refuses
no request anybody has filed, so `environment` could arrive `NOT NULL` with no default rather than
as a nullable afterthought. And 53.7% is why this is worth a field rather than a note: more than
half of everything an agent is recorded as needing is a read.

## The negative result this rests on

Phase 1 tried to resolve the declared tool verbs to datasets automatically and the attempt was
**abandoned rather than shipped**. Name matching placed 27 of 118 read verbs. Adding the
catalogue's own column vocabulary moved it by six percent while producing matches like
`read_lead_records` → `hire_interviews` and `read_component_registry` → `github_connections`.

That is the whole argument for a picker. A classifier confident enough to write
`platform_identities` under `read_platform_db_sandbox` is confident enough to be believed, and a
wrong dataset id becomes a grant. **The picker is not a convenience laid over an existing mapping;
it is the only way a grantable scope gets created.**

## The design decision worth arguing with

The obvious implementation is to require every `reads` entry to name a catalogued dataset. It would
be wrong, and the data says so: **24% of the 118 read verbs are not relational at all** — the
repository, a file tree, a headless browser, a vendor API. Tightening `reads` would refuse correct
requests for tools the catalog already contains.

So `reads` keeps its meaning and **`read_datasets` arrives beside it**. Two fields, because a
single one would have to be loose enough to accept "the repo" and strict enough to reject `leadz`.

Six new refusals, each named: `read_datasets_undeclared`, `dataset_roster_absent`,
`read_datasets_not_catalogued`, `production_reads_unscoped`, `environment_missing`,
`environment_unknown`.

Ali's rule lives in exactly one branch. An uncatalogued name is refused in **both** environments —
a typo is a typo on sandbox, and accepting it there means the first time anybody finds out is the
production request. What differs is only `production_reads_unscoped`, and its sentence names both
ways out, because the common honest case is a tool whose reads are not database reads.

## An invariant test was NARROWED, deliberately

`ensureAgentDomainToolRequestSchema.test.ts` asserted *"RUNS NO `ALTER` AT ALL, which is the reason
this is a child table."* That became unachievable the moment the table existed in production:
`CREATE TABLE IF NOT EXISTS` is a no-op against an existing table, so a new column cannot arrive
any other way. `ensureAgentToolGrantSchema.ts` hit this before and records it — adding a column to
the CREATE alone *"would have shipped green, resolved identically, and left the column absent on
every environment the table already exists in."*

The test now asserts **no `ALTER` on the parent governance table**, which was always the half worth
protecting, and three new assertions replace what it stopped covering: every add is
`IF NOT EXISTS`, the constraint add is guarded on its own existence, and `environment` has no
default. Flagged here because loosening a guard is the kind of change that should be argued with
rather than noticed later.

## Verification

- `jest --testPathPattern "agentDomain|toolRequest|agentChangeRequest|mgmtSection|datasetCatalog"` —
  **93 suites passed, 1,998 tests passed, 55 skipped**, plus 11 new controller tests.
- `tsc --noEmit` — **exit 0, zero errors**, run with the backend's own TypeScript 5.9.3. The repo
  root carries 4.9.5, which cannot parse zod v4's `.d.cts` and reports parse errors from
  `node_modules` that have nothing to do with the branch. The root binary is the wrong gate.
- **Control error for tsc:** a planted `const __CONTROL_ERROR__: number = "..."` in
  `datasetCatalog.ts` produced exactly **1** error, so tsc reaches the new files. Removed, and
  `diff` against a pre-plant copy confirmed a byte-identical restore.
- **tsc caught a real gap unprompted:** `projectDetail` read a stored row back into
  `ToolRequestDetail` and was missing both new fields. Nothing in the test suite would have failed.
- **Free positive control:** the suite failed immediately on the new required fields with 13
  service-level failures, proving it exercises the filing path rather than passing by default.
- **Three mutation tests, all caught:**
  1. `environment === 'production'` → `'sandbox'`: 4 failures, naming the sandbox case *and* the
     production case, so the rule is pinned in both directions rather than one.
  2. `ALTER COLUMN environment SET NOT NULL` deleted (a half-applied deploy): caught.
  3. `row_count` selected into the catalog projection: caught at **both** layers — the loader test
     and the controller test — which is the privacy decision, not a shape check.

## Not done here

- **The grant side.** `agent_domain_tool_grants` still records only `tool_name`. An approval cannot
  yet carry the dataset scope the request now declares, so the narrow production grant is
  *requested* and not yet *recorded*. Phase 2b.
- **The backfill of the ~125 cleanly-resolvable declarations.** Deliberately not bundled. Writing
  machine-derived dataset ids into capability records is a permanent factual claim in the record,
  and the lesson from the orchestration-health correction shipped earlier the same day is exactly
  about records that claim something the code does not do. It needs a reviewable mapping, not a
  silent rewrite of 444 JSON files.
- **No frontend.** The endpoint exists and is tested; nothing renders a picker yet. A builder
  filing through the API can use it today; one filing through a form cannot.
- **The scoped read role Quincy and Kes actually need** is still unbuilt. This change makes a
  dataset read *requestable*; it does not yet make the ai-ops surfaces *reachable* without admin.
- **Kesetebirhan Delele has still not been contacted.**
