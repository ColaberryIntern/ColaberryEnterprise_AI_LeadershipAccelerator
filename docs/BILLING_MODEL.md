# Billing Model

**State as of:** 2026-09-01
**Session:** CC-20260901-r3k7
**Verified against:** production Postgres in `accelerator-backend` and the live PaySimple `/v4/recurringpayment` API, both read-only.

Supersedes the "everything is manual" premise in [`RECURRING_BILLING_EXPOSURE.md`](RECURRING_BILLING_EXPOSURE.md), which measured the problem on 2026-08-15 and remains accurate as history.

---

## The one-paragraph version

**Two billing models are live at once.** 21 paying members are on standing PaySimple schedules that collect on their own; 10 are still manual, meaning nothing charges them and a member has to click a payment link or the term lapses. Any code that reads the `subscriptions` table has to branch on `paysimple_schedule_id` rather than assume one model, and every automated message that talks about money has to say which population it means. Getting that wrong in the direction of "assume manual" tells a scheduled member to go and pay something PaySimple is about to collect, which is a double charge.

---

## ⚠️ Count people, not rows

**A manual renewal leaves the old period row AND the new one both `active`.** 10 members currently hold two active rows. Counting rows therefore inflates the book and, worse, misclassifies people: the stale row carries no `paysimple_schedule_id`, so a member who IS on auto-pay shows up in a row-level query as manual and unpaid.

This is not hypothetical — it produced a wrong first draft of this very document, and it is the same trap that would have billed Liza Ayele twice a month during the migration.

Always dedupe to the member's most advanced row:

```sql
SELECT DISTINCT ON (s.enrollment_id) ...
  FROM subscriptions s
 WHERE s.status IN ('active','past_due') AND s.plan <> 'comp'
 ORDER BY s.enrollment_id, s.current_period_end DESC
```

Row counts for reference: 56 active rows, of which 15 are comp seats and 41 are paying rows. Neither number is a headcount.

---

## The book, by person

| | People | Per cycle | Note |
|---|---:|---:|---|
| **On auto-pay** | **21** | **$4,179.00** | 21 schedules at the gateway, all `Active`; book and gateway agree exactly |
| Manual — annual | 4 | $1,788.00 ea | Not due until Jul/Nov 2027. Deliberately not scheduled |
| Manual — monthly | 6 | $199.00 ea | All 6 past their period end; **every one has a named blocker** |
| **Paying people** | **31** | | |
| Comp seats | 15 | $0 | Staff grants, ~10-year period, never billed |

Auto-pay covers **21 of 31 paying members (68%)**, and **21 of the 27 monthly payers (78%)**.

The 6 manual monthly members represent **$1,194** of uncollected monthly revenue. None of it is waiting on engineering.

---

## Why each manual member is manual

There is no "we just haven't got to them" bucket. Every manual member is manual for a stated reason.

| Reason | Who | What unblocks it |
|---|---|---|
| **Bank draft, no consent** (3) | Britiana Akhile, Kepha Ohanga, franck kafando | An affirmative yes. A recurring ACH debit needs explicit authorisation, so this cannot be inferred from a past payment. |
| **Card unusable** (2) | Chukwuemeka Eneh — card belongs to a third party who never authorised a series, borrowed because our checkout rejects UK cards; Shabana Zeeshan — card expired 07/2026, would decline on attempt one | A current card of their own. For Chukwuemeka that means fixing UK checkout first. |
| **Held by instruction** (1) | Mohsin Ali | His reply. A cancellation is pending; he does not go on a standing charge before that is settled. |
| **Annual, not due** (4) | Ikenna, Martin Mungai, Abrahim Nur, Promise Hale | Nothing. Held deliberately; next due 2027. Ikenna is additionally held pending a refund decision. |

So the entire remaining opportunity is **three consent conversations, one card, and one UK checkout bug** — $1,194/month.

The exclusion rules are code, not a list in a doc: `exclusionFor()` in [`subscriptionScheduleService.ts`](../backend/src/services/subscriptionScheduleService.ts) with `ACH_AWAITING_CONSENT` and `CARD_BLOCKED`.

---

## When money actually starts moving

| Date | What |
|---|---|
| **2026-09-04** | **The first automatic charge in this platform's history.** Two schedules, $199 each. |
| 2026-09-30 | The August cohort's first automatic charge. |
| 2026-12-12 | Schedule 4504746 (Elizabeth Nzau), the only schedule predating the migration. |

