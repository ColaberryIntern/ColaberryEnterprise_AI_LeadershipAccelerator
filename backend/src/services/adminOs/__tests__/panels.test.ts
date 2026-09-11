/**
 * Panel logic that is NOT SQL.
 *
 * These tests exist because of a specific failure: thirteen tests once passed
 * against a query that could not parse, since they mocked `sequelize.query`.
 * Mocking the database can only ever test the logic AROUND the query — so that
 * is all these claim to test, and the SQL itself is verified against production
 * before shipping (see the person-360 skill).
 *
 * The three things worth protecting here are the ones that have actually gone
 * wrong: absent rendered as zero, a failure count that means the wrong thing,
 * and an account type derived in the wrong order.
 */

const mockQuery = jest.fn();
jest.mock('../../../config/database', () => ({
  sequelize: { query: (...args: unknown[]) => mockQuery(...args) },
}));

// Plain imports: jest.mock is hoisted above them, so the mock is in place
// before these modules resolve `../../../config/database`.
import { loadClassActivity, loadCurriculum } from '../panels/classPanels';
import { loadAccount, loadBillingDetail } from '../panels/accountPanels';

beforeEach(() => mockQuery.mockReset());

describe('empty id lists never reach the database', () => {
  const loaders: Array<[string, (ids: string[]) => Promise<unknown>]> = [
    ['loadClassActivity', loadClassActivity],
    ['loadCurriculum', loadCurriculum],
    ['loadBillingDetail', loadBillingDetail],
  ];

  it.each(loaders)('%s returns null and issues no query', async (_name, fn) => {
    await expect(fn([])).resolves.toBeNull();
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('loadAccount returns null only when BOTH id lists are empty', async () => {
    await expect(loadAccount([], [])).resolves.toBeNull();
    expect(mockQuery).not.toHaveBeenCalled();
  });
});

describe('attendance: absent is not zero', () => {
  it('reports a null rate when no register was ever taken', async () => {
    mockQuery
      .mockResolvedValueOnce([])                                    // byStatus
      .mockResolvedValueOnce([])                                    // sessions
      .mockResolvedValueOnce([{ presence: '0', polls: '0', pulse: '0', last_seen: null }]);

    const panel = await loadClassActivity(['e1']);

    // The whole point: null, not 0. Zero would claim nobody attended.
    expect(panel!.attendanceRate).toBeNull();
    expect(panel!.attendanceTotal).toBe(0);
  });

  it('counts late as attended, because they were in the room', async () => {
    mockQuery
      .mockResolvedValueOnce([
        { status: 'present', count: '7' },
        { status: 'late', count: '2' },
        { status: 'absent', count: '1' },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ presence: '4', polls: '1', pulse: '0', last_seen: null }]);

    const panel = await loadClassActivity(['e1']);

    expect(panel!.attendanceTotal).toBe(10);
    expect(panel!.attendanceRate).toBe(90);
  });
});

describe('curriculum completion', () => {
  it('is null when the person has no progress rows at all', async () => {
    mockQuery
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ taken: '0', avg_score: null, attempts: '0', weeks: '0' }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ reflections: '0', surveys: '0' }]);

    const panel = await loadCurriculum(['e1']);

    expect(panel!.completionRate).toBeNull();
    expect(panel!.averageQuizScore).toBeNull();
  });

  it('computes completion over every card the person has a row for', async () => {
    mockQuery
      .mockResolvedValueOnce([
        { status: 'available', count: '914' },
        { status: 'completed', count: '217' },
      ])
      .mockResolvedValueOnce([{ taken: '12', avg_score: '84.25', attempts: '19', weeks: '9' }])
      .mockResolvedValueOnce([{ title: 'Week 3 lab', type: 'build', week: 3, at: '2026-08-01' }])
      .mockResolvedValueOnce([{ reflections: '5', surveys: '2' }]);

    const panel = await loadCurriculum(['e1']);

    expect(panel!.total).toBe(1131);
    expect(panel!.completed).toBe(217);
    expect(panel!.completionRate).toBe(19);
    expect(panel!.averageQuizScore).toBe(84.3);
  });
});

describe('subscription failures', () => {
  /** Rows arrive newest first, which is what makes the loop below meaningful. */
  const rows = (statuses: string[]) =>
    statuses.map((status, i) => ({
      id: `s${i}`, plan: 'monthly', status, amountCents: 19900,
      startedAt: null, currentPeriodEnd: null, canceledAt: null,
      cancelReason: null, appliedCreditCents: null, paysimple_customer_id: 'ps1',
    }));

  const money = [{ credits: '0', refunds: '0' }];

  it('counts only the failures that follow the most recent success', async () => {
    // Someone who struggled, then paid, then struggled again twice. The two
    // recent failures are the actionable signal; the older one is history.
    mockQuery
      .mockResolvedValueOnce(rows(['failed', 'failed', 'active', 'failed']))
      .mockResolvedValueOnce(money)
      .mockResolvedValueOnce([]);

    const panel = await loadBillingDetail(['e1']);

    expect(panel!.failedCount).toBe(3);
    expect(panel!.failuresSinceLastSuccess).toBe(2);
  });

  it('is zero when the newest row is a success', async () => {
    mockQuery
      .mockResolvedValueOnce(rows(['active', 'failed', 'failed']))
      .mockResolvedValueOnce(money)
      .mockResolvedValueOnce([]);

    const panel = await loadBillingDetail(['e1']);

    expect(panel!.failuresSinceLastSuccess).toBe(0);
    expect(panel!.activeCount).toBe(1);
  });

  it('flags a person whose only rows are failures', async () => {
    mockQuery
      .mockResolvedValueOnce(rows(['failed', 'failed', 'failed']))
      .mockResolvedValueOnce(money)
      .mockResolvedValueOnce([]);

    const panel = await loadBillingDetail(['e1']);

    expect(panel!.failuresSinceLastSuccess).toBe(3);
    expect(panel!.activeCount).toBe(0);
    expect(panel!.currentPeriodEnd).toBeNull();
  });
});

describe('account type', () => {

  async function accountFor(opts: { owns?: unknown[]; memberOf?: unknown[]; sponsor?: unknown[] }) {
    mockQuery
      .mockResolvedValueOnce(opts.owns ?? [])       // owns
      .mockResolvedValueOnce(opts.memberOf ?? [])   // memberOf
      .mockResolvedValueOnce([])                    // tenantContext
      .mockResolvedValueOnce(opts.sponsor ?? []);   // sponsor
    return loadAccount(['e1'], [1]);
  }

  it('owning an organisation outranks membership of another', async () => {
    const panel = await accountFor({
      owns: [{ id: 'o1', name: 'Acme', status: 'active', member_count: '4' }],
      memberOf: [{ orgId: 'o2', orgName: 'Other' }],
    });
    expect(panel!.accountType).toBe('organisation_owner');
    expect(panel!.owns[0].memberCount).toBe(4);
  });

  it('falls back to membership when they own nothing', async () => {
    const panel = await accountFor({ memberOf: [{ orgId: 'o2', orgName: 'Other' }] });
    expect(panel!.accountType).toBe('organisation_member');
  });

  it('reports an individual when there is no commercial relationship', async () => {
    const panel = await accountFor({});
    expect(panel!.accountType).toBe('individual');
  });
});
