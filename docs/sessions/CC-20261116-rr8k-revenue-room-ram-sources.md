# Session CC-20261116-rr8k

Tab: revenue-room-for-ram. Date: 2026-11-16.

---

## Every revenue source Ali has named is on the Revenue Flow board

- [x] Rescued the declared-sources commit, fixed the defect that stopped it running, and
      added the two sources Ali named on 16 November
  - Date: 2026-11-16
  - Session: CC-20261116-rr8k
  - What changed: `backend/src/services/revenueFlow/ideaFlow.ts` (rescued from `832dca558`,
    which was stranded on the local-only branch `workstream/revenue-room-all-sources`),
    plus `revenueClassifications.ts` (new `subscription_conversion` stream and
    `conversion_setup` classification), `revenueFlowService.ts` (passes `now`),
    `frontend/src/components/admin/revenueFlow/flowTokens.ts` (declared streams are muted,
    not categorical), and four test files including a new `__tests__/ideaFlow.test.ts`.
  - Verification: `tsc --noEmit` clean on every touched file under TypeScript **5.7.3**, the
    version `backend/package.json` declares, proven real by planting
    `const CONTROL_ERROR: number = "..."` first and confirming tsc reported it at
    `ideaFlow.ts(384,7)` before it was removed. `npx jest -c jest.ci.config.ts --ci` on
    `src/services/revenueFlow`: **66/66 pass, 4 suites**. Widened to
    `src/services/revenueRoom src/controllers/__tests__`: **643/643 pass** (one suite hit a
    transient `readCodeCacheFile` error from the junctioned `node_modules` and passed on a
    re-run alone, 11/11). Frontend `tsc --noEmit` clean on the touched file, and
    `react-scripts test --testPathPattern "revenueFlow|RevenueRoom"`: **83/83 pass, 5
    suites**. Then the output was READ, not only asserted: `ideaFlow` was run through
    ts-node and every stream's headline, four stage definitions and caveat were printed and
    read as a reader meets them.
  - Notes: See the three findings below. The local TypeScript is the trap worth repeating:
    the hoisted root `node_modules` holds **4.9.5** while the backend declares **^5.7.3**,
    and 4.9.5 cannot parse modern `.d.ts` files, so it reports a wall of phantom parse
    errors in `@types/d3-dispatch` and `zod` and never reaches the real code. Four
    `TS2307`s for `maxmind` and `@anthropic-ai/sdk`, and ten `@dnd-kit` errors on the
    frontend, are the same stale-install artifact: all are declared in `package.json`, so
    CI installs them.

### The defect that meant this code had never once run

`buildIdeaFlows(windowStart)` called `betEvents(windowStart)` against a **two**-parameter
function, so `now` arrived as `undefined` and `now.toISOString()` threw on the first call.
The module shipped on 13 November with "WIP: tests ... still to come" and nothing caught it.

It would also have been close to invisible in production. `revenueFlowService` wraps every
stream builder in `.catch()` on purpose, so one broken stream costs its own section rather
than the page. The entire declared-sources section would therefore have vanished behind a
caveat reading like a data problem, on the board Ram is meant to trust.

`now` is now a **required** parameter with no default. A default of `new Date()` would have
hidden the same mistake differently, by letting the timeline disagree with the `now` the rest
of the board was built from. The caller has a `now`; it passes it.

### A stated price advances `defined` and nothing else

Ali, 16 November: *"We can charge 1% of the 1st year salary for all talent hired from the
platform."* That answers the question `hire_fde`'s `defined` stage was blocked on, so it moves
from 0 to 1.

It deliberately does **not** move `wired`. A fee basis is an agreement; what is still missing
is a table that records a placement made through hire.refactored.ai, the hired salary to take
a percentage of, and the event that marks the fee earned. Pinned as a test, because "we
decided the price" is the most natural moment for someone to mark the whole source as ready.

Unit arithmetic, for the record and not on the page: at 1% a $75,000 hire yields $750. The
membership book is $81,768 annualized, so FDE hiring at this rate needs roughly 109 placements
a year to match it. That is a fact about the rate, not an argument against it.

### Two of the three yearly-conversion campaigns have no audience in this database

Measured read-only against production on 2026-11-16:

