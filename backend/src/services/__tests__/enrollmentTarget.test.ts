/**
 * C10.3 - the enrollment target, and the stock-versus-flow distinction.
 *
 * Every expected number here is arithmetic a reader can check in their head, which is the
 * point: the targets this ticket replaces could not be reproduced from their own inputs.
 * The one test that uses production figures states each figure and where it came from.
 */
import {
  ANNUAL_CHARGE,
  ANNUAL_TERM_MONTHS,
  MEMBERSHIP_PRICE,
  NOT_THE_PRICE,
} from '../membershipPrice';
import {
  EnrollmentTargetInput,
  EnrollmentTargetInputError,
  computeEnrollmentTarget,
  revenuePerMemberPerMonth,
} from '../enrollmentTarget';

/** A complete, valid input. Each test overrides only the field it is about. */
const base: EnrollmentTargetInput = {
  loadedMonthlyCost: 1990,
  planMix: { monthlyShare: 1, annualShare: 0 },
  currentMembers: 0,
  monthlyChurnRate: 0,
  horizonMonths: 1,
  realizationRate: 1,
};

const withBase = (over: Partial<EnrollmentTargetInput>): EnrollmentTargetInput => ({
  ...base,
  ...over,
});

describe('revenuePerMemberPerMonth - reads the price of record, never its own number', () => {
  it('values an all-monthly base at the month-to-month rate', () => {
    expect(revenuePerMemberPerMonth({ monthlyShare: 1, annualShare: 0 })).toBe(
      MEMBERSHIP_PRICE.monthly
    );
  });

  it('values an all-annual base at the annual charge divided by the term, not a typed rate', () => {
    expect(revenuePerMemberPerMonth({ monthlyShare: 0, annualShare: 1 })).toBe(
      ANNUAL_CHARGE / ANNUAL_TERM_MONTHS
    );
  });

  it('blends the two rates by share', () => {
    const half = revenuePerMemberPerMonth({ monthlyShare: 0.5, annualShare: 0.5 });
    expect(half).toBeCloseTo((MEMBERSHIP_PRICE.monthly + ANNUAL_CHARGE / ANNUAL_TERM_MONTHS) / 2, 10);
    expect(half).toBeCloseTo(174, 10);
  });
});

describe('stock - the level required to cover the cost base', () => {
  it('covers 1990 of cost with 10 monthly members', () => {
    expect(computeEnrollmentTarget(base).stockNominal).toBe(10);
  });

  it('covers 1490 of cost with 10 annual members', () => {
    const r = computeEnrollmentTarget(
      withBase({ loadedMonthlyCost: 1490, planMix: { monthlyShare: 0, annualShare: 1 } })
    );
    expect(r.stockNominal).toBe(10);
  });

  it('rounds UP, because a fractional member cannot pay', () => {
    // 1 dollar over 10 members' worth must require an 11th member, not 10.
    expect(computeEnrollmentTarget(withBase({ loadedMonthlyCost: 1991 })).stockNominal).toBe(11);
  });

  it('applies realization to produce the honest stock number', () => {
    const r = computeEnrollmentTarget(withBase({ realizationRate: 0.5 }));
    expect(r.stockNominal).toBe(10);
    expect(r.stockRealizationAdjusted).toBe(20);
  });
});

