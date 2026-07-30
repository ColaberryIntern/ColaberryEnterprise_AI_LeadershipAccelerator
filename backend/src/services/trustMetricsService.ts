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
import AiAgent from '../models/AiAgent';
import { isKillSwitchActive } from './launchSafety';
import { isSafeModeActive } from './systemControlService';
import { getAgentPermission } from './agentPermissionService';
import { findEmployee, WORKFORCE_AGENT_NAME } from './workforce/orgRegistry';
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

// ---------------------------------------------------------------------------
// AI Workforce drill-down (orgRegistry.ts directors) — per-agent status,
// trigger, and 7-day cost. Extends the Trust Command Center rather than a
// separate dashboard; reads the same ai_agents / ai_agent_activity_logs /
// ai_events tables the rest of this file already reads.
// ---------------------------------------------------------------------------

/** Shared cost-aggregation over ai_events, grouped by agent_id — used by both getAgentRoster
 *  (all workforce agents) and getAgentDetail (one agent). `days` is a fixed internal literal,
 *  never user input, interpolated the same way dailyCounts() already does above. */
async function agentCostRows(days: number, agentId?: string): Promise<{ agentId: string; costUsd: number; runs: number }[]> {
  const where = agentId
    ? `agent_id = :agentId AND created_at >= NOW() - INTERVAL '${days} days'`
    : `agent_id IS NOT NULL AND created_at >= NOW() - INTERVAL '${days} days'`;
  return (await sequelize.query(
    `SELECT agent_id AS "agentId", COALESCE(SUM(cost_usd), 0)::float AS "costUsd", COUNT(*)::int AS "runs"
     FROM ai_events WHERE ${where} GROUP BY 1`,
    { type: QueryTypes.SELECT, replacements: agentId ? { agentId } : {} }
  )) as { agentId: string; costUsd: number; runs: number }[];
}

interface LastActivityRow { agentId: string; action: string; result: string; createdAt: Date | string; }

/** One most-recent activity row per agent in a single query (DISTINCT ON), instead of
 *  one AiAgentActivityLog.findOne() per director — avoids an N+1 on a 30s poll. */
async function lastActivityByAgentId(agentIds: string[]): Promise<Map<string, LastActivityRow>> {
  if (agentIds.length === 0) return new Map();
  const rows = (await sequelize.query(
    `SELECT DISTINCT ON (agent_id) agent_id AS "agentId", action, result, created_at AS "createdAt"
     FROM ai_agent_activity_logs
     WHERE agent_id = ANY(:agentIds)
     ORDER BY agent_id, created_at DESC`,
    { type: QueryTypes.SELECT, replacements: { agentIds } }
  )) as LastActivityRow[];
  return new Map(rows.map((r) => [r.agentId, r]));
}

export interface AgentRosterRow {
  slug: string;
  agentName: string;
  name: string;
  role: string;
  avatar: string;
  enabled: boolean;
  status: string;
  triggerType: string | null;
  schedule: string | null;
  lastAction: { action: string; result: string; at: string | null } | null;
  cost7d: number;
  runs7d: number;
}

/** One row per AI Workforce director: live status, trigger, last action, 7-day cost. */
export async function getAgentRoster(): Promise<{ rows: AgentRosterRow[] }> {
  let rows: AgentRosterRow[] = [];
  try {
    const slugs = Object.keys(WORKFORCE_AGENT_NAME);
    const agentNames = Object.values(WORKFORCE_AGENT_NAME);
    const agents = await AiAgent.findAll({ where: { agent_name: { [Op.in]: agentNames } } });
    const agentByName = new Map(agents.map((a) => [a.agent_name, a]));

    const [costRows, lastByAgentId] = await Promise.all([
      agentCostRows(7),
      lastActivityByAgentId(agents.map((a) => a.id)),
    ]);
    const costByAgentId = new Map(costRows.map((r) => [r.agentId, r]));

    rows = slugs.map((slug) => {
      const employee = findEmployee(slug)!;
      const agentName = WORKFORCE_AGENT_NAME[slug];
      const agent = agentByName.get(agentName);
      if (!agent) {
        return {
          slug, agentName, name: employee.name, role: employee.role, avatar: employee.avatar,
          enabled: false, status: 'not_registered', triggerType: null, schedule: null,
          lastAction: null, cost7d: 0, runs7d: 0,
        };
      }
      const last = lastByAgentId.get(agent.id);
      const c = costByAgentId.get(agent.id);
      return {
        slug, agentName, name: employee.name, role: employee.role, avatar: employee.avatar,
        enabled: agent.enabled, status: agent.status,
        triggerType: agent.trigger_type || null, schedule: agent.schedule || null,
        lastAction: last ? { action: last.action, result: last.result, at: last.createdAt ? new Date(last.createdAt).toISOString() : null } : null,
        cost7d: Math.round((c?.costUsd || 0) * 10000) / 10000,
        runs7d: c?.runs || 0,
      };
    });
  } catch (err) {
    structuredError('agent_roster_query', err);
  }
  return { rows };
}

