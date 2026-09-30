import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireAdmin } from '../../middlewares/authMiddleware';
import { adminTenantScope, scopeAllows } from '../../modules/tenancy/adminScopeBridge';
import { connectorStatuses, genericConnector } from '../../services/marketing/oauth/connectorRegistry';
import { encodeState, pkceChallenge, pkceVerifier, OAuthError } from '../../services/marketing/oauth/oauthState';
import { buildAuthorizeUrl, LinkedInOAuthError } from '../../services/marketing/linkedInOAuth';

/**
 * Start connecting any network to a brand, and list which networks this server is set up for.
 *
 *   GET  /api/admin/marketing/connectors            -> every network, configured or not, with
 *                                                      the env var NAMES still missing and the
 *                                                      exact redirect URI to register
 *   POST /api/admin/marketing/connect/:connector    -> { url } to send the browser to
 *
 * Same split as LinkedIn's (linkedInConnectRoutes.ts): THIS half runs with the admin's JWT, so the
 * brand is checked against the caller's tenant scope and the caller's id is signed into the
 * state. The callback (marketingOAuthCallbackRoutes.ts) arrives with no JWT at all and trusts
 * only that signed state. The browser is not redirected from here - the URL is returned and
 * the page navigates - so this call keeps its Authorization header.
 *
 * `linkedin` is accepted here too and delegates to the existing LinkedIn flow, so the Brands page
 * has one way to start every network. Its callback remains the one registered with LinkedIn.
 */

const router = Router();
const Body = z.object({ brand_id: z.string().uuid() }).strict();
const KNOWN = ['linkedin', 'linkedin_org', 'meta', 'youtube', 'tiktok', 'x'] as const;

function log(level: 'info' | 'error', event: string, context: Record<string, unknown>, errorClass?: string): void {
  const line = JSON.stringify({
    timestamp: new Date().toISOString(), level, service: 'marketing', event,
    outcome: level === 'error' ? 'failure' : 'success', ...(errorClass ? { error_class: errorClass } : {}), context,
  });
  if (level === 'error') console.error(line); else console.log(line);
}

router.get('/api/admin/marketing/connectors', requireAdmin, (_req: Request, res: Response) => {
  res.json({ connectors: connectorStatuses() });
});

router.post('/api/admin/marketing/connect/:connector', requireAdmin, async (req: Request, res: Response) => {
  const connectorKey = String(req.params.connector);
  if (!(KNOWN as readonly string[]).includes(connectorKey)) {
    return void res.status(404).json({ error: 'Unknown network', error_class: 'UnknownConnector' });
  }
  const parsed = Body.safeParse(req.body);
  if (!parsed.success) return void res.status(400).json({ error: 'brand_id must be a UUID', error_class: 'ValidationError' });
  const adminId = req.admin?.sub;
  if (!adminId) return void res.status(401).json({ error: 'Authentication required', error_class: 'AuthError' });

  try {
    const { Brand } = await import('../../models');
    const scope = await adminTenantScope(req.admin);
    const brand = await Brand.findByPk(parsed.data.brand_id);
    // Out of scope reads as not found, never as forbidden: a 403 would confirm the brand exists.
    if (!brand || !scopeAllows(scope, brand.tenant_id)) {
      return void res.status(404).json({ error: 'Brand not found', error_class: 'NotFound' });
    }

    if (connectorKey === 'linkedin') {
      const { url } = buildAuthorizeUrl({ brandId: brand.id, adminId });
      return void res.json({ url });
    }

    const connector = genericConnector(connectorKey)!;
    const cfg = connector.config(process.env);
    if (!cfg) {
      return void res.status(503).json({
        error: `${connector.label} is not set up on this server yet.`,
        error_class: 'ProviderNotConfigured',
      });
    }
    const { state, payload } = encodeState({ connector: connector.key, adminId, brandId: brand.id });
    const challenge = connector.usesPkce ? pkceChallenge(pkceVerifier(payload.nonce)) : null;
    log('info', 'oauth_connect_started', { connector: connector.key, brand_id: brand.id, admin_id: adminId });
    res.json({ url: connector.authorizeUrl(cfg, state, challenge) });
  } catch (err) {
    if (err instanceof OAuthError || err instanceof LinkedInOAuthError) {
      return void res.status(err.status).json({ error: err.message, error_class: err.errorClass });
    }
    log('error', 'oauth_connect_start_failed', { connector: connectorKey, message: String((err as Error)?.message ?? err).slice(0, 200) }, (err as Error)?.name ?? 'Error');
    res.status(500).json({ error: 'The connection could not be started.', error_class: 'InternalError' });
  }
});

export default router;
