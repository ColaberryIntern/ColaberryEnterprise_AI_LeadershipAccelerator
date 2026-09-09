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
