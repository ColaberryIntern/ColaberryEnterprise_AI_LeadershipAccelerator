import type { Connector, DiscoveredAccount, TokenSet } from '../connectorTypes';
import { expiryFrom, missingFrom, providerMessage } from '../connectorTypes';
import { OAuthError } from '../oauthState';
import { readConfig } from '../connectorConfig';

/**
 * YouTube - a Google sign-in that yields the operator's YouTube channel.
 *
 * `access_type=offline` + `prompt=consent` is what makes Google return a REFRESH token. Without
 * `prompt=consent`, a second connect by someone who already approved the app returns no refresh
 * token at all, and the channel would stop working an hour later with nothing able to renew it.
 * Access tokens live one hour; the refresh token is what keeps the connection alive.
 *
 * PKCE is used although Google does not require it for a web client: it costs nothing here (the
 * verifier is derived, not stored - see oauthState) and closes the intercepted-code hole.
 *
 * THE PLATFORM RULE THAT MATTERS: videos uploaded through the API from a Google Cloud project
 * that has not passed YouTube's API audit are locked to PRIVATE. Connecting works immediately;
 * public posting needs the audit. Said on the Brands page so it is not discovered by a video
 * that never appears.
 */

export const YOUTUBE_SCOPES = [
  'https://www.googleapis.com/auth/youtube.upload',
  'https://www.googleapis.com/auth/youtube.readonly',
] as const;

export const youtubeConnector: Connector = {
  key: 'youtube',
  label: 'YouTube',
  providers: ['youtube'],
  envVars: ['YOUTUBE_OAUTH_CLIENT_ID', 'YOUTUBE_OAUTH_CLIENT_SECRET'],
  scopes: YOUTUBE_SCOPES,
  usesPkce: true,
  cancelErrors: ['access_denied'],
  requirements:
    'Needs an OAuth client (Web application) in a Google Cloud project with the YouTube Data API v3 '
    + 'enabled. Until the project passes YouTube\'s API audit, uploaded videos are locked to private, '
    + 'and the consent screen shows an "unverified app" warning to anyone not listed as a test user.',

  config: (env) => readConfig('youtube', 'YOUTUBE_OAUTH_CLIENT_ID', 'YOUTUBE_OAUTH_CLIENT_SECRET', env),

  authorizeUrl(cfg, state, challenge) {
    const params = new URLSearchParams({
      client_id: cfg.clientId,
      redirect_uri: cfg.redirectUri,
      response_type: 'code',
      scope: YOUTUBE_SCOPES.join(' '),
      access_type: 'offline',
      prompt: 'consent',
      include_granted_scopes: 'true',
      state,
    });
    if (challenge) {
      params.set('code_challenge', challenge);
      params.set('code_challenge_method', 'S256');
    }
    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  },

  async exchangeCode({ cfg, code, verifier, http, now }): Promise<TokenSet> {
    const form = new URLSearchParams({
      code,
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      redirect_uri: cfg.redirectUri,
      grant_type: 'authorization_code',
    });
    if (verifier) form.set('code_verifier', verifier);
    const res = await http({
      method: 'POST',
      url: 'https://oauth2.googleapis.com/token',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    });
    if (res.status >= 400) {
      const detail = providerMessage(res.body);
      throw new OAuthError(detail ? `Google refused the sign-in: ${detail}` : `Google refused the sign-in (HTTP ${res.status}).`, 'ExchangeFailed', res.status === 400 ? 400 : 502);
    }
    const b = res.body as Record<string, unknown>;
    if (typeof b.access_token !== 'string') throw new OAuthError('Google returned no access token.', 'ExchangeFailed', 502);
    return {
      accessToken: b.access_token,
      refreshToken: typeof b.refresh_token === 'string' ? b.refresh_token : null,
      expiresAt: expiryFrom(now, b.expires_in),
      refreshExpiresAt: expiryFrom(now, b.refresh_token_expires_in),
      scopes: typeof b.scope === 'string' ? b.scope.split(/\s+/).filter(Boolean) : [],
    };
  },

  async discoverAccounts({ token, http }): Promise<DiscoveredAccount[]> {
    const res = await http({
      method: 'GET',
      url: 'https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true',
      headers: { Authorization: `Bearer ${token.accessToken}` },
    });
    if (res.status >= 400) {
      const detail = providerMessage(res.body);
      throw new OAuthError(detail ? `YouTube would not identify the channel: ${detail}` : `YouTube would not identify the channel (HTTP ${res.status}).`, 'IdentityFailed', 502);
    }
    const items = Array.isArray((res.body as any)?.items) ? (res.body as any).items : [];
    return items
      .filter((c: any) => typeof c?.id === 'string')
      .map((c: any): DiscoveredAccount => ({
        provider: 'youtube',
        providerAccountId: c.id,
        displayName: c.snippet?.title ?? 'YouTube channel',
        handle: typeof c.snippet?.customUrl === 'string' ? c.snippet.customUrl : null,
        avatarUrl: c.snippet?.thumbnails?.default?.url ?? null,
        accessToken: token.accessToken,
        refreshToken: token.refreshToken,
        expiresAt: token.expiresAt,
        refreshExpiresAt: token.refreshExpiresAt,
        grantedScopes: token.scopes,
        missingScopes: missingFrom(['https://www.googleapis.com/auth/youtube.upload'], token.scopes),
        metadata: {},
      }));
  },
};
