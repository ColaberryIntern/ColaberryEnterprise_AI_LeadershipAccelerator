/**
 * trustMetricsService — read-only aggregations for the Trust Command Center (/admin/trust).
 *
 * Derives metrics from EXISTING tables only (no schema change). Numbers are tagged:
 *   - 'live'        : queried from the database now
 *   - 'baseline'    : score from the TBI compliance audit (docs/trust-audit), constant until re-scored
 *   - 'placeholder' : not yet instrumented (e.g. dollar cost, cross-service traces) — see docs/trust-audit/gap-analysis.md (P1)
 *
 * This service is intentionally read-only; it changes no runtime behavior.
 */
import { Op, QueryTypes, fn, col } from 'sequelize';
import { sequelize } from '../config/database';
import ContentGenerationLog from '../models/ContentGenerationLog';
import AiAgentActivityLog from '../models/AiAgentActivityLog';
import ChatConversation from '../models/ChatConversation';
import AgentWriteAudit from '../models/AgentWriteAudit';
import AiEvent from '../models/AiEvent';
import { isKillSwitchActive } from './launchSafety';
import { isSafeModeActive } from './systemControlService';
import {
  collectLiveSignals,
  evaluateAll,
  evaluateDimension,
  collectOpenActions,
  type DimensionDetail,
  type OpenAction,
} from './trustRubric';

type MetricState = 'live' | 'baseline' | 'placeholder';

export interface DimensionScore {
  key: string;
  label: string;
  score: number; // 0-100
  state: MetricState;
  evidence?: string; // why this score — closed gaps (with PR) + what remains. Powers the drill-down.
}

export interface TrustOverview {
  compositeTrustScore: number; // 0-100
  band: 'red' | 'amber' | 'green';
  maturityLevel: string;
  recommendation: 'GO' | 'GO WITH CONDITIONS' | 'NO GO';
  dimensions: DimensionScore[];
  inpactEstimatePct: number;
  goalsEstimate: number; // /25
  baselineSource: string;
}

export interface ActivityMetrics {
  windowHours: number;
  conversations24h: { value: number; state: MetricState };
  generations24h: { value: number; state: MetricState };
  agentRuns24h: { value: number; state: MetricState };
  errors24h: { value: number; state: MetricState };
  costUsd24h: { value: number | null; state: MetricState; note: string };
  trend: Array<{ day: string; generations: number; conversations: number; agentRuns: number }>;
}

export interface GovernanceStatus {
  killSwitchActive: boolean | null;
  safeModeActive: boolean | null;
  blockedAgentWrites24h: { value: number; state: MetricState };
  killSwitchGatesActions: { value: boolean; state: MetricState; note: string };
}

export interface ObservabilityStatus {
  dimensions: DimensionScore[];
  auditedGenerations24h: { value: number; state: MetricState };
  note: string;
}

// ---- Phase 2: top-level dimension scores are computed live by the rubric (trustRubric.ts) —
// weighted criteria, each backed by a live signal, a shipped change, or an open gap. Sourced from
// docs/trust-audit. The 7 observability sub-dimensions below remain a complementary audit-lens
// breakdown (carry-over from the Phase-1 reassessment). ----
const RUBRIC_SOURCE =
  'Live rubric (trustRubric.ts) over docs/trust-audit gap-analysis — each dimension is weighted criteria. Click a dimension for the full breakdown + evidence.';

const OBSERVABILITY_DIMENSIONS: DimensionScore[] = [
  { key: 'user', label: 'User', score: 25, state: 'baseline',
    evidence: 'Audit 25, unchanged. ai_events carries user_id but it is not yet populated for most call sites.' },
  { key: 'workflow', label: 'Workflow', score: 60, state: 'baseline',
    evidence: 'Audit 40. Closed: x-trace-id middleware + AsyncLocalStorage propagation, workflow_id on every event (P1-4, PR #50).' },
  { key: 'agent', label: 'Agent', score: 70, state: 'baseline', evidence: 'Audit 70, unchanged — already strong.' },
  { key: 'tool', label: 'Tool', score: 20, state: 'baseline',
    evidence: 'Audit 15. Tool/function-call arguments and outcomes are still not captured as events (open).' },
  { key: 'retrieval', label: 'Retrieval', score: 20, state: 'baseline',
    evidence: 'Audit 20, unchanged. Retrieved doc IDs / citations not persisted on the answer event (P1-6, open).' },
  { key: 'decision', label: 'Decision', score: 75, state: 'baseline', evidence: 'Audit 75, unchanged — already strong.' },
  { key: 'cost', label: 'Cost', score: 75, state: 'baseline',
    evidence: 'Audit 30. Closed: MODEL_PRICING + computeCostUsd at emit; cost is live from ai_events (P1-3, PR #50). Remaining: per-user / per-workflow cost analytics (P3-4).' },
];

