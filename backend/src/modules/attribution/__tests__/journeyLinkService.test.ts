jest.mock('../../../config/env', () => ({
  env: { journeyLinkSecret: 'test-journey-secret-value' },
}));

import {
  buildJourneyUrl,
  createJourneyToken,
  toJourneyContext,
  verifyJourneyToken,
} from '../journeyLinkService';

const VISITOR = '11111111-1111-4111-8111-111111111111';
const CAMPAIGN = '22222222-2222-4222-8222-222222222222';
const CAMPAIGN_LEAD = '33333333-3333-4333-8333-333333333333';
const SESSION = '44444444-4444-4444-8444-444444444444';
const ORIGIN_BRAND = '55555555-5555-4555-8555-555555555555';
const LEAD_ID = 4242;

const FULL_INPUT = {
  visitorId: VISITOR,
  leadId: LEAD_ID,
  campaignId: CAMPAIGN,
  campaignLeadId: CAMPAIGN_LEAD,
  sessionId: SESSION,
  originBrandId: ORIGIN_BRAND,
};

describe('createJourneyToken / verifyJourneyToken', () => {
  it('round-trips every identifier', () => {
    const payload = verifyJourneyToken(createJourneyToken(FULL_INPUT));
    expect(payload).not.toBeNull();
    const ctx = toJourneyContext(payload!);
    expect(ctx).toEqual({
      visitorId: VISITOR,
      leadId: LEAD_ID,
      campaignId: CAMPAIGN,
      campaignLeadId: CAMPAIGN_LEAD,
      originSessionId: SESSION,
      originBrandId: ORIGIN_BRAND,
    });
  });

  it('carries no email or other PII in the encoded payload', () => {
    const token = createJourneyToken(FULL_INPUT);
    const decoded = Buffer.from(token.split('.')[0], 'base64url').toString('utf8');
    // The entire reason this service exists instead of `?email=`.
    expect(decoded).not.toMatch(/@/);
    expect(decoded.toLowerCase()).not.toContain('email');
    expect(decoded.toLowerCase()).not.toContain('name');
    expect(decoded.toLowerCase()).not.toContain('phone');
  });

  it('rejects a tampered payload', () => {
    const token = createJourneyToken(FULL_INPUT);
    const [, signature] = token.split('.');
    const forged = Buffer.from(
      JSON.stringify({ v: VISITOR, l: 9999, iat: 1, exp: 99999999999 }),
      'utf8',
    ).toString('base64url');

    expect(verifyJourneyToken(`${forged}.${signature}`)).toBeNull();
  });

  it('rejects a tampered signature', () => {
    const [encoded] = createJourneyToken(FULL_INPUT).split('.');
    expect(verifyJourneyToken(`${encoded}.${'0'.repeat(64)}`)).toBeNull();
  });

  it('rejects an expired token', () => {
    const issuedAt = new Date('2026-08-21T10:00:00Z');
    const token = createJourneyToken({ ...FULL_INPUT, ttlSeconds: 60, now: issuedAt });

    expect(verifyJourneyToken(token, new Date('2026-08-21T10:00:30Z'))).not.toBeNull();
    expect(verifyJourneyToken(token, new Date('2026-08-21T10:01:01Z'))).toBeNull();
  });

  it('rejects malformed input without throwing', () => {
    for (const bad of ['', 'not-a-token', 'a.b.c', 'onlyonepart', '.', 'x.']) {
      expect(verifyJourneyToken(bad)).toBeNull();
    }
    expect(verifyJourneyToken(null)).toBeNull();
    expect(verifyJourneyToken(undefined)).toBeNull();
  });

  it('rejects a token whose payload is not valid JSON', () => {
    // Signed by us, so the HMAC passes — the JSON parse is what must catch it.
    const encoded = Buffer.from('this is not json', 'utf8').toString('base64url');
    const crypto = require('crypto');
    const signature = crypto
      .createHmac('sha256', 'test-journey-secret-value')
      .update(`refactored:journey:v1:${encoded}`)
      .digest('hex');
    expect(verifyJourneyToken(`${encoded}.${signature}`)).toBeNull();
  });

  it('defaults every identifier to null when nothing is supplied', () => {
    const payload = verifyJourneyToken(createJourneyToken({}));
    expect(toJourneyContext(payload!)).toEqual({
      visitorId: null,
      leadId: null,
      campaignId: null,
      campaignLeadId: null,
      originSessionId: null,
      originBrandId: null,
    });
  });
});

describe('buildJourneyUrl', () => {
  it('appends the token as ?jx= and preserves existing query params', () => {
    const url = buildJourneyUrl('https://cpn.org/scholarships?utm_source=email', FULL_INPUT);
    const parsed = new URL(url);
    expect(parsed.searchParams.get('utm_source')).toBe('email');
    const jx = parsed.searchParams.get('jx');
    expect(jx).toBeTruthy();
    expect(verifyJourneyToken(jx)).not.toBeNull();
  });

  it('never puts an email in the URL', () => {
    const url = buildJourneyUrl('https://cpn.org/scholarships', FULL_INPUT);
    expect(url).not.toMatch(/@/);
  });
});
