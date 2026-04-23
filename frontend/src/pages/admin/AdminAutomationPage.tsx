import React, { useEffect, useState } from 'react';
import api from '../../utils/api';

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

  if (loading) return <div className="text-center py-5"><div className="spinner-border text-primary"></div></div>;

  const statData = stats || {};
  const tix = statData.tickets || {};
  const ags = statData.agents || {};

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-4">
        <div>
          <h4 className="fw-bold mb-1" style={{ color: 'var(--color-primary)' }}>Automation Control Center</h4>
          <p className="text-muted small mb-0">System activity, ticket orchestration, and workforce intelligence</p>
        </div>
      </div>

      {/* KPI Row */}
      <div className="row g-3 mb-4">
        {[
          { label: 'Total Tickets', value: tix.total_tickets || 0, color: 'var(--color-primary)' },
          { label: 'Active', value: tix.active || 0, color: '#f59e0b' },
          { label: 'Completed (24h)', value: tix.completed_24h || 0, color: '#10b981' },
          { label: 'Agent Runs', value: ags.total_runs || 0, color: '#3b82f6' },
          { label: 'Agent Errors', value: ags.total_errors || 0, color: '#ef4444' },
        ].map(k => (
          <div key={k.label} className="col">
            <div className="card border-0 shadow-sm text-center py-2">
              <div className="fw-bold" style={{ fontSize: 20, color: k.color }}>{typeof k.value === 'number' ? k.value.toLocaleString() : k.value}</div>
              <div className="text-muted" style={{ fontSize: 10 }}>{k.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <nav className="nav nav-tabs mb-4">
        {[
          { key: 'feed' as const, label: 'Live Feed', icon: 'bi-activity' },
          { key: 'tickets' as const, label: 'Tickets', icon: 'bi-kanban' },
          { key: 'workforce' as const, label: 'Workforce', icon: 'bi-people' },
          { key: 'stats' as const, label: 'Stats', icon: 'bi-bar-chart' },
        ].map(t => (
          <button key={t.key} className={`nav-link ${tab === t.key ? 'active' : ''}`}
            onClick={() => { setTab(t.key); if (t.key === 'tickets' && tickets.length === 0) loadTickets(); }}>
            <i className={`bi ${t.icon} me-1`}></i>{t.label}
          </button>
        ))}
      </nav>

      {/* Feed Tab */}
      {tab === 'feed' && (
        <div className="card border-0 shadow-sm">
          <div className="card-header bg-white d-flex justify-content-between align-items-center py-2">
            <span className="fw-semibold small">Recent Activity</span>
            <button className="btn btn-sm btn-outline-primary" style={{ fontSize: 10 }}
              onClick={() => api.get('/api/admin/automation/feed').then(r => setFeed(r.data.activities || []))}>
              <i className="bi bi-arrow-clockwise me-1"></i>Refresh
            </button>
          </div>
          <div className="card-body p-0">
            {feed.length > 0 ? (
              <div style={{ maxHeight: 500, overflowY: 'auto' }}>
                {feed.map((a: any, i: number) => (
                  <div key={a.id || i} className="d-flex gap-3 p-3" style={{ borderBottom: '1px solid var(--color-border)', fontSize: 12 }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: a.action === 'created' ? '#3b82f6' : a.action === 'status_changed' ? '#f59e0b' : a.action === 'agent_output' ? '#10b981' : '#9ca3af', marginTop: 5, flexShrink: 0 }}></div>
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
          </div>
        </div>
      )}

      {/* Tickets Tab */}
      {tab === 'tickets' && (
        <div className="card border-0 shadow-sm">
          <div className="card-header bg-white fw-semibold small py-2">Tickets</div>
          <div className="card-body p-0">
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
                        <td><span className="badge bg-light text-dark" style={{ fontSize: 9 }}>{t.type}</span></td>
                        <td><span className="badge" style={{ fontSize: 9, background: t.status === 'done' ? '#10b98120' : t.status === 'in_progress' ? '#f59e0b20' : '#e2e8f020', color: t.status === 'done' ? '#059669' : t.status === 'in_progress' ? '#92400e' : '#9ca3af' }}>{t.status}</span></td>
                        <td><span className="badge" style={{ fontSize: 9, background: t.priority === 'critical' ? '#ef444420' : t.priority === 'high' ? '#f59e0b20' : '#e2e8f020', color: t.priority === 'critical' ? '#ef4444' : t.priority === 'high' ? '#92400e' : '#9ca3af' }}>{t.priority}</span></td>
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
          </div>
        </div>
      )}

      {/* Workforce Tab */}
      {tab === 'workforce' && (
        <div>
          <div className="mb-3">
            <button className="btn btn-sm btn-primary" onClick={runWorkforce} disabled={analyzing}>
              {analyzing ? <><span className="spinner-border spinner-border-sm me-1"></span>Analyzing...</> : <><i className="bi bi-people me-1"></i>Run Workforce Analysis</>}
            </button>
          </div>
          {workforce && (
            <div>
              <div className="row g-3 mb-3">
                {[
                  { label: 'Total Agents', value: workforce.total_agents, color: 'var(--color-primary)' },
                  { label: 'Healthy', value: workforce.healthy, color: '#10b981' },
                  { label: 'Errored', value: workforce.errored, color: '#ef4444' },
                  { label: 'Idle', value: workforce.idle, color: '#f59e0b' },
                ].map(k => (
                  <div key={k.label} className="col-3">
                    <div className="card border-0 shadow-sm text-center py-2">
                      <div className="fw-bold" style={{ fontSize: 18, color: k.color }}>{k.value}</div>
                      <div className="text-muted" style={{ fontSize: 10 }}>{k.label}</div>
                    </div>
                  </div>
                ))}
              </div>
              {workforce.insights?.length > 0 && (
                <div className="card border-0 shadow-sm">
                  <div className="card-header bg-white fw-semibold small py-2">Workforce Insights ({workforce.insights.length})</div>
                  <div className="card-body p-0">
                    {workforce.insights.map((ins: any, i: number) => (
                      <div key={i} className="d-flex gap-2 p-3" style={{ borderBottom: '1px solid var(--color-border)', fontSize: 11 }}>
                        <span className="badge" style={{ fontSize: 8, background: ins.severity === 'high' ? '#ef444420' : ins.severity === 'medium' ? '#f59e0b20' : '#10b98120', color: ins.severity === 'high' ? '#ef4444' : ins.severity === 'medium' ? '#f59e0b' : '#10b981', flexShrink: 0, height: 'fit-content' }}>{ins.severity}</span>
                        <div>
                          <div className="fw-medium">{ins.agent_name}</div>
                          <div className="text-muted" style={{ fontSize: 10 }}>{ins.issue}</div>
                          <div style={{ fontSize: 10, color: '#3b82f6' }}>{ins.recommendation}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
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
            <div className="card border-0 shadow-sm">
              <div className="card-header bg-white fw-semibold small py-2">Ticket Status Distribution</div>
              <div className="card-body">
                {ticketStats.length > 0 ? ticketStats.map((s: any) => (
                  <div key={s.status} className="d-flex justify-content-between mb-1" style={{ fontSize: 12 }}>
                    <span>{s.status}</span><strong>{s.count}</strong>
                  </div>
                )) : <div className="text-muted small">Loading...</div>}
              </div>
            </div>
          </div>
          <div className="col-md-6">
            <div className="card border-0 shadow-sm">
              <div className="card-header bg-white fw-semibold small py-2">Company Directives</div>
              <div className="card-body">
                {(statData.directives || []).length > 0 ? (statData.directives as any[]).map((d: any) => (
                  <div key={d.status} className="d-flex justify-content-between mb-1" style={{ fontSize: 12 }}>
                    <span>{d.status}</span><strong>{d.count}</strong>
                  </div>
                )) : <div className="text-muted small">No directives yet (company layer may not be enabled)</div>}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
