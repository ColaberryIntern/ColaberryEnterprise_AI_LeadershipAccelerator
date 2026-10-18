/**
 * M25 - the Sales Readiness Score itself: a pure function from measured inputs to a number and a
 * per-factor breakdown.
 *
 * PURE MEANS PURE. No I/O, no database, no clock, no randomness, and no AI anywhere near the
 * number (DECISION 1). `computedAt` is passed IN rather than read from the clock, because a
 * function that reads the time cannot give the same answer twice and M25's first acceptance
 * criterion is that it does.
 *
 * ABSENCE IS THE WHOLE DESIGN. Every input is nullable, and null is never 0. A factor with no
 * evidence reports `state: 'absent'` with the reason from the ruleset, contributes nothing, and
 * is excluded from the denominator. That last part matters more than it looks: if absent factors
 * stayed in the denominator, a person we know little about would score low for being unknown,
 * which is the same defect M24.1 to M24.3 just fixed, reintroduced one level up.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO:
 *  - It does not normalise the total into a percentage. A person with one factor scored at full
 *    marks is not "100% ready"; normalising would invent confidence out of thin evidence. The
 *    raw total is the score, and `coverage` is reported beside it so a low score caused by
 *    absence is visible rather than silent.
 *  - It does not filter anyone out. DECISION 6 makes converted, no-contact and suppressed people
 *    a QUEUE filter, not a score adjustment, so that nothing a weight change can do will
 *    re-admit them.
 *  - It does not implement DECISION 5's per-component half-life. It now scores a recency SIGNAL
 *    as its own factor, which is a different and simpler thing: an old high-commitment act and a
 *    recent page view are still not distinguished the way that decision wants. Recency is scored
 *    only when the timeline was read in FULL, because a caller-shaped recency is a fact about the
 *    viewer rather than the person; a partial read reports it absent.
 */
import {
  FACTORS, FactorDef, PASSIVE_CAP, RULESET_VERSION, MAX_POSSIBLE,
} from './srsRuleset';

/** Measured inputs. Every one nullable; null means "no evidence", never "zero". */
export interface SrsInputs {
  daysKnown: number | null;
  intentScore: number | null;
  inboundReplies: number | null;
  paymentFailures: number | null;
  priorHistoryAvailable: boolean | null;
  priorEnrolments: number | null;
  explorerEngagement: number | null;
  explorerIntent: number | null;
  consentContact: boolean | null;
  siteSessions: number | null;
  pageEvents: number | null;
  enrolments: number | null;
  appointments: number | null;
  /**
   * M27 - the oldest evidence date among inputs that carry one, so freshness can be bounded by
   * the EVIDENCE and not only by when the score was computed. Null when nothing dated itself.
   */
  evidenceAsOf: string | null;
  /**
   * The newest activity we know of, but ONLY when the timeline was read in full. The mapper
   * reports null for a partial read, because a caller-shaped recency is not a fact about the
   * person. See srsInputs.hasFullTimelineCoverage.
   */
  lastActivityAt: string | null;
}

export type FactorState = 'scored' | 'absent';

export interface FactorResult {
  key: string;
  label: string;
  band: FactorDef['band'];
  evidenceGroup: string;
  state: FactorState;
  /** Null when absent. Never 0-for-absent. */
  points: number | null;
  max: number;
  /** Why it is absent. Null when it was scored. */
  reason: string | null;
}

export interface ScoreResult {
  rulesetVersion: string;
  computedAt: string;
  /** Sum of scored factors, passive band capped. Not a percentage. */
  total: number;
  /** The most this PERSON could have scored, given which factors had evidence. */
  scoreableMax: number;
  /** The most ANYONE could score. Constant for a ruleset version. */
  rulesetMax: number;
  /** Scored factors over total factors. The honesty dial beside the number. */
  coverage: number;
  factors: FactorResult[];
  /** DECISION 4: reported, never subtracted. */
  frictionFlag: boolean;
  /** M27 - echoed so a score can be assessed for freshness without its inputs. */
  oldestEvidenceAt: string | null;
}

/** Proportional points, capped. `full` is the value at which the factor maxes out. */
function scale(value: number, full: number, max: number): number {
  if (full <= 0) return 0;
  const ratio = Math.min(Math.max(value, 0) / full, 1);
  return Math.round(ratio * max * 100) / 100;
}

/** Values derived from more than one input, computed once and passed in. */
interface Derived {
  /** Days between the last known activity and the computation. Null when either is missing. */
  activityAgeDays: number | null;
}

