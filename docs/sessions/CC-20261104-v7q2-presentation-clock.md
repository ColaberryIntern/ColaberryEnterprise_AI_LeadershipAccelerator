# CC-20261104-v7q2 — main went red at 19:30 UTC, and no code changed

- [x] Pin the clock in the two presentation suites
  - Date: 2026-11-04
  - Session: CC-20261104-v7q2
  - What changed: `presentationCapacityService.test.ts` and `presentationHostAllocation.test.ts`
    now pin `now` to `2026-11-04T18:00:00Z` with `jest.useFakeTimers().setSystemTime(NOW)`.
    No source file changed.
  - Verification: 29 of 29 pass, jest exit 0, where the same two suites were 14 failed / 15
    passed before. Mutation-tested: moving the pin to `20:00:00Z`, after the fixture window,
    reproduces **exactly 14 failed / 15 passed** — the original signature — and the restore is
    byte-identical. So the pin is load-bearing rather than incidental.
  - Notes: see below.

## What actually happened

`reserveSlot` refuses a request whose `endAt` has passed:

```ts
if (endAt <= new Date()) {
  return { ok: false, reason: 'in_the_past', ... };
}
```

Both suites built every request from a fixture commented *"Well in the future so the
in-the-past guard never interferes"* — but the date was a literal, `2026-11-04T19:30:00Z`. At
19:30 UTC on 4 November real time caught up with it. From that minute on, every request was
refused before any host allocation happened, and 14 tests went red.

The timings line up exactly: CI runs on main at 19:48 and 19:49 failed, every run before 19:30
passed, and my own branch failed at 20:44 having touched nothing in this subsystem.

## Why this cost time, and the lesson

It reads exactly like a regression and is not one. I bisected main by CI conclusion, landed on
`40cd7037` as the first red commit, and then found it touches no presentation file at all. The
Zoom host registry, the only other dependency, last changed on 2 November — before the last
green run. Two hypotheses followed and both were wrong:

1. **A stale branch silently reverting newer work.** Disproved: `git diff 71dd7877 40cd7037 --
   backend/src/services/presentation/` is empty.
2. **A change to the CI jest ignore list unhiding a broken suite.** Disproved:
   `jest.ci.config.ts` last changed on 24 October.

**A commit bisect cannot find a cause that is not in any commit.** The thing that changed was
the wall clock. The tell was available much earlier and I walked past it: the failure was
`Number of calls: 0` on the host-pool mock, meaning the service returned before it ever asked
for a host — an early return, not a wiring fault.

## Why pinning rather than bumping the date

Moving the fixture to a later date rearms the same bomb on a later day. Pinning removes the
dependency on the wall clock entirely, and every literal date in both suites — including the
mocked DB rows the `nextAvailableFrom` tests sequence — stays valid against one fixed world.

## A systemic pattern, flagged not fixed

32 suites under `backend/src/**/__tests__/` hardcode a date in November or December 2026. Two
pin the clock, and those two are the ones fixed here. The other 30 are **candidates, not
confirmed bombs**: a hardcoded date is only dangerous when the code under test compares it to
`new Date()`, and that was not checked per-suite. Worth an audit before one of them picks the
same day to go off.
