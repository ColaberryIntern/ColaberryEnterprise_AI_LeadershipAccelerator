# Recurring Billing Exposure

**Measured:** 2026-08-15 (prod DB + live PaySimple API, read-only)
**Session:** CC-20260814-r7k2
**Method:** direct queries against the production Postgres in `accelerator-backend`, and GET-only calls to `https://api.paysimple.com` using the production credentials. Nothing was written to either system.

---

## The one-paragraph version

The platform has no recurring billing. Every paid term is a discrete one-time hosted checkout, and nothing in the codebase advances a billing period or charges a second time. **Nothing has been lost yet — $0, zero subscriptions have passed their period end — because the paid product is four weeks old and the first renewal has not come due.** It comes due **2026-08-18**, three days from this measurement. Within 30 days, **27 of the 31 paying subscriptions (87%) reach a renewal date that nothing will act on**, worth **$5,373**. Left alone for a year the uncollected total is **$71,631**. The good news, established by direct API probe, is that the migration is cheap: **all 31 subscribers already have a vaulted payment account at PaySimple**, so schedules can be created for them without asking anyone to re-enter a card.

---

# PART 1 — THE NUMBERS

## 1.1 Every active subscription

41 active subscription rows: **31 paying**, 10 comp (Colaberry staff, $0, period end 2036).

| Plan | Count | Unit price | Cadence | Contracted value |
|---|---:|---:|---|---:|
| Monthly | 28 | $199.00 | every 1 month | **$5,572.00 / month** |
| Annual | 3 | $1,788.00 | every 1 year | **$5,364.00 / year** |
| Comp (staff) | 10 | $0.00 | 10-year grant | $0 |

- **Blended MRR: $6,019.00** (monthly + annual/12)
- **ARR: $72,228.00**

There is exactly one price per plan — no legacy or discounted tiers. 10 of the 28 monthly subscribers had a $50 Open House credit applied to their **first** charge only, so they paid $149 up front and are contracted at $199 from renewal onward.

## 1.2 When they lapse, by month

Month in which each active subscription's `current_period_end` falls — i.e. the month it silently stops paying:

| Period ends | Plan | Subs | Value of that billing |
|---|---|---:|---:|
| **2026-08** | monthly | 10 | $1,990.00 |
| **2026-09** | monthly | 17 | $3,383.00 |
| 2026-12 | monthly | 1 | $199.00 |
| 2027-07 | annual | 2 | $3,576.00 |
| 2027-08 | annual | 1 | $1,788.00 |

Day by day, the near cluster is tight:

| Date | Subs | Amount |
|---|---:|---:|
| **2026-08-18** | 1 | $199.00 |
| **2026-08-30** | 2 | $398.00 |
| **2026-08-31** | 7 | $1,393.00 |
| 2026-09-03 | 1 | $199.00 |
| 2026-09-04 | 1 | $199.00 |
| 2026-09-08 | 1 | $199.00 |
| 2026-09-11 | 1 | $199.00 |
| **2026-09-12** | 9 | $1,791.00 |
| 2026-09-13 | 4 | $796.00 |
| 2026-12-12 | 1 | $199.00 |
| 2027-07-23 / 07-30 / 08-12 | 3 (annual) | $5,364.00 |

**10 subscriptions lapse before the end of this month. 17 more in the first half of September.**

## 1.3 Revenue at risk: 30 / 60 / 90 days

Cumulative value of every billing that *should* fire and will not, if nothing ships. Monthly subscriptions recur, so the loss compounds each cycle:

| Window | Billings missed | Uncollected |
|---|---:|---:|
| Next 30 days | 27 | **$5,373.00** |
| Next 60 days | 54 | **$10,746.00** |
| Next 90 days | 79 | **$15,721.00** |
| Next 365 days | 336 | **$71,631.00** |

Monthly totals, so the shape is visible:

