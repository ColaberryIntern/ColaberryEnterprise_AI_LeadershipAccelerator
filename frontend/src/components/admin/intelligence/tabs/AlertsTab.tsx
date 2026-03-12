import React, { useState, useEffect, useCallback } from 'react';
import FeedbackButtons from '../FeedbackButtons';

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
  const [selectedAlert, setSelectedAlert] = useState<Alert | null>(null);

  useEffect(() => {
    if (!selectedAlert) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelectedAlert(null);
    };
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [selectedAlert]);

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
        <>
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
          <div className="mb-3">
            <FeedbackButtons contentType="alert_stats" contentKey="alert_stats_overview" />
          </div>
        </>
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
                  <td style={{ fontSize: '0.82rem', fontWeight: 500, maxWidth: '250px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={() => setSelectedAlert(alert)}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedAlert(alert); } }}
                      style={{ color: 'var(--color-primary-light, #2b6cb0)', cursor: 'pointer', textDecoration: 'none' }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLSpanElement).style.textDecoration = 'underline'; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLSpanElement).style.textDecoration = 'none'; }}
                    >
                      {alert.title}
                    </span>
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

      {/* Alert Detail Modal */}
      {selectedAlert && (
        <>
          <div
            className="modal-backdrop show"
            style={{ zIndex: 1050 }}
            onClick={() => setSelectedAlert(null)}
          />
          <div
            className="modal show d-block"
            role="dialog"
            aria-modal="true"
            aria-labelledby="alert-detail-title"
            style={{ zIndex: 1055 }}
            onClick={(e) => { if (e.target === e.currentTarget) setSelectedAlert(null); }}
          >
            <div className="modal-dialog modal-dialog-centered modal-lg">
              <div className="modal-content border-0 shadow-sm">
                <div className="modal-header py-2 bg-white">
                  <h6 id="alert-detail-title" className="modal-title mb-0" style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--color-primary, #1a365d)' }}>
                    {selectedAlert.title}
                    <span
                      className={`badge bg-${SEVERITY_COLORS[selectedAlert.severity] || 'secondary'} ms-2`}
                      style={{ fontSize: '0.65rem', verticalAlign: 'middle' }}
                    >
                      {SEVERITY_LABELS[selectedAlert.severity] || `S${selectedAlert.severity}`}
                    </span>
                  </h6>
                  <button type="button" className="btn-close" aria-label="Close" onClick={() => setSelectedAlert(null)} />
                </div>
                <div className="modal-body py-3">
                  {selectedAlert.description && (
                    <div className="mb-3">
                      <div className="fw-medium mb-1" style={{ fontSize: '0.75rem', color: 'var(--color-text-light, #718096)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Description</div>
                      <p className="mb-0" style={{ fontSize: '0.75rem', color: 'var(--color-text, #2d3748)', lineHeight: 1.6 }}>{selectedAlert.description}</p>
                    </div>
                  )}
                  <div className="row g-3">
                    <div className="col-6 col-md-3">
                      <div className="fw-medium mb-1" style={{ fontSize: '0.75rem', color: 'var(--color-text-light, #718096)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Impact Area</div>
                      <div style={{ fontSize: '0.75rem' }}>{selectedAlert.impact_area || '—'}</div>
                    </div>
                    <div className="col-6 col-md-3">
                      <div className="fw-medium mb-1" style={{ fontSize: '0.75rem', color: 'var(--color-text-light, #718096)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Source Type</div>
                      <div style={{ fontSize: '0.75rem' }}>{selectedAlert.source_type || '—'}</div>
                    </div>
                    <div className="col-6 col-md-3">
                      <div className="fw-medium mb-1" style={{ fontSize: '0.75rem', color: 'var(--color-text-light, #718096)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Status</div>
                      <span className={`badge bg-${STATUS_COLORS[selectedAlert.status] || 'secondary'}`} style={{ fontSize: '0.65rem' }}>
                        {selectedAlert.status}
                      </span>
                    </div>
                    <div className="col-6 col-md-3">
                      <div className="fw-medium mb-1" style={{ fontSize: '0.75rem', color: 'var(--color-text-light, #718096)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Created</div>
                      <div style={{ fontSize: '0.75rem' }}>{new Date(selectedAlert.created_at).toLocaleString()}</div>
                    </div>
                  </div>
                  {selectedAlert.type && (
                    <div className="mt-3">
                      <div className="fw-medium mb-1" style={{ fontSize: '0.75rem', color: 'var(--color-text-light, #718096)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Type</div>
                      <span className="badge bg-secondary" style={{ fontSize: '0.65rem' }}>{selectedAlert.type}</span>
                    </div>
                  )}
                  {selectedAlert.urgency && (
                    <div className="mt-3">
                      <div className="fw-medium mb-1" style={{ fontSize: '0.75rem', color: 'var(--color-text-light, #718096)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Urgency</div>
                      <div style={{ fontSize: '0.75rem' }}>{selectedAlert.urgency}</div>
                    </div>
                  )}
                </div>
                <div className="modal-footer py-2">
                  {selectedAlert.status === 'new' && (
                    <button
                      className="btn btn-sm btn-outline-warning"
                      style={{ fontSize: '0.75rem' }}
                      onClick={() => { handleAction(selectedAlert.id, 'acknowledge'); setSelectedAlert(null); }}
                    >
                      Acknowledge
                    </button>
                  )}
                  {(selectedAlert.status === 'new' || selectedAlert.status === 'acknowledged' || selectedAlert.status === 'investigating') && (
                    <>
                      <button
                        className="btn btn-sm btn-outline-success"
                        style={{ fontSize: '0.75rem' }}
                        onClick={() => { handleAction(selectedAlert.id, 'resolve'); setSelectedAlert(null); }}
                      >
                        Resolve
                      </button>
                      <button
                        className="btn btn-sm btn-outline-secondary"
                        style={{ fontSize: '0.75rem' }}
                        onClick={() => { handleAction(selectedAlert.id, 'dismiss'); setSelectedAlert(null); }}
                      >
                        Dismiss
                      </button>
                    </>
                  )}
                  <button className="btn btn-sm btn-primary" style={{ fontSize: '0.75rem' }} onClick={() => setSelectedAlert(null)}>
                    Close
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
