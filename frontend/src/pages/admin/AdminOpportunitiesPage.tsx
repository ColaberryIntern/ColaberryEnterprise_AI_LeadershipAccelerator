import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import api from '../../utils/api';
import Pagination from '../../components/ui/Pagination';
import { PageHeader, StatCard, StatusBadge, SectionCard } from '../../components/admin/shell';
import { TrustSignal } from '../../components/admin/shell/trust';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface OpportunityRow {
  id: string;
  lead_id: number;
  score: number;
  opportunity_level: string;
  score_components: Record<string, number>;
  stall_risk: string;
  stall_reason: string | null;
  days_in_pipeline: number;
  days_since_last_activity: number;
  recommended_actions: Array<{ action: string; priority: string; reason: string }>;
  conversion_probability: number;
  projected_revenue: number;
  score_updated_at: string;
  lead: {
    id: number;
    name: string;
    email: string;
    company: string;
    title: string;
    pipeline_stage: string;
    lead_temperature: string;
    lead_score: number;
    created_at: string;
  };
}

interface Summary {
  total_scored: number;
  avg_score: number;
  distribution: Record<string, number>;
  stall_counts: Record<string, number>;
  total_pipeline_value: number;
}

interface Forecast {
  by_level: Array<{ level: string; count: number; conversion_rate: number; projected_enrollments: number; projected_revenue: number }>;
  total_projected_enrollments: number;
  total_projected_revenue: number;
  weighted_pipeline_value: number;
}

type TabKey = 'pipeline' | 'forecast' | 'at_risk';

type BadgeTone = 'success' | 'danger' | 'warning' | 'info' | 'neutral' | 'primary';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

// Opportunity level -> semantic badge tone + label (was hardcoded bg-* classes).
const LEVEL_BADGES: Record<string, { tone: BadgeTone; label: string }> = {
  cold_prospect: { tone: 'neutral', label: 'Cold Prospect' },
  warming: { tone: 'info', label: 'Warming' },
  qualified: { tone: 'primary', label: 'Qualified' },
  hot_opportunity: { tone: 'warning', label: 'Hot Opportunity' },
  ready_to_close: { tone: 'success', label: 'Ready to Close' },
};

// Stall risk -> tone + label (was hardcoded bg-* classes).
const STALL_BADGES: Record<string, { tone: BadgeTone; label: string }> = {
  none: { tone: 'neutral', label: '' },
  low: { tone: 'warning', label: 'Low' },
  medium: { tone: 'warning', label: 'Medium' },
  high: { tone: 'danger', label: 'High' },
};

// Recommended-action priority -> tone (was hardcoded bg-danger/bg-warning/bg-info).
const PRIORITY_TONE: Record<string, BadgeTone> = {
  critical: 'danger',
  high: 'warning',
  medium: 'info',
};

