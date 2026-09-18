/**
 * The shared OAuth callback for every network except LinkedIn personal profiles.
 *
 * Same obligations as the LinkedIn callback (both mount orders; the signed state as the only
 * stand-in for a session; the exact connectAccount input), plus the two this one adds: the state
 * must have been minted for THIS path's network, and one sign-in can yield several accounts.
 */

import express from 'express';
import request from 'supertest';

const ENV = {
  JWT_SECRET: ['test', 'secret', 'for', 'oauth', 'v2'].join('-'),
  META_APP_ID: '1234567890',
  META_APP_SECRET: ['meta', 'test', 'value'].join('-'),
  X_OAUTH_CLIENT_ID: 'x-client',
  X_OAUTH_CLIENT_SECRET: ['x', 'test', 'value'].join('-'),
  MARKETING_OAUTH_BASE_URL: 'https://www.refactored.ai',
} as NodeJS.ProcessEnv;
process.env.JWT_SECRET = ENV.JWT_SECRET;

import { makeOAuthCallbackRouter, OAUTH_RETURN_PATH } from '../marketingOAuthCallbackRoutes';
import { encodeState, pkceVerifier, STATE_TTL_MS } from '../../services/marketing/oauth/oauthState';
import type { OAuthHttp } from '../../services/marketing/oauth/connectorTypes';
import type { ConnectInput } from '../../services/marketing/channelAccountService';

const BRAND = '22222222-2222-4222-8222-222222222222';
const ADMIN = '33333333-3333-4333-8333-333333333333';
const NOW = Date.parse('2026-09-18T15:00:00Z');

/** A Facebook sign-in that grants everything and returns two Pages, one with Instagram. */
function metaHttp(overrides: { exchange?: { status: number; body: unknown }; pages?: unknown[] } = {}) {
  const calls: string[] = [];
  const http: OAuthHttp = async ({ url }) => {
    calls.push(url);
    if (url.includes('/oauth/access_token?client_id')) return overrides.exchange ?? { status: 200, body: { access_token: 'short' } };
    if (url.includes('fb_exchange_token')) return { status: 200, body: { access_token: 'long', expires_in: 5_184_000 } };
    if (url.includes('/me/permissions')) {
      return { status: 200, body: { data: ['pages_show_list', 'pages_read_engagement', 'pages_manage_posts', 'instagram_basic', 'instagram_content_publish'].map((p) => ({ permission: p, status: 'granted' })) } };
    }
    if (url.includes('/me/accounts')) {
      return { status: 200, body: { data: overrides.pages ?? [
        { id: 'page-1', name: 'Colaberry', access_token: 'pt-1', instagram_business_account: { id: 'ig-1', username: 'colaberry' } },
        { id: 'page-2', name: 'Refactored', access_token: 'pt-2' },
      ] } };
    }
    throw new Error(`unexpected ${url}`);
  };
  return { http, calls };
}

function adminRoutesShaped(): express.Router {
  const admin = express.Router();
  admin.use((_req, res) => { res.status(401).json({ error: 'Authentication required' }); });
  return admin;
}

function app(opts: {
  publicFirst?: boolean;
  http?: OAuthHttp;
  connect?: (i: ConnectInput) => Promise<any>;
  brandTenant?: (b: string) => Promise<string | null>;
  env?: NodeJS.ProcessEnv;
} = {}) {
  const a = express();
  const router = makeOAuthCallbackRouter({
    http: opts.http ?? metaHttp().http,
    connect: opts.connect ?? (async (i) => ({ id: `acct-${i.providerAccountId}` })),
    brandTenant: opts.brandTenant ?? (async () => 'tenant-1'),
    now: () => NOW,
    env: opts.env ?? ENV,
    returnPath: OAUTH_RETURN_PATH,
  });
  if (opts.publicFirst === false) { a.use(adminRoutesShaped()); a.use(router); } else { a.use(router); a.use(adminRoutesShaped()); }
  return a;
}

const stateFor = (connector: string, at = NOW) => encodeState({ connector, adminId: ADMIN, brandId: BRAND }, at, ENV);
const loc = (res: request.Response) => {
  const u = new URL(res.headers.location, 'https://x');
  return { path: u.pathname, q: Object.fromEntries(u.searchParams.entries()) };
};

