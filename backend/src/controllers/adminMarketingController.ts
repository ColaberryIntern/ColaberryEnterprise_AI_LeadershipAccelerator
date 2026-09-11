import { Request, Response } from 'express';
import { z } from 'zod';
import { getCampaignMetrics, totalCampaignMetrics } from '../services/marketingAnalyticsService';
import { resolveAllRankings } from '../services/marketing/campaignRanking';
import { getMetric, mayComputeWith } from '../services/adminOs/metricRegistry';
import { Brand } from '../models';
import { adminTenantScope, scopeAllows } from '../modules/tenancy/adminScopeBridge';

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const CampaignsQuerySchema = z.object({
  start: z.string().regex(ISO_DAY).optional(),
  end: z.string().regex(ISO_DAY).optional(),
  brand_id: z.string().uuid().optional(),
  compare_start: z.string().regex(ISO_DAY).optional(),
  compare_end: z.string().regex(ISO_DAY).optional(),
}).strict();

/**
 * The campaigns response carries its own RANKING RULES, resolved server-side from the registry.
 *
 * Why not let the table decide: the decision depends on which metrics are trusted, and only
 * the backend knows that. A frontend that kept its own opinion would drift from the registry
 * the first time a metric's status changed - and would keep sorting acquisition campaigns on
 * a column that had just been declared unavailable, while looking deliberate.
 *
 * One resolution per objective, not per row. The answer depends only on the objective and the
 * registry, so resolving it N times would just be N chances for it to drift between rows.
 */
export async function handleGetCampaignMetrics(req: Request, res: Response): Promise<void> {
  const parsed = CampaignsQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed', error_class: 'ValidationError', details: parsed.error.flatten() });
    return;
  }
  try {
    const { start, end, brand_id, compare_start, compare_end } = parsed.data;

    // A brand the caller may not see reads as no such brand - the same 404-never-403 rule
    // brandRoutes applies, so a brand id cannot be probed through this endpoint either.
    if (brand_id) {
      const scope = await adminTenantScope(req.admin);
      const brand = await Brand.findByPk(brand_id);
      if (!brand || !scopeAllows(scope, brand.tenant_id)) {
        res.status(404).json({ error: 'Brand not found', error_class: 'NotFound' });
        return;
      }
    }

    const metrics = await getCampaignMetrics({ start, end, brandId: brand_id });
    const ranking = resolveAllRankings({
      mayCompute: (key) => mayComputeWith(key),
      reasonFor: (key) => getMetric(key)?.statusReason ?? 'not registered',
    });

    // The comparison the scope strip states: the same query over the prior window, reduced
    // to the trusted totals. Nothing here is a rate or a currency figure.
    const compare = compare_start && compare_end
      ? {
          start: compare_start,
          end: compare_end,
          current: totalCampaignMetrics(metrics),
          prior: totalCampaignMetrics(await getCampaignMetrics({ start: compare_start, end: compare_end, brandId: brand_id })),
        }
      : null;

    res.json({ campaigns: metrics, ranking, compare, scope: { start: start ?? null, end: end ?? null, brand_id: brand_id ?? null } });
  } catch (error: any) {
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(), level: 'error', service: 'marketing',
      event: 'campaign_metrics_failed', outcome: 'failure',
      error_class: error?.name ?? 'Error', context: { message: String(error?.message ?? error).slice(0, 200) },
    }));
    res.status(500).json({ error: 'Failed to fetch campaign metrics', error_class: 'InternalError' });
  }
}
