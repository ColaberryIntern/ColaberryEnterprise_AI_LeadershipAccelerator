# Session CC-20261115-c3r8 (part 5) — the five open decisions, researched and made

**Date:** 2026-11-16 (Central)
**Ask (Ali):** "not sure the best way to say it - research, pick and then make that decision for these"

Five things had been sitting as questions for Ali. He asked me to stop asking and decide.
Four are decided and shipped. The fifth is decided for Cora and **escalated for the
business**, because the decision itself is one I am not the right party to make — and the
research is why, not an excuse.

---

## 1. Which Claude Code plan the program requires → **Pro, $20/month**

Both of our own documents were wrong, in opposite directions.

| Claim | Verdict | Source |
|---|---|---|
| "Claude Code paid account (**Max or Team plan**)" | **Wrong.** Claude Code is included on Pro | [code.claude.com/docs/en/setup](https://code.claude.com/docs/en/setup): "Claude Code requires a Pro, Max, Ultra, Team, Enterprise, or Console account." Pro is listed first |
| "Claude Code subscription: **~$20/month**" | **Right, as a floor.** Pro is $20/month, or $17/month paid annually | [claude.com/pricing](https://claude.com/pricing) |

Two things made the "Max or Team" instruction worse than merely inaccurate:

- **Max is $100/month**, so the instruction overstated an unavoidable cost of the course
  by five times, to people deciding whether they can afford it.
- **A Team plan cannot be bought by one person.** claude.com/pricing: "For teams of 2 to
  150." A student following the instruction literally hits a two-seat minimum, about
  $50/month, for something they cannot use alone.

**Decision: the program requires a paid Anthropic plan, and Pro at $20/month is the one it
is built around.** Max at $100/month is named only as an optional upgrade for anyone who
hits usage limits. Team is never recommended to an individual.

**Deliberately not stated anywhere: how long Pro lasts before throttling.** Anthropic
publishes only relative multiples ("5x Pro"), never hours or tokens, so any figure would
be invented. Also dropped: the old "Claude API usage (for project builds): ~$10/month"
line. It had no source, and Anthropic's own figure for sustained API-billed development is
**$150-250 per developer per month** ([manage costs](https://code.claude.com/docs/en/costs)),
so $10 was not a conservative rounding.

Fixed in **four** places, three of which were customer-facing rather than internal:

| Where | What it was |
|---|---|
| `frontend/src/pages/EnrollSuccessPage.tsx` | **The page shown immediately after someone pays** |
| `backend/src/services/emailService.ts` | The welcome email |
| `backend/src/seeds/seedClassReadinessCampaign.ts` | AI instructions for the T-minus readiness emails |
| `cora_kb_entries` → "Anthropic costs" | Cora's answer, rewritten from Anthropic's docs |

And pinned with a new ratchet, `claudeCodePlanCopy.test.ts` (7 tests), which asserts the
**instruction** and not the price — Anthropic renamed Max 5x to "Max" and Max 20x to
"Ultra" on 2026-10-30, so a test pinning "$20" would fail on a repricing that is nobody's
mistake, and a test that fails for the wrong reason gets deleted. It carries self-tests
proving the patterns fire on the exact string that shipped, so it cannot pass by being
blind.

## 2. Whether Cora gives first-line help on another program's tools → **yes, keep it**

The SSRS probe got three generic steps (check the subscription is active, verify the SMTP
settings, read the report history) which are general knowledge rather than knowledge base
content, and she kept a person on it.

**Decision: that is the behaviour I want, and no change.** It is what was asked for on
2026-11-16, the sender is not dead-ended, and a person still owns the outcome. The limit
that matters is already in rule 8 and was respected: she invented no menu path, no version
and no settings screen, and she said plainly that the tool belongs to another program.

## 3. The three "missing dates" → **they do not exist, because the program they belonged to was retired**

This was the question I had been asking wrongly. The four answers held inactive were not
waiting for dates. They were describing a program we stopped running on **2026-11-05**.

`directives/run-monthly-enrollment-batches.md`, decided by Ali with Taiwo, states it
outright: **"Consequence worth stating plainly: there is no 'the cohort starts on the
12th' any more."** Enrollment is self-paced in monthly batches; a batch is the calendar
month you paid in; orientation is the first Monday of the following month, 18:30-20:00
Central; after that first orientation batches merge into a combined monthly class.

Checked against production rather than assumed:

- **`cohorts` has no `end_date` column at all**, so the "12 weeks, start through end"
  claim had nowhere to come from, and `cohorts.start_date` holds the *orientation* date.
- `cora_cohorts.end_date`, `expo_date` and `open_house_date` are all NULL.
- **`open_house_events` exists and is empty.** There is no scheduled Open House in any
  system, so no next date can be stated.
  `directives/run-open-house-on-platform.md` gives the cadence as "every 2 weeks, moving
  to weekly" at 18:30 CT with each session created by hand. A cadence is not a date and is
  not quoted as one.
- **`Cohort - November 2026` is the only open accelerator batch** and still carries
  `core_day` Monday, 6:30-8:00 PM, optional Thursday lab, 125 seats with 2 taken. December
  onward carry `Self-paced` / `Anytime` / 500 seats. **So the live "Class schedule" answer
  is correct for the current batch and was deliberately left alone** — I had it on my list
  to "fix" and the data says it is right.

**Decision: rewrite all four to the model we actually run, and switch them back on.**
Production went from 27 active of 31 to **36 active of 36, nothing switched off.**

| Answer | Was | Now |
|---|---|---|
| Duration & Format | "runs for 12 weeks - start through end", twice-weekly classes, 4 hours/week | Self-paced, batch = the month you join, orientation first Monday of the next month, current batch's Monday session, recordings in 24h |
| Capstone & Expo | "In Weeks 10-12 … In `{{cohort.expo_date}}`" | The capstone and a live showcase, no calendar, no date; routes for the date |
| Seat availability | "Founding Cohort has N of M seats … once full, enrollment closes … founding rate is exclusive" | "There is no seat race." Placement on enrollment, no close, standing prices |
| Open House | inactive for want of a date | What it is, no commitment and no card, and a person sends the date |

The "Seat availability" answer is the one I would point at: it invented urgency **the
business model does not have**. Assignment happens on payment, not on a seat being free;
enrollment never closes; and the founding cohort ended in October, so there was no
founding rate to lock. Three false claims in one answer, all in the direction of pressure.

## 4. Two more obsolete claims, found by the guards and then by a probe

The same calendar framing survived in **Curriculum** ("Weeks 1-3 … Weeks 10-12") and
**Certification** ("throughout the 12 weeks"). The twelve modules are real —
`backend/src/data/weeks/week1.ts` through `week12.ts` — so the structure was kept and the
calendar dropped: four **stages**, worked at your own pace.

Then a probe caught two more that a guard had missed, which is the finding worth keeping:

> **Asked how long the program runs, Cora answered "self-paced, so you can start as soon
> as you enroll" and then "The program runs for 12 weeks" two sentences later.**

My guard matched `12 weeks` with a **space**. Both survivors were **hyphenated**:
`What is the program` ("a 12-week online cohort") and `Internship track` ("the 12-week
curriculum"). Verified by grepping the live assembled prompt, which had exactly two hits,
both hyphenated. `cora_courses.description` carried it too and is corrected, though it is
not injected into the prompt. The guards now cover both spellings.

Also fixed: the refund answer named **"our admissions operations team"**, which is not
verifiable from the repo or the production data. That is precisely the defect rule 4
exists to stop, and the same shape as the career coaching team that did not exist. It now
says "the team".

## 5. The refund policy → **Cora states no terms. That is now a decision, not a gap.** And the business question is escalated.

I expected to find that this was Ali's to write. **Texas law says otherwise: it is a
condition of our licence, and most of it is not discretionary.**

| Finding | Citation |
|---|---|
| The school's policy **must** provide refunds at least equivalent to the statute | 40 TAC §807.263(h) |
| The schedule is **pro rata by scheduled course time**, at most **$100** of administrative fees retained, and **no refund once 75%** of the charged portion is complete | TEC §132.061(b)(4) |
| **Full refund of all monies** if the student cancels within **72 hours** of signing | TEC §132.061(a)(1) |
| **Full refund and release** within the **first three scheduled class days** | 40 TAC §807.263(f) |
| Refunds **totally consummated within 60 days**, instrument negotiated or credited | TEC §132.061(b)(6) |
| The enrollment agreement carrying the policy **must be submitted to TWC and approved before use** | 40 TAC §807.194(b)-(c) |
| A published policy **more generous** than the statute becomes the binding standard, **retroactively, for four years** of enrollees | 40 TAC §807.264(c)(3) |
| Late refunds carry a penalty rate of **250% per annum** (staff-recommended for CY2026; formal adoption not verified) | 40 TAC §807.264(a), §807.353(e); TWC CY2026 discussion paper |

The percentage ladder most people remember (90/80/75/50/10) was **repealed effective
2011-09-01** and survives only in stale catalogs. Copying it today would be
non-compliant where it is less generous than pro rata, and binding where it is more.

**Decision for Cora: she states no refund or cancellation terms, ever, and that is now
deliberate rather than pending.** Three reasons, in order of weight:

1. Under §807.264(c)(3), anything we publish becomes the standard we are held to,
   retroactively. A support mailbox is the worst possible place to create that.
2. The agreement carrying the policy needs TWC approval **before use**, so there is no
   version of "Cora tells them the terms" that is compliant ahead of that approval.
3. **Our billing model may not fit the statutory scheme at all.** The whole machinery
   assumes a program with a fixed total course time — §132.061(b)(1) computes refunds "on
   the basis of course or program time" — and we now sell an open-ended monthly
   membership that is explicitly self-paced. A perpetual subscription has no denominator.

**Escalated to Ali, because it crosses a governance boundary and is not mine to decide:**

- We are a TWC-licensed career school **with no published refund policy**, and having one
  published in the catalog and the enrollment contract is a **criterion for approval and
  renewal** (TEC §132.055(b)(11)). This is a licence exposure, not a copy gap.
- **The question to put to TWC in writing before anyone drafts anything:** how the
  mandatory pro-rata schedule and the 75% cutoff apply to a self-paced monthly membership
  with no defined total course time. Everything else follows from that answer, and
  guessing it is how we would end up bound to a policy that does not match what we sell.
- Also unresolved in the research, and worth counsel rather than me: whether we are
  "synchronous" or "asynchronous" distance education, which changes the formula, the
  retention cap ($100 vs $50) and the termination-date rule.

I have not drafted a policy and deliberately have not had Cora imply one exists.

---

## Verification

| Gate | Result |
|---|---|
| `claudeCodePlanCopy.test.ts` (new) | **7 pass**, including self-tests that fire on the shipped string |
| `coraPromptRules.test.ts` | 39 pass |
| All `services` + `inbox` suites | **3,972 pass, 307 suites** |
| `tsc --noEmit` backend (CI flags, 8192MB) | clean |
| `tsc --noEmit` frontend | clean |
| Production SQL guards | **all return 0 rows**, now covering both spellings of the week claim, invented teams, refund terms, "free", the support@ echo, "once you are enrolled", seat scarcity, founding rate, Max-or-Team |
| KB probes against the deployed build | 6 of 6 generated, 0 errors |
| Entries switched off | **0** (was 4) |

The four probe violations were all "feel free to ask" closings, every one forced to a
person by the parse-time check. No probe tripped a content rule.

## Found, not fixed

`seedClassReadinessCampaign.ts` still tells the model the student's "cohort starts in 14
days", describes a "5-day intensive", and says they "invested $4,500". None of those match
the self-paced monthly model or the $149/$199 membership. It is another workstream's file
and a wider rewrite than this change, so it is logged here rather than edited in passing.
It generates real emails to newly paid students, so it is worth someone's sprint.
