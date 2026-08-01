/**
 * cohortService.getDashboardStats — scoped to the canonical Revenue KPI's
 * status filter (this file's models are Sequelize models, not raw SQL, so
 * the mock is per-model-method rather than SQL-text matching).
 */

const mockEnrollmentSum = jest.fn();
const mockEnrollmentCount = jest.fn();
const mockEnrollmentFindAll = jest.fn();
const mockAccountCreditSum = jest.fn();
const mockCohortFindAll = jest.fn();
const mockCohortFindByPk = jest.fn();
const mockCohortCreate = jest.fn();
const mockLiveSessionCount = jest.fn();

jest.mock('../../models', () => ({
  Cohort: {
    findAll: mockCohortFindAll,
    findByPk: mockCohortFindByPk,
    create: mockCohortCreate,
  },
  Enrollment: { sum: mockEnrollmentSum, count: mockEnrollmentCount, findAll: mockEnrollmentFindAll },
  AccountCredit: { sum: mockAccountCreditSum },
  LiveSession: { count: mockLiveSessionCount },
}));

import {
  getDashboardStats,
  listAllCohorts,
  createCohort,
  deleteCohort,
  getCohortDependents,
} from '../../services/cohortService';

describe('getDashboardStats', () => {
  beforeEach(() => {
    mockCohortFindAll.mockReset().mockResolvedValue([]);
    mockEnrollmentCount.mockReset().mockResolvedValue(0);
    mockEnrollmentSum.mockReset().mockResolvedValue(1788);
    mockAccountCreditSum.mockReset().mockResolvedValue(0);
  });

  it('excludes withdrawn (duplicate-resolved) enrollments from the membership revenue sum', async () => {
    await getDashboardStats();
    expect(mockEnrollmentSum).toHaveBeenCalledWith(
      'amount_paid',
      expect.objectContaining({ where: expect.objectContaining({ payment_status: 'paid', status: 'active' }) })
    );
  });

  it('reports the summed membership revenue plus available deposits as totalRevenue', async () => {
    mockEnrollmentSum.mockResolvedValue(1788);
    mockAccountCreditSum.mockResolvedValue(5000); // cents
    const result = await getDashboardStats();
    expect(result.totalRevenue).toBeCloseTo(1788 + 50, 2);
  });

  it('treats a null sum (no paid enrollments) as zero revenue, not NaN', async () => {
    mockEnrollmentSum.mockResolvedValue(null);
    mockAccountCreditSum.mockResolvedValue(null);
    const result = await getDashboardStats();
    expect(result.totalRevenue).toBe(0);
  });
});

function fakeCohort(overrides: Record<string, any>) {
  const data = { max_seats: 50, seats_taken: 0, status: 'open', ...overrides };
  return { ...data, toJSON: () => data };
}

describe('listAllCohorts — real enrolled_count (regression for the Explorer-Prospects stat bug)', () => {
  beforeEach(() => {
    mockCohortFindAll.mockReset();
    mockEnrollmentFindAll.mockReset();
  });

  it("reports a real headcount for the Explorer cohort even though seats_taken never increments for it", async () => {
    mockCohortFindAll.mockResolvedValue([
      fakeCohort({ id: 'explorer-1', name: 'Explorer — Prospects', cohort_type: 'explorer', seats_taken: 0, max_seats: 100000 }),
    ]);
    // grouped COUNT query result, as Sequelize would return it with raw:true
    mockEnrollmentFindAll.mockResolvedValue([{ cohort_id: 'explorer-1', count: '230' }]);

    const result = await listAllCohorts();

    expect(result[0].enrolled_count).toBe(230);
    expect(result[0].seats_taken).toBe(0); // unchanged — seats_taken keeps its own (correct) capacity meaning
  });

  it('groups active enrollments by cohort_id and does not leak one cohort\'s count into another', async () => {
    mockCohortFindAll.mockResolvedValue([
      fakeCohort({ id: 'july-1', name: 'Cohort - July 2026' }),
      fakeCohort({ id: 'explorer-1', name: 'Explorer — Prospects' }),
    ]);
    mockEnrollmentFindAll.mockResolvedValue([
      { cohort_id: 'july-1', count: '52' },
      { cohort_id: 'explorer-1', count: '230' },
    ]);

    const result = await listAllCohorts();

    expect(result.find((c: any) => c.id === 'july-1')!.enrolled_count).toBe(52);
    expect(result.find((c: any) => c.id === 'explorer-1')!.enrolled_count).toBe(230);
  });

  it('defaults to 0 for a cohort with no active enrollments at all (no count row returned)', async () => {
    mockCohortFindAll.mockResolvedValue([fakeCohort({ id: 'empty-1', name: 'Brand New Cohort' })]);
    mockEnrollmentFindAll.mockResolvedValue([]);

    const result = await listAllCohorts();

    expect(result[0].enrolled_count).toBe(0);
  });

  it('only counts active enrollments (withdrawn/pending excluded via the where clause)', async () => {
    mockCohortFindAll.mockResolvedValue([fakeCohort({ id: 'c1' })]);
    mockEnrollmentFindAll.mockResolvedValue([{ cohort_id: 'c1', count: '5' }]);

    await listAllCohorts();

    expect(mockEnrollmentFindAll).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ status: 'active' }) })
    );
  });

  it('includes the parent Course (ProgramBlueprint) so the admin UI can show the Course -> Cohort hierarchy', async () => {
    mockCohortFindAll.mockResolvedValue([fakeCohort({ id: 'c1' })]);
    mockEnrollmentFindAll.mockResolvedValue([]);

    await listAllCohorts();

    expect(mockCohortFindAll).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.arrayContaining([expect.objectContaining({ as: 'program' })]),
      })
    );
  });
});

