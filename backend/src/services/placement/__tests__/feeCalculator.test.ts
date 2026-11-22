import { computeFee, DEFAULT_FEE_RATE, firstYearCents, money, payProblem, validRate, WEEKS } from '../feeCalculator';

/** CP10.1 (kit F7): the placement fee, pure, in integer cents. */
const fee = (p: Parameters<typeof computeFee>[0], rate?: number) => {
  const r = computeFee(p, rate);
  if (!r.ok) throw new Error(r.reason);
  return r.fee;
};

describe('the kit\'s worked examples', () => {
  it('$105,000 a year: fee $115,500 (110%)', () => {
    expect(fee({ basis: 'yearly', salaryCents: 105_000_00 })).toEqual({ firstYearCents: 105_000_00, feeCents: 115_500_00, rateBp: 11_000 });
    expect(DEFAULT_FEE_RATE).toBe(1.1);
  });
  it('$50 an hour x 40 h x 52 weeks: first year $104,000, fee $114,400', () => {
    expect(WEEKS).toBe(52);
    expect(fee({ basis: 'hourly', rateCents: 50_00, hoursPerWeek: 40 })).toMatchObject({ firstYearCents: 104_000_00, feeCents: 114_400_00 });
  });
  it('$50 an hour x 25 h: first year $65,000, fee $71,500', () => {
    expect(fee({ basis: 'hourly', rateCents: 50_00, hoursPerWeek: 25 })).toMatchObject({ firstYearCents: 65_000_00, feeCents: 71_500_00 });
  });
});

describe('rounding and limits', () => {
  it('rounds half up at the half cent', () => {
    expect(fee({ basis: 'yearly', salaryCents: 5 }).feeCents).toBe(6); // 5.5 cents
    expect(fee({ basis: 'yearly', salaryCents: 4 }).feeCents).toBe(4); // 4.4 cents
    expect(fee({ basis: 'yearly', salaryCents: 100_000_05 }).feeCents).toBe(110_000_06); // 11,000,005.5 cents
    expect(fee({ basis: 'hourly', rateCents: 33_33, hoursPerWeek: 37.5 })).toMatchObject({ firstYearCents: 6_499_350, feeCents: 7_149_285 });
  });
  it('salary $0 or $2,000,001 is refused; $2,000,000 is allowed', () => {
    expect(computeFee({ basis: 'yearly', salaryCents: 0 })).toEqual({ ok: false, reason: 'The yearly salary must be more than $0.' });
    expect(computeFee({ basis: 'yearly', salaryCents: 2_000_001_00 })).toEqual({ ok: false, reason: 'The yearly salary can be at most $2,000,000.' });
    expect(computeFee({ basis: 'yearly', salaryCents: 2_000_000_00 }).ok).toBe(true);
  });
  it('hourly rate $1,001 refused; hours 81, 0 or 40.25 refused; 80 and 0.5-step tenths allowed', () => {
    expect(payProblem({ basis: 'hourly', rateCents: 1_001_00, hoursPerWeek: 40 })).toBe('The hourly rate can be at most $1,000.');
    expect(payProblem({ basis: 'hourly', rateCents: 0, hoursPerWeek: 40 })).toBe('The hourly rate must be more than $0.');
    expect(payProblem({ basis: 'hourly', rateCents: 50_00, hoursPerWeek: 81 })).toBe('Hours a week must be 1 to 80.');
    expect(payProblem({ basis: 'hourly', rateCents: 50_00, hoursPerWeek: 0 })).toBe('Hours a week must be 1 to 80.');
    expect(payProblem({ basis: 'hourly', rateCents: 50_00, hoursPerWeek: 40.25 })).toBe('Hours a week can have at most one decimal place.');
    expect(payProblem({ basis: 'hourly', rateCents: 50_00, hoursPerWeek: 80 })).toBeNull();
  });
  it('fractional cents, NaN and non-numbers are refused, never rounded into a fee', () => {
    expect(computeFee({ basis: 'yearly', salaryCents: 100.5 }).ok).toBe(false);
    expect(computeFee({ basis: 'yearly', salaryCents: Number.NaN }).ok).toBe(false);
    expect(computeFee({ basis: 'hourly', rateCents: 50_00, hoursPerWeek: Number.NaN }).ok).toBe(false);
    expect(computeFee({ basis: 'weekly' } as never).ok).toBe(false);
  });
  it('the rate: above 1.0 and at most 3.0; a different valid rate changes the fee', () => {
    expect([validRate(1), validRate(1.0001), validRate(3), validRate(3.01), validRate('1.1'), validRate(Number.NaN)]).toEqual([false, true, true, false, false, false]);
    expect(fee({ basis: 'yearly', salaryCents: 100_000_00 }, 1.2).feeCents).toBe(120_000_00);
    expect(computeFee({ basis: 'yearly', salaryCents: 100_000_00 }, 0.5)).toEqual({ ok: false, reason: 'The fee rate must be above 1.0 and at most 3.0.' });
  });
  it('first-year salary and money formatting', () => {
    expect(firstYearCents({ basis: 'hourly', rateCents: 50_00, hoursPerWeek: 40 })).toBe(104_000_00);
    expect([money(115_500_00), money(7_149_285), money(5)]).toEqual(['$115,500', '$71,492.85', '$0.05']);
  });
});
