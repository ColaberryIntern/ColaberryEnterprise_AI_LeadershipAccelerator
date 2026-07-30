/**
 * requestMagicLink's enrollment-selection logic. Regression for a real
 * incident (2026-07-30): a student's real, older, paid 'standard' enrollment
 * lost to a newer 'explorer' duplicate under a recency-only ORDER BY,
 * silently routing their own login into the free-preview shadow account
 * (hiding paid access and any account credit tied to the real row). Found
 * and manually fixed for 3 students; this closes the class of bug so a
 * future manual reconciliation that forgets to retire the stray Explorer
 * row can't reintroduce it.
 */

jest.spyOn(console, 'error').mockImplementation(() => undefined);
jest.spyOn(console, 'log').mockImplementation(() => undefined);

jest.mock('../../config/env', () => ({ env: { jwtSecret: 'test-secret' } }));

jest.mock('../../models', () => ({
  __esModule: true,
  Enrollment: { findAll: jest.fn(), findOne: jest.fn() },
  Cohort: { findByPk: jest.fn() },
}));

const mockSendPortalMagicLink = jest.fn();
jest.mock('../../services/emailService', () => ({
  sendPortalMagicLink: (...a: any[]) => mockSendPortalMagicLink(...a),
}));

import { Enrollment, Cohort } from '../../models';
import { pickBestEnrollment, requestMagicLink } from '../../services/participantService';

const enrFindAll = Enrollment.findAll as jest.Mock;
const cohortFindByPk = Cohort.findByPk as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  cohortFindByPk.mockResolvedValue({ name: 'Cohort - July 2026' });
  mockSendPortalMagicLink.mockResolvedValue(undefined);
});

describe('pickBestEnrollment', () => {
  it('prefers a real (non-explorer) enrollment over a newer Explorer duplicate', () => {
    const real = { id: 'real', enrollment_type: 'standard', payment_status: 'paid', created_at: '2026-07-07T00:00:00Z' };
    const explorer = { id: 'explorer', enrollment_type: 'explorer', payment_status: 'pending', created_at: '2026-07-24T00:00:00Z' };
    expect(pickBestEnrollment([explorer, real])?.id).toBe('real');
    expect(pickBestEnrollment([real, explorer])?.id).toBe('real');
  });

  it('prefers paid over pending among same-type candidates', () => {
    const paid = { id: 'paid', enrollment_type: 'standard', payment_status: 'paid', created_at: '2026-07-01T00:00:00Z' };
    const pending = { id: 'pending', enrollment_type: 'standard', payment_status: 'pending', created_at: '2026-07-15T00:00:00Z' };
    expect(pickBestEnrollment([pending, paid])?.id).toBe('paid');
  });

  it('falls back to most recent when type and payment status tie', () => {
    const older = { id: 'older', enrollment_type: 'standard', payment_status: 'pending', created_at: '2026-07-01T00:00:00Z' };
    const newer = { id: 'newer', enrollment_type: 'standard', payment_status: 'pending', created_at: '2026-07-15T00:00:00Z' };
    expect(pickBestEnrollment([older, newer])?.id).toBe('newer');
  });

  it('returns null for an empty candidate list', () => {
    expect(pickBestEnrollment([])).toBeNull();
  });
});

describe('requestMagicLink', () => {
  it('sends the link to the real enrollment, not a newer Explorer duplicate', async () => {
    const real = {
      id: 'real', email: 'student@example.com', full_name: 'Student', cohort_id: 'cohort-1',
      enrollment_type: 'standard', payment_status: 'paid', created_at: '2026-07-07T00:00:00Z',
      update: jest.fn().mockResolvedValue(undefined),
    };
    const explorer = {
      id: 'explorer', email: 'student@example.com', full_name: 'Student', cohort_id: 'explorer-cohort',
      enrollment_type: 'explorer', payment_status: 'pending', created_at: '2026-07-24T00:00:00Z',
      update: jest.fn().mockResolvedValue(undefined),
    };
    enrFindAll.mockResolvedValue([explorer, real]);

    const result = await requestMagicLink('student@example.com');

    expect(result.success).toBe(true);
    expect(real.update).toHaveBeenCalledWith(expect.objectContaining({ portal_token: expect.any(String) }));
    expect(explorer.update).not.toHaveBeenCalled();
    expect(mockSendPortalMagicLink).toHaveBeenCalledWith(expect.objectContaining({ to: 'student@example.com' }));
  });
});
