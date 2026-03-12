import React, { useState, useEffect, useCallback } from 'react';
import {
  getStrategySummary,
  getCrossDeptInitiatives,
  getStrategyAgents,
  runDepartmentStrategy,
  type StrategySummary,
  type CrossDeptInitiative,
  type StrategyAgentInfo,
} from '../../../../services/intelligenceApi';

// ─── Department Strategy Tab ────────────────────────────────────────────────
// Shows strategy summary, department cards, cross-dept initiatives, agent status

type SubView = 'overview' | 'agents' | 'cross-dept';

const PRIORITY_COLORS: Record<string, string> = {
  critical: 'danger',
  high: 'warning',
  medium: 'info',
  low: 'secondary',
};

const STATUS_COLORS: Record<string, string> = {
  planned: 'secondary',
  active: 'primary',
  completed: 'success',
  blocked: 'danger',
  cancelled: 'dark',
};

const GRADE_COLORS: Record<string, string> = {
  excellent: 'success',
  good: 'info',
  needs_attention: 'warning',
  critical: 'danger',
};

function gradeFromScore(score: number): string {
  if (score >= 80) return 'excellent';
  if (score >= 60) return 'good';
  if (score >= 40) return 'needs_attention';
  return 'critical';
}

export default function DepartmentStrategyTab() {
  const [subView, setSubView] = useState<SubView>('overview');
  const [summary, setSummary] = useState<StrategySummary | null>(null);
  const [crossDeptInitiatives, setCrossDeptInitiatives] = useState<CrossDeptInitiative[]>([]);
  const [agents, setAgents] = useState<StrategyAgentInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [runningSlug, setRunningSlug] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [summaryRes, crossRes, agentsRes] = await Promise.allSettled([
        getStrategySummary(),
        getCrossDeptInitiatives(),
        getStrategyAgents(),
      ]);
      if (summaryRes.status === 'fulfilled') setSummary(summaryRes.value.data);
      if (crossRes.status === 'fulfilled') setCrossDeptInitiatives(crossRes.value.data.initiatives || []);
      if (agentsRes.status === 'fulfilled') setAgents(agentsRes.value.data.agents || []);
    } catch (err) {
      console.error('[DeptStrategy] Load error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const handleRunStrategy = async (slug: string) => {
    setRunningSlug(slug);
    try {
      await runDepartmentStrategy(slug);
      await loadData();
    } catch (err) {
      console.error('[DeptStrategy] Run error:', err);
    } finally {
      setRunningSlug(null);
    }
  };

  if (loading) {
    return (
      <div className="text-center py-5">
        <div className="spinner-border text-primary" role="status">
          <span className="visually-hidden">Loading...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="p-3">
      {/* Sub-navigation */}
      <div className="d-flex gap-2 mb-3 flex-wrap align-items-center">
        {(['overview', 'agents', 'cross-dept'] as SubView[]).map((v) => (
          <button
            key={v}
            className={`btn btn-sm ${subView === v ? 'btn-primary' : 'btn-outline-secondary'}`}
            onClick={() => setSubView(v)}
          >
            {v === 'overview' ? 'Department Overview' : v === 'agents' ? 'Strategy Agents' : 'Cross-Dept Initiatives'}
          </button>
        ))}
        <button className="btn btn-sm btn-outline-secondary ms-auto" onClick={loadData}>
          Refresh
        </button>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="row g-2 mb-3">
          <div className="col-6 col-md-3 col-lg-2">
            <div className="card border-0 shadow-sm text-center p-2">
              <div className="fw-bold" style={{ fontSize: '1.4rem', color: 'var(--color-primary)' }}>{summary.total_departments}</div>
              <div className="text-muted" style={{ fontSize: '0.7rem' }}>Departments</div>
            </div>
          </div>
          <div className="col-6 col-md-3 col-lg-2">
            <div className="card border-0 shadow-sm text-center p-2">
              <div className="fw-bold" style={{ fontSize: '1.4rem', color: 'var(--color-accent)' }}>{summary.active_initiatives}</div>
              <div className="text-muted" style={{ fontSize: '0.7rem' }}>Active Initiatives</div>
            </div>
          </div>
          <div className="col-6 col-md-3 col-lg-2">
            <div className="card border-0 shadow-sm text-center p-2">
              <div className="fw-bold" style={{ fontSize: '1.4rem', color: 'var(--color-primary-light)' }}>{summary.cross_dept_initiatives}</div>
              <div className="text-muted" style={{ fontSize: '0.7rem' }}>Cross-Dept</div>
            </div>
          </div>
          <div className="col-6 col-md-3 col-lg-2">
            <div className="card border-0 shadow-sm text-center p-2">
              <div className="fw-bold" style={{ fontSize: '1.4rem' }}>{summary.avg_health_score.toFixed(0)}</div>
              <div className="text-muted" style={{ fontSize: '0.7rem' }}>Avg Health</div>
            </div>
          </div>
          <div className="col-6 col-md-3 col-lg-2">
            <div className="card border-0 shadow-sm text-center p-2">
              <div className="fw-bold" style={{ fontSize: '1.4rem' }}>{summary.avg_innovation_score.toFixed(0)}</div>
              <div className="text-muted" style={{ fontSize: '0.7rem' }}>Avg Innovation</div>
            </div>
          </div>
          <div className="col-6 col-md-3 col-lg-2">
            <div className="card border-0 shadow-sm text-center p-2">
              <div className="fw-bold" style={{ fontSize: '1.4rem', color: 'var(--color-accent)' }}>{summary.completed_initiatives}</div>
              <div className="text-muted" style={{ fontSize: '0.7rem' }}>Completed</div>
            </div>
          </div>
        </div>
      )}

      {/* Sub-view Content */}
      {subView === 'overview' && summary && <DepartmentCards departments={summary.departments} runningSlug={runningSlug} onRunStrategy={handleRunStrategy} />}
      {subView === 'agents' && <StrategyAgentsTable agents={agents} />}
      {subView === 'cross-dept' && <CrossDeptInitiativesTable initiatives={crossDeptInitiatives} />}
    </div>
  );
}