function hoursAgo(h: number): Date {
  return new Date(Date.now() - h * 60 * 60 * 1000);
}

function bandFor(score: number): 'red' | 'amber' | 'green' {
  if (score >= 80) return 'green';
  if (score >= 50) return 'amber';
  return 'red';
}

function structuredError(event: string, err: unknown): void {
  const errorClass = err instanceof Error ? err.constructor.name : 'UnknownError';
  process.stderr.write(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'error',
      service: 'trust-metrics',
      event,
      outcome: 'failure',
      error_class: errorClass,
      message: err instanceof Error ? err.message : String(err),
    }) + '\n'
  );
}

export async function getTrustOverview(): Promise<TrustOverview> {
  const signals = await collectLiveSignals();
  const details = evaluateAll(signals);
  const composite = Math.round(details.reduce((sum, d) => sum + d.score, 0) / (details.length || 1));
  const dimensions: DimensionScore[] = details.map((d) => ({
    key: d.key,
    label: d.label,
    score: d.score,
    state: d.state,
    evidence: d.summary,
  }));
  return {
    compositeTrustScore: composite,
    band: bandFor(composite),
    maturityLevel: composite >= 50 ? 'Level 3 of 5 — Developing' : 'Level 2 of 5 — Emerging / Pilot',
    recommendation: composite >= 80 ? 'GO' : 'GO WITH CONDITIONS',
    dimensions,
    // INPACT/GOALS remain conservative desk estimates (the full cross-functional INPACT assessment
    // is a separate exercise). P/T and G/O lifted by the kill-switch gating + cost/trace/events now live.
    inpactEstimatePct: 53,
    goalsEstimate: 15,
    baselineSource: RUBRIC_SOURCE,
  };
}

/** Drill-down: the weighted criteria + evidence behind one dimension's score. */
export async function getDimensionDetail(key: string): Promise<DimensionDetail | null> {
  const signals = await collectLiveSignals();
  return evaluateDimension(key, signals);
}

/** The "next actions to raise the score" backlog — every not-yet-met criterion, ranked by weight. */
export async function getTrustActions(): Promise<{ actions: OpenAction[] }> {
  const signals = await collectLiveSignals();
  return { actions: collectOpenActions(evaluateAll(signals)) };
}

export interface CostByWorkflow { workflowId: string; calls: number; costUsd: number; totalTokens: number; }

/** Cost drill-down: AI spend grouped by workflow over the last 30 days (from ai_events). */
export async function getCostBreakdown(): Promise<{ windowDays: number; totalUsd: number; rows: CostByWorkflow[] }> {
  let rows: CostByWorkflow[] = [];
  try {
    rows = (await sequelize.query(
      `SELECT COALESCE(workflow_id, '(unattributed)') AS "workflowId",
              COUNT(*)::int AS calls,
              ROUND(COALESCE(SUM(cost_usd), 0)::numeric, 4)::float AS "costUsd",
              COALESCE(SUM(total_tokens), 0)::int AS "totalTokens"
       FROM ai_events
       WHERE created_at >= NOW() - INTERVAL '30 days' AND event_type = 'llm.call'
       GROUP BY 1
       ORDER BY 3 DESC NULLS LAST
       LIMIT 50`,
      { type: QueryTypes.SELECT }
    )) as CostByWorkflow[];
  } catch (err) {
    structuredError('cost_breakdown_query', err);
  }
  const totalUsd = Math.round(rows.reduce((sum, r) => sum + Number(r.costUsd || 0), 0) * 100) / 100;
  return { windowDays: 30, totalUsd, rows };
}

