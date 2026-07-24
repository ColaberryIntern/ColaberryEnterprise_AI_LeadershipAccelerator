/**
 * Sponsor portal magic-link auth. Replaces the sponsor.id-as-token stopgap
 * in challengeController with a random, expiring, emailed-only token — see
 * the AUTH note in backend/src/controllers/challengeController.ts.
 *  - requestSponsorPortalLink: known lead+sponsor -> token saved + emailed;
 *    unknown email or lead-with-no-sponsor -> silent no-op (no enumeration)
 *  - verifySponsorPortalToken: valid token -> session, unknown/expired -> null
 *  - isValidSponsorToken: the dashboard gate's pure predicate
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

import { Lead } from '../../models';
import Sponsor from '../../models/Sponsor';
import { sendSponsorMagicLink } from '../../services/emailService';
import {
  requestSponsorPortalLink,
  verifySponsorPortalToken,
  isValidSponsorToken,
} from '../../services/sponsorAuthService';

const leadFindOne = Lead.findOne as jest.Mock;
const sponsorFindOne = Sponsor.findOne as jest.Mock;
const mockSendSponsorMagicLink = sendSponsorMagicLink as jest.Mock;

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

  it('no-ops silently for an unknown email (no enumeration)', async () => {
    leadFindOne.mockResolvedValue(null);
    await requestSponsorPortalLink('nobody@nowhere.com');
    expect(sponsorFindOne).not.toHaveBeenCalled();
    expect(mockSendSponsorMagicLink).not.toHaveBeenCalled();
  });

  it('no-ops silently for a lead with no sponsor account', async () => {
    leadFindOne.mockResolvedValue({ id: 7, email: 'someone@company.com', name: 'Someone' });
    sponsorFindOne.mockResolvedValue(null);
    await requestSponsorPortalLink('someone@company.com');
    expect(mockSendSponsorMagicLink).not.toHaveBeenCalled();
  });
});

describe('verifySponsorPortalToken', () => {
  it('returns a session for a valid token', async () => {
    sponsorFindOne.mockResolvedValue({ id: 'sp-1', company_name: 'Acme Corp', portal_token: 'tok-abc' });
    const result = await verifySponsorPortalToken('tok-abc');
    expect(result).toEqual({ sponsor_id: 'sp-1', access_token: 'tok-abc', company_name: 'Acme Corp' });
  });

  it('returns null for an unknown/expired token', async () => {
    sponsorFindOne.mockResolvedValue(null);
    expect(await verifySponsorPortalToken('nope')).toBeNull();
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
