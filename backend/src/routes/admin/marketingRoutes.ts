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

const CalendarQuerySchema = z.object({
  start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  brand_id: z.string().uuid().optional(),
});

/**
 * The cross-brand, cross-channel calendar (T023).
 *
 * Returns UTC instants plus each brand's timezone and lets the client render brand-local time.
 * The server never converts to local: rendering is where the timezone database lives, and a
 * server-side wall-clock string would be one more thing that could be built in the wrong zone.
 */
router.get('/api/admin/marketing/calendar', requireAdmin, async (req: Request, res: Response) => {
  const parsed = CalendarQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed', error_class: 'ValidationError', details: parsed.error.flatten() });
    return;
  }
  try {
    const scope = await adminTenantScope(req.admin);
    if (scope.mode === 'denied') { res.json({ items: [], scope_mode: scope.mode }); return; }

    const { ContentItem, Brand, PublishingJob } = await import('../../models');
    const { Op } = await import('sequelize');
    const where: Record<string, unknown> = {
      scheduled_for: {
        [Op.gte]: new Date(`${parsed.data.start}T00:00:00Z`),
        // End is INCLUSIVE of the whole end day in UTC; the client re-buckets in its own zone.
        [Op.lt]: new Date(new Date(`${parsed.data.end}T00:00:00Z`).getTime() + 86_400_000),
      },
    };
    if (scope.mode === 'scoped') where.tenant_id = scope.tenantIds;
    if (parsed.data.brand_id) where.brand_id = parsed.data.brand_id;

    const items = await ContentItem.findAll({
      where,
      attributes: ['id', 'brand_id', 'title', 'status', 'scheduled_for', 'content_type'],
      order: [['scheduled_for', 'ASC']],
    });
    const brandIds = Array.from(new Set(items.map((i) => i.brand_id).filter((b): b is string => Boolean(b))));
    const brands = brandIds.length ? await Brand.findAll({ where: { id: brandIds }, attributes: ['id', 'name', 'timezone'] }) : [];
    const brandById = new Map(brands.map((b) => [b.id, b]));
    const jobs = items.length
      ? await PublishingJob.findAll({ where: { content_item_id: items.map((i) => i.id) }, attributes: ['content_item_id', 'provider'] })
      : [];
    const channelsByItem = new Map<string, Set<string>>();
    for (const j of jobs) {
      if (!channelsByItem.has(j.content_item_id)) channelsByItem.set(j.content_item_id, new Set());
      channelsByItem.get(j.content_item_id)!.add(j.provider);
    }

    res.json({
      scope_mode: scope.mode,
      items: items.map((i) => {
        const b = i.brand_id ? brandById.get(i.brand_id) : undefined;
        return {
          id: i.id,
          brandId: i.brand_id,
          brandName: b?.name ?? 'No brand',
          brandTimeZone: b?.timezone ?? null,
          channels: Array.from(channelsByItem.get(i.id) ?? []),
          title: i.title,
          contentType: i.content_type,
          scheduledFor: i.scheduled_for ? new Date(i.scheduled_for).toISOString() : null,
          status: i.status,
        };
      }),
    });
  } catch (err: any) {
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(), level: 'error', service: 'marketing',
      event: 'calendar_failed', outcome: 'failure',
      error_class: err?.name ?? 'Error', context: { message: String(err?.message ?? err).slice(0, 200) },
    }));
    res.status(500).json({ error: 'Failed to load the calendar', error_class: 'InternalError' });
  }
});

export default router;
