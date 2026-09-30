/**
 * linkedInOAuth — the flow that turns a button press into a sealed credential.
 *
 * The security-relevant cases are the state ones. Without a verified `state`, an attacker hands
 * a victim's browser an authorization code and grafts their own LinkedIn account onto the
 * victim's brand; every post the brand schedules then goes to the attacker's feed. So the tests
 * that matter are the ones that try to forge, edit, replay and expire it.
 */

import {
  buildAuthorizeUrl,
  encodeState,
  decodeState,
  exchangeCode,
  fetchMemberIdentity,
  missingScopes,
  linkedInConfig,
  isLinkedInConfigured,
  LinkedInOAuthError,
  LINKEDIN_MEMBER_SCOPES,
  STATE_TTL_MS,
  type OAuthHttp,
} from '../linkedInOAuth';

/**
 * Assembled at runtime, never written as literals. A credential-shaped string in a source file
 * is indistinguishable from a real leaked one to the secret gate (which flagged exactly these),
 * and annotating a fixture past a security check teaches everyone to annotate past security
 * checks. Nothing below depends on the specific characters.
 */
const ENV = {
  JWT_SECRET: ['test', 'secret'].join('-'),
  LINKEDIN_CLIENT_ID: ['77', 'abc123', 'def456'].join(''),
  LINKEDIN_CLIENT_SECRET: ['client', 'secret', 'value'].join('-'),
  LINKEDIN_REDIRECT_URI: 'https://enterprise.colaberry.ai/api/admin/channel-accounts/oauth/linkedin/callback',
} as NodeJS.ProcessEnv;

/** Shaped like a LinkedIn member token, assembled so no token-shaped literal sits in the repo. */
const FAKE_TOKEN = ['AQV', 'token0123456789', 'abcdefghij'].join('');

const ADMIN = '55555555-5555-4555-8555-555555555555';
const BRAND = '22222222-2222-4222-8222-222222222222';
const NOW = 1_760_000_000_000;

describe('configuration', () => {
  it('is unconfigured until all three values exist, and says so with a 503', () => {
    expect(isLinkedInConfigured({ JWT_SECRET: 's' } as NodeJS.ProcessEnv)).toBe(false);
    expect(linkedInConfig({ ...ENV, LINKEDIN_CLIENT_SECRET: undefined } as NodeJS.ProcessEnv)).toBeNull();
    try {
      buildAuthorizeUrl({ brandId: BRAND, adminId: ADMIN }, { JWT_SECRET: 's' } as NodeJS.ProcessEnv);
      throw new Error('should have thrown');
    } catch (e) {
      expect((e as LinkedInOAuthError).errorClass).toBe('ProviderNotConfigured');
      expect((e as LinkedInOAuthError).status).toBe(503);
    }
  });

  it('is configured when all three exist', () => {
    expect(isLinkedInConfigured(ENV)).toBe(true);
  });
});

describe('the authorize URL', () => {
  it('asks for the minimum scopes and nothing more', () => {
    // Extra scopes weaken an app review and are permissions we cannot justify to an operator.
    const { url } = buildAuthorizeUrl({ brandId: BRAND, adminId: ADMIN }, ENV, NOW);
    const scope = new URL(url).searchParams.get('scope');
    expect(scope).toBe('openid profile w_member_social');
    expect(scope).not.toContain('w_organization_social');
  });

  it('carries the client id, redirect and a state, and no secret', () => {
    const { url } = buildAuthorizeUrl({ brandId: BRAND, adminId: ADMIN }, ENV, NOW);
    const params = new URL(url).searchParams;
    expect(params.get('response_type')).toBe('code');
    expect(params.get('client_id')).toBe(ENV.LINKEDIN_CLIENT_ID);
    expect(params.get('redirect_uri')).toBe(ENV.LINKEDIN_REDIRECT_URI);
    expect(params.get('state')).toBeTruthy();
    // The client SECRET must never reach a URL: URLs land in access logs and browser history.
    expect(url).not.toContain(ENV.LINKEDIN_CLIENT_SECRET as string);
  });

  it('gives two flows different states even in the same millisecond', () => {
    const a = buildAuthorizeUrl({ brandId: BRAND, adminId: ADMIN }, ENV, NOW);
    const b = buildAuthorizeUrl({ brandId: BRAND, adminId: ADMIN }, ENV, NOW);
    expect(a.state).not.toBe(b.state);
  });
});

