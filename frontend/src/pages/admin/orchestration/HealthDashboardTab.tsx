import React, { useEffect, useState, useCallback } from 'react';

interface MonitoringAgent {
  id: string;
  agent_name: string;
  status: string;
  enabled: boolean;
  last_run_at: string | null;
  error_count: number;
}

interface LatestSnapshot {
  health_score: number | null;
  status: string;
  scan_timestamp: string | null;
}

interface Props { token: string; apiUrl: string; }

interface Finding {
  severity: 'critical' | 'warning' | 'info';
  category: string;
  message: string;
  count?: number;
}

interface HealthReport {
  status: 'healthy' | 'degraded' | 'critical';
  timestamp: string;
  counts: Record<string, number>;
  findings: Finding[];
  integrity: any;
  backfillStatus: any;
}

const severityBadge: Record<string, string> = {
  critical: 'bg-danger',
  warning: 'bg-warning text-dark',
  info: 'bg-info',
};

const statusColor: Record<string, string> = {
  healthy: 'var(--color-accent, #38a169)',
  degraded: '#d69e2e',
  critical: 'var(--color-secondary, #e53e3e)',
};

const statusLabel: Record<string, string> = {
  healthy: 'Healthy',
  degraded: 'Degraded',
  critical: 'Critical',
};

const countLabels: Record<string, string> = {
  modules: 'Curriculum Modules',
  lessons: 'Curriculum Lessons',
  miniSections: 'Mini-Sections',
  promptTemplates: 'Prompt Templates',
  variableDefinitions: 'Variable Definitions',
  skillDefinitions: 'Skill Definitions',
  artifactDefinitions: 'Artifact Definitions',
  enrollments: 'Enrollments',
  lessonInstances: 'Lesson Instances',
  sessionGates: 'Session Gates',
};

