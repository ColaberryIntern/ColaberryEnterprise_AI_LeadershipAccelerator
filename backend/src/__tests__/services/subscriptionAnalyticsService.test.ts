/**
 * subscriptionAnalyticsService unit tests.
 *
 * All DB access is a raw sequelize.query call — mocked by inspecting the SQL
 * text (the service issues exactly two distinct queries: the subscriptions+
 * enrollments join, and the Explorer/free-trial count).
 */

const mockQuery = jest.fn();

jest.mock('../../config/database', () => ({
  sequelize: { query: mockQuery },
}));

import { getSubscriptionAnalytics, SubscriptionAnalytics } from '../../services/subscriptionAnalyticsService';

type Row = {
  id: string;
  enrollment_id: string;
  plan: 'annual' | 'monthly' | 'comp';
  status: 'pending' | 'active' | 'canceled' | 'failed';
  amount_cents: number;
  started_at: string | null;
  current_period_end: string | null;
  created_at: string;
  full_name: string | null;
  email: string | null;
  enrollment_type: string | null;
};

const NOW = Date.UTC(2026, 6, 30, 12, 0, 0); // 2026-07-30 noon UTC
const DAY_MS = 24 * 60 * 60 * 1000;

const row = (overrides: Partial<Row>): Row => ({
  id: 'sub-1',
  enrollment_id: 'enr-1',
  plan: 'monthly',
  status: 'active',
  amount_cents: 19900,
  started_at: new Date(NOW - 10 * DAY_MS).toISOString(),
  current_period_end: new Date(NOW + 20 * DAY_MS).toISOString(),
  created_at: new Date(NOW - 10 * DAY_MS).toISOString(),
  full_name: 'Test Student',
  email: 'test@example.com',
  enrollment_type: 'standard',
  ...overrides,
});

/** Wire the two-query mock: subscription rows first, explorer count second. */
function mockRows(subRows: Row[], explorerCount = 0): void {
  mockQuery.mockImplementation((sql: string) => {
    if (sql.includes('FROM subscriptions')) return Promise.resolve(subRows);
    if (sql.includes("enrollment_type = 'explorer'")) return Promise.resolve([{ count: explorerCount }]);
    throw new Error(`Unexpected query: ${sql}`);
  });
}

