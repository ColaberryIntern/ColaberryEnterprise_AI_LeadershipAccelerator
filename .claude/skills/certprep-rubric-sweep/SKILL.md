---
name: certprep-rubric-sweep
description: Bring every CCAR-F practice question to 6/6 on the item rubric, one at a time, and approve the result under a named human reviewer. Run it as a standing quality check on the question bank.
---

# certprep-rubric-sweep

A standing check that the certification question bank is at the highest standard,
and the machinery to get it there.

> Score every question against the item rubric. Improve the ones that miss, one at
> a time, until they meet all six dimensions. Replace the ones that cannot be
> improved. End with a bank where every question matches the published exam shape
> and a named human has approved each one.

## The one thing to understand before running this

**6/6 is a statement about SHAPE, not about correctness.**

The rubric measures whether an item looks like a real exam item: it opens with an
observed situation, the stem and options are at reference length, the options are
articulated approaches rather than labels, there are four of them, and every wrong
option is explained. Those are all measurable and the sweep can fix them.

The rubric **cannot** tell whether the answer key is right, whether the question is
fair, whether the distractors are genuinely wrong, or whether the item tests the
objective it claims. A question with a wrong answer key can score 6/6.

So a 6/6 bank is a bank that *resembles the exam*. It is not a bank that is
*correct*. That distinction is why approval is a separate flag, why it records a
real person, and why this skill never approves as a side effect of improving.

This bank was once approved wholesale by a fixture account. Those 93 revisions
were retired for precisely this reason. Do not recreate that.

## How it runs

Phases, in order. Do not skip the dry run.

| Phase | What happens |
|---|---|
| **1. Measure** | `node dist/scripts/sweepCertQuestionRubric.js` — dry run over the whole bank. Prints the current score of every question and what it would do. Writes nothing. |
| **2. Small write** | `--limit 3 --write` — improve three questions for real. Read the drafts it produced before going further. A hundred and fifty model calls is not the place to discover a bad prompt. |
| **3. Full sweep** | `--write` — the whole bank. Sequential, one question at a time, resumable. |
| **4. Verify** | `node dist/scripts/verifyCertBankDrift.js` — confirms the database holds what the build authored and reports which items are servable, stale or unapproved. |
| **5. Approve** | `--write --approve-as <a real person's email>` — only after a human has read the results. |

### The per-question loop

```
score → 6/6?  → done, skip
      → improve → re-score → better? keep : discard
      → repeat until 6/6 or the improvement stalls
      → stalled → REPLACE with a fresh item for the same objective
      → still stalled → leave it, report it, approve nothing for it
```

**The rubric is the judge and the model does not get a vote.** Every candidate is
scored by `scoreItem`, which is pure and deterministic. A candidate that does not
score higher is discarded, not passed along with a hopeful note. That is what makes
the loop safe to run unattended: it cannot drift downhill.

**A candidate that changes the answer is refused before its score is even read.**
`checkInvariants` rejects a rewrite that changed the option count, the number of
correct answers, a correct key that is not among the options, an empty stem or
option, or a wrong option left without an explanation. Those are exactly the
changes the rubric would not notice, because it has no opinion about which option
is right.

## Flags

| Flag | Effect |
|---|---|
| *(none)* | Dry run over the whole bank. Changes nothing. **This is the default and it is deliberate.** |
| `--write` | Persist improvements as NEW DRAFT revisions. Never edits in place. |
| `--limit N` | Process only the first N questions. Use it on every first run of a change. |
| `--key K` | Process one question. Use it when debugging a specific failure. |
| `--max-rounds N` | Improvement attempts per question before declaring a stall. Default 3. |
| `--approve-as <email>` | Approve the 6/6 items as that named person. **Refuses without `--write`.** |

## Rules that are not negotiable

- **Dry run first, always.** The script defaults to it; do not add a flag that
  changes that default.
- **Never pass a `.test`, `.invalid`, `.example` or `.local` address to
  `--approve-as`.** The admin queue renders those in red as "approved by a fixture
  account — no human has read this item", which is honest, and it is not a
  shortcut to take deliberately.
- **Never approve an item the run did not bring to 6/6.** The script already
  refuses; do not work around it.
- **Every improvement is a new revision.** Nothing is edited in place, so a
  response already recorded keeps meaning what it meant.
- **Report the stalls.** A sweep that says "150/150" while quietly leaving four
  questions unfixed is the failure this whole rubric exists to prevent.

## After a run

1. State the before and after distribution, not just the headline.
2. Name every stalled question and why it stalled.
3. Say plainly how many were approved and by whom.
4. Update `PROGRESS.md` per CLAUDE.md's hard gate.
5. If anything was written to production, run the drift verifier and quote it.

