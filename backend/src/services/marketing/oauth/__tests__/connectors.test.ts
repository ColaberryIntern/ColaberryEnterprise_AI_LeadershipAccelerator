import type { ConnectorConfig, OAuthHttp, OAuthHttpResponse, TokenSet } from '../connectorTypes';
import { metaConnector, META_SCOPES } from '../providers/meta';
import { youtubeConnector } from '../providers/youtube';
import { tiktokConnector } from '../providers/tiktok';
import { xConnector } from '../providers/x';
import { linkedinOrgConnector } from '../providers/linkedinOrg';
import { connectorStatuses, GENERIC_CONNECTORS } from '../connectorRegistry';
import { redirectUriFor } from '../connectorConfig';

/**
 * Each network's sign-in, against a fake network that records every request.
 *
 * The assertions are on what goes OVER THE WIRE - URL, method, where the secret travels, which
 * scopes are asked for - because that is the half no live test can cover until each platform's
 * app exists, and the half where a wrong parameter name fails silently as "the provider refused".
 */

const CFG: ConnectorConfig = { clientId: 'client-123', clientSecret: 'shh-secret', redirectUri: 'https://www.refactored.ai/api/marketing/oauth/meta/callback' };
const NOW = new Date('2026-09-18T15:00:00Z');

interface Call { method: string; url: string; headers?: Record<string, string>; body?: string }

/** Answers by URL prefix; records every call. Unmatched requests fail loudly. */
function fakeHttp(routes: Array<[string, OAuthHttpResponse]>): { http: OAuthHttp; calls: Call[] } {
  const calls: Call[] = [];
  const http: OAuthHttp = async (req) => {
    calls.push(req);
    const hit = routes.find(([prefix]) => req.url.startsWith(prefix));
    if (!hit) throw new Error(`unexpected request: ${req.method} ${req.url}`);
    return hit[1];
  };
  return { http, calls };
}

const ok = (body: unknown): OAuthHttpResponse => ({ status: 200, body });
const token = (over: Partial<TokenSet> = {}): TokenSet => ({
  accessToken: 'at-1', refreshToken: null, expiresAt: null, refreshExpiresAt: null, scopes: [], ...over,
});

function params(url: string): URLSearchParams {
  return new URL(url).searchParams;
}

// ---------------------------------------------------------------------------------------------

