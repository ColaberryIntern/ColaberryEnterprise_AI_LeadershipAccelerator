# Run monthly enrollment batches

**Status:** active from 2026-11-05. Decided by Ali Muwwakkil with Taiwo on 2026-11-05.
This supersedes fixed-start cohorts for the AI Systems Architect Accelerator.

## Purpose

Enrollment is **self-paced, delivered in a group atmosphere**. The group is a *batch*, and a
batch is the calendar month in which the member paid. Running one batch per month gives
members a cohort bond based on when they joined, without making anyone wait for a class to
start. This directive is the monthly procedure that opens a batch, carries it, orients it, and
closes it.

The commercial reason for the model: a fixed start date makes everyone who finds us on the
13th wait three weeks, and waiting is where signups die. A batch has no start gate, so the
only thing anyone waits for is orientation, which is always less than five weeks away and is
a real event on a real calendar.

### The model in five rules

1. **Whoever pays in month M joins the month-M batch.** There is a batch for every month,
   with no gaps.
2. **Assignment happens on payment** - not on a start date, and not on a seat being free.
3. **A WhatsApp group opens with the batch.** Jackie manages it, the same way she manages the
   existing groups. It is where the batch asks questions and gets started. It is the
   first-week experience; it is not the orientation class.
4. **Orientation is in the first week of the month after the batch closes.** The November 2026
   batch is oriented in the first week of December 2026. One orientation runs every month from
   then on.
5. **The first orientation is batch-only; after that, batches merge** into the combined
   monthly class with the earlier batches.

**Consequence worth stating plainly: there is no "the cohort starts on the 12th" any more.**
Nothing in this model asks a member to wait for a date before beginning.

## Inputs

| Input | Where it comes from |
|---|---|
| The month being opened | The calendar. One batch per month, no exceptions. |
| `cohorts` row for that month | Created ahead of time by the batch-rollover step below. |
| Orientation slot | First **Monday** of the following month, 18:30-20:00 America/Chicago - the slot the November 2026 cohort already used, so it is the one members expect. |
| `program_id` | `92b98a72-8681-4f04-8ba1-16a18334cd0b` (AI Systems Architect Accelerator), the value the July and November 2026 cohorts carry. |
| WhatsApp group | Created by Jackie. Not automated; there is no WhatsApp integration in this repo. |
| Production DB access | `ssh root@95.216.199.47`, then `docker exec accelerator-backend node <script>`. |

### Date convention, and why `start_date` is the orientation date

`cohorts.start_date` on a batch row holds **the batch's orientation date**, not the first of
the batch month. The batch month lives in `name` ("Cohort - December 2026") and in
`description`.

This is deliberate. Roughly a dozen surfaces read `start_date` as "the next thing that
happens", and every one of them is correct if it points at orientation and wrong if it points
at a day in the past:

- `frontend/src/services/cohortUrgencyService.ts` renders `Starts in ${daysUntilStart} days`.
  A first-of-the-month `start_date` renders **"Starts in -18 days"** on the public landing
  page by the middle of the month.
- `backend/src/services/schedulerService.ts` **cancels payment reminders** once
  `cohort_start_date` has passed ("cohort already started"). A first-of-the-month start date
  switches off collection for the batch in week one - on a batch where most members have not
  paid, that is the most expensive line in this file.
- `backend/src/services/sequenceService.ts` schedules the Class Readiness T-minus ladder
  relative to `start_date`; a past date puts the whole ladder in the past.
- `backend/src/routes/admin/cohortRoutes.ts` and `backend/src/services/contextGraphService.ts`
  both select `WHERE start_date > NOW()` for "next cohort", and return null without one.
- `frontend/src/pages/admin/orchestration/SessionControlTab.tsx` filters
  `start_date >= today`, so a past-dated batch vanishes from the admin session picker.

So: orientation date in `start_date`, batch month in the name. Anyone changing this convention
has to fix those five surfaces in the same change.

### Status convention

**Exactly one batch is `open` at a time: the current month's.** Future batches sit at
`closed` until their month arrives; past batches stay `closed`.

`status` already means what this model needs it to mean:

