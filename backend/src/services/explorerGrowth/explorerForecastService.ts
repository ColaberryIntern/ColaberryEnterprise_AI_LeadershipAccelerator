/**
 * Explorer Growth OS — cohort forecast. Plan §24; EPIC 12.
 *
 * §24.1 IS THE WHOLE DESIGN: "Observed facts and projections are visually and
 * structurally separate, and no benchmark is fabricated. Where we lack data we
 * say 'insufficient data', not a plausible-looking number."
 *
 * This module is pure arithmetic over counts. It performs no I/O, so it can be
 * exhaustively tested — which matters more here than almost anywhere else in
 * the system, because its output is a number a human will plan against. A
 * forecast that is confidently wrong is worse than one that admits it does not
 * know, and it is far harder to notice.
 *
 * THE FAILURE THIS IS BUILT TO PREVENT. The natural implementation multiplies a
 * chain of stage conversion rates. When one rate is unknown, the tempting
 * shortcuts are to skip it (equivalent to treating it as 1.0 — every learner
 * advances) or to treat it as 0. Both produce a confident number from missing
 * data. Here, an unknown rate makes the whole projection unknown, and that
 * propagation is tested directly.
 */

/**
 * The funnel, in order. Index i converts to index i+1.
 *
 * Named rather than positional so a caller cannot silently pass the stages in
 * the wrong order — a transposition would still produce plausible arithmetic.
 */
export const FORECAST_STAGES = [
  'explorer_accounts',
  'activated',
  'active',
  'engaged',
  'high_intent',
  'application_started',
  'application_completed',
  'paid',
] as const;

export type ForecastStage = (typeof FORECAST_STAGES)[number];

export type StageCounts = Record<ForecastStage, number>;

/** §24.2 gates: a rate is only reported at n >= 30 over a window >= 30 days. */
export const MIN_STAGE_N = 30;
export const MIN_WINDOW_DAYS = 30;

/** 95% two-sided. */
const Z = 1.96;

/**
 * Either a measured value with its uncertainty, or an explicit refusal.
 *
 * A discriminated union rather than a nullable number, so "we do not know"
 * cannot be silently coerced into arithmetic. `number | null` invites `?? 0`
 * and `|| 1`, which is precisely how a fabricated benchmark gets created.
 */
export type Measured =
  | { known: true; point: number; low: number; high: number }
  | { known: false; reason: string };

export const insufficient = (reason: string): Measured => ({ known: false, reason });

/**
 * Wilson score interval for a binomial proportion.
 *
 * Wilson rather than the normal approximation because these proportions are
 * small and the denominators modest — exactly where `p ± z·sqrt(p(1-p)/n)`
 * misbehaves, producing intervals that extend below zero and understate
 * uncertainty at the extremes. At p=0 Wilson still yields a sensible upper
 * bound, which is the case that matters most here: no Explorer cohort has
 * completed a full cycle yet, so several stages sit at zero successes.
 */
export function wilsonInterval(successes: number, trials: number, z: number = Z): Measured {
  if (!Number.isFinite(successes) || !Number.isFinite(trials)) {
    return insufficient('counts are not finite');
  }
  if (trials <= 0) return insufficient('no trials');
  if (successes < 0 || successes > trials) {
    return insufficient(`successes (${successes}) outside 0..${trials}`);
  }

  const n = trials;
  const p = successes / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const centre = (p + z2 / (2 * n)) / denom;
  const margin = (z / denom) * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n));

  return {
    known: true,
    point: p,
    low: Math.max(0, centre - margin),
    high: Math.min(1, centre + margin),
  };
}

/**
 * Conversion from one stage to the next, gated by §24.2.
 *
 * The gate is on the DENOMINATOR. Thirty people reaching a stage is what makes
 * the onward rate meaningful; thirty converting out of four hundred is a fine
 * measurement, while two out of three is not, however tempting 67% looks.
 */