| Month | Uncollected |
|---|---:|
| 2026-08 | $1,990.00 |
| 2026-09 | $5,373.00 |
| 2026-10 | $5,373.00 |
| 2026-11 | $5,373.00 |
| 2026-12 | $5,572.00 |
| 2027-01 … 2027-06 | $5,572.00 each |
| 2027-07 | $9,148.00 (annual renewals land) |

**Monthly run-rate exposure settles at $5,572 — the entire monthly book — from December onward.**

## 1.4 Revenue already lost: $0.00

**Zero subscriptions have passed `current_period_end`.** The query returns no rows.

This is the number that matters most and it is genuinely zero, for one reason: the $199/mo product launched 2026-07-15 and the earliest subscription started 2026-07-18. **No subscription has yet reached its first renewal date.** The first is 2026-08-18.

Confirmed structurally as well — every monthly subscription shows exactly one period, `started_at` to `started_at + 31 days`, with no second period anywhere in the table:

```
2026-07-18 -> 2026-08-18 = 31d  (n=2)
2026-07-31 -> 2026-08-31 = 31d  (n=7)
2026-08-12 -> 2026-09-12 = 31d  (n=9)
...
```

No subscription has ever been renewed, in place or otherwise. Nothing has been lost because nothing has been due. **The exposure is entirely ahead of us, and it starts in three days.**

### Were any manually re-checked-out?

No — and this is checked two ways.

1. **In the database:** enrollments with more than one subscription row exist, but every one is a same-day cluster of failed checkout attempts (the worst is 14 rows for one student, all created 2026-07-30, 12 failed / 1 canceled / 1 active). No enrollment has a second subscription row created *after* a prior row's period end.
2. **At PaySimple:** across all payments Jan–Aug 2026, the count of customers with more than one $199 or $1,788 payment is **0**.

Nobody is sending renewal links by hand. There is no shadow manual process holding this up.

## 1.5 PaySimple cross-check

### Recurring schedules

All **1,242** schedules in the account were swept (paged, not sampled):

- Schedules at **$199: 0**
- Schedules at **$1,788: 0**
- Schedules at $149: 32 (28 Active, 6 Suspended)

The $149 schedules are **not** this platform. They belong to the legacy Colaberry bootcamp product, created 2026-05 through 2026-07-16, and they are the reason 43–71 payments per month arrive tagged `recurring_sourced`. Every Accelerator-priced schedule count is zero.

**This is a useful fact rather than a discouraging one: recurring billing demonstrably works on this merchant account today.** The capability is proven and in daily use. It has simply never been wired to the Accelerator.

### Payments received per month

| Month | Settled txns | Total | $199 | $1,788 | $149 | From a recurring schedule |
|---|---:|---:|---:|---:|---:|---:|
| 2026-01 | 65 | $20,521.42 | 0 | 0 | 3 | 56 |
| 2026-02 | 79 | $19,907.42 | 0 | 0 | 11 | 71 |
| 2026-03 | 84 | $22,960.45 | 0 | 0 | 13 | 68 |
| 2026-04 | 73 | $20,260.24 | 0 | 0 | 16 | 64 |
| 2026-05 | 73 | $18,229.24 | 0 | 0 | 17 | 69 |
| 2026-06 | 78 | $18,449.24 | 0 | 0 | 15 | 70 |
| **2026-07** | 136 | $33,864.93 | **14** | **3** | 34 | 71 |
| **2026-08** (partial) | 57 | $15,486.09 | **4** | 0 | 16 | 43 |

The Accelerator appears in July and August only, exactly as expected for a July launch. The bulk of monthly volume is the legacy product on its own schedules.

### Per-subscriber reconciliation

Every one of the 31 active paying subscriptions was matched to its actual PaySimple payment record. All 31 resolved to a real settled payment at the expected amount, none sourced from a schedule:

- 18 × $199.00 = $3,582.00
- 10 × $149.00 = $1,490.00 (the $50-credit cohort)
- 3 × $1,788.00 = $5,364.00
- **Total collected, first and only charge: $10,436.00**

