/**
 * C10.12 - the renewal cliff.
 *
 * The fixture below is the ACTIVE subscription book as production held it on 2 November
 * 2026, taken from read-only SELECTs: 4 annual at $1,788, 25 monthly at $199 and 26 comp
 * at $0, with the period-end months each row actually carries. It is built from the
 * measurement rather than from the code under test, which is the only way a fixture can
 * disagree with the implementation and so the only way it can catch anything.
 *
 * Pure module, no model imports, so this suite runs without a database.
 */
import {
  RenewalExposureInputError,
  RenewalRow,
  computeRenewalExposure,
} from '../renewalExposure';

/** Measured realization: 46.3% of billed dollars clear. */
const REALIZATION = 0.463;

const rows = (n: number, row: RenewalRow): RenewalRow[] => Array.from({ length: n }, () => ({ ...row }));

const annual = (periodEnd: string | null, status = 'active'): RenewalRow => ({
  plan: 'annual',
  status,
  amountCents: 178800,
  currentPeriodEnd: periodEnd,
});
const monthly = (periodEnd: string | null, status = 'active'): RenewalRow => ({
  plan: 'monthly',
  status,
  amountCents: 19900,
  currentPeriodEnd: periodEnd,
});
const comp = (periodEnd: string): RenewalRow => ({
  plan: 'comp',
  status: 'active',
  amountCents: 0,
  currentPeriodEnd: periodEnd,
});

/** The active book, exactly as measured. */
const ACTIVE_BOOK: RenewalRow[] = [
  ...rows(3, annual('2027-07-23')),
  ...rows(1, annual('2027-11-12')),
  ...rows(1, monthly('2026-08-30')),
  ...rows(4, monthly('2026-09-15')),
  ...rows(6, monthly('2026-10-12')),
  ...rows(9, monthly('2026-11-20')),
  ...rows(5, monthly('2026-12-05')),
  ...rows(9, comp('2036-07-01')),
  ...rows(7, comp('2036-08-01')),
  ...rows(9, comp('2036-09-01')),
  ...rows(1, comp('2036-10-01')),
];

describe('the annual cliff the ticket was raised about', () => {
  const annualOnly = ACTIVE_BOOK.filter((r) => r.plan === 'annual');

  it('is 4 memberships and $7,152 across two months - not a cohort', () => {
    const r = computeRenewalExposure(annualOnly, REALIZATION);
    expect(r.totalMemberships).toBe(4);
    expect(r.totalNominalValue).toBe(7152);
    expect(r.months.map((m) => m.month)).toEqual(['2027-07', '2027-11']);
  });

  it('lands 3 memberships in July 2027 and 1 in November 2027', () => {
    const r = computeRenewalExposure(annualOnly, REALIZATION);
    expect(r.months[0]).toEqual({
      month: '2027-07',
      memberships: 3,
      nominalValue: 5364,
      realizedValue: 2483.53,
    });
    expect(r.months[1]).toEqual({
      month: '2027-11',
      memberships: 1,
      nominalValue: 1788,
      realizedValue: 827.84,
    });
  });

  it('is worth $3,311 realized, not $7,152 - a 2.2x difference in what is at stake', () => {
    const r = computeRenewalExposure(annualOnly, REALIZATION);
    expect(r.totalRealizedValue).toBe(3311.37);
    expect(r.totalNominalValue / r.totalRealizedValue).toBeCloseTo(2.16, 2);
  });
});

describe('the whole active book, which is where the real exposure is', () => {
  it('puts far more value in the next four months than in the annual cliff', () => {
    const r = computeRenewalExposure(ACTIVE_BOOK, REALIZATION);
    const nearTerm = r.months
      .filter((m) => m.month >= '2026-08' && m.month <= '2026-12')
      .reduce((n, m) => n + m.nominalValue, 0);
    // 25 monthly memberships at $199 renew before the first annual one does.
    expect(nearTerm).toBe(4975);
    expect(nearTerm).toBeGreaterThan(7152 / 2);
  });

  it('counts the comp grants running to 2036 rather than hiding them', () => {
    const r = computeRenewalExposure(ACTIVE_BOOK, REALIZATION);
    const comped = r.months.filter((m) => m.month.startsWith('2036'));
    expect(comped.reduce((n, m) => n + m.memberships, 0)).toBe(26);
    // Worth nothing in revenue, which is exactly why they are easy to forget.
    expect(comped.reduce((n, m) => n + m.nominalValue, 0)).toBe(0);
  });

  it('orders months chronologically, so the nearest cliff reads first', () => {
    const months = computeRenewalExposure(ACTIVE_BOOK, REALIZATION).months.map((m) => m.month);
    expect(months).toEqual([...months].sort());
    expect(months[0]).toBe('2026-08');
  });
});