describe('getSubscriptionAnalytics', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it('computes MRR/ARR/ARPU for a mix of annual, monthly, and comp actives', async () => {
    mockRows(
      [
        row({ enrollment_id: 'enr-annual', plan: 'annual', amount_cents: 178800 }), // $1788/yr -> $149/mo
        row({ enrollment_id: 'enr-monthly', plan: 'monthly', amount_cents: 19900 }), // $199/mo
        row({ enrollment_id: 'enr-comp', plan: 'comp', amount_cents: 0 }),
      ],
      3 // free-trial explorers
    );

    const result: SubscriptionAnalytics = await getSubscriptionAnalytics(NOW);

    expect(result.kpis.mrr).toBeCloseTo(149 + 199, 2);
    expect(result.kpis.arr).toBeCloseTo((149 + 199) * 12, 2);
    expect(result.kpis.activeSubscribers).toBe(2); // comp excluded from paying count
    expect(result.kpis.compedSeats).toBe(1);
    expect(result.kpis.arpu).toBeCloseTo((149 + 199) / 2, 2);

    const annualPlan = result.planBreakdown.find((p) => p.plan === 'annual')!;
    const monthlyPlan = result.planBreakdown.find((p) => p.plan === 'monthly')!;
    const compPlan = result.planBreakdown.find((p) => p.plan === 'comp')!;
    expect(annualPlan.count).toBe(1);
    expect(monthlyPlan.count).toBe(1);
    expect(compPlan.count).toBe(1);
    expect(compPlan.amount).toBe(0);

    expect(result.tenureFunnel[0]).toEqual(
      expect.objectContaining({ label: 'Free Trial', count: 3, retentionPct: null })
    );
  });

  it('returns all-zero output with no subscriptions and no explorers (boundary)', async () => {
    mockRows([], 0);
    const result = await getSubscriptionAnalytics(NOW);

    expect(result.kpis).toEqual({ mrr: 0, arr: 0, activeSubscribers: 0, compedSeats: 0, arpu: 0 });
    expect(result.upcomingPayments).toEqual([]);
    expect(result.attention).toEqual([]);
    expect(result.tenureFunnel[0].count).toBe(0);
  });

  it('flags a lapsed subscription (active status, period end in the past) and excludes it from upcoming payments', async () => {
    mockRows([
      row({
        enrollment_id: 'enr-lapsed',
        plan: 'monthly',
        status: 'active',
        current_period_end: new Date(NOW - 5 * DAY_MS).toISOString(),
      }),
    ]);

    const result = await getSubscriptionAnalytics(NOW);

    expect(result.upcomingPayments).toEqual([]);
    expect(result.attention).toHaveLength(1);
    expect(result.attention[0]).toEqual(
      expect.objectContaining({ enrollment_id: 'enr-lapsed', kind: 'lapsed', days_overdue: 5 })
    );
    // A lapsed subscriber still counts toward MRR/active headcount today — the
    // dashboard's job is to surface them for follow-up, not silently exclude them.
    expect(result.kpis.activeSubscribers).toBe(1);
  });

  it('flags a failed checkout attempt with no prior active subscription', async () => {
    mockRows([
      row({
        enrollment_id: 'enr-failed',
        plan: 'monthly',
        status: 'failed',
        current_period_end: null,
        started_at: null,
      }),
    ]);

    const result = await getSubscriptionAnalytics(NOW);

    expect(result.attention).toHaveLength(1);
    expect(result.attention[0]).toEqual(
      expect.objectContaining({ enrollment_id: 'enr-failed', kind: 'failed', days_overdue: 0 })
    );
    expect(result.kpis.activeSubscribers).toBe(0);
  });

  it('does not flag a failed renewal attempt when an older active subscription still covers the student', async () => {
    mockRows([
      // Newest row (a renewal attempt) failed, but an older row is still active.
      row({
        id: 'sub-2',
        enrollment_id: 'enr-covered',
        plan: 'monthly',
        status: 'failed',
        created_at: new Date(NOW - 1 * DAY_MS).toISOString(),
        started_at: null,
        current_period_end: null,
      }),
      row({
        id: 'sub-1',
        enrollment_id: 'enr-covered',
        plan: 'monthly',
        status: 'active',
        created_at: new Date(NOW - 40 * DAY_MS).toISOString(),
        started_at: new Date(NOW - 40 * DAY_MS).toISOString(),
        current_period_end: new Date(NOW + 5 * DAY_MS).toISOString(),
      }),
    ]);

    const result = await getSubscriptionAnalytics(NOW);

    expect(result.attention).toEqual([]);
    expect(result.upcomingPayments).toHaveLength(1);
  });

  it('sorts upcoming payments soonest-first', async () => {
    mockRows([
      row({ enrollment_id: 'enr-later', current_period_end: new Date(NOW + 25 * DAY_MS).toISOString() }),
      row({ enrollment_id: 'enr-sooner', current_period_end: new Date(NOW + 3 * DAY_MS).toISOString() }),
    ]);

    const result = await getSubscriptionAnalytics(NOW);

    expect(result.upcomingPayments.map((p) => p.enrollment_id)).toEqual(['enr-sooner', 'enr-later']);
  });

  it('buckets active subscribers into the correct tenure month by started_at', async () => {
    mockRows(
      [
        row({ enrollment_id: 'enr-m1', started_at: new Date(NOW - 5 * DAY_MS).toISOString() }), // Month 1
        row({ enrollment_id: 'enr-m2', started_at: new Date(NOW - 35 * DAY_MS).toISOString() }), // Month 2
        row({ enrollment_id: 'enr-m6', started_at: new Date(NOW - 200 * DAY_MS).toISOString() }), // Month 5+ tail
      ],
      2
    );

    const result = await getSubscriptionAnalytics(NOW);
    const byLabel = new Map(result.tenureFunnel.map((b) => [b.label, b]));

    expect(byLabel.get('Free Trial')!.count).toBe(2);
    expect(byLabel.get('Month 1')!.count).toBe(1);
    expect(byLabel.get('Month 2')!.count).toBe(1);
    expect(byLabel.get('Month 5+')!.count).toBe(1);
  });
});
