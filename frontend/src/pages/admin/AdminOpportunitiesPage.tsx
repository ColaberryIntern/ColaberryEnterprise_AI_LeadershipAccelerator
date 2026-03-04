import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import api from '../../utils/api';
import Breadcrumb from '../../components/ui/Breadcrumb';
import Pagination from '../../components/ui/Pagination';

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

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const LEVEL_BADGES: Record<string, { bg: string; label: string }> = {
  cold_prospect: { bg: 'bg-secondary', label: 'Cold Prospect' },
  warming: { bg: 'bg-info', label: 'Warming' },
  qualified: { bg: 'bg-primary', label: 'Qualified' },
  hot_opportunity: { bg: 'bg-warning text-dark', label: 'Hot Opportunity' },
  ready_to_close: { bg: 'bg-success', label: 'Ready to Close' },
};

const STALL_BADGES: Record<string, { bg: string; label: string }> = {
  none: { bg: '', label: '' },
  low: { bg: 'bg-warning text-dark', label: 'Low' },
  medium: { bg: 'bg-warning text-dark', label: 'Medium' },
  high: { bg: 'bg-danger', label: 'High' },
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

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
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
    return order === 'DESC' ? ' \u25BC' : ' \u25B2';
  };

  // At-risk filters
  const atRiskRows = rows.filter(r => r.stall_risk === 'medium' || r.stall_risk === 'high');

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div>
      <Breadcrumb items={[{ label: 'Admin', to: '/admin/dashboard' }, { label: 'Opportunities' }]} />
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h4 className="fw-bold mb-0" style={{ color: 'var(--color-primary)' }}>Opportunities</h4>
        <button className="btn btn-sm btn-outline-primary" onClick={handleRecompute} disabled={recomputing}>
          {recomputing ? 'Recomputing...' : 'Recompute Scores'}
        </button>
      </div>

      {/* Summary KPIs */}
      {summary && (
        <div className="row g-3 mb-4">
          <div className="col-sm-6 col-lg-3">
            <div className="card border-0 shadow-sm h-100">
              <div className="card-body py-3">
                <div className="text-muted small">Total Scored</div>
                <div className="fw-bold fs-4" style={{ color: 'var(--color-primary)' }}>{summary.total_scored}</div>
              </div>
            </div>
          </div>
          <div className="col-sm-6 col-lg-3">
            <div className="card border-0 shadow-sm h-100">
              <div className="card-body py-3">
                <div className="text-muted small">Avg Score</div>
                <div className="fw-bold fs-4" style={{ color: 'var(--color-primary)' }}>{summary.avg_score}</div>
              </div>
            </div>
          </div>
          <div className="col-sm-6 col-lg-3">
            <div className="card border-0 shadow-sm h-100">
              <div className="card-body py-3">
                <div className="text-muted small">Pipeline Value</div>
                <div className="fw-bold fs-4" style={{ color: 'var(--color-accent)' }}>{formatCurrency(summary.total_pipeline_value)}</div>
              </div>
            </div>
          </div>
          <div className="col-sm-6 col-lg-3">
            <div className="card border-0 shadow-sm h-100">
              <div className="card-body py-3">
                <div className="text-muted small">At Risk</div>
                <div className="fw-bold fs-4" style={{ color: 'var(--color-secondary)' }}>
                  {(summary.stall_counts.medium || 0) + (summary.stall_counts.high || 0)}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

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
          <div className="card border-0 shadow-sm">
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
                        <td><span className={`badge ${lb.bg}`}>{lb.label}</span></td>
                        <td><span className="small">{PIPELINE_LABELS[row.lead.pipeline_stage] || row.lead.pipeline_stage}</span></td>
                        <td>{sb.label && <span className={`badge ${sb.bg}`}>{sb.label}</span>}</td>
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
          </div>

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
              <div className="card border-0 shadow-sm h-100">
                <div className="card-body py-3">
                  <div className="text-muted small">Projected Enrollments</div>
                  <div className="fw-bold fs-4" style={{ color: 'var(--color-primary)' }}>{forecast.total_projected_enrollments}</div>
                </div>
              </div>
            </div>
            <div className="col-sm-6 col-lg-4">
              <div className="card border-0 shadow-sm h-100">
                <div className="card-body py-3">
                  <div className="text-muted small">Projected Revenue</div>
                  <div className="fw-bold fs-4" style={{ color: 'var(--color-accent)' }}>{formatCurrency(forecast.total_projected_revenue)}</div>
                </div>
              </div>
            </div>
            <div className="col-sm-6 col-lg-4">
              <div className="card border-0 shadow-sm h-100">
                <div className="card-body py-3">
                  <div className="text-muted small">Weighted Pipeline</div>
                  <div className="fw-bold fs-4" style={{ color: 'var(--color-primary)' }}>{formatCurrency(forecast.weighted_pipeline_value)}</div>
                </div>
              </div>
            </div>
          </div>

          {/* Breakdown Table */}
          <div className="card border-0 shadow-sm">
            <div className="card-header bg-white fw-semibold">Forecast by Opportunity Level</div>
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
                        <td><span className={`badge ${lb.bg}`}>{lb.label}</span></td>
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
          </div>
        </div>
      )}

      {/* At Risk Tab */}
      {tab === 'at_risk' && (
        <div>
          {loading ? (
            <div className="text-center py-4"><div className="spinner-border spinner-border-sm" role="status"><span className="visually-hidden">Loading...</span></div></div>
          ) : atRiskRows.length === 0 ? (
            <div className="card border-0 shadow-sm">
              <div className="card-body text-center py-4 text-muted">No at-risk opportunities found. Great news!</div>
            </div>
          ) : (
            <div className="row g-3">
              {atRiskRows.sort((a, b) => {
                const riskOrder: Record<string, number> = { high: 0, medium: 1 };
                const diff = (riskOrder[a.stall_risk] ?? 2) - (riskOrder[b.stall_risk] ?? 2);
                return diff !== 0 ? diff : b.score - a.score;
              }).map(row => {
                const lb = LEVEL_BADGES[row.opportunity_level] || LEVEL_BADGES.cold_prospect;
                const sb = STALL_BADGES[row.stall_risk] || STALL_BADGES.none;
                return (
                  <div key={row.id} className="col-lg-6">
                    <div className="card border-0 shadow-sm h-100" style={{ borderLeft: `4px solid ${row.stall_risk === 'high' ? '#dc3545' : '#ffc107'}` }}>
                      <div className="card-body">
                        <div className="d-flex justify-content-between align-items-start mb-2">
                          <div>
                            <Link to={`/admin/leads/${row.lead.id}`} className="fw-bold text-decoration-none">
                              {row.lead.name}
                            </Link>
                            <div className="text-muted small">{row.lead.company} &middot; {PIPELINE_LABELS[row.lead.pipeline_stage] || row.lead.pipeline_stage}</div>
                          </div>
                          <div className="text-end">
                            <span className={`badge ${lb.bg} me-1`}>{row.score}</span>
                            <span className={`badge ${sb.bg}`}>{sb.label} Risk</span>
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
                                <span className={`badge ${a.priority === 'critical' ? 'bg-danger' : a.priority === 'high' ? 'bg-warning text-dark' : 'bg-info'}`} style={{ fontSize: '0.65rem' }}>
                                  {a.priority}
                                </span>
                                <span className="small">{a.action}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
