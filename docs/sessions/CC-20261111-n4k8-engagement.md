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