- `open` admits enrollment (`validateCohortAvailability`, `backend/src/services/enrollmentService.ts`)
  and is the only status visible to `GET /api/cohorts` and therefore to every public surface.
- `closed` stops new enrollment and hides the batch from pickers, **and does not touch member
  access** - portal, curriculum and gating all key off `Enrollment.status` and
  `portal_enabled`, never `Cohort.status`. Closing a batch does not lock anybody out.

Leaving twelve batches `open` is the failure mode to avoid: `getNextCohort()`
(`backend/src/services/schedulerService.ts`) orders open cohorts by `start_date ASC` with no
date filter, so it would start advertising the oldest batch in briefing and campaign copy.

## Steps

### A. Monthly rollover - AUTOMATED since 2026-11-08 (C10.13)

**Steps A1 to A3 and A6 now run by themselves.** The `BatchRollover` job (daily 00:10
America/Chicago, `backend/src/services/batch/batchRolloverService.ts`) closes any batch
whose month has passed, opens the current month's, and confirms the batch room. It runs
**daily rather than on the 1st** because it is idempotent and a daily tick self-heals a
rollover missed to a deploy or a restart - a once-a-month timer gets one chance a month to
be up. It changes one row at a time, by id, recording the previous status in its log.

**It refuses to close anything when the current month has no batch row**, because zero
open batches blocks enrollment outright while one stale open batch still admits members.
That refusal is logged at `warn` with event `no_batch_row_for_current_month`, and it is
the signal that step D (creating rows ahead) has been missed.

To run it by hand - to see what it would do, or immediately after a deploy rather than
waiting for the next tick:

```bash
docker exec accelerator-backend node dist/scripts/rollBatchMonth.js              # dry run
docker exec accelerator-backend node dist/scripts/rollBatchMonth.js --execute
docker exec accelerator-backend node dist/scripts/rollBatchMonth.js --at 2026-12-01
```

The script calls the same function the cron calls, so a dry run is evidence about the
scheduled job rather than about a second implementation of it. `BATCH_ROLLOVER_ENABLED=false`
stops the timer without a code change; the script still works.

**What is still a human's job each month: steps A4 and A5** - handing the closed batch to
Jackie for its orientation, and asking her to open the new batch's WhatsApp group. Neither
is in this repo.

The steps below are the procedure the job performs, kept because they are also what an
operator does when the job is off or has refused.

1. **Confirm the incoming month's batch row exists.**
   `SELECT id, name, start_date, status FROM cohorts WHERE name = 'Cohort - <Month> <Year>';`
   Success signal: exactly one row. If there is none, run the batch-creation step (D) first.
   If there are two, stop - a duplicate batch splits a month's members across two groups and
   must be resolved before anything else.
2. **Close the month that just ended.** `PATCH /api/admin/cohorts/:id` with
   `{ "status": "closed" }`, or the equivalent single-row update.
   Success signal: `GET /api/cohorts` no longer lists it; the batch's members still load their
   portal.
3. **Open the incoming month.** Same endpoint, `{ "status": "open" }`.
   Success signal: `GET /api/cohorts` lists exactly one accelerator cohort, and it is this one.
4. **Hand the closed batch to Jackie for orientation**: she schedules the batch-only
   orientation for the first Monday of this month and posts it in that batch's WhatsApp group.
   Success signal: the orientation appears on the calendar and in the group.
5. **Ask Jackie to open the WhatsApp group for the batch that just opened.**
   Success signal: the group exists and its first message is posted.
6. **Confirm the batch has its own room.** `createCohort` mints one automatically (slug
   `cohort-<id>`, private to the batch plus staff), so this is a check, not a task. If the batch
   was inserted by some other path, call `ensureRoomForCohort` for it - it is idempotent.
   Success signal: the batch appears in the Rooms browse rail for one of its members and is
   absent for a member of another batch.

**There is no curriculum step, and that is deliberate.** Curriculum is shared across every
batch (C10.14, 2026-11-06: "everyone can use the same curriculum until future notice"). This
step used to read "materialize curriculum for the newly opened batch", which at twelve batches
a year is twelve copies a year. Nothing to do now: see Edge cases.

