import { Router, Request, Response } from 'express';
import { requireAdmin } from '../../middlewares/authMiddleware';
import {
  buildVisitorFlowGraph,
  getFlowNodeSessions,
} from '../../services/reporting/visitorFlowGraphService';

const router = Router();

// ── Visitor Navigation Flow Graph ───────────────────────────────────────────

router.get('/api/admin/visitor-flow/graph', requireAdmin, async (req: Request, res: Response) => {
  try {
    const timeWindow = req.query.timeWindow as string | undefined;
    const data = await buildVisitorFlowGraph(timeWindow);
    res.json(data);
  } catch (err: any) {
    console.error('Visitor flow graph error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── Node Drilldown: Sessions for a specific node ────────────────────────────

router.get('/api/admin/visitor-flow/graph/node-sessions', requireAdmin, async (req: Request, res: Response) => {
  try {
    const nodeId = req.query.nodeId as string;
    if (!nodeId) return res.status(400).json({ error: 'nodeId is required' });
    const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string, 10) || 50));
    const timeWindow = req.query.timeWindow as string | undefined;
    const result = await getFlowNodeSessions(nodeId, page, limit, timeWindow);
    res.json(result);
  } catch (err: any) {
    console.error('Visitor flow node sessions error:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
