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
import { generatePrompt, buildSuggestion } from '../../services/ops/runMyDayPromptService';
import {
  recordDecision,
  fetchTodoComments,
  fetchDecisionsForTodo,
  getTodayDecisionStats,
} from '../../services/ops/approvalService';
import { rollupToday } from '../../services/ops/metricsDailyService';
import { runAutomationRules, AutomationRunResult } from '../../services/ops/automationRulesService';
import OpsSkill from '../../models/OpsSkill';

// Ali's Basecamp user id. ali@colaberry.com / Managing Director / id 17454835.
// Verified via the people.json lookup — owns 293 active todos. (45321751
// from the token JWT payload was the bot service account "CB System" at
// vishnu@colaberry.com, not Ali.) Hardcoded for Phase 1; lift to env /
// system_settings table when more than one operator uses the Command Center.
const ALI_BC_USER_ID = process.env.ALI_BC_USER_ID || '17454835';
// Threshold above which we attach a Claude Code prompt block to a queue item.
const PROMPT_THRESHOLD_URGENCY = 40;
// Freshness filter: hide todos with no BC activity in this window. Ancient
// zombie tickets (2018-era "Proof of Education for Instructors" etc.) keep
// scoring high because the priority engine rewards staleness — they belong
// closed or archived, not in Ali's daily queue. Override via env if needed.
const STALE_HIDE_DAYS = Math.max(1, Number(process.env.OPS_STALE_HIDE_DAYS) || 90);

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

let lastAutomationRun: AutomationRunResult | null = null;
let automationInFlight = false;

export function setLastAutomationRun(result: AutomationRunResult): void {
  lastAutomationRun = result;
}

