# Session CC-20261109-k2w7 — the Explorer call queue gets a return leg

**Why this exists.** Kes Delele is about to switch on nightly GoHighLevel tagging from
`GET /api/v1/explorer-growth/outreach` so Rose has a call list. Asked to check his bucket counts
before it went live, the counts reconciled but something else did not: **the queue had no way to
learn that anybody had been called.** Turning tagging on in that state would have re-tagged the
same people every night for ever.

**Decision.** Ali, 2026-11-17, answering a three-option question: **an authenticated endpoint**,
not a daily CSV by email. Kes pushes connected-call outcomes to us; we own the write.

**Branch:** `workstream/explorer-contact-activity-ingest`

`PROGRESS.md` is sealed, so this file is the log of record for this piece of work.

---

## What was true before, measured read-only against production on 2026-11-17

`reachOutCandidate` ([`explorerOutreachRanking.ts:62`](../../backend/src/services/explorerGrowth/explorerOutreachRanking.ts))
drops anyone contacted in the last seven days. It reads
`GREATEST(p.last_contacted_at, staff activity, Ali's personal outreach)`.

| Signal | Reality |
|---|---|
| `explorer_journey_profiles.last_contacted_at` | set on **0 of 1080** profiles. No writer existed. |
| Staff-authored `call` / `meeting` / `note` rows, last 30 days | **0** |
| Rows in that night's pool carrying ANY contact timestamp | **2 of 192** |
| `leads.last_contacted_at` (a DIFFERENT column) | set on 99 of 25,568, newest 22 June 2026, and on **0** of the pool |
| GHL link builder health | healthy. 0 `ghl_contact_links_unavailable` in 72h, against a control matching 1,326 log lines. |

So the suppression had no working input. The code already said so in a comment at
[`explorerCampusService.ts:87`](../../backend/src/services/explorerGrowth/explorerCampusService.ts)
— *"`explorer_journey_profiles.last_contacted_at` has no writer"*. What was new on 17 Nov was the
**consequence**: something was about to start acting on the queue.

### Reachability of Kes's key

He sends `ghl_contact_id`. The path is `leads.ghl_contact_id` → `leads.id` →
`explorer_journey_profiles.lead_id`.

| | |
|---|---|
| Pool that night | 192 |
| Reachable by a GHL contact id | **176** |
| Has a lead row but no `ghl_contact_id` | 16 — his feed can never reach these |
| Has no lead row at all | 0 |
| Whole explorer population reachable | 764 of 1082 |
| `ghl_contact_id` values that are not unique | **1** (8254 ids, 8253 distinct) |
| `lead_id` mapped to more than one profile | 0 |

That last-but-one row drove a real design decision, below.

---

## What changed

One new route, the narrowest write that solves the problem.

```
POST /api/v1/explorer-growth/contact-activity   requireServiceClient('cora')
```

| File | What |
|---|---|
| `schemas/explorerContactActivitySchema.ts` | the contract. `.strict()`, no `z.coerce`, no clock. |
| `services/explorerGrowth/explorerContactActivityService.ts` | the loader. Four statements. |
| `controllers/v1ContactActivityController.ts` | validation, structured logging, the response. |
| `routes/v1Routes.ts` | the route, scoped to `cora` with the v1 rate limiter. |
| `middlewares/serviceAuthMiddleware.ts` | the comment saying cora *"writes nothing here"* was true until today. Corrected rather than left to rot. |
| `routes/README.md` | the v1 contract, including the two-column trap. |

### The four decisions worth defending

**1. It writes the learner-side column, and this is the trap.** There are two columns named
`last_contacted_at`. The suppression reads `explorer_journey_profiles`; `leads` is CRM-side and
the queue never reads it. The incoming key lives on `leads`, so the obvious place to put the data
is the column that does nothing — a write there would succeed, report success, and change not one
row of the queue. A test pins which column moves and a mutant proves the test can tell.

**2. Forward-only, which IS the idempotency.** A timestamp is written only when strictly newer
than the stored value. No dedupe table, no request id, none needed: a replay writes nothing, and
a stale or out-of-order file cannot drag someone's contact time backwards and return them to the
pool early. It also means an external caller cannot *undo* a suppression — not merely disallowed,
but inexpressible.

