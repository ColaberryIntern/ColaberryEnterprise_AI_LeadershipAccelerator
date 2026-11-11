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
