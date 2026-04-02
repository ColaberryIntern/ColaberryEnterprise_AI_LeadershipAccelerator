import React, { useEffect, useState, useRef, useCallback } from 'react'; // eslint-disable-line
import { useAuth } from '../../contexts/AuthContext'; // eslint-disable-line
import api from '../../utils/api';

const POLL_INTERVAL = 10000;

const STAGE_COLORS: Record<string, string> = {
  new_lead: '#6c757d',
  contacted: '#0d6efd',
  meeting_scheduled: '#6610f2',
  proposal_sent: '#fd7e14',
  negotiation: '#ffc107',
  enrolled: '#198754',
  lost: '#dc3545',
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

const SEVERITY_COLORS: Record<number, string> = {
  1: '#198754',
  2: '#0d6efd',
  3: '#ffc107',
  4: '#fd7e14',
  5: '#dc3545',
};

function formatTime(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

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
  const { token } = useAuth();
  const [stats, setStats] = useState<any>(null);
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

  // Auto-scroll activity stream
  useEffect(() => {
    if (activityRef.current) {
      activityRef.current.scrollTop = 0;
    }
  }, [revenue?.recentActivities]);

  const pipelineCounts = revenue?.pipelineCounts || {};
  const maxPipeline = Math.max(...Object.values(pipelineCounts).map(v => Number(v) || 0), 1);
  const activities = feed.length > 0 ? feed : (revenue?.recentActivities || []);
  const forecast = revenue?.revenueForecast || {};

  return (
    <div style={{ minHeight: '100vh', background: '#f8f9fa' }}>
      {/* Header */}
      <div style={{ background: '#1a1a2e', padding: '12px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h4 className="mb-0 text-white fw-bold" style={{ fontSize: 18 }}>War Room</h4>
          <span style={{ color: '#adb5bd', fontSize: 11 }}>Live operational command center</span>
        </div>
        <div className="d-flex align-items-center gap-3">
          {error && <span className="badge bg-danger">{error}</span>}
          <span style={{ color: '#6c757d', fontSize: 11 }}>
            Updated {lastUpdate.toLocaleTimeString()}
          </span>
          <span className="badge bg-success" style={{ fontSize: 10 }}>LIVE</span>
        </div>
      </div>

      {/* 4-Quadrant Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gridTemplateRows: '1fr 1fr', gap: 16, padding: 16, height: 'calc(100vh - 56px)' }}>

        {/* TOP LEFT: Pipeline Funnel */}
        <div className="card border-0 shadow-sm" style={{ overflow: 'hidden' }}>
          <div className="card-header bg-white border-0 py-2">
            <span className="fw-semibold" style={{ fontSize: 13 }}>Pipeline Funnel</span>
            {forecast.pipelineValue > 0 && (
              <span className="float-end text-muted" style={{ fontSize: 11 }}>
                Pipeline: ${(forecast.pipelineValue || 0).toLocaleString()}
              </span>
            )}
          </div>
          <div className="card-body py-2" style={{ overflow: 'auto' }}>
            {Object.entries(pipelineCounts).length === 0 ? (
              <p className="text-muted text-center py-4" style={{ fontSize: 13 }}>Loading pipeline...</p>
            ) : (
              Object.entries(pipelineCounts).map(([stage, count]) => {
                const pct = ((Number(count) || 0) / maxPipeline) * 100;
                return (
                  <div key={stage} className="d-flex align-items-center mb-2" style={{ fontSize: 12 }}>
                    <span style={{ width: 120, color: '#6c757d' }}>{STAGE_LABELS[stage] || stage}</span>
                    <div style={{ flex: 1, background: '#e9ecef', borderRadius: 4, height: 22, position: 'relative' }}>
                      <div style={{
                        width: `${Math.max(pct, 2)}%`,
                        background: STAGE_COLORS[stage] || '#6c757d',
                        borderRadius: 4,
                        height: '100%',
                        transition: 'width 0.5s ease',
                      }} />
                      <span style={{ position: 'absolute', right: 6, top: 3, fontSize: 11, fontWeight: 600 }}>
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
                <span className="text-muted" style={{ fontSize: 11 }}>Conversion Rates</span>
                <div className="d-flex flex-wrap gap-2 mt-1">
                  {revenue.funnelConversions.map((c: any, i: number) => (
                    <span key={i} className="badge bg-light text-dark" style={{ fontSize: 10 }}>
                      {STAGE_LABELS[c.from] || c.from} &rarr; {STAGE_LABELS[c.to] || c.to}: {c.rate?.toFixed(1)}%
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* TOP RIGHT: Live Metrics */}
        <div className="card border-0 shadow-sm" style={{ overflow: 'hidden' }}>
          <div className="card-header bg-white border-0 py-2">
            <span className="fw-semibold" style={{ fontSize: 13 }}>Live Metrics</span>
            <span className="float-end text-muted" style={{ fontSize: 10 }}>Today</span>
          </div>
          <div className="card-body py-2">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
              <MetricCard label="Emails Sent" value={liveMetrics?.emailsToday ?? '...'} color="#0d6efd" />
              <MetricCard label="SMS Sent" value={liveMetrics?.smsToday ?? '...'} color="#6610f2" />
              <MetricCard label="Maya Calls" value={liveMetrics?.callsToday ?? '...'} color="#198754" />
              <MetricCard label="Opens" value={liveMetrics?.opensToday ?? '...'} color="#0d6efd" />
              <MetricCard label="Clicks" value={liveMetrics?.clicksToday ?? '...'} color="#fd7e14" />
              <MetricCard label="Replies" value={liveMetrics?.repliesToday ?? '...'} color={(liveMetrics?.repliesToday || 0) > 0 ? '#198754' : '#6c757d'} />
              <MetricCard label="Hot Leads" value={liveMetrics?.hotLeads ?? '...'} color="#dc3545" />
              <MetricCard label="Bookings" value={liveMetrics?.bookingsToday ?? 0} color={(liveMetrics?.bookingsToday || 0) > 0 ? '#198754' : '#6c757d'} />
              <MetricCard label={liveMetrics?.nextCohort ? `Apr 14 Seats` : 'Seats'} value={liveMetrics?.nextCohort?.seatsRemaining ?? '...'} color={(liveMetrics?.nextCohort?.seatsRemaining ?? 99) < 5 ? '#dc3545' : '#0d6efd'} />
              <MetricCard label="Advisor Clicks" value={liveMetrics?.advisorClicksToday ?? '...'} color="#8b5cf6" />
              <MetricCard label="Advisor Sessions" value={liveMetrics?.advisorSessionsToday ?? '...'} color="#8b5cf6" />
              <MetricCard label="Advisor Leads" value={liveMetrics?.advisorLeadsToday ?? '...'} color="#8b5cf6" />
              <MetricCard label="Demo Starts" value={liveMetrics?.demoStartsToday ?? 0} color="#8b5cf6" />
              <MetricCard label="Demo Completes" value={liveMetrics?.demoCompletesToday ?? 0} color="#198754" />
              <MetricCard label="Top Demo" value={liveMetrics?.topDemoIndustry || '—'} color="#fd7e14" />
            </div>
            <div className="mt-2 pt-2 border-top d-flex gap-3" style={{ fontSize: 11 }}>
              <span className="text-muted">Ali Emails: <strong>{liveMetrics?.aliEmailsToday ?? 0}</strong></span>
              <span className="text-muted">Phase 2: <strong>{liveMetrics?.phase2Active ?? 0}</strong> active</span>
              <span className="text-muted">Qualified: <strong>{liveMetrics?.qualifiedLeads ?? 0}</strong></span>
            </div>
          </div>
        </div>

        {/* BOTTOM LEFT: Activity Stream */}
        <div className="card border-0 shadow-sm" style={{ overflow: 'hidden' }}>
          <div className="card-header bg-white border-0 py-2 d-flex justify-content-between">
            <span className="fw-semibold" style={{ fontSize: 13 }}>Activity Stream</span>
            <span className="text-muted" style={{ fontSize: 11 }}>{activities.length} recent</span>
          </div>
          <div ref={activityRef} className="card-body p-0" style={{ overflow: 'auto', maxHeight: '100%' }}>
            {activities.length === 0 ? (
              <p className="text-muted text-center py-4" style={{ fontSize: 13 }}>No recent activity</p>
            ) : (
              <table className="table table-sm mb-0" style={{ fontSize: 12 }}>
                <tbody>
                  {activities.map((a: any, i: number) => {
                    const evtType = a.event_type || a.type || 'event';
                    const detail = a.detail || a.subject || a.description || '-';
                    const badgeClass =
                      evtType.includes('email') || evtType.includes('sent') ? 'bg-primary' :
                      evtType.includes('voice') || evtType.includes('call') || evtType.includes('sms') ? 'bg-success' :
                      evtType.includes('enrollment') ? 'bg-warning text-dark' :
                      evtType.includes('status') || evtType.includes('score') ? 'bg-info' :
                      evtType.includes('failed') || evtType.includes('bounced') ? 'bg-danger' :
                      'bg-secondary';
                    const srcType = a.lead_source_type || '';
                    const srcBadge =
                      srcType === 'warm' ? { label: 'Marketing', cls: 'bg-primary' } :
                      srcType === 'cold' ? { label: 'Cold', cls: 'bg-warning text-dark' } :
                      srcType === 'alumni' ? { label: 'Alumni', cls: 'bg-success' } :
                      null;
                    const isExpanded = expandedIdx === i;
                    return (
                      <React.Fragment key={i}>
                        <tr
                          onClick={() => setExpandedIdx(isExpanded ? null : i)}
                          style={{ cursor: 'pointer', background: isExpanded ? '#f0f4ff' : undefined }}
                        >
                          <td style={{ width: 60, color: '#6c757d', fontSize: 11 }}>
                            {a.created_at ? formatTimeAgo(a.created_at) : '-'}
                          </td>
                          <td style={{ width: 90 }}>
                            <span className={`badge ${badgeClass}`} style={{ fontSize: 9 }}>
                              {evtType.replace(/_/g, ' ')}
                            </span>
                          </td>
                          <td>
                            {a.lead_name && <span className="fw-medium me-1">{a.lead_name}</span>}
                            <span className="text-muted">{detail.length > 60 ? detail.slice(0, 60) + '...' : detail}</span>
                          </td>
                          <td style={{ width: 80 }}>
                            {srcBadge && <span className={`badge ${srcBadge.cls}`} style={{ fontSize: 8 }}>{srcBadge.label}</span>}
                          </td>
                          <td style={{ width: 20, color: '#adb5bd', fontSize: 11 }}>
                            {isExpanded ? '\u25B2' : '\u25BC'}
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr>
                            <td colSpan={5} style={{ background: '#f8f9fa', padding: '10px 16px' }}>
                              <div className="row g-3" style={{ fontSize: 12 }}>
                                <div className="col-md-4">
                                  <div className="text-muted" style={{ fontSize: 10, textTransform: 'uppercase', marginBottom: 4 }}>Lead</div>
                                  <div className="fw-medium">{a.lead_name || 'Unknown'}</div>
                                  <div className="text-muted">{a.lead_email || '-'}</div>
                                  {a.lead_pipeline_stage && (
                                    <span className="badge bg-secondary mt-1" style={{ fontSize: 9 }}>
                                      {STAGE_LABELS[a.lead_pipeline_stage] || a.lead_pipeline_stage}
                                    </span>
                                  )}
                                  {a.lead_score != null && (
                                    <span className="badge bg-info ms-1 mt-1" style={{ fontSize: 9 }}>
                                      Score: {a.lead_score}
                                    </span>
                                  )}
                                </div>
                                <div className="col-md-4">
                                  <div className="text-muted" style={{ fontSize: 10, textTransform: 'uppercase', marginBottom: 4 }}>Campaign</div>
                                  {a.campaign_name ? (
                                    <>
                                      <div className="fw-medium">{a.campaign_name}</div>
                                      <span className="badge bg-light text-dark" style={{ fontSize: 9 }}>{a.campaign_type || '-'}</span>
                                    </>
                                  ) : (
                                    <div className="text-muted">No campaign</div>
                                  )}
                                </div>
                                <div className="col-md-4">
                                  <div className="text-muted" style={{ fontSize: 10, textTransform: 'uppercase', marginBottom: 4 }}>Event</div>
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
        </div>

        {/* BOTTOM RIGHT: Alerts */}
        <div className="card border-0 shadow-sm" style={{ overflow: 'hidden' }}>
          <div className="card-header bg-white border-0 py-2 d-flex justify-content-between">
            <span className="fw-semibold" style={{ fontSize: 13 }}>Alerts</span>
            <span className={`badge ${alerts.length > 0 ? 'bg-danger' : 'bg-success'}`} style={{ fontSize: 10 }}>
              {alerts.length > 0 ? `${alerts.length} active` : 'All clear'}
            </span>
          </div>
          <div className="card-body p-0" style={{ overflow: 'auto', maxHeight: '100%' }}>
            {alerts.length === 0 ? (
              <div className="text-center py-4">
                <div style={{ fontSize: 32, marginBottom: 8 }}>&#x2705;</div>
                <p className="text-muted mb-0" style={{ fontSize: 13 }}>No active alerts</p>
              </div>
            ) : (
              <table className="table table-sm mb-0" style={{ fontSize: 12 }}>
                <tbody>
                  {alerts.map((a: any, i: number) => (
                    <tr key={i}>
                      <td style={{ width: 8, padding: 0 }}>
                        <div style={{ width: 4, height: '100%', minHeight: 30, background: SEVERITY_COLORS[a.severity] || '#6c757d' }} />
                      </td>
                      <td>
                        <div className="fw-medium">{a.title || a.type}</div>
                        <div className="text-muted" style={{ fontSize: 11 }}>{a.description || ''}</div>
                      </td>
                      <td style={{ width: 60, fontSize: 11, color: '#6c757d' }}>
                        {a.created_at ? formatTimeAgo(a.created_at) : ''}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function MetricCard({ label, value, color }: { label: string; value: any; color: string }) {
  return (
    <div style={{ background: '#f8f9fa', borderRadius: 8, padding: '12px 14px', borderLeft: `3px solid ${color}` }}>
      <div style={{ fontSize: 22, fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: 11, color: '#6c757d' }}>{label}</div>
    </div>
  );
}
