# Session CC-20260831-9k2f — Today showed wrong numbers while loading

**Date:** 2026-09-01
**Branch:** `fix/today-load-skeletons` (cut from `origin/main` @ `79e4e9a9`)
**Scope:** A cold load of `/portal/today` rendered confident, incorrect figures for ~3-4
seconds before correcting itself.

**NOT DEPLOYED.**

---

- [x] Render placeholders instead of zero-coalesced defaults while Today loads
  - Date: 2026-09-01
  - Session: CC-20260831-9k2f
  - What changed: Every figure in the command band derives from state initialised to
    `null`, and the render coerced null to ZERO rather than treating it as UNKNOWN —
    `points?.total ?? 0`, `capeProfile ? Math.round(...) : 0`, `setupDone/steps.length`,
    and the countdown chips' `: '—'`. A learner with 678 points and a live streak
    therefore saw, stated as fact, for 3-4 seconds: no name in the greeting, "0 points —
    you're all caught up in Classroom!", "0 PTS / Apprentice", "1/3 SETUP", "0 /100
    Readiness", "Next tier Builder · 150 pts to go", "0-day streak", a "2" badge on the
    Today nav item, and "NEXT EVENT —".
    Added a `hydrated` flag in `TodayShell`, set once the first `loadAll()` settles, and
    `scheduleKnown` in `PortalShell`. Both gate their spots onto breathing skeletons that
    reuse the existing `.te-hud-skel` treatment, so the two loading areas read as one
    system. Not a slow load being masked — a wrong one being removed.
  - Verification: 10 new tests in `__tests__/TodayShell.loadState.test.ts`; all four
    TodayShell suites green at **27 passed** (was 17). Mutation-tested twice, and both
    were caught: (1) defaulting `hydrated` to `true` — the original flash — fails the
    hydration test; (2) fixing only the Next event chip and leaving Next class showing an
    em dash fails the chip test, which counts occurrences rather than checking presence.
    Frontend `tsc --noEmit` clean. Confirmed `origin/main` is green at 17 before starting,
    so the failure seen mid-work was my own new suite, not a pre-existing break.
  - Notes: `setHydrated(true)` sits after `Promise.allSettled` rather than in any
    per-promise branch, so the band resolves once instead of twitching as each of the six
    requests lands. A test pins that ordering.
    The SETUP ring is omitted entirely while loading rather than skeletoned, because
    whether it renders at all depends on `setupRemaining > 0` — a placeholder would make
    the cluster reflow once the real answer arrived.
    `scheduleKnown` exists because `schedule === null` means BOTH "still loading" and
    "nothing scheduled"; only the second should render an em dash, and the test asserts
    the em dash survives for that case.
    The topbar points HUD already did this correctly via `hudView`'s `known` flag and
    `.te-hud-skel` — that prior work is why the tier/points pill was NOT among the
    offenders, and its classes are reused here rather than inventing a second style.
    `prefers-reduced-motion` disables the breathing animation, matching the existing rule.
