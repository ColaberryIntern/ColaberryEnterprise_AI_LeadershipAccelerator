/**
 * l46Data — L4.6 criterion 4: mutation evidence for the measurement path.
 *
 * THE CRITERION: mutation evidence for the two rules the ticket named — that the credit anchor
 * belongs to the PERSON and not the tab, and that a collection failure is never rendered as an
 * empty room.
 *
 * WHY SEVEN AND NOT TWO. The two the ticket names are the two that were already recorded in
 * October, in a session log. Each of the other five reverses one more property the audience
 * number depends on, and the useful result is not "all seven were killed" — it is how MANY
 * tests notice each one. Three of them are noticed by exactly one assertion in one file. That
 * is the finding, and it is invisible if you only mutate the two you were asked to.
 *
 * WHY TWO 503 MUTATIONS. "Renders a failure as an empty room" has an obvious form and a subtle
 * one. The subtle one keeps the 503 and the `available: false` flag and adds a renderable zero
 * beside them — which anything asserting only the status code cannot tell from the real thing.
 * It is the same shape as L8.3's third reversal, and it is the one worth knowing about.
 *
 * Numbers here are TRANSCRIBED FROM A REAL RUN on 2026-11-07, not computed. Every test named
 * below is checked to exist in the test sources, and both mutated regions are checked to still
 * match the shipped source.
 */

const META = {
  ticket: 'L4.6',
  criterion: 4,
  criterionText: 'mutation evidence for the credit anchor and the unavailable-never-zero read',
  file: 'docs/broadcast/L4_6_TELEMETRY_MUTATION_AND_PLAN_RECORD.md',
  ranOn: '2026-11-07',
  service: 'backend/src/services/broadcast/broadcastTelemetryService.ts',
  controller: 'backend/src/controllers/broadcastController.ts',
  route: 'backend/src/routes/broadcastRoutes.ts:142',
  reproduce: 'cd backend && DATABASE_URL=<throwaway> node ../node_modules/jest/bin/jest.js '
    + '-c jest.config.ts --testPathPattern="src/(services/broadcast/__tests__/broadcastTelemetry'
    + '|controllers/__tests__/broadcastController|routes/__tests__/broadcastRoutes)"',
  /**
   * The flag is SINGULAR. `--testPathPatterns` is silently ignored by this jest and runs the
   * whole repository — 2,388 suites — which reads as a scoped green run until you check the
   * totals. And on Windows the harness must not go through a shell at all: cmd.exe reads the
   * `|` and `(` in that pattern as a pipe and a grouping operator, and Node refuses to spawn a
   * `.cmd` without a shell, so the call is `node node_modules/jest/bin/jest.js` directly.
   */
  flagNote: '--testPathPattern (singular); invoked through node, not npx, and not through a shell',
};

/**
 * The two shipped regions that were mutated, verbatim, so a reader can see exactly what was
 * reversed — and so the self-check can refuse if either has drifted since the run.
 */
const ORIGINALS = [
  {
    key: 'anchor',
    what: 'the credit anchor read, inside recordPlaybackBeat',
    file: 'backend/src/services/broadcast/broadcastTelemetryService.ts',
    text: `        \`SELECT last_credited_at, intent
           FROM broadcast_viewer_people
          WHERE occurrence_id = :occ AND enrollment_id = :enr
          FOR UPDATE\`,`,
  },
  {
    key: 'audience',
    what: 'the audience read, inside readLiveAudience',
    file: 'backend/src/services/broadcast/broadcastTelemetryService.ts',
    text: `    \`SELECT p.intent, p.access_mode, COUNT(DISTINCT s.enrollment_id)::text AS people
       FROM broadcast_viewer_sessions s
       JOIN broadcast_viewer_people p
         ON p.occurrence_id = s.occurrence_id AND p.enrollment_id = s.enrollment_id
      WHERE s.occurrence_id = :occ
        AND s.last_beat_at >= :cut`,
  },
  {
    key: 'unavailable',
    what: 'the collection-failure branch of GET /audience',
    file: 'backend/src/controllers/broadcastController.ts',
    text: `    res.status(503).json({
      error: 'MeasurementUnavailable',
      available: false,
      reason: 'collection_unavailable',
    });`,
  },
];