This ties out exactly to the `$199 ×18` / `$1,788 ×3` / excess-`$149` figures in the monthly table above. The books are consistent; the problem is not a recording gap, it is that the second charge does not exist.

## 1.6 Does anything notify anyone? No.

**No job, cron, or service warns any student or admin before or after a period ends.** Verified by exhaustive search:

- `schedulerService.ts` — ~70 cron entries, **zero occurrences of the string `subscription`**.
- Repo-wide, `current_period_end` appears in only 7 source files: the model, `subscriptionService`, `subscriptionAnalyticsService`, `appPaymentReconcileService`, `acceleratorService`, `server.ts`, and 3 frontend files. **No scheduler or job references it at all.**
- `emailService.ts` — no match for `subscription` or `renew`. There is no renewal reminder, no lapse notice, and no receipt email on subscription activation.
- No crontab in the repo, no cron service in any compose file.

The three PaySimple cron jobs that do exist (`PaySimplePaymentSync` /30min, `AppPaymentReconcile` /20min, `PaySimpleWebhookHealth` /15min) all concern *inbound* payment status. None considers whether a period has ended.

**The only surface is an admin page.** `/admin/revenue` → `AttentionPanel.tsx` renders a row labelled `"Lapsed — access may be stale"`, computed at read time. Its own doc comment says: *"Computed from existing data — reporting only, no access is changed by this dashboard."* `subscriptionAnalyticsService.ts` is blunter:

```
/*  "Lapsed" and "failed" below are COMPUTED, not stored — nothing in   */
/*  this codebase flags them today, so this is read-only reporting; it  */
/*  does not revoke access.                                              */
```

So: **a subscription lapses in silence.** No email to the student, no alert to staff. It surfaces only if a human opens `/admin/revenue` and reads the panel. `'lapsed'` is not even a storable status — `SubscriptionStatus` is only `'pending' | 'active' | 'canceled' | 'failed'`.

One consequence worth stating plainly: **lapsing does not revoke access either.** Entitlement is gated on `enrollments.payment_status = 'paid'`, never on `current_period_end`. A student who stops paying keeps full access indefinitely. That protects us from angrily cutting off a paying customer over a billing bug, and it means the revenue loss is pure margin loss with no delivery saving against it.

---

# PART 2 — THE PROPOSAL

## 2.1 Recommendation

**Ship the stopgap this week, and the PaySimple recurring integration behind it.** Not one or the other.

The reasoning is the calendar. The first renewal is 2026-08-18 and 10 subscriptions lapse before month end. A correct recurring-billing integration — schedule creation, webhook rework, dunning, cancellation, migration of 31 live subscribers — is not a three-day build, and rushing a payments integration against a deadline is how you double-charge someone. The stopgap is small, reuses a checkout path that is already live and already correct about credits, and buys the runway to build the real thing properly.

The stopgap is not the destination. It converts silent loss into a student having to click a link every month, which is a bad product and will leak customers to inertia. It is a tourniquet, not a treatment.

## 2.2 What PaySimple actually offers

Confirmed against their live API and current documentation.

**`POST /v4/recurringpayment`** creates a schedule. Required fields:

| Field | Notes |
|---|---|
| `AccountId` | **The stored payment account — not the customer id.** This is the crux of the migration; see §2.4 |
| `PaymentAmount` | |
| `StartDate` | Must not be in the past |
| `ExecutionFrequencyType` | `Daily`, `Weekly`, `BiWeekly`, `FirstofMonth`, `SpecificDayofMonth`, `LastofMonth`, `Quarterly`, `SemiAnnually`, `Annually` |

Useful optional fields:

- `EndDate` — omit and it runs until disabled. Correct for an open-ended membership.
- `ExecutionFrequencyParameter` — required for `Weekly` / `SpecificDayofMonth`.
- **`FirstPaymentAmount` / `FirstPaymentDate`** — a different first charge. This is a direct native answer to the credit-at-checkout problem for new signups (see §2.3).
- `Description`, `InvoiceNumber`, `SuccessReceiptOptions`, `FailureReceiptOptions`.