| Audience | Countable here? | What is actually there |
|---|---|---|
| Current customers | **Yes, 29** | Active `monthly` subscriptions carrying a `paysimple_payment_id` |
| Alumni | **No** | `alumni_referral_profiles` holds 2 rows, `alumni_referrals` holds 1 |
| DA-program students | **No** | Not in this database at all; they are on the platform being retired |

So the alumni and DA campaigns are migration problems before they are revenue problems, and
the DA one additionally waits on the TFC, Clasp and IPBC contract implications Taiwo is
checking. Those two are counted at `defined`, where they genuinely stand, rather than given a
funnel stage reading 0 — a 0 would say "nobody to ask" when the truth is "we cannot see them
from here".

The full subscription picture behind the one real number, same query:

| plan | status | rows | with payment id |
|---|---|---|---|
| annual | active | 7 | 7 |
| annual | pending | 36 | 0 |
| annual | failed | 17 | 0 |
| monthly | active | 29 | 29 |
| monthly | canceled | 35 | 34 |
| monthly | pending | 102 | 0 |
| monthly | failed | 25 | 0 |
| comp | active / canceled | 32 | 0 |

**36 of 284 subscription rows are actually paying.** Annualized that is $81,768: the 7 annual
rows at $1,788 each ($12,516) plus the 29 monthly rows at $199/month ($69,252).

### The conversion that reduces annualized revenue per head

The 29 monthly payers are billed at **$199/month**, which is $2,388 a year. The 7 annual rows
are at **$1,788**, which is $149/month. Both figures are measured, not quoted from a price
sheet: `577100 / 29` and `1251600 / 7`.

Converting a monthly payer to the annual plan therefore **reduces** that member's annualized
revenue by $600, about 25%, in exchange for twelve months of cash up front and the removal of
churn risk. Across all 29 it is $69,252 annualized becoming $51,852 collected immediately.

Whether that trade is worth making is a commercial decision and is Ali's, not this code's. It
is recorded here because a board that presented "convert customers to yearly" as straight
revenue growth would be wrong in a way that only shows up a year later.

### Why a declared stream is muted rather than given the next chart colour

The board went from three streams to five. The obvious move, handing each new stream the next
free `--chart-N` slot, is what this page's own measurements forbid: `--chart-3` and
`--chart-4` are ΔE 1.8 apart under protanopia, far below the floor of 6-8, despite the ramp
advertising itself as colour-blind safe. Only slots 1 and 2 are validated here.

So the split is by whether a stream **earns**, not by slot number. Membership and government
keep a categorical hue, because a reader has to tell those two apart at a glance. The
declared sources are all muted, because they are not three competing identities — they are
one state, "not set up yet", which is exactly what Ali asked to be able to see. Muted is also
the tone the registry already gives every setup classification, so the stream and the chips
inside it now agree.

`hypotheses` moved from `--chart-5` to muted as part of this, which is a deliberate change to
something already shipped: it was the only declared stream when it got a hue, so the
inconsistency did not exist yet. One line, reversible, recorded rather than done quietly. The
next declared source now costs no hue at all.

### Tests that were accurate and became wrong

`revenueFlowService.test.ts` asserted `toEqual(['membership'])` on the partial-failure cases.
That was correct with two streams and became a false failure the moment a third arrived,
because the declared streams read no database and therefore survive any database failure.
They now assert that the **failed** stream is absent and the surviving one present, which is
what that describe block is actually about, plus a new case: when both database streams
throw, the board still says what we are trying to build and not one of the three invents a
figure to fill the empty headline.

`revenueClassifications.test.ts` had the same shape of staleness and had already gone wrong
once — `hire_fde` was added on 13 November while the test still named three streams, so its
total silently stopped equalling the registry length. It now checks both directions: every
listed stream has at least one classification, and no classification sits on a stream the
list does not know about.

## Still open

- **Nothing records that a subscription changed plan because a campaign asked it to.**
  `subscriptions` holds the plan and the lifecycle dates but no attribution, so a monthly row
  becoming an annual row is indistinguishable from a new annual signup. Until that exists,
  the conversion campaigns can be run but not measured, which is the next piece of work on
  this stream.
- **The alumni roster is not in this database.** A campaign needs a list; there are 2 profile
  rows here. Finding where alumni actually live is a prerequisite, not a detail.
- **The DA migration waits on Taiwo**, who is checking the TFC, Clasp and IPBC contract
  implications of forgiving an existing contract in exchange for a year paid up front.
