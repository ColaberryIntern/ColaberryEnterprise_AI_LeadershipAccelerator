import React, { useState, useEffect, useCallback } from 'react';
import api from '../../../utils/api';

interface DepartmentHealth {
  name: string;
  health: string;
  agent_count: number;
  last_report_at: string | null;
}

interface InsightItem {
  id: string;
  problem: string;
  risk_score: number;
  risk_tier: string;
  confidence: number;
  status: string;
  timestamp: string;
}

interface TaskItem {
  id: string;
  type: string;
  description: string;
  department: string | null;
  agent: string | null;
  status: string;
  priority: string;
  created_at: string;
}

interface DeptReport {
  department: string;
  summary: string;
  anomalies: string[] | null;
  recommendations: string[] | null;
  report_type: string;
  created_at: string;
}

interface InitiativeItem {
  id: string;
  title: string;
  initiative_type: string;
  priority: string;
  status: string;
  ticket_id: string | null;
  involved_departments: string[] | null;
  involved_agents: string[] | null;
  created_at: string;
}

interface DashboardData {
  status: {
    strategic_cycle_last_run: string | null;
    departments: DepartmentHealth[];
    insights_24h: number;
    tasks: { total: number; pending: number; in_progress: number; completed: number; failed: number };
    agent_fleet: { total: number; healthy: number; errored: number; paused: number };
  };
  recent_insights: InsightItem[];
  department_reports: DeptReport[];
  recent_tasks: TaskItem[];
  strategic_initiatives?: InitiativeItem[];
  initiative_stats?: { total: number; proposed: number; approved: number; in_progress: number; completed: number; cancelled: number };
}

const RISK_COLORS: Record<string, string> = {
  safe: 'success',
  moderate: 'warning',
  risky: 'danger',
  dangerous: 'danger',
};

const INITIATIVE_TYPE_LABELS: Record<string, string> = {
  strategic_initiative: 'Strategic',
  ai_optimization: 'AI Optimization',
  agent_restructure: 'Restructure',
  agent_creation: 'New Agent',
  workflow_redesign: 'Workflow',
  system_automation: 'Automation',
};

const INITIATIVE_STATUS_COLORS: Record<string, string> = {
  proposed: 'warning',
  approved: 'info',
  in_progress: 'primary',
  completed: 'success',
  cancelled: 'secondary',
};

const STATUS_COLORS: Record<string, string> = {
  pending: 'secondary',
  assigned: 'info',
  in_progress: 'primary',
  completed: 'success',
  failed: 'danger',
  cancelled: 'secondary',
};

const PRIORITY_COLORS: Record<string, string> = {
  low: 'secondary',
  medium: 'info',
  high: 'warning',
  critical: 'danger',
};

interface HealthData {
  agent_fleet: { total: number; healthy: number; errored: number; paused: number };
  insights_last_hour: number;
  tasks_today: number;
  initiatives: { total: number; proposed: number; approved: number; in_progress: number; completed: number; cancelled: number };
  retention: { main_table_count: number; archive_table_count: number; oldest_main_record: string | null; last_cleanup_at: string | null } | null;
  checked_at: string;
}

