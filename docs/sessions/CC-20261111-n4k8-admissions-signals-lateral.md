# CC-20261111-n4k8 — the index was not enough, and the plan said so

- [x] Rewrite the capped event read from ROW_NUMBER to CROSS JOIN LATERAL
  - Date: 2026-11-12
  - Session: CC-20261111-n4k8
  - What changed: `cappedEvents` now uses a correlated per-visitor
    `ORDER BY timestamp DESC LIMIT cap` inside a `CROSS JOIN LATERAL`, and the true
    per-visitor total moved to its own `GROUP BY` query, since it cannot ride along
    on a query that stops at `cap`.
  - Verification: measured against production with `EXPLAIN (ANALYZE, BUFFERS)` —
    2,059 ms to 18 ms on the events half. `tsc --noEmit` 0 errors; `checkTestTypecheck`
    baseline matched both directions; full backend CI suite green. The
    true-total guard mutation-tested (below).
  - Notes: this corrects a claim I made in PR #3949, which said the index would bound
    what the query examines. It did not.

## The claim that was wrong

PR #3949 added `idx_page_events_visitor_timestamp` and its description said: *"a cap
bounds what is RETURNED and an index is what bounds what is EXAMINED."* The first half is
true. The second half was not, and I only found out by measuring the merged change against
production instead of assuming it had worked.

With the index live, at `limit=100`:

```
Bitmap Index Scan on idx_page_events_visitor_timestamp   87 ms, 680,222 rows
Sort  (external merge, 48 MB spilled to disk)         1,615 ms
WindowAgg, Rows Removed by Filter: 678,929
Execution Time                                        2,059 ms
```

680,222 rows examined to return 1,293.

## Why the index did not help, which is the part worth keeping

A window function has to see every row of its partition before it can number any of them.
So `WHERE rn <= cap` is a filter applied AFTER the sort, not a brake on it.

The index could in principle have supplied the ordering and removed the sort. It did not,
because Postgres picks a **Bitmap** Index Scan for `= ANY(...)`, and a bitmap scan returns
rows in heap order. The ordering the index holds is discarded on the way out.

So the general lesson, which is more useful than this one fix: **an index only removes a
sort when the plan preserves its ordering, and `= ANY` over many values usually does not.**

## What the rewrite does

`CROSS JOIN LATERAL` expresses the same per-visitor cap as a correlated subquery, and a
per-visitor `ORDER BY timestamp DESC LIMIT cap` is exactly the order the index is stored
in. Postgres walks the index for one visitor, takes `cap` rows, stops, and moves on.

```
Index Scan using idx_page_events_visitor_timestamp, Limit 20, 100 loops
no sort, no spill
Execution Time                                           18 ms
```

Same data, same index, 113x. The disk spill is gone.

**The index is still necessary.** Without it the LATERAL would have no ordered structure to
walk and would be far worse than the window function. #3949 was not wasted work; it was
half the fix described as the whole of it.

## The total had to move, and that is the risk this change carried

`COUNT(*) OVER (PARTITION BY visitor_id)` used to ride along on every capped row. It cannot
ride along on a LATERAL that stops at `cap` rows, by construction: those rows are never
read, so nothing in that query has seen enough to count them.

So it became its own query. A true total must examine every matching row — no shape avoids
that — but selecting only indexed columns gets an **Index Only Scan**, which never touches
the heap: 349 ms, against 2,059 ms for the old combined query that fetched every column of
all 680,222 rows and sorted them.

The two reads are issued with `Promise.all`, since they are independent reads of the same
visitor set.

**This was the dangerous part of the change.** If `page_event_count` had quietly become
"the cap", that is a wrong number that looks right, and nothing downstream could have told.
So it is mutation-tested: deriving the total from the capped rows instead of the separate
query fails two tests with `Expected: 2, Received: 1`. Reverted after measuring.

A new structural test pins where the number comes from, because the behavioural one would
also pass if a future edit went back to deriving it AND the fixture happened not to
truncate.

## A process note on the mutation test

The first attempt to apply the mutation used `python - <<'PY' ... || perl -0pi -e '...'`.
Python consumed the heredoc and exited 0, so the `perl` fallback never ran, the file was
never mutated, and the suite passed — which reads exactly like "the test does not catch
it". The mutation was re-applied with an editor and the guard failed correctly.

**A mutation test that passes is not evidence until you have confirmed the mutation
applied.** Verified here by grepping for the mutated line before running.
