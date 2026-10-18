/**
 * M27 - say WHEN a Sales Readiness Score was computed, and FROM WHAT.
 *
 * THE IDEA THIS FILE EXISTS FOR. A score recomputed a minute ago over week-old evidence is not a
 * fresh score. If freshness were measured from the computation alone, re-running the batch would
 * make every score look current without a single new fact entering the system - the same class of
 * lie as an absent input reading as zero, which is what M24.1 to M24.3 spent the day removing.
 *
 * So the effective as-of is the OLDER of: when the score was computed, and the oldest evidence it
 * was computed from. Recomputation cannot buy freshness.
 *
 * PURE. `now` is a parameter, not a clock reading, for the same reason `computedAt` is in the
 * engine: a function that reads the time cannot give the same answer twice.
 *
 * A STALE SCORE IS LABELLED, NOT HIDDEN. Hiding it would leave a reader with no number and no
 * reason, which reads as "nothing to see" rather than "this is old". The state and the reason
 * travel together so a surface can show both.
 */
import { RULESET_VERSION } from './srsRuleset';

export type FreshnessState = 'fresh' | 'aging' | 'stale' | 'unknown';

/**
 * Hours. Versioned with the ruleset and PROVISIONAL like the weights: nothing has yet measured
 * how fast this evidence actually decays, so these are a stated hypothesis, not a finding.
 */
export const FRESHNESS_HOURS = { fresh: 24, aging: 72 } as const;

export interface FreshnessInput {
  /** When the score was computed. ISO-8601. */
  computedAt: string;
  /**
   * The oldest evidence the score was computed from, when any input carries its own as-of (the
   * Explorer snapshot's `asOfDate` is the one that does today). Null when nothing dated it.
   */
  oldestEvidenceAt?: string | null;
}

export interface Freshness {
  state: FreshnessState;
  /** The as-of a reader should believe: the older of computation and evidence. */
  effectiveAsOf: string | null;
  /** Hours between `effectiveAsOf` and `now`. Null when unknown. */
  ageHours: number | null;
  /** Which of the two dated the score. Names the reason rather than implying it. */
  boundBy: 'computation' | 'evidence' | 'none';
  /** Plain words for a surface to print beside the number. Never empty. */
  label: string;
  /** True when the computation clock ran ahead of `now`. Surfaced, not silently clamped away. */
  clockSkew: boolean;
  rulesetVersion: string;
}

const HOUR_MS = 3600000;

function parse(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
}

/**
 * Assess one score's freshness.
 *
 * Returns `unknown` rather than guessing when neither date parses: a score whose age cannot be
 * established must not be presented as fresh, and must not be hidden either.
 */
export function assessFreshness(input: FreshnessInput, now: string): Freshness {
  const nowMs = parse(now);
  const computed = parse(input.computedAt);
  const evidence = parse(input.oldestEvidenceAt ?? null);

  if (nowMs === null || computed === null) {
    return {
      state: 'unknown',
      effectiveAsOf: computed === null ? null : new Date(computed).toISOString(),
      ageHours: null,
      boundBy: 'none',
      label: 'Age unknown: this score carries no usable date, so it is not claimed to be current.',
      clockSkew: false,
      rulesetVersion: RULESET_VERSION,
    };
  }

  // The older of the two bounds the score. Recomputation cannot make old evidence new.
  const bindEvidence = evidence !== null && evidence < computed;
  const effectiveMs = bindEvidence ? evidence : computed;
  const boundBy: Freshness['boundBy'] = bindEvidence ? 'evidence' : 'computation';

  const rawAge = (nowMs - effectiveMs) / HOUR_MS;
  const clockSkew = rawAge < 0;
  const ageHours = Math.round(Math.max(rawAge, 0) * 100) / 100;

  let state: FreshnessState;
  if (ageHours < FRESHNESS_HOURS.fresh) state = 'fresh';
  else if (ageHours < FRESHNESS_HOURS.aging) state = 'aging';
  else state = 'stale';

  const asOf = new Date(effectiveMs).toISOString();
  const bound = boundBy === 'evidence'
    ? 'bounded by its oldest evidence, not by when it was computed'
    : 'bounded by when it was computed';
  const labels: Record<FreshnessState, string> = {
    fresh: `Current as of ${asOf}, ${bound}.`,
    aging: `${ageHours}h old, ${bound}. Still usable; treat the ordering as softening.`,
    stale: `STALE: ${ageHours}h old, ${bound}. Shown rather than hidden, but do not rank on it.`,
    unknown: 'Age unknown.',
  };

  return {
    state,
    effectiveAsOf: asOf,
    ageHours,
    boundBy,
    label: clockSkew
      ? `${labels[state]} The computation clock reads ahead of now, so the age is a floor.`
      : labels[state],
    clockSkew,
    rulesetVersion: RULESET_VERSION,
  };
}