describe('mount order', () => {
  it('answers when mounted ABOVE adminRoutes and 401s below - the browser carries no JWT here', async () => {
    const url = `/api/marketing/oauth/meta/callback?code=c&state=${stateFor('meta').state}`;
    expect((await request(app({ publicFirst: true })).get(url)).status).toBe(302);
    expect((await request(app({ publicFirst: false })).get(url)).status).toBe(401);
  });
});

describe('one Facebook sign-in, several accounts', () => {
  it('seals every Page and the linked Instagram account onto the SIGNED brand, then lands on Brands', async () => {
    const connect = jest.fn(async (i: ConnectInput) => ({ id: `acct-${i.providerAccountId}` }));
    const res = await request(app({ connect })).get(`/api/marketing/oauth/meta/callback?code=c0de&state=${stateFor('meta').state}`);

    expect(res.status).toBe(302);
    expect(loc(res)).toEqual({ path: '/admin/marketing/brands', q: { connected: 'meta', brand: BRAND, count: '3' } });
    expect(connect).toHaveBeenCalledTimes(3);
    const inputs = connect.mock.calls.map((c) => c[0]);
    expect(inputs.map((i) => `${i.provider}:${i.providerAccountId}`)).toEqual(['meta_facebook_page:page-1', 'meta_instagram:ig-1', 'meta_facebook_page:page-2']);
    for (const i of inputs) {
      expect(i).toMatchObject({ tenantId: 'tenant-1', brandId: BRAND, connectedBy: ADMIN, missingScopes: [] });
    }
    // The Page token, not the user token, is what gets sealed.
    expect(inputs[0].accessToken).toBe('pt-1');
    expect(inputs[1].accessToken).toBe('pt-1');
  });

  it('a brand id in the query cannot override the signed one', async () => {
    const connect = jest.fn(async (i: ConnectInput) => ({ id: 'a' }));
    await request(app({ connect })).get(`/api/marketing/oauth/meta/callback?code=c&brand=attacker&brand_id=attacker&state=${stateFor('meta').state}`);
    expect(connect.mock.calls.every((c) => c[0].brandId === BRAND)).toBe(true);
  });

  it('no Pages ticked is reported as such, not as success', async () => {
    const connect = jest.fn();
    const res = await request(app({ http: metaHttp({ pages: [] }).http, connect })).get(`/api/marketing/oauth/meta/callback?code=c&state=${stateFor('meta').state}`);
    expect(loc(res).q).toMatchObject({ connect_error: 'NoAccountsFound', connector: 'meta', brand: BRAND });
    expect(connect).not.toHaveBeenCalled();
  });
});

describe('X - PKCE verifier reaches the exchange', () => {
  it('sends the verifier derived from the signed nonce, which the browser never saw', async () => {
    const { state, payload } = stateFor('x');
    const bodies: string[] = [];
    const http: OAuthHttp = async ({ url, body }) => {
      if (url.startsWith('https://api.x.com/2/oauth2/token')) { bodies.push(body ?? ''); return { status: 200, body: { access_token: 'at', refresh_token: 'rt', expires_in: 7200, scope: 'tweet.read tweet.write users.read offline.access' } }; }
      if (url.startsWith('https://api.x.com/2/users/me')) return { status: 200, body: { data: { id: '42', name: 'Colaberry', username: 'colaberry' } } };
      throw new Error(url);
    };
    const connect = jest.fn(async (i: ConnectInput) => ({ id: 'x-acct' }));
    const res = await request(app({ http, connect })).get(`/api/marketing/oauth/x/callback?code=c&state=${state}`);
    expect(loc(res).q.connected).toBe('x');
    expect(new URLSearchParams(bodies[0]).get('code_verifier')).toBe(pkceVerifier(payload.nonce, ENV));
    expect(connect.mock.calls[0][0]).toMatchObject({ provider: 'x', refreshToken: 'rt' });
  });
});

