import {
  buildCheckoutSection,
  assertEveryRateNamesItsOrigin,
  latestPeriod,
  sinceFor,
  CHECKOUT_WEEKS,
  CheckoutConversionSnapshot,
} from '../checkoutConversionSection';
import type { CheckoutFunnel, CheckoutFunnelRow } from '../../checkoutFunnelService';

/**
 * C10.1 spent a month looking for a broken payment page because one blended rate fell from
 * 76.6% to 14.3%. The page was fine; the population arriving had changed. Every test here
 * exists to keep that specific mistake, or one of its cousins, out of the weekly report.
 */
const row = (over: Partial<CheckoutFunnelRow> = {}): CheckoutFunnelRow => ({
  period: '2026-11-03',
  origin: 'never-explorer',
  started: 6,
  converted_subscription: 5,
  converted_paid: 5,
  pct_subscription: 83.3,
  pct_paid: 83.3,
  ...over,
});

const funnel = (over: Partial<CheckoutFunnel> = {}): CheckoutFunnel => ({
  period: 'week',
  rows: [row()],
  mix: [{ period: '2026-11-03', total_started: 6, share: { 'never-explorer': 100 } }],
  mixShiftWarning: null,
  originDisagreement: 0,
  originWarning: null,
  ...over,
});

const snap = (over: Partial<CheckoutConversionSnapshot> = {}): CheckoutConversionSnapshot => ({
  funnel: funnel(),
  attempts: 248,
  error: null,
  ...over,
});

describe('the happy path reports a rate per population', () => {
  it('prints one line per origin and never a combined rate', () => {
    const { section } = buildCheckoutSection(snap({
      funnel: funnel({
        rows: [
          row({ origin: 'never-explorer', started: 6, converted_paid: 5, pct_paid: 83.3 }),
          row({ origin: 'explorer-origin', started: 4, converted_paid: 0, pct_paid: 0 }),
        ],
      }),
    }));

    const rates = section.lines.filter((l) => /\d%/.test(l));
    expect(rates).toHaveLength(2);
    expect(rates.some((l) => l.includes('never-explorer') && l.includes('83.3%'))).toBe(true);
    expect(rates.some((l) => l.includes('explorer-origin') && l.includes('0%'))).toBe(true);
    expect(() => assertEveryRateNamesItsOrigin(section)).not.toThrow();
  });

  it('is an outcome section, so it can never sit below the activity section', () => {
    expect(buildCheckoutSection(snap()).section.kind).toBe('outcome');
  });

  it('counts as movement only when somebody actually paid', () => {
    expect(buildCheckoutSection(snap()).section.empty).toBe(false);
    const nobodyPaid = snap({
      funnel: funnel({ rows: [row({ converted_paid: 0, pct_paid: 0 })] }),
    });
    expect(buildCheckoutSection(nobodyPaid).section.empty).toBe(true);
  });

  it('reports only the most recent week, not every week at once', () => {
    const { section } = buildCheckoutSection(snap({
      funnel: funnel({
        rows: [
          row({ period: '2026-10-27', started: 99, converted_paid: 99, pct_paid: 100 }),
          row({ period: '2026-11-03' }),
        ],
      }),
    }));
    expect(section.lines.join(' ')).toContain('2026-11-03');
    expect(section.lines.join(' ')).not.toContain('99');
  });
});

describe('a failed read is never a zero', () => {
  it('says it could not be measured and prints no rate at all', () => {
    const { section } = buildCheckoutSection(snap({ funnel: null, error: 'TimeoutError' }));
    expect(section.lines.join(' ')).toContain('Not measurable');
    expect(section.lines.join(' ')).toContain('TimeoutError');
    expect(section.lines.some((l) => /\d%/.test(l))).toBe(false);
    expect(section.empty).toBe(true);
  });

  it('does not report a zero beside the words it cannot measure', () => {
    // assertNoUnevidencedZero in the report fails on "Not measurable ... : 0".
    const { section } = buildCheckoutSection(snap({ funnel: null, error: 'SequelizeConnectionError' }));
    for (const line of section.lines) {
      expect(/\bNot measurable\b/i.test(line) && /: 0\b/.test(line)).toBe(false);
    }
  });

  it('carries no caveats when there was nothing to caveat', () => {
    expect(buildCheckoutSection(snap({ funnel: null, error: 'Error' })).caveats).toEqual([]);
  });
});