Read/modify: `GET /v4/recurringpayment`, `GET /v4/customer/{id}/recurringpayments`, `PUT /v4/recurringpayment/{id}`, and schedule suspend/resume. Cancellation is a schedule state change, not a delete.

**A note on shape:** for `monthly` we want `SpecificDayofMonth` with the student's existing anchor day, and `LastofMonth` for anyone anchored on the 29th–31st (7 subscribers anchor on the 31st — `SpecificDayofMonth: 31` will not behave in a 30-day month). For `annual`, `Annually`.

### What integrating it would require here

**1. Auth — no work.** The existing scheme already reaches the endpoint; this audit called it successfully with production credentials. `basic {user}:{key}`, unencoded, in `paysimpleService.ts`.

**2. Schema.** Add `paysimple_schedule_id` to `subscriptions` (it does not exist — there is no schedule to point at today). Add a real cadence column, or keep deriving it from `plan`. Extend `SubscriptionStatus` with `past_due` so a failure is storable.

**3. The schedule create call.** New function in `paysimpleService.ts`. Small.

**4. Webhook handling — this is the real work, and it is where the risk lives.**

PaySimple emits **no recurring-specific webhook events**. A scheduled charge arrives as an ordinary `payment_created`, and — critically — **the event payload does not carry the recurring schedule id**. Today `handlePaySimpleWebhook` matches on `order_external_id` starting with `SUB-`, a value minted by our own checkout. A schedule-generated payment has no such external id, so **every recurrence would fall through the current matcher** into the legacy `CB-` branch or the unhandled log, and silently do nothing.

Matching must be reworked to key on `customer_id` (which *is* in the payload) plus amount, or on `InvoiceNumber` set at schedule creation. Note 119 subscriptions map to only 83 distinct customer ids, so customer id alone is not unique — the resolver needs care.

Then `activateByRef`'s guard `if (sub.status === 'active') return sub;` is exactly wrong for renewals: it exists to make first activation idempotent, and it would no-op every recurrence. Renewal needs a distinct path that **advances** `current_period_end` rather than setting it, and idempotency has to move to a per-payment key (`payment_id`) rather than per-subscription state.

**5. Failure / dunning.** `payment_failed` currently does not handle `SUB-` refs at all, so a failed subscription payment never marks the subscription failed. Needs: mark `past_due`, notify the student, retry policy, a grace period, and a defined end state. PaySimple has its own retry behavior on schedules that must be understood before we layer ours on top, or students get two dunning tracks.

**6. Cancellation.** `cancelSubscription` flips a status locally. It would need to suspend the PaySimple schedule too, or a canceled student keeps getting charged. **This is the highest-severity failure mode in the whole build.**

**7. The existing one-time checkout flow stays.** It is how a subscription is *established* — the hosted link is what captures the card. The change is that a successful first payment now also creates a schedule for subsequent periods.

**8. The credit-at-checkout logic is the sharpest edge.** `startCheckout` is the *only* place a charge amount is ever reduced by account credit; `planCreditPreview` and `consumeCreditsForSubscription` are display and bookkeeping. Credits are whole-row, applied to the first charge only, and there is no proration anywhere in the codebase. A schedule bills a flat `PaymentAmount` forever and knows nothing about our credit ledger — which is correct behavior (credit should not recur), but it means the discount must be expressed as `FirstPaymentAmount` at schedule creation, and any credit granted *later* has no path to reach a running schedule. That needs a decision: either credits granted mid-subscription are applied as a one-off adjustment, or they are refused. Silently ignoring them is the failure to avoid — $1,247 of credit is outstanding across 19 rows right now.

## 2.3 The stopgap

**A job that finds subscriptions approaching `current_period_end` and emails the student a fresh checkout link.**

