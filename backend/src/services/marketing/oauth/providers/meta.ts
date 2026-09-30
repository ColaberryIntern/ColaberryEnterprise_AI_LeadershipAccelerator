import type { Connector, DiscoveredAccount, OAuthHttp, TokenSet } from '../connectorTypes';
import { expiryFrom, missingFrom, providerMessage } from '../connectorTypes';
import { OAuthError } from '../oauthState';
import { readConfig } from '../connectorConfig';

/**
 * Meta - one Facebook sign-in, every Facebook Page the operator ticked, and the Instagram
 * professional account linked to each.
 *
 * THE TOKEN LADDER. Facebook Login returns a short-lived USER token (about two hours). That is
 * traded for a long-lived user token (about sixty days), and `/me/accounts` called with THAT
 * returns a PAGE token per Page which does not expire. The Page token is what posts, both to
 * the Page and to its linked Instagram account. Skipping the long-lived step still returns Page
 * tokens, but ones that die with the short user token - an account that connects, reads as
 * healthy, and fails every post from the next morning on.
 *
 * WHICH PAGES. The Facebook dialog lets the operator tick the Pages to grant; whatever they
 * ticked comes back from `/me/accounts` and is connected. There is no second picker here,
 * because a second picker that disagrees with the first is how an operator ends up publishing
 * to a Page they meant to leave out.
 *
 * DEVELOPMENT MODE. Until Meta approves the app for Advanced Access, only people with a role on
 * the app (admin, developer, tester) can complete this sign-in, and they can connect Pages they
 * manage. For Colaberry posting to its own Pages that is the steady state, not a stopgap.
 *
 * LOGIN PRODUCT. A Business-type Meta app uses "Facebook Login for Business", whose dialog takes a
 * `config_id` (a configuration created in the app dashboard that lists the permissions) and
 * where Meta recommends NOT sending `scope`. A consumer-style app uses classic Facebook Login,
 * which only understands `scope`. So: when META_LOGIN_CONFIG_ID is set the dialog sends that;
 * otherwise it sends the scope list. Either way the same exchange and Page-token ladder follow.
 * The configuration must be for a USER access token - a system-user token would skip the
 * operator's own Page choice entirely.
 *
 * The code-for-token exchange is a GET with the client secret in the query string, because that
 * is the only form Meta documents. It is sent over TLS to graph.facebook.com and never logged.
 */

export const META_GRAPH_VERSION_DEFAULT = 'v25.0';

/** Requested at sign-in. `business_management` is needed to list Pages owned through a Business portfolio. */
export const META_SCOPES = [
  'pages_show_list',
  'pages_read_engagement',
  'pages_manage_posts',
  'instagram_basic',
  'instagram_content_publish',
  'business_management',
] as const;

const PAGE_REQUIRED = ['pages_show_list', 'pages_read_engagement', 'pages_manage_posts'];
const INSTAGRAM_REQUIRED = ['instagram_basic', 'instagram_content_publish', 'pages_read_engagement'];

/** At most this many pages of `/me/accounts` (100 Pages each) - a bound, not an expectation. */
const MAX_ACCOUNT_PAGES = 5;

function graphVersion(env: NodeJS.ProcessEnv = process.env): string {
  const v = env.META_GRAPH_VERSION?.trim();
  return v && /^v\d+\.\d+$/.test(v) ? v : META_GRAPH_VERSION_DEFAULT;
}

function graph(path: string, env?: NodeJS.ProcessEnv): string {
  return `https://graph.facebook.com/${graphVersion(env)}${path}`;
}

async function getJson(http: OAuthHttp, url: string, what: string): Promise<Record<string, any>> {
  const res = await http({ method: 'GET', url });
  if (res.status >= 400) {
    const detail = providerMessage(res.body);
    throw new OAuthError(
      detail ? `Facebook refused ${what}: ${detail}` : `Facebook refused ${what} (HTTP ${res.status}).`,
      what === 'the sign-in' ? 'ExchangeFailed' : 'IdentityFailed',
      res.status === 400 ? 400 : 502,
    );
  }
  return (res.body ?? {}) as Record<string, any>;
}

interface MetaPage {
  id?: string;
  name?: string;
  access_token?: string;
  picture?: { data?: { url?: string } };
  instagram_business_account?: { id?: string; username?: string; name?: string; profile_picture_url?: string };
}

