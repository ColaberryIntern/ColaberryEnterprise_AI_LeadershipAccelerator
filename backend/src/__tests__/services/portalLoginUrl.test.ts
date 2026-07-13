/**
 * getPortalLoginUrl — "View as student" link builder (CC-20260712-b4x9 follow-up).
 *
 * Reuses a still-valid magic-link token (so we don't disturb the student's own
 * bookmarked link) and mints a fresh 30-day one only when missing/expired.
 */

jest.mock('../../config/env', () => ({ env: { frontendUrl: 'https://enterprise.colaberry.ai' } }));
jest.mock('../../models', () => ({
  __esModule: true,
  Cohort: {}, Enrollment: { findByPk: jest.fn() }, LiveSession: {}, AttendanceRecord: {},
  AssignmentSubmission: {}, Lead: {}, CampaignLead: {}, ScheduledEmail: {},
}));

import { Enrollment } from '../../models';
import { getPortalLoginUrl } from '../../services/acceleratorService';

const findByPk = Enrollment.findByPk as jest.Mock;

beforeEach(() => jest.clearAllMocks());

describe('getPortalLoginUrl', () => {
  it('reuses a still-valid token without minting a new one', async () => {
    const future = new Date(Date.now() + 5 * 24 * 3600 * 1000);
    const update = jest.fn();
    findByPk.mockResolvedValue({ portal_token: 'abc123', portal_token_expires_at: future, update });

    const url = await getPortalLoginUrl('enr-1');

    expect(url).toBe('https://enterprise.colaberry.ai/portal/verify?token=abc123');
    expect(update).not.toHaveBeenCalled();
  });

  it('mints a fresh 30-day token when missing or expired', async () => {
    const update = jest.fn().mockResolvedValue(undefined);
    findByPk.mockResolvedValue({ portal_token: null, portal_token_expires_at: null, update });

    const url = await getPortalLoginUrl('enr-1');

    expect(update).toHaveBeenCalledTimes(1);
    const written = update.mock.calls[0][0];
    expect(written.portal_token).toMatch(/^[0-9a-f-]{36}$/);
    expect(written.portal_token_expires_at instanceof Date).toBe(true);
    expect(url).toBe(`https://enterprise.colaberry.ai/portal/verify?token=${written.portal_token}`);
  });

  it('returns null when the enrollment does not exist', async () => {
    findByPk.mockResolvedValue(null);
    expect(await getPortalLoginUrl('missing')).toBeNull();
  });
});
