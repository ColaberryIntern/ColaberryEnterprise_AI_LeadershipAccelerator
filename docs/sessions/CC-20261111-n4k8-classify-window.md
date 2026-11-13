# CC-20261111-n4k8 — the classifier only read the first 250 characters

Third log file for this session, for the same reason as the second: the other two are edited by
open branches (PRs #3889 and #3896), and two branches appending to one file is the conflict class
that has destroyed PR approvals in this repo.

- [x] `classifyEmail` reads their whole message, cleaned, instead of the first 250 raw characters
  - Date: 2026-11-11
  - Session: CC-20261111-n4k8
  - What changed: new `portfolioReport/emailText.ts` holds `ownText` (moved out of
    `sidecar/communications.ts`, which re-exports it) plus `classifiableText`, which cuts quoted
    history and URLs and bounds the read at `CLASSIFY_CHARS = 4000`. `timeline.classifyEmail` now
    judges that text rather than `body.slice(0, 250)`.
  - Verification: new `__tests__/classifyWindow.test.ts`, 10 cases, control-first — 5 failed before
    and pass after, 4 labelled UNCHANGED passed both ways, and 1 guard (question mark inside a URL)
    passed before only because the URL sat past the old window and had to keep passing once the
    window opened. Internship subsystem 63 suites / 948 tests pass. `tsc --noEmit` 0 errors with a
    planted control proving it live. Test-typecheck baseline matched exactly both directions.
  - Notes: found while checking whether Omolola's message was wrongly classed. It was not — hers
    is a genuine status update and `update` is correct for it. The measurement that answered that
    question turned up a much larger one.

## The measurement, production, 2026-11-11

Read-only SQL, 21 day window, applying the same two regexes to (subject + first 250 of body)
versus (subject + whole body).

**First cut, everything in the window including the operator account and automated mail:**

| emails | longer than window | classification disagrees | called update but is not |
|---|---|---|---|
| 1170 | 1038 | 378 | 295 |

That number is NOT the finding, and reporting it would have been wrong. Inspecting the
disagreements showed a Basecamp tracking URL scoring `stuck` on characters inside
`?p=eyJzIjoi...`, and automated report mail scoring `stuck` on a footer. Reading the raw body in
full is worse than reading 250 characters of it.

**Second cut, interns only, operator excluded, quoted history and URLs stripped first:**

| intern emails | longer than window | question mark only past 250 | reads update but asks something |
|---|---|---|---|
| 110 | 83 | 47 | **35** |

Verbatim, each sitting past character 250 where the classifier could not see it:

- Megan: *"Is it fine to leave that in my repo, or should I remove it before anything goes public?"*
- Kalkidan: *"How should I get a token for the /api/admin/... endpoints the STORY-000 panels read?"*
- Victoria: *"Could you or Kes run these read-only checks?"*
- Victoria: *"...or should I file it against sales and describe the platform change?"*
- Mihret: *"...or do you prefer a domain-scoped read-only route?"*
- Quincy: *"...or would you rather those cases count as 'unknown'?"*

An intern writes carefully, puts the courtesy and context first and the question last — which is
how people write — and the system files it as a status update.

## Why the two cuts both matter

The first cut is the reason the fix is "clean the text, then read it all" rather than "read it
all". The guard tests in the new suite encode exactly that: a question mark inside a URL must not
count, and a question in quoted history is our own words, not theirs.

## What this moves

`classifyEmail` feeds the timeline's `question` and `stuck` events, the `communications` insight
score, `open_questions` in the sidecar, and the three-way message opener in `nudgeBrief/shapes.ts`.
All of those get more accurate, and more of them will now say an intern asked something — because
they did.

## Caveat on the estimate

The 35 is from SQL re-implementing the rule, not from running `classifyEmail` itself. Intern email
bodies were deliberately not exported to a local machine to run the real function over them. Two
independent implementations agreeing is evidence; it is not the same as executing the code path.

## Not done

- Not deployed. Built, typechecked and tested only.
- `open_questions` still reads a 300 character thread snippet (`compose.emailView` truncates
  there), so the widened window helps it less than it helps the timeline and communications, which
  are handed up to 8000 characters. Lifting that truncation touches `compose.ts`, which PR #3896
  also touches, so it is deliberately left for after that merges.