describe('Meta (Facebook Pages + Instagram)', () => {
  it('asks Facebook for comma-separated scopes, with the state and redirect', () => {
    const p = params(metaConnector.authorizeUrl(CFG, 'STATE', null));
    expect(p.get('client_id')).toBe('client-123');
    expect(p.get('state')).toBe('STATE');
    expect(p.get('redirect_uri')).toBe(CFG.redirectUri);
    expect(p.get('scope')).toBe(META_SCOPES.join(','));
    expect(p.get('response_type')).toBe('code');
  });

  it('with a Facebook Login for Business configuration, sends config_id and NOT scope', () => {
    process.env.META_LOGIN_CONFIG_ID = '987654321';
    try {
      const p = params(metaConnector.authorizeUrl(CFG, 'STATE', null));
      expect(p.get('config_id')).toBe('987654321');
      expect(p.get('scope')).toBeNull();
    } finally {
      delete process.env.META_LOGIN_CONFIG_ID;
    }
  });

  it('trades the code, then extends it to a long-lived token, then reads what was granted', async () => {
    const { http, calls } = fakeHttp([
      ['https://graph.facebook.com/v25.0/oauth/access_token?client_id', ok({ access_token: 'short' })],
      ['https://graph.facebook.com/v25.0/oauth/access_token?grant_type=fb_exchange_token', ok({ access_token: 'long', expires_in: 5_184_000 })],
      ['https://graph.facebook.com/v25.0/me/permissions', ok({ data: [
        { permission: 'pages_manage_posts', status: 'granted' },
        { permission: 'instagram_content_publish', status: 'declined' },
      ] })],
    ]);
    const t = await metaConnector.exchangeCode({ cfg: CFG, code: 'CODE', verifier: null, http, now: NOW });
    expect(t.accessToken).toBe('long');
    expect(t.expiresAt).toEqual(new Date(NOW.getTime() + 5_184_000_000));
    // Declined permissions are NOT counted as granted.
    expect(t.scopes).toEqual(['pages_manage_posts']);
    expect(params(calls[1].url).get('fb_exchange_token')).toBe('short');
  });

  it('turns every ticked Page into an account, plus the Instagram account linked to each', async () => {
    const { http } = fakeHttp([
      ['https://graph.facebook.com/v25.0/me/accounts', ok({ data: [
        { id: 'page-1', name: 'Colaberry', access_token: 'page-token-1', instagram_business_account: { id: 'ig-1', username: 'colaberry' } },
        { id: 'page-2', name: 'Refactored', access_token: 'page-token-2' },
        { id: 'page-3', name: 'No token' },
      ] })],
    ]);
    const all = ['pages_show_list', 'pages_read_engagement', 'pages_manage_posts', 'instagram_basic', 'instagram_content_publish'];
    const accounts = await metaConnector.discoverAccounts({ cfg: CFG, token: token({ accessToken: 'long', scopes: all }), http, now: NOW });

    expect(accounts.map((a) => `${a.provider}:${a.providerAccountId}`)).toEqual([
      'meta_facebook_page:page-1', 'meta_instagram:ig-1', 'meta_facebook_page:page-2',
    ]);
    const ig = accounts.find((a) => a.provider === 'meta_instagram')!;
    // Instagram posts with the linked Page's token, and that token does not expire.
    expect(ig.accessToken).toBe('page-token-1');
    expect(ig.expiresAt).toBeNull();
    expect(ig.displayName).toBe('@colaberry');
    expect(ig.metadata).toEqual({ facebook_page_id: 'page-1' });
    expect(accounts.every((a) => a.missingScopes.length === 0)).toBe(true);
  });

  it('follows paging, but only so far', async () => {
    const page = (n: number, next: boolean) => ok({
      data: [{ id: `p${n}`, name: `Page ${n}`, access_token: `t${n}` }],
      paging: next ? { next: `https://graph.facebook.com/v25.0/me/accounts?after=${n}` } : {},
    });
    let n = 0;
    const http: OAuthHttp = async () => { n += 1; return page(n, true); };
    const accounts = await metaConnector.discoverAccounts({ cfg: CFG, token: token(), http, now: NOW });
    expect(accounts).toHaveLength(5);
  });

  it('names the missing Instagram permission rather than connecting silently without it', async () => {
    const { http } = fakeHttp([
      ['https://graph.facebook.com/v25.0/me/accounts', ok({ data: [
        { id: 'page-1', name: 'Colaberry', access_token: 't', instagram_business_account: { id: 'ig-1' } },
      ] })],
    ]);
    const accounts = await metaConnector.discoverAccounts({ cfg: CFG, token: token({ scopes: ['pages_show_list', 'pages_read_engagement', 'pages_manage_posts', 'instagram_basic'] }), http, now: NOW });
    expect(accounts.find((a) => a.provider === 'meta_instagram')!.missingScopes).toEqual(['instagram_content_publish']);
  });

  it('a refusal says so in Facebook\'s own words', async () => {
    const { http } = fakeHttp([['https://graph.facebook.com', { status: 400, body: { error: { message: 'Invalid verification code format.' } } }]]);
    await expect(metaConnector.exchangeCode({ cfg: CFG, code: 'x', verifier: null, http, now: NOW }))
      .rejects.toMatchObject({ errorClass: 'ExchangeFailed', message: expect.stringContaining('Invalid verification code format.') });
  });
});

// ---------------------------------------------------------------------------------------------

