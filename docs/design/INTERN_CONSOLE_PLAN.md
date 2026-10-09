# Intern Console — implementation plan

**Design:** `docs/design/INTERN_CONSOLE_DESIGNS.html` (finalised by Ali, 2026-10-01)
**Lands in:** `/admin/internship` as a fourth mode beside Applications / Projects / Manage
(`frontend/src/routes/adminRoutes.tsx:262` — the page is routed and real)

---

## What is being built

One console for managing an active intern across three tracks — **training**, **certification**,
**project work** — with an overall dashboard on top, attendance and last-activity throughout, and
project drill-down below.

The design ships **three arrangements of the same data** behind a switcher:

| | View | Organising principle |
|---|---|---|
| **A** | Command Center | One dense row per intern. Scan everyone, act from the row. |
| **B** | Triage Board | Grouped by how recently they showed up. The people who need you are in their own column. |
| **C** | Activity Timeline | 28-day heatmap, then a full profile for one intern. |

All three share the KPI row, the **Manage drawer**, and the **project deep-dive**. That shared
spine is roughly 70% of the work, which is why building all three costs far less than three times
one.

> **Assumption, stated so it can be corrected:** "the design" means the artifact as shipped —
> all three views behind the switcher. If only one is wanted, phases 4 and 5 drop out and the
> switcher goes with them. Say so and the plan collapses accordingly.

---

## What the design assumes that the codebase does not have

The design carries its own data-mapping tab. It is largely right. A full inventory of the
backend found **three places where it is wrong or incomplete**, and each one changes the work.

### 1. Per-intern, per-section completion does not exist

View C draws seven segments per week per intern (Pre-class → Advance). The per-student query
in `curriculumCompletionService.ts:342-351` **groups by `c.week` only and never selects
`c.bucket`**. `StudentWeekRow` (`:316`) is `week, publishedCardCount, completed, completedPct,
weekDone` — no section breakdown.

Cohort-level per-section exists (`CurriculumSection`, `:104`). Per-student does not.
**A new query is required**, and it is the single largest backend item in this plan.

### 2. Last activity has a better source than the design assumed

The design proposes taking the latest of four tables by hand. Two things already exist:

- **`community_members.last_active_at`** (`models/CommunityMember.ts:36`) — the real portal
  heartbeat, bumped by `touchPresence()` from the presence ping. Caveat already documented at
  `cohortPresenceService.ts:15-18`: only fresh while a portal window is pinging, so it under-reports
  someone working in their repo.
- **`getPersonTimeline()`** (`adminOs/personTimelineService.ts:329`) — already unifies card
  completions, attendance, skill evidence and assessment attempts into one feed.
  **No HTTP route exposes it.** Its first element is the closest thing to a true cross-domain
  "last activity", and the console's activity feed is exactly what it returns.

Use these rather than hand-rolling a four-way `MAX`.

### 3. The attendance denominator genuinely does not exist

`internship_meeting_attendance` stores **joins only** — `{ total, by_meeting, last_attended_at }`
(`internshipAttendanceService.ts:17`). There is no row per meeting held, so "9 of 12" has no
honest source. The expected set is **configuration**, not data: `required_meetings` in
`internshipCohortService.ts:99-103` (Mon standup, Tue/Wed/Fri sessions).

Two options, and this is a decision rather than an implementation detail:

- **(a)** Derive the denominator from `required_meetings × weeks since `joined_at``. Cheap, no
  schema, and approximately right — but it counts meetings that may not have happened.
- **(b)** Add an internship meeting schedule table, or reuse `live_sessions`. Honest, more work.

Until one is chosen, the console shows **attended count only**, with no percentage. A denominator
that is quietly invented is worse than a number that is absent.

### Two smaller traps

- **Cert track ids do not join.** The prep blueprint is `'ccar-f'`
  (`certBlueprints/ccarFoundations.ts:69`); the official-claim enum is `'cca_f'`
  (`studentCertificationService.ts:28`). The design shows both on one panel. They must be
  bridged deliberately, not assumed equal.
