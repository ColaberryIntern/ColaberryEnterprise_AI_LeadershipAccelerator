/**
 * Admin routes for the CB System Command dashboard.
 *
 * Mount path: /api/admin/cb-system/*
 *
 * Single management pane for CB System (the autonomous Basecamp agent). Reads
 * the data CB System already produces — no new instrumentation:
 *   - Postgres ops_* tables (mirror, scores, metrics, assessments)
 *   - host files written by the cron-side dispatcher/handler, mounted read-only
 *     into the container: cb-handler-log.jsonl, inbound-state.json, cb-inbound.log
 *
 * Host files degrade gracefully: if they aren't mounted (local dev), the
 * log-derived panes return empty/unknown rather than erroring.
 *
 * Endpoints:
 *   GET /health      — GREEN/YELLOW/RED + sync, dispatcher tick health, breaker
 *   GET /activity    — recent @CB invocations (who/what/outcome) from handler log
 *   GET /projects    — per-project: open todos, categories, mentions handled
 *   GET /throughput  — daily trend: invocations, automations, agent calls + cost
 *   GET /exceptions  — errors, circuit-breaker trips, quality flags
 *   GET /components   — each subsystem's last-run status (for the controls pane)
 */
import { Router, Request, Response } from 'express';
import fs from 'fs';
import { QueryTypes } from 'sequelize';
import { requireAdmin } from '../../middlewares/authMiddleware';
import { sequelize } from '../../config/database';
import OpsBcTodo from '../../models/OpsBcTodo';
import { getLastSync, getLastPriorityRun, getLastAutomationRun } from './opsRoutes';

const router = Router();

// Host files mounted read-only into the container (see docker-compose volumes).
const HANDLER_LOG = process.env.CB_HANDLER_LOG || '/app/host-ops-engine/cb-handler-log.jsonl';
const INBOUND_STATE = process.env.CB_INBOUND_STATE || '/app/host-ops-engine/inbound-state.json';
const INBOUND_LOG = process.env.CB_INBOUND_LOG || '/app/host-logs/cb-inbound.log';

const DAY_MS = 86_400_000;
const EXPECTED_TICKS_24H = 480; // dispatcher cron every 3 min

// --- host-file helpers -----------------------------------------------------

/** Read at most the last `maxBytes` of a file. Returns '' if absent/unreadable. */
function readTail(path: string, maxBytes: number): string {
  try {
    const { size } = fs.statSync(path);
    const start = Math.max(0, size - maxBytes);
    const fd = fs.openSync(path, 'r');
    try {
      const len = size - start;
      const buf = Buffer.alloc(len);
      fs.readSync(fd, buf, 0, len, start);
      return buf.toString('utf8');
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    return '';
  }
}

function readJson<T>(path: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(path, 'utf8')) as T;
  } catch {
    return fallback;
  }
}

interface HandlerEntry {
  invocationId?: string;
  ts?: string;
  comment_id?: number;
  bucket_id?: number;
  rec_id?: number;
  requester_name?: string;
  model?: string;
  tools_called?: Array<{ name: string; result_ok?: boolean }>;
  quality_flags?: string[];
  side_effects?: { repliedHtml?: string | null; emailMessageId?: string | null; followupTodoId?: number | null };
  status?: string;
  error?: string | null;
}

/** Parse the handler JSONL (bounded tail), newest-first, up to `limit`. */
function readHandlerLog(limit: number, maxBytes = 1_500_000): HandlerEntry[] {
  const raw = readTail(HANDLER_LOG, maxBytes);
  if (!raw) return [];
  const lines = raw.split('\n').filter((l) => l.trim());
  // The first line may be a partial record (we read from an arbitrary offset).
  const out: HandlerEntry[] = [];
  for (let i = lines.length - 1; i >= 0 && out.length < limit; i--) {
    try {
      out.push(JSON.parse(lines[i]) as HandlerEntry);
    } catch {
      /* skip partial/garbled line */
    }
  }
  return out;
}

/** All handler entries within the last `sinceMs` (for counts/grouping). */
function readHandlerLogSince(sinceMs: number, maxBytes = 4_000_000): HandlerEntry[] {
  const raw = readTail(HANDLER_LOG, maxBytes);
  if (!raw) return [];
  const out: HandlerEntry[] = [];
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    try {
      const e = JSON.parse(line) as HandlerEntry;
      if (e.ts && new Date(e.ts).getTime() >= sinceMs) out.push(e);
    } catch {
      /* skip */
    }
  }
  return out;
}

