/**
 * Admin routes for the AI Ops Command Center (Phase 0).
 *
 * Mount path: /api/admin/ops/*
 *
 * Phase 0 surface:
 *   GET /api/admin/ops/health         — readiness + last sync stats
 *   GET /api/admin/ops/todos          — Waiting on Human queue (open todos)
 *   GET /api/admin/ops/metrics/today  — today's dashboard tile
 *   POST /api/admin/ops/sync          — manual BC re-sync trigger (admin only)
 *
 * Later phases will add: /approvals, /run-day, /metrics/range, /artifacts, etc.
 */
import { Router, Request, Response } from 'express';
import { Op } from 'sequelize';
import { requireAdmin } from '../../middlewares/authMiddleware';
import OpsBcTodo from '../../models/OpsBcTodo';
import OpsMetricsDaily from '../../models/OpsMetricsDaily';
import OpsApprovalQueueItem from '../../models/OpsApprovalQueueItem';
import { runBcSync, BcSyncResult } from '../../services/ops/bcSyncService';
import { runPriorityEngine, PriorityEngineRunResult } from '../../services/ops/priorityEngineService';

const router = Router();

let lastSync: BcSyncResult | null = null;
let syncInFlight = false;
let lastPriorityRun: PriorityEngineRunResult | null = null;
let priorityInFlight = false;

export function setLastSync(result: BcSyncResult): void {
  lastSync = result;
}

export function getLastSync(): BcSyncResult | null {
  return lastSync;
}

export function setLastPriorityRun(result: PriorityEngineRunResult): void {
  lastPriorityRun = result;
}

export function getLastPriorityRun(): PriorityEngineRunResult | null {
  return lastPriorityRun;
}

router.get('/api/admin/ops/health', requireAdmin, async (_req: Request, res: Response) => {
  try {
    const [todoCount, openApprovals] = await Promise.all([
      OpsBcTodo.count(),
      OpsApprovalQueueItem.count({ where: { decided_at: null } }),
    ]);
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      todos_mirrored: todoCount,
      open_approvals: openApprovals,
      last_sync: lastSync
        ? {
            started_at: lastSync.started_at,
            finished_at: lastSync.finished_at,
            duration_ms:
              lastSync.finished_at.getTime() - lastSync.started_at.getTime(),
            projects_seen: lastSync.projects_seen,
            todos_seen: lastSync.todos_seen,
            todos_inserted: lastSync.todos_inserted,
            todos_updated: lastSync.todos_updated,
            error_count: lastSync.errors.length,
          }
        : null,
      sync_in_flight: syncInFlight,
      last_priority_run: lastPriorityRun
        ? {
            started_at: lastPriorityRun.started_at,
            finished_at: lastPriorityRun.finished_at,
            duration_ms:
              lastPriorityRun.finished_at.getTime() - lastPriorityRun.started_at.getTime(),
            todos_scored: lastPriorityRun.todos_scored,
            audit_rows_written: lastPriorityRun.audit_rows_written,
            category_counts: lastPriorityRun.category_counts,
            error_count: lastPriorityRun.errors.length,
          }
        : null,
      priority_in_flight: priorityInFlight,
    });
  } catch (err: any) {
    res.status(500).json({ status: 'error', error: err.message });
  }
});

router.get('/api/admin/ops/todos', requireAdmin, async (req: Request, res: Response) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 500);
    const status = (req.query.status as string) || 'active';
    const todos = await OpsBcTodo.findAll({
      where: { status: { [Op.eq]: status } },
      order: [
        ['urgency_score', 'DESC NULLS LAST' as any],
        ['due_on', 'ASC NULLS LAST' as any],
        ['bc_updated_at', 'DESC'],
      ],
      limit,
    });
    res.json({ todos, count: todos.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get(
  '/api/admin/ops/metrics/today',
  requireAdmin,
  async (_req: Request, res: Response) => {
    try {
      const today = new Date().toISOString().slice(0, 10);
      const row = await OpsMetricsDaily.findByPk(today);
      res.json({
        date: today,
        metrics: row || null,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  },
);

router.post('/api/admin/ops/sync', requireAdmin, async (_req: Request, res: Response) => {
  if (syncInFlight) {
    res.status(409).json({ error: 'Sync already in flight' });
    return;
  }
  syncInFlight = true;
  try {
    const result = await runBcSync();
    lastSync = result;
    res.json({ ok: true, result });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  } finally {
    syncInFlight = false;
  }
});

router.post('/api/admin/ops/score', requireAdmin, async (_req: Request, res: Response) => {
  if (priorityInFlight) {
    res.status(409).json({ error: 'Priority engine already in flight' });
    return;
  }
  priorityInFlight = true;
  try {
    const result = await runPriorityEngine();
    lastPriorityRun = result;
    res.json({ ok: true, result });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  } finally {
    priorityInFlight = false;
  }
});

export default router;
