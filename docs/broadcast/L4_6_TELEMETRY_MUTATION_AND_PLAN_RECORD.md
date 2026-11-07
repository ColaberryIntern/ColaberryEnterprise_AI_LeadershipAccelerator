# L4.6 criteria 4 and 5 — the measurement path, mutated and planned

> Generated from `scripts/artifacts/tickets/l46Data.js`, `l46PlanData.js` and
> `l46Findings.js`. **Do not hand-edit** — re-run
> `node scripts/artifacts/buildL46Artifacts.js`, which refuses to write if any test named
> below has stopped existing, if either mutated region has changed since the run, or if a query
> plan is recorded without the row counts that make it readable.

| | |
|---|---|
| **Ticket** | L4.6, criteria 4 and 5 |
| **Criterion 4** | *mutation evidence for the credit anchor and the unavailable-never-zero read* |
| **Criterion 5** | *the query plan for the active-selection read, recorded* |
| **Under mutation** | `backend/src/services/broadcast/broadcastTelemetryService.ts`, `backend/src/controllers/broadcastController.ts` |
| **Route** | `backend/src/routes/broadcastRoutes.ts:142` |
| **Run on** | 2026-11-07 |

## The short version

**7 reversals, 7 killed, 0 survived** —
including both the reversals the ticket names. That is the least interesting true sentence about
this run.

What the run measured is how many tests notice each reversal, and the answer ranges from six
down to **one**. Three of the audience read's rules — count the person not the tab, only count
the fresh, exclude staff — are each protected by a single regex over the SQL text, in a single
file. A fourth, the one that keeps "nobody watched" apart from "we cannot tell", is also
protected by a single test, but that test requires the count field to be **absent**, and so it
kills even a reversal built to look correct. The difference between those two cases is the
useful content of this record.

**Criterion 5's plan is also here**, measured at three table sizes rather than one, because a
plan without the row counts beside it cannot be read — which is why the October production run
left this criterion open.

## Criterion 4 — the mutations

Baseline **green: 6 suites, 157 tests,
0 skipped, 93.5s.**

postgres:16-alpine in a throwaway container on port 55438, from the one-line docker run in the suite's own docblock. Without DATABASE_URL the run is 5 suites and 152 tests, with 5 skipped — and the skipped five are the ones that touch a real lock.

Reproduce:

```bash
cd backend && DATABASE_URL=<throwaway> node ../node_modules/jest/bin/jest.js -c jest.config.ts --testPathPattern="src/(services/broadcast/__tests__/broadcastTelemetry|controllers/__tests__/broadcastController|routes/__tests__/broadcastRoutes)"
```

> --testPathPattern (singular); invoked through node, not npx, and not through a shell

### ANCHOR RE-KEYED TO THE TAB *(named by the criterion)*

The credit anchor is read per TAB rather than per PERSON, so two tabs each credit the full gap and every watch figure doubles for anyone with the player open twice. This is the reversal the ticket names.

```diff
-  WHERE occurrence_id = :occ AND enrollment_id = :enr
+  WHERE occurrence_id = :occ AND session_id = :sess
```

**KILLED** — 5 of 157 tests failed.

- ✕ `reads the anchor keyed on the PERSON, not on the tab`
- ✕ `TWO TABS beating in the same instant credit the ten seconds ONCE`
- ✕ `THREE TABS credit the same ten seconds as one tab - the documented claim`
- ✕ `a PAUSED beat does not advance the anchor, so the viewer keeps what they earned`
- ✕ `on a FIRST beat the lock holds nothing - safe only because a null anchor credits 0`

Four of the five are in the Postgres tier. **One** assertion in the locally-runnable suites notices this at all.

### THE LOCK DROPPED

Two tabs beating in the same millisecond both read the same stale anchor and both credit the full gap. The dedup rule survives in the comments and fails in practice.

```diff
-  WHERE occurrence_id = :occ AND enrollment_id = :enr
-  FOR UPDATE`,
+  WHERE occurrence_id = :occ AND enrollment_id = :enr`,
```

**KILLED** — 6 of 157 tests failed.

- ✕ `TWO TABS FOR ONE PERSON CREDIT ONCE`
- ✕ `serialises concurrent tabs with FOR UPDATE, or both would read the same stale anchor`
- ✕ `caps a long gap, so a laptop asleep for an hour does not bank an hour of watching`
- ✕ `a stored deliberate survives a later auto beat`
- ✕ `TWO TABS beating in the same instant credit the ten seconds ONCE`
- ✕ `THREE TABS credit the same ten seconds as one tab - the documented claim`

Six with Postgres, **four without** — and three of those four are the mock withdrawing its own fixture rather than evidence about the lock. See the findings.

