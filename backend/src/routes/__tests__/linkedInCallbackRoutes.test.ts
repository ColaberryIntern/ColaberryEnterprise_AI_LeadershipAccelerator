/**
 * The LinkedIn OAuth callback: the public half of connecting an account.
 *
 * Two mount orders, like every public route here; the signed state as the only thing standing
 * in for a session; and the exact `connectAccount` input the happy path produces, because that
 * row is what every later publish reads its token from.
 */

import express from 'express';
import request from 'supertest';

process.env.JWT_SECRET = ['test', 'secret', 'for', 'oauth'].join('-');
process.env.LINKEDIN_CLIENT_ID = ['86', 'abc', 'def'].join('');
process.env.LINKEDIN_CLIENT_SECRET = ['WPL_AP1', 'test', 'secret'].join('.');
process.env.LINKEDIN_REDIRECT_URI = 'https://www.refactored.ai/api/marketing/linkedin/callback';

import { makeLinkedInCallbackRouter, DEFAULT_RETURN_PATH } from '../linkedInCallbackRoutes';
import { encodeState, LINKEDIN_TOKEN_URL, LINKEDIN_USERINFO_URL, STATE_TTL_MS, type OAuthHttp } from '../../services/marketing/linkedInOAuth';
import type { ConnectInput } from '../../services/marketing/channelAccountService';

const BRAND = '22222222-2222-4222-8222-222222222222';
const ADMIN = '33333333-3333-4333-8333-333333333333';
const NOW = Date.parse('2026-09-16T08:00:00Z');
const TOKEN = ['AQV', 'fresh', 'token', 'value'].join('');

function adminRoutesShaped(): express.Router {
  const admin = express.Router();
  admin.use((_req, res) => { res.status(401).json({ error: 'Authentication required' }); });
  return admin;
}

function scriptedHttp(overrides: { token?: () => { status: number; body: unknown }; userinfo?: () => { status: number; body: unknown } } = {}) {
  const calls: Array<Parameters<OAuthHttp>[0]> = [];
  const http: OAuthHttp = async (c) => {
    calls.push(c);
    if (c.url === LINKEDIN_TOKEN_URL) return overrides.token ? overrides.token() : { status: 200, body: { access_token: TOKEN, expires_in: 5183999, scope: 'openid,profile,w_member_social' } };
    if (c.url === LINKEDIN_USERINFO_URL) return overrides.userinfo ? overrides.userinfo() : { status: 200, body: { sub: 'abc123XYZ', name: 'Sohail Khan', picture: 'https://media.licdn.com/p.jpg' } };
    throw new Error('unexpected ' + c.url);
  };
  return { http, calls };
}

function app(publicFirst: boolean, http: OAuthHttp, connect: (i: ConnectInput) => Promise<any>, brandTenant = async () => 't-1') {
  const a = express();
  const router = makeLinkedInCallbackRouter({ http, connect, brandTenant, now: () => NOW, returnPath: DEFAULT_RETURN_PATH });
  if (publicFirst) { a.use(router); a.use(adminRoutesShaped()); } else { a.use(adminRoutesShaped()); a.use(router); }
  return a;
}

const validState = () => encodeState({ adminId: ADMIN, brandId: BRAND }, NOW);
const location = (res: request.Response) => new URL(res.headers.location, 'https://x');

describe('mount order', () => {
  it('reaches the route when mounted ABOVE adminRoutes and 401s when below - the browser carries no JWT here', async () => {
    const { http } = scriptedHttp();
    const connect = jest.fn(async (i: ConnectInput) => ({ id: 'acct-1', missing_scopes: i.missingScopes ?? [] }));
    const above = await request(app(true, http, connect)).get(`/api/marketing/linkedin/callback?code=c0de&state=${validState()}`);
    expect(above.status).toBe(302);
    const below = await request(app(false, http, connect)).get(`/api/marketing/linkedin/callback?code=c0de&state=${validState()}`);
    expect(below.status).toBe(401);
  });
});

