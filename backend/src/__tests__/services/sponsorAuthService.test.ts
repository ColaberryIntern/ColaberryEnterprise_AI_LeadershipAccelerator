/**
 * Sponsor portal magic-link auth (STORY-001).
 *  - requestSponsorPortalLink: self-serve. Any valid work email gets a Lead, a
 *    Sponsor, a saved token and an emailed link. Idempotent on the email, and
 *    the send is bounded by a timeout with capped retries.
 *  - verifySponsorPortalToken: valid token -> session, unknown/expired -> null
 *  - isValidSponsorToken: the dashboard gate's pure predicate
 */

jest.mock('../../models', () => ({
  __esModule: true,
  Lead: { findOrCreate: jest.fn() },
}));

jest.mock('../../models/Sponsor', () => ({
  __esModule: true,
  default: { findOne: jest.fn(), findOrCreate: jest.fn() },
}));

jest.mock('../../services/emailService', () => ({
  __esModule: true,
  sendSponsorMagicLink: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../services/sponsorAuditService', () => ({
  __esModule: true,
  recordSponsorPortalAuditEvent: jest.fn().mockResolvedValue(undefined),
}));

import { Lead } from '../../models';
import Sponsor from '../../models/Sponsor';
import { sendSponsorMagicLink } from '../../services/emailService';
import { recordSponsorPortalAuditEvent } from '../../services/sponsorAuditService';
import {
  EmailDeliveryError,
  requestSponsorPortalLink,
  verifySponsorPortalToken,
  isValidSponsorToken,
} from '../../services/sponsorAuthService';

const leadFindOrCreate = Lead.findOrCreate as unknown as jest.Mock;
const sponsorFindOne = Sponsor.findOne as unknown as jest.Mock;
const sponsorFindOrCreate = Sponsor.findOrCreate as unknown as jest.Mock;
const mockSendSponsorMagicLink = sendSponsorMagicLink as jest.Mock;
const mockRecordAudit = recordSponsorPortalAuditEvent as jest.Mock;

const HOUR_MS = 60 * 60 * 1000;

// Real tokens are crypto.randomUUID() in a UUID column, and verify now rejects
// anything not UUID-shaped before it reaches the database. Fixtures must look
// like the real thing or they exercise the malformed-token guard instead of the
// path under test.
const LIVE_TOKEN = '7a1f9c2e-1111-4000-8000-1234567890ab';
const DEAD_TOKEN = '7a1f9c2e-2222-4000-8000-1234567890ab';

/** A Sponsor row stub whose update() mutates it, like the real instance does. */
function sponsorStub(overrides: Record<string, unknown> = {}) {
  const sponsor: any = {
    id: 'sp-1',
    company_name: 'Acme Corp',
    portal_token: null,
    portal_token_expires_at: null,
    ...overrides,
  };
  sponsor.update = jest.fn(async (values: Record<string, unknown>) => {
    Object.assign(sponsor, values);
    return sponsor;
  });
  return sponsor;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockSendSponsorMagicLink.mockResolvedValue(undefined);
});

describe('requestSponsorPortalLink — self-serve signup (acceptance: manager fills form, gets a link)', () => {
  it('creates the Lead and Sponsor for an unknown manager, then emails a token', async () => {
    leadFindOrCreate.mockResolvedValue([
      { id: 42, email: 'jordan.lee@acme-corp.com', name: 'Jordan Lee' },
      true,
    ]);
    const sponsor = sponsorStub({ company_name: 'Acme Corp' });
    sponsorFindOrCreate.mockResolvedValue([sponsor, true]);

    await requestSponsorPortalLink({ email: 'Jordan.Lee@Acme-Corp.com  ' });

    // Email is normalized before it is used as the dedup key.
    expect(leadFindOrCreate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { email: 'jordan.lee@acme-corp.com' } }),
    );
    // No company field on the login form, so it is derived from the domain.
    expect(leadFindOrCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        defaults: expect.objectContaining({ name: 'Jordan Lee', company: 'Acme Corp' }),
      }),
    );
    expect(sponsorFindOrCreate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { contact_lead_id: 42 } }),
    );

    // Token persisted before the send, with a future expiry.
    expect(sponsor.update).toHaveBeenCalledWith(
      expect.objectContaining({
        portal_token: expect.any(String),
        portal_token_expires_at: expect.any(Date),
      }),
    );
    expect(sponsor.portal_token_expires_at.getTime()).toBeGreaterThan(Date.now());

    // ...and the emailed token is the one that was saved.
    expect(mockSendSponsorMagicLink).toHaveBeenCalledTimes(1);
    expect(mockSendSponsorMagicLink).toHaveBeenCalledWith({
      to: 'jordan.lee@acme-corp.com',
      contactName: 'Jordan Lee',
      companyName: 'Acme Corp',
      token: sponsor.portal_token,
    });
  });

  it('prefers an explicitly supplied company name and contact name over the derived ones', async () => {
    leadFindOrCreate.mockResolvedValue([{ id: 43, email: 'l&d@globex.com', name: 'Dana Reed' }, true]);
    sponsorFindOrCreate.mockResolvedValue([sponsorStub({ company_name: 'Globex Industries' }), true]);

    await requestSponsorPortalLink({
      email: 'l&d@globex.com',
      companyName: 'Globex Industries',
      name: 'Dana Reed',
    });

    expect(sponsorFindOrCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        defaults: expect.objectContaining({ company_name: 'Globex Industries' }),
      }),
    );
    expect(mockSendSponsorMagicLink).toHaveBeenCalledWith(
      expect.objectContaining({ contactName: 'Dana Reed', companyName: 'Globex Industries' }),
    );
  });
});

