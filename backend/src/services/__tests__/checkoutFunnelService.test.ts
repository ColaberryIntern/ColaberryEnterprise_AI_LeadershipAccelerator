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
  explorer_origin: false,
  marker_entered_at: false,
  marker_explorer_cohort: false,
  payment_status: 'pending',
  ...over,
});

const row = (f: ReturnType<typeof computeCheckoutFunnel>, period: string, origin: string) =>
  f.rows.find((r) => r.period === period && r.origin === origin);

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
    expect(row(f, '2026-10', 'never-explorer')!.started).toBe(1);
  });

  it('buckets a repeat clicker by their FIRST attempt, not their latest', () => {
    const f = computeCheckoutFunnel([
      attempt({ enrollment_id: 'e1', created_at: '2026-11-20T10:00:00Z' }),
      attempt({ enrollment_id: 'e1', created_at: '2026-09-02T10:00:00Z' }),
    ]);
    expect(row(f, '2026-09', 'never-explorer')!.started).toBe(1);
    expect(row(f, '2026-11', 'never-explorer')).toBeUndefined();
  });

  it('treats conversion as "ever", so a later success counts for the first attempt', () => {
    const f = computeCheckoutFunnel([
      attempt({ enrollment_id: 'e1', created_at: '2026-09-02T10:00:00Z', status: 'failed' }),
      attempt({ enrollment_id: 'e1', created_at: '2026-09-20T10:00:00Z', status: 'active', payment_status: 'paid' }),
    ]);
    const r = row(f, '2026-09', 'never-explorer')!;
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
    expect(row(f, '2026-10', 'never-explorer')!.started).toBe(1);
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
      explorer_origin: true, status: 'pending', payment_status: 'pending',
    })),
    ...Array.from({ length: 2 }, (_, i) => attempt({
      enrollment_id: 's10_' + i, created_at: '2026-10-10T10:00:00Z',
      status: 'active', payment_status: 'paid',
    })),
    ...Array.from({ length: 12 }, (_, i) => attempt({
      enrollment_id: 'x10_' + i, created_at: '2026-10-10T10:00:00Z',
      explorer_origin: true, status: 'pending', payment_status: 'pending',
    })),
  ];

  it('reports each product separately, and neither rate collapses', () => {
    const f = computeCheckoutFunnel(production);
    expect(row(f, '2026-07', 'never-explorer')).toMatchObject({ started: 37, converted_paid: 36, pct_paid: 97.3 });
    expect(row(f, '2026-10', 'never-explorer')).toMatchObject({ started: 2, converted_paid: 2, pct_paid: 100 });
    expect(row(f, '2026-07', 'explorer-origin')).toMatchObject({ started: 10, converted_paid: 0, pct_paid: 0 });
    expect(row(f, '2026-10', 'explorer-origin')).toMatchObject({ started: 12, converted_paid: 0, pct_paid: 0 });
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
    expect(f.mixShiftWarning).toContain('"explorer-origin"');
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
    expect(oct.share['explorer-origin']).toBeCloseTo(85.7, 1);
    expect(oct.share['never-explorer']).toBeCloseTo(14.3, 1);
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
      attempt({ enrollment_id: 'x0', created_at: '2026-09-10T10:00:00Z', explorer_origin: true }),
      attempt({ enrollment_id: 'c0', created_at: '2026-09-10T10:00:00Z', explorer_origin: false }),
      // 2026-10: 1 standard, 9 explorer  -> explorer +80, standard -70, corporate -10
      attempt({ enrollment_id: 's9', created_at: '2026-10-10T10:00:00Z' }),
      ...Array.from({ length: 9 }, (_, i) => attempt({ enrollment_id: 'x' + (i + 1), created_at: '2026-10-10T10:00:00Z', explorer_origin: true })),
    ];
    const w = computeCheckoutFunnel(data).mixShiftWarning!;
    expect(w).toContain('"explorer-origin"');
    expect(w).toContain('80 points');
  });

  it('stays quiet when the composition is stable, so the warning means something', () => {
    const stable = [
      attempt({ enrollment_id: 'a', created_at: '2026-09-10T10:00:00Z' }),
      attempt({ enrollment_id: 'b', created_at: '2026-09-11T10:00:00Z', explorer_origin: true }),
      attempt({ enrollment_id: 'c', created_at: '2026-10-10T10:00:00Z' }),
      attempt({ enrollment_id: 'd', created_at: '2026-10-11T10:00:00Z', explorer_origin: true }),
    ];
    expect(computeCheckoutFunnel(stable).mixShiftWarning).toBeNull();
  });

  /**
   * A null origin is "no Explorer evidence", which is deliberately read as never-explorer. The
   * SQL coalesces for the same reason: a LEFT JOIN miss makes `c.cohort_type = 'explorer'` NULL,
   * and `false OR NULL` is NULL rather than false. The conservative direction matters - this
   * cannot invent an Explorer, only miss one whose markers are both absent.
   */
  it('reads an absent origin marker as never-explorer, never as its own bucket', () => {
    const f = computeCheckoutFunnel([
      attempt({ enrollment_id: 'a', explorer_origin: null }),
      attempt({ enrollment_id: 'b', explorer_origin: false }),
      attempt({ enrollment_id: 'c', explorer_origin: true }),
    ]);
    expect(row(f, '2026-10', 'never-explorer')!.started).toBe(2);
    expect(row(f, '2026-10', 'explorer-origin')!.started).toBe(1);
    expect(f.rows).toHaveLength(2);
  });

  describe('originDisagreement: the split is only as good as the markers', () => {
    it('counts a person the two markers classify differently', () => {
      const f = computeCheckoutFunnel([
        attempt({ enrollment_id: 'a', explorer_origin: true, marker_entered_at: false, marker_explorer_cohort: true }),
        attempt({ enrollment_id: 'b', explorer_origin: true, marker_entered_at: true, marker_explorer_cohort: true }),
      ]);
      expect(f.originDisagreement).toBe(1);
      expect(f.originWarning).toContain('1 of 2 people differently');
      expect(f.originWarning).toContain('do not quote these rates as settled');
    });

    it('stays silent when the markers agree, so the warning means something', () => {
      const f = computeCheckoutFunnel([
        attempt({ enrollment_id: 'a', explorer_origin: true, marker_entered_at: true, marker_explorer_cohort: true }),
        attempt({ enrollment_id: 'b', explorer_origin: false, marker_entered_at: false, marker_explorer_cohort: false }),
      ]);
      expect(f.originDisagreement).toBe(0);
      expect(f.originWarning).toBeNull();
    });

    it('does not treat a MISSING marker as a disagreement', () => {
      // One marker absent is unknown, not conflict. Counting it would inflate the warning until
      // it stopped meaning anything.
      const f = computeCheckoutFunnel([
        attempt({ enrollment_id: 'a', explorer_origin: true, marker_entered_at: true, marker_explorer_cohort: null }),
        attempt({ enrollment_id: 'b', explorer_origin: false }),
      ]);
      expect(f.originDisagreement).toBe(0);
      expect(f.originWarning).toBeNull();
    });

    it('counts a person once however many of their rows disagree', () => {
      const f = computeCheckoutFunnel([
        attempt({ enrollment_id: 'a', created_at: '2026-10-05T10:00:00Z', explorer_origin: true, marker_entered_at: false, marker_explorer_cohort: true }),
        attempt({ enrollment_id: 'a', created_at: '2026-10-12T10:00:00Z', explorer_origin: true, marker_entered_at: false, marker_explorer_cohort: true }),
      ]);
      expect(f.originDisagreement).toBe(1);
    });
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

  /**
   * `since` bounds the OUTPUT. It must not change who counts as a first-timer, which is the
   * whole reason the SQL has no date filter.
   */
  describe('the since window', () => {
    const returning = [
      // One person: first attempt in June, another in November.
      attempt({ enrollment_id: 'a', created_at: '2026-06-10T10:00:00Z' }),
      attempt({ enrollment_id: 'a', created_at: '2026-11-10T10:00:00Z' }),
      // A genuine November first-timer.
      attempt({ enrollment_id: 'b', created_at: '2026-11-12T10:00:00Z' }),
    ];

    it('does not turn a returning person into a new one', () => {
      const f = computeCheckoutFunnel(returning, { since: '2026-07-01' });
      // Person 'a' first tried in June, so they belong to June and June is outside the window.
      // Only the real first-timer should appear.
      expect(row(f, '2026-11', 'never-explorer')!.started).toBe(1);
    });

    it('without a window, the June first-timer is reported in June', () => {
      const f = computeCheckoutFunnel(returning);
      expect(row(f, '2026-06', 'never-explorer')!.started).toBe(1);
      expect(row(f, '2026-11', 'never-explorer')!.started).toBe(1);
    });

    it('drops only the periods before the window, keeping the rest intact', () => {
      const f = computeCheckoutFunnel(returning, { since: '2026-07-01' });
      expect(f.rows.map((r) => r.period)).toEqual(['2026-11']);
    });
  });

  it('supports a weekly period, which is the cadence C10.1 asks for', () => {
    const f = computeCheckoutFunnel([
      attempt({ enrollment_id: 'a', created_at: '2026-10-13T10:00:00Z' }),
      attempt({ enrollment_id: 'b', created_at: '2026-10-16T10:00:00Z' }),
      attempt({ enrollment_id: 'c', created_at: '2026-10-20T10:00:00Z' }),
    ], { period: 'week' });
    expect(f.period).toBe('week');
    expect(row(f, '2026-10-12', 'never-explorer')!.started).toBe(2);
    expect(row(f, '2026-10-19', 'never-explorer')!.started).toBe(1);
  });
});