export const metaConnector: Connector = {
  key: 'meta',
  label: 'Facebook & Instagram',
  providers: ['meta_facebook_page', 'meta_instagram'],
  envVars: ['META_APP_ID', 'META_APP_SECRET'],
  scopes: META_SCOPES,
  usesPkce: false,
  cancelErrors: ['access_denied'],
  requirements:
    'Needs a Meta developer app (Business type) with Facebook Login for Business. Until Meta grants '
    + 'Advanced Access, only people with a role on the app can connect - add Ali, Sohail and Aleem as '
    + 'app admins or testers. With Facebook Login for Business, create a login configuration (User access '
    + 'token, the permissions below) and set META_LOGIN_CONFIG_ID to its id. Instagram must be a Business '
    + 'or Creator account linked to a Facebook Page. '
    + 'Instagram allows 100 API posts per account per 24 hours.',

  config: (env) => readConfig('meta', 'META_APP_ID', 'META_APP_SECRET', env),

  authorizeUrl(cfg, state) {
    const params = new URLSearchParams({
      client_id: cfg.clientId,
      redirect_uri: cfg.redirectUri,
      state,
      response_type: 'code',
    });
    const configId = process.env.META_LOGIN_CONFIG_ID?.trim();
    if (configId) params.set('config_id', configId);
    // Meta separates scopes with commas.
    else params.set('scope', META_SCOPES.join(','));
    return `https://www.facebook.com/${graphVersion()}/dialog/oauth?${params.toString()}`;
  },

  async exchangeCode({ cfg, code, http, now }): Promise<TokenSet> {
    const short = await getJson(http, graph(`/oauth/access_token?${new URLSearchParams({
      client_id: cfg.clientId,
      redirect_uri: cfg.redirectUri,
      client_secret: cfg.clientSecret,
      code,
    }).toString()}`), 'the sign-in');
    if (!short.access_token) throw new OAuthError('Facebook returned no access token.', 'ExchangeFailed', 502);

    // Short -> long-lived user token. The Page tokens derived from a long-lived user token do
    // not expire; those derived from the short one die with it. See the header.
    const long = await getJson(http, graph(`/oauth/access_token?${new URLSearchParams({
      grant_type: 'fb_exchange_token',
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      fb_exchange_token: String(short.access_token),
    }).toString()}`), 'the sign-in');
    if (!long.access_token) throw new OAuthError('Facebook would not extend the sign-in.', 'ExchangeFailed', 502);

    const perms = await getJson(http, graph(`/me/permissions?access_token=${encodeURIComponent(String(long.access_token))}`), 'the permission check');
    const granted = Array.isArray(perms.data)
      ? perms.data.filter((p: any) => p?.status === 'granted' && typeof p.permission === 'string').map((p: any) => p.permission as string)
      : [];

    return {
      accessToken: String(long.access_token),
      refreshToken: null,
      expiresAt: expiryFrom(now, long.expires_in),
      refreshExpiresAt: null,
      scopes: granted,
    };
  },

  async discoverAccounts({ token, http }): Promise<DiscoveredAccount[]> {
    const fields = 'id,name,access_token,picture{url},instagram_business_account{id,username,name,profile_picture_url}';
    let url: string | null = graph(`/me/accounts?${new URLSearchParams({ fields, limit: '100', access_token: token.accessToken }).toString()}`);
    const pages: MetaPage[] = [];
    for (let i = 0; url && i < MAX_ACCOUNT_PAGES; i += 1) {
      const body = await getJson(http, url, 'the list of Pages');
      if (Array.isArray(body.data)) pages.push(...body.data);
      url = typeof body.paging?.next === 'string' ? body.paging.next : null;
    }

    const accounts: DiscoveredAccount[] = [];
    for (const page of pages) {
      // A Page with no token cannot post; one with no id cannot be addressed. Skipped rather than
      // connected half-working.
      if (!page.id || !page.access_token) continue;
      accounts.push({
        provider: 'meta_facebook_page',
        providerAccountId: page.id,
        displayName: page.name ?? 'Facebook Page',
        handle: null,
        avatarUrl: page.picture?.data?.url ?? null,
        accessToken: page.access_token,
        refreshToken: null,
        // Page tokens from a long-lived user token do not expire.
        expiresAt: null,
        refreshExpiresAt: null,
        grantedScopes: token.scopes,
        missingScopes: missingFrom(PAGE_REQUIRED, token.scopes),
        metadata: {},
      });

      const ig = page.instagram_business_account;
      if (ig?.id) {
        accounts.push({
          provider: 'meta_instagram',
          providerAccountId: ig.id,
          displayName: ig.username ? `@${ig.username}` : (ig.name ?? 'Instagram account'),
          handle: ig.username ?? null,
          avatarUrl: ig.profile_picture_url ?? null,
          // Instagram publishing is authorised by the linked Page's token.
          accessToken: page.access_token,
          refreshToken: null,
          expiresAt: null,
          refreshExpiresAt: null,
          grantedScopes: token.scopes,
          missingScopes: missingFrom(INSTAGRAM_REQUIRED, token.scopes),
          metadata: { facebook_page_id: page.id },
        });
      }
    }
    return accounts;
  },
};