describe('requestSponsorPortalLink — idempotency (running it twice changes nothing)', () => {
  it('reuses the same Lead, Sponsor and live token on a second submit', async () => {
    const lead = { id: 42, email: 'jordan@acme.com', name: 'Jordan Lee' };
    const sponsor = sponsorStub({
      portal_token: 'live-token',
      portal_token_expires_at: new Date(Date.now() + 24 * HOUR_MS),
    });
    // findOrCreate returns created=false the second time around.
    leadFindOrCreate.mockResolvedValue([lead, false]);
    sponsorFindOrCreate.mockResolvedValue([sponsor, false]);

    await requestSponsorPortalLink({ email: 'jordan@acme.com' });
    await requestSponsorPortalLink({ email: 'jordan@acme.com' });

    // The already-delivered link must keep working: no rotation, no new rows.
    expect(sponsor.update).not.toHaveBeenCalled();
    expect(sponsor.portal_token).toBe('live-token');
    expect(mockSendSponsorMagicLink).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ token: 'live-token' }),
    );
    expect(mockSendSponsorMagicLink).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ token: 'live-token' }),
    );
  });

  it('mints a fresh token when the stored one has expired', async () => {
    leadFindOrCreate.mockResolvedValue([{ id: 42, email: 'jordan@acme.com', name: 'Jordan Lee' }, false]);
    const sponsor = sponsorStub({
      portal_token: 'stale-token',
      portal_token_expires_at: new Date(Date.now() - HOUR_MS),
    });
    sponsorFindOrCreate.mockResolvedValue([sponsor, false]);

    await requestSponsorPortalLink({ email: 'jordan@acme.com' });

    expect(sponsor.update).toHaveBeenCalledTimes(1);
    expect(sponsor.portal_token).not.toBe('stale-token');
    expect(mockSendSponsorMagicLink).toHaveBeenCalledWith(
      expect.objectContaining({ token: sponsor.portal_token }),
    );
  });
});

describe('requestSponsorPortalLink — failure path: email not sent', () => {
  it('retries a failing send up to 3 attempts, then throws EmailDeliveryError', async () => {
    leadFindOrCreate.mockResolvedValue([{ id: 42, email: 'jordan@acme.com', name: 'Jordan Lee' }, true]);
    const sponsor = sponsorStub();
    sponsorFindOrCreate.mockResolvedValue([sponsor, true]);
    mockSendSponsorMagicLink.mockRejectedValue(new Error('SMTP 421 service unavailable'));

    await expect(requestSponsorPortalLink({ email: 'jordan@acme.com' })).rejects.toBeInstanceOf(
      EmailDeliveryError,
    );

    expect(mockSendSponsorMagicLink).toHaveBeenCalledTimes(3);
    // The token is already persisted, so the manager's retry works immediately.
    expect(sponsor.portal_token).toEqual(expect.any(String));
    expect(sponsor.portal_token_expires_at.getTime()).toBeGreaterThan(Date.now());
  }, 10_000);

  it('recovers without throwing when a retry succeeds, sending the same token', async () => {
    leadFindOrCreate.mockResolvedValue([{ id: 42, email: 'jordan@acme.com', name: 'Jordan Lee' }, true]);
    const sponsor = sponsorStub();
    sponsorFindOrCreate.mockResolvedValue([sponsor, true]);
    mockSendSponsorMagicLink
      .mockRejectedValueOnce(new Error('SMTP 421 service unavailable'))
      .mockResolvedValueOnce(undefined);

    await expect(requestSponsorPortalLink({ email: 'jordan@acme.com' })).resolves.toBeUndefined();

    expect(mockSendSponsorMagicLink).toHaveBeenCalledTimes(2);
    const [first, second] = mockSendSponsorMagicLink.mock.calls;
    expect(first[0].token).toBe(second[0].token);
  }, 10_000);
});

