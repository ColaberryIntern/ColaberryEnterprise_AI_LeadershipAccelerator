import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireAdmin } from '../../middlewares/authMiddleware';
import {
  buildMarketingFunnelGraph,
  getFunnelNodeLeads,
} from '../../services/reporting/marketingFunnelGraphService';

const router = Router();

// ── Marketing Funnel Graph ──────────────────────────────────────────────────

router.get('/api/admin/marketing/funnel/graph', requireAdmin, async (req: Request, res: Response) => {
  try {
    const timeWindow = req.query.timeWindow as string | undefined;
    const data = await buildMarketingFunnelGraph(timeWindow);
    res.json(data);
  } catch (err: any) {
    console.error('Marketing funnel graph error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── Node Drilldown: Leads for a specific node ───────────────────────────────

router.get('/api/admin/marketing/funnel/graph/node-leads', requireAdmin, async (req: Request, res: Response) => {
  try {
    const nodeId = req.query.nodeId as string;
    if (!nodeId) return res.status(400).json({ error: 'nodeId is required' });
    const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string, 10) || 20));
    const timeWindow = req.query.timeWindow as string | undefined;
    const result = await getFunnelNodeLeads(nodeId, page, limit, timeWindow);
    res.json(result);
  } catch (err: any) {
    console.error('Marketing funnel node leads error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── Acquisition funnel ──────────────────────────────────────────────────────
//
// Separate from the graph above, which is CAMPAIGN-driven and has reported "no data available"
// since the campaign engine was paused in August, however much ad traffic actually arrives. This
// one reads the tracking data, so it shows what happened to the people who clicked.

router.get('/api/admin/marketing/funnel/acquisition', requireAdmin, async (req: Request, res: Response) => {
  try {
    // Clamped rather than trusted: this value reaches interval arithmetic in SQL.
    const raw = parseInt(String(req.query.days ?? '30'), 10);
    const days = Number.isFinite(raw) ? Math.min(365, Math.max(1, raw)) : 30;
    const { acquisitionFunnel } = await import('../../services/marketing/acquisitionFunnel');
    res.json(await acquisitionFunnel(days));
  } catch (err: any) {
    console.error('[marketing] acquisition funnel error:', err?.message);
    res.status(500).json({ error: 'Failed to load the acquisition funnel', error_class: 'InternalError' });
  }
});

// R3: sent, failed and cancelled-by-reason for the same window, so "nothing is being sent" reads as zero on this page.
const SendOutcomesQuery = z.object({ days: z.coerce.number().int().default(30) });
router.get('/api/admin/marketing/funnel/send-outcomes', requireAdmin, async (req: Request, res: Response) => {
  try {
    // Zod-validated, then clamped exactly like the acquisition window above, so the two always describe the same days.
    const parsed = SendOutcomesQuery.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid request', error_class: 'ValidationError' });
      return;
    }
    const days = Math.min(365, Math.max(1, parsed.data.days));
    const { sendOutcomes } = await import('../../services/marketing/sendOutcomes');
    res.json(await sendOutcomes(days));
  } catch (err: unknown) {
    console.error(JSON.stringify({ level: 'error', service: 'backend', event: 'send_outcomes_failed', outcome: 'failure',
      error_class: err instanceof Error ? err.name : 'UnknownError', context: { message: err instanceof Error ? err.message : String(err) } }));
    res.status(500).json({ error: 'Failed to load send outcomes', error_class: 'InternalError' });
  }
});

export default router;