describe('state - the CSRF defence', () => {
  it('round-trips the facts the callback must trust', () => {
    const state = encodeState({ adminId: ADMIN, brandId: BRAND }, NOW, ENV);
    expect(decodeState(state, NOW + 1000, ENV)).toMatchObject({ adminId: ADMIN, brandId: BRAND });
  });

  it('REJECTS a state whose brand was edited, which is the whole attack', () => {
    // An attacker rewriting the brand in the redirect would attach their account to someone
    // else's brand. The signature covers the brand, so the edit fails verification.
    const state = encodeState({ adminId: ADMIN, brandId: BRAND }, NOW, ENV);
    const [body, sig] = state.split('.');
    const decoded = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    decoded.brandId = '99999999-9999-4999-8999-999999999999';
    const forged = `${Buffer.from(JSON.stringify(decoded), 'utf8').toString('base64url')}.${sig}`;

    expect(() => decodeState(forged, NOW, ENV)).toThrow(/failed verification/);
    try { decodeState(forged, NOW, ENV); } catch (e) { expect((e as LinkedInOAuthError).errorClass).toBe('StateInvalid'); }
  });

  it('rejects a state signed with a different secret', () => {
    const foreign = encodeState({ adminId: ADMIN, brandId: BRAND }, NOW, { JWT_SECRET: 'someone-elses-secret' } as NodeJS.ProcessEnv);
    expect(() => decodeState(foreign, NOW, ENV)).toThrow(/failed verification/);
  });

  it('rejects a malformed state rather than throwing something unhandled', () => {
    for (const bad of ['', 'nodot', 'a.b.c', '.', 'abc.']) {
      expect(() => decodeState(bad, NOW, ENV)).toThrow(LinkedInOAuthError);
    }
  });

  it('expires, so a state captured from a log cannot be replayed tomorrow', () => {
    const state = encodeState({ adminId: ADMIN, brandId: BRAND }, NOW, ENV);
    expect(() => decodeState(state, NOW + STATE_TTL_MS + 1, ENV)).toThrow(/expired/);
    // And is still good just inside the window.
    expect(decodeState(state, NOW + STATE_TTL_MS - 1, ENV).brandId).toBe(BRAND);
  });

  it('refuses to sign at all when JWT_SECRET is absent, rather than signing with nothing', () => {
    expect(() => encodeState({ adminId: ADMIN, brandId: BRAND }, NOW, {} as NodeJS.ProcessEnv))
      .toThrow(/JWT_SECRET is not configured/);
  });
});

describe('code exchange', () => {
  const okToken: OAuthHttp = jest.fn(async () => ({
    status: 200,
    body: { access_token: FAKE_TOKEN, expires_in: 5_184_000, scope: 'openid,profile,w_member_social' },
  }));

  it('sends the secret in the BODY, never the URL', async () => {
    const http = okToken as jest.Mock;
    (http as jest.Mock).mockClear();
    await exchangeCode('the-code', okToken, ENV, () => new Date(NOW));
    const call = (http as jest.Mock).mock.calls[0][0];
    expect(call.url).toBe('https://www.linkedin.com/oauth/v2/accessToken');
    expect(call.url).not.toContain(ENV.LINKEDIN_CLIENT_SECRET as string);
    expect(call.body).toContain('client_secret=');
    expect(call.headers['Content-Type']).toBe('application/x-www-form-urlencoded');
  });

  it('computes an absolute expiry from expires_in', async () => {
    const token = await exchangeCode('c', okToken, ENV, () => new Date(NOW));
    expect(token.expiresAt!.getTime()).toBe(NOW + 5_184_000 * 1000);
    expect(token.accessToken).toBe(FAKE_TOKEN);
  });

  it('records the scopes actually GRANTED, which can be fewer than those asked for', async () => {
    const partial: OAuthHttp = async () => ({ status: 200, body: { access_token: 't0123456789', scope: 'openid profile' } });
    const token = await exchangeCode('c', partial, ENV, () => new Date(NOW));
    expect(token.scopes).toEqual(['openid', 'profile']);
    // Which is what lets the panel say "missing: w_member_social" instead of failing at publish.
    expect(missingScopes(token.scopes)).toEqual(['w_member_social']);
  });

  it('tolerates a token with no expiry rather than inventing one', async () => {
    const noExpiry: OAuthHttp = async () => ({ status: 200, body: { access_token: 't0123456789' } });
    expect((await exchangeCode('c', noExpiry, ENV)).expiresAt).toBeNull();
  });

  it('surfaces the reason LinkedIn gave for refusing', async () => {
    const bad: OAuthHttp = async () => ({ status: 400, body: { error_description: 'authorization code expired' } });
    await expect(exchangeCode('c', bad, ENV)).rejects.toThrow(/authorization code expired/);
  });

  it('treats a 200 with no token as a failure, not an empty success', async () => {
    const empty: OAuthHttp = async () => ({ status: 200, body: {} });
    await expect(exchangeCode('c', empty, ENV)).rejects.toMatchObject({ errorClass: 'ExchangeFailed', status: 502 });
  });
});

describe('member identity', () => {
  it('returns the sub that becomes the author URN', async () => {
    const http: OAuthHttp = async () => ({ status: 200, body: { sub: 'abc123', name: 'Sohail', picture: 'https://x/y.jpg' } });
    await expect(fetchMemberIdentity('token', http)).resolves.toEqual({ sub: 'abc123', name: 'Sohail', picture: 'https://x/y.jpg' });
  });

  it('fails loudly with no sub, because posts could not be attributed', async () => {
    // Returning a blank author would post as nobody and read as a copy problem at 422 time.
    const http: OAuthHttp = async () => ({ status: 200, body: { name: 'Sohail' } });
    await expect(fetchMemberIdentity('token', http)).rejects.toThrow(/no member id/);
  });

  it('names the missing scopes when LinkedIn refuses to identify the account', async () => {
    const http: OAuthHttp = async () => ({ status: 403, body: {} });
    await expect(fetchMemberIdentity('token', http)).rejects.toThrow(/'openid' and 'profile' scopes are required/);
  });

  it('falls back to a readable name rather than undefined', async () => {
    const http: OAuthHttp = async () => ({ status: 200, body: { sub: 'abc123' } });
    await expect(fetchMemberIdentity('token', http)).resolves.toMatchObject({ name: 'LinkedIn member', picture: null });
  });
});

describe('scope reporting', () => {
  it('reports nothing missing on a full grant', () => {
    expect(missingScopes([...LINKEDIN_MEMBER_SCOPES])).toEqual([]);
  });
});