describe('the query that feeds it', () => {
  it('reads arrival from subscriptions, never from enrollments.paysimple_customer_id', () => {
    // enrollments.paysimple_customer_id is set on only 46 of 131 paid rows, so a funnel built on
    // it reports more people paid than arrived. The SQL must not reach for it.
    expect(CHECKOUT_ATTEMPTS_SQL).toContain('FROM subscriptions s');
    expect(CHECKOUT_ATTEMPTS_SQL).not.toContain('paysimple_customer_id');
  });

  /**
   * THE ASSERTION THIS FILE MOST NEEDS. The first version of this module grouped by
   * `enrollment_type`, which `markEnrollmentPaid` rewrites to 'standard' on payment - so the
   * Explorer conversion rate was zero by definition and the standard rate was inflated by
   * exactly the people who had converted. Both numbers it produced were artifacts. The field
   * must never come back into this query.
   */
  it('NEVER selects enrollment_type, which the payment path rewrites', () => {
    expect(CHECKOUT_ATTEMPTS_SQL).not.toContain('enrollment_type');
  });

  it('takes origin from the two markers payment does not touch', () => {
    expect(CHECKOUT_ATTEMPTS_SQL).toContain('JOIN enrollments e');
    expect(CHECKOUT_ATTEMPTS_SQL).toContain('explorer_entered_at');
    expect(CHECKOUT_ATTEMPTS_SQL).toContain("cohort_type = 'explorer'");
    expect(CHECKOUT_ATTEMPTS_SQL).toContain('AS explorer_origin');
  });

  it('coalesces the origin, because a LEFT JOIN miss makes the OR null rather than false', () => {
    expect(CHECKOUT_ATTEMPTS_SQL).toContain('LEFT JOIN cohorts c');
    expect(CHECKOUT_ATTEMPTS_SQL).toMatch(/coalesce\([^)]*explorer_entered_at[\s\S]*?false\)\s*AS explorer_origin/);
  });

  it('builds no SQL by interpolation', () => {
    expect(CHECKOUT_ATTEMPTS_SQL).not.toMatch(/\$\{/);
  });

  /**
   * THE WINDOW MUST NOT TOUCH THE ROWS. A person's FIRST attempt decides their period, so
   * filtering rows by date before grouping redefines "first" as "first in the window" and
   * reports a returning person as new. Two passes over the same production data disagreeing
   * about November - 4 people versus 6 - is what exposed this.
   */
  it('has no date filter, so "first attempt" means first ever', () => {
    expect(CHECKOUT_ATTEMPTS_SQL).not.toContain('WHERE');
    expect(CHECKOUT_ATTEMPTS_SQL).not.toContain(':since');
  });
});