const agentStatusColor: Record<string, string> = {
  idle: 'secondary',
  running: 'primary',
  paused: 'warning',
  error: 'danger',
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

const HealthDashboardTab: React.FC<Props> = ({ token, apiUrl }) => {
  const [report, setReport] = useState<HealthReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [monitorAgents, setMonitorAgents] = useState<MonitoringAgent[]>([]);
  const [latestSnapshot, setLatestSnapshot] = useState<LatestSnapshot | null>(null);

  const fetchReport = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${apiUrl}/api/admin/orchestration/health-report`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`Failed: ${res.status}`);
      const data = await res.json();
      setReport(data);
    } catch (err: any) { setError(err.message || 'Failed to load health report'); }
    setLoading(false);
  }, [token, apiUrl]);

  const fetchMonitoringData = useCallback(async () => {
    try {
      const [agentsRes, snapRes] = await Promise.allSettled([
        fetch(`${apiUrl}/api/admin/orchestration/monitoring/agents`, {
          headers: { Authorization: `Bearer ${token}` },
        }).then(r => r.ok ? r.json() : []),
        fetch(`${apiUrl}/api/admin/orchestration/health-snapshots/latest`, {
          headers: { Authorization: `Bearer ${token}` },
        }).then(r => r.ok ? r.json() : null),
      ]);
      if (agentsRes.status === 'fulfilled') setMonitorAgents(agentsRes.value);
      if (snapRes.status === 'fulfilled') setLatestSnapshot(snapRes.value);
    } catch { /* silent */ }
  }, [token, apiUrl]);

  useEffect(() => { fetchReport(); fetchMonitoringData(); }, [fetchReport, fetchMonitoringData]);

  if (loading && !report) return (
    <div className="text-center py-5">
      <div className="spinner-border text-primary" role="status">
        <span className="visually-hidden">Loading...</span>
      </div>
    </div>
  );

  if (error && !report) return (
    <div className="alert alert-danger" style={{ fontSize: 13 }}>{error}</div>
  );

  if (!report) return null;

  const criticalCount = report.findings.filter(f => f.severity === 'critical').length;
  const warningCount = report.findings.filter(f => f.severity === 'warning').length;
  const infoCount = report.findings.filter(f => f.severity === 'info').length;

  return (
    <div>
      {/* Automated Monitoring Status */}
      {(monitorAgents.length > 0 || latestSnapshot) && (
        <div className="card border-0 shadow-sm mb-3">
          <div className="card-body py-2">
            <div className="d-flex flex-wrap align-items-center gap-3">
              {monitorAgents.map((a) => (
                <div key={a.id} className="d-flex align-items-center gap-1" style={{ fontSize: 12 }}>
                  <span className={`badge bg-${agentStatusColor[a.status] || 'secondary'}`} style={{ fontSize: 10 }}>
                    {a.status}
                  </span>
                  <span className="fw-medium">{a.agent_name.replace('Agent', '')}</span>
                  <span className="text-muted">{timeAgo(a.last_run_at)}</span>
                  {a.error_count > 0 && (
                    <span className="badge bg-danger" style={{ fontSize: 9 }}>{a.error_count} err</span>
                  )}
                </div>
              ))}
              {latestSnapshot && latestSnapshot.health_score != null && (
                <div className="ms-auto d-flex align-items-center gap-2" style={{ fontSize: 12 }}>
                  <span className="text-muted">Automated scan:</span>
                  <span className={`badge bg-${statusColor[latestSnapshot.status] === statusColor.healthy ? 'success' : latestSnapshot.status === 'degraded' ? 'warning' : 'danger'}`}>
                    {latestSnapshot.health_score}/100
                  </span>
                  <span className="text-muted">{timeAgo(latestSnapshot.scan_timestamp)}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="d-flex justify-content-between align-items-center mb-3">
        <div>
          <span className="fw-semibold" style={{ fontSize: 14 }}>System Health</span>
          <span
            className="badge ms-2"
            style={{ fontSize: 11, backgroundColor: statusColor[report.status], color: report.status === 'degraded' ? '#000' : '#fff' }}
          >
            {statusLabel[report.status]}
          </span>
        </div>
        <div className="d-flex gap-2 align-items-center">
          <span className="text-muted" style={{ fontSize: 11 }}>
            Last checked: {new Date(report.timestamp).toLocaleString()}
          </span>
          <button className="btn btn-sm btn-outline-primary" onClick={fetchReport} disabled={loading}>
            {loading ? 'Checking...' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="row g-3 mb-4">
        <div className="col-md-4">
          <div className="card border-0 shadow-sm text-center p-3">
            <div className="fw-bold" style={{ fontSize: 28, color: 'var(--color-primary, #1a365d)' }}>
              {report.counts.miniSections}
            </div>
            <div className="text-muted small">Mini-Sections Configured</div>
            <div className="mt-1" style={{ fontSize: 11 }}>
              across {report.counts.lessons} lessons in {report.counts.modules} modules
            </div>
          </div>
        </div>
        <div className="col-md-4">
          <div className="card border-0 shadow-sm text-center p-3">
            <div className="fw-bold" style={{ fontSize: 28, color: 'var(--color-accent, #38a169)' }}>
              {report.counts.enrollments}
            </div>
            <div className="text-muted small">Active Enrollments</div>
            <div className="mt-1" style={{ fontSize: 11 }}>
              {report.counts.lessonInstances} lesson instances tracked
            </div>
          </div>
        </div>
        <div className="col-md-4">
          <div className="card border-0 shadow-sm text-center p-3">
            <div className="fw-bold" style={{ fontSize: 28, color: report.findings.length === 0 ? 'var(--color-accent)' : statusColor[report.status] }}>
              {report.findings.length}
            </div>
            <div className="text-muted small">Findings</div>
            <div className="mt-1" style={{ fontSize: 11 }}>
              {criticalCount > 0 && <span className="badge bg-danger me-1" style={{ fontSize: 10 }}>{criticalCount} critical</span>}
              {warningCount > 0 && <span className="badge bg-warning text-dark me-1" style={{ fontSize: 10 }}>{warningCount} warning</span>}
              {infoCount > 0 && <span className="badge bg-info me-1" style={{ fontSize: 10 }}>{infoCount} info</span>}
              {report.findings.length === 0 && <span className="text-muted">All clear</span>}
            </div>
          </div>
        </div>
      </div>

      {/* Entity Counts */}
      <div className="card border-0 shadow-sm mb-3">
        <div className="card-header bg-white fw-semibold" style={{ fontSize: 14 }}>Entity Counts</div>
        <div className="table-responsive">
          <table className="table table-hover mb-0" style={{ fontSize: 13 }}>
            <thead className="table-light">
              <tr>
                <th style={{ fontSize: 12 }}>Entity</th>
                <th style={{ fontSize: 12, width: 100 }}>Count</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(report.counts).map(([key, value]) => (
                <tr key={key}>
                  <td>{countLabels[key] || key}</td>
                  <td>
                    <span className={`badge ${value === 0 ? 'bg-danger' : 'bg-secondary'}`} style={{ fontSize: 11 }}>
                      {value}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Findings */}
      {report.findings.length > 0 && (
        <div className="card border-0 shadow-sm mb-3">
          <div className="card-header bg-white fw-semibold" style={{ fontSize: 14 }}>
            Findings ({report.findings.length})
          </div>
          <div className="table-responsive">
            <table className="table table-hover mb-0" style={{ fontSize: 13 }}>
              <thead className="table-light">
                <tr>
                  <th style={{ fontSize: 12, width: 90 }}>Severity</th>
                  <th style={{ fontSize: 12, width: 120 }}>Category</th>
                  <th style={{ fontSize: 12 }}>Description</th>
                </tr>
              </thead>
              <tbody>
                {report.findings.map((f, idx) => (
                  <tr key={idx}>
                    <td><span className={`badge ${severityBadge[f.severity]}`} style={{ fontSize: 10 }}>{f.severity}</span></td>
                    <td style={{ fontSize: 12 }}>{f.category}</td>
                    <td>{f.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Backfill Status */}
      {report.backfillStatus && (
        <div className="card border-0 shadow-sm mb-3">
          <div className="card-header bg-white fw-semibold" style={{ fontSize: 14 }}>Prompt Backfill Status</div>
          <div className="card-body py-2">
            <div className="d-flex gap-4" style={{ fontSize: 13 }}>
              <div>Total: <strong>{report.backfillStatus.total ?? '-'}</strong></div>
              <div>With Inline: <strong>{report.backfillStatus.withInline ?? '-'}</strong></div>
              <div>FK Only: <strong>{report.backfillStatus.fkOnly ?? '-'}</strong></div>
              <div>Neither: <strong>{report.backfillStatus.neither ?? '-'}</strong></div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default HealthDashboardTab;
