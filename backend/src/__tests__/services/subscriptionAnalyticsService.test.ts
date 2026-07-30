/**
 * subscriptionAnalyticsService unit tests.
 *
 * All DB access is a raw sequelize.query call — mocked by inspecting the SQL
 * text. The service issues exactly two distinct queries: the paying-members
 * query (enrollments LEFT JOIN subscriptions) and the explorer/deposit-holder
 * count query.
 */

const mockQuery = jest.fn();

jest.mock('../../config/database', () => ({
  sequelize: { query: mockQuery },
}));

import { getSubscriptionAnalytics, SubscriptionAnalytics } from '../../services/subscriptionAnalyticsService';

type Row = {
  enrollment_id: string;
  full_name: string | null;
  email: string | null;
  amount_paid: string | null;
  sub_id: string | null;
  plan: 'annual' | 'monthly' | 'comp' | null;
  sub_status: 'pending' | 'active' | 'canceled' | 'failed' | null;
  amount_cents: number | null;
  started_at: string | null;
  current_period_end: string | null;
  sub_created_at: string | null;
};

const NOW = Date.UTC(2026, 6, 30, 12, 0, 0); // 2026-07-30 noon UTC
const DAY_MS = 24 * 60 * 60 * 1000;

const row = (overrides: Partial<Row>): Row => ({
  enrollment_id: 'enr-1',
  full_name: 'Test Student',
  email: 'test@example.com',
  amount_paid: '199.00',
  sub_id: 'sub-1',
  plan: 'monthly',
  sub_status: 'active',
  amount_cents: 19900,
  started_at: new Date(NOW - 10 * DAY_MS).toISOString(),
  current_period_end: new Date(NOW + 20 * DAY_MS).toISOString(),
  sub_created_at: new Date(NOW - 10 * DAY_MS).toISOString(),
  ...overrides,
});

/** A paid enrollment with no subscription row at all. */
const noSubRow = (overrides: Partial<Row>): Row => ({
  enrollment_id: 'enr-nosub',
  full_name: 'No Sub Student',
  email: 'nosub@example.com',
  amount_paid: null,
  sub_id: null,
  plan: null,
  sub_status: null,
  amount_cents: null,
  started_at: null,
  current_period_end: null,
  sub_created_at: null,
  ...overrides,
});

/** Wire the two-query mock: member rows first, explorer/deposit counts second. */
function mockRows(memberRows: Row[], explorerCounts = { free_trial: 0, deposit_holders: 0, deposit_cents: 0 }): void {
  mockQuery.mockImplementation((sql: string) => {
    if (sql.includes('FROM enrollments e') && sql.includes('LEFT JOIN subscriptions')) return Promise.resolve(memberRows);
    if (sql.includes("enrollment_type = 'explorer'")) return Promise.resolve([explorerCounts]);
    throw new Error(`Unexpected query: ${sql}`);
  });
}

