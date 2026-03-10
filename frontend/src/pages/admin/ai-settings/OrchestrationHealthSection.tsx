import React, { useState, useEffect, useCallback } from 'react';
import api from '../../../utils/api';

interface HealthSnapshot {
  id: string;
  scan_timestamp: string;
  health_score: number;
  status: 'healthy' | 'degraded' | 'critical';
  component_scores: Record<string, number>;
  findings: Array<{ severity: string; category: string; message: string; count?: number }>;
  duration_ms: number;
}

interface MonitoringAgent {
  id: string;
  agent_name: string;
  agent_type: string;
  status: string;
  enabled: boolean;
  last_run_at: string | null;
  run_count: number;
  error_count: number;
  last_error: string | null;
  last_error_at: string | null;
  schedule: string;
}

const HEALTH_COLORS: Record<string, string> = {
  healthy: 'success',
  degraded: 'warning',
  critical: 'danger',
  no_data: 'secondary',
};

const STATUS_COLORS: Record<string, string> = {
  idle: 'secondary',
  running: 'primary',
  paused: 'warning',
  error: 'danger',
};

const COMPONENT_LABELS: Record<string, string> = {
  curriculum: 'Curriculum',
  prompts: 'Prompts',
  artifacts: 'Artifacts',
  students: 'Students',
  gating: 'Gating',
};

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return 'Never';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function scoreColor(score: number): string {
  if (score >= 80) return 'success';
  if (score >= 60) return 'warning';
  return 'danger';
}

export default function OrchestrationHealthSection() {
  const [latest, setLatest] = useState<HealthSnapshot | null>(null);
  const [agents, setAgents] = useState<MonitoringAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanLoading, setScanLoading] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [snapRes, agentsRes] = await Promise.allSettled([
        api.get('/api/admin/orchestration/health-snapshots/latest'),
        api.get('/api/admin/orchestration/monitoring/agents'),
      ]);
      if (snapRes.status === 'fulfilled') setLatest(snapRes.value.data);
      if (agentsRes.status === 'fulfilled') setAgents(agentsRes.value.data);
    } catch (err) {
      console.error('Failed to fetch orchestration health:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleScan = async () => {
    setScanLoading(true);
    try {
      await api.post('/api/admin/orchestration/monitoring/scan');
      await fetchData();
    } catch (err) {
      console.error('Failed to trigger scan:', err);
    } finally {
      setScanLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="text-center py-4">
        <div className="spinner-border spinner-border-sm text-primary" role="status">
          <span className="visually-hidden">Loading...</span>
        </div>
      </div>
    );
  }

  const hasData = latest && latest.health_score != null;

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h6 className="mb-0 fw-semibold">Orchestration Health</h6>
        <button
          className="btn btn-sm btn-outline-primary"
          onClick={handleScan}
          disabled={scanLoading}
        >
          {scanLoading ? 'Scanning...' : 'Run Scan'}
        </button>
      </div>

      {!hasData ? (
        <div className="card border-0 shadow-sm">
          <div className="card-body text-center text-muted py-4">
            No orchestration health data yet. Click "Run Scan" to generate the first snapshot.
          </div>
        </div>
      ) : (
        <>
          {/* Health Score + Component Bars */}
          <div className="row g-3 mb-3">
            <div className="col-md-4">
              <div className="card border-0 shadow-sm text-center h-100">
                <div className="card-body py-3">
                  <div className="small text-muted mb-1">Health Score</div>
                  <div
                    className="fw-bold mb-1"
                    style={{ fontSize: 36, color: `var(--bs-${scoreColor(latest.health_score)})` }}
                  >
                    {latest.health_score}
                  </div>
                  <span className={`badge bg-${HEALTH_COLORS[latest.status]}`}>
                    {latest.status}
                  </span>
                  <div className="text-muted mt-2" style={{ fontSize: 11 }}>
                    Last scan: {timeAgo(latest.scan_timestamp)}
                  </div>
                </div>
              </div>
            </div>

            <div className="col-md-8">
              <div className="card border-0 shadow-sm h-100">
                <div className="card-body py-3">
                  <div className="small fw-medium mb-2">Component Scores</div>
                  {latest.component_scores && Object.entries(latest.component_scores).map(([key, score]) => (
                    <div key={key} className="d-flex align-items-center mb-2">
                      <span className="small" style={{ width: 80 }}>
                        {COMPONENT_LABELS[key] || key}
                      </span>
                      <div className="progress flex-grow-1 me-2" style={{ height: 8 }}>
                        <div
                          className={`progress-bar bg-${scoreColor(score)}`}
                          style={{ width: `${score}%` }}
                        />
                      </div>
                      <span className="small fw-medium" style={{ width: 30 }}>
                        {score}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Findings */}
          {latest.findings && latest.findings.length > 0 && (
            <div className="card border-0 shadow-sm mb-3">
              <div className="card-header bg-white fw-semibold" style={{ fontSize: 13 }}>
                Findings ({latest.findings.length})
              </div>
              <div className="table-responsive">
                <table className="table table-hover mb-0" style={{ fontSize: 12 }}>
                  <thead className="table-light">
                    <tr>
                      <th style={{ width: 80 }}>Severity</th>
                      <th style={{ width: 100 }}>Category</th>
                      <th>Message</th>
                    </tr>
                  </thead>
                  <tbody>
                    {latest.findings.map((f, idx) => (
                      <tr key={idx}>
                        <td>
                          <span className={`badge bg-${f.severity === 'critical' ? 'danger' : f.severity === 'warning' ? 'warning' : 'info'}`} style={{ fontSize: 10 }}>
                            {f.severity}
                          </span>
                        </td>
                        <td>{f.category}</td>
                        <td>{f.message}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* Monitoring Agents Table */}
      {agents.length > 0 && (
        <div className="card border-0 shadow-sm">
          <div className="card-header bg-white fw-semibold" style={{ fontSize: 13 }}>
            Monitoring Agents ({agents.length})
          </div>
          <div className="table-responsive">
            <table className="table table-hover mb-0" style={{ fontSize: 12 }}>
              <thead className="table-light">
                <tr>
                  <th>Agent</th>
                  <th>Schedule</th>
                  <th>Status</th>
                  <th>Runs</th>
                  <th>Errors</th>
                  <th>Last Run</th>
                </tr>
              </thead>
              <tbody>
                {agents.map((a) => (
                  <tr key={a.id}>
                    <td className="fw-medium">{a.agent_name}</td>
                    <td className="text-muted">{a.schedule}</td>
                    <td>
                      <span className={`badge bg-${STATUS_COLORS[a.status] || 'secondary'}`}>
                        {a.status}
                      </span>
                      {!a.enabled && <span className="badge bg-danger ms-1">off</span>}
                    </td>
                    <td>{a.run_count}</td>
                    <td>
                      {a.error_count > 0 ? (
                        <span className="badge bg-danger">{a.error_count}</span>
                      ) : (
                        <span className="text-muted">0</span>
                      )}
                    </td>
                    <td className="text-muted">{timeAgo(a.last_run_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