This is genuinely small because every hard part already exists. `startCheckout(enrollmentId, plan)` already mints a PaySimple hosted link, already applies account credit correctly, already creates the pending row, and the existing webhook already activates it on payment. The job is a finder, a template, and a send.

What it takes:

1. A cron in `schedulerService.ts` — daily. It would be the first entry there that touches subscriptions at all.
2. A query for active subscriptions with `current_period_end` between now and +7 days.
3. Call `startCheckout` for each, get the link.
4. Send via the existing Mandrill service. Needs a new template — `emailService.ts` has no subscription email of any kind today.
5. **Idempotency, mandatory:** a dedup key on `(subscription_id, period_end, reminder_number)` so a re-run or a container restart cannot email twice or mint a second checkout row. This matters more than usual because `startCheckout` creates a row every call, and `AppPaymentReconcile` cancels sibling pending rows as "duplicate checkout submission" — an un-keyed reminder job would fight the reconciler.
6. An admin alert on the other side: a digest of what lapsed, so a human finds out without opening a dashboard.

Realistically 1–2 days including the break/harden pass.

**What it does not solve:**

- **It does not charge anyone.** It converts silent loss into a manual click. Every student who ignores the email still lapses. Expect meaningful leakage from inertia alone.
- It creates a new pending subscription row per reminder, adding to the checkout-attempt clutter that already forces `currentSubscription()` into multi-tier fallback heuristics.
- It does not establish stored payment credentials for future automation.
- It does not fix cancellation, dunning, or the missing `past_due` state.
- The student re-enters card details every month, which is a worse experience than the product implies and invites churn at every renewal.

## 2.4 Migration — and the finding that makes this cheap

**All 31 active paying subscribers already have a vaulted payment account at PaySimple.** Probed directly: 28 with a stored credit card, 3 with a stored ACH account, 0 with none.

This means **a schedule can be created for every existing subscriber without asking anyone to re-enter a card.** No re-checkout, no student action, no interruption. That is the difference between a clean migration and a 31-person email campaign with predictable fallout.

**But there is a data defect in the way, and it must be understood before anyone writes the migration:**

The `paysimple_customer_id` stored on our `subscriptions` rows is **wrong for this purpose in all 31 of 31 cases.** It points at a customer record created by our own `POST /v4/customer` call, while the hosted payment page mints its *own* customer record and vaults the card there. Querying the stored id for payment accounts returns **zero results for every subscriber** — which is exactly the false-negative that would make someone conclude, incorrectly, that migration requires a fresh checkout.

The correct `AccountId` is recoverable from data we already hold: `GET /v4/payment/{paysimple_payment_id}` returns `AccountId` and the real `CustomerId`. Every one of the 31 resolves.

**Migration shape:**

1. For each active paying subscription, `GET /v4/payment/{paysimple_payment_id}` → read `AccountId`.
2. Create a schedule anchored so the **first scheduled charge falls on the existing `current_period_end`** — not sooner. `StartDate` must not be in the past.
3. Backfill `paysimple_schedule_id`, and repair `paysimple_customer_id` to the real charged customer while we are in there.
4. Verify against `GET /v4/customer/{id}/recurringpayments` before considering any row migrated.

**Do this in a dry-run mode first that writes nothing and prints the intended schedule per subscriber for eyeball review.** With 31 rows, a human can read the whole list.

**The consent question is not a technical one and should not be decided by engineering.** These students authorized a one-time charge on a hosted checkout page. Converting that to a standing schedule without telling them is, at minimum, a bad look, and for the 3 ACH subscribers it is a genuine compliance problem — NACHA requires explicit authorization for recurring debits, and a one-time web authorization does not cover a recurring series. **Recommendation: notify all 31 by email before any schedule is created, with a clear opt-out, and treat the 3 ACH subscribers as requiring affirmative consent rather than notice.** This is an escalation item for Ali, not an implementation detail.

Also verify card expiration dates before scheduling — a card that expires before the next renewal produces a failure on day one of the new system, which is the worst possible first impression for it.

