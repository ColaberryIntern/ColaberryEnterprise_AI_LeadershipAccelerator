/**
 * cohortService.getDashboardStats — scoped to the canonical Revenue KPI's
 * status filter (this file's models are Sequelize models, not raw SQL, so
 * the mock is per-model-method rather than SQL-text matching).
 */

const mockEnrollmentSum = jest.fn();
const mockEnrollmentCount = jest.fn();
const mockAccountCreditSum = jest.fn();
const mockCohortFindAll = jest.fn();

jest.mock('../../models', () => ({
  Cohort: { findAll: mockCohortFindAll },
  Enrollment: { sum: mockEnrollmentSum, count: mockEnrollmentCount },
  AccountCredit: { sum: mockAccountCreditSum },
}));

import { getDashboardStats } from '../../services/cohortService';

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
