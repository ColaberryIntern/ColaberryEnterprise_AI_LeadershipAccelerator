/**
 * Idempotency for cohortCleanupAndNovemberSetup: calling the planners twice on
 * already-migrated state must be a no-op (every step reports "-skip", nothing
 * writes twice). Runs entirely in dry-run mode (execute=false) except the one
 * test that proves execute=true routes into the safe cohortService functions.
 */

const mockCohortFindByPk = jest.fn();
const mockCohortFindOne = jest.fn();
const mockEnrollmentFindByPk = jest.fn();
const mockAccountCreditFindOne = jest.fn();
const mockAccountCreditCreate = jest.fn();

jest.mock('../../models', () => ({
  Cohort: { findByPk: mockCohortFindByPk, findOne: mockCohortFindOne },
  Enrollment: { findByPk: mockEnrollmentFindByPk },
  AccountCredit: { findOne: mockAccountCreditFindOne, create: mockAccountCreditCreate },
}));

const mockGetCohortDependents = jest.fn();
const mockDeleteCohort = jest.fn();
const mockCreateCohort = jest.fn();

jest.mock('../../services/cohortService', () => ({
  getCohortDependents: mockGetCohortDependents,
  deleteCohort: mockDeleteCohort,
  createCohort: mockCreateCohort,
}));

import {
  planCohortCleanup,
  planNovemberCohort,
  planKephaMove,
  JUNK_COHORTS,
  NOVEMBER_COHORT_NAME,
  KEPHA_ENROLLMENT_ID,
  KEPHA_CREDIT_SOURCE_EVENT_ID,
} from '../cohortCleanupAndNovemberSetup';

beforeEach(() => {
  mockCohortFindByPk.mockReset();
  mockCohortFindOne.mockReset();
  mockEnrollmentFindByPk.mockReset();
  mockAccountCreditFindOne.mockReset();
  mockAccountCreditCreate.mockReset();
  mockGetCohortDependents.mockReset();
  mockDeleteCohort.mockReset();
  mockCreateCohort.mockReset();
});

describe('planCohortCleanup', () => {
  it('plans a delete for a cohort that still exists with only safe dependents', async () => {
    mockCohortFindByPk.mockResolvedValue({ id: JUNK_COHORTS[0].id });
    mockGetCohortDependents.mockResolvedValue({ enrollmentCount: 3, unsafeEnrollmentCount: 0, liveSessionCount: 0 });

    const changes = await planCohortCleanup(false);

    expect(changes.filter((c) => c.step === 'cohort-delete')).toHaveLength(3);
    expect(mockDeleteCohort).not.toHaveBeenCalled(); // dry run never writes
  });

  it('is idempotent — a second run sees the cohort already gone and skips it, does not error or re-delete', async () => {
    mockCohortFindByPk.mockResolvedValue(null); // already deleted by a prior run

    const changes = await planCohortCleanup(true);

    expect(changes.every((c) => c.step === 'cohort-delete-skip')).toBe(true);
    expect(mockDeleteCohort).not.toHaveBeenCalled();
    expect(mockGetCohortDependents).not.toHaveBeenCalled();
  });

  it('BLOCKS (never forces) a delete when a junk-cohort id unexpectedly has a real paid enrollment', async () => {
    mockCohortFindByPk.mockResolvedValue({ id: JUNK_COHORTS[0].id });
    mockGetCohortDependents.mockResolvedValue({ enrollmentCount: 1, unsafeEnrollmentCount: 1, liveSessionCount: 0 });

    const changes = await planCohortCleanup(true);

    expect(changes[0].step).toBe('cohort-delete-BLOCKED');
    expect(mockDeleteCohort).not.toHaveBeenCalled();
  });

  it('execute=true calls the safe deleteCohort() service function (never force) for each safe cohort', async () => {
    mockCohortFindByPk.mockResolvedValue({ id: 'x' });
    mockGetCohortDependents.mockResolvedValue({ enrollmentCount: 0, unsafeEnrollmentCount: 0, liveSessionCount: 0 });
    mockDeleteCohort.mockResolvedValue({ deleted: true, cohortId: 'x', dependents: {} });

    await planCohortCleanup(true);

    expect(mockDeleteCohort).toHaveBeenCalledTimes(JUNK_COHORTS.length);
    for (const call of mockDeleteCohort.mock.calls) {
      expect(call[1]).toBeUndefined(); // no { force: true } ever passed
    }
  });
});

