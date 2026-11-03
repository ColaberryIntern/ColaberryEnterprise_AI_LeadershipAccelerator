/**
 * L11.5 — the Colaberry Live testing strategy and evidence matrix. One data module, three
 * outputs: a one-page visual, a register, and the in-repo Markdown that acceptance criterion 3
 * actually asks for.
 *
 * WHY THE MARKDOWN IS GENERATED FROM HERE RATHER THAN HAND-WRITTEN. Criterion 3 is "readable by
 * a future Claude Code session with no chat history", which means the artifact has to live in
 * the repo, not only in a PDF in a Basecamp folder. But a hand-written document and a generated
 * PDF quoting the same counts is two sources of truth for numbers that change every time
 * somebody adds a test, and the one certainty about that arrangement is that they will disagree
 * within a fortnight. So the numbers live here once, and all three outputs render from them.
 * That is the same docs-as-code argument ticket L0.2 exists to enforce, applied to this ticket.
 *
 * EVERY NUMBER BELOW WAS MEASURED ON 2026-11-02, NOT ESTIMATED, and the command that produced
 * it is recorded beside it in `MEASURED`. They are a snapshot: re-run the commands before
 * citing them anywhere that matters. A count asserted from memory is how a testing document
 * becomes fiction.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────
 * THE ARGUMENT THIS DOCUMENT MAKES, stated once here so neither renderer has to.
 *
 * Colaberry Live has 1,208 tests and has shipped four complete, well-tested units that nothing
 * called. Those two facts are not in tension — the second is what the first one buys you if the
 * suite is 99.6% unit tests. A unit test starts one layer BELOW the gap it needs to find: it
 * mocks the caller, so "there is no caller" is the one defect it structurally cannot see.
 *
 * The repo's response was not to write more unit tests. It invented a fourth tier — a test that
 * reads the SOURCE and asserts a caller exists, with the comment stripper itself under test
 * because the first version passed when the call was commented out. That tier is the honest
 * center of this strategy, and it is cheap precisely because it is not an integration test.
 *
 * What is still missing is stated rather than omitted, per criterion 2: the integration tier is
 * one DB-gated file, and no end-to-end test touches the broadcast surface at all.
 */

const META = {
  ticket: 'L11.5',
  title: 'Testing strategy and evidence matrix',
  date: '2026-11-02',
  session: 'CC-20261015-t6q2',
  project: '49210714',
  todo: '10392808328',
  due: '2026-10-29',
  commit: 'measured at origin/main 4c3d0df2',
};

/** Where each number came from, so a future session can re-derive rather than trust. */
const MEASURED = [
  { what: 'Backend broadcast service tier',
    cmd: 'jest --testPathPattern="src/services/broadcast/__tests__"',
    suites: 40, tests: 640, note: '635 passed, 5 skipped — the skips are the DB-gated file' },
  { what: 'Backend controllers, routes, db, schemas',
    cmd: 'jest --testPathPattern="src/(controllers|routes|db|schemas)/__tests__/.*[Bb]roadcast"',
    suites: 9, tests: 199, note: 'all passed' },
  { what: 'Frontend portal, player, companion, producer, replays',
    cmd: 'react-scripts test --testPathPattern="(roadcast|iveMiniPlayer|ompanionDeck|roducer|eplay)"',
    suites: 24, tests: 369, note: 'all passed' },
];

const TOTALS = (() => {
  const suites = MEASURED.reduce((a, m) => a + m.suites, 0);
  const tests = MEASURED.reduce((a, m) => a + m.tests, 0);
  // The integration tier is one file and it is skipped unless a database is present.
  const integration = 5;
  return {
    suites,
    tests,
    integration,
    e2e: 0,
    unit: tests - integration,
    pctUnit: ((tests - integration) / tests) * 100,
    pctIntegration: (integration / tests) * 100,
  };
})();

/**
 * The tiers that actually exist here, against CLAUDE.md's target distribution.
 *
 * `have` is measured; `target` is the Test Strategy Framework's stated share. The gap is the
 * finding, and the fourth row is the tier CLAUDE.md does not name because this repo invented it.
 */
