# ADS-9 — the spend sync now stores the rows it discards

**Session:** CC-20261102-k9r4 · 16 November 2026
**Ticket:** [ADS-9](https://app.basecamp.com/3945211/buckets/7463955/todos/10511805679)

## The gap

Every Meta spend sync computes `rowsSkipped` — the number of API rows it refused to parse — and
it is always reported, even when zero. That field exists because of 2026-11-13: rows were dropped
by an `if` with no `else`, the run still recorded `success`, and **$397.17 went missing where
nobody could see it**.

But "reported" meant *returned from the function and written to a log line*. `marketing_spend_syncs`
had no column for it. Its columns were `id, platform, started_at, finished_at, range_start,
range_end, outcome, rows_written, error_class, error, triggered_by` — `rows_written` present and
its twin absent.

So the safeguard against a silent shortfall was itself invisible to anyone reading the ledger.

**It was needed within 48 hours of being added.** Reconciling on 2026-11-15, the ledger showed
$3,664.53 against Meta's $3,735.82 — 1.91% short. The first question was "how many rows did the
last run refuse?", and it could not be answered from the database. It turned out benign (the gap
was entirely that day's partial data; 26 of 28 days matched to the cent), but that was established
by writing a separate per-day comparison against Meta, not by reading our own records.

## What changed

| File | Change |
|---|---|
| `backend/src/db/ensureMarketingSpendSchema.ts` | `rows_skipped INTEGER NOT NULL DEFAULT 0` in the CREATE, **plus an additive ALTER**, plus a boot-time post-condition that the column exists. |
| `backend/src/services/marketing/adSpend/metaSpendSync.ts` | Extracted `recordSyncOutcome(id, result, write?)` and persisted the count. `getSyncStatus` returns `rowsSkipped`. |
| `frontend/src/services/adSpendApi.ts` | `rowsSkipped` on the `lastSync` type. |
| `frontend/src/pages/admin/marketing/adSpend/MetaSyncPanel.tsx` | The stored history now warns, not just the live run. |
| 2 new test files | 11 tests. |

## The load-bearing detail

**The ALTER is the whole change.** `marketing_spend_syncs` already exists in production, so adding
the column to `CREATE TABLE IF NOT EXISTS` alone would give it to a fresh database and *never* to
the real one — a change that passes every test and does nothing where it matters. A test asserts
the ALTER specifically, for exactly that reason.

The boot post-condition was extended to match. It previously checked that the two tables exist,
which would have called the pre-ADS-9 production database healthy: the table was there, the column
was not. It now checks added columns too, so a missed ALTER stops the boot naming what is missing
rather than surfacing months later as a wrong number.

## Why a seam instead of mocks

`syncMetaSpend` touches sequelize, the HTTP transport and the ledger writer, so testing the
persistence through it would need three module mocks — written blind, since this session has no
local jest. Instead the outcome write was extracted into `recordSyncOutcome` with an injectable
writer, matching the `Runner` seam already used by `ensureColaberryTvSchema` and `bugReportStore`.
The mapping from result to row is now testable with no mocks at all.

## The test that had to exist

The ticket asked for it in those words: *a test proves a run that skips rows records a NON-ZERO
count; a test that only checks the zero case cannot tell the field apart from a hardcoded 0.*

```
expect(repl.skipped).toBe(7);
expect(repl.rows).toBe(55);
expect(repl.skipped).not.toBe(repl.rows);
```

Asserting `7` rather than "truthy" or "a number" fails a hardcoded `0` **and** a copy of
`rowsWritten`. A failed-run case is covered too: a failure that also discarded rows used to lose
both facts.

One deliberate asymmetry, noted in the test: `recordSyncOutcome` lets a write failure **surface**,
where `bugReportStore` swallows one. There the write is a safety net under a send that must not be
blocked; here the write *is* the record of the run, and a silent failure would recreate the exact
blindness being fixed.

## Verification

**Not run locally** — no jest, no tsc in this session; the checkout is unusable for git (OneDrive
mmap) and sits on a stale branch. Every file was fetched from `main` and patched with exact-match
replacements that abort unless each applies exactly once, rather than retyped. **CI is the gate.**

**Unverified until deploy:** that the ALTER runs against production and the next scheduled sync
(05:40 Central) writes a real count. The first run after deploy proves both. Note the current
production table has four historical rows which will all read `0` — honest, since nothing was
recorded as skipped at the time.

## Not in scope

- Nothing alerts on `success` with `rows_skipped > 0`; the panel shows it, nobody is paged.
- The ticket's secondary note — 8 rows at placement `unknown`, $0.86 total, meaning
  `normalisePlacement` does not recognise something Meta sends — is untouched and still worth a look.
