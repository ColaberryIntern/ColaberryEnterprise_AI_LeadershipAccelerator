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

import {
  getSubscriptionAnalytics,
  getTenureBucketRoster,
  getPlanRoster,
  getDepositHolderRoster,
  getStaffRoster,
  SubscriptionAnalytics,
} from '../../services/subscriptionAnalyticsService';

type Row = {
  enrollment_id: string;
  full_name: string | null;
  email: string | null;
  amount_paid: string | null;
  enrollment_created_at: string | null;
  is_staff: boolean;
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
  enrollment_created_at: new Date(NOW - 10 * DAY_MS).toISOString(),
  is_staff: false,
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
  enrollment_created_at: null,
  is_staff: false,
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
function mockRows(
  memberRows: Row[],
  explorerCounts: { free_trial: number; deposit_holders: number; deposit_cents: number; staff?: number } = {
    free_trial: 0, deposit_holders: 0, deposit_cents: 0,
  }
): void {
  mockQuery.mockImplementation((sql: string) => {
    if (sql.includes('FROM enrollments e') && sql.includes('LEFT JOIN subscriptions')) return Promise.resolve(memberRows);
    if (sql.includes("enrollment_type = 'explorer'")) return Promise.resolve([{ staff: 0, ...explorerCounts }]);
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
      expect.objectContaining({ label: 'Explorer', count: 3, retentionPct: null })
    );
  });

  it('returns all-zero output with no paying members and no explorers (boundary)', async () => {
    mockRows([]);
    const result = await getSubscriptionAnalytics(NOW);

    expect(result.kpis).toEqual({ mrr: 0, arr: 0, activeSubscribers: 0, compedSeats: 0, otherPaidCount: 0, staffCount: 0, arpu: 0 });
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

    expect(byLabel.get('Explorer')!.count).toBe(2);
    expect(byLabel.get('Month 1')!.count).toBe(1);
    expect(byLabel.get('Month 2')!.count).toBe(1);
    expect(byLabel.get('Month 5+')!.count).toBe(1);
  });

  it('anchors tenure on the enrollment\'s own created_at when there is no subscription row at all (plan inferred from amount_paid)', async () => {
    mockRows([
      noSubRow({ amount_paid: '199.00', enrollment_created_at: new Date(NOW - 20 * DAY_MS).toISOString() }),
    ]);
    const result = await getSubscriptionAnalytics(NOW);
    const byLabel = new Map(result.tenureFunnel.map((b) => [b.label, b]));
    expect(byLabel.get('Month 1')!.count).toBe(1);
    expect(byLabel.get('Month 1')!.byPlan.monthly).toBe(1);
  });

  it('includes a member whose only subscription row is stuck pending in the tenure funnel (the "20 vs 34" bug: plan-classified members were being silently dropped from every tenure bucket)', async () => {
    mockRows([
      row({
        enrollment_id: 'enr-pending-tenure',
        plan: 'monthly',
        sub_status: 'pending', // never activated (missed webhook) — but still has a real sub_created_at
        current_period_end: null,
        started_at: null,
        sub_created_at: new Date(NOW - 5 * DAY_MS).toISOString(),
      }),
    ]);
    const result = await getSubscriptionAnalytics(NOW);
    const byLabel = new Map(result.tenureFunnel.map((b) => [b.label, b]));
    expect(byLabel.get('Month 1')!.count).toBe(1);
    expect(byLabel.get('Month 1')!.byPlan.monthly).toBe(1);
  });

  it('classifies a comped seat held by a real team member as Staff, not Free Access', async () => {
    mockRows([
      row({ enrollment_id: 'enr-staff-comp', plan: 'comp', amount_cents: 0, is_staff: true }),
    ]);
    const result = await getSubscriptionAnalytics(NOW);
    expect(result.kpis.staffCount).toBe(1);
    expect(result.kpis.compedSeats).toBe(0);
    const byPlan = Object.fromEntries(result.planBreakdown.map((p) => [p.plan, p]));
    expect(byPlan.staff.count).toBe(1);
    expect(byPlan.comp.count).toBe(0); // the comp bucket is always shown, but this staff member isn't in it
  });

  it('never anchors a staff member into the tenure funnel, and never flags them for upcoming/lapsed/failed attention', async () => {
    mockRows([
      row({
        enrollment_id: 'enr-staff-lapsed-shaped', is_staff: true, plan: 'monthly',
        current_period_end: new Date(NOW - 5 * DAY_MS).toISOString(), // would be "lapsed" if not staff
      }),
    ]);
    const result = await getSubscriptionAnalytics(NOW);
    expect(result.attention).toEqual([]);
    expect(result.upcomingPayments).toEqual([]);
    const byLabel = new Map(result.tenureFunnel.map((b) => [b.label, b]));
    expect(byLabel.get('Month 1')!.count).toBe(0);
  });

  it('adds explorer-shaped staff (internal test/onboarding signups) into staffCount via fetchExplorerCounts, on top of any staff already found among paying members', async () => {
    mockRows(
      [row({ enrollment_id: 'enr-staff-paying', is_staff: true, plan: 'monthly' })],
      { free_trial: 5, deposit_holders: 0, deposit_cents: 0, staff: 2 }
    );
    const result = await getSubscriptionAnalytics(NOW);
    expect(result.kpis.staffCount).toBe(3); // 1 from paying members + 2 explorer-shaped
    const byPlan = Object.fromEntries(result.planBreakdown.map((p) => [p.plan, p]));
    expect(byPlan.staff.count).toBe(3);
  });
});

