/**
 * AF2.8 measured facts. DATA ONLY, no rendering.
 *
 * Every number was read from production on 2026-10-21 or 2026-10-22, either by running the real
 * service the product runs or by a query that did not read a script's own report. Nothing is
 * estimated. If it is not measured it is not in this file.
 */

/** The one absent row, and everything it broke. Ordered by severity, NOT by who noticed. */
const SYMPTOMS = Object.freeze([
  Object.freeze({
    rank: 1,
    what: 'Verification could never run',
    detail: 'buildVerificationService returns NoPublishedPlan and stops BEFORE reading a single acceptance criterion. No intern commit could mark anything complete, for any of the 503 stories.',
    foundBy: 'found while fixing something else',
    reported: false,
  }),
  Object.freeze({
    rank: 2,
    what: 'Documents could not be downloaded',
    detail: 'The portal answered "finish the build wizard first". This is the only symptom an intern could see.',
    foundBy: 'Quincy and Mihret, independently',
    reported: true,
  }),
  Object.freeze({
    rank: 3,
    what: 'A stale tab could overwrite a whole project',
    detail: "importProject's guard asked hasPublishedBuild, false for all ten, so the guard never fired. Mihret's project was corrupted twice in one afternoon. PR #3241 patched the symptom; this was the root.",
    foundBy: 'PR #3241',
    reported: false,
  }),
  Object.freeze({
    rank: 4,
    what: 'No STORY-000 anywhere',
    detail: 'The Command Center story is injected by the publish path, so none of the ten had one.',
    foundBy: 'earlier audit',
    reported: false,
  }),
]);

/** Before and after, per project. */
const PLANS = Object.freeze({
  projects: 10,
  before: Object.freeze({ plans: 0, published: 0 }),
  after: Object.freeze({ plans: 10, published: 10 }),
  storiesCovered: 503,
  /** Counted before and after the write. A plan must not disturb a story row. */
  storiesBefore: 503,
  storiesAfter: 503,
  criteriaBefore: 503,
  criteriaAfter: 503,
  warnings: 0,
  contrast: 'Every project where verification has ever succeeded has exactly 1 published plan: Stress_Test_Review_App (30 verified), Meeting Assistant (25), Travel Agency Platform (24).',
});

/** The verifier, exercised through the real code path rather than the script's own report. */
const VERIFIER = Object.freeze({
  project: 'product_experience',
  before: Object.freeze({ getPublishedPlan: 'NULL', outcome: 'NoPublishedPlan, stopped', specs: 0, criteria: 0 }),
  after: Object.freeze({ getPublishedPlan: 'FOUND, v1', storiesInPlan: 31, withAcceptance: 31, specs: 32, criteria: 48 }),
  story000: Object.freeze({ before: 'absent on all ten', after: 'present, 5 criteria' }),
});

/** The download, which is AF2.8's own stated acceptance. Run, not inferred. */
const DOWNLOAD = Object.freeze([
  Object.freeze({
    domain: 'product_experience', intern: 'Mihret Netsereab',
    filename: 'product-experience-build-docs-v1.zip', bytes: 539368, files: 42,
    planVersion: 1, published: true,
  }),
  Object.freeze({
    domain: 'platform', intern: 'Quincy Nkwain Ninying',
    filename: 'platform-build-docs-v1.zip', bytes: 791248, files: 65,
    planVersion: 1, published: true,
  }),
]);

/** What a bundle actually contains, so "the download works" is checkable. */
const BUNDLE_CONTENTS = Object.freeze([
  'docs/REQUIREMENTS.md',
  'docs/CONNECT-YOUR-REPO.md',
  'docs/stories/<one per story>.md',
  'docs/stories/STORY-000.md',
  '.colaberry/plan.seed.json',
  '.colaberry/progress.seed.json',
  '.colaberry/manifest.json',
]);

/** Why the plan was derived from the task rows rather than generated. */
const DERIVATION = Object.freeze({
  refused: 'Re-running the build wizard. Its publish path re-materializes every task row, and the ten projects hold 503 stories with criteria and due dates that four interns have connected repositories against.',
  guarantee: 'The plan is built FROM the tasks, so it cannot disagree with them about what a story asks for. That disagreement is what made this bug confusing: the portal read criteria from student_tasks.acceptance while the verifier read them from the plan.',
  requirementsEmpty: 'Measured across all 503 stories: 0 carry a requirement_key, 0 carry fulfills, 0 carry an owner_agent. These projects came from capability records, not a requirements document. An empty array is true; invented requirements would be fiction in an artifact the gate and the docs both read.',
});

/** The source fix, so a newly provisioned domain cannot regress. */
const SOURCE_FIX = Object.freeze({
  constant: 'HUMAN_WORK_STATEMENT at agentDomainProvisionPlan.ts:198',
  text: 'This story is human work, not a Claude Code build, and it carries no prompt on purpose.',
  sites: 2,
  storiesPerProvision: 6,
  foundBy: 'Mihret',
  testInverted: 'agentDomainProvisioner.test.ts asserted exactly the opposite for all 60 stories. Updated rather than deleted, with the reason recorded in the test.',
});

const SHIPPED = Object.freeze({
  tests: Object.freeze({ planDerivation: 19, prompts: 16, total: 35, agentDomainSuite: 520 }),
  prs: Object.freeze([
    Object.freeze({ n: 3285, title: 'Synthesize the ten published plans' }),
    Object.freeze({ n: 3292, title: 'Research stories generate a prompt, at the source' }),
  ]),
});

/** The correction this ticket forced on AF10.2. */
const CORRECTION = Object.freeze({
  claimed: '503 of 503 gradeable',
  actual: '503 of 503 DISPLAYING criteria; 0 gradeable, because the verifier reads the stored published plan rather than student_tasks.acceptance',
  consequence: 'AF10.2 was reopened. It had been closed on a claim that was not true.',
  cause: 'I proved the display path and assumed the grading path used the same field. The verification contract says "the criteria list comes from the stored published plan" in words I had already quoted on the ticket.',
});

const MEASURED_ON = '2026-10-22';

module.exports = {
  SYMPTOMS, PLANS, VERIFIER, DOWNLOAD, BUNDLE_CONTENTS, DERIVATION,
  SOURCE_FIX, SHIPPED, CORRECTION, MEASURED_ON,
};