describe('verifySponsorPortalToken', () => {
  it('returns a session for a valid token', async () => {
    sponsorFindOne.mockResolvedValue({ id: 'sp-1', company_name: 'Acme Corp', portal_token: LIVE_TOKEN });
    const result = await verifySponsorPortalToken(LIVE_TOKEN);
    expect(result).toEqual({ sponsor_id: 'sp-1', access_token: LIVE_TOKEN, company_name: 'Acme Corp' });
  });

  it('returns null for an unknown/expired token', async () => {
    sponsorFindOne.mockResolvedValue(null);
    expect(await verifySponsorPortalToken('7a1f9c2e-0000-4000-8000-1234567890ab')).toBeNull();
  });

  // Regression: portal_token is a UUID column, so a malformed literal makes
  // Postgres throw rather than not-match. That surfaced as a 500 with no audit
  // row in a live dev run; mocked models never reproduced it, so the guard is
  // asserted here by proving the query is not even attempted.
  it.each([
    ['an empty token', ''],
    ['a non-UUID token', 'garbage'],
    ['a UUID-ish but malformed token', '7a1f9c2e-0000-4000-8000-12345'],
  ])('rejects %s without querying the database', async (_label, badToken) => {
    const result = await verifySponsorPortalToken(badToken);

    expect(result).toBeNull();
    expect(sponsorFindOne).not.toHaveBeenCalled();
    expect(mockRecordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'link_rejected',
        metadata: { reason: 'malformed_token' },
      }),
    );
  });
});

describe('audit trail (acceptance: generation and access events are logged)', () => {
  it('records link_generated with the request origin when a link is issued', async () => {
    leadFindOrCreate.mockResolvedValue([{ id: 42, email: 'jordan@acme.com', name: 'Jordan Lee' }, true]);
    sponsorFindOrCreate.mockResolvedValue([sponsorStub(), true]);

    await requestSponsorPortalLink({
      email: 'jordan@acme.com',
      context: { ip: '203.0.113.7', userAgent: 'Mozilla/5.0' },
    });

    expect(mockRecordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'link_generated',
        sponsorId: 'sp-1',
        leadId: 42,
        email: 'jordan@acme.com',
        ip: '203.0.113.7',
        userAgent: 'Mozilla/5.0',
        correlationId: expect.any(String),
      }),
    );
  });

  it('records link_accessed when a valid link is clicked', async () => {
    sponsorFindOne.mockResolvedValue({
      id: 'sp-1',
      company_name: 'Acme Corp',
      portal_token: LIVE_TOKEN,
      contact_lead_id: 42,
    });

    await verifySponsorPortalToken(LIVE_TOKEN, { ip: '203.0.113.7', userAgent: 'Mozilla/5.0' });

    expect(mockRecordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'link_accessed',
        sponsorId: 'sp-1',
        leadId: 42,
        token: LIVE_TOKEN,
        ip: '203.0.113.7',
      }),
    );
  });

  it('records link_rejected for an expired or unknown link', async () => {
    sponsorFindOne.mockResolvedValue(null);

    await verifySponsorPortalToken(DEAD_TOKEN, { ip: '203.0.113.9' });

    expect(mockRecordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'link_rejected',
        token: DEAD_TOKEN,
        metadata: { reason: 'unknown_or_expired_token' },
      }),
    );
  });

  it('records the generation event even when delivery ultimately fails', async () => {
    leadFindOrCreate.mockResolvedValue([{ id: 42, email: 'jordan@acme.com', name: 'Jordan Lee' }, true]);
    sponsorFindOrCreate.mockResolvedValue([sponsorStub(), true]);
    mockSendSponsorMagicLink.mockRejectedValue(new Error('SMTP 421 service unavailable'));

    await expect(requestSponsorPortalLink({ email: 'jordan@acme.com' })).rejects.toBeInstanceOf(
      EmailDeliveryError,
    );

    expect(mockRecordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'link_generated' }),
    );
  }, 10_000);
});

describe('isValidSponsorToken', () => {
  it('accepts a matching, unexpired token', () => {
    const sponsor: any = { portal_token: 'tok-abc', portal_token_expires_at: new Date(Date.now() + 60_000) };
    expect(isValidSponsorToken(sponsor, 'tok-abc')).toBe(true);
  });

  it('rejects a mismatched token', () => {
    const sponsor: any = { portal_token: 'tok-abc', portal_token_expires_at: new Date(Date.now() + 60_000) };
    expect(isValidSponsorToken(sponsor, 'wrong')).toBe(false);
  });

  it('rejects an expired token even if it matches', () => {
    const sponsor: any = { portal_token: 'tok-abc', portal_token_expires_at: new Date(Date.now() - 1000) };
    expect(isValidSponsorToken(sponsor, 'tok-abc')).toBe(false);
  });

  it('rejects a sponsor that never requested a link', () => {
    const sponsor: any = { portal_token: null, portal_token_expires_at: null };
    expect(isValidSponsorToken(sponsor, 'anything')).toBe(false);
  });

  it('rejects the sponsor.id itself — the closed stopgap', () => {
    const sponsor: any = { id: 'sp-1', portal_token: 'tok-abc', portal_token_expires_at: new Date(Date.now() + 60_000) };
    expect(isValidSponsorToken(sponsor, sponsor.id)).toBe(false);
  });
});
