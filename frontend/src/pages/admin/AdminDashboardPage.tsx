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

interface LeadStats {
  total: number;
  byStatus: Record<string, number>;
  conversionRate: string;
  highIntent: number;
  thisMonth: number;
}

interface CampaignActivity {
  emails_sent_today: number;
  emails_sent_week: number;
  sms_sent_today: number;
  sms_sent_week: number;
  voice_calls_today: number;
  voice_calls_week: number;
  open_rate: number;
  click_rate: number;
  bounce_rate: number;
  hot_leads_count: number;
  active_campaigns: number;
}

interface HealthReport {
  overall_status: 'ok' | 'warning' | 'critical';
  checks: Array<{ name: string; severity: string; detail: string }>;
  duration_ms: number;
}

interface SchedulerStatus {
  paused?: boolean;
  pending_count?: number;
}

interface CoryStatus {
  departments?: Array<{ name: string; agent_count: number; healthy: number; errored: number }>;
  total_agents?: number;
  total_errors?: number;
}

interface AdmissionsStats {
  conversations_today?: number;
  conversations_week?: number;
  total_visitors?: number;
}

interface CampaignRow {
  id: string;
  name: string;
  status: string;
  type: string;
  stats?: { total_leads?: number; sent?: number; open_rate?: number };
}

