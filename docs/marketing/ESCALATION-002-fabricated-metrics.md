# ESC-002 — Fabricated money metrics across the admin surface

**Raised by:** T010 (marketing metric trust registry)
**Session:** CC-20260909-m4kt
**Date:** 2026-09-10
**Status:** OPEN — needs Ali's decision. Does NOT block the marketing build.

---

## Summary

While registering marketing metrics in the trust registry, I found that several dashboards
report money figures that are computed from a hardcoded constant rather than measured. This is
not confined to marketing, so I fixed only the two files T010 owns and stopped.

Three separate findings, all the same shape: **the UI asserts something it has no way to know.**

---

## Finding 1 — Revenue is a hardcoded price times a headcount (HIGH)

`const PRICE_PER_ENROLLMENT = 4500;` is independently redeclared in **five** services:

| File | What it produces |
|---|---|
| `services/marketingAnalyticsService.ts` | **FIXED in this branch** — campaign `total_revenue`, `revenue_per_visitor`, `revenue_per_lead` |
| `services/campaignLinkService.ts` | **FIXED in this branch** — Channel ROI revenue + ROI %, campaign ROI report |
| `services/revenueDashboardService.ts` | NOT TOUCHED — `actualRevenue`, `projectedRevenue`, `pipelineValue` |
| `services/opportunityScoringService.ts` | NOT TOUCHED — `projected_revenue`, opportunity weighting (`score * 4500 / 100`) |
| `services/strategic-intelligence/scenarioSimulationEngine.ts` | NOT TOUCHED — every simulated revenue scenario |

It is wrong in three independent ways at once:

1. **The price is not $4,500.** The current offer is $149/mo (and $149 annual vs $199 monthly).
   The constant appears to date from the bootcamp era.
2. **An enrollment is not a payment.** Nothing joins these figures to a collected dollar.
3. **It contradicts the standing revenue rule** — revenue means app-originated checkout only.

Net effect: a campaign with ten enrollments and zero collected revenue reported **$45,000**, in a
success-green KPI card labelled "Total Revenue", on a tab called "Revenue Intelligence".

## Finding 2 — Cost-per-lead divides a column nothing writes (HIGH)

`cost_per_lead` and `cost_per_enrollment` divide `campaigns.budget_spent`. I checked every
reference to that column: **the only write in the entire codebase is the literal `0` set at
campaign creation** (`campaignService.ts:50`). Nothing ever increments it.

So every cost-per-lead was `0 / leads = 0`, rendered as currency — an assertion that acquiring a
lead is free. The same zero fed the ROI percentage, which is why channel ROI always displayed 0%.

## Finding 3 — The trust badge is decoration on 35 pages (MEDIUM)

`level: 'live'` is hardcoded on **35 admin pages**, and not one of them ever renders anything
else. The mechanism itself is fine and seven pages use it properly (`AdminIngestLogsPage`,
`AdminReportsPage`, `AdminTrustCenterPage` and others derive it from real state).

On the marketing page it also carried `updatedAt: new Date().toISOString()` inside a
`useMemo(…, [])`, so "last updated" was the moment the component mounted — it never moved when
data refreshed, and it still claimed the page was fresh after a failed fetch.

A badge that cannot say anything but "live" is worse than no badge: it certifies whatever is on
screen, including a 500.

**Fixed on the marketing page only.** The other 34 are untouched.

---

## Finding 4 - the invoicing path bills a hardcoded amount (NEW, and the most serious)

Found while correcting a miscount in Finding 1. **Outside this build's scope entirely; raised
because it is a live payment path.**

`paysimpleService.ts:399`:

```ts
const amount = params.amount || 4500;
```

`createEnrollmentInvoice` is called from `enrollmentController.ts:61` with `fullName`, `email`,
`company`, `phone` and `cohortName` - **and no `amount`**. `amount?: number` is optional on the
parameter type, so this is legal and silent. Therefore every invoice created through the
enrollment endpoint is for **$4,500**.

It is not that the price is looked up and found to be 4500. There is nowhere to look it up:

- the caller does not pass one;
- `createInvoiceSchema` has no amount field, so the request cannot carry one;
- the `Cohort` model has **no price column at all**, so the cohort cannot supply one;
- and the one configurable price the platform does have is not consulted - see Finding 5.

**CONFIRMED WRONG BY ALI, 2026-09-10.** An earlier draft of this section hedged that $4,500
might be the correct cohort price. It is not. Ali's words: *"4500 is no longer applicable. It's
all about the subscription now, 149 per month if they pay for a year up front."*

So the hardcoded literal is not merely rigid, it is **obsolete and wrong in kind**: it bills a
single $4,500 charge for what is now a recurring subscription. The gap is not a percentage, it
is a different billing model.

**What decides whether real money has moved.** Two environment switches gate it, and BOTH must
be non-default for a live charge:

| Variable | Default | Effect when set to the live value |
|---|---|---|
| `PAYSIMPLE_ENV` | `sandbox` | `live` sends requests to the real PaySimple API |
| `PAYMENT_MODE` | `test` | `test` overrides the amount to **$0.01** (`paysimpleService.ts:429`) |