describe('boundaries', () => {
  it('distinguishes "nobody started" from "could not look"', () => {
    const { section } = buildCheckoutSection(snap({ funnel: funnel({ rows: [], mix: [] }) }));
    expect(section.lines.join(' ')).toContain('Nobody started a checkout');
    expect(section.lines.join(' ')).toContain('not a missing one');
    expect(section.empty).toBe(true);
  });

  it('prints no percentage when nobody started in a period', () => {
    const { section } = buildCheckoutSection(snap({
      funnel: funnel({ rows: [row({ started: 0, converted_paid: 0, pct_paid: null })] }),
    }));
    expect(section.lines.join(' ')).toContain('nobody started');
    expect(() => assertEveryRateNamesItsOrigin(section)).not.toThrow();
  });

  it('latestPeriod is null when there is nothing, and sorts rather than trusting order', () => {
    expect(latestPeriod(null)).toBeNull();
    expect(latestPeriod(funnel({ rows: [] }))).toBeNull();
    expect(latestPeriod(funnel({
      rows: [row({ period: '2026-11-03' }), row({ period: '2026-10-06' })],
    }))).toBe('2026-11-03');
  });

  it('looks back exactly CHECKOUT_WEEKS weeks, in UTC', () => {
    expect(sinceFor(new Date('2026-11-09T23:59:59Z'), 8)).toBe('2026-09-14');
    expect(CHECKOUT_WEEKS).toBe(8);
  });
});

describe("the funnel's own warnings travel with the number", () => {
  it('turns both warnings into caveats', () => {
    const { caveats } = buildCheckoutSection(snap({
      funnel: funnel({
        originWarning: 'The two origin markers disagree about 29 people.',
        mixShiftWarning: 'Composition moved 64.4 points; an aggregate compares different populations.',
      }),
    }));
    expect(caveats).toHaveLength(2);
    expect(caveats[0]).toContain('origin markers disagree');
    expect(caveats[1]).toContain('different populations');
  });

  it('drops empty warnings rather than emitting blank caveats', () => {
    const { caveats } = buildCheckoutSection(snap({
      funnel: funnel({ originWarning: '', mixShiftWarning: null }),
    }));
    expect(caveats).toEqual([]);
  });
});

describe('the guard that keeps a blended rate out', () => {
  it('throws on a percentage that names no population', () => {
    expect(() => assertEveryRateNamesItsOrigin({
      key: 'checkout', heading: 'x', kind: 'outcome', empty: false,
      lines: ['Checkout conversion: 14.3%'],
    })).toThrow(/without naming the population/);
  });

  it('allows a line with no percentage in it', () => {
    expect(() => assertEveryRateNamesItsOrigin({
      key: 'checkout', heading: 'x', kind: 'outcome', empty: true,
      lines: ['Nobody started a checkout in the last 8 weeks.'],
    })).not.toThrow();
  });

  it('passes every section this module actually builds', () => {
    const cases = [
      snap(),
      snap({ funnel: null, error: 'TimeoutError' }),
      snap({ funnel: funnel({ rows: [] }) }),
      snap({ funnel: funnel({ rows: [row({ origin: 'explorer-origin', pct_paid: 0 })] }) }),
    ];
    for (const c of cases) {
      expect(() => assertEveryRateNamesItsOrigin(buildCheckoutSection(c).section)).not.toThrow();
    }
  });
});

describe('replayability', () => {
  it('is pure: the same snapshot builds the identical section twice', () => {
    const s = snap({
      funnel: funnel({
        rows: [row(), row({ origin: 'explorer-origin', converted_paid: 0, pct_paid: 0 })],
        originWarning: 'markers disagree',
      }),
    });
    expect(buildCheckoutSection(s)).toEqual(buildCheckoutSection(s));
  });

  it('does not depend on the order the rows arrive in', () => {
    const a = row({ origin: 'never-explorer' });
    const b = row({ origin: 'explorer-origin', converted_paid: 1, pct_paid: 16.7 });
    const forward = buildCheckoutSection(snap({ funnel: funnel({ rows: [a, b] }) }));
    const reverse = buildCheckoutSection(snap({ funnel: funnel({ rows: [b, a] }) }));
    expect(forward.section.lines.slice(1).sort()).toEqual(reverse.section.lines.slice(1).sort());
    expect(forward.section.empty).toBe(reverse.section.empty);
  });
});
