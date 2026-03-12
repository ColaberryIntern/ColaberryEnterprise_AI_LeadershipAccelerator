import React, { useState, useEffect, useCallback } from 'react';
import { getAgentPerformance, type AgentKPI } from '../../../../services/reportingApi';
import FeedbackButtons from '../FeedbackButtons';

type SortKey = keyof AgentKPI;

export default function AgentPerformanceTab() {
  const [agents, setAgents] = useState<AgentKPI[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState<SortKey>('impact_score');
  const [groupByDept, setGroupByDept] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState<AgentKPI | null>(null);

  const closeModal = useCallback(() => setSelectedAgent(null), []);

  useEffect(() => {
    if (!selectedAgent) return;
    const handleEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') closeModal(); };
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [selectedAgent, closeModal]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const data = await getAgentPerformance({ metric: sortBy, limit: 50 });
        setAgents(data);
      } catch { /* silent */ }
      setLoading(false);
    })();
  }, [sortBy]);

  const handleSort = (key: SortKey) => {
    setSortBy(key);
  };

  const statusColor = (status: string) => {
    if (status === 'error') return 'danger';
    if (status === 'running') return 'primary';
    if (status === 'paused') return 'warning';
    return 'success';
  };

  const grouped = groupByDept
    ? agents.reduce<Record<string, AgentKPI[]>>((acc, a) => {
        const dept = a.department || 'Unknown';
        if (!acc[dept]) acc[dept] = [];
        acc[dept].push(a);
        return acc;
      }, {})
    : { 'All Agents': agents };

  if (loading) {
    return <div className="text-center py-5"><div className="spinner-border spinner-border-sm" role="status"><span className="visually-hidden">Loading...</span></div></div>;
  }

  return (
    <div className="p-3">
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h5 className="fw-semibold mb-0">Agent Performance ({agents.length})</h5>
        <div className="d-flex gap-2 align-items-center">
          <div className="form-check form-switch">
            <input className="form-check-input" type="checkbox" id="groupDept"
              checked={groupByDept} onChange={e => setGroupByDept(e.target.checked)} />
            <label className="form-check-label small" htmlFor="groupDept">Group by dept</label>
          </div>
        </div>
      </div>

      {Object.entries(grouped).map(([group, groupAgents]) => (
        <div key={group} className="mb-4">
          <div className="d-flex justify-content-between align-items-center">
            {groupByDept && <h6 className="fw-semibold text-muted mb-2">{group.replace(/_/g, ' ')}</h6>}
            <FeedbackButtons contentType="agent_performance" contentKey={`agent_perf_${group.replace(/\s+/g, '_').toLowerCase()}`} />
          </div>
          <div className="table-responsive">
            <table className="table table-hover mb-0">
              <thead className="table-light">
                <tr>
                  <th className="small" style={{ cursor: 'pointer' }} onClick={() => handleSort('agent_name')}>Agent</th>
                  <th className="small">Status</th>
                  <th className="small" style={{ cursor: 'pointer' }} onClick={() => handleSort('run_count')}>Runs</th>
                  <th className="small" style={{ cursor: 'pointer' }} onClick={() => handleSort('error_rate')}>Error Rate</th>
                  <th className="small" style={{ cursor: 'pointer' }} onClick={() => handleSort('avg_duration_ms')}>Avg Duration</th>
                  <th className="small" style={{ cursor: 'pointer' }} onClick={() => handleSort('actions_last_24h')}>24h Actions</th>
                  <th className="small" style={{ cursor: 'pointer' }} onClick={() => handleSort('success_rate')}>Success Rate</th>
                  <th className="small" style={{ cursor: 'pointer' }} onClick={() => handleSort('impact_score')}>Impact</th>
                </tr>
              </thead>
              <tbody>
                {groupAgents.map(agent => (
                  <tr key={agent.agent_id}>
                    <td className="small">
                      <div className="fw-medium"
                        role="button"
                        style={{ color: 'var(--color-primary-light)', cursor: 'pointer' }}
                        onClick={() => setSelectedAgent(agent)}
                      >{agent.agent_name}</div>
                      {!groupByDept && <div className="text-muted" style={{ fontSize: 11 }}>{agent.department}</div>}
                    </td>
                    <td><span className={`badge bg-${statusColor(agent.status)}`}>{agent.status}</span></td>
                    <td className="small">{agent.run_count.toLocaleString()}</td>
                    <td className="small">
                      <span className={agent.error_rate > 0.1 ? 'text-danger fw-medium' : ''}>
                        {(agent.error_rate * 100).toFixed(1)}%
                      </span>
                    </td>
                    <td className="small">{agent.avg_duration_ms.toFixed(0)}ms</td>
                    <td className="small">{agent.actions_last_24h}</td>
                    <td className="small">
                      <span className={agent.success_rate < 0.8 ? 'text-warning fw-medium' : 'text-success'}>
                        {(agent.success_rate * 100).toFixed(0)}%
                      </span>
                    </td>
                    <td className="small">
                      <div className="d-flex align-items-center gap-1">
                        <div className="progress flex-grow-1" style={{ height: 6 }}>
                          <div className="progress-bar bg-primary" style={{ width: `${agent.impact_score * 100}%` }} />
                        </div>
                        <span style={{ fontSize: 11 }}>{(agent.impact_score * 100).toFixed(0)}%</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      {/* Agent Detail Modal */}
      {selectedAgent && (
        <>
          <div className="modal-backdrop fade show" onClick={closeModal} />
          <div className="modal show d-block" tabIndex={-1} role="dialog" aria-modal="true"
            onClick={e => { if (e.target === e.currentTarget) closeModal(); }}>
            <div className="modal-dialog modal-dialog-centered">
              <div className="modal-content">
                <div className="modal-header py-2">
                  <h6 className="modal-title fw-semibold mb-0 d-flex align-items-center gap-2"
                    style={{ fontSize: '0.82rem' }}>
                    {selectedAgent.agent_name}
                    <span className={`badge bg-${statusColor(selectedAgent.status)}`}
                      style={{ fontSize: '0.65rem' }}>{selectedAgent.status}</span>
                  </h6>
                  <button type="button" className="btn-close btn-close-sm" aria-label="Close"
                    onClick={closeModal} />
                </div>
                <div className="modal-body py-2" style={{ fontSize: '0.75rem' }}>
                  {/* Performance Metrics */}
                  <div className="mb-3">
                    <div className="fw-semibold text-muted mb-1" style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      Performance Metrics
                    </div>
                    <div className="row g-2">
                      <div className="col-4">
                        <div className="border rounded p-2 text-center">
                          <div className="fw-semibold" style={{ fontSize: '0.9rem' }}>{selectedAgent.run_count.toLocaleString()}</div>
                          <div className="text-muted" style={{ fontSize: '0.65rem' }}>Total Runs</div>
                        </div>
                      </div>
                      <div className="col-4">
                        <div className="border rounded p-2 text-center">
                          <div className="fw-semibold" style={{ fontSize: '0.9rem', color: selectedAgent.error_count > 0 ? 'var(--color-secondary)' : undefined }}>
                            {selectedAgent.error_count.toLocaleString()}
                          </div>
                          <div className="text-muted" style={{ fontSize: '0.65rem' }}>Errors</div>
                        </div>
                      </div>
                      <div className="col-4">
                        <div className="border rounded p-2 text-center">
                          <div className="fw-semibold" style={{ fontSize: '0.9rem' }}>{selectedAgent.avg_duration_ms.toFixed(0)}ms</div>
                          <div className="text-muted" style={{ fontSize: '0.65rem' }}>Avg Duration</div>
                        </div>
                      </div>
                    </div>
                    <div className="row g-2 mt-1">
                      <div className="col-6">
                        <div className="d-flex justify-content-between align-items-center">
                          <span className="text-muted">Error Rate</span>
                          <span className={selectedAgent.error_rate > 0.1 ? 'text-danger fw-medium' : ''}>
                            {(selectedAgent.error_rate * 100).toFixed(1)}%
                          </span>
                        </div>
                      </div>
                      <div className="col-6">
                        <div className="d-flex justify-content-between align-items-center">
                          <span className="text-muted">Success Rate</span>
                          <span className={selectedAgent.success_rate < 0.8 ? 'text-warning fw-medium' : 'text-success'}>
                            {(selectedAgent.success_rate * 100).toFixed(1)}%
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Activity */}
                  <div className="mb-3">
                    <div className="fw-semibold text-muted mb-1" style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      Activity
                    </div>
                    <div className="d-flex justify-content-between align-items-center mb-1">
                      <span className="text-muted">Actions (24h)</span>
                      <span className="fw-medium">{selectedAgent.actions_last_24h}</span>
                    </div>
                    <div className="d-flex justify-content-between align-items-center mb-1">
                      <span className="text-muted">Impact Score</span>
                      <span className="fw-medium">{(selectedAgent.impact_score * 100).toFixed(0)}%</span>
                    </div>
                    <div className="progress" style={{ height: 6 }}>
                      <div className="progress-bar bg-primary" style={{ width: `${selectedAgent.impact_score * 100}%` }} />
                    </div>
                  </div>

                  {/* Department & Category */}
                  <div>
                    <div className="fw-semibold text-muted mb-1" style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      Classification
                    </div>
                    <div className="d-flex justify-content-between align-items-center mb-1">
                      <span className="text-muted">Department</span>
                      <span className="fw-medium">{selectedAgent.department || 'Unknown'}</span>
                    </div>
                    <div className="d-flex justify-content-between align-items-center">
                      <span className="text-muted">Category</span>
                      <span className="fw-medium">{selectedAgent.category || 'N/A'}</span>
                    </div>
                  </div>
                </div>
                <div className="modal-footer py-2">
                  <button type="button" className="btn btn-sm btn-outline-secondary" onClick={closeModal}>Close</button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
