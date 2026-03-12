import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';

interface SecurityDashboard {
  threats: number;
  open_tickets: number;
  critical_tickets: number;
  scans_today: number;
  fleet_health: number;
  agents: SecurityAgent[];
  recent_events: SecurityEvent[];
}

interface SecurityAgent {
  id: string;
  agent_name: string;
  agent_type: string;
  status: string;
  enabled: boolean;
  last_run_at: string | null;
  run_count: number;
  error_count: number;
  avg_duration_ms: number | null;
  schedule: string;
  description: string;
}

interface SecurityEvent {
  id: string;
  event_type: string;
  title: string;
  description: string;
  severity: string;
  metadata: Record<string, any>;
  created_at: string;
}

const SEVERITY_BADGE: Record<string, string> = {
  critical: 'bg-danger',
  high: 'bg-warning text-dark',
  normal: 'bg-success',
  medium: 'bg-info',
  low: 'bg-secondary',
};

const STATUS_BADGE: Record<string, string> = {
  idle: 'bg-success',
  running: 'bg-primary',
  paused: 'bg-warning text-dark',
  error: 'bg-danger',
};

const EVENT_TYPE_LABEL: Record<string, string> = {
  threat_detected: 'Threat',
  security_alert: 'Alert',
  security_scan: 'Scan',
};

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return 'Never';
  const diff = Date.now() - new Date(dateStr).getTime();
  if (diff < 60000) return 'Just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return `${Math.floor(diff / 86400000)}d ago`;
}