### TABS COUNTED AS PEOPLE

The audience read counts rows instead of people, so one viewer with two tabs open is reported to the producer as two audience members — the precise thing the service comment says COUNT(DISTINCT) exists to prevent.

```diff
- COUNT(DISTINCT s.enrollment_id)::text AS people
+ COUNT(*)::text AS people
```

**KILLED** — 1 of 157 tests failed.

- ✕ `counts DISTINCT enrollment_id, never rows`

One assertion, in one file.

### THE FRESHNESS WINDOW DROPPED

Every tab that ever beat counts forever, so the number only rises and a finished class still shows an audience. It also stops being the query idx_bvs_active was built to serve, which ties this reversal directly to criterion 5.

```diff
-   AND s.last_beat_at >= :cut
```

**KILLED** — 1 of 157 tests failed.

- ✕ `filters on last_beat_at in SQL, which is what the index exists to serve`

One assertion — and its neighbor in the same describe block, named for the same window, passes with the window gone. See the findings.

### STAFF AND TEST ACCOUNTS COUNTED

The producer counts themselves and every test account inflates a figure that business decisions are made on.

```diff
-   AND (:diagnostic OR (p.is_staff = FALSE AND p.is_test = FALSE))
```

**KILLED** — 1 of 157 tests failed.

- ✕ `excludes them by default`

One assertion. A second test failed on the first batch run and passes in isolation; it is a flake, recorded in the findings rather than counted here.

### A COLLECTION FAILURE RENDERS AS AN EMPTY ROOM *(named by the criterion)*

Collection is down and the producer is shown that nobody watched. A verdict on us, rendered as a verdict on the broadcast — and a producer who believes it stops a class people are actually watching. This is the second reversal the ticket names.

```diff
-  res.status(503).json({ error: 'MeasurementUnavailable', available: false, … })
+  res.json({ available: true, watching_now: 0, deliberate: 0, auto: 0, by_mode: {} })
```

**KILLED** — 1 of 157 tests failed.

- ✕ `a COLLECTION FAILURE carries no count field at all - not zero, not null, absent`

### A ZERO SMUGGLED INTO THE 503

The status code and the flag stay correct and a renderable zero is added beside them. Every assertion about the 503, the error name and the reason still passes. Only a test that requires the count field to be ABSENT can tell this from the real thing.

```diff
   res.status(503).json({ error: 'MeasurementUnavailable', available: false,
     reason: 'collection_unavailable',
+    watching_now: 0,
   });
```

**KILLED** — 1 of 157 tests failed.

- ✕ `a COLLECTION FAILURE carries no count field at all - not zero, not null, absent`

Killed — because that test asserts absence with `not.toHaveProperty`, not merely the status code. This is the one place in the scope where the contract, rather than its outward shape, is what is tested.

## The controls

`reports a real zero as zero` — PASSES under both 503 reversals while the absence assertion dies. So the suite is not merely reacting to a change in that function — it tells a genuine zero apart from a manufactured one, which is the whole requirement. A suite that went red on both would prove only that it noticed an edit.

`counts DISTINCT enrollment_id, never rows` — Fails under TABS COUNTED AS PEOPLE and passes under the other six, so the scope localizes a reversal rather than reddening wholesale.

## What the run established

### Each of the audience read's three rules rests on exactly one assertion

Count the person not the tab, only count the fresh, exclude staff and test accounts: these are the three things that make `watching_now` a number anyone can act on. Each one was reversed, and each reversal was noticed by **one** test out of 157 — all three in `broadcastTelemetryQuery.test.ts`, each a regex over the SQL text.

The other 156 tests stayed green through all three. So renaming or deleting one `it()` leaves a whole property of the measurement unprotected, and the suite still reports green. That is not an argument for more tests; it is the thing to know before trusting "the audience read is tested" as a statement about anything other than its SQL text.

### A test named for the freshness window passes with the freshness window deleted

The describe block is called *"the freshness window is IN the query"* and holds two tests. Deleting `AND s.last_beat_at >= :cut` from the query kills one of them.

The other — `derives the cut from viewerExpirySeconds, not from a hardcoded number` — **passes**, because it asserts the replacement VALUE rather than the predicate:

    expect((repl.cut as Date).toISOString()).toBe(...)

`cut` is still computed and still passed in the replacements object when nothing in the SQL refers to it. The test is correct about what it checks and is not evidence for what its name suggests. This is the same shape as L8.3's finding, in a different file: the assertion that reads as if it guards the rule is checking one layer to the side of it.

### Three of the four local kills on the lock are the mock going quiet, not evidence

