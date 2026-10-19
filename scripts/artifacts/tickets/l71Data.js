/**
 * Data for L7.1 (run the reference corpus) and the L9.6 finding (source overflow).
 *
 * Data only. No rendering, no I/O. The document and both one-page visuals read from here, so a
 * number on a picture cannot drift from the number in the text.
 *
 * Every figure was measured on 15-16 October 2026 in session CC-20261001-q7m4. Nothing is
 * estimated. Where a count is asserted by a test, the test is named.
 */

/** The eight required corpus cases from `docs/project-lifecycle/reference-fixtures.md` §103. */
const CASES = [
  {
    n: 1, name: 'Ordinary AI service application', fixture: 'C', layer: 'generation',
    proves: 'the common path works end to end',
  },
  {
    n: 2, name: 'Government, two tracks', fixture: 'A', layer: 'generation',
    proves: 'requirement blocks enumerated BY ID, covered and uncovered, asserted as a partition',
  },
  {
    n: 3, name: 'Human-heavy workflow', fixture: 'B', layer: 'generation',
    proves: 'below target is honest and carries its denominator, rather than being reclassified',
  },
  {
    n: 4, name: 'Manual-only workflow', fixture: 'D', layer: 'generation',
    proves: 'zero automation is a RECORDED DECISION, not an empty allocation',
  },
  {
    n: 5, name: 'Multiple roles, one person', fixture: 'B variant', layer: 'gate',
    proves: 'separation of duty keys on IDENTITY, so a second role hat changes nothing',
  },
  {
    n: 6, name: 'Low-information interview', fixture: 'C variant', layer: 'both',
    proves: 'refuses rather than inventing a share: null, never a fabricated zero',
  },
  {
    n: 7, name: 'Source exceeding input limits', fixture: 'A variant', layer: 'prompt',
    proves: 'RECORDED GAP: blocks are dropped silently and the check does not see it',
  },
  {
    n: 8, name: 'Blueprint changed in flight', fixture: 'A or C variant', layer: 'gate',
    proves: 'time-of-check/time-of-use: a superseded revision is refused, and planning re-checks',
  },
];

/** The mandatory positive controls from §139, plus the one P7-T1.2 made reachable. */
const CONTROLS = [
  { id: 'SOURCE_COVERAGE', observed: true, note: 'an uncited requirement block' },
  { id: 'OVERSIGHT', observed: true, note: 'an agent handed ACCOUNTABLE over its own work' },
  { id: 'EFFORT_EVIDENCE', observed: true, note: 'minutes carrying basis UNKNOWN' },
  { id: 'SURFACE_UNMAPPED', observed: true, note: 'one workspace binding dropped' },
  { id: 'BELOW_TARGET_UNEXPLAINED', observed: true, note: 'the acceptance rationale stripped' },
  {
    id: 'SELF_APPROVAL', observed: false,
    note: 'DEFERRED with its blocker named: thrown inside a database transaction, no pure path',
  },
  {
    id: 'REWORK_BOUND', observed: true,
    note: 'ADDED BY T1.2 - the reference corpus had no rework edge at all, so this was unreachable',
  },
];

/**
 * The three clipping mechanisms in `services/factory/factoryDecomposePrompt.ts`.
 *
 * THIS IS THE FINDING. Only the one that almost never fires announces itself.
 */
const CLIPS = [
  {
    where: 'renderBlocks .slice(0, MAX_BLOCKS)',
    cap: '200 blocks',
    effect: 'block 201 and beyond dropped ENTIRELY',
    labeled: false,
  },
  {
    where: 'renderBlocks b.text.slice(0, MAX_BLOCK_CHARS)',
    cap: '4,000 chars per block',
    effect: 'the tail of any longer block is cut',
    labeled: false,
  },
  {
    where: 'delimited(..., MAX_BLOCK_CHARS * MAX_BLOCKS)',
    cap: '800,000 chars joined',
    effect: 'the joined body is cut',
    labeled: true,
  },
];

/**
 * Where the completeness check looks, against where the content actually is.
 *
 * `coversRequirementBlocks` tests that every requirement block id is NAMED IN THE PROMPT. The ids
 * live in the instruction line, which sits outside every `delimited()` call and is never clipped.
 */
const PROMPT_PARTS = [
  {
    part: 'Instruction line: "Every one of these requirement blocks MUST be cited by at least one task: blk-1, blk-2, ..."',
    clipped: false,
    checked: true,
  },
  { part: '<SOURCE_BLOCKS> the block TEXT the model actually reads from </SOURCE_BLOCKS>', clipped: true, checked: false },
  { part: '<REQUIREMENTS> the compliance list </REQUIREMENTS>', clipped: true, checked: false },
  { part: '<CONTEXT> the free-text brief </CONTEXT>', clipped: true, checked: false },
];

const VERIFICATION = {
  newTests: [
    { suite: 'corpusCases.test.ts (the eight cases)', n: 28 },
    { suite: 'corpusControls.test.ts (the rework block)', n: 7 },
  ],
  controlsSuite: { after: 20, before: 13 },
  regression: { passed: 1644, failed: 0, skipped: 79, suites: 90, suitesTotal: 101 },
  knownLocalFailures: {
    n: 3,
    what: 'factory/proposal ooxmlText, proposalExtractor, zipSafety',
    why: 'collection errors present in the full-backend baseline BEFORE this packet started, green on CI',
  },
  rework: { before: { edges: 0, transitions: 8 }, after: { edges: 1, transitions: 9 } },
  productionModulesTouched: 0,
  fileLines: 478,
  fileCeiling: 500,
};

const HEADLINE = {
  casesTotal: CASES.length,
  controlsObserved: CONTROLS.filter((c) => c.observed).length,
  controlsTotal: CONTROLS.length,
  clipsUnlabelled: CLIPS.filter((c) => !c.labeled).length,
  clipsTotal: CLIPS.length,
  newTestsTotal: 0,
};
HEADLINE.newTestsTotal = VERIFICATION.newTests.reduce((a, b) => a + b.n, 0);

const META = {
  title: 'The reference corpus runs, and the prompt drops source blocks silently',
  ticket: 'L7.1',
  alsoOn: 'L9.6',
  date: '16 October 2026',
  session: 'CC-20261001-q7m4',
  pr: 'https://github.com/ColaberryIntern/ColaberryEnterprise_AI_LeadershipAccelerator/pull/3139',
  status: 'READY FOR ALI REVIEW - PR OPEN',
};

module.exports = { CASES, CONTROLS, CLIPS, PROMPT_PARTS, VERIFICATION, HEADLINE, META };
