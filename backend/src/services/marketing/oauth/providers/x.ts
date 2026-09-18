import type { Connector, DiscoveredAccount, TokenSet } from '../connectorTypes';
import { expiryFrom, missingFrom, providerMessage } from '../connectorTypes';
import { OAuthError } from '../oauthState';
import { readConfig } from '../connectorConfig';

/**
 * X - OAuth 2.0 authorization code with PKCE, yielding the operator's X account.
 *
 * PKCE is REQUIRED by X; the verifier is derived from the signed state's nonce (oauthState),
 * so nothing is stored between the redirect and the callback. The app is a confidential client,
 * so the token exchange authenticates with HTTP Basic (client id : client secret).
 *
 * Access tokens live TWO HOURS. `offline.access` is what makes X issue a refresh token, and X
 * rotates the refresh token on every use - whatever renews it must store the replacement before
 * using it, or the connection dies on the second renewal.
 *
 * COST, because this is the only network here that charges per call: the X API is pay-per-use
 * with prepaid credits (checked 2026-09-18): about $0.015 per post, $0.20 per post containing a
 * URL. Connecting costs one user lookup. The Brands page says so next to the button.
 *
 * These credentials are deliberately NOT the older `TWITTER_API_KEY` / `TWITTER_ACCESS_TOKEN`
 * variables the codebase references: those are OAuth 1.0a keys for a single hard-wired account.
 * This is per-brand OAuth 2.0 through the vault, and sharing names would make it impossible to
 * tell which one a server is actually configured for.
 */

export const X_SCOPES = ['tweet.read', 'tweet.write', 'users.read', 'offline.access'] as const;

export const xConnector: Connector = {
  key: 'x',
  label: 'X',
  providers: ['x'],
  envVars: ['X_OAUTH_CLIENT_ID', 'X_OAUTH_CLIENT_SECRET'],
  scopes: X_SCOPES,
  usesPkce: true,
  cancelErrors: ['access_denied'],
  requirements:
    'Needs an X developer app with OAuth 2.0 turned on (type: Web App, confidential client) and '
    + 'Read and Write permission. The X API is pay-per-use with prepaid credits - about $0.015 per post, '
    + '$0.20 per post that contains a link (checked 2026-09-18).',

  config: (env) => readConfig('x', 'X_OAUTH_CLIENT_ID', 'X_OAUTH_CLIENT_SECRET', env),

  authorizeUrl(cfg, state, challenge) {
    if (!challenge) throw new OAuthError('X requires PKCE and no challenge was supplied.', 'ConfigMissing', 500);
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: cfg.clientId,
      redirect_uri: cfg.redirectUri,
      scope: X_SCOPES.join(' '),
      state,
      code_challenge: challenge,
      code_challenge_method: 'S256',
    });
    return `https://x.com/i/oauth2/authorize?${params.toString()}`;
  },

  async exchangeCode({ cfg, code, verifier, http, now }): Promise<TokenSet> {
    if (!verifier) throw new OAuthError('X requires the PKCE verifier at exchange.', 'ConfigMissing', 500);
    const basic = Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`, 'utf8').toString('base64');
    const res = await http({
      method: 'POST',
      url: 'https://api.x.com/2/oauth2/token',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: `Basic ${basic}` },
      body: new URLSearchParams({
        code,
        grant_type: 'authorization_code',
        redirect_uri: cfg.redirectUri,
        code_verifier: verifier,
      }).toString(),
    });
    if (res.status >= 400) {
      const detail = providerMessage(res.body);
      throw new OAuthError(detail ? `X refused the sign-in: ${detail}` : `X refused the sign-in (HTTP ${res.status}).`, 'ExchangeFailed', res.status === 400 ? 400 : 502);
    }
    const b = res.body as Record<string, unknown>;
    if (typeof b.access_token !== 'string') throw new OAuthError('X returned no access token.', 'ExchangeFailed', 502);
    return {
      accessToken: b.access_token,
      refreshToken: typeof b.refresh_token === 'string' ? b.refresh_token : null,
      expiresAt: expiryFrom(now, b.expires_in),
      refreshExpiresAt: null,
      scopes: typeof b.scope === 'string' ? b.scope.split(/\s+/).filter(Boolean) : [],
    };
  },

  async discoverAccounts({ token, http }): Promise<DiscoveredAccount[]> {
    const res = await http({
      method: 'GET',
      url: 'https://api.x.com/2/users/me?user.fields=profile_image_url',
      headers: { Authorization: `Bearer ${token.accessToken}` },
    });
    if (res.status >= 400) {
      const detail = providerMessage(res.body);
      throw new OAuthError(detail ? `X would not identify the account: ${detail}` : `X would not identify the account (HTTP ${res.status}).`, 'IdentityFailed', 502);
    }
    const user = (res.body as any)?.data;
    if (!user?.id) throw new OAuthError('X returned no account id.', 'IdentityFailed', 502);
    return [{
      provider: 'x',
      providerAccountId: String(user.id),
      displayName: user.name ?? (user.username ? `@${user.username}` : 'X account'),
      handle: user.username ?? null,
      avatarUrl: user.profile_image_url ?? null,
      accessToken: token.accessToken,
      refreshToken: token.refreshToken,
      expiresAt: token.expiresAt,
      refreshExpiresAt: token.refreshExpiresAt,
      grantedScopes: token.scopes,
      missingScopes: missingFrom(['tweet.write', 'offline.access'], token.scopes),
      metadata: {},
    }];
  },
};