describe('createCohort', () => {
  beforeEach(() => {
    mockCohortCreate.mockReset().mockImplementation(async (data: any) => ({ id: 'new-cohort-id', ...data }));
  });

  it('creates a cohort with sensible defaults (seats_taken=0, status=open) that the caller can override', async () => {
    const cohort: any = await createCohort({
      name: 'Cohort - November 2026',
      start_date: '2026-11-12',
      core_day: 'Wednesday',
      core_time: 'Evening',
    } as any);

    expect(mockCohortCreate).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Cohort - November 2026', start_date: '2026-11-12', seats_taken: 0, status: 'open' })
    );
    expect(cohort.id).toBe('new-cohort-id');
  });

  it('lets an explicit status override the open default', async () => {
    await createCohort({
      name: 'Closed Test Cohort',
      start_date: '2026-01-01',
      core_day: 'Monday',
      core_time: 'Evening',
      status: 'closed',
    } as any);

    expect(mockCohortCreate).toHaveBeenCalledWith(expect.objectContaining({ status: 'closed' }));
  });
});

describe('getCohortDependents / deleteCohort — safe-delete guard', () => {
  beforeEach(() => {
    mockCohortFindByPk.mockReset();
    mockEnrollmentFindAll.mockReset();
    mockLiveSessionCount.mockReset().mockResolvedValue(0);
  });

  it('throws 404 when the cohort does not exist', async () => {
    mockCohortFindByPk.mockResolvedValue(null);
    await expect(deleteCohort('missing-id')).rejects.toMatchObject({ statusCode: 404 });
  });

  it('blocks (without force) a cohort that has a non-withdrawn enrollment with a real payment', async () => {
    mockCohortFindByPk.mockResolvedValue({ id: 'c1', destroy: jest.fn() });
    mockEnrollmentFindAll.mockResolvedValue([
      { status: 'active', amount_paid: 199 },
    ]);

    const result = await deleteCohort('c1');

    expect(result.deleted).toBe(false);
    if (!result.deleted) {
      expect(result.dependents.unsafeEnrollmentCount).toBe(1);
    }
  });

  it('allows deletion (no force needed) when every dependent enrollment is withdrawn or unpaid', async () => {
    const destroy = jest.fn().mockResolvedValue(undefined);
    mockCohortFindByPk.mockResolvedValue({ id: 'c1', destroy });
    mockEnrollmentFindAll.mockResolvedValue([
      { status: 'withdrawn', amount_paid: 199 }, // withdrawn — safe even though paid
      { status: 'active', amount_paid: null }, // unpaid — safe
    ]);

    const result = await deleteCohort('c1');

    expect(result.deleted).toBe(true);
    expect(destroy).toHaveBeenCalled();
  });

  it('force=true overrides the block and deletes anyway', async () => {
    const destroy = jest.fn().mockResolvedValue(undefined);
    mockCohortFindByPk.mockResolvedValue({ id: 'c1', destroy });
    mockEnrollmentFindAll.mockResolvedValue([{ status: 'active', amount_paid: 1788 }]);

    const result = await deleteCohort('c1', { force: true });

    expect(result.deleted).toBe(true);
    expect(destroy).toHaveBeenCalled();
  });

  it('blocks when there are zero unsafe enrollments but a live session still exists', async () => {
    mockCohortFindByPk.mockResolvedValue({ id: 'c1', destroy: jest.fn() });
    mockEnrollmentFindAll.mockResolvedValue([]);
    mockLiveSessionCount.mockResolvedValue(2);

    const result = await deleteCohort('c1');

    expect(result.deleted).toBe(false);
  });

  it('getCohortDependents reports raw counts independent of the block decision', async () => {
    mockEnrollmentFindAll.mockResolvedValue([
      { status: 'withdrawn', amount_paid: 50 },
      { status: 'active', amount_paid: 1788 },
    ]);
    mockLiveSessionCount.mockResolvedValue(3);

    const dependents = await getCohortDependents('c1');

    expect(dependents).toEqual({ enrollmentCount: 2, unsafeEnrollmentCount: 1, liveSessionCount: 3 });
  });
});
