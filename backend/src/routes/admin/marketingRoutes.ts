import { Router, Request, Response } from 'express';
import { requireAdmin } from '../../middlewares/authMiddleware';
import { handleGetCampaignMetrics } from '../../controllers/adminMarketingController';
import { getChannelROIAggregation, flagUnregisteredTraffic } from '../../services/campaignLinkService';
import { getNeedsAttentionQueue } from '../../services/marketing/needsAttentionService';
import { adminTenantScope } from '../../modules/tenancy/adminScopeBridge';
import { z } from 'zod';

const router = Router();

router.get('/api/admin/marketing/campaigns', requireAdmin, handleGetCampaignMetrics);

router.get('/api/admin/marketing/channel-roi', requireAdmin, async (_req: Request, res: Response) => {
  try {
    const channels = await getChannelROIAggregation();
    res.json({ channels });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/api/admin/marketing/unregistered-traffic', requireAdmin, async (_req: Request, res: Response) => {
  try {
    const flagged = await flagUnregisteredTraffic();
    res.json({ flagged_count: flagged });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

const NeedsAttentionQuerySchema = z.object({
  brand_id: z.string().uuid().optional(),
});

/**
 * The Needs-Attention queue for the command center.
 *
 * Scoped through the same self-closing membership ramp as brand admin, so the counts an
 * operator sees are the counts for tenants they can act on. A `denied` scope returns an
 * EMPTY queue with the scope mode attached rather than a 403: the page renders it as
 * "no signals in your scope", which is true, instead of an error, which would suggest the
 * queue itself is broken.
 */
router.get('/api/admin/marketing/needs-attention', requireAdmin, async (req: Request, res: Response) => {
  const parsed = NeedsAttentionQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed', error_class: 'ValidationError', details: parsed.error.flatten() });
    return;
  }
  try {
    const scope = await adminTenantScope(req.admin);
    if (scope.mode === 'denied') {
      res.json({ items: [], excluded: [], scope_mode: scope.mode });
      return;
    }
    const queue = await getNeedsAttentionQueue({
      tenantIds: scope.mode === 'scoped' ? scope.tenantIds : null,
      brandId: parsed.data.brand_id ?? null,
    });
    res.json({ ...queue, scope_mode: scope.mode });
  } catch (err: any) {
    // Logged with a class, not swallowed: a 500 on this surface with no trace is exactly the
    // observability miss the T011 verifier flagged on brandRoutes.
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(), level: 'error', service: 'marketing',
      event: 'needs_attention_failed', outcome: 'failure',
      error_class: err?.name ?? 'Error', context: { message: String(err?.message ?? err).slice(0, 200) },
    }));
    res.status(500).json({ error: 'Failed to build the attention queue', error_class: 'InternalError' });
  }
});

export default router;