describe('what the callback refuses before any network call', () => {
  const noNetwork: OAuthHttp = async () => { throw new Error('network must not be called'); };

  it('a missing, tampered or expired state', async () => {
    const tampered = stateFor('meta').state.replace(/.$/, (c) => (c === 'A' ? 'B' : 'A'));
    const expired = stateFor('meta', NOW - STATE_TTL_MS - 1).state;
    for (const [s, reason] of [['', 'StateInvalid'], [tampered, 'StateInvalid'], [expired, 'StateExpired']] as const) {
      const res = await request(app({ http: noNetwork })).get(`/api/marketing/oauth/meta/callback?code=c&state=${s}`);
      expect(loc(res).q.connect_error).toBe(reason);
      expect(loc(res).q.brand).toBeUndefined();
    }
  });

  it('a genuine state minted for ANOTHER network - a Meta state replayed at the X callback', async () => {
    const res = await request(app({ http: noNetwork })).get(`/api/marketing/oauth/x/callback?code=c&state=${stateFor('meta').state}`);
    expect(loc(res).q).toMatchObject({ connect_error: 'StateConnectorMismatch', connector: 'x' });
  });

  it('an unknown network path', async () => {
    const res = await request(app({ http: noNetwork })).get(`/api/marketing/oauth/myspace/callback?code=c&state=${stateFor('meta').state}`);
    expect(loc(res).q.connect_error).toBe('UnknownConnector');
  });

  it('the operator cancelled: a calm "cancelled", nothing exchanged', async () => {
    const res = await request(app({ http: noNetwork })).get(`/api/marketing/oauth/meta/callback?error=access_denied&error_reason=user_denied&state=${stateFor('meta').state}`);
    expect(loc(res).q).toMatchObject({ connect_error: 'cancelled', connector: 'meta', brand: BRAND });
  });

  it('any other provider error is "provider_refused"', async () => {
    const res = await request(app({ http: noNetwork })).get(`/api/marketing/oauth/meta/callback?error=server_error&state=${stateFor('meta').state}`);
    expect(loc(res).q.connect_error).toBe('provider_refused');
  });

  it('the network is not set up on this server', async () => {
    const res = await request(app({ http: noNetwork, env: { JWT_SECRET: ENV.JWT_SECRET } as NodeJS.ProcessEnv }))
      .get(`/api/marketing/oauth/meta/callback?code=c&state=${stateFor('meta').state}`);
    expect(loc(res).q.connect_error).toBe('ProviderNotConfigured');
  });
});

describe('failures after the state is good', () => {
  it('the brand is gone', async () => {
    const res = await request(app({ brandTenant: async () => null })).get(`/api/marketing/oauth/meta/callback?code=c&state=${stateFor('meta').state}`);
    expect(loc(res).q.connect_error).toBe('BrandNotFound');
  });

  it('the network refuses the code: the reason is carried, nothing is sealed', async () => {
    const connect = jest.fn();
    const res = await request(app({ http: metaHttp({ exchange: { status: 400, body: { error: { message: 'Code expired' } } } }).http, connect }))
      .get(`/api/marketing/oauth/meta/callback?code=c&state=${stateFor('meta').state}`);
    expect(loc(res).q.connect_error).toBe('ExchangeFailed');
    expect(connect).not.toHaveBeenCalled();
  });

  it('the vault refuses partway: reported as a failure, never as a partial success', async () => {
    let n = 0;
    const connect = jest.fn(async () => {
      n += 1;
      if (n === 2) throw Object.assign(new Error('vault down'), { errorClass: 'VaultUnavailable' });
      return { id: `a${n}` };
    });
    const res = await request(app({ connect })).get(`/api/marketing/oauth/meta/callback?code=c&state=${stateFor('meta').state}`);
    expect(loc(res).q.connect_error).toBe('VaultUnavailable');
    expect(loc(res).q.connected).toBeUndefined();
  });

  it('no token or secret ever appears in the redirect', async () => {
    const res = await request(app()).get(`/api/marketing/oauth/meta/callback?code=c&state=${stateFor('meta').state}`);
    for (const secret of ['pt-1', 'pt-2', 'long', 'short', ENV.META_APP_SECRET!]) {
      expect(res.headers.location).not.toContain(secret);
    }
  });
});