describe('planNovemberCohort', () => {
  it('plans a create when no cohort with that name exists yet', async () => {
    mockCohortFindOne.mockResolvedValue(null);

    const { changes, cohortId } = await planNovemberCohort(false);

    expect(changes[0].step).toBe('november-cohort-create');
    expect(cohortId).toBeNull();
    expect(mockCreateCohort).not.toHaveBeenCalled();
  });

  it('is idempotent — reuses the existing November cohort by name instead of creating a duplicate', async () => {
    mockCohortFindOne.mockResolvedValue({ id: 'nov-1', name: NOVEMBER_COHORT_NAME });

    const { changes, cohortId } = await planNovemberCohort(true);

    expect(changes[0].step).toBe('november-cohort-skip');
    expect(cohortId).toBe('nov-1');
    expect(mockCreateCohort).not.toHaveBeenCalled();
  });

  it('execute=true actually creates the cohort when absent and returns its new id', async () => {
    mockCohortFindOne.mockResolvedValue(null);
    mockCreateCohort.mockResolvedValue({ id: 'new-nov-id' });

    const { cohortId } = await planNovemberCohort(true);

    expect(mockCreateCohort).toHaveBeenCalledWith(expect.objectContaining({ name: NOVEMBER_COHORT_NAME, start_date: '2026-11-12' }));
    expect(cohortId).toBe('new-nov-id');
  });
});

describe('planKephaMove', () => {
  it('plans the cohort move + credit grant when neither has happened yet', async () => {
    mockEnrollmentFindByPk.mockResolvedValue({ id: KEPHA_ENROLLMENT_ID, cohort_id: 'july-cohort', access_starts_at: null, update: jest.fn() });
    mockAccountCreditFindOne.mockResolvedValue(null);

    const changes = await planKephaMove(false, 'nov-1');

    expect(changes.find((c) => c.step === 'kepha-move')).toBeTruthy();
    expect(changes.find((c) => c.step === 'kepha-credit')).toBeTruthy();
  });

  it('is idempotent — skips both the move and the credit grant once already applied', async () => {
    mockEnrollmentFindByPk.mockResolvedValue({
      id: KEPHA_ENROLLMENT_ID,
      cohort_id: 'nov-1',
      access_starts_at: '2026-11-12',
      update: jest.fn(),
    });
    mockAccountCreditFindOne.mockResolvedValue({ id: 'existing-credit', source_event_id: KEPHA_CREDIT_SOURCE_EVENT_ID });

    const changes = await planKephaMove(true, 'nov-1');

    expect(changes.find((c) => c.step === 'kepha-move-skip')).toBeTruthy();
    expect(changes.find((c) => c.step === 'kepha-credit-skip')).toBeTruthy();
    expect(mockAccountCreditCreate).not.toHaveBeenCalled();
  });

  it('execute=true actually moves the enrollment and grants exactly one credit row', async () => {
    const update = jest.fn().mockResolvedValue(undefined);
    mockEnrollmentFindByPk.mockResolvedValue({ id: KEPHA_ENROLLMENT_ID, cohort_id: 'july-cohort', access_starts_at: null, update });
    mockAccountCreditFindOne.mockResolvedValue(null);
    mockAccountCreditCreate.mockResolvedValue({ id: 'new-credit' });

    await planKephaMove(true, 'nov-1');

    expect(update).toHaveBeenCalledWith({ cohort_id: 'nov-1', access_starts_at: '2026-11-12' });
    expect(mockAccountCreditCreate).toHaveBeenCalledTimes(1);
    expect(mockAccountCreditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        enrollment_id: KEPHA_ENROLLMENT_ID,
        amount_cents: 19900,
        reason: 'cohort_postponement_credit',
        source_event_id: KEPHA_CREDIT_SOURCE_EVENT_ID,
        status: 'available',
      })
    );
  });

  it('reports an error (never throws/crashes) when the enrollment id is not found', async () => {
    mockEnrollmentFindByPk.mockResolvedValue(null);
    mockAccountCreditFindOne.mockResolvedValue(null);

    const changes = await planKephaMove(false, 'nov-1');

    expect(changes.find((c) => c.step === 'kepha-move-ERROR')).toBeTruthy();
  });
});
