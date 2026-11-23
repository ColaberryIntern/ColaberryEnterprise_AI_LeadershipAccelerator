/**
 * requestMagicLink: which enrollment is targeted, and whether a working link survives.
 *
 * This suite sat on jest.ci.config.ts's ignore list, where the note asked the right
 * question and left it open: both tests failed with "Enrollment.findAll is not a
 * function", and "whether the service or the test is wrong is a question about
 * intended behaviour."
 *
 * Answered: the SERVICE is right and the TEST was stale. requestMagicLink deliberately
 * moved from a recency-ordered findOne to findAll + pickBestEnrollment (T407) so a
 * newer Explorer duplicate could not win the login link. The mock was never updated,
 * so the suite had been dead - and requestMagicLink has therefore had no CI coverage
 * at all while carrying the portal's entire sign-in path.
 *
 * The mock is repaired here and the suite comes off the ignore list in the same change.
 */

jest.spyOn(process.stdout, 'write').mockImplementation(() => true as any);

jest.mock('../../config/env', () => require('../testSupport/configMocks')
  .envModuleMock({ jwtSecret: 'test-secret', frontendUrl: 'https://enterprise.colaberry.ai' }));

jest.mock('../../models', () => ({
  __esModule: true,
  // findAll feeds pickBestEnrollment; findOne is only the "portal not enabled" probe.
  Enrollment: { findAll: jest.fn(), findOne: jest.fn() },
  Cohort: { findByPk: jest.fn().mockResolvedValue({ name: 'Test Cohort' }) },
  CommunityMember: {},
  LiveSession: {},
  AttendanceRecord: {},
  AssignmentSubmission: {},
  CommunityRoom: {},
}));

const mockSendPortalMagicLink = jest.fn();
jest.mock('../../services/emailService', () => ({ sendPortalMagicLink: (...a: any[]) => mockSendPortalMagicLink(...a) }));

import { Enrollment } from '../../models';
import { requestMagicLink } from '../../services/participantService';

const findAll = Enrollment.findAll as jest.Mock;
const findOne = Enrollment.findOne as jest.Mock;

const HOUR = 60 * 60 * 1000;

/** An active, portal-enabled enrollment. `expiresInMs: null` means it holds no token yet. */
const enrollmentWithToken = (token: string | null, expiresInMs: number | null) => ({
  id: 'e-1',
  email: 'a@b.com',
  full_name: 'A B',
  cohort_id: 'c1',
  portal_token: token,
  portal_token_expires_at: expiresInMs === null ? null : new Date(Date.now() + expiresInMs),
  update: jest.fn().mockResolvedValue(undefined),
});

const tokenSentInEmail = () => mockSendPortalMagicLink.mock.calls[0][0].token;

beforeEach(() => {
  findAll.mockReset();
  findOne.mockReset();
  mockSendPortalMagicLink.mockReset();
});
afterAll(() => jest.restoreAllMocks());

describe('targeting', () => {
  it('looks up every active, portal-enabled enrollment and sends the link', async () => {
    const enrollment = enrollmentWithToken(null, null);
    findAll.mockResolvedValue([enrollment]);

    const res = await requestMagicLink('A@B.com');

    // The address is lower-cased before the lookup, or a capitalised one misses its own row.
    expect(findAll.mock.calls[0][0].where).toMatchObject({
      email: 'a@b.com', status: 'active', portal_enabled: true,
    });
    expect(mockSendPortalMagicLink).toHaveBeenCalledTimes(1);
    expect(mockSendPortalMagicLink.mock.calls[0][0].to).toBe('a@b.com');
    expect(res.success).toBe(true);
  });

  it('returns a generic success (no send) when no active portal enrollment exists', async () => {
    findAll.mockResolvedValue([]);
    findOne.mockResolvedValue(null); // nothing pending either

    const res = await requestMagicLink('nobody@x.com');

    // Generic on purpose: a different answer would confirm which addresses are enrolled.
    expect(res.success).toBe(true);
    expect(mockSendPortalMagicLink).not.toHaveBeenCalled();
  });
});

