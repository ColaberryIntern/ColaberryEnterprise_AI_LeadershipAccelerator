import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import api from '../../utils/api';
import { PageHeader, StatCard, StatusBadge, SectionCard } from '../../components/admin/shell';
import { TrustSignal } from '../../components/admin/shell/trust';

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
  active_leads: number;
  channels: { email: number; sms: number; voice: number };
  open_rate: number;
  click_rate: number;
  replies: number;
  bounces: number;
  meetings_booked: number;
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
  new_lead: { label: 'New Lead', color: 'var(--chart-8)' },
  contacted: { label: 'Contacted', color: 'var(--chart-1)' },
  meeting_scheduled: { label: 'Meeting', color: 'var(--chart-6)' },
  proposal_sent: { label: 'Proposal', color: 'var(--chart-5)' },
  negotiation: { label: 'Negotiation', color: 'var(--chart-4)' },
  enrolled: { label: 'Enrolled', color: 'var(--chart-3)' },
  lost: { label: 'Lost', color: 'var(--chart-2)' },
};

type BadgeTone = 'success' | 'danger' | 'warning' | 'info' | 'neutral' | 'primary';

const COHORT_STATUS_TONE: Record<string, BadgeTone> = {
  open: 'success',
  active: 'success',
  closed: 'danger',
  completed: 'neutral',
  paused: 'warning',
  draft: 'neutral',
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
      api.get('/api/admin/dashboard/campaign-performance'),                            // 11
      api.get('/api/admin/appointments/upcoming', { params: { days: 30 } }),          // 12
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
      const cp = settled(cpR); if (cp) setCampaigns(cp.data?.campaigns || []);
      const ap = settled(apR); if (ap) setAppointments(ap.data.appointments || []);
    }).finally(() => setLoading(false));
  }, []);

  /* ---------- per-page trust signal ---------- */

  const trust: TrustSignal = useMemo(() => ({
    level: 'live',
    source: 'dashboard aggregate',
    updatedAt: new Date().toISOString(),
    summary: 'Live KPIs from leads, campaigns, and scheduler.',
    href: '/admin/trust',
    pillars: [
      { name: 'Freshness', status: 'live', evidence: [{ label: 'Window', value: 'real-time' }] },
      { name: 'Sources', status: 'live', evidence: [{ label: 'Feeds', value: 'leads · campaigns · scheduler · health' }] },
    ],
  }), []);

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

  /* ---------- status card (system status tile) ---------- */

  const statusCard = (label: string, status: 'ok' | 'warning' | 'critical' | 'unknown', detail: string, to: string) => {
    const dotColor =
      status === 'ok' ? 'var(--status-success)'
        : status === 'warning' ? 'var(--status-warning)'
          : status === 'critical' ? 'var(--status-danger)'
            : 'var(--text-muted)';
    return (
      <div className="col-sm-6 col-lg-3">
        <Link to={to} className="text-decoration-none">
          <SectionCard className="h-100">
            <div className="d-flex align-items-center">
              <div className="rounded-circle me-3 flex-shrink-0" style={{ width: 12, height: 12, background: dotColor }} />
              <div>
                <div className="text-muted small">{label}</div>
                <div className="fw-semibold" style={{ color: 'var(--text-strong)' }}>{detail}</div>
              </div>
            </div>
          </SectionCard>
        </Link>
      </div>
    );
  };

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
        <PageHeader
          title="Dashboard"
          icon="dashboard-line"
          subtitle="Live KPIs across pipeline, campaigns, and system health."
          breadcrumb={[{ label: 'Admin', to: '/admin/dashboard' }, { label: 'Dashboard' }]}
          trust={trust}
        />
        {[0, 1].map(row => (
          <div key={row} className="row g-3 mb-3">
            {[1, 2, 3, 4, 5, 6].map(i => (
              <div key={i} className="col-6 col-lg-2">
                <SectionCard>
                  <div className="placeholder-glow">
                    <span className="placeholder col-8 mb-2" style={{ height: 12 }} />
                    <span className="placeholder col-5" style={{ height: 24 }} />
                  </div>
                </SectionCard>
              </div>
            ))}
          </div>
        ))}
        <div className="row g-3 mb-4">
          <div className="col-lg-7"><SectionCard><div className="placeholder-glow"><span className="placeholder w-100" style={{ height: 200 }} /></div></SectionCard></div>
          <div className="col-lg-5"><SectionCard><div className="placeholder-glow"><span className="placeholder w-100" style={{ height: 200 }} /></div></SectionCard></div>
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
      <PageHeader
        title="Dashboard"
        icon="dashboard-line"
        subtitle="Live KPIs across pipeline, campaigns, and system health."
        breadcrumb={[{ label: 'Admin', to: '/admin/dashboard' }, { label: 'Dashboard' }]}
        trust={trust}
      />

      {/* ============================================================ */}
      {/* ROW 1: Executive KPIs                                        */}
      {/* ============================================================ */}
      <div className="row g-3 mb-3">
        <div className="col-6 col-lg-2">
          <StatCard to="/admin/pipeline" label="Pipeline Value" icon="funds-line" tone="primary"
            value={oppSummary ? fmtCurrency(oppSummary.total_pipeline_value) : '--'} />
        </div>
        <div className="col-6 col-lg-2">
          <StatCard to="/admin/opportunities" label="Weighted Forecast" icon="line-chart-line" tone="info"
            value={forecast ? fmtCurrency(forecast.weighted_pipeline_value) : '--'}
            hint={forecast ? `${forecast.total_projected_enrollments.toFixed(1)} proj. enrollments` : undefined} />
        </div>
        <div className="col-6 col-lg-2">
          <StatCard to="/admin/leads" label="Total Leads" icon="group-line" tone="info"
            value={leadStats?.total ?? '--'}
            hint={leadStats ? `${leadStats.thisMonth} this month` : undefined} />
        </div>
        <div className="col-6 col-lg-2">
          <StatCard to="/admin/leads" label="Call Conversion" icon="phone-line" tone="warning"
            value={leadStats ? `${leadStats.conversionRate}%` : '--'}
            hint={leadStats ? `${(leadStats as any).bookedCalls ?? 0} calls booked` : undefined} />
        </div>
        <div className="col-6 col-lg-2">
          <StatCard to="/admin/accelerator" label="Enrollments" icon="graduation-cap-line" tone="primary"
            value={stats?.totalEnrollments ?? '--'}
            hint={stats && stats.pendingInvoice > 0 ? `${stats.pendingInvoice} pending` : undefined} />
        </div>
        <div className="col-6 col-lg-2">
          <StatCard to="/admin/revenue" label="Revenue" icon="money-dollar-circle-line" tone="success"
            value={stats ? fmtCurrency(stats.totalRevenue) : '--'} />
        </div>
      </div>

      {/* ============================================================ */}
      {/* ROW 2: Campaign Activity                                     */}
      {/* ============================================================ */}
      <div className="row g-3 mb-3">
        <div className="col-6 col-lg-2">
          <StatCard to="/admin/communications?channel=email" label="Emails Sent" icon="mail-send-line" tone="info"
            value={campaignActivity?.emails_sent_today ?? '--'}
            hint={campaignActivity ? `${campaignActivity.emails_sent_week} this week` : undefined} />
        </div>
        <div className="col-6 col-lg-2">
          <StatCard to="/admin/communications?channel=sms" label="SMS Sent" icon="message-2-line" tone="primary"
            value={campaignActivity?.sms_sent_today ?? '--'}
            hint={campaignActivity ? `${campaignActivity.sms_sent_week} this week` : undefined} />
        </div>
        <div className="col-6 col-lg-2">
          <StatCard to="/admin/communications?channel=voice" label="Voice Calls" icon="phone-line" tone="primary"
            value={campaignActivity?.voice_calls_today ?? '--'}
            hint={campaignActivity ? `${campaignActivity.voice_calls_week} this week` : undefined} />
        </div>
        <div className="col-6 col-lg-2">
          <StatCard to="/admin/campaigns" label="Open Rate (7d)" icon="mail-open-line" tone="success"
            value={campaignActivity ? `${campaignActivity.open_rate}%` : '--'}
            hint={campaignActivity ? `${campaignActivity.active_campaigns} active campaigns` : undefined} />
        </div>
        <div className="col-6 col-lg-2">
          <StatCard to="/admin/campaigns" label="Click Rate (7d)" icon="cursor-line" tone="info"
            value={campaignActivity ? `${campaignActivity.click_rate}%` : '--'} />
        </div>
        <div className="col-6 col-lg-2">
          <StatCard to="/admin/leads?temperature=hot" label="Hot Leads" icon="fire-line" tone="danger"
            value={campaignActivity?.hot_leads_count ?? '--'} hint="Engaged 2+ times" />
        </div>
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
      {/* SECTION: Pipeline                                             */}
      {/* ============================================================ */}
      <div className="row g-4 mb-4">
        <div className="col-12">
          <SectionCard
            title="Pipeline at a Glance"
            icon="git-merge-line"
            actions={<Link to="/admin/pipeline" className="btn btn-sm btn-outline-secondary">View Pipeline</Link>}
          >
            <div className="d-flex align-items-center gap-2">
              {Object.entries(PIPELINE_STAGES).map(([key, { label, color }]) => {
                const count = pipelineStats[key] || 0;
                const pct = Math.max((count / totalPipeline) * 100, count > 0 ? 3 : 0);
                return (
                  <div key={key} className="text-center" style={{ flex: pct || 1 }}>
                    <div style={{ height: 28, background: color, borderRadius: 4, opacity: count > 0 ? 1 : 0.15 }} />
                    <div className="small text-muted mt-1">{label}</div>
                    <div className="small fw-semibold">{count}</div>
                  </div>
                );
              })}
            </div>
          </SectionCard>
        </div>
      </div>

      {/* ============================================================ */}
      {/* SECTION: Campaign Performance                                 */}
      {/* ============================================================ */}
      <div className="mb-4">
        <SectionCard
          title="Campaign Performance"
          icon="megaphone-line"
          padded={false}
          actions={<Link to="/admin/campaigns" className="btn btn-sm btn-outline-secondary">View All</Link>}
        >
          <div className="table-responsive">
            <table className="table table-hover mb-0" style={{ tableLayout: 'fixed' }}>
              <colgroup>
                <col style={{ width: '24%' }} />
                <col style={{ width: '7%' }} />
                <col style={{ width: '7%' }} />
                <col style={{ width: '7%' }} />
                <col style={{ width: '7%' }} />
                <col style={{ width: '8%' }} />
                <col style={{ width: '8%' }} />
                <col style={{ width: '7%' }} />
                <col style={{ width: '7%' }} />
                <col style={{ width: '8%' }} />
              </colgroup>
              <thead className="table-light">
                <tr>
                  <th className="small fw-medium">Campaign</th>
                  <th className="small fw-medium text-end">Leads</th>
                  <th className="small fw-medium text-end" title="Emails sent">Emails</th>
                  <th className="small fw-medium text-end" title="SMS sent">SMS</th>
                  <th className="small fw-medium text-end" title="Voice calls">Voice</th>
                  <th className="small fw-medium text-end">Open %</th>
                  <th className="small fw-medium text-end">Click %</th>
                  <th className="small fw-medium text-end">Replies</th>
                  <th className="small fw-medium text-end">Bounces</th>
                  <th className="small fw-medium text-end">Meetings</th>
                </tr>
              </thead>
              <tbody>
                {campaigns.length === 0 ? (
                  <tr><td colSpan={10} className="text-center text-muted small py-3">No active campaigns</td></tr>
                ) : campaigns.map(c => {
                  const totalSent = c.channels.email + c.channels.sms + c.channels.voice;
                  return (
                    <tr key={c.id}>
                      <td className="small text-truncate">
                        <Link to={`/admin/campaigns/${c.id}`} className="text-decoration-none">
                          {c.name}
                        </Link>
                      </td>
                      <td className="small text-end">{c.active_leads}</td>
                      <td className="small text-end">{c.channels.email || <span className="text-muted">-</span>}</td>
                      <td className="small text-end">{c.channels.sms || <span className="text-muted">-</span>}</td>
                      <td className="small text-end">{c.channels.voice || <span className="text-muted">-</span>}</td>
                      <td className="small text-end">
                        {c.open_rate > 0 ? (
                          <span className={c.open_rate >= 25 ? 'text-success fw-medium' : c.open_rate >= 15 ? '' : 'text-danger'}>
                            {c.open_rate}%
                          </span>
                        ) : <span className="text-muted">-</span>}
                      </td>
                      <td className="small text-end">
                        {c.click_rate > 0 ? (
                          <span className={c.click_rate >= 3 ? 'text-success fw-medium' : ''}>
                            {c.click_rate}%
                          </span>
                        ) : <span className="text-muted">-</span>}
                      </td>
                      <td className="small text-end">{c.replies || <span className="text-muted">-</span>}</td>
                      <td className="small text-end">
                        {c.bounces > 0 ? <span className="text-danger">{c.bounces}</span> : <span className="text-muted">-</span>}
                      </td>
                      <td className="small text-end">
                        {c.meetings_booked > 0 ? <span className="text-success fw-medium">{c.meetings_booked}</span> : <span className="text-muted">-</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              {campaigns.length > 0 && (
                <tfoot className="table-light">
                  <tr>
                    <td className="small fw-semibold">Totals ({campaigns.length} campaigns)</td>
                    <td className="small text-end fw-semibold">{campaigns.reduce((s, c) => s + c.active_leads, 0)}</td>
                    <td className="small text-end fw-semibold">{campaigns.reduce((s, c) => s + c.channels.email, 0)}</td>
                    <td className="small text-end fw-semibold">{campaigns.reduce((s, c) => s + c.channels.sms, 0)}</td>
                    <td className="small text-end fw-semibold">{campaigns.reduce((s, c) => s + c.channels.voice, 0)}</td>
                    <td className="small text-end fw-semibold">
                      {(() => {
                        const te = campaigns.reduce((s, c) => s + c.channels.email, 0);
                        const to = campaigns.reduce((s, c) => s + Math.round(c.channels.email * c.open_rate / 100), 0);
                        return te > 0 ? `${Math.round(to / te * 100)}%` : '-';
                      })()}
                    </td>
                    <td className="small text-end fw-semibold">
                      {(() => {
                        const te = campaigns.reduce((s, c) => s + c.channels.email, 0);
                        const tc = campaigns.reduce((s, c) => s + Math.round(c.channels.email * c.click_rate / 100), 0);
                        return te > 0 ? `${Math.round(tc / te * 100)}%` : '-';
                      })()}
                    </td>
                    <td className="small text-end fw-semibold">{campaigns.reduce((s, c) => s + c.replies, 0)}</td>
                    <td className="small text-end fw-semibold">{campaigns.reduce((s, c) => s + c.bounces, 0)}</td>
                    <td className="small text-end fw-semibold">{campaigns.reduce((s, c) => s + c.meetings_booked, 0)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </SectionCard>
      </div>

      {/* ============================================================ */}
      {/* SECTION: Appointments + Cohorts                              */}
      {/* ============================================================ */}
      <div className="row g-4">
        {/* Upcoming Appointments */}
        <div className="col-lg-6">
          <SectionCard title="Upcoming Appointments" icon="calendar-event-line" padded={false} className="h-100">
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
                            <StatusBadge label={fmtDateTime(a.scheduled_at)} tone="info" icon="calendar-line" />
                            <i className={`ri-arrow-${isExpanded ? 'up' : 'down'}-s-line text-muted`} aria-hidden="true" />
                          </div>
                        </div>

                        {isExpanded && (
                          <div className="px-3 pb-3 border-top" style={{ background: 'var(--surface-subtle)' }}>
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
                                <StatusBadge
                                  label={a.status}
                                  tone={a.status === 'scheduled' ? 'primary' : a.status === 'completed' ? 'success' : a.status === 'no_show' ? 'danger' : 'neutral'}
                                />
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
          </SectionCard>
        </div>

        {/* Cohorts */}
        <div className="col-lg-6">
          <SectionCard
            title="Cohorts"
            icon="group-2-line"
            padded={false}
            className="h-100"
            actions={<Link to="/admin/accelerator" className="btn btn-sm btn-outline-secondary">Manage</Link>}
          >
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
                        <td className="small text-center">
                          <StatusBadge label={c.status} tone={COHORT_STATUS_TONE[c.status] || 'neutral'} />
                        </td>
                        <td><Link to={`/admin/cohorts/${c.id}`} className="btn btn-sm btn-outline-secondary">View</Link></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
            </div>
          </SectionCard>
        </div>
      </div>
    </>
  );
}

export default AdminDashboardPage;
