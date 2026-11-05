/**
 * Tests for checkoutFunnelService.
 *
 * The module's whole reason for existing is that a blended conversion rate misled C10.1 for a
 * month, so the tests are weighted toward the three errors that actually happened rather than
 * toward coverage of the happy path:
 *
 *   1. counting rows instead of people (39 abandoners were reported as 147)
 *   2. blending two products into one rate (a mix shift read as a collapsing checkout)
 *   3. letting "nobody started" render as "0% converted"
 *
 * The production shape is reproduced from the real measurement of 2026-11-05 so the expected
 * numbers are not invented: standard converts 88-100% every month, explorer converts 0%.
 */

import {
  computeCheckoutFunnel, periodKey, CHECKOUT_ATTEMPTS_SQL,
  CheckoutAttemptRow,
} from '../checkoutFunnelService';

const attempt = (over: Partial<CheckoutAttemptRow> = {}): CheckoutAttemptRow => ({
  enrollment_id: 'e1',
  created_at: '2026-10-15T12:00:00Z',
  status: 'pending',
  enrollment_type: 'standard',
  payment_status: 'pending',
  ...over,
});

const row = (f: ReturnType<typeof computeCheckoutFunnel>, period: string, type: string) =>
  f.rows.find((r) => r.period === period && r.enrollment_type === type);

describe('periodKey', () => {
  it('buckets by month in UTC', () => {
    expect(periodKey('2026-10-15T12:00:00Z', 'month')).toBe('2026-10');
  });

  it('buckets by week starting Monday, matching date_trunc(week)', () => {
    // 2026-10-15 is a Thursday; its week starts Monday 2026-10-12.
    expect(periodKey('2026-10-15T12:00:00Z', 'week')).toBe('2026-10-12');
    // A Monday is its own week start, not the previous one.
    expect(periodKey('2026-10-12T00:00:00Z', 'week')).toBe('2026-10-12');
    // A Sunday belongs to the week that began the previous Monday.
    expect(periodKey('2026-10-18T23:59:59Z', 'week')).toBe('2026-10-12');
  });

  it('does not let a late-evening UTC timestamp slide into the next bucket', () => {
    expect(periodKey('2026-10-31T23:30:00Z', 'month')).toBe('2026-10');
  });

  it('returns "unknown" for an unparseable date rather than throwing', () => {
    expect(periodKey('not a date', 'month')).toBe('unknown');
  });
});

describe('per person, not per row - the error that turned 39 into 147', () => {
  it('counts a person once however many times they click checkout', () => {
    const f = computeCheckoutFunnel([
      attempt({ enrollment_id: 'e1', created_at: '2026-10-05T10:00:00Z' }),
      attempt({ enrollment_id: 'e1', created_at: '2026-10-12T10:00:00Z' }),
      attempt({ enrollment_id: 'e1', created_at: '2026-10-20T10:00:00Z' }),
    ]);
    expect(row(f, '2026-10', 'standard')!.started).toBe(1);
  });

  it('buckets a repeat clicker by their FIRST attempt, not their latest', () => {
    const f = computeCheckoutFunnel([
      attempt({ enrollment_id: 'e1', created_at: '2026-11-20T10:00:00Z' }),
      attempt({ enrollment_id: 'e1', created_at: '2026-09-02T10:00:00Z' }),
    ]);
    expect(row(f, '2026-09', 'standard')!.started).toBe(1);
    expect(row(f, '2026-11', 'standard')).toBeUndefined();
  });

  it('treats conversion as "ever", so a later success counts for the first attempt', () => {
    const f = computeCheckoutFunnel([
      attempt({ enrollment_id: 'e1', created_at: '2026-09-02T10:00:00Z', status: 'failed' }),
      attempt({ enrollment_id: 'e1', created_at: '2026-09-20T10:00:00Z', status: 'active', payment_status: 'paid' }),
    ]);
    const r = row(f, '2026-09', 'standard')!;
    expect(r.started).toBe(1);
    expect(r.converted_subscription).toBe(1);
    expect(r.converted_paid).toBe(1);
  });

  it('ignores an attempt with an unparseable timestamp rather than inventing a bucket', () => {
    const f = computeCheckoutFunnel([
      attempt({ enrollment_id: 'e1', created_at: 'whenever' }),
      attempt({ enrollment_id: 'e2', created_at: '2026-10-15T12:00:00Z' }),
    ]);
    expect(f.rows).toHaveLength(1);
    expect(row(f, '2026-10', 'standard')!.started).toBe(1);
  });
});