export function stageConversion(
  from: number,
  to: number,
  windowDays: number,
): Measured {
  if (windowDays < MIN_WINDOW_DAYS) {
    return insufficient(`window is ${windowDays}d, needs ${MIN_WINDOW_DAYS}d`);
  }
  if (from < MIN_STAGE_N) {
    return insufficient(`n=${from} at the source stage, needs ${MIN_STAGE_N}`);
  }
  if (to > from) {
    // Not arithmetic noise — a downstream stage larger than its source means
    // the counts came from different populations or windows, and every number
    // derived from them would be wrong in a way that looks reasonable.
    return insufficient(`downstream count ${to} exceeds source ${from}`);
  }
  return wilsonInterval(to, from, Z);
}

/** Every adjacent stage rate, in funnel order. */
export function stageConversions(counts: StageCounts, windowDays: number): Measured[] {
  const rates: Measured[] = [];
  for (let i = 0; i < FORECAST_STAGES.length - 1; i++) {
    rates.push(
      stageConversion(counts[FORECAST_STAGES[i]], counts[FORECAST_STAGES[i + 1]], windowDays),
    );
  }
  return rates;
}

/**
 * Expected additional paid learners from the pipeline as it stands.
 *
 * `expected = Σ over stages  count(i) × Π r(j) for j ≥ i`, with the interval
 * carried through by multiplying the bounds.
 *
 * ONE UNKNOWN RATE MAKES THE WHOLE PROJECTION UNKNOWN. Every stage's
 * contribution passes through every downstream rate, so a single gap breaks
 * every term. Returning a number computed from the stages that happen to have
 * data would present partial coverage as a total — the fabricated benchmark
 * §24.1 exists to forbid.
 */
export function projectExpected(counts: StageCounts, rates: Measured[]): Measured {
  const missing = rates.findIndex((r) => !r.known);
  if (missing >= 0) {
    const r = rates[missing] as { known: false; reason: string };
    return insufficient(
      `${FORECAST_STAGES[missing]} → ${FORECAST_STAGES[missing + 1]}: ${r.reason}`,
    );
  }

  const known = rates as Extract<Measured, { known: true }>[];
  let point = 0;
  let low = 0;
  let high = 0;

  // The last stage is `paid` itself — already converted, not pipeline.
  for (let i = 0; i < FORECAST_STAGES.length - 1; i++) {
    const n = counts[FORECAST_STAGES[i]];
    let pPoint = 1;
    let pLow = 1;
    let pHigh = 1;
    for (let j = i; j < known.length; j++) {
      pPoint *= known[j].point;
      pLow *= known[j].low;
      pHigh *= known[j].high;
    }
    point += n * pPoint;
    low += n * pLow;
    high += n * pHigh;
  }

  return { known: true, point, low, high };
}

export interface Forecast {
  /** Observed, never projected. */
  currentPaid: number;
  expected: Measured;
  total: Measured;
  /** Positive means short of target. */
  gap: Measured;
  target: number;
}

/**
 * The §24.2 model end to end.
 *
 * `currentPaid` is kept structurally separate from `expected` all the way
 * through, because §24.1 requires observed and projected to stay
 * distinguishable — a single blended number invites planning against a
 * projection as though it were a fact.
 */
export function buildForecast(
  counts: StageCounts,
  windowDays: number,
  target: number,
): Forecast {
  const currentPaid = counts.paid;
  const expected = projectExpected(counts, stageConversions(counts, windowDays));

  if (!expected.known) {
    return { currentPaid, expected, total: expected, gap: expected, target };
  }

  const total: Measured = {
    known: true,
    point: currentPaid + expected.point,
    low: currentPaid + expected.low,
    high: currentPaid + expected.high,
  };

  return {
    currentPaid,
    expected,
    total,
    // The gap inverts the interval: the LOW total implies the LARGEST gap.
    // Carrying the bounds straight through would report the optimistic case as
    // the worst case, which is the wrong way round for a shortfall.
    gap: { known: true, point: target - total.point, low: target - total.high, high: target - total.low },
    target,
  };
}
