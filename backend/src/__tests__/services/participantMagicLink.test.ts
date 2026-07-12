/**
 * requestMagicLink determinism (CC-20260712-q7m2 follow-up).
 *
 * A person can hold several enrollments. The lookup must deterministically target
 * the MOST RECENT active + portal-enabled enrollment (order created_at DESC), not
 * an arbitrary findOne that could email a login link into a stale account.
 */

jest.spyOn(process.stdout, 'write').mockImplementation(() => true as any);

jest.mock('../../config/env', () => ({ env: { jwtSecret: 'test-secret', frontendUrl: 'https://enterprise.colaberry.ai' } }));

jest.mock('../../models', () => ({
  __esModule: true,
  Enrollment: { findOne: jest.fn() },
  Cohort: { findByPk: jest.fn().mockResolvedValue({ name: 'Test Cohort' }) },
  LiveSession: {},
  AttendanceRecord: {},
  AssignmentSubmission: {},
}));

const mockSendPortalMagicLink = jest.fn();
jest.mock('../../services/emailService', () => ({ sendPortalMagicLink: (...a: any[]) => mockSendPortalMagicLink(...a) }));

import { Enrollment } from '../../models';
import { requestMagicLink } from '../../services/participantService';

const findOne = Enrollment.findOne as jest.Mock;

beforeEach(() => {
  findOne.mockReset();
  mockSendPortalMagicLink.mockReset();
});
afterAll(() => jest.restoreAllMocks());

it('targets the most recent enrollment (order created_at DESC) and sends the link', async () => {
  const enrollment = { id: 'e-new', email: 'a@b.com', full_name: 'A B', cohort_id: 'c1', update: jest.fn().mockResolvedValue(undefined) };
  findOne.mockResolvedValue(enrollment);

  const res = await requestMagicLink('A@B.com');

  // deterministic ordering on the primary lookup
  expect(findOne.mock.calls[0][0].order).toEqual([['created_at', 'DESC']]);
  expect(findOne.mock.calls[0][0].where.portal_enabled).toBe(true);

  // token written + link sent
  expect(enrollment.update).toHaveBeenCalledTimes(1);
  expect(enrollment.update.mock.calls[0][0].portal_token).toMatch(/^[0-9a-f-]{36}$/);
  expect(mockSendPortalMagicLink).toHaveBeenCalledTimes(1);
  expect(mockSendPortalMagicLink.mock.calls[0][0].to).toBe('a@b.com');
  expect(res.success).toBe(true);
});

it('returns a generic success (no send) when no active portal enrollment exists', async () => {
  findOne.mockResolvedValue(null); // no active+enabled, and no pending either
  const res = await requestMagicLink('nobody@x.com');
  expect(res.success).toBe(true);
  expect(mockSendPortalMagicLink).not.toHaveBeenCalled();
});