describe('the happy path', () => {
  it('exchanges the code, learns who the token belongs to, seals the account onto the SIGNED brand, and lands on the Brands page', async () => {
    const { http, calls } = scriptedHttp();
    const connect = jest.fn(async (i: ConnectInput) => ({ id: 'acct-1', missing_scopes: i.missingScopes ?? [] }));
    const res = await request(app(true, http, connect)).get(`/api/marketing/linkedin/callback?code=c0de&state=${validState()}`);

    expect(res.status).toBe(302);
    const loc = location(res);
    expect(loc.pathname).toBe('/admin/brands');
    expect(Object.fromEntries(loc.searchParams)).toEqual({ linkedin: 'connected', brand: BRAND, account: 'acct-1' });

    // The exchange: code and secret in the POST body, never a URL.
    expect(calls[0].url).toBe(LINKEDIN_TOKEN_URL);
    expect(calls[0].method).toBe('POST');
    expect(calls[0].body).toContain('code=c0de');
    expect(calls[0].body).toContain('client_secret=');
    expect(calls[0].url).not.toContain('secret');
    // Identity with the new token.
    expect(calls[1].url).toBe(LINKEDIN_USERINFO_URL);
    expect(calls[1].headers.Authorization).toBe(`Bearer ${TOKEN}`);

    expect(connect).toHaveBeenCalledTimes(1);
    expect(connect.mock.calls[0][0]).toEqual({
      tenantId: 't-1',
      brandId: BRAND,                        // from the signed state, not the query
      provider: 'linkedin_member',
      providerAccountId: 'abc123XYZ',        // -> urn:li:person:abc123XYZ at publish time
      displayName: 'Sohail Khan',
      avatarUrl: 'https://media.licdn.com/p.jpg',
      grantedScopes: ['openid', 'profile', 'w_member_social'],
      missingScopes: [],
      accessToken: TOKEN,
      tokenExpiresAt: new Date(NOW + 5183999 * 1000),
      connectedBy: ADMIN,
    });
    // The token never appears in the redirect.
    expect(res.headers.location).not.toContain(TOKEN);
  });

  it('reports scopes the member declined, so the operator sees why posting may fail', async () => {
    const { http } = scriptedHttp({ token: () => ({ status: 200, body: { access_token: TOKEN, expires_in: 100, scope: 'openid,profile' } }) });
    const connect = jest.fn(async (i: ConnectInput) => ({ id: 'acct-2', missing_scopes: i.missingScopes ?? [] }));
    await request(app(true, http, connect)).get(`/api/marketing/linkedin/callback?code=c0de&state=${validState()}`);
    expect(connect.mock.calls[0][0].missingScopes).toEqual(['w_member_social']);
  });
});

describe('what the callback refuses, before any network call', () => {
  const noNetwork = () => { const { http, calls } = scriptedHttp(); return { http, calls }; };

  it('no state, a tampered state, and an expired state', async () => {
    for (const [qs, reason] of [
      ['code=c0de', 'StateInvalid'],
      [`code=c0de&state=${validState().replace(/.$/, (c) => (c === 'A' ? 'B' : 'A'))}`, 'StateInvalid'],
      [`code=c0de&state=${encodeState({ adminId: ADMIN, brandId: BRAND }, NOW - STATE_TTL_MS - 1000)}`, 'StateExpired'],
    ] as const) {
      const { http, calls } = noNetwork();
      const connect = jest.fn();
      const res = await request(app(true, http, connect)).get(`/api/marketing/linkedin/callback?${qs}`);
      expect(res.status).toBe(302);
      expect(Object.fromEntries(location(res).searchParams)).toEqual({ linkedin: 'error', reason });
      expect(calls).toHaveLength(0);
      expect(connect).not.toHaveBeenCalled();
    }
  });

  it('a brand id in the query cannot override the signed one', async () => {
    const { http } = scriptedHttp();
    const connect = jest.fn(async (i: ConnectInput) => ({ id: 'acct-1', missing_scopes: i.missingScopes ?? [] }));
    await request(app(true, http, connect)).get(`/api/marketing/linkedin/callback?code=c0de&brand=99999999-9999-4999-8999-999999999999&state=${validState()}`);
    expect(connect.mock.calls[0][0].brandId).toBe(BRAND);
  });

  it('the operator cancelled: back to the brand with reason=cancelled, nothing exchanged', async () => {
    const { http, calls } = noNetwork();
    const connect = jest.fn();
    const res = await request(app(true, http, connect)).get(`/api/marketing/linkedin/callback?error=user_cancelled_authorize&error_description=x&state=${validState()}`);
    expect(Object.fromEntries(location(res).searchParams)).toEqual({ linkedin: 'error', brand: BRAND, reason: 'cancelled' });
    expect(calls).toHaveLength(0);
    expect(connect).not.toHaveBeenCalled();
  });
});

describe('failures after the state is good', () => {
  it('LinkedIn refuses the code: error reason carried, no account written', async () => {
    const { http } = scriptedHttp({ token: () => ({ status: 400, body: { error: 'invalid_grant', error_description: 'code expired' } }) });
    const connect = jest.fn();
    const res = await request(app(true, http, connect)).get(`/api/marketing/linkedin/callback?code=old&state=${validState()}`);
    expect(Object.fromEntries(location(res).searchParams)).toEqual({ linkedin: 'error', brand: BRAND, reason: 'ExchangeFailed' });
    expect(connect).not.toHaveBeenCalled();
  });

  it('the vault is unavailable: the account service refuses and the reason names it', async () => {
    const { http } = scriptedHttp();
    const connect = jest.fn(async () => { throw Object.assign(new Error('The credential store is not configured on this server'), { errorClass: 'VaultUnavailable', status: 503 }); });
    const res = await request(app(true, http, connect)).get(`/api/marketing/linkedin/callback?code=c0de&state=${validState()}`);
    expect(Object.fromEntries(location(res).searchParams)).toEqual({ linkedin: 'error', brand: BRAND, reason: 'VaultUnavailable' });
  });

  it('the brand no longer exists', async () => {
    const { http, calls } = scriptedHttp();
    const res = await request(app(true, http, jest.fn(), async () => null)).get(`/api/marketing/linkedin/callback?code=c0de&state=${validState()}`);
    expect(Object.fromEntries(location(res).searchParams)).toEqual({ linkedin: 'error', brand: BRAND, reason: 'BrandNotFound' });
    expect(calls).toHaveLength(0);
  });
});
