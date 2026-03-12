import React, { useState, useEffect, useCallback } from 'react';

interface Alert {
  id: string;
  type: string;
  severity: number;
  title: string;
  description: string;
  source_type: string;
  impact_area: string;
  urgency: string;
  status: string;
  created_at: string;
}

interface AlertStats {
  openCount: number;
  criticalOpen: number;
  last24h: number;
  byType: Record<string, number>;
  bySeverity: Record<string, number>;
  byStatus: Record<string, number>;
}

const SEVERITY_COLORS: Record<number, string> = {
  1: 'success', 2: 'info', 3: 'warning', 4: 'warning', 5: 'danger',
};
const SEVERITY_LABELS: Record<number, string> = {
  1: 'Info', 2: 'Insight', 3: 'Warning', 4: 'High', 5: 'Critical',
};
const STATUS_COLORS: Record<string, string> = {
  new: 'primary', acknowledged: 'warning', investigating: 'info', resolved: 'success', dismissed: 'secondary',
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function AlertsTab() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [stats, setStats] = useState<AlertStats | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [loading, setLoading] = useState(true);

  const fetchAlerts = useCallback(async () => {
    try {
      const params = new URLSearchParams({ limit: '50' });
      if (statusFilter) params.set('status', statusFilter);
      const res = await fetch(`/api/admin/alerts?${params}`);
      if (res.ok) {
        const data = await res.json();
        setAlerts(data.alerts || data.rows || data);
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, [statusFilter]);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/alerts/stats');
      if (res.ok) setStats(await res.json());
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    fetchAlerts();
    fetchStats();
    const interval = setInterval(() => { fetchAlerts(); fetchStats(); }, 30000);
    return () => clearInterval(interval);
  }, [fetchAlerts, fetchStats]);

  const handleAction = async (alertId: string, action: 'acknowledge' | 'resolve' | 'dismiss') => {
    try {
      await fetch(`/api/admin/alerts/${alertId}/${action}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
      fetchAlerts();
      fetchStats();
    } catch { /* ignore */ }
  };

  return (
    <div>
      {/* Stats Row */}
      {stats && (
        <div className="row g-3 mb-4">
          <div className="col-6 col-md-3">
            <div className="card border-0 shadow-sm text-center p-3">
              <div style={{ fontSize: '11px', color: '#718096', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Open Alerts</div>
              <div style={{ fontSize: '28px', fontWeight: 700, color: '#1a365d' }}>{stats.openCount}</div>
            </div>
          </div>
          <div className="col-6 col-md-3">
            <div className="card border-0 shadow-sm text-center p-3">
              <div style={{ fontSize: '11px', color: '#718096', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Critical</div>
              <div style={{ fontSize: '28px', fontWeight: 700, color: '#e53e3e' }}>{stats.criticalOpen}</div>
            </div>
          </div>
          <div className="col-6 col-md-3">
            <div className="card border-0 shadow-sm text-center p-3">
              <div style={{ fontSize: '11px', color: '#718096', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Last 24h</div>
              <div style={{ fontSize: '28px', fontWeight: 700, color: '#2b6cb0' }}>{stats.last24h}</div>
            </div>
          </div>
          <div className="col-6 col-md-3">
            <div className="card border-0 shadow-sm text-center p-3">
              <div style={{ fontSize: '11px', color: '#718096', textTransform: 'uppercase', letterSpacing: '0.5px' }}>By Type</div>
              <div className="d-flex justify-content-center gap-2 mt-1 flex-wrap">
                {Object.entries(stats.byType).map(([type, count]) => (
                  <span key={type} className="badge bg-secondary" style={{ fontSize: '10px' }}>{type}: {count}</span>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Filter Bar */}
      <div className="d-flex gap-2 mb-3 flex-wrap align-items-center">
        <small className="fw-medium text-muted">Filter:</small>
        {['', 'new', 'acknowledged', 'investigating', 'resolved', 'dismissed'].map((s) => (
          <button
            key={s}
            className={`btn btn-sm ${statusFilter === s ? 'btn-primary' : 'btn-outline-secondary'}`}
            onClick={() => setStatusFilter(s)}
          >
            {s || 'All'}
          </button>
        ))}
      </div>

      {/* Alerts Table */}
      <div className="card border-0 shadow-sm">
        <div className="table-responsive">
          <table className="table table-hover mb-0">
            <thead className="table-light">
              <tr>
                <th style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Severity</th>
                <th style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Title</th>
                <th style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Impact</th>
                <th style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Source</th>
                <th style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Status</th>
                <th style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Age</th>
                <th style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="text-center text-muted py-4">Loading alerts...</td></tr>
              ) : alerts.length === 0 ? (
                <tr><td colSpan={7} className="text-center text-muted py-4">No alerts found</td></tr>
              ) : alerts.map((alert) => (
                <tr key={alert.id}>
                  <td>
                    <span className={`badge bg-${SEVERITY_COLORS[alert.severity] || 'secondary'}`} style={{ fontSize: '10px' }}>
                      {SEVERITY_LABELS[alert.severity] || `S${alert.severity}`}
                    </span>
                  </td>
                  <td style={{ fontSize: '13px', fontWeight: 500, maxWidth: '250px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {alert.title}
                    {alert.description && (
                      <div style={{ fontSize: '11px', color: '#718096', fontWeight: 400 }}>{alert.description.slice(0, 80)}{alert.description.length > 80 ? '...' : ''}</div>
                    )}
                  </td>
                  <td style={{ fontSize: '12px' }}>{alert.impact_area}</td>
                  <td style={{ fontSize: '12px' }}>{alert.source_type}</td>
                  <td>
                    <span className={`badge bg-${STATUS_COLORS[alert.status] || 'secondary'}`} style={{ fontSize: '10px' }}>
                      {alert.status}
                    </span>
                  </td>
                  <td style={{ fontSize: '12px', color: '#718096' }}>{timeAgo(alert.created_at)}</td>
                  <td>
                    {alert.status === 'new' && (
                      <button className="btn btn-sm btn-outline-warning me-1" style={{ fontSize: '10px', padding: '2px 6px' }} onClick={() => handleAction(alert.id, 'acknowledge')}>
                        Ack
                      </button>
                    )}
                    {(alert.status === 'new' || alert.status === 'acknowledged' || alert.status === 'investigating') && (
                      <>
                        <button className="btn btn-sm btn-outline-success me-1" style={{ fontSize: '10px', padding: '2px 6px' }} onClick={() => handleAction(alert.id, 'resolve')}>
                          Resolve
                        </button>
                        <button className="btn btn-sm btn-outline-secondary" style={{ fontSize: '10px', padding: '2px 6px' }} onClick={() => handleAction(alert.id, 'dismiss')}>
                          Dismiss
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
