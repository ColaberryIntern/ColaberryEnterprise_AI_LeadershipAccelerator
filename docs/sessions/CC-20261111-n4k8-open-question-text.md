# CC-20261111-n4k8 — the last place the 250 character blindness lived

Fourth log file for this session, same reason as the second and third: other branches are open
against the earlier files, and two branches appending to one file is the conflict class that has
destroyed PR approvals in this repo.

- [x] `open_questions` is classified from the whole body, and shows the question rather than the greeting
  - Date: 2026-11-11
  - Session: CC-20261111-n4k8
  - What changed: `compose.emailView` classifies each thread from the WHOLE body and carries the
    result as `threads[].kind`, plus `threads[].ask` — the one sentence that earned a non-update
    label. `sidecar.openQuestions` consumes those instead of re-classifying the bounded snippet,
    and its `text` is now `ask ?? snippet`. New `timeline.keySentence`. `trimToSentence` and
    `isSentenceComplete` moved from `sidecar/communications.ts` to `emailText.ts` (re-exported),
    so the report can use them without depending on the sidecar. The display snippet is still
    bounded at `THREAD_SNIPPET = 300` but is now sentence-complete rather than a mid-word slice.
  - Verification: new `__tests__/openQuestionText.test.ts`, 11 cases, control-first — 7 failed
    before and pass after, 4 labelled UNCHANGED passed both ways. Internship subsystem 65 suites /
    974 tests pass. `tsc --noEmit` 0 errors with a planted control proving it live.
    `checkTestTypecheck` baseline matched exactly in both directions.
  - Notes: completes the work PR #3900 started. That PR widened `classifyEmail` to a cleaned 4000
    characters, but it could never reach `open_questions`, because `emailView` cut each thread to
    300 RAW characters first. The classifier was handed a greeting and a sentence of context, so
    the same 35 intern emails measured on 2026-11-11 were still filed as updates on the way into
    the sidecar.

## A fixture that passed for the wrong reason

Worth recording because it nearly produced a meaningless test. The first draft of the long-message
fixture opened with *"thank you for the review"*, and `review` is a word in `QUESTION_RE`. So the
message was admitted to `open_questions` by the courtesy line rather than by the question, and the
control passed against the unfixed code.

The fixture is now free of every word in both regexes, and the first test in the file asserts that
directly: `classifyEmail(subject, LEAD_IN)` must be `update`. A fixture that is trusted rather than
checked is not a control.

## The second half: what a manager actually reads

Admitting the message is not enough. `open_questions.text` was the first 300 characters, which for
a real intern message is the greeting — a manager saw *"Hi, here is where the case study stands"*
and not *"should I remove the API key stub before anything goes public?"*.

Carrying the whole body instead is not an option: `narrate.ts` feeds this text to a model for up
to eight threads per intern, and the sidecar already runs to hundreds of kilobytes. So the thread
carries `ask`, the single sentence that earned the label — bounded like a snippet, useful like the
body. `ask` is null on an update, and null when the label came from the subject alone, because
then there is no sentence in the body to point at and inventing one would be worse than silence.

## Not done

- Not deployed. Built, typechecked and tested only.
- Not re-measured against production after this change; the 35 figure is from the SQL measurement
  recorded in `CC-20261111-n4k8-classify-window.md` and is an estimate of what this admits.

---

# Re-measurement against all four changes, and the defect it exposed

Ali, 2026-11-11: *"re-measure the live roster against all four changes"*.

## Method, and why it is different from the earlier numbers

The earlier figures in this session came from SQL re-implementing a rule. This one runs the REAL
functions - `emailView`, `classifyEmail`, `openQuestions` - over rows exported read-only from
production, at two commits, with the same input file both times:

- **before:** `f70e234`, main before any of the four
- **after:** main plus all four (#3889 cherry-picked, #3896 and #3900 already merged, #3905 merged in)

All four were also verified to compose: on one branch together, `tsc` 0 errors and 66 suites / 985
tests pass. No individual PR had proved that.

## What it showed

| | before | after (as shipped) | after (tightened) |
|---|---|---|---|
| interns | 13 | 13 | 13 |
| replies owed | 1 | 3 | 3 |
| open questions | **0** | 34 | **22** |

`open_questions` really was **0 for all 13 interns** before, which confirms the original audit.
`replies owed` 1 -> 3 adds Anamelechi and Megan, both genuinely unanswered.

**Then the per-intern rows were read instead of the totals, and the 34 did not survive it.**

| intern | literal `?` | what earned the label |
|---|---|---|
| Omolola | 0 | `review`, `decisions` - from "staff review and decisions" in a status report |
| Ruth | 0 | `issues`, and `request` out of the SUBJECT "Schedule Request" |
| Harpreet | 0 | `problems`, `guidance`, `review` |
| Aki | 0 | `blocked`, describing somebody else's slide |
| Tashima | 0 | `errors` |

Seven of thirteen newest messages had no question mark at all. Quincy's reported open question was
*"They are listed with what could not be seen."*

## This was my own defect, and the window change caused it

`STUCK_RE` and `QUESTION_RE` were lists of topic nouns. That was survivable while `classifyEmail`
read 250 characters, because a short window gave them few chances to fire. **Widening to a cleaned
4000 characters (#3900) removed that accidental protection**, so the change traded false negatives
for false positives. The tests written alongside it used a literal `?` and `cannot`, so they could
not catch it.

## The fix, now on this branch

A question is ADDRESSED - a question mark, or a second-person ask. A blocker is FIRST PERSON, or a
failure named against the thing that failed. Topic nouns are no longer evidence of either.
`review` is gone except in "please review" and "awaiting your review"; `question` survives only in
its announcing forms; `could`/`would` are out of the interrogative list.

Verified: new `signalPrecision.test.ts`, 22 cases, every fixture a real string from the roster -
**9 failed before the fix and pass after**, with the "still fires" group proving the tightening is
not merely narrower. 66 suites / 996 tests pass. `tsc` 0 errors against a planted control.
Test-typecheck baseline matched exactly both directions.

## Known residue, not fixed

**Sarbjit still reports 7 open questions and the top one is wrong**: *"Does anyone have
recommendations?" Or someone asks on a technology forum: "What skills should business leaders..."*
Those are quoted example personas inside her marketing research document, not asks directed at
anyone. Telling a quoted example question from a direct ask is not something a regex can do, and it
is the strongest argument yet for the standing question of whether the composer may use the model.

Quincy reports 12, down from 13; his mail is long design documents carrying real rhetorical
questions. His top one is now *"Is partly_unknown acceptable?"*, which is a genuine ask.

The measuring harness was a temporary untracked test file and was deleted; the exported rows live
only in the session scratchpad and were never committed.
