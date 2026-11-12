# CC-20261111-n4k8 — the index behind the admissions signals scan

- [x] Add `idx_page_events_visitor_timestamp` and wire it into boot
  - Date: 2026-11-12
  - Session: CC-20261111-n4k8
  - What changed: a new `ensure`/`assert`/`Guarded` module creates an index on
    `page_events (visitor_id, "timestamp" DESC)`, registered in `server.ts` on the
    boot path alongside the other guarded schema calls.
  - Verification: `tsc --noEmit` 0 errors; `checkTestTypecheck` baseline matched in
    both directions (399 errors / 140 files); full backend CI suite 2668 suites /
    43,513 tests, 0 failures. Boot wiring mutation-tested (below).
  - Notes: this is the second half of Kalkidan's finding. The first half (PR #3944)
    capped what the query returns; this caps what it examines.

## Why an index was a separate fix, not the same one

`page_events` is the largest table in the schema (~1.15M rows) and carried four indexes,
none on `visitor_id`:

```
page_events_pkey                        (id)
idx_page_events_lead_id                 (lead_id)
idx_page_events_lead_event              (lead_id, event_type) WHERE lead_id IS NOT NULL
idx_page_events_tenant_brand_timestamp  (tenant_id, brand_id, timestamp)
```

So every read keyed on the VISITOR rather than the lead planned as a sequential scan:

```
Seq Scan on page_events  (cost=0.00..60372.25 rows=1192125 width=96)
```

PR #3944 stopped the admissions signals endpoint pulling 683,444 rows to keep 20,000.
That removed the memory risk and changed nothing about the scan, because **a cap bounds
what is RETURNED and an index is what bounds what is EXAMINED.** Two problems that
presented as one.

## Why both columns, and why DESC

The query is `WHERE visitor_id = ANY($1) ORDER BY timestamp DESC`, per visitor.
`visitor_id` alone would find the rows and then sort them. The trailing `timestamp DESC`
lets newest-first come straight off the index, which is exactly the shape of the
`ROW_NUMBER() OVER (PARTITION BY visitor_id ORDER BY timestamp DESC)` window that reads it.

## The cost, stated rather than buried

`CREATE INDEX` takes a SHARE lock on `page_events` and blocks writes for a few seconds on
the first boot after this merges. Not `CONCURRENTLY`: that cannot run inside a transaction,
takes substantially longer, and leaves an INVALID index behind if it fails partway, which
is a worse thing to own at boot.

Those seconds land during a deploy, when the backend is restarting and therefore not
serving tracker writes anyway. That is the argument for accepting the lock and the reason
this is a boot-time statement rather than hand-run DDL.

## This module does not own its table

Every sibling in `db/` creates a net-new table and may do as it likes with it. This one
adds an index to a table that already exists and that the tracker writes to constantly. So
it has no `CREATE TABLE`, it asserts the table rather than creating it, and its rollback
drops only the index.

The test suite asserts those as prohibitions — no `CREATE TABLE`, no `DROP TABLE`, no
`CONCURRENTLY` — because they are exactly the lines a later edit adds "for symmetry" with
the siblings, and the damage would not surface until a production boot.

## What the repo's own guard caught, and what it did not

While these files sat untracked in the working tree during an unrelated full-suite run,
`ensureAgentDomainProjectSchema.bootWiring.test.ts` failed on its pinned roster of every
`ensure*` whose post-condition throws — Received +1. The check found a new throwing module
before any human reviewed it.

**It did not prove the wiring, and the distinction matters.** That roster reads the `db/`
directory, never the boot path, so adding the filename to the pin satisfies it whether or
not `server.ts` ever calls the module. A module whose entire deliverable is one
registration needs a test that dies when the registration goes away.

So `ensurePageEventVisitorIndex.bootWiring.test.ts` was added, built on
`helpers/bootCalls.ts` — which exists for this exact defect, its own docblock recording
the incident: *"commenting out the seed invocation while leaving the line in place passed
all 40 tests."*

**Mutation proof.** Commenting out `await ensurePageEventVisitorIndexGuarded();` in
`server.ts` fails 4 of the 6 assertions with `Expected: > -1 / Received: -1`. A plain
`indexOf` would have found the commented line and stayed green; `activeBootCall` is what
makes the test real. Reverted after measuring.

## Why a missing index fails quietly, and why that earns a test

It fails SOFT, which is worse for the purpose of noticing. Drop the call and nothing
breaks: every query returns correct rows and every other test passes. The only symptom is
that visitor-keyed reads go back to scanning the largest table in the schema — a
regression nobody is paged for and that no other assertion can see.

## Why it throws at all

`ensureExplorerCampaignKeyIndex.ts` is the older index-only precedent and it only warns.
This module follows the dominant `ensure`/`assert`/`Guarded` convention instead, because
`CREATE INDEX IF NOT EXISTS` is a no-op on an existing index and every statement error is
warned rather than raised — so `ensure` alone resolves identically whether the DDL worked
or did nothing at all. `assert` is the part that decides, and `Guarded` is what keeps a
performance problem from ever stopping the port binding.
