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

- [x] CP1.4 observationWriter + the four source mappers + the backfill
  - Date: 2026-11-16
  - Session: CC-20261106-fv8g
  - What changed: observationAdapters.ts (pure): intro-video coaching (pace, fillers; proof and specific content
    points as strong 85 / good 65 / work on 40), quiz attempts on cards mapped in prep_skill_sources (score x 100),
    scored weekly interviews to role_knowledge, Hire-published case studies to proof_of_work 100.
    observationWriter.ts (ON CONFLICT DO NOTHING, batches of 200). backfillPrepObservations (--dry, --enrollment).
  - Verification: 52 Career Prep backend tests pass (adapters 17, writer 6 among them); grep test: no eye contact,
    expression or accent in careerPrep code.
  - Notes: weekly interviews are written exercises, so their source is training, not phone_mock. Quiz mapping table
    starts empty, so quizzes write nothing until a card is mapped (no invented skill links).

- [x] CP1.5 Placement section + readiness rollup + the summary, dashboard and staff read APIs
  - Date: 2026-11-16
  - Session: CC-20261106-fv8g
  - What changed: `placement` section key (owner/admin via ALL_SECTIONS; other staff only by per-member extra
    section; no new role) + mgmtSectionGate row + the extras editor label; prepData (5 reads per student), prepViews
    (pure dashboard + summary; missing values omitted, never 0), rollup (upsert per student/interview/Central date,
    nightly 01:30 Central, own cron), GET /api/portal/career-prep/summary and /dashboard (flag-gated 404, Zod,
    own-interview 404), GET /api/admin/placement/students/:id/prep (requireSection placement), strict response schemas.
  - Verification: 94 Career Prep backend tests pass (views 11, rollup 4, read routes 12, staff route 7 among them);
    mgmtExtraSections parity green; lint-route-auth OK (168 files); backend and frontend tsc clean.
  - Notes: the rollup cron is started from server.ts beside the schema (schedulerService.ts is ~3,900 lines).

- [x] CP1.4 + CP1.5 fixes (attempt 2, after the verifier failed both at 10/12 on "no invented data")
  - Date: 2026-11-16
  - Session: CC-20261106-fv8g
  - What changed: video coaching maps ONLY the measured delivery scores (pace, fillers); content levels (strong / ok /
    work on) are no longer turned into numbers, and "specific" no longer feeds "ending on a number" (it measures
    something else). Case-study refs carry the student (one case study can credit two students). Dashboard and floor
    show no "Ready at" without an interview (the hard-coded 70 is gone). Streak window 400 days. The nightly rollup
    writes only for enrollments Career Prep is on for. First name now comes from enrollments.full_name (the earlier
    leads join was wrong and its catch-all hid it; read-only prod check returns "Ali").
  - Verification: 102 Career Prep backend tests pass; backend tsc clean.
  - Notes: OPEN for Ali at the Release 1 review (no number invented meanwhile): should the intro-video content review
    (strong / good / work on) ever count toward a skill score, and at what values? Until he says, it does not.
    Also one adapter file (observationAdapters.ts) instead of the four the plan named; each mapper is about 15 lines.
    The CP1.4 entry above originally listed the content mapping; that mapping was removed in this attempt.
