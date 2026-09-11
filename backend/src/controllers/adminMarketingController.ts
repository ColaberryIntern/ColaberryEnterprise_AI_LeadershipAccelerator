import { Request, Response } from 'express';
import { getCampaignMetrics } from '../services/marketingAnalyticsService';
import { resolveAllRankings } from '../services/marketing/campaignRanking';
import { getMetric, mayComputeWith } from '../services/adminOs/metricRegistry';

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
  try {
    const { start, end } = req.query as { start?: string; end?: string };
    const metrics = await getCampaignMetrics({ start, end });
    const ranking = resolveAllRankings({
      mayCompute: (key) => mayComputeWith(key),
      reasonFor: (key) => getMetric(key)?.statusReason ?? 'not registered',
    });
    res.json({ campaigns: metrics, ranking });
  } catch (error: any) {
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(), level: 'error', service: 'marketing',
      event: 'campaign_metrics_failed', outcome: 'failure',
      error_class: error?.name ?? 'Error', context: { message: String(error?.message ?? error).slice(0, 200) },
    }));
    res.status(500).json({ error: 'Failed to fetch campaign metrics', error_class: 'InternalError' });
  }
}