export async function getActivityMetrics(): Promise<ActivityMetrics> {
  const since = hoursAgo(24);
  let conversations = 0;
  let generations = 0;
  let agentRuns = 0;
  let errors = 0;
  let trend: ActivityMetrics['trend'] = [];
  let costUsd = 0;

  try {
    [conversations, generations, agentRuns, errors] = await Promise.all([
      ChatConversation.count({ where: { started_at: { [Op.gte]: since } } }),
      ContentGenerationLog.count({ where: { created_at: { [Op.gte]: since } } }),
      AiAgentActivityLog.count({ where: { created_at: { [Op.gte]: since } } }),
      ContentGenerationLog.count({ where: { created_at: { [Op.gte]: since }, success: false } }),
    ]);
    trend = await buildTrend();
    const costRow = (await AiEvent.findOne({
      attributes: [[fn('COALESCE', fn('SUM', col('cost_usd')), 0), 'total']],
      where: { created_at: { [Op.gte]: since }, event_type: 'llm.call' },
      raw: true,
    })) as unknown as { total: string | number } | null;
    costUsd = Math.round(Number(costRow?.total || 0) * 100) / 100;
  } catch (err) {
    structuredError('activity_metrics_query', err);
  }

  return {
    windowHours: 24,
    conversations24h: { value: conversations, state: 'live' },
    generations24h: { value: generations, state: 'live' },
    agentRuns24h: { value: agentRuns, state: 'live' },
    errors24h: { value: errors, state: 'live' },
    costUsd24h: {
      value: costUsd,
      state: 'live',
      note: 'Computed LLM cost from ai_events. Coverage now ~58/60 call sites — TS services (PR #50) + cron scripts (PR #54). A few low-traffic paths remain.',
    },
    trend,
  };
}

interface DayCountRow {
  day: string;
  count: number;
}

async function dailyCounts(table: string, dateCol: string): Promise<Record<string, number>> {
  const rows = (await sequelize.query(
    `SELECT to_char(date_trunc('day', ${dateCol}), 'YYYY-MM-DD') AS day, COUNT(*)::int AS count
     FROM ${table}
     WHERE ${dateCol} >= NOW() - INTERVAL '7 days'
     GROUP BY 1 ORDER BY 1`,
    { type: QueryTypes.SELECT }
  )) as DayCountRow[];
  const out: Record<string, number> = {};
  for (const r of rows) out[r.day] = Number(r.count);
  return out;
}

async function buildTrend(): Promise<ActivityMetrics['trend']> {
  // table/column names are fixed literals (not user input) — safe to interpolate.
  const [gens, convos, agents] = await Promise.all([
    dailyCounts('content_generation_logs', 'created_at'),
    dailyCounts('chat_conversations', 'started_at'),
    dailyCounts('ai_agent_activity_logs', 'created_at'),
  ]);
  const days: string[] = [];
  for (let i = 6; i >= 0; i--) {
    days.push(new Date(Date.now() - i * 86400000).toISOString().slice(0, 10));
  }
  return days.map((day) => ({
    day,
    generations: gens[day] || 0,
    conversations: convos[day] || 0,
    agentRuns: agents[day] || 0,
  }));
}

export async function getGovernanceStatus(): Promise<GovernanceStatus> {
  const since = hoursAgo(24);
  let killSwitch: boolean | null = null;
  let safeMode: boolean | null = null;
  let blocked = 0;

  try {
    killSwitch = await isKillSwitchActive();
  } catch (err) {
    structuredError('kill_switch_status', err);
  }
  try {
    safeMode = await isSafeModeActive();
  } catch (err) {
    structuredError('safe_mode_status', err);
  }
  try {
    blocked = await AgentWriteAudit.count({
      where: { created_at: { [Op.gte]: since }, was_allowed: false },
    });
  } catch (err) {
    structuredError('blocked_writes_query', err);
  }

  return {
    killSwitchActive: killSwitch,
    safeModeActive: safeMode,
    blockedAgentWrites24h: { value: blocked, state: 'live' },
    killSwitchGatesActions: {
      value: true,
      state: 'baseline',
      note: 'Kill switch / safe mode now gate email, voice, and social action functions (wired in PR #50; gap P0-2 closed). Consent capture on outbound channels (P0-3b) remains open — see PR #53.',
    },
  };
}

export async function getObservabilityStatus(): Promise<ObservabilityStatus> {
  const since = hoursAgo(24);
  let audited = 0;
  try {
    audited = await ContentGenerationLog.count({ where: { created_at: { [Op.gte]: since } } });
  } catch (err) {
    structuredError('audited_generations_query', err);
  }
  return {
    dimensions: OBSERVABILITY_DIMENSIONS,
    auditedGenerations24h: { value: audited, state: 'live' },
    note: '~58/60 LLM call sites now emit ai_events — TS services (PR #50) + cron scripts (PR #54). P1-2 substantially closed; remaining work is tool-call + retrieval observability (P1-6).',
  };
}