### B. When a member pays - AUTOMATED since 2026-11-08 (C10.13)

**There is no admin step.** Placement is "the batch whose month contains the payment date",
and `backend/src/services/batch/batchPlacementService.ts` is the only place that decides
it. Ali, 6 November 2026: "when a user signs up and pays for a membership, they should
automatically be moved into the cohort for that month."

Four writers mark an enrollment paid, in three different syntaxes, and all four ask that
one resolver: `grantMembership` (self-serve activation and comped grants),
`markEnrollmentPaid` (the legacy PaySimple webhook), `reconcilePayment` (the PaySimple
sweep) and `paymentSyncService` (raw SQL). `appPaymentReconcileService` needs no wiring
because it activates through `activateByRef`, which reaches `grantMembership`, and its own
fallback UPDATE does not write `cohort_id` - asserted by a tripwire rather than assumed
(`__tests__/services/batchPlacementWiring.test.ts`).

**The rules it applies, each of which exists for a case that would otherwise be wrong:**

| Rule | Why |
|---|---|
| Fires on the **unpaid → paid transition only** | `activateByRef` runs on every renewal. The batch is "when you joined", not "when you last paid", so a renewal must never move anybody. |
| Resolves the month in **Central time** | A payment at 23:30 on 30 November Central is 05:30 on 1 December UTC. A UTC month puts that member in the wrong batch, silently, once a month, only at night. |
| Uses the **payment date**, not the clock | A webhook repaired weeks later must place the member in the month they paid. Same distinction as the billing anchor, and the same 2026-08-12 incident. |
| Reads `settings_json.batch_month`, falling back to the **name** | The batch open right now (November 2026) carries no `settings_json` block, while December 2026 onward do. A resolver keyed only on the explicit field would find nothing for the live month. `start_date` is never consulted - it holds the orientation date, which is in the following month. |
| Matches a **closed** batch too | A future batch is `closed` until its month arrives, so a payment early in a month whose rollover has not run yet must still find its batch. |
| Leaves **corporate, sponsor, internship and business** lanes alone | Those are placed by their own `cohort_type` lookups (see Edge cases). |
| **Never throws** | A payment that cleared must land. The member in the wrong batch is an admin correction; an exception here would leave a paying member unpaid. |

No seat arithmetic was added, and none is needed: `seats_taken` is a paid-capacity counter
that the Explorer path never increments, so a free Explorer who pays has nothing to
decrement. The three writers that do increment read the enrollment's own `cohort_id` after
their write, so placing the member first makes their existing increment land on the right
batch.

`settings_json.batch_month` can be filled in for any row that only has its month in its
name (idempotent, dry run by default, refuses to overwrite a conflicting value):

```bash
docker exec accelerator-backend node dist/scripts/backfillBatchMonths.js --execute
```

### C. Orientation cadence

One orientation per month, first Monday, 18:30 CT. The batch oriented that month attends its
own; every earlier batch is welcome in the same session from their second month onward.

### D. Creating batch rows ahead of time

There is **no POST endpoint for cohorts** - `backend/src/routes/admin/cohortRoutes.ts` exposes
GET, GET detail, PATCH and export only. Batch rows are inserted by a script run inside the
production container, and the insert must be keyed on `name` so a re-run is a no-op. Keep at
least three months of future batches on the table so a missed rollover never leaves a month
without a batch.

## Outputs

- One `cohorts` row per calendar month, named `Cohort - <Month> <Year>`, carrying the
  orientation date in `start_date` and `cohort_type = 'accelerator'`.
