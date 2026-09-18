import type { Connector, DiscoveredAccount, TokenSet } from '../connectorTypes';
import { expiryFrom, missingFrom, providerMessage } from '../connectorTypes';
import { OAuthError } from '../oauthState';
import { readConfig } from '../connectorConfig';

/**
 * TikTok - Login Kit for Web, yielding the operator's TikTok account.
 *
 * TikTok calls its client id a `client_key`, separates scopes with COMMAS, and does not use PKCE
 * for web apps (only mobile and desktop). Access tokens live 24 hours; the refresh token lives
 * 365 days and may be replaced on every refresh, so whatever renews it must store the new one.
 *
 * THE PLATFORM RULE THAT MATTERS: until TikTok audits the app, "all content posted by unaudited
 * clients will be restricted to private viewing mode". Connecting works immediately; public
 * posting needs the audit.
 *
 * TikTok reports failure two ways - an HTTP error, or HTTP 200 with an `error` object whose
 * `code` is not "ok" - so both are checked. Treating 200 as success is how a failed identity
 * lookup becomes an account named "undefined".
 */

export const TIKTOK_SCOPES = ['user.info.basic', 'video.upload', 'video.publish'] as const;

function tiktokFailure(body: unknown): string | null {
  const b = body as Record<string, any> | null;
  if (!b) return null;
  if (typeof b.error === 'string' && b.error) return b.error_description ?? b.error;
  if (b.error && typeof b.error === 'object' && b.error.code && b.error.code !== 'ok') return b.error.message ?? b.error.code;
  return null;
}

export const tiktokConnector: Connector = {
  key: 'tiktok',
  label: 'TikTok',
  providers: ['tiktok'],
  envVars: ['TIKTOK_CLIENT_KEY', 'TIKTOK_CLIENT_SECRET'],
  scopes: TIKTOK_SCOPES,
  usesPkce: false,
  cancelErrors: ['access_denied'],
  requirements:
    'Needs a TikTok for Developers app with Login Kit and the Content Posting API. Until TikTok audits '
    + 'the app, everything it posts is private (visible only to the account owner).',

  config: (env) => readConfig('tiktok', 'TIKTOK_CLIENT_KEY', 'TIKTOK_CLIENT_SECRET', env),

  authorizeUrl(cfg, state) {
    const params = new URLSearchParams({
      client_key: cfg.clientId,
      scope: TIKTOK_SCOPES.join(','),
      response_type: 'code',
      redirect_uri: cfg.redirectUri,
      state,
    });
    return `https://www.tiktok.com/v2/auth/authorize/?${params.toString()}`;
  },

  async exchangeCode({ cfg, code, http, now }): Promise<TokenSet> {
    const res = await http({
      method: 'POST',
      url: 'https://open.tiktokapis.com/v2/oauth/token/',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_key: cfg.clientId,
        client_secret: cfg.clientSecret,
        code,
        grant_type: 'authorization_code',
        redirect_uri: cfg.redirectUri,
      }).toString(),
    });
    const failure = res.status >= 400 ? (providerMessage(res.body) ?? `HTTP ${res.status}`) : tiktokFailure(res.body);
    if (failure) throw new OAuthError(`TikTok refused the sign-in: ${failure}`, 'ExchangeFailed', res.status >= 500 ? 502 : 400);
    const b = res.body as Record<string, unknown>;
    if (typeof b.access_token !== 'string') throw new OAuthError('TikTok returned no access token.', 'ExchangeFailed', 502);
    return {
      accessToken: b.access_token,
      refreshToken: typeof b.refresh_token === 'string' ? b.refresh_token : null,
      expiresAt: expiryFrom(now, b.expires_in),
      refreshExpiresAt: expiryFrom(now, b.refresh_expires_in),
      scopes: typeof b.scope === 'string' ? b.scope.split(/[\s,]+/).filter(Boolean) : [],
    };
  },

  async discoverAccounts({ token, http }): Promise<DiscoveredAccount[]> {
    const res = await http({
      method: 'GET',
      url: 'https://open.tiktokapis.com/v2/user/info/?fields=open_id,avatar_url,display_name',
      headers: { Authorization: `Bearer ${token.accessToken}` },
    });
    const failure = res.status >= 400 ? (providerMessage(res.body) ?? `HTTP ${res.status}`) : tiktokFailure(res.body);
    if (failure) throw new OAuthError(`TikTok would not identify the account: ${failure}`, 'IdentityFailed', 502);
    const user = (res.body as any)?.data?.user;
    if (!user?.open_id) throw new OAuthError('TikTok returned no account id.', 'IdentityFailed', 502);
    return [{
      provider: 'tiktok',
      providerAccountId: String(user.open_id),
      displayName: user.display_name ?? 'TikTok account',
      handle: null,
      avatarUrl: user.avatar_url ?? null,
      accessToken: token.accessToken,
      refreshToken: token.refreshToken,
      expiresAt: token.expiresAt,
      refreshExpiresAt: token.refreshExpiresAt,
      grantedScopes: token.scopes,
      missingScopes: missingFrom(['video.publish', 'video.upload'], token.scopes),
      metadata: {},
    }];
  },
};
