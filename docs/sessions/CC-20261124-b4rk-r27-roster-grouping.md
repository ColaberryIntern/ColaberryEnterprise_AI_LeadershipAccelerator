# CC-20261124-b4rk — R27: group the roster, link the names, rate the campaigns

Ticket: R27 — https://app.basecamp.com/3945211/buckets/7463955/todos/10548340320 (due 2026-11-28)

**Origin.** Ali, 25 Nov 2026, testing R26 on the live Revenue Room: *"Looks like a lot of
duplicates in the list. If they are legit, group them and show information pertinent to what
she would want to know. Also you need to have their name open up their 360 profile when clicked
on. Send email. When looking at campaigns, show bottom left and right sub kpi's showing the read
and click rates and format the numbers with commas."*

---

## The duplicates are real, and not where they looked

Measured on production the same day:

| Rows per person | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 18 |
|---|---|---|---|---|---|---|---|---|---|
| People | 57 | 21 | 14 | 9 | 10 | 6 | 1 | 1 | 1 |

**296 subscription rows belong to 115 people.** One enrollment carries 18 of them.

But **"Paying now" has none at all** — 27 rows, 27 enrollments, 27 distinct emails. So the
repeats live in the stages that list every row: Signed up, Payment failed, Canceled after
paying, Never paid. A renewal, a plan change and a retried payment each write another
`subscriptions` row, so a roster row is a SUBSCRIPTION, which is correct per row and wrong for
a reader who came looking for people.

**So the roster groups and KEEPS the rows.** `rowCount` is the finding a support reader needs:
four rows at "Payment failed" is somebody who tried four times, and deduping to one name would
delete exactly that. Grouping is by email where there is one, so two enrolments of the same
human merge; two nameless rows never merge, because there is nothing to group on and collapsing
them would invent a person holding two unrelated subscriptions.

### The invariant had to change, so it was changed out loud

R26 asserted "the count equals the rows listed". Grouping breaks that, since 296 rows are 115
people. The honest fix is to carry **both** numbers and say which is which —
`subscriptionCount` is what the funnel shows, `personCount` is the length of the list — rather
than quietly reporting a different number under the same name. A test asserts they reconcile:
the sum of every person's `rowCount` equals `subscriptionCount`.

---

## The click was recorded all along

`interaction_outcomes` held **5,838 `clicked`** rows against 14,036 `opened` and 49,314 `sent`.
The demand path counted only `opened` and `replied`, so a click rate was never missing data —
it was an unasked question.

Both rates divide by **emails sent**, not people asked: an open and a click are events on a
message, and dividing by a count of people would push a rate over 100% the first time a
sequence sends twice to the same person. Each rate prints its own numerator and denominator,
because 14% over 8,518 emails and 14% over 7 are the same figure and not the same fact.

A zero denominator reports "No emails sent yet", never 0% — the same rule the government card
follows for a null win rate. A count that arrives undefined is coerced rather than rendered as
a confident `NaN`. A channel carries no rates at all, and making the field required is what
forced that decision rather than letting it default to undefined.

---

## The other three

**The name opens the 360** through `personPath`, the helper written for Ali's 2026-09-09 rule,
opening on the **billing** tab: a reader who clicked a payment stage wants the payments, not the
timeline. A row with nothing to link on renders as plain text, because a link that 404s is worse
than a name that is not a link.

**Send email** is a `mailto:`. There is no admin composer in this app, and this deliberately
does not send through Mandrill as Ali: that path is for considered outbound, not a button on a
list.

**Commas** come from one helper that pins `en-US`. A bare `toLocaleString()` follows the
runtime's locale, so the same build would render `10.343` on some machines — a different number
to an American reader. A count nobody recorded still returns null rather than a digit.

---

## Verification

| Gate | Result |
|---|---|
| Backend, revenue suites | **29 suites / 597 tests pass** |
| Backend, copy ratchets | **58 suites / 1,006 tests pass** |
| Frontend, revenue suites | **9 suites / 195 tests pass** |
| New tests | **44** |
| Mutation check | **16 of 16 killed**, 0 survived, control green first |
| Typecheck, both stacks | clean under the declared TypeScript |

### The mutation check found two things, and they were different

**One was a real hole.** The test for "a name with nothing to link on renders as plain text"
asserted the test id and the absence of `/admin/people/`. A `<Link to={null}>` carries both, so
the page could have rendered a dead link with every test green. Now asserted as *not an anchor*.

**One was an equivalent mutant.** `fmtCount` had an explicit null check in front of
`Number.isFinite`, which is already false for null, undefined and NaN — a branch no input could
reach. The right response was to delete the dead branch, not to write a test for unreachable
code. The replacement mutation removes the one remaining guard, and that one dies.

One pre-existing R24 assertion moved from `"1200"` to `"1,200"`: the figure is unchanged and
only its formatting is, which is the requested change.

---

## Not done, and named

- The government and enterprise funnels still have no per-stage roster. Different shapes, different tables.
- `converted` is still not counted on a campaign: nothing in the system writes that outcome, so it is reported as not recorded rather than as zero.
- Nobody has clicked the grouped list in a browser yet.
