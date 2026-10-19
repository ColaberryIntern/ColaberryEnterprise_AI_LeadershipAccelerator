/**
 * M25 data module. The engine, and what it actually did against production.
 *
 * Every distribution figure below is copied from the read-only report's own output, run on the
 * prod backend on 2026-10-17 over 250 Explorer records. Nothing here is estimated.
 */

const MEASURED_ON = '17 Oct 2026';
const CODE = 'M25';
const SLUG = 'M25_SRS_SCORING_ENGINE';
const TITLE = 'SRS scoring engine: pure, deterministic, explainable';
const TICKET = 10411539568;
const RULESET = 'srs-v1-provisional-2026-10-17';

/**
 * THE TAKEAWAY IS NOT "the engine works". It does, and that is the easy half. The distribution is
 * the half worth your attention.
 */
const TAKEAWAY = 'The engine is built, pure and proved. The distribution says the ruleset as '
  + 'weighted does NOT usefully rank this population: 105 of its 172 points come from three '
  + 'factors that are either identical for everyone or zero for everyone, so half the population '
  + 'is separated by about 10 points out of 172. That is a weights-and-population problem, not an '
  + 'engine problem, and it is the decision this run exists to put in front of you.';

const ASKED = 'implement the score as a pure function from the M24 inputs to a number plus a '
  + 'per-factor breakdown, property-test it, mutate per factor, then run it read-only against '
  + 'production and show Ali the distribution before anything is surfaced.';
const DELIVERED = 'all of it. 54 tests, every factor mutation-proved twice, and a 250-person '
  + 'read-only run whose result changes what should happen next.';

/** What the run measured. Straight from the report's output. */
const RUN = {
  population: 250,
  unreadable: 0,
  seconds: 116,
  maxPossible: 172,
  min: 40,
  p25: 42.4,
  median: 44.63,
  p75: 52.5,
  p95: 69.08,
  max: 91.1,
  mean: 48.98,
  allZero: 0,
  coverageMean: 84,
  coverageMin: 73,
  coverageMax: 100,
};

/** The score histogram, ten buckets across the ruleset's range. Empty buckets kept. */
const HISTOGRAM = [
  ['0-17', 0], ['17-34', 0], ['34-52', 187], ['52-69', 50], ['69-86', 11],
  ['86-103', 2], ['103-120', 0], ['120-138', 0], ['138-155', 0], ['155-172', 0],
];

/** Per factor: how often there was evidence at all, and what it contributed when there was. */
const FACTORS = [
  { key: 'enrolmentStarted', max: 40, presentPct: 100, meanWhenPresent: 40.00, verdict: 'CONSTANT' },
  { key: 'appointmentBooked', max: 35, presentPct: 100, meanWhenPresent: 0.00, verdict: 'ALWAYS ZERO' },
  { key: 'humanReply', max: 30, presentPct: 100, meanWhenPresent: 0.00, verdict: 'ALWAYS ZERO' },
  { key: 'intent', max: 20, presentPct: 13, meanWhenPresent: 11.81, verdict: 'discriminates, rarely present' },
  { key: 'explorerBands', max: 12, presentPct: 94, meanWhenPresent: 0.27, verdict: 'present, near zero' },
  { key: 'priorOutcome', max: 10, presentPct: 100, meanWhenPresent: 1.72, verdict: 'weak' },
  { key: 'tenure', max: 5, presentPct: 100, meanWhenPresent: 3.34, verdict: 'weak' },
  { key: 'consent', max: 5, presentPct: 100, meanWhenPresent: 1.16, verdict: 'weak' },
  { key: 'siteSessions', max: 8, presentPct: 16, meanWhenPresent: 3.10, verdict: 'rarely present' },
  { key: 'pageEvents', max: 7, presentPct: 100, meanWhenPresent: 0.47, verdict: 'present, near zero' },
  { key: 'friction', max: 0, presentPct: 100, meanWhenPresent: 0.00, verdict: 'flag only, by DECISION 4' },
];

/** The arithmetic behind the takeaway, so it can be checked rather than believed. */
const DEAD_WEIGHT = {
  points: 40 + 35 + 30,
  of: RUN.maxPossible,
  factors: ['enrolmentStarted', 'appointmentBooked', 'humanReply'],
  iqrPoints: Math.round((RUN.p75 - RUN.p25) * 100) / 100,
};

/** What the engine guarantees, each one tested. */
const GUARANTEES = [
  ['Deterministic', 'computedAt is an input, not a clock reading. 200 seeded cases give identical results twice.'],
  ['Attributable', 'the total equals the sum of its named factors, with the passive band capped. Checked over 200 seeded cases.'],
  ['Absent is not zero', 'a factor with no evidence reports state absent with a reason, contributes nothing, and is kept OUT of the denominator.'],
  ['Browsing cannot buy commitment', 'the passive band is capped AS A BAND, and the ruleset asserts that cap is below the smallest commitment factor.'],
  ['Friction never subtracts', 'DECISION 4. It is reported as a flag; mutating it to subtract kills a named test.'],
  ['Versioned', 'every score carries the ruleset version, so two rulesets cannot be silently compared.'],
  ['No AI in the number', 'the engine is arithmetic over a table. There is no model call anywhere in it.'],
];

const MUTATION = {
  factors: 11,
  passes: 2,
  how: 'each factor forced to 0 (kills the absence contract) and each factor halved (kills that '
    + "factor's own named test). Friction, whose max is 0, was mutated to subtract instead and "
    + 'kills the DECISION 4 test.',
  tests: 54,
};

/** What the run does NOT settle. */
const NOT_ESTABLISHED = [
  'That the weights are right. They are provisional by DECISION 2 and this run is the first '
    + 'evidence that they are not yet useful.',
  'That a score over this population is the right question at all. Everyone in it has already '
    + 'enrolled in the free program, which is why the enrollment factor is constant.',
  'That recency would fix it. It is the obvious candidate and it is still EXCLUDED by the M24 '
    + 'contract, because lastActivity varies by caller.',
  'Nothing was persisted or surfaced. No score is stored, no queue is ordered, nothing was sent.',
];

/** The decision this artifact exists to force. */
const DECISION = 'The weights are yours to approve before this goes anywhere near a rep, and the '
  + 'honest recommendation is NOT to approve them as they stand. Either reweight so the score '
  + 'ranks on what varies, or change the population it scores, or accept that ranking needs the '
  + 'recency input that is still excluded. M26 should not surface a score that cannot order.';

module.exports = {
  MEASURED_ON, CODE, SLUG, TITLE, TICKET, RULESET, TAKEAWAY, ASKED, DELIVERED,
  RUN, HISTOGRAM, FACTORS, DEAD_WEIGHT, GUARANTEES, MUTATION, NOT_ESTABLISHED, DECISION,
};
