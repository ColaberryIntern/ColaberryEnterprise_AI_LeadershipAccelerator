/**
 * Scoping the delivery board to interns.
 *
 * Ali, 2026-09-29: "I need to be able to see all of the projects at least to
 * the level I see them in the class."
 *
 * The rule worth a test is the one that is wrong in the obvious way: an
 * intern's enrollment still points at their CLASS cohort, because the
 * internship is a secondary `cohort_memberships` row. Filtering on
 * `e.cohort_id = <internship cohort>` returns nothing, and an empty board reads
 * as "no intern has a project" rather than as a wrong query.
 */
const mockQuery = jest.fn();
jest.mock('../../config/database', () => ({ sequelize: { query: (...a: unknown[]) => mockQuery(...a) } }));
// The service's own imports reach Sequelize model definitions at module load.
// Stubbed because this suite is about ONE WHERE clause and nothing it asserts
// needs a model; the early return on an empty result means none is called.
jest.mock('../acceleratorCurrentClassesService', () => ({
  DEPARTED_ENROLLMENT_STATUSES: ['withdrawn', 'removed'],
}));
jest.mock('../projectDeliveryDetail', () => ({ getReleaseSummaries: jest.fn() }));
jest.mock('../projectReleaseMeta', () => ({}));
jest.mock('../projectRiskModel', () => ({ assessPortfolio: jest.fn() }));

import { getProjectDelivery } from '../projectDeliveryService';

/** The SQL of the first call — the projects query whose WHERE clause is under test. */
const sqlOfFirstCall = (): string => String(mockQuery.mock.calls[0][0]);

beforeEach(() => {
  jest.clearAllMocks();
  // No rows: the function returns early, which is all these assertions need.
  mockQuery.mockResolvedValue([]);
});

describe('the interns filter', () => {
  it('matches on internship MEMBERSHIP, never on the enrollment cohort', async () => {
    await getProjectDelivery({ internsOnly: true });
    const sql = sqlOfFirstCall();
    expect(sql).toContain('cohort_memberships');
    expect(sql).toContain("membership_type = 'internship'");
    expect(sql).toContain("ic.cohort_type = 'ai_internship'");
  });

  it('only counts an ACTIVE membership, so a removed intern drops off the board', async () => {
    await getProjectDelivery({ internsOnly: true });
    expect(sqlOfFirstCall()).toContain("m.status = 'active'");
  });

  it('joins the membership to the project owner, not to some other enrollment', async () => {
    await getProjectDelivery({ internsOnly: true });
    expect(sqlOfFirstCall()).toContain('m.enrollment_id = p.enrollment_id');
  });

  it('is absent unless asked for, so the class board is untouched', async () => {
    await getProjectDelivery({});
    expect(sqlOfFirstCall()).not.toContain('cohort_memberships');
  });

  it('composes with a cohort filter rather than replacing it', async () => {
    await getProjectDelivery({ cohortId: 'cohort-1', internsOnly: true });
    const sql = sqlOfFirstCall();
    expect(sql).toContain('e.cohort_id = :cohortId');
    expect(sql).toContain('cohort_memberships');
  });

  it('keeps the existing exclusions, so fixtures do not return with it', async () => {
    // Withdrawn enrollments and unnamed projects are excluded for reasons the
    // query documents; an added filter must not quietly widen the board.
    await getProjectDelivery({ internsOnly: true });
    const sql = sqlOfFirstCall();
    expect(sql).toContain('p.name IS NOT NULL');
    expect(sql).toContain('NOT IN (:departed)');
  });
});
