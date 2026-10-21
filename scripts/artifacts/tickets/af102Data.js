/**
 * AF10.2 measured facts. DATA ONLY, no rendering.
 *
 * Every number here was read from the production database on 2026-10-21, either by the
 * backfill scripts' own read-back or, for the verification block, by a separate query that
 * does not trust those scripts. Kept in its own module so the one-page visual and the spec
 * document cannot disagree about a figure: they both read this.
 *
 * Nothing in here is estimated. If a number is not measured it is not in this file.
 */

/** The ten provisioned agent-domain projects, and who builds each. */
const SCOPE = Object.freeze({
  domains: 10,
  interns: 7,
  stories: 503,
});

/**
 * The split that is the whole point of the ticket: most criteria already existed and were
 * MIGRATED; only the research stories' criteria were AUTHORED.
 */
const SPLIT = Object.freeze([
  Object.freeze({
    key: 'migrated',
    label: 'Release 2: migrated',
    stories: 443,
    source: 'Written by a human into the capability record, rendered into the story prose, never written to the field the verifier reads.',
    parsed: 443,
    unparsable: 0,
    criterionLen: Object.freeze({ min: 47, median: 104, max: 718 }),
  }),
  Object.freeze({
    key: 'authored',
    label: 'Release 0 and 1: authored',
    stories: 60,
    source: 'No criterion existed anywhere. Eighteen written across six families, each restating demands the story brief already made.',
    resolved: 60,
    unknownFamily: 0,
    criterionLen: null,
  }),
]);

/** Coverage before and after, counted independently of the scripts. */
const COVERAGE = Object.freeze({
  before: Object.freeze({ withCriteria: 0, total: 503 }),
  after: Object.freeze({ withCriteria: 503, total: 503 }),
  byRelease: Object.freeze([
    Object.freeze({ release: 'r0', total: 50, withCriteria: 50, kind: 'authored' }),
    Object.freeze({ release: 'r1', total: 10, withCriteria: 10, kind: 'authored' }),
    Object.freeze({ release: 'r2', total: 443, withCriteria: 443, kind: 'migrated' }),
  ]),
});

/**
 * The six authored families. This is the part most worth challenging, so it ships in full
 * rather than as a count.
 */
const FAMILIES = Object.freeze([
  Object.freeze({
    id: 'RESEARCH-1-SYSTEM-CLASSES',
    title: 'Compare the five system classes',
    stories: 10,
    criteria: Object.freeze([
      'The document compares all five system classes (chatbot, fixed workflow, tool-using agent, agentic system, multi-agent system) and names which one this domain needs.',
      "The choice cites this domain's own capability count and its human-reserved count, so the argument would change if those numbers changed.",
      'The document states explicitly which class this domain does NOT need, and what would have to change to justify the next class up.',
    ]),
  }),
  Object.freeze({
    id: 'RESEARCH-2-AGENT-ANATOMY',
    title: 'Map the nine anatomy elements',
    stories: 10,
    criteria: Object.freeze([
      'All nine anatomy elements are addressed, with none left blank and none dismissed as not applicable without a stated reason.',
      'Each element names the concrete platform surface, tool or record it maps to, rather than describing the element in general terms.',
      'Any element that cannot be filled is recorded as a gap with what is missing, rather than omitted.',
    ]),
  }),
  Object.freeze({
    id: 'RESEARCH-3-ROLE-AND-DA-TRANSITION',
    title: 'Role and which responsibilities transition',
    stories: 10,
    criteria: Object.freeze([
      'The document names the accountable human for this domain and the specific responsibilities proposed to transition to the agent.',
      'Each transitioning responsibility states what evidence would show the agent is ready to hold it.',
      'Responsibilities that must stay human are listed separately, each with the reason it is reserved.',
    ]),
  }),
  Object.freeze({
    id: 'RESEARCH-4-MANAGER-INTERVIEW',
    title: 'The 30-minute interview and weekly check-in',
    stories: 10,
    criteria: Object.freeze([
      'The interview plan fits 30 minutes, and every question is specific to this domain rather than reusable for any agent.',
      'A weekly check-in is proposed with a named day, a duration, and the three things it reviews.',
      'The plan states what to do with each answer, so a completed interview changes the build rather than only recording opinions.',
    ]),
  }),
  Object.freeze({
    id: 'RESEARCH-5-THREE-PROPOSED-TASKS',
    title: 'Three proposed tasks with boundaries',
    stories: 10,
    criteria: Object.freeze([
      'Exactly three agent tasks are proposed, each with its boundary stated as what the agent must NOT do.',
      'Each task names the evidence that proves it completed, and that evidence is something other than the task being marked done.',
      'Each task names the human who approves it wherever approval is required.',
    ]),
  }),
  Object.freeze({
    id: 'LEGACY-MIGRATION-PLAN',
    title: 'The legacy migration plan',
    stories: 10,
    criteria: Object.freeze([
      'The plan accounts for every inherited legacy record for this domain, each one kept, merged or retired with a reason.',
      'The migration is described as replayable: running it twice leaves the same end state, with no duplicated side effects.',
      'The plan states what happens to a record the migration cannot classify, rather than assuming none exist.',
    ]),
  }),
]);