describe('YouTube', () => {
  it('asks for offline access with forced consent - without prompt=consent a re-connect gets no refresh token', () => {
    const p = params(youtubeConnector.authorizeUrl(CFG, 'STATE', 'CHALLENGE'));
    expect(p.get('access_type')).toBe('offline');
    expect(p.get('prompt')).toBe('consent');
    expect(p.get('code_challenge')).toBe('CHALLENGE');
    expect(p.get('code_challenge_method')).toBe('S256');
    expect(p.get('scope')).toContain('https://www.googleapis.com/auth/youtube.upload');
  });

  it('exchanges in a POST body, with the verifier, and keeps the refresh token', async () => {
    const { http, calls } = fakeHttp([['https://oauth2.googleapis.com/token', ok({ access_token: 'at', refresh_token: 'rt', expires_in: 3599, scope: 'https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly' })]]);
    const t = await youtubeConnector.exchangeCode({ cfg: CFG, code: 'CODE', verifier: 'VERIFIER', http, now: NOW });
    expect(calls[0].method).toBe('POST');
    expect(calls[0].url).not.toContain('shh-secret');
    const body = new URLSearchParams(calls[0].body);
    expect(body.get('client_secret')).toBe('shh-secret');
    expect(body.get('code_verifier')).toBe('VERIFIER');
    expect(t.refreshToken).toBe('rt');
    expect(t.scopes).toHaveLength(2);
  });

  it('reads the channel the token belongs to', async () => {
    const { http, calls } = fakeHttp([['https://www.googleapis.com/youtube/v3/channels', ok({ items: [
      { id: 'UC123', snippet: { title: 'Colaberry', customUrl: '@colaberry', thumbnails: { default: { url: 'https://img/x.jpg' } } } },
    ] })]]);
    const [a] = await youtubeConnector.discoverAccounts({ cfg: CFG, token: token({ scopes: ['https://www.googleapis.com/auth/youtube.upload'], refreshToken: 'rt' }), http, now: NOW });
    expect(calls[0].headers?.Authorization).toBe('Bearer at-1');
    expect(a).toMatchObject({ provider: 'youtube', providerAccountId: 'UC123', displayName: 'Colaberry', handle: '@colaberry', refreshToken: 'rt', missingScopes: [] });
  });
});

// ---------------------------------------------------------------------------------------------

describe('TikTok', () => {
  it('uses client_key and comma-separated scopes, no PKCE (web apps do not use it)', () => {
    const p = params(tiktokConnector.authorizeUrl(CFG, 'STATE', null));
    expect(p.get('client_key')).toBe('client-123');
    expect(p.get('client_id')).toBeNull();
    expect(p.get('scope')).toBe('user.info.basic,video.upload,video.publish');
    expect(p.get('code_challenge')).toBeNull();
  });

  it('records the refresh token and ITS expiry - the connection lives as long as that does', async () => {
    const { http } = fakeHttp([['https://open.tiktokapis.com/v2/oauth/token/', ok({
      access_token: 'at', expires_in: 86_400, refresh_token: 'rt', refresh_expires_in: 31_536_000, open_id: 'o1', scope: 'user.info.basic,video.upload,video.publish',
    })]]);
    const t = await tiktokConnector.exchangeCode({ cfg: CFG, code: 'CODE', verifier: null, http, now: NOW });
    expect(t.refreshExpiresAt).toEqual(new Date(NOW.getTime() + 31_536_000_000));
    expect(t.scopes).toEqual(['user.info.basic', 'video.upload', 'video.publish']);
  });

  it('treats HTTP 200 with an error body as the failure it is', async () => {
    const { http } = fakeHttp([['https://open.tiktokapis.com/v2/oauth/token/', ok({ error: 'invalid_grant', error_description: 'Authorization code is expired.' })]]);
    await expect(tiktokConnector.exchangeCode({ cfg: CFG, code: 'x', verifier: null, http, now: NOW }))
      .rejects.toMatchObject({ errorClass: 'ExchangeFailed', message: expect.stringContaining('Authorization code is expired.') });

    const who = fakeHttp([['https://open.tiktokapis.com/v2/user/info/', ok({ data: {}, error: { code: 'access_token_invalid', message: 'The access token is invalid.' } })]]);
    await expect(tiktokConnector.discoverAccounts({ cfg: CFG, token: token(), http: who.http, now: NOW }))
      .rejects.toMatchObject({ errorClass: 'IdentityFailed' });
  });

  it('reads the account by open_id', async () => {
    const { http } = fakeHttp([['https://open.tiktokapis.com/v2/user/info/', ok({ data: { user: { open_id: 'o1', display_name: 'Colaberry', avatar_url: 'https://a' } }, error: { code: 'ok' } })]]);
    const [a] = await tiktokConnector.discoverAccounts({ cfg: CFG, token: token({ scopes: ['video.publish', 'video.upload'] }), http, now: NOW });
    expect(a).toMatchObject({ provider: 'tiktok', providerAccountId: 'o1', displayName: 'Colaberry', missingScopes: [] });
  });
});