**Why 2026-09-30 and not 2026-08-30.** Members whose period ended 30–31 Aug were told auto-pay would begin at their *next* cycle, not the one already collected by hand. `MANUAL_THROUGH = 2026-08-31` in [`migrateSubscriptionsToSchedules.js`](../scripts/migrateSubscriptionsToSchedules.js) encodes that promise. Charging on the existing `current_period_end` would have billed them a month early, which is exactly the surprise the consent notice existed to prevent.

The consequence is that for most of September, a migrated member's `current_period_end` sits in the past while a schedule quietly holds them. **They look lapsed and are not.** Anything reading period end alone will misjudge them.

---

## What each automated message says

### Renewal reminder — daily 09:00 CT, `RENEWAL_REMINDERS_ENABLED`

Member-facing, and the only automated message that talks to members about money. It branches on `DueReminder.autopay`, set from `paysimple_schedule_id`:

| Branch | It is | It says |
|---|---|---|
| **On a schedule** | a heads-up | "This renews on its own using the card already on file, so there is nothing for you to do." No payment link. |
| **No schedule** | a request | "Your place carries on as long as the payment goes through," plus the checkout link. |
| **Lapsed** | reassurance | "Nothing has changed on your account and your access is exactly as it was. This is not a warning." |

Two sentences were removed on 2026-09-01 and must not return. Both were true when written:

- *"Nothing bills automatically, so this payment has to come from you."* — false for 21 members, and acting on it means paying twice.
- *"If you would rather stop here, do nothing and no payment will be taken."* — made lapsing the path of least resistance, in a monthly email, to every member. Silence is the easiest thing a busy person does.

Every branch still tells the member how to stop. The change is that leaving is something a member **says**, not something that happens through inaction. Guarded by [`renewalReminderEmail.autopay.test.ts`](../backend/src/services/renewal/__tests__/renewalReminderEmail.autopay.test.ts).

### Billing watch — daily 08:00 CT, no feature flag

Internal, to Ali. Read-only; it cannot move money. Silent when the book is healthy. It runs an hour before the reminders so a broken collection path is known before the day's money depends on it.

Its checks: duplicate active rows, lapsed with no follow-up, reminder job gone quiet, cards expiring before their next charge, and **schedules at the gateway vs schedules in our book** — a schedule the gateway has and we do not charges someone with nothing recording it; one we think exists and the gateway does not means a member silently stops being billed.

`checkLapsedWithoutFollowup` excludes members with a schedule. Without that exclusion it flags a migrated member as `act_now` with the action "confirm these members were mailed" — which invites chasing someone PaySimple is about to charge. Verified against production on 2026-09-01: the unguarded check reported 2 members, and one of them was Victor Chukwukere, whose schedule collects on 30 Sep. With the guard it reports only Kepha Ohanga, who is genuinely manual and awaiting ACH consent.

`checkDuplicateActive` is the one to take seriously despite its `watch` severity. It currently reports 10 members, and those duplicates are why row-level counting misreads the book (see the warning near the top).

---

## The gap this leaves open

**New checkouts do not create a schedule.** `subscriptionService.startCheckout` still creates a one-time PaySimple payment only. Every new paying member therefore begins life in the manual population and has to be migrated by hand afterwards.

The 2026-09-01 migration was a backfill run by hand, one `--only=<email>` at a time. Because the checkout path is unchanged, **the manual population refills**. Closing this means creating the schedule at first payment, in `subscriptionService`, and it has not been done.

Until then the migration script is not a one-off tool — it is a recurring chore, and anyone who assumes "we moved to auto-pay" without qualification will be wrong about every member who joined after 2026-09-01.

---

## Operating notes

- **The migration script is safe to re-run.** Dry-run by default; `--apply` writes; `--only=<email>` scopes it. It refuses to back-charge, and `DISTINCT ON (s.enrollment_id)` stops it double-scheduling a member holding two active rows. That guard exists because iterating rows instead of people would have billed Liza Ayele twice a month.
- **Cancellation must suspend the schedule.** Our row flipping to `canceled` does not stop PaySimple. `suspendSchedule()` is the part that does, and failing to call it means continuing to take a cancelled member's money.
- **A manual renewal leaves both the old and new rows active.** Anything new that reads this table will trip on that.
- **The pinned send runtime at `/mnt/HC_Volume_105361916/send-runtime/dist` carries its own copy of the renewal code** and does not update on container rebuild. It holds `sendRenewalReminders.js` as a manual escape hatch, so a stale copy there sends stale wording. Refresh it by hand with `docker cp` whenever the renewal code changes.
