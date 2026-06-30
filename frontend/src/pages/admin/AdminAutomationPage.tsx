import React, { useEffect, useState, useMemo } from 'react';
import api from '../../utils/api';
import { PageHeader, StatCard, StatusBadge, SectionCard } from '../../components/admin/shell';
import { TrustSignal } from '../../components/admin/shell/trust';

type BadgeTone = 'success' | 'danger' | 'warning' | 'info' | 'neutral' | 'primary';

// Ticket status -> semantic tone (replaces hardcoded hex badge backgrounds).
function statusTone(s: string): BadgeTone {
  switch (s) {
    case 'done':        return 'success';
    case 'in_progress': return 'warning';
    default:            return 'neutral';
  }
}

// Ticket priority -> semantic tone.
function priorityTone(p: string): BadgeTone {
  switch (p) {
    case 'critical': return 'danger';
    case 'high':     return 'warning';
    default:         return 'neutral';
  }
}

// Insight severity -> semantic tone.
function severityTone(sev: string): BadgeTone {
  switch (sev) {
    case 'high':   return 'danger';
    case 'medium': return 'warning';
    default:       return 'success';
  }
}

// Activity action -> semantic tone for the feed dot color.
function actionTone(action: string): BadgeTone {
  switch (action) {
    case 'created':        return 'info';
    case 'status_changed': return 'warning';
    case 'agent_output':   return 'success';
    default:               return 'neutral';
  }
}

