# Session CC-20261106-fv8g: Career Prep v27, Release 1 (CP1 to CP5)

Basecamp list: https://app.basecamp.com/3945211/buckets/7463955/todolists/10512940569 · Run directory (local, gitignored):
`.loop-architect/runs/20261116-career-prep-v27/` · Branch `workstream/career-prep-r1` · ONE PR at CP5.5 (Ali, 2026-11-16:
approve, PR and deploy only at major milestones).

Plan audit: cycle 1 FAIL 14/20 (no recruiter role exists; placement section ordering), cycle 2 PASS 18/20.
Assumptions in force (M1 defaults): no eye contact (9 skills); minimal JD-to-questions step, Watch hidden; recruiters
read-only; staff doors in place; reminders in-app + email; Pressure round in browser, phone when picked; E2E in
tests/systemV2/career-prep/.

- [x] CP1.1 Design files + the career_prep flag
  - Date: 2026-11-16
  - Session: CC-20261106-fv8g
  - What changed: docs/design/career-prep/ (18 files); careerPrepEnabled() over system_settings key
    career_prep_enrollments (fails closed, 60 s cache); GET /api/portal/career-prep/flags (campus on AND listed);
    seedCareerPrepFlag (idempotent, --remove = rollback); frontend fetchCareerPrepFlag/useCareerPrepFlag.
  - Verification: loop-task-verifier PASS 11/12 (commit 1cf3d3058). Tests: flag 14, route 5, seed 4, frontend 8.
  - Notes: two deviations from plan T1. (1) No frontend reads /api/portal/profile, so the flag has its own route,
    like the campus flags. (2) For the same reason ParticipantAuthContext is untouched; components use the
    standalone useCareerPrepFlag() hook (wired in at T11).

- [x] CP1.2 The seven P5 tables + 9-skill seed
  - Date: 2026-11-16
  - Session: CC-20261106-fv8g
  - What changed: ensureCareerPrepSchema (additive, idempotent, boot after ensureHireInterviewSchema);
    dropCareerPrepTables (refuses without --yes).
  - Verification: unit 6 pass; integration 4 (Postgres tier in CI; skipped locally, no DATABASE_URL). Commit d61946259.
  - Notes: enrollment_id (this repo's student key) instead of the kit's participant_id; raw typed queries like the
    hire schema instead of new Sequelize models.

- [x] CP1.3 readiness.ts (pure) + readinessWeights.json
  - Date: 2026-11-16
  - Session: CC-20261106-fv8g
  - What changed: skill score (60-day window, 14-day half-life, source weights), 30-day change, readiness per
    interview type (hidden under 5 skills), targets, streak and this-week in Central.
  - Verification: 15 tests with hand-computed values (71.4, 74.2, 80, 75.3), DST end 2026-11-01, Central midnight.
