/**
 * Explorer cohort routing + pay-time reconcile (CC-20260712-b4x9).
 *
 * Proves the two fixes that stop free Open House signups from scattering:
 *  - getOrCreateExplorerCohort() places every Explorer in ONE dedicated cohort
 *    (cohort_type='explorer'), deterministically — NOT the soonest-starting open
 *    cohort, which had dumped real signups into a demo cohort.
 *  - retireRedundantExplorerAccounts() withdraws a paid student's leftover free
 *    Explorer row so they show up once (paid), never also as a free prospect.
 */

jest.spyOn(console, 'log').mockImplementation(() => {});
jest.spyOn(console, 'error').mockImplementation(() => {});

jest.mock('../../config/env', () => ({ env: {} }));
jest.mock('../../models', () => ({
  __esModule: true,
  Cohort: { findOne: jest.fn(), create: jest.fn(), increment: jest.fn(), findByPk: jest.fn() },
  Enrollment: { findOne: jest.fn(), findAll: jest.fn(), create: jest.fn() },
  Lead: { findOne: jest.fn(), findOrCreate: jest.fn() },
  Campaign: { findOne: jest.fn() },
}));

import { Cohort, Enrollment } from '../../models';
import { getOrCreateExplorerCohort } from '../../services/cohortService';
import { retireRedundantExplorerAccounts } from '../../services/enrollmentService';

const cohortFindOne = Cohort.findOne as jest.Mock;
const cohortCreate = Cohort.create as jest.Mock;
const enrollmentFindAll = Enrollment.findAll as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('getOrCreateExplorerCohort', () => {
  it('reuses the existing explorer cohort (never creates a second)', async () => {
    cohortFindOne.mockResolvedValue({ id: 'explorer-1', cohort_type: 'explorer' });

    const cohort = await getOrCreateExplorerCohort();

    expect((cohort as any).id).toBe('explorer-1');
    expect(cohortFindOne).toHaveBeenCalledWith(
      expect.objectContaining({ where: { cohort_type: 'explorer' } })
    );
    expect(cohortCreate).not.toHaveBeenCalled();
  });

  it('lazily creates the explorer cohort once when none exists', async () => {
    cohortFindOne.mockResolvedValue(null);
    cohortCreate.mockResolvedValue({ id: 'explorer-new', cohort_type: 'explorer' });

    const cohort = await getOrCreateExplorerCohort();

    expect((cohort as any).id).toBe('explorer-new');
    const payload = cohortCreate.mock.calls[0][0];
    expect(payload.cohort_type).toBe('explorer');
    expect(payload.status).toBe('open');
    expect(payload.seats_taken).toBe(0);
    expect(payload.max_seats).toBeGreaterThan(1000); // effectively unlimited, no paid seats
  });
});

describe('retireRedundantExplorerAccounts', () => {
  function stray(id: string) {
    return { id, notes: 'Open House Explorer', update: jest.fn().mockResolvedValue(undefined) };
  }

  it('withdraws every active Explorer row except the paid one', async () => {
    const a = stray('exp-a');
    const paid = stray('paid-1');
    enrollmentFindAll.mockResolvedValue([a, paid]);

    await retireRedundantExplorerAccounts('Jane@Acme.com', 'paid-1');

    // only queried active explorer rows for the (lowercased) email
    expect(enrollmentFindAll).toHaveBeenCalledWith({
      where: { email: 'jane@acme.com', enrollment_type: 'explorer', status: 'active' },
    });
    // the stray is withdrawn; the paid row is skipped
    expect(a.update).toHaveBeenCalledTimes(1);
    expect(a.update.mock.calls[0][0].status).toBe('withdrawn');
    expect(paid.update).not.toHaveBeenCalled();
  });

  it('is a no-op (idempotent) when no active Explorer strays remain', async () => {
    enrollmentFindAll.mockResolvedValue([]);
    await expect(retireRedundantExplorerAccounts('x@y.com', 'paid-1')).resolves.toBeUndefined();
  });
});
