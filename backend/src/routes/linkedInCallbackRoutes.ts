import { Router, Request, Response } from 'express';
import {
  decodeState, exchangeCode, fetchMemberIdentity, missingScopes, LinkedInOAuthError, type OAuthHttp,
} from '../services/marketing/linkedInOAuth';
import type { ConnectInput, AccountView } from '../services/marketing/channelAccountService';

/**
 * linkedInCallbackRoutes — `GET /api/marketing/linkedin/callback?code=&state=`
 *
 * PUBLIC, and it MUST be mounted BEFORE `adminRoutes` in `server.ts`. LinkedIn redirects the
 * operator's BROWSER here after they approve; a top-level navigation carries no Authorization
 * header, so anything behind the admin guard 401s it. `/r/`, `/i/` and `/m/` all learned this;
 * the test builds both mount orders. The path is under `/api/` on purpose: that prefix is
 * already proxied by both nginx layers, so no edge change is needed.
 *
 * What stands in for the missing session is the SIGNED STATE (linkedInOAuth.ts): it carries
 * the admin who started the flow and the brand the account joins, under an HMAC only this
 * server can mint, with a ten-minute life. The brand id is taken from the state, never from
 * anything else in the query. A state that fails to verify ends the flow with a message and
 * no network call.
 *
 * The result is a redirect to the Brands page with `?linkedin=connected|error`, because this
 * URL is the browser's address bar at that moment and a JSON body would be what the operator
 * sees. Nothing secret appears in that redirect: the token has already been sealed into the
 * vault by `connectAccount` and the redirect carries an outcome word and the brand id.
 */

export interface CallbackDeps {
  http: OAuthHttp;
  connect: (input: ConnectInput) => Promise<AccountView>;
  /** The brand's tenant, or null when the brand is gone. Kept injectable so the route tests need no models. */
  brandTenant: (brandId: string) => Promise<string | null>;
  now: () => number;
  /** Where the operator lands afterwards. */
  returnPath: string;
}

// Must be a path the frontend router actually renders (frontend/src/routes/adminRoutes.tsx:
// AdminBrandsPage is at /admin/brands). The first version said /admin/marketing/brands and the
// operator would have landed on the 404 page with the account silently saved. Pinned by a
// frontend test that renders the page at this exact path.
export const DEFAULT_RETURN_PATH = '/admin/brands';

function defaultDeps(): CallbackDeps {
  return {
    http: async ({ method, url, headers, body }) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 20_000);
      try {
        const res = await fetch(url, { method, headers, body, signal: controller.signal });
        const raw = await res.text();
        let parsed: unknown = raw;
        try { parsed = JSON.parse(raw); } catch { parsed = { message: raw.slice(0, 300) }; }
        return { status: res.status, body: parsed };
      } finally { clearTimeout(timer); }
    },
    connect: async (input) => {
      const { connectAccount } = await import('../services/marketing/channelAccountService');
      return connectAccount(input);
    },
    brandTenant: async (brandId) => {
      const { Brand } = await import('../models');
      const brand = await Brand.findByPk(brandId);
      return brand?.tenant_id ?? null;
    },
    now: () => Date.now(),
    returnPath: DEFAULT_RETURN_PATH,
  };
}

function redirectTo(res: Response, returnPath: string, outcome: 'connected' | 'error', extra: Record<string, string>): void {
  const params = new URLSearchParams({ linkedin: outcome, ...extra });
  res.redirect(302, `${returnPath}?${params.toString()}`);
}

export function makeLinkedInCallbackRouter(overrides: Partial<CallbackDeps> = {}): Router {
  const deps: CallbackDeps = { ...defaultDeps(), ...overrides };
  const router = Router();

  router.get('/api/marketing/linkedin/callback', async (req: Request, res: Response) => {
    const q = (k: string) => (typeof req.query[k] === 'string' ? (req.query[k] as string) : null);
    const state = q('state');

    // The state is checked FIRST, even when LinkedIn reports an error, so the brand id in
    // the redirect is one we signed and not one an attacker chose.
    let payload: { adminId: string; brandId: string };
    try {
      if (!state) throw new LinkedInOAuthError('The sign-in state is missing.', 'StateInvalid');
      payload = decodeState(state, deps.now());
    } catch (err) {
      const e = err as LinkedInOAuthError;
      return redirectTo(res, deps.returnPath, 'error', { reason: e.errorClass ?? 'StateInvalid' });
    }

    // The operator declined, or LinkedIn refused before issuing a code.
    const providerError = q('error');
    if (providerError) {
      return redirectTo(res, deps.returnPath, 'error', { brand: payload.brandId, reason: providerError === 'user_cancelled_login' || providerError === 'user_cancelled_authorize' ? 'cancelled' : 'provider_refused' });
    }
    const code = q('code');
    if (!code) return redirectTo(res, deps.returnPath, 'error', { brand: payload.brandId, reason: 'NoCode' });

    try {
      const tenantId = await deps.brandTenant(payload.brandId);
      if (!tenantId) return redirectTo(res, deps.returnPath, 'error', { brand: payload.brandId, reason: 'BrandNotFound' });

      const token = await exchangeCode(code, deps.http, process.env, () => new Date(deps.now()));
      const who = await fetchMemberIdentity(token.accessToken, deps.http);
      const account = await deps.connect({
        tenantId,
        brandId: payload.brandId,
        provider: 'linkedin_member',
        providerAccountId: who.sub,
        displayName: who.name,
        avatarUrl: who.picture,
        grantedScopes: token.scopes,
        missingScopes: missingScopes(token.scopes),
        accessToken: token.accessToken,
        tokenExpiresAt: token.expiresAt,
        connectedBy: payload.adminId,
      });
      console.log(JSON.stringify({ timestamp: new Date().toISOString(), level: 'info', service: 'marketing', event: 'linkedin_account_connected', outcome: 'success', context: { brand_id: payload.brandId, account_id: account.id, connected_by: payload.adminId, missing_scopes: account.missing_scopes } }));
      return redirectTo(res, deps.returnPath, 'connected', { brand: payload.brandId, account: account.id });
    } catch (err) {
      const e = err as { errorClass?: string; name?: string; message?: string };
      console.error(JSON.stringify({ timestamp: new Date().toISOString(), level: 'error', service: 'marketing', event: 'linkedin_account_connect_failed', outcome: 'failure', error_class: e?.errorClass ?? e?.name ?? 'Error', context: { brand_id: payload.brandId, message: String(e?.message ?? err).slice(0, 200) } }));
      return redirectTo(res, deps.returnPath, 'error', { brand: payload.brandId, reason: e?.errorClass ?? 'ConnectFailed' });
    }
  });

  return router;
}

export default makeLinkedInCallbackRouter();
