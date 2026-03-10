import React, { useState, useEffect, useCallback, useRef } from 'react';
import api from '../../../utils/api';
import AgentDetailModal from './AgentDetailModal';

interface RegistryAgent {
  id: string;
  agent_name: string;
  agent_type: string;
  status: string;
  category: string;
  trigger_type: string;
  schedule: string | null;
  description: string | null;
  enabled: boolean;
  run_count: number;
  error_count: number;
  avg_duration_ms: number | null;
  last_run_at: string | null;
  last_error: string | null;
  last_error_at: string | null;
  module: string | null;
  source_file: string | null;
  next_run_at: string | null;
  next_run_label: string | null;
}

interface AgentHealth {
  agent_id: string;
  agent_name: string;
  health_score: number;
  status: string;
  error_rate: number;
  category: string;
}

const CATEGORY_COLORS: Record<string, string> = {
  outbound: 'primary',
  behavioral: 'info',
  maintenance: 'secondary',
  ai_ops: 'warning',
  accelerator: 'success',
  intelligence: 'dark',
  orchestration: 'primary',
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
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function healthColor(score: number): string {
  if (score >= 80) return 'success';
  if (score >= 60) return 'warning';
  return 'danger';
}

export default function AgentRegistryTab() {
  const [agents, setAgents] = useState<RegistryAgent[]>([]);
  const [healthScores, setHealthScores] = useState<AgentHealth[]>([]);
  const [loading, setLoading] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState('');
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [controlLoading, setControlLoading] = useState<string | null>(null);
  const [scanLoading, setScanLoading] = useState(false);
  const [actionMenuAgent, setActionMenuAgent] = useState<string | null>(null);
  const actionMenuRef = useRef<HTMLDivElement>(null);

  const fetchAgents = useCallback(async () => {
    try {
      const params: Record<string, string> = {};
      if (categoryFilter) params.category = categoryFilter;
      const { data } = await api.get('/api/admin/ai-ops/registry', { params });
      setAgents(data);
    } catch (err) {
      console.error('Failed to fetch agent registry:', err);
    } finally {
      setLoading(false);
    }
  }, [categoryFilter]);

  const fetchHealth = useCallback(async () => {
    try {
      const { data } = await api.get('/api/admin/ai-ops/health/agents');
      setHealthScores(data);
    } catch (err) {
      console.error('Failed to fetch agent health:', err);
    }
  }, []);

  useEffect(() => {
    Promise.allSettled([fetchAgents(), fetchHealth()]);
  }, [fetchAgents, fetchHealth]);

  // 10-second polling
  useEffect(() => {
    const interval = setInterval(() => {
      fetchAgents();
      fetchHealth();
    }, 10000);
    return () => clearInterval(interval);
  }, [fetchAgents, fetchHealth]);

  // Close action menu on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (actionMenuRef.current && !actionMenuRef.current.contains(e.target as Node)) {
        setActionMenuAgent(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleControl = async (agentId: string, action: string) => {
    setControlLoading(agentId);
    setActionMenuAgent(null);
    try {
      await api.post(`/api/admin/ai-ops/registry/${agentId}/control`, { action });
      await fetchAgents();
    } catch (err) {
      console.error('Failed to control agent:', err);
    } finally {
      setControlLoading(null);
    }
  };

  const handleScanNow = async () => {
    setScanLoading(true);
    try {
      await Promise.allSettled([
        api.post('/api/admin/ai-ops/discover'),
        api.post('/api/admin/ai-ops/health/scan'),
      ]);
      await Promise.allSettled([fetchAgents(), fetchHealth()]);
    } catch (err) {
      console.error('Failed to scan:', err);
    } finally {
      setScanLoading(false);
    }
  };

  const categories = [...new Set(agents.map((a) => a.category))].sort();
  const healthMap = new Map(healthScores.map((h) => [h.agent_id, h]));

  // Stats
  const erroredCount = agents.filter((a) => a.status === 'error').length;

  if (loading) {
    return (
      <div className="text-center py-5">
        <div className="spinner-border spinner-border-sm text-primary" role="status">
          <span className="visually-hidden">Loading agents...</span>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Errored agents warning */}
      {erroredCount > 0 && (
        <div className="alert alert-danger d-flex align-items-center mb-3 py-2 small">
          <strong className="me-2">{erroredCount} agent{erroredCount > 1 ? 's' : ''} in error state.</strong>
          Review and restart affected agents below.
        </div>
      )}

      {/* Filters + Scan Now */}
      <div className="d-flex gap-2 mb-3 flex-wrap align-items-center">
        {/* Category filter pills */}
        <button
          className={`btn btn-sm ${!categoryFilter ? 'btn-primary' : 'btn-outline-secondary'}`}
          onClick={() => setCategoryFilter('')}
        >
          All
        </button>
        {categories.map((c) => (
          <button
            key={c}
            className={`btn btn-sm ${categoryFilter === c ? `btn-${CATEGORY_COLORS[c] || 'secondary'}` : `btn-outline-${CATEGORY_COLORS[c] || 'secondary'}`}`}
            onClick={() => setCategoryFilter(categoryFilter === c ? '' : c)}
          >
            {c.replace('_', ' ')}
          </button>
        ))}

        <span className="text-muted small ms-auto">{agents.length} agents</span>

        <button
          className="btn btn-sm btn-primary"
          onClick={handleScanNow}
          disabled={scanLoading}
        >
          {scanLoading ? 'Scanning...' : 'Scan Now'}
        </button>
      </div>

      {/* Agent Table */}
      <div className="card border-0 shadow-sm">
        <div className="card-header bg-white fw-semibold">
          Agent Registry
        </div>
        <div className="card-body p-0">
          <div className="table-responsive">
            <table className="table table-hover mb-0 small">
              <thead className="table-light">
                <tr>
                  <th>Agent</th>
                  <th>Category</th>
                  <th>Health</th>
                  <th>Status</th>
                  <th>Trigger</th>
                  <th>Schedule</th>
                  <th>Last Run</th>
                  <th>Next Run</th>
                  <th>Runs</th>
                  <th>Errors</th>
                  <th>Avg Duration</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {agents.map((agent) => {
                  const agentHealth = healthMap.get(agent.id);
                  const score = agentHealth?.health_score ?? 100;
                  return (
                    <tr
                      key={agent.id}
                      style={{ cursor: 'pointer' }}
                      onClick={() => setSelectedAgentId(agent.id)}
                    >
                      <td className="fw-medium">
                        {agent.agent_name}
                        {agent.description && (
                          <div className="text-muted" style={{ fontSize: '0.7rem', lineHeight: 1.2 }}>
                            {agent.description.length > 50 ? agent.description.slice(0, 50) + '...' : agent.description}
                          </div>
                        )}
                      </td>
                      <td>
                        <span className={`badge bg-${CATEGORY_COLORS[agent.category] || 'secondary'}`}>
                          {agent.category?.replace('_', ' ')}
                        </span>
                      </td>
                      <td>
                        <span className={`badge bg-${healthColor(score)}`}>
                          {score}
                        </span>
                      </td>
                      <td>
                        <span className={`badge bg-${STATUS_COLORS[agent.status] || 'secondary'}`}>
                          {agent.status}
                        </span>
                        {!agent.enabled && <span className="badge bg-danger ms-1">off</span>}
                      </td>
                      <td className="text-muted">{agent.trigger_type}</td>
                      <td>
                        <code className="small">{agent.schedule || '—'}</code>
                      </td>
                      <td className="text-muted">{timeAgo(agent.last_run_at)}</td>
                      <td className="text-muted">{agent.next_run_label || '—'}</td>
                      <td>{agent.run_count}</td>
                      <td>
                        {agent.error_count > 0 ? (
                          <span className="badge bg-danger">{agent.error_count}</span>
                        ) : (
                          <span className="text-muted">0</span>
                        )}
                      </td>
                      <td className="text-muted">
                        {agent.avg_duration_ms != null
                          ? agent.avg_duration_ms < 1000
                            ? `${agent.avg_duration_ms}ms`
                            : `${(agent.avg_duration_ms / 1000).toFixed(1)}s`
                          : '—'}
                      </td>
                      <td>
                        <div className="position-relative" onClick={(e) => e.stopPropagation()}>
                          <button
                            className="btn btn-sm btn-outline-secondary py-0 px-2"
                            onClick={() => setActionMenuAgent(actionMenuAgent === agent.id ? null : agent.id)}
                            disabled={controlLoading === agent.id}
                          >
                            {controlLoading === agent.id ? '...' : 'Actions'}
                          </button>
                          {actionMenuAgent === agent.id && (
                            <div
                              ref={actionMenuRef}
                              className="position-absolute bg-white border shadow-sm rounded py-1"
                              style={{ right: 0, top: '100%', zIndex: 1050, minWidth: 140 }}
                            >
                              {agent.status !== 'running' && (
                                <button
                                  className="dropdown-item small px-3 py-1"
                                  onClick={() => handleControl(agent.id, 'start')}
                                >
                                  Start
                                </button>
                              )}
                              {agent.status !== 'paused' ? (
                                <button
                                  className="dropdown-item small px-3 py-1"
                                  onClick={() => handleControl(agent.id, 'pause')}
                                >
                                  Pause
                                </button>
                              ) : (
                                <button
                                  className="dropdown-item small px-3 py-1"
                                  onClick={() => handleControl(agent.id, 'resume')}
                                >
                                  Resume
                                </button>
                              )}
                              <button
                                className="dropdown-item small px-3 py-1"
                                onClick={() => handleControl(agent.id, 'restart')}
                              >
                                Restart
                              </button>
                              <button
                                className="dropdown-item small px-3 py-1"
                                onClick={() => handleControl(agent.id, agent.enabled ? 'disable' : 'enable')}
                              >
                                {agent.enabled ? 'Disable' : 'Enable'}
                              </button>
                              <hr className="my-1" />
                              <button
                                className="dropdown-item small px-3 py-1"
                                onClick={() => {
                                  setActionMenuAgent(null);
                                  setSelectedAgentId(agent.id);
                                }}
                              >
                                View Logs
                              </button>
                              <button
                                className="dropdown-item small px-3 py-1"
                                onClick={() => handleControl(agent.id, 'run_test')}
                              >
                                Run Test
                              </button>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {agents.length === 0 && (
                  <tr>
                    <td colSpan={12} className="text-muted text-center py-4">
                      No agents found
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Agent Detail Modal */}
      {selectedAgentId && (
        <AgentDetailModal
          agentId={selectedAgentId}
          onClose={() => setSelectedAgentId(null)}
          onRefresh={fetchAgents}
        />
      )}
    </>
  );
}