// ---------------------------------------------------------------------------------------------

describe('X', () => {
  it('requires a PKCE challenge and asks for offline access', () => {
    const p = params(xConnector.authorizeUrl(CFG, 'STATE', 'CHALLENGE'));
    expect(p.get('code_challenge')).toBe('CHALLENGE');
    expect(p.get('code_challenge_method')).toBe('S256');
    expect(p.get('scope')!.split(' ')).toEqual(['tweet.read', 'tweet.write', 'users.read', 'offline.access']);
    expect(() => xConnector.authorizeUrl(CFG, 'STATE', null)).toThrow();
  });

  it('authenticates the exchange with HTTP Basic - the secret never goes in the body or URL', async () => {
    const { http, calls } = fakeHttp([['https://api.x.com/2/oauth2/token', ok({ access_token: 'at', refresh_token: 'rt', expires_in: 7200, scope: 'tweet.read tweet.write users.read offline.access' })]]);
    const t = await xConnector.exchangeCode({ cfg: CFG, code: 'CODE', verifier: 'VERIFIER', http, now: NOW });
    const basic = Buffer.from('client-123:shh-secret').toString('base64');
    expect(calls[0].headers?.Authorization).toBe(`Basic ${basic}`);
    expect(calls[0].body).not.toContain('shh-secret');
    expect(calls[0].url).not.toContain('shh-secret');
    expect(new URLSearchParams(calls[0].body).get('code_verifier')).toBe('VERIFIER');
    expect(t.expiresAt).toEqual(new Date(NOW.getTime() + 7_200_000));
    expect(t.refreshToken).toBe('rt');
  });

  it('refuses to exchange without the verifier rather than sending an exchange X will reject', async () => {
    const { http, calls } = fakeHttp([]);
    await expect(xConnector.exchangeCode({ cfg: CFG, code: 'CODE', verifier: null, http, now: NOW })).rejects.toThrow();
    expect(calls).toHaveLength(0);
  });

  it('reads the account, and flags a missing offline.access (the connection would die in 2 hours)', async () => {
    const { http } = fakeHttp([['https://api.x.com/2/users/me', ok({ data: { id: '42', name: 'Colaberry', username: 'colaberry' } })]]);
    const [a] = await xConnector.discoverAccounts({ cfg: CFG, token: token({ scopes: ['tweet.read', 'tweet.write', 'users.read'] }), http, now: NOW });
    expect(a).toMatchObject({ provider: 'x', providerAccountId: '42', handle: 'colaberry' });
    expect(a.missingScopes).toEqual(['offline.access']);
  });
});

// ---------------------------------------------------------------------------------------------