interface AppointmentRow {
  id: string;
  title: string;
  description?: string;
  scheduled_at: string;
  duration_minutes?: number;
  type: string;
  status: string;
  outcome_notes?: string;
  lead: { id: number; name: string; email?: string; company: string } | null;
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

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

function AdminDashboardPage() {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [cohorts, setCohorts] = useState<CohortSummary[]>([]);
  const [oppSummary, setOppSummary] = useState<OpportunitySummary | null>(null);
  const [forecast, setForecast] = useState<Forecast | null>(null);
  const [leadStats, setLeadStats] = useState<LeadStats | null>(null);
  const [pipelineStats, setPipelineStats] = useState<Record<string, number>>({});
  const [campaignActivity, setCampaignActivity] = useState<CampaignActivity | null>(null);
  const [healthReport, setHealthReport] = useState<HealthReport | null>(null);
  const [schedulerStatus, setSchedulerStatus] = useState<SchedulerStatus | null>(null);
  const [coryStatus, setCoryStatus] = useState<CoryStatus | null>(null);
  const [admissionsStats, setAdmissionsStats] = useState<AdmissionsStats | null>(null);
  const [campaigns, setCampaigns] = useState<CampaignRow[]>([]);
  const [appointments, setAppointments] = useState<AppointmentRow[]>([]);
  const [expandedAppt, setExpandedAppt] = useState<string | null>(null);

  useEffect(() => {
    Promise.allSettled([
      api.get('/api/admin/stats'),                                                    // 0
      api.get('/api/admin/cohorts'),                                                  // 1
      api.get('/api/admin/opportunities/summary'),                                    // 2
      api.get('/api/admin/opportunities/forecast'),                                   // 3
      api.get('/api/admin/leads/stats'),                                              // 4
      api.get('/api/admin/pipeline/stats'),                                           // 5
      api.get('/api/admin/dashboard/campaign-activity'),                              // 6
      api.get('/health/full'),                                                        // 7
      api.get('/api/admin/scheduler/status'),                                         // 8
      api.get('/api/admin/intelligence/cory/status'),                                 // 9
      api.get('/api/admin/admissions/stats'),                                         // 10
      api.get('/api/admin/campaigns', { params: { limit: 5, status: 'active' } }),    // 11
      api.get('/api/admin/appointments/upcoming', { params: { days: 7 } }),           // 12
    ]).then(([sR, cR, osR, fR, lsR, psR, caR, hrR, scR, coR, adR, cpR, apR]) => {
      const s = settled(sR); if (s) setStats(s.data.stats);
      const c = settled(cR); if (c) setCohorts(c.data.cohorts);
      const os = settled(osR); if (os) setOppSummary(os.data);
      const f = settled(fR); if (f) setForecast(f.data);
      const ls = settled(lsR); if (ls) setLeadStats(ls.data.stats);
      const ps = settled(psR); if (ps) setPipelineStats(ps.data.stats || {});
      const ca = settled(caR); if (ca) setCampaignActivity(ca.data);
      const hr = settled(hrR); if (hr) setHealthReport(hr.data);
      const sc = settled(scR); if (sc) setSchedulerStatus(sc.data);
      const co = settled(coR); if (co) setCoryStatus(co.data);
      const ad = settled(adR); if (ad) setAdmissionsStats(ad.data);
      const cp = settled(cpR); if (cp) setCampaigns(Array.isArray(cp.data) ? cp.data : cp.data?.rows || []);
      const ap = settled(apR); if (ap) setAppointments(ap.data.appointments || []);
    }).finally(() => setLoading(false));
  }, []);

  /* ---------- formatters ---------- */

  const fmtCurrency = (n: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(n);

  const fmtDate = (s: string) =>
    new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  const fmtDateTime = (s: string) => {
    const d = new Date(s);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' ' +
      d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  };

  const statusBadge = (status: string) => {
    const colors: Record<string, string> = { open: 'bg-success', closed: 'bg-danger', completed: 'bg-secondary', active: 'bg-success', paused: 'bg-warning text-dark', draft: 'bg-secondary' };
    return <span className={`badge rounded-pill ${colors[status] || 'bg-secondary'}`}>{status}</span>;
  };

  /* ---------- KPI card ---------- */

  const kpiLink = (to: string, label: string, value: string | number, color: string, sub?: React.ReactNode) => (
    <div className="col-sm-6 col-lg-2">
      <Link to={to} className="text-decoration-none">
        <div className="card border-0 shadow-sm h-100" style={{ borderLeft: `4px solid ${color}` }}>
          <div className="card-body p-3">
            <div className="text-muted small">{label}</div>
            <div className="h4 fw-bold mb-0" style={{ color }}>{value}</div>
            {sub && <div className="text-muted small mt-1">{sub}</div>}
          </div>
        </div>
      </Link>
    </div>
  );

  /* ---------- status card ---------- */

  const statusCard = (label: string, status: 'ok' | 'warning' | 'critical' | 'unknown', detail: string, to: string) => {
    const dotColor = status === 'ok' ? '#38a169' : status === 'warning' ? '#dd6b20' : status === 'critical' ? '#e53e3e' : '#a0aec0';
    return (
      <div className="col-sm-6 col-lg-3">
        <Link to={to} className="text-decoration-none">
          <div className="card border-0 shadow-sm h-100">
            <div className="card-body p-3 d-flex align-items-center">
              <div className="rounded-circle me-3 flex-shrink-0" style={{ width: 12, height: 12, background: dotColor }} />
              <div>
                <div className="text-muted small">{label}</div>
                <div className="fw-semibold" style={{ color: 'var(--color-text)' }}>{detail}</div>
              </div>
            </div>
          </div>
        </Link>
      </div>
    );
  };

  /* ---------- section header ---------- */

  const sectionHeader = (title: string, to?: string) => (
    <div className="d-flex justify-content-between align-items-center mb-3">
      <h2 className="h5 fw-bold mb-0" style={{ color: 'var(--color-primary)' }}>{title}</h2>
      {to && <Link to={to} className="btn btn-sm btn-outline-secondary">View All</Link>}
    </div>
  );

  const APPT_TYPE_LABELS: Record<string, string> = {
    strategy_call: 'Strategy Call', demo: 'Demo', follow_up: 'Follow Up', enrollment_close: 'Enrollment Close',
  };

  const handleApptStatus = async (apptId: string, newStatus: string) => {
    try {
      await api.patch(`/api/admin/appointments/${apptId}`, { status: newStatus });
      setAppointments(prev => prev.map(a => a.id === apptId ? { ...a, status: newStatus } : a));
    } catch (err) {
      console.error('Failed to update appointment:', err);
    }
  };

  /* ---------- skeleton ---------- */

  if (loading) {
    return (
      <>
        <h1 className="h3 fw-bold mb-4" style={{ color: 'var(--color-primary)' }}>Dashboard</h1>
        {[0, 1].map(row => (
          <div key={row} className="row g-3 mb-3">
            {[1, 2, 3, 4, 5, 6].map(i => (
              <div key={i} className="col-sm-6 col-lg-2">
                <div className="card border-0 shadow-sm">
                  <div className="card-body p-3">
                    <div className="placeholder-glow">
                      <span className="placeholder col-8 mb-2" style={{ height: 12 }} />
                      <span className="placeholder col-5" style={{ height: 24 }} />
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ))}
        <div className="row g-3 mb-4">
          <div className="col-lg-7"><div className="card border-0 shadow-sm"><div className="card-body"><div className="placeholder-glow"><span className="placeholder w-100" style={{ height: 200 }} /></div></div></div></div>
          <div className="col-lg-5"><div className="card border-0 shadow-sm"><div className="card-body"><div className="placeholder-glow"><span className="placeholder w-100" style={{ height: 200 }} /></div></div></div></div>
        </div>
      </>
    );
  }

  const totalPipeline = Object.values(pipelineStats).reduce((a, b) => a + b, 0) || 1;

  // Health check summary
  const healthOk = healthReport?.checks?.filter(c => c.severity === 'ok').length ?? 0;
  const healthTotal = healthReport?.checks?.length ?? 0;
  const healthStatus = healthReport?.overall_status ?? 'unknown';

  // Scheduler status
  const schedulerRunning = schedulerStatus && !schedulerStatus.paused;
  const schedulerDetail = schedulerRunning ? 'Running' : schedulerStatus ? 'Paused' : 'Unknown';
  const schedulerSev = schedulerRunning ? 'ok' : schedulerStatus?.paused ? 'critical' : 'unknown';

  // Cory agent fleet
  const totalAgents = coryStatus?.total_agents ?? coryStatus?.departments?.reduce((a, d) => a + d.agent_count, 0) ?? 0;
  const totalErrors = coryStatus?.total_errors ?? coryStatus?.departments?.reduce((a, d) => a + d.errored, 0) ?? 0;
  const agentSev = totalErrors > 5 ? 'critical' : totalErrors > 0 ? 'warning' : totalAgents > 0 ? 'ok' : 'unknown';

  // Maya chats
  const chatsToday = admissionsStats?.conversations_today ?? 0;

  return (
    <>
      <h1 className="h3 fw-bold mb-4" style={{ color: 'var(--color-primary)' }}>Dashboard</h1>

      {/* ============================================================ */}
      {/* ROW 1: Executive KPIs                                        */}
      {/* ============================================================ */}
      <div className="row g-3 mb-3">
        {kpiLink('/admin/pipeline', 'Pipeline Value', oppSummary ? fmtCurrency(oppSummary.total_pipeline_value) : '--', '#1a365d')}
        {kpiLink('/admin/opportunities', 'Weighted Forecast', forecast ? fmtCurrency(forecast.weighted_pipeline_value) : '--', '#2b6cb0',
          forecast ? `${forecast.total_projected_enrollments.toFixed(1)} proj. enrollments` : undefined
        )}
        {kpiLink('/admin/leads', 'Total Leads', leadStats?.total ?? '--', '#0dcaf0',
          leadStats ? `${leadStats.thisMonth} this month` : undefined
        )}
        {kpiLink('/admin/leads', 'Conversion', leadStats ? `${leadStats.conversionRate}%` : '--', '#e53e3e',
          leadStats ? `${leadStats.highIntent} high-intent` : undefined
        )}
        {kpiLink('/admin/accelerator', 'Enrollments', stats?.totalEnrollments ?? '--', '#3182ce',
          stats && stats.pendingInvoice > 0 ? `${stats.pendingInvoice} pending` : undefined
        )}
        {kpiLink('/admin/revenue', 'Revenue', stats ? fmtCurrency(stats.totalRevenue) : '--', '#38a169')}
      </div>

      {/* ============================================================ */}
      {/* ROW 2: Campaign Activity                                     */}
      {/* ============================================================ */}
      <div className="row g-3 mb-3">
        {kpiLink('/admin/communications?channel=email', 'Emails Sent', campaignActivity?.emails_sent_today ?? '--', '#2b6cb0',
          campaignActivity ? `${campaignActivity.emails_sent_week} this week` : undefined
        )}
        {kpiLink('/admin/communications?channel=sms', 'SMS Sent', campaignActivity?.sms_sent_today ?? '--', '#6f42c1',
          campaignActivity ? `${campaignActivity.sms_sent_week} this week` : undefined
        )}
        {kpiLink('/admin/communications?channel=voice', 'Voice Calls', campaignActivity?.voice_calls_today ?? '--', '#805ad5',
          campaignActivity ? `${campaignActivity.voice_calls_week} this week` : undefined
        )}
        {kpiLink('/admin/campaigns', 'Open Rate', campaignActivity ? `${campaignActivity.open_rate}%` : '--', '#38a169',
          campaignActivity ? `${campaignActivity.active_campaigns} active campaigns` : undefined
        )}
        {kpiLink('/admin/campaigns', 'Click Rate', campaignActivity ? `${campaignActivity.click_rate}%` : '--', '#0dcaf0')}
        {kpiLink('/admin/leads?temperature=hot', 'Hot Leads', campaignActivity?.hot_leads_count ?? '--', '#e53e3e',
          'Engaged 2+ times'
        )}
      </div>

      {/* ============================================================ */}
      {/* ROW 3: System Status                                         */}
      {/* ============================================================ */}
      <div className="row g-3 mb-4">
        {statusCard('Scheduler', schedulerSev as any, schedulerDetail, '/admin/settings')}
        {statusCard('Health Checks', healthStatus as any,
          healthReport ? `${healthOk}/${healthTotal} passing` : 'Loading...',
          '/admin/intelligence'
        )}
        {statusCard('Agent Fleet', agentSev as any,
          totalAgents > 0 ? `${totalAgents} agents${totalErrors > 0 ? `, ${totalErrors} errors` : ''}` : 'Unavailable',
          '/admin/intelligence'
        )}
        {statusCard('Maya Chats', chatsToday > 0 ? 'ok' : 'unknown' as any,
          chatsToday > 0 ? `${chatsToday} today` : 'No chats today',
          '/admin/visitors'
        )}
      </div>

      {/* ============================================================ */}
      {/* SECTION: Pipeline + Top Campaigns                            */}
      {/* ============================================================ */}
      <div className="row g-4 mb-4">
        {/* Pipeline at a Glance */}
        <div className="col-lg-7">
          <div className="card border-0 shadow-sm h-100">
            <div className="card-header bg-white fw-semibold d-flex justify-content-between align-items-center">
              Pipeline at a Glance
              <Link to="/admin/pipeline" className="btn btn-sm btn-outline-secondary">View Pipeline</Link>
            </div>
            <div className="card-body">
              {Object.entries(PIPELINE_STAGES).map(([key, { label, color }]) => {
                const count = pipelineStats[key] || 0;
                const pct = (count / totalPipeline) * 100;
                return (
                  <div key={key} className="d-flex align-items-center mb-2">
                    <span className="small text-muted" style={{ width: 90 }}>{label}</span>
                    <div className="flex-grow-1 mx-2" style={{ height: 20, background: '#f1f3f5', borderRadius: 4 }}>
                      <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 4, transition: 'width 0.4s' }} />
                    </div>
                    <span className="small fw-semibold" style={{ width: 40, textAlign: 'right' }}>{count}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Top Active Campaigns */}
        <div className="col-lg-5">
          <div className="card border-0 shadow-sm h-100">
            <div className="card-header bg-white fw-semibold d-flex justify-content-between align-items-center">
              Active Campaigns
              <Link to="/admin/campaigns" className="btn btn-sm btn-outline-secondary">View All</Link>
            </div>
            <div className="card-body p-0">
              <div className="table-responsive">
                <table className="table table-hover mb-0">
                  <thead className="table-light">
                    <tr>
                      <th className="small fw-medium">Campaign</th>
                      <th className="small fw-medium text-end">Leads</th>
                      <th className="small fw-medium text-end">Sent</th>
                      <th className="small fw-medium text-end">Open %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {campaigns.length === 0 ? (
                      <tr><td colSpan={4} className="text-center text-muted small py-3">No active campaigns</td></tr>
                    ) : campaigns.slice(0, 5).map(c => (
                      <tr key={c.id}>
                        <td className="small">
                          <Link to={`/admin/campaigns/${c.id}`} className="text-decoration-none">
                            {c.name.length > 30 ? c.name.substring(0, 28) + '...' : c.name}
                          </Link>
                        </td>
                        <td className="small text-end">{c.stats?.total_leads ?? '--'}</td>
                        <td className="small text-end">{c.stats?.sent ?? '--'}</td>
                        <td className="small text-end">{c.stats?.open_rate != null ? `${c.stats.open_rate}%` : '--'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ============================================================ */}
      {/* SECTION: Appointments + Cohorts                              */}
      {/* ============================================================ */}
      <div className="row g-4">
        {/* Upcoming Appointments */}
        <div className="col-lg-6">
          <div className="card border-0 shadow-sm h-100">
            <div className="card-header bg-white fw-semibold">Upcoming Appointments</div>
            <div className="card-body p-0">
              {appointments.length === 0 ? (
                <div className="text-center text-muted small py-4">No upcoming appointments</div>
              ) : (
                <ul className="list-group list-group-flush">
                  {appointments.slice(0, 5).map(a => {
                    const isExpanded = expandedAppt === a.id;
                    return (
                      <li key={a.id} className="list-group-item p-0">
                        <div
                          className="d-flex justify-content-between align-items-center px-3 py-2"
                          style={{ cursor: 'pointer' }}
                          onClick={() => setExpandedAppt(isExpanded ? null : a.id)}
                        >
                          <div>
                            <div className="small fw-medium">
                              {a.lead ? (
                                <Link
                                  to={`/admin/leads/${a.lead.id}`}
                                  className="text-decoration-none"
                                  onClick={e => e.stopPropagation()}
                                >
                                  {a.lead.name}
                                </Link>
                              ) : a.title}
                            </div>
                            <div className="small text-muted">
                              {a.lead?.company ? `${a.lead.company} · ` : ''}
                              {APPT_TYPE_LABELS[a.type] || a.type}
                            </div>
                          </div>
                          <div className="d-flex align-items-center gap-2">
                            <span className="badge bg-info">{fmtDateTime(a.scheduled_at)}</span>
                            <i className={`bi bi-chevron-${isExpanded ? 'up' : 'down'} small text-muted`} />
                          </div>
                        </div>

                        {isExpanded && (
                          <div className="px-3 pb-3 border-top" style={{ background: 'var(--color-bg-alt)' }}>
                            <div className="row g-2 mt-1">
                              <div className="col-sm-6">
                                <div className="text-muted small">Title</div>
                                <div className="small fw-medium">{a.title}</div>
                              </div>
                              <div className="col-sm-3">
                                <div className="text-muted small">Duration</div>
                                <div className="small fw-medium">{a.duration_minutes || 30} min</div>
                              </div>
                              <div className="col-sm-3">
                                <div className="text-muted small">Status</div>
                                <span className={`badge ${a.status === 'scheduled' ? 'bg-primary' : a.status === 'completed' ? 'bg-success' : a.status === 'no_show' ? 'bg-danger' : 'bg-secondary'}`}>
                                  {a.status}
                                </span>
                              </div>
                            </div>

                            {a.lead && (
                              <div className="mt-2">
                                <div className="text-muted small">Lead</div>
                                <div className="small">
                                  <Link to={`/admin/leads/${a.lead.id}`} className="text-decoration-none fw-medium">
                                    {a.lead.name}
                                  </Link>
                                  {a.lead.email && <span className="text-muted ms-2">{a.lead.email}</span>}
                                  {a.lead.company && <span className="text-muted ms-2">· {a.lead.company}</span>}
                                </div>
                              </div>
                            )}

                            {a.description && (
                              <div className="mt-2">
                                <div className="text-muted small">Description</div>
                                <div className="small">{a.description}</div>
                              </div>
                            )}

                            {a.outcome_notes && (
                              <div className="mt-2">
                                <div className="text-muted small">Outcome Notes</div>
                                <div className="small">{a.outcome_notes}</div>
                              </div>
                            )}

                            {a.status === 'scheduled' && (
                              <div className="d-flex gap-2 mt-2">
                                <button className="btn btn-success btn-sm" style={{ fontSize: '0.75rem' }}
                                  onClick={() => handleApptStatus(a.id, 'completed')}>Complete</button>
                                <button className="btn btn-outline-danger btn-sm" style={{ fontSize: '0.75rem' }}
                                  onClick={() => handleApptStatus(a.id, 'no_show')}>No Show</button>
                                <button className="btn btn-outline-secondary btn-sm" style={{ fontSize: '0.75rem' }}
                                  onClick={() => handleApptStatus(a.id, 'cancelled')}>Cancel</button>
                              </div>
                            )}
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        </div>

        {/* Cohorts */}
        <div className="col-lg-6">
          <div className="card border-0 shadow-sm h-100">
            <div className="card-header bg-white fw-semibold d-flex justify-content-between align-items-center">
              Cohorts
              <Link to="/admin/accelerator" className="btn btn-sm btn-outline-secondary">Manage</Link>
            </div>
            <div className="card-body p-0">
              <div className="table-responsive">
                <table className="table table-hover mb-0">
                  <thead className="table-light">
                    <tr>
                      <th className="small fw-medium">Name</th>
                      <th className="small fw-medium">Start</th>
                      <th className="small fw-medium text-center">Enrolled</th>
                      <th className="small fw-medium text-center">Status</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {cohorts.map(c => (
                      <tr key={c.id}>
                        <td className="small">{c.name}</td>
                        <td className="small">{fmtDate(c.start_date)}</td>
                        <td className="small text-center">{c.seats_taken}/{c.max_seats}</td>
                        <td className="small text-center">{statusBadge(c.status)}</td>
                        <td><Link to={`/admin/cohorts/${c.id}`} className="btn btn-sm btn-outline-secondary">View</Link></td>
                      </tr>
                    ))}
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

export default AdminDashboardPage;
