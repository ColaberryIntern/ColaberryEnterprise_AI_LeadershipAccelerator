import { Op } from 'sequelize';

/**
 * Phase 2 T202b — the admin dashboard's Explorer exclusion, asserted for real.
 *
 * WHY THIS SUITE EXISTS. `cohortService.getDashboardStats` builds ONE filter,
 * `{ enrollment_type: { [Op.ne]: 'explorer' } }`, and reuses it for three counts.
 * When T202b gives portal free accounts `enrollment_type: 'explorer'`,
 * `totalEnrollments` and `pendingInvoice` DROP by the size of that population,
 * while `paidEnrollments` does not move because those rows are never paid.
 *
 * It needed its own suite for two reasons, both of which were mistakes caught by
 * verification rather than by me:
 *
 *  1. The filter is a Sequelize operator object, so the generated consumer
 *     enumeration's rules did not recognise it and the file was classified
 *     reporting-only — present in the artifact, and therefore passing the
 *     completeness tripwire, while silently exempt from needing a behaviour test.
 *
 *  2. My first attempt at covering it re-declared the predicate inside the test
 *     (`const excluded = (t) => t !== 'explorer'`) and asserted the copy. A
 *     verifier inverted the REAL filter to `Op.eq` and nothing in the repository
 *     failed — not this suite, not either of the two existing `cohortService`
 *     suites. A test that restates the source is documentation, not a check.
 *
 * So this drives the real function and asserts the operator object it actually
 * passes to `Enrollment.count`.
 */
const mockCount = jest.fn();
const mockCohortFindAll = jest.fn();

// `sum` as well as `count`: the function also totals revenue, and leaving it out
// made every test fail with "Enrollment.sum is not a function" — a mock gap, not
// a finding, but the same shape as the dead suite this phase repaired.
jest.mock('../../models', () => ({
  Enrollment: {
    count: (...a: unknown[]) => mockCount(...a),
    sum: jest.fn().mockResolvedValue(0),
  },
  Cohort: { findAll: (...a: unknown[]) => mockCohortFindAll(...a) },
  // The function also totals Open House deposits for the revenue figure.
  AccountCredit: { sum: jest.fn().mockResolvedValue(0) },
}));

import { getDashboardStats } from '../cohortService';

describe('getDashboardStats — the Explorer exclusion (T202b row 29)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCohortFindAll.mockResolvedValue([]);
    mockCount.mockResolvedValue(0);
  });

  it('excludes Explorers from all three enrollment counts', async () => {
    await getDashboardStats();

    expect(mockCount).toHaveBeenCalledTimes(3);
    for (const call of mockCount.mock.calls) {
      const where = call[0].where as Record<string, unknown>;
      expect(where.enrollment_type).toBeDefined();
    }
  });

  /**
   * The assertion the inverted-filter mutation needs. `Op.ne` is a symbol, so
   * this reads the operator key itself rather than a stringified shape — an
   * `Op.eq` would count ONLY Explorers, turning the dashboard's headline numbers
   * into the opposite of what they claim.
   */
  it('uses NOT-EQUAL, not equal — an inverted filter would count only Explorers', async () => {
    await getDashboardStats();

    for (const call of mockCount.mock.calls) {
      const clause = (call[0].where as Record<string, Record<symbol, unknown>>).enrollment_type;
      expect(Object.getOwnPropertySymbols(clause)).toContain(Op.ne);
      expect(Object.getOwnPropertySymbols(clause)).not.toContain(Op.eq);
      expect(clause[Op.ne]).toBe('explorer');
    }
  });

  it('totalEnrollments filters on nothing BUT the Explorer exclusion', async () => {
    await getDashboardStats();

    const total = mockCount.mock.calls[0][0].where as Record<string, unknown>;
    expect(Object.keys(total)).toEqual(['enrollment_type']);
  });

  it('paidEnrollments keeps its paid filter alongside the exclusion — it must not move', async () => {
    await getDashboardStats();

    const paid = mockCount.mock.calls[1][0].where as Record<string, unknown>;
    expect(paid.payment_status).toBe('paid');
    expect(paid.enrollment_type).toBeDefined();
  });

  it('pendingInvoice keeps both pending statuses alongside the exclusion', async () => {
    await getDashboardStats();

    const pending = mockCount.mock.calls[2][0].where as Record<string, unknown>;
    expect(pending.payment_status).toEqual(['pending', 'pending_invoice']);
    expect(pending.enrollment_type).toBeDefined();
  });

  it('the counts it returns are the ones the queries produced', async () => {
    mockCount
      .mockResolvedValueOnce(100)   // totalEnrollments
      .mockResolvedValueOnce(40)    // paidEnrollments
      .mockResolvedValueOnce(25);   // pendingInvoice

    const stats = await getDashboardStats();

    expect(stats.totalEnrollments).toBe(100);
    expect(stats.paidEnrollments).toBe(40);
    expect(stats.pendingInvoice).toBe(25);
  });
});