describe('getSubscriptionAnalytics', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it('computes MRR/ARR/ARPU for a mix of annual, monthly, and comp actives (via real subscription rows)', async () => {
    mockRows([
      row({ enrollment_id: 'enr-annual', plan: 'annual', amount_cents: 178800 }), // $1788/yr -> $149/mo
      row({ enrollment_id: 'enr-monthly', plan: 'monthly', amount_cents: 19900 }), // $199/mo
      row({ enrollment_id: 'enr-comp', plan: 'comp', amount_cents: 0 }),
    ], { free_trial: 3, deposit_holders: 2, deposit_cents: 10000 });

    const result: SubscriptionAnalytics = await getSubscriptionAnalytics(NOW);

    expect(result.kpis.mrr).toBeCloseTo(149 + 199, 2);
    expect(result.kpis.arr).toBeCloseTo((149 + 199) * 12, 2);
    expect(result.kpis.activeSubscribers).toBe(2); // comp excluded from paying count
    expect(result.kpis.compedSeats).toBe(1);
    expect(result.kpis.otherPaidCount).toBe(0);
    expect(result.kpis.arpu).toBeCloseTo((149 + 199) / 2, 2);

    const byPlan = Object.fromEntries(result.planBreakdown.map((p) => [p.plan, p]));
    expect(byPlan.annual.count).toBe(1);
    expect(byPlan.monthly.count).toBe(1);
    expect(byPlan.comp.count).toBe(1);
    expect(byPlan.comp.amount).toBe(0);
    expect(byPlan.deposit_holder.count).toBe(2);
    expect(byPlan.deposit_holder.amount).toBe(100); // $50 x 2

    expect(result.tenureFunnel[0]).toEqual(
      expect.objectContaining({ label: 'Free Trial', count: 3, retentionPct: null })
    );
  });

  it('returns all-zero output with no paying members and no explorers (boundary)', async () => {
    mockRows([]);
    const result = await getSubscriptionAnalytics(NOW);

    expect(result.kpis).toEqual({ mrr: 0, arr: 0, activeSubscribers: 0, compedSeats: 0, otherPaidCount: 0, arpu: 0 });
    expect(result.upcomingPayments).toEqual([]);
    expect(result.attention).toEqual([]);
    expect(result.tenureFunnel[0].count).toBe(0);
  });

  it('counts a paid enrollment as an active subscriber even when its subscription is stuck pending (missed-webhook gap)', async () => {
    mockRows([
      row({
        enrollment_id: 'enr-pending-paid',
        plan: 'monthly',
        sub_status: 'pending',
        amount_cents: 19900,
        current_period_end: null,
        started_at: null,
      }),
    ]);

    const result = await getSubscriptionAnalytics(NOW);

    expect(result.kpis.activeSubscribers).toBe(1);
    expect(result.kpis.mrr).toBeCloseTo(199, 2);
    // No real current_period_end on the pending row, so no renewal/lapse entry.
    expect(result.upcomingPayments).toEqual([]);
    expect(result.attention).toEqual([]);
  });

  it('infers plan from amount_paid when a paid enrollment has no subscription row at all', async () => {
    mockRows([noSubRow({ amount_paid: '199.00' })]);
    const result = await getSubscriptionAnalytics(NOW);

    expect(result.kpis.activeSubscribers).toBe(1);
    expect(result.kpis.mrr).toBeCloseTo(199, 2);
    const byPlan = Object.fromEntries(result.planBreakdown.map((p) => [p.plan, p]));
    expect(byPlan.monthly.count).toBe(1);
  });

  it('buckets a paid enrollment as "other" when amount_paid matches nothing and there is no subscription row', async () => {
    mockRows([noSubRow({ amount_paid: null })]);
    const result = await getSubscriptionAnalytics(NOW);

    expect(result.kpis.activeSubscribers).toBe(0);
    expect(result.kpis.otherPaidCount).toBe(1);
    expect(result.kpis.mrr).toBe(0);
    const byPlan = Object.fromEntries(result.planBreakdown.map((p) => [p.plan, p]));
    expect(byPlan.other.count).toBe(1);
  });

  it('never shows a Free Access (comp) seat in upcoming renewals, even with a future period end', async () => {
    mockRows([
      row({ enrollment_id: 'enr-comp', plan: 'comp', amount_cents: 0, current_period_end: new Date(NOW + 3600 * DAY_MS).toISOString() }),
    ]);
    const result = await getSubscriptionAnalytics(NOW);
    expect(result.upcomingPayments).toEqual([]);
  });

  it('excludes a renewal more than 45 days out (an annual member is not "up for renewal" a year early)', async () => {
    mockRows([
      row({ enrollment_id: 'enr-annual-far', plan: 'annual', amount_cents: 178800, current_period_end: new Date(NOW + 358 * DAY_MS).toISOString() }),
    ]);
    const result = await getSubscriptionAnalytics(NOW);
    expect(result.upcomingPayments).toEqual([]);
    expect(result.attention).toEqual([]); // still active and in the future — not lapsed either
  });

  it('includes a renewal within the 45-day horizon', async () => {
    mockRows([
      row({ enrollment_id: 'enr-soon', plan: 'monthly', current_period_end: new Date(NOW + 10 * DAY_MS).toISOString() }),
    ]);
    const result = await getSubscriptionAnalytics(NOW);
    expect(result.upcomingPayments).toHaveLength(1);
    expect(result.upcomingPayments[0].enrollment_id).toBe('enr-soon');
  });

  it('flags a lapsed subscription (active status, period end in the past)', async () => {
    mockRows([
      row({ enrollment_id: 'enr-lapsed', plan: 'monthly', current_period_end: new Date(NOW - 5 * DAY_MS).toISOString() }),
    ]);
    const result = await getSubscriptionAnalytics(NOW);
    expect(result.upcomingPayments).toEqual([]);
    expect(result.attention).toHaveLength(1);
    expect(result.attention[0]).toEqual(expect.objectContaining({ enrollment_id: 'enr-lapsed', kind: 'lapsed', days_overdue: 5 }));
  });

  it('flags a failed checkout attempt, still counting the member as paying via their enrollment amount_paid (their only subscription row is failed, so it cannot supply the plan)', async () => {
    mockRows([
      row({ enrollment_id: 'enr-failed', amount_paid: '199.00', plan: 'monthly', sub_status: 'failed', current_period_end: null, started_at: null }),
    ]);
    const result = await getSubscriptionAnalytics(NOW);
    expect(result.attention).toHaveLength(1);
    expect(result.attention[0]).toEqual(expect.objectContaining({ enrollment_id: 'enr-failed', kind: 'failed', days_overdue: 0 }));
    expect(result.kpis.activeSubscribers).toBe(1); // inferred monthly from amount_paid, not the failed row's own plan
  });

  it('does not flag a failed renewal attempt when an older subscription row is still active', async () => {
    mockRows([
      row({
        enrollment_id: 'enr-covered', sub_id: 'sub-2', plan: 'monthly', sub_status: 'failed',
        sub_created_at: new Date(NOW - 1 * DAY_MS).toISOString(), current_period_end: null, started_at: null,
      }),
      row({
        enrollment_id: 'enr-covered', sub_id: 'sub-1', plan: 'monthly', sub_status: 'active',
        sub_created_at: new Date(NOW - 40 * DAY_MS).toISOString(),
        started_at: new Date(NOW - 40 * DAY_MS).toISOString(),
        current_period_end: new Date(NOW + 5 * DAY_MS).toISOString(),
      }),
    ]);
    const result = await getSubscriptionAnalytics(NOW);
    expect(result.attention).toEqual([]);
    expect(result.upcomingPayments).toHaveLength(1);
  });

  it('buckets active subscribers into the correct tenure month by started_at', async () => {
    mockRows([
      row({ enrollment_id: 'enr-m1', started_at: new Date(NOW - 5 * DAY_MS).toISOString() }), // Month 1
      row({ enrollment_id: 'enr-m2', started_at: new Date(NOW - 35 * DAY_MS).toISOString() }), // Month 2
      row({ enrollment_id: 'enr-m6', started_at: new Date(NOW - 200 * DAY_MS).toISOString() }), // Month 5+ tail
    ], { free_trial: 2, deposit_holders: 0, deposit_cents: 0 });

    const result = await getSubscriptionAnalytics(NOW);
    const byLabel = new Map(result.tenureFunnel.map((b) => [b.label, b]));

    expect(byLabel.get('Free Trial')!.count).toBe(2);
    expect(byLabel.get('Month 1')!.count).toBe(1);
    expect(byLabel.get('Month 2')!.count).toBe(1);
    expect(byLabel.get('Month 5+')!.count).toBe(1);
  });
});
