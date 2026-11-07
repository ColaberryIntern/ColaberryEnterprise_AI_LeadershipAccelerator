/**
 * l83Data — L8.3 criterion 3: mutation evidence for the replay entitlement filter.
 *
 * THE CRITERION, VERBATIM FROM THE BOARD: "mutation evidence naming the test that fails when the
 * filter is reversed."
 *
 * WHY THIS EXISTS AT ALL. An assertion nobody has watched fail is indistinguishable from a
 * comment. The replay list's headline requirement is that a private class is OMITTED rather than
 * shown-and-refused — shown-and-refused leaks its existence — and that requirement is carried by
 * one four-line function. Until somebody reverses it and watches a named test go red, "it is
 * tested" is a claim about intent.
 *
 * WHY THREE REVERSALS AND NOT ONE. "Reversed" has more than one meaning and a filter can be
 * broken in each, with very different blast radii. The third is the one worth the trouble: it
 * still filters, but on the wrong question, and only two tests in the whole scope notice.
 *
 * Numbers here are TRANSCRIBED FROM A REAL RUN on 2026-11-07, not computed. The record is
 * checked against the test sources: every test named below must exist, or this document is
 * naming evidence that is not there.
 */

const META = {
  ticket: 'L8.3',
  criterion: 3,
  criterionText: 'mutation evidence naming the test that fails when the filter is reversed',
  file: 'docs/broadcast/L8_3_REPLAY_FILTER_MUTATION_RECORD.md',
  ranOn: '2026-11-07',
  /** The function under mutation. */
  target: 'backend/src/services/broadcast/broadcastDiscovery.ts',
  targetFn: 'mayKnowAbout',
  appliedBy: 'backend/src/services/broadcast/broadcastDiscovery.ts (projectDiscovery), called by '
    + 'getReplayBroadcasts in backend/src/controllers/broadcastController.ts',
  reproduce: 'cd backend && node ../node_modules/jest/bin/jest.js '
    + '--testPathPattern="src/(services/broadcast/__tests__/broadcastDiscovery'
    + '|controllers/__tests__/broadcastController|routes/__tests__/broadcastRoutes)"',
  /**
   * The flag is SINGULAR. `--testPathPatterns` is silently ignored by this jest and runs the
   * entire repository instead: 2,388 suites and 45 minutes, which looks like a scoped green run
   * until you read the totals. Recorded here because it is the kind of mistake that makes a
   * scoped claim out of an unscoped run.
   */
  flagNote: '--testPathPattern (singular). The plural form is ignored and runs everything.',
};

/** The shipped filter, verbatim, so a reader can see exactly what was reversed. */
const ORIGINAL = `export function mayKnowAbout(entry: DiscoveryEntry): boolean {
  if (entry.occurrence.access_mode !== 'private') return true;
  return entry.roomEligible;
}`;

/**
 * The baseline. A mutation record against a red or unmeasured baseline proves nothing, so the
 * self-check requires this to be green with a real count.
 */
const BASELINE = {
  green: true,
  suites: 3,
  tests: 101,
  seconds: 23.5,
};