const TIERS = [
  { tier: 'Unit', target: '~70%', have: '99.6%', n: TOTALS.unit,
    verdict: 'over', what:
      'Pure policy modules, projections, formatters, state-machine decisions. Every service '
      + 'takes injectable deps so no test needs a database.',
    gap: 'Not a fault in itself — but see the defect history. These cannot see a missing caller.' },
  { tier: 'Integration', target: '~20%', have: '0.4%', n: TOTALS.integration,
    verdict: 'under', what:
      'Exactly one file: broadcastTelemetryAnchorRace.integration.test.ts, a real race against '
      + 'Postgres. It is `describe.skip` unless HAS_DB, so it runs in CI\'s "Integration tier '
      + '(Postgres)" job and is silently skipped on every developer machine.',
    gap: 'The whole tier is one file. Nothing exercises the heartbeat route against a real '
       + 'database, and nothing exercises the health loop against a real provider.' },
  { tier: 'End-to-end', target: '~10%', have: '0%', n: 0,
    verdict: 'absent', what:
      'None. Playwright exists at tests/systemV2 with eight flows, and none of them touch a '
      + 'broadcast.',
    gap: 'Deliberate and recorded, not an oversight: campusFidelityViews.js:324 names the '
       + 'broadcast surface as "kept out on purpose, #3346" and notes the local seed has no '
       + 'broadcast with a class session to drive one. It is still the tier whose absence the '
       + 'defect history is written in.' },
  { tier: 'Wiring', target: 'not in CLAUDE.md', have: '5 files', n: 5,
    verdict: 'invented', what:
      'A test that reads the SOURCE and asserts a caller exists — the only layer at which '
      + '"nothing calls this" is visible at all. broadcastHealthLoop.wiring.test.ts asserts '
      + 'server.ts imports the loop, CALLS it in live code rather than in a comment, and '
      + 'guards the call in a try block.',
    gap: 'It is a proxy for the integration coverage that does not exist. Cheap, and it caught '
       + 'what 1,200 unit tests could not — but it proves a call is written, never that it works.' },
];

/**
 * The four defects this subsystem shipped, every one with a full passing suite underneath it.
 *
 * Quoted from the ticket bodies on the board, which is where they were diagnosed. This table is
 * the evidence for the argument in the header; without it the strategy is an opinion about
 * pyramids.
 */
const HISTORY = [
  { id: 'L4.6', what: 'The heartbeat route shipped with no caller',
    tests: '13 tests passing', cost:
      'A real 20-minute airing with two viewers recorded ZERO telemetry — not a low number, '
      + 'zero rows in both tables, while nginx logged 16 playback grants and 103 discovery '
      + 'polls from two distinct clients.',
    caught: 'Only because an explicit telemetry criterion was added to the Test 2 plan two days '
          + 'before the test. It had been live and broken for five days.' },
  { id: 'L7.1', what: 'Occurrence creation shipped with no provider binding',
    tests: 'creation tested', cost:
      'The occurrence was real, correctly private, correctly roomed, correctly timed — and '
      + 'unplayable, because nothing set provider_session_id.',
    caught: 'By hand during a live test, when the field had to be set manually before anyone '
          + 'could watch.' },
  { id: 'L5.5', what: 'runProviderEvent: exported, tested, called by nothing',
    tests: 'its own unit tests passing', cost:
      'provider_health stayed permanently "unknown", so go_live always refused with '
      + 'ProviderNotReady and an engineer had to feed the event by hand after reading '
      + 'Cloudflare directly.',
    caught: 'By grep, with a control: runProducerCommand had real callers, runProviderEvent had '
          + 'exactly one occurrence in the backend — its own definition.' },
  { id: 'L4.9', what: 'The player never called the heartbeat endpoint',
    tests: '13 tests on the route', cost:
      'Every audience number for the first public airing would have been a confident zero, and '
      + '"nobody watched" would have been indistinguishable from "collection is broken" — the '
      + 'precise failure L4.6 was built to prevent, shipped with that failure live.',
    caught: 'A grep of frontend/src for "heartbeat" returned only unrelated systems. The '
          + 'positive control: the frontend DOES call the playback endpoint.' },
];

/** The gates a change actually passes before it can merge. Observed on PR 3619, 2026-11-02. */
const GATES = [
  { g: 'Backend typecheck', k: 'contract' },
  { g: 'Backend unit tests', k: 'unit' },
  { g: 'Test-file typecheck', k: 'contract',
    n: 'Per-file ratchet; tests are typechecked under --strict with no --allowJs, because '
     + 'ts-jest is transpile-only and a green suite proves nothing about types.' },
  { g: 'Frontend typecheck', k: 'contract', n: 'The authoritative frontend gate.' },
  { g: 'Frontend build', k: 'contract' },
  { g: 'Frontend unit tests', k: 'unit' },
  { g: 'Integration tier (Postgres)', k: 'integration',
    n: 'The only place the one integration file is not skipped.' },
  { g: 'Secret scan + route-auth lint', k: 'security',
    n: 'lint-route-auth.js: a route with no auth chain fails the build.' },
  { g: 'Static security scan', k: 'security' },
  { g: 'Scan new commits', k: 'security' },
  { g: 'Sweep full history', k: 'security', n: 'Skipped on ordinary PRs.' },
];

