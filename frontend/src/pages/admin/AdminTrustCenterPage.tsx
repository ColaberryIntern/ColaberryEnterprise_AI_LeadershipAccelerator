import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import api from '../../utils/api';
import { PageHeader, StatCard, SectionCard } from '../../components/admin/shell';
import { TrustSignal, TrustLevel } from '../../components/admin/shell/trust';

/**
 * Trust Command Center (/admin/trust) — read-only view backing the TBI compliance audit
 * (docs/trust-audit). LIVE numbers come from existing tables; BASELINE scores come from the
 * audit; PLACEHOLDER tiles are not yet instrumented (see docs/trust-audit/gap-analysis.md).
 */

type MetricState = 'live' | 'baseline' | 'placeholder';

interface DimensionScore { key: string; label: string; score: number; state: MetricState; evidence?: string; }
interface Stat { value: number; state: MetricState; }

interface Overview {
  compositeTrustScore: number;
  band: 'red' | 'amber' | 'green';
  maturityLevel: string;
  recommendation: string;
  dimensions: DimensionScore[];
  inpactEstimatePct: number;
  goalsEstimate: number;
  inpactGoalsSource: string;
  inpactGoalsScoredSystems: number;
  productionGateMet: boolean;
  baselineSource: string;
}
interface Activity {
  windowHours: number;
  conversations24h: Stat;
  generations24h: Stat;
  agentRuns24h: Stat;
  errors24h: Stat;
  costUsd24h: { value: number | null; state: MetricState; note: string };
  trend: Array<{ day: string; generations: number; conversations: number; agentRuns: number }>;
}
interface RegistryHealthAgent { name: string; category: string | null; note?: string; }
interface RegistryHealthGroup { count: number; agents: RegistryHealthAgent[]; }
interface RegistryHealth {
  live: RegistryHealthGroup;
  internal_pipeline_step: RegistryHealthGroup;
  confirmed_dead: RegistryHealthGroup;
  staged_pending_activation: RegistryHealthGroup;
  unclassified: RegistryHealthGroup;
}
interface Governance {
  killSwitchActive: boolean | null;
  safeModeActive: boolean | null;
  blockedAgentWrites24h: Stat;
  killSwitchGatesActions: { value: boolean; state: MetricState; note: string };
}
interface Observability {
  dimensions: DimensionScore[];
  auditedGenerations24h: Stat;
  note: string;
}
interface Criterion {
  key: string; label: string; weight: number;
  status: 'met' | 'partial' | 'open'; source: 'live' | 'shipped' | 'open';
  pct: number; evidence: string; remediation?: string; ref?: string;
}
interface DimensionDetail {
  key: string; label: string; score: number; band: 'red' | 'amber' | 'green';
  state: MetricState; summary: string; criteria: Criterion[];
}
interface OpenAction {
  dimensionKey: string; dimension: string; label: string;
  weight: number; status: 'partial' | 'open'; remediation: string; ref?: string;
}
interface CostRow { workflowId: string; calls: number; costUsd: number; totalTokens: number; }
interface CostBreakdown { windowDays: number; totalUsd: number; rows: CostRow[]; }
interface ValueRow { workflowId: string; events: number; minutes: number; valueUsd: number; }
interface AiValue { windowDays: number; hourlyRateUsd: number; hoursSaved: number; valueUsd: number; costUsd: number; netUsd: number; roiMultiple: number | null; estimate: boolean; rows: ValueRow[]; }

interface AgentRosterRow {
  slug: string; agentName: string; name: string; role: string; avatar: string;
  enabled: boolean; status: string; triggerType: string | null; schedule: string | null;
  lastAction: { action: string; result: string; at: string | null } | null;
  cost7d: number; runs7d: number;
}
interface AgentGoalsDimension { key: string; label: string; score: number; source: 'live' | 'fixed'; evidence: string; }
interface AgentDetail {
  slug: string; agentName: string; name: string; role: string; mission: string;
  enabled: boolean; status: string; tier: string;
  triggerType: string | null; schedule: string | null;
  killSwitchActive: boolean | null; safeModeActive: boolean | null;
  goals: AgentGoalsDimension[]; goalsOverall: number;
  recentActivity: Array<{ action: string; result: string; reason: string | null; at: string | null; traceId: string | null }>;
  cost7d: number;
}
interface DirectorRunResult { ran: boolean; wrote: boolean; reason?: string; recordId?: string; costUsd: number; }

// ---------------------------------------------------------------------------
// Phase B drill-down types (T014-T020). Field names verified against
// backend/src/services/trustMetricsService.ts (T008-T012) and
// backend/src/services/retentionReportService.ts (T013) — not guessed.
// ---------------------------------------------------------------------------

interface CompositeBreakdownRow {
  key: string; label: string; score: number; weightPct: number; contribution: number;
  state: MetricState; evidence?: string;
}
interface CompositeBreakdown {
  compositeTrustScore: number; band: 'red' | 'amber' | 'green'; rows: CompositeBreakdownRow[]; source: string;
}

type ActivityDetailKind = 'conversations' | 'generations' | 'agent-runs' | 'errors';
const ACTIVITY_KIND_LABELS: Record<ActivityDetailKind, string> = {
  conversations: 'Conversations', generations: 'Generations', 'agent-runs': 'Agent runs', errors: 'Errors',
};

// Metadata-only per the PII-scoping rule in trustMetricsService.ts (T009/T010/T011) — never
// raw prompt/response/message text. Every field rendered from this type is explicitly named
// below (no object-spread), so a future backend field never leaks into the UI unreviewed.
interface ActivityDetailRow {
  timestamp: string | null; eventType: string; outcome: string; traceId: string | null;
  agentId: string | null; userId: string | null; model: string | null; durationMs: number | null;
}
interface ActivityDetail { kind: ActivityDetailKind; windowHours: number; rows: ActivityDetailRow[]; }

interface DayActivityDetail {
  date: string;
  counts: { conversations: number; generations: number; agentRuns: number };
  conversations: ActivityDetailRow[]; generations: ActivityDetailRow[]; agentRuns: ActivityDetailRow[];
}

interface BlockedWriteRow {
  timestamp: string | null; agentId: string; agentName: string; operation: string; targetTable: string;
  permissionTier: string; denialReason: string | null; traceId: string | null;
}
interface BlockedWritesDetail { windowHours: number; rows: BlockedWriteRow[]; }

interface AgentRegistryAuditInfo { status: string; note: string; parentAgent?: string; }
interface AgentRegistryDetail {
  agentName: string; agentType: string; category: string | null; status: string; enabled: boolean;
  triggerType: string | null; schedule: string | null; runCount: number; lastRunAt: string | null;
  cost7d: number; runs7d: number; registryAudit: AgentRegistryAuditInfo | null;
}

interface RetentionClassReport {
  key: string; label: string; table: string; ageColumn: string; ttlMonths: number; cutoff: string;
  total: number; expired: number; retained: number; oldest: string | null; pii: string;
  action: 'purge' | 'anonymize_review'; error?: string;
}
interface RetentionReport {
  generatedAt: string; dryRun: true; enforcement: 'disabled'; defaultTtlMonths: number;
  classes: RetentionClassReport[]; totals: { expired: number; total: number; classesOverThreshold: number };
  note: string;
}

/** The single drawer state machine's kind union — grown across T008 (baseline) and T014/T015/T017/T018/T019 (this run). */
type DrawerKind = 'dimension' | 'cost' | 'value' | 'agent' | 'composite' | 'activity-detail' | 'blocked-writes' | 'agent-registry' | 'day-detail';