## 2.5 What makes this risky

Ranked by severity.

**1. Double-charging.** The live failure mode: a student gets a stopgap reminder link, pays it, *and* a schedule fires for the same period. Anyone who pays manually must have their schedule's next date advanced, or the schedule suspended, in the same transaction that records the manual payment. **If both mechanisms are ever live at once without that interlock, we will double-charge someone.** The strong mitigation is sequencing: do not run the stopgap reminder job and schedules against the same subscription in the same period. Migrate a subscription *off* the reminder job at the moment its schedule is confirmed.

**2. Cancellation not propagating.** `cancelSubscription` sets a local status and nothing else. If it does not suspend the PaySimple schedule, a student who cancels keeps getting billed — worse than the current bug, because it takes money rather than failing to. This must ship in the same change as schedule creation, never after.

**3. Charging a lapsed student retroactively.** When schedules are created, the `StartDate` must be the *next* period boundary. A naive migration that backfills from `started_at`, or that sets `StartDate` to today for a subscription whose period ended last week, could produce an immediate catch-up charge the student never expected. **No retroactive charging, ever — a lapsed period is written off, not collected.** That should be an explicit, tested invariant, not a convention.

**4. The reconciler fighting the reminder job.** `appPaymentReconcileService` cancels sibling pending subscription rows with `cancel_reason = 'duplicate checkout submission (reconcile)'`. A renewal checkout is, structurally, indistinguishable from a duplicate. Either the reminder job's rows are exempted or the reconciler learns about periods, or legitimate renewals get canceled by a job trying to help.

**5. The webhook matcher silently doing nothing.** Because recurrence events carry no schedule id and no `SUB-` external id, a mis-built matcher fails *quietly* — money arrives at PaySimple, and the platform never advances the period. That looks identical to today's bug while being much harder to diagnose. **Test this against a real sandbox recurrence before trusting it**, and add an alert for "payment received that matched no subscription."

**6. No timeouts or retries in `paysimpleService.apiRequest`.** It is a bare `fetch` — no `AbortController`, no signal, no backoff. Adding a batch schedule-creation migration on top of an unbounded HTTP client is asking for a half-finished migration with no record of where it stopped. Fix the client first; it is a small change and it is in the CLAUDE.md external-boundary rules already.

**7. Comp subscriptions.** 10 staff rows at $0 with period ends in 2036. Any migration must exclude `plan = 'comp'` explicitly. PaySimple cannot process a $0 charge, so a bug here fails loudly rather than silently — but it would fail during a migration run, which is a bad time.

---

## Appendix — verification

Everything above was measured, not estimated.

**Production database** (`docker exec accelerator-backend`, read-only SELECTs, DB time `2026-08-15T01:26:10Z`):
`subscriptions` 119 rows total / 41 active; `enrollments` 402 rows; `account_credits` 27 rows. Confirmed the `subscriptions` table has **no** `paysimple_schedule_id` column and no cadence column.

**PaySimple live API** (`https://api.paysimple.com`, `PAYSIMPLE_ENV=live`, **GET only** — the request method was hardcoded in every probe script and no POST, PUT, or DELETE was issued):
- `GET /v4/recurringpayment` — all 1,242 schedules swept by paging.
- `GET /v4/payment?startdate=&enddate=` — Jan–Aug 2026, fully paged.
- `GET /v4/payment/{id}` — all 31 active subscribers individually.
- `GET /v4/customer/{id}/creditcardaccounts`, `/achaccounts`, `/recurringpayments` — all 31.

**Codebase** (`sbp-r0-wt` @ `origin/main`): confirmed zero occurrences of `recurringpayment` / `paymentplan` anywhere in `backend/`; zero occurrences of `subscription` in `schedulerService.ts`; zero scheduler references to `current_period_end`.

**Reconciliation check:** 18 × $199 + 10 × $149 + 3 × $1,788 = **$10,436.00**, matching both the per-subscriber PaySimple lookups and the monthly payment totals independently.