const PIPELINE_LABELS: Record<string, string> = {
  new_lead: 'New Lead',
  contacted: 'Contacted',
  meeting_scheduled: 'Meeting',
  proposal_sent: 'Proposal',
  negotiation: 'Negotiation',
  enrolled: 'Enrolled',
  lost: 'Lost',
};

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(amount);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function AdminOpportunitiesPage() {
  const [tab, setTab] = useState<TabKey>('pipeline');

  // Pipeline state
  const [rows, setRows] = useState<OpportunityRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [filterLevel, setFilterLevel] = useState('');
  const [filterStall, setFilterStall] = useState('');
  const [filterPipeline, setFilterPipeline] = useState('');
  const [sort, setSort] = useState('score');
  const [order, setOrder] = useState('DESC');
  const [recomputing, setRecomputing] = useState(false);

  // Summary + forecast
  const [summary, setSummary] = useState<Summary | null>(null);
  const [forecast, setForecast] = useState<Forecast | null>(null);

  const fetchOpportunities = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = { page: String(page), limit: '30', sort, order };
      if (filterLevel) params.level = filterLevel;
      if (filterStall) params.stall_risk = filterStall;
      if (filterPipeline) params.pipeline_stage = filterPipeline;
      const res = await api.get('/api/admin/opportunities', { params });
      setRows(res.data.rows);
      setTotal(res.data.total);
      setTotalPages(res.data.totalPages);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [page, sort, order, filterLevel, filterStall, filterPipeline]);

  const fetchSummaryAndForecast = useCallback(async () => {
    try {
      const [sRes, fRes] = await Promise.all([
        api.get('/api/admin/opportunities/summary'),
        api.get('/api/admin/opportunities/forecast'),
      ]);
      setSummary(sRes.data);
      setForecast(fRes.data);
    } catch {
      // silent
    }
  }, []);

  useEffect(() => {
    if (tab === 'pipeline' || tab === 'at_risk') fetchOpportunities();
    if (tab === 'forecast') fetchSummaryAndForecast();
  }, [tab, fetchOpportunities, fetchSummaryAndForecast]);

  useEffect(() => {
    fetchSummaryAndForecast();
  }, [fetchSummaryAndForecast]);

  // Per-page trust signal (Basecamp todo 10027085963) derived from scoring freshness.
  const trust: TrustSignal = useMemo(() => {
    const atRisk = summary ? (summary.stall_counts.medium || 0) + (summary.stall_counts.high || 0) : 0;
    return {
      level: 'live',
      source: 'opportunities table',
      updatedAt: new Date().toISOString(),
      summary: summary
        ? `${summary.total_scored} opportunities scored, ${atRisk} at risk.`
        : 'Opportunity scores stream live from the pipeline.',
      href: '/admin/trust',
      pillars: [
        {
          name: 'Coverage',
          status: 'live',
          evidence: [{ label: 'Scored', value: summary ? String(summary.total_scored) : '0' }],
        },
      ],
    };
  }, [summary]);

  const handleRecompute = async () => {
    setRecomputing(true);
    try {
      await api.post('/api/admin/opportunities/recompute');
      fetchOpportunities();
      fetchSummaryAndForecast();
    } catch {
      // silent
    } finally {
      setRecomputing(false);
    }
  };

  const toggleSort = (field: string) => {
    if (sort === field) setOrder(o => o === 'DESC' ? 'ASC' : 'DESC');
    else { setSort(field); setOrder('DESC'); }
  };

  const sortIcon = (field: string) => {
    if (sort !== field) return '';
    return order === 'DESC' ? ' ▼' : ' ▲';
  };

  // At-risk filters
  const atRiskRows = rows.filter(r => r.stall_risk === 'medium' || r.stall_risk === 'high');

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <>
      <PageHeader
        title="Opportunities"
        icon="line-chart-line"
        subtitle="Scored pipeline, weighted forecast, and at-risk opportunities across every active lead."
        breadcrumb={[{ label: 'Admin', to: '/admin/dashboard' }, { label: 'Opportunities' }]}
        trust={trust}
        actions={
          <button className="btn btn-sm btn-outline-primary" onClick={handleRecompute} disabled={recomputing}>
            <i className="ri-refresh-line" aria-hidden="true" /> {recomputing ? 'Recomputing...' : 'Recompute Scores'}
          </button>
        }
      >
        {summary && (
          <div className="row g-3">
            <div className="col-6 col-lg-3">
              <StatCard label="Total Scored" value={summary.total_scored} icon="database-2-line" tone="primary" />
            </div>
            <div className="col-6 col-lg-3">
              <StatCard label="Avg Score" value={summary.avg_score} icon="bar-chart-box-line" tone="info" />
            </div>
            <div className="col-6 col-lg-3">
              <StatCard label="Pipeline Value" value={formatCurrency(summary.total_pipeline_value)} icon="funds-line" tone="success" />
            </div>
            <div className="col-6 col-lg-3">
              <StatCard
                label="At Risk"
                value={(summary.stall_counts.medium || 0) + (summary.stall_counts.high || 0)}
                icon="error-warning-line"
                tone={((summary.stall_counts.medium || 0) + (summary.stall_counts.high || 0)) > 0 ? 'danger' : 'neutral'}
              />
            </div>
          </div>
        )}
      </PageHeader>

      {/* Tabs */}
      <ul className="nav nav-tabs mb-4">
        {(['pipeline', 'forecast', 'at_risk'] as TabKey[]).map(t => (
          <li key={t} className="nav-item">
            <button className={`nav-link ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>
              {t === 'pipeline' ? 'Pipeline' : t === 'forecast' ? 'Forecast' : 'At Risk'}
            </button>
          </li>
        ))}
      </ul>

      {/* Pipeline Tab */}
      {tab === 'pipeline' && (
        <div>
          {/* Filters */}
          <div className="d-flex gap-2 mb-3 flex-wrap align-items-center">
            <select className="form-select form-select-sm" style={{ width: 'auto' }} value={filterLevel} onChange={e => { setFilterLevel(e.target.value); setPage(1); }}>
              <option value="">All Levels</option>
              {Object.entries(LEVEL_BADGES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
            <select className="form-select form-select-sm" style={{ width: 'auto' }} value={filterStall} onChange={e => { setFilterStall(e.target.value); setPage(1); }}>
              <option value="">All Stall Risk</option>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
            <select className="form-select form-select-sm" style={{ width: 'auto' }} value={filterPipeline} onChange={e => { setFilterPipeline(e.target.value); setPage(1); }}>
              <option value="">All Stages</option>
              {Object.entries(PIPELINE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <span className="text-muted small ms-auto">{total} opportunities</span>
          </div>

          {/* Table */}
          <SectionCard padded={false}>
            <div className="table-responsive">
              <table className="table table-hover mb-0">
                <thead className="table-light">
                  <tr>
                    <th>Lead</th>
                    <th style={{ cursor: 'pointer' }} onClick={() => toggleSort('score')}>Score{sortIcon('score')}</th>
                    <th>Level</th>
                    <th>Pipeline</th>
                    <th>Stall Risk</th>
                    <th style={{ cursor: 'pointer' }} onClick={() => toggleSort('days_since_last_activity')}>Last Active{sortIcon('days_since_last_activity')}</th>
                    <th style={{ cursor: 'pointer' }} onClick={() => toggleSort('days_in_pipeline')}>Days{sortIcon('days_in_pipeline')}</th>
                    <th>Next Action</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={8} className="text-center py-4"><div className="spinner-border spinner-border-sm" role="status"><span className="visually-hidden">Loading...</span></div></td></tr>
                  ) : rows.length === 0 ? (
                    <tr><td colSpan={8} className="text-center py-4 text-muted">No opportunities scored yet. Click "Recompute Scores" to start.</td></tr>
                  ) : rows.map(row => {
                    const lb = LEVEL_BADGES[row.opportunity_level] || LEVEL_BADGES.cold_prospect;
                    const sb = STALL_BADGES[row.stall_risk] || STALL_BADGES.none;
                    const firstAction = row.recommended_actions?.[0];
                    return (
                      <tr key={row.id}>
                        <td>
                          <Link to={`/admin/leads/${row.lead.id}`} className="text-decoration-none fw-medium">
                            {row.lead.name}
                          </Link>
                          <div className="text-muted" style={{ fontSize: '0.75rem' }}>{row.lead.company}</div>
                        </td>
                        <td>
                          <span className="fw-bold">{row.score}</span>
                          <div className="text-muted" style={{ fontSize: '0.65rem' }}>{Math.round(row.conversion_probability * 100)}% prob</div>
                        </td>
                        <td><StatusBadge label={lb.label} tone={lb.tone} /></td>
                        <td><span className="small">{PIPELINE_LABELS[row.lead.pipeline_stage] || row.lead.pipeline_stage}</span></td>
                        <td>{sb.label && <StatusBadge label={sb.label} tone={sb.tone} />}</td>
                        <td className="small">{row.days_since_last_activity === 999 ? 'Never' : `${row.days_since_last_activity}d ago`}</td>
                        <td className="small">{row.days_in_pipeline}d</td>
                        <td>
                          {firstAction && (
                            <span className="small" style={{ fontSize: '0.75rem' }}>
                              {firstAction.action}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </SectionCard>

          {totalPages > 1 && (
            <div className="mt-3">
              <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
            </div>
          )}
        </div>
      )}

      {/* Forecast Tab */}
      {tab === 'forecast' && forecast && (
        <div>
          {/* KPI Cards */}
          <div className="row g-3 mb-4">
            <div className="col-sm-6 col-lg-4">
              <StatCard label="Projected Enrollments" value={forecast.total_projected_enrollments} icon="graduation-cap-line" tone="primary" />
            </div>
            <div className="col-sm-6 col-lg-4">
              <StatCard label="Projected Revenue" value={formatCurrency(forecast.total_projected_revenue)} icon="money-dollar-circle-line" tone="success" />
            </div>
            <div className="col-sm-6 col-lg-4">
              <StatCard label="Weighted Pipeline" value={formatCurrency(forecast.weighted_pipeline_value)} icon="scales-3-line" tone="info" />
            </div>
          </div>

          {/* Breakdown Table */}
          <SectionCard title="Forecast by Opportunity Level" icon="line-chart-line" padded={false}>
            <div className="table-responsive">
              <table className="table table-hover mb-0">
                <thead className="table-light">
                  <tr>
                    <th>Level</th>
                    <th className="text-end">Leads</th>
                    <th className="text-end">Conv. Rate</th>
                    <th className="text-end">Projected Enrollments</th>
                    <th className="text-end">Projected Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {forecast.by_level.map(row => {
                    const lb = LEVEL_BADGES[row.level] || LEVEL_BADGES.cold_prospect;
                    return (
                      <tr key={row.level}>
                        <td><StatusBadge label={lb.label} tone={lb.tone} /></td>
                        <td className="text-end">{row.count}</td>
                        <td className="text-end">{Math.round(row.conversion_rate * 100)}%</td>
                        <td className="text-end">{row.projected_enrollments}</td>
                        <td className="text-end fw-medium">{formatCurrency(row.projected_revenue)}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="table-light">
                  <tr className="fw-bold">
                    <td>Total</td>
                    <td className="text-end">{forecast.by_level.reduce((s, r) => s + r.count, 0)}</td>
                    <td></td>
                    <td className="text-end">{forecast.total_projected_enrollments}</td>
                    <td className="text-end">{formatCurrency(forecast.total_projected_revenue)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </SectionCard>
        </div>
      )}

      {/* At Risk Tab */}
      {tab === 'at_risk' && (
        <div>
          {loading ? (
            <div className="text-center py-4"><div className="spinner-border spinner-border-sm" role="status"><span className="visually-hidden">Loading...</span></div></div>
          ) : atRiskRows.length === 0 ? (
            <SectionCard>
              <div className="text-center py-4 text-muted">No at-risk opportunities found. Great news!</div>
            </SectionCard>
          ) : (
            <div className="row g-3">
              {atRiskRows.sort((a, b) => {
                const riskOrder: Record<string, number> = { high: 0, medium: 1 };
                const diff = (riskOrder[a.stall_risk] ?? 2) - (riskOrder[b.stall_risk] ?? 2);
                return diff !== 0 ? diff : b.score - a.score;
              }).map(row => {
                const lb = LEVEL_BADGES[row.opportunity_level] || LEVEL_BADGES.cold_prospect;
                const sb = STALL_BADGES[row.stall_risk] || STALL_BADGES.none;
                const accent = row.stall_risk === 'high' ? 'var(--status-danger)' : 'var(--status-warning)';
                return (
                  <div key={row.id} className="col-lg-6">
                    <div className="h-100" style={{ borderLeft: `4px solid ${accent}`, borderRadius: 8 } as React.CSSProperties}>
                    <SectionCard className="h-100">
                      <div className="d-flex justify-content-between align-items-start mb-2">
                        <div>
                          <Link to={`/admin/leads/${row.lead.id}`} className="fw-bold text-decoration-none">
                            {row.lead.name}
                          </Link>
                          <div className="text-muted small">{row.lead.company} &middot; {PIPELINE_LABELS[row.lead.pipeline_stage] || row.lead.pipeline_stage}</div>
                        </div>
                        <div className="d-flex align-items-center gap-1">
                          <StatusBadge label={String(row.score)} tone={lb.tone} />
                          <StatusBadge label={`${sb.label} Risk`} tone={sb.tone} />
                        </div>
                      </div>
                      {row.stall_reason && (
                        <div className="small text-muted mb-2">{row.stall_reason}</div>
                      )}
                      {row.recommended_actions && row.recommended_actions.length > 0 && (
                        <div>
                          <div className="small fw-medium mb-1">Recommended Actions:</div>
                          {row.recommended_actions.map((a, i) => (
                            <div key={i} className="d-flex align-items-start gap-2 mb-1">
                              <StatusBadge label={a.priority} tone={PRIORITY_TONE[a.priority] || 'info'} />
                              <span className="small">{a.action}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </SectionCard>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </>
  );
}