/**
 * Practices this subsystem uses that are worth keeping, each with the file that demonstrates it.
 * Criterion 1: every claim says whether it is proven by test or in production.
 */
const PRACTICES = [
  { p: 'Mutation-test the assertion, or it is a comment', proof: 'test',
    where: '6 broadcast test files carry mutation records',
    why: 'An assertion nobody has watched fail is indistinguishable from a comment. The wiring '
       + 'test is the case in point: its first version PASSED with the call commented out, and '
       + 'that was found by mutating server.ts and watching the test stay green.' },
  { p: 'Assert the SQL as text when behavior cannot see the difference', proof: 'test',
    where: 'broadcastTelemetryQuery.test.ts',
    why: 'COUNT(DISTINCT enrollment_id) and COUNT(*) return the same number against a fixture '
       + 'with one viewer per person. They differ only when somebody opens a second tab — the '
       + 'case the design exists to get right.' },
  { p: 'Validate controls BOTH ways before believing a negative', proof: 'production',
    where: 'the L5.5 grep, and the 401 probe during the 2 Nov deploy',
    why: 'An unauthenticated probe of a new route returned 401 — and so did /api/health and a '
       + 'deliberately bogus path, so the probe discriminated nothing. A negative with no '
       + 'validated positive control is not evidence.' },
  { p: 'Zero and we-do-not-know must never collapse', proof: 'test',
    where: 'broadcastProducer.ts, broadcastDiscovery.ts, useBroadcastDiscovery.ts',
    why: 'The metrics dictionary calls a fabricated zero a defect rather than a cosmetic issue: '
       + 'it reads as "nobody watched" when the truth is "we do not know".' },
  { p: 'Inject dependencies so no unit test needs a database', proof: 'test',
    where: 'every broadcast service takes a deps object',
    why: 'It is what keeps 1,200 tests fast enough to run on every change.' },
  { p: 'A fixture built by the code under test matches by construction', proof: 'test',
    where: 'the backfill planner, run against exported production rows',
    why: 'If the fixture and the assertion come from the same function, the test passes whatever '
       + 'that function does.' },
];

/** What is NOT covered. Criterion 2 asks for this explicitly rather than by omission. */
const NOT_COVERED = [
  { h: 'No end-to-end test touches a broadcast',
    d: 'Eight Playwright flows exist and none of them opens a player, joins a room, votes in a '
     + 'poll or watches a replay. Recorded as deliberate (#3346), but it means no test has ever '
     + 'walked the path a viewer walks.' },
  { h: 'The integration tier is one DB-gated file',
    d: 'And it is skipped on every developer machine, so the only place it runs is one CI job. '
     + 'Nothing exercises the heartbeat route, the health loop or the playback grant against a '
     + 'real database or a real provider.' },
  { h: 'Entitlement has never been exercised against a real viewer',
    d: 'L10.7 is open and P0 for this reason. The paywall is unit-tested and has never refused '
     + 'an actual person. Everything else assumes the right people can watch and the wrong '
     + 'people cannot.' },
  { h: 'No test asserts what a viewer SEES during a failure',
    d: 'L10.4\'s failure drills are the plan for this and have not been run. The states exist '
     + 'in the machine; reconnecting, for example, could not be reached in production at all '
     + 'until the health loop was wired.' },
  { h: 'Accessibility is covered for the player only',
    d: 'liveMiniPlayer.axe.test.tsx sweeps the player subtree for wcag2a/wcag2aa violations in '
     + 'both themes. The companion, the producer strip and the replay list have no axe sweep.' },
  { h: 'Load and concurrency are untested',
    d: 'The telemetry tables are designed to be bounded by concurrent tabs rather than by '
     + 'elapsed time, and that property has never been measured under load. One real race test '
     + 'exists, for the telemetry anchor.' },
];

module.exports = { META, MEASURED, TOTALS, TIERS, HISTORY, GATES, PRACTICES, NOT_COVERED };