**CHECKED ON PRODUCTION, 2026-09-10. Both switches are live — and the path is unused.**

```
PAYMENT_MODE=live        PAYSIMPLE_ENV=live        API credentials present
```

So the $0.01 override is OFF and requests hit the real PaySimple API. But the money that has
actually moved tells a different story. Every distinct amount ever recorded in `enrollments`:

| amount_paid | count | range |
|---|---|---|
| $1,788.00 | 5 | 2026-07-07 → 2026-07-20 |
| $250.00 | 2 | 2026-08-04 → 2026-08-05 |
| $199.00 | 25 | 2026-07-07 → 2026-08-26 |
| $149.00 | 4 | 2026-07-07 → 2026-07-17 |
| $1.00 | 1 | 2026-07-07 |
| $0.00 | 25 | 2026-07-07 → 2026-08-31 |

**`SELECT COUNT(*) FROM enrollments WHERE amount_paid = 4500` returns 0.** Nobody has ever been
charged $4,500 through this or any path.

The distribution is exactly the current subscription model — $1,788 is $149 x 12, the annual
prepay; $199 is the month-to-month rate. Real payments arrive through the PaySimple hosted page,
which mints its own customer, not through `/api/create-invoice`. Only 8 enrollment rows carry a
`paysimple_invoice_id` at all, and none of the paid ones is 4,500.

**Revised severity: LATENT, not active.** The defect is real and the code path is live-capable,
but it is demonstrably not in use. This is a landmine rather than a fire: the day any form,
landing page or integration points at `POST /api/create-invoice` — which is public and
unauthenticated — it bills $4,500 on a product that costs $149/month, and nothing would flag it.

An earlier version of this section said this "needs checking on the box before anything else
here matters", which over-pitched it. Checking was right; the answer is that no money moved.

**One mitigating fact and one aggravating one.** Mitigating: no page in THIS repo's frontend
calls `/api/create-invoice` - the caller would be the training site or a landing page, which
live in separate repos, so the endpoint may currently be dormant. Aggravating: the route is
**public and unauthenticated** (`server.ts:170`), so anything that knows the URL can reach it.

**Decision needed: what should an enrollment bill now?** Presumably a subscription at $149/mo
with an annual prepay option, which is a different PaySimple object than a one-off invoice -
this is a billing-model change, not a constant to update.

## Finding 5 - a canonical price setting already exists and nothing uses it

`governanceService.ts:212` reads `getSetting('price_per_enrollment')`, defaulting to 4500. So
the platform already has a configurable price - it is just wired only into a settings-sync
display block, while every service that computes money hardcodes its own copy.

This changes the recommended fix for Finding 1. The remaining three services should not have
4500 replaced with a different constant; they should read `price_per_enrollment`, and the
invoicing path in Finding 4 should read it too. That converts five hardcoded copies and one
billing literal into one setting with one owner.

It also means the fix is smaller than it looked: the mechanism exists, it just has no consumers.

---

## Also registered, deliberately NOT changed

`marketing.campaign_visitors` is registered with status `invalid`. The campaign query computes
`GREATEST(site_visitors, email_unique_clickers)` — the larger of two different populations — and
calls it a visitor count. It is not a count of any real group, and it feeds four downstream
percentages.

I did not correct it, because changing that denominator changes numbers people have been reading
for months. That is a decision to take deliberately, not a side effect of a marketing build.

---

## What I changed, precisely

- Registered 11 marketing metrics: 3 `partial`, 7 `unavailable`, 1 `invalid`. **None trusted.**
- `marketingAnalyticsService.ts` and `campaignLinkService.ts` now return `null` plus a stated
  reason instead of a fabricated number, with reasons read FROM the registry so they disappear
  automatically once a real source lands.
- The marketing page renders "Unavailable" with an explanatory panel, never `$0`.
- The marketing trust badge is derived from observed fetch state.

These two services are the **first real consumers of `mayComputeWith()`** — the gate existed and
had no callers but its own test.

## What I did NOT change

The three remaining services and the 34 other badges. Fixing them touches revenue reporting,
opportunity scoring and the scenario simulator, which is a governance boundary (financial
calculations, high blast radius) and well outside a marketing build's scope.

---

## Options

| | Option | Effort | Risk of not doing it |
|---|---|---|---|
| A | **Recommended.** Treat the remaining three services the same way — null + reason — and wire real revenue from checkout payments as a follow-on task. | ~1 day + a task for the payments join | Executive briefings and opportunity scores keep ranking on invented money |
| B | Replace 4500 with the real current price in one shared constant. | ~1 hour | Cheap, but still reports plan-value as revenue; wrong for a different reason |
| C | Leave it, document it. | 0 | The numbers are already being read as real |

Option B is a trap worth naming: it makes the number *plausible*, which removes the only clue
anyone had that it was fabricated.

## Decision needed from Ali

1. Proceed with Option A as a follow-on workstream after the marketing build?
2. Should the 34 remaining trust badges become a single sweep task, or be fixed per page as each
   is next touched?
3. Confirm the `GREATEST` visitor denominator should be corrected deliberately rather than left.
