import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
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
  const [alerts, setAlerts] = useState<any[]>([]);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  const [error, setError] = useState('');
  const activityRef = useRef<HTMLDivElement>(null);

  const fetchAll = useCallback(async () => {
    try {
      const [statsRes, revenueRes, alertsRes] = await Promise.all([
        api.get('/api/admin/stats'),
        api.get('/api/admin/revenue/dashboard'),
        api.get('/api/admin/alerts?status=new&limit=20').catch(() => ({ data: [] })),
      ]);
      setStats(statsRes.data);
      setRevenue(revenueRes.data);
      setAlerts(Array.isArray(alertsRes.data) ? alertsRes.data : alertsRes.data?.alerts || []);
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
  const activities = revenue?.recentActivities || [];
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
          </div>
          <div className="card-body py-2">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
              <MetricCard label="Total Leads" value={Object.values(pipelineCounts).reduce((s: number, v) => s + (Number(v) || 0), 0) || '...'} color="#0d6efd" />
              <MetricCard label="Paid Enrollments" value={stats?.paidEnrollments ?? 0} color="#198754" />
              <MetricCard label="Pending Invoice" value={stats?.pendingInvoice ?? 0} color="#ffc107" />
              <MetricCard label="Revenue" value={`$${(stats?.totalRevenue || 0).toLocaleString()}`} color="#198754" />
              <MetricCard label="Seats Remaining" value={stats?.seatsRemaining ?? 0} color={(stats?.seatsRemaining ?? 99) < 5 ? '#dc3545' : '#0d6efd'} />
              <MetricCard label="Upcoming Cohorts" value={stats?.upcomingCohorts ?? 0} color="#6610f2" />
              <MetricCard label="Pipeline Value" value={forecast.pipelineValue ? `$${forecast.pipelineValue.toLocaleString()}` : '...'} color="#fd7e14" />
              <MetricCard label="Projected Revenue" value={forecast.projectedRevenue ? `$${forecast.projectedRevenue.toLocaleString()}` : '...'} color="#198754" />
              <MetricCard label="Qualified Leads" value={forecast.qualifiedLeads ?? '...'} color="#0d6efd" />
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
              <table className="table table-sm table-hover mb-0" style={{ fontSize: 12 }}>
                <tbody>
                  {activities.map((a: any, i: number) => (
                    <tr key={i}>
                      <td style={{ width: 70, color: '#6c757d', fontSize: 11 }}>
                        {a.created_at ? formatTimeAgo(a.created_at) : '-'}
                      </td>
                      <td style={{ width: 90 }}>
                        <span className={`badge ${
                          a.type === 'email_sent' ? 'bg-primary' :
                          a.type === 'call' ? 'bg-success' :
                          a.type === 'score_change' ? 'bg-warning text-dark' :
                          a.type === 'status_change' ? 'bg-info' :
                          'bg-secondary'
                        }`} style={{ fontSize: 9 }}>
                          {a.type || 'event'}
                        </span>
                      </td>
                      <td>{a.subject || a.description || '-'}</td>
                    </tr>
                  ))}
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
