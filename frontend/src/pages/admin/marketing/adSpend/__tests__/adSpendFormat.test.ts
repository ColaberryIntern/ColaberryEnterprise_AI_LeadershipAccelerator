import { dollarsToCents, periodLabel } from '../adSpendFormat';

describe('ad spend helpers', () => {
  it('converts dollars to cents without float drift and refuses junk', () => {
    expect(dollarsToCents('19.99')).toBe(1999);
    expect(dollarsToCents('$1,234.5')).toBe(123450);
    expect(dollarsToCents('0.10')).toBe(10);
    expect(dollarsToCents('-5')).toBeNull();
    expect(dollarsToCents('1.234')).toBeNull();
    expect(dollarsToCents('')).toBeNull();
  });

  it('labels days and ranges without a timezone shift', () => {
    expect(periodLabel({ periodStart: '2026-10-01', periodEnd: '2026-10-01' })).toBe('Oct 1');
    expect(periodLabel({ periodStart: '2026-10-01', periodEnd: '2026-10-07' })).toBe('Oct 1 – 7');
    expect(periodLabel({ periodStart: '2026-09-28', periodEnd: '2026-10-04' })).toBe('Sep 28 – Oct 4');
  });
});
