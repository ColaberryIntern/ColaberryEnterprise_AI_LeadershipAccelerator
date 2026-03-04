import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../../utils/api';

/* ------------------------------------------------------------------ */
/*  Interfaces                                                         */
/* ------------------------------------------------------------------ */

interface DashboardStats {
  totalRevenue: number;
  totalEnrollments: number;
  paidEnrollments: number;
  pendingInvoice: number;
  seatsRemaining: number;
  upcomingCohorts: number;
}

interface CohortSummary {
  id: string;
  name: string;
  start_date: string;
  max_seats: number;
  seats_taken: number;
  status: string;
}

interface OpportunitySummary {
  total_scored: number;
  avg_score: number;
  distribution: Record<string, number>;
  stall_counts: Record<string, number>;
  total_pipeline_value: number;
}

interface Forecast {
  total_projected_enrollments: number;
  total_projected_revenue: number;
  weighted_pipeline_value: number;
}

interface OpportunityRow {
  id: string;
  lead_id: number;
  score: number;
  opportunity_level: string;
  stall_risk: string;
  stall_reason: string | null;
  days_since_last_activity: number;
  recommended_actions: Array<{ action: string; priority: string; reason: string }>;
  lead: { id: number; name: string; email: string; company: string; pipeline_stage: string };
}

interface VisitorStats {
  total_visitors: number;
  total_sessions: number;
  avg_session_duration: number;
  bounce_rate: number;
  visitors_today: number;
  sessions_today: number;
}

interface LeadStats {
  total: number;
  byStatus: Record<string, number>;
  conversionRate: string;
  highIntent: number;
  thisMonth: number;
}

interface HighIntentVisitor {
  id: string;
  score: number;
  intent_level: string;
  visitor: { id: string; fingerprint: string; lead_id: number | null; last_seen_at: string };
}

