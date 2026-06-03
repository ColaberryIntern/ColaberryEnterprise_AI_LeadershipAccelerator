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
import { Op, QueryTypes } from 'sequelize';
import { requireAdmin } from '../../middlewares/authMiddleware';
import { sequelize } from '../../config/database';
import OpsBcTodo from '../../models/OpsBcTodo';
import OpsBcProject from '../../models/OpsBcProject';
import OpsMetricsDaily from '../../models/OpsMetricsDaily';
import OpsApprovalQueueItem from '../../models/OpsApprovalQueueItem';
import { runBcSync, BcSyncResult } from '../../services/ops/bcSyncService';
import { runPriorityEngine, PriorityEngineRunResult } from '../../services/ops/priorityEngineService';
import { generatePrompt } from '../../services/ops/runMyDayPromptService';

// Ali's Basecamp user id. ali@colaberry.com / Managing Director / id 17454835.
// Verified via the people.json lookup — owns 293 active todos. (45321751
// from the token JWT payload was the bot service account "CB System" at
// vishnu@colaberry.com, not Ali.) Hardcoded for Phase 1; lift to env /
// system_settings table when more than one operator uses the Command Center.
const ALI_BC_USER_ID = process.env.ALI_BC_USER_ID || '17454835';
// Threshold above which we attach a Claude Code prompt block to a queue item.
const PROMPT_THRESHOLD_URGENCY = 40;

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

/**
 * GET /api/admin/ops/projects
 *
 * Returns every CB-managed project with a count of Ali's open todos in
 * each. Drives the top-of-page project tab nav.
 */