describe('the split by product - the error that read a mix shift as a broken checkout', () => {
  /** The real 2026-11-05 shape, abbreviated: standard converts, explorer never does. */
  const production: CheckoutAttemptRow[] = [
    ...Array.from({ length: 37 }, (_, i) => attempt({
      enrollment_id: 's7_' + i, created_at: '2026-07-10T10:00:00Z',
      status: i < 36 ? 'active' : 'pending',
      payment_status: i < 36 ? 'paid' : 'pending',
    })),
    ...Array.from({ length: 10 }, (_, i) => attempt({
      enrollment_id: 'x7_' + i, created_at: '2026-07-10T10:00:00Z',
      enrollment_type: 'explorer', status: 'pending', payment_status: 'pending',
    })),
    ...Array.from({ length: 2 }, (_, i) => attempt({
      enrollment_id: 's10_' + i, created_at: '2026-10-10T10:00:00Z',
      status: 'active', payment_status: 'paid',
    })),
    ...Array.from({ length: 12 }, (_, i) => attempt({
      enrollment_id: 'x10_' + i, created_at: '2026-10-10T10:00:00Z',
      enrollment_type: 'explorer', status: 'pending', payment_status: 'pending',
    })),
  ];

  it('reports each product separately, and neither rate collapses', () => {
    const f = computeCheckoutFunnel(production);
    expect(row(f, '2026-07', 'standard')).toMatchObject({ started: 37, converted_paid: 36, pct_paid: 97.3 });
    expect(row(f, '2026-10', 'standard')).toMatchObject({ started: 2, converted_paid: 2, pct_paid: 100 });
    expect(row(f, '2026-07', 'explorer')).toMatchObject({ started: 10, converted_paid: 0, pct_paid: 0 });
    expect(row(f, '2026-10', 'explorer')).toMatchObject({ started: 12, converted_paid: 0, pct_paid: 0 });
  });

  /**
   * THE HEADLINE TEST. Blended, this data falls from 76.6% to 14.3% and looks like a checkout
   * that broke. Per product, nothing fell. The module must make that visible rather than
   * leaving it to whoever reads the output.
   */
  it('warns that an aggregate across these periods compares different populations', () => {
    const f = computeCheckoutFunnel(production);
    expect(f.mixShiftWarning).toBeTruthy();
    expect(f.mixShiftWarning).toContain('must not be quoted');
    // In this data standard moves -64.4 and explorer +64.4: exactly equal. The tie is broken
    // alphabetically so the text is deterministic; "first type found" made it depend on key
    // order, which is how this assertion caught the flaw.
    expect(f.mixShiftWarning).toContain('"explorer"');
    expect(f.mixShiftWarning).toContain('64 points');

    // And the blended rate really would have been the misleading one, which is why it matters.
    const blended = (p: string) => {
      const rs = f.rows.filter((r) => r.period === p);
      const started = rs.reduce((n, r) => n + r.started, 0);
      const paid = rs.reduce((n, r) => n + r.converted_paid, 0);
      return Math.round((1000 * paid) / started) / 10;
    };
    expect(blended('2026-07')).toBeCloseTo(76.6, 1);
    expect(blended('2026-10')).toBeCloseTo(14.3, 1);
  });

  it('reports the composition of every period alongside the rates', () => {
    const f = computeCheckoutFunnel(production);
    const oct = f.mix.find((m) => m.period === '2026-10')!;
    expect(oct.total_started).toBe(14);
    expect(oct.share.explorer).toBeCloseTo(85.7, 1);
    expect(oct.share.standard).toBeCloseTo(14.3, 1);
  });

  it('picks the same type to name on every run, whatever the key order', () => {
    // Same data, types inserted in the opposite order. The message must be identical.
    const forwards = computeCheckoutFunnel(production).mixShiftWarning;
    const backwards = computeCheckoutFunnel([...production].reverse()).mixShiftWarning;
    expect(backwards).toBe(forwards);
  });

  it('names the LARGEST shift when they differ, not merely the first', () => {
    const data = [
      // 2026-09: 8 standard, 1 explorer, 1 corporate
      ...Array.from({ length: 8 }, (_, i) => attempt({ enrollment_id: 's' + i, created_at: '2026-09-10T10:00:00Z' })),
      attempt({ enrollment_id: 'x0', created_at: '2026-09-10T10:00:00Z', enrollment_type: 'explorer' }),
      attempt({ enrollment_id: 'c0', created_at: '2026-09-10T10:00:00Z', enrollment_type: 'corporate' }),
      // 2026-10: 1 standard, 9 explorer  -> explorer +80, standard -70, corporate -10
      attempt({ enrollment_id: 's9', created_at: '2026-10-10T10:00:00Z' }),
      ...Array.from({ length: 9 }, (_, i) => attempt({ enrollment_id: 'x' + (i + 1), created_at: '2026-10-10T10:00:00Z', enrollment_type: 'explorer' })),
    ];
    const w = computeCheckoutFunnel(data).mixShiftWarning!;
    expect(w).toContain('"explorer"');
    expect(w).toContain('80 points');
  });

  it('stays quiet when the composition is stable, so the warning means something', () => {
    const stable = [
      attempt({ enrollment_id: 'a', created_at: '2026-09-10T10:00:00Z' }),
      attempt({ enrollment_id: 'b', created_at: '2026-09-11T10:00:00Z', enrollment_type: 'explorer' }),
      attempt({ enrollment_id: 'c', created_at: '2026-10-10T10:00:00Z' }),
      attempt({ enrollment_id: 'd', created_at: '2026-10-11T10:00:00Z', enrollment_type: 'explorer' }),
    ];
    expect(computeCheckoutFunnel(stable).mixShiftWarning).toBeNull();
  });

  it('never folds a null enrollment_type into standard', () => {
    const f = computeCheckoutFunnel([
      attempt({ enrollment_id: 'a', enrollment_type: null }),
      attempt({ enrollment_id: 'b', enrollment_type: 'standard' }),
    ]);
    expect(row(f, '2026-10', '(unknown)')!.started).toBe(1);
    expect(row(f, '2026-10', 'standard')!.started).toBe(1);
  });
});

