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
 * importing the same module does not.
 *
 * REPRODUCED ON LINUX 2026-10-22. A throwaway draft PR un-commented
 * assessmentService and let CI run it: that suite was the ONLY failure in
 * the run, against 2,082 suites and 34,407 tests passing. So these are real
 * failures, not a Windows artifact. The same error class also appears
 * throughout that log as SWALLOWED warnings from other services, so it is
 * not confined to the suites on this list - that is where to start.
 *
 * The two that DID pass turned out never to have needed a database: both pass
 * with `DATABASE_URL` unset. They were on this list by mistake, and they are off
 * it now - `explorerEnrollmentWelcome` (5 tests) and `requireBuildEntitlement`
 * (23 tests), 28 tests of coverage that the gate was silently skipping.
 *
 * Two HANG rather than fail, which no previous run could have shown because the
 * list meant they never ran: `communityCommentsLikesProfiles` and
 * `systemStateEngine/phase10_5`, both killed at a 90 s cap.
 *
 * ── CAUSE IDENTIFIED 2026-10-23, and SIX SUITES COME OFF THE LIST ────────────
 *
 * It is ONE pattern, not twenty problems: a PARTIAL MOCK OF A SHARED CONFIG
 * MODULE, missing a field that some transitively-imported module needs AT IMPORT
 * TIME. The suite then dies before a single test runs, which is why it reports as
 * "Test suite failed to run" with no test names and looked like twenty unrelated
 * failures.
 *
 * The open oddity above - a direct `require` of the mocked module receiving the
 * stub while a model importing the same module does not - has no contradiction in
 * it. THE TWO PATHS READ DIFFERENT PROPERTIES. `Model.init` never looks at
 * `sequelize.define`; it reads `this.sequelize.options.define` and then calls
 * `this.sequelize.runHooks` (`sequelize/lib/model.js`, `static init`). Every one
 * of these stubs supplied `define: jest.fn()` - the one key that looks exactly
 * right and is never consulted.
 *
 * The `config/env` stubs fail the same way one step out: `{ env: {} }` or
 * `{ env: { jwtSecret } }` leaves `env.databaseUrl` undefined, so anything that
 * transitively imports `config/database` hits `new Sequelize(undefined)`.
 *
 * EXTENDING THE STUB IS THE WRONG FIX, and that was measured rather than
 * reasoned: adding `options: { define: {} }` moved the error from `define` to
 * `runHooks`. `src/__tests__/testSupport/configMocks.ts` instead starts from the
 * REAL object and overrides only the methods a test asserts on, so there is
 * nothing to keep in sync as Sequelize changes.
 *
 * SIX SUITES NOW PASS and are off this list - 56 tests the gate was skipping:
 * `assessmentService`, `projectDnaService`, `ticketServiceReeseTypes`,
 * `explorerCohortRouting`, `adminEnrollmentPortalAccess`,
 * `portalEnrollmentService`.
 *
 * THE SIXTEEN THAT REMAIN ARE NOW NAMED, in two groups below, and neither group's
 * cause is the environment. Note that the "same environmental reason" paragraph
 * near the top of this docblock is the claim all of this disproves; it is left in
 * place because the correction history is the useful part of this file.
 */
const ciConfig: Config = {
  ...base,
  testPathIgnorePatterns: [
    ...(base.testPathIgnorePatterns ?? ['/node_modules/']),

    // ── GROUP 1: DIES AT IMPORT — a model is mocked while the REAL association
    // wiring runs. `models/index.ts:548` does `Cohort.hasMany(Enrollment, ...)`,
    // and a suite that replaced `Enrollment` with a plain object gets
    // "called with something that's not a subclass of Sequelize.Model", or
    // "<Model>.default.hasMany is not a function" when the mocked one is the
    // subject rather than the target.
    //
    // NOT fixable by a better config mock — the suites in group 1 and the six
    // that came off the list differ in kind. The fix is per-suite: stop
    // `jest.mock`-ing models and `jest.spyOn` the real ones, which is now
    // possible because `configMocks` gives a real (unconnected) Sequelize that
    // `Model.init` accepts. That is genuine test refactoring, not a mock tweak.
    'src/__tests__/routes/adminRoutes\\.test\\.ts',
    'src/__tests__/services/cohortPresenceService\\.test\\.ts',
    'src/__tests__/services/communityCalendarService\\.test\\.ts',
    'src/__tests__/services/communityModeration\\.test\\.ts',
    'src/__tests__/services/communityNotificationService\\.test\\.ts',
    'src/__tests__/services/communityService\\.test\\.ts',
    'src/services/timeline/__tests__/typeLaunchGate\\.test\\.ts',

    // ── GROUP 2: THE SUITE RUNS — these are genuine assertion failures, not
    // wiring. They import cleanly and execute, and the tests disagree with the
    // code. Each needs reading on its own merits: a stale test and a real bug
    // look identical from here, and guessing which is how the inference at the
    // top of this file got written.
    //
    // `participantMagicLink` is the clearest example: 2 failures, both
    // "Enrollment.findAll is not a function", because its own `models` mock
    // lacks `findAll` while the service now calls it. Whether the service or
    // the test is wrong is a question about intended behaviour.
    //
    // `communityCommentsLikesProfiles` and `phase10_5` HANG rather than fail
    // (killed at a 90 s cap), so their failure mode is unknown beyond that.
    'src/__tests__/models/reeseOutreachModel\\.test\\.ts',
    'src/__tests__/services/communityCommentsLikesProfiles\\.test\\.ts',
    'src/__tests__/services/duplicateAccountSweepService\\.test\\.ts',
    'src/__tests__/services/participantMagicLink\\.test\\.ts',
    'src/middlewares/__tests__/mgmtRbac\\.test\\.ts',
    'src/seeds/__tests__/seedCurriculumCourseLinks\\.test\\.ts',
    'src/services/timeline/__tests__/timelineAdminService\\.test\\.ts',
    'src/services/timeline/__tests__/typeRegistry\\.test\\.ts',
    'src/intelligence/systemStateEngine/__tests__/phase10_5\\.test\\.ts',
  ],
};

export default ciConfig;
