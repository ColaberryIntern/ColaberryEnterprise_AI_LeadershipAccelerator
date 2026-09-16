# Session CC-20260909-q7m2 (activity-dashboard slice)

Separate per-PR file to avoid session-log merge conflicts with the other open
PRs from this session.

---

# Intern Activity: a dashboardy KPI strip + link to Success 360 (2026-09-16)

**Branch:** `feat/internship-activity-dashboard` (cut from `origin/main`)

- [x] Make the admin Activity view more dashboardy, reusing the student views
  - Date: 2026-09-16
  - Session: CC-20260909-q7m2
  - What changed: Ali's #4 — "the Activity needs to be more dashboardy; look at what I have for regular students, bring those views into the picture." The richest existing student view is the Student Success 360 (`getStudentSuccessSnapshot`), and because an intern is a normal enrollment it already applies to them. So: (1) a **KPI StatCard strip** at the top of the Activity card (Training weeks-1-3 done, Stories verified, Cert readiness, and a "Full profile → Success 360" card), reusing the shared `StatCard` shell component; (2) the last card **deep-links to the existing Student Success 360 dashboard** at `/admin/accelerator/enrollments/:id/success-snapshot` — no new dashboard built, just a door to the one that already exists; (3) the weeks-1-3 rows gained a small **progress bar** per week. Backend: `internActivity` now returns `enrollment_id` so the frontend can build that link (added to the type both sides).
  - Verification: backend + frontend `tsc` (running); StatCard props match the shell component (label/value/unit/icon/tone/hint/to). No eslint-disable.
  - Notes: this is the low-effort/high-value slice — reskin + link to the existing 360. A deeper pass could render the snapshot's 14 categories inline or add an `assessStudentHealth` status/risk pill; deferred. Attendance % isn't in the intern activity payload yet (it's in the snapshot, one click away via the 360 link).
