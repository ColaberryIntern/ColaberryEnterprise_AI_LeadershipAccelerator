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

### A. Monthly rollover - run in the first week of each month

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
6. **Materialize curriculum for the newly opened batch** - see Edge cases; a new batch has no
   `curriculum_modules` rows and the portal throws without them.

### B. When a member pays

Placement is "the batch whose month contains the payment date". **This is not yet automated** -
see Edge cases. Until it is, an admin assigns the member to the open batch, which is the
current month's batch, so the manual action and the rule agree as long as step A ran on time.

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

## Edge cases and failure modes

| Failure mode | What to do |
|---|---|
| **A new batch has no curriculum.** `curriculum_modules` and `live_sessions` are per-cohort (`backend/src/models/index.ts`), so a freshly inserted batch has none, and `backend/src/services/curriculumService.ts` throws `No curriculum modules found for cohort <id>`. **A batch row is a container, not a deliverable program.** Materialize modules for the batch before anyone in it opens the portal. | Blocking. Do it as part of step A6, not after the first complaint. |
| **Placement is not automated.** Every paid write path takes `cohort_id` from its caller (`backend/src/services/enrollmentService.ts`); the payment webhook only flips `payment_status` and never re-places anyone. Nothing computes "the batch for this month". | Until the resolver ships, step A must run on time, because the open batch is the only thing an admin add can land in correctly. |
| **`selectNextOpenCohort()` is the wrong rule for this model.** It picks the soonest open cohort whose `start_date` is in the future. It has no callers today. If it is ever wired into placement, a mid-month signup lands in **next** month's batch. | Do not wire it in. Placement is a lookup on the batch month, not a sort on `start_date`. |
| **Two batches open at once.** Public surfaces and `getNextCohort()` start disagreeing about which batch is current, and campaign copy advertises the older one. | Close the older one immediately, then verify check 2. |
| **A missed rollover.** The previous month stays open and takes this month's signups. | Close it, open the correct month, and move any enrollment created after the 1st into the right batch. This is why three months of rows are kept ahead. |
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
- **Closing a batch must never remove access.** Verified by check 5 above. If it ever does,
  something has started reading `Cohort.status` as an access gate and that is the bug.
