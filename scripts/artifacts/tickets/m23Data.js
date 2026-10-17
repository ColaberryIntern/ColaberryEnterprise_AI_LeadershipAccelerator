/**
 * M23 data module. Measurements only: no rendering, no I/O, no formatting decisions.
 *
 * Every number here was produced by a command whose output is quoted in the session log
 * (docs/sessions/CC-20261005-r6h2.md) and re-derived independently from the raw tsc log before
 * being written down. The histogram in particular is NOT a remembered figure: it was recomputed
 * from the diagnostic lines and checked against the two totals it has to agree with.
 */

/** 2026-10-17, America/Chicago. */
const MEASURED_ON = '17 Oct 2026';

const CODE = 'M23';
const SLUG = 'M23_TEST_FILE_TYPECHECK';
const TITLE = 'CI typechecks test files';

/**
 * The takeaway, and it is a "so what", not a finding: the files that do the checking were
 * themselves unchecked, and that is now closed in the only direction that can be closed.
 */
const TAKEAWAY = 'The guards protecting Person 360 and the Sales Readiness Score are test files, '
  + 'and no gate in this repo ever typechecked them. 400 type errors were sitting in 141 of them. '
  + 'None were in production code. CI now checks them against a frozen baseline that can only '
  + 'shrink, so a NEW error fails the build and the existing debt is a named number instead of an '
  + 'unknown one.';

const ASKED = 'make CI typecheck test files, fix or freeze what is already broken, and make the '
  + 'baseline shrink-only.';
const DELIVERED = 'a tsconfig that includes the test files, a measured 400-error baseline frozen '
  + 'per file, a checker that refuses to believe a crashed run, 22 tests over the checker with all '
  + 'four rules mutation-proved, and a parallel CI job wired report-only.';

/** Why it was invisible. Each row is a gate that exists today and the program it actually reads. */
const GATES = [
  {
    gate: 'Backend typecheck (CI)',
    reads: 'tsconfig.json',
    covers: 'src, EXCLUDING **/*.test.ts and **/__tests__/**',
    sawTests: false,
  },
  {
    gate: 'Backend unit tests (CI)',
    reads: 'ts-jest, isolatedModules',
    covers: 'transpiles each test file, does NOT check types',
    sawTests: false,
  },
  {
    gate: 'Frontend typecheck / build',
    reads: 'frontend/tsconfig.json',
    covers: 'frontend only',
    sawTests: false,
  },
  {
    gate: 'Test-file typecheck (NEW)',
    reads: 'tsconfig.test.json',
    covers: 'all of src INCLUDING every test file',
    sawTests: true,
  },
];

/** The size of the blind spot, all four counted rather than estimated. */
const SCALE = {
  testFiles: 2040,
  testFilesIncludingHelpers: 2100,
  srcFilesTotal: 5946,
  filesWithErrors: 141,
  errors: 400,
  distinctCodes: 26,
  srcErrors: 0,
};

/**
 * The 400 errors by TypeScript code, recomputed from the diagnostic lines.
 * The listed codes plus `otherCodes` sum to 400, which is the control.
 */
const CODES = [
  { code: 'TS2345', n: 150, what: 'argument type does not match the parameter' },
  { code: 'TS2556', n: 50, what: 'spread argument needs a tuple' },
  { code: 'TS2322', n: 45, what: 'type not assignable' },
  { code: 'TS2339', n: 25, what: 'property does not exist on type' },
  { code: 'TS18048', n: 21, what: 'value is possibly undefined' },
  { code: 'TS2352', n: 18, what: 'conversion may be a mistake' },
  { code: 'TS2493', n: 17, what: 'tuple index out of range' },
  { code: 'TS7006', n: 9, what: 'parameter implicitly any' },
  { code: 'TS2532', n: 9, what: 'object is possibly undefined' },
  { code: 'TS2739', n: 7, what: 'missing properties' },
  { code: 'TS2451', n: 7, what: 'redeclared block-scoped variable' },
  { code: 'TS2740', n: 6, what: 'type missing properties from another' },
];
const OTHER_CODES = { codes: 14, n: 36 };