describe('rows that cannot renew, and rows that cannot be dated', () => {
  it('excludes pending and failed rows, because they never began', () => {
    // 23 pending + 17 failed annual rows is what production actually holds. They have no
    // period end at all, and treating them as exposure is the ticket's premise error.
    const book = [
      ...rows(23, annual(null, 'pending')),
      ...rows(17, annual(null, 'failed')),
      ...rows(4, annual('2027-07-23')),
    ];
    const r = computeRenewalExposure(book, REALIZATION);
    expect(r.excludedNotActive).toBe(40);
    expect(r.totalMemberships).toBe(4);
    expect(r.totalNominalValue).toBe(7152);
  });

  it('reports active rows with no period end separately instead of dropping them', () => {
    const r = computeRenewalExposure([...rows(2, monthly(null)), monthly('2026-11-20')], REALIZATION);
    expect(r.undatedActive).toEqual({ memberships: 2, nominalValue: 398 });
    expect(r.totalMemberships).toBe(1);
  });

  it('throws on a date it cannot place on a calendar', () => {
    expect(() => computeRenewalExposure([monthly('soon')], REALIZATION)).toThrow(
      RenewalExposureInputError
    );
  });
});

describe('drift from the price of record', () => {
  it('flags a legacy amount without calling it an error', () => {
    // The legacy book carries $250/month training subscriptions. Legitimate, but it must
    // be visible: an unexplained amount is how a wrong price survives inside a forecast.
    const legacy: RenewalRow = {
      plan: 'legacy_training',
      status: 'active',
      amountCents: 25000,
      currentPeriodEnd: '2026-12-01',
    };
    const r = computeRenewalExposure([legacy, monthly('2026-12-05')], REALIZATION);
    expect(r.offPriceOfRecord.memberships).toBe(1);
    expect(r.offPriceOfRecord.amountsSeen).toEqual([250]);
    // Still counted in exposure - flagging is not excluding.
    expect(r.totalNominalValue).toBe(449);
  });

  it('does not flag the price of record or a comped zero', () => {
    const r = computeRenewalExposure(
      [monthly('2026-12-05'), annual('2027-07-23'), comp('2036-07-01')],
      REALIZATION
    );
    expect(r.offPriceOfRecord.memberships).toBe(0);
    expect(r.offPriceOfRecord.amountsSeen).toEqual([]);
  });
});

describe('the realization rate is required, not assumed', () => {
  it.each([
    ['undefined', undefined],
    ['zero', 0],
    ['above 1', 1.1],
    ['negative', -0.5],
    ['not a number', 'half'],
  ])('throws when the realization rate is %s', (_label, rate) => {
    expect(() => computeRenewalExposure(ACTIVE_BOOK, rate as number)).toThrow(
      RenewalExposureInputError
    );
  });

  it('accepts a rate of exactly 1, which asserts full collection explicitly', () => {
    const r = computeRenewalExposure(ACTIVE_BOOK.filter((x) => x.plan === 'annual'), 1);
    expect(r.totalRealizedValue).toBe(r.totalNominalValue);
  });

  it('rejects a row with no usable amount rather than treating it as zero', () => {
    expect(() =>
      computeRenewalExposure([{ ...monthly('2026-12-05'), amountCents: NaN }], REALIZATION)
    ).toThrow(RenewalExposureInputError);
  });
});

describe('boundaries and purity', () => {
  it('returns an empty report for an empty book, which is the realistic annual case', () => {
    const r = computeRenewalExposure([], REALIZATION);
    expect(r.months).toEqual([]);
    expect(r.totalMemberships).toBe(0);
    expect(r.totalNominalValue).toBe(0);
    expect(r.excludedNotActive).toBe(0);
  });

  it('is idempotent', () => {
    expect(computeRenewalExposure(ACTIVE_BOOK, REALIZATION)).toEqual(
      computeRenewalExposure(ACTIVE_BOOK, REALIZATION)
    );
  });

  it('does not mutate the rows it is given', () => {
    const copy = JSON.parse(JSON.stringify(ACTIVE_BOOK));
    computeRenewalExposure(ACTIVE_BOOK, REALIZATION);
    expect(ACTIVE_BOOK).toEqual(copy);
  });

  it('takes no view of today, so its answer cannot drift with the clock', () => {
    // Nothing in the report depends on `now`; a 2036 row is reported the same way a 2026
    // one is. A function that filtered by "upcoming" could not be tested against fixed
    // expectations and would quietly change its answer every day.
    const r = computeRenewalExposure([comp('2036-07-01')], REALIZATION);
    expect(r.months).toHaveLength(1);
    expect(r.months[0].month).toBe('2036-07');
  });
});