/** A factor's raw contribution, or null when it has no evidence. */
function rawPoints(key: string, i: SrsInputs, max: number, d: Derived): number | null {
  switch (key) {
    case 'enrolmentStarted':
      return i.enrolments === null ? null : (i.enrolments > 0 ? max : 0);
    case 'appointmentBooked':
      return i.appointments === null ? null : (i.appointments > 0 ? max : 0);
    case 'humanReply':
      return i.inboundReplies === null ? null : scale(i.inboundReplies, 2, max);
    case 'recency': {
      // Full marks inside a week, nothing after a quarter, straight line between. Provisional,
      // like every other number in the ruleset.
      if (d.activityAgeDays === null) return null;
      const FULL = 7;
      const NONE = 90;
      if (d.activityAgeDays <= FULL) return max;
      if (d.activityAgeDays >= NONE) return 0;
      const ratio = 1 - (d.activityAgeDays - FULL) / (NONE - FULL);
      return Math.round(ratio * max * 100) / 100;
    }
    case 'intent':
      return i.intentScore === null ? null : scale(i.intentScore, 100, max);
    case 'explorerBands': {
      if (i.explorerEngagement === null && i.explorerIntent === null) return null;
      const e = i.explorerEngagement ?? 0;
      const n = i.explorerIntent ?? 0;
      return scale((e + n) / 2, 100, max);
    }
    case 'priorOutcome':
      if (i.priorHistoryAvailable === null || i.priorHistoryAvailable === false) return null;
      return i.priorEnrolments === null ? null : (i.priorEnrolments > 0 ? max : 0);
    case 'tenure':
      // Knowing someone a while is mild evidence, and it saturates fast.
      return i.daysKnown === null ? null : scale(i.daysKnown, 90, max);
    case 'consent':
      return i.consentContact === null ? null : (i.consentContact ? max : 0);
    case 'siteSessions':
      return i.siteSessions === null ? null : scale(i.siteSessions, 10, max);
    case 'pageEvents':
      return i.pageEvents === null ? null : scale(i.pageEvents, 40, max);
    case 'friction':
      // DECISION 4: friction changes the ACTION, not the score. Max is 0 by ruleset.
      return i.paymentFailures === null ? null : 0;
    default:
      throw new Error(`SRS factor has no scoring rule: ${key}`);
  }
}

/**
 * Score one person. Pure: same inputs and same `computedAt` give the same result, always.
 */
export function scoreReadiness(inputs: SrsInputs, computedAt: string): ScoreResult {
  // Derived once. Both halves are inputs, so this stays a pure function of its arguments.
  const activityMs = inputs.lastActivityAt ? Date.parse(inputs.lastActivityAt) : NaN;
  const computedMs = Date.parse(computedAt);
  const derived: Derived = {
    activityAgeDays: Number.isFinite(activityMs) && Number.isFinite(computedMs)
      ? Math.max(0, (computedMs - activityMs) / 86400000)
      : null,
  };

  const factors: FactorResult[] = FACTORS.map((def) => {
    const pts = rawPoints(def.key, inputs, def.max, derived);
    return {
      key: def.key,
      label: def.label,
      band: def.band,
      evidenceGroup: def.evidenceGroup,
      state: pts === null ? 'absent' : 'scored',
      points: pts === null ? null : Math.min(pts, def.max),
      max: def.max,
      reason: pts === null ? def.absentMeans : null,
    };
  });

  const scored = factors.filter((f) => f.state === 'scored');

  // DECISION 3: the passive band is capped as a BAND, after its factors are scored, so the cap
  // cannot be escaped by adding another passive factor later.
  const passiveRaw = scored.filter((f) => f.band === 'passive')
    .reduce((s, f) => s + (f.points ?? 0), 0);
  const passive = Math.min(passiveRaw, PASSIVE_CAP);
  const nonPassive = scored.filter((f) => f.band !== 'passive')
    .reduce((s, f) => s + (f.points ?? 0), 0);

  const passiveMaxScoreable = Math.min(
    scored.filter((f) => f.band === 'passive').reduce((s, f) => s + f.max, 0),
    PASSIVE_CAP,
  );
  const scoreableMax = scored.filter((f) => f.band !== 'passive')
    .reduce((s, f) => s + f.max, 0) + passiveMaxScoreable;

  return {
    rulesetVersion: RULESET_VERSION,
    computedAt,
    total: Math.round((nonPassive + passive) * 100) / 100,
    scoreableMax,
    rulesetMax: MAX_POSSIBLE,
    coverage: Math.round((scored.length / factors.length) * 100) / 100,
    factors,
    frictionFlag: (inputs.paymentFailures ?? 0) > 0,
    oldestEvidenceAt: inputs.evidenceAsOf,
  };
}