// Brand chart palette (replaces hardcoded berry-style hex). One token per series.
const CHART_GENERATIONS = 'var(--chart-1)';
const CHART_CONVERSATIONS = 'var(--chart-3)';
const CHART_AGENT_RUNS = 'var(--chart-4)';
const CHART_GRID = 'var(--border-subtle)';

function barClass(score: number): string {
  if (score >= 80) return 'bg-success';
  if (score >= 50) return 'bg-warning';
  return 'bg-danger';
}

function bandColor(band: string): string {
  return band === 'green' ? 'success' : band === 'amber' ? 'warning' : 'danger';
}

function critColor(status: string): string {
  return status === 'met' ? 'success' : status === 'partial' ? 'warning' : 'danger';
}

// Same 80/50 thresholds as barClass, expressed as a band label so score tiles can reuse bandColor.
function scoreBand(score: number): 'red' | 'amber' | 'green' {
  if (score >= 80) return 'green';
  if (score >= 50) return 'amber';
  return 'red';
}

// Shared across the 4 activity-row surfaces (T015's activity-detail drawer + T019's 3 per-day
// lists) so "success"/"failure"-shaped outcome strings get one consistent color mapping.
function outcomeTone(outcome: string): string {
  if (outcome === 'success' || outcome === 'completed') return 'success';
  if (outcome === 'skipped' || outcome === 'pending' || outcome === 'in_progress') return 'secondary';
  return 'danger';
}

function StateBadge({ state }: { state: MetricState }) {
  const map: Record<MetricState, string> = {
    live: 'bg-success-subtle text-success-emphasis',
    baseline: 'bg-secondary-subtle text-secondary-emphasis',
    placeholder: 'bg-warning-subtle text-warning-emphasis',
  };
  return <span className={`badge rounded-pill ${map[state]} ms-2`} style={{ fontSize: '0.65rem' }}>{state}</span>;
}

function ScoreBar({ d, onClick }: { d: DimensionScore; onClick?: () => void }) {
  const inner = (
    <>
      <div className="d-flex justify-content-between small">
        <span>
          {d.label}
          <StateBadge state={d.state} />
          {d.evidence && <span className="text-muted ms-1" aria-hidden="true">&#9432;</span>}
        </span>
        <span className="fw-semibold">{d.score}{onClick && <span className="text-muted ms-1" aria-hidden="true">&rsaquo;</span>}</span>
      </div>
      <div className="progress" style={{ height: '8px' }} role="progressbar" aria-label={d.label} aria-valuenow={d.score} aria-valuemin={0} aria-valuemax={100}>
        <div className={`progress-bar ${barClass(d.score)}`} style={{ width: `${d.score}%` }} />
      </div>
    </>
  );
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        title={d.evidence || undefined}
        className="btn btn-link text-reset text-decoration-none d-block w-100 text-start p-0 mb-2"
      >
        {inner}
      </button>
    );
  }
  return <div className="mb-2" title={d.evidence || undefined}>{inner}</div>;
}

// Strips common honorifics before taking initials, so "Dr. Elena Vasquez" -> "EV", not "DE".
const NAME_HONORIFICS = /^(dr|mr|mrs|ms|prof)\.?$/i;
function initials(name: string): string {
  const parts = name.split(/\s+/).filter((p) => p && !NAME_HONORIFICS.test(p));
  return parts.map((p) => p[0]).join('').slice(0, 2).toUpperCase();
}

function agentGoalsBand(score: number): 'red' | 'amber' | 'green' {
  if (score >= 4) return 'green';
  if (score >= 2.5) return 'amber';
  return 'red';
}

// ---------------------------------------------------------------------------
// DetailDrawer body components — one per drawer `kind`. Extracted so DetailDrawer itself stays
// a thin dispatcher (Modular Composition Rule: function hard ceiling). The pre-existing 4
// bodies (agent/dimension/cost/value) are moved here verbatim, unchanged; T014/T015/T017/T018/
// T019 each add one new body below them.
// ---------------------------------------------------------------------------

function AgentDetailBody({ agent, agentRunning, onRunAgent }: { agent: AgentDetail; agentRunning: boolean; onRunAgent: (slug: string) => void }) {
  return (
    <>
      <p className="text-muted small mb-2">{agent.mission}</p>
      <div className="d-flex align-items-center gap-2 mb-2 flex-wrap">
        <span className={`badge ${agent.enabled ? 'bg-success' : 'bg-secondary'}`}>{agent.enabled ? 'enabled' : 'disabled'}</span>
        <span className="badge border text-muted">tier: {agent.tier}</span>
        <span className="badge border text-muted">{agent.triggerType === 'on_demand' ? 'manual trigger' : `${agent.triggerType || 'unknown'}${agent.schedule ? ` · ${agent.schedule}` : ''}`}</span>
      </div>
      {/* The board's source filter isn't scoped per-director (backend has no
          created_by_id filter yet) — link honestly to the full AI Workforce
          slice rather than promise a per-director view that doesn't exist;
          each ticket still shows its own director's badge on the board. */}
      <Link to="/admin/tickets?source=ai_workforce" className="small d-inline-block mb-2">
        View AI Workforce tickets <span aria-hidden="true">&rsaquo;</span>
      </Link>
      <div className="d-flex align-items-baseline gap-2 mb-1">
        <span className={`display-6 fw-bold text-${bandColor(agentGoalsBand(agent.goalsOverall))}`}>{agent.goalsOverall}</span>
        <span className="text-muted">/ 5 GOALS</span>
        <span className="text-muted small ms-auto">${agent.cost7d} · 7d cost</span>
      </div>
      <div className="list-group list-group-flush mb-3">
        {agent.goals.map((g) => (
          <div key={g.key} className="list-group-item px-0">
            <div className="d-flex justify-content-between align-items-start gap-2">
              <span className="fw-semibold small">
                {g.label}
                <StateBadge state={g.source === 'live' ? 'live' : 'baseline'} />
              </span>
              <span className={`badge bg-${critColor(g.score >= 4 ? 'met' : g.score >= 2.5 ? 'partial' : 'open')}-subtle text-${critColor(g.score >= 4 ? 'met' : g.score >= 2.5 ? 'partial' : 'open')}-emphasis`}>{g.score} / 5</span>
            </div>
            <div className="small text-muted mt-1">{g.evidence}</div>
          </div>
        ))}
        <div className="text-muted" style={{ fontSize: '0.7rem' }}>
          <span className="badge rounded-pill bg-success-subtle text-success-emphasis" style={{ fontSize: '0.65rem' }}>live</span> = measured from this agent's own recent activity ·{' '}
          <span className="badge rounded-pill bg-secondary-subtle text-secondary-emphasis" style={{ fontSize: '0.65rem' }}>baseline</span> = structurally fixed by the code, not re-measured each run.
        </div>
      </div>
      <div className="d-flex justify-content-between align-items-center mb-2">
        <span className="text-muted small text-uppercase">Recent activity (raw log)</span>
        <button type="button" className="btn btn-sm btn-outline-primary" disabled={agentRunning} onClick={() => onRunAgent(agent.slug)}>
          {agentRunning ? 'Running…' : 'Run now'}
        </button>
      </div>
      <div className="list-group list-group-flush">
        {agent.recentActivity.length === 0 && <div className="small text-muted">No logged actions yet.</div>}
        {agent.recentActivity.map((a, i) => (
          <div key={`${a.traceId || i}-${a.at || i}`} className="list-group-item px-0 small">
            <div className="d-flex justify-content-between">
              <span className="fw-semibold">{a.action}</span>
              <span className={`badge bg-${a.result === 'success' ? 'success' : a.result === 'skipped' ? 'secondary' : 'danger'}-subtle text-${a.result === 'success' ? 'success' : a.result === 'skipped' ? 'secondary' : 'danger'}-emphasis`}>{a.result}</span>
            </div>
            {a.reason && <div className="text-muted">{a.reason}</div>}
            <div className="text-muted" style={{ fontSize: '0.7rem' }}>{a.at ? new Date(a.at).toLocaleString() : '—'}{a.traceId ? ` · trace ${a.traceId.slice(0, 8)}` : ''}</div>
          </div>
        ))}
      </div>
    </>
  );
}

