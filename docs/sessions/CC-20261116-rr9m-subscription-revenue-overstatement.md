# Session CC-20261116-rr9m

Tab: revenue-room-for-ram. Date: 2026-11-16.

---

## The revenue figure on Ram's board was 32% high, and the duplicate that caused it

- [x] Counted collectible revenue through the definition the codebase already called
      canonical, fixed the renewal collision that produces the duplicates, and closed the
      monitoring gap that hid three unbilled members
  - Date: 2026-11-16
  - Session: CC-20261116-rr9m
  - What changed: `backend/src/services/commercialization/commercializationBoardService.ts`
    (`annualizedRevenueCents` now composes `PAYING_MEMBERS_CTE`),
    `backend/src/services/revenueFlow/membershipFlow.ts` (a `lapsed` funnel stage; one
    reading of "today" instead of two), `backend/src/services/subscriptionService.ts`
    (`activateByRef` suspends a gateway schedule before superseding its row),
    `backend/src/services/billing/billingHealthCheck.ts` (new
    `schedule_stopped_collecting` check), plus two NEW test files —
    `commercialization/__tests__/annualizedRevenue.test.ts` and
    `revenueFlow/__tests__/membershipFlow.test.ts` — and additions to
    `__tests__/subscriptionService.test.ts` and `billing/__tests__/billingHealthCheck.autopay.test.ts`.
  - Verification: `tsc --noEmit` clean under TypeScript **5.7.3**, the version
    `backend/package.json` declares, proven real by planting
    `const CONTROL_ERROR: number = "..."` first and confirming tsc reported it at
    `membershipFlow.ts(479,7)` before removal. The four residual `TS2307`s (`maxmind`,
    `@anthropic-ai/sdk`) are the known stale-install artifact; both are declared in
    `package.json`. Jest across `billing revenueFlow commercialization renewal marketing
    revenueRoom` plus `subscriptionService`: **1697 pass, 75 suites**.
    **Every new test was run against the PRE-FIX code as a control**, not merely asserted:
    `membershipFlow.test.ts` failed 10 of 14 (the key case reporting `Expected: 0,
    Received: 1`), and the subscription + revenue tests failed 9, including
    `Expected "$55,500" / Received "$0"` and the schedule suspension never being called.
    The new SQL was then run read-only against production and matched the code's
    arithmetic exactly: $55,500, with `counted_rows` equal to `people`, which proves the
    dedupe and the exclusion buckets agree with each other.
  - Notes: see the findings below. All production access was SELECT-only; no data was
    written, and no row was edited to make a number look better.

### Two modules each claimed to own the revenue rule. They disagreed by $26,268

`annualizedRevenueCents` carried a docblock promising it was the one place that knows the
revenue rule, warning that "two surfaces that compute revenue independently will eventually
disagree, and the first anyone will know of it is a meeting where two screens show different
numbers." `marketing/payingMembersSql.ts` carried the same promise about itself, and its
version is the one the landing page, the campaign columns and the ad profitability report
have always used:

> an active annual or monthly subscription whose paid period is running today, never staff.
> One row per person.

`annualizedRevenueCents` used `status = 'active' AND paysimple_payment_id IS NOT NULL`. No
period check, no per-member dedupe, no staff exclusion. Measured on production 2026-11-16:

| Rule | Monthly | Annual | Annualized |
|---|---|---|---|
| `annualizedRevenueCents` as shipped | 29 rows, $5,771/mo | 7 rows, $12,516 | **$81,768** |
| Collectible MRR (`PAYING_MEMBERS_CTE`) | 18 people, $3,582/mo | 7 people, $12,516 | **$55,500** |

The 11 monthly rows responsible, each bucketed by the single reason it is not collectible:

| Bucket | Rows | What they are |
|---|---|---|
| lapsed | 8 | Term ended 5 to **79** days ago, nothing renewed it |
| staff | 3 | Not customer revenue; one was also the only double-active row |
| duplicate | 0 | — |
| no period end | 0 | — |

That figure feeds **three** surfaces: the Commercialization tile, the Revenue Room card and
Ram's Revenue Flow stream. One function, so one fix corrected all three, which is what the
shared-function design was for — it just needed to share the right definition. It now
composes `PAYING_MEMBERS_CTE` instead of restating a weaker rule, and the annualization is a
single `* 12` on an MRR that CTE has already resolved.

`ANNUAL_MULTIPLIER` is gone with it. A per-plan table that has to be kept in step with the
plan list is a second place to be wrong; `'yearly'` sat in it and has never appeared in
production.

### Neither paying nor churned: the state nothing in this system can end

Nothing cancels a lapse. When a term runs out and no payment renews it, the row simply stays
`active`. Reading `status = 'active'` as "paying" was therefore wrong for 8 of 29 monthly
rows, one of them for 79 days.

These rows are not churn either — the member never said anything, and may renew tomorrow or
may already be gone. The database cannot tell which. So they get their own funnel stage,
`lapsed` / "Term ran out", rather than being folded into either neighbour and rather than
being dropped. Dropping them would have made the revenue number right and these eight people
invisible on the same day, which is a worse outcome than the overstatement.

A row with no `current_period_end` lands in the same stage. Zero such rows exist today; the
branch is written and tested so the first one does not quietly arrive as income.

