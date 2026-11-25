# CC-20261124-b4rk — R26: the named people behind a Revenue Room count

Ticket: R26 — https://app.basecamp.com/3945211/buckets/7463955/todos/10547700764 (due
2026-11-28)

**Origin.** Taiwo Oludimimu (Admissions & Support Supervisor), by email to Ali on 25 Nov 2026
at 10:01 AM CST, about the Revenue Room tab:

> I was going over this reported data in the **Revenue Room** tab on the Admin portal, and I
> thought it was very detailed with helpful data. However, I was wondering if this highlighted
> data is accurate or if you're still working on it. If it is, can you make the data points
> clickable so they show a list of students or leads that fall within each category? Or are
> they recorded and accessible elsewhere? I would like to look further into this data.

**Ali's decision, 25 Nov:** build it for every stage, including the sensitive ones. Chosen over
a reply-only answer, over limiting it to the non-payment stages, and over sending her one-off
extracts. So comped, payment failed and refunded all get a named list.

---

## Her three questions, answered before any code

**1. Is it accurate?** Yes. Re-verified against production on 25 Nov, independently of the page
code: Signed up 296, Comped 28, Paying now 27, Term ran out 5, Canceled after paying 38,
Payment failed 42.

Two things will make a reader misread it, and both now appear **on the page** rather than only
in a reply, because the next reader will not have the email:

- **The Count column does not add up, by design.** All 42 "Payment failed" rows are also
  counted under "Never paid". The stages answer different questions and do not partition.
- **"Paying now" is 27 and will disagree with every other count of members.** The 5 "Term ran
  out" rows still read `status = active` in the database; their paid term ended and nothing
  renewed them. A screen counting `active` says about 60. This one is right, and that
  correction landed 16 Nov, when counting lapsed rows as revenue was overstating annualized
  revenue by $26,268 a year.

**2. Clickable?** It did not exist. The only Revenue Room drill-down lists initiatives and
evidence, not people.

**3. Elsewhere?** No. No admin screen lists these people by payment stage.

---

## The constraint that shaped the whole build

The counts are computed in JavaScript by classifying every `subscriptions` row, and **a row can
land in several stages**. There were two ways to produce the list behind a count:

1. A SQL `WHERE` clause per stage.
2. Extract the classification once and derive both the count and the list from it.

The first is how a page ends up showing a count of 27 above a list of 32 — and that does not
read as a bug in one of them, it reads as a reason to stop trusting the screen. The rules are
fiddly enough (overlapping stages, the comp check running before the payment check, a lapsed
term still reading `active`) that a second implementation in SQL would drift, and the drift
would be invisible until somebody counted the rows on screen.

So `membershipStages.ts` holds the rules once. `membershipFlow` tallies them, `membershipRoster`
filters by them, and the invariant is asserted directly: for every stage, the tally equals the
number of rows a per-stage filter returns.

### Two oddities reproduced rather than fixed

This was a move, not a redesign. Both of these look like bugs and are preserved deliberately,
because changing them silently moves numbers on a page people already read:

- **Stages overlap.** A `failed` row is counted under both "Payment failed" and "Never paid".
- **`renewal_due` does not exclude comps.** It came from a separate `.filter()` that checked
  only `active + has_payment + term ahead`, while the tally loop caught comps first and
  stopped. A comp row carrying a payment id therefore lands in both "Comped" and "Renewal
  ahead". A test pins this, so a future refactor cannot correct it *by accident*. Correcting it
  on purpose moves a published number and belongs in its own ticket.

---

## What shipped

- `membershipStages.ts` — the classifier, pure and leaf.
- `membershipRoster.ts` — the people in one stage, filtered by that classifier, LEFT JOINed to
  `enrollments` for the name. A row that does not resolve is **listed with its absence stated**,
  never dropped: a list quietly shorter than its own count is the exact failure being prevented.
- `GET /api/admin/commercialization/revenue-flow/membership/stage/:stageKey/people`, Zod
  validated, 404 on an unknown stage rather than an empty list.
- `StageRosterPanel.tsx` — name, email, and what the row is. The count is a **button only on the
  membership stream**; the government and enterprise funnels are different shapes with no roster
  endpoint, so their counts stay plain text rather than looking alive and 404ing.
- The overlap warning, on the card.

**Measured before building, so nothing was assumed:** `subscriptions.enrollment_id` is NOT NULL
and all 296 rows resolve to an enrollment carrying `full_name` and `email` — zero orphans. The
ninth stage, Refunded, comes from `refunds`, which carries its own `enrollment_id` plus a
`customer_email` fallback over 3 settled rows.

**The panel prints a disagreement rather than hiding one.** If `count` ever differs from the
number of rows it drew, it says "Count says 27, this list holds 2" instead of printing whichever
number is to hand.

---

## Verification

| Gate | Result |
|---|---|
| Backend, revenue suites | **29 suites / 580 tests pass** (33 new) |
| Backend, copy ratchets | **57 suites / 976 tests pass** |
| Backend, commercialization | **12 suites / 172 tests pass** |
| Frontend, revenue suites | **9 suites / 180 tests pass** (11 new) |
| Backend project typecheck | clean for every file touched |
| Mutation check | **15 of 15 killed**, 0 survived, control green first |

Fifteen mutations, each one a change that would make the page lie: a lapsed term counted as
paying again; the failed/never-paid overlap removed; `renewal_due` silently corrected to exclude
comps; a cancel that never paid counted as churn; the term boundary moved so somebody drops out
of revenue a day early; the tally counting a row once instead of per stage; unresolved rows
dropped from the roster; an INNER JOIN shortening the list; an unknown stage answered with an
empty list; a missing table reported as a measured zero; failed refund attempts counted as
refunds; a count/list disagreement smoothed over; an unnamed row given an invented name; the
count made clickable on every stream; and the overlap warning removed. All fifteen killed on the
first pass.

**The escaped-dash ratchet earned its keep.** I used `&#8212;` as the placeholder for a missing
email and the lint refused it, with exactly the right message: *"Escaping the dash does not make
it a different dash."* It was a real defect by this page's own doctrine — a dash in a column of
emails reads as "blank" and invites the reader to assume the address exists and failed to load,
which is the same mistake the page refuses to make with a zero. Now it reads "None recorded".

**`membershipFlow`'s 14 existing tests passed unchanged** after the tally loop was rewired to
the shared classifier, which is the evidence that the refactor moved no number.

**Branch note.** R26 was built while R12's PR was still open and was therefore sitting on top of
it. R12 merged during the build, so R26 was moved onto a branch off the updated `origin/main`
after confirming none of the four modified files had drifted, and both suites were re-run on the
new base. No stacked PR was ever opened.

---

## Not done, and named

- The **government and enterprise funnels** have different shapes from different tables and get
  no roster in this ticket.
- **Who can reach the Revenue Room is unchanged.** Taiwo is `role = 'admin'` in `admin_users`, a
  flat role with no per-section scoping, so she could already open it. This ticket changes what
  the page shows, not who sees it. Ali accepted that per-person payment status is now visible to
  anyone with admin access.
- The `renewal_due` comp overlap, above.