/**
 * The baseline, including the Postgres tier. The anchor-race suite is `DATABASE_URL`-gated and
 * SKIPS without one, so a baseline taken the ordinary way reports five suites and silently
 * leaves out the only behavioral evidence about the lock. This baseline has none skipped.
 */
const BASELINE = {
  green: true,
  suites: 6,
  tests: 157,
  pending: 0,
  seconds: 93.5,
  dbTier: 'postgres:16-alpine in a throwaway container on port 55438, from the one-line docker '
    + 'run in the suite\'s own docblock. Without DATABASE_URL the run is 5 suites and 152 tests, '
    + 'with 5 skipped — and the skipped five are the ones that touch a real lock.',
};

const MUTATIONS = [
  {
    key: 'anchor-rekeyed',
    name: 'ANCHOR RE-KEYED TO THE TAB',
    required: true,
    region: 'anchor',
    diff: '-  WHERE occurrence_id = :occ AND enrollment_id = :enr\n'
      + '+  WHERE occurrence_id = :occ AND session_id = :sess',
    means: 'The credit anchor is read per TAB rather than per PERSON, so two tabs each credit '
      + 'the full gap and every watch figure doubles for anyone with the player open twice. '
      + 'This is the reversal the ticket names.',
    killed: true,
    failed: 5,
    names: [
      'reads the anchor keyed on the PERSON, not on the tab',
      'TWO TABS beating in the same instant credit the ten seconds ONCE',
      'THREE TABS credit the same ten seconds as one tab - the documented claim',
      'a PAUSED beat does not advance the anchor, so the viewer keeps what they earned',
      'on a FIRST beat the lock holds nothing - safe only because a null anchor credits 0',
    ],
    note: 'Four of the five are in the Postgres tier. **One** assertion in the locally-runnable '
      + 'suites notices this at all.',
  },
  {
    key: 'lock-dropped',
    name: 'THE LOCK DROPPED',
    region: 'anchor',
    diff: '-  WHERE occurrence_id = :occ AND enrollment_id = :enr\n'
      + '-  FOR UPDATE`,\n'
      + '+  WHERE occurrence_id = :occ AND enrollment_id = :enr`,',
    means: 'Two tabs beating in the same millisecond both read the same stale anchor and both '
      + 'credit the full gap. The dedup rule survives in the comments and fails in practice.',
    killed: true,
    failed: 6,
    names: [
      'TWO TABS FOR ONE PERSON CREDIT ONCE',
      'serialises concurrent tabs with FOR UPDATE, or both would read the same stale anchor', // spelling-exempt
      'caps a long gap, so a laptop asleep for an hour does not bank an hour of watching',
      'a stored deliberate survives a later auto beat',
      'TWO TABS beating in the same instant credit the ten seconds ONCE',
      'THREE TABS credit the same ten seconds as one tab - the documented claim',
    ],
    note: 'Six with Postgres, **four without** — and three of those four are the mock '
      + 'withdrawing its own fixture rather than evidence about the lock. See the findings.',
  },
  {
    key: 'tabs-as-people',
    name: 'TABS COUNTED AS PEOPLE',
    region: 'audience',
    diff: '- COUNT(DISTINCT s.enrollment_id)::text AS people\n'
      + '+ COUNT(*)::text AS people',
    means: 'The audience read counts rows instead of people, so one viewer with two tabs open '
      + 'is reported to the producer as two audience members — the precise thing the service '
      + 'comment says COUNT(DISTINCT) exists to prevent.',
    killed: true,
    failed: 1,
    names: ['counts DISTINCT enrollment_id, never rows'],
    note: 'One assertion, in one file.',
  },
  {
    key: 'window-dropped',
    name: 'THE FRESHNESS WINDOW DROPPED',
    region: 'audience',
    diff: '-   AND s.last_beat_at >= :cut',
    means: 'Every tab that ever beat counts forever, so the number only rises and a finished '
      + 'class still shows an audience. It also stops being the query idx_bvs_active was built '
      + 'to serve, which ties this reversal directly to criterion 5.',
    killed: true,
    failed: 1,
    names: ['filters on last_beat_at in SQL, which is what the index exists to serve'],
    note: 'One assertion — and its neighbor in the same describe block, named for the same '
      + 'window, passes with the window gone. See the findings.',
  },
  {
    key: 'staff-counted',
    name: 'STAFF AND TEST ACCOUNTS COUNTED',
    region: 'audience',
    diff: '-   AND (:diagnostic OR (p.is_staff = FALSE AND p.is_test = FALSE))',
    means: 'The producer counts themselves and every test account inflates a figure that '
      + 'business decisions are made on.',
    killed: true,
    failed: 1,
    names: ['excludes them by default'],
    note: 'One assertion. A second test failed on the first batch run and passes in isolation; '
      + 'it is a flake, recorded in the findings rather than counted here.',
  },
  {
    key: 'empty-room',
    name: 'A COLLECTION FAILURE RENDERS AS AN EMPTY ROOM',
    required: true,
    region: 'unavailable',
    diff: '-  res.status(503).json({ error: \'MeasurementUnavailable\', available: false, … })\n'
      + '+  res.json({ available: true, watching_now: 0, deliberate: 0, auto: 0, by_mode: {} })',
    means: 'Collection is down and the producer is shown that nobody watched. A verdict on us, '
      + 'rendered as a verdict on the broadcast — and a producer who believes it stops a class '
      + 'people are actually watching. This is the second reversal the ticket names.',
    killed: true,
    failed: 1,
    names: ['a COLLECTION FAILURE carries no count field at all - not zero, not null, absent'],
  },
  {
    key: 'smuggled-zero',
    name: 'A ZERO SMUGGLED INTO THE 503',
    region: 'unavailable',
    diff: '   res.status(503).json({ error: \'MeasurementUnavailable\', available: false,\n'
      + '     reason: \'collection_unavailable\',\n'
      + '+    watching_now: 0,\n'
      + '   });',
    means: 'The status code and the flag stay correct and a renderable zero is added beside '
      + 'them. Every assertion about the 503, the error name and the reason still passes. Only '
      + 'a test that requires the count field to be ABSENT can tell this from the real thing.',
    killed: true,
    failed: 1,
    names: ['a COLLECTION FAILURE carries no count field at all - not zero, not null, absent'],
    note: 'Killed — because that test asserts absence with `not.toHaveProperty`, not merely the '
      + 'status code. This is the one place in the scope where the contract, rather than its '
      + 'outward shape, is what is tested.',
  },
];