/** Two authored criteria deliberately mirror rules the platform holds itself to. */
const MIRRORED_RULES = Object.freeze([
  Object.freeze({
    family: 'RESEARCH-5',
    criterion: 'evidence must be something other than the task being marked done',
    rule: "BUILD_VERIFICATION_CONTRACT.md's refusal of a story marked complete as its own proof",
  }),
  Object.freeze({
    family: 'LEGACY-MIGRATION-PLAN',
    criterion: 'running it twice leaves the same end state',
    rule: "the root CLAUDE.md Idempotency and Replayability rule",
  }),
]);

/**
 * The independent verification. Each row was a separate query that did not read the
 * scripts' own output.
 */
const CHECKS = Object.freeze([
  Object.freeze({ check: 'Every domain story carries criteria', want: '503 of 503', got: '503 of 503', pass: true }),
  Object.freeze({ check: 'Stored as a JSON array (what the reader accepts)', want: '503', got: '503', pass: true }),
  Object.freeze({ check: 'Empty arrays, which would recreate vacuous truth', want: '0', got: '0', pass: true }),
  Object.freeze({ check: 'Arrays holding a non-string element (silently dropped)', want: '0', got: '0', pass: true }),
  Object.freeze({ check: 'Stories marked verified (criteria must not grant credit)', want: '0', got: '0', pass: true }),
  Object.freeze({ check: 'Stories marked complete', want: '0', got: '0', pass: true }),
  Object.freeze({ check: 'Criteria per story', want: '1 to 3', got: '1 to 3', pass: true }),
]);

/**
 * The blast-radius investigation. The check flagged rows and the flag was RESOLVED with
 * evidence rather than reasoned away, which is why it is reported here rather than omitted.
 */
const BLAST = Object.freeze({
  flagged: 32,
  ourWriteWindow: '11:16:40 to 11:17:33',
  flaggedWindow: '11:07:31.9 to 11:07:32.08',
  minutesEarlier: 9,
  project: 'Stress_Test_Review_App',
  rowsCarryingOurText: 0,
  verdict: 'Not ours. A different process, nine minutes before our first write, on a project outside the ten. Both scripts restrict every UPDATE to the ten domain projects in SQL.',
});

/** Engineering that shipped alongside the data change. */
const SHIPPED = Object.freeze({
  tests: Object.freeze({ domain: 20, research: 17, total: 37 }),
  prs: Object.freeze([
    Object.freeze({ n: 3271, title: 'Migrate the 443', url: 'https://github.com/ColaberryIntern/ColaberryEnterprise_AI_LeadershipAccelerator/pull/3271' }),
    Object.freeze({ n: 3274, title: 'Author the 60', url: 'https://github.com/ColaberryIntern/ColaberryEnterprise_AI_LeadershipAccelerator/pull/3274' }),
  ]),
  scripts: Object.freeze([
    'backend/src/scripts/backfillDomainStoryAcceptance.js',
    'backend/src/scripts/backfillResearchStoryAcceptance.js',
  ]),
  verifierReads: 'backend/src/services/sbp/verification/storyVerificationRead.ts:105',
});

const MEASURED_ON = '2026-10-21';

module.exports = {
  SCOPE, SPLIT, COVERAGE, FAMILIES, MIRRORED_RULES, CHECKS, BLAST, SHIPPED, MEASURED_ON,
};