describe('LinkedIn Company Pages', () => {
  it('asks for the organization scopes on the standard LinkedIn endpoint', () => {
    const p = params(linkedinOrgConnector.authorizeUrl(CFG, 'STATE', null));
    expect(p.get('scope')).toBe('w_organization_social r_organization_admin');
  });

  it('keeps only APPROVED ADMINISTRATOR roles, and reads both field names LinkedIn documents', async () => {
    const { http, calls } = fakeHttp([
      ['https://api.linkedin.com/rest/organizationAcls', ok({ elements: [
        { role: 'ADMINISTRATOR', state: 'APPROVED', organization: 'urn:li:organization:111' },
        { role: 'ADMINISTRATOR', state: 'APPROVED', organizationTarget: 'urn:li:organization:222' },
        { role: 'ANALYST', state: 'APPROVED', organization: 'urn:li:organization:333' },
        { role: 'ADMINISTRATOR', state: 'REQUESTED', organization: 'urn:li:organization:444' },
        { role: 'ADMINISTRATOR', state: 'APPROVED', organization: 'urn:li:organization:111' },
      ] })],
      ['https://api.linkedin.com/rest/organizations/111', ok({ localizedName: 'Colaberry', vanityName: 'colaberry' })],
      ['https://api.linkedin.com/rest/organizations/222', { status: 403, body: {} }],
    ]);
    const accounts = await linkedinOrgConnector.discoverAccounts({ cfg: CFG, token: token({ scopes: ['w_organization_social'] }), http, now: NOW });
    // The numeric id is what getAuthorUrn turns into urn:li:organization:{id}.
    expect(accounts.map((a) => a.providerAccountId)).toEqual(['111', '222']);
    expect(accounts[0]).toMatchObject({ displayName: 'Colaberry', handle: 'colaberry', provider: 'linkedin_organization' });
    // A name that will not load does not cost the whole connection.
    expect(accounts[1].displayName).toBe('LinkedIn Page 222');
    expect(calls[0].headers?.['LinkedIn-Version']).toMatch(/^\d{6}$/);
    expect(calls[0].headers?.['X-Restli-Protocol-Version']).toBe('2.0.0');
  });
});

// ---------------------------------------------------------------------------------------------

describe('the registry the Brands page reads', () => {
  const BASE = { JWT_SECRET: 's', LINKEDIN_CLIENT_ID: 'li', LINKEDIN_CLIENT_SECRET: 'li-s', LINKEDIN_REDIRECT_URI: 'https://www.refactored.ai/api/marketing/linkedin/callback' } as NodeJS.ProcessEnv;

  it('lists every network, LinkedIn first, and derives the redirect host from the live LinkedIn one', () => {
    const s = connectorStatuses(BASE);
    expect(s.map((c) => c.key)).toEqual(['linkedin', 'linkedin_org', 'meta', 'youtube', 'tiktok', 'x']);
    expect(s[0].configured).toBe(true);
    expect(s.find((c) => c.key === 'meta')!.redirect_uri).toBe('https://www.refactored.ai/api/marketing/oauth/meta/callback');
  });

  it('an unconfigured network names the variables still missing - names, never values', () => {
    const meta = connectorStatuses({ ...BASE, META_APP_ID: 'abc' } as NodeJS.ProcessEnv).find((c) => c.key === 'meta')!;
    expect(meta.configured).toBe(false);
    expect(meta.missing_env).toEqual(['META_APP_SECRET']);
    expect(JSON.stringify(connectorStatuses({ ...BASE, META_APP_ID: 'abc', META_APP_SECRET: 'super-secret-value' } as NodeJS.ProcessEnv)))
      .not.toContain('super-secret-value');
  });

  it('with both variables set, the network is configured', () => {
    const meta = connectorStatuses({ ...BASE, META_APP_ID: 'a', META_APP_SECRET: 'b' } as NodeJS.ProcessEnv).find((c) => c.key === 'meta')!;
    expect(meta.configured).toBe(true);
    expect(meta.missing_env).toEqual([]);
  });

  it('with no way to know the host, it says which variable supplies one', () => {
    const s = connectorStatuses({ JWT_SECRET: 's', X_OAUTH_CLIENT_ID: 'a', X_OAUTH_CLIENT_SECRET: 'b' } as NodeJS.ProcessEnv);
    const x = s.find((c) => c.key === 'x')!;
    expect(x.configured).toBe(false);
    expect(x.missing_env).toEqual(['MARKETING_OAUTH_BASE_URL']);
    expect(x.redirect_uri).toBeNull();
  });

  it('an explicit base URL wins over the LinkedIn-derived one, without a trailing slash', () => {
    expect(redirectUriFor('x', { ...BASE, MARKETING_OAUTH_BASE_URL: 'https://enterprise.colaberry.ai/' } as NodeJS.ProcessEnv))
      .toBe('https://enterprise.colaberry.ai/api/marketing/oauth/x/callback');
  });

  it('every generic network states what the platform itself requires', () => {
    for (const c of GENERIC_CONNECTORS) expect(c.requirements.length).toBeGreaterThan(40);
  });
});