Removing `FOR UPDATE` reddens four tests without a database. Only one of them, `serialises concurrent tabs with FOR UPDATE`, is an assertion about the lock — and it is a regex over the SQL.

The other three fail for a mechanical reason. The suite's fixture supplies the stored person row **only when the SQL matches `/FOR UPDATE/`**:

    query.mockImplementation(async (sql: string) => (
      /FOR UPDATE/.test(sql) ? [{ last_credited_at: lastCreditedAt, intent }] : []
    ));

Take the lock out and the mock answers "this person has never been seen", so the service credits nothing and keeps no stored intent — and `caps a long gap`, `a stored deliberate survives a later auto beat` and `TWO TABS FOR ONE PERSON CREDIT ONCE` fail because the fixture withdrew, not because the behavior is wrong.

The mock is a reasonable way to tell the queries apart. The consequence is that mutating the lock perturbs the fixture, so the local tier cannot produce clean evidence about the lock at all. The two kills that are genuinely behavioral are both in the Postgres tier — which is the next finding.

### The Postgres tier is where the dedup rule is actually proven — and it skips silently

`broadcastTelemetryAnchorRace.integration.test.ts` is gated on `DATABASE_URL` and SKIPS without one, with a console warning that says in as many words that it is "NOT evidence ... unless it actually ran". Run the telemetry scope the ordinary way and it reports **5 suites, 152 tests, 5 skipped** — green, and missing the only behavioral evidence about the lock.

Measured, both ways: re-keying the anchor to the tab is noticed by **five** tests with a database and **one** without. Dropping the lock is noticed by six with and four without, and of those four, three are the fixture artifact above.

It is not hard to run — the suite's docblock carries a one-line `docker run` on a dedicated port with throwaway credentials, and it takes eight seconds. CI runs it in the "Integration tier (Postgres)" job. A local run that omits it is the one that should not be quoted as evidence.

### The one place the contract itself is tested, rather than its outward shape

The 503 branch was reversed twice: once crudely, into a 200 with a fabricated zero, and once subtly — keep the 503, keep `available: false`, keep the reason, and add `watching_now: 0` beside them.

Both died, to the same single test, because that test does not stop at the status code:

    expect(body).not.toHaveProperty('watching_now');
    expect(body).not.toHaveProperty('deliberate');
    expect(body).not.toHaveProperty('auto');

That is the difference between the two halves of this record. Three of the audience read's rules rest on one assertion each, and so does this one — but this assertion requires the ABSENCE the requirement is actually about, and so it catches a reversal designed to look correct. "One test" is not the problem; what the one test asserts is.

### A flaky test inside the scope can manufacture a kill

On the batch run, the staff-and-test reversal showed **two** failures: the real one, and `puts the rundown on the producer READ budget, not the command one` — a rate-limit test in a different file that cannot be causally affected by a line removed from a SQL string.

It fires 61 concurrent requests and asserts the 62nd is throttled, so it is timing-sensitive under CPU load, and the batch run supplied the load. Re-run on its own it passes (3/3), and the reversal re-run in isolation kills exactly one test. The record says one.

Worth keeping because of the case that is not this one: if a reversal nothing really catches happens to coincide with a flake, the record says "killed" and names a test that failed for an unrelated reason. **Any single failure outside the module under mutation should be re-run in isolation before it is believed** — which is the same discipline as checking the suite count, applied to the kill list.

## Criterion 5 — the query plan

The index: `idx_bvs_active` on `broadcast_viewer_sessions (occurrence_id, last_beat_at DESC, state, enrollment_id)`.

Measured 2026-11-07 on postgres:16-alpine, throwaway container, ANALYZE run before each plan. The DDL is
`BROADCAST_TELEMETRY_STATEMENTS`, imported; the query is extracted from the shipped service at
run time rather than copied, because a hand-copied query is a plan for a statement nobody runs.

| Table size | sessions | people | `idx_bvs_active` chosen | seq scan |
|---|---|---|---|---|
| EMPTY — what the production run on 2026-10-16 could see | 0 | 0 | no | yes |
| SMALL — one week of a modest program | 1,600 | 800 | **yes** | no |
| REAL — a year of classes at scale | 60,000 | 30,000 | **yes** | no |

**EMPTY — what the production run on 2026-10-16 could see** — Sequential scan on both tables. **This is the correct plan**, not a failure: with no rows there is nothing for an index to narrow. It is also exactly what the script warns about — which makes the empty-table plan evidence that the query is plannable and the index exists, and evidence of nothing else.

**SMALL — one week of a modest program** — The planner switches to `idx_bvs_active`, with `(occurrence_id, last_beat_at)` as an **Index Cond** rather than a filter. This is the plan the index was built for, and 1,600 rows is where it starts being chosen.

