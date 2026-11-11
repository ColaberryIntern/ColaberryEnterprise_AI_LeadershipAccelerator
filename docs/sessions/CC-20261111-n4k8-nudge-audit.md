# CC-20261111-n4k8 — Why the proposed messages read like a template, and the four fixes

Audit of the thirteen messages the console's **Prepare the messages** button produced on
2026-11-11 at 14:28 UTC (08:28 CST), measured against the production image created the same
morning at 14:18 UTC. Nothing was sent. Every number was measured, not estimated.

## How it was captured

`buildAllBriefs()` was called directly inside `accelerator-backend`, which is the same function
`GET /api/admin/intern-nudges` calls, so the audited messages are the ones Ali read rather than a
second code path that could differ. The batch was written to `/tmp/briefs.json` and every later
measurement read that file, so the whole audit rests on one pipeline run.

Run metadata: 14 attempts, 13 briefs, 3.6s, `conversations: 228`, `asksNarrated: 13`,
`model: true`, sidecar 356,529 bytes, report HTML 615,212 bytes.

## Two corrections to my own first reading

Both were stated to Ali before I read the composer, and both were wrong. They are first because
anyone picking this up from the earlier summary will otherwise chase the wrong file.

1. **"The composer never reads their words" — wrong.** `shapes.ts` has `theirLastWord()`, it has
   had it since 10 Nov, and `lead()` calls it. What it uses from that message is the subject and
   the date, and it deliberately refuses the text. The refusal is documented in the file and
   guarded by a test named *never quotes the excerpt*, because a 600-character hard slice ended
   Quincy's message at `"the live expor"`. The composer was not blind; it was holding a snippet it
   could not safely repeat.
2. **"It reads `active_project_id`" — wrong.** Nothing in the internship report reads that column.
   Harpreet's project is dropped by `projectDeliveryService.ts`, whose predicate was
   `p.name IS NOT NULL AND p.name <> ''`. Her project row has a NULL name, so it was classified as
   scratch.

## What was measured

- **13 of 13** messages opened with the identical construction: `"<Name>,"` then
  `"Thank you for your note of <date> about \"<subject>\"."`
- **48% of all sentences** written that morning were text another intern also received: 44 of 91,
  across 19 distinct reused sentence texts.
- Two sentences went to five people word for word: *"If something is in the way, name it and I will
  clear it rather than ask you again."* and *"Tell me today where it stands, even if the answer is
  that it has not moved."* — Kalkidan, Quincy, Tashima, Mihret, Ruth.
- Reused share per message: Harpreet 82%, Megan 79%, Victoria 67%, Sarbjit 66%, Anamelechi 54%,
  Aki 52%, Quincy 42%, Ruth 37%, Tashima 36%, Kalkidan 32%, Samrawit 0%, Omolola 0%.
- The only two at 0% are the two tiers rewritten by hand on 10 Nov. Every tier that was not
  individually rewritten is between 30% and 82% boilerplate.

### The structural reason

`theOneThing`, `nextAction`, `wayThrough` and `close` are **constants keyed on the focus**. Four of
the five blocks in every message are fixed strings per tier, so the only per-person material in a
message is a name, a date, a subject, a story title and some numbers. A deterministic composer
built this way converges on one message per tier by construction. That is worth saying plainly:
the fixes below reduce the duplication and remove the falsehoods, and they do not change that
shape. Making the middle of the message genuinely personal needs the model in the compose path,
and `compose.ts` is documented as pure and deterministic on purpose. That trade is Ali's to make,
not mine.

### Why `open_questions` was empty for 13 of 13

`openQuestions()` in `sidecar/build.ts` keeps a thread only if it is newer than
`emails.lastWeWrote` AND `classifyEmail` calls it a question or a blocker. Measured:

- **12 of 13** newest inbound messages came back `answered: true`, because we wrote to all
  thirteen interns the previous morning, after their mail. The nudge run of 10 Nov is what emptied
  the field for 11 Nov. **The system erases its own inputs.**
- The **one** genuinely unanswered message, Omolola's of 11 Nov, is dropped by the second filter:
  `classifyEmail` scores it `update`, because it is titled a project update. It carries a risk, a
  story id, 228 words, and this: *"10 of 11 stories are complete and verified (714 points). 35 of
  36 acceptance criteria pass."*