`membershipFlow` also read `new Date()` twice — once for the renewal-ahead filter and once
(after this change) for the lapsed split. Microseconds apart is harmless every day except
across midnight, where one row could count as both. One read, one answer.

### The skip that was right about the danger and wrong about the remedy

A renewal paid through a reminder link is a new checkout, so it lands as a second row. The
supersede scan in `activateByRef` closes the earlier one — unless it holds a
`paysimple_schedule_id`, in which case it was SKIPPED with a `console.warn` reading "left
both active for review".

The danger was real: cancelling our row while PaySimple still holds the schedule orphans it,
and the member keeps being drawn after we stop counting them. But "review" was a log line on
a server nobody tails, and the state it left was permanent. The evidence that nobody was
reviewing it: enrollment `acda8718` held two active monthly rows, and `78f2c3e3`'s scheduled
row was finally closed **by hand** on 2026-11-06, six weeks after its term ended, with the
reason *"Expired duplicate row (period ended 2026-10-24) holding schedule 45119…"*. A person
was doing this function's job on a delay measured in weeks.

The schedule is now taken down first and the row superseded only once the gateway confirms.
If suspension fails the row stays active on purpose, because of the two bad outcomes a
double-counted member is a reporting error and an orphaned schedule is a charge. That case
logs at `error` with the consequence spelled out, not at `warn` with the fact.

The test that pinned the old behaviour as correct was rewritten rather than deleted, and the
assertion it made survives as the suspension-failure case — which is what the skip was
really for.

### A check whose low severity rested on a premise that was already false

`checkDuplicateActive` in the billing watch has flagged this condition all along, at severity
`watch`, with the action "No action unless a new job reads subscriptions. Anything that does
must key on the member, not the row."

A job did read subscriptions, and it keyed on nothing: `annualizedRevenue`. The hazard the
check described had already been realized by the time it was written. Left at `watch`
deliberately — the duplicate is still produced by every manual renewal, and the next reader
of this table will be in exactly that position — but the docblock now records that it
happened once, so the warning reads as history rather than hypothesis.

### Three members have not been charged in 48 days, and no check could see them

The sharpest finding, and the one code cannot close on its own.

- `checkLapsedWithoutFollowup` **excludes** anyone holding a schedule, correctly: a schedule
  is the follow-up, and chasing those members means a payment link plus a live schedule,
  which is a double charge.
- `checkSchedulesMatchBook` compares schedule **IDs** between our book and the gateway. A
  schedule that exists on both sides and has not charged for two months passes cleanly.

Between them, a scheduled member whose billing silently stopped was visible to nobody. Four
were in that gap on 2026-11-16. For a scheduled row `current_period_end` IS the next charge
date — `advancePeriodForScheduledPayment` moves it forward when a charge lands — so a date
that far past means the charge did not fire, failed without being recorded, or its webhook
never arrived.

New check `schedule_stopped_collecting`, run read-only against production, returns three
members on schedules 4511898, 4511901 and 4511911, each **48 days** past their due date.

Its threshold is one full cadence plus three days, which deliberately under-reports: the
2026-09-01 migration promised auto-pay from each member's NEXT boundary, so a member whose
period ended 30 Aug legitimately looked like this until 30 Sep. Firing sooner re-creates the
double charge the autopay guard exists to prevent. A fourth member, 20 days past, is
therefore held back until day 33. Catching that sooner needs the schedule's own next-charge
date from the gateway, which this check does not have.

**This needs a person, not a deploy.** Either those three have had free access since 30
September, or money is moving that our book cannot see. Only PaySimple's charge history can
say which, and the finding's action says so explicitly, including: do not send a payment link
before checking.

### Two things I told Ali that were wrong, corrected here

1. **"The bug is still minting rows: 3 in August, 14 in September, 2 in October, 2 in
   November."** Those were *cancellation* dates read as creation dates. Artifact rows were
   CREATED in July (52), August (10) and September (3) — **none in October or November**. The
   October and November figures were a human closing stale rows. The mechanism is real and is
   now fixed, but it was not actively minting rows this month.
2. **"20 of 63 monthly payer rows are duplicates."** True of the historical, *canceled* rows,
   and the basis for the churn correction (26%, not 54%) — but a different set from the 11
   *currently active* rows behind the revenue overstatement. The two must not be conflated,
   and the duplicate bucket among active rows is zero.

What survives unchanged: expected paid months 8.61 against a breakeven of 8.98, so annual at
$1,788 still beats monthly even under the most generous reading the data permits.

## Still open

- **Three members on schedules 4511898, 4511901, 4511911 need their PaySimple charge history
  read by a person.** The new check will raise them on the next billing watch; it does not
  resolve them.
- **The $55,500 figure is still a floor, not a point.** If those schedules are collecting,
  real revenue is higher than the book shows and the webhook path is dropping events.
- **A new member still starts life on a one-time checkout with no schedule**
  (`subscriptionService`'s own header says so), so the manual population refills and the
  duplicate this PR handles keeps being produced rather than prevented.
- **Campaign attribution is untouched.** Nothing records that a subscription changed plan
  because a campaign asked, which is the next piece of work on this stream.
