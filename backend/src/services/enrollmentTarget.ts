/**
 * THE MONTHLY ENROLLMENT TARGET - and the distinction the target is useless without.
 *
 * WHY THIS MODULE EXISTS (C10.3)
 * ------------------------------
 * A revenue plan discussed on 30 October 2026 carried enrollment targets computed from a
 * $1,700 annual price that exists in no database row and no file. Those targets are about
 * 5% optimistic before anything else is considered. This module computes the target from
 * the price of record instead, and types no price of its own - see `membershipPrice.ts`.
 *
 * But the wrong price was the smaller of the two problems.
 *
 * STOCK IS NOT FLOW, AND CONFLATING THEM IS THE ACTUAL DEFECT
 * ----------------------------------------------------------
 * Two different numbers get called "the enrollment target":
 *
 *   STOCK - how many paying members must exist at once to cover the cost base. A level.
 *   FLOW  - how many NEW paid members must be added each month. A rate.
 *
 * They are not convertible by division. Flow depends on churn and on how long you are
 * willing to take to get there, neither of which appears anywhere in a stock number. A
 * business that needs 273 members and already has 29 does not need "273 a month", and a
 * business at its target still needs real flow every month just to stand still, because
 * members leave.
 *
 * Measured against production on 2 November 2026, standing still is most of the work:
 * monthly subscriptions survive at **15.2%** (25 of 165 ever written) and the **median
 * tenure before cancellation is 34 days**. Members last roughly one billing period. At
 * that churn the replacement flow dominates the growth flow, which is precisely the fact
 * a single blended "target" hides.
 *
 * WHY EVERY INPUT IS REQUIRED AND NOTHING DEFAULTS
 * ------------------------------------------------
 * Every argument below throws when absent or out of range. That is deliberate and it is
 * the point of the ticket: a defaulted churn rate or an assumed time horizon produces a
 * confident number that nobody can trace, which is how the $1,700 targets came to exist.
 * A caller who does not know the churn rate should be stopped, not quietly given 0.
 *
 * WHAT THIS MODULE DOES NOT DO
 * ----------------------------
 * It does not decide the cost base. Payroll is an input because the payroll register does
 * not exist yet - C0.8 is open, blocked behind a TWC audit of the company's financials -
 * and the only roster available is Ali's own recollection, carried in
 * `scripts/artifacts/tickets/turnaroundData.js` flagged `measured: false`. Passing that
 * figure in keeps the estimate visible at the call site instead of burying it here.
 *
 * @see membershipPrice.ts - the price of record this reads
 * @see scripts/checkPriceAgreement.js - the build guard over every surface quoting a price
 */

import {
  ANNUAL_CHARGE,
  ANNUAL_TERM_MONTHS,
  MEMBERSHIP_PRICE,
  NOT_THE_PRICE,
} from './membershipPrice';

/** How the paying base splits between the two plans. Shares are fractions and must sum to 1. */
export interface PlanMix {
  /** Fraction of paying members on the month-to-month plan. */
  monthlyShare: number;
  /** Fraction of paying members on the annual plan. */
  annualShare: number;
}

export interface EnrollmentTargetInput {
  /** Fully loaded monthly cost to cover, in dollars. Must be > 0. */
  loadedMonthlyCost: number;
  /** How the paying base is assumed to split between plans. */
  planMix: PlanMix;
  /** Paying members today. Must be >= 0. Comp accounts are not paying members. */
  currentMembers: number;
  /** Fraction of paying members lost per month, 0 to 1 inclusive. No default. */
  monthlyChurnRate: number;
  /** Whole months allowed to reach the stock target. Must be an integer >= 1. No default. */
  horizonMonths: number;
  /**
   * Fraction of billed dollars that actually clear, greater than 0 and at most 1. Measured
   * at 0.463 for the legacy book. No default: a realization rate of 1 is a claim, not a
   * neutral starting point.
   */
  realizationRate: number;
}

export interface EnrollmentTarget {
  /** Monthly revenue one average paying member produces, given the plan mix. */
  revenuePerMemberPerMonth: number;
  /** Members that must exist at once to cover the cost base, if every billed dollar clears. */
  stockNominal: number;
  /** Members that must exist at once once realization is applied. The honest number. */
  stockRealizationAdjusted: number;
  /** New paid members per month that only replace those who leave. */
  flowReplacement: number;
  /** New paid members per month that close the gap to the stock target within the horizon. */
  flowGrowth: number;
  /** Total new paid members required per month. Replacement plus growth. */
  flowTotal: number;
  /** The same total against the realization-adjusted stock target. */
  flowTotalRealizationAdjusted: number;
}

/** Thrown for any input that would make the result untraceable. */
export class EnrollmentTargetInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EnrollmentTargetInputError';
  }
}

const isFiniteNumber = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v);

function requireFinite(value: unknown, field: string): number {
  if (!isFiniteNumber(value)) {
    throw new EnrollmentTargetInputError(
      `${field} is required and must be a finite number; received ${String(value)}. ` +
        'This module does not default any input - see the module comment for why.'
    );
  }
  return value;
}

/**
 * Refuse a cost base that is really a retired price in disguise.
 *
 * Cheap, and it closes the exact hole C10.3 was raised for: a caller who passes a
 * per-participant price where a monthly cost belongs gets a number that looks plausible.
 * The values come from `NOT_THE_PRICE` rather than being retyped here, so this cannot
 * drift away from the price of record.
 */
function assertNotARetiredPrice(value: number, field: string): void {
  const match = NOT_THE_PRICE.find((p) => p.value === value);
  if (match) {
    throw new EnrollmentTargetInputError(
      `${field} is ${value}, which is not a cost - it is ${match.why}. ` +
        'A target computed from it would repeat the error C10.3 exists to correct.'
    );
  }
}

