/**
 * revenuePaymentsService unit tests — scoped to the plan-labeling fallback
 * added alongside the subscription-dashboard fixes (most subscription rows in
 * production never reach 'active', so a real paid membership often has no
 * subscription row to label its plan from at all).
 */

const mockQuery = jest.fn();

jest.mock('../../config/database', () => ({
  sequelize: { query: mockQuery },
}));

import { getRevenuePayments } from '../../services/revenuePaymentsService';

function mockQueries({
  memberships = [] as any[],
  deposits = [] as any[],
  refunds = [] as any[],
  leads = [] as any[],
} = {}): void {
  mockQuery.mockImplementation((sql: string) => {
    if (sql.includes('FROM enrollments e') && sql.includes('LEFT JOIN LATERAL')) return Promise.resolve(memberships);
    if (sql.includes('FROM account_credits')) return Promise.resolve(deposits);
    if (sql.includes('FROM refunds')) return Promise.resolve(refunds);
    if (sql.includes('FROM leads')) return Promise.resolve(leads);
    throw new Error(`Unexpected query: ${sql}`);
  });
}

describe('getRevenuePayments — plan labeling', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it('labels the plan from the subscription row when one exists', async () => {
    mockQueries({
      memberships: [{ enrollment_id: 'e1', full_name: 'A', email: 'a@example.com', amount: 199, date: null, pid: null, plan: 'monthly', sub_status: 'active' }],
    });
    const { transactions } = await getRevenuePayments();
    expect(transactions[0].plan).toBe('Monthly');
  });

  it('falls back to inferring the plan from the amount charged when there is no subscription row (plan is null)', async () => {
    mockQueries({
      memberships: [{ enrollment_id: 'e2', full_name: 'B', email: 'b@example.com', amount: 1788, date: null, pid: null, plan: null, sub_status: null }],
    });
    const { transactions } = await getRevenuePayments();
    expect(transactions[0].plan).toBe('Annual');
  });

  it('leaves the plan null when neither a subscription row nor a recognizable amount is available', async () => {
    mockQueries({
      memberships: [{ enrollment_id: 'e3', full_name: 'C', email: 'c@example.com', amount: 4500, date: null, pid: null, plan: null, sub_status: null }],
    });
    const { transactions } = await getRevenuePayments();
    expect(transactions[0].plan).toBeNull();
  });
});