function DimensionDetailBody({ detail }: { detail: DimensionDetail }) {
  return (
    <>
      <div className="d-flex align-items-baseline gap-2 mb-1">
        <span className={`display-6 fw-bold text-${bandColor(detail.band)}`}>{detail.score}</span>
        <span className="text-muted">/ 100</span>
      </div>
      <p className="text-muted small">{detail.summary}</p>
      <div className="list-group list-group-flush">
        {detail.criteria.map((c) => (
          <div key={c.key} className="list-group-item px-0">
            <div className="d-flex justify-content-between align-items-start gap-2">
              <span className="fw-semibold small">{c.label}{c.ref && <span className="text-muted ms-1">({c.ref})</span>}</span>
              <span className={`badge bg-${critColor(c.status)}-subtle text-${critColor(c.status)}-emphasis`}>{c.status} · {c.pct}</span>
            </div>
            <div className="small text-muted mt-1">{c.evidence}</div>
            {c.remediation && <div className="small mt-1"><span className="fw-semibold">Next:</span> {c.remediation}</div>}
            <div className="mt-1"><span className="badge border text-muted" style={{ fontSize: '0.6rem' }}>weight {c.weight} · {c.source}</span></div>
          </div>
        ))}
      </div>
    </>
  );
}

function CostDetailBody({ cost }: { cost: CostBreakdown }) {
  return (
    <>
      <p className="text-muted small">${cost.totalUsd} total over the last {cost.windowDays} days (LLM calls in <code>ai_events</code>).</p>
      <table className="table table-sm small align-middle">
        <thead><tr><th>Workflow</th><th className="text-end">Calls</th><th className="text-end">Cost</th><th className="text-end">Tokens</th></tr></thead>
        <tbody>
          {cost.rows.length === 0 && <tr><td colSpan={4} className="text-muted">No cost events yet — they appear as instrumented calls run.</td></tr>}
          {cost.rows.map((r) => (
            <tr key={r.workflowId}>
              <td>{r.workflowId}</td>
              <td className="text-end">{r.calls}</td>
              <td className="text-end">${r.costUsd}</td>
              <td className="text-end">{r.totalTokens.toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

function ValueDetailBody({ value }: { value: AiValue }) {
  return (
    <>
      <div className="row g-2 mb-2">
        <div className="col"><div className="border rounded p-2"><div className="fs-5 fw-bold text-success">${value.valueUsd.toLocaleString()}</div><div className="small text-muted">value · {value.windowDays}d</div></div></div>
        <div className="col"><div className="border rounded p-2"><div className="fs-5 fw-bold">{value.hoursSaved.toLocaleString()}h</div><div className="small text-muted">time saved</div></div></div>
        <div className="col"><div className="border rounded p-2"><div className="fs-5 fw-bold text-primary">${value.netUsd.toLocaleString()}</div><div className="small text-muted">net · ${value.costUsd} AI cost</div></div></div>
      </div>
      <p className="text-muted small">v1 estimate at ${value.hourlyRateUsd}/hr blended; minutes-saved per AI action (LLM call / tool / retrieval). Time-saved, not revenue. (AI spend was just ${value.costUsd}.)</p>
      <table className="table table-sm small align-middle">
        <thead><tr><th>Workflow</th><th className="text-end">Events</th><th className="text-end">Hours</th><th className="text-end">Value</th></tr></thead>
        <tbody>
          {value.rows.length === 0 && <tr><td colSpan={4} className="text-muted">No events yet — value accrues as AI runs.</td></tr>}
          {value.rows.map((r) => (
            <tr key={r.workflowId}>
              <td>{r.workflowId}</td>
              <td className="text-end">{r.events}</td>
              <td className="text-end">{(r.minutes / 60).toFixed(1)}</td>
              <td className="text-end">${r.valueUsd.toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

// T014: composite-score tile drill-down — the 8 dimension contributions + the roll-up math.
function CompositeDetailBody({ composite }: { composite: CompositeBreakdown }) {
  const weightPct = composite.rows[0]?.weightPct ?? 0;
  return (
    <>
      <div className="d-flex align-items-baseline gap-2 mb-1">
        <span className={`display-6 fw-bold text-${bandColor(composite.band)}`}>{composite.compositeTrustScore}</span>
        <span className="text-muted">/ 100</span>
      </div>
      <p className="text-muted small">
        Equal-weighted average of the {composite.rows.length} dimensions below ({weightPct}% each). Each row's
        "contribution" is its point share of the composite; they sum to the score above. Source: {composite.source}
      </p>
      <div className="list-group list-group-flush">
        {composite.rows.map((r) => (
          <div key={r.key} className="list-group-item px-0">
            <div className="d-flex justify-content-between align-items-start gap-2">
              <span className="fw-semibold small">{r.label}<StateBadge state={r.state} /></span>
              <span className={`badge bg-${bandColor(scoreBand(r.score))}-subtle text-${bandColor(scoreBand(r.score))}-emphasis`}>{r.score} / 100</span>
            </div>
            {r.evidence && <div className="small text-muted mt-1">{r.evidence}</div>}
            <div className="mt-1"><span className="badge border text-muted" style={{ fontSize: '0.6rem' }}>+{r.contribution} pts to composite · weight {r.weightPct}%</span></div>
          </div>
        ))}
      </div>
    </>
  );
}

// Shared by T015 (one activity kind, 24h) and T019 (3 per-day lists) — 4 call sites total.
// Every column is an explicit named field from ActivityDetailRow (never `{...row}` spread), so
// no future backend field can leak PII into the UI unreviewed (see PII-scoping rule above).
function ActivityRowsTable({ rows, emptyLabel }: { rows: ActivityDetailRow[]; emptyLabel: string }) {
  if (rows.length === 0) return <div className="small text-muted">{emptyLabel}</div>;
  return (
    <div className="table-responsive">
      <table className="table table-sm small align-middle">
        <thead><tr><th>Time</th><th>Event</th><th>Outcome</th><th>Model</th><th className="text-end">Duration</th></tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={`${r.traceId || r.agentId || r.userId || 'row'}-${r.timestamp || i}`}>
              <td className="text-nowrap">{r.timestamp ? new Date(r.timestamp).toLocaleString() : '—'}</td>
              <td>{r.eventType}</td>
              <td><span className={`badge bg-${outcomeTone(r.outcome)}-subtle text-${outcomeTone(r.outcome)}-emphasis`}>{r.outcome}</span></td>
              <td className="small text-muted">{r.model || '—'}</td>
              <td className="text-end small">{r.durationMs != null ? `${r.durationMs}ms` : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// T015: one 24h StatCard's drill-down (Conversations / Generations / Agent runs / Errors).
function ActivityDetailBody({ activityDetail }: { activityDetail: ActivityDetail }) {
  return (
    <>
      <p className="text-muted small">
        {activityDetail.rows.length} most-recent {ACTIVITY_KIND_LABELS[activityDetail.kind].toLowerCase()} rows over the
        last {activityDetail.windowHours}h — metadata only, no message content.
      </p>
      <ActivityRowsTable rows={activityDetail.rows} emptyLabel="No activity in this window yet." />
    </>
  );
}

// T017: Governance's "Blocked agent writes 24h" tile drill-down.
function BlockedWritesBody({ blockedWrites }: { blockedWrites: BlockedWritesDetail }) {
  return (
    <>
      <p className="text-muted small">Writes an AI agent attempted that the permission gate denied, last {blockedWrites.windowHours}h.</p>
      {blockedWrites.rows.length === 0 ? (
        <div className="small text-muted">No blocked writes in this window.</div>
      ) : (
        <div className="table-responsive">
          <table className="table table-sm small align-middle">
            <thead><tr><th>Time</th><th>Agent</th><th>Operation</th><th>Target</th><th>Tier</th><th>Reason</th></tr></thead>
            <tbody>
              {blockedWrites.rows.map((r, i) => (
                <tr key={`${r.traceId || r.agentId}-${r.timestamp || i}`}>
                  <td className="text-nowrap">{r.timestamp ? new Date(r.timestamp).toLocaleString() : '—'}</td>
                  <td>{r.agentName}</td>
                  <td>{r.operation}</td>
                  <td>{r.targetTable}</td>
                  <td>{r.permissionTier}</td>
                  <td className="text-muted">{r.denialReason || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

// T018: full ai_agents registry detail (distinct shape from AgentDetail above — no goals/mission;
// see the T018 judgment-call note in PROGRESS.md for why this is a sibling body, not a reuse).
function AgentRegistryDetailBody({ detail }: { detail: AgentRegistryDetail }) {
  return (
    <>
      <div className="d-flex align-items-center gap-2 mb-2 flex-wrap">
        <span className={`badge ${detail.enabled ? 'bg-success' : 'bg-secondary'}`}>{detail.enabled ? 'enabled' : 'disabled'}</span>
        <span className="badge border text-muted">{detail.agentType}</span>
        {detail.category && <span className="badge border text-muted">{detail.category}</span>}
        <span className="badge border text-muted">status: {detail.status}</span>
      </div>
      <div className="d-flex justify-content-between small mb-1">
        <span>Trigger</span>
        <span className="text-muted">{detail.triggerType === 'on_demand' ? 'manual' : detail.triggerType ? `${detail.triggerType}${detail.schedule ? ` · ${detail.schedule}` : ''}` : '—'}</span>
      </div>
      <div className="d-flex justify-content-between small mb-1">
        <span>Run count (lifetime)</span>
        <span className="fw-semibold">{detail.runCount.toLocaleString()}</span>
      </div>
      <div className="d-flex justify-content-between small mb-1">
        <span>Last run</span>
        <span className="text-muted">{detail.lastRunAt ? new Date(detail.lastRunAt).toLocaleString() : 'never'}</span>
      </div>
      <div className="d-flex justify-content-between small mb-3">
        <span>7-day cost / runs</span>
        <span className="fw-semibold">${detail.cost7d} · {detail.runs7d} runs</span>
      </div>
      {detail.registryAudit && (
        <div className="alert alert-secondary py-2 small mb-0">
          <div className="fw-semibold text-uppercase" style={{ fontSize: '0.7rem' }}>Registry audit — {detail.registryAudit.status}</div>
          <div>{detail.registryAudit.note}</div>
          {detail.registryAudit.parentAgent && <div className="text-muted mt-1">Runs as part of: {detail.registryAudit.parentAgent}</div>}
        </div>
      )}
    </>
  );
}

// T019: one day of the 7-day trend chart — accurate full-day counts plus real rows per category.
function DayDetailBody({ dayDetail }: { dayDetail: DayActivityDetail }) {
  return (
    <>
      <div className="row g-2 mb-3 text-center">
        <div className="col"><div className="border rounded p-2"><div className="fs-5 fw-bold">{dayDetail.counts.conversations}</div><div className="small text-muted">conversations</div></div></div>
        <div className="col"><div className="border rounded p-2"><div className="fs-5 fw-bold">{dayDetail.counts.generations}</div><div className="small text-muted">generations</div></div></div>
        <div className="col"><div className="border rounded p-2"><div className="fs-5 fw-bold">{dayDetail.counts.agentRuns}</div><div className="small text-muted">agent runs</div></div></div>
      </div>
      <div className="mb-3">
        <div className="small fw-semibold text-uppercase text-muted mb-1">Conversations</div>
        <ActivityRowsTable rows={dayDetail.conversations} emptyLabel="No conversations that day." />
      </div>
      <div className="mb-3">
        <div className="small fw-semibold text-uppercase text-muted mb-1">Generations</div>
        <ActivityRowsTable rows={dayDetail.generations} emptyLabel="No generations that day." />
      </div>
      <div>
        <div className="small fw-semibold text-uppercase text-muted mb-1">Agent runs</div>
        <ActivityRowsTable rows={dayDetail.agentRuns} emptyLabel="No agent runs that day." />
      </div>
    </>
  );
}

function DetailDrawer({
  kind, detail, cost, value, agent, composite, activityDetail, blockedWrites, registryDetail, dayDetail,
  agentRunning, loading, onClose, onOpenDimension, onRunAgent,
}: {
  kind: DrawerKind | null;
  detail: DimensionDetail | null;
  cost: CostBreakdown | null;
  value: AiValue | null;
  agent: AgentDetail | null;
  composite: CompositeBreakdown | null;
  activityDetail: ActivityDetail | null;
  blockedWrites: BlockedWritesDetail | null;
  registryDetail: AgentRegistryDetail | null;
  dayDetail: DayActivityDetail | null;
  agentRunning: boolean;
  loading: boolean;
  onClose: () => void;
  onOpenDimension: (key: string) => void;
  onRunAgent: (slug: string) => void;
}) {
  if (!kind) return null;
  const title =
    kind === 'cost' ? 'AI cost by workflow · 30 days'
    : kind === 'value' ? 'AI value by workflow · 30 days'
    : kind === 'agent' ? (agent ? `${agent.name} · ${agent.role}` : 'AI Workforce director')
    : kind === 'composite' ? 'Composite Trust · dimension contributions'
    : kind === 'activity-detail' ? (activityDetail ? `${ACTIVITY_KIND_LABELS[activityDetail.kind]} · last 24h` : 'Activity detail')
    : kind === 'blocked-writes' ? 'Blocked agent writes · 24h'
    : kind === 'agent-registry' ? (registryDetail ? `${registryDetail.agentName} · registry detail` : 'Agent registry detail')
    : kind === 'day-detail' ? (dayDetail ? `Activity · ${dayDetail.date}` : 'Day detail')
    : detail ? `${detail.label} · breakdown` : 'Detail';

  return (
    <>
      <div onClick={onClose} aria-hidden="true" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 1045 }} />
      <div className="card shadow" role="dialog" aria-modal="true" aria-label="Trust detail"
        style={{ position: 'fixed', top: 0, right: 0, height: '100vh', width: 'min(480px, 94vw)', zIndex: 1046, overflowY: 'auto', borderRadius: 0 }}>
        <div className="card-body">
          <div className="d-flex justify-content-between align-items-start mb-3">
            <h2 className="h5 mb-0">{title}</h2>
            <button type="button" className="btn-close" aria-label="Close" onClick={onClose} />
          </div>

          {loading && <div className="text-muted">Loading…</div>}

          {!loading && kind === 'agent' && agent && <AgentDetailBody agent={agent} agentRunning={agentRunning} onRunAgent={onRunAgent} />}
          {!loading && kind === 'dimension' && detail && <DimensionDetailBody detail={detail} />}
          {!loading && kind === 'cost' && cost && <CostDetailBody cost={cost} />}
          {!loading && kind === 'value' && value && <ValueDetailBody value={value} />}
          {!loading && kind === 'composite' && composite && <CompositeDetailBody composite={composite} />}
          {!loading && kind === 'activity-detail' && activityDetail && <ActivityDetailBody activityDetail={activityDetail} />}
          {!loading && kind === 'blocked-writes' && blockedWrites && <BlockedWritesBody blockedWrites={blockedWrites} />}
          {!loading && kind === 'agent-registry' && registryDetail && <AgentRegistryDetailBody detail={registryDetail} />}
          {!loading && kind === 'day-detail' && dayDetail && <DayDetailBody dayDetail={dayDetail} />}

          {kind === 'dimension' && detail && (
            <button type="button" className="btn btn-sm btn-outline-secondary mt-2" onClick={() => onOpenDimension(detail.key)}>Refresh</button>
          )}
        </div>
      </div>
    </>
  );
}

function YesNo({ v }: { v: boolean | null }) {
  if (v === null) return <span className="badge bg-secondary">unknown</span>;
  return <span className={`badge ${v ? 'bg-success' : 'bg-secondary'}`}>{v ? 'ACTIVE' : 'inactive'}</span>;
}

function AdminTrustCenterPage() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [activity, setActivity] = useState<Activity | null>(null);
  const [governance, setGovernance] = useState<Governance | null>(null);
  const [observability, setObservability] = useState<Observability | null>(null);
  const [actions, setActions] = useState<OpenAction[]>([]);
  const [value, setValue] = useState<AiValue | null>(null);
  const [agentRoster, setAgentRoster] = useState<AgentRosterRow[] | null>(null);
  const [registryHealth, setRegistryHealth] = useState<RegistryHealth | null>(null);
  const [retention, setRetention] = useState<RetentionReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Drill-down drawer state
  const [drawerKind, setDrawerKind] = useState<DrawerKind | null>(null);
  const [detail, setDetail] = useState<DimensionDetail | null>(null);
  const [cost, setCost] = useState<CostBreakdown | null>(null);
  const [agentDetail, setAgentDetail] = useState<AgentDetail | null>(null);
  const [composite, setComposite] = useState<CompositeBreakdown | null>(null);
  const [activityDetail, setActivityDetail] = useState<ActivityDetail | null>(null);
  const [blockedWrites, setBlockedWrites] = useState<BlockedWritesDetail | null>(null);
  const [registryDetail, setRegistryDetail] = useState<AgentRegistryDetail | null>(null);
  const [dayDetail, setDayDetail] = useState<DayActivityDetail | null>(null);
  const [agentRunning, setAgentRunning] = useState(false);
  const [drawerLoading, setDrawerLoading] = useState(false);

  // One-shot poll-failure guard: the 30s poll must surface a failure AT MOST ONCE,
  // not once per tick. We keep the failure in the inline `error` banner and flip this
  // ref so a repeated failure does not re-announce. A later successful poll clears it.
  const failureAnnouncedRef = useRef(false);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const [o, a, g, ob, ac, val] = await Promise.all([
          api.get<Overview>('/api/admin/trust/overview'),
          api.get<Activity>('/api/admin/trust/activity'),
          api.get<Governance>('/api/admin/trust/governance'),
          api.get<Observability>('/api/admin/trust/observability'),
          api.get<{ actions: OpenAction[] }>('/api/admin/trust/actions'),
          api.get<AiValue>('/api/admin/trust/value'),
        ]);
        if (!active) return;
        setOverview(o.data);
        setActivity(a.data);
        setGovernance(g.data);
        setObservability(ob.data);
        setActions(ac.data.actions || []);
        setValue(val.data);
        // Poll recovered — clear the banner and re-arm the one-shot guard so the
        // NEXT distinct failure streak is allowed to surface again.
        setError(null);
        failureAnnouncedRef.current = false;
      } catch {
        if (!active) return;
        // Surface the failure at most once per streak. Setting the inline banner is
        // idempotent; the ref guard ensures we don't re-fire any louder notification
        // (toast) on every interval tick while the backend stays down.
        if (!failureAnnouncedRef.current) {
          failureAnnouncedRef.current = true;
          setError('Could not load trust metrics. Showing the last good snapshot; will retry automatically.');
        }
      } finally {
        if (active) setLoading(false);
      }

      // Isolated from the Promise.all above on purpose: this is the newest, least-proven
      // endpoint, and a failure here must not block the 6 established trust metrics.
      try {
        const ar = await api.get<{ rows: AgentRosterRow[] }>('/api/admin/trust/agents');
        if (active) setAgentRoster(ar.data.rows || []);
      } catch {
        // Leave the last-known roster in place; the next 30s tick retries independently.
      }

      // Same isolation rationale as the roster fetch above — the newest endpoint must
      // not block the established trust metrics if it fails.
      try {
        const rh = await api.get<RegistryHealth>('/api/admin/trust/registry-health');
        if (active) setRegistryHealth(rh.data);
      } catch {
        // Leave the last-known snapshot in place; the next 30s tick retries independently.
      }

      // T020: retention summary for the new "Data Retention" card. Same isolation rationale —
      // a dry-run report endpoint failing must not block the established trust metrics.
      try {
        const rr = await api.get<RetentionReport>('/api/admin/trust/retention');
        if (active) setRetention(rr.data);
      } catch {
        // Leave the last-known snapshot in place; the next 30s tick retries independently.
      }
    };
    load();
    const timer = setInterval(load, 30000);
    return () => { active = false; clearInterval(timer); };
  }, []);

  // Page-level trust signal derived from the composite score (level by score threshold).
  // Must live above the early `if (loading) return` so hook order is stable.
  const trust: TrustSignal = useMemo(() => {
    const score = overview?.compositeTrustScore ?? 0;
    const level: TrustLevel = score >= 95 ? 'verified' : score >= 80 ? 'live' : score >= 50 ? 'stale' : 'unverified';
    return {
      level,
      score,
      source: 'TBI audit',
      updatedAt: new Date().toISOString(),
      summary: overview ? `Composite trust ${score}/100 · ${overview.recommendation}` : 'Trust metrics unavailable.',
      href: '/admin/trust',
      pillars: (overview?.dimensions || []).map((d) => ({
        name: d.label,
        score: d.score,
        status: d.score >= 80 ? 'live' : d.score >= 50 ? 'stale' : 'unverified',
        evidence: d.evidence ? [{ label: 'Evidence', value: d.evidence }] : undefined,
      })),
    };
  }, [overview]);

  const openDimension = async (key: string) => {
    setDrawerKind('dimension');
    setDetail(null);
    setDrawerLoading(true);
    try {
      const r = await api.get<DimensionDetail>(`/api/admin/trust/dimension/${key}`);
      setDetail(r.data);
    } catch {
      setDetail(null);
    } finally {
      setDrawerLoading(false);
    }
  };

  const openCost = async () => {
    setDrawerKind('cost');
    setCost(null);
    setDrawerLoading(true);
    try {
      const r = await api.get<CostBreakdown>('/api/admin/trust/cost-breakdown');
      setCost(r.data);
    } catch {
      setCost(null);
    } finally {
      setDrawerLoading(false);
    }
  };

  // value is already loaded on mount; opening the drawer just shows its by-workflow breakdown.
  const openValue = () => setDrawerKind('value');

  const openAgent = async (slug: string) => {
    setDrawerKind('agent');
    setAgentDetail(null);
    setDrawerLoading(true);
    try {
      const r = await api.get<AgentDetail>(`/api/admin/trust/agents/${slug}`);
      setAgentDetail(r.data);
    } catch {
      setAgentDetail(null);
    } finally {
      setDrawerLoading(false);
    }
  };

  // T014: composite-score tile drill-down.
  const openComposite = async () => {
    setDrawerKind('composite');
    setComposite(null);
    setDrawerLoading(true);
    try {
      const r = await api.get<CompositeBreakdown>('/api/admin/trust/composite-breakdown');
      setComposite(r.data);
    } catch {
      setComposite(null);
    } finally {
      setDrawerLoading(false);
    }
  };

  // T015: one 24h activity StatCard's drill-down (shared by all 4 cards).
  const openActivityDetail = async (kind: ActivityDetailKind) => {
    setDrawerKind('activity-detail');
    setActivityDetail(null);
    setDrawerLoading(true);
    try {
      const r = await api.get<ActivityDetail>(`/api/admin/trust/activity/${kind}`);
      setActivityDetail(r.data);
    } catch {
      setActivityDetail(null);
    } finally {
      setDrawerLoading(false);
    }
  };

  // T017: Governance's "Blocked agent writes 24h" tile drill-down.
  const openBlockedWrites = async () => {
    setDrawerKind('blocked-writes');
    setBlockedWrites(null);
    setDrawerLoading(true);
    try {
      const r = await api.get<BlockedWritesDetail>('/api/admin/trust/blocked-writes');
      setBlockedWrites(r.data);
    } catch {
      setBlockedWrites(null);
    } finally {
      setDrawerLoading(false);
    }
  };

  // T018: full ai_agents registry detail — distinct endpoint/shape from openAgent's 10
  // Workforce directors (see T012's sibling-route decision in trustController.ts).
  const openAgentRegistryDetail = async (name: string) => {
    setDrawerKind('agent-registry');
    setRegistryDetail(null);
    setDrawerLoading(true);
    try {
      const r = await api.get<AgentRegistryDetail>(`/api/admin/trust/agents/registry/${encodeURIComponent(name)}`);
      setRegistryDetail(r.data);
    } catch {
      setRegistryDetail(null);
    } finally {
      setDrawerLoading(false);
    }
  };

  // T019: one day of the 7-day trend chart.
  const openDayDetail = async (date: string) => {
    setDrawerKind('day-detail');
    setDayDetail(null);
    setDrawerLoading(true);
    try {
      const r = await api.get<DayActivityDetail>(`/api/admin/trust/activity/day/${date}`);
      setDayDetail(r.data);
    } catch {
      setDayDetail(null);
    } finally {
      setDrawerLoading(false);
    }
  };

  const runAgent = async (slug: string) => {
    setAgentRunning(true);
    try {
      await api.post<DirectorRunResult>(`/api/admin/trust/agents/${slug}/run`);
      // Re-pull this director's detail + the roster row so the drawer and the
      // list reflect what just happened, without waiting for the next 30s poll.
      const [detailRes, rosterRes] = await Promise.all([
        api.get<AgentDetail>(`/api/admin/trust/agents/${slug}`),
        api.get<{ rows: AgentRosterRow[] }>('/api/admin/trust/agents'),
      ]);
      setAgentDetail(detailRes.data);
      setAgentRoster(rosterRes.data.rows || []);
    } catch {
      // Leave the last-known detail in place; the poll or drawer reopen will retry.
    } finally {
      setAgentRunning(false);
    }
  };

  const closeDrawer = () => setDrawerKind(null);

  if (loading) return <div className="p-4 text-muted">Loading Trust Command Center…</div>;

  return (
    <>
      <PageHeader
        title="Trust Command Center"
        icon="shield-check-line"
        subtitle="TBI compliance audit — composite trust score, live AI activity, governance posture, and the criterion-level drill-down. Read-only."
        breadcrumb={[{ label: 'Admin', to: '/admin/dashboard' }, { label: 'Trust Center' }]}
        trust={trust}
      >
        <p className="text-muted small mb-0">
          <span className="badge bg-success-subtle text-success-emphasis">live</span> = queried now ·{' '}
          <span className="badge bg-secondary-subtle text-secondary-emphasis">baseline</span> = audit score ·{' '}
          <span className="badge bg-warning-subtle text-warning-emphasis">placeholder</span> = not yet instrumented.
          {' '}<span className="text-primary">Click any dimension or the cost tile for the criterion-level breakdown.</span>
        </p>
      </PageHeader>

      {error && (
        <div className="alert alert-warning d-flex align-items-center gap-2 py-2" role="alert">
          <i className="ri-error-warning-line" aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}

      {/* Row: composite score + recommendation + top risks */}
      {overview && (
        <div className="row g-3 mb-3">
          <div className="col-md-3">
            <SectionCard className="h-100">
              <button
                type="button"
                onClick={openComposite}
                className="btn p-0 border-0 w-100 text-start bg-transparent"
                title="View the 8 dimension contributions behind this score"
              >
                <div className="text-center">
                  <div className="text-muted small text-uppercase">Composite Trust</div>
                  <div className={`display-4 fw-bold text-${bandColor(overview.band)}`}>
                    {overview.compositeTrustScore}
                  </div>
                  <div className="text-muted small">/ 100 · click for breakdown</div>
                  <div className="mt-2 small">
                    INPACT ≈ {overview.inpactEstimatePct}% · GOALS ≈ {overview.goalsEstimate}/25
                  </div>
                  <div className="small text-muted" title={overview.inpactGoalsSource}>
                    desk estimate, {overview.inpactGoalsScoredSystems} Tier-1 systems — not yet council-scored
                  </div>
                </div>
              </button>
            </SectionCard>
          </div>
          <div className="col-md-4">
            <SectionCard className="h-100">
              <div className="text-muted small text-uppercase">Executive recommendation</div>
              <div className="fs-5 fw-bold text-danger">{overview.recommendation}</div>
              <div className="small text-muted">{overview.maturityLevel}</div>
              <div className="small mt-2">
                Production gate (INPACT ≥ 86%, GOALS ≥ 21/25){' '}
                <span className={`fw-semibold text-${overview.productionGateMet ? 'success' : 'danger'}`}>
                  {overview.productionGateMet ? 'met' : 'not met'}
                </span>
                .
              </div>
            </SectionCard>
          </div>
          <div className="col-md-5">
            <SectionCard className="h-100">
              <div className="text-muted small text-uppercase">Next actions to raise the score</div>
              {actions.length === 0 ? (
                <div className="small text-muted mt-1">All tracked criteria are met.</div>
              ) : (
                <ol className="small mb-0 ps-3">
                  {actions.slice(0, 6).map((a) => (
                    <li key={a.dimensionKey + a.label} className="mb-1">
                      <button
                        type="button"
                        className="btn btn-link p-0 text-start text-reset text-decoration-none align-baseline"
                        onClick={() => openDimension(a.dimensionKey)}
                      >
                        <span className="fw-semibold">{a.dimension}:</span> {a.remediation}
                      </button>
                    </li>
                  ))}
                </ol>
              )}
            </SectionCard>
          </div>
        </div>
      )}

      {/* Row: live activity tiles */}
      {activity && (
        <div className="row row-cols-2 row-cols-md-6 g-3 mb-3">
          <div className="col">
            <button type="button" onClick={() => openActivityDetail('conversations')} className="btn p-0 border-0 w-100 text-start" title="View recent conversations">
              <StatCard label="Conversations 24h" value={activity.conversations24h.value} icon="chat-3-line" tone="info" hint={`${activity.conversations24h.state} · click for detail`} />
            </button>
          </div>
          <div className="col">
            <button type="button" onClick={() => openActivityDetail('generations')} className="btn p-0 border-0 w-100 text-start" title="View recent generations">
              <StatCard label="Generations 24h" value={activity.generations24h.value} icon="sparkling-2-line" tone="primary" hint={`${activity.generations24h.state} · click for detail`} />
            </button>
          </div>
          <div className="col">
            <button type="button" onClick={() => openActivityDetail('agent-runs')} className="btn p-0 border-0 w-100 text-start" title="View recent agent runs">
              <StatCard label="Agent runs 24h" value={activity.agentRuns24h.value} icon="robot-2-line" tone="info" hint={`${activity.agentRuns24h.state} · click for detail`} />
            </button>
          </div>
          <div className="col">
            <button type="button" onClick={() => openActivityDetail('errors')} className="btn p-0 border-0 w-100 text-start" title="View recent errors">
              <StatCard label="Errors 24h" value={activity.errors24h.value} icon="error-warning-line" tone={activity.errors24h.value ? 'danger' : 'success'} hint={`${activity.errors24h.state} · click for detail`} />
            </button>
          </div>
          <div className="col">
            <button type="button" onClick={openCost} className="btn p-0 border-0 w-100 text-start" title="View AI cost by workflow">
              <StatCard
                label="AI cost 24h"
                value={activity.costUsd24h.value === null ? '—' : `$${activity.costUsd24h.value}`}
                icon="money-dollar-circle-line"
                tone="warning"
                hint={`${activity.costUsd24h.state} · click for breakdown`}
              />
            </button>
          </div>
          <div className="col">
            {value ? (
              <button type="button" onClick={openValue} className="btn p-0 border-0 w-100 text-start" title="View AI value by workflow">
                <StatCard
                  label="AI value 30d"
                  value={`$${value.valueUsd.toLocaleString()}`}
                  icon="funds-line"
                  tone="success"
                  hint="live · click for breakdown"
                />
              </button>
            ) : (
              <StatCard label="AI value 30d" value="—" icon="funds-line" tone="success" hint="live" />
            )}
          </div>
        </div>
      )}

      <div className="row g-3">
        {/* Trust dimensions */}
        {overview && (
          <div className="col-md-4">
            <SectionCard title="Trust by dimension" icon="shield-star-line" className="h-100">
              {overview.dimensions.map((d) => <ScoreBar key={d.key} d={d} onClick={() => openDimension(d.key)} />)}
              <div className="text-muted" style={{ fontSize: '0.7rem' }}>{overview.baselineSource}</div>
            </SectionCard>
          </div>
        )}

        {/* Observability dimensions */}
        {observability && (
          <div className="col-md-4">
            <SectionCard title="Observability coverage" icon="eye-line" className="h-100">
              {observability.dimensions.map((d) => <ScoreBar key={d.key} d={d} onClick={() => openDimension(d.key)} />)}
              <div className="d-flex justify-content-between small mt-2">
                <span>Audited generations 24h<StateBadge state={observability.auditedGenerations24h.state} /></span>
                <span className="fw-semibold">{observability.auditedGenerations24h.value}</span>
              </div>
              <div className="text-muted" style={{ fontSize: '0.7rem' }}>{observability.note}</div>
            </SectionCard>
          </div>
        )}

        {/* Governance status */}
        {governance && (
          <div className="col-md-4">
            <SectionCard title="Governance status" icon="git-repository-private-line" className="h-100">
              <div className="d-flex justify-content-between mb-2"><span>Kill switch</span><YesNo v={governance.killSwitchActive} /></div>
              <div className="d-flex justify-content-between mb-2"><span>Safe mode</span><YesNo v={governance.safeModeActive} /></div>
              <button
                type="button"
                onClick={openBlockedWrites}
                className="btn btn-link text-reset text-decoration-none d-block w-100 text-start p-0 mb-2"
                title="View blocked agent writes"
              >
                <div className="d-flex justify-content-between small">
                  <span>Blocked agent writes 24h<StateBadge state={governance.blockedAgentWrites24h.state} /></span>
                  <span className="fw-semibold">{governance.blockedAgentWrites24h.value}<span className="text-muted ms-1" aria-hidden="true">&rsaquo;</span></span>
                </div>
              </button>
              <div className="alert alert-danger py-2 small mb-0 mt-2">{governance.killSwitchGatesActions.note}</div>
            </SectionCard>
          </div>
        )}
      </div>

      {/* AI Workforce — one row per director: status, trigger, last action, 7-day cost */}
      {agentRoster && (
        <SectionCard title="AI Workforce" icon="team-line" className="mt-3">
          <p className="text-muted small mb-3">
            10 directors, one tool + one action each, gated by a hard kill switch / safe mode / enabled check
            (<code>workforceAgentRuntime.ts</code>) independent of the repo-wide shadow-mode default.
            Click a director for the GOALS-scored breakdown and raw activity log.
          </p>
          <div className="table-responsive">
            <table className="table table-sm align-middle mb-0">
              <thead>
                <tr className="small text-muted text-uppercase">
                  <th>Director</th>
                  <th>Status</th>
                  <th>Trigger</th>
                  <th>Last action</th>
                  <th className="text-end">7d cost</th>
                  <th className="text-end">7d runs</th>
                </tr>
              </thead>
              <tbody>
                {agentRoster.map((r) => (
                  <tr key={r.slug} style={{ cursor: 'pointer' }} onClick={() => openAgent(r.slug)}>
                    <td>
                      <div className="d-flex align-items-center gap-2">
                        <span
                          className="d-inline-flex align-items-center justify-content-center rounded-circle text-white fw-bold flex-shrink-0"
                          style={{ width: 28, height: 28, fontSize: '0.7rem', backgroundColor: r.avatar }}
                          aria-hidden="true"
                        >
                          {initials(r.name)}
                        </span>
                        <div>
                          <div className="fw-semibold small">{r.name}</div>
                          <div className="text-muted" style={{ fontSize: '0.72rem' }}>{r.role}</div>
                        </div>
                      </div>
                    </td>
                    <td>
                      {r.status === 'not_registered'
                        ? <span className="badge bg-secondary">not seeded</span>
                        : <span className={`badge ${r.enabled ? 'bg-success' : 'bg-secondary'}`}>{r.enabled ? 'active' : 'disabled'}</span>}
                    </td>
                    <td className="small text-muted">
                      {r.triggerType === 'on_demand' ? 'manual' : r.triggerType ? `${r.triggerType}${r.schedule ? ` · ${r.schedule}` : ''}` : '—'}
                    </td>
                    <td className="small">
                      {r.lastAction
                        ? <span title={r.lastAction.at ? new Date(r.lastAction.at).toLocaleString() : undefined}>{r.lastAction.action} <span className="text-muted">({r.lastAction.result})</span></span>
                        : <span className="text-muted">no runs yet</span>}
                    </td>
                    <td className="text-end small">${r.cost7d}</td>
                    <td className="text-end small">{r.runs7d}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      )}

      {/* Registry health — the full ai_agents registry (211+ rows), not just the 10
          Workforce directors above. Per the 2026-07-31 audit: some agents run but were
          never wired to report here (now fixed); some are internal steps of a parent
          agent; some are genuinely dead code. */}
      {registryHealth && (
        <SectionCard title="Agent registry health" icon="database-2-line" className="mt-3">
          <p className="text-muted small mb-3">
            Every registered AI agent, bucketed by real status — not just whether it's marked "enabled."
          </p>
          <div className="row g-3 text-center mb-3">
            <div className="col-6 col-md">
              <div className="fs-4 fw-bold text-success">{registryHealth.live.count}</div>
              <div className="small text-muted">Live</div>
            </div>
            <div className="col-6 col-md">
              <div className="fs-4 fw-bold text-primary">{registryHealth.internal_pipeline_step.count}</div>
              <div className="small text-muted">Pipeline step</div>
            </div>
            <div className="col-6 col-md">
              <div className="fs-4 fw-bold text-warning">{registryHealth.staged_pending_activation.count}</div>
              <div className="small text-muted">Staged, not yet active</div>
            </div>
            <div className="col-6 col-md">
              <div className="fs-4 fw-bold text-danger">{registryHealth.confirmed_dead.count}</div>
              <div className="small text-muted">Confirmed dead</div>
            </div>
            <div className="col-6 col-md">
              <div className="fs-4 fw-bold text-secondary">{registryHealth.unclassified.count}</div>
              <div className="small text-muted">Unclassified</div>
            </div>
          </div>
          {registryHealth.confirmed_dead.count > 0 && (
            <details className="mb-2">
              <summary className="small fw-semibold text-danger" style={{ cursor: 'pointer' }}>
                Confirmed dead ({registryHealth.confirmed_dead.count}) — disabled, no code path reaches them
              </summary>
              <ul className="small text-muted mb-0 mt-2">
                {registryHealth.confirmed_dead.agents.map((a) => (
                  <li key={a.name}>
                    <button type="button" className="btn btn-link p-0 text-decoration-none text-body align-baseline" onClick={() => openAgentRegistryDetail(a.name)}>
                      {a.name}
                    </button>
                    {a.note ? ` — ${a.note}` : ''}
                  </li>
                ))}
              </ul>
            </details>
          )}
          {registryHealth.internal_pipeline_step.count > 0 && (
            <details>
              <summary className="small fw-semibold text-primary" style={{ cursor: 'pointer' }}>
                Internal pipeline steps ({registryHealth.internal_pipeline_step.count}) — run as part of a parent agent, not independently
              </summary>
              <ul className="small text-muted mb-0 mt-2">
                {registryHealth.internal_pipeline_step.agents.map((a) => (
                  <li key={a.name}>
                    <button type="button" className="btn btn-link p-0 text-decoration-none text-body align-baseline" onClick={() => openAgentRegistryDetail(a.name)}>
                      {a.name}
                    </button>
                    {a.note ? ` — ${a.note}` : ''}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </SectionCard>
      )}

      {/* Activity trend */}
      {activity && activity.trend.length > 0 && (
        <SectionCard title="AI activity — last 7 days" icon="line-chart-line" className="mt-3">
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={activity.trend} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} />
              <XAxis dataKey="day" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="generations" stroke={CHART_GENERATIONS} strokeWidth={2} />
              <Line type="monotone" dataKey="conversations" stroke={CHART_CONVERSATIONS} strokeWidth={2} />
              <Line type="monotone" dataKey="agentRuns" stroke={CHART_AGENT_RUNS} strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
          {/* T019: the chart itself is an SVG line plot — not reliably clickable-per-point nor
              keyboard-operable, and accessibility here is non-negotiable (see frontend/CLAUDE.md).
              A real button per day gives every trend point a keyboard- and screen-reader-safe
              way into that day's full breakdown, matching the "click the day" affordance without
              depending on imprecise SVG hit-testing. */}
          <div className="d-flex flex-wrap gap-2 mt-2">
            {activity.trend.map((t) => (
              <button key={t.day} type="button" className="btn btn-sm btn-outline-secondary" onClick={() => openDayDetail(t.day)}>
                {t.day}
              </button>
            ))}
          </div>
        </SectionCard>
      )}

      {/* T020: Data Retention — visibility only. The destructive POST /retention/enforce
          endpoint deliberately has NO UI trigger here; that is a scoped-out decision from the
          Phase B plan (needs separate sign-off), not an oversight. */}
      {retention && (
        <SectionCard title="Data retention" icon="database-2-line" className="mt-3">
          <p className="text-muted small mb-3">
            {retention.note} Default TTL {retention.defaultTtlMonths} months · report generated{' '}
            {new Date(retention.generatedAt).toLocaleString()}.
          </p>
          <div className="table-responsive">
            <table className="table table-sm small align-middle mb-0">
              <thead>
                <tr className="small text-muted text-uppercase">
                  <th>Class</th>
                  <th className="text-end">Total</th>
                  <th className="text-end">Would expire</th>
                  <th>Oldest record</th>
                  <th>Action if enforced</th>
                </tr>
              </thead>
              <tbody>
                {retention.classes.map((c) => (
                  <tr key={c.key}>
                    <td>
                      <div className="fw-semibold">{c.label}</div>
                      <div className="text-muted" style={{ fontSize: '0.72rem' }}>{c.pii}</div>
                    </td>
                    <td className="text-end">{c.error ? '—' : c.total.toLocaleString()}</td>
                    <td className="text-end">
                      {c.error
                        ? <span className="badge bg-secondary-subtle text-secondary-emphasis">{c.error}</span>
                        : <span className={c.expired > 0 ? 'text-warning fw-semibold' : ''}>{c.expired.toLocaleString()}</span>}
                    </td>
                    <td className="text-muted">{c.oldest ? new Date(c.oldest).toLocaleDateString() : '—'}</td>
                    <td><span className="badge border text-muted">{c.action === 'purge' ? 'purge' : 'anonymize (review)'}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="text-muted mt-2" style={{ fontSize: '0.7rem' }}>
            {retention.totals.expired.toLocaleString()} of {retention.totals.total.toLocaleString()} records across{' '}
            {retention.totals.classesOverThreshold} class{retention.totals.classesOverThreshold === 1 ? '' : 'es'} would expire under the default TTL. Dry-run only — nothing here deletes data.
          </div>
        </SectionCard>
      )}

      <DetailDrawer
        kind={drawerKind}
        detail={detail}
        cost={cost}
        value={value}
        agent={agentDetail}
        composite={composite}
        activityDetail={activityDetail}
        blockedWrites={blockedWrites}
        registryDetail={registryDetail}
        dayDetail={dayDetail}
        agentRunning={agentRunning}
        loading={drawerLoading}
        onClose={closeDrawer}
        onOpenDimension={openDimension}
        onRunAgent={runAgent}
      />
    </>
  );
}

export default AdminTrustCenterPage;
