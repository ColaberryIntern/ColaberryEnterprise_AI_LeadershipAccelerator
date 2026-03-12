import React, { useState, useEffect, useCallback } from 'react';
import api from '../../../utils/api';

interface AgentRecord {
  id: string;
  agent_name: string;
  category: string;
  status: string;
  enabled: boolean;
  trigger_type: string;
  schedule: string;
  run_count: number;
  error_count: number;
  avg_duration_ms: number | null;
  last_run_at: string | null;
  last_error: string | null;
  description: string;
}

const DEPARTMENT_MAP: Record<string, { label: string; color: string }> = {
  dept_growth: { label: 'Growth', color: 'success' },
  dept_marketing: { label: 'Marketing', color: 'info' },
  dept_education: { label: 'Education', color: 'primary' },
  dept_finance: { label: 'Finance', color: 'warning' },
  dept_intelligence: { label: 'Intelligence', color: 'dark' },
  dept_operations: { label: 'Operations', color: 'secondary' },
  dept_infrastructure: { label: 'Infrastructure', color: 'danger' },
  dept_orchestration: { label: 'Orchestration', color: 'primary' },
  dept_strategy: { label: 'Strategy Architects', color: 'info' },
  security_ops: { label: 'Security Operations', color: 'danger' },
};

const STATUS_COLORS: Record<string, string> = {
  idle: 'secondary',
  running: 'primary',
  paused: 'warning',
  error: 'danger',
};

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return 'Never';
  const diff = Date.now() - new Date(dateStr).getTime();
  if (diff < 60000) return 'Just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return `${Math.floor(diff / 86400000)}d ago`;
}

export default function DepartmentAgentsTab() {
  const [agents, setAgents] = useState<AgentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedDepts, setExpandedDepts] = useState<Set<string>>(new Set(Object.keys(DEPARTMENT_MAP)));

  const fetchAgents = useCallback(async () => {
    try {
      const res = await api.get('/api/admin/ai-ops/registry');
      const all: AgentRecord[] = res.data.agents || res.data || [];
      setAgents(all.filter(a => a.category?.startsWith('dept_')));
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAgents();
    const interval = setInterval(fetchAgents, 10000);
    return () => clearInterval(interval);
  }, [fetchAgents]);

  const toggleDept = (cat: string) => {
    setExpandedDepts(prev => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  const toggleAgent = async (agent: AgentRecord) => {
    try {
      await api.patch(`/api/admin/ai-ops/agents/${agent.id}`, {
        enabled: !agent.enabled,
      });
      fetchAgents();
    } catch {
      // silent
    }
  };

  // Group by department
  const grouped: Record<string, AgentRecord[]> = {};
  for (const cat of Object.keys(DEPARTMENT_MAP)) {
    grouped[cat] = agents.filter(a => a.category === cat);
  }

  // Summary stats
  const totalAgents = agents.length;
  const running = agents.filter(a => a.status === 'running').length;
  const errored = agents.filter(a => a.status === 'error').length;
  const enabled = agents.filter(a => a.enabled).length;

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
    <div>
      {/* Summary Row */}
      <div className="row g-3 mb-4">
        <div className="col-6 col-md-3">
          <div className="card border-0 shadow-sm text-center">
            <div className="card-body py-3">
              <div className="fs-3 fw-bold" style={{ color: 'var(--color-primary)' }}>{totalAgents}</div>
              <small className="text-muted">Total Dept Agents</small>
            </div>
          </div>
        </div>
        <div className="col-6 col-md-3">
          <div className="card border-0 shadow-sm text-center">
            <div className="card-body py-3">
              <div className="fs-3 fw-bold text-success">{enabled}</div>
              <small className="text-muted">Enabled</small>
            </div>
          </div>
        </div>
        <div className="col-6 col-md-3">
          <div className="card border-0 shadow-sm text-center">
            <div className="card-body py-3">
              <div className="fs-3 fw-bold text-primary">{running}</div>
              <small className="text-muted">Running</small>
            </div>
          </div>
        </div>
        <div className="col-6 col-md-3">
          <div className="card border-0 shadow-sm text-center">
            <div className="card-body py-3">
              <div className="fs-3 fw-bold text-danger">{errored}</div>
              <small className="text-muted">Errored</small>
            </div>
          </div>
        </div>
      </div>

      {/* Department Cards */}
      {Object.entries(DEPARTMENT_MAP).map(([cat, { label, color }]) => {
        const deptAgents = grouped[cat] || [];
        const deptHealthy = deptAgents.filter(a => a.enabled && a.status !== 'error').length;
        const deptErrored = deptAgents.filter(a => a.status === 'error').length;
        const isExpanded = expandedDepts.has(cat);

        return (
          <div key={cat} className="card border-0 shadow-sm mb-3">
            <div
              className="card-header bg-white d-flex justify-content-between align-items-center"
              style={{ cursor: 'pointer' }}
              onClick={() => toggleDept(cat)}
            >
              <div className="d-flex align-items-center gap-2">
                <span className={`badge bg-${color}`}>{label}</span>
                <span className="fw-semibold">{deptAgents.length} agents</span>
                <span className="text-muted small">
                  ({deptHealthy} healthy{deptErrored > 0 ? `, ${deptErrored} errored` : ''})
                </span>
              </div>
              <i className={`bi bi-chevron-${isExpanded ? 'up' : 'down'}`}></i>
            </div>

            {isExpanded && deptAgents.length > 0 && (
              <div className="table-responsive">
                <table className="table table-hover mb-0">
                  <thead className="table-light">
                    <tr>
                      <th className="small fw-medium">Agent</th>
                      <th className="small fw-medium">Status</th>
                      <th className="small fw-medium">Schedule</th>
                      <th className="small fw-medium">Last Run</th>
                      <th className="small fw-medium text-end">Runs</th>
                      <th className="small fw-medium text-end">Errors</th>
                      <th className="small fw-medium text-end">Avg (ms)</th>
                      <th className="small fw-medium text-center">Enabled</th>
                    </tr>
                  </thead>
                  <tbody>
                    {deptAgents.map(agent => (
                      <tr key={agent.id} className={!agent.enabled ? 'table-light text-muted' : ''}>
                        <td>
                          <div className="fw-medium small">{agent.agent_name.replace(/^Dept/, '')}</div>
                          <div className="text-muted" style={{ fontSize: '0.75rem' }}>{agent.description?.slice(0, 80)}</div>
                        </td>
                        <td>
                          <span className={`badge bg-${STATUS_COLORS[agent.status] || 'secondary'}`}>
                            {agent.status}
                          </span>
                        </td>
                        <td className="small text-muted">{agent.schedule || '—'}</td>
                        <td className="small text-muted">{timeAgo(agent.last_run_at)}</td>
                        <td className="small text-end">{agent.run_count}</td>
                        <td className="small text-end">
                          {agent.error_count > 0 ? (
                            <span className="text-danger">{agent.error_count}</span>
                          ) : (
                            '0'
                          )}
                        </td>
                        <td className="small text-end">{agent.avg_duration_ms ?? '—'}</td>
                        <td className="text-center">
                          <div className="form-check form-switch d-inline-block mb-0">
                            <input
                              className="form-check-input"
                              type="checkbox"
                              checked={agent.enabled}
                              onChange={() => toggleAgent(agent)}
                            />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {isExpanded && deptAgents.length === 0 && (
              <div className="card-body text-center text-muted small py-4">
                No agents registered for this department yet.
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