/** Parse cb-inbound.log for 24h dispatcher tick health (mirrors the watchdog). */
function parseTickHealth(): {
  available: boolean;
  tick_count: number | null;
  mentions_found: number;
  llm_invocations: number;
  error_count: number;
  max_gap_minutes: number;
  last_tick: string | null;
} {
  const raw = readTail(INBOUND_LOG, 2_000_000);
  if (!raw) {
    return { available: false, tick_count: null, mentions_found: 0, llm_invocations: 0, error_count: 0, max_gap_minutes: 0, last_tick: null };
  }
  const cutoff = Date.now() - DAY_MS;
  const tickTs: number[] = [];
  let mentions = 0;
  let llm = 0;
  let errors = 0;
  let lastTick: string | null = null;
  let inWindow = false;
  for (const line of raw.split('\n')) {
    const tickM = line.match(/^tick (\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d+Z)/);
    if (tickM) {
      const t = new Date(tickM[1]).getTime();
      inWindow = t >= cutoff;
      if (inWindow) {
        tickTs.push(t);
        lastTick = tickM[1];
      }
      continue;
    }
    if (!inWindow) continue;
    const menM = line.match(/(\d+) new @CB mentions/);
    if (menM) mentions += parseInt(menM[1], 10);
    if (/llm handler for \d+:/.test(line)) llm++;
    if (/FAIL|FATAL|error|Error/.test(line) && !line.includes('falling back')) errors++;
  }
  tickTs.sort((a, b) => a - b);
  let maxGap = 0;
  for (let i = 1; i < tickTs.length; i++) maxGap = Math.max(maxGap, (tickTs[i] - tickTs[i - 1]) / 60000);
  return {
    available: true,
    tick_count: tickTs.length,
    mentions_found: mentions,
    llm_invocations: llm,
    error_count: errors,
    max_gap_minutes: Math.round(maxGap),
    last_tick: lastTick,
  };
}

// --- endpoints -------------------------------------------------------------

