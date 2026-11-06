import { Op } from 'sequelize';

/**
 * Phase 2 T202b — the admin dashboard's Explorer exclusion, asserted for real.
 *
 * WHY THIS SUITE EXISTS. `cohortService.getDashboardStats` issues three counts whose
 * Explorer exclusions must each be exactly right. When T202b gives portal free accounts
 * `enrollment_type: 'explorer'`, `totalEnrollments` and `pendingInvoice` DROP by the size
 * of that population, while `paidEnrollments` does not move because those rows are never
 * paid.
 *
 * UPDATED when `enrollment_type` became an ORIGIN field. It used to build ONE filter,
 * `{ enrollment_type: { [Op.ne]: 'explorer' } }`, and reuse it for all three counts. That
 * sharing was only sound while "is an Explorer" implied "has not paid". It no longer does,
 * so the three counts now carry different clauses and are asserted separately:
 * `totalEnrollments` gets "not an Explorer OR paid", `paidEnrollments` gets no origin term
 * at all, and `pendingInvoice` keeps the plain exclusion because a pending row cannot be
 * paid. Note that the paragraph above still holds for paidEnrollments, but for a stronger
 * reason than before: it no longer mentions origin, so it cannot move for that reason.
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

  /**
   * UPDATED when `enrollment_type` became an ORIGIN field. The exclusion is no longer one
   * shared clause across all three counts, because the three counts do not ask the same
   * question once "Explorer" stops meaning "unpaid":
   *
   *   - totalEnrollments  -> not an Explorer OR has paid  (a paying ex-Explorer is real)
   *   - paidEnrollments   -> paid, with NO origin term    (the term here was the bug)
   *   - pendingInvoice    -> not an Explorer              (pending cannot be paid)
   *
   * Each is asserted on its own below. Against today's data all three select exactly what
   * they selected before, since no paid row carries 'explorer'.
   */
  it('still issues exactly three counts, and none of them counts free Explorers', async () => {
    await getDashboardStats();

    expect(mockCount).toHaveBeenCalledTimes(3);

    const [total, paid, pending] = mockCount.mock.calls.map(
      (c) => c[0].where as Record<string | symbol, unknown>,
    );

    // total: the compound form, so a payer survives the exclusion.
    expect(Object.getOwnPropertySymbols(total)).toContain(Op.or);
    // paid: no origin term at all - that is the point of the change.
    expect(paid.enrollment_type).toBeUndefined();
    expect(paid.payment_status).toBe('paid');
    // pending: the plain exclusion, unchanged.
    expect(pending.enrollment_type).toBeDefined();
  });

  /**
   * The assertion the inverted-filter mutation needs. `Op.ne` is a symbol, so
   * this reads the operator key itself rather than a stringified shape — an
   * `Op.eq` would count ONLY Explorers, turning the dashboard's headline numbers
   * into the opposite of what they claim.
   */
  it('uses NOT-EQUAL, not equal — an inverted filter would count only Explorers', async () => {
    await getDashboardStats();

    // Wherever the origin term appears it must still be NOT-EQUAL. `totalEnrollments` now
    // nests it inside an Op.or, so collect the clause from both shapes rather than assuming
    // a single position - an Op.eq in either place inverts the dashboard's headline numbers.
    const clauses: Array<Record<symbol, unknown>> = [];
    for (const call of mockCount.mock.calls) {
      const where = call[0].where as Record<string | symbol, any>;
      if (where.enrollment_type) clauses.push(where.enrollment_type);
      for (const branch of (where[Op.or] as Array<Record<string, any>> | undefined) ?? []) {
        if (branch.enrollment_type) clauses.push(branch.enrollment_type);
      }
    }

    // Two counts carry it: totalEnrollments (nested) and pendingInvoice (top level).
    // paidEnrollments deliberately carries none, so this must not become three.
    expect(clauses).toHaveLength(2);
    for (const clause of clauses) {
      expect(Object.getOwnPropertySymbols(clause)).toContain(Op.ne);
      expect(Object.getOwnPropertySymbols(clause)).not.toContain(Op.eq);
      expect(clause[Op.ne]).toBe('explorer');
    }
  });

  it('totalEnrollments filters on nothing BUT "not a free Explorer"', async () => {
    await getDashboardStats();

    const total = mockCount.mock.calls[0][0].where as Record<string | symbol, any>;
    // No string-keyed filters: the whole clause is the one Op.or and nothing else, so an
    // unrelated filter cannot be smuggled into the headline enrollment count.
    expect(Object.keys(total)).toEqual([]);
    expect(Object.getOwnPropertySymbols(total)).toEqual([Op.or]);

    const branches = total[Op.or] as Array<Record<string, any>>;
    expect(branches).toHaveLength(2);
    expect(branches[0].enrollment_type[Op.ne]).toBe('explorer');
    expect(branches[1]).toEqual({ payment_status: 'paid' });
  });

  it('paidEnrollments asks ONLY whether they paid — no origin term', async () => {
    await getDashboardStats();

    const paid = mockCount.mock.calls[1][0].where as Record<string, unknown>;
    expect(paid.payment_status).toBe('paid');
    // THE regression this guards. An origin term here excluded every Explorer who upgraded,
    // undercounting paid students on the dashboard while the same people were missing from
    // MRR. `payment_status` alone already answers the question.
    expect(paid.enrollment_type).toBeUndefined();
    expect(Object.keys(paid)).toEqual(['payment_status']);
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
