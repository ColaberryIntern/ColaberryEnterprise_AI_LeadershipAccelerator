import { useState, useEffect, useCallback } from 'react';
import {
  getOpenclawDashboard,
  getOpenclawResponses,
  approveOpenclawResponse,
  rejectOpenclawResponse,
  getOpenclawAgentActivity,
  OpenclawDashboard,
  OpenclawResponseItem,
  OpenclawAgentActivity,
} from '../../../../services/openclawApi';

const PLATFORM_COLORS: Record<string, string> = {
  reddit: '#FF4500',
  hackernews: '#FF6600',
  linkedin: '#0A66C2',
  devto: '#0A0A0A',
  quora: '#B92B27',
  medium: '#00AB6C',
};

const STATUS_BADGES: Record<string, string> = {
  draft: 'warning',
  approved: 'info',
  posted: 'success',
  failed: 'danger',
  removed: 'secondary',
};

const RESULT_BADGES: Record<string, string> = {
  success: 'success',
  failed: 'danger',
  skipped: 'secondary',
  pending: 'warning',
  flagged: 'info',
};

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return '—';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function formatMs(ms: number | null): string {
  if (!ms) return '—';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

type SelectedAgent = OpenclawDashboard['agents'][number];

export default function OpenclawTab() {
  const [dashboard, setDashboard] = useState<OpenclawDashboard | null>(null);
  const [responses, setResponses] = useState<OpenclawResponseItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [responseFilter, setResponseFilter] = useState('');

  // Agent drill-down state
  const [selectedAgent, setSelectedAgent] = useState<SelectedAgent | null>(null);
  const [agentActivity, setAgentActivity] = useState<OpenclawAgentActivity[]>([]);
  const [activityLoading, setActivityLoading] = useState(false);
  const [activityTotal, setActivityTotal] = useState(0);
  const [activityFilter, setActivityFilter] = useState('');

  const fetchData = useCallback(async () => {
    try {
      const [dashRes, respRes] = await Promise.all([
        getOpenclawDashboard(),
        getOpenclawResponses(responseFilter ? { post_status: responseFilter } : undefined),
      ]);
      setDashboard(dashRes.data);
      setResponses(respRes.data.responses || []);
    } catch {
      /* ignore */
    }
    setLoading(false);
  }, [responseFilter]);

  useEffect(() => {
    setLoading(true);
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const handleAgentClick = useCallback(async (agent: SelectedAgent) => {
    setSelectedAgent(agent);
    setActivityLoading(true);
    setActivityFilter('');
    try {
      const res = await getOpenclawAgentActivity(agent.id);
      setAgentActivity(res.data.activities || []);
      setActivityTotal(res.data.total || 0);
    } catch {
      setAgentActivity([]);
      setActivityTotal(0);
    }
    setActivityLoading(false);
  }, []);

  const fetchActivity = useCallback(async (agentId: string, result?: string) => {
    setActivityLoading(true);
    try {
      const params: Record<string, string> = {};
      if (result) params.result = result;
      const res = await getOpenclawAgentActivity(agentId, params);
      setAgentActivity(res.data.activities || []);
      setActivityTotal(res.data.total || 0);
    } catch {
      setAgentActivity([]);
    }
    setActivityLoading(false);
  }, []);

  const handleActivityFilterChange = useCallback((val: string) => {
    setActivityFilter(val);
    if (selectedAgent) {
      fetchActivity(selectedAgent.id, val || undefined);
    }
  }, [selectedAgent, fetchActivity]);

  const closeModal = useCallback(() => {
    setSelectedAgent(null);
    setAgentActivity([]);
    setActivityTotal(0);
    setActivityFilter('');
  }, []);

  const handleApprove = async (id: string) => {
    try {
      await approveOpenclawResponse(id);
      fetchData();
    } catch {
      /* ignore */
    }
  };

  const handleReject = async (id: string) => {
    try {
      await rejectOpenclawResponse(id);
      fetchData();
    } catch {
      /* ignore */
    }
  };

  if (loading && !dashboard) {
    return (
      <div className="text-center py-5">
        <div className="spinner-border spinner-border-sm text-primary" role="status">
          <span className="visually-hidden">Loading outreach data...</span>
        </div>
      </div>
    );
  }

  const kpis = dashboard?.kpis;

  return (
    <div className="p-3">
      <h6 className="fw-semibold mb-3">OpenClaw Autonomous Outreach</h6>

      {/* KPI Row */}
      {kpis && (
        <div className="row g-2 mb-4">
          {[
            { label: 'Signals (24h)', value: kpis.signals_24h, color: 'var(--color-primary)' },
            { label: 'Posted', value: kpis.responses_posted, color: 'var(--color-accent)' },
            { label: 'Drafts', value: kpis.responses_draft, color: '#dd6b20' },
            { label: 'Sessions', value: kpis.active_sessions, color: '#2b6cb0' },
            { label: 'Queue', value: kpis.queue_depth, color: '#805ad5' },
            { label: 'Learnings', value: kpis.learnings, color: '#319795' },
          ].map((kpi) => (
            <div key={kpi.label} className="col-4 col-md-2">
              <div className="card border-0 shadow-sm text-center py-2 px-1">
                <div className="fw-bold" style={{ fontSize: '1.3rem', color: kpi.color }}>
                  {kpi.value}
                </div>
                <div className="text-muted" style={{ fontSize: '0.65rem' }}>{kpi.label}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Platform Breakdown */}
      {dashboard?.platforms && dashboard.platforms.length > 0 && (
        <div className="d-flex gap-2 mb-3 flex-wrap">
          {dashboard.platforms.map((p: any) => (
            <span
              key={p.platform}
              className="badge"
              style={{
                backgroundColor: PLATFORM_COLORS[p.platform] || '#718096',
                fontSize: '0.7rem',
              }}
            >
              {p.platform}: {p.count}
            </span>
          ))}
        </div>
      )}

      {/* Agent Status */}
      {dashboard?.agents && dashboard.agents.length > 0 && (
        <div className="card border-0 shadow-sm mb-4">
          <div className="card-header bg-white fw-semibold small">Agent Status — click any row for details</div>
          <div className="card-body p-0">
            <div className="table-responsive">
              <table className="table table-hover mb-0 small">
                <thead className="table-light">
                  <tr>
                    <th>Agent</th>
                    <th>Status</th>
                    <th>Enabled</th>
                    <th>Runs</th>
                    <th>Errors</th>
                    <th>Avg Duration</th>
                    <th>Last Run</th>
                  </tr>
                </thead>
                <tbody>
                  {dashboard.agents.map((agent) => (
                    <tr
                      key={agent.name}
                      style={{ cursor: 'pointer' }}
                      onClick={() => handleAgentClick(agent)}
                    >
                      <td className="fw-medium" style={{ color: 'var(--color-primary-light)' }}>
                        {agent.name.replace(/^Openclaw/, '')}
                      </td>
                      <td>
                        <span className={`badge bg-${agent.status === 'idle' ? 'success' : agent.status === 'running' ? 'primary' : agent.status === 'error' ? 'danger' : 'secondary'}`}>
                          {agent.status}
                        </span>
                      </td>
                      <td>
                        <span className={`badge bg-${agent.enabled ? 'success' : 'secondary'}`}>
                          {agent.enabled ? 'Yes' : 'No'}
                        </span>
                      </td>
                      <td>{agent.run_count}</td>
                      <td>{agent.error_count > 0 ? <span className="text-danger fw-medium">{agent.error_count}</span> : '0'}</td>
                      <td className="text-muted">{formatMs(agent.avg_duration_ms)}</td>
                      <td className="text-muted">{timeAgo(agent.last_run_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Responses Table */}
      <div className="card border-0 shadow-sm">
        <div className="card-header bg-white d-flex justify-content-between align-items-center">
          <span className="fw-semibold small">Recent Responses</span>
          <select
            className="form-select form-select-sm"
            style={{ width: 'auto', fontSize: '0.75rem' }}
            value={responseFilter}
            onChange={(e) => setResponseFilter(e.target.value)}
          >
            <option value="">All Statuses</option>
            <option value="draft">Draft</option>
            <option value="approved">Approved</option>
            <option value="posted">Posted</option>
            <option value="failed">Failed</option>
          </select>
        </div>
        <div className="card-body p-0">
          <div className="table-responsive">
            <table className="table table-hover mb-0 small">
              <thead className="table-light">
                <tr>
                  <th>Platform</th>
                  <th>Signal</th>
                  <th>Tone</th>
                  <th>Content</th>
                  <th>Status</th>
                  <th>Time</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {responses.map((resp) => (
                  <tr key={resp.id}>
                    <td>
                      <span
                        className="badge"
                        style={{ backgroundColor: PLATFORM_COLORS[resp.platform] || '#718096', fontSize: '0.65rem' }}
                      >
                        {resp.platform}
                      </span>
                    </td>
                    <td>
                      {resp.signal?.title ? (
                        <a
                          href={resp.signal.source_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-truncate d-inline-block"
                          style={{ maxWidth: 200, fontSize: '0.75rem' }}
                          title={resp.signal.title}
                        >
                          {resp.signal.title}
                        </a>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td><span className="badge bg-secondary" style={{ fontSize: '0.6rem' }}>{resp.tone}</span></td>
                    <td>
                      <span
                        className="text-truncate d-inline-block text-muted"
                        style={{ maxWidth: 250, fontSize: '0.7rem' }}
                        title={resp.content}
                      >
                        {resp.content}
                      </span>
                    </td>
                    <td>
                      <span className={`badge bg-${STATUS_BADGES[resp.post_status] || 'secondary'}`}>
                        {resp.post_status}
                      </span>
                    </td>
                    <td className="text-muted text-nowrap">{timeAgo(resp.created_at)}</td>
                    <td>
                      {resp.post_status === 'draft' && (
                        <div className="d-flex gap-1">
                          <button
                            className="btn btn-sm btn-outline-success py-0 px-2"
                            onClick={() => handleApprove(resp.id)}
                          >
                            Approve
                          </button>
                          <button
                            className="btn btn-sm btn-outline-danger py-0 px-2"
                            onClick={() => handleReject(resp.id)}
                          >
                            Reject
                          </button>
                        </div>
                      )}
                      {resp.post_url && (
                        <a href={resp.post_url} target="_blank" rel="noopener noreferrer" className="btn btn-sm btn-outline-primary py-0 px-2">
                          View
                        </a>
                      )}
                    </td>
                  </tr>
                ))}
                {responses.length === 0 && (
                  <tr>
                    <td colSpan={7} className="text-muted text-center py-4">
                      No responses yet — signals will appear once the Market Signal agent runs
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Agent Detail Modal */}
      {selectedAgent && (
        <>
          <div className="modal-backdrop show" style={{ opacity: 0.5 }} onClick={closeModal} />
          <div className="modal show d-block" role="dialog" aria-modal="true" onClick={closeModal}>
            <div
              className="modal-dialog modal-lg modal-dialog-scrollable"
              style={{ maxWidth: 800 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="modal-content">
                <div className="modal-header py-2">
                  <h6 className="modal-title fw-semibold mb-0">
                    {selectedAgent.name.replace(/^Openclaw/, '')} Agent
                  </h6>
                  <button type="button" className="btn-close btn-close-sm" onClick={closeModal} aria-label="Close" />
                </div>
                <div className="modal-body p-3">
                  {/* Agent Overview */}
                  <div className="row g-2 mb-3">
                    <div className="col-6 col-md-3">
                      <div className="card border-0 bg-light text-center py-2 px-1">
                        <div className="fw-bold" style={{ color: 'var(--color-primary)' }}>{selectedAgent.run_count}</div>
                        <div className="text-muted" style={{ fontSize: '0.65rem' }}>Total Runs</div>
                      </div>
                    </div>
                    <div className="col-6 col-md-3">
                      <div className="card border-0 bg-light text-center py-2 px-1">
                        <div className="fw-bold" style={{ color: selectedAgent.error_count > 0 ? '#e53e3e' : 'var(--color-accent)' }}>
                          {selectedAgent.error_count}
                        </div>
                        <div className="text-muted" style={{ fontSize: '0.65rem' }}>Errors</div>
                      </div>
                    </div>
                    <div className="col-6 col-md-3">
                      <div className="card border-0 bg-light text-center py-2 px-1">
                        <div className="fw-bold" style={{ color: '#2b6cb0' }}>{formatMs(selectedAgent.avg_duration_ms)}</div>
                        <div className="text-muted" style={{ fontSize: '0.65rem' }}>Avg Duration</div>
                      </div>
                    </div>
                    <div className="col-6 col-md-3">
                      <div className="card border-0 bg-light text-center py-2 px-1">
                        <span className={`badge bg-${selectedAgent.status === 'idle' ? 'success' : selectedAgent.status === 'running' ? 'primary' : selectedAgent.status === 'error' ? 'danger' : 'secondary'}`}>
                          {selectedAgent.status}
                        </span>
                        <div className="text-muted mt-1" style={{ fontSize: '0.65rem' }}>Status</div>
                      </div>
                    </div>
                  </div>

                  {/* Description */}
                  {selectedAgent.description && (
                    <p className="text-muted small mb-3">{selectedAgent.description}</p>
                  )}

                  {/* Last Result Summary */}
                  {selectedAgent.last_result && (
                    <div className="card border-0 bg-light mb-3">
                      <div className="card-body py-2 px-3">
                        <div className="fw-semibold small mb-1">Last Execution Result</div>
                        <div style={{ fontSize: '0.75rem' }}>
                          {selectedAgent.last_result.entities_processed != null && (
                            <span className="me-3">Entities: <strong>{selectedAgent.last_result.entities_processed}</strong></span>
                          )}
                          {selectedAgent.last_result.duration_ms != null && (
                            <span className="me-3">Duration: <strong>{formatMs(selectedAgent.last_result.duration_ms)}</strong></span>
                          )}
                          {selectedAgent.last_result.errors && selectedAgent.last_result.errors.length > 0 && (
                            <span className="text-danger">Errors: {selectedAgent.last_result.errors.join(', ')}</span>
                          )}
                          {selectedAgent.last_result.actions_taken && selectedAgent.last_result.actions_taken.length > 0 && (
                            <div className="mt-1">
                              <strong>Actions:</strong>
                              <ul className="mb-0 ps-3" style={{ fontSize: '0.7rem' }}>
                                {selectedAgent.last_result.actions_taken.slice(0, 8).map((a: any, i: number) => (
                                  <li key={i} className="text-muted">
                                    <span className={`badge bg-${RESULT_BADGES[a.result] || 'secondary'} me-1`} style={{ fontSize: '0.6rem' }}>
                                      {a.result}
                                    </span>
                                    {a.action}: {a.reason}
                                  </li>
                                ))}
                                {selectedAgent.last_result.actions_taken.length > 8 && (
                                  <li className="text-muted">...and {selectedAgent.last_result.actions_taken.length - 8} more</li>
                                )}
                              </ul>
                            </div>
                          )}
                          {(!selectedAgent.last_result.actions_taken || selectedAgent.last_result.actions_taken.length === 0) &&
                           (!selectedAgent.last_result.errors || selectedAgent.last_result.errors.length === 0) && (
                            <span className="text-muted">No actions taken in last run</span>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Config */}
                  {selectedAgent.config && Object.keys(selectedAgent.config).length > 0 && (
                    <details className="mb-3">
                      <summary className="fw-semibold small" style={{ cursor: 'pointer' }}>Configuration</summary>
                      <pre className="bg-light rounded p-2 mt-1 mb-0" style={{ fontSize: '0.7rem', maxHeight: 150, overflow: 'auto' }}>
                        {JSON.stringify(selectedAgent.config, null, 2)}
                      </pre>
                    </details>
                  )}

                  {/* Activity Log */}
                  <div className="d-flex justify-content-between align-items-center mb-2">
                    <span className="fw-semibold small">Activity Log ({activityTotal})</span>
                    <select
                      className="form-select form-select-sm"
                      style={{ width: 'auto', fontSize: '0.7rem' }}
                      value={activityFilter}
                      onChange={(e) => handleActivityFilterChange(e.target.value)}
                    >
                      <option value="">All Results</option>
                      <option value="success">Success</option>
                      <option value="failed">Failed</option>
                      <option value="skipped">Skipped</option>
                      <option value="flagged">Flagged</option>
                    </select>
                  </div>

                  {activityLoading ? (
                    <div className="text-center py-3">
                      <div className="spinner-border spinner-border-sm text-primary" role="status">
                        <span className="visually-hidden">Loading activity...</span>
                      </div>
                    </div>
                  ) : agentActivity.length > 0 ? (
                    <div className="table-responsive" style={{ maxHeight: 350, overflow: 'auto' }}>
                      <table className="table table-hover mb-0" style={{ fontSize: '0.72rem' }}>
                        <thead className="table-light sticky-top">
                          <tr>
                            <th>Action</th>
                            <th>Result</th>
                            <th>Reason</th>
                            <th>Confidence</th>
                            <th>Duration</th>
                            <th>Time</th>
                          </tr>
                        </thead>
                        <tbody>
                          {agentActivity.map((act) => (
                            <tr key={act.id}>
                              <td className="fw-medium">{act.action}</td>
                              <td>
                                <span className={`badge bg-${RESULT_BADGES[act.result] || 'secondary'}`} style={{ fontSize: '0.6rem' }}>
                                  {act.result}
                                </span>
                              </td>
                              <td>
                                <span
                                  className="text-muted text-truncate d-inline-block"
                                  style={{ maxWidth: 250 }}
                                  title={act.reason || ''}
                                >
                                  {act.reason || '—'}
                                </span>
                              </td>
                              <td>{act.confidence != null ? `${(act.confidence * 100).toFixed(0)}%` : '—'}</td>
                              <td>{formatMs(act.duration_ms)}</td>
                              <td className="text-muted text-nowrap">{timeAgo(act.created_at)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="text-muted text-center py-3 small">
                      No activity recorded yet — the agent will log actions on its next scheduled run
                    </div>
                  )}
                </div>
                <div className="modal-footer py-2">
                  <span className="text-muted me-auto" style={{ fontSize: '0.65rem' }}>
                    Last run: {timeAgo(selectedAgent.last_run_at)}
                  </span>
                  <button className="btn btn-sm btn-outline-secondary" onClick={closeModal}>Close</button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
