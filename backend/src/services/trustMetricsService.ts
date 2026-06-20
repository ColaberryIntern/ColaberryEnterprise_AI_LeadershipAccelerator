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

type MetricState = 'live' | 'baseline' | 'placeholder';

export interface DimensionScore {
  key: string;
  label: string;
  score: number; // 0-100
  state: MetricState;
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

// ---- Audit baseline (docs/trust-audit, 2026-06-20). Constant until the next quarterly re-score. ----
const BASELINE_SOURCE = 'TBI audit baseline — docs/trust-audit (2026-06-20)';

const TRUST_DIMENSIONS: DimensionScore[] = [
  { key: 'security', label: 'Security', score: 30, state: 'baseline' },
  { key: 'privacy', label: 'Privacy', score: 20, state: 'baseline' },
  { key: 'observability', label: 'Observability', score: 38, state: 'baseline' },
  { key: 'governance', label: 'Governance', score: 25, state: 'baseline' },
  { key: 'auditability', label: 'Auditability', score: 40, state: 'baseline' },
  { key: 'explainability', label: 'Explainability', score: 40, state: 'baseline' },
  { key: 'reliability', label: 'Reliability', score: 45, state: 'baseline' },
  { key: 'businessImpact', label: 'Business Impact', score: 35, state: 'baseline' },
];

const OBSERVABILITY_DIMENSIONS: DimensionScore[] = [
  { key: 'user', label: 'User', score: 25, state: 'baseline' },
  { key: 'workflow', label: 'Workflow', score: 40, state: 'baseline' },
  { key: 'agent', label: 'Agent', score: 70, state: 'baseline' },
  { key: 'tool', label: 'Tool', score: 15, state: 'baseline' },
  { key: 'retrieval', label: 'Retrieval', score: 20, state: 'baseline' },
  { key: 'decision', label: 'Decision', score: 75, state: 'baseline' },
  { key: 'cost', label: 'Cost', score: 30, state: 'baseline' },
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
  const composite = Math.round(
    TRUST_DIMENSIONS.reduce((sum, d) => sum + d.score, 0) / TRUST_DIMENSIONS.length
  );
  return {
    compositeTrustScore: composite,
    band: bandFor(composite),
    maturityLevel: 'Level 2 of 5 — Emerging / Pilot',
    recommendation: 'GO WITH CONDITIONS',
    dimensions: TRUST_DIMENSIONS,
    inpactEstimatePct: 47,
    goalsEstimate: 13,
    baselineSource: BASELINE_SOURCE,
  };
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
      note: 'Computed LLM cost from ai_events. Partial coverage — only calls routed through the audit wrapper are counted yet (P1-2 routes the rest).',
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
      value: false,
      state: 'baseline',
      note: 'AUDIT FINDING: kill switch / safe mode do NOT gate email, voice, or social actions (governance-audit.md §3, gap P0-2).',
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
    note: 'Only ~8 LLM services route through the audit wrapper; 50+ call sites are unlogged (observability-audit.md, gap P1-2).',
  };
}