export default function AdminAutomationPage() {
  const [tab, setTab] = useState<'feed' | 'tickets' | 'workforce' | 'stats'>('feed');
  const [feed, setFeed] = useState<any[]>([]);
  const [tickets, setTickets] = useState<any[]>([]);
  const [ticketStats, setTicketStats] = useState<any[]>([]);
  const [workforce, setWorkforce] = useState<any>(null);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);

  useEffect(() => {
    Promise.all([
      api.get('/api/admin/automation/feed').catch(() => ({ data: { activities: [] } })),
      api.get('/api/admin/automation/stats').catch(() => ({ data: {} })),
    ]).then(([feedRes, statsRes]) => {
      setFeed(feedRes.data.activities || []);
      setStats(statsRes.data);
    }).finally(() => setLoading(false));
  }, []);

  const loadTickets = () => {
    api.get('/api/admin/automation/tickets').then(r => {
      setTickets(r.data.tickets || []);
      setTicketStats(r.data.stats || []);
    }).catch(() => {});
  };

  const runWorkforce = async () => {
    setAnalyzing(true);
    try {
      const res = await api.post('/api/admin/automation/workforce/analyze');
      setWorkforce(res.data);
    } catch {} finally { setAnalyzing(false); }
  };

  const statData = stats || {};
  const tix = statData.tickets || {};
  const ags = statData.agents || {};

  // Per-page trust signal — this surface is generated live from automation telemetry.
  const trust: TrustSignal = useMemo(() => ({
    level: 'live',
    source: 'automation',
    updatedAt: new Date().toISOString(),
    summary: `${tix.active || 0} active ticket${(tix.active || 0) === 1 ? '' : 's'}, ${ags.total_runs || 0} agent runs, ${ags.total_errors || 0} errors.`,
    href: '/admin/trust',
    pillars: [
      {
        name: 'Freshness',
        status: 'live',
        evidence: [{ label: 'Source', value: 'automation feed + stats' }],
      },
    ],
  }), [tix.active, ags.total_runs, ags.total_errors]);

  if (loading) return <div className="text-center py-5"><div className="spinner-border text-primary"></div></div>;

  return (
    <>
      <PageHeader
        title="Automation"
        icon="settings-5-line"
        subtitle="System activity, ticket orchestration, and workforce intelligence."
        breadcrumb={[{ label: 'Admin', to: '/admin/dashboard' }, { label: 'Automation' }]}
        trust={trust}
        actions={
          <button className="btn btn-outline-primary btn-sm"
            onClick={() => api.get('/api/admin/automation/feed').then(r => setFeed(r.data.activities || []))}>
            <i className="ri-refresh-line" aria-hidden="true" /> Refresh
          </button>
        }
      >
        <div className="row g-3">
          <div className="col-6 col-lg">
            <StatCard label="Total Tickets" value={(tix.total_tickets || 0).toLocaleString()} icon="ticket-2-line" tone="primary" />
          </div>
          <div className="col-6 col-lg">
            <StatCard label="Active" value={(tix.active || 0).toLocaleString()} icon="play-circle-line" tone="warning" />
          </div>
          <div className="col-6 col-lg">
            <StatCard label="Completed (24h)" value={(tix.completed_24h || 0).toLocaleString()} icon="checkbox-circle-line" tone="success" />
          </div>
          <div className="col-6 col-lg">
            <StatCard label="Agent Runs" value={(ags.total_runs || 0).toLocaleString()} icon="robot-line" tone="info" />
          </div>
          <div className="col-6 col-lg">
            <StatCard label="Agent Errors" value={(ags.total_errors || 0).toLocaleString()} icon="error-warning-line" tone={ags.total_errors ? 'danger' : 'neutral'} />
          </div>
        </div>
      </PageHeader>

      {/* Tabs */}
      <nav className="nav nav-tabs mb-4">
        {[
          { key: 'feed' as const, label: 'Live Feed', icon: 'ri-pulse-line' },
          { key: 'tickets' as const, label: 'Tickets', icon: 'ri-layout-grid-line' },
          { key: 'workforce' as const, label: 'Workforce', icon: 'ri-team-line' },
          { key: 'stats' as const, label: 'Stats', icon: 'ri-bar-chart-line' },
        ].map(t => (
          <button key={t.key} className={`nav-link ${tab === t.key ? 'active' : ''}`}
            onClick={() => { setTab(t.key); if (t.key === 'tickets' && tickets.length === 0) loadTickets(); }}>
            <i className={`${t.icon} me-1`} aria-hidden="true"></i>{t.label}
          </button>
        ))}
      </nav>

      {/* Feed Tab */}
      {tab === 'feed' && (
        <SectionCard
          padded={false}
          title="Recent Activity"
          actions={
            <button className="btn btn-sm btn-outline-primary"
              onClick={() => api.get('/api/admin/automation/feed').then(r => setFeed(r.data.activities || []))}>
              <i className="ri-refresh-line me-1" aria-hidden="true"></i>Refresh
            </button>
          }
        >
          {feed.length > 0 ? (
            <div style={{ maxHeight: 500, overflowY: 'auto' }}>
              {feed.map((a: any, i: number) => (
                <div key={a.id || i} className="d-flex gap-3 p-3 border-bottom" style={{ fontSize: 12 }}>
                  <span className={`badge rounded-circle bg-${actionTone(a.action) === 'info' ? 'info' : actionTone(a.action) === 'warning' ? 'warning' : actionTone(a.action) === 'success' ? 'success' : 'secondary'} p-0`} style={{ width: 8, height: 8, marginTop: 5, flexShrink: 0 }}></span>
                  <div className="flex-grow-1">
                    <div className="fw-medium">{a.ticket_title || 'Unknown ticket'}</div>
                    <div className="text-muted" style={{ fontSize: 10 }}>
                      {a.actor_type}/{a.actor_id} — {a.action}
                      {a.from_value && a.to_value && <> ({a.from_value} → {a.to_value})</>}
                    </div>
                  </div>
                  <div className="text-muted" style={{ fontSize: 9, whiteSpace: 'nowrap' }}>
                    {new Date(a.created_at).toLocaleTimeString()}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-4 text-muted small">No recent activity</div>
          )}
        </SectionCard>
      )}

      {/* Tickets Tab */}
      {tab === 'tickets' && (
        <SectionCard padded={false} title="Tickets">
          {tickets.length > 0 ? (
            <div className="table-responsive">
              <table className="table table-hover mb-0" style={{ fontSize: 11 }}>
                <thead className="table-light">
                  <tr><th>#</th><th>Title</th><th>Type</th><th>Status</th><th>Priority</th><th>Source</th><th>Created</th></tr>
                </thead>
                <tbody>
                  {tickets.map((t: any) => (
                    <tr key={t.id}>
                      <td className="text-muted">{t.ticket_number}</td>
                      <td className="fw-medium" style={{ maxWidth: 300 }}>{t.title}</td>
                      <td><StatusBadge label={t.type} tone="neutral" /></td>
                      <td><StatusBadge label={t.status} tone={statusTone(t.status)} /></td>
                      <td><StatusBadge label={t.priority} tone={priorityTone(t.priority)} /></td>
                      <td className="text-muted">{t.source}</td>
                      <td className="text-muted">{new Date(t.created_at).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-4 text-muted small">Loading tickets...</div>
          )}
        </SectionCard>
      )}

      {/* Workforce Tab */}
      {tab === 'workforce' && (
        <div>
          <div className="mb-3">
            <button className="btn btn-sm btn-primary" onClick={runWorkforce} disabled={analyzing}>
              {analyzing ? <><span className="spinner-border spinner-border-sm me-1"></span>Analyzing...</> : <><i className="ri-team-line me-1" aria-hidden="true"></i>Run Workforce Analysis</>}
            </button>
          </div>
          {workforce && (
            <div>
              <div className="row g-3 mb-3">
                <div className="col-3">
                  <StatCard label="Total Agents" value={workforce.total_agents} icon="robot-line" tone="primary" />
                </div>
                <div className="col-3">
                  <StatCard label="Healthy" value={workforce.healthy} icon="shield-check-line" tone="success" />
                </div>
                <div className="col-3">
                  <StatCard label="Errored" value={workforce.errored} icon="error-warning-line" tone={workforce.errored ? 'danger' : 'neutral'} />
                </div>
                <div className="col-3">
                  <StatCard label="Idle" value={workforce.idle} icon="pause-circle-line" tone="warning" />
                </div>
              </div>
              {workforce.insights?.length > 0 && (
                <SectionCard padded={false} title={`Workforce Insights (${workforce.insights.length})`}>
                  {workforce.insights.map((ins: any, i: number) => (
                    <div key={i} className="d-flex gap-2 p-3 border-bottom" style={{ fontSize: 11 }}>
                      <span style={{ flexShrink: 0, height: 'fit-content' }}>
                        <StatusBadge label={ins.severity} tone={severityTone(ins.severity)} />
                      </span>
                      <div>
                        <div className="fw-medium">{ins.agent_name}</div>
                        <div className="text-muted" style={{ fontSize: 10 }}>{ins.issue}</div>
                        <div className="text-info" style={{ fontSize: 10 }}>{ins.recommendation}</div>
                      </div>
                    </div>
                  ))}
                </SectionCard>
              )}
              <div className="text-muted small mt-2">Tickets created: {workforce.tickets_created} | Duration: {workforce.duration_ms}ms</div>
            </div>
          )}
        </div>
      )}

      {/* Stats Tab */}
      {tab === 'stats' && (
        <div className="row g-3">
          <div className="col-md-6">
            <SectionCard title="Ticket Status Distribution">
              {ticketStats.length > 0 ? ticketStats.map((s: any) => (
                <div key={s.status} className="d-flex justify-content-between mb-1" style={{ fontSize: 12 }}>
                  <span>{s.status}</span><strong>{s.count}</strong>
                </div>
              )) : <div className="text-muted small">Loading...</div>}
            </SectionCard>
          </div>
          <div className="col-md-6">
            <SectionCard title="Company Directives">
              {(statData.directives || []).length > 0 ? (statData.directives as any[]).map((d: any) => (
                <div key={d.status} className="d-flex justify-content-between mb-1" style={{ fontSize: 12 }}>
                  <span>{d.status}</span><strong>{d.count}</strong>
                </div>
              )) : <div className="text-muted small">No directives yet (company layer may not be enabled)</div>}
            </SectionCard>
          </div>
        </div>
      )}
    </>
  );
}