export default function SecurityTab() {
  const [data, setData] = useState<SecurityDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [eventFilter, setEventFilter] = useState<string>('all');

  const fetchData = useCallback(async () => {
    try {
      const res = await axios.get('/api/admin/security/dashboard');
      setData(res.data);
    } catch (err) {
      console.error('Failed to load security dashboard:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const handleScan = async () => {
    setScanning(true);
    try {
      await axios.post('/api/admin/security/scan');
      await fetchData();
    } catch (err) {
      console.error('Security scan failed:', err);
    } finally {
      setScanning(false);
    }
  };

  if (loading) {
    return (
      <div className="text-center py-5">
        <div className="spinner-border spinner-border-sm text-danger" role="status">
          <span className="visually-hidden">Loading security dashboard...</span>
        </div>
      </div>
    );
  }

  if (!data) return <div className="text-muted small">Failed to load security data.</div>;

  const filteredEvents = eventFilter === 'all'
    ? data.recent_events
    : data.recent_events.filter((e) => e.event_type === eventFilter);

  return (
    <div>
      {/* Summary Cards */}
      <div className="row g-3 mb-4">
        <div className="col-6 col-lg-3">
          <div className="card border-0 shadow-sm">
            <div className="card-body text-center py-3">
              <div className="small text-muted mb-1">Active Threats (24h)</div>
              <div className={`fs-3 fw-bold ${data.threats > 0 ? 'text-danger' : 'text-success'}`}>
                {data.threats}
              </div>
            </div>
          </div>
        </div>
        <div className="col-6 col-lg-3">
          <div className="card border-0 shadow-sm">
            <div className="card-body text-center py-3">
              <div className="small text-muted mb-1">Open Tickets</div>
              <div className={`fs-3 fw-bold ${data.critical_tickets > 0 ? 'text-danger' : data.open_tickets > 0 ? 'text-warning' : 'text-success'}`}>
                {data.open_tickets}
                {data.critical_tickets > 0 && (
                  <span className="badge bg-danger ms-2 fs-6">{data.critical_tickets} crit</span>
                )}
              </div>
            </div>
          </div>
        </div>
        <div className="col-6 col-lg-3">
          <div className="card border-0 shadow-sm">
            <div className="card-body text-center py-3">
              <div className="small text-muted mb-1">Scans Today</div>
              <div className="fs-3 fw-bold text-primary">{data.scans_today}</div>
            </div>
          </div>
        </div>
        <div className="col-6 col-lg-3">
          <div className="card border-0 shadow-sm">
            <div className="card-body text-center py-3">
              <div className="small text-muted mb-1">Fleet Health</div>
              <div className={`fs-3 fw-bold ${data.fleet_health >= 80 ? 'text-success' : data.fleet_health >= 50 ? 'text-warning' : 'text-danger'}`}>
                {data.fleet_health}%
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Manual Scan Button */}
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h6 className="mb-0 fw-semibold">Security Agent Fleet</h6>
        <button
          className="btn btn-sm btn-outline-danger"
          onClick={handleScan}
          disabled={scanning}
        >
          {scanning ? (
            <>
              <span className="spinner-border spinner-border-sm me-1" role="status">
                <span className="visually-hidden">Scanning...</span>
              </span>
              Scanning...
            </>
          ) : (
            'Run Full Scan'
          )}
        </button>
      </div>

      {/* Agent Fleet Table */}
      <div className="card border-0 shadow-sm mb-4">
        <div className="table-responsive">
          <table className="table table-hover mb-0">
            <thead className="table-light">
              <tr>
                <th className="small fw-medium">Agent</th>
                <th className="small fw-medium">Status</th>
                <th className="small fw-medium">Last Run</th>
                <th className="small fw-medium text-end">Runs</th>
                <th className="small fw-medium text-end">Errors</th>
                <th className="small fw-medium text-end">Avg (ms)</th>
                <th className="small fw-medium">Schedule</th>
              </tr>
            </thead>
            <tbody>
              {data.agents.map((agent) => (
                <tr key={agent.id} className={!agent.enabled ? 'text-muted' : ''}>
                  <td>
                    <div className="small fw-medium">{agent.agent_name.replace(/Agent$/, '')}</div>
                    <div className="text-muted" style={{ fontSize: '0.7rem' }}>{agent.description?.slice(0, 60)}...</div>
                  </td>
                  <td>
                    <span className={`badge ${STATUS_BADGE[agent.status] || 'bg-secondary'}`}>
                      {agent.status}
                    </span>
                    {!agent.enabled && <span className="badge bg-secondary ms-1">disabled</span>}
                  </td>
                  <td className="small">{timeAgo(agent.last_run_at)}</td>
                  <td className="small text-end">{agent.run_count}</td>
                  <td className={`small text-end ${agent.error_count > 0 ? 'text-danger fw-medium' : ''}`}>
                    {agent.error_count}
                  </td>
                  <td className="small text-end">{agent.avg_duration_ms ?? '—'}</td>
                  <td className="small text-muted">{agent.schedule}</td>
                </tr>
              ))}
              {data.agents.length === 0 && (
                <tr><td colSpan={7} className="text-center text-muted small py-3">No security agents registered</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Event Feed */}
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h6 className="mb-0 fw-semibold">Security Event Feed (24h)</h6>
        <div className="d-flex gap-1">
          {['all', 'threat_detected', 'security_alert', 'security_scan'].map((type) => (
            <button
              key={type}
              className={`btn btn-sm ${eventFilter === type ? 'btn-dark' : 'btn-outline-secondary'}`}
              onClick={() => setEventFilter(type)}
            >
              {type === 'all' ? 'All' : EVENT_TYPE_LABEL[type] || type}
            </button>
          ))}
        </div>
      </div>

      <div className="card border-0 shadow-sm">
        <div className="card-body p-0">
          {filteredEvents.length === 0 ? (
            <div className="text-center text-muted small py-4">No events in the last 24 hours</div>
          ) : (
            <div className="list-group list-group-flush">
              {filteredEvents.slice(0, 30).map((event) => (
                <div key={event.id} className="list-group-item px-3 py-2">
                  <div className="d-flex justify-content-between align-items-start">
                    <div className="flex-grow-1">
                      <div className="d-flex align-items-center gap-2 mb-1">
                        <span className={`badge ${SEVERITY_BADGE[event.severity] || 'bg-secondary'}`}>
                          {event.severity}
                        </span>
                        <span className="badge bg-light text-dark border">
                          {EVENT_TYPE_LABEL[event.event_type] || event.event_type}
                        </span>
                        <span className="small fw-medium">{event.title}</span>
                      </div>
                      {event.description && (
                        <div className="text-muted" style={{ fontSize: '0.75rem' }}>
                          {event.description.slice(0, 200)}
                        </div>
                      )}
                    </div>
                    <span className="text-muted small ms-3 text-nowrap">{timeAgo(event.created_at)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
