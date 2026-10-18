/**
 * M25 follow-up - measure which factors actually RANK, rather than guessing new weights.
 *
 * WHY THIS EXISTS. M25's distribution showed the score cannot order the Explorer population: 105
 * of 172 points sit in factors that are identical for everyone or zero for everyone. The obvious
 * response is to reweight by intuition, which is precisely the trap DECISION 2 warns about -
 * numbers that look calibrated because somebody chose them carefully.
 *
 * THE MEASUREMENT THAT REPLACES THE GUESS. A factor that takes the same value for every person
 * has zero variance and therefore carries none of the ordering, no matter how many points it is
 * worth. So a factor's share of the score's VARIANCE is its share of the ranking. That is a
 * measurable quantity, it needs no opinion, and it makes "this weight is doing nothing" a number
 * rather than an argument.
 *
 * WHAT IT DELIBERATELY DOES NOT DO. It proposes no weights. Variance share says which factors
 * can rank THIS population; it does not say what they should be worth, which is a judgement about
 * what readiness means and belongs to Ali. This file ends where that judgement begins.
 *
 * Pure: it takes scores and returns statistics. No I/O, no clock, no database.
 */
import { ScoreResult } from './srsEngine';
import { FACTORS } from './srsRuleset';

export type FactorVerdict = 'ranks' | 'constant' | 'always-zero' | 'mostly-absent' | 'no-evidence';

export interface FactorDiscrimination {
  key: string;
  max: number;
  /** People for whom the factor had evidence. */
  scored: number;
  absent: number;
  /** Distinct point values seen. 1 means it cannot separate anybody. */
  distinctValues: number;
  low: number | null;
  high: number | null;
  mean: number | null;
  variance: number | null;
  /** This factor's share of the summed variance across all factors. 0 to 1. */
  rankingShare: number;
  verdict: FactorVerdict;
}

export interface DiscriminationReport {
  population: number;
  factors: FactorDiscrimination[];
  /** Points held by factors carrying no ranking at all. */
  deadPoints: number;
  /** Total points in the ruleset. */
  totalPoints: number;
  /** Share of the ruleset's points that do no ranking work. 0 to 1. */
  deadShare: number;
}

/** Absent for more than this share of the population and it cannot rank most people. */
export const MOSTLY_ABSENT_ABOVE = 0.5;

function variance(values: readonly number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
}

const round = (n: number, dp = 4) => Math.round(n * 10 ** dp) / 10 ** dp;

function verdictFor(
  points: readonly number[], absent: number, population: number,
): FactorVerdict {
  if (points.length === 0) return 'no-evidence';
  const distinct = new Set(points).size;
  if (distinct === 1) return points[0] === 0 ? 'always-zero' : 'constant';
  if (population > 0 && absent / population > MOSTLY_ABSENT_ABOVE) return 'mostly-absent';
  return 'ranks';
}

/**
 * Measure, across a scored population, how much each factor contributes to the ORDERING.
 *
 * Absent values are excluded from the statistics rather than counted as zero. Counting them as
 * zero would manufacture variance out of ignorance and make a factor look like it ranks when what
 * it is really doing is separating the known from the unknown.
 */
export function measureDiscrimination(scores: readonly ScoreResult[]): DiscriminationReport {
  const population = scores.length;

  const perFactor = FACTORS.map((def) => {
    const cells = scores.map((s) => s.factors.find((f) => f.key === def.key));
    const points = cells
      .filter((f) => f && f.state === 'scored')
      .map((f) => f?.points ?? 0);
    const absent = population - points.length;
    const v = points.length ? variance(points) : 0;

    return {
      key: def.key,
      max: def.max,
      scored: points.length,
      absent,
      distinctValues: new Set(points).size,
      low: points.length ? Math.min(...points) : null,
      high: points.length ? Math.max(...points) : null,
      mean: points.length ? round(points.reduce((a, b) => a + b, 0) / points.length, 2) : null,
      variance: points.length ? round(v) : null,
      rankingShare: 0,
      verdict: verdictFor(points, absent, population),
      _v: v,
    };
  });

  const totalVariance = perFactor.reduce((a, f) => a + f._v, 0);
  const factors: FactorDiscrimination[] = perFactor.map(({ _v, ...f }) => ({
    ...f,
    rankingShare: totalVariance > 0 ? round(_v / totalVariance) : 0,
  }));

  // A factor carries no ranking when its points never differ between people.
  const dead = factors.filter(
    (f) => f.verdict === 'constant' || f.verdict === 'always-zero' || f.verdict === 'no-evidence',
  );
  const deadPoints = dead.reduce((a, f) => a + f.max, 0);
  const totalPoints = FACTORS.reduce((a, f) => a + f.max, 0);

  return {
    population,
    factors,
    deadPoints,
    totalPoints,
    deadShare: totalPoints > 0 ? round(deadPoints / totalPoints) : 0,
  };
}