describe('flow - the rate, which is NOT the stock number divided by anything', () => {
  it('is 1 a month to reach a stock of 10 over 10 months from nothing', () => {
    const r = computeEnrollmentTarget(withBase({ horizonMonths: 10 }));
    expect(r.stockNominal).toBe(10);
    expect(r.flowTotal).toBe(1);
    // The whole point of the ticket: these two numbers are both "the target" and differ 10x.
    expect(r.flowTotal).not.toBe(r.stockNominal);
  });

  it('is the full stock in one month when the horizon is one month', () => {
    expect(computeEnrollmentTarget(withBase({ horizonMonths: 1 })).flowGrowth).toBe(10);
  });

  it('is replacement only once the target is already met', () => {
    const r = computeEnrollmentTarget(
      withBase({ currentMembers: 10, monthlyChurnRate: 0.2, horizonMonths: 12 })
    );
    expect(r.stockNominal).toBe(10);
    expect(r.flowGrowth).toBe(0);
    expect(r.flowReplacement).toBe(2);
    expect(r.flowTotal).toBe(2);
  });

  it('is zero only when nothing churns and the target is already met', () => {
    const r = computeEnrollmentTarget(withBase({ currentMembers: 10, monthlyChurnRate: 0 }));
    expect(r.flowTotal).toBe(0);
  });

  // Solving flow == stock for the formula currentMembers*churn + (stock-currentMembers)/horizon
  // gives currentMembers*(horizon*churn - 1) == stock*(horizon - 1). With horizon == 1 that
  // reduces to currentMembers == 0 or churn == 1; with horizon > 1 the two numbers come apart.
  // An earlier draft of this guard claimed equality required churn == 0 and
  // currentMembers == stock, which yields flow == 0 and is only true when stock is 0 too.
  describe('when flow and stock coincide, which is the exception and not the rule', () => {
    it('coincides at a one-month horizon starting from nothing', () => {
      const r = computeEnrollmentTarget(withBase({ horizonMonths: 1, currentMembers: 0 }));
      expect(r.flowTotal).toBe(r.stockNominal);
    });

    it('coincides at a one-month horizon when the entire base churns', () => {
      const r = computeEnrollmentTarget(
        withBase({ horizonMonths: 1, currentMembers: 4, monthlyChurnRate: 1 })
      );
      expect(r.flowTotal).toBe(r.stockNominal);
    });

    it('comes apart as soon as the horizon is longer than a month', () => {
      const r = computeEnrollmentTarget(
        withBase({ horizonMonths: 12, currentMembers: 4, monthlyChurnRate: 1 })
      );
      expect(r.flowTotal).not.toBe(r.stockNominal);
      expect(r.flowTotal).toBeLessThan(r.stockNominal);
    });

    it('is NOT equal when churn is 0 and the target is met - that case gives zero flow', () => {
      const r = computeEnrollmentTarget(
        withBase({ currentMembers: 10, monthlyChurnRate: 0, horizonMonths: 12 })
      );
      expect(r.stockNominal).toBe(10);
      expect(r.flowTotal).toBe(0);
      expect(r.flowTotal).not.toBe(r.stockNominal);
    });
  });

  it('never credits being above target against replacement', () => {
    // 20 members against a target of 10 does not mean negative flow; the 2 who leave
    // still have to be replaced.
    const r = computeEnrollmentTarget(
      withBase({ currentMembers: 20, monthlyChurnRate: 0.1, horizonMonths: 12 })
    );
    expect(r.flowGrowth).toBe(0);
    expect(r.flowTotal).toBe(2);
  });
});

describe('the production case, 2026-11-02', () => {
  // loadedMonthlyCost 40612 = 36200 loaded payroll + 4412 remaining opex, per the
  // turnaround cost model. Mix is the measured paying base: 25 monthly, 4 annual.
  // realizationRate 0.463 is the measured rate.
  //
  // CHURN IS NOT ONE NUMBER, AND PRETENDING IT IS WOULD REPEAT THIS TICKET'S ERROR.
  // Production gives two readings in different units, and FLOW consumes a monthly rate:
  //
  //   a) MEDIAN TENURE, 34 days. Treating cancellation as exponential, the monthly rate
  //      that puts the median at 34 days is 1 - 0.5^(30.44/34) = 0.462.
  //   b) OBSERVED SURVIVAL, 25 of 165 monthly subscriptions still active = 15.2%. That is
  //      a cumulative share over an unknown window, NOT a monthly rate, so it cannot be
  //      used directly; read as one month it implies 0.848.
  //
  // Flow scales linearly in churn, so the two give materially different answers. Both are
  // tested, and the spread between them is the honest output of this ticket.
  const DAYS_PER_MONTH = 30.44;
  const churnFromMedianTenure = 1 - Math.pow(0.5, DAYS_PER_MONTH / 34);
  const churnFromObservedSurvival = 1 - 25 / 165;

  const production = (monthlyChurnRate: number): EnrollmentTargetInput => ({
    loadedMonthlyCost: 40612,
    planMix: { monthlyShare: 25 / 29, annualShare: 4 / 29 },
    currentMembers: 29,
    monthlyChurnRate,
    horizonMonths: 12,
    realizationRate: 0.463,
  });

  it('pins the two churn readings, so neither is silently rounded', () => {
    expect(churnFromMedianTenure).toBeCloseTo(0.4624, 4);
    expect(churnFromObservedSurvival).toBeCloseTo(0.8485, 4);
  });

  it('needs 212 members nominally and 458 once realization is applied', () => {
    // Stock does not depend on churn at all, which is why it is the stable number.
    const r = computeEnrollmentTarget(production(churnFromMedianTenure));
    expect(r.revenuePerMemberPerMonth).toBeCloseTo(5571 / 29, 10);
    expect(r.stockNominal).toBe(212);
    expect(r.stockRealizationAdjusted).toBe(458);
    expect(computeEnrollmentTarget(production(churnFromObservedSurvival)).stockNominal).toBe(212);
  });

  it('needs 29 new paid members a month on the median-tenure churn reading', () => {
    const r = computeEnrollmentTarget(production(churnFromMedianTenure));
    expect(r.flowReplacement).toBe(14); // ceil(29 * 0.4624) = ceil(13.41)
    expect(r.flowGrowth).toBe(16); // ceil((212 - 29) / 12) = ceil(15.25)
    expect(r.flowTotal).toBe(29); // ceil(13.41 + 15.25)
    expect(r.flowTotalRealizationAdjusted).toBe(50); // ceil(13.41 + 35.75)
  });

  it('needs 40 a month on the observed-survival reading - the spread is the finding', () => {
    const r = computeEnrollmentTarget(production(churnFromObservedSurvival));
    expect(r.flowReplacement).toBe(25); // ceil(29 * 0.8485) = ceil(24.61)
    expect(r.flowGrowth).toBe(16);
    expect(r.flowTotal).toBe(40); // ceil(24.61 + 15.25)
    expect(r.flowTotalRealizationAdjusted).toBe(61); // ceil(24.61 + 35.75)
  });

  it('shows replacement rivals growth, which a single blended target would hide', () => {
    const r = computeEnrollmentTarget(production(churnFromMedianTenure));
    expect(r.flowReplacement).toBeGreaterThan(r.flowGrowth * 0.8);
  });
});

