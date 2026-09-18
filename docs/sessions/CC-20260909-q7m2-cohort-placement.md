# Session CC-20260909-q7m2 (cohort-placement slice / #3)

Per-PR file to avoid shared-session-log merge conflicts.

---

# Internship placement: put a cohort-less intern in the dedicated internship cohort (2026-09-16)

**Branch:** `feat/internship-cohort-placement` (cut from `origin/main`)

- [x] On activation, place a class-cohort-less intern into the internship cohort
  - Date: 2026-09-16
  - Session: CC-20260909-q7m2
  - What changed: Ali's #3 decision — a **dedicated internship cohort**. `activate()` now, after granting the membership + standup room, fills an **empty** `enrollment.cohort_id` with the internship cohort id. An external applicant who converted with no class cohort is thereby placed so their weeks-1-3 curriculum progress is tracked (`getStudentWeekBreakdown` keys off `enrollment.cohort_id`, and the onboarding "Complete week 1" step + the admin training gate both read it). An existing-student intern KEEPS their class cohort — the guard only ever fills an empty pointer, never overwrites a real one. Best-effort try/catch: a failure leaves them cohort-less (their prior state) and never blocks activation.
  - Verification: preserves the deliberate invariant that activation does not touch a real `enrollment.cohort_id` — the journey E2E (`internshipJourneyE2E.ts:397`) creates its intern WITH a class cohort, so the fill-when-empty guard is a no-op there and "cohort_id UNCHANGED" still holds. Backend `tsc` clean. No eslint-disable.
  - Notes: reuses the existing `ai_internship` cohort as the dedicated internship cohort (it IS the internship's cohort). Curriculum is global (per-enrollment), so content access was never the gap — this closes the TRACKING gap for cohort-less converts. The internship is rolling/open-ended, so per-intern week (from `joined_at`) is the pace, not a fixed cohort schedule.
