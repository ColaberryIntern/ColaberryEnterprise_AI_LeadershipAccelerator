# Session CC-20260909-q7m2 (student dashboard, Phase 3 — Week-3 handoff slice)

Separate per-PR file to avoid session-log merge conflicts with the other open
PRs from this session.

---

# My Internship: the Week-3 "your first project" handoff card (2026-09-17)

**Branch:** `feat/internship-dashboard-phase3b` (cut from `origin/main`, Phases 2 + 3a included)

Second slice of Phase 3 (Delivery + Week 3) from `INTERN_DASHBOARD_PLAN.md` §4: the
transition where an intern's first Colaberry project is assigned once they reach
Week 3. A pure derivation over data the dashboard already fetches — the intern's
week and their active project's state — so no new query and no new fetch.

- [x] Backend: deriveWeek3Handoff + fold into the dashboard payload
  - Date: 2026-09-17
  - Session: CC-20260909-q7m2
  - What changed: New `internshipWeek3Handoff.ts` with the pure `deriveWeek3Handoff(week, project)`.
    Phases: `unknown` (week not set — an honest state, owner Colaberry, never "late"),
    `before_week_3` (weeks 1-2: project upcoming, the intern keeps training; Week 2
    flagged "next week"), `awaiting_assignment` (reached Week 3, no project — **owner
    Colaberry, actionable false**, copy says "on us, not a step you are behind on"),
    `access_pending` (project assigned but repo not connected — **owner Colaberry**,
    "we're finishing your access"), and `in_progress` (project assigned + repo
    connected — **owner intern, actionable true**). A training project existing before
    Week 3 does NOT trip the assignment phases (the week gate wins), so an early
    practice build is never mistaken for the Week-3 assignment. `internDashboard` now
    folds `handoff: deriveWeek3Handoff(view.week, activity.project)` into the payload.
  - Verification: `internshipWeek3Handoff.test.ts` 8/8 pass (all five phases, the Week-2
    "next week" copy, the early-project guard, and the >= boundary for weeks past 3).
    Backend `tsc` (running).
  - Notes: reuses the existing per-student `week` (from `activeInternView`) and the
    single active project's `repo_connected` (from `internActivity`) — no new data
    source. The plan's "next working day" SLA and an assignment TICKET are deliberately
    NOT implemented here (the plan says configure, don't hard-code); this slice shows
    the true state and its owner, which is what the intern needs.

- [x] Frontend: the Journey card on the dashboard
  - Date: 2026-09-17
  - Session: CC-20260909-q7m2
  - What changed: `InternshipDashboard.tsx` gained a `HandoffCard` rendered between the
    read-only summary and the attention queue. Its tone follows whose move it is: an
    intern-actionable phase is affirmative green, a Colaberry-owned phase is calm blue
    with a "waiting on Colaberry" tag (never a warning), before-week-3 / unknown are
    neutral. Shows the phase title, the honest detail copy, and the project name when
    one is assigned. `internshipApi.ts` gained `HandoffPhase` / `Week3Handoff` and the
    `handoff` field on `InternDashboard`.
  - Verification: frontend `tsc --noEmit` (running); no eslint-disable. Purely
    presentational — reads the derived handoff, mutates nothing.
  - Notes: the "waiting on Colaberry" phases are visually distinct from the intern's
    turn, so a student mid-handoff sees "we're on it," not a red flag against them.