export interface AgentGoalsDimension { key: string; label: string; score: number; source: 'live' | 'fixed'; evidence: string; }
export interface AgentDetail {
  slug: string;
  agentName: string;
  name: string;
  role: string;
  mission: string;
  enabled: boolean;
  status: string;
  tier: string;
  triggerType: string | null;
  schedule: string | null;
  killSwitchActive: boolean | null;
  safeModeActive: boolean | null;
  goals: AgentGoalsDimension[];
  goalsOverall: number;
  recentActivity: Array<{ action: string; result: string; reason: string | null; at: string | null; traceId: string | null }>;
  cost7d: number;
}

/** Drill-down for one director: tier, live kill-switch/safe-mode state, a GOALS-scored
 *  signal grounded in that agent's own recent activity, and the raw activity log (L3). */
export async function getAgentDetail(slug: string): Promise<AgentDetail | null> {
  const agentName = WORKFORCE_AGENT_NAME[slug];
  const employee = findEmployee(slug);
  if (!agentName || !employee) return null;

  const agent = await AiAgent.findOne({ where: { agent_name: agentName } });
  if (!agent) return null;

  const permission = getAgentPermission(agentName);

  // Independent reads — run in parallel rather than as 4 sequential round-trips.
  const [recent, killSwitch, safeMode, costRows] = await Promise.all([
    AiAgentActivityLog.findAll({ where: { agent_id: agent.id }, order: [['created_at', 'DESC']], limit: 20 }),
    isKillSwitchActive().catch(() => null),
    isSafeModeActive().catch(() => null),
    agentCostRows(7, agent.id).catch((err) => {
      structuredError('agent_detail_cost_query', err);
      return [] as { agentId: string; costUsd: number; runs: number }[];
    }),
  ]);
  const cost7d = Math.round((costRows[0]?.costUsd || 0) * 10000) / 10000;

  const withTrace = recent.filter((r) => r.trace_id).length;
  const failed = recent.filter((r) => r.result === 'failed').length;
  const observabilityScore = recent.length ? Math.max(1, Math.round((withTrace / recent.length) * 5)) : 3;
  const solidScore = recent.length ? Math.max(1, 5 - Math.round((failed / recent.length) * 4)) : 5;
  const availabilityScore = !agent.enabled ? 1 : agent.trigger_type === 'on_demand' ? 5 : recent.length > 0 ? 5 : 2;

  // governance/lexicon are 'fixed' — structurally guaranteed by the code (tier + the hard
  // runtime gate; the domain mapping), not measured from this agent's own recent behavior.
  // Tagging them distinctly from the 'live' scores keeps the file's own live/baseline/
  // placeholder honesty invariant intact at the per-agent level too.
  const goals: AgentGoalsDimension[] = [
    { key: 'governance', label: 'Governance', score: 5, source: 'fixed', evidence: `Tier ${permission.tier}, scoped to ${permission.allowedTables.join(', ') || '(proposal queue only)'}. Kill switch / safe mode / enabled are hard-checked before every write (workforceAgentRuntime.ts), independent of the repo-wide abac_enforcement shadow default — code-verified by workforceAgentRuntime.test.ts.` },
    { key: 'observability', label: 'Observability', score: observabilityScore, source: 'live', evidence: `${withTrace}/${recent.length} of the last ${recent.length} logged actions carry a trace_id.` },
    { key: 'availability', label: 'Availability', score: availabilityScore, source: 'live', evidence: agent.enabled ? `Enabled · trigger ${agent.trigger_type || 'unknown'}${agent.schedule ? ` (${agent.schedule})` : ''}.` : 'Disabled — will not run until enabled.' },
    { key: 'lexicon', label: 'Lexicon', score: 4, source: 'fixed', evidence: `Domain fixed at build time to "${employee.ops_domain || employee.department}", matching orgRegistry.ts — structurally guaranteed, not dynamically re-validated each run.` },
    { key: 'solid', label: 'Solid', score: solidScore, source: 'live', evidence: `${failed}/${recent.length} of the last ${recent.length} logged actions failed.` },
  ];
  const goalsOverall = Math.round((goals.reduce((s, g) => s + g.score, 0) / goals.length) * 10) / 10;

  return {
    slug, agentName, name: employee.name, role: employee.role, mission: employee.mission,
    enabled: agent.enabled, status: agent.status, tier: permission.tier,
    triggerType: agent.trigger_type || null, schedule: agent.schedule || null,
    killSwitchActive: killSwitch, safeModeActive: safeMode,
    goals, goalsOverall,
    recentActivity: recent.map((r) => ({
      action: r.action, result: r.result, reason: r.reason || null,
      at: r.created_at?.toISOString() || null, traceId: r.trace_id || null,
    })),
    cost7d,
  };
}
