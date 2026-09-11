/**
 * `GET /r/:shortCode` — the public tracked-link redirect.
 *
 * The two halves of this endpoint fail in OPPOSITE directions, and that asymmetry is the
 * thing most worth testing:
 *
 *   FAIL-SOFT on the click write — a visitor who clicked a legitimate link must reach the page
 *   even if the database is down. A lost click row costs one data point; a blocked redirect
 *   costs the visit, and the person is gone.
 *
 *   FAIL-CLOSED on the redirect target — if the destination cannot be re-validated right now,
 *   nothing is issued. No 302, no Location header. This endpoint sends a browser wherever the
 *   stored value says, so "probably fine" is not a standard that applies.
 *
 * Mocks precede the module import, per the repo idiom.
 */

const mockFindOne = jest.fn();
const mockClickCreate = jest.fn();
const mockGetLinkableHostnames = jest.fn();

jest.mock('../../models', () => ({
  TrackedLink: { findOne: (...a: unknown[]) => mockFindOne(...a) },
  LinkClick: { create: (...a: unknown[]) => mockClickCreate(...a) },
}));

jest.mock('../../services/journeyLinkRewriter', () => ({
  getLinkableHostnames: (...a: unknown[]) => mockGetLinkableHostnames(...a),
}));

import express from 'express';
import request from 'supertest';
import trackedLinkRedirectRoutes from '../trackedLinkRedirectRoutes';

const ALLOWED = new Set(['learn.colaberry.com', 'enterprise.colaberry.ai']);
const CHROME = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function app() {
  const a = express();
  a.use(trackedLinkRedirectRoutes);
  return a;
}

function activeLink(overrides: Record<string, unknown> = {}) {
  return {
    id: 'link-1',
    short_code: 'ABCD2345',
    status: 'active',
    destination_url: 'https://learn.colaberry.com/open-house?utm_source=linkedin',
    tenant_id: 'tenant-1',
    brand_id: 'brand-1',
    campaign_id: 'campaign-1',
    ...overrides,
  };
}

