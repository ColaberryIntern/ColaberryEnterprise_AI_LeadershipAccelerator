import React, { useEffect, useMemo, useRef, useState } from 'react';
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

function DetailDrawer({ kind, detail, cost, value, loading, onClose, onOpenDimension }: {
  kind: 'dimension' | 'cost' | 'value' | null;
  detail: DimensionDetail | null;
  cost: CostBreakdown | null;
  value: AiValue | null;
  loading: boolean;
  onClose: () => void;
  onOpenDimension: (key: string) => void;
}) {
  if (!kind) return null;
  return (
    <>
      <div onClick={onClose} aria-hidden="true" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 1045 }} />
      <div className="card shadow" role="dialog" aria-modal="true" aria-label="Trust detail"
        style={{ position: 'fixed', top: 0, right: 0, height: '100vh', width: 'min(480px, 94vw)', zIndex: 1046, overflowY: 'auto', borderRadius: 0 }}>
        <div className="card-body">
          <div className="d-flex justify-content-between align-items-start mb-3">
            <h2 className="h5 mb-0">{kind === 'cost' ? 'AI cost by workflow · 30 days' : kind === 'value' ? 'AI value by workflow · 30 days' : detail ? `${detail.label} · breakdown` : 'Detail'}</h2>
            <button type="button" className="btn-close" aria-label="Close" onClick={onClose} />
          </div>

          {loading && <div className="text-muted">Loading…</div>}

          {!loading && kind === 'dimension' && detail && (
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
          )}

          {!loading && kind === 'cost' && cost && (
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
          )}

          {!loading && kind === 'value' && value && (
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
          )}

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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Drill-down drawer state
  const [drawerKind, setDrawerKind] = useState<'dimension' | 'cost' | 'value' | null>(null);
  const [detail, setDetail] = useState<DimensionDetail | null>(null);
  const [cost, setCost] = useState<CostBreakdown | null>(null);
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
              <div className="text-center">
                <div className="text-muted small text-uppercase">Composite Trust</div>
                <div className={`display-4 fw-bold text-${bandColor(overview.band)}`}>
                  {overview.compositeTrustScore}
                </div>
                <div className="text-muted small">/ 100</div>
                <div className="mt-2 small">INPACT ≈ {overview.inpactEstimatePct}% · GOALS ≈ {overview.goalsEstimate}/25</div>
              </div>
            </SectionCard>
          </div>
          <div className="col-md-4">
            <SectionCard className="h-100">
              <div className="text-muted small text-uppercase">Executive recommendation</div>
              <div className="fs-5 fw-bold text-danger">{overview.recommendation}</div>
              <div className="small text-muted">{overview.maturityLevel}</div>
              <div className="small mt-2">Production gate (INPACT ≥ 86%, GOALS ≥ 21/25) <span className="fw-semibold text-danger">not met</span>.</div>
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
            <StatCard label="Conversations 24h" value={activity.conversations24h.value} icon="chat-3-line" tone="info" hint={activity.conversations24h.state} />
          </div>
          <div className="col">
            <StatCard label="Generations 24h" value={activity.generations24h.value} icon="sparkling-2-line" tone="primary" hint={activity.generations24h.state} />
          </div>
          <div className="col">
            <StatCard label="Agent runs 24h" value={activity.agentRuns24h.value} icon="robot-2-line" tone="info" hint={activity.agentRuns24h.state} />
          </div>
          <div className="col">
            <StatCard label="Errors 24h" value={activity.errors24h.value} icon="error-warning-line" tone={activity.errors24h.value ? 'danger' : 'success'} hint={activity.errors24h.state} />
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
              {observability.dimensions.map((d) => <ScoreBar key={d.key} d={d} />)}
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
              <div className="d-flex justify-content-between mb-2 small"><span>Blocked agent writes 24h<StateBadge state={governance.blockedAgentWrites24h.state} /></span><span className="fw-semibold">{governance.blockedAgentWrites24h.value}</span></div>
              <div className="alert alert-danger py-2 small mb-0 mt-2">{governance.killSwitchGatesActions.note}</div>
            </SectionCard>
          </div>
        )}
      </div>

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
        </SectionCard>
      )}

      <DetailDrawer
        kind={drawerKind}
        detail={detail}
        cost={cost}
        value={value}
        loading={drawerLoading}
        onClose={closeDrawer}
        onOpenDimension={openDimension}
      />
    </>
  );
}

export default AdminTrustCenterPage;