Their own words were on the sidecar for **13 of 13** interns the whole time, in
`communications[].excerpt`, up to 600 characters each.

## The four defects where the data was present

1. **Harpreet was told she has no project.** Her message said *"It is day 51 and there is still no
   project on your name."* She owns project `50a24430-a604-4228-96d6-94800f245670`, created
   2026-11-11 01:42, carrying `https://github.com/Harpreet-95/ToolSmithAI`, a
   `github_connections` row, and a case study in `approved` status. `projects.name` is NULL and
   `student_tasks` is 0. The name predicate dropped the row, triage returned
   `no_project_at_day_N`, and the sentence that reached the screen was false — because of a missing
   write of ours. Megan genuinely owns zero projects, so her identical message is true. The two of
   them shared 79% and 82% of their text and for one of them it was a falsehood.
2. **Quincy's promise was carried and ignored.** His brief held
   `"On the six: you will have them before Friday."` under `promises`. His message contained no
   content word from that sentence and never said Friday (checked programmatically).
3. **Omolola could not be messaged, because of her own subject line.** Held `unsendable_text`; the
   character was U+2013 in the subject she wrote. The brief inherits a subject verbatim and quotes
   it in the body, so it landed in both.
4. **Two different tiers produced the same message.** Aki (`overdue_backlog`) and Anamelechi
   (`on_track`) share six sentences, including the Command Center lesson from 10 Nov turned into a
   boilerplate line asserted for both without either repository being checked.

## One expectation that was wrong, checked before it was stated

I expected Anamelechi to be a regression, because the skill still describes him as *"0 of 16
stories, never committed"*. Measured: `percent_built: 63`, `stories_verified: 10` of 16,
`days_since_build_work: 0`, `has_repo: true`, tier `on_track`, reason *"Build work today."* He is
building, his countdown is appropriate, and the skill's table is a day stale. The defect in his
message is the shared boilerplate, not the tier.

A measurement of mine also failed its own check: the first attempt to count templating normalized
names and numbers out of the bodies and reported 13 of 13 distinct, because story titles survived
the normalizer. It proved nothing and was replaced with verbatim sentence overlap, which is where
the 48% comes from.

## What changed

- [x] An intern's own punctuation can no longer make them unreachable
  - Date: 2026-11-11
  - Session: CC-20261111-n4k8
  - What changed: new `nudgeBrief/inherited.ts`. `sanitizeInherited()` turns an em or en dash into
    a hyphen, drops angle brackets, normalizes curly quotes and collapses whitespace, and is
    applied wherever the composer repeats their subject back at them, in both the body and the
    reply subject.
  - Verification: `nudgeBrief/__tests__/inherited.test.ts`, 8 cases, opening with a positive
    control that asserts Omolola's real subject genuinely does trip `briefProblems()` before
    sanitizing — so the suite cannot pass vacuously.
  - Notes: it changes only the characters the transport cannot carry. It does not rewrite words.

- [x] Excerpts end at a sentence, so they are usable at all
  - Date: 2026-11-11
  - Session: CC-20261111-n4k8
  - What changed: `sidecar/communications.ts` gains `trimToSentence()` and `isSentenceComplete()`,
    and the excerpt is cut on a sentence boundary instead of at a hard 600 characters. The 40%
    floor stops one early period from reducing a long message to a single clause; where no
    sentence end is late enough it falls back to a word boundary with an ellipsis.
  - Verification: `portfolioReport/__tests__/excerptTrim.test.ts`, 9 cases, with a positive
    control proving a hard slice really does cut mid-word.
  - Notes: this answers the objection the no-quoting test was built on rather than overriding it.
    The test still passes and the excerpt is still not quoted.