export default function CoryCOOTab() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [health, setHealth] = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchData = useCallback(async () => {
    try {
      const res = await api.get('/api/admin/intelligence/cory/coo-dashboard');
      setData(res.data);
      setError('');
    } catch (err: any) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchHealth = useCallback(async () => {
    try {
      const res = await api.get('/api/admin/intelligence/cory/system-health');
      setHealth(res.data);
    } catch {
      // Non-critical — don't overwrite dashboard error
    }
  }, []);

  useEffect(() => {
    fetchData();
    fetchHealth();
    const dashInterval = setInterval(fetchData, 30000);
    const healthInterval = setInterval(fetchHealth, 60000);
    return () => { clearInterval(dashInterval); clearInterval(healthInterval); };
  }, [fetchData, fetchHealth]);

  if (loading) {
    return (
      <div className="text-center py-5">
        <div className="spinner-border text-primary" role="status">
          <span className="visually-hidden">Loading Command Center...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return <div className="alert alert-danger">{error}</div>;
  }

  if (!data) return null;

  const { status, recent_insights, department_reports, recent_tasks, strategic_initiatives, initiative_stats } = data;
  const fleet = status.agent_fleet;
  const tasks = status.tasks;
  const initiatives = strategic_initiatives || [];
  const iStats = initiative_stats || { total: 0, proposed: 0, approved: 0, in_progress: 0, completed: 0, cancelled: 0 };

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-4">
        <div>
          <h5 className="fw-bold mb-1" style={{ color: 'var(--color-primary)' }}>
            AI COO Command Center
          </h5>
          <small className="text-muted">
            Cory's operational dashboard — departments, insights, tasks, and system health
          </small>
        </div>
        <button className="btn btn-sm btn-outline-primary" onClick={fetchData}>
          Refresh
        </button>
      </div>

      {/* System Metrics Row */}
      <div className="row g-3 mb-4">
        <div className="col-md-3">
          <div className="card border-0 shadow-sm">
            <div className="card-body text-center">
              <div className="fs-2 fw-bold" style={{ color: 'var(--color-primary)' }}>{fleet.total}</div>
              <small className="text-muted">Total Agents</small>
              <div className="mt-1">
                <span className="badge bg-success me-1">{fleet.healthy} healthy</span>
                <span className="badge bg-danger me-1">{fleet.errored} errored</span>
                <span className="badge bg-secondary">{fleet.paused} paused</span>
              </div>
            </div>
          </div>
        </div>
        <div className="col-md-3">
          <div className="card border-0 shadow-sm">
            <div className="card-body text-center">
              <div className="fs-2 fw-bold" style={{ color: 'var(--color-accent)' }}>{status.insights_24h}</div>
              <small className="text-muted">Insights (24h)</small>
              <div className="mt-1">
                <span className="badge bg-danger me-1">
                  {recent_insights.filter(i => i.risk_tier === 'risky' || i.risk_tier === 'dangerous').length} critical
                </span>
              </div>
            </div>
          </div>
        </div>
        <div className="col-md-3">
          <div className="card border-0 shadow-sm">
            <div className="card-body text-center">
              <div className="fs-2 fw-bold" style={{ color: 'var(--color-primary-light)' }}>{tasks.total}</div>
              <small className="text-muted">Tasks (24h)</small>
              <div className="mt-1">
                <span className="badge bg-warning me-1">{tasks.pending} pending</span>
                <span className="badge bg-success">{tasks.completed} done</span>
              </div>
            </div>
          </div>
        </div>
        <div className="col-md-3">
          <div className="card border-0 shadow-sm">
            <div className="card-body text-center">
              <div className="fs-2 fw-bold">{status.departments.length}</div>
              <small className="text-muted">Departments</small>
              <div className="mt-1">
                <span className="badge bg-success me-1">
                  {status.departments.filter(d => d.health === 'healthy').length} healthy
                </span>
                <span className="badge bg-warning">
                  {status.departments.filter(d => d.health === 'degraded').length} degraded
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Cory System Health — Observability Panel */}
      {health && (
        <div className="card border-0 shadow-sm mb-4">
          <div className="card-header bg-white fw-semibold d-flex justify-content-between align-items-center">
            <span>Cory System Health</span>
            <small className="text-muted fw-normal">
              Checked {new Date(health.checked_at).toLocaleTimeString()}
            </small>
          </div>
          <div className="card-body">
            <div className="row g-3">
              <div className="col-md-3">
                <div className="text-center">
                  <div className="fs-4 fw-bold" style={{ color: 'var(--color-primary)' }}>{health.insights_last_hour}</div>
                  <small className="text-muted">Insights / Hour</small>
                </div>
              </div>
              <div className="col-md-3">
                <div className="text-center">
                  <div className="fs-4 fw-bold" style={{ color: 'var(--color-accent)' }}>{health.tasks_today}</div>
                  <small className="text-muted">Tasks Today</small>
                </div>
              </div>
              <div className="col-md-3">
                <div className="text-center">
                  <div className="fs-4 fw-bold" style={{ color: 'var(--color-primary-light)' }}>{health.initiatives.in_progress}</div>
                  <small className="text-muted">Active Initiatives</small>
                </div>
              </div>
              <div className="col-md-3">
                <div className="text-center">
                  <div className="fs-4 fw-bold">{health.retention?.main_table_count ?? '—'}</div>
                  <small className="text-muted">Insights in DB</small>
                </div>
              </div>
            </div>
            {health.retention && (
              <div className="mt-3 pt-3 border-top">
                <div className="row small text-muted">
                  <div className="col-md-4">
                    Archived: <span className="fw-medium text-dark">{health.retention.archive_table_count}</span> records
                  </div>
                  <div className="col-md-4">
                    Oldest record: <span className="fw-medium text-dark">
                      {health.retention.oldest_main_record
                        ? new Date(health.retention.oldest_main_record).toLocaleDateString()
                        : '—'}
                    </span>
                  </div>
                  <div className="col-md-4">
                    Last cleanup: <span className="fw-medium text-dark">
                      {health.retention.last_cleanup_at
                        ? new Date(health.retention.last_cleanup_at).toLocaleString()
                        : 'Not yet run'}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="row g-3">
        {/* Left Column — Departments */}
        <div className="col-md-4">
          <div className="card border-0 shadow-sm">
            <div className="card-header bg-white fw-semibold">Department Health</div>
            <div className="card-body p-0">
              {status.departments.length === 0 ? (
                <div className="p-3 text-muted text-center small">No department reports yet</div>
              ) : (
                <div className="list-group list-group-flush">
                  {status.departments.map((dept) => (
                    <div key={dept.name} className="list-group-item d-flex justify-content-between align-items-center">
                      <div>
                        <span
                          className={`me-2 ${dept.health === 'healthy' ? 'text-success' : 'text-warning'}`}
                          style={{ fontSize: '0.75rem' }}
                        >
                          ●
                        </span>
                        <span className="small fw-medium">{dept.name}</span>
                      </div>
                      <span className="badge bg-light text-dark">{dept.agent_count} agents</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Last Strategic Cycle */}
          <div className="card border-0 shadow-sm mt-3">
            <div className="card-body">
              <small className="text-muted d-block mb-1">Last Strategic Cycle</small>
              <span className="small">
                {status.strategic_cycle_last_run
                  ? new Date(status.strategic_cycle_last_run).toLocaleString()
                  : 'Not yet run'}
              </span>
            </div>
          </div>
        </div>

        {/* Right Column — Insights + Tasks */}
        <div className="col-md-8">
          {/* Strategic Insights */}
          <div className="card border-0 shadow-sm mb-3">
            <div className="card-header bg-white fw-semibold">Strategic Insights</div>
            <div className="card-body p-0">
              {recent_insights.length === 0 ? (
                <div className="p-3 text-muted text-center small">No insights detected yet. Strategic cycle runs every 30 minutes.</div>
              ) : (
                <div className="table-responsive">
                  <table className="table table-hover mb-0">
                    <thead className="table-light">
                      <tr>
                        <th className="small">Risk</th>
                        <th className="small">Insight</th>
                        <th className="small">Confidence</th>
                        <th className="small">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recent_insights.slice(0, 10).map((insight) => (
                        <tr key={insight.id}>
                          <td>
                            <span className={`badge bg-${RISK_COLORS[insight.risk_tier] || 'secondary'}`}>
                              {insight.risk_tier}
                            </span>
                          </td>
                          <td className="small" style={{ maxWidth: '400px' }}>
                            {insight.problem.length > 100 ? insight.problem.slice(0, 100) + '...' : insight.problem}
                          </td>
                          <td className="small">{insight.confidence}%</td>
                          <td>
                            <span className="badge bg-secondary">{insight.status}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          {/* Active Tasks */}
          <div className="card border-0 shadow-sm mb-3">
            <div className="card-header bg-white fw-semibold">Active Tasks</div>
            <div className="card-body p-0">
              {recent_tasks.length === 0 ? (
                <div className="p-3 text-muted text-center small">No tasks created yet. CoryBrain generates tasks from strategic insights.</div>
              ) : (
                <div className="table-responsive">
                  <table className="table table-hover mb-0">
                    <thead className="table-light">
                      <tr>
                        <th className="small">Priority</th>
                        <th className="small">Task</th>
                        <th className="small">Department</th>
                        <th className="small">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recent_tasks.slice(0, 10).map((task) => (
                        <tr key={task.id}>
                          <td>
                            <span className={`badge bg-${PRIORITY_COLORS[task.priority] || 'secondary'}`}>
                              {task.priority}
                            </span>
                          </td>
                          <td className="small" style={{ maxWidth: '350px' }}>
                            {task.description.length > 80 ? task.description.slice(0, 80) + '...' : task.description}
                          </td>
                          <td className="small">{task.department || '—'}</td>
                          <td>
                            <span className={`badge bg-${STATUS_COLORS[task.status] || 'secondary'}`}>
                              {task.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          {/* Strategic Initiatives */}
          <div className="card border-0 shadow-sm mb-3">
            <div className="card-header bg-white fw-semibold d-flex justify-content-between align-items-center">
              <span>Strategic Initiatives</span>
              <div>
                <span className="badge bg-warning me-1">{iStats.proposed} proposed</span>
                <span className="badge bg-primary me-1">{iStats.in_progress} active</span>
                <span className="badge bg-success">{iStats.completed} done</span>
              </div>
            </div>
            <div className="card-body p-0">
              {initiatives.length === 0 ? (
                <div className="p-3 text-muted text-center small">No strategic initiatives yet. Cory generates these from self-evolution analysis.</div>
              ) : (
                <div className="list-group list-group-flush">
                  {initiatives.slice(0, 8).map((init) => (
                    <div key={init.id} className="list-group-item">
                      <div className="d-flex justify-content-between align-items-start">
                        <div>
                          <span className={`badge bg-${INITIATIVE_STATUS_COLORS[init.status] || 'secondary'} me-2`}>
                            {init.status}
                          </span>
                          <span className="small fw-medium">{init.title}</span>
                        </div>
                        <span className={`badge bg-${PRIORITY_COLORS[init.priority] || 'secondary'}`}>
                          {init.priority}
                        </span>
                      </div>
                      <div className="mt-1">
                        <span className="badge bg-light text-dark me-1 small">
                          {INITIATIVE_TYPE_LABELS[init.initiative_type] || init.initiative_type}
                        </span>
                        {init.involved_departments && init.involved_departments.length > 0 && (
                          <span className="small text-muted">
                            Depts: {init.involved_departments.join(', ')}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Department Reports */}
          <div className="card border-0 shadow-sm">
            <div className="card-header bg-white fw-semibold">Department Reports</div>
            <div className="card-body p-0">
              {department_reports.length === 0 ? (
                <div className="p-3 text-muted text-center small">No department reports yet. Super agents report every 30 minutes.</div>
              ) : (
                <div className="list-group list-group-flush">
                  {department_reports.map((report, idx) => (
                    <div key={idx} className="list-group-item">
                      <div className="d-flex justify-content-between">
                        <span className="small fw-medium">{report.department}</span>
                        <span className={`badge bg-${report.report_type === 'alert' ? 'warning' : 'info'}`}>
                          {report.report_type}
                        </span>
                      </div>
                      <div className="small text-muted mt-1">{report.summary}</div>
                      {report.anomalies && report.anomalies.length > 0 && (
                        <div className="mt-1">
                          {(report.anomalies as string[]).slice(0, 3).map((a, i) => (
                            <div key={i} className="small text-danger">• {a}</div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