describe('inputs that must throw rather than default', () => {
  const omit = (field: keyof EnrollmentTargetInput): EnrollmentTargetInput => {
    const input = { ...base } as Record<string, unknown>;
    delete input[field];
    return input as unknown as EnrollmentTargetInput;
  };

  it.each<keyof EnrollmentTargetInput>([
    'loadedMonthlyCost',
    'currentMembers',
    'monthlyChurnRate',
    'horizonMonths',
    'realizationRate',
    'planMix',
  ])('throws when %s is missing', (field) => {
    expect(() => computeEnrollmentTarget(omit(field))).toThrow(EnrollmentTargetInputError);
  });

  it('throws when the plan mix does not sum to 1', () => {
    expect(() =>
      computeEnrollmentTarget(withBase({ planMix: { monthlyShare: 0.5, annualShare: 0.2 } }))
    ).toThrow(/sum to 1/);
  });

  it('accepts a mix that sums to 1 only through floating-point rounding', () => {
    expect(() =>
      computeEnrollmentTarget(withBase({ planMix: { monthlyShare: 1 / 3, annualShare: 2 / 3 } }))
    ).not.toThrow();
  });

  it.each([
    ['horizonMonths', { horizonMonths: 0 }],
    ['a fractional horizon', { horizonMonths: 1.5 }],
    ['a churn rate above 1', { monthlyChurnRate: 1.1 }],
    ['a negative churn rate', { monthlyChurnRate: -0.1 }],
    ['a realization rate of 0', { realizationRate: 0 }],
    ['a realization rate above 1', { realizationRate: 1.1 }],
    ['a zero cost base', { loadedMonthlyCost: 0 }],
    ['a negative cost base', { loadedMonthlyCost: -1 }],
    ['fractional members', { currentMembers: 2.5 }],
    ['negative members', { currentMembers: -1 }],
  ])('throws on %s', (_label, over) => {
    expect(() => computeEnrollmentTarget(withBase(over as Partial<EnrollmentTargetInput>))).toThrow(
      EnrollmentTargetInputError
    );
  });
});

describe('regression guards - the errors C10.3 exists to prevent', () => {
  it.each(NOT_THE_PRICE.map((p) => [p.value, p.why] as const))(
    'refuses a cost base of %s, which is %s',
    (value) => {
      expect(() => computeEnrollmentTarget(withBase({ loadedMonthlyCost: value }))).toThrow(
        /is not a cost/
      );
    }
  );

  it('derives every rate from the price of record, so no typed price can drift in', () => {
    // If someone retypes 199 or 149 in enrollmentTarget.ts, these stay passing - so the
    // real protection is that the module imports nothing else and checkPriceAgreement.js
    // scans services for new private price constants. This asserts the reference holds.
    expect(revenuePerMemberPerMonth({ monthlyShare: 1, annualShare: 0 })).toBe(
      MEMBERSHIP_PRICE.monthly
    );
    expect(revenuePerMemberPerMonth({ monthlyShare: 0, annualShare: 1 })).toBe(
      MEMBERSHIP_PRICE.annualPerMonth
    );
  });

  it('is idempotent: the same inputs give a deeply equal result', () => {
    const input = withBase({ currentMembers: 7, monthlyChurnRate: 0.3, horizonMonths: 6 });
    expect(computeEnrollmentTarget(input)).toEqual(computeEnrollmentTarget(input));
  });

  it('does not mutate its input', () => {
    const input = withBase({ currentMembers: 7 });
    const copy = JSON.parse(JSON.stringify(input));
    computeEnrollmentTarget(input);
    expect(input).toEqual(copy);
  });
});
