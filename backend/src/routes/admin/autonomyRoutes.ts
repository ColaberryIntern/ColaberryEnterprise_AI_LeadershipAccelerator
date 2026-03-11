// ─── Autonomy Routes ─────────────────────────────────────────────────────────
// REST endpoints for autonomous decisions, simulation, and on-demand cycles.

import { Router, Request, Response } from 'express';
import IntelligenceDecision from '../../models/IntelligenceDecision';
import { runAutonomousCycle, simulateAutonomousCycle } from '../../intelligence/autonomy/autonomousEngine';
import { executeAction } from '../../intelligence/agents/ExecutionAgent';
import { Op } from 'sequelize';
import { sequelize } from '../../config/database';
import crypto from 'crypto';

const router = Router();

// GET /intelligence/autonomy/decisions — List decisions
router.get('/intelligence/autonomy/decisions', async (req: Request, res: Response) => {
  try {
    const { status, limit = '50', offset = '0' } = req.query;
    const where: Record<string, any> = {};
    if (status) where.execution_status = status;

    const decisions = await IntelligenceDecision.findAndCountAll({
      where,
      order: [['timestamp', 'DESC']],
      limit: Math.min(Number(limit) || 50, 100),
      offset: Number(offset) || 0,
    });

    res.json({ decisions: decisions.rows, total: decisions.count });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /intelligence/autonomy/decisions/:id — Single decision
router.get('/intelligence/autonomy/decisions/:id', async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const decision = await IntelligenceDecision.findByPk(id);
    if (!decision) return res.status(404).json({ error: 'Decision not found' });
    res.json(decision);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /intelligence/autonomy/decisions/:id/execute — Manual execute
router.post('/intelligence/autonomy/decisions/:id/execute', async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const decision = await IntelligenceDecision.findByPk(id);
    if (!decision) return res.status(404).json({ error: 'Decision not found' });

    const status = decision.get('execution_status') as string;
    if (!['proposed', 'approved'].includes(status)) {
      return res.status(400).json({ error: `Cannot execute decision in "${status}" status` });
    }

    const action = decision.get('recommended_action') as string;
    const params = (decision.get('action_details') as Record<string, any>)?.parameters || {};
    const traceId = crypto.randomUUID();

    const result = await executeAction(
      id,
      action as any,
      params,
      traceId,
      'admin',
    );

    res.json({ success: result.success, trace_id: traceId, error: result.error });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /intelligence/autonomy/decisions/:id/reject — Reject
router.post('/intelligence/autonomy/decisions/:id/reject', async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const decision = await IntelligenceDecision.findByPk(id);
    if (!decision) return res.status(404).json({ error: 'Decision not found' });

    await decision.update({
      execution_status: 'rejected',
      reasoning: ((decision.get('reasoning') as string) || '') + '\n[Admin] Manually rejected',
    });

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /intelligence/autonomy/simulate — Simulate impact
router.post('/intelligence/autonomy/simulate', async (_req: Request, res: Response) => {
  try {
    const result = await simulateAutonomousCycle();
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /intelligence/autonomy/dashboard — Summary stats
router.get('/intelligence/autonomy/dashboard', async (_req: Request, res: Response) => {
  try {
    const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const statusCounts: any[] = await sequelize.query(
      `SELECT execution_status, COUNT(*) as count
       FROM intelligence_decisions
       WHERE timestamp >= :since
       GROUP BY execution_status`,
      { replacements: { since: last24h }, type: 'SELECT' as any },
    ).catch(() => []);

    const counts: Record<string, number> = {};
    for (const row of statusCounts) {
      counts[row.execution_status] = Number(row.count);
    }

    const avgScores: any[] = await sequelize.query(
      `SELECT AVG(risk_score) as avg_risk, AVG(confidence_score) as avg_confidence
       FROM intelligence_decisions
       WHERE timestamp >= :since`,
      { replacements: { since: last24h }, type: 'SELECT' as any },
    ).catch(() => []);

    res.json({
      period: '24h',
      status_counts: counts,
      total: Object.values(counts).reduce((a, b) => a + b, 0),
      avg_risk_score: Math.round(Number(avgScores[0]?.avg_risk) || 0),
      avg_confidence_score: Math.round(Number(avgScores[0]?.avg_confidence) || 0),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /intelligence/autonomy/run-cycle — Trigger on-demand cycle
router.post('/intelligence/autonomy/run-cycle', async (_req: Request, res: Response) => {
  try {
    const result = await runAutonomousCycle();
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