- **Cert cohort scoping returns nothing for interns.** `getCohortReadiness` filters
  `e.cohort_id` (`certAdminService.ts:78`), and an intern's `cohort_id` points at their **class**
  cohort. Passing the internship cohort id yields an empty list — the same trap `internsOnly`
  exists to avoid on the projects board. Use the per-student endpoint
  (`GET /api/admin/cert-prep/students/:enrollmentId/history`).

---

## What already exists and should be reused, not rebuilt

| Need | Already there |
|---|---|
| Per-intern training, attendance, cert, project rollup | `internActivity(enrollmentId)` — `internship/internshipActivityService.ts:62`, route `GET /api/admin/internship/applications/:id/activity` |
| Readiness roster (the Projects tab rows) | `internshipProjectReadiness()` — `ProjectReadinessRow` with `weeks_done, weeks_total, training_ready, sessions_attended, has_project, project_name, ready_for_project` |
| Week-done rule and pace bands | `WEEK_DONE_THRESHOLD = 0.3`, `paceBandFor()` — `curriculumCompletionService.ts:54, :65` |
| Cert readiness per student | `CertReadinessSnapshot` + `GET /api/admin/cert-prep/students/:enrollmentId/history` |
| Project board row and drill-down | `ProjectRow` / `getProjectGantt` — including `audience`, `plan_only`, `fulfills`, `acceptance` shipped this week |
| Who is an intern | active `cohort_memberships` row, `membership_type='internship'`, cohort `cohort_type='ai_internship'` — **never** `enrollments.cohort_id` |
| Intern week | derived, `floor((now - joined_at)/7d) + 1` — not stored |
| Status transitions | `internshipStateMachine.ts:33-63` permits pause / completed / withdrawn / removed from `active` |

---

## Phases

Each phase ends deployed and verified, not merely built.

### Phase 1 — Read models
Per-intern **per-section** completion query. A console activity service that returns last activity
+ source + a 28-day daily event count, built on `getPersonTimeline` and `community_members`.
Attendance summary that reports attended honestly and omits a percentage until a denominator is
chosen. Cert join that bridges `ccar-f` / `cca_f` explicitly.
**Exit:** services + unit tests; no UI; every number traceable to a table.

### Phase 2 — Console API
One roster endpoint feeding all three views, one per-intern detail endpoint. Shapes match the
design's fields exactly. Admin-guarded; tenant/role checks tested.
**Exit:** routes + contract tests; payload renders the design's numbers from real data.

### Phase 3 — View A, Command Center
KPI row, filters, the dense table, the week strip with the weeks 1–3 gate outlined, pace badge.
Mounted as a fourth mode on `/admin/internship`.
**Exit:** deployed; a real intern's row matches the database.

### Phase 4 — View B, Triage Board
Pulse bar, the three distribution blocks, the lanes by recency, the project pipeline by stage.

### Phase 5 — View C, Activity Timeline
28-day heatmap with meetings marked, roster rail, focus panel with training by section, cert
score trend against the pass mark, and the activity feed.

### Phase 6 — Manage drawer and write actions
Status transitions writing `InternshipStatusEvent` with the reviewer as actor; notes; nudge;
attendance record; mark-week-done.
**Rule:** anything without a working endpoint renders **visibly unavailable**, never as a control
that silently does nothing. The design already marks these "needs endpoint" — that labelling is
part of the spec, not a placeholder to delete.

### Phase 7 — Harden and ship
Accessibility (keyboard, contrast, reduced motion), responsive behaviour, empty/loading/error
states, an e2e through the real route, deploy, and production verification.

---

## Rules carried from this codebase

- **Never invent a number.** Unknown is shown as unknown. The attendance denominator above is the
  live example.
- **Mutation-prove each guarantee.** A test that cannot fail is not a check.
- **`tsc --noEmit` is not optional** — ts-jest runs with `isolatedModules`, so green suites do not
  mean the code compiles.
- **Verify by content, not by badge**, at merge and after deploy.
- Admin routes are `requireAdmin` or `requireSection('internship')`; match the surrounding
  surface rather than narrowing access by accident.
