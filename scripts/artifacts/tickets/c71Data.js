/**
 * C7.1 - Lighthouse Customer Selection Standard. THE single source for both PDFs.
 *
 * ## What makes this hard, stated by the ticket
 *
 * "Making the criteria so strict that nothing qualifies, or so loose that everything does."
 * Both failures are arithmetic, so both are checked arithmetically at build time: the
 * weights must sum to 100, the thresholds must be ordered and inside the achievable range,
 * and the standard is run against four worked examples to prove it both accepts and
 * declines.
 *
 * ## The criterion that decides the rest
 *
 * Permission to measure outcomes is non-waivable, and it is non-waivable for a reason
 * specific to this company rather than as general good practice. The entire differentiator
 * is commit-level proof of what a named person built, and C5.0 shipped on 17 October so a
 * stranger can now check it. A lighthouse customer who will not let us measure and publish
 * produces revenue and no reference, which is the one thing the first five exist to produce.
 */

const AS_OF = '18 October 2026';

const HEADLINE = 'Three criteria can never be waived, and the sharpest is permission to '
  + 'measure. A customer who will not let us publish the outcome produces revenue and no '
  + 'reference, and the first five exist to produce references.';

const SO_WHAT = [
  'The first five customers are chosen, not accepted. A bad first customer costs more than '
    + 'no customer, because the reference story is the asset and a bad one cannot be '
    + 'returned. So this scorecard is written to be usable in the decline direction, which '
    + 'is the acceptance criterion most selection standards quietly fail.',
  'Three criteria are non-waivable and the rest are weighted. An opportunity that fails any '
    + 'non-waivable criterion is declined at any score, which means a 90-point deal with no '
    + 'executive sponsor is still a no. That is the whole point of separating gates from '
    + 'weights, rather than letting a high total paper over a missing fundamental.',
  'The thresholds are set so that a plausible good deal passes and a plausible bad one does '
    + 'not. Four worked examples are scored in the document, including one that scores well '
    + 'and is still declined on a gate, because a standard nobody can fail is not a standard.',
];

/* ------------------------------------------------------------------ *
 * THE GATES, which are pass/fail and never weighted
 * ------------------------------------------------------------------ */

const GATES = [
  {
    n: 1, name: 'Permission to measure and publish the outcome',
    test: 'Written agreement, before signature, that we may measure the outcome and publish '
      + 'a named reference. A logo-only permission is a fail.',
    why: 'The differentiator is commit-level proof of what each person built, and since '
      + '17 October 2026 a stranger can check it on a public page. A customer who will not '
      + 'let us publish produces revenue and no reference. The first five exist to produce '
      + 'references, so this is the criterion the whole program rests on.',
  },
  {
    n: 2, name: 'A named executive sponsor who will meet us monthly',
    test: 'A named individual with budget authority, who has agreed to a monthly check-in. '
      + 'A sponsor who delegates the check-in at the outset is a fail.',
    why: 'Every pilot that dies, dies at the sponsor. Without one the engagement survives '
      + 'only while nobody is busy, and the reference needs somebody willing to be quoted.',
  },
  {
    n: 3, name: 'Committed budget in this fiscal period',
    test: 'Budget identified and confirmed by the sponsor for the period the work runs in. '
      + '"We will find it" is a fail.',
    why: 'C7.0 found that in Texas a state consulting contract over $15,000 can be void '
      + 'without a prior finding of fact, and that competitive bidding bites above $10,000. '
      + 'Budget that is not yet real is also budget whose procurement path nobody has '
      + 'checked, and that is where a deal becomes unenforceable after delivery.',
  },
];

/* ------------------------------------------------------------------ *
 * THE WEIGHTED CRITERIA. Weights sum to 100 and the build checks it.
 * ------------------------------------------------------------------ */

const SCALE = [
  { v: 0, label: 'Absent' },
  { v: 1, label: 'Asserted but unevidenced' },
  { v: 2, label: 'Evidenced' },
  { v: 3, label: 'Evidenced and unusually strong' },
];