/**
 * The cost, measured in BOTH places, because the first figure written here was wrong in a way
 * that would have changed the decision.
 *
 * The local runs took 761 and 785 seconds, and "about 13 minutes" went into the first draft of
 * the commit, the PR and this artifact. The CI run then finished the same typecheck in 71
 * seconds, with an identical verdict (400 errors across 141 files, baseline matched). The local
 * machine is Windows, with the tree under a syncing folder and two other heavy jobs running
 * against it at the time; the runner is a clean Linux box. The CI number is the one that bears on
 * whether this belongs in CI, so it leads.
 *
 * A 2-minute green on a check expected to take 13 minutes is exactly the shape of a false pass,
 * so it was NOT taken at face value: the job log was read, and it shows the real tsc line.
 */
const COST = {
  ciSeconds: 71,
  ciJobSeconds: 121,
  localSeconds: 761,
  heapMb: 8192,
  crashSeconds: 490,
  crashExit: 134,
  crashErrorsReported: 0,
  parallelJob: true,
};

/** The ratchet, in all four directions. Up and down both fail; absent must be zero. */
const RATCHET = [
  { change: 'A NEW error in a baselined file', result: 'FAIL', why: 'the thing being prevented' },
  { change: 'A NEW file with any error', result: 'FAIL', why: 'fix it; no new baseline entries' },
  { change: 'One error FIXED', result: 'FAIL', why: 'names the lower number to paste in' },
  { change: 'A file reaches ZERO', result: 'FAIL', why: 'demands the entry be deleted' },
  { change: 'Counts match exactly', result: 'PASS', why: 'the only passing state' },
];

/**
 * The checker's own verification. Four mutants, each killed exactly one named test, each restore
 * proved byte-identical with `cmp`. M1b is the one worth reading: it reproduces a real bug that
 * was found and fixed during this task, so the test is known to catch it rather than assumed to.
 */
const MUTANTS = [
  {
    id: 'M1a',
    mutation: 'crashed() stops checking the exit status',
    killed: 'treats any exit that is not 0 or 2 as a crash',
  },
  {
    id: 'M1b',
    mutation: 'the crash phrase becomes unconditional (the bug actually fixed here)',
    killed: 'does NOT call a completed run a crash because a diagnostic quoted the phrase',
  },
  {
    id: 'M2',
    mutation: 'the diagnostic regex loses its leading-space anchor',
    killed: 'ignores an indented diagnostic-shaped line',
  },
  {
    id: 'M3',
    mutation: 'ratchet() stops reporting improvements',
    killed: 'catches an improvement, naming the number to paste',
  },
];

/**
 * THE DEFECT THIS TASK FOUND IN ITSELF, kept rather than quietly fixed, because it is the whole
 * lesson: an instrument built to catch false passes shipped with a false-FAILURE mode.
 */
const SELF_DEFECT = {
  what: 'crashed() matched the phrase "FATAL ERROR" anywhere in tsc output.',
  why: 'grep found those phrases in three ordinary src files and in the checker\'s own fixtures. '
    + 'tsc echoes source text into diagnostics, so a completed run could be declared a crash, '
    + 'failing CI with the wrong diagnosis and skipping the baseline comparison entirely.',
  fix: 'the exit status is primary and catches every real heap death on its own; the phrase now '
    + 'counts only when no diagnostics parsed at all.',
  direction: 'It failed SAFE (a false alarm, never a false pass), but a gate that cries wolf gets '
    + 'switched off, so it still had to go.',
};

/** What this does NOT establish. Stated so nobody reads more into the green check than is there. */
const NOT_ESTABLISHED = [
  'It does not fix the 400 errors. They are frozen and named, not resolved.',
  'It does not make the test ASSERTIONS correct. A type-clean test can still check the wrong '
    + 'thing, which is why the four rules here are mutation-proved rather than merely passing.',
  'It is not yet a required status check. It reports; promoting it to a gate is Ali\'s call, and '
    + 'it should report green on main for a while first.',
  'It does not cover the frontend. frontend/src tests are checked by a different config and were '
    + 'not measured here.',
];

const PR_LABEL = 'PR pending';

module.exports = {
  MEASURED_ON, CODE, SLUG, TITLE, TAKEAWAY, ASKED, DELIVERED,
  GATES, SCALE, CODES, OTHER_CODES, COST, RATCHET, MUTANTS, SELF_DEFECT, NOT_ESTABLISHED,
  PR_LABEL,
};
