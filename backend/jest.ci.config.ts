import type { Config } from 'jest';
import base from './jest.config';

/**
 * The CI test gate.
 *
 * Why this file exists. CI used to run `jest --testPathPattern
 * "trustRubric|aiCost|piiRedaction"` — an ALLOW-list of three suites, chosen on
 * the day CI was first stood up (2026-06-22) to get a green tick from suites
 * known to be pure. It was never widened. By 2026-08-14 that meant 3 suites and
 * 28 tests were checked while 611 suites and roughly 8,500 tests were not, so a
 * green "Backend unit tests" said almost nothing about a pull request.
 *
 * The fix is to invert the default. This config is an IGNORE-list: every suite
 * runs unless it is named below. A new test is therefore covered the moment it
 * is written, which is the property the allow-list lacked — under the old shape
 * you had to remember to widen a regex in a workflow file, and nobody ever did.
 *
 * Measured on a clean checkout of main with no DATABASE_URL, twice, identically:
 *   full suite     614 suites — 25 failed, 588 passed, 1 skipped
 *   with this list 589 suites — 588 passed, 1 skipped, exit 0
 *
 * ── What is excluded, and why ────────────────────────────────────────────────
 *
 * Every suite below fails for the SAME environmental reason: it exercises
 * Sequelize models directly, and with no database configured the model layer
 * never initialises. The failures are `sequelize.define` on undefined,
 * `Enrollment.findAll is not a function`, and reads of `rawAttributes` /
 * `associations` on undefined — model-layer wiring, not assertions about
 * behaviour. They are integration tests wearing a unit test's file extension.
 *
 * They are excluded because a gate that is permanently red is not a gate:
 * someone eventually deletes it, and then the coverage is zero rather than 96%.
 * Excluding them is a statement about CI's environment, NOT a judgement that
 * these suites are unimportant — several cover auth and money.
 *
 * The real fix is a Postgres service container in the workflow plus schema
 * provisioning, at which point entries come OFF this list. That is deliberately
 * a separate change: it needs a migration/seed story, and bundling it here
 * would risk the widening that is already proven safe.
 *
 * MAINTENANCE: adding a suite here must come with a reason. If the list grows
 * without one, the gate is being narrowed back to where it started.
 *
 * ── MEASURED 2026-10-21, and the paragraph above is wrong ────────────────────
 *
 * The `integration-tier` CI job now provides exactly what this file said it was
 * waiting for: a Postgres service container. So every suite on this list was run
 * against its OWN fresh database, one at a time (the same per-suite isolation
 * `scripts/ci/runIntegrationSuites.js` uses, because sharing one database makes
 * suites collide over `projects`). Of 24:
 *
 *   PASS  2      FAIL  20      HUNG  2
 *
 * A database is NOT what they were missing. `assessmentService` was run with and
 * without `DATABASE_URL` and fails IDENTICALLY both ways -
 * `TypeError: Cannot read properties of undefined (reading 'define')` at
 * `StudentPointsEvent.init` - while the suite itself already mocks
 * `config/database` with a stub that HAS `define`. So the cause is in how these
 * suites mock the model layer, not in CI's environment, and giving CI a database
 * does not let them come off this list. Fixing them is per-suite work.
 *
 * CORRECTION, same day: "in how these suites mock the model layer" is an
 * INFERENCE, not a measurement. What is measured is only that the database is
 * not the differentiator. Ruled out since: a mock factory missing
 * `__esModule: true`, and module identity through the junctioned node_modules
 * (both sides resolve under the same backend/src root). The open oddity is that
 * a direct `require` of the mocked module receives the stub while a model
 * importing the same module does not. Also: these numbers are from Windows and
 * none of the 20 has been reproduced on the Linux runner.
 *
 * The two that DID pass turned out never to have needed a database: both pass
 * with `DATABASE_URL` unset. They were on this list by mistake, and they are off
 * it now - `explorerEnrollmentWelcome` (5 tests) and `requireBuildEntitlement`
 * (23 tests), 28 tests of coverage that the gate was silently skipping.
 *
 * Two HANG rather than fail, which no previous run could have shown because the
 * list meant they never ran: `communityCommentsLikesProfiles` and
 * `systemStateEngine/phase10_5`, both killed at a 90 s cap.
 */
const ciConfig: Config = {
  ...base,
  testPathIgnorePatterns: [
    ...(base.testPathIgnorePatterns ?? ['/node_modules/']),

    // Sequelize models instantiated directly — needs a live database.
    'src/__tests__/models/reeseOutreachModel\\.test\\.ts',
    'src/__tests__/routes/adminRoutes\\.test\\.ts',
    'src/__tests__/services/adminEnrollmentPortalAccess\\.test\\.ts',
    'src/__tests__/services/assessmentService\\.test\\.ts',
    'src/__tests__/services/cohortPresenceService\\.test\\.ts',
    'src/__tests__/services/duplicateAccountSweepService\\.test\\.ts',
    'src/__tests__/services/explorerCohortRouting\\.test\\.ts',
    'src/__tests__/services/participantMagicLink\\.test\\.ts',
    'src/__tests__/services/ticketServiceReeseTypes\\.test\\.ts',
    'src/services/__tests__/portalEnrollmentService\\.test\\.ts',
    'src/services/__tests__/projectDnaService\\.test\\.ts',

    // Community surface — same cause, grouped because they move together.
    'src/__tests__/services/communityCalendarService\\.test\\.ts',
    'src/__tests__/services/communityCommentsLikesProfiles\\.test\\.ts',
    'src/__tests__/services/communityModeration\\.test\\.ts',
    'src/__tests__/services/communityNotificationService\\.test\\.ts',
    'src/__tests__/services/communityService\\.test\\.ts',

    // Middleware + seeds + timeline admin — all read model metadata at import.
    'src/middlewares/__tests__/mgmtRbac\\.test\\.ts',
    'src/seeds/__tests__/seedCurriculumCourseLinks\\.test\\.ts',
    'src/services/timeline/__tests__/timelineAdminService\\.test\\.ts',
    'src/services/timeline/__tests__/typeLaunchGate\\.test\\.ts',
    'src/services/timeline/__tests__/typeRegistry\\.test\\.ts',
    'src/intelligence/systemStateEngine/__tests__/phase10_5\\.test\\.ts',
  ],
};

export default ciConfig;