const MUTATIONS = [
  {
    key: 'dropped',
    name: 'DROPPED — the omission is removed entirely',
    body: `export function mayKnowAbout(entry: DiscoveryEntry): boolean {
  return true;
}`,
    means: 'Every private replay becomes visible to everyone, title and all.',
    killed: true,
    failed: 7,
    passed: 94,
    names: [
      'OMITS the whole item — the title never leaves the process',
      'omits it even when the decision somehow says full but the room says no',
      'decides per item, so one private broadcast does not hide a public one',
      'gates only on private',
      'NEVER sends a private title to an ineligible viewer',
      'NEVER sends a private replay title to an ineligible viewer',
      'dates every replay from its OWN class, even when entitlement omitted an earlier one',
    ],
  },
  {
    key: 'inverted',
    name: 'INVERTED — knowable only by someone NOT eligible for the room',
    body: `export function mayKnowAbout(entry: DiscoveryEntry): boolean {
  if (entry.occurrence.access_mode !== 'private') return true;
  return !entry.roomEligible;
}`,
    means: 'Private replays leak to outsiders AND vanish for the cohort they belong to.',
    killed: true,
    failed: 13,
    passed: 88,
    names: [
      'OMITS the whole item — the title never leaves the process',
      'includes it, with the title, for an eligible room member',
      'carries the class session when the broadcast has one, and null (never undefined) when it does not',
      'omits it even when the decision somehow says full but the room says no',
      'decides per item, so one private broadcast does not hide a public one',
      'sends epoch milliseconds, so no client does timezone arithmetic of its own',
      'carries no provider or policy fields — a badge has no business with them',
      'gates only on private',
      'NEVER sends a private title to an ineligible viewer',
      'sends it to an eligible room member',
      'NEVER sends a private replay title to an ineligible viewer',
      'CONTROL: sends that same replay to an eligible room member',
      'dates every replay from its OWN class, even when entitlement omitted an earlier one',
    ],
  },
  {
    key: 'decision',
    name: 'SHOWN-NOT-OMITTED — gated on the access decision rather than on knowability',
    body: `export function mayKnowAbout(entry: DiscoveryEntry): boolean {
  if (entry.occurrence.access_mode !== 'private') return true;
  return entry.decision.grant !== 'denied';
}`,
    means: 'Still filtered, but on the wrong question. A private title reaches any viewer the '
      + 'access decision happens to allow — which is exactly the shown-and-refused behavior the '
      + 'requirement forbids, wearing the shape of a filter.',
    killed: true,
    failed: 2,
    passed: 99,
    names: [
      'omits it even when the decision somehow says full but the room says no',
      'gates only on private',
    ],
  },
];

/**
 * The finding. Recorded because the criterion asks which test fails, and the useful answer
 * turned out to be "not the one you would expect".
 */
const FINDING = {
  headline: 'The replay-specific assertion does not catch the subtle reversal.',
  body: '`NEVER sends a private replay title to an ineligible viewer` — the test that most '
    + 'obviously belongs to this ticket — fails under DROPPED and INVERTED but **passes** under '
    + 'SHOWN-NOT-OMITTED. In that fixture the ineligible viewer is also denied by the access '
    + 'decision, so a filter gated on the decision happens to omit the row for the same reason, '
    + 'and the assertion cannot tell the two rules apart.\n\nWhat actually protects the replay '
    + 'list against that reversal are two tests one level down, in the discovery suite: '
    + '`omits it even when the decision somehow says full but the room says no` — which exists '
    + 'precisely to separate knowability from entitlement — and `gates only on private`. **Those '
    + 'two are the load-bearing assertions for this criterion**, not the one with "replay" in its '
    + 'name.\n\nThat is not a defect to fix. The filter lives in the discovery layer and is '
    + 'correctly tested there. It is a fact about where the protection actually comes from, which '
    + 'is the thing a future reader of this ticket needs and could not have guessed.',
};

/**
 * The positive control, which is what makes the negative mean anything. Named separately because
 * a mutation record that only shows things going red cannot distinguish "the test is sensitive to
 * this change" from "the test is broken".
 */
const CONTROL = {
  name: 'CONTROL: sends that same replay to an eligible room member',
  why: 'Fails under INVERTED and passes under DROPPED — so the suite discriminates direction, '
    + 'not merely change. A record built only on tests going red could not tell a sensitive '
    + 'assertion from a broken one.',
};

const TOTALS = (() => ({
  mutations: MUTATIONS.length,
  killed: MUTATIONS.filter((m) => m.killed).length,
  survived: MUTATIONS.filter((m) => !m.killed).length,
  distinctTests: [...new Set(MUTATIONS.flatMap((m) => m.names))].length,
  narrowest: Math.min(...MUTATIONS.map((m) => m.failed)),
}))();

module.exports = { META, ORIGINAL, BASELINE, MUTATIONS, FINDING, CONTROL, TOTALS };
