import type { Connector, DiscoveredAccount, OAuthHttp, TokenSet } from '../connectorTypes';
import { expiryFrom, missingFrom, providerMessage } from '../connectorTypes';
import { OAuthError } from '../oauthState';
import { readConfig } from '../connectorConfig';
import { LINKEDIN_API_VERSION } from '../../../publishing/linkedInAdapter';

/**
 * LinkedIn Pages - a LinkedIn sign-in that yields every Company Page the member administers.
 *
 * WHY A SECOND APP. Posting as a Page needs `w_organization_social`, which only LinkedIn's
 * Community Management API grants. That product is vetted, and LinkedIn will only accept the
 * request from "new developer applications that don't have access to other API products" - so
 * it cannot be added to the existing member-posting app (86e3lkpm791ybb, which also serves a
 * Bubble app and must not be disturbed). Hence its own LINKEDIN_ORG_* credentials.
 *
 * The publishing half already exists: `LinkedInAdapter` handles `linkedin_organization`, and
 * `getAuthorUrn` turns the numeric id stored here into `urn:li:organization:{id}`. This module
 * is the missing connect step, which is why it stores the bare number.
 *
 * WHICH PAGES. `organizationAcls` lists the member's roles; only APPROVED ADMINISTRATOR roles
 * are kept, because LinkedIn's own definition is that an administrator "can post updates" and
 * the lesser roles cannot. LinkedIn's documentation names the organization field two ways in
 * its own examples (`organization` and `organizationTarget`), so both are read.
 */

export const LINKEDIN_ORG_SCOPES = ['w_organization_social', 'r_organization_admin'] as const;

/** Bound on name lookups: one call per page, and nobody administers more than this many. */
const MAX_ORGANIZATIONS = 25;

function restHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    'LinkedIn-Version': LINKEDIN_API_VERSION,
    'X-Restli-Protocol-Version': '2.0.0',
  };
}

async function organizationName(http: OAuthHttp, token: string, id: string): Promise<{ name: string; vanity: string | null }> {
  const res = await http({ method: 'GET', url: `https://api.linkedin.com/rest/organizations/${encodeURIComponent(id)}`, headers: restHeaders(token) });
  // A page whose name will not load is still a page the member can post to. Connect it under
  // its id rather than failing the whole sign-in over a label.
  if (res.status >= 400) return { name: `LinkedIn Page ${id}`, vanity: null };
  const b = res.body as Record<string, any>;
  return { name: b.localizedName ?? `LinkedIn Page ${id}`, vanity: b.vanityName ?? null };
}

export const linkedinOrgConnector: Connector = {
  key: 'linkedin_org',
  label: 'LinkedIn Company Page',
  providers: ['linkedin_organization'],
  envVars: ['LINKEDIN_ORG_CLIENT_ID', 'LINKEDIN_ORG_CLIENT_SECRET'],
  scopes: LINKEDIN_ORG_SCOPES,
  usesPkce: false,
  cancelErrors: ['user_cancelled_login', 'user_cancelled_authorize'],
  requirements:
    'Needs a SECOND LinkedIn developer app, created fresh, with the Community Management API requested '
    + 'on it - LinkedIn only accepts that request on an app with no other products, so the existing app '
    + 'cannot be reused. LinkedIn vets the request (Development tier first). The person connecting must '
    + 'be a Super admin or Content admin of the Company Page.',

  config: (env) => readConfig('linkedin_org', 'LINKEDIN_ORG_CLIENT_ID', 'LINKEDIN_ORG_CLIENT_SECRET', env),

  authorizeUrl(cfg, state) {
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: cfg.clientId,
      redirect_uri: cfg.redirectUri,
      state,
      scope: LINKEDIN_ORG_SCOPES.join(' '),
    });
    return `https://www.linkedin.com/oauth/v2/authorization?${params.toString()}`;
  },

  async exchangeCode({ cfg, code, http, now }): Promise<TokenSet> {
    const res = await http({
      method: 'POST',
      url: 'https://www.linkedin.com/oauth/v2/accessToken',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        client_id: cfg.clientId,
        client_secret: cfg.clientSecret,
        redirect_uri: cfg.redirectUri,
      }).toString(),
    });
    if (res.status >= 400) {
      const detail = providerMessage(res.body);
      throw new OAuthError(detail ? `LinkedIn refused the sign-in: ${detail}` : `LinkedIn refused the sign-in (HTTP ${res.status}).`, 'ExchangeFailed', res.status === 400 ? 400 : 502);
    }
    const b = res.body as Record<string, unknown>;
    if (typeof b.access_token !== 'string') throw new OAuthError('LinkedIn returned no access token.', 'ExchangeFailed', 502);
    return {
      accessToken: b.access_token,
      // Community Management apps may receive refresh tokens; the member app never did.
      refreshToken: typeof b.refresh_token === 'string' ? b.refresh_token : null,
      expiresAt: expiryFrom(now, b.expires_in),
      refreshExpiresAt: expiryFrom(now, b.refresh_token_expires_in),
      scopes: typeof b.scope === 'string' ? b.scope.split(/[\s,]+/).filter(Boolean) : [],
    };
  },

  async discoverAccounts({ token, http }): Promise<DiscoveredAccount[]> {
    const res = await http({
      method: 'GET',
      url: 'https://api.linkedin.com/rest/organizationAcls?q=roleAssignee&role=ADMINISTRATOR&state=APPROVED&count=100',
      headers: restHeaders(token.accessToken),
    });
    if (res.status >= 400) {
      const detail = providerMessage(res.body);
      throw new OAuthError(
        detail ? `LinkedIn would not list the Pages you administer: ${detail}` : `LinkedIn would not list the Pages you administer (HTTP ${res.status}).`,
        'IdentityFailed',
        res.status === 403 ? 403 : 502,
      );
    }
    const elements = Array.isArray((res.body as any)?.elements) ? (res.body as any).elements : [];
    const ids: string[] = [];
    for (const el of elements) {
      if (el?.role !== 'ADMINISTRATOR' || el?.state !== 'APPROVED') continue;
      const urn = typeof el.organization === 'string' ? el.organization : el.organizationTarget;
      const match = typeof urn === 'string' ? /^urn:li:organization:(\d+)$/.exec(urn) : null;
      if (match && !ids.includes(match[1])) ids.push(match[1]);
    }

    const accounts: DiscoveredAccount[] = [];
    for (const id of ids.slice(0, MAX_ORGANIZATIONS)) {
      const { name, vanity } = await organizationName(http, token.accessToken, id);
      accounts.push({
        provider: 'linkedin_organization',
        providerAccountId: id,
        displayName: name,
        handle: vanity,
        avatarUrl: null,
        accessToken: token.accessToken,
        refreshToken: token.refreshToken,
        expiresAt: token.expiresAt,
        refreshExpiresAt: token.refreshExpiresAt,
        grantedScopes: token.scopes,
        missingScopes: missingFrom(['w_organization_social'], token.scopes),
        metadata: {},
      });
    }
    return accounts;
  },
};