router.get('/api/admin/cb-system/health', requireAdmin, async (_req: Request, res: Response) => {
  try {
    const todosMirrored = await OpsBcTodo.count();
    const tick = parseTickHealth();
    const state = readJson<{ alarmed?: Record<string, string>; replyCounts?: Record<string, number> }>(INBOUND_STATE, {});
    const alarmed = Object.keys(state.alarmed || {}).length;
    const sync = getLastSync();

    // Roll up to GREEN / YELLOW / RED.
    const flags: Array<{ level: 'red' | 'yellow'; msg: string }> = [];
    if (sync && sync.errors.length > 5) flags.push({ level: 'yellow', msg: `${sync.errors.length} sync errors last run` });
    if (tick.available && tick.tick_count != null) {
      if (tick.tick_count < 200) flags.push({ level: 'red', msg: `Only ${tick.tick_count} dispatcher ticks in 24h (expected ~${EXPECTED_TICKS_24H})` });
      else if (tick.tick_count < 400) flags.push({ level: 'yellow', msg: `${tick.tick_count} dispatcher ticks in 24h (expected ~${EXPECTED_TICKS_24H})` });
    }
    if (tick.max_gap_minutes > 30) flags.push({ level: 'yellow', msg: `${tick.max_gap_minutes}min gap in dispatcher ticks` });
    if (tick.error_count > 20) flags.push({ level: 'red', msg: `${tick.error_count} error lines in dispatcher log` });
    else if (tick.error_count > 5) flags.push({ level: 'yellow', msg: `${tick.error_count} error lines in dispatcher log` });
    if (alarmed > 0) flags.push({ level: 'red', msg: `${alarmed} duplicate-reply circuit breaker trip(s)` });

    const overall = flags.some((f) => f.level === 'red') ? 'RED' : flags.some((f) => f.level === 'yellow') ? 'YELLOW' : 'GREEN';

    res.json({
      overall,
      flags,
      todos_mirrored: todosMirrored,
      circuit_breaker_trips: alarmed,
      dispatcher: tick,
      last_sync: sync
        ? {
            finished_at: sync.finished_at,
            duration_ms: sync.finished_at.getTime() - sync.started_at.getTime(),
            todos_seen: sync.todos_seen,
            todos_updated: sync.todos_updated,
            error_count: sync.errors.length,
          }
        : null,
      generated_at: new Date().toISOString(),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/api/admin/cb-system/activity', requireAdmin, async (req: Request, res: Response) => {
  const limit = Math.min(Number(req.query.limit) || 40, 200);
  const entries = readHandlerLog(limit);
  res.json({
    available: fs.existsSync(HANDLER_LOG),
    count: entries.length,
    items: entries.map((e) => ({
      ts: e.ts,
      requester: e.requester_name || 'unknown',
      bucket_id: e.bucket_id,
      comment_id: e.comment_id,
      rec_id: e.rec_id,
      model: e.model,
      tools: (e.tools_called || []).map((t) => t.name),
      replied: !!e.side_effects?.repliedHtml,
      emailed: !!e.side_effects?.emailMessageId,
      queued_followup: !!e.side_effects?.followupTodoId,
      quality_flags: e.quality_flags || [],
      status: e.status || (e.error ? 'error' : 'finished'),
      error: e.error || null,
    })),
  });
});

router.get('/api/admin/cb-system/projects', requireAdmin, async (_req: Request, res: Response) => {
  try {
    const rows = await sequelize.query<{
      project_id: string;
      name: string | null;
      open_todos: number;
      human_required: number;
      waiting: number;
      avg_urgency: number | null;
    }>(
      `SELECT t.project_id,
              p.name,
              count(*) FILTER (WHERE t.status = 'active')                          AS open_todos,
              count(*) FILTER (WHERE t.category = 'human_required')                AS human_required,
              count(*) FILTER (WHERE t.category = 'waiting_dependency')            AS waiting,
              round(avg(t.urgency_score) FILTER (WHERE t.status = 'active'))::int  AS avg_urgency
         FROM ops_bc_todos t
         LEFT JOIN ops_bc_projects p ON p.bc_id = t.project_id
        GROUP BY t.project_id, p.name
        ORDER BY open_todos DESC`,
      { type: QueryTypes.SELECT },
    );

    // Mentions CB handled per project in the last 7 days (from the handler log).
    const since = Date.now() - 7 * DAY_MS;
    const handled: Record<string, number> = {};
    for (const e of readHandlerLogSince(since)) {
      if (e.bucket_id != null) handled[String(e.bucket_id)] = (handled[String(e.bucket_id)] || 0) + 1;
    }

    res.json({
      projects: rows.map((r) => ({
        project_id: r.project_id,
        name: r.name || `Project ${r.project_id}`,
        open_todos: Number(r.open_todos) || 0,
        human_required: Number(r.human_required) || 0,
        waiting: Number(r.waiting) || 0,
        avg_urgency: r.avg_urgency,
        mentions_handled_7d: handled[r.project_id] || 0,
      })),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/api/admin/cb-system/throughput', requireAdmin, async (req: Request, res: Response) => {
  const days = Math.min(Math.max(Number(req.query.days) || 14, 1), 90);
  try {
    const metrics = await sequelize.query<{ date: string; automations_fired: number; agent_calls_count: number; agent_total_cost_usd: number }>(
      `SELECT to_char(date, 'YYYY-MM-DD') AS date, automations_fired, agent_calls_count, agent_total_cost_usd
         FROM ops_metrics_daily
        WHERE date >= CURRENT_DATE - (:days || ' days')::interval
        ORDER BY date`,
      { type: QueryTypes.SELECT, replacements: { days } },
    );
    const assessments = await sequelize.query<{ date: string; runs: number; cost: number }>(
      `SELECT to_char(computed_at, 'YYYY-MM-DD') AS date, count(*) AS runs, COALESCE(sum(llm_cost_usd), 0) AS cost
         FROM ops_ai_assessments
        WHERE computed_at >= CURRENT_DATE - (:days || ' days')::interval
        GROUP BY 1 ORDER BY 1`,
      { type: QueryTypes.SELECT, replacements: { days } },
    );

    // Per-day @CB invocation counts from the handler log.
    const invByDay: Record<string, number> = {};
    for (const e of readHandlerLogSince(Date.now() - days * DAY_MS)) {
      const d = (e.ts || '').slice(0, 10);
      if (d) invByDay[d] = (invByDay[d] || 0) + 1;
    }
    const assessByDay = Object.fromEntries(assessments.map((a) => [a.date, a]));
    const metricByDay = Object.fromEntries(metrics.map((m) => [m.date, m]));

    const allDates = new Set<string>([...Object.keys(invByDay), ...assessments.map((a) => a.date), ...metrics.map((m) => m.date)]);
    const series = [...allDates].sort().map((date) => ({
      date,
      invocations: invByDay[date] || 0,
      automations_fired: Number(metricByDay[date]?.automations_fired) || 0,
      score_runs: Number(assessByDay[date]?.runs) || 0,
      agent_cost_usd: Number(assessByDay[date]?.cost) || Number(metricByDay[date]?.agent_total_cost_usd) || 0,
    }));

    res.json({
      days,
      total_invocations: series.reduce((s, x) => s + x.invocations, 0),
      total_cost_usd: Number(series.reduce((s, x) => s + x.agent_cost_usd, 0).toFixed(4)),
      series,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/api/admin/cb-system/exceptions', requireAdmin, async (req: Request, res: Response) => {
  const limit = Math.min(Number(req.query.limit) || 40, 200);
  // Errors + quality flags from the handler log (last ~3 days of records scanned).
  const recent = readHandlerLogSince(Date.now() - 3 * DAY_MS);
  const problems = recent
    .filter((e) => e.error || (e.quality_flags && e.quality_flags.length) || (e.status && e.status !== 'finished'))
    .slice(-limit)
    .reverse()
    .map((e) => ({
      ts: e.ts,
      requester: e.requester_name || 'unknown',
      bucket_id: e.bucket_id,
      comment_id: e.comment_id,
      kind: e.error ? 'error' : (e.quality_flags && e.quality_flags.length ? 'quality_flag' : 'incomplete'),
      detail: e.error || (e.quality_flags || []).join(', ') || e.status || '',
    }));

  const state = readJson<{ alarmed?: Record<string, string> }>(INBOUND_STATE, {});
  const breakerTrips = Object.entries(state.alarmed || {}).map(([key, at]) => ({ key, at }));

  res.json({
    handler_problems: problems,
    circuit_breaker_trips: breakerTrips,
    error_count_3d: problems.length,
  });
});

router.get('/api/admin/cb-system/components', requireAdmin, async (_req: Request, res: Response) => {
  const sync = getLastSync();
  const priority = getLastPriorityRun();
  const automation = getLastAutomationRun();
  const tick = parseTickHealth();
  res.json({
    components: [
      {
        key: 'inbound_dispatcher',
        name: 'Inbound @CB dispatcher',
        cadence: 'every 3 min',
        status: tick.available ? (tick.tick_count && tick.tick_count > 200 ? 'healthy' : 'degraded') : 'unknown',
        last_run: tick.last_tick,
        detail: tick.available ? `${tick.tick_count} ticks / 24h, ${tick.mentions_found} mentions` : 'log not mounted',
      },
      {
        key: 'bc_sync',
        name: 'Basecamp to-do sync',
        cadence: 'every 2 min',
        status: sync ? (sync.errors.length ? 'degraded' : 'healthy') : 'unknown',
        last_run: sync ? sync.finished_at : null,
        detail: sync ? `${sync.todos_seen} seen, ${sync.todos_updated} updated, ${sync.errors.length} errors` : 'no run yet this boot',
      },
      {
        key: 'priority_engine',
        name: 'Priority engine',
        cadence: 'every 2 min',
        status: priority ? (priority.errors.length ? 'degraded' : 'healthy') : 'unknown',
        last_run: priority ? priority.finished_at : null,
        detail: priority ? `${priority.todos_scored} scored` : 'no run yet this boot',
      },
      {
        key: 'automation_rules',
        name: 'Automation rules',
        cadence: 'every 2 min',
        status: automation ? 'healthy' : 'unknown',
        last_run: automation ? (automation as any).finished_at ?? null : null,
        detail: automation ? `${(automation as any).rules_fired ?? 0} rule(s) fired` : 'no run yet this boot',
      },
    ],
  });
});

export default router;
