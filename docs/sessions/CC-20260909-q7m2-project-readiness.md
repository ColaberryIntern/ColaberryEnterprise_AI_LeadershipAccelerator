# Session CC-20260909-q7m2 (project-readiness slice)

Per-PR file to avoid shared-session-log merge conflicts.

---

# Internship: training nudge + "who's ready for a project" mgmt view (2026-09-17)

**Branch:** `feat/internship-project-readiness` (cut from `origin/main`)

- [x] Point interns at the 3-week training, and show management who is ready for a project
  - Date: 2026-09-17
  - Session: CC-20260909-q7m2
  - What changed: two of Ali's asks. (A) INTERN nudge — a callout on the active-intern internship page: "Start with your first three weeks — work through weeks 1-3 in the Classroom; once you finish, your manager assigns your first project," with a "Go to the Classroom" link. So an intern knows to start the training and that the project follows. (B) MGMT view — new `internshipProjectReadiness()` service + `GET /api/admin/internship/project-readiness` returning every ACTIVE intern with their weeks-1-3 gate, sessions attended, and whether they have a project; `ready_for_project` = cleared the first three weeks AND no project yet. New admin `InternshipProjectReadiness` panel (a "Ready for a project" SectionCard above the queue) lists interns ready-first, each row linking to open that intern and "Assign a project." Reuses `internActivity` per intern, so the roster and the per-intern Activity view never disagree.
  - Verification: `internshipProjectReadiness.test.ts` 4/4 (the pure `readyForProject`: ready when gate cleared + no project, not ready when gate open / already has a project / no training data); backend `tsc` clean. CI gates the frontend typecheck. No eslint-disable.
  - Notes: readiness = weeks 1-3 done AND no project. Aggregates active interns via `internActivity` (a few queries each) — fine at current intern counts; batch if it grows. The "Assign a project" button opens the intern, where the existing author-and-assign form appears (it only shows when the intern has no project).
