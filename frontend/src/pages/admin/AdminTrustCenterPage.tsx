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

// Open items, reassessed 2026-06-22 (PR #50/#54 closed the original P0 security/control set).
const TOP_RISKS = [
  'No affirmative consent capture on outbound voice/email (PII now redacted at the LLM boundary; consent design pending — PR #53)',
  'No ABAC on AI actions — autonomy still broad (RBAC scaffold unapplied, P2-1)',
  'No revenue / time-saved attribution to AI (dollar-cost is now live; the ROI side is still missing)',
  'No metrics/alerting backend and no CI pipeline (p50/p95 + error-rate views, route-auth lint — P1-5/P3-1)',
  'Tool-call + retrieval/citation observability not yet captured (P1-6)',
];

function barClass(score: number): string {
  if (score >= 80) return 'bg-success';
  if (score >= 50) return 'bg-warning';
  return 'bg-danger';
}

function StateBadge({ state }: { state: MetricState }) {
  const map: Record<MetricState, string> = {
    live: 'bg-success-subtle text-success-emphasis',
    baseline: 'bg-secondary-subtle text-secondary-emphasis',
    placeholder: 'bg-warning-subtle text-warning-emphasis',
  };
  return <span className={`badge rounded-pill ${map[state]} ms-2`} style={{ fontSize: '0.65rem' }}>{state}</span>;
}

function ScoreBar({ d }: { d: DimensionScore }) {
  return (
    <div className="mb-2" title={d.evidence || undefined}>
      <div className="d-flex justify-content-between small">
        <span>
          {d.label}
          <StateBadge state={d.state} />
          {d.evidence && <span className="text-muted ms-1" style={{ cursor: 'help' }} aria-label="score rationale">&#9432;</span>}
        </span>
        <span className="fw-semibold">{d.score}</span>
      </div>
      <div className="progress" style={{ height: '8px' }} role="progressbar" aria-label={d.label} aria-valuenow={d.score} aria-valuemin={0} aria-valuemax={100}>
        <div className={`progress-bar ${barClass(d.score)}`} style={{ width: `${d.score}%` }} />
      </div>
    </div>
  );
}

function Tile({ label, value, state }: { label: string; value: React.ReactNode; state: MetricState }) {
  return (
    <div className="col">
      <div className="card h-100 shadow-sm">
        <div className="card-body">
          <div className="text-muted small text-uppercase">{label}<StateBadge state={state} /></div>
          <div className="fs-3 fw-bold">{value}</div>
        </div>
      </div>
    </div>
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const [o, a, g, ob] = await Promise.all([
          api.get<Overview>('/api/admin/trust/overview'),
          api.get<Activity>('/api/admin/trust/activity'),
          api.get<Governance>('/api/admin/trust/governance'),
          api.get<Observability>('/api/admin/trust/observability'),
        ]);
        if (!active) return;
        setOverview(o.data);
        setActivity(a.data);
        setGovernance(g.data);
        setObservability(ob.data);
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
                <div className="text-muted small text-uppercase">Open risks · next actions to raise the score</div>
                <ol className="small mb-0 ps-3">
                  {TOP_RISKS.map((r) => <li key={r}>{r}</li>)}
                </ol>
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
          <Tile label="AI cost 24h" value={activity.costUsd24h.value === null ? '—' : `$${activity.costUsd24h.value}`} state={activity.costUsd24h.state} />
        </div>
      )}

      <div className="row g-3">
        {/* Trust dimensions */}
        {overview && (
          <div className="col-md-4">
            <div className="card h-100 shadow-sm">
              <div className="card-body">
                <h2 className="h6">Trust by dimension</h2>
                {overview.dimensions.map((d) => <ScoreBar key={d.key} d={d} />)}
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
    </div>
  );
}

export default AdminTrustCenterPage;
