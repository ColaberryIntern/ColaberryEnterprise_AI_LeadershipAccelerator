import { Router, Request, Response } from 'express';
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

export default router;