describe('getTenureBucketRoster', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it('returns only the members anchored in the requested month, sorted by next payment date descending', async () => {
    mockRows([
      row({ enrollment_id: 'enr-m1-a', started_at: new Date(NOW - 20 * DAY_MS).toISOString(), current_period_end: new Date(NOW + 5 * DAY_MS).toISOString() }),
      row({ enrollment_id: 'enr-m1-b', started_at: new Date(NOW - 5 * DAY_MS).toISOString(), current_period_end: new Date(NOW + 25 * DAY_MS).toISOString() }),
      row({ enrollment_id: 'enr-m2', started_at: new Date(NOW - 35 * DAY_MS).toISOString() }),
    ]);
    const roster = await getTenureBucketRoster(1, NOW);
    // enr-m1-b's next payment (day 25) is later than enr-m1-a's (day 5) -> sorts first, descending.
    expect(roster.map((r) => r.enrollment_id)).toEqual(['enr-m1-b', 'enr-m1-a']);
    expect(roster[0].next_payment_date).toBe(new Date(NOW + 25 * DAY_MS).toISOString());
  });

  it('sorts members with no next payment date (e.g. lapsed) to the bottom, not the top', async () => {
    mockRows([
      row({ enrollment_id: 'enr-has-date', started_at: new Date(NOW - 5 * DAY_MS).toISOString(), current_period_end: new Date(NOW + 10 * DAY_MS).toISOString() }),
      row({ enrollment_id: 'enr-lapsed', started_at: new Date(NOW - 5 * DAY_MS).toISOString(), current_period_end: new Date(NOW - 2 * DAY_MS).toISOString() }), // lapsed -> null next_payment_date
    ]);
    const roster = await getTenureBucketRoster(1, NOW);
    expect(roster.map((r) => r.enrollment_id)).toEqual(['enr-has-date', 'enr-lapsed']);
    expect(roster[1].next_payment_date).toBeNull();
  });

  it('maps oneBasedMonth=5 to the "Month 5+" tail bucket', async () => {
    mockRows([row({ enrollment_id: 'enr-old', started_at: new Date(NOW - 400 * DAY_MS).toISOString() })]);
    const roster = await getTenureBucketRoster(5, NOW);
    expect(roster.map((r) => r.enrollment_id)).toEqual(['enr-old']);
  });

  it('excludes Explorers, Deposit Holders, and Other (unanchored) members', async () => {
    mockRows([noSubRow({ amount_paid: null })]); // classifies as 'other' — no anchor
    const roster = await getTenureBucketRoster(1, NOW);
    expect(roster).toEqual([]);
  });
});

describe('getPlanRoster', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it('returns only members of the requested plan, regardless of tenure month', async () => {
    mockRows([
      row({ enrollment_id: 'enr-annual', plan: 'annual', started_at: new Date(NOW - 5 * DAY_MS).toISOString() }),
      row({ enrollment_id: 'enr-monthly-old', plan: 'monthly', started_at: new Date(NOW - 200 * DAY_MS).toISOString() }),
      row({ enrollment_id: 'enr-monthly-new', plan: 'monthly', started_at: new Date(NOW - 5 * DAY_MS).toISOString() }),
    ]);
    const roster = await getPlanRoster('monthly', NOW);
    expect(roster.map((r) => r.enrollment_id).sort()).toEqual(['enr-monthly-new', 'enr-monthly-old'].sort());
    expect(roster.every((r) => r.plan === 'monthly')).toBe(true);
  });

  it('returns an empty roster for a plan with no members', async () => {
    mockRows([row({ enrollment_id: 'enr-annual', plan: 'annual' })]);
    const roster = await getPlanRoster('monthly', NOW);
    expect(roster).toEqual([]);
  });
});

describe('getDepositHolderRoster', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it('returns Explorers with an available Open House deposit, labeled deposit_holder', async () => {
    mockQuery.mockImplementation((sql: string) => {
      if (sql.includes('FROM enrollments e') && sql.includes('JOIN account_credits')) {
        return Promise.resolve([
          { enrollment_id: 'enr-dep', full_name: 'Deposit Person', email: 'dep@example.com', created_at: new Date(NOW - 3 * DAY_MS).toISOString(), amount_cents: 5000 },
        ]);
      }
      throw new Error(`Unexpected query: ${sql}`);
    });
    const roster = await getDepositHolderRoster();
    expect(roster).toHaveLength(1);
    expect(roster[0]).toEqual(expect.objectContaining({
      enrollment_id: 'enr-dep', plan: 'deposit_holder', monthly_amount: 50, next_payment_date: null,
    }));
  });
});

describe('getStaffRoster', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it('returns real Colaberry team members, labeled staff with no monthly amount or next payment date', async () => {
    mockQuery.mockImplementation((sql: string) => {
      if (sql.includes('FROM enrollments e') && sql.includes('cm.mgmt_role')) {
        return Promise.resolve([
          { enrollment_id: 'enr-vivek', full_name: 'Vivek', email: 'vivek@colaberry.com', created_at: new Date(NOW - 400 * DAY_MS).toISOString() },
        ]);
      }
      throw new Error(`Unexpected query: ${sql}`);
    });
    const roster = await getStaffRoster();
    expect(roster).toEqual([
      expect.objectContaining({ enrollment_id: 'enr-vivek', plan: 'staff', monthly_amount: 0, next_payment_date: null }),
    ]);
  });
});