- Exactly one `open` batch at any moment.
- One WhatsApp group per batch (outside this repo; Jackie's).
- One orientation session per month.

## Verification

Not "looks right". Each of these is a query or a request with one correct answer:

1. **No month has a gap, and no month has two batches.**
   ```sql
   SELECT to_char(date_trunc('month', start_date), 'YYYY-MM') AS orientation_month,
          count(*), string_agg(name, ' | ')
   FROM cohorts WHERE cohort_type = 'accelerator' AND start_date >= '2026-12-01'
   GROUP BY 1 ORDER BY 1;
   ```
   Pass: every month from the current one forward appears exactly once.
2. **Exactly one batch is open.**
   `SELECT count(*) FROM cohorts WHERE cohort_type='accelerator' AND status='open';` must
   return `1`.
3. **The open batch is the current month's.** Its `name` names the current month.
4. **The public surface agrees.** `GET /api/cohorts` returns that one accelerator cohort, and
   `daysUntilStart` for it is **positive** (it is counting down to orientation).
5. **Members of a closed batch still have access.** Pick an enrollment in last month's batch
   and confirm the participant endpoints still return its curriculum. If they do not, the
   close in step A2 was not safe and must be reverted.
6. **No paid member is sitting outside a batch.** This is the check that would have caught
   the state C10.13 was written for: on 2026-11-08 it returned 8.
   ```sql
   SELECT c.name, c.cohort_type, count(*)
   FROM enrollments e JOIN cohorts c ON c.id = e.cohort_id
   WHERE e.payment_status = 'paid' AND e.status = 'active'
     AND c.cohort_type <> 'accelerator'
   GROUP BY 1, 2 ORDER BY 3 DESC;
   ```
   Pass: no rows, apart from the corporate, sponsor and internship lanes, which are placed
   by their own rules. Rows in `explorer` mean placement did not fire - read the
   `batch-placement` log lines for that payment.
7. **The rollover is actually scheduled.** `docker exec accelerator-backend node
   dist/scripts/rollBatchMonth.js` prints `[no change] the <current month> batch was
   already open`. Any other output on a day that is not the 1st means the timer is not
   running (check `BATCH_ROLLOVER_ENABLED`).

## Edge cases and failure modes

| Failure mode | What to do |
|---|---|
| **~~A new batch has no curriculum.~~ FIXED 2026-11-06 (C10.14).** Curriculum is shared: no reader scopes `curriculum_modules` by cohort any more (`backend/src/services/curriculumModuleScope.ts`), so a batch with no rows of its own is served the one shared set instead of throwing. The student-facing curriculum was never per-cohort to begin with - `timeline_cards` are course-scoped with `cohort_id NULL`. | Nothing to do per batch. Do **not** re-introduce a per-batch materialize step; a source ratchet in `__tests__/services/curriculumModuleScope.test.ts` fails the build if a cohort-scoped reader comes back. |
| **`live_sessions` are still per-cohort, and that is correct.** A batch genuinely has its own meetings. Session rooms follow the batch model: the orientation's room is private to the batch, every later session's room is public, because after the first meeting all batches attend the combined monthly class. | Generate sessions per batch as before. The privacy is automatic (`cohortRoomService.sessionRoomPrivacy`). |
| **~~Placement is not automated.~~ FIXED 2026-11-08 (C10.13).** All four paid-status writers resolve the batch from the payment month (`backend/src/services/batch/batchPlacementService.ts`); see step B. | Nothing per payment. If a member still lands wrong, read the `batch-placement` log lines - `no_batch_for_payment_month` means the month has no row, `left_in_other_lane` means they were corporate/sponsor/internship. |
| **A payment arriving in a month with no batch row leaves the member where they were.** The resolver will not invent a batch, and placement is never retried - it fires on the unpaid→paid transition, which happens once. | Keep three months of rows ahead (step D), which is what makes this unreachable. If it happens, move the member by hand: there is no re-placement sweep, by design, because a sweep that re-places by month would move renewing members out of the batch they joined. |
| **Members who paid BEFORE the resolver shipped are not moved by it.** Their unpaid→paid transition already happened, so the fix is forward-only. Measured 2026-11-08: **22 paid, active members sit in the Explorer pool**, having paid in 2026-07 (8), 2026-08 (6) and 2026-09 (8) - all before this model was decided on 2026-11-05. **There is no placeable batch for any of those months** (July 2026 is `completed`; August and September have no row), so they are not a placement failure under this rule, they predate it. | `node dist/scripts/placeHistoricalPaidMembers.js` (dry run by default) reports them and moves **zero**, which is correct: filing them into the November batch would state they joined in November. Giving them a batch at all - retroactive rows for those months, or a deliberate move into the current one - is a product decision for Ali, not an implementation detail. The script stays as the recovery path for the row above. **Not scheduled, on purpose**: a recurring version would move renewing members out of their own batch every month. |
| **`selectNextOpenCohort()` is the wrong rule for this model.** It picks the soonest open cohort whose `start_date` is in the future, so from the 13th onward it files that month's signup into **next** month's batch. **Corrected 2026-11-06: it does have a caller** - `getLatestOpenCohort()` (`cohortService.ts:391`), which is itself dead and marked DEPRECATED in its own docblock. State it the loose way and the next person greps, finds the caller, and concludes the warning is stale. | Do not wire it into placement. Placement is a lookup on the batch month, not a sort on `start_date`. |
| **`resolvePaidCohortFor()` is a SECOND placement rule, and it is the start_date one.** `subscriptionService.ts` reroutes a paying Explorer to "the soonest open cohort that is a real paid cohort", ordered `start_date ASC`. It agrees with the batch month only while exactly one batch is open; it disagrees whenever a rollover is missed (picks the older) or runs early in a month (the right batch is still `closed`). | Already handled: `grantMembership` resolves batch placement first and that result wins. The function is left in place for the `class_start` display it also feeds. Do not add a third rule. |
| **Two batches open at once.** Public surfaces and `getNextCohort()` start disagreeing about which batch is current, and campaign copy advertises the older one. | The daily `BatchRollover` job closes every batch whose month is not the current one, so this self-corrects within 24 hours. To fix it now, run `rollBatchMonth.js --execute`, then verify check 2. |
| **A missed rollover.** The previous month stays open and takes this month's signups. | Self-healing since C10.13 on two fronts: the daily job closes it on the next tick, and placement puts anyone who PAYS in the right batch regardless of which one is open, because it resolves on the month and not on status. An enrollment created but not yet paid still sits in the stale batch until payment moves it. |
| **Explorer signups are not batch members.** Free Open House / training.colaberry.com signups are placed deterministically in the standing `cohort_type='explorer'` cohort (`getOrCreateExplorerCohort`). They join a monthly batch only when they pay. | Never move an Explorer into a batch to make a number look better; they do not consume a paid seat and are excluded from paid metrics by design. |
| **Sponsored and corporate members** are placed by `cohort_type='corporate'` / `'sponsor'` lookups, not by month. | Out of scope for this directive. Leave those lanes alone. |
| **`max_seats` blocks a signup.** `validateCohortAvailability` rejects when `seats_taken >= max_seats`, and `seats_taken` is incremented on payment. A self-paced batch has no room. | Keep `max_seats` generously above any plausible month. The July 2026 cohort already sits at 58 taken against 50 seats, so this check has drawn blood before. |

## Safety constraints

- **Production writes only.** There is no staging copy of `cohorts`. Every insert and status
  change happens against production, so each one is keyed on `name` and re-runnable: same
  input, same end state, no duplicate row.
- **Never bulk-update the `cohorts` table.** One row at a time, by id, with the previous value
  recorded first. A batch row with enrollments attached is a live group of people.
- **Changing an existing batch's `start_date` changes what its members were told** - it feeds
  the welcome call script (`backend/src/services/automationService.ts`), the calendar invite
  on `EnrollSuccessPage`, and the readiness campaign. It is not a cosmetic edit, and it is
  Ali's call, not an implementation detail.

  **OPEN, awaiting Ali as of 2026-11-08: the November 2026 row still reads
  `start_date = 2026-11-12`.** The convention above says it should hold that batch's
  orientation date, 7 December 2026. Left as it is, two things happen after the 12th: the
  public countdown renders a negative "Starts in -N days", and `schedulerService` begins
  cancelling payment reminders for the batch as "cohort already started" - on the batch
  where most members have not paid, which is the most expensive line in that file. Changed,
  50-odd members who were told the 12th see a new date. **Nothing in C10.13 depends on this**:
  placement and rollover never read `start_date`, deliberately. It is a separate decision
  with a deadline of 12 November 2026.
- **Closing a batch must never remove access.** Verified by check 5 above. If it ever does,
  something has started reading `Cohort.status` as an access gate and that is the bug.