describe('a link that still works is resent, not replaced (ticket 20336934)', () => {
  it('resends the SAME token and writes nothing when the current one has hours left', async () => {
    const enrollment = enrollmentWithToken('live-token-abc', 20 * HOUR);
    findAll.mockResolvedValue([enrollment]);

    await requestMagicLink('a@b.com');

    expect(tokenSentInEmail()).toBe('live-token-abc');
    // The write IS the bug. Asking for a link must not invalidate the one already sent.
    expect(enrollment.update).not.toHaveBeenCalled();
  });

  it('is idempotent: asking twice sends one working link twice', async () => {
    const enrollment = enrollmentWithToken('live-token-abc', 20 * HOUR);
    findAll.mockResolvedValue([enrollment]);

    await requestMagicLink('a@b.com');
    await requestMagicLink('a@b.com');

    // This is the whole ticket: two emails arrived 32 seconds apart, both displaying
    // the same minute, and only the second worked. Both must now carry one live token.
    expect(mockSendPortalMagicLink).toHaveBeenCalledTimes(2);
    expect(mockSendPortalMagicLink.mock.calls[0][0].token)
      .toBe(mockSendPortalMagicLink.mock.calls[1][0].token);
    expect(enrollment.update).not.toHaveBeenCalled();
  });

  it('does not extend the expiry of a reused token', async () => {
    const enrollment = enrollmentWithToken('live-token-abc', 20 * HOUR);
    const originalExpiry = enrollment.portal_token_expires_at;
    findAll.mockResolvedValue([enrollment]);

    await requestMagicLink('a@b.com');

    // Reuse must not become a way to keep a credential alive indefinitely by asking
    // for it repeatedly. The token still dies 24h after it was first minted.
    expect(enrollment.portal_token_expires_at).toBe(originalExpiry);
    expect(enrollment.update).not.toHaveBeenCalled();
  });
});

describe('a link that is gone, or nearly gone, is replaced', () => {
  it('mints a fresh token when the enrollment holds none', async () => {
    const enrollment = enrollmentWithToken(null, null);
    findAll.mockResolvedValue([enrollment]);

    await requestMagicLink('a@b.com');

    expect(enrollment.update).toHaveBeenCalledTimes(1);
    expect(enrollment.update.mock.calls[0][0].portal_token).toMatch(/^[0-9a-f-]{36}$/);
    expect(tokenSentInEmail()).toBe(enrollment.update.mock.calls[0][0].portal_token);
  });

  it('mints a fresh token when the current one has already expired', async () => {
    const enrollment = enrollmentWithToken('dead-token', -1 * HOUR);
    findAll.mockResolvedValue([enrollment]);

    await requestMagicLink('a@b.com');

    expect(enrollment.update).toHaveBeenCalledTimes(1);
    expect(tokenSentInEmail()).not.toBe('dead-token');
  });

  it('mints a fresh token when the current one expires too soon to be useful', async () => {
    // Live, so a naive "reuse if not expired" would resend it - into an email that may
    // sit unread for longer than the token survives.
    const enrollment = enrollmentWithToken('nearly-dead', 5 * 60 * 1000); // 5 minutes
    findAll.mockResolvedValue([enrollment]);

    await requestMagicLink('a@b.com');

    expect(enrollment.update).toHaveBeenCalledTimes(1);
    expect(tokenSentInEmail()).not.toBe('nearly-dead');
    expect(enrollment.update.mock.calls[0][0].portal_token).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('sets the new expiry 24 hours out when it mints', async () => {
    const enrollment = enrollmentWithToken(null, null);
    findAll.mockResolvedValue([enrollment]);

    const before = Date.now();
    await requestMagicLink('a@b.com');

    const written = enrollment.update.mock.calls[0][0].portal_token_expires_at as Date;
    expect(written.getTime() - before).toBeGreaterThan(23 * HOUR);
    expect(written.getTime() - before).toBeLessThanOrEqual(24 * HOUR + 1000);
  });
});
