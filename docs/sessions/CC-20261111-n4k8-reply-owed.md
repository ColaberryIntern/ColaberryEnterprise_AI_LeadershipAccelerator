# CC-20261111-n4k8 — only a real reply clears a question

Second log file for this session, deliberately. The first
(`CC-20261111-n4k8-nudge-audit.md`) is edited by the branch behind PR #3889. Two open branches
appending to the same file is the conflict class that has destroyed PR approvals in this repo
before, so this change logs beside it rather than into it.

- [x] A nudge no longer counts as answering an intern's question
  - Date: 2026-11-11
  - Session: CC-20261111-n4k8
  - What changed: new `portfolioReport/threadReply.ts` holds one rule — we answered a message only
    if we wrote back in THAT thread after it. `emailView` (`awaitingReply`) and the sidecar's
    `openQuestions` both use it, so they cannot drift. `InternCard` gains `replies` (our outbound
    with subjects, already collected) so the sidecar has the same evidence compose.ts has.
    `cleanSubject` moved into `threadReply.ts` and is re-exported from `compose.ts`.
  - Verification: new `__tests__/repliesOwed.test.ts`, 15 cases, control-first — 4 failed before
    the change and pass after, and the 4 cases labelled UNCHANGED passed both before and after,
    which is what makes the controls mean anything. Whole internship subsystem: 63 suites, 953
    tests, all passing. `tsc --noEmit` 0 errors, proven live by a planted control. Test-typecheck
    baseline matched exactly in both directions (399 pre-existing across 140 files, unchanged).
  - Notes: decision was Ali's, 2026-11-11, asked as a multiple choice and answered A.

## Why this was the real lever, and a correction

When I put the choice to Ali I said fixing `open_questions` would move more interns into the
`answer_owed` focus. **The consequence was right and my stated mechanism was wrong.** `chooseFocus`
never reads `open_questions`; it reads the triage tier, and `blocked_waiting_on_ali` is set by
`emails.awaitingReply`. Changing `open_questions` alone would have been close to a no-op on the
message. `awaitingReply` carried the identical defect, so the fix had to land there too — which is
what delivers the behaviour Ali chose.

The defect in one line: `awaitingReply` asked whether we had sent them *anything* since their last
message. A nudge is something. So the nudge run of 10 Nov marked every outstanding question as
answered without answering one of them, and on 11 Nov no intern was `blocked_waiting_on_ali`.

## Why the thread, and the limit of it

Nothing in the mail store marks a message as a nudge — `nudgeBrief/send.ts` logs
`intern_brief_sent` to stdout and persists no row — so there is no flag to filter on. The thread is
the available evidence and also the right evidence: answering someone means replying to what they
said. A nudge carries its own subject and therefore clears nothing.

**Stated limit:** answering their question in a NEW thread with a fresh subject still reports the
question as owed. That errs toward telling a manager they owe a reply they already sent. The
opposite error hides real unanswered mail, which is the bug being fixed, so the direction is
deliberate.

## What else moves

`emailView` has exactly one caller and every `awaitingReply` consumer is inside
`services/internship/portfolioReport`, so the blast radius is that tree: the triage tier, the
"Replies you owe" tile on the daily report, the dashboard and briefing renders, the summary text
and the timeline. **This is not confined to the nudge console** — the daily report Ram and Ali
receive will show a higher, truer replies-owed count.

One existing test encoded the old rule (*"owes a reply only when their latest is newer than ours"*,
asserting that writing to them the same day cleared it). It was rewritten to the new rule rather
than deleted, with a note saying why, and it now uses the same `last_we_wrote` in both cases to
show that value is no longer what decides.

## Not done

- Not measured against production data yet; the effect on the live roster is unquantified here.
- Not deployed. Built, typechecked and tested only.
- No message was sent and nothing was marked as sent.