## Hardening log

Weaknesses found by running it, and what was done. Add to this every time.

- *(2026-09-09, v1)* Built. Improver refuses candidates that change the answer
  shape; sweep is dry-run by default; `--approve-as` refuses without `--write`.
- *(2026-09-09)* **CI caught a type error a local typecheck had reported clean.**
  The candidate's `rationale` is `string | null` and `DraftRevisionInput.rationale`
  is a required `string`. The local run had been killed by a timeout before
  writing anything, and a **0-line output file was read as 0 errors**. Two fixes:
  `checkInvariants` now refuses a candidate with no rationale — the rubric scores
  whether wrong options are explained, so a rewrite that drops it is not an
  improvement — and the sweep guards the write site rather than casting, so a
  relaxed invariant reports a skipped item instead of writing a revision with an
  empty explanation. **Verify with a sentinel** (`echo "__TSC_EXIT=$?__"` appended
  to the output) so a truncated run cannot look like a passing one.
- *(2026-09-09)* `/tmp` is shared across concurrent Claude sessions on this
  machine; an output file came back holding a different session's test run. Write
  run artifacts to the session scratchpad, never a bare `/tmp` name.
- *(2026-09-10)* **The first live run died instantly: `column "track_id" does not
  exist`.** `track_id` and `scenario_family` live on `cert_questions`, the
  identity, not on `cert_question_revisions`. Nothing caught it before production:
  `tsc` cannot see inside a SQL string, the unit tests mocked the query away, and
  CI has no database. Fixed with the join, and the query is now exported as
  `BANK_QUERY` with a test that checks **every `r.` and `q.` column against the
  CREATE TABLE statements in `ensureCertPrepSchema.ts`** — the file the database
  is actually built from. Mutation-checked: reintroducing `r.track_id` turns it
  red. The sweep also now excludes retired identities, because a question somebody
  deliberately withdrew should not be improved and offered back for approval.
- *(2026-09-10)* **The first completed run spent a model call on a question no
  rewrite can ever fix.** `CCARF-A2` is multi-select by design; `option_count` is
  defined as four options AND single select, and `checkInvariants` forbids
  changing how many answers are correct. Aiming at a flat 6/6 would re-spend on it
  every run and report a structural property of the item as a failure. Added
  `unachievableDimensions` / `achievableScore`: the sweep now targets what each
  item CAN reach and says so in the log (`ceiling 5/6: option_count cannot
  change`). **A target an item cannot reach is not a standard, it is a bug in the
  check.** Mutation-checked.
- *(2026-09-10)* **The run ended by losing its own cost telemetry.**
  `ConnectionManager.getConnection was called after the connection manager was
  closed` — `getInstrumentedOpenAI` writes `ai_events` rows asynchronously and the
  script closed sequelize out from under the last write. The output was correct,
  which is what makes it easy to miss: the only casualty was the accounting for
  the most expensive part of the job. The script now settles telemetry before
  closing the connection.
- *(2026-09-10)* **Scoring the whole bank read-only, before spending anything,
  showed the sweep was about to rewrite 18 questions that are already correct.**
  Distribution across all 150: 129 at 6/6, 21 at 5/6, 132 at their ceiling, 18
  below it — and those 18 are exactly the scenario-framing false negatives already
  documented in `ccarRubric.ts`. Their only missing dimension is scenario framing,
  so the sole way a candidate could score higher is by inserting a phrase from the
  marker list: **changing text that is already right to satisfy a proxy.** The
  list was a comment, so nothing could act on it; it is now
  `SCENARIO_FALSE_NEGATIVES`, and `unachievableDimensions` reads it. **Score the
  bank read-only first — it costs nothing and it tells you what the run would
  actually do.**
- *(2026-09-10)* **The full 150-question run came back clean, and the summary
  line overstated it.** `RESULT: 150/150 at 6/6` — while 21 questions were at 5/6,
  correctly capped at their ceiling. The ceiling change had made the count fold
  every skipped item in as a six. **A run that reports better than reality is
  worse than one that reports nothing, because it ends the investigation.** Now
  reported as two numbers with the label each one measures: how many reached the
  top of the rubric, and how many are as good as they are permitted to get. A test
  pins both, including one asserting the old wording cannot return. Note what
  happened here: a tool built to catch checks that overstate, overstating.
- *(2026-09-10)* **The approval step would have approved 129 while announcing
  150.** It filtered on `after === 6` where the log line above it printed the
  ceiling count, so the 21 capped items would have been silently left unapproved
  — leaving the bank short of the exact thing that was asked for, and saying
  otherwise. Caught by reading the code before running it, not by running it. The
  ceiling is now stored on each outcome rather than re-derived in two places,
  because the summary and the approval disagreed precisely because each guessed
  separately. **Before a run that writes, read what it will actually select.**
