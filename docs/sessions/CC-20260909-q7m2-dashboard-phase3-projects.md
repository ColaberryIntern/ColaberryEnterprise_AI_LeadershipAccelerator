# Session CC-20260909-q7m2 (student dashboard, Phase 3 — Projects portfolio slice)

Separate per-PR file to avoid session-log merge conflicts with the other open
PRs from this session.

---

# My Internship: the project portfolio, verified-vs-self-reported kept apart (2026-09-17)

**Branch:** `feat/internship-dashboard-phase3` (cut from `origin/main`, Phase 2 included)

First slice of Phase 3 (Delivery + Week 3) from `INTERN_DASHBOARD_PLAN.md`: the
student's own project portfolio on the dashboard. Reuses the admin readiness
calculation to the number (an acceptance criterion) rather than re-deriving it,
and adds the one distinction the plan insists on — verified stories shown beside
self-reported completion, never swapped for it.

- [x] Backend: scope the admin delivery calc to one enrollment + expose archived_at
  - Date: 2026-09-17
  - Session: CC-20260909-q7m2
  - What changed: Additive change to `getProjectDelivery` (`projectDeliveryService.ts`):
    an optional `enrollmentId` filter (`AND p.enrollment_id = :enrollmentId`) so a
    student gets exactly their rows **server-side** — never the admin-wide payload
    filtered in the browser (plan §8) — and `p.archived_at` added to the SELECT and
    to `ProjectRow`, so an archived project can be shown as read-only history rather
    than counted as workload. Backward compatible: the admin path passes no
    `enrollmentId`, the extra column is ignored by the admin frontend's own
    re-declared `ProjectRow`, and the only other consumer (`projectOverviewRoutes.ts`)
    just serializes to JSON.
  - Verification: backend `tsc --noEmit` (running); the one `getProjectDelivery`
    consumer audited by grep (admin route, no strict response schema).
  - Notes: readiness weights (40/20/15/15/10) and risk are left exactly as the admin
    computes them, so the student and admin numbers cannot drift.

- [x] Backend: internProjectPortfolio service + endpoint (verified vs self-reported)
  - Date: 2026-09-17
  - Session: CC-20260909-q7m2
  - What changed: New `internshipProjectPortfolio.ts`. `internProjectPortfolio(enrollmentId)`
    calls the scoped `getProjectDelivery`, then adds two independent per-project counts
    from `student_tasks`: `verified` (`verified_at IS NOT NULL`) and `awaiting`
    (`status='complete' AND verified_at IS NULL`). The pure `assembleProjectPortfolio`
    folds these into a portfolio: each project gets a `role` (`active` = the single
    `active_project_id`; `owned` = a live project that isn't the active pointer, a
    legitimate second build, never implied abandoned; `archived` = history), the
    shared `readiness`, a `stories` split (`total` / `self_reported_complete` /
    `verified` / `awaiting_verification`), repo, risk and Command Center URL.
    `self_reported_complete` stays the readiness denominator; `verified` is its own,
    smaller number. Ordering: active first, then owned by readiness desc, archived
    last. A **guard** returns an empty portfolio for an empty `enrollmentId` so a
    missing id can never fall through to `getProjectDelivery`'s unfiltered cohort-wide
    query. Controller `handleGetInternshipProjects` (mirrors the dashboard handler,
    `requireOpenApplication`, session-derived enrollment); route
    `GET /api/portal/internship/projects` behind `requireParticipant`.
  - Verification: `internshipProjectPortfolio.test.ts` 6/6 pass (role assignment;
    archived beats a stale active pointer; verified kept separate from complete with
    readiness untouched; 0 defaults; ordering; active_count + risk surfaced). Backend
    `tsc` (running).
  - Notes: single-enrollment aggregation for this slice; the plan's cross-enrollment
    aggregation and the two-active-projects "second flag" question are deferred — this
    represents the reality honestly (one active pointer, others labelled owned) rather
    than inventing state.

- [x] Frontend: the Projects section on the dashboard
  - Date: 2026-09-17
  - Session: CC-20260909-q7m2
  - What changed: New `InternshipProjects.tsx` (fetches `/projects`, rendered on the
    dashboard between the attention queue and the first-three-weeks callout). Each
    project card shows: name + role badge (Active / Also yours / Archived) + case-study
    flag, stage, a readiness score labelled "ranking, not approval", the stories split
    with **"Marked complete (self-reported)"** and **"Verified (confirmed by us)"** as
    two distinct figures plus an "Awaiting check" figure when non-zero, a risk pill with
    its plain-language reason, the gaps list ("To become a case study"), and external
    Repository / Command Center links for live projects. Empty state: "assigned after
    your first three weeks." `internshipApi.ts` gained the portfolio types +
    `fetchInternshipProjects()`.
  - Verification: frontend `tsc --noEmit` (running); no eslint-disable. Read-only —
    every link is a deep-link or external href, nothing mutates status.
  - Notes: an "owned" (non-active) project is framed as a legitimate second build, an
    archived one as dimmed read-only history — neither as the student being behind.