- [x] The opening says what KIND of thing they sent
  - Date: 2026-11-11
  - Session: CC-20261111-n4k8
  - What changed: `shapes.ts` `lead()` classifies their last message and opens three ways: a
    blocker is *"You flagged something in the way on ..."*, a question is *"You asked me something
    on ..."*, an update keeps *"Thank you for the update of ..."*. The unanswered clause is
    unchanged.
  - Verification: `composeShape.test.ts` gains a three-way opener test and an en-dash subject test;
    76 nudgeBrief tests pass.
  - Notes: this REPLACES an assertion that required the literal string *"Thank you for your note
    of November 9"*. That assertion encoded the defect. It is classification, not quotation:
    repeating an intern's words back at them was a separate and correct objection of Ali's on
    10 Nov and nothing here reintroduces it.

- [x] A promise we made cannot lapse in silence
  - Date: 2026-11-11
  - Session: CC-20261111-n4k8
  - What changed: `compose.ts` warns when a dated promise in our own last outbound is neither kept
    nor re-dated in today's body, naming the promise verbatim.
  - Verification: 4 cases in `composeShape.test.ts`, including a positive control that the promise
    is found at all, and one proving it stays quiet when the body does name the day.
  - Notes: a warning rather than a generated sentence, deliberately. Whether a promise is kept or
    moved is a decision about what Ali will do, and no judgement of that kind is in the database.

- [x] A nameless project is still a project
  - Date: 2026-11-11
  - Session: CC-20261111-n4k8
  - What changed: `projectDeliveryService.ts` no longer infers emptiness from a missing name alone.
    A project is admitted if it has a name, OR a repository on the row, OR a repository on its
    `github_connections` row, OR any `student_tasks`, OR a case study. The departed-enrollment
    exclusion is untouched. `p.name` is selected through `NULLIF(btrim(...), '')` so a caller's
    fallback to the track label fires instead of rendering an empty string.
  - Verification: `services/__tests__/projectDeliveryNamelessProject.test.ts`, 5 cases asserted
    against the SQL source with comments stripped first, so the explanatory comment cannot satisfy
    an assertion about the code. 47 projectDelivery tests pass.
  - Notes: **wider blast radius than the nudges.** This query feeds the delivery board too, so a
    nameless project with real work on it will now appear there as well. That is the correct
    behaviour and it is a visible change on another surface. Logged as an assumption rather than
    escalated: it is reversible, covered by tests, and crosses no governance boundary.

## Verified

- `npx tsc --noEmit`: **0 errors in `src/`**, run after planting a control type error and
  confirming tsc reported it (exit 2). A decoy tsc exiting 0 has happened in this repo.
- `node scripts/checkTestTypecheck.js`: **test typecheck baseline matched exactly, in both
  directions.**
- `npx jest -c jest.ci.config.ts --ci`: nudgeBrief 76/76, portfolioReport 156/156,
  projectDelivery 47/47, and the full backend suite (result recorded in the PR).
- Built in a fresh shallow clone at main's tip, because this session's working tree is eight weeks
  old and `git fetch` dies with `fatal: mmap failed`.

## Mistakes made while building this, both the same mistake

I put backticks inside the SQL template literal in `projectDeliveryService.ts` **twice**, once in
each comment I added, and ended the TypeScript string both times. The file carries a comment
warning about exactly that, saying it had already happened once in this repo. Caught only because
the control-error run was already in progress. Both comments are now backtick-free and say so.

I also hand-counted string offsets in two test assertions and got both wrong. They now derive the
index from the string itself. A test whose setup is guessed proves whatever the guess happened to
be.

## Still open, needing Ali

- **The templating that remains is structural.** Four of the five message blocks are per-tier
  constants. Making the middle of a message personal needs the model in the compose path, against
  `compose.ts`'s documented determinism. That is a design decision.
- **`open_questions` is emptied by our own nudge run.** The "answered" test asks whether we sent
  them anything later, not whether we answered that thread. A nudge is not an answer to a project
  update. Fixing it also revives `inboundSince`, which is permanently null today — and
  `inboundSince` is what the `messaged_today` hold uses to avoid burying someone who replied. Not
  touched in this PR: it changes hold behaviour and deserves its own change.
- `summarizeInterns` rejected 4 of 13 summaries this run: Quincy, Anamelechi, Harpreet *"restates
  a count"*, Megan *"says no activity but they trained"*. Carried over from 10 Nov.
  `training.weeks_completed` reads **0 for all 13** while `weeks_total` reads 12.