/**
 * The positive control. A record built only on things going red cannot tell a sensitive
 * assertion from a broken one, and here the control is unusually pointed: the requirement is
 * that a real zero and an unknown are different answers, so the control is the test that
 * demands a real zero still be reported.
 */
const CONTROL = {
  name: 'reports a real zero as zero',
  why: 'PASSES under both 503 reversals while the absence assertion dies. So the suite is not '
    + 'merely reacting to a change in that function — it tells a genuine zero apart from a '
    + 'manufactured one, which is the whole requirement. A suite that went red on both would '
    + 'prove only that it noticed an edit.',
  second: 'counts DISTINCT enrollment_id, never rows',
  secondWhy: 'Fails under TABS COUNTED AS PEOPLE and passes under the other six, so the scope '
    + 'localizes a reversal rather than reddening wholesale.',
};

const TOTALS = (() => ({
  mutations: MUTATIONS.length,
  killed: MUTATIONS.filter((m) => m.killed).length,
  survived: MUTATIONS.filter((m) => !m.killed).length,
  required: MUTATIONS.filter((m) => m.required).length,
  distinctTests: [...new Set(MUTATIONS.flatMap((m) => m.names))].length,
  singleTest: MUTATIONS.filter((m) => m.failed === 1).length,
  narrowest: Math.min(...MUTATIONS.map((m) => m.failed)),
}))();

module.exports = { META, ORIGINALS, BASELINE, MUTATIONS, CONTROL, TOTALS };