const CRITERIA = [
  {
    n: 1, name: 'Real business problem, named by the business', weight: 25,
    anchor: '3 means a specific named process with a cost attached, raised by the operator '
      + 'rather than by us. 0 means "we want to do something with AI".',
  },
  {
    n: 2, name: 'Participants identified by name', weight: 20,
    anchor: '3 means a named roster with manager sign-off. 1 means a headcount and a '
      + 'department. 0 means a number.',
  },
  {
    n: 3, name: 'Reference potential', weight: 20,
    anchor: '3 means a recognizable name in a segment we are targeting, with a comms team '
      + 'that has approved references before. 0 means a buyer who has never done one.',
  },
  {
    n: 4, name: 'Speed to start', weight: 15,
    anchor: '3 means a start date inside 30 days with no procurement blocker found. 0 means '
      + 'an unscheduled start or an unmapped procurement path.',
  },
  {
    n: 5, name: 'Segment fit against the approved ICP', weight: 10,
    anchor: '3 means the C2.5 beachhead, higher education through a self-funded continuing '
      + 'education unit. 2 means another approved segment. 0 means outside all five.',
  },
  {
    n: 6, name: 'Expansion beyond the first cohort', weight: 10,
    anchor: '3 means a second cohort already scoped and budgeted. 0 means a one-off with no '
      + 'stated path to a second.',
  },
];

/** 0 to 3 on each criterion, weighted, normalized to 100. */
const MAX_RAW = 3;

const THRESHOLDS = [
  { min: 75, verdict: 'PURSUE', color: '#2f7d32',
    action: 'Proceed to proposal. This is a lighthouse candidate.' },
  { min: 55, verdict: 'PURSUE WITH A NAMED FIX', color: '#b26a00',
    action: 'Proceed only with the weakest criterion named, owned and given a date. Record '
      + 'which one, so the pattern is visible if it recurs across deals.' },
  { min: 0, verdict: 'DECLINE', color: '#b3261e',
    action: 'Decline, and say why in one sentence. A decline that is not recorded teaches '
      + 'nobody anything.' },
];

/* ------------------------------------------------------------------ *
 * WORKED EXAMPLES. The standard has to both accept and decline.
 * ------------------------------------------------------------------ */

const EXAMPLES = [
  {
    name: 'A continuing education dean, self-funded, 40 learners',
    gates: [true, true, true],
    scores: [3, 3, 2, 3, 3, 2],
    note: 'The C2.5 beachhead shape. Passes every gate and scores well.',
  },
  {
    name: 'A large enterprise, enthusiastic sponsor, legal will not allow a named reference',
    gates: [false, true, true],
    scores: [3, 3, 3, 2, 2, 3],
    note: 'THE IMPORTANT ONE. Scores near the top and is declined anyway, on gate 1. This '
      + 'is the case the standard exists for.',
  },
  {
    name: 'A workforce board, budget identified, roster named, start in Q2',
    gates: [true, true, true],
    scores: [2, 2, 2, 1, 2, 1],
    note: 'Passes the gates and lands in the middle band. Pursue only with the slow start '
      + 'named as the weak criterion, owned and dated.',
  },
  {
    name: 'An inbound enquiry wanting "an AI strategy workshop"',
    gates: [false, false, false],
    scores: [0, 0, 1, 1, 1, 0],
    note: 'Fails all three gates and scores badly. Decline in one sentence.',
  },
];

/** Normalized score out of 100. Exported so the document and the tests agree. */
function scoreOf(scores) {
  const total = CRITERIA.reduce((sum, c, i) => sum + (scores[i] * c.weight), 0);
  return Math.round(total / MAX_RAW);
}

function verdictOf(example) {
  if (example.gates.some((g) => !g)) return THRESHOLDS[THRESHOLDS.length - 1];
  const s = scoreOf(example.scores);
  return THRESHOLDS.find((t) => s >= t.min);
}

const LIMITS = [
  'Finding the customers is out of scope and lives in groups 06 and 09. This governs which '
    + 'opportunities we accept, not where they come from.',
  'The weights are a judgement and are meant to be argued with. The gates are not, and '
    + 'changing one of those is a decision rather than a tuning exercise.',
  'The middle band depends on somebody actually recording which criterion was weak. If that '
    + 'is not recorded, the band becomes a way of saying yes to everything with extra steps.',
  'Nothing here has been run against a real opportunity yet. The ticket’s own success '
    + 'metric is that we decline at least one poor-fit deal because of this document, and '
    + 'that has not happened.',
];

