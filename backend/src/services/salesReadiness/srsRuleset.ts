/**
 * M25 - the Sales Readiness Score ruleset. Weights and shape only; no arithmetic, no I/O.
 *
 * THE WEIGHTS ARE PROVISIONAL AND THE FILE SAYS SO IN THE DATA, not only in a comment. DECISION 2
 * of SALES_READINESS_SCORE_CONTRACT.md: a score computed under one ruleset is never compared with
 * one computed under another without the version being visible, and no threshold is calibrated
 * because nothing has yet linked a score at handoff time to a conversion. These numbers are a
 * starting hypothesis for Ali to move, not a finding.
 *
 * WHY A TABLE RATHER THAN CONSTANTS IN THE ENGINE. Every point the score awards has to be
 * attributable to a named factor (M25's acceptance criteria), which means the factor list is the
 * contract and the engine is just arithmetic over it. Adding a factor here and forgetting to
 * score it is caught by a test; burying a weight in an `if` is not.
 */

/** Bump on ANY change to weights, caps or the factor set. Stored beside every score. */
export const RULESET_VERSION = 'srs-v2-provisional-2026-10-18';

export type Band = 'commitment' | 'passive' | 'context';

export interface FactorDef {
  /** Stable key. Appears in the breakdown and in stored score history. */
  key: string;
  /** What a human reads in the UI. */
  label: string;
  band: Band;
  /** The most this factor can contribute. The engine never exceeds it. */
  max: number;
  /**
   * The M16 evidence group this factor reads. Ties every point back to evidence the M24 contract
   * classified, so a factor cannot quietly feed on an input that contract marked EXCLUDED.
   */
  evidenceGroup: string;
  /** Stated once, here, so the breakdown can explain an absence rather than print "null". */
  absentMeans: string;
}

/**
 * DECISION 3: passive signals contribute to a CAPPED band; commitment signals contribute outside
 * it. The cap is what makes "no quantity of page views reaches the floor one enrolment-form start
 * reaches" true by construction rather than by hoping the weights stay sensible.
 */
export const PASSIVE_CAP = 15;

export const FACTORS: readonly FactorDef[] = [
  // ── Commitment. Deliberate, high-intent acts. ────────────────────────────
  {
    key: 'enrolmentStarted',
    label: 'Started an enrolment',
    band: 'commitment',
    max: 40,
    evidenceGroup: 'journey',
    absentMeans: 'the enrolment count was withheld or never looked up for this caller',
  },
  {
    key: 'appointmentBooked',
    label: 'Booked or requested a call',
    band: 'commitment',
    max: 35,
    evidenceGroup: 'appointments',
    absentMeans: 'there was no lead record to look for appointments against',
  },
  {
    key: 'humanReply',
    label: 'Replied to a human',
    band: 'commitment',
    max: 30,
    evidenceGroup: 'communications',
    absentMeans: 'no communications were loaded for this person',
  },

  // ── Context. Measured signals that are not acts of commitment. ───────────
  /**
   * NOT DECISION 5. That decision wants recency expressed as a per-component half-life, so an
   * old high-commitment act and a recent page view stay distinguishable. This is a recency
   * SIGNAL scored as its own factor: simpler, testable today, and honest about what it is. The
   * per-component decay remains unimplemented and is a separate piece of work.
   */
  {
    key: 'recency',
    label: 'How recently they did anything',
    band: 'context',
    max: 25,
    evidenceGroup: 'timeline',
    absentMeans: 'the timeline was read in part, or there is no activity to date, so recency '
      + 'would be a fact about the caller rather than about the person',
  },
  {
    key: 'intent',
    label: 'Peak intent score',
    band: 'context',
    max: 20,
    evidenceGroup: 'journey',
    absentMeans: 'intent is sales data and was withheld from this caller, or never recorded',
  },
  {
    key: 'explorerBands',
    label: 'Explorer engagement and intent',
    band: 'context',
    max: 12,
    evidenceGroup: 'explorerScore',
    absentMeans: 'this person has no Explorer score snapshot',
  },
  {
    key: 'priorOutcome',
    label: 'Prior Colaberry history',
    band: 'context',
    max: 10,
    evidenceGroup: 'history',
    absentMeans: 'the prior-history system was unreachable or not configured',
  },
  {
    key: 'tenure',
    label: 'How long we have known them',
    band: 'context',
    max: 5,
    evidenceGroup: 'journey',
    absentMeans: 'there is no first-touch date to measure from',
  },
  {
    key: 'consent',
    label: 'Consent to contact recorded',
    band: 'context',
    max: 5,
    evidenceGroup: 'acquisition',
    absentMeans: 'consent has never been recorded either way',
  },

  // ── Passive. Browsing. Capped as a band, see PASSIVE_CAP. ────────────────
  {
    key: 'siteSessions',
    label: 'Site sessions',
    band: 'passive',
    max: 8,
    evidenceGroup: 'engagement',
    absentMeans: 'this person has never been tracked as a visitor',
  },
  {
    key: 'pageEvents',
    label: 'Page views',
    band: 'passive',
    max: 7,
    evidenceGroup: 'journey',
    absentMeans: 'there is no lead record, so page events were never counted',
  },

  // ── Friction. DECISION 4: it does NOT subtract. ──────────────────────────
  {
    key: 'friction',
    label: 'Payment friction',
    band: 'context',
    max: 0,
    evidenceGroup: 'billingDetail',
    absentMeans: 'no billing detail was loaded for this person',
  },
];

/**
 * DECISION 3, expressed as a number the engine and the tests can both check: the smallest
 * commitment factor must outrank the ENTIRE passive band, or browsing could accumulate into
 * commitment and the rule would be decoration.
 */
export const SMALLEST_COMMITMENT = Math.min(
  ...FACTORS.filter((f) => f.band === 'commitment').map((f) => f.max),
);

/** The most any person could score: every factor at its max, passive band capped. */
export const MAX_POSSIBLE = FACTORS
  .filter((f) => f.band !== 'passive')
  .reduce((sum, f) => sum + f.max, 0) + PASSIVE_CAP;

export const factorByKey = (key: string): FactorDef => {
  const f = FACTORS.find((x) => x.key === key);
  if (!f) throw new Error(`unknown SRS factor: ${key}`);
  return f;
};