export function getLastAutomationRun(): AutomationRunResult | null {
  return lastAutomationRun;
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

router.post(
  '/api/admin/ops/metrics/rollup',
  requireAdmin,
  async (_req: Request, res: Response) => {
    try {
      const result = await rollupToday();
      res.json({ ok: true, result });
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
              AND is_dismissed = FALSE
              AND bc_updated_at >= NOW() - (:stale_days || ' days')::interval
         ) t ON true
        WHERE p.is_cb_managed = TRUE
        ORDER BY ali_open_count DESC NULLS LAST, p.name`,
      {
        type: QueryTypes.SELECT,
        replacements: { ali_jsonb: JSON.stringify([ALI_BC_USER_ID]), stale_days: STALE_HIDE_DAYS },
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
      stale_hide_days: STALE_HIDE_DAYS,
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
/**
 * GET /api/admin/ops/stale-todos?limit=50
 *
 * Surfaces the hidden zombies — todos with no BC activity in
 * STALE_HIDE_DAYS days but still in active status. Lets Ali batch-archive
 * them via the dismiss endpoint below.
 */
router.get('/api/admin/ops/stale-todos', requireAdmin, async (req: Request, res: Response) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 500);
    const rows = await sequelize.query<{
      bc_id: string;
      project_id: string;
      project_name: string;
      todolist_name: string | null;
      title: string;
      bc_app_url: string | null;
      due_on: string | null;
      bc_updated_at: string;
      urgency_score: number | null;
      days_stale: string;
    }>(
      `SELECT t.bc_id, t.project_id, p.name AS project_name, t.todolist_name,
              t.title, t.bc_app_url, t.due_on, t.bc_updated_at, t.urgency_score,
              FLOOR(EXTRACT(EPOCH FROM (NOW() - t.bc_updated_at)) / 86400)::text AS days_stale
         FROM ops_bc_todos t
         JOIN ops_bc_projects p ON p.bc_id = t.project_id
        WHERE t.status = 'active'
          AND t.is_dismissed = FALSE
          AND p.is_cb_managed = TRUE
          AND t.assignee_ids @> :ali_jsonb
          AND t.bc_updated_at < NOW() - (:stale_days || ' days')::interval
        ORDER BY t.bc_updated_at ASC
        LIMIT :limit`,
      {
        type: QueryTypes.SELECT,
        replacements: {
          ali_jsonb: JSON.stringify([ALI_BC_USER_ID]),
          stale_days: STALE_HIDE_DAYS,
          limit,
        },
      },
    );
    res.json({
      todos: rows.map((r) => ({ ...r, days_stale: parseInt(r.days_stale, 10) })),
      total: rows.length,
      stale_hide_days: STALE_HIDE_DAYS,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/admin/ops/todos/dismiss
 * Body: { bc_ids: string[], reason?: 'archive' | 'not_mine' | 'completed' | string }
 *
 * Marks one or many todos as dismissed in the local mirror. Does NOT touch
 * the upstream BC ticket — this is a local "out of my view" flag, fully
 * reversible. Future sync passes won't re-surface them since the queue
 * queries filter on is_dismissed = FALSE.
 */
router.post(
  '/api/admin/ops/todos/dismiss',
  requireAdmin,
  async (req: Request, res: Response) => {
    try {
      const bc_ids: string[] = Array.isArray(req.body?.bc_ids) ? req.body.bc_ids.map(String) : [];
      const reason = String(req.body?.reason || 'archive').slice(0, 40);
      const undismiss = req.body?.undismiss === true;
      if (bc_ids.length === 0) {
        res.status(400).json({ error: 'bc_ids (array) required' });
        return;
      }
      const decidedBy = req.admin?.email || 'unknown';
      const sql = undismiss
        ? `UPDATE ops_bc_todos
              SET is_dismissed = FALSE,
                  dismissed_at = NULL,
                  dismissed_by = NULL,
                  dismissed_reason = NULL,
                  updated_at = NOW()
            WHERE bc_id = ANY(:bc_ids)`
        : `UPDATE ops_bc_todos
              SET is_dismissed = TRUE,
                  dismissed_at = NOW(),
                  dismissed_by = :decided_by,
                  dismissed_reason = :reason,
                  updated_at = NOW()
            WHERE bc_id = ANY(:bc_ids)`;
      const [, meta]: any = await sequelize.query(sql, {
        replacements: { bc_ids, decided_by: decidedBy, reason },
      });
      res.json({ ok: true, count: bc_ids.length, undismiss, meta });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  },
);

router.get('/api/admin/ops/my-queue', requireAdmin, async (req: Request, res: Response) => {
  try {
    const projectId = req.query.project_id ? String(req.query.project_id) : null;

    // Slim payload: no prompt bodies in the list. Each task carries a
    // boolean has_suggestion so the UI knows whether to show the "Decide"
    // workspace expander. The full prompt + structured suggestion are
    // fetched per task via /workspace.
    const rows = await sequelize.query<{
      bc_id: string;
      project_id: string;
      project_name: string;
      todolist_id: string | null;
      todolist_name: string | null;
      title: string;
      bc_app_url: string | null;
      due_on: string | null;
      bc_updated_at: string;
      urgency_score: number | null;
      category: string;
    }>(
      `SELECT t.bc_id, t.project_id, p.name AS project_name,
              t.todolist_id, t.todolist_name, t.title,
              t.bc_app_url, t.due_on, t.bc_updated_at,
              t.urgency_score, t.category
         FROM ops_bc_todos t
         JOIN ops_bc_projects p ON p.bc_id = t.project_id
        WHERE t.status = 'active'
          AND p.is_cb_managed = TRUE
          AND t.assignee_ids @> :ali_jsonb
          AND t.is_dismissed = FALSE
          AND t.bc_updated_at >= NOW() - (:stale_days || ' days')::interval
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
          stale_days: STALE_HIDE_DAYS,
          ...(projectId ? { project_id: projectId } : {}),
        },
      },
    );

    // Count how many we're hiding so the UI can surface "X stale tasks
    // excluded" instead of pretending the queue is small.
    const staleCountRow = await sequelize.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count
         FROM ops_bc_todos t
         JOIN ops_bc_projects p ON p.bc_id = t.project_id
        WHERE t.status = 'active'
          AND p.is_cb_managed = TRUE
          AND t.assignee_ids @> :ali_jsonb
          AND t.is_dismissed = FALSE
          AND t.bc_updated_at < NOW() - (:stale_days || ' days')::interval
          ${projectId ? 'AND t.project_id = :project_id' : ''}`,
      {
        type: QueryTypes.SELECT,
        replacements: {
          ali_jsonb: JSON.stringify([ALI_BC_USER_ID]),
          stale_days: STALE_HIDE_DAYS,
          ...(projectId ? { project_id: projectId } : {}),
        },
      },
    );
    const staleHiddenCount = parseInt(staleCountRow[0]?.count || '0', 10);

    type Task = {
      bc_id: string;
      title: string;
      bc_app_url: string | null;
      due_on: string | null;
      bc_updated_at: string;
      urgency_score: number | null;
      category: any;
      has_suggestion: boolean;
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
      tl.tasks.push({
        bc_id: r.bc_id,
        title: r.title,
        bc_app_url: r.bc_app_url,
        due_on: r.due_on,
        bc_updated_at: r.bc_updated_at,
        urgency_score: r.urgency_score,
        category: r.category,
        has_suggestion: (r.urgency_score || 0) >= PROMPT_THRESHOLD_URGENCY,
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
      stale_hide_days: STALE_HIDE_DAYS,
      stale_hidden_count: staleHiddenCount,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/admin/ops/run-my-day?limit=5
 *
 * Returns Ali's top N highest-urgency todos that he has NOT already
 * decided today. Each task includes its full workspace bundle so the
 * frontend can render the Run My Day walk without per-task fetches.
 *
 * Scope: same as /my-queue (active + CB-managed + assigned to Ali) +
 * exclude todos already in ops_approval_queue with decided_at today
 * by the current admin.
 */
router.get('/api/admin/ops/run-my-day', requireAdmin, async (req: Request, res: Response) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 5, 1), 20);
    const decidedBy = req.admin?.email || '';

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
          AND t.urgency_score IS NOT NULL
          AND t.is_dismissed = FALSE
          AND t.bc_updated_at >= NOW() - (:stale_days || ' days')::interval
          AND NOT EXISTS (
            SELECT 1 FROM ops_approval_queue q
             WHERE q.todo_bc_id = t.bc_id
               AND q.decided_by = :decided_by
               AND q.decided_at >= date_trunc('day', NOW())
          )
        ORDER BY t.urgency_score DESC NULLS LAST,
                 t.due_on ASC NULLS LAST,
                 t.bc_updated_at DESC
        LIMIT :limit`,
      {
        type: QueryTypes.SELECT,
        replacements: {
          ali_jsonb: JSON.stringify([ALI_BC_USER_ID]),
          decided_by: decidedBy,
          stale_days: STALE_HIDE_DAYS,
          limit,
        },
      },
    );

    // Build workspace bundles in parallel (BC comments are cheap on this small N)
    const TIMEOUT_MS = 5000;
    const timeoutPromise = <T,>(p: Promise<T>, fallback: T): Promise<T> =>
      Promise.race([
        p,
        new Promise<T>((resolve) => setTimeout(() => resolve(fallback), TIMEOUT_MS)),
      ]);

    const bundles = await Promise.all(
      rows.map(async (t) => {
        const todoForPrompt = {
          bc_id: t.bc_id,
          title: t.title,
          description: t.description,
          bc_app_url: t.bc_app_url,
          project_id: t.project_id,
          project_name: t.project_name,
          todolist_name: t.todolist_name,
          due_on: t.due_on,
          bc_updated_at: t.bc_updated_at,
          urgency_score: t.urgency_score,
          category: t.category as any,
        };
        const suggestion = buildSuggestion(todoForPrompt);
        const prompt = generatePrompt(todoForPrompt);
        const commentsResult = await timeoutPromise(
          fetchTodoComments(t.bc_id).then((r) => ({ ok: true, ...r })).catch((err) => ({
            ok: false,
            comments: [] as any[],
            error: err.message,
          })),
          { ok: false, comments: [] as any[], error: 'BC comments fetch timed out (5s)' },
        );
        return {
          todo: {
            bc_id: t.bc_id,
            title: t.title,
            description: t.description,
            bc_app_url: t.bc_app_url,
            project_id: t.project_id,
            project_name: t.project_name,
            todolist_id: t.todolist_id,
            todolist_name: t.todolist_name,
            due_on: t.due_on,
            bc_updated_at: t.bc_updated_at,
            urgency_score: t.urgency_score,
            category: t.category,
          },
          suggestion,
          prompt,
          comments: (commentsResult as any).comments,
          comments_error: (commentsResult as any).ok ? null : (commentsResult as any).error || null,
          decisions: [] as any[],
        };
      }),
    );

    res.json({
      tasks: bundles,
      total: bundles.length,
      decided_by: decidedBy,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/admin/ops/todos/:bc_id/workspace
 *
 * Single round-trip context bundle for the Approval Workspace:
 *   - the full todo row
 *   - the structured suggestion (steps, resources, stop_conditions)
 *   - the raw Claude Code prompt (for terminal copy)
 *   - the last 15 BC comments
 *   - decision history
 *
 * BC comments fetch has a 5s timeout so a slow upstream doesn't hang
 * the workspace. We return whatever we have within the budget.
 */
router.get(
  '/api/admin/ops/todos/:bc_id/workspace',
  requireAdmin,
  async (req: Request, res: Response) => {
    try {
      const bcId = String(req.params.bc_id);
      const row = await sequelize.query<{
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
          WHERE t.bc_id = :bc_id
          LIMIT 1`,
        { type: QueryTypes.SELECT, replacements: { bc_id: bcId } },
      );
      const t = row[0];
      if (!t) {
        res.status(404).json({ error: 'todo not found' });
        return;
      }

      const todoForPrompt = {
        bc_id: t.bc_id,
        title: t.title,
        description: t.description,
        bc_app_url: t.bc_app_url,
        project_id: t.project_id,
        project_name: t.project_name,
        todolist_name: t.todolist_name,
        due_on: t.due_on,
        bc_updated_at: t.bc_updated_at,
        urgency_score: t.urgency_score,
        category: t.category as any,
      };

      const suggestion = buildSuggestion(todoForPrompt);
      const prompt = generatePrompt(todoForPrompt);

      // BC comments + decisions in parallel, both with a hard timeout.
      const TIMEOUT_MS = 5000;
      const timeoutPromise = <T,>(p: Promise<T>, fallback: T): Promise<T> =>
        Promise.race([
          p,
          new Promise<T>((resolve) => setTimeout(() => resolve(fallback), TIMEOUT_MS)),
        ]);

      const [commentsResult, decisions] = await Promise.all([
        timeoutPromise(
          fetchTodoComments(bcId).then((r) => ({ ok: true, ...r })).catch((err) => ({
            ok: false,
            comments: [],
            error: err.message,
          })),
          { ok: false, comments: [] as any[], error: 'BC comments fetch timed out (5s)' },
        ),
        fetchDecisionsForTodo(bcId).catch(() => [] as any[]),
      ]);

      res.json({
        todo: {
          bc_id: t.bc_id,
          title: t.title,
          description: t.description,
          bc_app_url: t.bc_app_url,
          project_id: t.project_id,
          project_name: t.project_name,
          todolist_id: t.todolist_id,
          todolist_name: t.todolist_name,
          due_on: t.due_on,
          bc_updated_at: t.bc_updated_at,
          urgency_score: t.urgency_score,
          category: t.category,
        },
        suggestion,
        prompt,
        comments: (commentsResult as any).comments,
        comments_error: (commentsResult as any).ok ? null : (commentsResult as any).error || null,
        decisions,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  },
);

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

router.post(
  '/api/admin/ops/projects/:bc_id/weight',
  requireAdmin,
  async (req: Request, res: Response) => {
    try {
      const weight = Number(req.body?.weight);
      if (!Number.isFinite(weight) || weight < 0 || weight > 2.0) {
        res.status(400).json({ error: 'weight must be a number between 0.0 and 2.0' });
        return;
      }
      const [count] = await OpsBcProject.update(
        { weight },
        { where: { bc_id: req.params.bc_id } },
      );
      if (count === 0) {
        res.status(404).json({ error: 'project not found' });
        return;
      }
      res.json({ ok: true, bc_id: req.params.bc_id, weight });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  },
);

/**
 * GET /api/admin/ops/todos/:bc_id/comments
 *
 * Read-through proxy: fetches the last 15 BC comments on a todo so the
 * Approval Workspace can show context to the operator. Not stored.
 */
router.get(
  '/api/admin/ops/todos/:bc_id/comments',
  requireAdmin,
  async (req: Request, res: Response) => {
    try {
      const result = await fetchTodoComments(String(req.params.bc_id));
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  },
);

/**
 * GET /api/admin/ops/todos/:bc_id/decisions
 *
 * Returns the historical decision trail for a todo.
 */
router.get(
  '/api/admin/ops/todos/:bc_id/decisions',
  requireAdmin,
  async (req: Request, res: Response) => {
    try {
      const decisions = await fetchDecisionsForTodo(String(req.params.bc_id));
      res.json({ decisions });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  },
);

/**
 * POST /api/admin/ops/decisions
 * Body: { todo_bc_id, decision, reasoning?, post_to_bc? }
 *
 * Records a decision in ops_approval_queue + optionally posts a
 * structured BC comment back on the originating todo.
 */
router.post(
  '/api/admin/ops/decisions',
  requireAdmin,
  async (req: Request, res: Response) => {
    try {
      const { todo_bc_id, decision, reasoning, post_to_bc } = req.body || {};
      if (!todo_bc_id || typeof todo_bc_id !== 'string') {
        res.status(400).json({ error: 'todo_bc_id required' });
        return;
      }
      const allowed = [
        'approve',
        'approve_and_continue',
        'approve_and_convert_to_skill',
        'revise',
        'reject',
        'escalate',
      ];
      if (!allowed.includes(decision)) {
        res.status(400).json({ error: `decision must be one of ${allowed.join(', ')}` });
        return;
      }
      const decidedBy = req.admin?.email || 'unknown';
      const result = await recordDecision({
        todo_bc_id,
        decision,
        reasoning: reasoning || null,
        decided_by: decidedBy,
        post_to_bc: post_to_bc !== false,
      });
      res.json({
        ok: true,
        queue_item_id: result.queue_item.id,
        bc_comment_url: result.bc_comment_url,
        bc_post_error: result.bc_post_error,
        compliance_warnings: result.compliance_warnings,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  },
);

/**
 * GET /api/admin/ops/decisions/today
 *
 * Returns today's decision counts (overall + by decision). Drives the
 * "Decisions today" header tile.
 */
router.get(
  '/api/admin/ops/decisions/today',
  requireAdmin,
  async (req: Request, res: Response) => {
    try {
      const mineOnly = req.query.mine === 'true';
      const decidedBy = mineOnly ? req.admin?.email : undefined;
      const stats = await getTodayDecisionStats(decidedBy);
      res.json(stats);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  },
);

/**
 * Skills surface — captured patterns from "Approve + skill" decisions.
 */
router.get('/api/admin/ops/skills', requireAdmin, async (req: Request, res: Response) => {
  try {
    const includeInactive = req.query.include_inactive === 'true';
    const skills = await OpsSkill.findAll({
      where: includeInactive ? {} : { is_active: true },
      order: [['created_at', 'DESC']],
      limit: 200,
    });
    res.json({ skills });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/api/admin/ops/skills/:id/toggle', requireAdmin, async (req: Request, res: Response) => {
  try {
    const skill = await OpsSkill.findByPk(String(req.params.id));
    if (!skill) {
      res.status(404).json({ error: 'skill not found' });
      return;
    }
    await skill.update({ is_active: !skill.is_active });
    res.json({ ok: true, id: skill.id, is_active: skill.is_active });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/api/admin/ops/skills/:id', requireAdmin, async (req: Request, res: Response) => {
  try {
    const deleted = await OpsSkill.destroy({ where: { id: req.params.id } });
    res.json({ ok: true, deleted });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Automation rules surface — list, manual fire, see last-run summary.
 */
router.get('/api/admin/ops/automation-rules', requireAdmin, async (_req: Request, res: Response) => {
  try {
    const rules = await sequelize.query(
      `SELECT id::text, name, description, condition_jsonb, action_jsonb,
              is_active, last_fired_at, fire_count, created_at
         FROM ops_automation_rules ORDER BY name`,
      { type: QueryTypes.SELECT },
    );
    res.json({ rules, last_run: lastAutomationRun });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/api/admin/ops/automation-rules/:id/toggle', requireAdmin, async (req: Request, res: Response) => {
  try {
    const [, meta]: any = await sequelize.query(
      `UPDATE ops_automation_rules
          SET is_active = NOT is_active, updated_at = NOW()
        WHERE id = :id`,
      { replacements: { id: req.params.id } },
    );
    res.json({ ok: true, id: req.params.id, meta });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/api/admin/ops/automation-rules/run', requireAdmin, async (_req: Request, res: Response) => {
  if (automationInFlight) {
    res.status(409).json({ error: 'Automation already in flight' });
    return;
  }
  automationInFlight = true;
  try {
    const result = await runAutomationRules();
    lastAutomationRun = result;
    res.json({ ok: true, result });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  } finally {
    automationInFlight = false;
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
