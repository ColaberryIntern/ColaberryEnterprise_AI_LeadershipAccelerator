import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import api from '../../utils/api';
import { PageHeader, StatCard, StatusBadge, SectionCard } from '../../components/admin/shell';
import { TrustSignal } from '../../components/admin/shell/trust';

const POLL_INTERVAL = 10000;

type StatTone = 'primary' | 'success' | 'danger' | 'warning' | 'info' | 'neutral';

// Pipeline stage -> brand chart-series token for the funnel bars.
const STAGE_COLORS: Record<string, string> = {
  new_lead: 'var(--chart-8)',
  contacted: 'var(--chart-1)',
  meeting_scheduled: 'var(--chart-5)',
  proposal_sent: 'var(--chart-4)',
  negotiation: 'var(--chart-4)',
  enrolled: 'var(--chart-3)',
  lost: 'var(--chart-2)',
};

const STAGE_LABELS: Record<string, string> = {
  new_lead: 'New Lead',
  contacted: 'Contacted',
  meeting_scheduled: 'Meeting Scheduled',
  proposal_sent: 'Proposal Sent',
  negotiation: 'Negotiation',
  enrolled: 'Enrolled',
  lost: 'Lost',
};

// Alert severity 1..5 -> StatusBadge tone (left accent rail).
const SEVERITY_TONE: Record<number, StatTone> = {
  1: 'success',
  2: 'info',
  3: 'warning',
  4: 'warning',
  5: 'danger',
};

const SEVERITY_COLOR: Record<number, string> = {
  1: 'var(--status-success)',
  2: 'var(--status-info)',
  3: 'var(--status-warning)',
  4: 'var(--chart-4)',
  5: 'var(--status-danger)',
};

function formatTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function WarRoomPage() {
  const [, setStats] = useState<any>(null);
  const [revenue, setRevenue] = useState<any>(null);
  const [liveMetrics, setLiveMetrics] = useState<any>(null);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [feed, setFeed] = useState<any[]>([]);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  const [error, setError] = useState('');
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  const activityRef = useRef<HTMLDivElement>(null);

  const fetchAll = useCallback(async () => {
    try {
      const [statsRes, revenueRes, liveRes, alertsRes, feedRes] = await Promise.all([
        api.get('/api/admin/stats').catch(() => ({ data: {} })),
        api.get('/api/admin/revenue/dashboard').catch(() => ({ data: {} })),
        api.get('/api/admin/war-room/live-metrics').catch(() => ({ data: {} })),
        api.get('/api/admin/alerts?status=new&limit=20').catch(() => ({ data: [] })),
        api.get('/api/admin/war-room/feed').catch(() => ({ data: [] })),
      ]);
      setStats(statsRes.data);
      setRevenue(revenueRes.data);
      setLiveMetrics(liveRes.data);
      setAlerts(Array.isArray(alertsRes.data) ? alertsRes.data : alertsRes.data?.alerts || []);
      setFeed(Array.isArray(feedRes.data) ? feedRes.data : []);
      setLastUpdate(new Date());
      setError('');
    } catch (err: any) {
      setError(err.message || 'Failed to fetch data');
    }
  }, []);

  useEffect(() => {
    fetchAll();
    const interval = setInterval(fetchAll, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchAll]);

  // Auto-scroll activity stream to top on refresh.
  useEffect(() => {
    if (activityRef.current) {
      activityRef.current.scrollTop = 0;
    }
  }, [revenue?.recentActivities]);

  const pipelineCounts = revenue?.pipelineCounts || {};
  const maxPipeline = Math.max(...Object.values(pipelineCounts).map(v => Number(v) || 0), 1);
  const activities = feed.length > 0 ? feed : (revenue?.recentActivities || []);
  const forecast = revenue?.revenueForecast || {};

  // Per-page trust signal (Basecamp todo 10027085963): War Room is a live, real-time feed.
  const trust: TrustSignal = useMemo(() => ({
    level: 'live',
    source: 'war room',
    updatedAt: new Date().toISOString(),
    summary: 'Live operational feed: pipeline, metrics, activity, and alerts (10s poll).',
    href: '/admin/trust',
    pillars: [
      {
        name: 'Freshness',
        status: 'live',
        evidence: [{ label: 'Poll interval', value: '10s' }, { label: 'Last update', value: lastUpdate.toLocaleTimeString() }],
      },
    ],
  }), [lastUpdate]);

  return (
    <>
      <PageHeader
        title="War Room"
        icon="radar-line"
        subtitle="Live operational command center: pipeline, real-time metrics, activity, and alerts."
        breadcrumb={[{ label: 'Admin', to: '/admin/dashboard' }, { label: 'War Room' }]}
        trust={trust}
        actions={
          <div className="d-flex align-items-center gap-2">
            {error && <StatusBadge label={error} tone="danger" icon="error-warning-line" />}
            <span className="text-muted small">Updated {lastUpdate.toLocaleTimeString()}</span>
            <StatusBadge label="Live" tone="success" icon="broadcast-line" />
          </div>
        }
      >
        {/* Live Metrics KPI row (was the dark-panel MetricCard grid). */}
        <div className="row g-3">
          <div className="col-6 col-lg-3 col-xl-2">
            <StatCard label="Emails Sent" value={liveMetrics?.emailsToday ?? '...'} icon="mail-send-line" tone="info" />
          </div>
          <div className="col-6 col-lg-3 col-xl-2">
            <StatCard label="SMS Sent" value={liveMetrics?.smsToday ?? '...'} icon="message-2-line" tone="primary" />
          </div>
          <div className="col-6 col-lg-3 col-xl-2">
            <StatCard label="Maya Calls" value={liveMetrics?.callsToday ?? '...'} icon="phone-line" tone="success" />
          </div>
          <div className="col-6 col-lg-3 col-xl-2">
            <StatCard label="Opens" value={liveMetrics?.opensToday ?? '...'} icon="mail-open-line" tone="info" />
          </div>
          <div className="col-6 col-lg-3 col-xl-2">
            <StatCard label="Clicks" value={liveMetrics?.clicksToday ?? '...'} icon="cursor-line" tone="warning" />
          </div>
          <div className="col-6 col-lg-3 col-xl-2">
            <StatCard label="Replies" value={liveMetrics?.repliesToday ?? '...'} icon="reply-line"
              tone={(liveMetrics?.repliesToday || 0) > 0 ? 'success' : 'neutral'} />
          </div>
          <div className="col-6 col-lg-3 col-xl-2">
            <StatCard label="Hot Leads" value={liveMetrics?.hotLeads ?? '...'} icon="fire-line" tone="danger" />
          </div>
          <div className="col-6 col-lg-3 col-xl-2">
            <StatCard label="Bookings" value={liveMetrics?.bookingsToday ?? 0} icon="calendar-check-line"
              tone={(liveMetrics?.bookingsToday || 0) > 0 ? 'success' : 'neutral'} />
          </div>
          <div className="col-6 col-lg-3 col-xl-2">
            <StatCard label={liveMetrics?.nextCohort ? 'Apr 14 Seats' : 'Seats'} value={liveMetrics?.nextCohort?.seatsRemaining ?? '...'}
              icon="group-line" tone={(liveMetrics?.nextCohort?.seatsRemaining ?? 99) < 5 ? 'danger' : 'info'} />
          </div>
          <div className="col-6 col-lg-3 col-xl-2">
            <StatCard label="Advisor Clicks" value={liveMetrics?.advisorClicksToday ?? '...'} icon="cursor-line" tone="primary" />
          </div>
          <div className="col-6 col-lg-3 col-xl-2">
            <StatCard label="Advisor Sessions" value={liveMetrics?.advisorSessionsToday ?? '...'} icon="window-line" tone="primary" />
          </div>
          <div className="col-6 col-lg-3 col-xl-2">
            <StatCard label="Advisor Leads" value={liveMetrics?.advisorLeadsToday ?? '...'} icon="user-add-line" tone="primary" />
          </div>
          <div className="col-6 col-lg-3 col-xl-2">
            <StatCard label="Demo Starts" value={liveMetrics?.demoStartsToday ?? 0} icon="play-circle-line" tone="primary" />
          </div>
          <div className="col-6 col-lg-3 col-xl-2">
            <StatCard label="Demo Completes" value={liveMetrics?.demoCompletesToday ?? 0} icon="checkbox-circle-line" tone="success" />
          </div>
          <div className="col-6 col-lg-3 col-xl-2">
            <StatCard label="Top Demo" value={liveMetrics?.topDemoIndustry || '—'} icon="award-line" tone="warning" />
          </div>
        </div>
        <div className="d-flex flex-wrap gap-3 mt-2 small text-muted">
          <span>Ali Emails: <strong className="text-body">{liveMetrics?.aliEmailsToday ?? 0}</strong></span>
          <span>Phase 2: <strong className="text-body">{liveMetrics?.phase2Active ?? 0}</strong> active</span>
          <span>Qualified: <strong className="text-body">{liveMetrics?.qualifiedLeads ?? 0}</strong></span>
        </div>
      </PageHeader>

      <div className="row g-4">
        {/* Pipeline Funnel */}
        <div className="col-lg-6">
          <SectionCard
            title="Pipeline Funnel"
            icon="filter-3-line"
            className="h-100"
            actions={forecast.pipelineValue > 0
              ? <span className="text-muted small">Pipeline: ${(forecast.pipelineValue || 0).toLocaleString()}</span>
              : undefined}
          >
            {Object.entries(pipelineCounts).length === 0 ? (
              <p className="text-muted text-center py-4 small mb-0">Loading pipeline...</p>
            ) : (
              Object.entries(pipelineCounts).map(([stage, count]) => {
                const pct = ((Number(count) || 0) / maxPipeline) * 100;
                return (
                  <div key={stage} className="d-flex align-items-center mb-2 small">
                    <span style={{ width: 120, color: 'var(--text-muted)' }}>{STAGE_LABELS[stage] || stage}</span>
                    <div style={{ flex: 1, background: 'var(--surface-subtle)', borderRadius: 4, height: 22, position: 'relative' }}>
                      <div style={{
                        width: `${Math.max(pct, 2)}%`,
                        background: STAGE_COLORS[stage] || 'var(--chart-8)',
                        borderRadius: 4,
                        height: '100%',
                        transition: 'width 0.5s ease',
                      }} />
                      <span style={{ position: 'absolute', right: 6, top: 3, fontSize: 11, fontWeight: 600, color: 'var(--text-strong)' }}>
                        {Number(count)}
                      </span>
                    </div>
                  </div>
                );
              })
            )}

            {/* Conversion rates */}
            {Array.isArray(revenue?.funnelConversions) && revenue.funnelConversions.length > 0 && (
              <div className="mt-3 pt-2 border-top">
                <span className="text-muted small">Conversion Rates</span>
                <div className="d-flex flex-wrap gap-2 mt-1">
                  {revenue.funnelConversions.map((c: any, i: number) => (
                    <StatusBadge
                      key={i}
                      tone="neutral"
                      label={`${STAGE_LABELS[c.from] || c.from} → ${STAGE_LABELS[c.to] || c.to}: ${c.rate?.toFixed(1)}%`}
                    />
                  ))}
                </div>
              </div>
            )}
          </SectionCard>
        </div>

        {/* Alerts */}
        <div className="col-lg-6">
          <SectionCard
            title="Alerts"
            icon="alarm-warning-line"
            padded={false}
            className="h-100"
            actions={<StatusBadge label={alerts.length > 0 ? `${alerts.length} active` : 'All clear'} tone={alerts.length > 0 ? 'danger' : 'success'} />}
          >
            {alerts.length === 0 ? (
              <div className="text-center py-4">
                <i className="ri-shield-check-line d-block mb-2" style={{ fontSize: 32, color: 'var(--status-success)' }} aria-hidden="true" />
                <p className="text-muted mb-0 small">No active alerts</p>
              </div>
            ) : (
              <table className="table table-sm mb-0" style={{ fontSize: 12 }}>
                <tbody>
                  {alerts.map((a: any, i: number) => (
                    <tr key={i}>
                      <td style={{ width: 8, padding: 0 }}>
                        <div style={{ width: 4, height: '100%', minHeight: 30, background: SEVERITY_COLOR[a.severity] || 'var(--text-muted)' }} />
                      </td>
                      <td>
                        <div className="fw-medium">{a.title || a.type}</div>
                        <div className="text-muted" style={{ fontSize: 11 }}>{a.description || ''}</div>
                      </td>
                      <td style={{ width: 70 }}>
                        <StatusBadge label={`P${a.severity ?? '?'}`} tone={SEVERITY_TONE[a.severity] || 'neutral'} />
                      </td>
                      <td style={{ width: 60, fontSize: 11, color: 'var(--text-muted)' }}>
                        {a.created_at ? formatTimeAgo(a.created_at) : ''}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </SectionCard>
        </div>

        {/* Activity Stream */}
        <div className="col-12">
          <SectionCard
            title="Activity Stream"
            icon="pulse-line"
            padded={false}
            actions={<span className="text-muted small">{activities.length} recent</span>}
          >
            <div ref={activityRef} style={{ maxHeight: 420, overflowY: 'auto' }}>
              {activities.length === 0 ? (
                <p className="text-muted text-center py-4 small mb-0">No recent activity</p>
              ) : (
                <table className="table table-sm table-hover mb-0" style={{ fontSize: 12 }}>
                  <tbody>
                    {activities.map((a: any, i: number) => {
                      const evtType = a.event_type || a.type || 'event';
                      const detail = a.detail || a.subject || a.description || '-';
                      const badgeLabel =
                        evtType === 'demo_start' ? 'demo' :
                        evtType === 'demo_complete' ? 'demo done' :
                        evtType === 'pageview' ? 'visit' :
                        evtType === 'cta_click' ? 'cta click' :
                        evtType === 'form_start' ? 'form start' :
                        evtType === 'form_submit' ? 'form submit' :
                        evtType === 'booking_modal_opened' ? 'booking' :
                        evtType === 'opened' ? 'opened' :
                        evtType === 'clicked' ? 'clicked' :
                        evtType === 'replied' ? 'replied' :
                        evtType;
                      const badgeTone: StatTone =
                        evtType === 'demo_start' || evtType === 'demo_complete' ? 'primary' :
                        evtType === 'pageview' || evtType === 'opened' ? 'info' :
                        evtType === 'cta_click' || evtType === 'clicked' || evtType === 'form_start' ? 'success' :
                        evtType === 'booking_modal_opened' || evtType === 'form_submit' ? 'danger' :
                        evtType === 'replied' ? 'warning' :
                        evtType.includes('email') || evtType.includes('sent') ? 'primary' :
                        evtType.includes('voice') || evtType.includes('call') || evtType.includes('sms') ? 'success' :
                        evtType.includes('enrollment') ? 'warning' :
                        evtType.includes('status') || evtType.includes('score') ? 'info' :
                        evtType.includes('failed') || evtType.includes('bounced') ? 'danger' :
                        'neutral';
                      const srcType = a.source === 'visitor' ? 'visitor' : (a.lead_source_type || '');
                      const srcBadge =
                        srcType === 'visitor' ? { label: 'Visitor', tone: 'primary' as StatTone } :
                        srcType === 'warm' ? { label: 'Marketing', tone: 'primary' as StatTone } :
                        srcType === 'cold' ? { label: 'Cold', tone: 'warning' as StatTone } :
                        srcType === 'alumni' ? { label: 'Alumni', tone: 'success' as StatTone } :
                        null;
                      const isExpanded = expandedIdx === i;
                      return (
                        <React.Fragment key={i}>
                          <tr
                            onClick={() => setExpandedIdx(isExpanded ? null : i)}
                            style={{ cursor: 'pointer', background: isExpanded ? 'var(--surface-subtle)' : undefined }}
                          >
                            <td style={{ width: 70, color: 'var(--text-muted)', fontSize: 11 }}>
                              {a.created_at ? formatTimeAgo(a.created_at) : '-'}
                            </td>
                            <td style={{ width: 110 }}>
                              <StatusBadge label={badgeLabel.replace(/_/g, ' ')} tone={badgeTone} />
                            </td>
                            <td>
                              {a.lead_name && <span className="fw-medium me-1">{a.lead_name}</span>}
                              <span className="text-muted">{detail.length > 60 ? detail.slice(0, 60) + '...' : detail}</span>
                            </td>
                            <td style={{ width: 90 }}>
                              {srcBadge && <StatusBadge label={srcBadge.label} tone={srcBadge.tone} />}
                            </td>
                            <td style={{ width: 24, color: 'var(--text-muted)' }}>
                              <i className={`ri-arrow-${isExpanded ? 'up' : 'down'}-s-line`} aria-hidden="true" />
                            </td>
                          </tr>
                          {isExpanded && (
                            <tr>
                              <td colSpan={5} style={{ background: 'var(--surface-subtle)', padding: '10px 16px' }}>
                                <div className="row g-3" style={{ fontSize: 12 }}>
                                  <div className="col-md-4">
                                    <div className="text-muted text-uppercase mb-1" style={{ fontSize: 10 }}>Lead</div>
                                    <div className="fw-medium">{a.lead_name || 'Unknown'}</div>
                                    <div className="text-muted">{a.lead_email || '-'}</div>
                                    {a.lead_pipeline_stage && (
                                      <span className="d-inline-block mt-1">
                                        <StatusBadge label={STAGE_LABELS[a.lead_pipeline_stage] || a.lead_pipeline_stage} tone="neutral" />
                                      </span>
                                    )}
                                    {a.lead_score != null && (
                                      <span className="d-inline-block ms-1 mt-1">
                                        <StatusBadge label={`Score: ${a.lead_score}`} tone="info" />
                                      </span>
                                    )}
                                  </div>
                                  <div className="col-md-4">
                                    <div className="text-muted text-uppercase mb-1" style={{ fontSize: 10 }}>Campaign</div>
                                    {a.campaign_name ? (
                                      <>
                                        <div className="fw-medium">{a.campaign_name}</div>
                                        <StatusBadge label={a.campaign_type || '-'} tone="neutral" />
                                      </>
                                    ) : (
                                      <div className="text-muted">No campaign</div>
                                    )}
                                  </div>
                                  <div className="col-md-4">
                                    <div className="text-muted text-uppercase mb-1" style={{ fontSize: 10 }}>Event</div>
                                    <div>{detail}</div>
                                    <div className="text-muted mt-1" style={{ fontSize: 11 }}>
                                      {a.created_at ? new Date(a.created_at).toLocaleString() : '-'}
                                    </div>
                                    {a.lead_id && (
                                      <a href={`/admin/leads/${a.lead_id}`} className="btn btn-sm btn-outline-primary mt-2" style={{ fontSize: 10 }}>
                                        View Lead
                                      </a>
                                    )}
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </SectionCard>
        </div>
      </div>
    </>
  );
}