**3. The response counts two units and says which is which.** `matched`/`unmatched` are CONTACT
IDS; `written`/`unchanged` are PROFILES. The first draft computed `unchanged = matched - written`
across those units. On production's one shared `ghl_contact_id` that goes **negative**, and a
clamp to zero would have looked entirely plausible. Caught by writing the test for the shared id
before trusting the arithmetic.

**4. Future timestamps are refused.** Beyond five minutes of clock skew, a row is dropped and
counted. A far-future value would suppress that person *permanently*, because
`last_contacted_at < NOW() - 7 days` could never become true again. It is the only input to this
route that causes irreversible harm, so it never reaches the database.

### Blast radius of the cora token, now that it is a writer

Read the ranked queue, and move `last_contacted_at` forward. It cannot move a timestamp
backwards, clear one, create or delete a row, or reach another column or table. A test asserts
the service contains exactly one mutating keyword (`UPDATE`) and names exactly two tables.

---

## Verification

| Gate | Result |
|---|---|
| Backend `tsc --noEmit` | clean — proven by a planted control error being the **only** error reported, then restored byte-identical |
| New unit suites | 76 tests across schema, service and controller |
| Test-file typecheck ratchet (8192MB) | baseline matched exactly, in both directions |
| All 7 CI guard scripts | pass |
| Mutation testing | **7 planted, 7 killed** |
| Four SQL statements | proven against REAL data, below |

### The SQL was proven, not asserted

A mocked `sequelize.query` cannot tell you whether a statement is valid Postgres. No container
runtime was available locally, so:

- **The three SELECTs ran against production, read-only**, with a payload of 5 real
  `ghl_contact_id`s plus 2 that cannot exist. Results: matched 5, unmatched exactly the 2
  impossible ids, reached 5. A control confirmed `15:04:00-06:00` and `21:04:00Z` parse to the
  same instant.
- **The UPDATE ran on `accelerator_dev1` inside `BEGIN`/`ROLLBACK`** against a three-row fixture:
  one null, one already newer, one identical. Result: `UPDATE 1`. The null moved to 21:04, the
  newer value stayed at 23:00, the identical one was not rewritten, and a duplicated row in the
  same payload collapsed via `MAX(ts)` with no cardinality error. Rollback confirmed by a
  follow-up count of 0, with a control proving the query shape finds real rows.
- **Production was confirmed untouched**: profiles with a non-null `last_contacted_at` still 0.

`explorerContactActivity.integration.test.ts` is the behavioural version of all of the above and
runs in CI's `integration-tier` job, which discovers every `*.integration.test.ts` and gives each
one its own database.

**My first proof harness proved nothing and said it passed on one section.** `docker exec`
without `-i` discards a heredoc, so the UPDATE section produced no output at all, and a JSON
payload passed as an unquoted shell variable was word-split into garbage. Both were harness
faults. Recorded because a verification script that silently verifies nothing is worse than none.

### An existing guard this change deliberately breaks

`v1OutreachController.test.ts` asserted that **no mutating verb exists under
`/api/v1/explorer-growth`**. That was true and correct: the feed was a one-way read. It is now an
**allowlist naming this one route**, so a *second* write still fails the test and whoever adds it
has to come and say so. Deleting the assertion would have thrown the protection away.

### Full backend suite

The pre-existing failures are `mountLearnerPortalRoutes`, `generateReeseBehaviourInventory` and
`generateReeseToolInventory`. None of the three reads any file this change touches — verified by
listing what each suite imports, not assumed.

---

## What this does NOT do

- **Tagging is not on.** That is Kes's switch, and he has said he will not throw it until the
  writer is live and we have both looked at one real file.
- **Nothing is scheduled on our side.** This is a route that waits to be called.
- **The 16 pool members with no `ghl_contact_id` remain unreachable** by this feed. They keep
  relying on the other two suppression signals. That gap is ours, not Kes's.
- **No new credential.** `cora` already holds a token for the read.
- **Nothing was written to production.** Every production query in this work was a SELECT.

## Still owed

Kes asked for the first push to be the **trailing 14 days** of connected calls rather than just
yesterday — he measured 378 connected calls in 14 days against a 7-day suppression window, so a
yesterday-only first file would re-tag everyone reached before that. That ask is in the reply
sent to him on 17 Nov; he owns building the push and naming the start date.