interface AppointmentRow {
  id: string;
  title: string;
  scheduled_at: string;
  type: string;
  status: string;
  lead: { id: number; name: string; company: string } | null;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function settled<T>(r: PromiseSettledResult<T>): T | null {
  return r.status === 'fulfilled' ? r.value : null;
}

const PIPELINE_STAGES: Record<string, { label: string; color: string }> = {
  new_lead: { label: 'New Lead', color: '#6c757d' },
  contacted: { label: 'Contacted', color: '#0dcaf0' },
  meeting_scheduled: { label: 'Meeting', color: '#0d6efd' },
  proposal_sent: { label: 'Proposal', color: '#6f42c1' },
  negotiation: { label: 'Negotiation', color: '#fd7e14' },
  enrolled: { label: 'Enrolled', color: '#198754' },
  lost: { label: 'Lost', color: '#dc3545' },
};

const LEVEL_BADGES: Record<string, { label: string; cls: string }> = {
  cold_prospect: { label: 'Cold', cls: 'bg-secondary' },
  warming: { label: 'Warming', cls: 'bg-info' },
  qualified: { label: 'Qualified', cls: 'bg-primary' },
  hot_opportunity: { label: 'Hot', cls: 'bg-warning text-dark' },
  ready_to_close: { label: 'Ready', cls: 'bg-success' },
};

const STALL_BADGES: Record<string, { label: string; cls: string }> = {
  none: { label: 'None', cls: 'bg-light text-muted' },
  low: { label: 'Low', cls: 'bg-info' },
  medium: { label: 'Medium', cls: 'bg-warning text-dark' },
  high: { label: 'High', cls: 'bg-danger' },
};

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

function AdminDashboardPage() {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [cohorts, setCohorts] = useState<CohortSummary[]>([]);
  const [oppSummary, setOppSummary] = useState<OpportunitySummary | null>(null);
  const [forecast, setForecast] = useState<Forecast | null>(null);
  const [atRisk, setAtRisk] = useState<OpportunityRow[]>([]);
  const [visitorStats, setVisitorStats] = useState<VisitorStats | null>(null);
  const [leadStats, setLeadStats] = useState<LeadStats | null>(null);
  const [pipelineStats, setPipelineStats] = useState<Record<string, number>>({});
  const [appointments, setAppointments] = useState<AppointmentRow[]>([]);
  const [highIntent, setHighIntent] = useState<HighIntentVisitor[]>([]);

  useEffect(() => {
    Promise.allSettled([
      api.get('/api/admin/stats'),
      api.get('/api/admin/cohorts'),
      api.get('/api/admin/opportunities/summary'),
      api.get('/api/admin/opportunities/forecast'),
      api.get('/api/admin/opportunities', { params: { limit: 5, sort: 'stall_risk', order: 'DESC' } }),
      api.get('/api/admin/visitors/stats'),
      api.get('/api/admin/leads/stats'),
      api.get('/api/admin/pipeline/stats'),
      api.get('/api/admin/appointments/upcoming', { params: { days: 7 } }),
      api.get('/api/admin/visitors/high-intent', { params: { limit: 5 } }),
    ]).then(([sR, cR, osR, fR, arR, vsR, lsR, psR, apR, hiR]) => {
      const s = settled(sR); if (s) setStats(s.data.stats);
      const c = settled(cR); if (c) setCohorts(c.data.cohorts);
      const os = settled(osR); if (os) setOppSummary(os.data);
      const f = settled(fR); if (f) setForecast(f.data);
      const ar = settled(arR); if (ar) setAtRisk(ar.data.rows || []);
      const vs = settled(vsR); if (vs) setVisitorStats(vs.data);
      const ls = settled(lsR); if (ls) setLeadStats(ls.data.stats);
      const ps = settled(psR); if (ps) setPipelineStats(ps.data.stats || {});
      const ap = settled(apR); if (ap) setAppointments(ap.data.appointments || []);
      const hi = settled(hiR); if (hi) setHighIntent(Array.isArray(hi.data) ? hi.data : []);
    }).finally(() => setLoading(false));
  }, []);

  /* ---------- formatters ---------- */

  const fmtCurrency = (n: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(n);

  const fmtDate = (s: string) => {
    const d = new Date(s);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const fmtDateTime = (s: string) => {
    const d = new Date(s);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' ' +
      d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  };

  const fmtDuration = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s2 = Math.round(secs % 60);
    return `${m}m ${s2}s`;
  };

  const statusBadge = (status: string) => {
    const colors: Record<string, string> = { open: 'bg-success', closed: 'bg-danger', completed: 'bg-secondary' };
    return <span className={`badge rounded-pill ${colors[status] || 'bg-secondary'}`}>{status}</span>;
  };

  /* ---------- KPI card helper ---------- */

  const kpi = (label: string, value: string | number, color: string, icon: React.ReactNode, sub?: React.ReactNode) => (
    <div className="col-sm-6 col-lg-3">
      <div className="card admin-kpi-card">
        <div className="card-body p-3 d-flex align-items-center" style={{
          borderLeft: `4px solid ${color}`,
          background: `linear-gradient(135deg, ${hexToRgba(color, 0.04)} 0%, transparent 100%)`,
        }}>
          <div className="admin-kpi-icon me-3" style={{ background: hexToRgba(color, 0.12) }}>{icon}</div>
          <div>
            <div className="text-muted small">{label}</div>
            <div className="h4 fw-bold mb-0" style={{ color }}>{value}</div>
            {sub}
          </div>
        </div>
      </div>
    </div>
  );

  /* ---------- skeleton ---------- */

  if (loading) {
    return (
      <>
        {[0, 1].map(row => (
          <div key={row} className="row g-3 mb-4">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="col-sm-6 col-lg-3">
                <div className="card admin-kpi-card">
                  <div className="card-body p-3 d-flex align-items-center">
                    <div className="skeleton me-3" style={{ width: 48, height: 48, borderRadius: '50%' }} />
                    <div className="flex-grow-1">
                      <div className="skeleton mb-2" style={{ width: '60%', height: 12 }} />
                      <div className="skeleton" style={{ width: '40%', height: 20 }} />
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ))}
        <div className="row g-3 mb-4">
          <div className="col-lg-7"><div className="card admin-table-card"><div className="card-body"><div className="skeleton" style={{ height: 200 }} /></div></div></div>
          <div className="col-lg-5"><div className="card admin-table-card"><div className="card-body"><div className="skeleton" style={{ height: 200 }} /></div></div></div>
        </div>
      </>
    );
  }

  const totalPipeline = Object.values(pipelineStats).reduce((a, b) => a + b, 0) || 1;
  const stallHigh = (oppSummary?.stall_counts?.high || 0) + (oppSummary?.stall_counts?.medium || 0);

  return (
    <>
      <h1 className="h3 fw-bold mb-4" style={{ color: 'var(--color-primary)' }}>Dashboard</h1>

      {/* ============================================================ */}
      {/* SECTION 1: Executive Summary KPIs                            */}
      {/* ============================================================ */}

      {/* Row 1: Revenue & Cohort KPIs */}
      {stats && (
        <div className="row g-3 mb-3">
          {kpi('Total Revenue', fmtCurrency(stats.totalRevenue), '#38a169',
            <svg width="22" height="22" viewBox="0 0 16 16" fill="#38a169"><path d="M4 10.781c.148 1.667 1.513 2.85 3.591 3.003V15h1.043v-1.216c2.27-.179 3.678-1.438 3.678-3.3 0-1.59-.947-2.51-2.956-3.028l-.722-.187V3.467c1.122.11 1.879.714 2.07 1.616h1.47c-.166-1.6-1.54-2.748-3.54-2.875V1H7.591v1.233c-1.939.23-3.27 1.472-3.27 3.156 0 1.454.966 2.483 2.661 2.917l.61.162v4.031c-1.149-.17-1.94-.8-2.131-1.718H4zm3.391-3.836c-1.043-.263-1.6-.825-1.6-1.616 0-.944.704-1.641 1.8-1.828v3.495l-.2-.05zm1.591 1.872c1.287.323 1.852.859 1.852 1.769 0 1.097-.826 1.828-2.2 1.939V8.73l.348.086z" /></svg>
          )}
          {kpi('Enrollments', stats.totalEnrollments, '#3182ce',
            <svg width="22" height="22" viewBox="0 0 16 16" fill="#3182ce"><path d="M15 14s1 0 1-1-1-4-5-4-5 3-5 4 1 1 1 1h8zm-7.978-1A.261.261 0 0 1 7 12.996c.001-.264.167-1.03.76-1.72C8.312 10.629 9.282 10 11 10c1.717 0 2.687.63 3.24 1.276.593.69.758 1.457.76 1.72l-.008.002a.274.274 0 0 1-.014.002H7.022zM11 7a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm3-2a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM6.936 9.28a5.88 5.88 0 0 0-1.23-.247A7.35 7.35 0 0 0 5 9c-4 0-5 3-5 4 0 .667.333 1 1 1h4.216A2.238 2.238 0 0 1 5 13c0-.779.357-1.85 1.084-2.79.243-.314.52-.6.834-.86zM4.92 10A5.493 5.493 0 0 0 4 13H1c0-.26.164-1.03.76-1.724.545-.636 1.492-1.256 3.16-1.275zM1.5 5.5a3 3 0 1 1 6 0 3 3 0 0 1-6 0zm3-2a2 2 0 1 0 0 4 2 2 0 0 0 0-4z" /></svg>,
            stats.pendingInvoice > 0 ? <div className="small text-warning">{stats.pendingInvoice} pending</div> : undefined
          )}
          {kpi('Seats Remaining', stats.seatsRemaining, '#805ad5',
            <svg width="22" height="22" viewBox="0 0 16 16" fill="#805ad5"><path d="M2 2a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V2zm2-1a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V2a1 1 0 0 0-1-1H4z" /><path d="M9.5 4a.5.5 0 0 0-.5.5v7a.5.5 0 0 0 1 0v-7a.5.5 0 0 0-.5-.5zm-2 2a.5.5 0 0 0-.5.5v5a.5.5 0 0 0 1 0v-5a.5.5 0 0 0-.5-.5zm4-1a.5.5 0 0 0-.5.5v6a.5.5 0 0 0 1 0v-6a.5.5 0 0 0-.5-.5z" /></svg>
          )}
          {kpi('Upcoming Cohorts', stats.upcomingCohorts, '#dd6b20',
            <svg width="22" height="22" viewBox="0 0 16 16" fill="#dd6b20"><path d="M3.5 0a.5.5 0 0 1 .5.5V1h8V.5a.5.5 0 0 1 1 0V1h1a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2V3a2 2 0 0 1 2-2h1V.5a.5.5 0 0 1 .5-.5zM2 2a1 1 0 0 0-1 1v1h14V3a1 1 0 0 0-1-1H2zm13 3H1v9a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V5z" /></svg>
          )}
        </div>
      )}

      {/* Row 2: Pipeline & Lead KPIs */}
      <div className="row g-3 mb-4">
        {kpi('Pipeline Value', oppSummary ? fmtCurrency(oppSummary.total_pipeline_value) : '--', '#1a365d',
          <svg width="22" height="22" viewBox="0 0 16 16" fill="#1a365d"><path d="M0 2a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2V2zm15 2h-1v9a1 1 0 0 1-1 1H3v1a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V4zM2 1a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V2a1 1 0 0 0-1-1H2z" /><path d="M3 4h8v1H3V4zm0 2h5v1H3V6zm0 2h8v1H3V8z" /></svg>
        )}
        {kpi('Weighted Forecast', forecast ? fmtCurrency(forecast.weighted_pipeline_value) : '--', '#2b6cb0',
          <svg width="22" height="22" viewBox="0 0 16 16" fill="#2b6cb0"><path fillRule="evenodd" d="M0 0h1v15h15v1H0V0zm14.817 3.113a.5.5 0 0 1 .07.704l-4.5 5.5a.5.5 0 0 1-.74.037L7.06 6.767l-3.656 5.027a.5.5 0 0 1-.808-.588l4-5.5a.5.5 0 0 1 .758-.06l2.609 2.61 4.15-5.073a.5.5 0 0 1 .704-.07z" /></svg>,
          forecast ? <div className="small text-muted">{forecast.total_projected_enrollments.toFixed(1)} proj. enrollments</div> : undefined
        )}
        {kpi('Total Leads', leadStats?.total ?? '--', '#0dcaf0',
          <svg width="22" height="22" viewBox="0 0 16 16" fill="#0dcaf0"><path d="M8 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm2-3a2 2 0 1 1-4 0 2 2 0 0 1 4 0zm4 8c0 1-1 1-1 1H3s-1 0-1-1 1-4 6-4 6 3 6 4zm-1-.004c-.001-.246-.154-.986-.832-1.664C11.516 10.68 10.289 10 8 10c-2.29 0-3.516.68-4.168 1.332-.678.678-.83 1.418-.832 1.664h10z" /></svg>,
          leadStats ? <div className="small text-muted">{leadStats.thisMonth} this month</div> : undefined
        )}
        {kpi('Conversion', leadStats ? `${leadStats.conversionRate}%` : '--', '#e53e3e',
          <svg width="22" height="22" viewBox="0 0 16 16" fill="#e53e3e"><path fillRule="evenodd" d="M1 8a7 7 0 1 0 14 0A7 7 0 0 0 1 8zm15 0A8 8 0 1 1 0 8a8 8 0 0 1 16 0zM4.5 7.5a.5.5 0 0 0 0 1h5.793l-2.147 2.146a.5.5 0 0 0 .708.708l3-3a.5.5 0 0 0 0-.708l-3-3a.5.5 0 1 0-.708.708L10.293 7.5H4.5z" /></svg>,
          leadStats ? <div className="small text-muted">{leadStats.highIntent} high-intent</div> : undefined
        )}
      </div>

      {/* ============================================================ */}
      {/* SECTION 2: Pipeline & Opportunities                          */}
      {/* ============================================================ */}

      <div className="row g-3 mb-4">
        {/* Pipeline at a Glance */}
        <div className="col-lg-7">
          <div className="card admin-table-card h-100">
            <div className="card-header fw-bold py-3 d-flex justify-content-between align-items-center">
              Pipeline at a Glance
              <Link to="/admin/pipeline" className="btn btn-outline-primary btn-sm">View Pipeline</Link>
            </div>
            <div className="card-body">
              {Object.keys(pipelineStats).length === 0 ? (
                <div className="text-muted small text-center py-3">Data unavailable</div>
              ) : (
                Object.entries(PIPELINE_STAGES).map(([stage, { label, color }]) => {
                  const count = pipelineStats[stage] || 0;
                  const pct = Math.max((count / totalPipeline) * 100, count > 0 ? 4 : 0);
                  return (
                    <div key={stage} className="d-flex align-items-center mb-2">
                      <div style={{ width: 100, fontSize: 13, color: '#4a5568' }}>{label}</div>
                      <div className="flex-grow-1 mx-2">
                        <div style={{ height: 20, background: '#f1f5f9', borderRadius: 4, overflow: 'hidden' }}>
                          <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 4, transition: 'width 0.4s ease' }} />
                        </div>
                      </div>
                      <div style={{ width: 32, textAlign: 'right', fontWeight: 600, fontSize: 14 }}>{count}</div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* At-Risk Opportunities */}
        <div className="col-lg-5">
          <div className="card admin-table-card h-100">
            <div className="card-header fw-bold py-3 d-flex justify-content-between align-items-center">
              At-Risk Opportunities
              <Link to="/admin/opportunities" className="btn btn-outline-primary btn-sm">View All</Link>
            </div>
            <div className="card-body p-0">
              {stallHigh === 0 && atRisk.length === 0 ? (
                <div className="text-muted small text-center py-4">No at-risk opportunities</div>
              ) : (
                <div className="table-responsive">
                  <table className="table table-hover mb-0 small">
                    <thead className="table-light">
                      <tr>
                        <th>Lead</th>
                        <th>Score</th>
                        <th>Risk</th>
                        <th>Idle</th>
                      </tr>
                    </thead>
                    <tbody>
                      {atRisk.filter(o => o.stall_risk !== 'none').slice(0, 5).map(o => (
                        <tr key={o.id}>
                          <td>
                            <Link to={`/admin/leads/${o.lead_id}`} className="text-decoration-none fw-medium">
                              {o.lead?.name || 'Unknown'}
                            </Link>
                            {o.lead?.company && <div className="text-muted" style={{ fontSize: 11 }}>{o.lead.company}</div>}
                          </td>
                          <td><span className={`badge ${LEVEL_BADGES[o.opportunity_level]?.cls || 'bg-secondary'}`}>{o.score}</span></td>
                          <td><span className={`badge ${STALL_BADGES[o.stall_risk]?.cls || 'bg-secondary'}`}>{STALL_BADGES[o.stall_risk]?.label || o.stall_risk}</span></td>
                          <td className="text-muted">{o.days_since_last_activity}d</td>
                        </tr>
                      ))}
                      {atRisk.filter(o => o.stall_risk !== 'none').length === 0 && (
                        <tr><td colSpan={4} className="text-center text-muted py-3">No stalled opportunities</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ============================================================ */}
      {/* SECTION 3: Website Intelligence                              */}
      {/* ============================================================ */}

      <h2 className="h5 fw-bold mb-3" style={{ color: 'var(--color-primary)' }}>Website Intelligence</h2>

      {visitorStats ? (
        <div className="row g-3 mb-3">
          {kpi('Visitors Today', visitorStats.visitors_today, '#0dcaf0',
            <svg width="22" height="22" viewBox="0 0 16 16" fill="#0dcaf0"><path d="M8 16A8 8 0 1 0 8 0a8 8 0 0 0 0 16zM7 6.5C7 7.328 6.552 8 6 8s-1-.672-1-1.5S5.448 5 6 5s1 .672 1 1.5zM4.285 9.567a.5.5 0 0 1 .683.183A3.498 3.498 0 0 0 8 11.5a3.498 3.498 0 0 0 3.032-1.75.5.5 0 1 1 .866.5A4.498 4.498 0 0 1 8 12.5a4.498 4.498 0 0 1-3.898-2.25.5.5 0 0 1 .183-.683zM10 8c-.552 0-1-.672-1-1.5S9.448 5 10 5s1 .672 1 1.5S10.552 8 10 8z" /></svg>
          )}
          {kpi('Sessions Today', visitorStats.sessions_today, '#3182ce',
            <svg width="22" height="22" viewBox="0 0 16 16" fill="#3182ce"><path d="M5.854 4.854a.5.5 0 1 0-.708-.708l-3.5 3.5a.5.5 0 0 0 0 .708l3.5 3.5a.5.5 0 0 0 .708-.708L2.707 8l3.147-3.146zm4.292 0a.5.5 0 0 1 .708-.708l3.5 3.5a.5.5 0 0 1 0 .708l-3.5 3.5a.5.5 0 0 1-.708-.708L13.293 8l-3.147-3.146z" /></svg>
          )}
          {kpi('Avg Duration', fmtDuration(visitorStats.avg_session_duration), '#805ad5',
            <svg width="22" height="22" viewBox="0 0 16 16" fill="#805ad5"><path d="M8 3.5a.5.5 0 0 0-1 0V9a.5.5 0 0 0 .252.434l3.5 2a.5.5 0 0 0 .496-.868L8 8.71V3.5z" /><path d="M8 16A8 8 0 1 0 8 0a8 8 0 0 0 0 16zm7-8A7 7 0 1 1 1 8a7 7 0 0 1 14 0z" /></svg>
          )}
          {kpi('Bounce Rate', `${visitorStats.bounce_rate.toFixed(1)}%`, '#dd6b20',
            <svg width="22" height="22" viewBox="0 0 16 16" fill="#dd6b20"><path fillRule="evenodd" d="M1.553 6.776a.5.5 0 0 1 .67-.223L8 9.44l5.776-2.888a.5.5 0 1 1 .448.894l-6 3a.5.5 0 0 1-.448 0l-6-3a.5.5 0 0 1-.223-.67z" /><path d="M8 1a2.5 2.5 0 0 1 2.45 2H14a.5.5 0 0 1 0 1h-3.55A2.5 2.5 0 1 1 8 1zm0 1a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3z" /></svg>
          )}
        </div>
      ) : (
        <div className="text-muted small mb-3">Visitor data unavailable</div>
      )}

      {/* High-Intent Visitors */}
      {highIntent.length > 0 && (
        <div className="card admin-table-card mb-4">
          <div className="card-header fw-bold py-3 d-flex justify-content-between align-items-center">
            High-Intent Visitors
            <Link to="/admin/visitors" className="btn btn-outline-primary btn-sm">View All Visitors</Link>
          </div>
          <div className="card-body p-0">
            <div className="table-responsive">
              <table className="table table-hover mb-0 small">
                <thead className="table-light">
                  <tr>
                    <th>Visitor</th>
                    <th>Intent Score</th>
                    <th>Level</th>
                    <th>Last Seen</th>
                  </tr>
                </thead>
                <tbody>
                  {highIntent.slice(0, 5).map(v => (
                    <tr key={v.id}>
                      <td>
                        <Link to={`/admin/visitors/${v.visitor?.id}`} className="text-decoration-none">
                          {v.visitor?.fingerprint?.substring(0, 12) || 'Unknown'}...
                        </Link>
                      </td>
                      <td><span className="badge bg-danger">{v.score}</span></td>
                      <td><span className="text-muted small">{v.intent_level}</span></td>
                      <td className="text-muted">{v.visitor?.last_seen_at ? fmtDateTime(v.visitor.last_seen_at) : '--'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* SECTION 4: Appointments & Cohorts                            */}
      {/* ============================================================ */}

      <div className="row g-3 mb-4">
        {/* Upcoming Appointments */}
        <div className="col-lg-6">
          <div className="card admin-table-card h-100">
            <div className="card-header fw-bold py-3 d-flex justify-content-between align-items-center">
              Upcoming Appointments
              <span className="badge bg-primary rounded-pill">{appointments.length}</span>
            </div>
            <div className="card-body p-0">
              {appointments.length === 0 ? (
                <div className="text-muted small text-center py-4">No upcoming appointments</div>
              ) : (
                <div className="list-group list-group-flush">
                  {appointments.slice(0, 5).map(a => (
                    <div key={a.id} className="list-group-item px-3 py-2">
                      <div className="d-flex justify-content-between align-items-start">
                        <div>
                          <div className="fw-medium small">{a.title}</div>
                          {a.lead && (
                            <Link to={`/admin/leads/${a.lead.id}`} className="text-decoration-none small">
                              {a.lead.name}{a.lead.company ? ` — ${a.lead.company}` : ''}
                            </Link>
                          )}
                        </div>
                        <div className="text-end">
                          <div className="small text-muted">{fmtDateTime(a.scheduled_at)}</div>
                          <span className="badge bg-info text-dark" style={{ fontSize: 10 }}>{a.type}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Cohorts Table */}
        <div className="col-lg-6">
          <div className="card admin-table-card h-100">
            <div className="card-header fw-bold py-3">Cohorts</div>
            <div className="card-body p-0">
              <div className="table-responsive">
                <table className="table table-hover mb-0 small">
                  <thead className="table-light">
                    <tr>
                      <th>Name</th>
                      <th>Start</th>
                      <th>Enrolled</th>
                      <th>Status</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {cohorts.length === 0 ? (
                      <tr><td colSpan={5} className="text-center text-muted py-3">No cohorts yet</td></tr>
                    ) : (
                      cohorts.map(c => (
                        <tr key={c.id}>
                          <td className="fw-medium">{c.name}</td>
                          <td>{fmtDate(c.start_date)}</td>
                          <td>{c.seats_taken}/{c.max_seats}</td>
                          <td>{statusBadge(c.status)}</td>
                          <td><Link to={`/admin/cohorts/${c.id}`} className="btn btn-outline-primary btn-sm py-0 px-2">View</Link></td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Utility                                                            */
/* ------------------------------------------------------------------ */

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

export default AdminDashboardPage;