/* ------------------------------------------------------------------ *
 * ASSERTIONS
 * ------------------------------------------------------------------ */

/** "Weighted and thresholded", checked as arithmetic rather than asserted in prose. */
function assertWeightsAndThresholds() {
  const sum = CRITERIA.reduce((a, c) => a + c.weight, 0);
  if (sum !== 100) throw new Error(`C7.1: weights sum to ${sum}, not 100`);
  const mins = THRESHOLDS.map((t) => t.min);
  for (let i = 1; i < mins.length; i += 1) {
    if (mins[i] >= mins[i - 1]) throw new Error('C7.1: thresholds are not strictly descending');
  }
  const best = scoreOf(CRITERIA.map(() => MAX_RAW));
  const worst = scoreOf(CRITERIA.map(() => 0));
  if (best !== 100 || worst !== 0) {
    throw new Error(`C7.1: the scale does not span 0 to 100 (got ${worst} to ${best})`);
  }
  if (THRESHOLDS[0].min >= best) {
    throw new Error('C7.1: the top threshold is unreachable, so nothing could ever qualify');
  }
  return { sum, best, worst };
}

/** "Non-waivable criteria named", and they must be gates rather than heavy weights. */
function assertGatesAreNamed() {
  if (GATES.length < 1) throw new Error('C7.1: no non-waivable criteria named');
  for (const g of GATES) {
    if (!g.test || !g.why) throw new Error(`C7.1: gate "${g.name}" has no test or no reason`);
    if (!/fail/i.test(g.test)) {
      throw new Error(`C7.1: gate "${g.name}" does not say what a fail looks like`);
    }
  }
  return GATES.length;
}

/**
 * "Usable to decline a deal, not only to accept one."
 *
 * The real test is not that a decline is possible but that a HIGH-SCORING deal can be
 * declined, because that is the case a scorecard normally fails. One worked example must
 * score above the top threshold and still be declined on a gate.
 */
function assertUsableToDecline() {
  const declined = EXAMPLES.filter((e) => verdictOf(e).verdict === 'DECLINE');
  if (!declined.length) throw new Error('C7.1: no worked example is declined');
  const accepted = EXAMPLES.filter((e) => verdictOf(e).verdict === 'PURSUE');
  if (!accepted.length) {
    throw new Error('C7.1: nothing qualifies, which is the "so strict nothing passes" failure');
  }
  const highButDeclined = EXAMPLES.find(
    (e) => e.gates.some((g) => !g) && scoreOf(e.scores) >= THRESHOLDS[0].min,
  );
  if (!highButDeclined) {
    throw new Error('C7.1: no example scores well and is still declined on a gate, so the '
      + 'gates are not demonstrably doing any work');
  }
  return { declined: declined.length, accepted: accepted.length };
}

/**
 * Neither so loose that everything passes nor so strict that nothing does, AND every band
 * is demonstrated.
 *
 * The middle band is the one that rots: it is where a reader puts anything they like unless
 * a worked example shows what belongs there. So every band must be exercised by at least
 * one example, not merely be reachable in principle.
 */
function assertNotDegenerate() {
  const verdicts = EXAMPLES.map((e) => verdictOf(e).verdict);
  const seen = new Set(verdicts);
  if (seen.size < 2) throw new Error('C7.1: every worked example lands on the same verdict');
  const missing = THRESHOLDS.map((t) => t.verdict).filter((v) => !seen.has(v));
  if (missing.length) {
    throw new Error('C7.1: no worked example demonstrates: ' + missing.join(', '));
  }
  return seen.size;
}

module.exports = {
  AS_OF, HEADLINE, SO_WHAT, GATES, SCALE, CRITERIA, THRESHOLDS, EXAMPLES, MAX_RAW, LIMITS,
  scoreOf, verdictOf,
  assertWeightsAndThresholds, assertGatesAreNamed, assertUsableToDecline, assertNotDegenerate,
};
