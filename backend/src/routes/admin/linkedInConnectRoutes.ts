import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireAdmin } from '../../middlewares/authMiddleware';
import { adminTenantScope, scopeAllows } from '../../modules/tenancy/adminScopeBridge';
import { buildAuthorizeUrl, isLinkedInConfigured, LinkedInOAuthError } from '../../services/marketing/linkedInOAuth';

/**
 * Start connecting a LinkedIn profile to a brand: `POST /api/admin/marketing/linkedin/connect`.
 *
 * The browser is not redirected from here; the URL is returned and the page navigates to it.
 * That keeps the admin JWT in play for THIS call (the brand is checked against the caller's
 * tenant scope, and the caller's id is signed into the state) while the callback, which
 * LinkedIn's redirect reaches with no JWT at all, trusts only the signed state
 * (linkedInCallbackRoutes.ts). The two halves are deliberately in different files: one is
 * behind the admin guard, the other must be mounted above it.
 */

const router = Router();
const Body = z.object({ brand_id: z.string().uuid() }).strict();

router.get('/api/admin/marketing/linkedin/status', requireAdmin, (_req: Request, res: Response) => {
  res.json({ configured: isLinkedInConfigured() });
});

router.post('/api/admin/marketing/linkedin/connect', requireAdmin, async (req: Request, res: Response) => {
  const parsed = Body.safeParse(req.body);
  if (!parsed.success) return void res.status(400).json({ error: 'brand_id must be a UUID', error_class: 'ValidationError' });
  const adminId = req.admin?.sub;
  if (!adminId) return void res.status(401).json({ error: 'Authentication required', error_class: 'AuthError' });
  try {
    const { Brand } = await import('../../models');
    const scope = await adminTenantScope(req.admin);
    const brand = await Brand.findByPk(parsed.data.brand_id);
    if (!brand || !scopeAllows(scope, brand.tenant_id)) return void res.status(404).json({ error: 'Brand not found', error_class: 'NotFound' });
    const { url } = buildAuthorizeUrl({ brandId: brand.id, adminId });
    res.json({ url });
  } catch (err) {
    if (err instanceof LinkedInOAuthError) return void res.status(err.status).json({ error: err.message, error_class: err.errorClass });
    console.error(JSON.stringify({ timestamp: new Date().toISOString(), level: 'error', service: 'marketing', event: 'linkedin_connect_start_failed', outcome: 'failure', error_class: (err as Error)?.name ?? 'Error', context: { message: String((err as Error)?.message ?? err).slice(0, 200) } }));
    res.status(500).json({ error: 'The connection could not be started.', error_class: 'InternalError' });
  }
});

export default router;
