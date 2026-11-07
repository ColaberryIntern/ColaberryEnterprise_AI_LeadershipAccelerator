# Session CC-20261106-p3n8 — the cohort date on Enterprise

- [x] Restored "Cohort - November 2026" to a start date in November
  - Date: 2026-11-06
  - Session: CC-20261106-p3n8
  - What changed: a production data correction, no code. The row's `start_date` read
    `2026-12-07`; `audit_logs` shows it as `2026-11-12` on 2026-08-02 and carries no entry
    for the change, so it was written straight to the database during the 5 November
    batch-model work rather than through the admin UI. Taiwo reported leads concluding
    they could no longer start this month while she was trying to enroll someone. Ali
    confirmed it was unintentional and that it should be the 12th. Reverted with an
    `update ... where start_date = DATE '2026-12-07'` guard so a re-run could not stamp
    over anyone else's edit.
  - Verification: the landing page's cohort card read back live in a browser as
    "Next Cohort | November 12, 2026 | 123 seats remaining".
  - Notes: no deploy needed, the card reads the API at runtime.

- [x] Landing page cohort card: tell a batch apart from a legacy cohort
  - Date: 2026-11-06
  - Session: CC-20261106-p3n8
  - What changed: the November fix above is a one-off; the same confusion returns on its
    own when the December batch opens, because under the monthly batch model a batch's
    `start_date` is its ORIENTATION and falls in the month AFTER the batch. The December
    batch would have advertised "January 4, 2027" as a start date. `listOpenCohorts` now
    lifts `batch_month` out of `settings_json` and returns it (the rest of `settings_json`
    stays private, it has never been public), and `AIArchitectLandingPage` branches on it:
    with a batch month it shows "Enrolling now / December 2026 / orientation January 4",
    without one it keeps the legacy "Next Cohort / November 12, 2026". `batch_month` is
    the only thing that distinguishes the two, since a legacy row's `start_date` is a
    genuine start and the date alone cannot say which kind it is.
  - Verification: backend `tsc --noEmit` exit 0 with **0** errors in `src/` and **0**
    `Cannot find module` lines, which is what makes the run trustworthy. 6 backend tests
    on `toPublicCohort`, 4 frontend tests on `formatBatchMonth`.
  - Notes: the mapping was extracted as the pure `toPublicCohort` so it could be tested
    without a database. One of its tests exists only to assert `settings_json` is never
    returned. Also removed "When this cohort fills, enrollment closes and the next start
    date moves out" from the card: with a batch every month and no gaps, the second half
    is false. The seat count stayed, because that number is true.
    The label is parsed from `batch_month` rather than the row name, because the names
    have already drifted on production: "Cohort - April 2026" uses an em dash where the
    others use a hyphen.
    A FALSE PASS WAS NEARLY TAKEN: the first backend typecheck reported 12,011 errors in
    `src/`, all downstream of `Cannot find module 'zod'` / `'sequelize'` because the root
    junction pointed at a checkout without them. Dismissing those as "the known phantoms"
    would have shipped a real TS2352 on a cast in this very change, which only appeared
    once the junction was repointed and the count dropped to 1.