router.get('/api/admin/ops/projects', requireAdmin, async (_req: Request, res: Response) => {
  try {
    const rows = await sequelize.query<{
      bc_id: string;
      name: string;
      is_cb_managed: boolean;
      weight: string;
      ali_open_count: string;
      ali_red_count: string;
    }>(
      `SELECT p.bc_id, p.name, p.is_cb_managed, p.weight,
              COALESCE(t.ali_open_count, 0)::text AS ali_open_count,
              COALESCE(t.ali_red_count, 0)::text AS ali_red_count
         FROM ops_bc_projects p
         LEFT JOIN LATERAL (
           SELECT COUNT(*) AS ali_open_count,
                  COUNT(*) FILTER (WHERE urgency_score >= 70) AS ali_red_count
             FROM ops_bc_todos
            WHERE project_id = p.bc_id
              AND status = 'active'
              AND assignee_ids @> :ali_jsonb
         ) t ON true
        WHERE p.is_cb_managed = TRUE
        ORDER BY ali_open_count DESC NULLS LAST, p.name`,
      {
        type: QueryTypes.SELECT,
        replacements: { ali_jsonb: JSON.stringify([ALI_BC_USER_ID]) },
      },
    );
    res.json({
      projects: rows.map((r) => ({
        bc_id: r.bc_id,
        name: r.name,
        is_cb_managed: r.is_cb_managed,
        weight: parseFloat(r.weight),
        ali_open_count: parseInt(r.ali_open_count, 10),
        ali_red_count: parseInt(r.ali_red_count, 10),
      })),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/admin/ops/my-queue?project_id=<optional>
 *
 * Returns Ali's open todos, grouped by project -> todolist, sorted by
 * urgency_score DESC within each todolist. Each todo includes a Claude
 * Code prompt block when urgency_score >= PROMPT_THRESHOLD_URGENCY.
 *
 * Scope:
 *   - only active todos (status = 'active')
 *   - only assigned to Ali (assignee_ids @> ['45321751'])
 *   - only in CB-managed projects (ops_bc_projects.is_cb_managed = TRUE)
 *   - optional further filter to a single project_id
 */
router.get('/api/admin/ops/my-queue', requireAdmin, async (req: Request, res: Response) => {
  try {
    const projectId = req.query.project_id ? String(req.query.project_id) : null;
    const includePrompts = req.query.prompts !== 'false';

    const rows = await sequelize.query<{
      bc_id: string;
      project_id: string;
      project_name: string;
      todolist_id: string | null;
      todolist_name: string | null;
      title: string;
      description: string | null;
      bc_app_url: string | null;
      due_on: string | null;
      bc_updated_at: string;
      urgency_score: number | null;
      category: string;
    }>(
      `SELECT t.bc_id, t.project_id, p.name AS project_name,
              t.todolist_id, t.todolist_name, t.title, t.description,
              t.bc_app_url, t.due_on, t.bc_updated_at,
              t.urgency_score, t.category
         FROM ops_bc_todos t
         JOIN ops_bc_projects p ON p.bc_id = t.project_id
        WHERE t.status = 'active'
          AND p.is_cb_managed = TRUE
          AND t.assignee_ids @> :ali_jsonb
          ${projectId ? 'AND t.project_id = :project_id' : ''}
        ORDER BY p.name,
                 t.todolist_name NULLS LAST,
                 t.urgency_score DESC NULLS LAST,
                 t.due_on ASC NULLS LAST,
                 t.bc_updated_at DESC`,
      {
        type: QueryTypes.SELECT,
        replacements: {
          ali_jsonb: JSON.stringify([ALI_BC_USER_ID]),
          ...(projectId ? { project_id: projectId } : {}),
        },
      },
    );

    // Group: project -> todolist -> [todos]
    type Task = {
      bc_id: string;
      title: string;
      description: string | null;
      bc_app_url: string | null;
      due_on: string | null;
      bc_updated_at: string;
      urgency_score: number | null;
      category: any;
      recommended_prompt: string | null;
    };
    type Todolist = {
      todolist_id: string | null;
      todolist_name: string | null;
      tasks: Task[];
    };
    type Project = {
      project_id: string;
      project_name: string;
      todolists: Todolist[];
      task_count: number;
      red_count: number;
    };

    const projectMap = new Map<string, Project>();
    for (const r of rows) {
      let proj = projectMap.get(r.project_id);
      if (!proj) {
        proj = {
          project_id: r.project_id,
          project_name: r.project_name,
          todolists: [],
          task_count: 0,
          red_count: 0,
        };
        projectMap.set(r.project_id, proj);
      }
      let tl = proj.todolists.find(
        (x) => (x.todolist_id || '') === (r.todolist_id || ''),
      );
      if (!tl) {
        tl = {
          todolist_id: r.todolist_id,
          todolist_name: r.todolist_name,
          tasks: [],
        };
        proj.todolists.push(tl);
      }
      const prompt =
        includePrompts && (r.urgency_score || 0) >= PROMPT_THRESHOLD_URGENCY
          ? generatePrompt({
              bc_id: r.bc_id,
              title: r.title,
              description: r.description,
              bc_app_url: r.bc_app_url,
              project_id: r.project_id,
              project_name: r.project_name,
              todolist_name: r.todolist_name,
              due_on: r.due_on,
              bc_updated_at: r.bc_updated_at,
              urgency_score: r.urgency_score,
              category: r.category as any,
            })
          : null;
      tl.tasks.push({
        bc_id: r.bc_id,
        title: r.title,
        description: r.description,
        bc_app_url: r.bc_app_url,
        due_on: r.due_on,
        bc_updated_at: r.bc_updated_at,
        urgency_score: r.urgency_score,
        category: r.category,
        recommended_prompt: prompt,
      });
      proj.task_count++;
      if ((r.urgency_score || 0) >= 70) proj.red_count++;
    }

    res.json({
      projects: Array.from(projectMap.values()),
      total_tasks: rows.length,
      assignee_bc_id: ALI_BC_USER_ID,
      project_filter: projectId,
      prompt_threshold_urgency: PROMPT_THRESHOLD_URGENCY,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/admin/ops/projects/:bc_id/cb-managed
 *
 * Toggle a project's is_cb_managed flag. Used by the project tab nav
 * (right-click "hide this project") or a dedicated settings page.
 */
router.post(
  '/api/admin/ops/projects/:bc_id/cb-managed',
  requireAdmin,
  async (req: Request, res: Response) => {
    try {
      const is_cb_managed = !!req.body?.is_cb_managed;
      const [count] = await OpsBcProject.update(
        { is_cb_managed },
        { where: { bc_id: req.params.bc_id } },
      );
      if (count === 0) {
        res.status(404).json({ error: 'project not found' });
        return;
      }
      res.json({ ok: true, bc_id: req.params.bc_id, is_cb_managed });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  },
);

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