**REAL — a year of classes at scale** — Unchanged at 37x the rows: same index, same index condition, same nested loop. The cost estimate barely moves, because the index condition is doing the work the freshness window was designed to let it do.

The plan at the largest size. Parameter values are shown as `$1`-`$3`; the run printed them
folded in, because Postgres chose a **custom** plan — which matters for the comparison with
production below, not just for readability.

```
GroupAggregate  (cost=17.04..17.06 rows=1 width=44)
  Group Key: p.intent, p.access_mode
  ->  Sort  (cost=17.04..17.04 rows=1 width=28)
        Sort Key: p.intent, p.access_mode, s.enrollment_id
        ->  Nested Loop  (cost=0.70..17.03 rows=1 width=28)
              ->  Index Scan using idx_bvs_active on broadcast_viewer_sessions s
                    Index Cond: ((occurrence_id = $1) AND (last_beat_at >= $2))
                    Filter: ((state = 'playing') OR ((state = 'buffering')
                              AND (last_playing_at IS NOT NULL) AND (last_playing_at >= $3)))
              ->  Index Scan using broadcast_viewer_people_pkey on broadcast_viewer_people p
                    Index Cond: ((occurrence_id = $1) AND (enrollment_id = s.enrollment_id))
                    Filter: ((NOT is_staff) AND (NOT is_test))
```

### idx_bvp_reportable is not used by this query — and it is not dead either

Its DDL comment reads *"Reporting reads filter the excluded out, so the exclusion is part of the index."* The audience read does not use it at any of the three sizes: the nested loop already has both of the people table's primary-key columns, so the PK is cheaper and `is_staff`/`is_test` become a Filter on the fetched row.

The index does earn its place, on a different read. The rollup in `broadcastPopulationService.ts` selects from `broadcast_viewer_people` with no join to supply a key, and there the planner uses `idx_bvp_reportable` with all three columns as an Index Cond (Bitmap Index Scan, cost 5.00). Measured, not assumed — because "this index is unused" would have been the wrong conclusion from the audience plan alone.

### The state predicate is a Filter, not an index condition

`state` is the index's third column, but the predicate is an OR across `state` and `last_playing_at`, and an OR of that shape cannot become an index condition. So the index narrows on `(occurrence_id, last_beat_at)` and the buffering-grace rule is applied to the rows that come back. That is the right division of labor — the window is what makes the set small — but it means the trailing index columns are not doing predicate work.

### It is an Index Scan, not an Index Only Scan, so the heap is still read

The index comment says `enrollment_id` is included *"so the DISTINCT can be answered from the index without touching the heap"*. That benefit is not realized for this query: `last_playing_at` appears in the predicate and is not in the index, so every candidate row must be fetched from the heap anyway. Adding `last_playing_at` to the index would make an index-only scan possible — and is **not** proposed here, because at this cost there is nothing to fix and a wider index is a write cost on the hottest table in the system.

### The production run of 2026-10-16

It reported: Index Scan using idx_bvs_active, plus Index Scan using idx_bvp_reportable.

The row counts that run printed were not carried into the session log entry, and a plan cannot be read without them. Its people-side choice also differs from all three sizes measured here, where the primary key is chosen instead.

There are two candidate explanations and this record does not pick between them. The row counts are one. The other is visible in the output itself: production printed `$1` and `$2` **unfolded**, which is a generic plan, where every run here produced a custom plan with the values folded in — and a generic plan cannot use the selectivity of the actual parameters. Either would account for it; only a re-run that prints the row counts can say which.

**Why it was not repeated here.** A re-run would need `scripts/explainBroadcastTelemetry.js` copied onto the host: the repo-root `scripts/` directory is not copied into the backend image (checked in `backend/Dockerfile`), which is why the script's own usage line says to put it in /tmp. That is a write to production infrastructure, so it is not taken unilaterally here.

**Still owed.** One command, for whoever next has production access: copy the script into the backend container and run it. It answers two things at once — the current plan, and the row counts, which say whether telemetry has collected anything at all since L4.9 wired the caller on 2026-10-20.

## What this does not establish

The plans above come from a throwaway Postgres seeded to a realistic shape, not from
production. They establish that the query uses `idx_bvs_active` once the table is big enough
for an index to be worth using, and that the choice tracks the data rather than being an
artifact of an empty table. They do not establish what production's planner does on
production's statistics — only the run named above can, and it is one command.

Nor is any of this evidence that telemetry is **collecting**. That is L4.9's territory, and the
row counts from the owed production run are what would answer it.