describe('GET /r/:shortCode', () => {
  let errorSpy: jest.SpyInstance;
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    mockFindOne.mockReset();
    mockClickCreate.mockReset().mockResolvedValue({});
    mockGetLinkableHostnames.mockReset().mockResolvedValue(ALLOWED);
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    errorSpy.mockRestore();
    warnSpy.mockRestore();
  });

  describe('the happy path', () => {
    it('302s to the stored destination', async () => {
      mockFindOne.mockResolvedValue(activeLink());
      const res = await request(app()).get('/r/ABCD2345').set('User-Agent', CHROME);

      expect(res.status).toBe(302);
      expect(new URL(res.headers.location).hostname).toBe('learn.colaberry.com');
    });

    it('WRITES a click row', async () => {
      // Acceptance criterion (a).
      mockFindOne.mockResolvedValue(activeLink());
      await request(app()).get('/r/ABCD2345').set('User-Agent', CHROME);

      expect(mockClickCreate).toHaveBeenCalledTimes(1);
      const row = mockClickCreate.mock.calls[0][0];
      expect(row.tracked_link_id).toBe('link-1');
      expect(row.tenant_id).toBe('tenant-1');
      expect(row.campaign_id).toBe('campaign-1');
      expect(row.is_bot).toBe(false);
    });

    it('stores a HASHED ip and never the address itself', async () => {
      mockFindOne.mockResolvedValue(activeLink());
      await request(app())
        .get('/r/ABCD2345')
        .set('User-Agent', CHROME)
        .set('X-Forwarded-For', '203.0.113.7, 70.41.3.18');

      const row = mockClickCreate.mock.calls[0][0];
      expect(row.ip_hash).toMatch(/^[0-9a-f]{64}$/);
      expect(JSON.stringify(row)).not.toContain('203.0.113.7');
    });

    it('FORWARDS platform click IDs to the destination', async () => {
      // Without this the click ID dies at the redirect and the ad platform cannot reconcile
      // its click against our conversion.
      mockFindOne.mockResolvedValue(activeLink());
      const res = await request(app())
        .get('/r/ABCD2345?fbclid=FB123&gclid=GC456&wbraid=WB789')
        .set('User-Agent', CHROME);

      const loc = new URL(res.headers.location);
      expect(loc.searchParams.get('fbclid')).toBe('FB123');
      expect(loc.searchParams.get('gclid')).toBe('GC456');
      expect(loc.searchParams.get('wbraid')).toBe('WB789');
      // And the destination's own UTMs survive.
      expect(loc.searchParams.get('utm_source')).toBe('linkedin');
    });

    it('records the click IDs on the row as well as forwarding them', async () => {
      mockFindOne.mockResolvedValue(activeLink());
      await request(app()).get('/r/ABCD2345?fbclid=FB123&igshid=IG1').set('User-Agent', CHROME);

      const row = mockClickCreate.mock.calls[0][0];
      expect(row.fbclid).toBe('FB123');
      expect(row.click_ids).toEqual({ igshid: 'IG1' });
    });
  });

  describe('bot traffic', () => {
    it('FLAGS a social preview fetcher but still redirects it', async () => {
      // Acceptance criterion (b). Facebook fetches every link the moment it is posted, so
      // counting these would give every post phantom clicks before a human sees it. The row
      // is kept, flagged, so the filtering stays auditable.
      mockFindOne.mockResolvedValue(activeLink());
      const res = await request(app())
        .get('/r/ABCD2345')
        .set('User-Agent', 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)');

      expect(res.status).toBe(302);
      const row = mockClickCreate.mock.calls[0][0];
      expect(row.is_bot).toBe(true);
      expect(row.bot_reason).toBe('social_preview_facebook');
    });

    it('flags a request with no user agent at all', async () => {
      mockFindOne.mockResolvedValue(activeLink());
      // supertest sets a default UA, so clear it explicitly.
      await request(app()).get('/r/ABCD2345').set('User-Agent', '');

      expect(mockClickCreate.mock.calls[0][0].is_bot).toBe(true);
    });
  });

  describe('FAIL-CLOSED on the redirect target', () => {
    it('refuses a destination that is no longer allowlisted, and issues NO redirect', async () => {
      // Acceptance criterion (c). The row was written when the host was allowed; the host has
      // since been removed. Validating only at creation time would grandfather it forever.
      mockFindOne.mockResolvedValue(activeLink({ destination_url: 'https://evil.test/phish' }));
      const res = await request(app()).get('/r/ABCD2345').set('User-Agent', CHROME);

      expect(res.status).toBe(410);
      expect(res.headers.location).toBeUndefined();
    });

    it('refuses a javascript: destination', async () => {
      mockFindOne.mockResolvedValue(activeLink({ destination_url: 'javascript:alert(1)' }));
      const res = await request(app()).get('/r/ABCD2345').set('User-Agent', CHROME);
      expect(res.status).toBe(410);
      expect(res.headers.location).toBeUndefined();
    });

    it('issues NOTHING when the allowlist cannot be loaded', async () => {
      // getLinkableHostnames fails safe to an empty Set. An empty allowlist must mean "verify
      // nothing" and not "allow everything".
      mockGetLinkableHostnames.mockResolvedValue(new Set());
      mockFindOne.mockResolvedValue(activeLink());
      const res = await request(app()).get('/r/ABCD2345').set('User-Agent', CHROME);

      expect(res.status).toBe(410);
      expect(res.headers.location).toBeUndefined();
    });

    it('returns 500 with no Location when the lookup itself throws', async () => {
      mockFindOne.mockRejectedValue(new Error('connection terminated'));
      const res = await request(app()).get('/r/ABCD2345').set('User-Agent', CHROME);

      expect(res.status).toBe(500);
      expect(res.headers.location).toBeUndefined();
    });
  });

  describe('FAIL-SOFT on the click write', () => {
    it('still 302s when the click write REJECTS', async () => {
      // Acceptance criterion (d). Losing a click row costs one data point; blocking the
      // redirect costs the visit.
      mockFindOne.mockResolvedValue(activeLink());
      mockClickCreate.mockRejectedValue(new Error('deadlock detected'));

      const res = await request(app()).get('/r/ABCD2345').set('User-Agent', CHROME);

      expect(res.status).toBe(302);
      expect(new URL(res.headers.location).hostname).toBe('learn.colaberry.com');
    });

    it('still 302s when the click write throws SYNCHRONOUSLY', async () => {
      // A synchronous throw does not produce a rejected promise, so a `.catch()` alone would
      // not contain it — it would escape into the request handler and become a 500. Different
      // failure shape, same requirement.
      mockFindOne.mockResolvedValue(activeLink());
      mockClickCreate.mockImplementation(() => { throw new Error('model not initialised'); });

      const res = await request(app()).get('/r/ABCD2345').set('User-Agent', CHROME);

      expect(res.status).toBe(302);
    });

    it('does not wait for the click write before redirecting', async () => {
      // A slow insert must not hold the visitor. If the redirect awaited the write, this
      // request would take the full delay.
      mockFindOne.mockResolvedValue(activeLink());
      let resolveWrite: (v: unknown) => void = () => {};
      mockClickCreate.mockImplementation(() => new Promise((r) => { resolveWrite = r; }));

      const started = Date.now();
      const res = await request(app()).get('/r/ABCD2345').set('User-Agent', CHROME);
      const elapsed = Date.now() - started;

      expect(res.status).toBe(302);
      expect(elapsed).toBeLessThan(1000);
      resolveWrite({});
    });
  });

  describe('lookup and status', () => {
    it('404s an unknown code', async () => {
      mockFindOne.mockResolvedValue(null);
      const res = await request(app()).get('/r/ZZZZ9999').set('User-Agent', CHROME);
      expect(res.status).toBe(404);
      expect(mockClickCreate).not.toHaveBeenCalled();
    });

    it.each(['draft', 'paused', 'archived'])('410s a %s link and records no click', async (status) => {
      mockFindOne.mockResolvedValue(activeLink({ status }));
      const res = await request(app()).get('/r/ABCD2345').set('User-Agent', CHROME);
      expect(res.status).toBe(410);
      expect(mockClickCreate).not.toHaveBeenCalled();
    });
  });

  describe('the path parameter is attacker-controlled', () => {
    it.each([
      ['abcd2345', 'lowercase - not the generated alphabet'],
      ['ABC', 'too short'],
      ['ABCI0O1L', 'the ambiguous glyphs the generator excludes'],
      ['ABCD-2345', 'punctuation'],
      ['%2e%2e%2fadmin', 'encoded traversal'],
      ['ABCD2345 ', 'null byte'],
    ])('404s %p (%s) without touching the database', async (code) => {
      // 404 rather than 400: a malformed code and an unknown code look identical to a
      // visitor, and a distinct status would let someone probe the alphabet without ever
      // guessing a real code.
      const res = await request(app()).get(`/r/${encodeURIComponent(code)}`).set('User-Agent', CHROME);
      expect(res.status).toBe(404);
      expect(mockFindOne).not.toHaveBeenCalled();
    });
  });
});