// ─── Department Cards Grid ──────────────────────────────────────────────────

function DepartmentCards({
  departments,
  runningSlug,
  onRunStrategy,
}: {
  departments: StrategySummary['departments'];
  runningSlug: string | null;
  onRunStrategy: (slug: string) => void;
}) {
  return (
    <div className="row g-2">
      {departments.map((dept) => {
        const grade = gradeFromScore(dept.health_score);
        const gradeColor = GRADE_COLORS[grade] || 'secondary';
        return (
          <div key={dept.id} className="col-12 col-md-6 col-lg-4 col-xl-3">
            <div className="card border-0 shadow-sm h-100">
              <div className="card-header bg-white d-flex align-items-center gap-2 py-2" style={{ fontSize: '0.8rem' }}>
                <span
                  className="rounded-circle d-inline-block"
                  style={{ width: 10, height: 10, backgroundColor: dept.color, flexShrink: 0 }}
                />
                <span className="fw-semibold text-truncate">{dept.name}</span>
                <span className={`badge bg-${gradeColor} ms-auto`} style={{ fontSize: '0.6rem' }}>
                  {grade.replace('_', ' ')}
                </span>
              </div>
              <div className="card-body py-2 px-3" style={{ fontSize: '0.75rem' }}>
                <div className="d-flex justify-content-between mb-1">
                  <span className="text-muted">Health</span>
                  <span className="fw-medium">{dept.health_score}</span>
                </div>
                <div className="progress mb-2" style={{ height: 4 }}>
                  <div
                    className={`progress-bar bg-${gradeColor}`}
                    style={{ width: `${dept.health_score}%` }}
                  />
                </div>
                <div className="d-flex justify-content-between mb-1">
                  <span className="text-muted">Innovation</span>
                  <span className="fw-medium">{dept.innovation_score}</span>
                </div>
                <div className="progress mb-2" style={{ height: 4 }}>
                  <div
                    className="progress-bar bg-info"
                    style={{ width: `${dept.innovation_score}%` }}
                  />
                </div>
                <div className="d-flex justify-content-between text-muted">
                  <span>Initiatives: {dept.active_initiatives}/{dept.total_initiatives}</span>
                  {dept.last_strategy_run && (
                    <span title="Last strategy run">{new Date(dept.last_strategy_run).toLocaleDateString()}</span>
                  )}
                </div>
              </div>
              <div className="card-footer bg-white border-top-0 py-1 px-3">
                <button
                  className="btn btn-sm btn-outline-primary w-100"
                  style={{ fontSize: '0.68rem' }}
                  disabled={runningSlug === dept.slug}
                  onClick={() => onRunStrategy(dept.slug)}
                >
                  {runningSlug === dept.slug ? 'Running...' : 'Run Strategy'}
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Strategy Agents Table ──────────────────────────────────────────────────

function StrategyAgentsTable({ agents }: { agents: StrategyAgentInfo[] }) {
  return (
    <div className="card border-0 shadow-sm">
      <div className="card-header bg-white fw-semibold" style={{ fontSize: '0.82rem' }}>
        Strategy Architect Agents ({agents.length})
      </div>
      <div className="table-responsive">
        <table className="table table-hover mb-0" style={{ fontSize: '0.75rem' }}>
          <thead className="table-light">
            <tr>
              <th>Agent</th>
              <th>Department</th>
              <th>Status</th>
              <th className="text-end">Runs</th>
              <th className="text-end">Errors</th>
              <th>Last Run</th>
              <th className="text-end">Duration</th>
            </tr>
          </thead>
          <tbody>
            {agents.map((a) => (
              <tr key={a.id}>
                <td className="fw-medium">{a.agent_name}</td>
                <td>
                  <span className="badge bg-info" style={{ fontSize: '0.65rem' }}>
                    {a.config?.department_slug || '—'}
                  </span>
                </td>
                <td>
                  <span className={`badge bg-${a.status === 'error' ? 'danger' : a.status === 'running' ? 'primary' : a.enabled ? 'success' : 'secondary'}`} style={{ fontSize: '0.65rem' }}>
                    {a.enabled ? a.status : 'disabled'}
                  </span>
                </td>
                <td className="text-end">{a.run_count}</td>
                <td className="text-end">{a.error_count > 0 ? <span className="text-danger fw-bold">{a.error_count}</span> : '0'}</td>
                <td>{a.last_run_at ? new Date(a.last_run_at).toLocaleString() : '—'}</td>
                <td className="text-end">{a.avg_duration_ms ? `${(a.avg_duration_ms / 1000).toFixed(1)}s` : '—'}</td>
              </tr>
            ))}
            {agents.length === 0 && (
              <tr><td colSpan={7} className="text-center text-muted py-3">No strategy agents registered yet</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Cross-Department Initiatives Table ─────────────────────────────────────

function CrossDeptInitiativesTable({ initiatives }: { initiatives: CrossDeptInitiative[] }) {
  return (
    <div className="card border-0 shadow-sm">
      <div className="card-header bg-white fw-semibold" style={{ fontSize: '0.82rem' }}>
        Cross-Department Initiatives ({initiatives.length})
      </div>
      {initiatives.length === 0 ? (
        <div className="card-body text-center text-muted py-4" style={{ fontSize: '0.8rem' }}>
          No cross-department initiatives yet. Run strategy cycles to generate them.
        </div>
      ) : (
        <div className="table-responsive">
          <table className="table table-hover mb-0" style={{ fontSize: '0.75rem' }}>
            <thead className="table-light">
              <tr>
                <th>Initiative</th>
                <th>Lead Dept</th>
                <th>Collaborators</th>
                <th>Status</th>
                <th>Priority</th>
                <th>Risk</th>
                <th>Created By</th>
              </tr>
            </thead>
            <tbody>
              {initiatives.map((init) => (
                <tr key={init.id}>
                  <td>
                    <div className="fw-medium">{init.title}</div>
                    <div className="text-muted text-truncate" style={{ maxWidth: 300, fontSize: '0.7rem' }}>{init.description}</div>
                  </td>
                  <td>
                    <span className="badge" style={{ backgroundColor: init.department?.color || '#718096', fontSize: '0.65rem' }}>
                      {init.department?.name || '—'}
                    </span>
                  </td>
                  <td>
                    <div className="d-flex gap-1 flex-wrap">
                      {(init.supporting_department_details || []).map((sd) => (
                        <span key={sd.id} className="badge" style={{ backgroundColor: sd.color, fontSize: '0.6rem' }}>
                          {sd.name}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td>
                    <span className={`badge bg-${STATUS_COLORS[init.status] || 'secondary'}`} style={{ fontSize: '0.65rem' }}>
                      {init.status}
                    </span>
                  </td>
                  <td>
                    <span className={`badge bg-${PRIORITY_COLORS[init.priority] || 'secondary'}`} style={{ fontSize: '0.65rem' }}>
                      {init.priority}
                    </span>
                  </td>
                  <td>
                    <span className={`badge bg-${init.risk_level === 'high' ? 'danger' : init.risk_level === 'medium' ? 'warning' : 'success'}`} style={{ fontSize: '0.65rem' }}>
                      {init.risk_level}
                    </span>
                  </td>
                  <td style={{ fontSize: '0.7rem' }}>{init.created_by_agent || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
