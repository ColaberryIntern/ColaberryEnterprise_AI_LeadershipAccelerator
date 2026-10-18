/**
 * M25.1 data module. The measurement that replaced the guess, and what it unblocked.
 *
 * Both runs were read-only against production over the same 250 Explorer records, on 2026-10-18.
 * Every share below is copied from the report's own output.
 */

const MEASURED_ON = '18 Oct 2026';
const CODE = 'M25.1';
const SLUG = 'M25_1_MEASURE_THEN_UNBLOCK_RECENCY';
const TITLE = 'Measure what actually ranks, then unblock recency';
const TICKET = 10416610124;

const TAKEAWAY = 'The score could not order anybody, and the fix was not new weights. Measuring '
  + 'showed the ordering was carried 54.3% by a factor present for only 13% of people, so the '
  + 'queue was sorted mostly by whether we happened to have an intent score. What was missing was '
  + 'SIGNAL. Unblocking recency supplied it: recency now carries 54.6% of the ordering, present '
  + 'for everyone, across 162 distinct values.';

const ASKED = 'answer M25\'s weights question and act on the answer.';
const DELIVERED = 'a measurement that says which factors can rank at all, and the one change the '
  + 'measurement pointed at.';

/** A factor's share of the score's variance IS its share of the ranking. */
const METHOD = 'A factor that takes the same value for every person has zero variance and '
  + 'therefore carries none of the ordering, whatever it is worth. So variance share is ranking '
  + 'share. It needs no opinion, and it turns "this weight is doing nothing" from an argument '
  + 'into a number. Absent values are EXCLUDED from the statistics rather than counted as zero, '
  + 'because counting them manufactures variance out of ignorance and makes a factor look like a '
  + 'ranker when all it separates is the known from the unknown.';

/** Ranking share, before and after the recency unblock. Null = the factor did not exist yet. */
const SHARES = [
  { key: 'recency', before: null, after: 54.6, note: 'ranks, 162 distinct values, present for all' },
  { key: 'intent', before: 54.3, after: 24.7, note: 'present for only 13% of people' },
  { key: 'priorOutcome', before: 21.2, after: 9.7, note: 'ranks, 2 distinct values' },
  { key: 'siteSessions', before: 9.2, after: 4.2, note: 'present for 15%' },
  { key: 'consent', before: 6.6, after: 3.0, note: 'ranks, 2 distinct values' },
  { key: 'tenure', before: 4.5, after: 2.1, note: 'ranks, 78 distinct values' },
  { key: 'pageEvents', before: 3.8, after: 1.7, note: 'ranks' },
  { key: 'explorerBands', before: 0.3, after: 0.1, note: 'ranks, but almost no spread' },
  { key: 'enrolmentStarted', before: 0.0, after: 0.0, note: 'CONSTANT - every Explorer has one' },
  { key: 'appointmentBooked', before: 0.0, after: 0.0, note: 'ALWAYS ZERO - nobody has booked' },
  { key: 'humanReply', before: 0.0, after: 0.0, note: 'ALWAYS ZERO - nobody has replied' },
];

const DEAD = {
  beforePoints: 105, beforeTotal: 172,
  afterPoints: 105, afterTotal: 197,
};

const POPULATION = 250;

/** How recency was unblocked without widening anyone's permissions. */
const RECENCY_FIX = {
  defect: 'journey.lastActivity is the newest event among the domains the CALLER was permitted, '
    + 'so two readers saw a different last activity for the same person. An input that varies by '
    + 'viewer breaks determinism at the input rather than in the arithmetic.',
  notTheFix: 'Widening permissions so everyone sees every domain. That would trade a determinism '
    + 'problem for a disclosure one.',
  theFix: 'timelineDomains already records which domains a read covered, so the DATA declares its '
    + 'own completeness. Recency is scored only when all six domains are present; a partial read '
    + 'reports it ABSENT, which is true and which the engine already knows how to handle.',
  guard: 'ALL_EVENT_DOMAINS is derived from the domain map rather than written out again, so a '
    + 'seventh domain cannot be added in one place and forgotten in the other.',
};

/** Stated plainly, because the ruleset's own decision list says something stricter. */
const NOT_DECISION_5 = 'The ruleset gains a recency factor at 25 points and bumps to v2. This is '
  + 'NOT DECISION 5, which wants recency as a per-component half-life so an old high-commitment '
  + 'act and a recent page view stay distinguishable. What shipped is a recency SIGNAL scored as '
  + 'its own factor: simpler, testable today, and different. The per-component decay is unbuilt.';

/** Recorded because it cost real time and will happen again. */
const MERGE_THAT_LIED = 'PR #3196 reported MERGED while the recency commit never reached main. '
  + 'GitHub never advanced that PR\'s head, so its green checks described the PREVIOUS commit and '
  + 'the merge carried the measurement without the fix. It was caught by checking main\'s CONTENT '
  + 'rather than the merge badge - "recency" appeared zero times in main\'s ruleset - and '
  + 'recovered by cherry-picking onto current main in PR #3204. A PR reading MERGED is not '
  + 'evidence that the code is on main.';

const VERIFICATION = [
  ['the salesReadiness and adminOs suites', '436 passed across 26 suites'],
  ['new discrimination tests', '12, built from scores the real engine produced'],
  ['absent-is-not-variance', 'pinned with a control, so the measure cannot be gamed by ignorance'],
  ['scoped tsc, real test-program options', 'exit 0'],
  ['the M24 contract binding test', 'forced the headline to follow the table: twelve of thirteen'],
  ['citation gate', 'citations OK, no drift'],
  ['both production runs', 'read-only - no score persisted, no row updated, nothing sent'],
];

const NOT_ESTABLISHED = [
  'That the weights are now right. The measurement says which factors CAN rank; what they should '
    + 'be worth is a judgement about what readiness means, and that is still Ali\'s.',
  'That the score is ready to surface. M26 is the surface, and it is now unblocked in the sense '
    + 'that the ordering is real, not in the sense that the thresholds are calibrated.',
  'That the remaining dead weight is a defect. 105 points sit in factors that are population '
    + 'facts: every Explorer has an enrolment, and none has booked a call or replied.',
  'That recency decays contribution the way DECISION 5 asks. It does not.',
];

module.exports = {
  MEASURED_ON, CODE, SLUG, TITLE, TICKET, TAKEAWAY, ASKED, DELIVERED, METHOD,
  SHARES, DEAD, POPULATION, RECENCY_FIX, NOT_DECISION_5, MERGE_THAT_LIED,
  VERIFICATION, NOT_ESTABLISHED,
};
