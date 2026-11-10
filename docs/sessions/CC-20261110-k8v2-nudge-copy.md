# CC-20261110-k8v2 — Nudge copy audit: why the generated message read nothing like a real one

Branch: `fix/nudge-copy-audit`

## Why

Ali pressed "Prepare the messages" at 2:49 PM CST and compared the generated message for Quincy
against one drafted by hand:

> I clicked on prepare message and the messages did not seem up to date ... this is what it was
> planning to send which looks nothing like the quality of messages you drafted me here. Somewhere
> the process is off ... He already sent the capability map and why are we putting long quotes of
> what he said in the messaging. This messaging is a little weird.

## The data was live. The composition was wrong.

The 2:49 PM generation quoted Quincy's 1:49 PM email and showed `0d waiting`, so freshness was
never the fault. Four separate defects made it read like a form letter.

### F1 — the tier that promises an answer delivered a quote

`opening()` for `blocked_waiting_on_ali` emitted "Answering your message first.", pasted the
intern's own question back at them, and then never answered it. It cannot: the answer is Ali's
judgement and no judgement is in the database. Worse, `open_questions[].text` is a truncated
snippet, so Quincy's quote ended mid-word at "the live expor".

### F2 — dashboard copy addressed to the wrong reader

`outstandingLines()` printed "What the platform has against your name right now:" followed by
`most_urgent` and its overflow. Those entries are written for ALI'S DASHBOARD, about the intern.
Sent to the intern they invert: Quincy, who was waiting on Ali, was told **"You owe a reply"**.

### F3 — a factually wrong date, stated to an intern

`PREP_SQL` read `due_on`. On gov projects that column is back-dated to a cohort schedule that can
predate the project. **Measured on production: of 348 PREP rows, 12 disagree with
`due_baseline_on`, by as much as 58 days.** Quincy was told his Project introduction "was due 39
days ago". Meanwhile `nudgeBrief/deadline.ts` reads `due_baseline_on` for the case study band on
the same card, so one email could carry two different dates for the same task.

### F4 — the ask was stapled on regardless

A person blocked on a decision received a PREP-1 presentation prompt he had not asked for.

## What changed

- [x] `blocked_waiting_on_ali` no longer fakes an answer
  - Date: 2026-11-10 · Session: CC-20261110-k8v2
  - What changed: the opening names the question by subject and date, says plainly it is
    unanswered, and stops. No quote-back, no statistics, no training line, no artifact ask. A
    warning says the answer must be written by hand, and the card carries a "Write this one
    yourself" banner on its face.
  - Verification: 6 new cases in `nudgeBrief/__tests__/compose.test.ts`, including one asserting
    the body stays under 600 characters; 1 new component test.
  - Notes: this REPLACES a test that asserted the old behaviour. The old assertion was the bug.

- [x] Dashboard items no longer addressed to interns
  - Date: 2026-11-10 · Session: CC-20261110-k8v2
  - What changed: `outstandingLines()` removed, with a comment saying why it must not return.
  - Verification: a test loops all four non-blocked tiers and asserts neither "What the platform
    has against your name" nor "You owe a reply" can appear.

- [x] PREP dates read the baseline column
  - Date: 2026-11-10 · Session: CC-20261110-k8v2
  - What changed: `PREP_SQL` now selects `COALESCE(t.due_baseline_on, t.due_on)`. The fallback is
    deliberate: a missing baseline would drop the task out of `presentationDue()` entirely, and
    losing the nudge is worse than dating it from the older column.
  - Verification: `portfolioReport/__tests__/prepDueDate.test.ts`, asserted against the SQL source
    with a positive control, because the defect lives in a string.

## Verified

- `npx tsc --noEmit` clean in both workspaces
- `CI=true npm run build:frontend` exits 0, zero warnings
- 176 backend nudgeBrief + portfolioReport tests; 194 frontend internship tests

## Not done

- Not deployed at time of writing.
- No Basecamp ticket: bulk BC writes as Ali are classifier-blocked in this session.
