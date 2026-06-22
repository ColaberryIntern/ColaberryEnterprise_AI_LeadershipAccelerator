import React, { useEffect, useState } from 'react';
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

function Tile({ label, value, state, onClick }: { label: string; value: React.ReactNode; state: MetricState; onClick?: () => void }) {
  const body = (
    <div className="card-body">
      <div className="text-muted small text-uppercase">{label}<StateBadge state={state} />{onClick && <span className="text-muted ms-1" aria-hidden="true">&rsaquo;</span>}</div>
      <div className="fs-3 fw-bold">{value}</div>
    </div>
  );
  return (
    <div className="col">
      {onClick ? (
        <button type="button" onClick={onClick} className="card h-100 shadow-sm w-100 border-0 text-reset text-start p-0">{body}</button>
      ) : (
        <div className="card h-100 shadow-sm">{body}</div>
      )}
    </div>
  );
}

function DetailDrawer({ kind, detail, cost, loading, onClose, onOpenDimension }: {
  kind: 'dimension' | 'cost' | null;
  detail: DimensionDetail | null;
  cost: CostBreakdown | null;
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
            <h2 className="h5 mb-0">{kind === 'cost' ? 'AI cost by workflow · 30 days' : detail ? `${detail.label} · breakdown` : 'Detail'}</h2>
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Drill-down drawer state
  const [drawerKind, setDrawerKind] = useState<'dimension' | 'cost' | null>(null);
  const [detail, setDetail] = useState<DimensionDetail | null>(null);
  const [cost, setCost] = useState<CostBreakdown | null>(null);
  const [drawerLoading, setDrawerLoading] = useState(false);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const [o, a, g, ob, ac] = await Promise.all([
          api.get<Overview>('/api/admin/trust/overview'),
          api.get<Activity>('/api/admin/trust/activity'),
          api.get<Governance>('/api/admin/trust/governance'),
          api.get<Observability>('/api/admin/trust/observability'),
          api.get<{ actions: OpenAction[] }>('/api/admin/trust/actions'),
        ]);
        if (!active) return;
        setOverview(o.data);
        setActivity(a.data);
        setGovernance(g.data);
        setObservability(ob.data);
        setActions(ac.data.actions || []);
        setError(null);
      } catch {
        if (active) setError('Could not load trust metrics.');
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    const timer = setInterval(load, 30000);
    return () => { active = false; clearInterval(timer); };
  }, []);

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

  const closeDrawer = () => setDrawerKind(null);

  if (loading) return <div className="p-4 text-muted">Loading Trust Command Center…</div>;

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-1">
        <h1 className="h3 mb-0">Trust Command Center</h1>
        <span className="text-muted small">TBI compliance · docs/trust-audit</span>
      </div>
      <p className="text-muted small">
        Read-only. <span className="badge bg-success-subtle text-success-emphasis">live</span> = queried now ·{' '}
        <span className="badge bg-secondary-subtle text-secondary-emphasis">baseline</span> = audit score ·{' '}
        <span className="badge bg-warning-subtle text-warning-emphasis">placeholder</span> = not yet instrumented.
        {' '}<span className="text-primary">Click any dimension or the cost tile for the criterion-level breakdown.</span>
      </p>

      {error && <div className="alert alert-warning py-2">{error}</div>}

      {/* Row: composite score + recommendation + top risks */}
      {overview && (
        <div className="row g-3 mb-3">
          <div className="col-md-3">
            <div className="card h-100 shadow-sm text-center">
              <div className="card-body">
                <div className="text-muted small text-uppercase">Composite Trust</div>
                <div className={`display-4 fw-bold text-${overview.band === 'green' ? 'success' : overview.band === 'amber' ? 'warning' : 'danger'}`}>
                  {overview.compositeTrustScore}
                </div>
                <div className="text-muted small">/ 100</div>
                <div className="mt-2 small">INPACT ≈ {overview.inpactEstimatePct}% · GOALS ≈ {overview.goalsEstimate}/25</div>
              </div>
            </div>
          </div>
          <div className="col-md-4">
            <div className="card h-100 shadow-sm">
              <div className="card-body">
                <div className="text-muted small text-uppercase">Executive recommendation</div>
                <div className="fs-5 fw-bold text-danger">{overview.recommendation}</div>
                <div className="small text-muted">{overview.maturityLevel}</div>
                <div className="small mt-2">Production gate (INPACT ≥ 86%, GOALS ≥ 21/25) <span className="fw-semibold text-danger">not met</span>.</div>
              </div>
            </div>
          </div>
          <div className="col-md-5">
            <div className="card h-100 shadow-sm">
              <div className="card-body">
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
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Row: live activity tiles */}
      {activity && (
        <div className="row row-cols-2 row-cols-md-5 g-3 mb-3">
          <Tile label="Conversations 24h" value={activity.conversations24h.value} state={activity.conversations24h.state} />
          <Tile label="Generations 24h" value={activity.generations24h.value} state={activity.generations24h.state} />
          <Tile label="Agent runs 24h" value={activity.agentRuns24h.value} state={activity.agentRuns24h.state} />
          <Tile label="Errors 24h" value={activity.errors24h.value} state={activity.errors24h.state} />
          <Tile label="AI cost 24h" value={activity.costUsd24h.value === null ? '—' : `$${activity.costUsd24h.value}`} state={activity.costUsd24h.state} onClick={openCost} />
        </div>
      )}

      <div className="row g-3">
        {/* Trust dimensions */}
        {overview && (
          <div className="col-md-4">
            <div className="card h-100 shadow-sm">
              <div className="card-body">
                <h2 className="h6">Trust by dimension</h2>
                {overview.dimensions.map((d) => <ScoreBar key={d.key} d={d} onClick={() => openDimension(d.key)} />)}
                <div className="text-muted" style={{ fontSize: '0.7rem' }}>{overview.baselineSource}</div>
              </div>
            </div>
          </div>
        )}

        {/* Observability dimensions */}
        {observability && (
          <div className="col-md-4">
            <div className="card h-100 shadow-sm">
              <div className="card-body">
                <h2 className="h6">Observability coverage</h2>
                {observability.dimensions.map((d) => <ScoreBar key={d.key} d={d} />)}
                <div className="d-flex justify-content-between small mt-2">
                  <span>Audited generations 24h<StateBadge state={observability.auditedGenerations24h.state} /></span>
                  <span className="fw-semibold">{observability.auditedGenerations24h.value}</span>
                </div>
                <div className="text-muted" style={{ fontSize: '0.7rem' }}>{observability.note}</div>
              </div>
            </div>
          </div>
        )}

        {/* Governance status */}
        {governance && (
          <div className="col-md-4">
            <div className="card h-100 shadow-sm">
              <div className="card-body">
                <h2 className="h6">Governance status</h2>
                <div className="d-flex justify-content-between mb-2"><span>Kill switch</span><YesNo v={governance.killSwitchActive} /></div>
                <div className="d-flex justify-content-between mb-2"><span>Safe mode</span><YesNo v={governance.safeModeActive} /></div>
                <div className="d-flex justify-content-between mb-2 small"><span>Blocked agent writes 24h<StateBadge state={governance.blockedAgentWrites24h.state} /></span><span className="fw-semibold">{governance.blockedAgentWrites24h.value}</span></div>
                <div className="alert alert-danger py-2 small mb-0 mt-2">{governance.killSwitchGatesActions.note}</div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Activity trend */}
      {activity && activity.trend.length > 0 && (
        <div className="card shadow-sm mt-3">
          <div className="card-body">
            <h2 className="h6">AI activity — last 7 days</h2>
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={activity.trend} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e9ecef" />
                <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="generations" stroke="#2b6cb0" strokeWidth={2} />
                <Line type="monotone" dataKey="conversations" stroke="#38a169" strokeWidth={2} />
                <Line type="monotone" dataKey="agentRuns" stroke="#dd6b20" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      <DetailDrawer
        kind={drawerKind}
        detail={detail}
        cost={cost}
        loading={drawerLoading}
        onClose={closeDrawer}
        onOpenDimension={openDimension}
      />
    </div>
  );
}

export default AdminTrustCenterPage;