- `signals.artifacts` is **0 for all 13**, including Omolola at 91% built with a published site.
- Ali Muwwakkil is on the roster and errors with *"No active intern with enrollment aced5b39..."*.
- Whatever created Harpreet's project with a NULL name is unfixed. This PR stops the report lying
  about it; it does not set the name.
- No Basecamp ticket exists for the 10 Nov nudge work or for this.

## Not done

- No message was sent and nothing was marked as sent.
- Not deployed. Built, typechecked and tested only.

---

# Follow-up, same session: the reply guard that could never fire

- [x] `inboundSince` reads whether they wrote back, not whether they asked a question
  - Date: 2026-11-11
  - Session: CC-20261111-n4k8
  - What changed: `SidecarIntern` gains `last_inbound_at` (the newest mail FROM them in the
    window, unfiltered by content); `sidecar/build.ts` populates it from `emails.lastTheyWrote`;
    `compose.ts`'s `inboundSince()` reads it instead of walking `open_questions`.
  - Verification: new `nudgeBrief/__tests__/inboundSince.test.ts`, 11 cases, control-first (the
    3 that matter failed before the change and pass after). nudgeBrief 87/87, portfolioReport
    156/156. `tsc --noEmit` 0 errors, proven live by a planted control error that tsc reported
    and nothing else. `checkTestTypecheck` baseline matched exactly in both directions.
  - Notes: `hold.ts` documents a protection in its own words - *"someone who wrote back an hour
    after our morning message is the most urgent person on the list, and a naive 'already
    messaged today' would bury exactly them"* - and it keys on `brief.inboundSince`. Because
    `inboundSince` walked `open_questions`, which only holds mail `classifyEmail` scored
    `question` or `stuck`, the question "did they reply?" was decided by "did they ask us
    something?". An intern replying with a progress update counted as silent. Measured on
    production 2026-11-11: null for 13 of 13, so `messaged_today` held the whole roster on a
    check with no working input, and the guard buried precisely the people it was written to
    protect. `hold.test.ts` passed throughout because it hands `inboundSince` to `holdFor` as a
    literal: it proved the consumer honours the field and never that the producer could populate
    it. The new suite drives `composeBrief`, and its last two cases run compose and hold
    together, because the seam between them is where this lived.

## Correction to the previous section: main was never red

The entry above this one reported 3 failing suites on main (`mountLearnerPortalRoutes`,
`generateReeseBehaviourInventory`, `generateReeseToolInventory`) and diagnosed two as a committed
generated file drifting from its generator. **Both the diagnosis and the premise were wrong.**

All three compare file text read from disk against strings built in memory. My clone was created
with `core.autocrlf=true`, so the working tree was CRLF while the generated strings are LF.
Controlled on one commit (`f70e234`), nothing else varied:

```
LF   : 3 suites passed, 17 tests passed, exit 0
CRLF : 3 suites failed,  3 failed / 14 passed, exit 1
```

Converting only those four input files to CRLF and back flipped it both ways, and 3-failed/14-passed
is exactly the failure originally reported. No PR is needed to "clear main"; the two committed
artifacts match their generators and must not be regenerated. The clone now has
`core.autocrlf=false` and a renormalized tree.

**Measurement error worth keeping.** I first "confirmed" CRLF with `grep -c $'\r' <file>`, which
the shell mangled into an empty pattern. An empty pattern matches every line, so it reported CR on
all 59 lines of a file that is LF-only, and I reported that number. `git ls-files --eol` disagreed,
which is the only reason it surfaced. The replacement counter was run against a known-CRLF and a
known-LF control before being trusted. Any byte-comparison test measured in a clone with
`core.autocrlf=true` carries this failure mode.

## Still open after this change

- **`open_questions` is still emptied by our own nudge run.** This change fixed the *reply*
  signal, not the *unanswered question* signal. Whether a nudge counts as answering a thread is a
  question about intended behaviour, and changing it moves `chooseFocus` into `answer_owed` for
  more people, which rewrites the message they get. Deliberately not bundled here.
- Omolola's genuinely unanswered 11 Nov message is still dropped from `open_questions` because
  `classifyEmail` scores it `update`.
- Everything in the previous section's open list stands, except the three-failing-suites item,
  which was my error and is withdrawn above.