- *(2026-09-11)* **The first GENERATED batch scored 6/6 and read as mediocre.**
  Six of eight written, and the one I read had an unmeasured observation
  ("occasionally fails"), options at the seven-word floor, a "disable the feature"
  distractor nobody would pick, and a key that fixed a FAILED call when the stem
  described an INACCURATE one. The rubric measures shape, and the model found the
  cheapest shape that passes. Three changes: the prompt now aims at the reference
  MEDIAN rather than the floor and requires a measurement in the stem;
  `triageQuestion` runs as a second gate after the rubric, discarding on a
  high-severity concern; and a rubric discard now names the dimension it missed,
  because "5/6, discarded" twice told me nothing about which of three fixes to
  make. **A shape gate alone will be satisfied minimally. Pair it with a
  reviewer that argues against the answer.**
- *(2026-09-11)* **With both gates on, the regenerated batch was genuinely better
  and 3 of 8 were still discarded on `scenario_framing` alone.** Those stems opened
  with observations in words the detector does not carry. For GENERATED text the
  right fix is to tell the model to open the way the published items open
  ("Monitoring shows ...", "Engineers report ...", then the number) — that is
  writing to the target shape, not editing already-correct text to satisfy a
  proxy, which is the line drawn on 2026-09-08 and still holds. Prompt v3.
  **Operational: batch generation through `docker exec` on prod has OOM'd near
  34 items. Drive `--to 300` in `--count 25` chunks; the script recomputes from
  the database each run, so every chunk is resumable and none is big enough to
  take the container down.**
- *(2026-09-11)* **The first scaled chunk wrote 25 questions clean, and every one
  was S1.** The `--to` plan filled the thinnest DOMAIN and picked the FIRST
  scenario fitting it, so 40 D1 questions were headed into one world while S5 -
  already the thinnest scenario - never got touched. S1 went 34 to 59 in one
  chunk; S4 and S5 sat at 19. The exam draws four scenarios of six at random, and
  a student who lands the thin one is measured against a shallower pool. Now
  picks the thinnest fitting scenario, with the count kept current inside a
  chunk so 25 picks spread rather than all landing on whichever was thinnest at
  the start. **Read what a run wrote, not just how many.**
- *(2026-09-11)* **Retiring six drafts exposed that the sweep's approve step could
  un-retire them.** Each became a question whose latest revision is retired, and
  the approval filter selected on score alone - `--approve-as` would have
  approved them straight back under a human's name. Retirement now means BOTH
  the revision status and the identity's `is_retired`, and the sweep skips any
  key whose latest revision is retired and says how many it skipped.
- *(2026-09-11)* **Chunk 3 wrote four good questions that were dead on arrival.**
  The generator built its taken-key set from live identities only, so the keys
  of six drafts retired that morning read as free, and four new questions landed
  as revision 2 under identities marked `is_retired`. Serving, the sweep and the
  generator's own count all exclude retired identities. The count said 25
  written; the bank was four short of that. **A question key is permanent:
  retiring it withdraws the content, not the name.** Taken keys now come from
  every identity. The four were revived (identity live, old revision still
  retired).
- *(2026-09-11)* **"11 passed" and "jest exit 1" in the same run.** The scripts
  fired `main()` on import, so a test importing a pure helper also started a
  generation run, which failed without a database and set the process exit
  code. Every test passed and CI would have gone red on a suite with no failing
  test. All three scripts now guard on `require.main === module`.
- *(2026-09-11)* **144 of the 150 generated questions had the correct answer at A.**
  A student answering A throughout would have scored 96% on that half. It got
  past every gate because the rubric measures shape, triage measures
  defensibility, and neither looks at WHERE the key sits. The authored bank never
  had the problem because `item()` places the key from a hash of the question
  key; the generator bypassed the factory and inherited the model's habit of
  writing the right answer first. Caught the instant the items were exported into
  the repo, by the same position guard that found 110-of-150-at-B in the
  authored bank weeks earlier. **Anything that writes a question must go through
  `assignAnswerPosition`.** The generator now does; `rebalanceCertAnswerPositions`
  mints reordered revisions for what was already written, idempotently. The
  length tell (correct-is-longest 61%, +1.2 words) is real but milder and is
  next.
- *(2026-09-10)* **Do not write source containing backslashes through a shell
  heredoc.** Building the schema parser that way put a literal CR and a real
  newline where `` and `
` were meant, producing an unterminated regex. Use
  the Edit tool, or build the escapes with `chr()`.