function validateMix(mix: PlanMix | undefined): PlanMix {
  if (!mix || typeof mix !== 'object') {
    throw new EnrollmentTargetInputError('planMix is required: {monthlyShare, annualShare}.');
  }
  const monthlyShare = requireFinite(mix.monthlyShare, 'planMix.monthlyShare');
  const annualShare = requireFinite(mix.annualShare, 'planMix.annualShare');
  for (const [name, v] of [
    ['planMix.monthlyShare', monthlyShare],
    ['planMix.annualShare', annualShare],
  ] as const) {
    if (v < 0 || v > 1) {
      throw new EnrollmentTargetInputError(`${name} must be between 0 and 1; received ${v}.`);
    }
  }
  // Tolerance, not equality: 1/3 + 2/3 does not sum to exactly 1 in binary floating point,
  // and rejecting a mix a caller wrote correctly would be worse than allowing a rounding error.
  if (Math.abs(monthlyShare + annualShare - 1) > 1e-9) {
    throw new EnrollmentTargetInputError(
      `planMix shares must sum to 1; received ${monthlyShare} + ${annualShare} = ` +
        `${monthlyShare + annualShare}. A mix that does not sum to 1 silently rescales ` +
        'the revenue per member and makes the target wrong in a direction nobody can see.'
    );
  }
  return { monthlyShare, annualShare };
}

function validate(input: EnrollmentTargetInput): Required<EnrollmentTargetInput> {
  if (!input || typeof input !== 'object') {
    throw new EnrollmentTargetInputError('An EnrollmentTargetInput object is required.');
  }
  const loadedMonthlyCost = requireFinite(input.loadedMonthlyCost, 'loadedMonthlyCost');
  if (loadedMonthlyCost <= 0) {
    throw new EnrollmentTargetInputError(
      `loadedMonthlyCost must be greater than 0; received ${loadedMonthlyCost}.`
    );
  }
  assertNotARetiredPrice(loadedMonthlyCost, 'loadedMonthlyCost');

  const currentMembers = requireFinite(input.currentMembers, 'currentMembers');
  if (currentMembers < 0 || !Number.isInteger(currentMembers)) {
    throw new EnrollmentTargetInputError(
      `currentMembers must be a whole number >= 0; received ${currentMembers}.`
    );
  }

  const monthlyChurnRate = requireFinite(input.monthlyChurnRate, 'monthlyChurnRate');
  if (monthlyChurnRate < 0 || monthlyChurnRate > 1) {
    throw new EnrollmentTargetInputError(
      `monthlyChurnRate must be between 0 and 1; received ${monthlyChurnRate}.`
    );
  }

  const horizonMonths = requireFinite(input.horizonMonths, 'horizonMonths');
  if (!Number.isInteger(horizonMonths) || horizonMonths < 1) {
    throw new EnrollmentTargetInputError(
      `horizonMonths must be a whole number >= 1; received ${horizonMonths}.`
    );
  }

  const realizationRate = requireFinite(input.realizationRate, 'realizationRate');
  if (realizationRate <= 0 || realizationRate > 1) {
    throw new EnrollmentTargetInputError(
      `realizationRate must be greater than 0 and at most 1; received ${realizationRate}.`
    );
  }

  return {
    loadedMonthlyCost,
    planMix: validateMix(input.planMix),
    currentMembers,
    monthlyChurnRate,
    horizonMonths,
    realizationRate,
  };
}

/**
 * Monthly revenue from one average paying member, given the mix.
 *
 * The annual plan is valued at its MONTHLY EQUIVALENT, derived from the annual charge
 * rather than read as a rate, so this cannot disagree with what the gateway bills.
 */
export function revenuePerMemberPerMonth(mix: PlanMix): number {
  const { monthlyShare, annualShare } = validateMix(mix);
  const annualMonthlyEquivalent = ANNUAL_CHARGE / ANNUAL_TERM_MONTHS;
  return monthlyShare * MEMBERSHIP_PRICE.monthly + annualShare * annualMonthlyEquivalent;
}

/**
 * Compute both targets. Pure: same inputs, same output, no I/O, no clock, no randomness.
 *
 * Member counts are rounded UP, because a fractional member cannot pay and rounding down
 * produces a target that is known in advance not to cover the cost.
 */
export function computeEnrollmentTarget(input: EnrollmentTargetInput): EnrollmentTarget {
  const v = validate(input);
  const perMember = revenuePerMemberPerMonth(v.planMix);

  const stockNominal = Math.ceil(v.loadedMonthlyCost / perMember);
  const stockRealizationAdjusted = Math.ceil(stockNominal / v.realizationRate);

  const flowFor = (stock: number): { replacement: number; growth: number; total: number } => {
    const replacement = v.currentMembers * v.monthlyChurnRate;
    // Never negative: past the target, the growth requirement is zero, not a credit that
    // offsets replacement. A business above target still has to replace who left.
    const growth = Math.max(0, (stock - v.currentMembers) / v.horizonMonths);
    return {
      replacement: Math.ceil(replacement),
      growth: Math.ceil(growth),
      total: Math.ceil(replacement + growth),
    };
  };

  const nominal = flowFor(stockNominal);
  const adjusted = flowFor(stockRealizationAdjusted);

  return {
    revenuePerMemberPerMonth: perMember,
    stockNominal,
    stockRealizationAdjusted,
    flowReplacement: nominal.replacement,
    flowGrowth: nominal.growth,
    flowTotal: nominal.total,
    flowTotalRealizationAdjusted: adjusted.total,
  };
}
