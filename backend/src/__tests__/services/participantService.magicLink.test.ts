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
const enrFindOne = Enrollment.findOne as jest.Mock;
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

  it('prefers a mgmt_role-flagged enrollment over a newer, paid, non-flagged duplicate (2026-07-30 incident)', () => {
    const staffOwner = {
      id: 'staff-owner', enrollment_type: 'standard', payment_status: 'pending',
      created_at: '2026-03-30T00:00:00Z', communityMember: { mgmt_role: 'owner' },
    };
    const newerPaidDuplicate = {
      id: 'newer-paid-duplicate', enrollment_type: 'standard', payment_status: 'paid',
      created_at: '2026-07-23T00:00:00Z', communityMember: null,
    };
    expect(pickBestEnrollment([newerPaidDuplicate, staffOwner])?.id).toBe('staff-owner');
    expect(pickBestEnrollment([staffOwner, newerPaidDuplicate])?.id).toBe('staff-owner');
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

/**
 * `next` threading — the QR check-in flow. A student who scans the class QR
 * while signed out must come back to the check-in page after verifying, or
 * their attendance is silently never recorded (the 2026-07-23 Orientation bug).
 * The value reaches us from a query string, so unsafe input must be dropped,
 * not echoed into the email we send.
 */
describe('post-login destination (next)', () => {
  const enrollmentFixture = () => ({
    id: 'e1', email: 'a@b.com', full_name: 'A B', cohort_id: 'c1',
    enrollment_type: 'standard', payment_status: 'paid', created_at: '2026-07-01T00:00:00Z',
    update: jest.fn().mockResolvedValue(undefined),
  });

  it('forwards a safe check-in path to the email builder', async () => {
    enrFindAll.mockResolvedValue([enrollmentFixture()]);
    await requestMagicLink('a@b.com', '/portal/class-checkin/sess-1');
    expect(mockSendPortalMagicLink.mock.calls[0][0].next).toBe('/portal/class-checkin/sess-1');
  });

  it.each([
    ['an off-origin absolute URL', 'https://evil.com/portal/today'],
    ['a protocol-relative URL', '//evil.com'],
    ['a non-portal path', '/admin/accelerator'],
    ['a non-string', { next: 1 }],
  ])('drops %s rather than emailing it', async (_label, bad) => {
    enrFindAll.mockResolvedValue([enrollmentFixture()]);
    await requestMagicLink('a@b.com', bad as unknown);
    expect(mockSendPortalMagicLink.mock.calls[0][0].next).toBeUndefined();
  });

  it('omits next entirely when none is supplied (unchanged default)', async () => {
    enrFindAll.mockResolvedValue([enrollmentFixture()]);
    await requestMagicLink('a@b.com');
    expect(mockSendPortalMagicLink.mock.calls[0][0].next).toBeUndefined();
  });
});

/**
 * Blocked-login path. Manually rostered students used to be created with
 * portal_enabled=false and hit this branch with no server-side signal at all —
 * a whole cohort locked out silently. The rejection must stay observable.
 */
it('logs a classified warning when the enrollment exists but portal access is off', async () => {
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  enrFindAll.mockResolvedValue([]);
  enrFindOne.mockResolvedValue({ id: 'e-blocked', cohort_id: 'c-jul26' });

  const res = await requestMagicLink('blocked@x.com');

  expect(res.success).toBe(false);
  expect(mockSendPortalMagicLink).not.toHaveBeenCalled();
  const logged = JSON.parse(warn.mock.calls[0][0] as string);
  expect(logged.event).toBe('portal_login_blocked');
  expect(logged.error_class).toBe('PortalAccessDisabled');
  expect(logged.context.enrollment_id).toBe('e-blocked');
  warn.mockRestore();
});
