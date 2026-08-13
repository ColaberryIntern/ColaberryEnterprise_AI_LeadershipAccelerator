/**
 * Sponsor portal magic-link auth. Replaces the sponsor.id-as-token stopgap
 * in challengeController with a random, expiring, emailed-only token — see
 * the AUTH note in backend/src/controllers/challengeController.ts.
 *  - requestSponsorPortalLink: known lead+sponsor -> token saved + emailed;
 *    unknown email or lead-with-no-sponsor -> silent no-op (no enumeration)
 *  - verifySponsorPortalToken: valid token -> session, unknown/expired -> null,
 *    malformed -> null without ever touching the database
 *  - isValidSponsorToken: the dashboard gate's pure predicate
 *
 * Both sides of verify, and every link issued, write a row to the sponsor
 * portal audit trail.
 */

jest.mock('../../models', () => ({
  __esModule: true,
  Lead: { findOne: jest.fn() },
}));

jest.mock('../../models/Sponsor', () => ({
  __esModule: true,
  default: { findOne: jest.fn() },
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
  requestSponsorPortalLink,
  verifySponsorPortalToken,
  isValidSponsorToken,
} from '../../services/sponsorAuthService';

const leadFindOne = Lead.findOne as jest.Mock;
const sponsorFindOne = Sponsor.findOne as jest.Mock;
const mockSendSponsorMagicLink = sendSponsorMagicLink as jest.Mock;
const mockRecordAudit = recordSponsorPortalAuditEvent as jest.Mock;

// Real tokens are crypto.randomUUID() in a UUID column, and verify rejects
// anything not UUID-shaped before it reaches the database. Fixtures must look
// like the real thing or they exercise the malformed-token guard instead of
// the path under test.
const LIVE_TOKEN = '7a1f9c2e-1111-4000-8000-1234567890ab';
const DEAD_TOKEN = '7a1f9c2e-2222-4000-8000-1234567890ab';

beforeEach(() => jest.clearAllMocks());

describe('requestSponsorPortalLink', () => {
  it('saves a fresh token and emails it when the lead has a sponsor account', async () => {
    const update = jest.fn().mockResolvedValue(undefined);
    leadFindOne.mockResolvedValue({ id: 42, email: 'jordan@acme.com', name: 'Jordan Lee' });
    sponsorFindOne.mockResolvedValue({
      id: 'sp-1',
      company_name: 'Acme Corp',
      update,
    });

    await requestSponsorPortalLink('Jordan@Acme.com');

    expect(leadFindOne).toHaveBeenCalledWith(
      expect.objectContaining({ where: { email: 'jordan@acme.com' } }),
    );
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ portal_token: expect.any(String), portal_token_expires_at: expect.any(Date) }),
    );
    expect(mockSendSponsorMagicLink).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'jordan@acme.com', companyName: 'Acme Corp' }),
    );
  });

  it('audits the issue, with the request origin, before the email is sent', async () => {
    leadFindOne.mockResolvedValue({ id: 42, email: 'jordan@acme.com', name: 'Jordan Lee' });
    sponsorFindOne.mockResolvedValue({
      id: 'sp-1',
      company_name: 'Acme Corp',
      update: jest.fn().mockResolvedValue(undefined),
    });

    await requestSponsorPortalLink('jordan@acme.com', {
      ip: '203.0.113.7',
      userAgent: 'Mozilla/5.0',
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

  it('no-ops silently for an unknown email (no enumeration)', async () => {
    leadFindOne.mockResolvedValue(null);
    await requestSponsorPortalLink('nobody@nowhere.com');
    expect(sponsorFindOne).not.toHaveBeenCalled();
    expect(mockSendSponsorMagicLink).not.toHaveBeenCalled();
    expect(mockRecordAudit).not.toHaveBeenCalled();
  });

  it('no-ops silently for a lead with no sponsor account', async () => {
    leadFindOne.mockResolvedValue({ id: 7, email: 'someone@company.com', name: 'Someone' });
    sponsorFindOne.mockResolvedValue(null);
    await requestSponsorPortalLink('someone@company.com');
    expect(mockSendSponsorMagicLink).not.toHaveBeenCalled();
    expect(mockRecordAudit).not.toHaveBeenCalled();
  });
});

describe('verifySponsorPortalToken', () => {
  it('returns a session for a valid token and audits the access', async () => {
    sponsorFindOne.mockResolvedValue({
      id: 'sp-1',
      company_name: 'Acme Corp',
      portal_token: LIVE_TOKEN,
      contact_lead_id: 42,
    });

    const result = await verifySponsorPortalToken(LIVE_TOKEN, { ip: '203.0.113.7' });

    expect(result).toEqual({ sponsor_id: 'sp-1', access_token: LIVE_TOKEN, company_name: 'Acme Corp' });
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

  it('returns null for an unknown/expired token and audits the rejection', async () => {
    sponsorFindOne.mockResolvedValue(null);

    expect(await verifySponsorPortalToken(DEAD_TOKEN)).toBeNull();

    expect(mockRecordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'link_rejected',
        token: DEAD_TOKEN,
        metadata: { reason: 'unknown_or_expired_token' },
      }),
    );
  });

  // Regression: portal_token is a UUID column, so a malformed literal makes
  // Postgres throw rather than not-match. That surfaced as a 500 with no audit
  // row on a live deployment; mocked models never reproduced it, because a mock
  // happily string-compares anything. The guard is asserted here by proving the
  // query is not even attempted, which is checkable without a real database.
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
    // A value that was never a token is not fingerprinted.
    expect(mockRecordAudit.mock.calls[0][0].token).toBeUndefined();
  });
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