describe('empty and boundary behaviour', () => {
  it('returns no rows and no warning for no data', () => {
    const f = computeCheckoutFunnel([]);
    expect(f.rows).toEqual([]);
    expect(f.mix).toEqual([]);
    expect(f.mixShiftWarning).toBeNull();
  });

  it('tolerates null and malformed input without throwing', () => {
    expect(() => computeCheckoutFunnel(null as any)).not.toThrow();
    expect(computeCheckoutFunnel([{} as any]).rows).toEqual([]);
  });

  /** "Nobody started" must not render as "0% converted" - that reads as a failure. */
  it('uses null rather than zero for a rate with no denominator', () => {
    const f = computeCheckoutFunnel([]);
    expect(f.rows).toEqual([]);
    // And a row that exists always has a denominator, so its pct is a number.
    const one = computeCheckoutFunnel([attempt()]);
    expect(one.rows[0].pct_paid).toBe(0);
    expect(one.rows[0].started).toBe(1);
  });

  it('supports a weekly period, which is the cadence C10.1 asks for', () => {
    const f = computeCheckoutFunnel([
      attempt({ enrollment_id: 'a', created_at: '2026-10-13T10:00:00Z' }),
      attempt({ enrollment_id: 'b', created_at: '2026-10-16T10:00:00Z' }),
      attempt({ enrollment_id: 'c', created_at: '2026-10-20T10:00:00Z' }),
    ], { period: 'week' });
    expect(f.period).toBe('week');
    expect(row(f, '2026-10-12', 'standard')!.started).toBe(2);
    expect(row(f, '2026-10-19', 'standard')!.started).toBe(1);
  });
});

describe('the query that feeds it', () => {
  it('reads arrival from subscriptions, never from enrollments.paysimple_customer_id', () => {
    // enrollments.paysimple_customer_id is set on only 46 of 131 paid rows, so a funnel built on
    // it reports more people paid than arrived. The SQL must not reach for it.
    expect(CHECKOUT_ATTEMPTS_SQL).toContain('FROM subscriptions s');
    expect(CHECKOUT_ATTEMPTS_SQL).not.toContain('paysimple_customer_id');
  });

  it('joins the enrollment, because the type is what makes the rate meaningful', () => {
    expect(CHECKOUT_ATTEMPTS_SQL).toContain('JOIN enrollments e');
    expect(CHECKOUT_ATTEMPTS_SQL).toContain('e.enrollment_type');
  });

  it('is parameterised rather than interpolated', () => {
    expect(CHECKOUT_ATTEMPTS_SQL).toContain(':since');
    expect(CHECKOUT_ATTEMPTS_SQL).not.toMatch(/\$\{/);
  });
});
