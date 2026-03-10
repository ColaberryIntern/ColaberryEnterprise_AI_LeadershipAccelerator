import React, { useState, useEffect, useCallback } from 'react';
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

const CATEGORY_COLORS: Record<string, string> = {
  outbound: 'primary',
  behavioral: 'info',
  maintenance: 'secondary',
  ai_ops: 'warning',
  accelerator: 'success',
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

export default function AgentRegistryTab() {
  const [agents, setAgents] = useState<RegistryAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState('');
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [controlLoading, setControlLoading] = useState<string | null>(null);

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

  useEffect(() => {
    fetchAgents();
  }, [fetchAgents]);

  const handleControl = async (agentId: string, action: string) => {
    setControlLoading(agentId);
    try {
      await api.post(`/api/admin/ai-ops/registry/${agentId}/control`, { action });
      await fetchAgents();
    } catch (err) {
      console.error('Failed to control agent:', err);
    } finally {
      setControlLoading(null);
    }
  };

  const categories = [...new Set(agents.map((a) => a.category))].sort();

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
      {/* Filters */}
      <div className="d-flex gap-2 mb-3 flex-wrap align-items-center">
        <select
          className="form-select form-select-sm"
          style={{ width: 180 }}
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
        >
          <option value="">All Categories</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c.replace('_', ' ')}
            </option>
          ))}
        </select>
        <span className="text-muted small">{agents.length} agents</span>
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
                  <th>Trigger</th>
                  <th>Schedule</th>
                  <th>Status</th>
                  <th>Enabled</th>
                  <th>Last Run</th>
                  <th>Next Run</th>
                  <th>Runs</th>
                  <th>Errors</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {agents.map((agent) => (
                  <tr
                    key={agent.id}
                    style={{ cursor: 'pointer' }}
                    onClick={() => setSelectedAgentId(agent.id)}
                  >
                    <td className="fw-medium">{agent.agent_name}</td>
                    <td>
                      <span className={`badge bg-${CATEGORY_COLORS[agent.category] || 'secondary'}`}>
                        {agent.category?.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="text-muted">{agent.trigger_type}</td>
                    <td>
                      <code className="small">{agent.schedule || '—'}</code>
                    </td>
                    <td>
                      <span className={`badge bg-${STATUS_COLORS[agent.status] || 'secondary'}`}>
                        {agent.status}
                      </span>
                    </td>
                    <td>
                      <span className={`badge bg-${agent.enabled ? 'success' : 'danger'}`}>
                        {agent.enabled ? 'Yes' : 'No'}
                      </span>
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
                    <td>
                      <div className="d-flex gap-1" onClick={(e) => e.stopPropagation()}>
                        {agent.status === 'paused' ? (
                          <button
                            className="btn btn-sm btn-outline-success py-0 px-2"
                            onClick={() => handleControl(agent.id, 'resume')}
                            disabled={controlLoading === agent.id}
                          >
                            Resume
                          </button>
                        ) : (
                          <button
                            className="btn btn-sm btn-outline-warning py-0 px-2"
                            onClick={() => handleControl(agent.id, 'pause')}
                            disabled={controlLoading === agent.id}
                          >
                            Pause
                          </button>
                        )}
                        <button
                          className={`btn btn-sm py-0 px-2 ${agent.enabled ? 'btn-outline-danger' : 'btn-outline-success'}`}
                          onClick={() => handleControl(agent.id, agent.enabled ? 'disable' : 'enable')}
                          disabled={controlLoading === agent.id}
                        >
                          {agent.enabled ? 'Disable' : 'Enable'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {agents.length === 0 && (
                  <tr>
                    <td colSpan={11} className="text-muted text-center py-4">
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
