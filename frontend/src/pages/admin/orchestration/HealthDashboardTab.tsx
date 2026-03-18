import React, { useEffect, useState, useCallback } from 'react';
import OrchCard from '../../../components/orchestration/OrchCard';
import StatusBadge from '../../../components/orchestration/StatusBadge';
import MetricTile from '../../../components/orchestration/MetricTile';
import ContextBar from '../../../components/orchestration/ContextBar';
import InsightPanel from '../../../components/orchestration/InsightPanel';
import OrchSkeleton from '../../../components/orchestration/OrchSkeleton';

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

const agentStatusMap: Record<string, 'running' | 'idle' | 'pending' | 'error' | 'inactive'> = {
  idle: 'idle',
  running: 'running',
  paused: 'pending',
  error: 'error',
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

  if (loading && !report) return <OrchSkeleton variant="card" />;

  if (error && !report) return (
    <div className="alert alert-danger" style={{ fontSize: 13 }}>{error}</div>
  );

  if (!report) return null;

  const criticalCount = report.findings.filter(f => f.severity === 'critical').length;
  const warningCount = report.findings.filter(f => f.severity === 'warning').length;

  return (
    <div>
      {/* Context Bar */}
      <ContextBar
        title="System Health"
        description="Real-time orchestration health monitoring"
        metrics={[
          { label: 'Mini-Sections', value: report.counts.miniSections, color: 'var(--orch-accent-blue)' },
          { label: 'Enrollments', value: report.counts.enrollments, color: 'var(--orch-accent-green)' },
          { label: 'Findings', value: report.findings.length, color: report.findings.length === 0 ? 'var(--orch-accent-green)' : 'var(--orch-accent-yellow)' },
        ]}
        actions={
          <button
            className="btn btn-sm btn-outline-primary"
            onClick={() => { fetchReport(); fetchMonitoringData(); }}
            disabled={loading}
          >
            <i className="bi bi-arrow-clockwise me-1" />
            {loading ? 'Checking...' : 'Refresh'}
          </button>
        }
      />

      {/* Monitoring Agents */}
      {(monitorAgents.length > 0 || latestSnapshot) && (
        <OrchCard title="Monitoring Agents" className="mb-3"
          headerRight={
            latestSnapshot && latestSnapshot.health_score != null ? (
              <div className="d-flex align-items-center gap-2">
                <span style={{ fontSize: 11, color: 'var(--orch-text-muted)' }}>Automated scan:</span>
                <StatusBadge
                  status={latestSnapshot.status === 'healthy' ? 'healthy' : latestSnapshot.status === 'degraded' ? 'degraded' : 'critical'}
                  label={`${latestSnapshot.health_score}/100`}
                  glow
                />
                <span style={{ fontSize: 11, color: 'var(--orch-text-dim)' }}>{timeAgo(latestSnapshot.scan_timestamp)}</span>
              </div>
            ) : undefined
          }
        >
          <div className="d-flex flex-wrap gap-3">
            {monitorAgents.map((a) => (
              <div key={a.id} className="d-flex align-items-center gap-2" style={{ fontSize: 12 }}>
                <StatusBadge
                  status={agentStatusMap[a.status] || 'idle'}
                  label={a.agent_name.replace('Agent', '')}
                  pulse={a.status === 'running'}
                />
                <span style={{ color: 'var(--orch-text-dim)', fontSize: 11 }}>{timeAgo(a.last_run_at)}</span>
                {a.error_count > 0 && (
                  <StatusBadge status="error" label={`${a.error_count} err`} size="sm" />
                )}
              </div>
            ))}
          </div>
        </OrchCard>
      )}

      {/* Summary Metrics */}
      <div className="d-flex gap-3 mb-4 flex-wrap">
        <div className="flex-fill">
          <MetricTile
            label="Mini-Sections Configured"
            value={report.counts.miniSections}
            color="blue"
            subtitle={`across ${report.counts.lessons} lessons in ${report.counts.modules} modules`}
            icon="bi bi-layers"
          />
        </div>
        <div className="flex-fill">
          <MetricTile
            label="Active Enrollments"
            value={report.counts.enrollments}
            color="green"
            subtitle={`${report.counts.lessonInstances} lesson instances tracked`}
            icon="bi bi-people"
          />
        </div>
        <div className="flex-fill">
          <MetricTile
            label="Findings"
            value={report.findings.length}
            color={report.findings.length === 0 ? 'green' : criticalCount > 0 ? 'red' : 'yellow'}
            subtitle={
              report.findings.length === 0
                ? 'All clear'
                : `${criticalCount} critical, ${warningCount} warning`
            }
            icon="bi bi-shield-check"
          />
        </div>
      </div>

      {/* Findings Panel */}
      <div className="mb-3">
        <InsightPanel
          title={`Findings (${report.findings.length})`}
          items={report.findings.map(f => ({
            severity: f.severity,
            message: f.message,
            category: f.category,
          }))}
          emptyMessage="All systems healthy — no issues detected"
        />
      </div>

      {/* Entity Inventory */}
      <OrchCard title="Entity Inventory" noPadding className="mb-3">
        <div className="table-responsive">
          <table className="table table-hover mb-0" style={{ fontSize: 13 }}>
            <thead>
              <tr>
                <th style={{ fontSize: 12 }}>Entity</th>
                <th style={{ fontSize: 12, width: 120 }}>Count</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(report.counts).map(([key, value]) => (
                <tr key={key}>
                  <td>{countLabels[key] || key}</td>
                  <td>
                    <StatusBadge
                      status={value === 0 ? 'critical' : 'healthy'}
                      label={String(value)}
                      size="sm"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </OrchCard>

      {/* Backfill Status */}
      {report.backfillStatus && (
        <OrchCard title="Prompt Backfill Status" className="mb-3">
          <div className="d-flex gap-4 flex-wrap">
            <MetricTile label="Total" value={report.backfillStatus.total ?? '-'} color="blue" />
            <MetricTile label="With Inline" value={report.backfillStatus.withInline ?? '-'} color="green" />
            <MetricTile label="FK Only" value={report.backfillStatus.fkOnly ?? '-'} color="yellow" />
            <MetricTile label="Neither" value={report.backfillStatus.neither ?? '-'} color={report.backfillStatus.neither > 0 ? 'red' : 'default'} />
          </div>
        </OrchCard>
      )}
    </div>
  );
};

export default HealthDashboardTab;
