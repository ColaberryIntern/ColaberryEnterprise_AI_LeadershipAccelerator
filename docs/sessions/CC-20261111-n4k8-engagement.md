# CC-20261111-n4k8 — coverage and engagement: the thing the system is actually for

Sixth log file for this session, same reason as the others: open branches edit the earlier files.

- [x] Coverage and engagement state, per intern and across the roster
  - Date: 2026-11-11
  - Session: CC-20261111-n4k8
  - What changed: new `nudgeBrief/engagement.ts` — `engagementState(intern, now)` and
    `coverage(states)`. `BriefBatch` now carries `coverage`, and every successful attempt carries
    its `engagement`.
  - Verification: new `__tests__/engagement.test.ts`, 15 cases. Internship subsystem 66 suites /
    989 tests pass. `tsc --noEmit` 0 errors. `checkTestTypecheck` baseline matched exactly.
  - Notes: Ali, 2026-11-11 — *"the idea is to get them to engage. We might not be able to solve
    their issue if they have one, but the goal is to create a process that keeps the engagement up
    and doesn't let anyone slide from the cracks."*

## What changed about the definition of "good"

Every measurement in this subsystem up to now was about the MESSAGE: how similar two were, whether
a sentence was true, whether a quotation was really theirs. None of those is the goal. Two numbers
are:

- **coverage** — has anyone gone past the floor without hearing from us
- **engagement** — did anything come back after the last message we sent

## Both were already in the data

`last_ask.sent_at` is our last contact. `last_ask.satisfied` is already computed from a commit, a
verified story, or a reply dated after it — so "did our last message produce anything" has been in
the sidecar all along and nothing read it. This module adds no data. It states the rule those
fields imply and makes the gap visible.

## Measured on the live roster, 2026-11-11

Read-only, counted from the per-intern rows (the totals query errored on a CTE scope mistake of
mine, so the numbers below are counted from the printed rows rather than aggregated in SQL).

| | |
|---|---|
| roster | 13 |
| never contacted | 0 |
| overdue at the 2 day floor | **0** |
| worst gap | 1 day |
| replied since our last message | **3 of 13** |

**Coverage is currently perfect, and that is the finding.** It is perfect because Ali pressed the
button on the 10th and again on the 11th. Nothing schedules it: `buildAllBriefs` has exactly one
caller, an admin HTTP route. The process is a person. Remove him for three days and coverage decays
immediately, which is precisely the failure he described.

The reply number is a FLOOR, not the engagement rate: the query cannot see commits or verified
stories, both of which count as engagement in `engagementState`.

## Not done

- Not deployed. Built, typechecked and tested only.
- **The worker that would make coverage automatic does not exist.** This change measures the gap
  and names the number that must stay at zero; it does not yet act on it.
- No per-message ledger, so engagement cannot yet be attributed to a PROMPT. That is what would
  answer "which of the three themes actually gets people to reply", which is the question worth
  asking once the worker is running.

---

# Phase 2: the cadence worker

- [x] The unattended pass: strategic triggers, a 2 day floor, deterministic body
  - Date: 2026-11-11
  - Session: CC-20261111-n4k8
  - What changed: new `nudgeBrief/cadence.ts` (the decision) and `nudgeBrief/cadenceRun.ts` (the
    pass). `decide()` returns who hears from us and why; `runCadence()` builds every brief, decides,
    and sends, **dry by default**.
  - Verification: new `__tests__/cadence.test.ts`, 13 cases. Internship subsystem 67 suites /
    1002 tests pass. `tsc --noEmit` 0 errors. `checkTestTypecheck` baseline matched exactly.
  - Notes: Ali, 2026-11-11, answered A to "what may it send unreviewed" (deterministic only) and
    corrected the tolerance to 2 days.

## A timer is the backstop, never the reason

The triggers are ordered hardest truth first, and `contact_floor` is last:

| trigger | fires when |
|---|---|
| `answer_owed` | their mail is waiting on a reply, or they have unanswered questions |
| `promise_open` | we made a dated promise and nothing has come back since |
| `deadline_near` | a deadline inside 14 days with work still outstanding |
| `build_stalled` | no commit or verified story in 4+ days |
| `contact_floor` | nothing above found them and the 2 day floor passed |

A message that exists because 48 hours elapsed is the sameness problem wearing a schedule. The
ordering test is the one that matters: somebody both overdue AND waiting on an answer gets the
answer, not the backstop.

## No presence detection, deliberately

There is no "has Ali detached" flag. The clock keys on the intern's last contact FROM US, whoever
sent it: his own sends reset it, and when he is not sending the floor fires. One rule covers both
states and there is no mode to get wrong.

## Three independent guards against a double message

- `holdFor` carries `messaged_today`
- `engagementState` collapses Saturday and Sunday into one slot
- `sendBrief` is already idempotent on `intern-brief-<enrollment>-<central date>`

The third holds when the first two are wrong, which is why the send path keeps its own key rather
than trusting the decision layer to have been right.

## A hold is reported, never swallowed

"Nobody slides through the cracks" is only true if the reason somebody got nothing is visible. A
withheld decision still records what the trigger WAS, so an intern with no address on file is
counted as uncovered rather than as handled.

## Not done

- **Nothing schedules `runCadence` yet.** It is callable and dry by default; no cron registers it.
  That is the last step, and it is the step that actually changes behaviour, so it should go in
  deliberately rather than riding along with this.
- `unreviewedBody()` returns `brief.body` today. When PR #3914 lands it returns `deterministicBody`
  and nothing else in the worker changes.
