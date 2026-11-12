# CC-20261111-n4k8 — the admissions signals read had no row limit

- [x] Cap admissions signal events per visitor in Postgres instead of in memory
  - Date: 2026-11-11
  - Session: CC-20261111-n4k8
  - What changed: `readAdmissionsSignals` fetched every `page_events` row for the
    selected visitors and applied `eventsPerVisitor` in a loop afterwards. The cap
    now lives in the SQL, as `ROW_NUMBER() OVER (PARTITION BY visitor_id)`, with
    `COUNT(*) OVER` carrying each visitor's true total so `page_event_count` stays
    honest.
  - Verification: `tsc --noEmit` 0 errors; `checkTestTypecheck` baseline matched in
    both directions; full backend CI suite 2665 suites / 43,490 tests, 0 failures.
    Both new guards mutation-tested (below).
  - Notes: see the measurements and the index that is NOT in this change.

## How it was found

Kalkidan Bezabeh reported it on 11 Nov 2026. Her single pull at `limit=100` failed
with a CORS error, and she wrote in with two candidate causes rather than retrying.
Both were right.

The CORS error itself was the first cause and not this one: the backend container
started at 02:14:48Z and again at 02:16:24Z, and her request was at 02:14. nginx
answered while there was no backend to answer, so no response existed to carry the
header. Her own reasoning got there first — the app-wide `cors()` cannot produce a
missing-header error.

The second cause is this defect, and it would have failed on its own merits with no
deploy running at all.

## What was measured, against production

Rows the event query pulls, by `limit`:

| limit | rows |
|---|---|
| 10 | 20,281 |
| 20 (route default) | 20,699 |
| 50 | 280,893 |
| **100 (what she ran)** | **683,444** |

683,444 rows is 58% of the whole `page_events` table (1,145,454 rows at the time of
measurement), fetched to keep at most 20,000.

The cause is not one unusual visitor, which is what makes it a design fault rather
than bad luck. The visitor slice is ordered by `last_updated`, and the most recently
active visitors are also the heaviest, so the ordering selects precisely the rows you
least want. Inside that top 100 the average is 8,136 events per visitor; the heaviest
single visitor holds 99,284, and that visitor is in `admissions_memory`, so it is
reachable through this endpoint rather than hypothetical.

## Why a window function and not a `limit`

A flat `limit` on the fetch is the bug the two-query split already exists to avoid: it
bounds total rows, so one heavy visitor consumes the whole budget and every visitor
after it silently returns zero events. The cap has to be per visitor, and a window
function cannot appear in `WHERE` without a subquery, so it cannot be expressed through
`findAll`. Raw SQL via `sequelize.query`, typed at the call site as `CappedEventRow`,
is the honest option. `COUNT(*) OVER` rides along because capping the rows would
otherwise redefine `page_event_count` as "the cap" — a wrong number that reads as a
right one, which is worse than the defect being fixed.

## The test that should have existed

There was already a test named "scopes the event query in SQL, rather than reading the
table and filtering", whose own comment said `page_events` is the largest table in the
schema. It asserted the query was SCOPED. Scoping was never the problem: a scoped query
returning every event a hundred visitors ever generated is still the whole table. The
new test asserts the CAP reaches the database, in both places it has to — the
per-visitor window in the SQL, and the cap value in the bind.

Both new guards were mutation-tested:

- Changing `PARTITION BY visitor_id` to a flat rank fails "caps events per visitor in
  the database", and nothing else. That is the precise failure mode.
- Counting the returned rows instead of reading `COUNT(*) OVER` fails both the true
  total test and the pre-existing "honours limit and events_per_visitor".

Fixing the event mock to emulate the window functions also exposed that two older
assertions encoded the mock's insertion order rather than the real `ORDER BY timestamp
DESC`. Production has always returned newest-first; the test had it backwards and passed
because the mock ignored the ordering. Those assertions were corrected, and the ordering
is now actually asserted.

## What this change does NOT fix

`page_events.visitor_id` has **no index**. The four indexes on the table cover `id`,
`lead_id`, `(lead_id, event_type)` and `(tenant_id, brand_id, timestamp)`. So both the
old and the new query plan as a sequential scan over ~1.15M rows:

```
Seq Scan on page_events  (cost=0.00..60372.25 rows=1192125 width=96)
```

This change bounds what crosses into Node, which is the memory and transfer risk and
the thing that could take the backend down. The scan itself needs an index on
`(visitor_id, timestamp DESC)`. That is a schema change against a production table, so
it is proposed separately rather than included here.
