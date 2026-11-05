# CC-20261104-v7q2 — Maya states no price, and now something checks

Ticket: [Maya's Email tab: read-only Explorer Growth preview, plus the marketing-asset column](https://app.basecamp.com/3945211/buckets/47502609/todos/10449182195)

Third change in this sequence. [Library A](CC-20261104-v7q2.md) decided what may be quoted,
[the composer](CC-20261104-v7q2-compose.md) turned it into drafts, and this closes the hole both
of them left open.

- [x] Enforce "no price, no date, no deadline, no seat count" on the compose path
  - Date: 2026-11-04
  - Session: CC-20261104-v7q2
  - What changed: `mayaQuoteComposer` now runs `explorerFactGuard.findUngroundedFacts` over the
    composed subject and body with no fact set, and refuses. New outcome `refused_fact`; the
    result carries the offending text; the tool handler surfaces it.
  - Verification: 23 tests pass in the composer suite, jest exit 0. Mutation results in the
    commit body.
  - Notes: below.

## The hole

Library B was going to be the campaign templates. Measuring them killed that idea and exposed
something worse.

Of 37 sequences and 142 email steps, only **12** carry a `body_template` at all — the model
says `ai_instructions` is the primary content source and the template is fallback. Two of the
twelve are call stubs (`"Day 0 welcome call"`, 18 characters). Of the ten real ones, **all ten**
are complete HTML emails opening `<p>Hi {{first_name}},</p>`, and **four state a dollar amount**:

```
"A quick word on the price, since $2,500 for production AI usu…"
"Program Investment: $4,500. Consulting alternati…"
"Enroll directly  ($4,500)"
```

Control: 8 of the 12 contain no dollar amount, so the pattern can come back false.

The membership price of record is $199 a month, so at least one of those is stale as well as
forbidden: quoting it would state a price **and** state it wrong.

Then the real finding. **Nothing was stopping her anyway.** Until this change the composer
screened for banned WORDS only, and `findBannedCopy` knows exactly one word. Her persona asks
her never to state a price and `NEVER_AUTHORITATIVE_FOR` declares the whole set — price, cohort
date, deadline, seat count — but neither is a guard. `$4,500` in a draft would have passed
every check in the path.

## Why no new matcher was written

`explorerFactGuard` already scans for dates, prices and seat counts, and its design insight is
the right one: *a date is not banned, an ungrounded date is*. It takes the facts resolved for a
learner and refuses anything not among them, and it **fails closed on an empty set**.

Maya is authoritative for none of those things. So she is handed the empty fact set and the
correct behaviour falls out of the guard that already exists: nothing is resolved for her, so
every figure she writes is ungrounded by definition. The semantics come from her authority
rather than from a second matcher that could drift from the first.

## Two deliberate details

**Both faults report in one call.** A message can break a copy rule and state a price. Both
lists are filled whatever the outcome names, because a guard that reveals one fault at a time
turns one fix into several round trips. The outcome names the copy rule when both fire, because
that one is the legal requirement.

**It names the text, not the category.** `"states a price"` sends her hunting through her own
draft; `"$4,500"` says what to delete.

## What is NOT guarded, stated rather than implied

The date pattern matches month-name and numeric forms (`November 12`, `11/12`, `2026-11-12`).
It does **not** match relative language — "next Tuesday", "the week after next" — and no attempt
was made to add it. A guard that fired on "I will follow up next week" would make ordinary
scheduling prose unwritable, which is the failure `bannedCopyInstruction` records from the live
Explorer render: a gate working exactly as specified that still leaves the feature unusable. A
test pins that `"20 minutes, 2 sessions"` drafts cleanly.

## Library B is not built, on purpose

Named, measured, and declined. `content_templates` has 0 rows and 0 code consumers, so it was
never a real alternative; `follow_up_sequences.steps[].body_template` is the only real candidate
and it yields ten whole HTML emails carrying merge fields and three of our own prices. Those are
campaigns to resend, not material to quote. If Ali wants that copy available to her, the right
shape is tone reference or a rendered, price-stripped excerpt, and that is a different piece of
work from this ticket.
